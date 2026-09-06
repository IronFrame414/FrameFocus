import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  QBO_REVOKE_URL,
  QBO_TOKEN_URL,
  qboBasicAuthHeader,
  qboRedirectUri,
} from './config';

/**
 * 7G — the token store. Vault in, Vault out, and the refresh dance.
 *
 * ⚠️ NOTHING IN THIS FILE MAY BE LOGGED. Not the blob, not a token, not a
 * prefix of one. Every `console` call below prints a company id, an HTTP status
 * or an Intuit error CODE — never a credential. "Tokens are credentials: Vault,
 * never a plain column, never a log line."
 *
 * ⚠️ THE CLASSIC FAILURE, RESTATED FROM 20260928000000's HEADER because this is
 * the file that can commit it: Intuit's refresh token ROTATES on roughly every
 * use (~24h) and each rotation INVALIDATES ITS PREDECESSOR. The blob is
 * therefore REPLACED IN FULL on every refresh, never merged. `qb_vault_put`
 * replaces by construction; the danger is a caller that reads, spreads and
 * writes back a stale field.
 */

export interface QboTokenBlob {
  access_token: string;
  refresh_token: string;
  /** ISO. When the ACCESS token dies (1 hour). */
  access_expires_at: string;
  /** ISO. When the current REFRESH token was issued (100-day rolling life). */
  refresh_issued_at: string;
}

interface IntuitTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  x_refresh_token_expires_in?: number;
  token_type: string;
}

/** Intuit's own error code, e.g. `invalid_grant`. Carries no credential. */
export class QboTokenError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    /** True when the grant is GONE and no retry will help — reconnect required. */
    readonly isInvalidGrant: boolean
  ) {
    super(`Intuit token endpoint returned ${status} (${code})`);
    this.name = 'QboTokenError';
  }
}

function blobFrom(res: IntuitTokenResponse): QboTokenBlob {
  const now = Date.now();
  return {
    access_token: res.access_token,
    refresh_token: res.refresh_token,
    // 60s of slack: a token that expires mid-flight is a 401 on a money call.
    access_expires_at: new Date(now + (res.expires_in - 60) * 1000).toISOString(),
    refresh_issued_at: new Date(now).toISOString(),
  };
}

async function postToken(body: URLSearchParams): Promise<QboTokenBlob> {
  const response = await fetch(QBO_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: qboBasicAuthHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: body.toString(),
    cache: 'no-store',
  });

  const text = await response.text();

  if (!response.ok) {
    // Intuit returns `{"error":"invalid_grant"}`. Parse defensively: an HTML
    // error page from a proxy must not throw a SyntaxError over the real cause.
    let code = 'unknown_error';
    try {
      code = (JSON.parse(text) as { error?: string }).error ?? 'unknown_error';
    } catch {
      code = `http_${response.status}`;
    }
    throw new QboTokenError(code, response.status, code === 'invalid_grant');
  }

  return blobFrom(JSON.parse(text) as IntuitTokenResponse);
}

/** OAuth step 2: authorization code -> the first token blob. */
export async function exchangeAuthorizationCode(code: string): Promise<QboTokenBlob> {
  return postToken(
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      // ⚠️ Must be byte-identical to the one sent to the authorize endpoint AND
      // to the one registered with Intuit, or this returns invalid_grant.
      redirect_uri: qboRedirectUri(),
    })
  );
}

/** Rotate. The response's refresh_token is NEW; the old one is already dead. */
export async function refreshTokens(refreshToken: string): Promise<QboTokenBlob> {
  return postToken(
    new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken })
  );
}

/**
 * Tell Intuit the grant is finished. Best-effort by design: a failure here must
 * not prevent the local disconnect from completing, or a user whose token
 * Intuit has already dropped could never clear their own connection.
 */
