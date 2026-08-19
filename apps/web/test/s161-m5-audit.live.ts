/**
 * S161 — Module 5 (Project Management) whole-system audit. Pass 5 of 11.
 *
 * Findings document: `docs/specs/S161-m5-audit.md`.
 *
 * ⚠️ THIS HARNESS ASSERTS DEFECTS. Most of what follows is written the "wrong"
 * way round on purpose — it pins the behaviour that is WRONG today so that a
 * fix session inverts it rather than writing a fresh test. Every such case says
 * so in its own comment and names what the inverted assertion should be. That
 * is the convention S155 set and S157 turned into a CLAUDE.md rule.
 *
 * ---------------------------------------------------------------------------
 * TWO METHOD NOTES, BOTH PAID FOR DURING THIS PASS
 * ---------------------------------------------------------------------------
 * 1. **`.select()` after an INSERT compiles to `INSERT … RETURNING`, and a
 *    42501 from that is RLS refusing the READ, not the insert.** Three probes
 *    in this pass first came back "denied" and were not: the row was refused
 *    only on the way back. Every insert probe below runs WITHOUT `.select()`
 *    and confirms the outcome with a service-role read. CLAUDE.md documents
 *    this trap; it still cost three false negatives.
 * 2. **The SELECT policy participates in UPDATE.** `change_orders_update_authorized`
 *    and `punch_lists_update_authenticated` both read, on their face, as
 *    write-without-read holes. They are not, because a row the caller cannot
 *    SELECT is not updatable either. That is asserted here (Group F) rather
 *    than assumed, because it is the reason two policies that look wrong are
 *    safe — and it is load-bearing: widen the SELECT and the UPDATE widens
 *    with it, silently.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { admin, assertRebuildTest, sessionFor } from './live-session';

const OWNER = 'josh+test50@worthprop.com';
const PM = 'josh+pm@worthprop.com';
const FOREMAN = 'josh+qa-foreman@worthprop.com';
const CREW = 'josh+crew@worthprop.com';
const SUB = 'josh+qa-sub@worthprop.com';
const B_OWNER = 'josh+qa-b-owner@worthprop.com';

const MARKER = 'S161PROBE';

let owner: SupabaseClient;
let pm: SupabaseClient;
let foreman: SupabaseClient;
let crew: SupabaseClient;
let sub: SupabaseClient;
let bOwner: SupabaseClient;

interface Ident {
  profileId: string;
  userId: string;
  companyId: string;
  memberId: string | null;
}
let pmId: Ident;
let fmId: Ident;
let subId: Ident;
let boId: Ident;

const must = (label: string, error: { message: string } | null) => {
  if (error) throw new Error(`${label}: ${error.message}`);
};

async function identOf(email: string): Promise<Ident> {
  const { data: p } = await admin
    .from('profiles')
    .select('id, user_id, company_id')
    .eq('email', email)
    .single();
  const prof = p as { id: string; user_id: string; company_id: string };
  const { data: m } = await admin
    .from('company_members')
    .select('id')
    .eq('profile_id', prof.id)
    .maybeSingle();
  return {
    profileId: prof.id,
    userId: prof.user_id,
    companyId: prof.company_id,
    memberId: m ? (m as { id: string }).id : null,
  };
}

/** Project ids a member is assigned to, live. */
async function assignedProjects(memberId: string): Promise<string[]> {
  const { data } = await admin
    .from('project_assignments')
    .select('project_id')
    .eq('member_id', memberId)
    .eq('is_deleted', false);
  return ((data ?? []) as { project_id: string }[]).map((r) => r.project_id);
}

async function sweep(): Promise<void> {
  must(
    'sweep schedule_entries',
    (await admin.from('schedule_entries').delete().like('notes', `${MARKER}%`)).error
  );
  must(
    'sweep punch_list_items',
    (await admin.from('punch_list_items').delete().like('title', `${MARKER}%`)).error
  );
  must(
    'sweep punch_lists',
    (await admin.from('punch_lists').delete().like('name', `${MARKER}%`)).error
  );
}

