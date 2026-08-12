import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { admin, assertRebuildTest, sessionFor } from './live-session';
import {
  insertPunchItemAsCaller,
  upsertProjectAssignmentAsCaller,
} from '@/lib/services/assignments-server';
import {
  notifyProjectAssigned,
  notifyPunchAssigned,
  resolveMemberReachability,
} from '@/lib/notify/assignment-notify';

// ============================================================================
// SLICE 7 — ND-18 against the real database. No migration.
// Spec: docs/specs/notifications-architecture.md §3b, §13.2, §16.
// ============================================================================
//
// ---------------------------------------------------------------------------
// THE RLS TESTS ARE THE ONES THAT JUSTIFY THIS FILE
// ---------------------------------------------------------------------------
// The unit suite asserts that the routes PASS the caller's client to the write
// half. That is a structural check on source text. It cannot tell you whether
// the resulting write is actually still refused for someone who should not be
// able to make it — only the database can answer that, so it is asked here,
// with real sessions carrying real JWTs.
//
// Each refusal is paired with a permit. A write half that refused EVERYBODY
// would pass every negative below and would look, from the outside, exactly
// like a working policy.
//
// §13.2's three states are also live-verified rather than mocked, because all
// three exist in the seed data and the interesting one — a subcontractor with
// neither a login nor an email — is the state a fixture would never think to
// invent.

const OWNER = 'josh+test50@worthprop.com';
const PM = 'josh+pm@worthprop.com';
const CREW = 'josh+crew@worthprop.com';
const OTHER_CO_OWNER = 'josh+qa-b-owner@worthprop.com';

const TAG = 's123-nd18';

let ownerC: SupabaseClient<Database>;
let crewC: SupabaseClient<Database>;
let otherCoC: SupabaseClient<Database>;

let companyId: string;
let projectId: string;
let punchListId: string;

let crewProfileId: string;
let crewMemberId: string;
let pmMemberId: string;
let ownerProfileId: string;

/** §13.2 states, taken from live rows rather than invented. */
let emailOnlyMemberId: string;
let unreachableMemberId: string;

const madeNotifications: string[] = [];
const madePunchItems: string[] = [];
const madeAssignments: string[] = [];
let madeList = false;

async function rowsFor(sourceId: string) {
  const { data } = await admin
    .from('notifications')
    .select('id, recipient_profile_id, type, title, body, link_key, link_params')
    .eq('source_id', sourceId);
  for (const r of data ?? []) if (!madeNotifications.includes(r.id)) madeNotifications.push(r.id);
  return data ?? [];
}

beforeAll(async () => {
  assertRebuildTest();

  [ownerC, crewC, otherCoC] = (await Promise.all([
    sessionFor(OWNER),
    sessionFor(CREW),
    sessionFor(OTHER_CO_OWNER),
  ])) as SupabaseClient<Database>[];

  const { data: profiles } = await admin
    .from('profiles')
    .select('id, email, company_id')
    .in('email', [OWNER, PM, CREW]);
  ownerProfileId = profiles!.find((p) => p.email === OWNER)!.id;
  crewProfileId = profiles!.find((p) => p.email === CREW)!.id;
  companyId = profiles!.find((p) => p.email === OWNER)!.company_id;
  const pmProfileId = profiles!.find((p) => p.email === PM)!.id;

  const { data: members } = await admin
    .from('company_members')
    .select('id, profile_id')
    .in('profile_id', [crewProfileId, pmProfileId]);
  crewMemberId = members!.find((m) => m.profile_id === crewProfileId)!.id;
  pmMemberId = members!.find((m) => m.profile_id === pmProfileId)!.id;

  // ⚠️ PINNED TO A PROJECT THE CREW IS ACTUALLY ASSIGNED TO [S135].
  //
  // _Superseded, quoted rather than rewritten:_
  // ```
  // const { data: project } = await admin.from('projects')
  //   .select('id').eq('company_id', companyId).eq('is_deleted', false)
  //   .limit(1).single();
  // ```
  //
  // `limit(1)` with NO `order()` is whatever Postgres hands back first, and the
  // PERMIT test below needs `can_view_project()` to be TRUE for crew — so it
  // only ever passed because the first row happened to be a project crew was on.
  // It stopped being: another harness leaked a project ("S97PASSTHRU
  // with-retainage") when its teardown hit an FK it deletes in the wrong order,
  // that row sorted first, and this test began failing for a reason that had
  // nothing to do with what it tests. TECH_DEBT #149's shape exactly.
  //
  // Now derived from the assignment itself, so it cannot drift again.
  const { data: crewAssignments } = await admin
    .from('project_assignments')
    .select('project_id')
    .eq('member_id', crewMemberId)
    .eq('is_deleted', false);

  const crewProjectIds = ((crewAssignments ?? []) as Array<{ project_id: string }>).map(
    (r) => r.project_id
  );
  const { data: project } = await admin
    .from('projects')
    .select('id')
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .in('id', crewProjectIds.length ? crewProjectIds : ['00000000-0000-0000-0000-000000000000'])
    .order('created_at', { ascending: true })
    .limit(1)
    .single();
  if (!project) {
    throw new Error(
      'no project the crew member is assigned to — the PERMIT test below would fail for a fixture reason, not a policy one'
    );
  }
  projectId = project.id;

  // §13.2 state 2 — a subcontractor member with an email but NO login.
  const { data: subs } = await admin
    .from('subcontractors')
    .select('member_id, email')
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .not('member_id', 'is', null);

  const subMemberIds = (subs ?? []).map((s) => s.member_id!).filter(Boolean);
  const { data: subMembers } = await admin
    .from('company_members')
    .select('id, profile_id')
    .in('id', subMemberIds)
    .eq('is_deleted', false);

  const noLogin = (subMembers ?? []).filter((m) => m.profile_id === null).map((m) => m.id);
  emailOnlyMemberId = noLogin.find((id) =>
    (subs ?? []).some((s) => s.member_id === id && s.email)
  )!;

  // §13.2 state 3 — no login AND no email.
  const { data: orphanMembers } = await admin
    .from('company_members')
    .select('id')
    .eq('company_id', companyId)
    .eq('member_type', 'subcontractor')
    .is('profile_id', null)
    .eq('is_deleted', false);
  const withEmail = new Set(
    (subs ?? []).filter((s) => s.email).map((s) => s.member_id as string)
  );
  unreachableMemberId = (orphanMembers ?? []).map((m) => m.id).find((id) => !withEmail.has(id))!;

  if (!emailOnlyMemberId || !unreachableMemberId) {
    throw new Error(
      `§13.2 fixtures missing: emailOnly=${emailOnlyMemberId}, unreachable=${unreachableMemberId}`
    );
  }

  const { data: list, error: listError } = await admin
    .from('punch_lists')
    .insert({ company_id: companyId, project_id: projectId, name: `${TAG} list` })
    .select('id')
    .single();
  if (listError) throw new Error(`fixture punch_list: ${listError.message}`);
  punchListId = list!.id;
  madeList = true;
});

