import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';
import { admin, assertRebuildTest, sessionFor, TEST_PASSWORD, URL_, ANON } from './live-session';
import { resolveThread } from '@/lib/chat/threads';
import { insertMessage, recentMessages } from '@/lib/chat/messages';
import { withMemberNames } from '@/lib/services/punch';
import { adminPunchListNameResolver } from '@/lib/services/punch-list-names';

// ============================================================================
// S133 [Josh] — THE SUBCONTRACTOR READ FLOOR, AND THE RULING B NARROWING.
//
// Migrations: 20260912000000_subcontractor_project_read_floor.sql
//             20260913000000_ruling_b_pm_project_scope.sql
// ============================================================================
//
// ⚠️ EVERY READ BELOW RUNS AS A REAL USER, NOT AS `postgres`. Each client is an
// anon-key client carrying a real user JWT, so RLS applies exactly as it does in
// the app. A probe run as the service role reads everything and proves nothing.
//
// ⚠️ AND EVERY ZERO IS PAIRED WITH A COUNTERFACTUAL EVALUATED WITH `admin` —
// OUTSIDE the policy under test. Five of these tables read 0 for the sub BEFORE
// this change too, purely because the fixture had no row on their project. A
// zero read through a policy is worthless alone: an empty table answers
// identically. Everything asserted at 0 here is first SEEDED on the sub's OWN
// project, so the only thing that can be producing the zero is the policy.

const SUB = 'josh+qa-sub@worthprop.com';
const OWNER = 'josh+test50@worthprop.com';
const PM = 'josh+pm@worthprop.com';
const PROJECT_QA_A = '4a4f8567-67f8-4394-baae-181229974bd9';

const STAMP = 'S133 read-floor probe';

let subC: SupabaseClient;
let ownerC: SupabaseClient;
let subProfileId: string;
let subMemberId: string;
let companyId: string;
let subProjects: string[] = [];

/** Rows seeded by this harness, torn down in afterAll. */
const seeded: Array<{ table: string; id: string }> = [];
/** The transient second PM — profile/member/assignment/auth user. */
let pm2: { userId: string; profileId: string; memberId: string; projectId: string } | null = null;
let pm2InvitationId = '';
let pm2InviteToken = '';
let taskAssignedId = '';
let taskUnassignedId = '';

async function count(c: SupabaseClient, table: string): Promise<number> {
  const { count: n, error } = await c.from(table).select('*', { count: 'exact', head: true });
  if (error) throw new Error(`${table}: ${error.message}`);
  return n ?? 0;
}

async function seed(table: string, payload: Record<string, unknown>): Promise<string> {
  const { data, error } = await admin.from(table).insert(payload).select('id').single();
  if (error) throw new Error(`seed ${table}: ${error.message}`);
  const id = (data as { id: string }).id;
  seeded.push({ table, id });
  return id;
}

