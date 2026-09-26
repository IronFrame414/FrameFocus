# S112 R7 — legacy HEIC/HEIF → stored JPEG

> # ⛔ PREPARED, NOT RUN ON PRODUCTION.
>
> Nothing in this file has been run against production **or rebuild-test**. The script was written and
> unit-tested only (`apps/web/test/s112-heic-convert.test.ts`, plus the parity cases added to
> `apps/web/test/s111-thumbnail-path.test.ts`). Josh proves it on rebuild-test first.

**Ruling R7 [Josh]:** convert legacy HEIC/HEIF photos ONCE to a stored JPEG, **keeping the original**.
They display blank everywhere but Safari because Storage serves them as `application/octet-stream`.
New uploads already convert in the browser (`lib/services/files-client.ts` `prepareImageForUpload` →
heic2any).

Script: `scripts/s112-heic-convert.cjs`. Project refs: **production = `jwkcknyuyvcwcdeskrmz`**,
**rebuild-test = `nmyphyhmfttxkdoposvf`**.

---

## 1. How many — read-only count (SQL editor)

Every query here is a `SELECT`. None changes anything.

```sql
-- Q1. Candidates by category and mime, live vs trashed, with size and markup.
SELECT
  CASE WHEN lower(mime_type) IN ('image/heic','image/heif','image/heic-sequence','image/heif-sequence')
       THEN 'mime' ELSE 'name_only' END                            AS category,
  mime_type,
  is_deleted,
  count(*)                                                         AS n,
  pg_size_pretty(sum(file_size))                                   AS total_size,
  sum(file_size)                                                   AS total_bytes,
  count(*) FILTER (WHERE CASE WHEN jsonb_typeof(markup_data -> 'shapes') = 'array'
                              THEN jsonb_array_length(markup_data -> 'shapes') > 0 ELSE false END)
                                                                   AS with_markup,
  count(*) FILTER (WHERE site_visit_capture)                       AS site_visit_captures
FROM files
WHERE lower(mime_type) IN ('image/heic','image/heif','image/heic-sequence','image/heif-sequence')
   OR file_name ~* '\.(heic|heif)$'
GROUP BY 1, 2, 3
ORDER BY 3, 1, 2;
```

- **Only `is_deleted = false` rows are converted.** Trashed rows are counted by the dry run and left
  alone.
- **How many have thumbnails is not knowable from `files`.** A thumbnail has no row. It is only a
  Storage object whose name is the photo's path plus a suffix. **The dry run is the real count**: it
  lists the folder for every row and prints each side object it will copy. If you want an SQL cross-check,
  `storage.objects` is readable in the dashboard's SQL editor (read-only):

```sql
-- Q2 (optional). Side objects that exist today for the live candidates.
SELECT
  count(*) FILTER (WHERE o.name ~ '\.thumb\.webp$')  AS thumbnails,
  count(*) FILTER (WHERE o.name LIKE '%.markup.jpg')  AS derivatives
FROM files f
JOIN storage.objects o
  ON o.bucket_id = 'project-files'
 AND (o.name = f.file_path || '.markup.jpg'
      OR o.name ~ ('^' || regexp_replace(f.file_path, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g')
                   || '(\.m[0-9a-f]{8})?\.thumb\.webp$'))
WHERE f.is_deleted = false
  AND (lower(f.mime_type) IN ('image/heic','image/heif','image/heic-sequence','image/heif-sequence')
       OR f.file_name ~* '\.(heic|heif)$');
```

```sql
-- Q3. Rows the script will SKIP: a site-visit capture frozen at estimate send.
-- files_z_site_visit_freeze raises on a file_path/mime/name/size change for these,
-- EVEN FOR THE SERVICE ROLE (its freeze branch has no auth.uid() bypass).
SELECT f.id, f.file_path, f.created_at, sv.frozen_at
FROM files f
JOIN site_visits sv ON sv.estimate_id = f.estimate_id
WHERE f.is_deleted = false
  AND f.site_visit_capture
  AND sv.frozen_at IS NOT NULL
  AND f.created_at <= sv.frozen_at
  AND (lower(f.mime_type) IN ('image/heic','image/heif','image/heic-sequence','image/heif-sequence')
       OR f.file_name ~* '\.(heic|heif)$');
```

