import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { createClient } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { exchangeAuthorizationCode, putTokenBlob, revokeToken } from '@/lib/quickbooks/tokens';
import {
  DEFAULT_INCOME_ITEM_NAME,
  listIncomeItems,
} from '@/lib/quickbooks/connection';
import { QB_STATE_COOKIE } from '@/lib/quickbooks/config';

/**
 * 7G step 2 — Intuit redirects the Owner back here after consent.
 *
 * ⚠️ REGISTERED WITH INTUIT AT EXACTLY `/api/quickbooks/callback`, for both
 * `http://localhost:3000` and `https://ezcontractorbinder.com`. Renaming this
 * directory breaks OAuth for every customer at once, with `invalid_grant` at
 * the token exchange and nothing wrong on our side to find.
 *
 * ⚠️ THIS ROUTE COULD NOT BE EXERCISED IN THIS BUILD RUN. It requires Intuit's
 * browser consent screen, and the run was headless. It is verified BY
 * CONSTRUCTION only. Josh's first connection is the first real test — see the
 * handshake checklist in the build log.
 */

export const dynamic = 'force-dynamic';

/** Five years, matching `companies.qb_reauth_required_after`'s documented
 *  hard ceiling: "a connection made today expires in 2031 regardless of use." */
const REAUTH_CEILING_MS = 5 * 365 * 24 * 60 * 60 * 1000;

function settingsUrl(request: NextRequest, params: Record<string, string>): URL {
  const url = new URL('/dashboard/settings/accounting', request.url);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url;
}

/** Constant-time compare. A `===` here leaks the nonce a byte at a time to a
 *  determined attacker; the cost of doing it properly is one function. */