beforeAll(async () => {
  assertRebuildTest();
  [owner, pm, foreman, crew, sub, bOwner] = await Promise.all([
    sessionFor(OWNER),
    sessionFor(PM),
    sessionFor(FOREMAN),
    sessionFor(CREW),
    sessionFor(SUB),
    sessionFor(B_OWNER),
  ]);
  [pmId, fmId, subId, boId] = await Promise.all([
    identOf(PM),
    identOf(FOREMAN),
    identOf(SUB),
    identOf(B_OWNER),
  ]);
  await sweep();
}, 240_000);

afterAll(async () => {
  await sweep();
}, 240_000);

// ============================================================================
// GROUP A — M5-01. The CO signing token is readable by a PM for change orders
//                  the same PM cannot see.
// ============================================================================

describe('S161-A — M5-01: co_signing_sessions leaks the signing credential', () => {
  it('A1 — the fixture is non-vacuous: sessions and change orders both exist', async () => {
    // Without this, A2 could "pass" against an empty table — the vacuous shape
    // the M9 interview audit found across a whole suite.
    const { count: sessions } = await admin
      .from('co_signing_sessions')
      .select('*', { count: 'exact', head: true });
    const { count: cos } = await admin
      .from('change_orders')
      .select('*', { count: 'exact', head: true });
    expect(sessions ?? 0, 'no co_signing_sessions to probe').toBeGreaterThan(0);
    expect(cos ?? 0, 'no change_orders to probe').toBeGreaterThan(0);
  });

  it('⚠️ A2 — ASSERTS THE DEFECT: a PM reads MORE signing sessions than change orders', async () => {
    // `co_signing_sessions_select_manager` is
    //   company_id = get_my_company_id() AND role IN (owner, admin, project_manager)
    // — no project test, no change-order test. `change_orders_select_visible`
    // is the S121 read floor: owner/admin, or a PM's OWN authored CO.
    //
    // The two disagree, and the wider one carries `token`.
    const { data: sessions } = await pm
      .from('co_signing_sessions')
      .select('id, token, change_order_id');
    const { data: readableCos } = await pm.from('change_orders').select('id');

    const sess = (sessions ?? []) as { id: string; token: string; change_order_id: string }[];
    const readable = new Set(((readableCos ?? []) as { id: string }[]).map((r) => r.id));
    const orphaned = sess.filter((s) => !readable.has(s.change_order_id));

    // WHEN FIXED, INVERT: expect(orphaned).toHaveLength(0).
    expect(
      orphaned.length,
      'a PM no longer reads signing sessions for change orders it cannot see — invert this test'
    ).toBeGreaterThan(0);
    expect(
      sess.length,
      'the PM reads no sessions at all — re-read A1, the fixture may have gone'
    ).toBeGreaterThan(readable.size);
  });

  it('⚠️ A3 — and every one of those rows carries a usable `token`', async () => {
    // `/sign-co/[token]` is unauthenticated by design — its own route header
    // says "No auth: the token is the credential." So reading the token is
    // equivalent to being able to sign the change order AS THE CLIENT.
    const { data: sessions } = await pm.from('co_signing_sessions').select('id, token, status');
    const withToken = ((sessions ?? []) as { token: string | null }[]).filter(
      (s) => typeof s.token === 'string' && s.token.length > 0
    );
    expect(withToken.length, 'no tokens are exposed — invert this test').toBeGreaterThan(0);
  });

  it('A4 — the counterfactual: foreman, crew and subcontractor read ZERO', async () => {
    // Without this, A2/A3 could be describing a table with no floor at all
    // rather than a floor that is one role too wide. The floor works; it is
    // the `project_manager` arm that is wrong.
    for (const [name, client] of [
      ['foreman', foreman],
      ['crew', crew],
      ['subcontractor', sub],
    ] as const) {
      const { data } = await client.from('co_signing_sessions').select('id');
      expect((data ?? []).length, `${name} can read co_signing_sessions`).toBe(0);
    }
  });

  it('A5 — the two sibling tables are NOT this wide, which is the argument', async () => {
    // M4's `signing_sessions_select_manager` and M7I's
    // `contract_signing_sessions_select_owner_admin` are both owner/admin.
    // Three signing flows, three tables, one of them wider by exactly one role.
    for (const t of ['signing_sessions', 'contract_signing_sessions']) {
      const { data } = await pm.from(t).select('id');
      expect((data ?? []).length, `${t} is also readable by a PM`).toBe(0);
    }
  });
});

