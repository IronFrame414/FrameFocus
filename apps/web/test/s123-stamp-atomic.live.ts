/**
 * S123 D-4 — THE TEMPLATE STAMP IS ALL OR NOTHING. Migration 20262132000000
 * (stamp_schedule_template) + lib/critical-path/templates.ts. [Josh, RULED]
 *
 *   ⚠️ FORCED FAILURE PARTWAY: a template whose link points at a template task
 *   that was soft-deleted. The function finds it only at the LINK step — after
 *   the start date, the phase and task A are written. Counted with the service
 *   role, INCLUDING soft-deleted rows: 0 phases, 0 tasks, 0 links, 0 finish-
 *   history rows, the start date unchanged. (S122's compensation left the rows
 *   soft-deleted; "nothing written" here means NOT A ROW.)
 *   Then the template is mended and the SAME project is stamped again with no
 *   cleanup → it succeeds. (The poisoned retry is what D-4 exists to end.)
 *   ⚠️ CONCURRENCY: two stamps at once onto one empty project → exactly one
 *   succeeds; the other is refused with the count (the advisory lock).
 *   ORDER: the stamped tasks, in the engine's order (created_at, id), are the
 *   template's order — six tasks, so a random order passes 1 time in 720.
 * Part 8's refusal, editor, CP-off and PM cases stay in s122-cp-templates.live.ts.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { alreadyHasTasks, stampScheduleTemplate } from '@/lib/critical-path/templates';
import { admin, assertRebuildTest, deleteProjects, sessionFor, sweepProjectsNamed } from './live-session';

const MARKER = 'S123STA';
const OWNER = 'josh+test50@worthprop.com';
const db = admin as unknown as SupabaseClient<Database>;
let owner: SupabaseClient<Database>;
let ownerMember = '';
let companyId = '';
let contactId = '';
let seq = 0;
const proj = { broken: '', race: '', order: '' };
const tpl = { broken: '', brokenB: '', race: '', order: '' };

const must = (label: string, error: { message: string } | null) => {
  if (error) throw new Error(`${label}: ${error.message}`);
};

async function purge(id: string) {
  const { data: ts } = await admin.from('tasks').select('id').eq('project_id', id);
  const ids = (ts ?? []).map((r) => r.id as string);
  await admin.from('notifications').delete().eq('project_id', id);
  await admin.from('project_finish_history').delete().eq('project_id', id);
  await admin.from('project_schedule_settings').delete().eq('project_id', id);
  if (ids.length) {
    await admin.from('task_dependencies').delete().in('successor_id', ids);
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

async function project(name: string): Promise<string> {
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
  must('assign', (await admin.from('project_assignments').insert({ company_id: companyId, project_id: id, member_id: ownerMember })).error);
  must('cp on', (await admin.from('project_schedule_settings').insert({ company_id: companyId, project_id: id, critical_path_enabled: true })).error);
  return id;
}

/** A template written by the service role: one phase, the tasks in order, links between them by index. */
async function template(name: string, titles: string[], links: [number, number][]): Promise<{ id: string; tasks: string[] }> {
  const { data: t, error } = await admin.from('schedule_templates').insert({ company_id: companyId, name: `${MARKER} ${name}` }).select('id').single();
  must(`template ${name}`, error);
  const id = t!.id as string;
  const { data: ph, error: pe } = await admin
    .from('schedule_template_phases')
    .insert({ company_id: companyId, template_id: id, name: `${MARKER} Phase`, sort_order: 0 })
    .select('id')
    .single();
  must('template phase', pe);
  const tasks: string[] = [];
  for (const [i, title] of titles.entries()) {
    const { data: tt, error: te } = await admin
      .from('schedule_template_tasks')
      .insert({ company_id: companyId, template_id: id, phase_id: ph!.id as string, title: `${MARKER} ${title}`, duration_days: 1 + (i % 3), sort_order: i })
      .select('id')
      .single();
    must(`template task ${title}`, te);
    tasks.push(tt!.id as string);
  }
  for (const [a, b] of links) {
    must('template link', (await admin.from('schedule_template_dependencies').insert({ company_id: companyId, template_id: id, predecessor_id: tasks[a], successor_id: tasks[b] })).error);
  }
  return { id, tasks };
}

/** EVERY row the stamp could have written, live OR soft-deleted, counted by the service role. */
async function everything(projectId: string) {
  const all = async (t: 'tasks' | 'phases') => (await admin.from(t).select('id', { count: 'exact', head: true }).eq('project_id', projectId)).count ?? 0;
  const { data: ts } = await admin.from('tasks').select('id').eq('project_id', projectId);
  const ids = (ts ?? []).map((r) => r.id as string);
  const links = ids.length ? ((await admin.from('task_dependencies').select('id', { count: 'exact', head: true }).in('successor_id', ids)).count ?? 0) : 0;
  const history = (await admin.from('project_finish_history').select('id', { count: 'exact', head: true }).eq('project_id', projectId)).count ?? 0;
  const { data: p } = await admin.from('projects').select('start_date').eq('id', projectId).single();
  return { tasks: await all('tasks'), phases: await all('phases'), links, history, start: (p as { start_date: string | null }).start_date };
}

