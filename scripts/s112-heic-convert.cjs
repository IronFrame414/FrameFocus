#!/usr/bin/env node
// S112 RULING R7 [Josh] — ONE-TIME conversion of legacy HEIC/HEIF photos to a
// stored JPEG, KEEPING THE ORIGINAL.
//
// ⛔ A PRODUCTION WRITE. Josh runs it; nothing in a session runs it against
// production. PREPARED doc: docs/sessions/S112-heic-conversion-PREPARED.md.
//
// WHY. A legacy HEIC is served as application/octet-stream and displays blank
// everywhere but Safari. New uploads already convert client-side
// (lib/services/files-client.ts prepareImageForUpload / heic2any).
//
// ⚠️ THE TRAP. `files.file_path` NAMES OTHER OBJECTS, by string suffix, with no
// row of their own:
//   thumbnail   {file_path}.thumb.webp  |  {file_path}.m{fp8}.thumb.webp
//               (packages/shared/utils/markup.ts thumbPathFor; the storage
//                policy 20261810000000 finds the parent row with
//                regexp_replace(name, '(\.m[0-9a-f]{8})?\.thumb\.webp$', '') = f.file_path)
//   derivative  {file_path}.markup.jpg
//               (derivativePathFor; policies 20261780/90/800 find the parent with
//                left(name, length(name) - 11) = f.file_path)
// Repointing file_path alone ORPHANS both — an annotated photo would then show
// as its unmarked JPEG (the #129 silent loss). So every side object is COPIED
// to the same suffix on the new path in the same pass, before the row moves.
//
// PER ROW (live rows only: is_deleted = false):
//   1. new path = `${file_path}.jpg` — unique by construction; the row is
//      SKIPPED if that name, or any side-object target name, already exists.
//   2. JPEG bytes from Storage image transformation of the ORIGINAL
//      (/render/image/, service-role signed, `{ quality: 85 }` — NO width or
//      height, so nothing is resized), fetched with Accept: image/jpeg. The row
//      FAILS unless the response is `image/jpeg` AND the bytes start FF D8 FF.
//   3. upload to the new path (image/jpeg, upsert: false).
//   4. storage `copy` (server-side) of every existing thumbnail and the
//      `.markup.jpg` derivative to the new names. The markup fingerprint is a
//      hash of markup_data only (not of the path), so suffixes carry over.
//   5. UPDATE files SET file_path, mime_type, file_name, file_size
//      WHERE id = … AND file_path = <old>   (optimistic guard; 1 row or fail).
//   6. undo record, appended + fsync'd: a `pending` line BEFORE any write and a
//      `done` line after the UPDATE. On any failure after step 3 the objects
//      this row created are removed and a `rolled_back` line is written.
// ORIGINALS ARE NEVER MODIFIED, MOVED OR DELETED. Undo is therefore lossless.
//
// USAGE (service role; NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY):
//   node scripts/s112-heic-convert.cjs --project-ref <ref>                       # DRY RUN
//   node scripts/s112-heic-convert.cjs --project-ref <ref> --apply --undo-file <f> [--limit N] [--concurrency 1|2]
//   node scripts/s112-heic-convert.cjs --project-ref <ref> --verify <f>
//   node scripts/s112-heic-convert.cjs --project-ref <ref> --undo <f> [--only-incomplete]      # undo DRY RUN
//   node scripts/s112-heic-convert.cjs --project-ref <ref> --undo <f> [--only-incomplete] --apply
//
// ⚠️ markupFingerprint() / thumbPathFor() / hasMarkup() / derivativePathFor()
// below RE-IMPLEMENT packages/shared/utils/markup.ts (a plain Node script cannot
// import TypeScript), exactly as scripts/s111-thumbnail-backfill.cjs does.
// apps/web/test/s111-thumbnail-path.test.ts asserts all copies agree.

'use strict';
const fs = require('fs');