// ============================================================================
// GROUP B — M5-02. Project-status rules are service-layer only.
// ============================================================================

describe('S161-B — M5-02: the DB does not backstop the status rules', () => {
  it('⚠️ B1 — ASSERTS THE DEFECT: an assigned PM reopens a COMPLETE project directly', async () => {
    // `transitionProjectStatus()` restricts complete -> active to Owner/Admin
    // (7A §3.4). `projects_update_authorized` does not — it admits an assigned
    // PM for any column except the four `enforce_projects_column_scope`
    // freezes, and `status` is not one of them.
    const { data: pmProjects } = await pm.from('projects').select('id, name, status');
    const projects = (pmProjects ?? []) as { id: string; name: string; status: string }[];
    expect(projects.length, 'the PM is assigned to nothing — fixture broken').toBeGreaterThan(0);

    const target = projects.find((p) => p.status === 'complete') ?? projects[0];
    const original = target.status;
    if (original !== 'complete') {
      must(
        'seed complete',
        (await admin.from('projects').update({ status: 'complete' }).eq('id', target.id)).error
      );
    }

    const { data: reopened, error } = await pm
      .from('projects')
      .update({ status: 'active' })
      .eq('id', target.id)
      .select('id, status');

    // WHEN FIXED, INVERT: expect the write to affect zero rows, or to raise.
    expect(error, `the reopen errored: ${error?.message}`).toBeNull();
    expect(
      (reopened ?? []).length,
      'a PM can no longer reopen a completed project at the database — invert this test'
    ).toBe(1);
    expect((reopened as { status: string }[])[0].status).toBe('active');

    must(
      'restore status',
      (await admin.from('projects').update({ status: original }).eq('id', target.id)).error
    );
  });

  it('⚠️ B2 — ASSERTS THE DEFECT: the punch gate is bypassed by writing `status` directly', async () => {
    // `checkPunchGate()` blocks active -> complete while any punch item is open
    // or awaiting verification (5A §2, 5C §6). It runs in the browser. The
    // database has no equivalent.
    const { data: openItems } = await admin
      .from('punch_list_items')
      .select('project_id')
      .eq('is_deleted', false)
      .in('status', ['open', 'in_progress']);
    const blocked = new Set(((openItems ?? []) as { project_id: string }[]).map((r) => r.project_id));

    const { data: pmProjects } = await pm.from('projects').select('id, name, status');
    const candidates = ((pmProjects ?? []) as { id: string; status: string }[]).filter((p) =>
      blocked.has(p.id)
    );
    expect(
      candidates.length,
      'no PM-writable project currently has open punch items — unverified this run'
    ).toBeGreaterThan(0);

    const target = candidates[0];
    const original = target.status;
    const { data: completed, error } = await pm
      .from('projects')
      .update({ status: 'complete' })
      .eq('id', target.id)
      .select('id, status');

    // WHEN FIXED, INVERT: a trigger should refuse this.
    expect(error, 'the gate now refuses at the database').toBeNull();
    expect(
      (completed ?? []).length,
      'the punch gate is now enforced in the database — invert this test'
    ).toBe(1);

    must(
      'restore status',
      (await admin.from('projects').update({ status: original }).eq('id', target.id)).error
    );
  });

  it('B3 — the counterfactual: the column-scope trigger DOES freeze the financial terms', async () => {
    // This is what makes B1/B2 a gap rather than a design. `projects` already
    // carries a BEFORE UPDATE trigger, `enforce_projects_column_scope`, which
    // raises for a non-owner/admin touching retainage_percent, tax_rate,
    // source_estimate_id or qb_sub_customer_id. The mechanism exists and
    // `status` is simply not in it.
    const { data: pmProjects } = await pm.from('projects').select('id, retainage_percent');
    const target = ((pmProjects ?? []) as { id: string; retainage_percent: number | null }[])[0];
    const { error } = await pm
      .from('projects')
      .update({ retainage_percent: (target.retainage_percent ?? 0) + 1 })
      .eq('id', target.id);
    expect(error, 'the financial freeze no longer raises — re-read B1/B2').not.toBeNull();
    expect(error!.message).toMatch(/financial terms|Owner\/Admin/i);
  });

  it('B4 — a foreman’s status write is DISCARDED, and silently: 0 rows, no error', async () => {
    // The other half of M5-03. `transitionProjectStatus()` checks `error` and
    // nothing else, so this returns { success: true } to a foreman while the
    // project does not move.
    const { data: fProjects } = await foreman.from('projects').select('id, status');
    const target = ((fProjects ?? []) as { id: string; status: string }[])[0];
    expect(target, 'the foreman is assigned to nothing — fixture broken').toBeDefined();

    const { data: rows, error } = await foreman
      .from('projects')
      .update({ status: target.status === 'active' ? 'on_hold' : 'active' })
      .eq('id', target.id)
      .select('id');

    expect(error, 'a discarded write now raises — good, invert this').toBeNull();
    expect((rows ?? []).length, 'the foreman write was applied').toBe(0);

    const { data: after } = await admin
      .from('projects')
      .select('status')
      .eq('id', target.id)
      .single();
    expect((after as { status: string }).status, 'the project moved').toBe(target.status);
  });
});

