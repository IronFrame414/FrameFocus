import { createClient } from '@/lib/supabase-browser';
import type { Database } from '@framefocus/shared/types/database';
import { uploadFile } from '@/lib/services/files-client';
import type { DailyLog, DayPresence } from '@/lib/services/daily-logs';
import { SIGNED_URL_TTL_SECONDS } from './signed-url-ttl';
export type { DailyLog, DailyLogDetail, DayPresence, LogPhoto } from '@/lib/services/daily-logs';

// 6B Daily Logs — client mutations (6B-1 spec §4). RLS enforces authority:
// insert = any member on a visible project; update = author OR Owner/Admin
// (live policy, Phase 3 Q1); soft-delete = Owner/Admin (update with_check).

type MutationResult = { success: boolean; error?: string };
type CreateResult = { success: boolean; id?: string; error?: string };

type DailyLogInsert = Database['public']['Tables']['daily_logs']['Insert'];
type DailyLogUpdate = Database['public']['Tables']['daily_logs']['Update'];

export interface DailyLogFields {
  log_date: string;
  weather?: string | null;
  work_performed?: string | null;
  material_used?: string | null;
  material_needed?: string | null;
  equipment_used?: string | null;
  tasks_tomorrow?: string | null;
  notes?: string | null;
  hazards_present: boolean;
  hazard_notes?: string | null;
}

export interface SubEntryInput {
  /** Present when editing an existing row; absent for new rows. */
  id?: string;
  member_id: string;
  hours: number;
  note?: string | null;
}

type UntypedRpc = (
  fn: string,
  args?: Record<string, unknown>
) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

/**
 * Create a log with its crew snapshot and sub entries. company_id,
 * author_member_id, created_by fill from column defaults.
 */
export async function createDailyLog(
  projectId: string,
  fields: DailyLogFields,
  crewMemberIds: string[],
  subEntries: SubEntryInput[]
): Promise<CreateResult> {
  const supabase = createClient();

  const insert: DailyLogInsert = { project_id: projectId, ...fields };
  const { data, error } = await supabase.from('daily_logs').insert(insert).select('id').single();
  if (error) return { success: false, error: error.message };

  if (crewMemberIds.length > 0) {
    const { error: crewError } = await supabase
      .from('daily_log_crew')
      .insert(crewMemberIds.map((member_id) => ({ daily_log_id: data.id, member_id })));
    if (crewError) return { success: false, id: data.id, error: crewError.message };
  }

  if (subEntries.length > 0) {
    const { error: subError } = await supabase.from('daily_log_sub_entries').insert(
      subEntries.map((s) => ({
        daily_log_id: data.id,
        member_id: s.member_id,
        hours: s.hours,
        note: s.note ?? null,
      }))
    );
    if (subError) return { success: false, id: data.id, error: subError.message };
  }

  return { success: true, id: data.id };
}

