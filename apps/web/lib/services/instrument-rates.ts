import { createClient } from '@/lib/supabase-server';
import type { Database } from '@framefocus/shared/types/database';

// Money representation §4.2/§6 — instrument-scoped negotiated rates.
// Effective-dated, FORWARD-ONLY (DB trigger instrument_rates_forward_only,
// migration 20260730010000), append-only except the Owner-only supersede
// stamp (supersede_instrument_rate RPC). Rate-in-force = the non-superseded
// row of the matching rate_type with the greatest effective_from ≤ the
// as-of date.

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

/** Full history for one instrument, newest effective date first. Superseded
 *  rows ride along (struck through in the UI), marked by superseded_at. */
export async function listInstrumentRates(ref: InstrumentRef): Promise<InstrumentRate[]> {
  const supabase = await createClient();

  let query = supabase.from('instrument_rates').select('*');
  query = ref.estimate_id
    ? query.eq('estimate_id', ref.estimate_id)
    : query.eq('change_order_id', ref.change_order_id);

  const { data, error } = await query
    .order('rate_type', { ascending: true })
    .order('effective_from', { ascending: false });
  if (error) return [];
  return (data ?? []) as InstrumentRate[];
}

/** Pure rate-in-force selection — shared by server and client callers.
 *  Superseded rows never win (their correction is the point, §5.5). */
export function rateInForce(
  rates: Pick<InstrumentRate, 'rate_type' | 'rate' | 'effective_from' | 'superseded_at'>[],
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