// ============================================================================
// GROUP C — M5-04. schedule_entries has no project scoping.
// ============================================================================

describe('S161-C — M5-04: schedule_entries ignores project assignment', () => {
  it('⚠️ C1 — ASSERTS THE DEFECT: a foreman schedules onto a project they are not on', async () => {
    // Every other project-scoped M5 table tests `can_view_project(project_id)`.
    // `schedule_entries`' three policies never mention it: SELECT is
    // role-or-own-member, INSERT and UPDATE are role-only.
    const assigned = new Set(await assignedProjects(fmId.memberId!));
    const { data: all } = await admin
      .from('projects')
      .select('id, name')
      .eq('company_id', fmId.companyId)
      .eq('is_deleted', false);
    const foreign = ((all ?? []) as { id: string; name: string }[]).find((p) => !assigned.has(p.id));
    expect(foreign, 'every project is assigned to the foreman — cannot probe').toBeDefined();

    // ⚠️ NO `.select()`. See the file header: an `INSERT … RETURNING` refusal
    // would look like the insert being refused, and here it would invert the
    // finding.
    const { error } = await foreman.from('schedule_entries').insert({
      project_id: foreign!.id,
      member_id: fmId.memberId,
      entry_date: '2026-09-01',
      general_kind: 'project',
      notes: `${MARKER} unassigned-project`,
    });

    // WHEN FIXED, INVERT: expect an RLS refusal.
    expect(error, `the insert was refused: ${error?.code}`).toBeNull();

    const { data: landed } = await admin
      .from('schedule_entries')
      .select('id, project_id')
      .eq('notes', `${MARKER} unassigned-project`);
    expect((landed ?? []).length, 'the row did not land — re-read C1').toBe(1);
    expect((landed as { project_id: string }[])[0].project_id).toBe(foreign!.id);
  });

  it('⚠️ C2 — and the foreman can read it back and edit it', async () => {
    const { data: readBack } = await foreman
      .from('schedule_entries')
      .select('id')
      .eq('notes', `${MARKER} unassigned-project`);
    expect((readBack ?? []).length, 'the foreman cannot read it — invert C1/C2 together').toBe(1);

    const id = (readBack as { id: string }[])[0].id;
    const { data: updated } = await foreman
      .from('schedule_entries')
      .update({ notes: `${MARKER} unassigned-project edited` })
      .eq('id', id)
      .select('id');
    expect((updated ?? []).length, 'the foreman cannot edit it').toBe(1);
  });

  it('C3 — the counterfactual: the SAME foreman is refused on a table that DOES scope', async () => {
    // Without this, C1 might be showing a foreman with company-wide write
    // everywhere rather than a gap specific to schedule_entries.
    const assigned = new Set(await assignedProjects(fmId.memberId!));
    const { data: all } = await admin
      .from('projects')
      .select('id')
      .eq('company_id', fmId.companyId)
      .eq('is_deleted', false);
    const foreign = ((all ?? []) as { id: string }[]).find((p) => !assigned.has(p.id))!;

    const { error } = await foreman.from('tasks').insert({
      project_id: foreign.id,
      title: `${MARKER} should-be-refused`,
      status: 'todo',
    });
    expect(error, 'tasks accepted a write on an unassigned project too').not.toBeNull();

    const { data: leaked } = await admin
      .from('tasks')
      .select('id')
      .eq('title', `${MARKER} should-be-refused`);
    expect((leaked ?? []).length, 'a task landed on an unassigned project').toBe(0);
  });
});

