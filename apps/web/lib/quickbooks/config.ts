import 'server-only';

/**
 * 7G — Intuit endpoints, environment resolution and the OAuth scope.
 *
 * ⚠️ EVERY VALUE IN THIS FILE IS SERVER-ONLY. `QBO_CLIENT_SECRET` must never
 * reach a bundle, so nothing here may be imported from a `'use client'` module.
 * The `server-only` import above turns that mistake into a BUILD failure rather
 * than a runtime leak — which is the §6 constraint the prompt names: a client
 * component importing a server module type-checks clean and fails to build, and
 * that has already shipped once on this project.
 */

// ---------------------------------------------------------------------------
// ⚠️ SCOPE — ACCOUNTING ONLY. DO NOT ADD THE PAYMENT SCOPE.
// ---------------------------------------------------------------------------
// RULED [S103 #1]. `com.intuit.quickbooks.payment` is NOT required: the
// shareable pay-link is produced by ACCOUNTING-API `Invoice` fields
// (`AllowOnlinePayment` / `AllowOnlineCreditCardPayment` / `AllowOnlineACHPayment`),
// which this connector sets on create.
//
// ⚠️ SCOPES CANNOT BE REMOVED ONCE SAVED against a production app. Adding the
// payment scope here is therefore IRREVERSIBLE and buys nothing. If a future
// reader believes the pay-link needs it, read 7g2-spec.md §3.1 first — the
// question is closed and the reasoning is recorded there.
export const QBO_SCOPE = 'com.intuit.quickbooks.accounting';

/** Intuit's API "minor version". Pinned, not floating: an unpinned minorversion
 *  silently changes response shapes under a working integration. */
export const QBO_MINOR_VERSION = '75';

export type QboEnvironment = 'sandbox' | 'production';

export function qboEnvironment(): QboEnvironment {
  return process.env.QBO_ENVIRONMENT === 'production' ? 'production' : 'sandbox';
}

/**
 * The accounting API base. Sandbox and production are DIFFERENT HOSTS, and a
 * mismatch does not fail loudly — it returns 401 against a realm that does not
 * exist on that host, which reads as an auth problem and is not one.
 */
export function qboApiBase(env: QboEnvironment = qboEnvironment()): string {
  return env === 'production'
    ? 'https://quickbooks.api.intuit.com'
    : 'https://sandbox-quickbooks.api.intuit.com';
}

/** OAuth endpoints. These are the SAME for sandbox and production — only the
 *  API host above differs. Getting this backwards is a common wasted day. */
export const QBO_AUTHORIZE_URL = 'https://appcenter.intuit.com/connect/oauth2';
export const QBO_TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
export const QBO_REVOKE_URL = 'https://developer.api.intuit.com/v2/oauth2/tokens/revoke';

/**
 * The registered redirect URI. ⚠️ REGISTERED WITH INTUIT AT EXACTLY THIS PATH
 * for both `http://localhost:3000` and `https://ezcontractorbinder.com`. Intuit
 * matches the redirect_uri STRING EXACTLY — a trailing slash, a different host
 * or an http/https swap is `invalid_grant` at the token exchange, well after the
 * consent screen appeared to succeed.
 */
export function qboRedirectUri(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, '') || 'http://localhost:3000';
  return `${base}/api/quickbooks/callback`;
}

export interface QboCredentials {
  clientId: string;
  clientSecret: string;
}

/**
 * ⚠️ THROWS when unconfigured, and is called lazily — never at module load.
 * A module-load read of a missing env var crashes the BUILD, which is the trap
 * `getStripe()` and `getOpenAI()` exist to avoid on this project.
 */
export function qboCredentials(): QboCredentials {
  const clientId = process.env.QBO_CLIENT_ID;
  const clientSecret = process.env.QBO_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      'QuickBooks is not configured on this deployment (QBO_CLIENT_ID / QBO_CLIENT_SECRET).'
    );
  }
  return { clientId, clientSecret };
}

/** HTTP Basic for the token endpoint. Intuit rejects client credentials in the
 *  body for the bearer endpoint; they belong in the Authorization header. */
export function qboBasicAuthHeader(): string {
  const { clientId, clientSecret } = qboCredentials();
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
}
