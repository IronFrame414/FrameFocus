import { describe, it, expect, vi, beforeEach } from 'vitest';

// Money representation §7.1 S-4 — the effective-date PRE-FILL path [S97].
//
// instrument-rates-shared.test.ts covers the pure date rule (todayInZone).
// This file covers the resolution path the UI actually calls: read the
// company's timezone once, then format today in it. That is what the
// "Renegotiate rate" / "Set rate" control pre-fills its date input with, and
// what addInstrumentRate defaults effective_from to.
//
// Why it matters: future-dating is PERMITTED (P5 as amended 2026-07-31 /
// migration 20260731010000). A UTC-derived pre-fill dated an evening entry
// TOMORROW, which no longer trips the backdating guard — it just saves as a
// dormant rate that silently prices nothing today.

/** 2026-06-02, 8:30pm EDT — stored as 2026-06-03T00:30:00Z. */
const EVENING_EDT = new Date('2026-06-03T00:30:00.000Z');

let selectCalls = 0;

function mockCompany(timezone: string | null, mode: 'ok' | 'throws' = 'ok') {
  selectCalls = 0;
  vi.doMock('@/lib/supabase-browser', () => ({
    createClient: () => ({
      from: () => ({
        select: () => ({
          maybeSingle: async () => {
            selectCalls += 1;
            if (mode === 'throws') throw new Error('network down');
            return { data: timezone === null ? null : { timezone } };
          },
        }),
      }),
    }),
  }));
}

async function loadTodayForCompany() {
  const mod = await import('@/lib/services/instrument-rates-client');
  return mod.todayForCompany;
}

describe('todayForCompany — the effective-date pre-fill [S97]', () => {
  beforeEach(() => {
    // The timezone read is memoized in module scope, so each case needs a
    // fresh module instance.
    vi.resetModules();
    vi.doUnmock('@/lib/supabase-browser');
  });

  it('an 8:30pm EDT entry pre-fills TODAY, not tomorrow', async () => {
    mockCompany('America/New_York');
    const todayForCompany = await loadTodayForCompany();
    expect(await todayForCompany(EVENING_EDT)).toBe('2026-06-02');
  });

  it('REGRESSION: it must not fall back to the UTC date', async () => {
    mockCompany('America/New_York');
    const todayForCompany = await loadTodayForCompany();
    // What the pre-[S97] `new Date().toISOString().slice(0, 10)` produced —
    // the date that saved as a dormant, non-pricing rate.
    expect(EVENING_EDT.toISOString().slice(0, 10)).toBe('2026-06-03');
    expect(await todayForCompany(EVENING_EDT)).not.toBe('2026-06-03');
  });

  it('follows the company timezone, whatever it is', async () => {
    mockCompany('America/Los_Angeles');
    const pacific = await loadTodayForCompany();
    expect(await pacific(EVENING_EDT)).toBe('2026-06-02');

    vi.resetModules();
    mockCompany('UTC');
    const utc = await loadTodayForCompany();
    // A company that genuinely keeps UTC gets the UTC day — correctly.
    expect(await utc(EVENING_EDT)).toBe('2026-06-03');
  });

  it('holds across DST — 8pm EST is still the same local day', async () => {
    mockCompany('America/New_York');
    const todayForCompany = await loadTodayForCompany();
    expect(await todayForCompany(new Date('2026-01-15T01:00:00.000Z'))).toBe('2026-01-14');
  });

  it('falls back to the column default when no company row is readable — never UTC', async () => {
    mockCompany(null);
    const todayForCompany = await loadTodayForCompany();
    expect(await todayForCompany(EVENING_EDT)).toBe('2026-06-02');
  });

  it('falls back to the column default when the read THROWS — never UTC', async () => {
    mockCompany(null, 'throws');
    const todayForCompany = await loadTodayForCompany();
    expect(await todayForCompany(EVENING_EDT)).toBe('2026-06-02');
  });

  it('reads the timezone ONCE however many controls ask for it', async () => {
    mockCompany('America/New_York');
    const todayForCompany = await loadTodayForCompany();
    await Promise.all([
      todayForCompany(EVENING_EDT),
      todayForCompany(EVENING_EDT),
      todayForCompany(EVENING_EDT),
    ]);
    await todayForCompany(EVENING_EDT);
    expect(selectCalls).toBe(1);
  });
});