// ============================================================================
// GROUP D — M5-05. punch_lists is write-without-read for a subcontractor.
// ============================================================================

describe('S161-D — M5-05: a subcontractor creates punch data it cannot see', () => {
  it('⚠️ D1 — ASSERTS THE DEFECT: sub INSERTs a punch list, then reads zero', async () => {
    // `punch_lists_insert_authenticated` is `company_id AND can_view_project()`
    // with NO role floor, and an assigned subcontractor passes
    // `can_view_project`. `punch_lists_select_visible` excludes subcontractor.
    // So the row lands and its author cannot see, correct or remove it.
    const pids = await assignedProjects(subId.memberId!);
    expect(pids.length, 'the subcontractor is assigned to nothing').toBeGreaterThan(0);

    const { error } = await sub
      .from('punch_lists')
      .insert({ project_id: pids[0], name: `${MARKER} sub-created` });

    // WHEN FIXED, INVERT: either the insert is refused (add a role floor to
    // INSERT) or the row becomes readable (widen SELECT). Both are rulings.
    expect(error, `the insert was refused: ${error?.code}`).toBeNull();

    const { data: landed } = await admin
      .from('punch_lists')
      .select('id')
      .eq('name', `${MARKER} sub-created`);
    expect((landed ?? []).length, 'the row did not land').toBe(1);

    const { data: readBack } = await sub
      .from('punch_lists')
      .select('id')
      .eq('name', `${MARKER} sub-created`);
    expect(
      (readBack ?? []).length,
      'the subcontractor can now read its own punch list — invert this test'
    ).toBe(0);
  });

  it('⚠️ D2 — the same for punch_list_items', async () => {
    const pids = await assignedProjects(subId.memberId!);
    const { data: list } = await admin
      .from('punch_lists')
      .select('id')
      .eq('name', `${MARKER} sub-created`)
      .single();

    const { error } = await sub.from('punch_list_items').insert({
      project_id: pids[0],
      punch_list_id: (list as { id: string }).id,
      title: `${MARKER} sub-item`,
      status: 'open',
    });
    expect(error, `refused: ${error?.code}`).toBeNull();

    const { data: landed } = await admin
      .from('punch_list_items')
      .select('id, created_by')
      .eq('title', `${MARKER} sub-item`);
    expect((landed ?? []).length).toBe(1);

    // ⚠️ THE ITEM *IS* READABLE — `punch_list_items_select_visible` has a
    // `created_by = auth.uid()` arm that `punch_lists` lacks. So the child is
    // visible and the parent is not, which is the inconsistency rather than a
    // second copy of D1.
    const { data: readBack } = await sub
      .from('punch_list_items')
      .select('id')
      .eq('title', `${MARKER} sub-item`);
    expect(
      (readBack ?? []).length,
      'the item is now invisible too — the parent/child asymmetry is gone, re-read D2'
    ).toBe(1);
  });

  it('D3 — the counterfactual: a CREW member can read what it creates', async () => {
    // Crew passes `can_view_project` and is not excluded by the SELECT policy,
    // so the same INSERT is followed by a successful read. The defect is
    // specific to the role the SELECT policy excludes.
    const pids = await assignedProjects((await identOf(CREW)).memberId!);
    expect(pids.length, 'crew is assigned to nothing').toBeGreaterThan(0);
    const { error } = await crew
      .from('punch_lists')
      .insert({ project_id: pids[0], name: `${MARKER} crew-created` });
    expect(error, `crew insert refused: ${error?.code}`).toBeNull();
    const { data: readBack } = await crew
      .from('punch_lists')
      .select('id')
      .eq('name', `${MARKER} crew-created`);
    expect((readBack ?? []).length, 'crew cannot read its own punch list either').toBe(1);
  });
});

