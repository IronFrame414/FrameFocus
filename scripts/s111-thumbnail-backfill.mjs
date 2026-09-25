#!/usr/bin/env node
// S111 D, option A — BACKFILL the stored grid thumbnails for existing photos.
//
// ⛔ A PRODUCTION WRITE. Josh runs it; nothing in a session runs it against
// production. It writes ONLY new `.thumb.webp` objects to the `project-files`
// bucket. It never modifies, moves or deletes an original, a `.markup.jpg`
// derivative, or any database row.
//
// USAGE
//   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     node scripts/s111-thumbnail-backfill.mjs --project-ref <ref>            # DRY RUN: counts only
//   ... --project-ref <ref> --apply [--concurrency 2] [--limit N]             # writes
//
//   --project-ref   REQUIRED, and must match the URL's ref — a guard against
//                   pointing the right command at the wrong database.
//   --apply         without it, nothing is written.
//   --concurrency   photos in flight, default 2, capped at 4. Low on purpose:
//                   Storage ran out of DB connections at 3 pages × 16 signs
//                   in flight on rebuild-test (S111 report, step T4).
//   --limit         stop after N generations (a canary run).
//
// IF INTERRUPTED PARTWAY (Ctrl-C, crash, lost connection): safe, and re-running
// resumes. Each photo is independent; a thumbnail is ONE upload, and a Storage
// object only exists once its upload completes, so there is no half-written
// thumbnail. Photos done before the interruption are detected on the next run
// (one batch sign per page of rows) and skipped. A photo whose generation
// failed is simply attempted again. The grid is correct throughout: a photo
// without a thumbnail shows its full file.
//
// ⚠️ markupFingerprint() and thumbPathFor() below RE-IMPLEMENT
// packages/shared/utils/markup.ts (a .mjs cannot import that TypeScript).
// test/s111-thumbnail-path.test.ts asserts the two produce identical paths.

import { createClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'node:url';

const BUCKET = 'project-files';
const PAGE = 500;
const TRANSFORM = { width: 400, height: 400, resize: 'cover' };

export function hasMarkup(markup) {
  if (!markup || typeof markup !== 'object') return false;
  return Array.isArray(markup.shapes) && markup.shapes.length > 0;
}

export function markupFingerprint(markup) {
  const s = JSON.stringify(markup);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export function thumbPathFor(originalPath, markup) {
  return hasMarkup(markup)
    ? `${originalPath}.m${markupFingerprint(markup)}.thumb.webp`
    : `${originalPath}.thumb.webp`;
}

function args(argv) {
  const out = { apply: false, concurrency: 2, limit: Infinity, ref: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') out.apply = true;
    else if (a === '--project-ref') out.ref = argv[++i];
    else if (a === '--concurrency') out.concurrency = Math.min(4, Math.max(1, Number(argv[++i]) || 2));
    else if (a === '--limit') out.limit = Math.max(1, Number(argv[++i]) || 1);
    else throw new Error(`unknown argument: ${a}`);
  }
  return out;
}

async function generate(db, row) {
  const started = Date.now();
  const source = hasMarkup(row.markup_data) ? `${row.file_path}.markup.jpg` : row.file_path;
  const target = thumbPathFor(row.file_path, row.markup_data);
  const signed = await db.storage.from(BUCKET).createSignedUrl(source, 60, { transform: TRANSFORM });
  if (signed.error || !signed.data?.signedUrl) throw new Error(`sign: ${signed.error?.message ?? 'no url'}`);
  const res = await fetch(signed.data.signedUrl, { headers: { Accept: 'image/webp' } });
  const type = res.headers.get('content-type') ?? '';
  if (!res.ok || !type.startsWith('image/webp')) {
    throw new Error(`render ${res.status} ${type}: ${(await res.text().catch(() => '')).slice(0, 120)}`);
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  const up = await db.storage.from(BUCKET).upload(target, bytes, { contentType: 'image/webp', upsert: true });
  if (up.error) throw new Error(`upload: ${up.error.message}`);
  return { bytes: bytes.length, ms: Date.now() - started };
}

async function main() {
  const opt = args(process.argv.slice(2));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.');
  if (!opt.ref) throw new Error('--project-ref is required.');
  const urlRef = new URL(url).hostname.split('.')[0];
  if (urlRef !== opt.ref) throw new Error(`REFUSING: --project-ref ${opt.ref} but the URL is ${urlRef}.`);
  console.log(`[backfill] target ${urlRef} — ${opt.apply ? 'APPLY (writes thumbnails)' : 'DRY RUN (writes nothing)'}`);

  const db = createClient(url, key, { auth: { persistSession: false } });
  const t = { rows: 0, sourceBytes: 0, existing: 0, missing: 0, generated: 0, failed: 0, thumbBytes: 0, ms: [] };
  const failures = [];

  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from('files')
      .select('id, file_path, mime_type, markup_data, file_size')
      .like('mime_type', 'image/%')
      .eq('is_deleted', false)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`read files: ${error.message}`);
    const rows = data ?? [];
    if (rows.length === 0) break;
    t.rows += rows.length;
    for (const r of rows) t.sourceBytes += Number(r.file_size) || 0;

    // ONE batch call tells which thumbnails already exist (a path that signs).
    const targets = rows.map((r) => thumbPathFor(r.file_path, r.markup_data));
    const signed = await db.storage.from(BUCKET).createSignedUrls(targets, 60);
    if (signed.error) throw new Error(`existence check: ${signed.error.message}`);
    const exists = new Set((signed.data ?? []).filter((d) => d.signedUrl && !d.error).map((d) => d.path));
    const todo = rows.filter((r, i) => !exists.has(targets[i]));
    t.existing += rows.length - todo.length;
    t.missing += todo.length;

    if (opt.apply) {
      const queue = [...todo];
      await Promise.all(
        Array.from({ length: Math.min(opt.concurrency, queue.length) }, async () => {
          for (let r = queue.shift(); r && t.generated < opt.limit; r = queue.shift()) {
            try {
              const g = await generate(db, r);
              t.generated++;
              t.thumbBytes += g.bytes;
              t.ms.push(g.ms);
            } catch (e) {
              t.failed++;
              failures.push({ id: r.id, path: r.file_path, error: String(e instanceof Error ? e.message : e) });
            }
          }
        })
      );
      console.log(`[backfill] rows ${t.rows}: generated ${t.generated}, failed ${t.failed}, already had ${t.existing}`);
      if (t.generated >= opt.limit) break;
    }
    if (rows.length < PAGE) break;
  }

  const mb = (n) => (n / 1048576).toFixed(1);
  const sorted = [...t.ms].sort((a, b) => a - b);
  console.log(
    JSON.stringify(
      {
        image_rows: t.rows,
        source_mb: mb(t.sourceBytes),
        thumbnails_already_present: t.existing,
        thumbnails_missing: t.missing,
        ...(opt.apply
          ? {
              generated: t.generated,
              failed: t.failed,
              thumbnail_mb_written: mb(t.thumbBytes),
              mean_kb: t.generated ? (t.thumbBytes / t.generated / 1024).toFixed(1) : null,
              ms_per_photo: sorted.length
                ? { median: sorted[Math.floor(sorted.length / 2)], p95: sorted[Math.floor(sorted.length * 0.95)], max: sorted.at(-1) }
                : null,
            }
          : { estimated_thumbnail_mb_at_29_7_kb: mb(t.missing * 29.7 * 1024) }),
      },
      null,
      2
    )
  );
  if (failures.length) {
    console.log(`[backfill] ${failures.length} failure(s) — safe to re-run; these are retried:`);
    for (const f of failures.slice(0, 50)) console.log(JSON.stringify(f));
  }
  process.exitCode = t.failed ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((e) => {
    console.error(`[backfill] FAILED: ${e instanceof Error ? e.message : e}`);
    process.exitCode = 1;
  });
}
