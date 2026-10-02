// S122 Part 8 — CRITICAL PATH SCHEDULE TEMPLATES [ruling 6; Josh, unattended 2026-10-01].
//
// SAVE: a project's network (phases, tasks with durations, dependencies) is
// copied into a company template. ⚠️ No dates, no assignees, no percent — the
// template tables have no column for them, and nothing here reads them.
//
// STAMP: a template onto a project with ONE start date; the engine computes the
// rest (cause `template`).
//   ⚠️ [Josh, RULED 2026-10-01] A project that ALREADY HAS TASKS is REFUSED —
//   not merged, appended or replaced — and the refusal names how many.
//
// Both write AS THE CALLER, so RLS (owner/admin create templates; editors read
// them) and the existing task/dependency guards (only a schedule editor writes
// durations and links on a Critical Path project) decide. No SQL function
// [DECIDED UNATTENDED D8-1]; so a failure part-way through is COMPENSATED — what
// was written is soft-deleted and the start date put back — and said.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { recomputeProject, type RecomputeOutcome } from './recompute';

type Db = SupabaseClient<Database>;
export type TemplateError = { ok: false; status: number; error: string; cause: string };

/** The refusal sentence (Q14-A wording), shared by the route and its test. */
export function alreadyHasTasks(n: number): string {
  return `This project already has ${n} ${n === 1 ? 'task' : 'tasks'}; stamping would mix two plans. Stamp onto a project with no tasks.`;
}

// ── SAVE ─────────────────────────────────────────────────────────────────────

export async function saveScheduleTemplate(
  supabase: Db,
  admin: Db,
  input: { projectId: string; name: string }
): Promise<{ ok: true; templateId: string; phases: number; tasks: number; dependencies: number } | TemplateError> {
  const [ph, ts] = await Promise.all([
    supabase.from('phases').select('id, name, sort_order').eq('project_id', input.projectId).eq('is_deleted', false).order('sort_order'),
    supabase
      .from('tasks')
      .select('id, title, description, priority, duration_days, phase_id, created_at')
      .eq('project_id', input.projectId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true }),
  ]);
  if (ph.error || ts.error) {
    return { ok: false, status: 500, error: 'The network could not be read.', cause: `read: ${ph.error?.message ?? ts.error?.message}` };
  }
  const tasks = ts.data ?? [];
  if (tasks.length === 0) {
    return { ok: false, status: 409, error: 'This project has no tasks to save as a template.', cause: `project ${input.projectId} has 0 live tasks` };
  }
  const taskIds = tasks.map((t) => t.id);
  const dp = await supabase
    .from('task_dependencies')
    .select('predecessor_id, successor_id, dependency_type')
    .in('successor_id', taskIds)
    .eq('is_deleted', false);
  if (dp.error) return { ok: false, status: 500, error: 'The network could not be read.', cause: `deps: ${dp.error.message}` };
  const deps = (dp.data ?? []).filter((d) => taskIds.includes(d.predecessor_id));

  const tpl = await supabase.from('schedule_templates').insert({ name: input.name }).select('id').single();
  if (tpl.error || !tpl.data) {
    const status = tpl.error?.code === '42501' ? 403 : 500;
    return {
      ok: false,
      status,
      error: status === 403 ? 'Only an Owner or Admin may save a template.' : 'The template could not be saved.',
      cause: `template insert: ${tpl.error?.message ?? 'no row'}`,
    };
  }
  const templateId = tpl.data.id as string;
  const fail = async (cause: string): Promise<TemplateError> => {
    await softDeleteTemplate(admin, templateId);
    return { ok: false, status: 500, error: 'The template could not be saved; nothing was kept.', cause };
  };

  const phaseMap = new Map<string, string>();
  for (const p of ph.data ?? []) {
    const r = await supabase
      .from('schedule_template_phases')
      .insert({ template_id: templateId, name: p.name, sort_order: p.sort_order })
      .select('id')
      .single();
    if (r.error || !r.data) return fail(`phase: ${r.error?.message}`);
    phaseMap.set(p.id, r.data.id as string);
  }
  const taskMap = new Map<string, string>();
  let order = 0;
  for (const t of tasks) {
    const r = await supabase
      .from('schedule_template_tasks')
      .insert({
        template_id: templateId,
        phase_id: t.phase_id ? (phaseMap.get(t.phase_id) ?? null) : null,
        title: t.title,
        description: t.description,
        priority: t.priority,
        duration_days: t.duration_days,
        sort_order: order++,
      })
      .select('id')
      .single();
    if (r.error || !r.data) return fail(`task: ${r.error?.message}`);
    taskMap.set(t.id, r.data.id as string);
  }
  for (const d of deps) {
    const r = await supabase.from('schedule_template_dependencies').insert({
      template_id: templateId,
      predecessor_id: taskMap.get(d.predecessor_id)!,
      successor_id: taskMap.get(d.successor_id)!,
      dependency_type: d.dependency_type,
    });
    if (r.error) return fail(`dependency: ${r.error.message}`);
  }
  return { ok: true, templateId, phases: phaseMap.size, tasks: taskMap.size, dependencies: deps.length };
}