beforeAll(async () => {
  assertRebuildTest();
  [subC, ownerC] = (await Promise.all([sessionFor(SUB), sessionFor(OWNER)])) as SupabaseClient[];

  const { data: prof } = await admin
    .from('profiles')
    .select('id, company_id')
    .eq('email', SUB)
    .single();
  subProfileId = (prof as { id: string }).id;
  companyId = (prof as { company_id: string }).company_id;

  const { data: mem } = await admin
    .from('company_members')
    .select('id')
    .eq('profile_id', subProfileId)
    .single();
  subMemberId = (mem as { id: string }).id;

  const { data: asg } = await admin
    .from('project_assignments')
    .select('project_id')
    .eq('member_id', subMemberId)
    .eq('is_deleted', false);
  subProjects = ((asg ?? []) as Array<{ project_id: string }>).map((r) => r.project_id);
  if (subProjects.length < 1) throw new Error('the QA sub has no project assignment — fixture broken');

  const pid = subProjects[0];

  // ── The six money/ops tables, seeded ON THE SUB'S OWN PROJECT ──────────────
  // Every one of these would be read by a sub through `can_view_project()` if
  // the policy had no role test. Seeding here is what turns "0" into evidence.
  await seed('client_contracts', { company_id: companyId, project_id: pid, status: 'draft', contract_value: 12345, notes: STAMP });
  await seed('subcontractor_contracts', { company_id: companyId, project_id: pid, member_id: subMemberId, status: 'draft', contract_value: 6789, notes: STAMP });
  await seed('project_budget_items', { company_id: companyId, project_id: pid, description: STAMP, actual_amount: 10 });
  await seed('purchase_orders', { company_id: companyId, project_id: pid, vendor_name: STAMP, status: 'issued' /* R5: was 'open' — relabelled 20261042 */, author_member_id: subMemberId });
  await seed('inspections', { company_id: companyId, project_id: pid, inspection_type: STAMP, result: 'pending' });
  await seed('deliveries', { company_id: companyId, project_id: pid, vendor_name: STAMP, delivery_date: '2026-08-11', received_by: subMemberId });

  // ── tasks: a POSITIVE and a NEGATIVE control ──────────────────────────────
  // Nothing on rebuild-test is assigned to the sub, so "assigned only" would
  // yield 0 and be indistinguishable from a policy that denies everything.
  taskAssignedId = await seed('tasks', { company_id: companyId, project_id: pid, title: `${STAMP} ASSIGNED`, assignee_id: subMemberId });
  taskUnassignedId = await seed('tasks', { company_id: companyId, project_id: pid, title: `${STAMP} UNASSIGNED` });

  // ── the transient second PM, for the Ruling B narrowing ───────────────────
  // Not added to scripts/seed-test-identities.mjs [Josh, S133 Q3]: TECH_DEBT
  // #149 records that seed as hand-curated and unreproducible.
  const { data: other } = await admin
    .from('projects')
    .select('id')
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .not('id', 'in', `(${subProjects.join(',')})`)
    .limit(1)
    .single();
  const otherProjectId = (other as { id: string }).id;

  const email = `josh+s133-pm2@worthprop.com`;
  const { data: existing } = await admin.from('profiles').select('id, user_id').eq('email', email).maybeSingle();
  if (existing) throw new Error(`${email} already exists — a previous run did not clean up`);

  // ⚠️ SEEDED THROUGH THE REAL INVITATION PATH [S135] — not by hand.
  //
  // _Superseded, quoted rather than rewritten:_
  // ```
  // const { data: created } = await admin.auth.admin.createUser({ ... });
  // await admin.from('profiles').insert({ user_id: created.user.id, ... });
  // ```
  //
  // That collided with `profiles_user_id_key` the moment `20260914000000`
  // brought the `auth.users` trigger into version control. It had worked here
  // ONLY because rebuild-test never had the trigger production has had all
  // along — the direct insert was standing in for a divergence, not a design.
  // Going through an invitation is what production does, and it buys end-to-end
  // coverage of the invited path for free (asserted below).
  const { data: ownerProf } = await admin
    .from('profiles')
    .select('user_id')
    .eq('email', OWNER)
    .single();
  const ownerUserId = (ownerProf as { user_id: string }).user_id;

  pm2InviteToken = randomUUID();
  const { data: inv, error: invErr } = await admin
    .from('invitations')
    .insert({
      company_id: companyId,
      email,
      role: 'project_manager',
      invited_by: ownerUserId,
      created_by: ownerUserId,
      token: pm2InviteToken,
    })
    .select('id')
    .single();
  if (invErr) throw new Error(`pm2 invitation: ${invErr.message}`);
  pm2InvitationId = (inv as { id: string }).id;

  // ADMIN createUser, not signUp: `user_metadata` lands in `raw_user_meta_data`
  // exactly as signUp's `options.data` does, so the SAME trigger runs the SAME
  // invited path — but no confirmation email is sent, and Supabase's email rate
  // limit is not touched. live-session.ts's header documents that limit biting
  // after a few harness runs; a signUp here made this file fail on its second
  // run of the session.
  const { data: signUpData, error: suErr } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { first_name: 'S133', last_name: 'PM Two', invitation_token: pm2InviteToken },
  });
  if (suErr) throw new Error(`pm2 createUser: ${suErr.message}`);

  const { data: p2 } = await admin
    .from('profiles')
    .select('id, company_id, role')
    .eq('email', email)
    .single();
  if (!p2) throw new Error('pm2 signUp created no profile — the auth.users trigger is missing');

  const { data: m2 } = await admin
    .from('company_members')
    .select('id, company_id')
    .eq('profile_id', (p2 as { id: string }).id)
    .single();

  const asgId = await seed('project_assignments', {
    company_id: companyId,
    project_id: otherProjectId,
    member_id: (m2 as { id: string }).id,
    role_on_project: 'project_manager',
  });

  pm2 = {
    userId: signUpData.user!.id,
    profileId: (p2 as { id: string }).id,
    memberId: (m2 as { id: string }).id,
    projectId: otherProjectId,
  };
  void asgId;
}, 240_000);

