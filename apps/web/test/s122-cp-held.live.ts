/**
 * S122 Part 5 — HELD schedule changes. Migration 20262128000000 +
 * lib/critical-path/save.ts (the hold) + lib/critical-path/held.ts (the decision).
 *
 * [Josh, ruling 7 + 2026-10-01] A foreman's or a crew assignee's schedule change
 * on a Critical Path project is HELD — shown to everyone as pending — and moves
 * NO date until an Owner, Admin, the project's PM or its PE approves it.
 *
 *   ⚠️ LOAD-BEARING  a foreman's save leaves the task's schedule columns, the
 *                    projected finish and the history BYTE-IDENTICAL; the change
 *                    sits in task_schedule_edits.
 *   SUBMIT map       foreman and a crew ASSIGNEE may hold a change; Owner, Admin,
 *                    PE and PM may not (they edit directly); a subcontractor
 *                    assignee and a client may not.
 *   DECIDE map       Owner, Admin, PE, PM may approve; foreman, crew, sub and
 *                    client may not. Nobody approves their own.
 *   WITHDRAW         only the submitter.
 *   VISIBLE          staff and the crew assignee read it; a client reads none.
 *   APPROVE          applies the change (dates move, hand-worked), logs history
 *                    with cause `approval`; a decided change cannot be decided again.
 *   REJECT           moves nothing.
 *
 * Writes return no rows to the caller; outcomes are read with the service role.
 *   2027: Mon04 Tue05 Wed06 Thu07 Fri08   (a future Monday: the run date cannot move these)
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import type { CompanyRole } from '@framefocus/shared/types/roles';
import { forEveryRole } from '@/test-support/role-matrix';
import { recomputeProject } from '@/lib/critical-path/recompute';
import { applyCriticalPathSave } from '@/lib/critical-path/save';
import { decideScheduleEdit } from '@/lib/critical-path/held';
import { admin, assertRebuildTest, deleteProjects, sessionFor, sweepProjectsNamed, upsertContact } from './live-session';

const MARKER = 'S122CPH';
const IDENTITY: Record<CompanyRole, string> = {
  owner: 'josh+test50@worthprop.com',
  admin: 'josh+qa-admin@worthprop.com',
  project_executive: 'josh+qa-pe@worthprop.com',
  project_manager: 'josh+pm@worthprop.com',
  foreman: 'josh+qa-foreman@worthprop.com',
  crew_member: 'josh+crew@worthprop.com',
  client: 'josh+qa-client@worthprop.com',
  subcontractor: 'josh+qa-sub@worthprop.com',
};
// Who may HOLD a change (insert task_schedule_edits). Every role is on the
// project AND an assignee of the task, so a refusal is the policy's.
const MAY_SUBMIT: Record<CompanyRole, boolean> = {
  owner: false,
  admin: false,
  project_executive: false,
  project_manager: false,
  foreman: true,
  crew_member: true,
  client: false,
  subcontractor: false,
};
// Who may DECIDE (approve) someone else's held change.
const MAY_DECIDE: Record<CompanyRole, boolean> = {
  owner: true,
  admin: true,
  project_executive: true,
  project_manager: true,
  foreman: false,
  crew_member: false,
  client: false,
  subcontractor: false,
};

const db = admin as unknown as SupabaseClient<Database>;
const session = {} as Record<CompanyRole, SupabaseClient>;
const member = {} as Record<CompanyRole, string | null>;
const user = {} as Record<CompanyRole, string>;
let companyId = '';
let contactId = '';
let projectId = '';
const t: Record<'T' | 'U' | 'M', string> = { T: '', U: '', M: '' };

const must = (label: string, error: { message: string } | null) => {
  if (error) throw new Error(`${label}: ${error.message}`);
};

async function purge(id: string) {
  const { data: ts } = await admin.from('tasks').select('id').eq('project_id', id);
  const ids = (ts ?? []).map((r) => r.id as string);
  await admin.from('task_schedule_edits').delete().eq('project_id', id);
  await admin.from('project_finish_history').delete().eq('project_id', id);
  await admin.from('project_schedule_settings').delete().eq('project_id', id);
  if (ids.length) {
    await admin.from('task_dependencies').delete().in('predecessor_id', ids);
    await admin.from('task_dependencies').delete().in('successor_id', ids);
    await admin.from('task_assignees').delete().in('task_id', ids);
    await admin.from('tasks').delete().in('id', ids);
  }
  await admin.from('project_assignments').delete().eq('project_id', id);
  await deleteProjects(admin, [id]);
}

async function scheduleOf(id: string) {
  const { data } = await admin
    .from('tasks')
    .select('start_date, due_date, duration_days, days_left, days_left_as_of, start_constraint, constraint_date, status')
    .eq('id', id)
    .single();
  return data as Record<string, unknown>;
}
async function finish() {
  const { data } = await admin.from('project_schedule_settings').select('projected_finish').eq('project_id', projectId).single();
  return (data as { projected_finish: string | null }).projected_finish;
}
async function historyCount() {
  const { count } = await admin
    .from('project_finish_history')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId);
  return count ?? 0;
}
async function editsBy(memberId: string | null) {
  const { data } = await admin.from('task_schedule_edits').select('id, status, changes, summary').eq('submitted_by_member_id', memberId ?? '');
  return (data ?? []) as { id: string; status: string; changes: Record<string, unknown>; summary: string }[];
}
async function clearPending() {
  must('clear', (await admin.from('task_schedule_edits').update({ status: 'withdrawn' }).eq('project_id', projectId).eq('status', 'pending')).error);
}
/** A pending change submitted (by the service role) as `by`. */
async function seedPending(task: string, by: string, changes: Record<string, unknown> = { duration_days: 4 }) {
  const { data, error } = await admin
    .from('task_schedule_edits')
    .insert({
      company_id: companyId,
      project_id: projectId,
      task_id: task,
      submitted_by_member_id: by,
      changes,
      summary: `${MARKER} seeded`,
      status: 'pending',
    })
    .select('id')
    .single();
  must('seed pending', error);
  return data!.id as string;
}
async function statusOf(editId: string) {
  const { data } = await admin.from('task_schedule_edits').select('status, decided_by_member_id').eq('id', editId).single();
  return data as { status: string; decided_by_member_id: string | null };
}
const ctxFor = (role: CompanyRole, task: string) => ({
  projectId,
  taskId: task,
  companyId,
  userId: user[role],
  savedByMemberId: member[role],
});

