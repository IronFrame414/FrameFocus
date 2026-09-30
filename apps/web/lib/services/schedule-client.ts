import { createClient } from '@/lib/supabase-browser';
import { applied, DISCARDED } from '@/lib/services/mutation-result';
import type {
  CalendarEvent,
  GeneralKind,
  Inspection,
  InspectionResult,
  ScheduleEntry,
} from '@/lib/services/schedule';
export type { CalendarEvent, GeneralKind, Inspection, InspectionResult, ScheduleEntry };

/**
 * Soft double-booking check (5B §5): unions the member's dated tasks and
 * general entries overlapping the range. NON-BLOCKING — the caller shows a
 * warning, never a hard block (locked decision; no DB constraint).
 */
export async function findOverlaps(
  memberId: string,
  startDate: string,
  endDate: string
): Promise<string[]> {
  const supabase = createClient();
  const warnings: string[] = [];

  // [S121 5-C] The member's tasks are the ones they are AMONG the assignees of
  // (task_assignees), not the ones whose single assignee_id is theirs.
  // SUPERSEDED: `.from('tasks')…eq('assignee_id', memberId)`.
  const { data: rows } = await supabase
    .from('task_assignees')
    .select('task:tasks!inner(title, start_date, due_date, is_deleted, is_scheduled)')
    .eq('member_id', memberId)
    .eq('is_deleted', false)
    .eq('task.is_deleted', false)
    .eq('task.is_scheduled', true);
  const tasks = (rows ?? []).map(
    (r) => r.task as unknown as { title: string; start_date: string | null; due_date: string | null }
  );

  for (const t of tasks ?? []) {
    const tStart = t.start_date ?? t.due_date!;
    const tEnd = t.due_date ?? t.start_date!;
    if (tStart <= endDate && tEnd >= startDate) {
      warnings.push(`Task "${t.title}" (${tStart}${tEnd !== tStart ? ` – ${tEnd}` : ''})`);
    }
  }

  const { data: entries } = await supabase
    .from('schedule_entries')
    .select('general_kind, entry_date, end_date, notes')
    .eq('member_id', memberId)
    .eq('is_deleted', false);

  for (const e of entries ?? []) {
    const eEnd = e.end_date ?? e.entry_date;
    if (e.entry_date <= endDate && eEnd >= startDate) {
      warnings.push(
        `${e.general_kind.toUpperCase()} entry (${e.entry_date}${eEnd !== e.entry_date ? ` – ${eEnd}` : ''})`
      );
    }
  }

  return warnings;
}

export async function createScheduleEntry(entry: {
  member_id: string;
  project_id?: string | null;
  entry_date: string;
  end_date?: string | null;
  general_kind: GeneralKind;
  notes?: string | null;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('schedule_entries')
    .insert(entry)
    .select('id')
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, id: data.id };
}

export async function deleteScheduleEntry(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('schedule_entries')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('id', id)
    .select('id');

  if (error) return { success: false, error: error.message };
  if (!applied(data)) return { success: false, error: DISCARDED };
  return { success: true };
}

// ── Inspections ──

export async function createInspection(inspection: {
  project_id: string;
  inspection_type: string;
  scheduled_date?: string | null;
  inspector?: string | null;
  notes?: string | null;
  permit_file_id?: string | null;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('inspections')
    .insert(inspection)
    .select('id')
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, id: data.id };
}

export async function updateInspection(
  id: string,
  updates: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  // BEFORE UPDATE trigger handles updated_by; updated_at trigger handles updated_at.
  const { data, error } = await supabase.from('inspections').update(updates).eq('id', id)
    .select('id');

  if (error) return { success: false, error: error.message };
  if (!applied(data)) return { success: false, error: DISCARDED };
  return { success: true };
}

export async function deleteInspection(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('inspections')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('id', id)
    .select('id');

  if (error) return { success: false, error: error.message };
  if (!applied(data)) return { success: false, error: DISCARDED };
  return { success: true };
}

// ── [S121 Part 5] Scheduling from the calendar (desktop AND /m — one set) ──
//
// Who may: owner, admin, PM, foreman [RULED Josh, ASK-5] — plus a PE on their
// own project (the existing arm, untouched — ASK-31). NOT crew, NOT a
// subcontractor. The database decides (schedule_entries_insert/update_authorized,
// tasks_update_authorized, task_assignees_*); these only write.

/** [S121 5-E] Move / resize a general entry. end = start stores NULL (one day). */
export async function updateScheduleEntryDates(
  id: string,
  start: string,
  end: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('schedule_entries')
    .update({ entry_date: start, end_date: end === start ? null : end })
    .eq('id', id)
    .select('id');
  if (error) return { success: false, error: error.message };
  if (!applied(data)) return { success: false, error: DISCARDED };
  return { success: true };
}

/** [S121 5-E] Move / resize a task's own dates (shared by everyone on it). */
export async function updateTaskDates(
  id: string,
  start: string,
  end: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('tasks')
    .update({ start_date: start, due_date: end })
    .eq('id', id)
    .select('id');
  if (error) return { success: false, error: error.message };
  if (!applied(data)) return { success: false, error: DISCARDED };
  return { success: true };
}

/**
 * [S121 5-E] THE move, for any bar. ⚠️ A resize that would put the end before
 * the start is CLAMPED by the caller (lib/schedule/drag.ts) and never reaches
 * here inverted; this refuses one anyway, in words.
 */
export async function moveCalendarEvent(
  e: Pick<CalendarEvent, 'id' | 'source'>,
  start: string,
  end: string
): Promise<{ success: boolean; error?: string }> {
  if (end < start) return { success: false, error: 'A bar cannot end before it starts.' };
  if (e.source === 'task') return updateTaskDates(e.id, start, end);
  if (e.source === 'general') return updateScheduleEntryDates(e.id, start, end);
  return { success: false, error: 'This item cannot be moved.' };
}

/** [S121 5-D] Member ids assigned to a project (live rows). */
export async function listProjectMemberIds(projectId: string): Promise<string[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('project_assignments')
    .select('member_id')
    .eq('project_id', projectId)
    .eq('is_deleted', false);
  if (error) return [];
  return [...new Set((data ?? []).map((r) => r.member_id as string).filter(Boolean))];
}

/** [S121 5-D] A project's open tasks, with their dates and people. */
export async function listProjectTasksForSchedule(projectId: string): Promise<
  { id: string; title: string; start_date: string | null; due_date: string | null; assignee_ids: string[] }[]
> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('tasks')
    .select('id, title, start_date, due_date, assignees:task_assignees(member_id, is_deleted)')
    .eq('project_id', projectId)
    .eq('is_deleted', false)
    .neq('status', 'complete')
    .order('title', { ascending: true })
    .order('id', { ascending: true });
  if (error) return [];
  return ((data ?? []) as unknown as {
    id: string;
    title: string;
    start_date: string | null;
    due_date: string | null;
    assignees: { member_id: string; is_deleted: boolean }[] | null;
  }[]).map((t) => ({
    id: t.id,
    title: t.title,
    start_date: t.start_date,
    due_date: t.due_date,
    assignee_ids: (t.assignees ?? []).filter((a) => !a.is_deleted).map((a) => a.member_id),
  }));
}
