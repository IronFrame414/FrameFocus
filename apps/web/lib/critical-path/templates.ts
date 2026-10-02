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
// durations and links on a Critical Path project) decide.
// SAVE is app code [D8-1]. STAMP is ONE SQL function, SECURITY INVOKER, so it is
// all-or-nothing [S123 D-4, Josh RULED] — superseding D8-1's compensation.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { recomputeProject, type RecomputeOutcome } from './recompute';
import { alreadyHasTasks } from './template-words';

export { alreadyHasTasks };

type Db = SupabaseClient<Database>;
export type TemplateError = { ok: false; status: number; error: string; cause: string };


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
  // [S123 D-4, Josh RULED] ONE call, ONE transaction: stamp_schedule_template
  // (20262132000000) runs as the caller and does the editor check, the CP-on
  // check, the per-project lock, Part 8's refusal and every write. Any error
  // rolls ALL of it back — the project is left exactly as it was, so a retry is
  // never refused by the leftovers of a failed attempt.
  // ⚠️ SUPERSEDED [S122 Part 8, D8-1]: "a failure part-way through is
  // COMPENSATED — what was written is soft-deleted and the start date put
  // back". That cleanup ran at the worst moment and never checked its writes.
  const r = await supabase.rpc('stamp_schedule_template', {
    p_project_id: input.projectId,
    p_template_id: input.templateId,
    p_start_date: input.startDate,
  });
  if (r.error) return stampError(r.error);

  // The engine computes the dates, cause `template` — AFTER the commit (it is
  // TypeScript). The inserts marked the project, so if this fails the next read
  // or the hourly cron recomputes it.
  const recompute = await recomputeProject(admin, input.projectId, { cause: { kind: 'template' }, savedByMemberId: input.savedByMemberId });
  if (recompute.status === 'failed') console.error(`[templates stamp] recompute ${input.projectId}: ${recompute.error}`);
  return { ok: true, tasks: r.data as number, recompute };
}

/** Each refusal the function raises, answered truthfully (its SQLSTATE says which). */
function stampError(e: { code?: string; message: string; details?: string | null }): TemplateError {
  const cause = `stamp_schedule_template ${e.code ?? '?'}: ${e.message}`;
  switch (e.code) {
    case 'FFED1':
      return { ok: false, status: 403, error: "Only an Owner, Admin, the project's manager or its executive may stamp a template.", cause };
    case 'FFCP0':
      return { ok: false, status: 409, error: 'Turn on Critical Path for this project first.', cause };
    case 'FFHAS':
      // ⚠️ [Josh, RULED 2026-10-01] Refused, and the count named.
      return { ok: false, status: 409, error: alreadyHasTasks(Number(e.details ?? 0)), cause };
    case 'FFTP0':
      return { ok: false, status: 404, error: 'That template was not found, or it has no tasks.', cause };
    case 'FFSD0':
      return { ok: false, status: 403, error: 'The start date could not be set. Nothing from the template was written.', cause };
    case 'FFTPL':
      return { ok: false, status: 500, error: 'That template links a task it no longer has. Nothing from the template was written.', cause };
    case '42501':
      return { ok: false, status: 403, error: 'You cannot write this schedule. Nothing from the template was written.', cause };
    default:
      return { ok: false, status: 500, error: 'The template could not be stamped. Nothing from the template was written.', cause };
  }
}
