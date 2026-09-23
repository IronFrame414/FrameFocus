'use server';

import { createClient } from '@/lib/supabase-server';
import { verifyCurrentPassword } from '@/lib/auth/verify-current-password';
import { PASSWORD_MIN_LENGTH, passwordTooShortMessage } from '@/lib/auth/password-policy';

/**
 * S109 #162 — a signed-in user changes their own password, from the Account
 * page on either surface, with NO email involved.
 *
 * RULED [Josh, ASK-162.A]: the CURRENT password is required. A live session
 * alone is not enough — an unlocked phone left on a jobsite would otherwise let
 * anyone lock the real user out. The check is `verifyCurrentPassword`, the same
 * one ownership transfer uses.
 *
 * Every rule is enforced HERE, on the server, not only in the form: the length
 * floor, the confirmation, the re-verify. The form repeats the first two only
 * to answer faster.
 */
export async function changeMyPassword(input: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) {
    console.error('[changeMyPassword] no authenticated user with an email');
    return { ok: false, error: 'You are not signed in.' };
  }

  if (input.newPassword.length < PASSWORD_MIN_LENGTH) {
    return { ok: false, error: passwordTooShortMessage() };
  }
  if (input.newPassword !== input.confirmPassword) {
    return { ok: false, error: 'The new passwords do not match.' };
  }
  if (input.newPassword === input.currentPassword) {
    return { ok: false, error: 'Choose a new password that is different from your current one.' };
  }

  if (!(await verifyCurrentPassword(user.email, input.currentPassword))) {
    return { ok: false, error: 'Your current password is incorrect.' };
  }

  const { error } = await supabase.auth.updateUser({ password: input.newPassword });
  if (error) {
    console.error('[changeMyPassword] updateUser failed:', error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
