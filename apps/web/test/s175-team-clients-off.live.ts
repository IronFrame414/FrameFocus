import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { admin, adoptSignupProfile, assertRebuildTest, sessionFor } from './live-session';
import { NON_TEAM_ROLES, getTeamMember, getTeamMembers, isTeamRole } from '@/lib/services/team';

// ============================================================================
// S175 #6 — `#1-s168`: A CLIENT IS NOT A TEAM MEMBER. And `#2-s168` with it.
// TECH_DEBT #1-s168 (five limbs) · ruling Q6.1 · no migration, no policy change.
// ============================================================================
//
// Josh, from a click-test: *"client should be removed from team side."* A seeded
// QA client appeared in the Team list, the staff invite flow offered a Client
// role, and the link it produced was a dead end.
//
// ⚠️ WHAT THIS FILE IS FOR, AND WHAT IT DELIBERATELY DOES NOT DO. There is no
// migration here and no policy is touched: `profiles` still returns client rows
// to an Owner through a raw PostgREST call, and MUST — the portal, the invite
// pipeline and `getPortalIdentity()` all depend on it. This is a SERVICE-LAYER
// projection and a set of route gates. A1 exists to pin exactly that, so nobody
// later reads these probes as evidence of an RLS floor that does not exist.
//
// WHAT IT PROVES:
//
//   A  THE LIST — no clients, and the SUBCONTRACTOR still present (Q6.1). Both
//      halves matter: a probe that only checked "no clients" would pass against
//      the `DASHBOARD_ROLES` reach the ruling forbids.
//   B  THE GATE, AND IT IS FIVE DOORS — the detail page plus the four server
//      actions, each of which takes a `targetId` off the wire. Every refusal is
//      re-read through the SERVICE ROLE, because "the action threw" and "nothing
//      was written" are different claims.
//   C  `#2-s168` — the shipped sentence names no internal screen, and the reason
//      the role-aware version would not have helped, measured live.
//
// ⚠️ NON-VACUITY IS THE WHOLE DIFFICULTY HERE. Every assertion in A and B is of
// the form "X is absent", and this repo has been burned by exactly that shape:
// a client who could not be read at all would satisfy every one of them. So each
// group opens by proving the principals and the rows really exist.
//
// FIXTURES: group C creates a completed project, a contact and an invitation;
// group B creates TWO DISPOSABLE IDENTITIES. All MARKER-keyed, swept in
// beforeAll AND afterAll; afterAll asserts zero residue and THROWS. Group A
// creates nothing — it reads the seeded identities, which is what makes it
// non-vacuous.
//
// ============================================================================
// ⚠️ WHY B4–B8 TARGET A DISPOSABLE PROFILE AND NOT A SEEDED ONE. THIS IS NOT
// FASTIDIOUSNESS — IT IS A REPAIR.
// ============================================================================
// These probes call the REAL server actions, and the actions are destructive by
// design. To prove the harness was not vacuous, the gate was temporarily
// inverted (`NON_TEAM_ROLES = []`) and the file re-run: seven probes went red,
// which is the evidence wanted. It is also what the pre-fix product did, and it
// did it to a live QA identity — `josh+qa-client@` came back with
// `role = 'admin'`, `first_name = 'PWNED'`, `is_deleted = true` and its auth
// user **banned for 876000 hours** by `softDeleteTeamMember()`. It was repaired
// by hand (role, names, notes, the soft-delete, the ban, and a sign-in
// re-verified), and the incident is recorded in `S175-log.md`.
//
// The lesson generalises past this file: **a probe whose failure mode is a write
// must not aim at a row anything else depends on.** The destructive probes now
// aim at identities this file creates and deletes, at `@example.invalid`
// addresses so a regression cannot mail a real person either.
//
// ⚠️ The disposable CLIENT is faithful in the one respect these probes test —
// `profiles.role = 'client'` — and NOT in another: `adoptSignupProfile()` goes
// through the owner signup path, so it carries a `company_members` row a real
// client would never have. Nothing here reads that, and no probe claims it.
// ============================================================================

const state = vi.hoisted(() => ({ client: null as unknown as SupabaseClient }));
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => state.client }));
// `revalidatePath` has no request context in vitest. Stubbing it is what lets
// the REAL server actions run here — the gate under test is above it, and B8
// proves a staff target reaches code beyond the gate rather than being stopped.
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

// THE REAL SHIPPED SERVER ACTIONS.
import {
  deleteTeamMemberAction,
  resetPasswordAction,
  transferOwnershipAction,
  updateTeamMemberAction,
} from '@/app/dashboard/team/[id]/actions';

