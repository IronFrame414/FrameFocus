import { zipSync, strToU8 } from 'fflate';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { categoriesFor, filesAreIncluded } from './export-categories';
// The manifest is customer-facing product chrome, so the product name comes
// from the one brand source — never a literal. Caught by brand-literals.test.ts,
// which is exactly what that test is for.
import { brand } from '@/lib/brand';

/**
 * S138 — the trial data export (spec §4).
 *
 * ============================================================================
 * ⚠️ WHY THIS IS PARTS AND NOT ONE ZIP, WHICH IS THE WHOLE DESIGN
 * ============================================================================
 * Vercel's `maxDuration` is 300 SECONDS per invocation and is not negotiable.
 * The S138 measurement puts a large export (~8.5k files, 18 GB) at ~4.8 hours,
 * so a full export is ~58 invocations no matter what else is true.
 *
 * A zip cannot be appended to across invocations without downloading and
 * re-uploading the whole archive each time, which is O(n²) traffic and would
 * make a large export slower the longer it ran. So each invocation writes its
 * own SELF-CONTAINED part — `part-001.zip`, `part-002.zip` — and `cursor`
 * records where to resume. The customer downloads N files, each independently
 * valid, with a manifest that says what is in each.
 *
 * That is a real trade and it is visible to the customer, so it is stated in
 * the manifest rather than hidden.
 * ============================================================================
 */

/** Leave headroom under maxDuration=300 for the flush and the DB writes. */
const SOFT_DEADLINE_MS = 240_000;

/** Cap a part so a single invocation cannot exhaust function memory. */
const MAX_PART_BYTES = 40 * 1024 * 1024;

/** Rows per page when reading a table. */
const PAGE = 1000;

export const EXPORT_TTL_HOURS = 24;

export interface ExportCursor {
  phase: 'data' | 'files' | 'done';
  tableIndex: number;
  fileOffset: number;
  part: number;
  missing: number;
}

export interface ExportJobRow {
  id: string;
  company_id: string;
  categories: string[];
  format: 'zip' | 'zip_csv';
  state: string;
  cursor: Partial<ExportCursor> | null;
  bytes_written: number;
}

export function initialCursor(): ExportCursor {
  return { phase: 'data', tableIndex: 0, fileOffset: 0, part: 1, missing: 0 };
}

function readCursor(raw: Partial<ExportCursor> | null): ExportCursor {
  return { ...initialCursor(), ...(raw ?? {}) };
}

/**
 * CSV with RFC-4180 quoting.
 *
 * ⚠️ The naive `join(',')` breaks on the first job-site note containing a
 * comma or a newline, and a construction daily log is mostly notes containing
 * commas and newlines. A value is quoted whenever it could be ambiguous, and
 * embedded quotes are doubled.
 */
export function toCsv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return '';
  const columns = Object.keys(rows[0]);
  const cell = (v: unknown): string => {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.join(',')];
  for (const r of rows) lines.push(columns.map((c) => cell(r[c])).join(','));
  return lines.join('\n');
}

