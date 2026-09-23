import 'server-only';
import { createClient as createPlainClient } from '@supabase/supabase-js';

/**
 * Re-verify a signed-in user's CURRENT password — the one check shared by every
 * action that must not run on possession of a live session alone.
 *
 * Extracted from `transferOwnership` (app/dashboard/team/[id]/actions.ts) at
 * S109 #162 [RULED Josh: "Reuse the transfer-ownership check"], so the
 * self-service password change and ownership transfer ask the same question the
 * same way (CLAUDE.md → PARITY — a second copy that "does the same thing" is
 * the divergence).
 *
 * WHY A SEPARATE PLAIN CLIENT. Supabase has no "verify password" endpoint; the
 * only check is a password sign-in. Doing it on the caller's cookie client
 * would REPLACE their session. A plain anon-key client with no persistence
 * signs in off to the side and leaves the caller's cookies untouched.
 *
 * ⚠️ THE THROWAWAY SESSION IS REVOKED WITH `scope: 'local'`. The sign-in mints
 * a real session with a refresh token; left alone, every check leaves one
 * orphaned (S109 Phase 1 flagged this for transfer-ownership). supabase-js's
 * `signOut()` DEFAULTS TO `scope: 'global'`, which would sign the user out of
 * EVERY device, including the one they are using — so the scope is explicit
 * and must stay so.
 */
export async function verifyCurrentPassword(email: string, password: string): Promise<boolean> {
  const plain = createPlainClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
  );
  const { error } = await plain.auth.signInWithPassword({ email, password });
  if (error) return false;
  await plain.auth.signOut({ scope: 'local' });
  return true;
}