const BUCKET = 'project-files';
const PAGE = 500;
const RENDER_TRANSFORM = Object.freeze({ quality: 85 });
const HEIC_MIMES = Object.freeze(['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence']);
const HEIC_NAME_RE = /\.(heic|heif)$/i;
const OWN_THUMB_SUFFIX = /^(\.m[0-9a-f]{8})?\.thumb\.webp$/;
const DERIVATIVE_SUFFIX = '.markup.jpg';

// ---------------------------------------------------------------------------
// Parity copies of packages/shared/utils/markup.ts
// ---------------------------------------------------------------------------
function hasMarkup(markup) {
  if (!markup || typeof markup !== 'object') return false;
  return Array.isArray(markup.shapes) && markup.shapes.length > 0;
}

function markupFingerprint(markup) {
  const s = JSON.stringify(markup);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function thumbPathFor(originalPath, markup) {
  return hasMarkup(markup)
    ? `${originalPath}.m${markupFingerprint(markup)}.thumb.webp`
    : `${originalPath}.thumb.webp`;
}

function derivativePathFor(originalPath) {
  return `${originalPath}${DERIVATIVE_SUFFIX}`;
}

// ---------------------------------------------------------------------------
// Pure planning
// ---------------------------------------------------------------------------

/** 'mime' when the row's mime says HEIC/HEIF; 'name_only' when only the file name does; null otherwise. */
function heicCategory(row) {
  const mime = String(row.mime_type || '').toLowerCase();
  if (HEIC_MIMES.includes(mime)) return 'mime';
  if (HEIC_NAME_RE.test(String(row.file_name || ''))) return 'name_only';
  return null;
}

/** Idempotency: a row repointed by a previous run no longer matches, but be explicit. */
function isAlreadyConverted(row) {
  return String(row.file_path).endsWith('.jpg') && row.mime_type === 'image/jpeg';
}

function newPathFor(oldPath) {
  if (typeof oldPath !== 'string' || oldPath.length === 0) throw new Error('newPathFor: empty path');
  return `${oldPath}.jpg`;
}

/** Same rule as files-client.ts convertHeicToJpeg(): strip .heic/.heif, append .jpg. */
function jpegNameFor(fileName) {
  return `${String(fileName).replace(HEIC_NAME_RE, '')}.jpg`;
}

function splitPath(path) {
  const slash = path.lastIndexOf('/');
  return { folder: path.slice(0, slash), base: path.slice(slash + 1) };
}

/**
 * The side objects of `oldPath` that exist (from a folder listing of full
 * paths), each mapped to the same suffix on `newPath`.
 * Thumbnails: anchored `^{base}(\.m[0-9a-f]{8})?\.thumb\.webp$` — a sibling that
 * merely starts with the same characters, or the new path's own thumbs
 * (`{base}.jpg.thumb.webp`), never match. Derivative: `{oldPath}.markup.jpg`.
 */
function sideObjectPlan(oldPath, newPath, existingPaths) {
  const { folder, base } = splitPath(oldPath);
  const plan = [];
  for (const p of existingPaths) {
    const s = splitPath(p);
    if (s.folder !== folder || !s.base.startsWith(base)) continue;
    const suffix = s.base.slice(base.length);
    if (OWN_THUMB_SUFFIX.test(suffix)) plan.push({ kind: 'thumbnail', from: p, to: `${newPath}${suffix}` });
  }
  const deriv = derivativePathFor(oldPath);
  if (existingPaths.includes(deriv)) plan.push({ kind: 'derivative', from: deriv, to: derivativePathFor(newPath) });
  plan.sort((a, b) => (a.to < b.to ? -1 : a.to > b.to ? 1 : 0));
  return plan;
}

/** Target names that already exist — any one makes the row a skip (never overwrite). */
function targetConflicts(newPath, plan, existingPaths) {
  const set = new Set(existingPaths);
  return [newPath, ...plan.map((p) => p.to)].filter((t) => set.has(t));
}

function isJpegMagic(bytes) {
  return !!bytes && bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

/** Width/height from the first SOF marker, or null. Reported, so a shrink would be visible. */
function jpegDimensions(bytes) {
  if (!isJpegMagic(bytes)) return null;
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1];
    if (marker === 0xff) { i++; continue; }
    const len = (bytes[i + 2] << 8) | bytes[i + 3];
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) return { height: (bytes[i + 5] << 8) | bytes[i + 6], width: (bytes[i + 7] << 8) | bytes[i + 8] };
    if (marker === 0xda || marker === 0xd9) return null;
    i += 2 + len;
  }
  return null;
}