/** Every table the selected categories dump, flattened and de-duplicated. */
export function tablesFor(categories: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of categoriesFor(categories)) {
    for (const t of c.tables) {
      if (seen.has(t)) continue;
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

async function readTable(
  admin: SupabaseClient<Database>,
  table: string,
  companyId: string
): Promise<Array<Record<string, unknown>>> {
  // ⚠️ UNTYPED CLIENT FOR THE DYNAMIC LOOP, deliberately — the same reasoning
  // and the same shape as `deleteRows()` in deletion.ts. A table name that
  // varies at runtime makes the generated `Database` generic resolve every
  // table's row type at once (TS2589), and a cast that named one table would
  // be a lie about which tables this reads.
  const db = admin as unknown as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (
          col: string,
          val: string
        ) => {
          range: (
            a: number,
            b: number
          ) => Promise<{
            data: Array<Record<string, unknown>> | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };

  const rows: Array<Record<string, unknown>> = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from(table)
      .select('*')
      .eq('company_id', companyId)
      .range(from, from + PAGE - 1);
    if (error) {
      // A table that does not exist, or has no company_id, must not abort the
      // whole export — it is recorded and skipped. The manifest names it.
      throw new Error(`${table}: ${error.message}`);
    }
    const page = (data ?? []) as Array<Record<string, unknown>>;
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return rows;
}

/**
 * Advance one export job by one invocation's worth of work.
 *
 * Returns the cursor to persist and whether the job is finished. Never throws
 * for per-table problems — those become entries in the manifest, because an
 * export that fails entirely because one table was renamed is worse than an
 * export that says which table it could not read.
 */
export async function runExportChunk(
  admin: SupabaseClient<Database>,
  job: ExportJobRow,
  now: Date,
  startedAtMs: number = Date.now()
): Promise<{ cursor: ExportCursor; done: boolean; bytes: number; notes: string[] }> {
  const cursor = readCursor(job.cursor);
  const notes: string[] = [];
  const asCsv = job.format === 'zip_csv';
  const tables = tablesFor(job.categories);
  const includeFiles = filesAreIncluded(job.categories);

  const entries: Record<string, Uint8Array> = {};
  let partBytes = 0;
  const outOfTime = () => Date.now() - startedAtMs > SOFT_DEADLINE_MS;
  const full = () => partBytes >= MAX_PART_BYTES;

  // ---- phase 1: the data ----------------------------------------------------
  while (cursor.phase === 'data' && cursor.tableIndex < tables.length) {
    if (outOfTime() || full()) break;
    const table = tables[cursor.tableIndex];
    try {
      const rows = await readTable(admin, table, job.company_id);
      const body = asCsv ? toCsv(rows) : JSON.stringify(rows, null, 2);
      const name = `data/${table}.${asCsv ? 'csv' : 'json'}`;
      const bytes = strToU8(body);
      entries[name] = bytes;
      partBytes += bytes.length;
    } catch (err) {
      notes.push(`SKIPPED ${table}: ${err instanceof Error ? err.message : 'unreadable'}`);
    }
    cursor.tableIndex += 1;
  }
  if (cursor.phase === 'data' && cursor.tableIndex >= tables.length) {
    cursor.phase = includeFiles ? 'files' : 'done';
  }

  // ---- phase 2: the bytes ---------------------------------------------------
  if (cursor.phase === 'files') {
    // ⚠️ THE COLUMN IS `file_path`, NOT `storage_path`. Caught by the
    // type-checker, not by reading the schema — the first draft of this
    // guessed the name and would have exported an archive containing every
    // row and not one byte.
    const { data: fileRows } = await admin
      .from('files')
      .select('id, file_path, file_name')
      .eq('company_id', job.company_id)
      .order('id', { ascending: true });
    const all = (fileRows ?? []) as Array<{
      id: string;
      file_path: string | null;
      file_name: string | null;
    }>;

    while (cursor.fileOffset < all.length) {
      if (outOfTime() || full()) break;
      const f = all[cursor.fileOffset];
      cursor.fileOffset += 1;
      if (!f.file_path) {
        cursor.missing += 1;
        continue;
      }
      const { data, error } = await admin.storage.from('project-files').download(f.file_path);
      if (error || !data) {
        cursor.missing += 1;
        notes.push(`MISSING ${f.file_path}: ${error?.message ?? 'no body'}`);
        continue;
      }
      const buf = new Uint8Array(await data.arrayBuffer());
      entries[`files/${f.file_path}`] = buf;
      partBytes += buf.length;
    }

    if (cursor.fileOffset >= all.length) cursor.phase = 'done';
  }

  // ---- the manifest, on the final part -------------------------------------
  if (cursor.phase === 'done') {
    entries['MANIFEST.txt'] = strToU8(
      buildManifest(job, tables, includeFiles, cursor, now, notes)
    );
    if (!includeFiles) {
      entries['MISSING-FILES.txt'] = strToU8(
        [
          'FILES WERE NOT INCLUDED IN THIS EXPORT.',
          '',
          'You did not select the "Files & photos" category, so rows that',
          'reference a file keep the file name and id but the bytes are not',
          'here. Nothing was rewritten or removed from the data — a reference',
          'that points at a file you did not export still tells you the file',
          'existed.',
          '',
          'Re-run the export with "Files & photos" selected to get the bytes.',
        ].join('\n')
      );
    }
  }

  // ---- flush this part ------------------------------------------------------
  let bytes = 0;
  if (Object.keys(entries).length > 0) {
    const zipped = zipSync(entries, { level: 6 });
    const partName = `part-${String(cursor.part).padStart(3, '0')}.zip`;
    const path = `${job.company_id}/${job.id}/${partName}`;
    const { error } = await admin.storage
      .from('exports')
      .upload(path, zipped, { contentType: 'application/zip', upsert: true });
    if (error) throw new Error(`export upload ${path}: ${error.message}`);
    bytes = zipped.length;
    cursor.part += 1;
  }

  return { cursor, done: cursor.phase === 'done', bytes, notes };
}

function buildManifest(
  job: ExportJobRow,
  tables: string[],
  includeFiles: boolean,
  cursor: ExportCursor,
  now: Date,
  notes: string[]
): string {
  return [
    `${brand.name} data export`,
    `Generated: ${now.toISOString()}`,
    `Job: ${job.id}`,
    `Format: ${job.format === 'zip_csv' ? 'CSV bundle inside zip' : 'JSON inside zip'}`,
    '',
    'THIS EXPORT MAY BE SPLIT ACROSS SEVERAL PART FILES (part-001.zip, ...).',
    'Each part is a valid zip on its own. Together they are the whole export.',
    '',
    `Categories: ${job.categories.join(', ')}`,
    `Tables: ${tables.join(', ')}`,
    `Files included: ${includeFiles ? 'yes' : 'NO — see MISSING-FILES.txt'}`,
    `Files skipped or unreadable: ${cursor.missing}`,
    '',
    notes.length ? 'NOTES:' : 'NOTES: none',
    ...notes,
  ].join('\n');
}