afterAll(async () => {
  if (madeNotifications.length) {
    await admin.from('notifications').delete().in('id', madeNotifications);
  }
  if (madePunchItems.length) {
    await admin.from('punch_list_items').delete().in('id', madePunchItems);
  }
  if (madeAssignments.length) {
    await admin.from('project_assignments').delete().in('id', madeAssignments);
  }
  if (madeList) await admin.from('punch_lists').delete().eq('id', punchListId);
});

describe('ND-18 — the write half still runs under the caller policies', () => {
  it('PERMIT: crew may create a punch item on a project they can view', async () => {
    // punch_list_items_insert_authenticated: company scope AND
    // can_view_project(project_id). D-52 opens punch creation to every role, so
    // crew is the narrowest non-subcontractor case.
    const result = await insertPunchItemAsCaller(crewC, {
      punch_list_id: punchListId,
      project_id: projectId,
      title: `${TAG} permitted`,
    });
    expect(result.success, result.error).toBe(true);
    madePunchItems.push(result.id!);
  });

  it('REFUSE: another company cannot create a punch item on this project', async () => {
    // The paired negative for the permit above. If the route had swapped in the
    // service role, THIS is the test that goes green when it must not.
    const result = await insertPunchItemAsCaller(otherCoC, {
      punch_list_id: punchListId,
      project_id: projectId,
      title: `${TAG} must not exist`,
    });
    expect(result.success).toBe(false);

    // A refused INSERT must have written nothing — asserted with the service
    // role, because the refusing session cannot see the row either way and
    // "I can't see it" is not "it isn't there".
    const { data } = await admin
      .from('punch_list_items')
      .select('id')
      .eq('title', `${TAG} must not exist`);
    expect(data ?? []).toHaveLength(0);
  });

  it('REFUSE: crew cannot assign a member to a project', async () => {
    // project_assignments_insert_authorized is owner/admin, or a PM who is
    // already assigned. Crew was never permitted and still is not.
    const result = await upsertProjectAssignmentAsCaller(crewC, {
      project_id: projectId,
      member_id: pmMemberId,
    });
    expect(result.success).toBe(false);
  });

  it('PERMIT: the Owner can, and the row is real', async () => {
    const { data: before } = await admin
      .from('project_assignments')
      .select('id')
      .eq('project_id', projectId)
      .eq('member_id', crewMemberId)
      .maybeSingle();

    const result = await upsertProjectAssignmentAsCaller(ownerC, {
      project_id: projectId,
      member_id: crewMemberId,
    });

    // The crew member may already be assigned from an earlier fixture, which is
    // a legitimate "already assigned" rather than a refusal — distinguish them
    // instead of accepting either.
    if (before) {
      expect(result.error).toContain('already assigned');
    } else {
      expect(result.success, result.error).toBe(true);
      madeAssignments.push(result.id!);
    }
  });
});

