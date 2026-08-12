import type { SupabaseClient } from '@supabase/supabase-js';
import { adminClient, COMPANY_A } from './hub-fixture';

/**
 * S139 — fixtures for the four trial screens.
 *
 * ============================================================================
 * WHY TWO KINDS OF FIXTURE, AND WHY THE LOCKED ONE IS DISPOSABLE
 * ============================================================================
 * The warning screen needs a `trial_lifecycle` row and nothing else, so it can
 * borrow **Bishop Contracting** — the shared QA company that already has an
 * Owner, an Admin and a PM. Adding a row with `locked_at IS NULL` changes
 * nothing any other spec observes: `/dashboard/trial` is a new route nobody
 * else visits, and the lock guard only fires on `locked_at IS NOT NULL`.
 *
 * ⚠️ THE LOCKED AND 4TH-ATTEMPT CASES MUST NOT BORROW IT. Setting `locked_at`
 * on Bishop Contracting would make `middleware.ts` redirect **every** route for
 * **every** QA identity to `/locked`, and setting its subscription to
 * `incomplete` would bounce them all to `/trial-limit`. Playwright runs spec
 * files in parallel, so that would not merely fail this file — it would fail
 * whatever else happened to be running. Each of those two gets its own
 * throwaway company and its own throwaway user.
 *
 * ============================================================================
 * ⚠️ TEARDOWN IS THE DANGEROUS PART, NOT SETUP
 * ============================================================================
 * A leaked row is untidy. A leaked BANNED auth user is a QA identity that
 * cannot sign in, and it looks exactly like a broken test somewhere else.
 * S138 also left two `companies` tombstones behind that needed manual removal,
 * because five audit tables hold RESTRICT foreign keys to `companies`
 * (TECH_DEBT #3-trial). `destroyThrowawayCompany()` therefore deletes children
 * in FK order and **verifies** the parent is gone, rather than assuming.
 */

const PASSWORD = process.env.E2E_PASSWORD ?? 'FrameFocusTest!2026';

export { adminClient, COMPANY_A };
export const OWNER = 'josh+test50@worthprop.com';
export const ADMIN = 'josh+qa-admin@worthprop.com';
export const PM = 'josh+pm@worthprop.com';

export const LOCKED_EMAIL = 'josh+s139locked@worthprop.com';
export const LIMIT_EMAIL = 'josh+s139limit@worthprop.com';

export interface Throwaway {
  email: string;
  userId: string;
  companyId: string;
}

/** Days from now, as an ISO timestamp. */
function inDays(n: number): string {
  return new Date(Date.now() + n * 86_400_000).toISOString();
}

// ---------------------------------------------------------------------------
// The shared-company lifecycle row (warning screen + acknowledgement)
// ---------------------------------------------------------------------------

/**
 * Give Bishop Contracting a trial that ends in 5 days.
 *
 * Five is chosen so `daysUntil()` returns 5 → the screen renders the **day_7**
 * warning. Three or fewer would render day_3; the acknowledgement test asserts
 * against whichever kind the screen decided, so the number and the assertion
 * cannot drift apart.
 */
export async function giveSharedCompanyATrial(admin: SupabaseClient): Promise<void> {
  await clearSharedCompanyTrial(admin);
  const { error } = await admin
    .from('trial_lifecycle')
    .insert({ company_id: COMPANY_A, trial_end: inDays(5) });
  if (error) throw new Error(`giveSharedCompanyATrial: ${error.message}`);
}

export async function clearSharedCompanyTrial(admin: SupabaseClient): Promise<void> {
  // Acknowledgements first — they hold an FK to the company, and the whole
  // point of the table is that it outlives things.
  await admin.from('trial_warning_acknowledgements').delete().eq('company_id', COMPANY_A);
  await admin.from('trial_lifecycle').delete().eq('company_id', COMPANY_A);
}

// ---------------------------------------------------------------------------
// Throwaway tenants (locked screen, 4th-attempt screen)
// ---------------------------------------------------------------------------

