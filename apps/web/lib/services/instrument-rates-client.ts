import { createClient } from '@/lib/supabase-browser';
import type { InstrumentRate, InstrumentRateType, InstrumentRef } from '@/lib/services/instrument-rates';
import { rateInForce } from '@/lib/services/instrument-rates';
export type { InstrumentRate, InstrumentRateType, InstrumentRef } from '@/lib/services/instrument-rates';
export { rateInForce } from '@/lib/services/instrument-rates';

// Money representation §4.2/§6 — client writes for instrument rates.
// INSERT is Owner/Admin (RLS instrument_rates_insert_authorized); the DB
// trigger is the forward-only authority — this file just surfaces its error.
// Supersede is Owner-ONLY, through the SECURITY DEFINER RPC (never a
// direct UPDATE — the table has no UPDATE policy).

type MutationResult = { success: boolean; error?: string };

/** Client-side history read (rate panels fetch at interaction time). */
export async function listInstrumentRatesClient(ref: InstrumentRef): Promise<InstrumentRate[]> {
  const supabase = createClient();

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

/** Today's rate in force for one instrument + type (estimate/CO builders). */
export async function getRateInForceToday(
  ref: InstrumentRef,
  rateType: InstrumentRateType
): Promise<number | null> {
  const rates = await listInstrumentRatesClient(ref);
  return rateInForce(rates, rateType, new Date().toISOString().slice(0, 10));
}

/** New rate row (initial negotiation or forward-only renegotiation).
 *  Owner/Admin. effective_from defaults to today; the DB trigger rejects
 *  past dates. */
export async function addInstrumentRate(
  ref: InstrumentRef,
  rateType: InstrumentRateType,
  rate: number,
  effectiveFrom?: string
): Promise<MutationResult> {
  if (!(rate >= 0)) return { success: false, error: 'The rate must be zero or more.' };

  const supabase = createClient();
  const { error } = await supabase.from('instrument_rates').insert({
    estimate_id: ref.estimate_id ?? null,
    change_order_id: ref.change_order_id ?? null,
    rate_type: rateType,
    rate,
    effective_from: effectiveFrom ?? new Date().toISOString().slice(0, 10),
  });
  if (error) {
    if (error.message.includes('forward-only') || error.message.includes('in the past')) {
      return { success: false, error: 'Rates are forward-only — the effective date cannot be in the past.' };
    }
    return { success: false, error: error.message };
  }
  return { success: true };
}

/** Owner-only typo correction (§5.5): stamps the row superseded with a
 *  required reason; the original stays for audit and drops out of
 *  rate-in-force. The replacement rate, if needed, is an ordinary add. */
export async function supersedeInstrumentRate(
  rateId: string,
  reason: string
): Promise<MutationResult> {
  if (!reason.trim()) return { success: false, error: 'A reason is required to supersede a rate.' };

  const supabase = createClient();
  const { error } = await supabase.rpc('supersede_instrument_rate', {
    p_rate_id: rateId,
    p_reason: reason.trim(),
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
}
