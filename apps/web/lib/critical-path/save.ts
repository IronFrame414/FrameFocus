// S122 Parts 3–4 — THE ONE SAVE PATH for a task on a Critical Path project.
// The line sheet's route and the gesture route (calendar drag, schedule
// sheet, Gantt end handle) both end here, so a sheet edit and a drag cannot
// disagree about what a save writes (PARITY).
//
// The write runs as the CALLER (their session client), so RLS and the m26 Q12
// guard decide whether it is allowed: Owner/Admin, a PM who can view the
// project, and the project's PE may change the schedule; a foreman's or a crew
// assignee's schedule change is refused by the database (42501) until Part 5
// turns it into a held, visible "pending" submission [Josh, 2026-10-01].
// Status and percent stay writable by an assignee, as on any project.
//
// Only AFTER an applied write does the engine run (service role) and write
// the dates through (Q9-A), logging a finish-history row if the finish moved.
// A refused or empty write recomputes nothing.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import type { CriticalPathTaskSave } from '@framefocus/shared/validation/critical-path';
import { companyToday } from '@framefocus/shared/utils/dates';
import { recomputeProject, type RecomputeOutcome } from './recompute';

export type CpSaveError = { ok: false; status: number; error: string; cause: string };

/** The task and its project's switch, as the CALLER sees them. */
export async function readCriticalPathTask(
  supabase: SupabaseClient<Database>,
  projectId: string,
  taskId: string
): Promise<{ ok: true; companyId: string } | CpSaveError> {
  // RLS hides a task the caller may not see, so "not found" here is
  // existence-hiding, not a permission fall-through.
  const task = await supabase
    .from('tasks')
    .select('id, project_id, company_id')
    .eq('id', taskId)
    .eq('is_deleted', false)
    .maybeSingle();
  if (task.error) return { ok: false, status: 500, error: 'Could not read the task.', cause: `task read: ${task.error.message}` };
  if (!task.data || task.data.project_id !== projectId) {
    return { ok: false, status: 404, error: 'Task not found.', cause: `task ${taskId} not visible on project ${projectId}` };
  }
  const settings = await supabase
    .from('project_schedule_settings')
    .select('critical_path_enabled')
    .eq('project_id', projectId)
    .eq('is_deleted', false)
    .maybeSingle();
  if (settings.error) {
    return { ok: false, status: 500, error: 'Could not read the schedule settings.', cause: `settings: ${settings.error.message}` };
  }
  if (!settings.data?.critical_path_enabled) {
    return { ok: false, status: 409, error: "This project's schedule is not on Critical Path.", cause: `project ${projectId} not CP-enabled` };
  }
  return { ok: true, companyId: task.data.company_id };
}

/**
 * Apply one save. `typed` is the gesture path's write for a task with NO
 * duration (Q15-A): its typed dates move, nothing is derived. It never comes
 * from the network schema.
 */
export async function applyCriticalPathSave(
  supabase: SupabaseClient<Database>,
  admin: SupabaseClient<Database>,
  ctx: { projectId: string; taskId: string; companyId: string; userId: string; savedByMemberId: string | null },
  body: CriticalPathTaskSave & { typed?: { start_date: string; due_date: string } }
): Promise<{ ok: true; recompute: RecomputeOutcome | null } | CpSaveError> {
  const company = await admin.from('companies').select('timezone').eq('id', ctx.companyId).maybeSingle();
  if (company.error || !company.data) {
    return { ok: false, status: 500, error: 'Could not read the company.', cause: `company: ${company.error?.message ?? 'not found'}` };
  }

  // ── The task's own columns ──
  const { assignees, typed, ...fields } = body;
  const cols: Database['public']['Tables']['tasks']['Update'] = { ...fields };
  if (typed) {
    cols.start_date = typed.start_date;
    cols.due_date = typed.due_date;
  }
  if (fields.days_left !== undefined) {
    // Q1-A: the as-of stamp is the server's, the company's today — never the client's.
    cols.days_left_as_of = fields.days_left === null ? null : companyToday(company.data.timezone);
  }
  if (fields.status === 'complete') {
    cols.completed_at = new Date().toISOString();
    cols.percent_complete = 100;
  } else if (fields.status !== undefined) {
    cols.completed_at = null;
  }

  let applied = false;
  if (Object.keys(cols).length > 0) {
    const u = await supabase.from('tasks').update(cols).eq('id', ctx.taskId).select('id');
    if (u.error) {
      if (u.error.code === '42501') return { ok: false, status: 403, error: u.error.message, cause: `Q12 guard / RLS: ${u.error.message}` };
      if (u.error.code === '23514') return { ok: false, status: 400, error: 'One of those values is out of range.', cause: `check: ${u.error.message}` };
      return { ok: false, status: 500, error: 'The task could not be saved.', cause: `task update: ${u.error.message}` };
    }
    if (!u.data || u.data.length === 0) {
      return { ok: false, status: 403, error: 'You cannot change this task.', cause: `task update matched 0 rows for user ${ctx.userId}` };
    }
    applied = true;
  }

  // ── The people, each with their own notify choice (ruling 11, Q13-A) ──
  if (assignees) {
    const set = await supabase.rpc('set_task_assignees', {
      p_task_id: ctx.taskId,
      p_member_ids: [...new Set(assignees.map((a) => a.member_id))],
    });
    if (set.error) {
      return {
        ok: false,
        status: set.error.code === '42501' ? 403 : 500,
        error: `The people could not be saved: ${set.error.message}`,
        cause: `set_task_assignees: ${set.error.message}`,
      };
    }
    for (const a of assignees) {
      const n = await supabase
        .from('task_assignees')
        .update({ notify_changes: a.notify_changes })
        .eq('task_id', ctx.taskId)
        .eq('member_id', a.member_id)
        .eq('is_deleted', false)
        .select('id');
      if (n.error) return { ok: false, status: 500, error: 'A notify choice could not be saved.', cause: `notify: ${n.error.message}` };
      if (!n.data || n.data.length === 0) {
        return { ok: false, status: 403, error: 'A notify choice could not be saved.', cause: `notify matched 0 rows (${a.member_id})` };
      }
    }
    applied = true;
  }

  if (!applied) return { ok: true, recompute: null };

  const outcome = await recomputeProject(admin, ctx.projectId, {
    cause: { kind: 'task', taskId: ctx.taskId },
    savedByMemberId: ctx.savedByMemberId,
  });
  if (outcome.status === 'failed') {
    // The save landed; the project stays marked, so the next read retries.
    console.error(`[critical-path save] recompute failed for ${ctx.projectId}: ${outcome.error}`);
  }
  return { ok: true, recompute: outcome };
}
