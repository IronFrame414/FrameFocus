// S122 Part 5 — DECIDING A HELD SCHEDULE CHANGE (approve / reject / withdraw).
//
// [Josh, ruling 7 + 2026-10-01] A held change shows to everyone, grayed and
// marked pending, and moves no date. APPROVING applies it through the ONE save
// path (lib/critical-path/save.ts), as the approver — an Owner, Admin, the
// project's PM or its PE — so it passes the Q12 guard and is recomputed and
// logged like any edit, with the cause `approval`. Rejecting or withdrawing
// writes nothing to the task.
//
// ORDER for an approval: every check the database would make on the decision
// is made FIRST (pending; a schedule editor; not the submitter), THEN the change
// is applied, THEN the row is marked approved. Marking first and applying second
// would leave an "approved" change that never landed if the apply failed;
// applying without the checks first would land a change the decision then
// refuses.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { heldScheduleChangesSchema } from '@framefocus/shared/validation/critical-path';
import { applyCriticalPathSave, type CpSaveError } from './save';

export type HeldDecision = 'approve' | 'reject' | 'withdraw';

export async function decideScheduleEdit(
  supabase: SupabaseClient<Database>,
  admin: SupabaseClient<Database>,
  ctx: { projectId: string; editId: string; userId: string; myMemberId: string | null },
  decision: HeldDecision,
  note: string | null
): Promise<{ ok: true } | CpSaveError> {
  const edit = await supabase
    .from('task_schedule_edits')
    .select('id, project_id, company_id, task_id, status, changes, submitted_by_member_id')
    .eq('id', ctx.editId)
    .eq('is_deleted', false)
    .maybeSingle();
  if (edit.error) return { ok: false, status: 500, error: 'Could not read the change.', cause: `edit read: ${edit.error.message}` };
  if (!edit.data || edit.data.project_id !== ctx.projectId) {
    return { ok: false, status: 404, error: 'That change was not found.', cause: `edit ${ctx.editId} not visible on ${ctx.projectId}` };
  }
  if (edit.data.status !== 'pending') {
    return { ok: false, status: 409, error: 'This change has already been decided.', cause: `edit ${ctx.editId} is ${edit.data.status}` };
  }

  if (decision === 'approve') {
    const editor = await supabase.rpc('critical_path_schedule_editor', { p_project_id: ctx.projectId });
    if (editor.error) return { ok: false, status: 500, error: 'Could not check who may decide.', cause: `editor rpc: ${editor.error.message}` };
    if (editor.data !== true) {
      return {
        ok: false,
        status: 403,
        error: "Only an Owner, Admin, the project's manager or its executive may decide a schedule change.",
        cause: `user ${ctx.userId} is not a schedule editor of ${ctx.projectId}`,
      };
    }
    if (ctx.myMemberId && ctx.myMemberId === edit.data.submitted_by_member_id) {
      return { ok: false, status: 403, error: 'A schedule change cannot be approved by the person who submitted it.', cause: 'self-approval' };
    }
    const changes = heldScheduleChangesSchema.safeParse(edit.data.changes);
    if (!changes.success) {
      return { ok: false, status: 500, error: 'The held change could not be read.', cause: `changes: ${changes.error.message}` };
    }
    const applied = await applyCriticalPathSave(
      supabase,
      admin,
      {
        projectId: ctx.projectId,
        taskId: edit.data.task_id,
        companyId: edit.data.company_id,
        userId: ctx.userId,
        savedByMemberId: ctx.myMemberId,
        cause: { kind: 'approval', taskId: edit.data.task_id },
      },
      changes.data
    );
    if (!applied.ok) return applied;
    if (applied.held) {
      // Cannot happen for an editor; refuse loudly rather than mark it approved.
      return { ok: false, status: 500, error: 'The change was held again instead of applied.', cause: 'approve: apply returned held' };
    }
  }

  const status = decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : 'withdrawn';
  const u = await supabase
    .from('task_schedule_edits')
    .update({ status, decision_note: note })
    .eq('id', ctx.editId)
    .select('id');
  if (u.error) {
    const code = u.error.code === '42501' ? 403 : 500;
    const extra = decision === 'approve' ? ' (the change itself WAS applied)' : '';
    return { ok: false, status: code, error: `${u.error.message}${extra}`, cause: `decide ${decision}: ${u.error.message}` };
  }
  if (!u.data || u.data.length === 0) {
    return { ok: false, status: 403, error: 'You cannot decide this change.', cause: `decide ${decision} matched 0 rows` };
  }
  return { ok: true };
}
