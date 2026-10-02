/**
 * S122 Part 8 — CRITICAL PATH SCHEDULE TEMPLATES. Migration 20262131000000 +
 * lib/critical-path/templates.ts. [ruling 6; Josh, RULED 2026-10-01]
 *
 *   SOURCE S122CPT src (CP on): Framing A(3) → Finish B(2), C(1) unphased; crew
 *   on A; A 50% / in progress. SAVE → a template of 2 phases, 3 tasks, 1 link,
 *   the durations — and no column exists for a date, an assignee or a percent.
 *   STAMP onto an EMPTY CP-on project, start Mon 4 Jan 2027 → 2 phases, 3 tasks,
 *   1 link; A Jan 4–6, B Jan 7–8, C Jan 4; history cause `template`; no
 *   assignees, nothing started.
 *   ⚠️ STAMP onto a project that ALREADY HAS TASKS → 409, the count named,
 *   NOTHING written.  A FOREMAN's stamp → 403, nothing written.  CP OFF → 409.
 *   CREATE a template: Owner and Admin only (a total map). READ: Owner, Admin,
 *   PM, PE. DELETE: Owner/Admin (soft).
 * Writes as a role return no rows; outcomes are counted with the service role.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import type { CompanyRole } from '@framefocus/shared/types/roles';
import { recomputeProject } from '@/lib/critical-path/recompute';
import { alreadyHasTasks, deleteScheduleTemplate, saveScheduleTemplate, stampScheduleTemplate } from '@/lib/critical-path/templates';
import { admin, assertRebuildTest, deleteProjects, sessionFor, sweepProjectsNamed } from './live-session';

const MARKER = 'S122CPT';
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
/** Who may CREATE a template [spec: Owner/Admin]. */
const MAY_CREATE: Record<CompanyRole, boolean> = {
  owner: true,
  admin: true,
  project_executive: false,
  project_manager: false,
  foreman: false,
  crew_member: false,
  client: false,
  subcontractor: false,
};
/** Who may READ templates (the roles that may stamp: schedule editors). */
const MAY_READ: Record<CompanyRole, boolean> = {
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
const member = {} as Record<CompanyRole, string>;
let companyId = '';
let contactId = '';
let seq = 0;
const proj = { src: '', empty: '', off: '', foremanTarget: '', pmTarget: '' };
let templateId = '';

const must = (label: string, error: { message: string } | null) => {
  if (error) throw new Error(`${label}: ${error.message}`);
};

async function purge(id: string) {
  const { data: ts } = await admin.from('tasks').select('id').eq('project_id', id);
  const ids = (ts ?? []).map((r) => r.id as string);
  await admin.from('notifications').delete().eq('project_id', id);
  await admin.from('task_schedule_edits').delete().eq('project_id', id);
  await admin.from('project_finish_history').delete().eq('project_id', id);
  await admin.from('project_schedule_settings').delete().eq('project_id', id);
  if (ids.length) {
    await admin.from('task_dependencies').delete().in('successor_id', ids);
    await admin.from('task_assignees').delete().in('task_id', ids);
    await admin.from('tasks').delete().in('id', ids);
  }
  await admin.from('phases').delete().eq('project_id', id);
  await admin.from('project_assignments').delete().eq('project_id', id);
  await deleteProjects(admin, [id]);
}
async function purgeTemplates() {
  const { data } = await admin.from('schedule_templates').select('id').like('name', `${MARKER}%`);
  const ids = (data ?? []).map((r) => r.id as string);
  if (!ids.length) return;
  await admin.from('schedule_template_dependencies').delete().in('template_id', ids);
  await admin.from('schedule_template_tasks').delete().in('template_id', ids);
  await admin.from('schedule_template_phases').delete().in('template_id', ids);
  await admin.from('schedule_templates').delete().in('id', ids);
}

async function project(name: string, cpOn: boolean): Promise<string> {
  const { data, error } = await admin
    .from('projects')
    .insert({
      company_id: companyId,
      contact_id: contactId,
      name: `${MARKER} ${name}`,
      status: 'active',
      project_number: `PRJ-${MARKER}-${name}`,
      project_internal_seq: seq++,
      start_date: '2026-11-02',
    })
    .select('id')
    .single();
  must(`project ${name}`, error);
  const id = data!.id as string;
  for (const role of ['owner', 'project_manager', 'foreman', 'project_executive'] as const) {
    must(`assign ${role}`, (await admin.from('project_assignments').insert({ company_id: companyId, project_id: id, member_id: member[role] })).error);
  }
  if (cpOn) must('cp on', (await admin.from('project_schedule_settings').insert({ company_id: companyId, project_id: id, critical_path_enabled: true })).error);
  return id;
}

async function counts(projectId: string) {
  const c = async (t: 'tasks' | 'phases') =>
    (await admin.from(t).select('id', { count: 'exact', head: true }).eq('project_id', projectId).eq('is_deleted', false)).count ?? 0;
  const { data: ts } = await admin.from('tasks').select('id').eq('project_id', projectId).eq('is_deleted', false);
  const ids = (ts ?? []).map((r) => r.id as string);
  const deps = ids.length
    ? ((await admin.from('task_dependencies').select('id', { count: 'exact', head: true }).in('successor_id', ids).eq('is_deleted', false)).count ?? 0)
    : 0;
  const { data: p } = await admin.from('projects').select('start_date').eq('id', projectId).single();
  return { tasks: await c('tasks'), phases: await c('phases'), deps, start: (p as { start_date: string | null }).start_date };
}

beforeAll(async () => {
  assertRebuildTest();
  const { data: stale } = await admin.from('projects').select('id').like('name', `${MARKER}%`);
  for (const r of stale ?? []) await purge(r.id as string);
  await sweepProjectsNamed(MARKER);
  await purgeTemplates();
  for (const role of Object.keys(IDENTITY) as CompanyRole[]) {
    session[role] = await sessionFor(IDENTITY[role]);
    const { data: p } = await admin.from('profiles').select('id, company_id').eq('email', IDENTITY[role]).single();
    const { data: m } = await admin.from('company_members').select('id').eq('profile_id', (p as { id: string }).id).eq('is_deleted', false).maybeSingle();
    member[role] = (m as { id: string } | null)?.id ?? '';
    if (role === 'owner') companyId = (p as { company_id: string }).company_id;
  }
  const { data: seqRow } = await admin
    .from('projects')
    .select('project_internal_seq')
    .eq('company_id', companyId)
    .order('project_internal_seq', { ascending: false })
    .limit(1)
    .single();
  seq = (seqRow!.project_internal_seq as number) + 9600;
  const { data: ct } = await admin
    .from('contacts')
    .select('id')
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(1)
    .single();
  contactId = (ct as { id: string }).id;

  // The SOURCE network.
  proj.src = await project('src', true);
  const ph = async (name: string, sort: number) => {
    const { data, error } = await admin.from('phases').insert({ company_id: companyId, project_id: proj.src, name, sort_order: sort }).select('id').single();
    must(`phase ${name}`, error);
    return data!.id as string;
  };
  const framing = await ph('Framing', 1);
  const finish = await ph('Finish', 2);
  const t = async (title: string, phaseId: string | null, days: number) => {
    const { data, error } = await admin
      .from('tasks')
      .insert({ company_id: companyId, project_id: proj.src, title: `${MARKER} ${title}`, phase_id: phaseId, duration_days: days })
      .select('id')
      .single();
    must(`task ${title}`, error);
    return data!.id as string;
  };
  const A = await t('A', framing, 3);
  const B = await t('B', finish, 2);
  await t('C', null, 1);
  must('dep', (await admin.from('task_dependencies').insert({ company_id: companyId, predecessor_id: A, successor_id: B })).error);
  must('assignee', (await admin.from('task_assignees').insert({ company_id: companyId, task_id: A, member_id: member.crew_member })).error);
  must('progress', (await admin.from('tasks').update({ percent_complete: 50, status: 'in_progress' }).eq('id', A)).error);
  expect(await recomputeProject(db, proj.src, { cause: { kind: 'enabled' }, now: new Date('2026-10-05T16:00:00Z') })).toMatchObject({ status: 'computed' });

  proj.empty = await project('empty', true);
  proj.off = await project('off', false);
  proj.foremanTarget = await project('foreman', true);
  proj.pmTarget = await project('pm', true);
}, 600_000);

afterAll(async () => {
  for (const id of Object.values(proj)) if (id) await purge(id);
  await purgeTemplates();
  const { count } = await admin.from('projects').select('id', { count: 'exact', head: true }).like('name', `${MARKER}%`);
  expect(count ?? 0).toBe(0);
}, 600_000);

describe('who may CREATE a template (a total map; writes return no rows, counted by the service role)', () => {
  for (const role of (Object.keys(MAY_CREATE) as CompanyRole[]).sort()) {
    it(`${role} → ${MAY_CREATE[role] ? 'may' : 'may NOT'}`, async () => {
      const name = `${MARKER} map ${role}`;
      await session[role].from('schedule_templates').insert({ name });
      const { count } = await admin.from('schedule_templates').select('id', { count: 'exact', head: true }).eq('name', name);
      expect(count ?? 0).toBe(MAY_CREATE[role] ? 1 : 0);
    });
  }
});

describe('SAVE: the shape of the work, nothing of the job', () => {
  it('Owner saves the source: 2 phases, 3 tasks, 1 link, the durations in order', async () => {
    const r = await saveScheduleTemplate(session.owner as SupabaseClient<Database>, db, { projectId: proj.src, name: `${MARKER} house` });
    expect(r).toMatchObject({ ok: true, phases: 2, tasks: 3, dependencies: 1 });
    if (!r.ok) throw new Error(r.error);
    templateId = r.templateId;
    const { data } = await admin.from('schedule_template_tasks').select('title, duration_days, sort_order').eq('template_id', templateId).order('sort_order');
    expect(data).toEqual([
      { title: `${MARKER} A`, duration_days: 3, sort_order: 0 },
      { title: `${MARKER} B`, duration_days: 2, sort_order: 1 },
      { title: `${MARKER} C`, duration_days: 1, sort_order: 2 },
    ]);
  });

  it('⚠️ a template task has NO column for a date, an assignee or a percent (the closed key set)', async () => {
    const { data } = await admin.from('schedule_template_tasks').select('*').eq('template_id', templateId).limit(1).single();
    expect(Object.keys(data as object).sort()).toEqual(
      ['company_id', 'created_at', 'created_by', 'deleted_at', 'description', 'duration_days', 'id', 'is_deleted', 'phase_id', 'priority', 'sort_order', 'template_id', 'title', 'updated_at', 'updated_by'].sort()
    );
  });

  it('a PM may not save (RLS) and nothing is kept', async () => {
    const r = await saveScheduleTemplate(session.project_manager as SupabaseClient<Database>, db, { projectId: proj.src, name: `${MARKER} pm` });
    expect(r).toMatchObject({ ok: false, status: 403 });
    const { count } = await admin.from('schedule_templates').select('id', { count: 'exact', head: true }).eq('name', `${MARKER} pm`);
    expect(count ?? 0).toBe(0);
  });
});

describe('who may READ templates (a total map)', () => {
  for (const role of (Object.keys(MAY_READ) as CompanyRole[]).sort()) {
    it(`${role} → ${MAY_READ[role] ? 'reads it' : 'reads nothing'}`, async () => {
      const { data } = await session[role].from('schedule_templates').select('id').eq('id', templateId);
      expect((data ?? []).length).toBe(MAY_READ[role] ? 1 : 0);
    });
  }
});

describe('STAMP', () => {
  it('onto an EMPTY CP project, start Mon 4 Jan 2027: the network, computed; cause template; no people, nothing started', async () => {
    expect(await counts(proj.empty)).toMatchObject({ tasks: 0, phases: 0, deps: 0 });
    const r = await stampScheduleTemplate(session.owner as SupabaseClient<Database>, db, {
      projectId: proj.empty,
      templateId,
      startDate: '2027-01-04',
      savedByMemberId: member.owner,
    });
    expect(r).toMatchObject({ ok: true, tasks: 3 });
    expect(await counts(proj.empty)).toEqual({ tasks: 3, phases: 2, deps: 1, start: '2027-01-04' });
    const { data: ts } = await admin
      .from('tasks')
      .select('id, title, duration_days, start_date, due_date, status, percent_complete')
      .eq('project_id', proj.empty)
      .eq('is_deleted', false)
      .order('title');
    expect((ts ?? []).map(({ id: _id, ...rest }) => rest)).toEqual([
      { title: `${MARKER} A`, duration_days: 3, start_date: '2027-01-04', due_date: '2027-01-06', status: 'not_started', percent_complete: 0 },
      { title: `${MARKER} B`, duration_days: 2, start_date: '2027-01-07', due_date: '2027-01-08', status: 'not_started', percent_complete: 0 },
      { title: `${MARKER} C`, duration_days: 1, start_date: '2027-01-04', due_date: '2027-01-04', status: 'not_started', percent_complete: 0 },
    ]);
    const ids = (ts ?? []).map((t) => t.id as string);
    const { count: people } = await admin.from('task_assignees').select('id', { count: 'exact', head: true }).in('task_id', ids);
    expect(people ?? 0, 'no assignee travelled').toBe(0);
    const { data: h } = await admin.from('project_finish_history').select('cause_kind, new_finish').eq('project_id', proj.empty);
    expect(h).toEqual([{ cause_kind: 'template', new_finish: '2027-01-08' }]);
  });

  it('⚠️ onto a project that ALREADY HAS TASKS → 409, the count named, and NOTHING written', async () => {
    const before = await counts(proj.empty);
    const r = await stampScheduleTemplate(session.owner as SupabaseClient<Database>, db, {
      projectId: proj.empty,
      templateId,
      startDate: '2027-02-01',
      savedByMemberId: member.owner,
    });
    expect(r).toEqual({ ok: false, status: 409, error: alreadyHasTasks(3), cause: expect.any(String) });
    expect(alreadyHasTasks(3)).toBe('This project already has 3 tasks; stamping would mix two plans. Stamp onto a project with no tasks.');
    expect(await counts(proj.empty)).toEqual(before);
  });

  it('by the PROJECT MANAGER (on the project, a schedule editor) → stamped: start date set, network written, computed', async () => {
    const r = await stampScheduleTemplate(session.project_manager as SupabaseClient<Database>, db, {
      projectId: proj.pmTarget,
      templateId,
      startDate: '2027-01-04',
      savedByMemberId: member.project_manager,
    });
    expect(r).toMatchObject({ ok: true, tasks: 3 });
    expect(await counts(proj.pmTarget)).toEqual({ tasks: 3, phases: 2, deps: 1, start: '2027-01-04' });
  });

  it('by a FOREMAN (on the project) → 403 with the editor sentence, and NOTHING written', async () => {
    const before = await counts(proj.foremanTarget);
    const r = await stampScheduleTemplate(session.foreman as SupabaseClient<Database>, db, {
      projectId: proj.foremanTarget,
      templateId,
      startDate: '2027-01-04',
      savedByMemberId: member.foreman,
    });
    expect(r).toMatchObject({ ok: false, status: 403, error: "Only an Owner, Admin, the project's manager or its executive may stamp a template." });
    expect(await counts(proj.foremanTarget)).toEqual(before);
  });

  it('with Critical Path OFF → 409, and NOTHING written', async () => {
    const before = await counts(proj.off);
    const r = await stampScheduleTemplate(session.owner as SupabaseClient<Database>, db, {
      projectId: proj.off,
      templateId,
      startDate: '2027-01-04',
      savedByMemberId: member.owner,
    });
    expect(r).toMatchObject({ ok: false, status: 409, error: 'Turn on Critical Path for this project first.' });
    expect(await counts(proj.off)).toEqual(before);
  });
});

describe('DELETE (soft): Owner/Admin only', () => {
  it('a PM is refused (403) and the template stays; the Admin deletes it', async () => {
    expect(await deleteScheduleTemplate(session.project_manager as SupabaseClient<Database>, templateId)).toMatchObject({ ok: false, status: 403 });
    const live = async () => ((await admin.from('schedule_templates').select('is_deleted').eq('id', templateId).single()).data as { is_deleted: boolean }).is_deleted;
    expect(await live()).toBe(false);
    expect(await deleteScheduleTemplate(session.admin as SupabaseClient<Database>, templateId)).toEqual({ ok: true });
    expect(await live()).toBe(true);
  });
});
