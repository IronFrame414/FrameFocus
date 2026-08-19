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

  const { data: tasks } = await supabase
    .from('tasks')
    .select('title, start_date, due_date')
    .eq('assignee_id', memberId)
    .eq('is_deleted', false)
    .eq('is_scheduled', true);

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