export async function revokeToken(token: string): Promise<boolean> {
  try {
    const response = await fetch(QBO_REVOKE_URL, {
      method: 'POST',
      headers: {
        Authorization: qboBasicAuthHeader(),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ token }),
      cache: 'no-store',
    });
    return response.ok;
  } catch (err) {
    console.error('[qb-tokens] revoke call failed (continuing with local disconnect):', err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Vault
// ---------------------------------------------------------------------------

/**
 * ⚠️ SERVICE ROLE ONLY. `qb_vault_put/get/forget` are revoked from `anon` and
 * `authenticated` BY NAME (20260928010000) — an anon-key client calling these
 * gets a permission error, which is the design working, not a bug to route
 * around.
 */
export async function putTokenBlob(
  admin: SupabaseClient,
  companyId: string,
  blob: QboTokenBlob,
  existingSecretId: string | null
): Promise<string> {
  const { data, error } = await admin.rpc('qb_vault_put', {
    p_company_id: companyId,
    p_payload: JSON.stringify(blob),
    p_secret_id: existingSecretId,
  });
  if (error) throw new Error(`Vault write failed for company ${companyId}: ${error.message}`);
  return data as unknown as string;
}

export async function getTokenBlob(
  admin: SupabaseClient,
  secretId: string
): Promise<QboTokenBlob | null> {
  const { data, error } = await admin.rpc('qb_vault_get', { p_secret_id: secretId });
  if (error) throw new Error(`Vault read failed: ${error.message}`);
  if (!data) return null;
  try {
    return JSON.parse(data as unknown as string) as QboTokenBlob;
  } catch {
    // A blob we cannot parse is a corrupt credential, not a missing one. Say so
    // WITHOUT printing the payload.
    throw new Error('Stored QuickBooks token blob is not valid JSON.');
  }
}

export async function forgetTokenBlob(admin: SupabaseClient, secretId: string): Promise<void> {
  const { error } = await admin.rpc('qb_vault_forget', { p_secret_id: secretId });
  if (error) throw new Error(`Vault delete failed: ${error.message}`);
}

// ---------------------------------------------------------------------------
// The one function the rest of the connector actually calls
// ---------------------------------------------------------------------------

export interface QboConnection {
  companyId: string;
  realmId: string;
  accessToken: string;
}

/**
 * Return a USABLE access token for a company, refreshing (and re-storing) it if
 * it is at or past expiry.
 *
 * Returns `null` when the company cannot currently talk to QuickBooks — never
 * connected, disconnected, revoked, or the refresh failed. **A null is not an
 * error to throw past; it is the connector's resting state while a tenant is
 * not connected**, and every caller must treat it as "leave the work queued".
 *
 * ⚠️ ON `invalid_grant` THE CONNECTION GOES `needs_reauth` AND THE QUEUE IS NOT
 * TOUCHED [Josh, S148]. Rows stay `queued`. Nothing is marked failed, because
 * nothing is wrong with the records — the work is still valid and flows the
 * moment the Owner reconnects. Marking them failed would turn a reconnect into
 * a manual recovery, which is the failure this design exists to avoid.
 *
 * ⚠️ THE REFRESH RACE, AND WHY IT SELF-HEALS. Two workers can refresh at once;
 * the loser's brand-new refresh token was invalidated by the winner's rotation,
 * so it sees `invalid_grant` on a connection that is in fact healthy. Rather
 * than flip a working connection to `needs_reauth`, a failed refresh RE-READS
 * the blob once: if the stored refresh token has changed underneath us, another
 * process rotated it and we simply use the new one.
 */
export async function getAccessToken(
  admin: SupabaseClient,
  companyId: string
): Promise<QboConnection | null> {
  const { data: company, error } = await admin
    .from('companies')
    .select('id, qb_realm_id, qb_token_secret_id, qb_connection_state')
    .eq('id', companyId)
    .single();

  if (error || !company) {
    console.error(`[qb-tokens] company ${companyId} not readable:`, error?.message);
    return null;
  }
  if (
    company.qb_connection_state === 'disconnected' ||
    company.qb_connection_state === 'revoked' ||
    !company.qb_realm_id ||
    !company.qb_token_secret_id
  ) {
    return null;
  }

  const secretId = company.qb_token_secret_id as string;
  const blob = await getTokenBlob(admin, secretId);
  if (!blob) {
    console.error(`[qb-tokens] company ${companyId} has a secret id with no Vault row.`);
    await markNeedsReauth(admin, companyId);
    return null;
  }

  if (new Date(blob.access_expires_at).getTime() > Date.now()) {
    return {
      companyId,
      realmId: company.qb_realm_id as string,
      accessToken: blob.access_token,
    };
  }

  let fresh: QboTokenBlob;
  try {
    fresh = await refreshTokens(blob.refresh_token);
  } catch (err) {
    if (err instanceof QboTokenError && err.isInvalidGrant) {
      // The race described above — re-read once before condemning the grant.
      const reread = await getTokenBlob(admin, secretId);
      if (reread && reread.refresh_token !== blob.refresh_token) {
        if (new Date(reread.access_expires_at).getTime() > Date.now()) {
          return {
            companyId,
            realmId: company.qb_realm_id as string,
            accessToken: reread.access_token,
          };
        }
        try {
          fresh = await refreshTokens(reread.refresh_token);
        } catch {
          await markNeedsReauth(admin, companyId);
          return null;
        }
        await storeRefreshed(admin, companyId, fresh, secretId);
        return { companyId, realmId: company.qb_realm_id as string, accessToken: fresh.access_token };
      }
      console.error(`[qb-tokens] invalid_grant for company ${companyId} -> needs_reauth.`);
      await markNeedsReauth(admin, companyId);
      return null;
    }
    // A 5xx or a network fault is NOT a dead grant. Leave the connection
    // `connected` and let the queue retry; flipping to needs_reauth here would
    // demand a pointless reconnect for a transient Intuit outage.
    console.error(`[qb-tokens] transient refresh failure for company ${companyId}:`, err);
    return null;
  }

  await storeRefreshed(admin, companyId, fresh, secretId);
  return { companyId, realmId: company.qb_realm_id as string, accessToken: fresh.access_token };
}

async function storeRefreshed(
  admin: SupabaseClient,
  companyId: string,
  blob: QboTokenBlob,
  secretId: string
): Promise<void> {
  // REPLACE, never merge (see the file header).
  await putTokenBlob(admin, companyId, blob, secretId);
  const now = new Date().toISOString();
  await admin
    .from('companies')
    .update({
      qb_last_refresh_at: now,
      qb_refresh_rotated_at: now,
      // A successful refresh proves the grant is alive; clear any stale banner.
      qb_connection_state: 'connected',
    })
    .eq('id', companyId);
}

export async function markNeedsReauth(admin: SupabaseClient, companyId: string): Promise<void> {
  // ⚠️ THE QUEUE IS DELIBERATELY NOT TOUCHED HERE. See the doc comment above.
  await admin
    .from('companies')
    .update({ qb_connection_state: 'needs_reauth' })
    .eq('id', companyId);
}