```sql
-- Q4. Rows the script will SKIP: a file_path shared by more than one files row.
SELECT file_path, count(*) FROM files
WHERE file_path IN (
  SELECT file_path FROM files
  WHERE is_deleted = false
    AND (lower(mime_type) IN ('image/heic','image/heif','image/heic-sequence','image/heif-sequence')
         OR file_name ~* '\.(heic|heif)$'))
GROUP BY file_path HAVING count(*) > 1;
```

---

## 2. The commands

Terminal, in `/workspaces/FrameFocus`. The key goes in an environment variable, never on the command
line history twice (the S111 runbook's Step 35 pattern: `read -s FF_PROD_SERVICE_KEY`, then `unset` it
at the end). Shown for **rebuild-test**. For production, swap in both the URL and the ref. **The
script refuses if the two disagree.**

```bash
# DRY RUN: zero writes. Prints the per-row plan, the skips, and a summary.
NEXT_PUBLIC_SUPABASE_URL=https://nmyphyhmfttxkdoposvf.supabase.co SUPABASE_SERVICE_ROLE_KEY="$FF_SERVICE_KEY" \
  node scripts/s112-heic-convert.cjs --project-ref nmyphyhmfttxkdoposvf

# CANARY: one row, then look at it in the app (desktop grid, /m grid, viewer, markup).
NEXT_PUBLIC_SUPABASE_URL=https://nmyphyhmfttxkdoposvf.supabase.co SUPABASE_SERVICE_ROLE_KEY="$FF_SERVICE_KEY" \
  node scripts/s112-heic-convert.cjs --project-ref nmyphyhmfttxkdoposvf --apply --undo-file s112-heic-undo.jsonl --limit 1

# APPLY: the rest. Re-running is safe; converted rows no longer match.
NEXT_PUBLIC_SUPABASE_URL=https://nmyphyhmfttxkdoposvf.supabase.co SUPABASE_SERVICE_ROLE_KEY="$FF_SERVICE_KEY" \
  node scripts/s112-heic-convert.cjs --project-ref nmyphyhmfttxkdoposvf --apply --undo-file s112-heic-undo.jsonl

# VERIFY (read-only): every `done` row in the undo file.
NEXT_PUBLIC_SUPABASE_URL=https://nmyphyhmfttxkdoposvf.supabase.co SUPABASE_SERVICE_ROLE_KEY="$FF_SERVICE_KEY" \
  node scripts/s112-heic-convert.cjs --project-ref nmyphyhmfttxkdoposvf --verify s112-heic-undo.jsonl

# UNDO: dry run first (prints what it would restore and remove), then --apply.
NEXT_PUBLIC_SUPABASE_URL=https://nmyphyhmfttxkdoposvf.supabase.co SUPABASE_SERVICE_ROLE_KEY="$FF_SERVICE_KEY" \
  node scripts/s112-heic-convert.cjs --project-ref nmyphyhmfttxkdoposvf --undo s112-heic-undo.jsonl
NEXT_PUBLIC_SUPABASE_URL=https://nmyphyhmfttxkdoposvf.supabase.co SUPABASE_SERVICE_ROLE_KEY="$FF_SERVICE_KEY" \
  node scripts/s112-heic-convert.cjs --project-ref nmyphyhmfttxkdoposvf --undo s112-heic-undo.jsonl --apply

# AFTER A CRASH mid-row: undo only the rows that never reached `done`, then re-run APPLY.
... --undo s112-heic-undo.jsonl --only-incomplete [--apply]
```

**Keep the undo file.** It is the only record of which original each row came from. Copy it
somewhere durable (commit it to a branch, or download it). The Codespace has eaten work before.

Flags: `--concurrency` defaults to 1 and is capped at 2. Storage's connection pool is small (S111
runbook item 6). **Run after hours.** Each row renders a full-resolution JPEG.

Exit code: `1` if any row failed (apply), any row was refused (undo), or any check failed (verify).
Read the printed summary rather than trusting a wrapper's status.

---

## 3. What each row goes through

For each live row where `mime_type` is HEIC/HEIF **or** `file_name` ends `.heic`/`.heif`:

