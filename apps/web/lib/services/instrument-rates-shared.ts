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
 * CONSOLIDATED [S106]. This was deliberately restated here rather than
 * imported from 7D's `companyToday`, on the grounds that "instrument rates are
 * UPSTREAM of invoicing and must not depend on it". That reasoning was right,
 * and the implementation now lives in a NEUTRAL, dependency-free module that
 * neither domain has to import the other to reach. No backwards dependency is
 * created, the local name is preserved for every call site here, and the two
 * are no longer merely "pinned to the same rule by test" — they are the same
 * function. Six copies of this rule existed across the repo; see the header of
 * `@framefocus/shared/utils/dates`.
 */
export { companyToday as todayInZone } from '@framefocus/shared/utils/dates';

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

/**
 * Build an InstrumentPricingContext from rate ROWS already in hand — the pure
 * half of `loadInstrumentPricingContext` (estimate-items-client.ts:30).
 *
 * EXTRACTED [S115, D-62] rather than copied. Two callers now need this shaping
 * and they read the rows through DIFFERENT clients:
 *
 *   - the caller-side path reads them through RLS (Owner/Admin only — the
 *     20260806000000 floor), and
 *   - `change-order-totals-server.ts` reads them with the SERVICE ROLE, so a PM
 *     can recalculate a cost-plus CO without ever seeing a rate (#140).
 *
 * The QUERY differs; the shaping must not. A second copy of this mapping is how
 * the two paths would come to disagree about what a rate means — which is the
 * one failure that would make a PM's total differ from an Owner's rather than
 * merely fail. It lives here because this module is deliberately bundle-neutral
 * (see the header): a server-only module can import it without dragging in
 * `supabase-browser`, which is exactly why the shaping could not simply be
 * imported from the client service file.
 *
 * A-9: cost-plus reads ONLY the four new types. The legacy `cost_plus_percent`
 * is read-only history — the 20260801000000 expansion copied every live legacy
 * row into the three category markups, so pre-A-9 instruments price identically
 * through the new types.
 */
export function buildInstrumentPricingContext(
  rates: RateInForceInput[],
  contractType: 'fixed_price' | 'cost_plus' | 'time_and_materials',
  asOf: string // YYYY-MM-DD
):
  | { contract_type: 'fixed_price' }
  | {
      contract_type: 'cost_plus';
      cost_plus_labor_hourly: number | null;
      cost_plus_material_percent: number | null;
      cost_plus_subcontractor_percent: number | null;
      cost_plus_other_percent: number | null;
    }
  | {
      contract_type: 'time_and_materials';
      tm_labor_hourly: number | null;
      tm_nonlabor_percent: number | null;
    } {
  if (contractType === 'fixed_price') return { contract_type: 'fixed_price' };
  if (contractType === 'cost_plus') {
    return {
      contract_type: 'cost_plus',
      cost_plus_labor_hourly: rateInForce(rates, 'cost_plus_labor_hourly', asOf),
      cost_plus_material_percent: rateInForce(rates, 'cost_plus_material_percent', asOf),
      cost_plus_subcontractor_percent: rateInForce(rates, 'cost_plus_subcontractor_percent', asOf),
      cost_plus_other_percent: rateInForce(rates, 'cost_plus_other_percent', asOf),
    };
  }
  return {
    contract_type: 'time_and_materials',
    tm_labor_hourly: rateInForce(rates, 'tm_labor_hourly', asOf),
    tm_nonlabor_percent: rateInForce(rates, 'tm_nonlabor_percent', asOf),
  };
}
