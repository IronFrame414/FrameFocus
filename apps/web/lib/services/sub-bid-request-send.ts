// S107 Part B — the two pieces of the bid-request send that must be testable
// without a server, and must not live inside a route module.

/**
 * The origin this app is reached at, for a link that goes INTO AN EMAIL.
 *
 * ⚠️ `bidReplyUrl()` in `sub-bid-requests-client.ts` reads
 * `window.location.origin`. That is correct in a browser and **useless on a
 * server** — it yields `''`, and the emitted link becomes `/bid/<token>`, a
 * relative path. In a web page that still resolves; **in an email it is a dead
 * link**, and an email cannot be unsent.
 *
 * ⚠️ AND IT RETURNS NULL RATHER THAN A FALLBACK, DELIBERATELY. The established
 * pattern elsewhere in this repo is `process.env.NEXT_PUBLIC_APP_URL ?? ''`,
 * which mails the dead link rather than refusing. `appOrigin()`
 * (`lib/app-origin.ts`) can fall back to request headers, but those are
 * caller-supplied — fine for a redirect the user is already following, wrong
 * for a durable link mailed to a third party, because a forged `X-Forwarded-Host`
 * would put an attacker's origin in the subcontractor's inbox permanently.
 * So: configured value or nothing.
 */
export function publicOrigin(
  env: Record<string, string | undefined> = process.env
): string | null {
  const configured = env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, '');
  if (!configured) return null;
  if (!/^https?:\/\//i.test(configured)) return null;
  return configured;
}

/** The public reply URL for a token, built from a SERVER-SAFE origin. */
export function bidReplyUrlFor(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, '')}/bid/${token}`;
}