const stamp = (projectId: string, templateId: string, startDate = '2027-01-04') =>
  stampScheduleTemplate(owner, db, { projectId, templateId, startDate, savedByMemberId: ownerMember });

beforeAll(async () => {
  assertRebuildTest();
  const { data: stale } = await admin.from('projects').select('id').like('name', `${MARKER}%`);
  for (const r of stale ?? []) await purge(r.id as string);
  await sweepProjectsNamed(MARKER);
  await purgeTemplates();
  owner = (await sessionFor(OWNER)) as SupabaseClient<Database>;
  const { data: p } = await admin.from('profiles').select('id, company_id').eq('email', OWNER).single();
  companyId = (p as { company_id: string }).company_id;
  const { data: m } = await admin.from('company_members').select('id').eq('profile_id', (p as { id: string }).id).eq('is_deleted', false).single();
  ownerMember = (m as { id: string }).id;
  const { data: seqRow } = await admin
    .from('projects')
    .select('project_internal_seq')
    .eq('company_id', companyId)
    .order('project_internal_seq', { ascending: false })
    .limit(1)
    .single();
  seq = (seqRow!.project_internal_seq as number) + 9700;
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

  proj.broken = await project('broken');
  proj.race = await project('race');
  proj.order = await project('order');

  // BROKEN: A → B, and then B is soft-deleted from the template, so the link is
  // the first thing that cannot be written — AFTER the start date, the phase and A.
  const b = await template('broken', ['A', 'B'], [[0, 1]]);
  tpl.broken = b.id;
  tpl.brokenB = b.tasks[1];
  must('break B', (await admin.from('schedule_template_tasks').update({ is_deleted: true, deleted_at: new Date().toISOString() }).eq('id', tpl.brokenB)).error);
  tpl.race = (await template('race', ['R1', 'R2', 'R3'], [[0, 1], [1, 2]])).id;
  // Titles deliberately NOT in alphabetical order, so a title sort cannot pass for the stamp's order.
  tpl.order = (await template('order', ['Pour', 'Excavate', 'Frame', 'Dry-in', 'Inspect', 'Close'], [])).id;
}, 600_000);

afterAll(async () => {
  for (const id of Object.values(proj)) if (id) await purge(id);
  await purgeTemplates();
  const { count } = await admin.from('projects').select('id', { count: 'exact', head: true }).like('name', `${MARKER}%`);
  expect(count ?? 0).toBe(0);
}, 600_000);

describe('⚠️ a failure partway leaves the project EXACTLY as it was', () => {
  it('the control: before the stamp the project holds nothing and starts 2026-11-02', async () => {
    expect(await everything(proj.broken)).toEqual({ tasks: 0, phases: 0, links: 0, history: 0, start: '2026-11-02' });
  });

  it('the stamp fails at the LINK step (after the start date, the phase and task A were written) → 500, said truthfully', async () => {
    const r = await stamp(proj.broken, tpl.broken);
    expect(r).toEqual({
      ok: false,
      status: 500,
      error: 'That template links a task it no longer has. Nothing from the template was written.',
      cause: expect.stringContaining('FFTPL'),
    });
  });

  it('⚠️ and NOT ONE ROW was kept — live or soft-deleted: 0 tasks, 0 phases, 0 links, 0 history; start date unchanged', async () => {
    expect(await everything(proj.broken)).toEqual({ tasks: 0, phases: 0, links: 0, history: 0, start: '2026-11-02' });
  });

  it('the template is mended; the SAME project is stamped again with NO cleanup → it succeeds (the retry is not poisoned)', async () => {
    must('mend B', (await admin.from('schedule_template_tasks').update({ is_deleted: false, deleted_at: null }).eq('id', tpl.brokenB)).error);
    const r = await stamp(proj.broken, tpl.broken);
    expect(r).toMatchObject({ ok: true, tasks: 2 });
    expect(await everything(proj.broken)).toEqual({ tasks: 2, phases: 1, links: 1, history: 1, start: '2027-01-04' });
  });
});

describe('⚠️ two stamps at the same moment', () => {
  it('exactly ONE succeeds; the other is refused with the count, and the project holds ONE template', async () => {
    const [a, b] = await Promise.all([stamp(proj.race, tpl.race), stamp(proj.race, tpl.race)]);
    const oks = [a, b].filter((r) => r.ok);
    const refused = [a, b].filter((r) => !r.ok);
    expect(oks).toHaveLength(1);
    expect(refused).toEqual([{ ok: false, status: 409, error: alreadyHasTasks(3), cause: expect.stringContaining('FFHAS') }]);
    expect(await everything(proj.race)).toMatchObject({ tasks: 3, phases: 1, links: 2 });
  });
});

describe('the stamped order is the template order', () => {
  it('six tasks, read in the ENGINE order (created_at, id), are the template order', async () => {
    expect(await stamp(proj.order, tpl.order)).toMatchObject({ ok: true, tasks: 6 });
    const { data } = await admin
      .from('tasks')
      .select('title')
      .eq('project_id', proj.order)
      .eq('is_deleted', false)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true });
    expect((data ?? []).map((t) => t.title)).toEqual(['Pour', 'Excavate', 'Frame', 'Dry-in', 'Inspect', 'Close'].map((t) => `${MARKER} ${t}`));
  });
});
