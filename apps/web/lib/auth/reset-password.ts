'use server';

import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase-server';
import { verifyCurrentPassword } from '@/lib/auth/verify-current-password';
import { PASSWORD_MIN_LENGTH, passwordTooShortMessage } from '@/lib/auth/password-policy';
import { RECOVERY_MARKER_COOKIE, recoveryMarkerIsValid } from '@/lib/auth/recovery-marker';
import { dashboardDeniedRedirect } from '@/lib/dashboard-access';

/**
 * S110 E1 [RULED Josh, Q8 → A] — `/reset-password`, on the SERVER.
 *
 * _Superseded, quoted rather than deleted — the page used to call
 * `supabase.auth.updateUser({ password })` from the browser and "checks nothing
 * about the session"_ (S109 Step 3, OPEN). Any live session could set a new
 * password without knowing the old one: an unlocked phone was enough.
 *
 * Now the password changes here, and only when EITHER:
 *   · the session carries a valid recovery marker (it was minted by a recovery
 *     link, this session, within 15 minutes — lib/auth/recovery-marker.ts); or
 *   · the caller proves the CURRENT password (the #162 check, shared).
 *
 * `current_password` is passed to GoTrue when we have it, so this also works if
 * Supabase's "require current password" setting is switched on (measured S110:
 * that setting refuses a password session without it and admits a recovery
 * session).
 */
export async function resetPasswordFromPage(input: {
  newPassword: string;
  confirmPassword: string;
  currentPassword?: string;
}): Promise<{ ok: true; next: string } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) {
    console.error('[resetPasswordFromPage] no authenticated user');
    return { ok: false, error: 'This reset link has expired or was already used. Request a new one.' };
  }

  if (input.newPassword.length < PASSWORD_MIN_LENGTH) return { ok: false, error: passwordTooShortMessage() };
  if (input.newPassword !== input.confirmPassword) return { ok: false, error: 'Passwords do not match.' };

  const { data: claims } = await supabase.auth.getClaims();
  const sessionId = (claims?.claims.session_id as string | undefined) ?? null;
  const jar = await cookies();
  const recovery = recoveryMarkerIsValid(jar.get(RECOVERY_MARKER_COOKIE)?.value, user.id, sessionId);

  let current: string | undefined;
  if (!recovery) {
    current = input.currentPassword ?? '';
    if (!current) return { ok: false, error: 'Enter your current password.' };
    if (!(await verifyCurrentPassword(user.email, current))) {
      return { ok: false, error: 'Your current password is incorrect.' };
    }
    if (current === input.newPassword) {
      return { ok: false, error: 'Choose a new password that is different from your current one.' };
    }
  }

  const { error } = await supabase.auth.updateUser(
    current ? { password: input.newPassword, current_password: current } : { password: input.newPassword }
  );
  if (error) {
    console.error('[resetPasswordFromPage] updateUser failed', { recovery, message: error.message });
    return { ok: false, error: error.message };
  }
  // One use: the marker is spent with the password it authorised.
  jar.delete(RECOVERY_MARKER_COOKIE);

  const { data: profile } = await supabase.from('profiles').select('role').eq('user_id', user.id).maybeSingle();
  return { ok: true, next: dashboardDeniedRedirect(profile?.role) ?? '/dashboard' };
}