async function softDeleteTemplate(admin: Db, templateId: string) {
  const now = new Date().toISOString();
  for (const t of ['schedule_template_dependencies', 'schedule_template_tasks', 'schedule_template_phases'] as const) {
    await admin.from(t).update({ is_deleted: true, deleted_at: now }).eq('template_id', templateId);
  }
  await admin.from('schedule_templates').update({ is_deleted: true, deleted_at: now }).eq('id', templateId);
}

/** Owner/Admin delete (soft). RLS refuses anyone else: 0 rows → 403. */
export async function deleteScheduleTemplate(supabase: Db, templateId: string): Promise<{ ok: true } | TemplateError> {
  const r = await supabase
    .from('schedule_templates')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('id', templateId)
    .eq('is_deleted', false)
    .select('id');
  if (r.error) return { ok: false, status: 500, error: 'The template could not be deleted.', cause: `delete: ${r.error.message}` };
  if (!r.data || r.data.length === 0) {
    return { ok: false, status: 403, error: 'Only an Owner or Admin may delete a template.', cause: `delete ${templateId} matched 0 rows` };
  }
  return { ok: true };
}

export interface ScheduleTemplateSummary {
  id: string;
  name: string;
  tasks: number;
}

/** The templates the caller may stamp (RLS: editors of the company). */
export async function listScheduleTemplates(supabase: Db): Promise<ScheduleTemplateSummary[]> {
  const t = await supabase.from('schedule_templates').select('id, name').eq('is_deleted', false).order('name');
  if (t.error || !t.data || t.data.length === 0) return [];
  const c = await supabase
    .from('schedule_template_tasks')
    .select('template_id')
    .in('template_id', t.data.map((x) => x.id))
    .eq('is_deleted', false);
  const count = new Map<string, number>();
  for (const r of c.data ?? []) count.set(r.template_id, (count.get(r.template_id) ?? 0) + 1);
  return t.data.map((x) => ({ id: x.id, name: x.name, tasks: count.get(x.id) ?? 0 }));
}

// ── STAMP ────────────────────────────────────────────────────────────────────