afterAll(async () => {
  for (const row of [...seeded].reverse()) {
    await admin.from(row.table).delete().eq('id', row.id);
  }
  if (pm2) {
    await admin.from('company_members').delete().eq('id', pm2.memberId);
    await admin.from('profiles').delete().eq('id', pm2.profileId);
    await admin.auth.admin.deleteUser(pm2.userId);
  }
  if (pm2InvitationId) await admin.from('invitations').delete().eq('id', pm2InvitationId);
  await admin.from('chat_threads').delete().eq('project_id', PROJECT_QA_A);
});

// ============================================================================
describe('the nine tables a subcontractor now reads NOTHING from', () => {
  const NOTHING = [
    'client_contracts',
    'subcontractor_contracts',
    'project_budget_items',
    'purchase_orders',
    'deliveries',
    'inspections',
    'daily_logs',
    'project_contacts',
    'punch_lists',
  ];

  it('⚠️ every one reads ZERO as the sub', async () => {
    for (const t of NOTHING) {
      expect(await count(subC, t), `a sub read ${t}`).toBe(0);
    }
  });

  it('⚠️ the counterfactual: the rows EXIST, on the sub\'s own project', async () => {
    // Evaluated with `admin`, outside the policies above. Without this, a
    // policy that denied everyone — or an empty fixture — passes the test above.
    for (const t of ['client_contracts', 'subcontractor_contracts', 'project_budget_items', 'purchase_orders', 'deliveries', 'inspections']) {
      const { count: n } = await admin
        .from(t)
        .select('*', { count: 'exact', head: true })
        .eq('project_id', subProjects[0])
        .eq('is_deleted', false);
      expect(n ?? 0, `${t}: nothing seeded — the zero above proves nothing`).toBeGreaterThan(0);
    }
    // daily_logs / project_contacts / punch_lists were ALREADY non-zero for the
    // sub before this change (1 / 1 / 2 measured on c0cb89d), so their fixtures
    // are self-evidently present. Assert that rather than assume it.
    for (const t of ['daily_logs', 'project_contacts', 'punch_lists']) {
      const { count: n } = await admin
        .from(t)
        .select('*', { count: 'exact', head: true })
        .in('project_id', subProjects)
        .eq('is_deleted', false);
      expect(n ?? 0, `${t}: no rows on the sub's projects`).toBeGreaterThan(0);
    }
  });

  it('⚠️ R7 specifically: the money columns are gone, not merely hidden', async () => {
    // The Financial Visibility Floor is the rule this ruling protects hardest.
    const { data: cc } = await subC.from('client_contracts').select('contract_value');
    expect(cc ?? [], 'a sub read a client contract value').toEqual([]);
    const { data: sc } = await subC.from('subcontractor_contracts').select('contract_value');
    expect(sc ?? [], 'a sub read a subcontractor contract value').toEqual([]);
  });
});

// ============================================================================
describe('⚠️ THE FAILING HALF — the hole is still open underneath, by mechanism', () => {
  // A green "reads 0" only says the policy refuses. It does NOT say the policy
  // is what changed: the sub might simply have lost their assignment, in which
  // case these tables would read 0 for a reason that would silently un-fix
  // itself. These two calls are made AS THE SUB against the SECURITY DEFINER
  // helpers the OLD policies were built from — the entire old predicate was
  // `company_id = get_my_company_id() AND can_view_project(project_id)`.
  //
  // Both still answer TRUE. So the sub is still assigned, `can_view_project()`
  // still admits them, and the ONLY thing standing between them and every row
  // above is the role branch this migration added. That is the failure being
  // fixed, demonstrated rather than described.

  it('is_assigned_to_project() still says YES for the sub — role-blind as ever', async () => {
    const { data, error } = await subC.rpc('is_assigned_to_project', { p_project_id: subProjects[0] });
    expect(error?.message ?? null).toBeNull();
    expect(data, 'the sub is no longer assigned — the zeroes above prove nothing').toBe(true);
  });

  it('can_view_project() still says YES — the OLD predicate would still admit them', async () => {
    const { data, error } = await subC.rpc('can_view_project', { p_project_id: subProjects[0] });
    expect(error?.message ?? null).toBeNull();
    expect(data, 'can_view_project() no longer admits the sub').toBe(true);
  });

  it('...and the same project is the one every seeded row is on', async () => {
    // Closes the loop: the helper says yes about THIS project, and THIS project
    // is where the rows the sub cannot read were seeded.
    const { count: n } = await admin
      .from('client_contracts')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', subProjects[0])
      .eq('notes', STAMP);
    expect(n ?? 0).toBeGreaterThan(0);
    expect(await count(subC, 'client_contracts')).toBe(0);
  });
});