beforeAll(async () => {
  assertRebuildTest();
  const { data: stale } = await admin.from('projects').select('id').like('name', `${MARKER}%`);
  for (const r of stale ?? []) await purge(r.id as string);
  await sweepProjectsNamed(MARKER);
  const { data: prof } = await admin.from('profiles').select('company_id').eq('email', IDENTITY.owner).single();
  companyId = prof!.company_id as string;
  for (const role of Object.keys(IDENTITY) as CompanyRole[]) {
    const { data: p } = await admin.from('profiles').select('id, user_id').eq('email', IDENTITY[role]).single();
    user[role] = p!.user_id as string;
    const { data: m } = await admin.from('company_members').select('id').eq('profile_id', p!.id).eq('is_deleted', false).maybeSingle();
    member[role] = (m?.id as string) ?? null;
  }
  contactId = (
    await upsertContact({
      company_id: companyId,
      contact_type: 'client',
      first_name: MARKER,
      last_name: 'Client',
      email: `${MARKER.toLowerCase()}@example.invalid`,
    })
  ).id;
  const { data: seqRow } = await admin
    .from('projects')
    .select('project_internal_seq')
    .eq('company_id', companyId)
    .order('project_internal_seq', { ascending: false })
    .limit(1)
    .single();
  const { data: proj, error: pErr } = await admin
    .from('projects')
    .insert({
      company_id: companyId,
      contact_id: contactId,
      name: `${MARKER} held`,
      status: 'active',
      project_number: `PRJ-${MARKER}`,
      project_internal_seq: (seqRow!.project_internal_seq as number) + 9300,
      start_date: '2027-01-04',
    })
    .select('id')
    .single();
  must('project', pErr);
  projectId = proj!.id as string;
  for (const role of Object.keys(IDENTITY) as CompanyRole[]) {
    if (!member[role]) continue;
    must(
      `assign ${role}`,
      (
        await admin.from('project_assignments').insert({
          company_id: companyId,
          project_id: projectId,
          member_id: member[role],
          role_on_project:
            role === 'project_executive' ? 'project_executive' : role === 'project_manager' ? 'project_manager' : null,
        })
      ).error
    );
  }
  for (const [k, d] of [['T', 3], ['U', 2], ['M', 2]] as const) {
    const { data, error } = await admin
      .from('tasks')
      .insert({ company_id: companyId, project_id: projectId, title: `${MARKER} ${k}`, duration_days: d })
      .select('id')
      .single();
    must(`task ${k}`, error);
    t[k] = data!.id as string;
  }
  // Every role with a member row is an ASSIGNEE of T and M (so a refusal is the
  // policy's, not "not on the task"); the crew member is also on U.
  for (const task of [t.T, t.M]) {
    for (const role of Object.keys(IDENTITY) as CompanyRole[]) {
      if (!member[role]) continue;
      must(`assignee ${role}`, (await admin.from('task_assignees').insert({ company_id: companyId, task_id: task, member_id: member[role] })).error);
    }
  }
  must('crew on U', (await admin.from('task_assignees').insert({ company_id: companyId, task_id: t.U, member_id: member.crew_member })).error);
  must('cp on', (await admin.from('project_schedule_settings').insert({ company_id: companyId, project_id: projectId, critical_path_enabled: true })).error);
  const r = await recomputeProject(db, projectId, { cause: { kind: 'enabled' }, now: new Date('2026-10-05T16:00:00Z') });
  if (r.status !== 'computed') throw new Error(`first compute: ${JSON.stringify(r)}`);
  for (const role of Object.keys(IDENTITY) as CompanyRole[]) session[role] = await sessionFor(IDENTITY[role]);
}, 300_000);