const MARKER = 'S175I6';
const OWNER = 'josh+test50@worthprop.com';
const CLIENTS = [
  'josh+qa-client@worthprop.com',
  'josh+qa-client-linked@worthprop.com',
  'josh+qa-client-closed@worthprop.com',
];
const CREW = 'josh+crew@worthprop.com';
const SUB = 'josh+qa-sub@worthprop.com';

type Client = SupabaseClient<Database>;
let ownerC: Client;
let companyId: string;
let ownerUserId: string;
const profileIdOf: Record<string, string> = {};

/** Created and destroyed by this file — never a seeded identity. See the header. */
interface Disposable { profileId: string; userId: string; email: string }
let throwawayClient: Disposable;
let throwawayCrew: Disposable;

let contactId: string;
let closedProjectId: string;
let clientInviteToken: string;
let staffInviteId: string;
let staffInviteToken: string;
const madeInvitations: string[] = [];

const must = (l: string, e: { message: string } | null) => {
  if (e) throw new Error(`${l}: ${e.message}`);
};

/** Strip comments, so a source assertion reads the SHIPPED strings and not the
 *  superseded ones quoted beside them. C1b proves the stripper works. */
const strip = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/[^:]\/\/.*$/gm, '');

/** A profile row read PRIVILEGED — never through the caller whose refusal is
 *  under test. A service that refused the read would otherwise look like a
 *  service that refused the write. */
const profileSnapshot = async (id: string) =>
  (await admin
    .from('profiles')
    .select('id, role, first_name, last_name, notes, is_deleted')
    .eq('id', id)
    .single()).data!;

// ── sweep ───────────────────────────────────────────────────────────────────
/** Remove a disposable identity — member row, profile, auth user, in that order. */
async function dropIdentity(email: string): Promise<void> {
  const { data: prior } = await admin.from('profiles').select('id, user_id').eq('email', email).maybeSingle();
  if (!prior) return;
  await admin.from('company_members').delete().eq('profile_id', prior.id);
  must(`profile ${email}`, (await admin.from('profiles').delete().eq('id', prior.id)).error);
  if (prior.user_id) {
    const { error } = await admin.auth.admin.deleteUser(prior.user_id);
    if (error) throw new Error(`deleteUser ${email}: ${error.message}`);
  }
  await admin.from('trial_emails').delete().eq('email', email.toLowerCase());
}

const throwawayEmail = (tag: string) => `${MARKER.toLowerCase()}-${tag}@example.invalid`;

async function makeIdentity(role: string, tag: string): Promise<Disposable> {
  const email = throwawayEmail(tag);
  await dropIdentity(email);
  const { data: created, error } = await admin.auth.admin.createUser({
    email, email_confirm: true, password: `${MARKER}-Throwaway-1!`,
  });
  if (error) throw new Error(`createUser(${email}): ${error.message}`);
  const userId = created.user.id;
  // Adopted, not inserted: the `auth.users` trigger has already made a profile
  // (and a company, which this helper removes). live-session.ts explains why.
  const { profileId } = await adoptSignupProfile(userId, {
    companyId, email, role, firstName: MARKER, lastName: tag,
  });
  return { profileId, userId, email };
}

async function sweep(): Promise<void> {
  for (const tag of ['client', 'crew']) await dropIdentity(throwawayEmail(tag));

  const { data: invs } = await admin.from('invitations').select('id').like('email', `${MARKER}%`);
  const ids = (invs ?? []).map((i) => i.id);
  if (ids.length) must('invitations', (await admin.from('invitations').delete().in('id', ids)).error);

  const { data: projs } = await admin.from('projects').select('id').like('name', `${MARKER}%`);
  const pids = (projs ?? []).map((p) => p.id);
  if (pids.length) {
    await admin.from('project_contacts').delete().in('project_id', pids);
    must('projects', (await admin.from('projects').delete().in('id', pids)).error);
  }
  await admin.from('contacts').delete().like('last_name', `${MARKER}%`);
}

