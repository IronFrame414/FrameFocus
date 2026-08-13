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
import { deleteCompanies, purgeCompaniesNamed } from '../test-support/company-purge';

export { deleteCompanies, purgeCompaniesNamed };

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

/**
 * Repoint the profile the `auth.users` trigger just created, and remove the
 * tenant it came with.
 *
 * ⚠️ WHY THIS EXISTS AS OF S135. `20260914000000` brought the `on_auth_user_created`
 * trigger into version control. It had ALWAYS existed on production and had
 * NEVER existed on rebuild-test, which is why harnesses here could call
 * `admin.auth.admin.createUser()` and then INSERT a profile by hand. They can
 * no longer: the trigger inserts one first, and `profiles_user_id_key` refuses
 * the second. The direct INSERT was never a design — it was standing in for a
 * divergence between the two databases.
 *
 * A tokenless `createUser` takes the OWNER path, so it leaves a company, a
 * subscription, a `trial_emails` row and a seeded tag set behind. This adopts
 * the profile into the company the caller actually wanted and deletes the rest,
 * `trial_emails` included — leaving that row would silently deny a real trial
 * to the same address later.
 *
 * Harnesses that want to exercise the INVITED path should not use this; they
 * should pass `invitation_token` in `user_metadata` against a live invitation,
 * as `s133-subcontractor-read-floor.live.ts` does.
 */
export async function adoptSignupProfile(
  userId: string,
  fields: {
    companyId: string;
    email: string;
    role: string;
    firstName?: string;
    lastName?: string;
  }
): Promise<{ profileId: string; memberId: string | null }> {
  const { data: auto, error } = await admin
    .from('profiles')
    .select('id, company_id')
    .eq('user_id', userId)
    .single();
  if (error || !auto) {
    throw new Error(
      `adoptSignupProfile: no profile for ${userId} — is the auth.users trigger installed? (${error?.message})`
    );
  }
  const profileId = (auto as { id: string }).id;
  const spuriousCompanyId = (auto as { company_id: string }).company_id;

  const { error: upErr } = await admin
    .from('profiles')
    .update({
      company_id: fields.companyId,
      role: fields.role,
      first_name: fields.firstName ?? '',
      last_name: fields.lastName ?? '',
    })
    .eq('id', profileId);
  if (upErr) throw new Error(`adoptSignupProfile: ${upErr.message}`);

  // `profiles_create_member` made the member row in the spurious company.
  const { data: member } = await admin
    .from('company_members')
    .select('id')
    .eq('profile_id', profileId)
    .maybeSingle();
  const memberId = member ? (member as { id: string }).id : null;
  if (memberId) {
    await admin.from('company_members').update({ company_id: fields.companyId }).eq('id', memberId);
  }

  // ⚠️ #2-s147 — THIS BLOCK LEAKED A COMPANY EVERY TIME IT RAN.
  //
  // It used to delete `tag_options`, `subscriptions`, `companies` — and read no
  // error from any of them. Since 7F's seed trigger (`20260922000000`) the
  // parent delete cannot succeed: 8 `lien_release_templates` pin it and the FK
  // is NO ACTION. The spurious company therefore survived, silently, on every
  // adopted signup.
  //
  // Measured: 2 orphans per run of `s97ct-7e-clicktest.live.ts`, this helper's
  // only caller. `deleteCompanies()` deletes the full child list and THROWS if
  // the parent still stands.
  if (spuriousCompanyId !== fields.companyId) {
    await deleteCompanies(admin, [spuriousCompanyId]);
  }
  await admin.from('trial_emails').delete().eq('email', fields.email.toLowerCase());

  return { profileId, memberId };
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
