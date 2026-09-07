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

/**
 * Intuit's API "minor version". Pinned, not floating: an unpinned minorversion
 * silently changes response shapes under a working integration.
 *
 * ⚠️ F5 — **INTUIT ACCEPTS A WRONG VALUE SILENTLY, SO NOTHING ON THE WIRE CAN
 * VALIDATE THIS.** Measured by the S187 audit: `/companyinfo` at minorversion
 * **75, 76, 80, 85, 90, 99 and 200 all returned HTTP 200 with valid data.**
 * Intuit does not fault on an unknown minor version — it serves *some* version's
 * response shape, which is precisely the failure the pin exists to prevent.
 *
 * ⚠️ THE AUDIT CONCLUDED "no code fix available", AND THAT IS RIGHT ABOUT INTUIT
 * AND WRONG ABOUT US [S104]. The failure mode worth defending against is a TYPO
 * here, and a typo is entirely catchable on our side of the wire — it just
 * cannot be caught by asking Intuit. `s104-qb-minorversion.test.ts` asserts the
 * shape below, so `'7 5'`, `'v75'`, `'75.1'` or an empty string fail CI instead
 * of silently serving a different version's response shape in production.
 *
 * ⚠️ WHAT NO TEST CAN TELL YOU: whether 75 is still a sensible pin. That is a
 * MANUAL check against Intuit's minor-versions page at each release-note cycle,
 * and the date below is the record of when it was last done. **Move the date
 * when you check, not when you edit the file.**
 *
 * Last verified against Intuit's published minor-version list: 2026-09-06 (S103).
 */
export const QBO_MINOR_VERSION = '75';

/**
 * ⚠️ THE SHAPE A MINOR VERSION MUST HAVE, asserted in CI. Intuit's minor
 * versions are bare ascending integers; anything else is a typo that Intuit will
 * accept and quietly ignore. Exported so the test asserts the SAME rule the
 * request uses, rather than a second copy of it that can drift.
 */
export const QBO_MINOR_VERSION_PATTERN = /^[1-9][0-9]{0,3}$/;

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
 * F6 — the OpenID discovery document, and what it is FOR here.
 *
 * ⚠️ THE THREE URLS ABOVE HAVE **NOT** DRIFTED. Verified against the live
 * document at S187 and NOT re-litigated at S104 — that question is closed, and
 * Josh's questionnaire answer of "no, we do not consume the discovery document"
 * remains accurate. **This is hardening so a FUTURE drift is detectable. It is
 * not a repair, and nothing below implies the values are wrong.**
 *
 * ⚠️ AND IT IS DELIBERATELY NOT WIRED INTO THE RUNTIME PATH. Fetching discovery
 * before every OAuth call would make Intuit's availability a precondition for
 * *starting* a connection, and would turn a network blip into "you cannot
 * connect QuickBooks" — strictly worse than three constants that are correct.
 * The document is a CHECK, run by a test, not a dependency.
 *
 * ⚠️ ONE DOCUMENT PER ENVIRONMENT, and the sandbox one exists but is NOT a
 * different answer for these three fields — the OAuth endpoints are shared, as
 * the comment above says. The production document is therefore the one to check.
 */
export const QBO_DISCOVERY_URL =
  'https://developer.api.intuit.com/.well-known/openid_configuration';

/** Discovery-document field -> the constant it must agree with. */
export const QBO_DISCOVERY_EXPECTATIONS: Record<string, string> = {
  authorization_endpoint: QBO_AUTHORIZE_URL,
  token_endpoint: QBO_TOKEN_URL,
  revocation_endpoint: QBO_REVOKE_URL,
};

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

/**
 * The OAuth state cookie name.
 *
 * ⚠️ LIVES HERE, NOT IN THE ROUTE FILE. Next.js type-checks route modules
 * against a fixed export surface (`GET`, `POST`, `dynamic`, …) and REJECTS an
 * unrecognised export at build time — while `tsc --noEmit` says nothing. That
 * is precisely the §6 trap: "type-check is necessary and NOT sufficient".
 *
 * httpOnly so no script can read it; SameSite=Lax so it survives Intuit's
 * top-level GET redirect back to /callback. A `Strict` cookie would be withheld
 * on that navigation and every single connection would fail its state check.
 */
export const QB_STATE_COOKIE = 'qb_oauth_state';
