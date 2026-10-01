// S122 Part 3 — RUN THE ENGINE AND WRITE ITS ANSWER THROUGH (Q9-A).
//
// Called with the SERVICE-ROLE client only (the route after an authorised save,
// the staff read-check, the daily cron). The engine's writes run as the service
// role, so the m26 triggers neither refuse them (Q12 guard: auth.uid() IS NULL
// is the engine) nor re-mark the project dirty.
//
// ORDER — clear the mark FIRST, then read, compute and write. A user's change
// that lands while this runs re-marks the project (the mark only fires when it
// is clear), so the next read recomputes it. Clearing LAST would erase that
// change's mark and leave its dates stale with nothing to say so.
//
// On any failure after the clear the mark is put back, so the next read retries.
//
// Every recompute that changes the projected finish writes ONE
// project_finish_history row naming its cause (ruling 5, Part 4 §1).

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { computeCriticalPath } from '@framefocus/shared/utils/critical-path';
import { planWriteThrough } from '@framefocus/shared/utils/critical-path-writes';
import { companyToday } from '@framefocus/shared/utils/dates';
import { CP_SETTINGS_COLUMNS, loadCriticalPathData, type CpSettings } from './load';

export type CpCauseKind =
  | 'task'
  | 'dependency'
  | 'calendar'
  | 'holiday'
  | 'weather'
  | 'time'
  | 'approval'
  | 'template'
  | 'enabled'
  | 'project_start'
  | 'inspection';

export interface CpCause {
  kind: CpCauseKind;
  taskId?: string | null;
}

export type RecomputeOutcome =
  | { status: 'not_enabled' }
  | {
      status: 'computed';
      previousFinish: string | null;
      projectedFinish: string | null;
      tasksWritten: number;
      historyWritten: boolean;
      cycle: string[] | null;
      error: string | null;
    }
  | { status: 'failed'; error: string };

export async function recomputeProject(
  admin: SupabaseClient<Database>,
  projectId: string,
  opts: { cause?: CpCause; savedByMemberId?: string | null; now?: Date } = {}
): Promise<RecomputeOutcome> {
  const s = await admin
    .from('project_schedule_settings')
    .select(CP_SETTINGS_COLUMNS)
    .eq('project_id', projectId)
    .eq('is_deleted', false)
    .maybeSingle();
  if (s.error) return { status: 'failed', error: `settings: ${s.error.message}` };
  const settings = s.data as CpSettings | null;
  if (!settings?.critical_path_enabled) return { status: 'not_enabled' };

  // The cause: the caller's (it knows exactly what it saved), else the one the
  // mark carries, else time passing (nothing was changed — the day moved).
  const cause: CpCause = opts.cause ?? {
    kind: (settings.recompute_cause_kind as CpCauseKind | null) ?? 'time',
    taskId: settings.recompute_cause_task_id,
  };

  // 1. Clear the mark FIRST (see the header).
  const clear = await admin
    .from('project_schedule_settings')
    .update({ needs_recompute: false, recompute_cause_kind: null, recompute_cause_task_id: null })
    .eq('id', settings.id);
  if (clear.error) return { status: 'failed', error: `clear: ${clear.error.message}` };

  const fail = async (error: string): Promise<RecomputeOutcome> => {
    await admin
      .from('project_schedule_settings')
      .update({
        needs_recompute: true,
        recompute_cause_kind: cause.kind,
        recompute_cause_task_id: cause.taskId ?? null,
      })
      .eq('id', settings.id);
    return { status: 'failed', error };
  };

  // 2. Read and compute.
  const loaded = await loadCriticalPathData(admin, projectId, opts.now);
  if (!loaded.ok) return fail(loaded.error);
  const { input, inspectionOf, timeZone, companyId } = loaded.data;
  const result = computeCriticalPath(input);

  // 3. Write the dates through (nothing on a cycle — the schedule has no answer).
  const writes = planWriteThrough(input.tasks, result);
  for (const w of writes) {
    const { id, ...cols } = w;
    const u = await admin.from('tasks').update(cols).eq('id', id);
    if (u.error) return fail(`task ${id}: ${u.error.message}`);
    const inspectionId = inspectionOf[id];
    if (inspectionId && cols.start_date) {
      // Q10-A: the inspection's own date follows its schedule node.
      const i = await admin.from('inspections').update({ scheduled_date: cols.start_date }).eq('id', inspectionId);
      if (i.error) return fail(`inspection ${inspectionId}: ${i.error.message}`);
    }
  }

  // 4. Bookkeeping, then the history row if the finish moved.
  const previousFinish = settings.projected_finish;
  const projectedFinish = result.projectedFinish;
  const book = await admin
    .from('project_schedule_settings')
    .update({ computed_on: companyToday(timeZone, opts.now ?? new Date()), projected_finish: projectedFinish })
    .eq('id', settings.id);
  if (book.error) return fail(`settings: ${book.error.message}`);

  let historyWritten = false;
  if (previousFinish !== projectedFinish) {
    const h = await admin.from('project_finish_history').insert({
      company_id: companyId,
      project_id: projectId,
      previous_finish: previousFinish,
      new_finish: projectedFinish,
      cause_kind: cause.kind,
      cause_task_id: cause.taskId ?? null,
      saved_by_member_id: opts.savedByMemberId ?? null,
    });
    if (h.error) return fail(`history: ${h.error.message}`);
    historyWritten = true;
  }

  return {
    status: 'computed',
    previousFinish,
    projectedFinish,
    tasksWritten: writes.length,
    historyWritten,
    cycle: result.cycle,
    error: result.error,
  };
}

/**
 * The read-check (trigger 9 and the safety net for every other trigger): a
 * Critical Path project whose mark is set, or that was last computed before
 * the company's today, is recomputed before anyone reads its dates.
 */
export async function ensureScheduleFresh(
  admin: SupabaseClient<Database>,
  projectId: string,
  now: Date = new Date()
): Promise<RecomputeOutcome | { status: 'fresh' }> {
  const s = await admin
    .from('project_schedule_settings')
    .select('critical_path_enabled, needs_recompute, computed_on, company_id')
    .eq('project_id', projectId)
    .eq('is_deleted', false)
    .maybeSingle();
  if (s.error) return { status: 'failed', error: `settings: ${s.error.message}` };
  if (!s.data?.critical_path_enabled) return { status: 'not_enabled' };
  if (!s.data.needs_recompute && s.data.computed_on) {
    const c = await admin.from('companies').select('timezone').eq('id', s.data.company_id).maybeSingle();
    if (c.error || !c.data) return { status: 'failed', error: `company: ${c.error?.message ?? 'not found'}` };
    if (s.data.computed_on >= companyToday(c.data.timezone, now)) return { status: 'fresh' };
  }
  return recomputeProject(admin, projectId, { now });
}