function nonceMatches(a: string | undefined, b: string | null): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const code = params.get('code');
  const realmId = params.get('realmId');
  const state = params.get('state');
  const oauthError = params.get('error');

  const clearState = (response: NextResponse) => {
    response.cookies.set(QB_STATE_COOKIE, '', { path: '/', maxAge: 0 });
    return response;
  };

  // The Owner clicked "Cancel" on Intuit's consent screen. Not an error.
  if (oauthError) {
    console.error(`[qb-callback] Intuit returned error=${oauthError}`);
    return clearState(
      NextResponse.redirect(settingsUrl(request, { qb_error: 'declined' }))
    );
  }

  const cookieNonce = request.cookies.get(QB_STATE_COOKIE)?.value;
  if (!nonceMatches(cookieNonce, state)) {
    // ⚠️ A state mismatch is a possible CSRF attempt, not a hiccup. Refuse
    // BEFORE exchanging the code — an exchanged code is a live grant.
    console.error('[qb-callback] state/nonce mismatch — refusing to exchange the code.');
    return clearState(NextResponse.redirect(settingsUrl(request, { qb_error: 'state_mismatch' })));
  }

  if (!code || !realmId) {
    console.error(
      `[qb-callback] missing parameter(s): code=${code ? 'present' : 'MISSING'} realmId=${realmId ? 'present' : 'MISSING'}`
    );
    return clearState(NextResponse.redirect(settingsUrl(request, { qb_error: 'missing_params' })));
  }

  // ⚠️ THE COMPANY COMES FROM THE SESSION, NEVER FROM THE URL. `realmId` is
  // attacker-controllable; the signed-in Owner is not.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return clearState(NextResponse.redirect(new URL('/sign-in', request.url)));
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id, role')
    .eq('user_id', user.id)
    .single();

  if (!profile || profile.role !== 'owner') {
    console.error(`[qb-callback] denied: user=${user.id} role=${profile?.role ?? 'none'}.`);
    return clearState(NextResponse.redirect(settingsUrl(request, { qb_error: 'owner_only' })));
  }

  const companyId = profile.company_id as string;
  const admin = getSupabaseAdmin();

  // --- exchange -----------------------------------------------------------
  let blob;
  try {
    blob = await exchangeAuthorizationCode(code);
  } catch (err) {
    console.error(`[qb-callback] token exchange failed for company=${companyId}:`, err);
    return clearState(NextResponse.redirect(settingsUrl(request, { qb_error: 'exchange_failed' })));
  }

  // --- one realm, one tenant ----------------------------------------------
  // `idx_companies_qb_realm_id` is UNIQUE. Two companies sharing a realmId would
  // interleave their books silently, which the connection migration calls "the
  // worst failure this integration can have". Check BEFORE writing so the user
  // gets a sentence instead of a constraint violation.
  const { data: claimed } = await admin
    .from('companies')
    .select('id')
    .eq('qb_realm_id', realmId)
    .neq('id', companyId)
    .maybeSingle();

  if (claimed) {
    console.error(
      `[qb-callback] realm ${realmId} is already bound to company ${claimed.id}; refusing for ${companyId}.`
    );
    // Hand the grant back — we are not going to use it, and leaving it live
    // would mean a token exists for a connection that does not.
    await revokeToken(blob.refresh_token);
    return clearState(NextResponse.redirect(settingsUrl(request, { qb_error: 'realm_taken' })));
  }

  // --- store --------------------------------------------------------------
  const { data: existing } = await admin
    .from('companies')
    .select('qb_token_secret_id, qb_realm_id')
    .eq('id', companyId)
    .single();

  let secretId: string;
  try {
    secretId = await putTokenBlob(
      admin,
      companyId,
      blob,
      (existing?.qb_token_secret_id as string | null) ?? null
    );
  } catch (err) {
    console.error(`[qb-callback] Vault write failed for company=${companyId}:`, err);
    await revokeToken(blob.refresh_token);
    return clearState(NextResponse.redirect(settingsUrl(request, { qb_error: 'vault_failed' })));
  }

  const now = new Date();
  const { error: updateError } = await admin
    .from('companies')
    .update({
      qb_realm_id: realmId,
      qb_token_secret_id: secretId,
      qb_connection_state: 'connected',
      qb_connected_at: now.toISOString(),
      qb_last_refresh_at: now.toISOString(),
      qb_refresh_rotated_at: now.toISOString(),
      qb_reauth_required_after: new Date(now.getTime() + REAUTH_CEILING_MS).toISOString(),
    })
    .eq('id', companyId);

  if (updateError) {
    console.error(`[qb-callback] connection write failed for company=${companyId}:`, updateError.message);
    return clearState(NextResponse.redirect(settingsUrl(request, { qb_error: 'save_failed' })));
  }

  // ⚠️ A RECONNECT TO A DIFFERENT REALM DOES NOT RETARGET OLD QUEUED WORK.
  // `qb_sync_queue.realm_id` is denormalised precisely so that cannot happen
  // silently. Rows queued for the previous realm are escalated for a human
  // rather than pushed into a stranger's books.
  if (existing?.qb_realm_id && existing.qb_realm_id !== realmId) {
    const { error: retargetError } = await admin
      .from('qb_sync_queue')
      .update({
        status: 'failed_terminal',
        last_error:
          'Queued for a previous QuickBooks company. Reconnecting to a different QuickBooks company does not move this work — review and re-sync these records manually.',
      })
      .eq('company_id', companyId)
      .eq('is_deleted', false)
      .in('status', ['queued', 'in_flight', 'failed_transient'])
      .neq('realm_id', realmId);
    if (retargetError) {
      console.error(`[qb-callback] stale-queue escalation failed for ${companyId}:`, retargetError.message);
    }
  }

  // --- probe (best effort; never fails the connection) ---------------------
  try {
    const items = await listIncomeItems(admin, {
      companyId,
      realmId,
      accessToken: blob.access_token,
    });
    const exact = items.find((i) => i.name === DEFAULT_INCOME_ITEM_NAME);
    if (exact) {
      await admin
        .from('companies')
        .update({ qb_income_item_id: exact.id, qb_income_item_name: exact.name })
        .eq('id', companyId);
    }
  } catch (err) {
    console.error(`[qb-callback] post-connect probe failed for ${companyId}:`, err);
  }

  return clearState(NextResponse.redirect(settingsUrl(request, { qb_connected: '1' })));
}
