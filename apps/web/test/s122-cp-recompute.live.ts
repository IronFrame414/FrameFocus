/**
 * S122 Part 3 — the recompute, the write-through, and the cause the mark
 * carries. Migration 20262127000000 + lib/critical-path/recompute.ts.
 *
 *   WRITE-THROUGH  the engine's dates land in start_date / due_date; a second
 *                  run writes nothing; a duration-less task keeps its typed
 *                  dates and stays duration-less (stop rule 10).
 *   CAUSE          every trigger on the Q9 list marks the project AND names its
 *                  cause: task, dependency, weather, inspection, holiday,
 *                  calendar, enabled, and the NEW project_start (item 10). A
 *                  project change that is not its start date marks nothing
 *                  (control). First cause wins. A user cannot overwrite or
 *                  clear the cause. The service role's write marks nothing.
 *   HISTORY        a recompute run from the mark writes ONE history row with the
 *                  cause the mark carried: weather, then project_start, then
 *                  time passing (trigger 9) — with every date hand-worked.
 *   NOTIFY         Q13-A: a new assignee row reads notify_changes = false; the
 *                  Owner can set it; a crew member cannot (judged by the service
 *                  role, written without returning rows).
 *
 * "Today" is pinned by passing `now` (Mon 2026-10-05, company time zone).
 *   date    Mon05 Tue06 Wed07 Thu08 Fri09 Mon12 Tue13 Wed14 Thu15 Fri16
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { ensureScheduleFresh, recomputeProject } from '@/lib/critical-path/recompute';
import {
  admin,
  assertRebuildTest,
  deleteProjects,
  sessionFor,
  sweepProjectsNamed,
  upsertContact,
} from './live-session';

const MARKER = 'S122CPR';
const OWNER = 'josh+test50@worthprop.com';
const CREW = 'josh+crew@worthprop.com';
const MON05 = new Date('2026-10-05T16:00:00Z');
const MON19 = new Date('2026-10-19T16:00:00Z');

const db = admin as unknown as SupabaseClient<Database>;
let owner: SupabaseClient;
let crew: SupabaseClient;
let companyId = '';
let contactId = '';
let crewMember = '';
let createdCalendar = false;
const project: Record<'p' | 'q', string> = { p: '', q: '' };
const t: Record<string, string> = {};

const must = (label: string, error: { message: string } | null) => {
  if (error) throw new Error(`${label}: ${error.message}`);
};

async function newProject(key: 'p' | 'q', internal: number) {
  const { data, error } = await admin
    .from('projects')
    .insert({
      company_id: companyId,
      contact_id: contactId,
      name: `${MARKER} ${key}`,
      status: 'active',
      project_number: `PRJ-${MARKER}-${key}`,
      project_internal_seq: internal,
      start_date: '2026-10-05',
    })
    .select('id')
    .single();
  must(`project ${key}`, error);
  project[key] = data!.id as string;
  must(
    `cp on ${key}`,
    (
      await admin
        .from('project_schedule_settings')
        .insert({ company_id: companyId, project_id: project[key], critical_path_enabled: true })
    ).error
  );
}

async function newTask(key: 'p' | 'q', name: string, extra: Record<string, unknown> = {}) {
  const { data, error } = await admin
    .from('tasks')
    .insert({ company_id: companyId, project_id: project[key], title: `${MARKER} ${name}`, ...extra })
    .select('id')
    .single();
  must(`task ${name}`, error);
  t[`${key}.${name}`] = data!.id as string;
  return data!.id as string;
}

async function link(pred: string, succ: string) {
  must(
    'link',
    (await admin.from('task_dependencies').insert({ company_id: companyId, predecessor_id: pred, successor_id: succ }))
      .error
  );
}

async function dates(id: string) {
  const { data } = await admin.from('tasks').select('start_date, due_date, duration_days').eq('id', id).single();
  return data as { start_date: string | null; due_date: string | null; duration_days: number | null };
}

async function settings(key: 'p' | 'q') {
  const { data } = await admin
    .from('project_schedule_settings')
    .select('needs_recompute, recompute_cause_kind, recompute_cause_task_id, computed_on, projected_finish')
    .eq('project_id', project[key])
    .eq('is_deleted', false)
    .single();
  return data as {
    needs_recompute: boolean;
    recompute_cause_kind: string | null;
    recompute_cause_task_id: string | null;
    computed_on: string | null;
    projected_finish: string | null;
  };
}

async function markClean(key: 'p' | 'q') {
  must(
    'clean',
    (
      await admin
        .from('project_schedule_settings')
        .update({ needs_recompute: false, recompute_cause_kind: null, recompute_cause_task_id: null, computed_on: '2026-10-05' })
        .eq('project_id', project[key])
    ).error
  );
  const s = await settings(key);
  expect(s.needs_recompute, 'the mark starts CLEAR, so setting it is this test').toBe(false);
}

async function history(key: 'p' | 'q') {
  const { data } = await admin
    .from('project_finish_history')
    .select('previous_finish, new_finish, cause_kind, cause_task_id')
    .eq('project_id', project[key])
    .order('created_at', { ascending: true });
  return (data ?? []) as {
    previous_finish: string | null;
    new_finish: string | null;
    cause_kind: string;
    cause_task_id: string | null;
  }[];
}

/** Everything this file creates on a project, children first. */
async function purge(projectId: string) {
  const { data: ts } = await admin.from('tasks').select('id').eq('project_id', projectId);
  const ids = (ts ?? []).map((r) => r.id as string);
  await admin.from('project_finish_history').delete().eq('project_id', projectId);
  await admin.from('project_schedule_settings').delete().eq('project_id', projectId);
  if (ids.length) {
    await admin.from('task_dependencies').delete().in('predecessor_id', ids);
    await admin.from('task_dependencies').delete().in('successor_id', ids);
    await admin.from('task_assignees').delete().in('task_id', ids);
    await admin.from('tasks').delete().in('id', ids);
  }
  await admin.from('inspections').delete().eq('project_id', projectId);
  await admin.from('project_lost_days').delete().eq('project_id', projectId);
  await admin.from('project_assignments').delete().eq('project_id', projectId);
  // The CAUSE control renames P, which logs a project_name_history row.
  await admin.from('project_name_history').delete().eq('project_id', projectId);
  await deleteProjects(admin, [projectId]);
}

