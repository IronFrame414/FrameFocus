/**
 * S122 Part 1 — the Critical Path schema. Migrations 20262124/25/26000000.
 *
 *   NULLS      the new task columns exist and every pre-existing row is NULL
 *              (stop rule 10: nothing backfilled from dates).
 *   CHECKS     on the NEW columns only (Q8-A): duration 1–3650, days_left
 *              paired with its as-of, a constraint paired with its date.
 *   DEPS       delete-then-re-add the same pair WORKS (the live-row key);
 *              a loop is REFUSED by the database (2-cycle and 3-cycle); a
 *              cross-project link is refused.
 *   Q12-A      on a CRITICAL PATH project: TOTAL MAP over every role for a
 *              direct date write — Owner/Admin/PM/PE allowed, foreman and a
 *              crew ASSIGNEE refused (judged by the service role). CONTROL: the
 *              same foreman write on the same project with Critical Path OFF
 *              lands (S121's rules unchanged). Crew keep status.
 *   HISTORY    no user role can write project_finish_history (service-role
 *              count); the service role can.
 *   SETTINGS   a user cannot set the engine's columns (computed_on,
 *              projected_finish); turning Critical Path on stamps enabled_at.
 *   DIRTY      a crew status change on a CP project marks needs_recompute; the
 *              service role's write-through does not; a company holiday marks
 *              every CP project in the company.
 *   WEATHER    a lost day needs a reason and one of the five icons.
 *
 * Writes return no rows to the caller; outcomes are read with the service role.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CompanyRole } from '@framefocus/shared/types/roles';
import { forEveryRole } from '@/test-support/role-matrix';
import {
  admin,
  assertRebuildTest,
  deleteProjects,
  sessionFor,
  sweepProjectsNamed,
  upsertContact,
} from './live-session';

const MARKER = 'S122CPS';
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
// Q12-A: who may write a task's dates directly on a CRITICAL PATH project.
// Every role is assigned to the project and is a live assignee of the task, so
// a refusal is the guard's — not "cannot see it".
const MAY_MOVE_DATES: Record<CompanyRole, boolean> = {
  owner: true,
  admin: true,
  project_executive: true,
  project_manager: true,
  foreman: false,
  crew_member: false,
  client: false,
  subcontractor: false,
};

const session = {} as Record<CompanyRole, SupabaseClient>;
const member = {} as Record<CompanyRole, string | null>;
let companyId = '';
let contactId = '';
const project: Record<'cp' | 'plain' | 'other', string> = { cp: '', plain: '', other: '' };
const must = (label: string, error: { message: string } | null) => {
  if (error) throw new Error(`${label}: ${error.message}`);
};

async function memberOf(email: string): Promise<string | null> {
  const { data: p } = await admin.from('profiles').select('id').eq('email', email).single();
  const { data: m } = await admin
    .from('company_members')
    .select('id')
    .eq('profile_id', p!.id)
    .eq('is_deleted', false)
    .maybeSingle();
  return (m?.id as string) ?? null;
}

async function newProject(key: keyof typeof project, internal: number) {
  const { data, error } = await admin
    .from('projects')
    .insert({
      company_id: companyId,
      contact_id: contactId,
      name: `${MARKER} ${key}`,
      status: 'active',
      project_number: `PRJ-${MARKER}-${key}`,
      project_internal_seq: internal,
    })
    .select('id')
    .single();
  must(`project ${key}`, error);
  project[key] = data!.id as string;
}

async function newTask(
  key: keyof typeof project,
  title: string,
  extra: Record<string, unknown> = {}
) {
  const { data, error } = await admin
    .from('tasks')
    .insert({
      company_id: companyId,
      project_id: project[key],
      title: `${MARKER} ${title}`,
      ...extra,
    })
    .select('id')
    .single();
  must(`task ${title}`, error);
  return data!.id as string;
}

async function taskRow(id: string) {
  const { data } = await admin
    .from('tasks')
    .select('start_date, due_date, status, duration_days')
    .eq('id', id)
    .single();
  return data as {
    start_date: string | null;
    due_date: string | null;
    status: string;
    duration_days: number | null;
  };
}

async function settings(key: keyof typeof project) {
  const { data } = await admin
    .from('project_schedule_settings')
    .select('critical_path_enabled, needs_recompute, computed_on, projected_finish, enabled_at')
    .eq('project_id', project[key])
    .eq('is_deleted', false)
    .maybeSingle();
  return data as {
    critical_path_enabled: boolean;
    needs_recompute: boolean;
    computed_on: string | null;
    projected_finish: string | null;
    enabled_at: string | null;
  } | null;
}

async function markClean(key: keyof typeof project) {
  must(
    'clean',
    (
      await admin
        .from('project_schedule_settings')
        .update({ needs_recompute: false, computed_on: '2026-10-01' })
        .eq('project_id', project[key])
    ).error
  );
}

beforeAll(async () => {
  assertRebuildTest();
  await sweepProjectsNamed(MARKER);
  const { data: prof } = await admin
    .from('profiles')
    .select('company_id')
    .eq('email', IDENTITY.owner)
    .single();
  companyId = prof!.company_id as string;
  // Runnable from ANY starting state: an interrupted run leaves its holiday.
  await admin
    .from('company_holidays')
    .delete()
    .eq('company_id', companyId)
    .like('name', `${MARKER}%`);
  for (const role of Object.keys(IDENTITY) as CompanyRole[])
    member[role] = await memberOf(IDENTITY[role]);
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
  const base = (seqRow!.project_internal_seq as number) + 9100;
  await newProject('cp', base + 1);
  await newProject('plain', base + 2);
  await newProject('other', base + 3);
  // Everyone with a member row is assigned to both the CP and the plain project.
  for (const role of Object.keys(IDENTITY) as CompanyRole[]) {
    const m = member[role];
    if (!m) continue;
    for (const key of ['cp', 'plain'] as const) {
      must(
        `assign ${role}`,
        (
          await admin.from('project_assignments').insert({
            company_id: companyId,
            project_id: project[key],
            member_id: m,
            role_on_project:
              role === 'project_executive'
                ? 'project_executive'
                : role === 'project_manager'
                  ? 'project_manager'
                  : null,
          })
        ).error
      );
    }
  }
  must(
    'cp on',
    (
      await admin
        .from('project_schedule_settings')
        .insert({ company_id: companyId, project_id: project.cp, critical_path_enabled: true })
    ).error
  );
  for (const role of Object.keys(IDENTITY) as CompanyRole[])
    session[role] = await sessionFor(IDENTITY[role]);
}, 300_000);

afterAll(async () => {
  for (const key of ['cp', 'plain', 'other'] as const) {
    if (!project[key]) continue;
    const { data: ts } = await admin.from('tasks').select('id').eq('project_id', project[key]);
    const ids = (ts ?? []).map((t) => t.id as string);
    if (ids.length) {
      await admin.from('project_finish_history').delete().in('cause_task_id', ids);
      await admin.from('task_dependencies').delete().in('predecessor_id', ids);
      // By EITHER end: a link from another project's task (e.g. one a sabotaged
      // run let through) would otherwise pin this project's task.
      await admin.from('task_dependencies').delete().in('successor_id', ids);
      await admin.from('task_assignees').delete().in('task_id', ids);
      await admin.from('tasks').delete().in('id', ids);
    }
    await admin.from('project_finish_history').delete().eq('project_id', project[key]);
    await admin.from('project_lost_days').delete().eq('project_id', project[key]);
    await admin.from('project_schedule_settings').delete().eq('project_id', project[key]);
    await admin.from('project_assignments').delete().eq('project_id', project[key]);
    await deleteProjects(admin, [project[key]]);
  }
  await admin
    .from('company_holidays')
    .delete()
    .eq('company_id', companyId)
    .like('name', `${MARKER}%`);
  const { count } = await admin
    .from('projects')
    .select('id', { count: 'exact', head: true })
    .like('name', `${MARKER}%`);
  expect(count ?? 0).toBe(0);
}, 300_000);

describe('NULLS — nothing backfilled (stop rule 10)', () => {
  it('every pre-existing task has NULL duration, days left and constraint', async () => {
    const { count: total } = await admin
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .not('title', 'like', `${MARKER}%`);
    const { count: withDuration } = await admin
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .not('title', 'like', `${MARKER}%`)
      .or('duration_days.not.is.null,days_left.not.is.null,start_constraint.not.is.null');
    console.log(`[S122CPS] pre-existing tasks ${total}, with any new field set ${withDuration}`);
    expect(total ?? 0, 'a test on zero rows proves nothing').toBeGreaterThan(0);
    expect(withDuration).toBe(0);
  });
});

describe('CHECKS — on the new columns only (Q8-A)', () => {
  it.each([
    ['duration 0', { duration_days: 0 }],
    ['duration 3651', { duration_days: 3651 }],
    ['days_left without as_of', { days_left: 2 }],
    ['constraint without date', { start_constraint: 'fixed' }],
    ['unknown constraint', { start_constraint: 'whenever', constraint_date: '2026-10-05' }],
  ])('%s is refused', async (_l, extra) => {
    const { error } = await admin.from('tasks').insert({
      company_id: companyId,
      project_id: project.other,
      title: `${MARKER} bad`,
      ...extra,
    });
    expect(error?.code).toBe('23514');
  });
  it('a valid set lands', async () => {
    const id = await newTask('other', 'valid', {
      duration_days: 3,
      days_left: 1,
      days_left_as_of: '2026-10-05',
      start_constraint: 'not_before',
      constraint_date: '2026-10-09',
    });
    expect((await taskRow(id)).duration_days).toBe(3);
  });
});

describe('DEPS — the live-row key and the database cycle guard (Q11-A)', () => {
  let a = '';
  let b = '';
  let c = '';
  beforeAll(async () => {
    a = await newTask('other', 'A');
    b = await newTask('other', 'B');
    c = await newTask('other', 'C');
  });
  const link = (p: string, s: string) =>
    session.owner
      .from('task_dependencies')
      .insert({ predecessor_id: p, successor_id: s, dependency_type: 'finish_to_start' });
  const live = async (p: string, s: string) => {
    const { count } = await admin
      .from('task_dependencies')
      .select('id', { count: 'exact', head: true })
      .eq('predecessor_id', p)
      .eq('successor_id', s)
      .eq('is_deleted', false);
    return count ?? 0;
  };

  it('delete-then-re-add the same pair WORKS (it returned "already exists" before)', async () => {
    expect((await link(a, b)).error).toBeNull();
    const { data: row } = await admin
      .from('task_dependencies')
      .select('id')
      .eq('predecessor_id', a)
      .eq('successor_id', b)
      .single();
    must(
      'soft delete',
      (
        await session.owner
          .from('task_dependencies')
          .update({ is_deleted: true, deleted_at: new Date().toISOString() })
          .eq('id', row!.id)
      ).error
    );
    expect(await live(a, b)).toBe(0);
    expect((await link(a, b)).error, 're-add after a soft delete').toBeNull();
    expect(await live(a, b)).toBe(1);
  });
  it('a live duplicate is still refused', async () => {
    expect((await link(a, b)).error?.code).toBe('23505');
  });
  it('a 2-cycle is REFUSED by the database (B → A while A → B)', async () => {
    const { error } = await link(b, a);
    expect(error?.message).toMatch(/would create a loop/);
    expect(await live(b, a)).toBe(0);
  });
  it('a 3-cycle is REFUSED (A → B → C, then C → A)', async () => {
    expect((await link(b, c)).error).toBeNull();
    const { error } = await link(c, a);
    expect(error?.message).toMatch(/would create a loop/);
    expect(await live(c, a)).toBe(0);
  });
  it('a cross-project link is refused', async () => {
    const x = await newTask('plain', 'X other project');
    const { error } = await link(a, x);
    expect(error?.message).toMatch(/same project/);
  });
});

describe('Q12-A — on a CRITICAL PATH project, who may move dates (TOTAL MAP)', () => {
  forEveryRole(MAY_MOVE_DATES, (role, allowed) => {
    it(`${role}: ${allowed ? 'moves' : 'is refused moving'} a task's dates`, async () => {
      const t = await newTask('cp', `Q12 ${role}`, {
        start_date: '2026-10-05',
        due_date: '2026-10-06',
      });
      if (member[role])
        must(
          'assignee',
          (
            await admin
              .from('task_assignees')
              .insert({ company_id: companyId, task_id: t, member_id: member[role] })
          ).error
        );
      const { error } = await session[role]
        .from('tasks')
        .update({ due_date: '2026-10-09' })
        .eq('id', t);
      const after = await taskRow(t);
      console.log(`[S122CPS] ${role}: error=${error?.code ?? 'none'} due=${after.due_date}`);
      if (allowed) {
        expect(error, error?.message).toBeNull();
        expect(after.due_date).toBe('2026-10-09');
      } else {
        expect(after.due_date, 'the date did not move').toBe('2026-10-06');
      }
    });
  });

  it('the foreman is refused BY THE GUARD (its sentence), not by RLS', async () => {
    const t = await newTask('cp', 'Q12 sentence', {
      start_date: '2026-10-05',
      due_date: '2026-10-06',
    });
    const { error } = await session.foreman
      .from('tasks')
      .update({ due_date: '2026-10-09' })
      .eq('id', t);
    expect(error?.message).toMatch(/runs on Critical Path/);
  });

  it('CONTROL: the same foreman write on a project WITHOUT Critical Path lands', async () => {
    const t = await newTask('plain', 'Q12 control', {
      start_date: '2026-10-05',
      due_date: '2026-10-06',
    });
    const { error } = await session.foreman
      .from('tasks')
      .update({ due_date: '2026-10-09' })
      .eq('id', t);
    expect(error, error?.message).toBeNull();
    expect((await taskRow(t)).due_date).toBe('2026-10-09');
  });

  it('crew keep STATUS on a CP task they are on', async () => {
    const t = await newTask('cp', 'Q12 crew status', {
      start_date: '2026-10-05',
      due_date: '2026-10-06',
    });
    must(
      'assignee',
      (
        await admin
          .from('task_assignees')
          .insert({ company_id: companyId, task_id: t, member_id: member.crew_member })
      ).error
    );
    const { error } = await session.crew_member
      .from('tasks')
      .update({ status: 'in_progress' })
      .eq('id', t);
    expect(error, error?.message).toBeNull();
    expect((await taskRow(t)).status).toBe('in_progress');
  });

  it('a foreman may still add an UNDATED task on a CP project; a dated one is refused', async () => {
    const ok = await session.foreman.from('tasks').insert({
      company_id: companyId,
      project_id: project.cp,
      title: `${MARKER} foreman undated`,
    });
    expect(ok.error, ok.error?.message).toBeNull();
    const bad = await session.foreman.from('tasks').insert({
      company_id: companyId,
      project_id: project.cp,
      title: `${MARKER} foreman dated`,
      start_date: '2026-10-05',
    });
    expect(bad.error?.message).toMatch(/runs on Critical Path/);
    const { count } = await admin
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('title', `${MARKER} foreman dated`);
    expect(count).toBe(0);
  });
});

describe('HISTORY — written by the engine only', () => {
  forEveryRole(
    {
      owner: false,
      admin: false,
      project_executive: false,
      project_manager: false,
      foreman: false,
      crew_member: false,
      client: false,
      subcontractor: false,
    } as Record<CompanyRole, boolean>,
    (role) => {
      it(`${role} cannot write a finish-history row`, async () => {
        const { error } = await session[role].from('project_finish_history').insert({
          company_id: companyId,
          project_id: project.cp,
          previous_finish: '2026-10-01',
          new_finish: '2026-10-02',
          cause_kind: 'task',
        });
        expect(error).not.toBeNull();
        const { count } = await admin
          .from('project_finish_history')
          .select('id', { count: 'exact', head: true })
          .eq('project_id', project.cp)
          .eq('new_finish', '2026-10-02');
        expect(count).toBe(0);
      });
    }
  );
  it('the service role can (the engine)', async () => {
    const { error } = await admin.from('project_finish_history').insert({
      company_id: companyId,
      project_id: project.cp,
      previous_finish: '2026-10-01',
      new_finish: '2026-10-03',
      cause_kind: 'time',
    });
    expect(error, error?.message).toBeNull();
  });
});

describe("SETTINGS — the engine's columns are not a user's", () => {
  it('enabled_at is stamped; a user cannot set computed_on or projected_finish', async () => {
    const s0 = await settings('cp');
    expect(s0?.critical_path_enabled).toBe(true);
    expect(s0?.enabled_at).not.toBeNull();
    const { error } = await session.owner
      .from('project_schedule_settings')
      .update({ computed_on: '2030-01-01', projected_finish: '2030-01-01', notify_client: true })
      .eq('project_id', project.cp);
    expect(error, error?.message).toBeNull();
    const s1 = await settings('cp');
    expect(s1?.computed_on, 'kept').toBe(s0?.computed_on ?? null);
    expect(s1?.projected_finish, 'kept').toBe(s0?.projected_finish ?? null);
  });
});

describe('DIRTY — any change that can move a date marks the project (2.4 note 2)', () => {
  it("a crew member's status change marks it; the service role's write-through does not", async () => {
    const t = await newTask('cp', 'dirty crew', {
      start_date: '2026-10-05',
      due_date: '2026-10-06',
    });
    must(
      'assignee',
      (
        await admin
          .from('task_assignees')
          .insert({ company_id: companyId, task_id: t, member_id: member.crew_member })
      ).error
    );
    await markClean('cp');
    expect((await settings('cp'))?.needs_recompute).toBe(false);
    must(
      'write-through',
      (await admin.from('tasks').update({ due_date: '2026-10-07' }).eq('id', t)).error
    );
    expect((await settings('cp'))?.needs_recompute, "the engine's own write does not re-mark").toBe(
      false
    );
    must(
      'crew',
      (await session.crew_member.from('tasks').update({ status: 'complete' }).eq('id', t)).error
    );
    expect(
      (await settings('cp'))?.needs_recompute,
      'a crew completion from the field marks it'
    ).toBe(true);
  });
  it('a company holiday marks every Critical Path project in the company', async () => {
    await markClean('cp');
    must(
      'holiday',
      (
        await session.owner
          .from('company_holidays')
          .insert({ holiday_date: '2026-12-25', name: `${MARKER} Christmas` })
      ).error
    );
    expect((await settings('cp'))?.needs_recompute).toBe(true);
  });
  it('a weather day marks its project', async () => {
    await markClean('cp');
    must(
      'lost day',
      (
        await session.owner.from('project_lost_days').insert({
          project_id: project.cp,
          start_date: '2026-10-06',
          end_date: '2026-10-06',
          reason: 'storm',
          icon: 'lightning',
        })
      ).error
    );
    expect((await settings('cp'))?.needs_recompute).toBe(true);
  });
});

describe('WEATHER — reason required, one of five icons', () => {
  it.each([
    ['no reason', { reason: '  ', icon: 'rain' }],
    ['unknown icon', { reason: 'fog', icon: 'fog' }],
    [
      'end before start',
      { reason: 'rain', icon: 'rain', start_date: '2026-10-07', end_date: '2026-10-06' },
    ],
  ])('%s is refused', async (_l, extra) => {
    const { error } = await admin.from('project_lost_days').insert({
      company_id: companyId,
      project_id: project.cp,
      start_date: '2026-10-06',
      end_date: '2026-10-06',
      ...extra,
    });
    expect(error?.code).toBe('23514');
  });
});
