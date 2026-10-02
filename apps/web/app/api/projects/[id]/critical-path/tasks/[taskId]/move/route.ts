import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { criticalPathMoveSchema } from '@framefocus/shared/validation/critical-path';
import {
  consequenceSentence,
  editSentence,
  previewEdit,
  shortDate,
  translateMove,
} from '@framefocus/shared/utils/critical-path-writes';
import type { CpTask } from '@framefocus/shared/utils/critical-path';
import type { CriticalPathTaskSave } from '@framefocus/shared/validation/critical-path';
import { createClient } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getMyMember } from '@/lib/services/members';
import { loadCriticalPathData } from '@/lib/critical-path/load';
import { applyCriticalPathSave, readCriticalPathTask, untoldOf } from '@/lib/critical-path/save';

// [S123 D-3] The ceiling for this invocation INCLUDING the notifications sent
// after the response (lib/critical-path/background.ts). Stated, not inherited
// from a project default nobody can read from the code. Sends that would start
// within 5 s of it are not started and are logged 'failed' with the reason.
export const maxDuration = 60;

// S122 Part 4 — A DATE GESTURE ON A TASK (the calendar drag, the schedule
// sheet's dates, the Gantt's end handle), translated for Critical Path
// [Josh, Q19, 2026-10-01: "A drag means 'not before here.'"].
//
//   project NOT on Critical Path → { cp: false }: the caller keeps S121's
//                                  direct date write, unchanged.
//   confirm: false               → the PREVIEW only: which edit the gesture
//                                  makes (a pin, a duration, days left, or the
//                                  typed dates of a duration-less task) and
//                                  what it does to the projected finish.
//                                  Nothing is written.
//   confirm: true                → the same translation, saved through the ONE
//                                  save path (lib/critical-path/save.ts).
//
// "from" is the task's STORED dates (the engine's answer), never the client's
// copy, so a stale page cannot turn a move into a resize.

function json(status: number, error: string, cause: string) {
  console.error(`[critical-path move] ${status}: ${cause}`);
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
  const parsed = criticalPathMoveSchema.safeParse(raw);
  if (!parsed.success) {
    return json(400, parsed.error.issues[0]?.message ?? 'Invalid request.', `zod: ${parsed.error.message}`);
  }
  const { to, confirm } = parsed.data;

  const supabase = (await createClient()) as unknown as SupabaseClient<Database>;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return json(401, 'Not signed in.', 'no user');

  const t = await readCriticalPathTask(supabase, projectId, taskId);
  if (!t.ok && t.status === 409) return NextResponse.json({ cp: false });
  if (!t.ok) return json(t.status, t.error, t.cause);

  const loaded = await loadCriticalPathData(supabase, projectId);
  if (!loaded.ok) return json(500, 'Could not read the schedule.', `load: ${loaded.error}`);
  const { input } = loaded.data;
  const task = input.tasks.find((x) => x.id === taskId);
  if (!task) return json(404, 'Task not found.', `task ${taskId} not in the loaded schedule`);
  if (!task.startDate || !task.dueDate) {
    return NextResponse.json({ cp: true, mode: 'refused', error: 'This task has no dates to move yet. Open it and give it a duration.' });
  }
  const from = { start: task.startDate, end: task.dueDate };

  const tr = translateMove(task, from, to, input.calendar, input.today, input.lostDays);
  if (tr.mode === 'refused') return NextResponse.json({ cp: true, mode: 'refused', error: tr.error });

  const after: CpTask = tr.mode === 'typed' ? { ...task, startDate: tr.start, dueDate: tr.end } : tr.after;
  const preview = previewEdit(input, after);
  const sentences =
    tr.mode === 'typed'
      ? [
          `Moves the dates typed on this task (it has no duration): ${shortDate(from.start)}–${shortDate(from.end)} → ${shortDate(tr.start)}–${shortDate(tr.end)}.`,
        ]
      : preview.parts.map(editSentence);
  // [S122 Part 5] Someone who may not change the schedule directly is told,
  // BEFORE confirming, that the change will be HELD for approval.
  const editor = await supabase.rpc('critical_path_schedule_editor', { p_project_id: projectId });
  const answer = {
    cp: true,
    mode: tr.mode,
    held: editor.data !== true,
    sentences,
    consequence: consequenceSentence(preview),
    newlyCritical: preview.newlyCritical.map((id) => input.tasks.find((x) => x.id === id)?.title ?? id),
  };
  if (!confirm) return NextResponse.json(answer);

  // ── Save: only what the gesture changed ──
  let body: CriticalPathTaskSave & { typed?: { start_date: string; due_date: string } };
  if (tr.mode === 'typed') {
    body = { typed: { start_date: tr.start, due_date: tr.end } };
  } else {
    body = {};
    if (after.durationDays !== task.durationDays) body.duration_days = after.durationDays;
    if (after.startConstraint !== task.startConstraint || after.constraintDate !== task.constraintDate) {
      body.start_constraint = after.startConstraint;
      body.constraint_date = after.constraintDate;
    }
    if (after.daysLeft !== task.daysLeft || after.daysLeftAsOf !== task.daysLeftAsOf) body.days_left = after.daysLeft;
  }
  const me = await getMyMember();
  const r = await applyCriticalPathSave(
    supabase,
    getSupabaseAdmin() as SupabaseClient<Database>,
    { projectId, taskId, companyId: t.companyId, userId: user.id, savedByMemberId: me?.id ?? null },
    body
  );
  if (!r.ok) return json(r.status, r.error, r.cause);
  // `untold` [S122 Part 6]: a drag tells the saver who could not be told, as the sheet does.
  return NextResponse.json({ ...answer, saved: true, held: r.held, untold: untoldOf(r.recompute) });
}
