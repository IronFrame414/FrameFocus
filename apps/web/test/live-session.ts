/**
 * Shared session helper for the live harnesses (`test/*.live.ts`).
 *
 * NOT itself a harness — the runner's include glob is `test/*.live.ts`, and this
 * filename deliberately does not match it.
 *
 * Sessions are minted with the PASSWORD grant from the persistent test
 * identities (STATE.md → Test Data, seeded by scripts/seed-test-identities.mjs),
 * falling back to a magic link via the service role. Password first for two
 * reasons: Supabase rate-limits OTP generation hard enough that a few harness
 * runs in a row start failing, and signing in the way a human would keeps the
 * documented credentials honest — if the password in STATE.md rots, these fail.
 *
 * The client returned is a real supabase-js client on the ANON key carrying a
 * real user JWT, so RLS applies exactly as it does in the app.
 */
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';

export const REQUIRED_PROJECT_REF = 'nmyphyhmfttxkdoposvf'; // framefocus-rebuild-test

/** Shared password for every seeded test identity. See STATE.md → Test Data. */
export const TEST_PASSWORD = 'FrameFocusTest!2026';

export const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
export const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
export const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/** Service-role client — fixtures, verification reads, and nothing else. */
export const admin = createSupabaseClient(URL_, SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** Refuse to touch anything but rebuild-test. Call this in every beforeAll. */
export function assertRebuildTest(): void {
  if (!URL_?.includes(REQUIRED_PROJECT_REF)) {
    throw new Error(`REFUSING TO RUN: linked project is not ${REQUIRED_PROJECT_REF}. URL=${URL_}`);
  }
}

export async function sessionFor(email: string): Promise<SupabaseClient> {
  const client = createSupabaseClient(URL_, ANON, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error: pwErr } = await client.auth.signInWithPassword({
    email,
    password: TEST_PASSWORD,
  });
  if (!pwErr) return client;

  // Fallback: identities that predate the seeded password (Josh's originals).
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (error) {
    throw new Error(`sessionFor(${email}): password failed (${pwErr.message}); link failed (${error.message})`);
  }
  const { error: vErr } = await client.auth.verifyOtp({
    token_hash: data.properties!.hashed_token,
    type: 'email',
  });
  if (vErr) {
    throw new Error(`sessionFor(${email}): password failed (${pwErr.message}); verifyOtp failed (${vErr.message})`);
  }
  return client;
}
