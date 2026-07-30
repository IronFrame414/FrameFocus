import { createClient } from '@/lib/supabase-server';
import type {
  InstrumentRate,
  InstrumentRef,
} from '@/lib/services/instrument-rates-shared';

// Money representation §4.2/§6 — instrument-scoped negotiated rates,
// SERVER reads. Effective-dated; backdating bounded by the previous rate
// (P5 as amended: no rate is ever future-dated; the first rate per
// instrument+rate_type may be backdated to the signing date, later rates
// land between the latest existing rate and today — DB trigger
// instrument_rates_backdating_guard, migration 20260730010000).
// Append-only except the Owner-only supersede stamp
// (supersede_instrument_rate RPC).
//
// The types and the pure rateInForce selection live in
// instrument-rates-shared.ts (no supabase import — safe in both bundles);
// this file only holds the server-client query.

export type {
  InstrumentRate,
  InstrumentRateType,
  InstrumentRef,
  RateInForceInput,
} from '@/lib/services/instrument-rates-shared';
export { rateInForce } from '@/lib/services/instrument-rates-shared';

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
