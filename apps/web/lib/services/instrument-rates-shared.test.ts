import { describe, it, expect } from 'vitest';
import {
  rateInForce,
  todayInZone,
  type InstrumentRateType,
  type RateInForceInput,
} from '@/lib/services/instrument-rates-shared';
import { companyToday } from '@/lib/services/invoices-shared';

// Money representation §4.2/§6 — the effective-date rule [S97].
//
// An instrument rate's effective_from is a CALENDAR DATE, so the "today" that
// defaults it must be a company-timezone date. Deriving it from toISOString()
// is UTC, and after ~20:00 EDT that is tomorrow.
//
// This matters more since future-dating was PERMITTED (P5 as amended
// 2026-07-31 / migration 20260731010000): the backdating guard used to reject
// a tomorrow-dated rate outright, so the bug was loud. Now a future rate is
// simply dormant until its date, so an evening-entered rate saves cleanly and
// silently fails to price today's work.

const NY = 'America/New_York';

/** 2026-06-02, 8:30pm EDT — stored as 2026-06-03T00:30:00Z. */
const EVENING_EDT = new Date('2026-06-03T00:30:00.000Z');

function rate(effective_from: string, value: number): RateInForceInput {
  return {
    rate_type: 'cost_plus_material_percent' as InstrumentRateType,
    rate: value,
    effective_from,
    superseded_at: null,
  };
}

describe('todayInZone — the effective-date default [S97]', () => {
  it('an 8:30pm EDT entry is dated TODAY, not tomorrow', () => {
    expect(todayInZone(NY, EVENING_EDT)).toBe('2026-06-02');
  });

  it('REGRESSION: it must not fall back to the UTC date', () => {
    // What the pre-[S97] `new Date().toISOString().slice(0, 10)` produced.
    expect(EVENING_EDT.toISOString().slice(0, 10)).toBe('2026-06-03');
    expect(todayInZone(NY, EVENING_EDT)).not.toBe(EVENING_EDT.toISOString().slice(0, 10));
  });

  it('holds across DST — 8pm EST is still the same local day', () => {
    expect(todayInZone(NY, new Date('2026-01-15T01:00:00.000Z'))).toBe('2026-01-14');
  });

  it('a daytime entry is unchanged', () => {
    expect(todayInZone(NY, new Date('2026-06-02T15:00:00.000Z'))).toBe('2026-06-02');
  });

  it('is driven by the passed timezone, never hardcoded', () => {
    expect(todayInZone('America/Los_Angeles', EVENING_EDT)).toBe('2026-06-02');
    expect(todayInZone('UTC', EVENING_EDT)).toBe('2026-06-03');
  });

  it('agrees with 7D companyToday — one date rule across the platform', () => {
    // Deliberately duplicated implementations (rates must not depend on
    // invoicing); this pins them to the same answer.
    expect(todayInZone(NY, EVENING_EDT)).toBe(companyToday(NY, EVENING_EDT));
  });
});

describe('an evening-entered rate is IN FORCE today, not pending [S97]', () => {
  const TYPE = 'cost_plus_material_percent' as InstrumentRateType;

  it('prices work today — the whole point of the fix', () => {
    // The rate the user saved at 8:30pm, dated by the fixed default.
    const saved = rate(todayInZone(NY, EVENING_EDT), 20);
    // Asking "what is in force now?" on that same evening.
    const asOf = todayInZone(NY, EVENING_EDT);

    expect(rateInForce([saved], TYPE, asOf)).toBe(20);
  });

  it('under the OLD UTC default the same entry was dormant and priced nothing', () => {
    // effective_from stamped a day ahead...
    const savedUtc = rate(EVENING_EDT.toISOString().slice(0, 10), 20);
    // ...while today is still the real local day, so the rate is not yet in
    // force: rateInForce skips rows with effective_from > asOf.
    const asOf = todayInZone(NY, EVENING_EDT);

    expect(rateInForce([savedUtc], TYPE, asOf)).toBeNull();
  });

  it('the dormant rate silently starts pricing only the NEXT day', () => {
    const savedUtc = rate(EVENING_EDT.toISOString().slice(0, 10), 20);
    expect(rateInForce([savedUtc], TYPE, '2026-06-03')).toBe(20);
  });

  it('a genuinely future-dated rate stays dormant — P5 is not broken by the fix', () => {
    const future = rate('2026-09-01', 25);
    const current = rate('2026-06-01', 20);
    expect(rateInForce([current, future], TYPE, todayInZone(NY, EVENING_EDT))).toBe(20);
    expect(rateInForce([future], TYPE, todayInZone(NY, EVENING_EDT))).toBeNull();
  });
});