export async function updateDailyLog(
  id: string,
  updates: Partial<DailyLogFields>
): Promise<MutationResult> {
  const supabase = createClient();
  // BEFORE UPDATE trigger `daily_logs_set_updated_by` handles updated_by.
  // updated_at is handled by the existing updated_at trigger.
  const { error } = await supabase
    .from('daily_logs')
    .update(updates as DailyLogUpdate)
    .eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/**
 * Reconcile the crew list to `memberIds`. Junction rows hard-delete on
 * removal — the daily_log_crew DELETE policy exists for exactly this; the
 * log itself is what soft-deletes.
 */
export async function setDailyLogCrew(
  logId: string,
  memberIds: string[]
): Promise<MutationResult> {
  const supabase = createClient();
  const { data: current, error: readError } = await supabase
    .from('daily_log_crew')
    .select('id, member_id')
    .eq('daily_log_id', logId)
    .eq('is_deleted', false);
  if (readError) return { success: false, error: readError.message };

  const want = new Set(memberIds);
  const have = new Set((current ?? []).map((c) => c.member_id));
  const removeIds = (current ?? []).filter((c) => !want.has(c.member_id)).map((c) => c.id);
  const addRows = memberIds
    .filter((m) => !have.has(m))
    .map((member_id) => ({ daily_log_id: logId, member_id }));

  if (removeIds.length > 0) {
    const { error } = await supabase.from('daily_log_crew').delete().in('id', removeIds);
    if (error) return { success: false, error: error.message };
  }
  if (addRows.length > 0) {
    const { error } = await supabase.from('daily_log_crew').insert(addRows);
    if (error) return { success: false, error: error.message };
  }
  return { success: true };
}

/** Reconcile sub entries: update rows with ids, insert new, delete missing. */
export async function setDailyLogSubEntries(
  logId: string,
  entries: SubEntryInput[]
): Promise<MutationResult> {
  const supabase = createClient();
  const { data: current, error: readError } = await supabase
    .from('daily_log_sub_entries')
    .select('id')
    .eq('daily_log_id', logId)
    .eq('is_deleted', false);
  if (readError) return { success: false, error: readError.message };

  const keptIds = new Set(entries.filter((e) => e.id).map((e) => e.id as string));
  const removeIds = (current ?? []).map((r) => r.id).filter((id) => !keptIds.has(id));

  if (removeIds.length > 0) {
    const { error } = await supabase.from('daily_log_sub_entries').delete().in('id', removeIds);
    if (error) return { success: false, error: error.message };
  }
  for (const entry of entries) {
    if (entry.id) {
      // Triggers own updated_at / updated_by.
      const { error } = await supabase
        .from('daily_log_sub_entries')
        .update({ member_id: entry.member_id, hours: entry.hours, note: entry.note ?? null })
        .eq('id', entry.id);
      if (error) return { success: false, error: error.message };
    } else {
      const { error } = await supabase.from('daily_log_sub_entries').insert({
        daily_log_id: logId,
        member_id: entry.member_id,
        hours: entry.hours,
        note: entry.note ?? null,
      });
      if (error) return { success: false, error: error.message };
    }
  }
  return { success: true };
}

/** Soft delete — RLS with_check restricts this to Owner/Admin. */
export async function softDeleteDailyLog(id: string): Promise<MutationResult> {
  const supabase = createClient();
  const { error } = await supabase
    .from('daily_logs')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/**
 * Presence for the create form's date picker (interaction-time fetch — the
 * documented client-side-read deviation, same as listPickerTasks). RPC is
 * unknown-narrowed until types regenerate (migration 20260721060000).
 */
export async function listProjectDayPresence(
  projectId: string,
  logDate: string
): Promise<DayPresence[]> {
  const supabase = createClient();
  const rpc = supabase.rpc.bind(supabase) as unknown as UntypedRpc;
  const { data, error } = await rpc('get_project_day_presence', {
    p_project_id: projectId,
    p_date: logDate,
  });
  if (error || !Array.isArray(data)) return [];
  return data as DayPresence[];
}

/**
 * Desktop photo attach — LOG-BOUND (S87 revision): the upload links to its
 * log via files.daily_log_id (migration 20260721080000), so same-day sibling
 * logs never pool attachments. category 'daily_logs' keeps these OUT of the
 * client-facing photo library; client_visible (default false) is the
 * per-file share flag.
 */
export async function uploadDailyLogPhoto(
  file: File,
  projectId: string,
  logId: string
): Promise<{ success: boolean; id?: string; error?: string }> {
  const uploaded = await uploadFile(file, { project_id: projectId, category: 'daily_logs' });
  if (!uploaded.success || !uploaded.id) return uploaded;

  const supabase = createClient();
  // daily_log_id (migration 20260721080000) is not in database.ts until the
  // next type regen — swap to a plain typed update then.
  const link = { daily_log_id: logId } as unknown as Database['public']['Tables']['files']['Update'];
  const { error } = await supabase.from('files').update(link).eq('id', uploaded.id);
  if (error) {
    return { success: false, id: uploaded.id, error: `Photo uploaded but not linked: ${error.message}` };
  }
  return uploaded;
}

/** Toggle files.client_visible (flag only in v1 — portal enforcement is M9). */
export async function setFileClientVisible(
  fileId: string,
  visible: boolean
): Promise<MutationResult> {
  const supabase = createClient();
  // client_visible (migration 20260721070000) is not in database.ts until the
  // next type regen — swap to a plain typed update then.
  const updates = { client_visible: visible } as unknown as Database['public']['Tables']['files']['Update'];
  const { error } = await supabase.from('files').update(updates).eq('id', fileId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/** Generate (or regenerate) the log's PDF via the server route (§2.3). */
export async function generateDailyLogPdf(
  logId: string
): Promise<{ success: boolean; error?: string }> {
  const res = await fetch(`/api/daily-logs/${logId}/pdf`, { method: 'POST' });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    return { success: false, error: body?.error ?? `PDF generation failed (${res.status})` };
  }
  return { success: true };
}

/** Signed URL for viewing/downloading a stored file (browser-side). */
export async function getFileSignedUrl(
  filePath: string,
  downloadName?: string
): Promise<string | null> {
  const supabase = createClient();
  const { data } = await supabase.storage
    .from('project-files')
    .createSignedUrl(filePath, SIGNED_URL_TTL_SECONDS, downloadName ? { download: downloadName } : undefined);
  return data?.signedUrl ?? null;
}
