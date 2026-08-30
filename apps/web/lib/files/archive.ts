import 'server-only';
import { zipSync, strToU8 } from 'fflate';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { brand } from '@/lib/brand';

/**
 * The project archive builder [storage-archive-ai-spec §4, §S9] — advanced
 * chunk by chunk by the export worker (Q4: archives ride `export_jobs` with
 * kind='project_archive'), the same 300s-window cursor discipline as
 * `runExportChunk`, which this deliberately mirrors.
 *
 * Folders are the file's own category, kebab-cased; ⚠️ TRASHED FILES ARE
 * INCLUDED, in `trash/` — obvious what it is (ruled). MANIFEST.txt follows
 * the export's honesty rule: anything unreadable is NAMED, never silently
 * absent — "check the ZIP first" only protects the customer if the ZIP says
 * what is not in it.
 */

const SOFT_DEADLINE_MS = 240_000;
const MAX_PART_BYTES = 64 * 1024 * 1024;

export interface ArchiveJobRow {
  id: string;
  company_id: string;
  project_id: string | null;
  cursor: unknown;
  bytes_written: number | null;
}

export interface ArchiveCursor {
  fileOffset: number;
  part: number;
  missing: number;
  /** Folder/name pairs already written, for the manifest's per-folder counts. */
  counts: Record<string, number>;
  phase: 'files' | 'done';
}

export function initialArchiveCursor(): ArchiveCursor {
  return { fileOffset: 0, part: 1, missing: 0, counts: {}, phase: 'files' };
}

function readArchiveCursor(raw: unknown): ArchiveCursor {
  return { ...initialArchiveCursor(), ...((raw ?? {}) as Partial<ArchiveCursor>) };
}

function folderFor(category: string, isDeleted: boolean): string {
  if (isDeleted) return 'trash';
  return (category || 'other').replace(/_/g, '-');
}

export async function runArchiveChunk(
  admin: SupabaseClient<Database>,
  job: ArchiveJobRow,
  now: Date,
  startedAtMs: number = Date.now()
): Promise<{ cursor: ArchiveCursor; done: boolean; bytes: number; notes: string[] }> {
  const cursor = readArchiveCursor(job.cursor);
  const notes: string[] = [];
  if (!job.project_id) {
    // A project_archive job without a project cannot do anything meaningful —
    // fail loudly rather than emit an empty zip that reads as "no files".
    throw new Error('project_archive job has no project_id');
  }

  const entries: Record<string, Uint8Array> = {};
  let partBytes = 0;
  const outOfTime = () => Date.now() - startedAtMs > SOFT_DEADLINE_MS;
  const full = () => partBytes >= MAX_PART_BYTES;

  // Every file in the project — INCLUDING trash (ruled). Ordered for a
  // stable cursor (the five-times-bitten unordered-read rule).
  const { data: fileRows, error } = await admin
    .from('files')
    .select('id, file_path, file_name, category, is_deleted')
    .eq('project_id', job.project_id)
    .order('id', { ascending: true });
  if (error) throw new Error(`archive read files: ${error.message}`);
  const all = (fileRows ?? []) as Array<{
    id: string;
    file_path: string;
    file_name: string;
    category: string;
    is_deleted: boolean | null;
  }>;

  while (cursor.phase === 'files' && cursor.fileOffset < all.length) {
    if (outOfTime() || full()) break;
    const f = all[cursor.fileOffset];
    cursor.fileOffset += 1;

    const { data, error: dlErr } = await admin.storage
      .from('project-files')
      .download(f.file_path);
    if (dlErr || !data) {
      cursor.missing += 1;
      notes.push(`MISSING ${folderFor(f.category, !!f.is_deleted)}/${f.file_name}: ${dlErr?.message ?? 'no body'}`);
      continue;
    }
    const buf = new Uint8Array(await data.arrayBuffer());
    const folder = folderFor(f.category, !!f.is_deleted);
    let name = `${folder}/${f.file_name}`;
    if (entries[name] !== undefined) name = `${folder}/${f.id.slice(0, 8)}-${f.file_name}`;
    entries[name] = buf;
    partBytes += buf.length;
    cursor.counts[folder] = (cursor.counts[folder] ?? 0) + 1;
  }
  if (cursor.fileOffset >= all.length) cursor.phase = 'done';

  if (cursor.phase === 'done') {
    const { data: project } = await admin
      .from('projects')
      .select('name')
      .eq('id', job.project_id)
      .maybeSingle();
    entries['MANIFEST.txt'] = strToU8(
      [
        `${brand.name} project archive`,
        `Project: ${(project as { name: string } | null)?.name ?? job.project_id}`,
        `Generated: ${now.toISOString()}`,
        `Job: ${job.id}`,
        '',
        'THIS ARCHIVE MAY BE SPLIT ACROSS SEVERAL PART FILES (part-001.zip, ...).',
        'Each part is a valid zip on its own. Together they are the whole archive.',
        '',
        'Folders are your file categories. trash/ holds files that were in',
        'Trash when the archive was made — included on purpose, so nothing you',
        'might want is silently absent.',
        '',
        `Files included: ${Object.values(cursor.counts).reduce((a, b) => a + b, 0)}`,
        ...Object.entries(cursor.counts)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([folder, n]) => `  ${folder}/: ${n}`),
        `Files unreadable and NOT included: ${cursor.missing}`,
        '',
        notes.length ? 'NOTES (⚠️ check these before deleting anything):' : 'NOTES: none',
        ...notes,
      ].join('\n')
    );
  }

  let bytes = 0;
  if (Object.keys(entries).length > 0) {
    const zipped = zipSync(entries, { level: 6 });
    const path = `${job.company_id}/${job.id}/part-${String(cursor.part).padStart(3, '0')}.zip`;
    const { error: upErr } = await admin.storage
      .from('exports')
      .upload(path, zipped, { contentType: 'application/zip', upsert: true });
    if (upErr) throw new Error(`archive upload ${path}: ${upErr.message}`);
    bytes = zipped.length;
    cursor.part += 1;
  }

  return { cursor, done: cursor.phase === 'done', bytes, notes };
}