beforeAll(async () => {
  assertRebuildTest();
  // Runnable from ANY starting state: a crashed run's projects are purged whole.
  const { data: stale } = await admin.from('projects').select('id').like('name', `${MARKER}%`);
  for (const r of stale ?? []) await purge(r.id as string);
  await sweepProjectsNamed(MARKER);
  const { data: prof } = await admin.from('profiles').select('company_id').eq('email', OWNER).single();
  companyId = prof!.company_id as string;
  await admin.from('company_holidays').delete().eq('company_id', companyId).like('name', `${MARKER}%`);
  const { data: cp } = await admin.from('profiles').select('id').eq('email', CREW).single();
  const { data: cm } = await admin
    .from('company_members')
    .select('id')
    .eq('profile_id', cp!.id)
    .eq('is_deleted', false)
    .single();
  crewMember = cm!.id as string;
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
  const base = (seqRow!.project_internal_seq as number) + 9200;
  await newProject('p', base + 1);
  await newProject('q', base + 2);
  must(
    'assign crew',
    (await admin.from('project_assignments').insert({ company_id: companyId, project_id: project.p, member_id: crewMember }))
      .error
  );

  // P: A(2) → B(3), plus a duration-less task on typed dates and one with a single date.
  await newTask('p', 'A', { duration_days: 2 });
  await newTask('p', 'B', { duration_days: 3 });
  await link(t['p.A'], t['p.B']);
  await newTask('p', 'F', { start_date: '2026-10-07', due_date: '2026-10-08' });
  await newTask('p', 'N', { start_date: '2026-10-07' });
  // Q: A(2) → B(3), for the history sequence.
  await newTask('q', 'A', { duration_days: 2 });
  await newTask('q', 'B', { duration_days: 3 });
  await link(t['q.A'], t['q.B']);

  owner = await sessionFor(OWNER);
  crew = await sessionFor(CREW);
}, 300_000);

afterAll(async () => {
  for (const key of ['p', 'q'] as const) if (project[key]) await purge(project[key]);
  await admin.from('company_holidays').delete().eq('company_id', companyId).like('name', `${MARKER}%`);
  if (createdCalendar) await admin.from('company_work_calendars').delete().eq('company_id', companyId);
  const { count } = await admin
    .from('projects')
    .select('id', { count: 'exact', head: true })
    .like('name', `${MARKER}%`);
  expect(count ?? 0).toBe(0);
}, 300_000);

