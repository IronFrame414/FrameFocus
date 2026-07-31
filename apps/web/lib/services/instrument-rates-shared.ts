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
  | 'cost_plus_percent'
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
