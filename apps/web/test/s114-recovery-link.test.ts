import { describe, it, expect } from 'vitest';
import {
  authEmailLink,
  buildRecoveryConfirmUrl,
  type AuthEmailAction,
  type AuthEmailPayload,
} from '@/lib/services/auth-email';

// ============================================================================
// S114 C-1 [RULED Josh 2026-09-28] — the self-service reset link.
// ============================================================================
//
// Production's recovery email used GoTrue's `/auth/v1/verify`, whose
// `redirect_to` failed the allow list (`?next=*` does not match
// `?next=/reset-password`) and fell back to the site root, which never reads
// `?code=`. And PKCE meant a second device could not exchange the code anyway.
// The fix: the hook sends the SAME `/auth/confirm?token_hash=…&type=recovery`
// link the Team page's admin reset has used since S110 E1.
//
// ⚠️ This file proves the LINK. It does not prove the flow — that is the real
// email, clicked on a second device, on production, which only Josh can walk
// (FILL-C-1.3). C-1 stays "deployed, unproven" until he does.

const APP = 'https://frame-focus-eight.vercel.app';
const SUPA = 'https://ref.supabase.co';

function data(overrides: Partial<AuthEmailPayload['email_data']> = {}) {
  return {
    token: '12345678',
    token_hash: 'pkce_HASHED_TOKEN_VALUE',
    redirect_to: 'https://EZContractorBinder.com',
    email_action_type: 'recovery',
    site_url: 'https://EZContractorBinder.com',
    ...overrides,
  } as AuthEmailPayload['email_data'];
}

describe('S114 C-1 — buildRecoveryConfirmUrl', () => {
  it('points at this app’s /auth/confirm with token_hash and type=recovery', () => {
    const url = new URL(buildRecoveryConfirmUrl(APP, 'pkce_ABC'));
    expect(url.origin).toBe(APP);
    expect(url.pathname).toBe('/auth/confirm');
    expect(url.searchParams.get('token_hash')).toBe('pkce_ABC');
    expect(url.searchParams.get('type')).toBe('recovery');
  });

  it('tolerates a trailing slash on the app URL', () => {
    expect(buildRecoveryConfirmUrl(`${APP}/`, 'X')).toBe(
      `${APP}/auth/confirm?token_hash=X&type=recovery`
    );
  });
});

describe('S114 C-1 — authEmailLink: which link each auth email carries', () => {
  it('⚠️ a self-service RECOVERY email goes to /auth/confirm, never GoTrue’s verify', () => {
    const url = authEmailLink('recovery', data(), SUPA, { appUrl: APP });
    expect(url).toBe(`${APP}/auth/confirm?token_hash=pkce_HASHED_TOKEN_VALUE&type=recovery`);
    expect(url, 'recovery still routed through the allow list').not.toContain('/auth/v1/verify');
    expect(url, 'the typeable OTP leaked into the link').not.toContain('12345678');
  });

  it('an explicit actionUrl (the admin reset) wins over everything', () => {
    expect(authEmailLink('recovery', data(), SUPA, { actionUrl: 'X', appUrl: APP })).toBe('X');
  });

  it('with no appUrl configured, recovery falls back to GoTrue’s verify (and the handler logs it)', () => {
    expect(authEmailLink('recovery', data(), SUPA)).toContain(`${SUPA}/auth/v1/verify?`);
  });

  // TOTAL map (CLAUDE.md): every action states its link, so a new action fails
  // to compile until someone decides. Only recovery moved.
  const EXPECTED: Record<AuthEmailAction, 'confirm' | 'verify'> = {
    signup: 'verify',
    recovery: 'confirm',
    magiclink: 'verify',
    invite: 'verify',
    email_change: 'verify',
    email_change_current: 'verify',
    email_change_new: 'verify',
    reauthentication: 'verify',
  };
  it.each(Object.entries(EXPECTED) as [AuthEmailAction, 'confirm' | 'verify'][])(
    '%s → %s (appUrl set)',
    (action, want) => {
      const url = authEmailLink(action, data({ email_action_type: action }), SUPA, { appUrl: APP });
      if (want === 'confirm') {
        expect(url).toContain(`${APP}/auth/confirm?`);
        expect(url).not.toContain('/auth/v1/verify');
      } else {
        expect(url).toContain(`${SUPA}/auth/v1/verify?`);
        expect(url).not.toContain('/auth/confirm');
      }
    }
  );
});
