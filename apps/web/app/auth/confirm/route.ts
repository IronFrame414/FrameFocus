import { createClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import {
  RECOVERY_MARKER_COOKIE,
  makeRecoveryMarker,
  recoveryMarkerCookieOptions,
  sessionIdOf,
} from '@/lib/auth/recovery-marker';

// S110 E1 [RULED Josh, Q8 — "fix the team-page admin reset first"] — THE
// ADMIN-INITIATED RECOVERY LINK LANDS HERE.
//
// ⚠️ WHY THE OLD ADMIN RESET COULD NOT WORK. It called `resetPasswordForEmail()`
// on the ADMIN's server client. That is PKCE: the code verifier was stored in
// the ADMIN's cookies, and the link pointed straight at /reset-password,
// skipping /auth/callback. The employee opened `?code=…` in their own browser
// with no verifier, so no session was ever created.
//
// THE FIX. The reset mints a token with `auth.admin.generateLink()` (no email
// sent, no verifier) and the email points HERE with its `token_hash`. This
// route verifies it SERVER-SIDE with `verifyOtp` — on ANY device, because it
// needs no verifier. Measured on rebuild-test [S110]: verifyOtp on a
// generateLink token_hash yields a session that can set a password, with or
// without either of Supabase's password-change safeguards switched on.
//
// Recovery ONLY. Every other OTP type keeps GoTrue's own /auth/v1/verify.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type');

  if (tokenHash && type === 'recovery') {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({ type: 'recovery', token_hash: tokenHash });
    if (!error && data.session) {
      const res = NextResponse.redirect(`${origin}/reset-password`);
      const sid = sessionIdOf(data.session.access_token);
      if (sid) {
        res.cookies.set(
          RECOVERY_MARKER_COOKIE,
          makeRecoveryMarker(data.session.user.id, sid),
          recoveryMarkerCookieOptions
        );
      }
      return res;
    }
    console.error('[GET /auth/confirm] verifyOtp failed', { message: error?.message ?? 'no session' });
  } else {
    console.error('[GET /auth/confirm] refused', { reason: 'missing token_hash or type is not recovery', type });
  }
  return NextResponse.redirect(`${origin}/sign-in?error=auth`);
}
