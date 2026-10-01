import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { criticalPathTaskSaveSchema } from '@framefocus/shared/validation/critical-path';
import { companyToday } from '@framefocus/shared/utils/dates';
import { createClient } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getMyMember } from '@/lib/services/members';
import { recomputeProject } from '@/lib/critical-path/recompute';

// S122 Part 3 — SAVE ONE TASK OF A CRITICAL PATH PROJECT, THEN RECOMPUTE.
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

function json(status: number, error: string, cause: string) {
  // Every error response logs the real cause server-side (CLAUDE.md, Errors).
  console.error(`[critical-path save] ${status}: ${cause}`);
  return NextResponse.json({ error }, { status });
}

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string; taskId: string }> }
) {
  const { id: projectId, taskId } = await ctx.params;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json(400, 'The request body is not JSON.', 'body parse');
  }
  const parsed = criticalPathTaskSaveSchema.safeParse(raw);
  if (!parsed.success) {
    return json(400, parsed.error.issues[0]?.message ?? 'Invalid request.', `zod: ${parsed.error.message}`);
  }
  const body = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return json(401, 'Not signed in.', 'no user');

  // The task, as the caller sees it. RLS hides a task the caller may not see,
  // so "not found" here is existence-hiding, not a permission fall-through.
  const task = await supabase
    .from('tasks')
    .select('id, project_id, company_id')
    .eq('id', taskId)
    .eq('is_deleted', false)
    .maybeSingle();
  if (task.error) return json(500, 'Could not read the task.', `task read: ${task.error.message}`);
  if (!task.data || task.data.project_id !== projectId) {
    return json(404, 'Task not found.', `task ${taskId} not visible on project ${projectId}`);
  }

  const settings = await supabase
    .from('project_schedule_settings')
    .select('critical_path_enabled')
    .eq('project_id', projectId)
    .eq('is_deleted', false)
    .maybeSingle();
  if (settings.error) return json(500, 'Could not read the schedule settings.', `settings: ${settings.error.message}`);
  if (!settings.data?.critical_path_enabled) {
    return json(409, "This project's schedule is not on Critical Path.", `project ${projectId} not CP-enabled`);
  }

  const admin = getSupabaseAdmin() as SupabaseClient<Database>;
  const company = await admin.from('companies').select('timezone').eq('id', task.data.company_id).maybeSingle();
  if (company.error || !company.data) {
    return json(500, 'Could not read the company.', `company: ${company.error?.message ?? 'not found'}`);
  }

  // ── The task's own columns ──
  const { assignees, ...fields } = body;
  const cols: Database['public']['Tables']['tasks']['Update'] = { ...fields };
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
    const u = await supabase.from('tasks').update(cols).eq('id', taskId).select('id');
    if (u.error) {
      if (u.error.code === '42501') return json(403, u.error.message, `Q12 guard / RLS: ${u.error.message}`);
      if (u.error.code === '23514') return json(400, 'One of those values is out of range.', `check: ${u.error.message}`);
      return json(500, 'The task could not be saved.', `task update: ${u.error.message}`);
    }
    if (!u.data || u.data.length === 0) {
      return json(403, 'You cannot change this task.', `task update matched 0 rows for user ${user.id}`);
    }
    applied = true;
  }

  // ── The people, each with their own notify choice (ruling 11, Q13-A) ──
  if (assignees) {
    const set = await supabase.rpc('set_task_assignees', {
      p_task_id: taskId,
      p_member_ids: [...new Set(assignees.map((a) => a.member_id))],
    });
    if (set.error) {
      const status = set.error.code === '42501' ? 403 : 500;
      return json(status, `The people could not be saved: ${set.error.message}`, `set_task_assignees: ${set.error.message}`);
    }
    for (const a of assignees) {
      const n = await supabase
        .from('task_assignees')
        .update({ notify_changes: a.notify_changes })
        .eq('task_id', taskId)
        .eq('member_id', a.member_id)
        .eq('is_deleted', false)
        .select('id');
      if (n.error) return json(500, 'A notify choice could not be saved.', `notify: ${n.error.message}`);
      if (!n.data || n.data.length === 0) {
        return json(403, 'A notify choice could not be saved.', `notify matched 0 rows (${a.member_id})`);
      }
    }
    applied = true;
  }

  if (!applied) return NextResponse.json({ ok: true, recompute: null });

  const me = await getMyMember();
  const outcome = await recomputeProject(admin, projectId, {
    cause: { kind: 'task', taskId },
    savedByMemberId: me?.id ?? null,
  });
  if (outcome.status === 'failed') {
    // The save landed; the project stays marked, so the next read retries.
    console.error(`[critical-path save] recompute failed for ${projectId}: ${outcome.error}`);
    return NextResponse.json({ ok: true, recompute: { status: 'failed' } });
  }
  return NextResponse.json({ ok: true, recompute: outcome });
}