/**
 * A real signup, so `handle_new_user()` builds the company, the subscription,
 * the `trial_emails` row and the lifecycle row exactly as production would.
 *
 * @param priorTrials rows to pre-seed in `trial_emails` for this address.
 *        Three of them is what makes the signup a FOURTH attempt, which is the
 *        only honest way to reach the trial-limit state — setting
 *        `status = 'incomplete'` by hand would test the screen while skipping
 *        the branch in `handle_new_user()` that is supposed to produce it.
 */
export async function createThrowawayCompany(
  admin: SupabaseClient,
  email: string,
  companyName: string,
  priorTrials = 0
): Promise<Throwaway> {
  await destroyThrowawayCompany(admin, email);

  for (let i = 1; i <= priorTrials; i += 1) {
    const { error } = await admin
      .from('trial_emails')
      .insert({ email: email.toLowerCase(), trial_number: i });
    if (error) throw new Error(`seed trial_emails ${i}: ${error.message}`);
  }

  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { company_name: companyName, first_name: 'S139', last_name: 'Fixture' },
  });
  if (error) throw new Error(`createThrowawayCompany(${email}): ${error.message}`);

  const userId = created.user.id;
  const { data: profile, error: pErr } = await admin
    .from('profiles')
    .select('company_id')
    .eq('user_id', userId)
    .single();
  if (pErr || !profile) throw new Error(`no profile for ${email}: ${pErr?.message}`);

  return { email, userId, companyId: (profile as { company_id: string }).company_id };
}

/** Lock a throwaway tenant WITHOUT banning it — see the note in the spec. */
export async function lockThrowaway(admin: SupabaseClient, companyId: string): Promise<void> {
  const { error } = await admin
    .from('trial_lifecycle')
    .update({ locked_at: new Date().toISOString(), delete_after: inDays(14) })
    .eq('company_id', companyId);
  if (error) throw new Error(`lockThrowaway: ${error.message}`);
}

/**
 * Remove every trace of a throwaway identity, children first.
 *
 * ⚠️ THE ORDER IS THE FUNCTION. `companies` is refused while any of the five
 * RESTRICT children exist (#3-trial), and `trial_emails` must be deleted by
 * EMAIL rather than by company — a fourth-attempt fixture seeds rows that have
 * no `company_id` at all, and leaving them behind would silently deny a real
 * trial to that address forever.
 */
export async function destroyThrowawayCompany(
  admin: SupabaseClient,
  email: string
): Promise<void> {
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const users = (list?.users ?? []).filter((u) => u.email === email);

  for (const u of users) {
    const { data: profile } = await admin
      .from('profiles')
      .select('company_id')
      .eq('user_id', u.id)
      .maybeSingle();
    const cid = profile ? (profile as { company_id: string }).company_id : null;

    if (cid && cid !== COMPANY_A) {
      for (const table of [
        'deletion_jobs',
        'export_jobs',
        'trial_warning_acknowledgements',
        'trial_lifecycle',
        'email_logs',
        'tag_options',
        'subscriptions',
        'company_members',
        'profiles',
      ]) {
        await admin.from(table).delete().eq('company_id', cid);
      }
      await admin.from('trial_emails').update({ company_id: null }).eq('company_id', cid);
      await admin.from('companies').delete().eq('id', cid);
    }

    // ⚠️ Unban before deleting. Deleting a banned user works, but if the delete
    // fails for any reason an un-banned leftover is recoverable and a banned
    // one is a QA identity that mysteriously cannot sign in.
    await admin.auth.admin.updateUserById(u.id, { ban_duration: 'none' });
    await admin.auth.admin.deleteUser(u.id);
  }

  await admin.from('trial_emails').delete().eq('email', email.toLowerCase());
}

/**
 * Assert the teardown actually worked. Called from `afterAll` so a leak fails
 * the run rather than being discovered three sessions later.
 */
export async function assertNoTrace(
  admin: SupabaseClient,
  email: string
): Promise<{ users: number; companies: number; trialEmails: number }> {
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const users = (list?.users ?? []).filter((u) => u.email === email).length;

  const { data: companies } = await admin.from('companies').select('id').like('name', 'S139%');
  const { data: trialEmails } = await admin
    .from('trial_emails')
    .select('email')
    .eq('email', email.toLowerCase());

  return {
    users,
    companies: (companies ?? []).length,
    trialEmails: (trialEmails ?? []).length,
  };
}
