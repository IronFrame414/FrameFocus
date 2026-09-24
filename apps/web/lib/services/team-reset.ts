import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { handleAuthEmail } from '@/lib/services/auth-email';

/**
 * Send a password recovery email to a team member. Caller authorization must be
 * checked before calling.
 *
 * ⚠️ S110 E1 [RULED Josh, Q8 — "fix the team-page admin reset first"].
 * _Superseded, quoted rather than deleted:_ this called
 * `supabase.auth.resetPasswordForEmail(email, { redirectTo })` on the ADMIN's
 * cookie client. That is PKCE, so the code verifier landed in the ADMIN's
 * cookies and the employee's link could never be exchanged — and the link
 * skipped /auth/callback altogether. Unfiled until S110 Phase 1 (code reading).
 *
 * Now: `auth.admin.generateLink({ type: 'recovery' })` mints the token with NO
 * email and NO verifier; the email is sent through the SAME `handleAuthEmail`
 * the Send Email Hook uses (same template, sender, rate cap and `email_logs`
 * row), with the link pointed at this app's `/auth/confirm`, which verifies the
 * token server-side on any device.
 */
export async function resetTeamMemberPassword(
  admin: SupabaseClient<Database>,
  email: string,
  appUrl: string,
  supabaseUrl: string
): Promise<void> {
  const { data, error } = await admin.auth.admin.generateLink({ type: 'recovery', email });
  if (error || !data?.properties?.hashed_token || !data.user?.email) {
    throw error ?? new Error('generateLink returned no recovery token');
  }
  const actionUrl =
    `${appUrl.replace(/\/+$/, '')}/auth/confirm?` +
    new URLSearchParams({ token_hash: data.properties.hashed_token, type: 'recovery' }).toString();
  const outcome = await handleAuthEmail(
    admin,
    {
      user: { id: data.user.id, email: data.user.email, user_metadata: data.user.user_metadata },
      email_data: {
        token: data.properties.email_otp,
        token_hash: data.properties.hashed_token,
        redirect_to: '',
        email_action_type: 'recovery',
        site_url: appUrl,
      },
    },
    supabaseUrl,
    { actionUrl }
  );
  if (!outcome.sent) {
    throw new Error(`The reset email was not sent: ${outcome.error ?? outcome.diagnosis ?? 'unknown'}`);
  }
}
