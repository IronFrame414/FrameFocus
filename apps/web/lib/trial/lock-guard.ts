import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * S138 — is the caller's company locked out by an expired trial?
 *
 * ⚠️ THIS EXISTS BECAUSE THE BAN IS NOT ENOUGH ON ITS OWN. Measured in S138:
 * a banned user cannot sign in and cannot refresh, but an access token issued
 * BEFORE the lock keeps working for the rest of its 3600s life, through
 * PostgREST, `/m` and every API route. See 20260920000000_lock_guard.sql.
 *
 * Runs on the CALLER's client, not the service role: `is_my_company_locked()`
 * is SECURITY DEFINER and answers for `get_my_company_id()`, so there is
 * nothing to pass and nothing to spoof.
 *
 * ⚠️ FAILS OPEN, AND THAT IS DELIBERATE. If the RPC errors — the function not
 * yet deployed, a transient database fault — this returns false and the request
 * proceeds. The alternative fails CLOSED, which would lock every tenant out of
 * the entire product the moment this one query breaks. The ban is still in
 * force underneath; this guard only shortens a one-hour window.
 */
export async function isMyCompanyLocked(supabase: SupabaseClient): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('is_my_company_locked');
    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
}

/**
 * API paths that must keep working for a LOCKED company.
 *
 * ⚠️ THE PAYMENT PATH IS ON THIS LIST AND MUST STAY ON IT. Locking a company
 * out of `/api/stripe/checkout` would make the lock unrecoverable by the one
 * action that is supposed to end it — the tenant would be told to pay and then
 * refused the ability to pay. That is the single worst bug this feature can
 * ship, so it is a named constant with a test rather than a condition someone
 * has to notice.
 *
 * The rest carry no user session at all (Stripe and Resend call them with a
 * signature; the crons carry CRON_SECRET), so they would pass the guard anyway
 * — they are listed to make the intent explicit rather than incidental.
 */
export const LOCK_EXEMPT_API_PREFIXES = [
  '/api/stripe/checkout', // pay — the way OUT of the lock
  '/api/stripe/webhook', // payment landing, no user session
  '/api/stripe/portal', // manage billing / update a card
  '/api/webhooks', // Resend, signature-authenticated
  '/api/cron', // CRON_SECRET, no user session
  '/api/admin', // platform staff override
  '/api/auth', // sign-out must always work
] as const;

export function isLockExemptApiPath(pathname: string): boolean {
  return LOCK_EXEMPT_API_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Page paths a locked user may still reach. Billing is the way out; `/locked`
 * is where they are sent, so redirecting it to itself would loop.
 */
export const LOCK_EXEMPT_PAGE_PREFIXES = [
  '/locked',
  '/dashboard/billing',
  '/sign-in',
  '/sign-up',
] as const;

export function isLockExemptPagePath(pathname: string): boolean {
  return LOCK_EXEMPT_PAGE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
