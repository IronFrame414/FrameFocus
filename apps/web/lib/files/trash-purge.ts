import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';

/**
 * The 6-month trash purge [storage-archive-ai-spec §3, RULED]. A file in
 * trash for six months is permanently deleted — object first, then row, the
 * §S4 ordering. Daily cron (`/api/cron/file-trash-purge`); the loop lives
 * here with `now` injected, the house shape.
 *
 * ⚠️ THIS IS A RETENTION BEHAVIOUR THE PRIVACY POLICY STATES. Its cron entry
 * ships WITH this build — an unscheduled purge would repeat the
 * promise-without-mechanism failure this project has made twice.
 *
 * ⚠️ NOT the deletion sweep's machinery, on purpose: that job destroys whole
 * tenants and is gated behind the Q8 chain. This one deletes individual
 * files that every surface already shows as deleted.
 *
 * Semantics differ from `permanentDeleteFile()` in ONE deliberate way: there,
 * an empty `remove()` result means RLS REFUSED THE CALLER and must abort.
 * Here the caller is the service role, which RLS cannot refuse — an empty
 * result means the object is GENUINELY ABSENT (an orphaned row), and the row
 * is deleted anyway, counted separately. An orphan row that pinned its
 * trash entry forever would hold bytes in the CUSTOMER'S SUM (§1 counts
 * rows) for storage that does not exist — the one direction §1's trade-off
 * note does not tolerate.
 */

export const TRASH_RETENTION_MONTHS = 6;

export interface TrashPurgeOutcome {
  /** Trashed rows past the 6-month boundary this run. */
  due: number;
  /** Object and row both gone. */
  purged: number;
  /** Row deleted; object was already absent (orphan row). */
  objectMissing: number;
  errors: string[];
}

interface TrashRow {
  id: string;
  file_path: string;
  company_id: string;
}

export async function runTrashPurge(
  admin: SupabaseClient<Database>,
  now: Date
): Promise<TrashPurgeOutcome> {
  const outcome: TrashPurgeOutcome = { due: 0, purged: 0, objectMissing: 0, errors: [] };

  const boundary = new Date(now);
  boundary.setMonth(boundary.getMonth() - TRASH_RETENTION_MONTHS);

  const { data, error } = await admin
    .from('files')
    .select('id, file_path, company_id')
    .eq('is_deleted', true)
    .not('deleted_at', 'is', null)
    .lte('deleted_at', boundary.toISOString());
  if (error) throw new Error(`trash purge read: ${error.message}`);

  const rows = (data ?? []) as TrashRow[];
  outcome.due = rows.length;

  for (const row of rows) {
    const { data: removed, error: storageError } = await admin.storage
      .from('project-files')
      .remove([row.file_path]);
    if (storageError) {
      // A real storage failure holds THIS file for the next run — never the
      // row-first ordering, and never a silent skip.
      outcome.errors.push(`${row.id} storage: ${storageError.message}`);
      continue;
    }
    const objectWasThere = (removed ?? []).length > 0;

    const { error: rowError } = await admin.from('files').delete().eq('id', row.id);
    if (rowError) {
      outcome.errors.push(`${row.id} row: ${rowError.message}`);
      continue;
    }
    if (objectWasThere) outcome.purged += 1;
    else outcome.objectMissing += 1;
  }

  return outcome;
}