// ── setup ───────────────────────────────────────────────────────────────────
beforeAll(async () => {
  assertRebuildTest();
  await sweep();

  const { data: co } = await admin.from('companies').select('id').eq('name', 'Sabal Point Construction').single();
  companyId = co!.id;
  ownerC = (await sessionFor(OWNER)) as Client;
  state.client = ownerC;

  for (const email of [OWNER, CREW, SUB, ...CLIENTS]) {
    const { data: p } = await admin.from('profiles').select('id, user_id').eq('email', email).single();
    if (!p) throw new Error(`${email} is not seeded — run scripts/seed-test-identities.mjs`);
    profileIdOf[email] = p.id;
    if (email === OWNER) ownerUserId = p.user_id!;
  }

  // ── group B's fixtures: two identities this file owns outright ───────────
  throwawayClient = await makeIdentity('client', 'client');
  throwawayCrew = await makeIdentity('crew_member', 'crew');

  // ── group C's fixture: a COMPLETED project and a client invitation on it ──
  const { data: contact, error: cErr } = await admin
    .from('contacts')
    .insert({
      company_id: companyId, contact_type: 'client',
      first_name: 'QA', last_name: `${MARKER} Expired Invitee`,
      email: `${MARKER.toLowerCase()}-invitee@example.invalid`,
    })
    .select('id').single();
  must('contact', cErr);
  contactId = contact!.id;

  const { data: seqRow } = await admin
    .from('projects').select('project_internal_seq')
    .eq('company_id', companyId).order('project_internal_seq', { ascending: false }).limit(1).maybeSingle();
  const { data: proj, error: pErr } = await admin
    .from('projects')
    .insert({
      company_id: companyId, contact_id: contactId,
      name: `${MARKER} — long-finished job`,
      project_type: 'fixed_price', status: 'complete',
      // Far outside R2's 45-day post-completion window.
      actual_end_date: new Date(Date.now() - 400 * 86400000).toISOString().slice(0, 10),
      project_number: `${MARKER}-X1`,
      project_internal_seq: (seqRow?.project_internal_seq ?? 0) + 1000,
    })
    .select('id').single();
  must('project', pErr);
  closedProjectId = proj!.id;

  // ⚠️ `expires_at` DELIBERATELY IN THE FAR FUTURE — that is C2's whole point.
  const { data: cInv, error: ciErr } = await admin
    .from('invitations')
    .insert({
      company_id: companyId, email: `${MARKER}-client@example.invalid`, role: 'client',
      invited_by: ownerUserId, created_by: ownerUserId,
      contact_id: contactId, project_id: closedProjectId,
      expires_at: new Date(Date.now() + 365 * 86400000).toISOString(),
    })
    .select('id, token').single();
  must('client invitation', ciErr);
  clientInviteToken = cInv!.token;
  madeInvitations.push(cInv!.id);

  const { data: sInv, error: siErr } = await admin
    .from('invitations')
    .insert({
      company_id: companyId, email: `${MARKER}-staff@example.invalid`, role: 'crew_member',
      invited_by: ownerUserId, created_by: ownerUserId,
      expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
    })
    .select('id, token').single();
  must('staff invitation', siErr);
  staffInviteId = sInv!.id;
  staffInviteToken = sInv!.token;
  madeInvitations.push(sInv!.id);
}, 300_000);

afterAll(async () => {
  await sweep();
  const left: Record<string, number | null> = {};
  left.invitations = (await admin.from('invitations').select('id', { count: 'exact', head: true }).like('email', `${MARKER}%`)).count;
  left.projects = (await admin.from('projects').select('id', { count: 'exact', head: true }).like('name', `${MARKER}%`)).count;
  left.contacts = (await admin.from('contacts').select('id', { count: 'exact', head: true }).like('last_name', `${MARKER}%`)).count;
  left.throwawayProfiles = (await admin.from('profiles').select('id', { count: 'exact', head: true }).like('email', `${MARKER.toLowerCase()}%`)).count;
  const residue = Object.entries(left).filter(([, n]) => (n ?? 0) > 0);
  if (residue.length) throw new Error(`[${MARKER}] residue: ${JSON.stringify(residue)}`);
}, 300_000);