// ============================================================================
// GROUP E — M5-06. A cross-tenant project_assignments row is insertable.
// ============================================================================

describe('S161-E — M5-06: project_assignments does not check the project’s company', () => {
  it('⚠️ E1 — ASSERTS THE DEFECT: company B’s owner assigns onto company A’s project', async () => {
    // `project_assignments_insert_authorized`'s owner/admin arm is
    // `company_id = get_my_company_id() AND role IN (owner, admin)` — the
    // company test is on the ASSIGNMENT ROW's own column, never on the
    // project's. Every sibling table gates on `can_view_project(project_id)`,
    // which does check the project's company.
    expect(boId.memberId, 'company B owner has no member row — cannot probe').not.toBeNull();
    const { data: aProject } = await admin
      .from('projects')
      .select('id, company_id')
      .eq('company_id', pmId.companyId)
      .eq('is_deleted', false)
      .limit(1)
      .single();
    const proj = aProject as { id: string; company_id: string };
    expect(proj.company_id, 'the two identities are in the same company').not.toBe(boId.companyId);

    // No `.select()` — see the header.
    const { error } = await bOwner
      .from('project_assignments')
      .insert({ project_id: proj.id, member_id: boId.memberId });

    // WHEN FIXED, INVERT: expect an RLS refusal.
    expect(error, `refused: ${error?.code}`).toBeNull();

    const { data: landed } = await admin
      .from('project_assignments')
      .select('id, company_id, project_id')
      .eq('member_id', boId.memberId!)
      .eq('project_id', proj.id);
    expect((landed ?? []).length, 'the cross-tenant row did not land').toBe(1);
    const row = (landed as { id: string; company_id: string }[])[0];
    expect(row.company_id, 'the row is not actually cross-tenant').toBe(boId.companyId);

    // ── AND THE REASON IT IS LATENT RATHER THAN REACHABLE ──────────────────
    // Every consumer of `is_assigned_to_project()` re-checks the company
    // alongside it, so the row grants nothing. That is defence in depth doing
    // its job, and it is why this is filed as latent — but it means the
    // system's tenancy boundary here rests on OTHER policies rather than on
    // this one.
    const { data: leakedProject } = await bOwner.from('projects').select('id').eq('id', proj.id);
    expect((leakedProject ?? []).length, "company A's project leaked to company B").toBe(0);
    const { data: leakedTasks } = await bOwner.from('tasks').select('id').eq('project_id', proj.id);
    expect((leakedTasks ?? []).length, "company A's tasks leaked to company B").toBe(0);

    must(
      'cleanup cross-tenant assignment',
      (await admin.from('project_assignments').delete().eq('id', row.id)).error
    );
  });
});

// ============================================================================
// GROUP F — what was checked and found SOUND. Recorded so a later pass does
//           not re-derive it, and so a regression has somewhere to fail.
// ============================================================================

