// S122 Part 5 — HELD (pending) schedule changes, read and described.
//
// [Josh, 2026-10-01] "A pending task edit is VISIBLE, not hidden. … it still
// shows up for everyone, rendered grayed with a 'pending' notice. It does not
// disappear until approved, and it does not move the computed dates — the date
// stays put with the consequence stated beside it."
//
// One loader and one consequence, used by every surface that shows a task
// (the schedule list, the Gantt, the line sheet, the Critical Path tab), so a
// pending change reads the same everywhere. A load that FAILS is returned as
// an error, never as "nothing pending": hiding a pending change because a read
// failed is exactly what the ruling forbids.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import type { CpInput } from '@framefocus/shared/utils/critical-path';
import {
  applyHeldChanges,
  consequenceSentence,
  previewEdit,
  type HeldChanges,
} from '@framefocus/shared/utils/critical-path-writes';

export interface PendingEdit {
  id: string;
  task_id: string;
  summary: string;
  changes: HeldChanges;
  submitted_at: string;
  submitted_by_member_id: string;
  submitter_name: string | null;
}

export async function loadPendingEdits(
  db: SupabaseClient<Database>,
  projectId: string
): Promise<{ ok: true; edits: PendingEdit[] } | { ok: false; error: string }> {
  const r = await db
    .from('task_schedule_edits')
    .select('id, task_id, summary, changes, submitted_at, submitted_by_member_id, submitter:company_members!task_schedule_edits_submitted_by_member_id_fkey(display_name)')
    .eq('project_id', projectId)
    .eq('status', 'pending')
    .eq('is_deleted', false)
    .order('submitted_at', { ascending: true })
    .order('id', { ascending: true });
  if (r.error) return { ok: false, error: r.error.message };
  return {
    ok: true,
    edits: (r.data ?? []).map((e) => {
      const sub = (e as unknown as { submitter: { display_name: string } | { display_name: string }[] | null }).submitter;
      const s = Array.isArray(sub) ? sub[0] : sub;
      return {
        id: e.id,
        task_id: e.task_id,
        summary: e.summary,
        changes: e.changes as HeldChanges,
        submitted_at: e.submitted_at,
        submitted_by_member_id: e.submitted_by_member_id,
        submitter_name: s?.display_name ?? null,
      };
    }),
  };
}

/** "If approved: This moves the projected finish from … to …" — null with no engine input. */
export function pendingConsequence(input: CpInput | null, edit: Pick<PendingEdit, 'task_id' | 'changes'>): string | null {
  if (!input) return null;
  const task = input.tasks.find((t) => t.id === edit.task_id);
  if (!task) return null;
  return `If approved: ${consequenceSentence(previewEdit(input, applyHeldChanges(task, edit.changes)))}`;
}