// ============================================================================
describe('the client arm — five tables, and WHY it cannot be probed directly', () => {
  // ⚠️ THE HONEST VERSION. The client exclusion is on five of the nine
  // (client_contracts, subcontractor_contracts, purchase_orders, deliveries,
  // inspections) and deliberately NOT on the other four, because Module 9's
  // portal is being specified and those four are plausibly on its path.
  //
  // A test that asserted "a client reads 0" would pass identically with the
  // clause, without the clause, and with the whole migration reverted — a
  // client has no `company_members` row, so `can_view_project()` already
  // refuses them everywhere. Rather than bank a vacuous green, this asserts the
  // PRECONDITION that makes the arm unexercisable. The day someone gives
  // clients member rows — which Module 9 may well need — this goes red and the
  // client arm has to be re-reasoned instead of silently starting to matter.

  it('a client has NO company_members row — the reason the arm is defence-in-depth', async () => {
    const { data: cp } = await admin
      .from('profiles')
      .select('id')
      .eq('email', 'josh+qa-client@worthprop.com')
      .single();
    const { data: member } = await admin
      .from('company_members')
      .select('id')
      .eq('profile_id', (cp as { id: string }).id)
      .maybeSingle();

    expect(
      member,
      'a client now HAS a member row — the client arm is live and must be probed for real'
    ).toBeNull();
  });

  it('and no client is assigned to any project', async () => {
    const { data: clients } = await admin
      .from('profiles')
      .select('id')
      .eq('company_id', companyId)
      .eq('role', 'client');
    expect((clients ?? []).length, 'no client identity to reason about').toBeGreaterThan(0);
    // With no member row there is no `member_id` a client could appear under,
    // so this is belt-and-braces on the same fact.
    const clientC = await sessionFor('josh+qa-client@worthprop.com');
    const { count: n } = await clientC.from('project_assignments').select('*', { count: 'exact', head: true });
    expect(n ?? 0, 'a client reads project assignments').toBe(0);
  });
});

// ============================================================================
describe('tasks — assigned only, never project-wide', () => {
  it('⚠️ the sub reads the task ASSIGNED to them and NOT the one beside it', async () => {
    const { data } = await subC.from('tasks').select('id, title, assignee_id');
    const ids = ((data ?? []) as Array<{ id: string }>).map((r) => r.id);

    // Positive control — without it, "0 tasks" would pass a broken policy.
    expect(ids, 'the sub lost a task assigned to them').toContain(taskAssignedId);
    // Negative control — same project, same company, no assignment.
    expect(ids, 'the sub read a task on their project that is not theirs').not.toContain(taskUnassignedId);

    // Nothing the sub reads may belong to anyone else.
    for (const t of (data ?? []) as Array<{ assignee_id: string | null; title: string }>) {
      expect(t.assignee_id, `"${t.title}" is not assigned to the sub`).toBe(subMemberId);
    }
  });

  it('the counterfactual: both tasks exist and are on the SAME project', async () => {
    const { data } = await admin.from('tasks').select('id, project_id').in('id', [taskAssignedId, taskUnassignedId]);
    expect((data ?? []).length).toBe(2);
    const projects = new Set(((data ?? []) as Array<{ project_id: string }>).map((r) => r.project_id));
    expect(projects.size, 'the two controls are not on the same project — the test is not comparing like with like').toBe(1);
  });
});