/** Everything the per-row write will do, computed without I/O. */
function planRow(row, existingPaths) {
  const newPath = newPathFor(row.file_path);
  const plan = sideObjectPlan(row.file_path, newPath, existingPaths);
  const conflicts = targetConflicts(newPath, plan, existingPaths);
  return {
    id: row.id,
    category: heicCategory(row),
    old_path: row.file_path,
    new_path: newPath,
    new_name: jpegNameFor(row.file_name),
    side_objects: plan,
    conflicts,
    original_present: existingPaths.includes(row.file_path),
    has_markup: hasMarkup(row.markup_data),
  };
}

// ---------------------------------------------------------------------------
// Undo records (JSON Lines)
// ---------------------------------------------------------------------------
function undoRecord(event, row, plan, extra = {}) {
  return {
    event, // 'pending' | 'done' | 'rolled_back' | 'undone' | 'undo_refused'
    at: new Date().toISOString(),
    id: row.id,
    old_path: row.file_path,
    old_mime: row.mime_type,
    old_name: row.file_name,
    old_size: row.file_size,
    new_path: plan.new_path,
    new_name: plan.new_name,
    markup_fp: hasMarkup(row.markup_data) ? markupFingerprint(row.markup_data) : null,
    copied_objects: plan.side_objects.map((s) => s.to),
    ...extra,
  };
}

const UNDO_KEYS = ['event', 'id', 'old_path', 'old_mime', 'old_name', 'old_size', 'new_path', 'copied_objects'];

function validateUndoRecord(r) {
  for (const k of UNDO_KEYS) if (!(k in r)) throw new Error(`undo record missing ${k}`);
  if (!Array.isArray(r.copied_objects)) throw new Error('undo record copied_objects must be an array');
  if (r.new_path !== newPathFor(r.old_path)) throw new Error(`undo record new_path does not derive from old_path: ${r.id}`);
  return r;
}

/** Last conversion event per row id, from JSONL text. */
function latestByRow(text) {
  const out = new Map();
  for (const line of String(text).split('\n')) {
    if (!line.trim()) continue;
    const r = validateUndoRecord(JSON.parse(line));
    const prev = out.get(r.id);
    // A `pending` line carries the plan; later lines for the row supersede it.
    out.set(r.id, prev && prev.event === 'pending' && r.event !== 'pending' ? { ...prev, ...r } : r);
  }
  return out;
}

function appendLine(fd, obj) {
  fs.writeSync(fd, `${JSON.stringify(obj)}\n`);
  fs.fsyncSync(fd);
}

