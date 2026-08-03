import type { Database } from '@framefocus/shared/types/database';

// Money representation §4.2/§6 shared rate logic — THE definitions.
// Deliberately no supabase import (the payables-shared.ts precedent):
// instrument-rates.ts (server), instrument-rates-client.ts (client), and UI
// components all consume THESE. A value import of this module is safe in
// either bundle — importing rateInForce from the server service file was
// exactly the client-bundle boundary break this file exists to prevent.
//
// Rate-in-force = the non-superseded row of the matching rate_type with the
// greatest effective_from ≤ the as-of date. Superseded rows never win
// (their correction is the point, §5.5); a rateless instrument returns null
// and the pricing layer refuses to price it (NoRateInForceError — never a
// 0% fallback).

type InstrumentRateRow = Database['public']['Tables']['instrument_rates']['Row'];

export type InstrumentRateType =
  /** LEGACY pre-A-9 single markup — read-only: existing rows still read and
   *  render in history, but nothing writes it and pricing never consumes it
   *  (the A-9 expansion copied live rows into the three category markups). */
  | 'cost_plus_percent'
  // A-9: a cost-plus instrument carries four independent effective-dated
  // rates — flat labor $/man-hour + material/sub/other markup %.
  | 'cost_plus_labor_hourly'
  | 'cost_plus_material_percent'
  | 'cost_plus_subcontractor_percent'
  | 'cost_plus_other_percent'
  | 'tm_labor_hourly'
  | 'tm_nonlabor_percent';

export type InstrumentRate = Omit<InstrumentRateRow, 'rate_type'> & {
  rate_type: InstrumentRateType;
};

export type InstrumentRef =
  | { estimate_id: string; change_order_id?: undefined }
  | { change_order_id: string; estimate_id?: undefined };

/** The minimum row shape rateInForce needs. rate_type is deliberately the
 *  loose string — raw supabase rows (whose generated type can't see the
 *  CHECK constraint) pass without a cast; InstrumentRate narrows into it. */
export interface RateInForceInput {
  rate_type: string;
  rate: number;
  effective_from: string;
  superseded_at: string | null;
}

/** Latest live (non-superseded) effective_from for a type, or null when the
 *  next rate would be the instrument's first of that type (free date — P5).
 *  The renegotiation date floor derives from this (floor + 1 day in the UI;
 *  the DB trigger is the authority). */
export function latestLiveEffectiveFrom(
  rates: RateInForceInput[],
  rateType: InstrumentRateType
): string | null {
  let latest: string | null = null;
  for (const r of rates) {
    if (r.rate_type !== rateType || r.superseded_at !== null) continue;
    if (!latest || r.effective_from > latest) latest = r.effective_from;
  }
  return latest;
}

/** Pure rate-in-force selection — shared by server and client callers.
 *  Superseded rows never win (their correction is the point, §5.5). */
/**
 * TODAY as a company-timezone calendar date (YYYY-MM-DD) [S97].
 *
 * `effective_from` is a calendar DATE, so the "today" that defaults it — and
 * the "today" that asks what is in force NOW — must be a company-tz date.
 * Deriving it from toISOString() is UTC: after ~20:00 EDT that is TOMORROW,
 * so a rate entered in the evening defaults to tomorrow and saves as a
 * DORMANT future rate that does not price today's work. Before future-dating
 * was permitted (P5 as amended 2026-07-31, migration 20260731010000) the
 * backdating guard rejected that outright; now it is accepted silently, which
 * is what makes this urgent rather than cosmetic.
 *
 * `now` is injectable so the boundary is testable without touching the clock.
 *
 * Deliberately restated here rather than imported from 7D's invoices-shared
 * `companyToday`: instrument rates are UPSTREAM of invoicing and must not
 * depend on it. Same precedent as co-rate-section restating RATE_FIELDS —
 * six lines is a smaller cost than a backwards module dependency. The two
 * are pinned to the same rule by test.
 */
export function todayInZone(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function rateInForce(
  rates: RateInForceInput[],
  rateType: InstrumentRateType,
  asOf: string // YYYY-MM-DD
): number | null {
  let best: { effective_from: string; rate: number } | null = null;
  for (const r of rates) {
    if (r.rate_type !== rateType) continue;
    if (r.superseded_at !== null) continue;
    if (r.effective_from > asOf) continue;
    if (!best || r.effective_from > best.effective_from) {
      best = { effective_from: r.effective_from, rate: r.rate };
    }
  }
  return best?.rate ?? null;
}