// ============================================================================
describe('phases — the ONE project-wide grant, deliberately left alone', () => {
  it('the sub still reads the phases of their assigned projects', async () => {
    // This is a positive control for the whole migration: if the nine zeroes
    // above came from something blunt (a broken helper, a denied role) this
    // would have gone to zero with them.
    const n = await count(subC, 'phases');
    expect(n, 'a sub lost the schedule phase they are working in').toBeGreaterThan(0);

    const { data } = await subC.from('phases').select('project_id');
    for (const p of (data ?? []) as Array<{ project_id: string }>) {
      expect(subProjects, 'a sub read a phase off a project they are not on').toContain(p.project_id);
    }
  });
});

// ============================================================================
describe('project_assignments — own rows, plus Owner/Admin/PM on assigned projects', () => {
  it('⚠️ every row is either the sub\'s own or an Owner/Admin/PM', async () => {
    const { data } = await subC.from('project_assignments').select('id, project_id, member_id');
    const rows = (data ?? []) as Array<{ project_id: string; member_id: string }>;
    expect(rows.length, 'the sub reads no assignments at all').toBeGreaterThan(0);

    for (const r of rows) {
      expect(subProjects, 'an assignment off a project the sub is not on').toContain(r.project_id);
      if (r.member_id === subMemberId) continue;
      // Two plain reads rather than an embedded join: the generated `Database`
      // types an embed as an array, and the cast that hides that is exactly the
      // kind of thing that makes a security assertion quietly stop asserting.
      const { data: m } = await admin
        .from('company_members')
        .select('profile_id')
        .eq('id', r.member_id)
        .single();
      const profileId = (m as { profile_id: string | null }).profile_id;
      expect(profileId, `member ${r.member_id} has no account — a sub must not see it`).not.toBeNull();

      const { data: p } = await admin.from('profiles').select('role').eq('id', profileId!).single();
      const role = (p as { role: string }).role;
      expect(['owner', 'admin', 'project_manager'], `member ${r.member_id} has role ${role}`).toContain(role);
    }
  });

  it('⚠️ the blank member joins are GONE — project-assignments.ts needed nothing', () => {
    // Measured on c0cb89d: 10 rows, 5 with a NULL `company_members` join. The
    // five blanks were exactly the rows this policy removes, so the join stops
    // returning null on its own rather than needing a second resolver.
    return subC
      .from('project_assignments')
      .select('member_id, company_members(id, display_name, member_type, schedule_color)')
      .then(({ data }) => {
        const rows = (data ?? []) as Array<{ member_id: string; company_members: unknown }>;
        expect(rows.length).toBeGreaterThan(0);
        const blank = rows.filter((r) => !r.company_members);
        expect(blank, `${blank.length} assignment rows still render a blank member`).toEqual([]);
      });
  });
});

// ============================================================================
describe('⚠️ THE RULING B NARROWING — the PM is project-scoped', () => {
  it('a sub sees EXACTLY ONE PM: the one they share a project with', async () => {
    const { data } = await subC.from('profiles').select('email, role');
    const rows = (data ?? []) as Array<{ email: string; role: string }>;

    const pms = rows.filter((r) => r.role === 'project_manager');
    expect(pms.map((p) => p.email), 'the sub sees the wrong set of PMs').toEqual([PM]);
    expect(pms.length, 'a sub read a PM they share no project with').toBe(1);

    // The rest of Ruling B is unchanged.
    expect(rows.some((r) => r.email === SUB), 'own row must stay readable').toBe(true);
    expect(rows.filter((r) => ['foreman', 'crew_member', 'client'].includes(r.role))).toEqual([]);
    expect(new Set(rows.map((r) => r.role))).toEqual(
      new Set(['owner', 'admin', 'project_manager', 'subcontractor'])
    );
  });

  it('⚠️ D1 [S135] — PM2 arrived through the REAL invited path, end to end', async () => {
    // PM2 is seeded by signing up with a live invitation token, so this asserts
    // the whole invited path in passing: the profile lands in the INVITER's
    // company (not a new one), with the invitation's role, the member row lands
    // in the same tenant, and the invitation flips to `accepted`.
    const { data: p } = await admin
      .from('profiles')
      .select('company_id, role')
      .eq('id', pm2!.profileId)
      .single();
    expect((p as { company_id: string }).company_id, 'the invited profile landed in the WRONG company').toBe(companyId);
    expect((p as { role: string }).role).toBe('project_manager');

    const { data: m } = await admin
      .from('company_members')
      .select('company_id')
      .eq('id', pm2!.memberId)
      .single();
    expect((m as { company_id: string }).company_id, 'the member row landed in the wrong tenant').toBe(companyId);

    const { data: inv } = await admin
      .from('invitations')
      .select('status')
      .eq('id', pm2InvitationId)
      .single();
    expect((inv as { status: string }).status, 'the invitation was not flipped to accepted').toBe('accepted');

    // ...and the token is now spent, which is what `get_invitation_status`
    // must be able to say.
    const { data: reason } = await admin.rpc('get_invitation_status', { invite_token: pm2InviteToken });
    expect(reason).toBe('already_used');
  });

  it('⚠️ the counterfactual: the second PM EXISTS and is a PM', async () => {
    // Evaluated with `admin`. Without this the assertion above passes whenever
    // the seed silently failed to create anyone.
    const { data } = await admin
      .from('profiles')
      .select('email, role, company_id')
      .eq('id', pm2!.profileId)
      .single();
    expect((data as { role: string }).role).toBe('project_manager');
    expect((data as { company_id: string }).company_id, 'PM2 is in another company — nothing was tested').toBe(companyId);

    // ...and is assigned to a project the sub is NOT on. That is the whole point.
    expect(subProjects, 'PM2 shares the sub\'s project — the exclusion is untested').not.toContain(pm2!.projectId);
  });

  it('the OPERATIONAL roster is narrowed too — /m/team reads a different table', async () => {
    // company_members, not profiles. Narrowing one closes one surface.
    const { data } = await subC.from('company_members').select('id, profile_id');
    const rows = (data ?? []) as Array<{ id: string; profile_id: string | null }>;
    expect(rows.some((r) => r.id === pm2!.memberId), 'the sub read PM2 on the operational roster').toBe(false);
    expect(rows.some((r) => r.profile_id === subProfileId), 'the sub lost their own member row').toBe(true);
  });
});

