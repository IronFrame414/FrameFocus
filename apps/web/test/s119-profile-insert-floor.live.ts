/**
 * S119 ITEM A-1 — a profile-less login can no longer make itself an Admin.
 *
 * Finding: S118 item 9 (`docs/sessions/S118-report.md`). Migration:
 * `20262075000000_s119_profile_insert_floor.sql`.
 *
 * `profiles_insert_authenticated` was `WITH CHECK (true)`. A signed-in user with
 * NO `profiles` row could insert `{user_id: self, company_id: <any>, role:
 * 'admin'}`, and the AFTER INSERT trigger `profiles_create_member` then gave it
 * the `company_members` row: Admin of a company it was never invited to.
 * `UNIQUE(user_id)` stops every user who has a profile; that is the control
 * below. `profiles_one_owner_per_company` stops `owner` only where the company
 * already has one.
 *
 * The fix drops the INSERT policies on `profiles` AND `companies`. Every real
 * profile and company is created by `handle_new_user()` — SECURITY DEFINER,
 * owned by `postgres` (rolbypassrls) — which never evaluates either policy.
 * Group S proves both onboarding paths through that function still work.
 *
 * ⚠️ EVERY WRITE PROBE HERE IS WRITTEN WITHOUT `.select()` and counted through
 * the service role [S181c]. `.insert().select()` measures the READ policy.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  admin,
  ANON,
  assertRebuildTest,
  purgeCompaniesNamed,
  sessionFor,
  TEST_PASSWORD,
  URL_,
} from './live-session';

const MARKER = 'S119A';
const CREW = 'josh+crew@worthprop.com';
const stamp = Date.now();
const EMAIL_LOOSE = `s119a-loose-${stamp}@example.invalid`;
const EMAIL_OWNER = `s119a-owner-${stamp}@example.invalid`;
const EMAIL_INVITEE = `s119a-invitee-${stamp}@example.invalid`;
const FIXTURE_EMAIL = 'fixture-office@qa-noreply.ezcontractorbinder.com';

let targetCompanyId = '';
let looseUserId = '';
let loose: SupabaseClient;
const createdUsers: string[] = [];
const invitationIds: string[] = [];

async function signIn(email: string): Promise<SupabaseClient> {
  const c = createSupabaseClient(URL_, ANON, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await c.auth.signInWithPassword({ email, password: TEST_PASSWORD });
  if (error) throw new Error(`sign-in ${email}: ${error.message}`);
  return c;
}

async function profilesOf(userId: string) {
  const { data, error } = await admin
    .from('profiles')
    .select('id, company_id, role')
    .eq('user_id', userId);
  if (error) throw new Error(`profiles: ${error.message}`);
  return (data ?? []) as Array<{ id: string; company_id: string; role: string }>;
}

async function membersOfTargetCreatedBy(userId: string): Promise<number> {
  const { count, error } = await admin
    .from('company_members')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', targetCompanyId)
    .eq('created_by', userId);
  if (error) throw new Error(`company_members: ${error.message}`);
  return count ?? -1;
}

beforeAll(async () => {
  assertRebuildTest();
  await purgeCompaniesNamed(admin, [MARKER]);

  // The company a profile-less login will try to join. Made by the service
  // role so no fixture tenant is touched.
  const { data: t, error: tErr } = await admin
    .from('companies')
    .insert({ name: `${MARKER} target ${stamp}`, slug: `s119a-target-${stamp}`, email: FIXTURE_EMAIL })
    .select('id')
    .single();
  if (tErr) throw new Error(`target: ${tErr.message}`);
  targetCompanyId = (t as { id: string }).id;

  // A login with NO profile — the state `deletion.ts` could manufacture. The
  // signup trigger provisions one; it is removed (member row first: FK).
  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email: EMAIL_LOOSE,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { company_name: `${MARKER} loose ${stamp}`, first_name: 'S119', last_name: 'Loose' },
  });
  if (cErr) throw new Error(`createUser: ${cErr.message}`);
  looseUserId = created.user!.id;
  createdUsers.push(looseUserId);
  const [prof] = await profilesOf(looseUserId);
  const m = await admin.from('company_members').delete().eq('profile_id', prof.id).select('id');
  if (m.error) throw new Error(`member delete: ${m.error.message}`);
  const p = await admin.from('profiles').delete().eq('user_id', looseUserId).select('id');
  if (p.error) throw new Error(`profile delete: ${p.error.message}`);
  expect(p.data, 'the fixture profile was not removed').toHaveLength(1);

  loose = await signIn(EMAIL_LOOSE);
}, 240_000);

afterAll(async () => {
  for (const id of invitationIds) await admin.from('invitations').delete().eq('id', id);
  for (const id of createdUsers) {
    const { data: ps } = await admin.from('profiles').select('id').eq('user_id', id);
    for (const row of (ps ?? []) as Array<{ id: string }>) {
      await admin.from('company_members').delete().eq('profile_id', row.id);
      await admin.from('profiles').delete().eq('id', row.id);
    }
  }
  await purgeCompaniesNamed(admin, [MARKER]);
  for (const e of [EMAIL_LOOSE, EMAIL_OWNER, EMAIL_INVITEE]) {
    await admin.from('trial_emails').delete().eq('email', e.toLowerCase());
  }
  for (const id of createdUsers) await admin.auth.admin.deleteUser(id).catch(() => undefined);
  const { data } = await admin.from('companies').select('id').ilike('name', `${MARKER}%`);
  expect(data ?? [], 'S119A companies survived teardown').toHaveLength(0);
}, 240_000);

describe('A-1 — a profile-less login cannot write itself into any company', () => {
  // Each probe starts from the profile-less state. Without this, a row one probe
  // manages to write makes the login affiliated, and every later probe measures
  // a different caller (found on the first pre-fix run).
  afterEach(async () => {
    for (const row of await profilesOf(looseUserId)) {
      await admin.from('company_members').delete().eq('profile_id', row.id);
      await admin.from('profiles').delete().eq('id', row.id);
    }
    expect(await profilesOf(looseUserId), 'the loose login could not be reset').toHaveLength(0);
  });

  it('precondition: the loose login is signed in and resolves to NO company', async () => {
    // Without this, every zero below could be "the session is dead".
    const { data: u } = await loose.auth.getUser();
    expect(u.user?.id).toBe(looseUserId);
    const { data: cid } = await loose.rpc('get_my_company_id');
    expect(cid, 'the loose login still has a company — the probes measure nothing').toBeNull();
    expect(await profilesOf(looseUserId)).toHaveLength(0);
  });

  it('it cannot insert an ADMIN profile into another company (0 rows, 0 member rows)', async () => {
    const { error } = await loose.from('profiles').insert({
      user_id: looseUserId,
      company_id: targetCompanyId,
      role: 'admin',
      email: EMAIL_LOOSE,
      first_name: 'S119',
      last_name: 'Loose',
    });
    const rows = await profilesOf(looseUserId);
    const members = await membersOfTargetCreatedBy(looseUserId);
    console.log(`[S119 A-1] admin insert: error ${error?.code ?? 'none'}; profiles ${rows.length}; target members ${members}`);
    expect(rows, 'A PROFILE-LESS LOGIN MADE ITSELF AN ADMIN').toHaveLength(0);
    expect(members, 'the member trigger fired for a self-made profile').toBe(0);
  });

  it('it cannot insert an OWNER profile into a company with no owner either', async () => {
    const { error } = await loose.from('profiles').insert({
      user_id: looseUserId,
      company_id: targetCompanyId,
      role: 'owner',
      email: EMAIL_LOOSE,
      first_name: 'S119',
      last_name: 'Loose',
    });
    const rows = await profilesOf(looseUserId);
    console.log(`[S119 A-1] owner insert: error ${error?.code ?? 'none'}; profiles ${rows.length}`);
    expect(rows, 'a profile-less login made itself an Owner').toHaveLength(0);
  });

  it('it cannot insert a company row (companies_insert_unaffiliated is gone)', async () => {
    const name = `${MARKER} loose-made ${Date.now()}`;
    const { error } = await loose
      .from('companies')
      .insert({ name, slug: `s119a-loose-made-${Date.now()}`, email: FIXTURE_EMAIL });
    const { data: landed } = await admin.from('companies').select('id').eq('name', name);
    console.log(`[S119 A-1] company insert: error ${error?.code ?? 'none'}; rows ${(landed ?? []).length}`);
    expect(landed, 'a profile-less login created a company').toHaveLength(0);
  });

  it('control: a user WITH a profile is refused too (0 rows either way)', async () => {
    // Before the fix this was refused by UNIQUE(user_id) (23505) — the reason
    // only profile-less logins were exposed. After it, RLS refuses first.
    const crew = await sessionFor(CREW);
    const { data: u } = await crew.auth.getUser();
    const crewUserId = u.user!.id;
    const before = await profilesOf(crewUserId);
    expect(before, 'the crew fixture has no profile — the control proves nothing').toHaveLength(1);
    const { error } = await crew.from('profiles').insert({
      user_id: crewUserId,
      company_id: targetCompanyId,
      role: 'admin',
      email: CREW,
      // Names on purpose: without them NOT NULL (23502) refuses first and the
      // control passes without reaching the key or the policy (first run).
      first_name: 'S119',
      last_name: 'Control',
    });
    const after = await profilesOf(crewUserId);
    console.log(`[S119 A-1] control (has a profile): error ${error?.code ?? 'none'}; profiles ${after.length}`);
    expect(error, 'the insert reported success').not.toBeNull();
    expect(after).toEqual(before);
    expect(await membersOfTargetCreatedBy(crewUserId)).toBe(0);
  });
});

describe('S — both onboarding paths go through handle_new_user and still work', () => {
  it('an OWNER signup provisions company, owner profile, member row and a trial — and signs in', async () => {
    const companyName = `${MARKER} owner-co ${stamp}`;
    const { data: created, error } = await admin.auth.admin.createUser({
      email: EMAIL_OWNER,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: { first_name: 'S119', last_name: 'Owner', company_name: companyName },
    });
    expect(error, `a genuine owner signup was refused: ${error?.message ?? ''}`).toBeNull();
    const userId = created.user!.id;
    createdUsers.push(userId);

    const [prof] = await profilesOf(userId);
    expect(prof?.role).toBe('owner');
    const { data: co } = await admin.from('companies').select('id, name').eq('id', prof.company_id).single();
    expect((co as { name: string }).name).toBe(companyName);
    const { count: members } = await admin
      .from('company_members')
      .select('id', { count: 'exact', head: true })
      .eq('profile_id', prof.id);
    expect(members).toBe(1);
    const { data: sub } = await admin
      .from('subscriptions')
      .select('status')
      .eq('company_id', prof.company_id)
      .single();
    expect((sub as { status: string }).status).toBe('trialing');

    const s = await signIn(EMAIL_OWNER);
    const { data: role } = await s.rpc('get_my_role');
    const { data: cid } = await s.rpc('get_my_company_id');
    expect(role).toBe('owner');
    expect(cid).toBe(prof.company_id);
  });

  it('an INVITED signup joins the inviting company with the invited role — and signs in', async () => {
    const { data: inviter } = await admin
      .from('profiles')
      .select('user_id')
      .eq('email', 'josh+test50@worthprop.com')
      .single();
    const inviterId = (inviter as { user_id: string }).user_id;
    const token = randomUUID();
    const { data: inv, error: iErr } = await admin
      .from('invitations')
      .insert({
        company_id: targetCompanyId,
        email: EMAIL_INVITEE,
        role: 'crew_member',
        invited_by: inviterId,
        created_by: inviterId,
        token,
      })
      .select('id')
      .single();
    if (iErr) throw new Error(`invitation: ${iErr.message}`);
    invitationIds.push((inv as { id: string }).id);

    const { data: created, error } = await admin.auth.admin.createUser({
      email: EMAIL_INVITEE,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: { first_name: 'S119', last_name: 'Invitee', invitation_token: token },
    });
    expect(error, `an invited signup was refused: ${error?.message ?? ''}`).toBeNull();
    const userId = created.user!.id;
    createdUsers.push(userId);

    const [prof] = await profilesOf(userId);
    expect(prof?.company_id).toBe(targetCompanyId);
    expect(prof?.role).toBe('crew_member');
    const { count: members } = await admin
      .from('company_members')
      .select('id', { count: 'exact', head: true })
      .eq('profile_id', prof.id);
    expect(members).toBe(1);
    const { data: invRow } = await admin
      .from('invitations')
      .select('status')
      .eq('id', (inv as { id: string }).id)
      .single();
    expect((invRow as { status: string }).status).toBe('accepted');

    const s = await signIn(EMAIL_INVITEE);
    const { data: cid } = await s.rpc('get_my_company_id');
    expect(cid).toBe(targetCompanyId);
  });
});