describe('WRITE-THROUGH — the engine answer lands in the stored dates (Q9-A)', () => {
  it('first computation: A Mon05–Tue06, B Wed07–Fri09; finish Fri09; ONE history row (enabled)', async () => {
    const r = await recomputeProject(db, project.p, { cause: { kind: 'enabled' }, now: MON05 });
    expect(r.status).toBe('computed');
    if (r.status !== 'computed') return;
    expect(r.tasksWritten, 'A and B, both dates each').toBe(2);
    expect(await dates(t['p.A'])).toMatchObject({ start_date: '2026-10-05', due_date: '2026-10-06' });
    expect(await dates(t['p.B'])).toMatchObject({ start_date: '2026-10-07', due_date: '2026-10-09' });
    const s = await settings('p');
    expect(s).toMatchObject({ needs_recompute: false, computed_on: '2026-10-05', projected_finish: '2026-10-09' });
    const h = await history('p');
    expect(h).toEqual([{ previous_finish: null, new_finish: '2026-10-09', cause_kind: 'enabled', cause_task_id: null }]);
  });

  it('a second run writes nothing and logs nothing', async () => {
    const r = await recomputeProject(db, project.p, { cause: { kind: 'task' }, now: MON05 });
    expect(r).toMatchObject({ status: 'computed', tasksWritten: 0, historyWritten: false });
    expect((await history('p')).length).toBe(1);
  });

  it('⚠️ stop rule 10: the duration-less tasks keep their typed dates and stay duration-less', async () => {
    expect(await dates(t['p.F'])).toEqual({ start_date: '2026-10-07', due_date: '2026-10-08', duration_days: null });
    expect(await dates(t['p.N'])).toEqual({ start_date: '2026-10-07', due_date: null, duration_days: null });
  });
});

