import { createClient } from '@/lib/supabase-browser';
import { softDeleteFile } from '@/lib/services/files-client';

// ============================================================================
// S127 item 4d (A-1) — the BULK actions on a selection of photos. ONE module,
// read by BOTH surfaces (the /m grid's selection bar and the desktop Photos
// tab), so the two cannot disagree about what a bulk action writes [PARITY].
//
// Who may: `canBulkDeletePhotos` / `canSharePhotosWithClient` (Owner/Admin),
// which hide the controls. The DATABASE decides the rows: moving a file to
// Trash is Owner/Admin/PM/PE (`enforce_files_column_scope`), `client_visible`
// is Owner/Admin only (the same trigger). Every write here is ROW-COUNTED, so a
// refused row is reported, never a silent success.
// ============================================================================

export interface BulkOutcome {
  /** Rows actually changed. */
  done: number;
  total: number;
}

/** SOFT delete — each photo goes to the Trash (4a), restorable from there. */
export async function trashPhotos(ids: readonly string[]): Promise<BulkOutcome> {
  const results = await Promise.all(ids.map((id) => softDeleteFile(id)));
  return { done: results.filter((r) => r.success).length, total: ids.length };
}

/**
 * Show (or stop showing) the selected photos in the client portal. A client
 * sees one only through `files_select_client`: `client_visible` AND
 * `is_client_of_project` AND `client_has_full_access()` — so a documents-only
 * client still sees nothing, and a marked-up photo shows the MARKED-UP version.
 * The screens say both before this runs.
 */
export async function setPhotosClientVisible(
  ids: readonly string[],
  visible: boolean
): Promise<BulkOutcome> {
  if (ids.length === 0) return { done: 0, total: 0 };
  const supabase = createClient();
  const { data, error } = await supabase
    .from('files')
    .update({ client_visible: visible } as never)
    .in('id', [...ids])
    .eq('is_deleted', false)
    .select('id');
  if (error) return { done: 0, total: ids.length };
  return { done: (data ?? []).length, total: ids.length };
}
