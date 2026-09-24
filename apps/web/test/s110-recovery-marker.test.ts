import { describe, it, expect, beforeAll, vi } from 'vitest';

vi.mock('server-only', () => ({}));

// S110 E1 — the recovery marker: signed, bound to (user, session), expiring.
// A marker that is forged, copied to another session, handed to another user,
// or stale must not authorise a password change without the current password.

beforeAll(() => {
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'unit-test-service-role-key';
});

describe('S110 E1 — recovery marker', async () => {
  const { makeRecoveryMarker, recoveryMarkerIsValid, sessionIdOf, RECOVERY_MARKER_TTL_SECONDS } =
    await import('@/lib/auth/recovery-marker');
  const now = Date.UTC(2026, 8, 23, 12, 0, 0);
  const m = () => makeRecoveryMarker('user-1', 'sess-1', now);

  it('valid for the same user and session, within 15 minutes', () => {
    expect(recoveryMarkerIsValid(m(), 'user-1', 'sess-1', now + 60_000)).toBe(true);
  });
  it('refused for another SESSION (a marker copied onto a live session)', () => {
    expect(recoveryMarkerIsValid(m(), 'user-1', 'sess-2', now)).toBe(false);
  });
  it('refused for another USER', () => {
    expect(recoveryMarkerIsValid(m(), 'user-2', 'sess-1', now)).toBe(false);
  });
  it('refused once expired', () => {
    expect(recoveryMarkerIsValid(m(), 'user-1', 'sess-1', now + (RECOVERY_MARKER_TTL_SECONDS + 1) * 1000)).toBe(false);
  });
  it('refused when the body is edited (a devtools forgery)', () => {
    const [, sig] = m().split('.');
    const forged = Buffer.from(JSON.stringify({ u: 'user-1', s: 'sess-2', exp: now / 1000 + 900 })).toString('base64url');
    expect(recoveryMarkerIsValid(`${forged}.${sig}`, 'user-1', 'sess-2', now)).toBe(false);
  });
  it('refused with a wrong signature, no signature, no value, or no session id', () => {
    const [body] = m().split('.');
    expect(recoveryMarkerIsValid(`${body}.AAAA`, 'user-1', 'sess-1', now)).toBe(false);
    expect(recoveryMarkerIsValid(body, 'user-1', 'sess-1', now)).toBe(false);
    expect(recoveryMarkerIsValid(undefined, 'user-1', 'sess-1', now)).toBe(false);
    expect(recoveryMarkerIsValid(m(), 'user-1', null, now)).toBe(false);
  });
  it('sessionIdOf reads the JWT claim, and returns null on garbage', () => {
    const jwt = `x.${Buffer.from(JSON.stringify({ session_id: 'abc' })).toString('base64url')}.y`;
    expect(sessionIdOf(jwt)).toBe('abc');
    expect(sessionIdOf('nope')).toBeNull();
  });
});