describe('S161-F — the M5 guarantees that hold', () => {
  it('F1 — no DELETE policy anywhere in M5: a real row survives an owner’s DELETE', async () => {
    // Proven on a REAL row with an exact count. A DELETE against a
    // non-matching id also reports 0 and proves nothing — that was the first
    // version of this probe.
    const { data: proj } = await admin
      .from('projects')
      .select('id')
      .eq('company_id', pmId.companyId)
      .limit(1)
      .single();
    const { data: seed, error: sErr } = await admin
      .from('punch_lists')
      .insert({
        company_id: pmId.companyId,
        project_id: (proj as { id: string }).id,
        name: `${MARKER} deletable`,
      })
      .select('id')
      .single();
    must('seed', sErr);

    const seedId = (seed as { id: string }).id;
    const { count } = await owner
      .from('punch_lists')
      .delete({ count: 'exact' })
      .eq('id', seedId);
    expect(count ?? 0, 'an owner hard-deleted a punch list').toBe(0);

    const { data: still } = await admin.from('punch_lists').select('id').eq('id', seedId);
    expect((still ?? []).length, 'the row is gone — a DELETE policy appeared').toBe(1);
  });

  it('F2 — the SELECT policy participates in UPDATE: a PM cannot write a CO it cannot read', async () => {
    // `change_orders_update_authorized` is role-only — on its face a
    // write-without-read hole. It is not, and this is the assertion that says
    // why. ⚠️ IT IS ALSO A COUPLING: widen `change_orders_select_visible` and
    // this silently widens with it.
    const { data: readable } = await pm.from('change_orders').select('id');
    const readableIds = new Set(((readable ?? []) as { id: string }[]).map((r) => r.id));
    const { data: all } = await admin.from('change_orders').select('id, title');
    const target = ((all ?? []) as { id: string; title: string }[]).find(
      (c) => !readableIds.has(c.id)
    );
    expect(target, 'the PM can read every change order — cannot probe').toBeDefined();

    const { data: rows, error } = await pm
      .from('change_orders')
      .update({ title: `${MARKER}-OVERWRITTEN` })
      .eq('id', target!.id)
      .select('id');
    expect(error, 'the write raised rather than matching nothing').toBeNull();
    expect((rows ?? []).length, 'a PM updated a change order it cannot read').toBe(0);

    const { data: after } = await admin
      .from('change_orders')
      .select('title')
      .eq('id', target!.id)
      .single();
    expect((after as { title: string }).title, 'the title changed').toBe(target!.title);
  });

  it('F3 — a client is refused by the ABSENCE of a member row, not by any rule', async () => {
    // 9-spec §2's finding, confirmed from M5's side and quantified in the
    // findings document: 51 of the 68 policies gated by `can_view_project`
    // never mention `client`.
    const { data: clientProfile } = await admin
      .from('profiles')
      .select('id, role')
      .eq('role', 'client')
      .eq('is_deleted', false)
      .limit(1)
      .maybeSingle();
    expect(clientProfile, 'no client profile exists — unverified').not.toBeNull();

    const { data: member } = await admin
      .from('company_members')
      .select('id')
      .eq('profile_id', (clientProfile as { id: string }).id)
      .maybeSingle();
    expect(member, 'a client now HAS a member row — 51 policies just opened').toBeNull();
  });

  it('F4 — the reassign trap is handled: UNIQUE(project_id, member_id) has no is_deleted arm', async () => {
    // Unassign soft-deletes; the unique index does not exclude deleted rows, so
    // a naive re-INSERT would raise 23505 forever. `upsertProjectAssignmentAsCaller`
    // revives instead. Asserted because the constraint alone reads like a bug.
    const { data: deleted } = await admin
      .from('project_assignments')
      .select('project_id, member_id')
      .eq('is_deleted', true)
      .limit(1)
      .maybeSingle();
    if (!deleted) {
      // Nothing soft-deleted right now; the constraint shape is asserted in the
      // findings document from pg_constraint instead.
      expect(true).toBe(true);
      return;
    }
    const d = deleted as { project_id: string; member_id: string };
    const { error } = await admin
      .from('project_assignments')
      .insert({ project_id: d.project_id, member_id: d.member_id });
    expect(error?.code, 'a duplicate assignment INSERT no longer raises 23505').toBe('23505');
  });
});
