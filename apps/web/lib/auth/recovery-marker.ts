import 'server-only';
import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';

/**
 * S110 E1 [RULED Josh, Q8 → A] — "THIS SESSION CAME FROM A RECOVERY LINK."
 *
 * `/reset-password` must work for someone who does NOT know their password (they
 * followed an emailed recovery link) and must NOT work for someone who merely
 * holds a live session (an unlocked phone on a jobsite). The two are told apart
 * at the moment the session is MINTED, where the server knows which it is:
 *
 *   · `/auth/callback` — the PKCE code exchange returns
 *     `redirectType === 'PASSWORD_RECOVERY'` (auth-js 2.100.1,
 *     GoTrueClient.js:1446-1475) for a self-service reset;
 *   · `/auth/confirm` — `verifyOtp({ type: 'recovery' })` for the
 *     admin-initiated reset.
 *
 * Either sets this marker. The password action accepts EITHER a valid marker OR
 * the current password.
 *
 * WHY NOT THE JWT's `amr`. Measured on rebuild-test [S110]: a recovery session's
 * `amr` is `[{ method: 'otp' }]`, not `recovery` — indistinguishable from any
 * other OTP sign-in. The marker is the measured signal.
 *
 * ⚠️ WHY IT IS SIGNED AND BOUND. An httpOnly cookie cannot be set by page script,
 * but anyone at an unlocked LAPTOP can add a cookie in devtools. So the value is
 * HMAC'd with a server-only key and bound to (user id, session id, expiry): a
 * forged or copied marker fails, and a real one is valid only for the very
 * session the recovery link created, for 15 minutes.
 *
 * The key is DERIVED (HKDF, own label) from the service-role key rather than a
 * new env var, so there is nothing new to provision in Vercel — and the label
 * means this HMAC can never be confused with any other use of that key.
 */

export const RECOVERY_MARKER_COOKIE = 'ff_recovery';
export const RECOVERY_MARKER_TTL_SECONDS = 15 * 60;

function key(): Buffer {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error('recovery marker: SUPABASE_SERVICE_ROLE_KEY is not set');
  return Buffer.from(hkdfSync('sha256', secret, 'framefocus', 'recovery-marker/v1', 32));
}

function mac(body: string): string {
  return createHmac('sha256', key()).update(body).digest('base64url');
}

/** The session id carried in an access token (not verified here — callers pass
 *  a token they just received from GoTrue, or claims from `getClaims()`). */
export function sessionIdOf(accessToken: string): string | null {
  try {
    const claims = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64url').toString()) as {
      session_id?: unknown;
    };
    return typeof claims.session_id === 'string' ? claims.session_id : null;
  } catch {
    return null;
  }
}

export function makeRecoveryMarker(userId: string, sessionId: string, now = Date.now()): string {
  const body = Buffer.from(
    JSON.stringify({ u: userId, s: sessionId, exp: Math.floor(now / 1000) + RECOVERY_MARKER_TTL_SECONDS })
  ).toString('base64url');
  return `${body}.${mac(body)}`;
}

export function recoveryMarkerIsValid(
  value: string | undefined,
  userId: string,
  sessionId: string | null,
  now = Date.now()
): boolean {
  if (!value || !sessionId) return false;
  const [body, sig] = value.split('.');
  if (!body || !sig) return false;
  const expected = Buffer.from(mac(body));
  const got = Buffer.from(sig);
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return false;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString()) as { u?: string; s?: string; exp?: number };
    return p.u === userId && p.s === sessionId && typeof p.exp === 'number' && p.exp * 1000 > now;
  } catch {
    return false;
  }
}

export const recoveryMarkerCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: RECOVERY_MARKER_TTL_SECONDS,
};
