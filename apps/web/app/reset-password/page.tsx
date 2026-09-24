import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase-server';
import { RECOVERY_MARKER_COOKIE, recoveryMarkerIsValid } from '@/lib/auth/recovery-marker';
import ResetPasswordForm from './reset-password-form';

// S110 E1 — the page asks the SERVER whether this session came from a recovery
// link (lib/auth/recovery-marker.ts). If it did, no current password is asked
// for; otherwise the form asks for it and the server action checks it. The
// action re-checks the marker itself — this only decides what the form shows.
export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let recovery = false;
  if (user) {
    const { data: claims } = await supabase.auth.getClaims();
    const sessionId = (claims?.claims.session_id as string | undefined) ?? null;
    const jar = await cookies();
    recovery = recoveryMarkerIsValid(jar.get(RECOVERY_MARKER_COOKIE)?.value, user.id, sessionId);
  }
  return <ResetPasswordForm recovery={recovery} />;
}