describe('§13.2 — the three reachability states, on live rows', () => {
  it('state 1: a member with a login resolves to a profile recipient', async () => {
    const reach = await resolveMemberReachability(admin, crewMemberId);
    expect(reach.state).toBe('profile');
    if (reach.state === 'profile') {
      expect(reach.recipient.profileId).toBe(crewProfileId);
      expect(reach.recipient.role).toBe('crew_member');
    }
  });

  it('state 2: a subcontractor with an email but no login is email-only', async () => {
    const reach = await resolveMemberReachability(admin, emailOnlyMemberId);
    expect(reach.state).toBe('email-only');
    if (reach.state === 'email-only') expect(reach.email).toContain('@');
  });

  it('state 3: no login and no email is unreachable, and still names them', async () => {
    // The surface has to be able to say WHO was not reached — "1 subcontractor
    // has no email on file" is useless without the name.
    const reach = await resolveMemberReachability(admin, unreachableMemberId);
    expect(reach.state).toBe('unreachable');
    expect(reach.displayName.length).toBeGreaterThan(0);
  });
});

describe('§3b — what an assignment actually writes', () => {
  it('a project assignment notifies the assignee, once, with a link', async () => {
    const outcome = await notifyProjectAssigned(admin, {
      companyId,
      projectId,
      projectName: 'Alvarez',
      memberId: crewMemberId,
      assignerName: 'Josh Bishop',
      assignerProfileId: ownerProfileId,
    });
    expect(outcome.notified).toBe(true);

    const rows = await rowsFor(projectId);
    const mine = rows.filter((r) => r.recipient_profile_id === crewProfileId);
    expect(mine).toHaveLength(1);
    expect(mine[0].type).toBe('assignment');
    expect(mine[0].title).toBe('Josh Bishop assigned you to Alvarez');
    expect(mine[0].link_key).toBe('project');
    expect(mine[0].link_params).toMatchObject({ projectId });
  });

  it('SELF-assignment writes nothing at all', async () => {
    // Not merely "no push" — no row. The policy explicitly permits a PM to add
    // themselves to a project they created, so this is a normal path and would
    // otherwise be the most common notification the platform sends.
    const before = (await rowsFor(projectId)).length;
    const outcome = await notifyProjectAssigned(admin, {
      companyId,
      projectId,
      projectName: 'Alvarez',
      memberId: crewMemberId,
      assignerName: 'Casey Crew',
      assignerProfileId: crewProfileId, // the assignee IS the assigner
    });
    expect(outcome.notified).toBe(false);
    expect((await rowsFor(projectId)).length).toBe(before);
  });

  it('a punch assignment is typed punch_assigned and carries the item title', async () => {
    const item = await insertPunchItemAsCaller(crewC, {
      punch_list_id: punchListId,
      project_id: projectId,
      title: `${TAG} cracked tile`,
      assignee_id: crewMemberId,
    });
    expect(item.success, item.error).toBe(true);
    madePunchItems.push(item.id!);

    const outcome = await notifyPunchAssigned(admin, {
      companyId,
      projectId,
      punchItemId: item.id!,
      punchTitle: `${TAG} cracked tile`,
      memberId: crewMemberId,
      assignerName: 'Josh Bishop',
      assignerProfileId: ownerProfileId,
    });
    expect(outcome.notified).toBe(true);

    const rows = await rowsFor(item.id!);
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe('punch_assigned');
    expect(rows[0].body).toBe(`${TAG} cracked tile`);
    expect(rows[0].link_key).toBe('punch');
  });

  it('assigning a state-2 subcontractor writes NO row and reports the email', async () => {
    // ND-2 forbids a notification row without a profile. The failure mode this
    // guards is a row addressed to a member id, which nothing would ever read.
    const item = await insertPunchItemAsCaller(ownerC, {
      punch_list_id: punchListId,
      project_id: projectId,
      title: `${TAG} sub item`,
      assignee_id: emailOnlyMemberId,
    });
    expect(item.success, item.error).toBe(true);
    madePunchItems.push(item.id!);

    const outcome = await notifyPunchAssigned(admin, {
      companyId,
      projectId,
      punchItemId: item.id!,
      punchTitle: `${TAG} sub item`,
      memberId: emailOnlyMemberId,
      assignerName: 'Josh Bishop',
      assignerProfileId: ownerProfileId,
    });

    expect(outcome.notified).toBe(false);
    expect(outcome.emailOnly).toContain('@');
    expect(outcome.unreachableName).toBeNull();
    expect(await rowsFor(item.id!)).toHaveLength(0);
  });

  it('assigning a state-3 subcontractor is recorded, not thrown and not swallowed', async () => {
    const outcome = await notifyPunchAssigned(admin, {
      companyId,
      projectId,
      punchItemId: '11111111-1111-1111-1111-111111111111',
      punchTitle: `${TAG} orphan`,
      memberId: unreachableMemberId,
      assignerName: 'Josh Bishop',
      assignerProfileId: ownerProfileId,
    });

    expect(outcome.notified).toBe(false);
    expect(outcome.emailOnly).toBeNull();
    // Named, so the surface can say who. A bare `false` would be the silent
    // drop §13.2 explicitly forbids.
    expect(outcome.unreachableName).toBeTruthy();
  });
});
