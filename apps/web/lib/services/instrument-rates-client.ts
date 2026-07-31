import { createClient } from '@/lib/supabase-browser';
import type {
  InstrumentRate,
  InstrumentRateType,
  InstrumentRef,
} from '@/lib/services/instrument-rates-shared';
import { rateInForce } from '@/lib/services/instrument-rates-shared';
export type {
  InstrumentRate,
  InstrumentRateType,
  InstrumentRef,
  RateInForceInput,
} from '@/lib/services/instrument-rates-shared';
export { latestLiveEffectiveFrom, rateInForce } from '@/lib/services/instrument-rates-shared';

// Money representation §4.2/§6 — client writes for instrument rates.
// Types and the pure rateInForce live in instrument-rates-shared.ts (no
// supabase import — safe in the client bundle). NEVER import a value from
// instrument-rates.ts here: it pulls supabase-server → next/headers into
// the client bundle and breaks the build (type-only imports are fine).
// INSERT is Owner/Admin (RLS instrument_rates_insert_authorized); the DB
// backdating guard is the authority (first rate per type takes ANY date —
// past or future; later rates on/after the latest existing non-superseded
// rate; no today-cap since P5 as amended 2026-07-31 / migration
// 20260731010000 — a future rate is dormant until its date) — this file
// just surfaces its errors.
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

/** New rate row (initial negotiation or renegotiation). Owner/Admin.
 *  effective_from defaults to today. The DB backdating guard is the
 *  authority: the first rate of a type takes any date (signing date, or a
 *  not-yet-started deal); later rates land on/after the latest existing
 *  non-superseded rate. No upper bound — a future-dated rate is not in
 *  force until its date arrives (P5 as amended 2026-07-31). */
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
    if (error.message.includes('before the latest existing rate')) {
      return { success: false, error: 'The effective date cannot be before the latest existing rate of this type — history before the previous rate is immutable.' };
    }
    return { success: false, error: error.message };
  }
  return { success: true };
}

/** Owner-only typo correction (§5.5): stamps the row superseded with a
 *  required reason; the original stays for audit and drops out of
 *  rate-in-force. The replacement is written by the RPC in the SAME
 *  transaction; the RPC rejects any supersede that would leave the
 *  instrument+rate_type with no live rate (a rateless instrument cannot
 *  price), so omit the replacement only when another live rate of the type
 *  remains. The replacement may reuse the superseded row's exact date. */
export async function supersedeInstrumentRate(
  rateId: string,
  reason: string,
  replacement?: { rate: number; effectiveFrom: string }
): Promise<MutationResult> {
  if (!reason.trim()) return { success: false, error: 'A reason is required to supersede a rate.' };
  if (replacement && !(replacement.rate >= 0)) {
    return { success: false, error: 'The replacement rate must be zero or more.' };
  }

  const supabase = createClient();
  const { error } = await supabase.rpc('supersede_instrument_rate', {
    p_rate_id: rateId,
    p_reason: reason.trim(),
    p_replacement_rate: replacement?.rate,
    p_replacement_effective_from: replacement?.effectiveFrom,
  });
  if (error) {
    if (error.message.includes('provide a replacement rate')) {
      return {
        success: false,
        error: 'This is the only rate in force — superseding it requires a replacement rate in the same step.',
      };
    }
    return { success: false, error: error.message };
  }
  return { success: true };
}
