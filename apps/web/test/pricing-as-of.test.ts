import { describe, it, expect } from 'vitest';
import { pricingAsOfDate } from '@/lib/services/pricing-as-of';
import { todayInZone } from '@/lib/services/instrument-rates-shared';

// TECH_DEBT #140 (residue) — the as-of date for rate-in-force.
//
// THE ASSERTION THAT MATTERS IS THE THIRD ONE: the RLS-scoped path and the
// service-role path must return the SAME date for the same instant. Everything
// else here is scaffolding for that. If a PM's as-of date can differ from an
// Owner's, their totals differ, and that is a worse bug than the UTC slice this
// replaced — which is why the two call sites moved in a single commit.

/** 21:30 EDT on 2026-08-09 — which is 01:30 UTC on 2026-08-10. */
const EVENING_EDT = new Date('2026-08-10T01:30:00Z');
const NY = 'America/New_York';

/** Minimal stub shaped like the two calls pricingAsOfDate makes. */
function stubClient(timezone: string | null) {
  let filtered = false;
  const result = { data: timezone === null ? null : { timezone } };
  const builder = {
    eq() {
      filtered = true;
      return builder;
    },
    maybeSingle: async () => result,
  };
  return {
    from: () => ({ select: () => builder }),
    get wasFiltered() {
      return filtered;
    },
  } as never as import('@supabase/supabase-js').SupabaseClient & { wasFiltered: boolean };
}

describe('#140 residue — pricingAsOfDate', () => {
  it('⚠️ THE EVENING BOUNDARY: a UTC slice says tomorrow, company time says today', async () => {
    // This is the defect, stated as a test. At 21:30 EDT the UTC calendar date
    // has already rolled over, so the old `new Date().toISOString().slice(0,10)`
    // would price against a rate dated TOMORROW.
    const utcSlice = EVENING_EDT.toISOString().slice(0, 10);
    expect(utcSlice).toBe('2026-08-10');

    const asOf = await pricingAsOfDate(stubClient(NY), null, EVENING_EDT);
    expect(asOf).toBe('2026-08-09');
    expect(asOf).not.toBe(utcSlice);
  });

  it('agrees with todayInZone — one date rule, not a second implementation', async () => {
    const asOf = await pricingAsOfDate(stubClient(NY), null, EVENING_EDT);
    expect(asOf).toBe(todayInZone(NY, EVENING_EDT));
  });

  it('⚠️ THE RLS PATH AND THE SERVICE-ROLE PATH RETURN THE SAME DATE', async () => {
    // The whole point. Caller-side passes null (RLS scopes `companies` to the
    // caller's row); the privileged path passes an explicit company id because
    // the service role bypasses RLS. Same instant, same company timezone, so
    // the same answer — a PM's total cannot drift from an Owner's.
    const rlsScoped = await pricingAsOfDate(stubClient(NY), null, EVENING_EDT);
    const serviceRole = await pricingAsOfDate(
      stubClient(NY),
      '4a0f9073-bca2-485f-8fbb-34e71102ab42',
      EVENING_EDT
    );
    expect(serviceRole).toBe(rlsScoped);
  });

  it('filters by company id ONLY when one is supplied', async () => {
    // Service role bypasses RLS, so an unfiltered read would span every tenant
    // and maybeSingle() would error or return an arbitrary row.
    const scoped = stubClient(NY);
    await pricingAsOfDate(scoped, null, EVENING_EDT);
    expect((scoped as unknown as { wasFiltered: boolean }).wasFiltered).toBe(false);

    const privileged = stubClient(NY);
    await pricingAsOfDate(privileged, 'some-company-id', EVENING_EDT);
    expect((privileged as unknown as { wasFiltered: boolean }).wasFiltered).toBe(true);
  });

  it('falls back to the column default, NEVER to UTC', async () => {
    // A UTC fallback would silently reintroduce the exact defect being fixed,
    // and would do it only for companies whose settings read failed — the
    // hardest possible case to notice.
    const noRow = await pricingAsOfDate(stubClient(null), null, EVENING_EDT);
    expect(noRow).toBe('2026-08-09');
    expect(noRow).not.toBe(EVENING_EDT.toISOString().slice(0, 10));
  });

  it('a thrown settings read still prices, on the fallback zone', async () => {
    const throwing = {
      from: () => ({
        select: () => ({
          maybeSingle: async () => {
            throw new Error('network');
          },
        }),
      }),
    } as never as import('@supabase/supabase-js').SupabaseClient;
    await expect(pricingAsOfDate(throwing, null, EVENING_EDT)).resolves.toBe('2026-08-09');
  });

  it('⚠️ USES THE COMPANY ZONE, not a hardcoded Eastern one', async () => {
    // Deliberately NOT EVENING_EDT: at 01:30 UTC, New York (21:30) and Los
    // Angeles (18:30) are both still 08-09, so that instant cannot tell the
    // company's zone apart from the fallback — a hardcoded 'America/New_York'
    // would pass. 04:30 UTC does distinguish them: 00:30 EDT on the 10th, but
    // still 21:30 PDT on the 9th.
    const straddle = new Date('2026-08-10T04:30:00Z');
    expect(await pricingAsOfDate(stubClient(NY), null, straddle)).toBe('2026-08-10');
    expect(await pricingAsOfDate(stubClient('America/Los_Angeles'), null, straddle)).toBe(
      '2026-08-09'
    );
  });
});