// ---------------------------------------------------------------------------
// THE WRITE GATE. Every write goes through here, and it refuses unless the
// run was started with --apply. Dry run is not "we did not call it"; it is
// "calling it throws".
// ---------------------------------------------------------------------------
function makeWriter(db, apply) {
  const refuse = (what) => {
    throw new Error(`REFUSING ${what}: not an --apply run (dry run writes nothing).`);
  };
  const bucket = () => db.storage.from(BUCKET);
  return Object.freeze({
    apply: !!apply,
    async upload(path, bytes, contentType) {
      if (!apply) refuse(`upload ${path}`);
      return bucket().upload(path, bytes, { contentType, upsert: false });
    },
    async copy(from, to) {
      if (!apply) refuse(`copy ${from} -> ${to}`);
      return bucket().copy(from, to);
    },
    async remove(paths) {
      if (!apply) refuse(`remove ${paths.join(', ')}`);
      return bucket().remove(paths);
    },
    async updateFile(id, guardPath, values) {
      if (!apply) refuse(`update files ${id}`);
      return db.from('files').update(values).eq('id', id).eq('file_path', guardPath).select('id');
    },
    openUndo(path) {
      if (!apply) refuse(`open undo file ${path}`);
      return fs.openSync(path, 'a');
    },
  });
}

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const out = { apply: false, concurrency: 1, limit: Infinity, ref: null, undoFile: null, undo: null, verify: null, onlyIncomplete: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => {
      const v = argv[++i];
      if (v === undefined || v.startsWith('--')) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === '--apply') out.apply = true;
    else if (a === '--project-ref') out.ref = val();
    else if (a === '--concurrency') out.concurrency = Math.min(2, Math.max(1, Number(val()) || 1));
    else if (a === '--limit') out.limit = Math.max(1, Number(val()) || 1);
    else if (a === '--undo-file') out.undoFile = val();
    else if (a === '--undo') out.undo = val();
    else if (a === '--verify') out.verify = val();
    else if (a === '--only-incomplete') out.onlyIncomplete = true;
    else throw new Error(`unknown argument: ${a}`);
  }
  if (!out.ref) throw new Error('--project-ref is required.');
  if ([out.undo, out.verify].filter(Boolean).length > 1) throw new Error('--undo and --verify are separate runs.');
  if (out.verify && out.apply) throw new Error('--verify is read-only; it takes no --apply.');
  if (out.onlyIncomplete && !out.undo) throw new Error('--only-incomplete belongs to --undo.');
  if (out.apply && !out.undo && !out.undoFile) throw new Error('--apply requires --undo-file <path> (the record undo reads).');
  if (out.undoFile && out.undo) throw new Error('--undo reads its own file; do not also pass --undo-file.');
  return out;
}

// ---------------------------------------------------------------------------
// Retry (the S111 pattern). Only transient Storage/gateway failures.
// ---------------------------------------------------------------------------
function isSlowDown(message) {
  return /429|SlowDown|too_many_connections|Too many connections|Bad Gateway|Service Unavailable|Gateway Timeout|\b50[234]\b|fetch failed|ECONNRESET|socket hang up/i.test(String(message));
}

async function withRetry(fn, attempts = 5) {
  for (let n = 0; ; n++) {
    try {
      return await fn(n);
    } catch (e) {
      if (n + 1 >= attempts || !isSlowDown(e instanceof Error ? e.message : e)) throw e;
      await new Promise((r) => setTimeout(r, 500 * 2 ** n));
    }
  }
}

const isDuplicate = (msg) => /already exists|Duplicate|409/i.test(String(msg));

// ---------------------------------------------------------------------------
// I/O helpers (read-only)
// ---------------------------------------------------------------------------
async function listFolderMatching(db, oldPath) {
  const { folder, base } = splitPath(oldPath);
  const out = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await withRetry(async () => {
      const r = await db.storage.from(BUCKET).list(folder, { search: base, limit: 100, offset });
      if (r.error && isSlowDown(r.error.message)) throw new Error(r.error.message);
      return r;
    });
    if (error) throw new Error(`list ${folder}: ${error.message}`);
    const page = data ?? [];
    for (const o of page) if (o.name.startsWith(base)) out.push(`${folder}/${o.name}`);
    if (page.length < 100) break;
  }
  return out;
}