describe('CAUSE — every Q9 trigger marks the project AND names what changed', () => {
  it('a task edit → task, naming the task', async () => {
    await markClean('p');
    must('owner task', (await owner.from('tasks').update({ duration_days: 4 }).eq('id', t['p.B'])).error);
    expect(await settings('p')).toMatchObject({
      needs_recompute: true,
      recompute_cause_kind: 'task',
      recompute_cause_task_id: t['p.B'],
    });
  });

  it('a new dependency → dependency, naming its successor', async () => {
    const x = await newTask('p', 'X', { duration_days: 1 });
    await markClean('p');
    must(
      'owner link',
      (await owner.from('task_dependencies').insert({ predecessor_id: t['p.A'], successor_id: x })).error
    );
    expect(await settings('p')).toMatchObject({ recompute_cause_kind: 'dependency', recompute_cause_task_id: x });
  });

  it('a weather day → weather', async () => {
    await markClean('p');
    must(
      'owner lost day',
      (
        await owner.from('project_lost_days').insert({
          project_id: project.p,
          start_date: '2026-11-02',
          end_date: '2026-11-02',
          reason: 'storm',
          icon: 'rain',
        })
      ).error
    );
    expect(await settings('p')).toMatchObject({ needs_recompute: true, recompute_cause_kind: 'weather' });
  });

  it('an inspection change → inspection', async () => {
    const { data: ins, error } = await admin
      .from('inspections')
      .insert({ company_id: companyId, project_id: project.p, inspection_type: `${MARKER} framing`, scheduled_date: '2026-10-20' })
      .select('id')
      .single();
    must('inspection', error);
    await markClean('p');
    must('owner inspection', (await owner.from('inspections').update({ notes: 'moved' }).eq('id', ins!.id)).error);
    expect(await settings('p')).toMatchObject({ needs_recompute: true, recompute_cause_kind: 'inspection' });
  });

  it("⚠️ Q9 item 10: the PROJECT's start date → project_start; CONTROL: its name alone marks nothing", async () => {
    await markClean('p');
    must('owner rename', (await owner.from('projects').update({ name: `${MARKER} p renamed` }).eq('id', project.p)).error);
    const { data: renamed } = await admin.from('projects').select('name').eq('id', project.p).single();
    expect(renamed!.name, 'the control write LANDED').toBe(`${MARKER} p renamed`);
    expect((await settings('p')).needs_recompute, 'a non-date project change moves nothing').toBe(false);
    must('owner start', (await owner.from('projects').update({ start_date: '2026-10-06' }).eq('id', project.p)).error);
    expect(await settings('p')).toMatchObject({ needs_recompute: true, recompute_cause_kind: 'project_start' });
  });

  it('a company holiday → holiday', async () => {
    await markClean('p');
    must(
      'owner holiday',
      (await owner.from('company_holidays').insert({ holiday_date: '2026-11-26', name: `${MARKER} Thanksgiving` })).error
    );
    expect(await settings('p')).toMatchObject({ needs_recompute: true, recompute_cause_kind: 'holiday' });
  });

  it('the company working calendar → calendar', async () => {
    await markClean('p');
    const { data: existing } = await admin
      .from('company_work_calendars')
      .select('id, work_days')
      .eq('company_id', companyId)
      .eq('is_deleted', false)
      .maybeSingle();
    if (existing) {
      must(
        'owner calendar',
        (await owner.from('company_work_calendars').update({ work_days: existing.work_days }).eq('id', existing.id)).error
      );
    } else {
      must('owner calendar', (await owner.from('company_work_calendars').insert({ work_days: [1, 2, 3, 4, 5] })).error);
      createdCalendar = true;
    }
    expect(await settings('p')).toMatchObject({ needs_recompute: true, recompute_cause_kind: 'calendar' });
  });

  it('turning Critical Path off → enabled; CONTROL: the notify-client switch alone marks nothing', async () => {
    await markClean('p');
    must('owner notify', (await owner.from('project_schedule_settings').update({ notify_client: true }).eq('project_id', project.p)).error);
    expect(await settings('p')).toMatchObject({ needs_recompute: false, recompute_cause_kind: null });
    must('owner off', (await owner.from('project_schedule_settings').update({ critical_path_enabled: false }).eq('project_id', project.p)).error);
    expect(await settings('p')).toMatchObject({ needs_recompute: true, recompute_cause_kind: 'enabled' });
    must('back on', (await admin.from('project_schedule_settings').update({ critical_path_enabled: true }).eq('project_id', project.p)).error);
  });

  it('FIRST CAUSE WINS: a task edit, then a weather day — the mark still names the task', async () => {
    await markClean('p');
    must('owner task', (await owner.from('tasks').update({ duration_days: 3 }).eq('id', t['p.B'])).error);
    must(
      'owner lost day',
      (
        await owner.from('project_lost_days').insert({
          project_id: project.p,
          start_date: '2026-11-03',
          end_date: '2026-11-03',
          reason: 'wind',
          icon: 'wind',
        })
      ).error
    );
    expect(await settings('p')).toMatchObject({ recompute_cause_kind: 'task', recompute_cause_task_id: t['p.B'] });
  });

  it('a user can neither overwrite the cause nor clear the mark (read with the service role)', async () => {
    // Marked with 'task' by the test above. The same UPDATE flips notify_client
    // (a switch the Owner MAY change) so the write provably LANDED — a refused
    // write would leave the mark alone and pass vacuously.
    const { data: before } = await admin
      .from('project_schedule_settings')
      .select('notify_client')
      .eq('project_id', project.p)
      .single();
    await owner
      .from('project_schedule_settings')
      .update({
        notify_client: !before!.notify_client,
        recompute_cause_kind: 'calendar',
        recompute_cause_task_id: null,
        needs_recompute: false,
      })
      .eq('project_id', project.p);
    const { data: after } = await admin
      .from('project_schedule_settings')
      .select('notify_client')
      .eq('project_id', project.p)
      .single();
    expect(after!.notify_client, 'the write landed').toBe(!before!.notify_client);
    expect(await settings('p')).toMatchObject({
      needs_recompute: true,
      recompute_cause_kind: 'task',
      recompute_cause_task_id: t['p.B'],
    });
  });

  it("the service role's write (the engine's own) marks nothing", async () => {
    await markClean('p');
    must('admin write', (await admin.from('tasks').update({ due_date: '2026-10-30' }).eq('id', t['p.F'])).error);
    expect((await settings('p')).needs_recompute).toBe(false);
  });
});