// ============================================================================
describe('the punch consequence — the sub keeps their ITEMS, never the list', () => {
  it('⚠️ D-57 is untouched: the two items are still readable', async () => {
    const { data } = await subC.from('punch_list_items').select('id, title, punch_list_id, assignee_id');
    const rows = (data ?? []) as Array<{ title: string; punch_list_id: string; assignee_id: string | null }>;
    expect(rows.length, 'D-57 regressed — the sub lost their punch items').toBe(2);
    expect(rows.map((r) => r.title).sort()).toEqual([
      'QA D-57 ASSIGNED to the sub',
      'QA D-57 AUTHORED by the sub',
    ]);
  });

  it('⚠️ but the PARENT LIST is refused — that is the ruling', async () => {
    const { data: items } = await subC.from('punch_list_items').select('punch_list_id');
    const parentIds = Array.from(
      new Set(((items ?? []) as Array<{ punch_list_id: string }>).map((i) => i.punch_list_id))
    );
    expect(parentIds.length, 'the fixture items have no parent — nothing is being tested').toBeGreaterThan(0);

    const { data: lists } = await subC.from('punch_lists').select('id').in('id', parentIds);
    expect(lists ?? [], 'the sub read the container the ruling closes').toEqual([]);
  });

  it('⚠️ and the item-first path still renders them, with the list NAME resolved', async () => {
    // WHY THIS DRIVES THE STEPS rather than calling `getPunchLists()`: that
    // function builds a request-scoped client through `cookies()` and throws
    // outside a request — the same reason s131-punch-names.live.ts does this.
    // Same two steps, same order, same code the service defaults to.
    const { data: raw } = await subC
      .from('punch_list_items')
      .select('*')
      .eq('project_id', PROJECT_QA_A)
      .eq('is_deleted', false);

    const items = await withMemberNames((raw ?? []) as never);
    expect(items.length, 'no items to render').toBeGreaterThan(0);

    // The parent read RLS refused, exactly as the page would get it.
    const { data: readable } = await subC.from('punch_lists').select('id').eq('project_id', PROJECT_QA_A);
    const readableIds = new Set(((readable ?? []) as Array<{ id: string }>).map((l) => l.id));
    expect(readableIds.size, 'the sub can still read a list — the premise is wrong').toBe(0);

    const orphanIds = Array.from(
      new Set(items.map((i) => i.punch_list_id).filter((id): id is string => Boolean(id) && !readableIds.has(id)))
    );
    const names = await adminPunchListNameResolver()(orphanIds);

    // This is what `getPunchLists()` now composes, and what the page flattens.
    const lists = orphanIds.map((id) => ({
      id,
      name: names.get(id) ?? 'Punch list',
      items: items.filter((i) => i.punch_list_id === id),
    }));
    const allItems = lists.flatMap((l) => l.items);

    // ⚠️ FAILING-THEN-PASSING, ON THE SAME DATA, IN ONE ASSERTION PAIR.
    // The OLD composition is `lists.flatMap((l) => l.items)` over the lists RLS
    // returned — which is now none. Computed here rather than described:
    const oldShape = Array.from(readableIds).flatMap((id) =>
      items.filter((i) => i.punch_list_id === id)
    );
    expect(oldShape.length, 'the old list-first shape did NOT break — premise wrong').toBe(0);

    expect(allItems.length, 'THE REGRESSION: the sub renders zero items').toBe(items.length);
    expect(lists.every((l) => l.name && l.name !== 'Punch list'), 'a list name failed to resolve').toBe(true);
    expect(lists[0].name).toBe('QA — D-57 fixtures');
  });

  it('⚠️ the resolver cannot enumerate — it names, it does not browse', async () => {
    // The property that makes this a decoration and not a hole: it answers
    // "what is this list called?" for ids the caller already holds, and has no
    // path that answers "what lists exist on this job?".
    const empty = await adminPunchListNameResolver()([]);
    expect(empty.size).toBe(0);
  });

  it('punch_list_items.assignee_id -> company_members(id) still resolves (parent §13)', async () => {
    const { data: raw } = await subC.from('punch_list_items').select('*');
    const items = await withMemberNames((raw ?? []) as never);
    const assigned = items.filter((i) => i.assignee_id);
    expect(assigned.length, 'no assigned item to check the FK path with').toBeGreaterThan(0);
    for (const i of assigned) {
      expect(i.assignee, `assignee name blank on "${i.title}"`).not.toBeNull();
    }
  });
});