export async function stampScheduleTemplate(
  supabase: Db,
  admin: Db,
  input: { projectId: string; templateId: string; startDate: string; savedByMemberId: string | null }
): Promise<{ ok: true; tasks: number; recompute: RecomputeOutcome } | TemplateError> {
  // 1. Only a schedule editor (Owner, Admin, the project's PM or PE) — the
  //    same function that decides who may write durations and links.
  const editor = await supabase.rpc('critical_path_schedule_editor', { p_project_id: input.projectId });
  if (editor.error) return { ok: false, status: 500, error: 'Could not check who may stamp.', cause: `editor rpc: ${editor.error.message}` };
  if (editor.data !== true) {
    return {
      ok: false,
      status: 403,
      error: "Only an Owner, Admin, the project's manager or its executive may stamp a template.",
      cause: `not a schedule editor of ${input.projectId}`,
    };
  }
  // 2. Critical Path must already be on [D8-2].
  const st = await supabase
    .from('project_schedule_settings')
    .select('critical_path_enabled')
    .eq('project_id', input.projectId)
    .eq('is_deleted', false)
    .maybeSingle();
  if (st.error) return { ok: false, status: 500, error: 'Could not read the project.', cause: `settings: ${st.error.message}` };
  if (!st.data?.critical_path_enabled) {
    return { ok: false, status: 409, error: 'Turn on Critical Path for this project first.', cause: `CP off on ${input.projectId}` };
  }
  // 3. ⚠️ REFUSE a project that already has tasks — and say how many [Josh, RULED].
  const existing = await supabase
    .from('tasks')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', input.projectId)
    .eq('is_deleted', false);
  if (existing.error) return { ok: false, status: 500, error: 'Could not read the project.', cause: `count: ${existing.error.message}` };
  if ((existing.count ?? 0) > 0) {
    return { ok: false, status: 409, error: alreadyHasTasks(existing.count ?? 0), cause: `project ${input.projectId} has ${existing.count} live tasks` };
  }
  // 4. The template, as the caller may read it.
  const [tp, tt, td] = await Promise.all([
    supabase.from('schedule_template_phases').select('id, name, sort_order').eq('template_id', input.templateId).eq('is_deleted', false).order('sort_order'),
    supabase
      .from('schedule_template_tasks')
      .select('id, phase_id, title, description, priority, duration_days, sort_order')
      .eq('template_id', input.templateId)
      .eq('is_deleted', false)
      .order('sort_order'),
    supabase
      .from('schedule_template_dependencies')
      .select('predecessor_id, successor_id, dependency_type')
      .eq('template_id', input.templateId)
      .eq('is_deleted', false),
  ]);
  if (tp.error || tt.error || td.error) {
    return { ok: false, status: 500, error: 'The template could not be read.', cause: `template read: ${tp.error?.message ?? tt.error?.message ?? td.error?.message}` };
  }
  if (!tt.data || tt.data.length === 0) {
    return { ok: false, status: 404, error: 'That template was not found, or it has no tasks.', cause: `template ${input.templateId}: 0 visible tasks` };
  }

  // 5. Write, as the caller. Anything that fails from here is compensated.
  const prior = await supabase.from('projects').select('start_date').eq('id', input.projectId).single();
  if (prior.error) return { ok: false, status: 500, error: 'Could not read the project.', cause: `project: ${prior.error.message}` };
  const written = { phases: [] as string[], tasks: [] as string[], deps: [] as string[] };
  const fail = async (status: number, error: string, cause: string): Promise<TemplateError> => {
    const now = new Date().toISOString();
    if (written.deps.length) await admin.from('task_dependencies').update({ is_deleted: true, deleted_at: now }).in('id', written.deps);
    if (written.tasks.length) await admin.from('tasks').update({ is_deleted: true, deleted_at: now }).in('id', written.tasks);
    if (written.phases.length) await admin.from('phases').update({ is_deleted: true, deleted_at: now }).in('id', written.phases);
    await admin.from('projects').update({ start_date: prior.data.start_date }).eq('id', input.projectId);
    return { ok: false, status, error: `${error} Nothing from the template was kept.`, cause };
  };

  const sd = await supabase.from('projects').update({ start_date: input.startDate }).eq('id', input.projectId).select('id');
  if (sd.error || !sd.data || sd.data.length === 0) {
    return fail(sd.error?.code === '42501' || !sd.error ? 403 : 500, 'The start date could not be set.', `start date: ${sd.error?.message ?? '0 rows'}`);
  }
  const phaseMap = new Map<string, string>();
  for (const p of tp.data ?? []) {
    const r = await supabase.from('phases').insert({ project_id: input.projectId, name: p.name, sort_order: p.sort_order }).select('id').single();
    if (r.error || !r.data) return fail(500, 'A phase could not be created.', `phase: ${r.error?.message}`);
    phaseMap.set(p.id, r.data.id as string);
    written.phases.push(r.data.id as string);
  }
  const taskMap = new Map<string, string>();
  // One insert per task, in template order: tasks have no order column and the
  // engine orders by created_at, so separate statements keep the order.
  for (const t of tt.data) {
    const r = await supabase
      .from('tasks')
      .insert({
        project_id: input.projectId,
        phase_id: t.phase_id ? (phaseMap.get(t.phase_id) ?? null) : null,
        title: t.title,
        description: t.description,
        priority: t.priority,
        duration_days: t.duration_days,
      })
      .select('id')
      .single();
    if (r.error || !r.data) return fail(r.error?.code === '42501' ? 403 : 500, 'A task could not be created.', `task: ${r.error?.message}`);
    taskMap.set(t.id, r.data.id as string);
    written.tasks.push(r.data.id as string);
  }
  for (const d of td.data ?? []) {
    const r = await supabase
      .from('task_dependencies')
      .insert({ predecessor_id: taskMap.get(d.predecessor_id)!, successor_id: taskMap.get(d.successor_id)!, dependency_type: d.dependency_type })
      .select('id')
      .single();
    if (r.error || !r.data) return fail(r.error?.code === '42501' ? 403 : 500, 'A link could not be created.', `dependency: ${r.error?.message}`);
    written.deps.push(r.data.id as string);
  }

  // 6. The engine computes the dates, cause `template`.
  const recompute = await recomputeProject(admin, input.projectId, { cause: { kind: 'template' }, savedByMemberId: input.savedByMemberId });
  if (recompute.status === 'failed') console.error(`[templates stamp] recompute ${input.projectId}: ${recompute.error}`);
  return { ok: true, tasks: written.tasks.length, recompute };
}
