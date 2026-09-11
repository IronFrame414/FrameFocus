import { describe, expect, it } from 'vitest';
import {
  AUTH_RATE_GLOBAL_HOURLY,
  AUTH_RATE_PER_ADDRESS_HOURLY,
  authRateDecision,
} from '@/lib/services/auth-email';

// The auth-email rate cap [Josh, 2026-09-11] — the bound that replaces GoTrue's
// `rate_limit_email_sent` (2/hour, project-wide), which stopped binding the
// moment the Send Email Hook moved sending into this application and was
// replaced by nothing.
//
// The decision table IS the policy, and two of its rules are protections for a
// PERSON rather than for the platform. Those are the ones with ⚠️.

describe('authRateDecision — the per-address cap', () => {
  it('allows a send below the cap', () => {
    expect(authRateDecision('auth_signup_confirmation', 0, 0).allowed).toBe(true);
    expect(authRateDecision('auth_signup_confirmation', AUTH_RATE_PER_ADDRESS_HOURLY - 1, 0).allowed).toBe(true);
  });

  it('refuses AT the cap, not one past it', () => {
    const d = authRateDecision('auth_signup_confirmation', AUTH_RATE_PER_ADDRESS_HOURLY, 0);
    expect(d.allowed).toBe(false);
    expect((d as { reason: string }).reason).toContain('to this address');
  });

  it('⚠️ applies to RECOVERY too — the per-address cap is about their own behaviour', () => {
    // Recovery is exempt from the GLOBAL ceiling and NOT from this one. A loop
    // hammering one address is the same problem whatever the action type.
    expect(authRateDecision('auth_recovery', AUTH_RATE_PER_ADDRESS_HOURLY, 0).allowed).toBe(false);
  });

  it('⚠️ THREE, not one or two — a real person retries a password reset', () => {
    // "Did that send?" → check spam → try again. Two attempts is ordinary human
    // behaviour and must not hit a cap meant to stop a machine. Ruled [Josh].
    expect(AUTH_RATE_PER_ADDRESS_HOURLY).toBeGreaterThanOrEqual(3);
    expect(authRateDecision('auth_recovery', 2, 0).allowed).toBe(true);
  });
});

describe('authRateDecision — the global ceiling', () => {
  it('refuses a signup confirmation at the platform-wide limit', () => {
    const d = authRateDecision('auth_signup_confirmation', 0, AUTH_RATE_GLOBAL_HOURLY);
    expect(d.allowed).toBe(false);
    expect((d as { reason: string }).reason).toContain('platform-wide');
  });

  it('⚠️ RECOVERY IS EXEMPT — a platform incident must not take away the way back in', () => {
    // The most important assertion in this file. A recovery email is somebody's
    // only route into their own account, and the global counter is a shared
    // resource they cannot influence or even see. Being refused because other
    // users are busy is not a trade this product makes. Ruled [Josh].
    expect(authRateDecision('auth_recovery', 0, AUTH_RATE_GLOBAL_HOURLY).allowed).toBe(true);
    expect(authRateDecision('auth_recovery', 0, AUTH_RATE_GLOBAL_HOURLY * 100).allowed).toBe(true);
  });

  it('⚠️ and the exemption is NARROW — no other auth type inherits it', () => {
    // Without this, "exempt recovery" could drift into "exempt auth mail" and
    // the global ceiling would protect nothing.
    for (const type of [
      'auth_signup_confirmation',
      'auth_magic_link',
      'auth_email_change',
      'auth_reauthentication',
      'auth_invite',
    ] as const) {
      expect(
        authRateDecision(type, 0, AUTH_RATE_GLOBAL_HOURLY).allowed,
        `${type} inherited the recovery exemption`
      ).toBe(false);
    }
  });

  it('⚠️ the per-address cap OUTRANKS the recovery exemption', () => {
    // Order matters: a recovery loop on one address must still be stopped, even
    // though recovery ignores the global ceiling.
    const d = authRateDecision('auth_recovery', AUTH_RATE_PER_ADDRESS_HOURLY, AUTH_RATE_GLOBAL_HOURLY);
    expect(d.allowed).toBe(false);
    expect((d as { reason: string }).reason).toContain('to this address');
  });
});

describe('the numbers themselves', () => {
  it('the global ceiling is meaningfully above the per-address cap', () => {
    // A global ceiling at or below the per-address cap would make the
    // per-address cap unreachable and the policy incoherent.
    expect(AUTH_RATE_GLOBAL_HOURLY).toBeGreaterThan(AUTH_RATE_PER_ADDRESS_HOURLY * 3);
  });

  it('⚠️ both are far above the 2/hour GoTrue limit they replace', () => {
    // Recorded so nobody reads these as a tightening. GoTrue capped the whole
    // project at 2/hour, which was a real obstacle to testing; this is a
    // blast-radius stop, not a throttle on normal use.
    expect(AUTH_RATE_PER_ADDRESS_HOURLY).toBeGreaterThan(2);
    expect(AUTH_RATE_GLOBAL_HOURLY).toBeGreaterThan(2);
  });
});