async function renderJpeg(db, path) {
  return withRetry(async () => {
    const signed = await db.storage.from(BUCKET).createSignedUrl(path, 60, { transform: { ...RENDER_TRANSFORM } });
    if (signed.error || !signed.data?.signedUrl) throw new Error(`sign: ${signed.error?.message ?? 'no url'}`);
    const res = await fetch(signed.data.signedUrl, { headers: { Accept: 'image/jpeg' } });
    const type = res.headers.get('content-type') ?? '';
    if (!res.ok) throw new Error(`render ${res.status} ${type}: ${(await res.text().catch(() => '')).slice(0, 160)}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (!type.startsWith('image/jpeg')) throw new Error(`render returned ${type || 'no content-type'}, not image/jpeg`);
    if (!isJpegMagic(bytes)) throw new Error('render bytes do not start FF D8 FF');
    return bytes;
  });
}

async function readSiteVisitFreeze(db, rows) {
  const ids = [...new Set(rows.filter((r) => r.site_visit_capture && r.estimate_id).map((r) => r.estimate_id))];
  const frozen = new Map();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await db.from('site_visits').select('estimate_id, frozen_at').in('estimate_id', ids.slice(i, i + 200));
    if (error) throw new Error(`read site_visits: ${error.message}`);
    for (const s of data ?? []) if (s.frozen_at) frozen.set(s.estimate_id, s.frozen_at);
  }
  return frozen;
}

/** Mirrors enforce_site_visit_file_freeze(): it blocks this UPDATE even for the service role. */
function isFrozenSiteVisitFile(row, frozenByEstimate) {
  if (!row.site_visit_capture || !row.estimate_id) return false;
  const f = frozenByEstimate.get(row.estimate_id);
  return !!f && new Date(row.created_at) <= new Date(f);
}

async function readSharedPaths(db, paths) {
  const count = new Map();
  for (let i = 0; i < paths.length; i += 100) {
    const { data, error } = await db.from('files').select('id, file_path').in('file_path', paths.slice(i, i + 100));
    if (error) throw new Error(`read shared paths: ${error.message}`);
    for (const r of data ?? []) count.set(r.file_path, (count.get(r.file_path) ?? 0) + 1);
  }
  return new Set([...count].filter(([, n]) => n > 1).map(([p]) => p));
}

async function readCandidates(db, { deleted }) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from('files')
      .select('id, file_path, file_name, mime_type, file_size, markup_data, site_visit_capture, estimate_id, created_at')
      .eq('is_deleted', deleted)
      .or(`mime_type.in.(${HEIC_MIMES.join(',')}),file_name.ilike.*.heic,file_name.ilike.*.heif`)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`read files: ${error.message}`);
    const page = data ?? [];
    rows.push(...page.filter((r) => heicCategory(r)));
    if (page.length < PAGE) break;
  }
  return rows;
}

// ---------------------------------------------------------------------------
// CONVERT (dry run / apply)
// ---------------------------------------------------------------------------
async function convertRow(db, writer, fd, row, plan) {
  appendLine(fd, undoRecord('pending', row, plan));
  const created = [];
  try {
    const bytes = await renderJpeg(db, row.file_path);
    await withRetry(async (n) => {
      const up = await writer.upload(plan.new_path, bytes, 'image/jpeg');
      // Duplicate on a RETRY is our own earlier attempt landing: the name was
      // checked free and recorded `pending` before any write.
      if (up.error && !(n > 0 && isDuplicate(up.error.message))) throw new Error(`upload ${plan.new_path}: ${up.error.message}`);
    });
    created.push(plan.new_path);
    for (const s of plan.side_objects) {
      await withRetry(async (n) => {
        const c = await writer.copy(s.from, s.to);
        if (c.error && !(n > 0 && isDuplicate(c.error.message))) throw new Error(`copy ${s.from}: ${c.error.message}`);
      });
      created.push(s.to);
    }
    const upd = await writer.updateFile(row.id, row.file_path, {
      file_path: plan.new_path,
      mime_type: 'image/jpeg',
      file_name: plan.new_name,
      file_size: bytes.length,
    });
    if (upd.error) throw new Error(`update: ${upd.error.message}`);
    if ((upd.data ?? []).length !== 1) throw new Error(`update matched ${(upd.data ?? []).length} rows (file_path changed underneath?)`);
    const dims = jpegDimensions(bytes);
    appendLine(fd, undoRecord('done', row, plan, { new_size: bytes.length, width: dims?.width ?? null, height: dims?.height ?? null }));
    return { bytes: bytes.length, dims };
  } catch (e) {
    const message = String(e instanceof Error ? e.message : e);
    // If the UPDATE landed despite the error (a lost response), the row now
    // points at the new objects — removing them would blank the photo. Re-read
    // and record it as done instead.
    const { data: now } = await db.from('files').select('file_path').eq('id', row.id).maybeSingle();
    if (now?.file_path === plan.new_path) {
      appendLine(fd, undoRecord('done', row, plan, { note: `update reported "${message}" but the row is repointed` }));
      return { bytes: 0, dims: null };
    }
    let cleanup = 'nothing created';
    if (created.length) {
      const rm = await writer.remove(created).catch((x) => ({ error: { message: String(x) } }));
      cleanup = rm.error ? `CLEANUP FAILED (${rm.error.message}) — run --undo on this file` : `removed ${created.length}`;
    }
    appendLine(fd, undoRecord('rolled_back', row, plan, { error: message, cleanup }));
    throw new Error(`${message} [${cleanup}]`);
  }
}

async function runConvert(db, opt) {
  const writer = makeWriter(db, opt.apply);
  const rows = await readCandidates(db, { deleted: false });
  const trashed = await readCandidates(db, { deleted: true });
  const frozen = await readSiteVisitFreeze(db, rows);
  const shared = await readSharedPaths(db, rows.map((r) => r.file_path));

  const summary = { live_candidates: rows.length, trashed_candidates_untouched: trashed.length, by_category_mime: {}, total_bytes: 0, with_markup: 0 };
  const skips = [];
  const todo = [];
  for (const r of rows) {
    const key = `${heicCategory(r)} | ${r.mime_type}`;
    summary.by_category_mime[key] = (summary.by_category_mime[key] ?? 0) + 1;
    summary.total_bytes += Number(r.file_size) || 0;
    if (hasMarkup(r.markup_data)) summary.with_markup++;
    if (isAlreadyConverted(r)) { skips.push({ id: r.id, reason: 'already_converted' }); continue; }
    if (shared.has(r.file_path)) { skips.push({ id: r.id, path: r.file_path, reason: 'file_path_shared_by_another_files_row' }); continue; }
    if (isFrozenSiteVisitFile(r, frozen)) { skips.push({ id: r.id, path: r.file_path, reason: 'site_visit_frozen (files_z_site_visit_freeze blocks the UPDATE even for the service role)' }); continue; }
    const plan = planRow(r, await listFolderMatching(db, r.file_path));
    if (!plan.original_present) { skips.push({ id: r.id, path: r.file_path, reason: 'original_object_missing' }); continue; }
    if (plan.conflicts.length) { skips.push({ id: r.id, path: r.file_path, reason: 'target_exists', targets: plan.conflicts }); continue; }
    todo.push({ row: r, plan });
    console.log(JSON.stringify({ plan: plan.id, category: plan.category, old: plan.old_path, new: plan.new_path, name: plan.new_name, copies: plan.side_objects }));
  }

  const t = { converted: 0, failed: 0, jpeg_bytes: 0, dims: [] };
  const failures = [];
  if (opt.apply) {
    const fd = writer.openUndo(opt.undoFile);
    const queue = todo.slice(0, Number.isFinite(opt.limit) ? opt.limit : undefined);
    await Promise.all(
      Array.from({ length: Math.min(opt.concurrency, queue.length) }, async () => {
        for (let j = queue.shift(); j; j = queue.shift()) {
          try {
            const r = await convertRow(db, writer, fd, j.row, j.plan);
            t.converted++;
            t.jpeg_bytes += r.bytes;
            if (r.dims) t.dims.push(`${r.dims.width}x${r.dims.height}`);
          } catch (e) {
            t.failed++;
            failures.push({ id: j.row.id, path: j.row.file_path, error: String(e instanceof Error ? e.message : e) });
          }
          await new Promise((res) => setTimeout(res, 100));
        }
      })
    );
    fs.closeSync(fd);
  }

  const mb = (n) => (n / 1048576).toFixed(1);
  console.log(JSON.stringify({
    ...summary,
    total_mb: mb(summary.total_bytes),
    planned: todo.length,
    planned_side_objects: todo.reduce((n, j) => n + j.plan.side_objects.length, 0),
    skipped: skips.length,
    ...(opt.apply ? { converted: t.converted, failed: t.failed, jpeg_mb_written: mb(t.jpeg_bytes), dimensions: t.dims } : { mode: 'DRY RUN — zero writes' }),
  }, null, 2));
  for (const s of skips) console.log(JSON.stringify({ skip: s }));
  for (const f of failures) console.log(JSON.stringify({ failure: f }));
  return t.failed ? 1 : 0;
}

// ---------------------------------------------------------------------------
// UNDO
// ---------------------------------------------------------------------------
async function runUndo(db, opt) {
  const writer = makeWriter(db, opt.apply);
  const records = latestByRow(fs.readFileSync(opt.undo, 'utf8'));
  let undone = 0, refused = 0, nothing = 0;
  const fd = opt.apply ? writer.openUndo(opt.undo) : null;
  for (const r of records.values()) {
    if (r.event === 'rolled_back' || r.event === 'undone') { nothing++; continue; }
    if (opt.onlyIncomplete && r.event !== 'pending') { nothing++; continue; }
    const { data: cur, error } = await db.from('files').select('id, file_path, markup_data').eq('id', r.id).maybeSingle();
    if (error) throw new Error(`read ${r.id}: ${error.message}`);
    const pointsAtNew = cur?.file_path === r.new_path;
    const fpNow = cur && hasMarkup(cur.markup_data) ? markupFingerprint(cur.markup_data) : null;
    // A markup saved AFTER conversion lives only in {new}.markup.jpg; restoring
    // the old path would display the stale {old}.markup.jpg — refuse, report.
    if (pointsAtNew && (r.markup_fp ?? null) !== fpNow) {
      refused++;
      console.log(JSON.stringify({ refuse: r.id, reason: 'markup changed since conversion — undo would show a stale derivative', was: r.markup_fp ?? null, now: fpNow }));
      if (fd) appendLine(fd, { ...r, event: 'undo_refused', at: new Date().toISOString() });
      continue;
    }
    if (cur && cur.file_path !== r.new_path && cur.file_path !== r.old_path) {
      refused++;
      console.log(JSON.stringify({ refuse: r.id, reason: `row now points at ${cur.file_path}, neither old nor new` }));
      continue;
    }
    // New-path thumbnails the app generated after conversion are removed too.
    const extras = (await listFolderMatching(db, r.new_path)).filter((p) => OWN_THUMB_SUFFIX.test(p.slice(r.new_path.length)));
    const toRemove = [...new Set([r.new_path, ...r.copied_objects, ...extras])];
    console.log(JSON.stringify({ undo: r.id, from_event: r.event, restore: pointsAtNew ? r.old_path : '(row not repointed)', remove: toRemove }));
    if (!opt.apply) continue;
    if (pointsAtNew) {
      const upd = await writer.updateFile(r.id, r.new_path, { file_path: r.old_path, mime_type: r.old_mime, file_name: r.old_name, file_size: r.old_size });
      if (upd.error || (upd.data ?? []).length !== 1) {
        refused++;
        console.log(JSON.stringify({ refuse: r.id, reason: `restore failed: ${upd.error?.message ?? 'matched 0 rows'}` }));
        continue;
      }
    }
    // DB first, objects second: the row never points at a missing object.
    const rm = await writer.remove(toRemove);
    if (rm.error) console.log(JSON.stringify({ warn: r.id, reason: `row restored; object removal failed: ${rm.error.message}` }));
    appendLine(fd, { ...r, event: 'undone', at: new Date().toISOString(), removed: toRemove });
    undone++;
  }
  if (fd) fs.closeSync(fd);
  console.log(JSON.stringify({ mode: opt.apply ? 'UNDO APPLY' : 'UNDO DRY RUN — zero writes', rows_in_file: records.size, undone, refused, nothing_to_do: nothing }));
  return refused ? 1 : 0;
}

// ---------------------------------------------------------------------------
// VERIFY (read-only)
// ---------------------------------------------------------------------------
async function objectExists(db, path) {
  const s = await db.storage.from(BUCKET).createSignedUrl(path, 60);
  return !s.error && !!s.data?.signedUrl ? s.data.signedUrl : null;
}

async function runVerify(db, opt) {
  const records = latestByRow(fs.readFileSync(opt.verify, 'utf8'));
  let ok = 0, bad = 0;
  for (const r of records.values()) {
    if (r.event !== 'done') continue;
    const problems = [];
    const { data: cur, error } = await db.from('files').select('file_path, mime_type, markup_data').eq('id', r.id).maybeSingle();
    if (error || !cur) problems.push(`row unreadable: ${error?.message ?? 'missing'}`);
    else {
      if (cur.file_path !== r.new_path) problems.push(`row points at ${cur.file_path}`);
      if (cur.mime_type !== 'image/jpeg') problems.push(`row mime ${cur.mime_type}`);
      const url = await objectExists(db, r.new_path);
      if (!url) problems.push('new object missing');
      else {
        const res = await fetch(url, { headers: { Range: 'bytes=0-15' } });
        const bytes = new Uint8Array(await res.arrayBuffer());
        const type = res.headers.get('content-type') ?? '';
        if (!type.startsWith('image/jpeg')) problems.push(`new object served as ${type}`);
        if (!isJpegMagic(bytes)) problems.push('new object bytes are not JPEG');
      }
      if (!(await objectExists(db, r.old_path))) problems.push('ORIGINAL missing (must never happen)');
      const hadThumb = r.copied_objects.some((p) => OWN_THUMB_SUFFIX.test(p.slice(r.new_path.length)));
      const expectThumb = thumbPathFor(r.new_path, cur.markup_data);
      if (hadThumb && !(await objectExists(db, expectThumb))) problems.push(`thumbnail missing at ${expectThumb}`);
      if (hasMarkup(cur.markup_data) && !(await objectExists(db, derivativePathFor(r.new_path)))) problems.push('derivative missing');
    }
    if (problems.length) { bad++; console.log(JSON.stringify({ fail: r.id, problems })); } else ok++;
  }
  console.log(JSON.stringify({ mode: 'VERIFY (read-only)', rows_in_file: records.size, ok, failed: bad }));
  return bad ? 1 : 0;
}

async function main() {
  const opt = parseArgs(process.argv.slice(2));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.');
  const urlRef = new URL(url).hostname.split('.')[0];
  if (urlRef !== opt.ref) throw new Error(`REFUSING: --project-ref ${opt.ref} but the URL is ${urlRef}.`);
  const mode = opt.verify ? 'VERIFY' : opt.undo ? `UNDO ${opt.apply ? 'APPLY' : 'DRY RUN'}` : opt.apply ? 'APPLY (writes)' : 'DRY RUN (writes nothing)';
  console.log(`[heic] target ${urlRef} — ${mode}`);
  const { createClient } = require('@supabase/supabase-js');
  const db = createClient(url, key, { auth: { persistSession: false } });
  process.exitCode = opt.verify ? await runVerify(db, opt) : opt.undo ? await runUndo(db, opt) : await runConvert(db, opt);
}

module.exports = {
  BUCKET,
  RENDER_TRANSFORM,
  hasMarkup,
  markupFingerprint,
  thumbPathFor,
  derivativePathFor,
  heicCategory,
  isAlreadyConverted,
  newPathFor,
  jpegNameFor,
  sideObjectPlan,
  targetConflicts,
  isJpegMagic,
  jpegDimensions,
  planRow,
  undoRecord,
  validateUndoRecord,
  latestByRow,
  makeWriter,
  parseArgs,
  isFrozenSiteVisitFile,
  convertRow,
};

if (require.main === module) {
  main().catch((e) => {
    console.error(`[heic] FAILED: ${e instanceof Error ? e.message : e}`);
    process.exitCode = 1;
  });
}