afterAll(async () => {
  if (projectId) await purge(projectId);
  const { count } = await admin.from('projects').select('id', { count: 'exact', head: true }).like('name', `${MARKER}%`);
  expect(count ?? 0).toBe(0);
}, 300_000);

describe('the first computation (the fixture is real)', () => {
  it('T Mon04–Wed06, U Mon04–Tue05, M Mon04–Tue05; finish Wed 6 Jan 2027', async () => {
    expect(await scheduleOf(t.T)).toMatchObject({ start_date: '2027-01-04', due_date: '2027-01-06', duration_days: 3 });
    expect(await scheduleOf(t.U)).toMatchObject({ start_date: '2027-01-04', due_date: '2027-01-05' });
    expect(await finish()).toBe('2027-01-06');
  });
});

describe('⚠️ LOAD-BEARING — a held change moves NOTHING (stop rule 9)', () => {
  it("a foreman's duration change: the task, the finish and the history are byte-identical; the change is held", async () => {
    await clearPending();
    const before = await scheduleOf(t.T);
    const finishBefore = await finish();
    const historyBefore = await historyCount();
    const heldBefore = (await editsBy(member.foreman)).length;

    const r = await applyCriticalPathSave(session.foreman as SupabaseClient<Database>, db, ctxFor('foreman', t.T), { duration_days: 5 });
    expect(r).toMatchObject({ ok: true, held: true });

    expect(await scheduleOf(t.T), 'the task row is untouched').toEqual(before);
    expect(await finish(), 'the projected finish is untouched').toBe(finishBefore);
    expect(await historyCount(), 'no history row').toBe(historyBefore);
    const held = await editsBy(member.foreman);
    expect(held.length, 'exactly one held change').toBe(heldBefore + 1);
    const mine = held.find((h) => h.status === 'pending')!;
    expect(mine.changes).toEqual({ duration_days: 5 });
    expect(mine.summary).toContain('Changes the DURATION: 3 working days → 5 working days.');
  });

  it('a crew ASSIGNEE: their status change LANDS (Q12-A), their duration change is HELD', async () => {
    const before = await scheduleOf(t.U);
    const r = await applyCriticalPathSave(session.crew_member as SupabaseClient<Database>, db, ctxFor('crew_member', t.U), {
      status: 'in_progress',
      duration_days: 6,
    });
    expect(r).toMatchObject({ ok: true, held: true });
    const after = await scheduleOf(t.U);
    expect(after.status, 'status is theirs').toBe('in_progress');
    expect(after.duration_days, 'duration is held').toBe(before.duration_days);
    const held = (await editsBy(member.crew_member)).find((h) => h.status === 'pending');
    expect(held?.changes).toEqual({ duration_days: 6 });
  });

  it('a save that changes nothing about the schedule holds nothing', async () => {
    const heldBefore = (await editsBy(member.foreman)).length;
    const cur = await scheduleOf(t.M);
    const r = await applyCriticalPathSave(session.foreman as SupabaseClient<Database>, db, ctxFor('foreman', t.M), {
      duration_days: cur.duration_days as number,
      start_constraint: null,
      constraint_date: null,
    });
    expect(r).toMatchObject({ ok: true, held: false });
    expect((await editsBy(member.foreman)).length).toBe(heldBefore);
  });
});

describe('SUBMIT — who may hold a change (total map; written WITHOUT returning rows)', () => {
  forEveryRole(MAY_SUBMIT, (role, allowed) => {
    it(`${role} ${allowed ? 'MAY' : 'may NOT'} hold a change`, async () => {
      await clearPending();
      const before = (await editsBy(member[role])).filter((e) => e.status === 'pending').length;
      await session[role].from('task_schedule_edits').insert({
        task_id: t.M,
        project_id: projectId,
        submitted_by_member_id: member[role],
        changes: { duration_days: 9 },
        summary: `${MARKER} ${role}`,
      });
      const after = (await editsBy(member[role])).filter((e) => e.status === 'pending').length;
      expect(after - before).toBe(allowed ? 1 : 0);
    });
  });
});

