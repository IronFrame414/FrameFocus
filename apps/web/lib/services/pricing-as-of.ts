import type { SupabaseClient } from '@supabase/supabase-js';
import { todayInZone } from '@/lib/services/instrument-rates-shared';

// TECH_DEBT #140 (residue) — THE AS-OF DATE FOR RATE-IN-FORCE, IN COMPANY TIME.
//
// ===========================================================================
// ⚠️ WHY THIS IS ONE FUNCTION AND NOT TWO
// ===========================================================================
// Rate-in-force is "the newest `effective_from` ≤ THE AS-OF DATE". Both pricing
// paths used to compute that date as `new Date().toISOString().slice(0, 10)` —
// a **UTC** slice. `instrument-rates-shared.ts`'s own header explains why that
// is wrong: after ~20:00 EDT, UTC is already TOMORROW, so a rate dated tomorrow
// starts pricing today's work. Since future-dating was permitted (P5 as amended,
// migration `20260731010000`) that is accepted silently rather than rejected,
// which is what made it worth fixing rather than noting.
//
// **THE TWO PATHS MUST MOVE TOGETHER, AND THAT IS THE WHOLE REASON THIS MODULE
// EXISTS.** `change-order-totals-server.ts` prices with the service role for a
// PM; `estimate-items-client.ts` prices in the browser for an Owner. If only
// one moved to company time, a PM's total and an Owner's total for the SAME
// change order would differ for a few hours every evening — a worse bug than
// the one being fixed, and one that would look exactly like #140 to whoever
// found it. The server module's own comment said so and refused to move alone.
// So: one function, both callers, one change.
//
// ===========================================================================
// ⚠️ `companyId` IS NOT OPTIONAL SUGAR — IT IS THE RLS/SERVICE-ROLE SEAM
// ===========================================================================
// Pass `null` for an RLS-SCOPED client (the browser one): `companies` is scoped
// to the caller's own row, so an unfiltered `maybeSingle()` returns exactly it.
//
// Pass the id for a SERVICE-ROLE client: RLS is bypassed entirely, so the same
// unfiltered query would see EVERY company and `maybeSingle()` would error or —
// worse, on a single-tenant dev database — silently return an arbitrary row and
// price in a stranger's timezone. The parameter is required so that a caller
// has to decide which of those it is rather than inherit a default.
//
// The fallback is `America/New_York`, NEVER UTC. It mirrors the column default
// and `getCompanyTimeSettings`; falling back to UTC would quietly reintroduce
// the exact defect this module removes.

const FALLBACK_TZ = 'America/New_York';

/**
 * TODAY as a company-timezone calendar date (`YYYY-MM-DD`), for rate-in-force.
 *
 * @param supabase  RLS-scoped client, or a service-role client.
 * @param companyId `null` when `supabase` is RLS-scoped; the company's id when
 *                  it is service-role. See the header — this is not optional.
 * @param now       Injectable for tests, so the evening boundary is provable
 *                  without touching the clock.
 */
export async function pricingAsOfDate(
  supabase: SupabaseClient,
  companyId: string | null,
  now?: Date
): Promise<string> {
  let timeZone = FALLBACK_TZ;
  try {
    const query = supabase.from('companies').select('timezone');
    const { data } = await (companyId ? query.eq('id', companyId) : query).maybeSingle();
    timeZone = (data as { timezone?: string } | null)?.timezone || FALLBACK_TZ;
  } catch {
    // A failed settings read must not fail the price. The fallback is the
    // column default, which is the same answer every other consumer degrades
    // to — see getCompanyTimeSettings.
    timeZone = FALLBACK_TZ;
  }
  return todayInZone(timeZone, now);
}