// ───────────────────────────────────────────────────────────────────────────
describe('S175-I6 A — THE LIST: no clients, and the subcontractor is STILL THERE', () => {
  it('A1 — ⚠️ NON-VACUITY, AND THE SCOPE: the Owner still reads clients from `profiles` directly', async () => {
    // This item changes a SERVICE PROJECTION, not a policy. If this ever goes
    // red, something floored `profiles` — which would break the portal, the
    // invite pipeline and `getPortalIdentity()`. It also makes A2 meaningful:
    // the rows exist and are readable, and the Team list drops them anyway.
    const { data } = await ownerC.from('profiles').select('id, role').eq('is_deleted', false);
    const clients = (data ?? []).filter((p) => p.role === 'client');
    expect(clients.length, 'no client profiles exist — every "no clients" probe here is vacuous').toBeGreaterThanOrEqual(1);
    const subs = (data ?? []).filter((p) => p.role === 'subcontractor');
    expect(subs.length, 'no subcontractor profile exists — A3 would be vacuous').toBeGreaterThanOrEqual(1);
  });

  it('A2 — limb 3: `getTeamMembers()` returns ZERO clients', async () => {
    const rows = await getTeamMembers(ownerC);
    expect(rows.filter((r) => r.role === 'client')).toEqual([]);
    expect(rows.length, 'the list came back empty — that is not a filter, that is a break').toBeGreaterThan(0);
  });

  it('A3 — ⚠️ Q6.1: the SUBCONTRACTOR is still on the Team list', async () => {
    // The ruling, as an assertion. `.in('role', DASHBOARD_ROLES)` — the tidy
    // reach TECH_DEBT warns about, *"a scope decision, not a freebie"* — would
    // pass A2 and fail HERE, which is the only reason this test exists.
    const rows = await getTeamMembers(ownerC);
    expect(
      rows.some((r) => r.role === 'subcontractor'),
      'subcontractors were dropped from the Team list — that is Q6.1, and it was ruled the other way'
    ).toBe(true);
  });

  it('A4 — and none of the five dashboard roles was collateral damage', async () => {
    const rows = await getTeamMembers(ownerC);
    const roles = new Set(rows.map((r) => r.role));
    for (const r of ['owner', 'admin', 'project_manager', 'foreman', 'crew_member']) {
      expect(roles.has(r), `${r} vanished from the Team list`).toBe(true);
    }
  });

  it('A5 — the rule is exactly `[client]`, named rather than counted', () => {
    expect([...NON_TEAM_ROLES]).toEqual(['client']);
    expect(isTeamRole('client')).toBe(false);
    expect(isTeamRole('subcontractor')).toBe(true);
    expect(isTeamRole('crew_member')).toBe(true);
    expect(isTeamRole(null)).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('S175-I6 B — THE GATE: the detail route is one door of FIVE', () => {
  it('B1 — limb 4: `getTeamMember()` returns null for every seeded client', async () => {
    for (const email of CLIENTS) {
      expect(await getTeamMember(ownerC, profileIdOf[email]), `${email} is still reachable`).toBeNull();
    }
  });

  it('B2 — ⚠️ and NOT for a staff member, or the gate is just a break', async () => {
    const crew = await getTeamMember(ownerC, profileIdOf[CREW]);
    expect(crew).not.toBeNull();
    expect(crew!.role).toBe('crew_member');
  });

  it('B3 — Q6.1 on the DETAIL route too: a subcontractor stays reachable', async () => {
    const sub = await getTeamMember(ownerC, profileIdOf[SUB]);
    expect(sub, 'a subcontractor lost their team detail page').not.toBeNull();
    expect(sub!.role).toBe('subcontractor');
  });

  it('B4 — `updateTeamMemberAction` refuses a client, and writes NOTHING', async () => {
    // ⚠️ THE ACTION IS THE DOOR THE LIST FILTER NEVER TOUCHED. It takes a
    // `targetId` off the wire; before this it would have rewritten a client's
    // role and notes through the staff editor's action. Measured, not
    // hypothesised — see the header.
    const id = throwawayClient.profileId;
    const before = await profileSnapshot(id);
    await expect(
      updateTeamMemberAction(id, {
        first_name: 'PWNED', last_name: 'PWNED', phone: null, role: 'admin', notes: 'PWNED',
      })
    ).rejects.toThrow(/not on your team/i);
    // Re-read PRIVILEGED: "it threw" and "nothing was written" are different
    // claims, and only the second one is the finding.
    expect(await profileSnapshot(id)).toEqual(before);
  });

  it('B5 — `deleteTeamMemberAction` refuses a client: no soft-delete, no auth ban', async () => {
    // `softDeleteTeamMember()` does TWO things — `is_deleted = true` on the
    // profile AND `ban_duration: '876000h'` on the auth user. Both are asserted,
    // because the second is invisible in `profiles` and is the half that locks
    // a client out of their own portal for a hundred years.
    const id = throwawayClient.profileId;
    await expect(deleteTeamMemberAction(id)).rejects.toThrow(/not on your team/i);
    expect((await profileSnapshot(id)).is_deleted).toBe(false);
    const { data: user } = await admin.auth.admin.getUserById(throwawayClient.userId);
    expect(
      (user?.user as { banned_until?: string } | undefined)?.banned_until ?? null,
      'the client auth user was banned'
    ).toBeFalsy();
  });

  it('B6 — `resetPasswordAction` refuses a client, so no reset email leaves', async () => {
    await expect(resetPasswordAction(throwawayClient.profileId)).rejects.toThrow(/not on your team/i);
  });

  it('B7 — ownership cannot be transferred to a client, and the Owner is unchanged', async () => {
    const form = new FormData();
    form.set('new_owner_id', throwawayClient.profileId);
    form.set('password', 'not-the-real-one');
    const result = await transferOwnershipAction(form);
    expect(result.ok).toBe(false);
    // ⚠️ Refused BEFORE the password is checked — otherwise a wrong password
    // would produce this same `ok: false` and prove nothing. The sentence is the
    // gate's, and it is deliberately identical to an unreadable id so it reports
    // nothing about who exists.
    expect((result as { error: string }).error).toMatch(/not found/i);
    expect((await profileSnapshot(profileIdOf[OWNER])).role).toBe('owner');
  });

  it('B8 — ⚠️ THE COUNTERFACTUAL: the same action goes THROUGH for a staff member', async () => {
    // Without this, B4–B7 pass against an action that refuses everybody. It runs
    // against this file's own crew identity and really changes a field, so the
    // positive is a write and not an absence of an exception.
    const id = throwawayCrew.profileId;
    await expect(
      updateTeamMemberAction(id, {
        first_name: 'Counter', last_name: 'Factual', phone: null,
        role: 'crew_member', notes: `${MARKER} went through`,
      })
    ).resolves.toBeUndefined();
    const after = await profileSnapshot(id);
    expect(after.first_name).toBe('Counter');
    expect(after.notes).toBe(`${MARKER} went through`);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('S175-I6 C — `#2-s168`: the expired sentence, and why role-awareness would not have helped', () => {
  const acceptSrc = () =>
    strip(readFileSync(fileURLToPath(new URL('../app/invite/accept/accept-invite.tsx', import.meta.url)), 'utf8'));

  it('C1 — the SHIPPED copy names no internal screen', () => {
    const src = acceptSrc();
    expect(src).toContain('This invitation has expired. Ask the company to send you a new one.');
    // The two screens a client invite could be blamed on, neither of which the
    // person reading this page can see or act on.
    expect(src, 'the expired sentence still names an internal screen').not.toMatch(/Team page/);
    expect(src).not.toMatch(/Contacts tab/);
  });

  it('C1b — ⚠️ and the stripper works, or C1 proves nothing', () => {
    // The superseded sentence is quoted in a comment two lines above the live
    // one. Without stripping, C1's `not.toMatch(/Team page/)` would fail on the
    // record of the fix — or, worse, a future edit could satisfy C1 from inside
    // a comment.
    expect(strip('/* Team page */ const a = 1;')).not.toContain('Team page');
    expect(strip('// Team page\nconst a = 1;')).not.toContain('Team page');
    expect(strip("const a = 'Team page';")).toContain('Team page');
    expect(
      readFileSync(fileURLToPath(new URL('../app/invite/accept/accept-invite.tsx', import.meta.url)), 'utf8'),
      'the superseded sentence is no longer quoted — C1b is measuring nothing'
    ).toMatch(/Team page/);
  });

  it('C2 — ⚠️ THE THIRD FAULT, LIVE: an expired CLIENT invite has a FUTURE `expires_at`', async () => {
    // This is why the role-aware message TECH_DEBT called for would not have
    // helped. `get_invitation_status()` branches on role: for a client, expiry
    // is the PROJECT's window, and `expires_at` is not read at all. A resend
    // resets `expires_at`. So "ask them to resend it" prescribes an action that
    // resets a clock this invitation does not read — from the Team page or from
    // anywhere else.
    const { data: row } = await admin
      .from('invitations').select('expires_at, status, role').eq('token', clientInviteToken).single();
    expect(row!.role).toBe('client');
    expect(row!.status).toBe('pending');
    expect(new Date(row!.expires_at!).getTime(), 'the fixture expiry is not in the future — C2 is vacuous').toBeGreaterThan(Date.now());

    const { data: status } = await admin.rpc('get_invitation_status', { invite_token: clientInviteToken });
    expect(status, 'a client invite on a long-finished project should read expired').toBe('expired');
  });

  it('C3 — the counterfactual: a STAFF invite reads `expires_at`, both ways', async () => {
    const { data: valid } = await admin.rpc('get_invitation_status', { invite_token: staffInviteToken });
    expect(valid).toBe('valid');

    must('age the staff invite', (await admin
      .from('invitations')
      .update({ expires_at: new Date(Date.now() - 86400000).toISOString() })
      .eq('id', staffInviteId)).error);
    const { data: expired } = await admin.rpc('get_invitation_status', { invite_token: staffInviteToken });
    expect(expired).toBe('expired');
  });
});