| # | Step | Guard |
|---|---|---|
| 1 | new path = `{file_path}.jpg` | row is **skipped** if the new path, or any side-object target, already exists |
| 2 | JPEG from `/render/image/` on the **original**. Service-role signed with `{ quality: 85 }` and **no width/height**, so there is no resize. Fetched with `Accept: image/jpeg` | row **fails** unless `content-type` is `image/jpeg` **and** the bytes start `FF D8 FF`. Dimensions are read from the JPEG and printed, so a shrink would show |
| 3 | upload to the new path, `image/jpeg`, `upsert: false` | never overwrites |
| 4 | Storage `copy` (server-side) of every thumbnail and the derivative to the new names | only objects that exist are copied |
| 5 | `UPDATE files SET file_path, mime_type='image/jpeg', file_name='<stem>.jpg', file_size=<jpeg bytes> WHERE id=… AND file_path=<old>` | must match exactly 1 row |
| 6 | undo record: `pending` line **before** any write, `done` after the UPDATE (appended, fsync'd) | on failure: objects this row created are removed, and a `rolled_back` line is written |

**The original, its thumbnails and its derivative are never modified, moved or deleted.** That is
what makes undo lossless. Undo restores the four columns (guarded on `file_path = new`) **first**,
then removes the new JPEG, the copied objects, and any thumbnail the app generated for the new path
afterwards. The row never points at a missing object, in either direction.

Skipped, and listed with a reason: already converted · `file_path` shared by another `files` row ·
frozen site-visit capture (Q3) · original object missing · target name exists.

---

## 4. Why thumbnails and derivatives are copied, not regenerated or abandoned

`files.file_path` names **three** kinds of object. Only one of them has a row:

| Object | Name | How the policy finds its parent row |
|---|---|---|
| original | `{file_path}` | `f.file_path = objects.name` |
| grid thumbnail | `{file_path}.thumb.webp` or `{file_path}.m{fp8}.thumb.webp` | `regexp_replace(name, '(\.m[0-9a-f]{8})?\.thumb\.webp$', '') = f.file_path` (20261810000000) |
| markup derivative | `{file_path}.markup.jpg` | `left(name, length(name) - 11) = f.file_path` (20261780/90/800, and the client arm in 20261019) |

**If only `file_path` changes, both side objects are orphaned.** The app looks for
`thumbPathFor(new, markup)` and `derivativePathFor(new)`, and neither exists. For a plain photo that
is only a slow grid tile. **For an annotated photo it is #129's silent loss:** the viewer and the
portal fall back to the unmarked JPEG, and nothing says the marks exist. The policies would also stop
matching the old side objects, because no row names their parent any more.

**Why copying gives the right names.** `markupFingerprint()` hashes `JSON.stringify(markup_data)`
and nothing else. The path is not an input. So `{old}.m{fp}.thumb.webp` → `{new}.m{fp}.thumb.webp` is
exactly `thumbPathFor(new, markup_data)`. The unit test asserts this by computing both names.

**Why not regenerate.** A thumbnail of a marked photo is rendered from the **derivative**, not the
original. The derivative is a canvas flatten made in the browser. Nothing server-side can reproduce
it, so it has to be copied.

**Parity.** The script re-implements `hasMarkup`, `markupFingerprint`, `thumbPathFor` and
`derivativePathFor`, because a `.cjs` cannot import TypeScript. `test/s111-thumbnail-path.test.ts`
now asserts all three copies agree: `markup.ts`, the S111 backfill, and this script.

---

## 5. Things Josh should know before running it

1. **`updated_by` becomes NULL on every converted row.** The `files_set_updated_by` trigger sets it to
   `auth.uid()`, which is NULL under the service role. `updated_at` moves to the run time. Undo does
   the same again. The other two triggers: `files_column_scope` returns early when `auth.uid()` is
   NULL, and the site-visit freeze blocks frozen captures (Q3, skipped).
2. **The storage number goes up.** `company_storage_used_bytes()` is `SUM(files.file_size)`. The JPEG
   is usually larger than the HEIC (a prior measurement: 3000×4000 → 2.88 MB). The kept original, and
   the copied side objects, are **not counted anywhere**, because no row names them.
3. **After conversion the original is readable only through folder-level (owner/admin) access.** The
   policies that key on `f.file_path = objects.name` no longer match it. That is intended: it is kept
   for undo, not for display.
4. **"The set is closed" is not strictly true.** `convertHeicToJpeg()` returns `null` on any heic2any
   failure, and the upload then **falls back to storing the HEIC bytes**. So a new HEIC row can still
   appear. The script can be re-run later and only picks up rows that still match.
5. **Storage transformation limits.** A render the service refuses (too large, unsupported) fails that
   row with the service's message, and nothing is written for it. Rows that still fail after a re-run
   stay HEIC. Send the list.
6. **EXIF.** The rendered JPEG is a transcode. Orientation is applied by the renderer, and the EXIF
   metadata (GPS, capture time) may not be carried over. The original keeps it.
