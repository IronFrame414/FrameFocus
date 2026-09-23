import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  admin,
  assertRebuildTest,
  deleteCompanies,
  purgeCompaniesNamed,
  TEST_PASSWORD,
} from './live-session';

// S109 #160 — a profile and its member row agree on whether the person is
// deleted, BY CONSTRUCTION (trigger `profiles_sync_member_deleted`,
// 20261710000000).
//
// ⚠️ EVERY DELETE HERE IS DONE "THE WRONG WAY" — a bare service-role UPDATE of
// `profiles.is_deleted`, never `softDeleteTeamMember()`. That is the point of
// the ruling: no delete path can forget, because none of them is doing the
// work. A test that went through the service function would pass just as well
// if someone "fixed" #160 by adding a second .update() there.
//
// Cases, each tied to a measured S109 Phase 1 constraint:
//   D  delete the profile           → member row follows (the #160 defect)
//   R  restore the profile          → member row follows back, deleted_at cleared
//   S  a profile save that does NOT change is_deleted leaves the member row
//      alone — /m/team writes both in one submit; its Inactive toggle must
//      not be undone (rule 2)
//   X  a SUBCONTRACTOR member row linked to the profile is NOT touched
//      (ASK-160.C; production has 7 such rows)
//
// Everything is its own: two throwaway signups, each with the company
// `handle_new_user()` builds for it, removed in afterAll.

const MARK = 'S109 MemberSync';
const STAMP = Date.now();
const STAFF_EMAIL = `s109-member-sync-staff+${STAMP}@example.com`;
const SUB_EMAIL = `s109-member-sync-sub+${STAMP}@example.com`;

interface Person {
  userId: string;
  profileId: string;
  companyId: string;
  memberId: string;
}

const people: Person[] = [];
let staff: Person;
let subLinked: Person;

async function signup(email: string, label: string): Promise<Person> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { company_name: `${MARK} ${label}`, first_name: 'Sync', last_name: label },
  });
  if (error) throw new Error(`createUser ${label}: ${error.message}`);
  const userId = data.user.id;

  const { data: prof, error: pErr } = await admin
    .from('profiles')
    .select('id, company_id')
    .eq('user_id', userId)
    .single();
  if (pErr) throw new Error(`profile ${label}: ${pErr.message}`);

  // Scoped to THIS profile (unique index on profile_id) — exactly one row.
  const { data: mem, error: mErr } = await admin
    .from('company_members')
    .select('id')
    .eq('profile_id', prof.id)
    .single();
  if (mErr) throw new Error(`member ${label}: ${mErr.message}`);

  const p = { userId, profileId: prof.id, companyId: prof.company_id as string, memberId: mem.id };
  people.push(p);
  return p;
}

async function member(id: string) {
  const { data, error } = await admin
    .from('company_members')
    .select('is_deleted, deleted_at, member_type')
    .eq('id', id)
    .single();
  if (error) throw new Error(`read member: ${error.message}`);
  return data;
}

async function setProfile(profileId: string, patch: Record<string, unknown>) {
  const { error } = await admin.from('profiles').update(patch).eq('id', profileId);
  if (error) throw new Error(`profile update: ${error.message}`);
}

beforeAll(async () => {
  assertRebuildTest();
  await purgeCompaniesNamed(admin, [MARK]);
  staff = await signup(STAFF_EMAIL, 'Staff');
  subLinked = await signup(SUB_EMAIL, 'SubLinked');
  // Make the second person's member row a profile-LINKED subcontractor row —
  // the shape handle_new_user() produces for an invited sub user.
  const { error } = await admin
    .from('company_members')
    .update({ member_type: 'subcontractor' })
    .eq('id', subLinked.memberId);
  if (error) throw new Error(`make sub-linked: ${error.message}`);
});

afterAll(async () => {
  await deleteCompanies(admin, people.map((p) => p.companyId));
  for (const p of people) {
    await admin.from('profiles').delete().eq('id', p.profileId);
    await admin.from('trial_emails').delete().in('email', [STAFF_EMAIL, SUB_EMAIL]);
    await admin.auth.admin.deleteUser(p.userId);
  }
});

describe('S109 #160 — profiles.is_deleted propagates to company_members', () => {
  it('fixture: two people, each with exactly one live member row', async () => {
    expect(people.length).toBe(2);
    expect((await member(staff.memberId)).is_deleted).toBe(false);
    expect((await member(subLinked.memberId)).member_type).toBe('subcontractor');
  });

  it('D — deleting the profile (bare UPDATE, no service function) deletes the member row', async () => {
    const at = new Date().toISOString();
    await setProfile(staff.profileId, { is_deleted: true, deleted_at: at });
    const m = await member(staff.memberId);
    expect(m.is_deleted, 'GHOST: the member row stayed live after the profile was deleted').toBe(true);
    expect(new Date(m.deleted_at as string).getTime()).toBe(new Date(at).getTime());
  });

  it('R — restoring the profile restores the member row and clears deleted_at', async () => {
    await setProfile(staff.profileId, { is_deleted: false, deleted_at: null });
    const m = await member(staff.memberId);
    expect(m.is_deleted, 'restored person is still unassignable').toBe(false);
    expect(m.deleted_at).toBeNull();
  });

  it('S — a profile save that does not change is_deleted leaves a member-only deactivation alone', async () => {
    // The /m/team Inactive toggle: member row off, profile untouched.
    await admin.from('company_members').update({ is_deleted: true }).eq('id', staff.memberId);
    // …then the same form's profile write, with no change to deletion.
    await setProfile(staff.profileId, { first_name: 'Renamed' });
    expect((await member(staff.memberId)).is_deleted, 'a profile save undid the deactivation').toBe(true);
    // Put it back for any later case.
    await admin.from('company_members').update({ is_deleted: false, deleted_at: null }).eq('id', staff.memberId);
  });

  it('X — a profile-linked SUBCONTRACTOR member row is not touched (ASK-160.C)', async () => {
    await setProfile(subLinked.profileId, { is_deleted: true, deleted_at: new Date().toISOString() });
    const m = await member(subLinked.memberId);
    expect(m.is_deleted, 'the sub directory row was taken out of the pickers').toBe(false);
  });
});