describe('DECIDE — who may approve someone else\'s held change (total map)', () => {
  forEveryRole(MAY_DECIDE, (role, allowed) => {
    it(`${role} ${allowed ? 'MAY' : 'may NOT'} approve the foreman's change`, async () => {
      await clearPending();
      // The submitter is the foreman — except when the foreman is the one deciding,
      // then the crew member submits (so the foreman's refusal is the role's, not self-approval).
      const by = role === 'foreman' ? member.crew_member! : member.foreman!;
      const id = await seedPending(t.M, by);
      await session[role].from('task_schedule_edits').update({ status: 'approved' }).eq('id', id);
      const s = await statusOf(id);
      expect(s.status).toBe(allowed ? 'approved' : 'pending');
      if (allowed) expect(s.decided_by_member_id, 'the decider is stamped by the database').toBe(member[role]);
    });
  });

  it('NOBODY approves their own: a PM-submitted change, the PM approving → still pending', async () => {
    await clearPending();
    const id = await seedPending(t.M, member.project_manager!);
    await session.project_manager.from('task_schedule_edits').update({ status: 'approved' }).eq('id', id);
    expect((await statusOf(id)).status).toBe('pending');
  });

  it('WITHDRAW is the submitter\'s only: the Owner cannot, the foreman can', async () => {
    await clearPending();
    const id = await seedPending(t.M, member.foreman!);
    await session.owner.from('task_schedule_edits').update({ status: 'withdrawn' }).eq('id', id);
    expect((await statusOf(id)).status).toBe('pending');
    await session.foreman.from('task_schedule_edits').update({ status: 'withdrawn' }).eq('id', id);
    expect((await statusOf(id)).status).toBe('withdrawn');
  });
});

describe('VISIBLE — shown to everyone on the project, never to a client', () => {
  it('owner, PM, foreman and the crew assignee read the held change; the client reads none', async () => {
    await clearPending();
    const id = await seedPending(t.T, member.foreman!);
    for (const role of ['owner', 'project_manager', 'foreman', 'crew_member'] as const) {
      const { data } = await session[role].from('task_schedule_edits').select('id').eq('id', id);
      expect(data?.length ?? 0, `${role} sees it`).toBe(1);
    }
    const { data: c } = await session.client.from('task_schedule_edits').select('id').eq('id', id);
    expect(c?.length ?? 0, 'the client sees none').toBe(0);
  });
});

describe('APPROVE applies it; REJECT moves nothing', () => {
  it("approving the foreman's duration 3 → 5: T Mon04–Fri08, finish Fri 8 Jan, history `approval`", async () => {
    await clearPending();
    const held = await applyCriticalPathSave(session.foreman as SupabaseClient<Database>, db, ctxFor('foreman', t.T), { duration_days: 5 });
    expect(held).toMatchObject({ ok: true, held: true });
    const id = (await editsBy(member.foreman)).find((e) => e.status === 'pending')!.id;
    const historyBefore = await historyCount();

    const d = await decideScheduleEdit(
      session.owner as SupabaseClient<Database>,
      db,
      { projectId, editId: id, userId: user.owner, myMemberId: member.owner },
      'approve',
      null
    );
    expect(d).toEqual({ ok: true });
    expect(await scheduleOf(t.T)).toMatchObject({ duration_days: 5, start_date: '2027-01-04', due_date: '2027-01-08' });
    expect(await finish()).toBe('2027-01-08');
    expect(await historyCount()).toBe(historyBefore + 1);
    const { data: h } = await admin
      .from('project_finish_history')
      .select('previous_finish, new_finish, cause_kind, cause_task_id')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    expect(h).toEqual({ previous_finish: '2027-01-06', new_finish: '2027-01-08', cause_kind: 'approval', cause_task_id: t.T });
    expect(await statusOf(id)).toEqual({ status: 'approved', decided_by_member_id: member.owner });

    const again = await decideScheduleEdit(
      session.owner as SupabaseClient<Database>,
      db,
      { projectId, editId: id, userId: user.owner, myMemberId: member.owner },
      'reject',
      null
    );
    expect(again).toMatchObject({ ok: false, status: 409 });
  });

  it('rejecting a held change leaves the task as it was', async () => {
    await clearPending();
    const before = await scheduleOf(t.T);
    await applyCriticalPathSave(session.foreman as SupabaseClient<Database>, db, ctxFor('foreman', t.T), { duration_days: 2 });
    const id = (await editsBy(member.foreman)).find((e) => e.status === 'pending')!.id;
    const d = await decideScheduleEdit(
      session.admin as SupabaseClient<Database>,
      db,
      { projectId, editId: id, userId: user.admin, myMemberId: member.admin },
      'reject',
      'not yet'
    );
    expect(d).toEqual({ ok: true });
    expect(await scheduleOf(t.T)).toEqual(before);
    expect((await statusOf(id)).status).toBe('rejected');
  });
});