// ============================================================================
describe("slice 4's sub thread must keep working", () => {
  it('a subcontractor still reads AND posts in their own project sub thread', async () => {
    const thread = await resolveThread(subC, PROJECT_QA_A, 'sub');
    expect(thread, 'the sub lost their own sub thread').not.toBeNull();

    const { data: mine } = await subC.from('profiles').select('id').eq('email', SUB).single();

    const body = `s133 read floor ${Date.now()}`;
    const sent = await insertMessage(subC, {
      threadId: thread!.id,
      authorProfileId: (mine as { id: string }).id,
      body,
    });
    expect(sent.success, `sub could not post: ${sent.error ?? ''}`).toBe(true);

    const rows = await recentMessages(subC, thread!.id, 25);
    expect(rows.some((m) => m.body === body), 'the sub cannot read what they just posted').toBe(true);
  });
});

// ============================================================================
describe('the Owner is unaffected on all twelve — the paired positive', () => {
  it('every table still reads, including the ones seeded for this run', async () => {
    // Without this, a migration that denied EVERY role would pass every
    // assertion above.
    const ALL = [
      'client_contracts',
      'subcontractor_contracts',
      'project_budget_items',
      'purchase_orders',
      'deliveries',
      'inspections',
      'daily_logs',
      'project_contacts',
      'punch_lists',
      'punch_list_items',
      'tasks',
      'phases',
      'project_assignments',
    ];
    for (const t of ALL) {
      expect(await count(ownerC, t), `the Owner lost ${t}`).toBeGreaterThan(0);
    }
  });

  it('the Owner still reads BOTH task controls, and the whole roster', async () => {
    const { data: tasks } = await ownerC.from('tasks').select('id').in('id', [taskAssignedId, taskUnassignedId]);
    expect((tasks ?? []).length, 'the tasks branch leaked into the Owner arm').toBe(2);

    const { data: profs } = await ownerC.from('profiles').select('role');
    const roles = new Set(((profs ?? []) as Array<{ role: string }>).map((r) => r.role));
    expect(roles.has('crew_member')).toBe(true);
    expect(roles.has('client')).toBe(true);
    // Both PMs — the Owner is not project-scoped.
    const { data: pms } = await ownerC.from('profiles').select('email').eq('role', 'project_manager');
    expect((pms ?? []).length, 'the PM narrowing leaked into the Owner arm').toBe(2);
  });
});
