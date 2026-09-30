/**
 * S120 3-B — `is_my_company_locked()` OUT OF THE REQUEST PATH, for healthy tenants.
 *
 * The middleware asked Postgres "is my company locked?" on EVERY matched request
 * — /dashboard, /m, /portal and every /api call (lock-guard.ts). For a healthy
 * tenant the answer is "no" thousands of times a day. This caches THAT answer,
 * and only that answer, in a short-lived signed cookie.
 *
 * ⚠️ ONLY "NOT LOCKED" IS CACHED. A locked answer is never stored, so a tenant
 * who pays is unlocked on their very next request, and a locked tenant can
 * never be kept locked by a stale cookie.
 *
 * ⚠️ THE TRADE, STATED: a tenant that BECOMES locked keeps working for at most
 * LOCK_OK_TTL_S seconds on a cookie minted before the lock (then the RPC runs
 * again and says locked). The trial-lock job also bans every login, so the
 * window this guard exists to close (a pre-lock token's remaining hour, S138)
 * is still closed to within the TTL.
 *
 * ⚠️ UNFORGEABLE: the value is `<user id>.<expiry>.<HMAC-SHA256>`, keyed by a
 * key DERIVED from the server-only service-role secret (HMAC is one-way — the
 * derived key reveals nothing about the secret). It is bound to the user id,
 * so it cannot be carried to another login, and its expiry is inside the MAC.
 *
 * ⚠️ FAILS TOWARD THE OLD PATH, NEVER TOWARD LOCKED: a missing secret, a
 * malformed or expired cookie, or any crypto error verifies as FALSE, which
 * just means the RPC runs as it always did (and that RPC itself fails open).
 * Nothing here can lock a healthy tenant.
 *
 * Web Crypto only — this runs in the Edge middleware.
 */

export const LOCK_OK_COOKIE = 'ff_lock_ok';
export const LOCK_OK_TTL_S = 30;

const enc = new TextEncoder();
let keyPromise: Promise<CryptoKey | null> | null = null;

function lockKey(): Promise<CryptoKey | null> {
  if (!keyPromise) {
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
    keyPromise = secret
      ? crypto.subtle
          .importKey(
            'raw',
            enc.encode(`ff-lock-ok-v1:${secret}`),
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign', 'verify']
          )
          .catch(() => null)
      : Promise.resolve(null);
  }
  return keyPromise;
}

function toB64url(buf: ArrayBuffer): string {
  let s = '';
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string): Uint8Array<ArrayBuffer> {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(b.length));
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

/** A cookie value saying "this user's company was not locked", or null (no key). */
export async function signLockOk(
  userId: string,
  nowS: number = Math.floor(Date.now() / 1000)
): Promise<string | null> {
  try {
    const key = await lockKey();
    if (!key) return null;
    const body = `${userId}.${nowS + LOCK_OK_TTL_S}`;
    return `${body}.${toB64url(await crypto.subtle.sign('HMAC', key, enc.encode(body)))}`;
  } catch {
    return null;
  }
}

/** True only for a genuine, unexpired value minted for THIS user. */
export async function verifyLockOk(
  value: string | undefined,
  userId: string,
  nowS: number = Math.floor(Date.now() / 1000)
): Promise<boolean> {
  try {
    if (!value) return false;
    const parts = value.split('.');
    if (parts.length !== 3) return false;
    const [uid, expS, sig] = parts;
    if (uid !== userId) return false;
    const exp = Number(expS);
    // Expired, or further out than any value we mint (a forged long expiry).
    if (!Number.isInteger(exp) || exp <= nowS || exp > nowS + LOCK_OK_TTL_S) return false;
    const key = await lockKey();
    if (!key) return false;
    return await crypto.subtle.verify('HMAC', key, fromB64url(sig), enc.encode(`${uid}.${expS}`));
  } catch {
    return false;
  }
}

/** Test seam: forget the derived key (the unit suite changes the secret). */
export function resetLockKeyForTests(): void {
  keyPromise = null;
}
