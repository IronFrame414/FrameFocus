import { createClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import {
  RECOVERY_MARKER_COOKIE,
  makeRecoveryMarker,
  recoveryMarkerCookieOptions,
  sessionIdOf,
} from '@/lib/auth/recovery-marker';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const res = NextResponse.redirect(`${origin}${next}`);
      // [S110 E1] A self-service reset: the code exchange SAYS it was a recovery
      // link (it used to be discarded here). Mark this session so /reset-password
      // may set a password without the current one — and only this session.
      // `redirectType` IS returned at runtime (auth-js 2.100.1,
      // GoTrueClient.js:1475 — split off the stored `<verifier>/PASSWORD_RECOVERY`)
      // but is missing from the public `AuthTokenResponse` type, hence the read.
      const redirectType = (data as { redirectType?: string | null }).redirectType ?? null;
      if (redirectType === 'PASSWORD_RECOVERY' && data.session) {
        const sid = sessionIdOf(data.session.access_token);
        if (sid) {
          res.cookies.set(
            RECOVERY_MARKER_COOKIE,
            makeRecoveryMarker(data.session.user.id, sid),
            recoveryMarkerCookieOptions
          );
        }
      }
      return res;
    }
    console.error('[GET /auth/callback] exchangeCodeForSession failed', { message: error.message });
  }
  return NextResponse.redirect(`${origin}/sign-in?error=auth`);
}