describe('HISTORY — a recompute run from the mark logs the cause the mark carried', () => {
  it('Q first computed: finish Fri09', async () => {
    const r = await recomputeProject(db, project.q, { cause: { kind: 'enabled' }, now: MON05 });
    expect(r).toMatchObject({ status: 'computed', projectedFinish: '2026-10-09' });
  });

  it('a WEATHER day on Tue06 → A Mon05+Wed07, B Thu08–Mon12; history 09 → 12, cause weather', async () => {
    must(
      'owner lost day',
      (
        await owner.from('project_lost_days').insert({
          project_id: project.q,
          start_date: '2026-10-06',
          end_date: '2026-10-06',
          reason: 'lightning storm',
          icon: 'lightning',
        })
      ).error
    );
    const r = await ensureScheduleFresh(db, project.q, MON05);
    expect(r.status).toBe('computed');
    expect(await dates(t['q.A'])).toMatchObject({ start_date: '2026-10-05', due_date: '2026-10-07' });
    expect(await dates(t['q.B'])).toMatchObject({ start_date: '2026-10-08', due_date: '2026-10-12' });
    expect((await history('q')).at(-1)).toEqual({
      previous_finish: '2026-10-09',
      new_finish: '2026-10-12',
      cause_kind: 'weather',
      cause_task_id: null,
    });
    expect(await settings('q')).toMatchObject({ needs_recompute: false, recompute_cause_kind: null });
  });

  it('the PROJECT START moved to Mon12 → A Mon12–Tue13, B Wed14–Fri16; history 12 → 16, cause project_start', async () => {
    must('owner start', (await owner.from('projects').update({ start_date: '2026-10-12' }).eq('id', project.q)).error);
    const r = await ensureScheduleFresh(db, project.q, MON05);
    expect(r.status).toBe('computed');
    expect(await dates(t['q.A'])).toMatchObject({ start_date: '2026-10-12', due_date: '2026-10-13' });
    expect(await dates(t['q.B'])).toMatchObject({ start_date: '2026-10-14', due_date: '2026-10-16' });
    expect((await history('q')).at(-1)).toMatchObject({ previous_finish: '2026-10-12', new_finish: '2026-10-16', cause_kind: 'project_start' });
  });

  it('a fresh project is NOT recomputed on read (the same day, nothing marked)', async () => {
    expect((await ensureScheduleFresh(db, project.q, MON05)).status).toBe('fresh');
  });

  it('TIME (trigger 9): read a week later, nobody touched it → A Mon19–Tue20, B Wed21–Fri23; cause time', async () => {
    const r = await ensureScheduleFresh(db, project.q, MON19);
    expect(r.status).toBe('computed');
    expect(await dates(t['q.A'])).toMatchObject({ start_date: '2026-10-19', due_date: '2026-10-20' });
    expect(await dates(t['q.B'])).toMatchObject({ start_date: '2026-10-21', due_date: '2026-10-23' });
    expect((await history('q')).at(-1)).toMatchObject({ previous_finish: '2026-10-16', new_finish: '2026-10-23', cause_kind: 'time' });
    expect((await settings('q')).computed_on).toBe('2026-10-19');
    expect((await ensureScheduleFresh(db, project.q, MON19)).status, 'and then it is fresh').toBe('fresh');
  });

  it('the whole history of Q, in order: enabled, weather, project_start, time (4 rows)', async () => {
    expect((await history('q')).map((h) => h.cause_kind)).toEqual(['enabled', 'weather', 'project_start', 'time']);
  });
});

describe('NOTIFY — per assignee, OFF by default (Q13-A)', () => {
  it('a new assignee row reads false; the Owner sets it; a crew member cannot (service-role read)', async () => {
    must('owner assign', (await owner.rpc('set_task_assignees', { p_task_id: t['p.A'], p_member_ids: [crewMember] })).error);
    const read = async () =>
      (
        await admin
          .from('task_assignees')
          .select('notify_changes')
          .eq('task_id', t['p.A'])
          .eq('member_id', crewMember)
          .eq('is_deleted', false)
          .single()
      ).data!.notify_changes as boolean;
    expect(await read(), 'a default of on is not a selection').toBe(false);
    // The crew member is assigned to the project AND is the assignee: a refusal is the policy's.
    await crew.from('task_assignees').update({ notify_changes: true }).eq('task_id', t['p.A']).eq('member_id', crewMember);
    expect(await read(), 'crew cannot set it').toBe(false);
    must(
      'owner notify',
      (await owner.from('task_assignees').update({ notify_changes: true }).eq('task_id', t['p.A']).eq('member_id', crewMember))
        .error
    );
    expect(await read(), 'the Owner can').toBe(true);
  });
});
