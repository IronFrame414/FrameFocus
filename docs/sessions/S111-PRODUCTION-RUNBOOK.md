# S111 — production runbook: markup-derivative policies, thumbnails, backfill

> **Written for Josh to work through top to bottom without deciding anything.** Each step is ONE
> command or ONE query. Each says what you should see, and what to do if you see anything else.
> **"STOP" means: do nothing further, leave everything as it is, and send the step number and what you
> saw.** Nothing in this file has been run against production; every query and command below was run
> against **rebuild-test**, and the "you should see" lines are what rebuild-test actually returned.

## How to run things

- **SQL steps** — Supabase dashboard → project **`jwkcknyuyvcwcdeskrmz`** (FrameFocus, PRODUCTION) →
  SQL Editor → New query → paste → Run. Check the project name in the top bar every time. Every SQL
  step in this file is **read-only** (`SELECT` / `SHOW`) — none of them changes anything.
- **Terminal steps** — the Codespace terminal, in `/workspaces/FrameFocus`.
- ⚠️ **Always `npx supabase`, never `supabase`.** The global supabase binary is NOT installed in this
  Codespace; `npx supabase` runs the project's own copy.
- Project refs, spelled out once: **production = `jwkcknyuyvcwcdeskrmz`**, **rebuild-test =
  `nmyphyhmfttxkdoposvf`**. The CLI is on rebuild-test now; this runbook switches it to production for
  the migration steps only, and switches it back **twice** — straight after the migrations, and again
  as the very last step — so it never ends pointed at production.

---

## ⚠️ READ FIRST — item 6: if production's Storage is as small as rebuild-test's

Rebuild-test's Storage service works through a pool of about **5 database connections**
(`max_connections` = 60), shared by every upload, signed URL and image render. Past that, Storage
answers **429 "SlowDown" — "Too many connections issued to the database"**. The build now handles that
(image loads queue 6 at a time and retry; the page's one signing call retries; thumbnail generation
retries; the backfill runs one photo at a time). **If production is the same size, real users will
hit that path, not just tests.** It is not a new bug when it happens. How to tell:

**The two checks that say production's pool is the same** (SQL editor, production, read-only):

```sql
SHOW max_connections;
```
- **60** → same compute class as rebuild-test; expect the same limits. **Higher (e.g. 90, 120, 160+)**
  → larger compute; the slow-down path should be rare.

```sql
SELECT count(*) AS storage_connections FROM pg_stat_activity WHERE application_name = 'Supabase Storage API';
```
- Run it while the crew is uploading. **Never above ~5** → the same small pool as rebuild-test.

**What it looks like to a user** — recognise these instead of reporting them as new bugs:

1. **Grid tiles stay grey for a second or two, then fill in** — the load queue retrying behind the
   scenes. Normal under load.
2. **A tile shows the browser's broken-image icon** — a thumbnail was refused four times in a row
   (about 4 seconds of retries). Refreshing the page fixes it.
3. **A whole Photos page with no images at all (every tile grey, nothing loading), fixed by a
   refresh** — the page's single signing call was refused three times.
4. **An upload fails with "Upload failed: Too many connections issued to the database"** — Storage
   refused the upload itself. Trying again works. This one predates this work; it is the same pool.
5. **All of the above get more likely while the backfill (step 38) is running** — which is why it
   runs after hours.

**What to look for in the Vercel logs** (Project → Logs → search): `Too many connections issued to the
database`, `SlowDown`, `[getSignedUrls] batch sign failed`, `[POST /api/photos/thumbnail] 502
generation failed`. Seeing these confirms it. The fix is a compute upgrade (or accepting it) — a
decision for Josh, not a code bug.

---

## THE ORDER, AND WHY — RULED [Josh]

**Migrations → merge/deploy → backfill. NOT backfill before deploy.**

If the backfill ran first, every photo uploaded between the backfill finishing and the deploy landing
would have no thumbnail, and **nothing would ever generate one** — a permanent gap that only a second
backfill run would close. Deploying first means new uploads generate their own thumbnails from that
moment, and the backfill then only has to cover what already existed.

**The cost of this order:** until the backfill finishes, grids show full-size images as the fallback.
That is today's behaviour, so it is not a regression.

**Merges: the harden branch first** (it carries `20261790000000` and `20261800000000`), **the
thumbnails branch second** (it carries `20261810000000`). Both are merged **locally before the
migrations are applied**, because the CLI refuses to push from a working tree that is missing any
migration the database already has — and neither branch alone holds all three. **A local merge is not
a deploy:** nothing reaches Vercel until step 29 (`git push origin main`), which comes after the
migrations are applied and verified.

**Why nothing is applied before Step 0 is read on production:** a constraint written against
rebuild-test's rows has aborted on production twice in this campaign. These three migrations are
policy-only (they change no row and no file), but they change **who can read and overwrite existing
marked-up images**, and that is measured on production's rows, not rebuild-test's.

---

## PART 0 — read production before touching anything (all read-only)

### Step 0 — the sizing query for `20261790000000` + `20261800000000` (SQL editor, production)

```sql
SELECT count(*) AS derivative_objects,
       count(*) FILTER (WHERE f.id IS NULL) AS no_original_row,
       count(*) FILTER (WHERE pr.role NOT IN ('owner','admin')) AS written_by_non_owner_admin,
       count(*) FILTER (
         WHERE f.id IS NOT NULL AND pr.role NOT IN ('owner','admin')
           AND NOT EXISTS (
             SELECT 1 FROM project_assignments pa
               JOIN company_members m ON m.id = pa.member_id
              WHERE pa.project_id = f.project_id AND m.profile_id = pr.id
                AND pa.is_deleted = false AND m.is_deleted = false)
       ) AS would_not_be_admitted_now
FROM storage.objects o
LEFT JOIN files f ON f.file_path = left(o.name, length(o.name) - 11)
LEFT JOIN profiles pr ON pr.user_id = o.owner AND pr.is_deleted = false
WHERE o.bucket_id = 'project-files' AND o.name LIKE '%.markup.jpg';
```

- **Expected: `would_not_be_admitted_now` = 0.** (Rebuild-test: 17 / 16 / 1 / **0**.) The other three
  columns are context and can be any number.
- **If it is 0** → go to Step 2.
- **If it is not 0** → do Step 1, then follow Step 1's rule.

### Step 1 — ONLY if Step 0's last column was not 0: which files those are (SQL editor, production)

```sql
SELECT f.category, p.name AS project, pr.role AS writer_role, count(*) AS derivatives
FROM storage.objects o
JOIN files f ON f.file_path = left(o.name, length(o.name) - 11)
LEFT JOIN projects p ON p.id = f.project_id
JOIN profiles pr ON pr.user_id = o.owner AND pr.is_deleted = false
WHERE o.bucket_id = 'project-files' AND o.name LIKE '%.markup.jpg'
  AND pr.role NOT IN ('owner','admin')
  AND NOT EXISTS (
    SELECT 1 FROM project_assignments pa
      JOIN company_members m ON m.id = pa.member_id
     WHERE pa.project_id = f.project_id AND m.profile_id = pr.id
       AND pa.is_deleted = false AND m.is_deleted = false)
GROUP BY f.category, p.name, pr.role
ORDER BY derivatives DESC;
```

- **If every row's `category` is `photos` (or anything except `invoices`)** → **continue to Step 2.**
  Those are marked-up photos written by someone who has since come off the project. That person
  already cannot open the photo — `files` RLS hides it from anyone not assigned — so tightening the
  markup rules changes nothing they can see today.
- **If any row's `category` is `invoices`** → **STOP.** A PM can read an invoice they authored on a
  project they are not assigned to; after these migrations that PM would lose the marked-up copy of it.
  That needs a ruling before anything is applied.

### Step 2 — production holds no thumbnails yet (SQL editor, production)

```sql
SELECT count(*) AS thumbnails FROM storage.objects WHERE bucket_id = 'project-files' AND name LIKE '%.thumb.webp';
```

- **Expected: 0.** `20261810000000` governs thumbnails, and none exist yet, so it affects no existing
  file. **Anything else → STOP** (something has been writing thumbnails to production already).

### Step 3 — production's migration ledger ends where this plan expects (SQL editor, production)

```sql
SELECT max(version) AS latest FROM supabase_migrations.schema_migrations;
```

- **Expected: `20261780000000`.** (Applied 2026-09-24 23:10, attended.)
- **Anything later → STOP** — production has a migration this runbook does not know about, and the
  push in Step 20 would behave differently.

---

## PART 1 — merge both branches locally (nothing is deployed in this part)

### Step 4
```bash
cd /workspaces/FrameFocus
```
- You should see: the prompt now shows `/workspaces/FrameFocus`.

### Step 5
```bash
git status --short
```
- **Expected: no output at all.** Any listed file → **STOP** (uncommitted work would be dragged into
  the merge).

### Step 6
```bash
git fetch origin
```
- Expected: returns to the prompt (it may print branch updates). An error → **STOP**.

### Step 7
```bash
git checkout main
```
- Expected: `Switched to branch 'main'` (possibly followed by "Your branch is behind…" — Step 8 fixes
  that). An error → **STOP**.

### Step 8
```bash
git pull --ff-only origin main
```
- Expected: `Already up to date.` or a fast-forward summary. **`fatal: Not possible to fast-forward`
  → STOP** (local `main` has commits that are not on GitHub).

### Step 9
```bash
git log -1 --format=%h
```
- **Expected: `ec8eb72a`.** Anything else means `main` has moved since this runbook was written and
  the merges below may conflict differently → **STOP**.

### Step 10 — merge the harden branch FIRST
```bash
git merge --no-ff origin/feature/s111-photos-harden -m "[S111] Merge photos harden - markup derivative policies check assignment"
```
- **Expected: `Merge made by the 'ort' strategy.`** and a file list that includes
  `20261790000000_s111_markup_derivative_self_contained.sql` and
  `20261800000000_s111_markup_derivative_read_update_self_contained.sql`. No `CONFLICT` lines.
- **Any `CONFLICT` → STOP.** (Measured in a trial merge: none.)

### Step 11 — merge the thumbnails branch SECOND
```bash
git merge --no-ff origin/feature/s111-photo-thumbnails -m "[S111] Merge photo thumbnails - stored thumbnails, lazy grids, backfill script"
```
- **Expected — this one DOES stop with a conflict, on purpose, in exactly two files:**
  ```
  CONFLICT (content): Merge conflict in apps/web/lib/schema-fingerprint-baseline.json
  CONFLICT (content): Merge conflict in scripts/.db-fingerprint.json
  Automatic merge failed; fix conflicts and then commit the result.
  ```
  Both are the schema-fingerprint baseline. The two branches each regenerated it; they differ ONLY in
  `generated_at` and `latest_migration` (`20261800000000` vs `20261810000000`). The public-schema
  hashes are identical on both sides (measured).
- **A conflict in any OTHER file → STOP.**

### Step 12
```bash
git diff --name-only --diff-filter=U
```
- **Expected: exactly these two lines and nothing else:**
  `apps/web/lib/schema-fingerprint-baseline.json` and `scripts/.db-fingerprint.json`. Anything else →
  **STOP**.

### Step 13 — take the THUMBNAILS side (`20261810000000`) for both files
```bash
git checkout --theirs apps/web/lib/schema-fingerprint-baseline.json scripts/.db-fingerprint.json
```
- Expected: `Updated 2 paths from the index`. ("theirs" = the branch being merged in = thumbnails.
  Measured in the trial merge: the result is byte-identical to the thumbnails branch's copies.)

### Step 14
```bash
git add apps/web/lib/schema-fingerprint-baseline.json scripts/.db-fingerprint.json
```
- Expected: returns to the prompt with no output.

### Step 15
```bash
git diff --name-only --diff-filter=U
```
- **Expected: no output** (no unresolved files left). Any output → **STOP**.

### Step 16
```bash
grep -h latest_migration apps/web/lib/schema-fingerprint-baseline.json scripts/.db-fingerprint.json
```
- **Expected: two identical lines: `  "latest_migration": "20261810000000"`.** `20261800000000` on either
  line → you took the wrong side; run `git checkout --theirs` (Step 13) again, then Step 14, then this
  step.

### Step 17 — finish the merge
```bash
git commit --no-edit
```
- Expected: a line starting `[main …] [S111] Merge photo thumbnails …`. The merge is complete
  **locally**; nothing is on GitHub or Vercel yet.

### Step 18
```bash
ls supabase/migrations | tail -4
```
- **Expected, in this order:**
  `20261780000000_s111_markup_derivative_insert.sql`,
  `20261790000000_s111_markup_derivative_self_contained.sql`,
  `20261800000000_s111_markup_derivative_read_update_self_contained.sql`,
  `20261810000000_s111_thumbnail_read_policy.sql`. Anything else → **STOP**.

---

## PART 2 — apply the three migrations to production

### Step 19 — point the CLI at PRODUCTION
```bash
npx supabase link --project-ref jwkcknyuyvcwcdeskrmz
```
- Expected: `Finished supabase link.` If it asks for a database password, it is **production's**
  database password (Supabase dashboard → production → Project Settings → Database).

### Step 20 — confirm where it points
```bash
cat supabase/.temp/project-ref
```
- **Expected: `jwkcknyuyvcwcdeskrmz`.** Anything else → **STOP**.

### Step 21 — dry run: what WOULD be applied
```bash
npx supabase db push --dry-run
```
- **Expected: `Would push these migrations:` followed by exactly three:**
  `20261790000000_s111_markup_derivative_self_contained.sql`,
  `20261800000000_s111_markup_derivative_read_update_self_contained.sql`,
  `20261810000000_s111_thumbnail_read_policy.sql`.
- **More, fewer, or different → STOP**, then do Step 27 (relink to rebuild-test) before leaving.
- `Remote migration versions not found in local migrations directory` → **STOP** and do Step 27.
  Do **NOT** run the `migration repair` command it suggests — it would mark production's migrations as
  reverted.

### Step 22 — apply them (the one production write in Part 2)
```bash
npx supabase db push
```
- It lists the same three and asks `Do you want to push these migrations to the remote database?`.
  Type **`Y`** and Enter.
- **Expected: three `Applying migration …` lines, then `Finished supabase db push.`**
- An error on any of them → **STOP**, do Step 27. A migration file runs in one transaction, so a failed
  one leaves its policies as they were; Step 26 will show which ones landed.

**What the three migrations create.** They are **policy-only**: each drops and re-creates, or adds,
row-level-security policies on `storage.objects`. **None of them creates, changes or drops a function
or a trigger** — there is nothing else to verify. ⚠️ And **the schema-drift detector cannot see any of
them**: `public.schema_fingerprint()` only digests `pg_policies WHERE schemaname = 'public'`, and these
are `storage` policies. **Steps 23–25 are the only proof they landed as intended.**

### Step 23 — verify `20261790000000` by OBJECT (SQL editor, production)

Replaces the policy **`project_files_insert_non_client`** (INSERT on `storage.objects`): its
`.markup.jpg` arm now checks project assignment itself.

```sql
SELECT policyname, cmd, roles::text AS roles,
       position('JOIN project_assignments pa ON ((pa.project_id = f.project_id))' in coalesce(with_check, '')) > 0
         AS markup_arm_checks_assignment
FROM pg_policies
WHERE schemaname = 'storage' AND policyname = 'project_files_insert_non_client';
```
- **Expected: exactly 1 row — `project_files_insert_non_client | INSERT | {public} | true`.**
- `false` → the old policy is still in place → **STOP**. 0 rows → the policy is missing (nothing can
  upload) → **STOP immediately and report — this one is urgent**.

### Step 24 — verify `20261800000000` by OBJECT (SQL editor, production)

Replaces the policies **`project_files_select_non_client`** (SELECT) and
**`project_files_update_non_client`** (UPDATE): their `.markup.jpg` arm checks assignment itself; the
arm for ORIGINALS (a file readable through its own `files` row) is kept exactly as it was — by ruling.

```sql
SELECT policyname, cmd, roles::text AS roles,
       position('JOIN project_assignments pa ON ((pa.project_id = f.project_id))' in coalesce(qual, ''))       > 0 AS using_checks_assignment,
       position('JOIN project_assignments pa ON ((pa.project_id = f.project_id))' in coalesce(with_check, '')) > 0 AS check_checks_assignment,
       position('f.file_path = objects.name' in coalesce(qual, '')) > 0 AS originals_arm_kept
FROM pg_policies
WHERE schemaname = 'storage'
  AND policyname IN ('project_files_select_non_client', 'project_files_update_non_client')
ORDER BY policyname;
```
- **Expected: exactly 2 rows —**
  - `project_files_select_non_client | SELECT | {authenticated} | true | false | true`
  - `project_files_update_non_client | UPDATE | {authenticated} | true | true | true`
- Any `false` where `true` is shown, or a missing row → **STOP** (a missing SELECT row means nobody
  but owner/admin can read any file — urgent).

### Step 25 — verify `20261810000000` by OBJECT (SQL editor, production)

Creates a NEW, separate policy **`project_files_select_thumbnail_assigned`** (SELECT): a non-client can
read a `.thumb.webp` only on a project they are assigned to. It is separate on purpose, so it cannot
undo Step 24.

```sql
SELECT policyname, cmd, roles::text AS roles,
       position('.thumb' in coalesce(qual, '')) > 0 AS is_thumbnail_rule,
       position('JOIN project_assignments pa ON ((pa.project_id = f.project_id))' in coalesce(qual, '')) > 0 AS checks_assignment,
       position('<> ''client''' in coalesce(qual, '')) > 0 AS excludes_clients
FROM pg_policies
WHERE schemaname = 'storage' AND policyname = 'project_files_select_thumbnail_assigned';
```
- **Expected: exactly 1 row — `project_files_select_thumbnail_assigned | SELECT | {authenticated} |
  true | true | true`.** 0 rows or any `false` → **STOP**.

### Step 26 — the ledger rows (SQL editor, production)

```sql
SELECT version, name FROM supabase_migrations.schema_migrations
WHERE version IN ('20261780000000', '20261790000000', '20261800000000', '20261810000000')
ORDER BY version;
```
- **Expected: 4 rows** — `s111_markup_derivative_insert`, `s111_markup_derivative_self_contained`,
  `s111_markup_derivative_read_update_self_contained`, `s111_thumbnail_read_policy`.
- This proves the files RAN; Steps 23–25 prove the OBJECTS are what was intended. If this shows 4 but
  a step above failed → the objects are the truth → **STOP**.

### Step 27 — point the CLI back at REBUILD-TEST now (nothing below needs production linked)
```bash
npx supabase link --project-ref nmyphyhmfttxkdoposvf
```
- Expected: `Finished supabase link.`

### Step 28
```bash
cat supabase/.temp/project-ref
```
- **Expected: `nmyphyhmfttxkdoposvf`.**

---

## PART 3 — deploy

### Step 29 — push `main` (this deploys: Vercel builds from `main`)
```bash
git push origin main
```
- Expected: a line ending `main -> main`. `rejected` → **STOP** (someone pushed to `main` meanwhile).

### Step 30 — is the new build live? (repeat every minute or two until it says 400)
```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://frame-focus-eight.vercel.app/api/photos/thumbnail
```
- **`400`** → the new build is live (the new thumbnail route exists and rejects an empty request, as
  designed).
- **`404`** → the old build is still serving; wait and run it again. Still 404 after ~15 minutes →
  check the Vercel dashboard for a failed build → **STOP**.

### Step 31 — the schema-drift check stays quiet (SQL editor, production)

```sql
SELECT public.schema_fingerprint();
```
- **Expected, matching the baseline this deploy carries** (`apps/web/lib/schema-fingerprint-baseline.json`):
  - `policies`: `n` **369**, `md5` **`3ab3163c01cb41e49b0477c91de5c0df`**
  - `triggers`: `n` **285**, `md5` **`ad85718a157cc53e16a97a37d9644d46`**
  - `functions`: `n` **311**, `md5` **`0cccc989606c34a22e58b25ffdba95a9`**
  - `constraints`: `n` **1011**, `md5` **`7e57b9420ddc3527dc8d93678a0a5ce1`**
  - `latest_migration`: **`20261810000000`**
- The daily drift check (`/api/cron/schema-drift`, 11:00 UTC) fires only when one of those four `md5`s
  differs. All four equal → it stays quiet.
- **A different `md5`** → production's public schema already differed before today. These migrations
  touch only `storage` policies and cannot change these four values (the hashes are identical on
  `main`, the harden branch and the thumbnails branch). Record which dimension, send it, and **carry
  on** — it is not caused by this work and does not block the backfill.
- `latest_migration` not `20261810000000` → Step 22 did not fully apply → **STOP**.

### Step 32 — prove new uploads now make their own thumbnails (in the app, production)

In the production app, open any project → **Photos** → **Add photos** → choose one photo from the
computer. Wait until it appears in the grid.

### Step 33 — the thumbnail for that upload exists (SQL editor, production)

```sql
SELECT name, created_at FROM storage.objects
WHERE bucket_id = 'project-files' AND name LIKE '%.thumb.webp' AND created_at > now() - interval '15 minutes'
ORDER BY created_at DESC;
```
- **Expected: at least 1 row**, created within a second or two of your upload. This is the proof that
  "deploy first" works: every upload from now on generates its own thumbnail.
- **0 rows** → the app is not generating thumbnails → **STOP** before the backfill (search the Vercel
  logs for `/api/photos/thumbnail`).

---

## PART 4 — the backfill (AFTER HOURS)

**Run Part 4 after hours.** Measured on rebuild-test: **~0.85 s per photo** (median 843 ms, p95
1,254 ms), one photo at a time — and it **shares Storage's connection pool with the crew's uploads**
(see READ FIRST). It only ever writes new `.thumb.webp` files; it never changes an original, a
marked-up copy, or any database row.

**If it is interrupted** (Ctrl-C, a closed tab, a lost connection): nothing is damaged. Each thumbnail
is one complete upload — a file appears only once its upload finishes (measured: a run killed partway
left 0 partial files). Run the same step again and it skips everything already done.

### Step 34 — count and size (SQL editor, production)

```sql
SELECT count(*) AS image_rows,
       count(*) FILTER (WHERE f.markup_data IS NOT NULL
                          AND jsonb_array_length(COALESCE(f.markup_data->'shapes','[]'::jsonb)) > 0) AS annotated,
       count(*) FILTER (WHERE o.id IS NULL) AS original_object_missing,
       round(sum(COALESCE((o.metadata->>'size')::bigint, f.file_size))/1048576.0, 1) AS originals_mb,
       round(count(*) FILTER (WHERE o.id IS NOT NULL) * 29.7 / 1024.0, 1) AS est_thumbnail_mb_at_29_7_kb
FROM files f
LEFT JOIN storage.objects o ON o.bucket_id = 'project-files' AND o.name = f.file_path
WHERE f.is_deleted = false AND f.mime_type LIKE 'image/%';
```
- Write down `image_rows` and `est_thumbnail_mb_at_29_7_kb`. Expected run time ≈ `image_rows` ×
  0.85 s (e.g. 1,000 photos ≈ 14 minutes). Storage added ≈ the MB column (29.7 KB mean per real
  iPhone photo, measured).

### Step 35 — load production's service key into this terminal only (nothing is shown as you paste)
```bash
read -rs FF_PROD_SERVICE_KEY
```
- Paste production's **service_role** key (Supabase dashboard → project `jwkcknyuyvcwcdeskrmz` →
  Project Settings → API Keys) and press Enter. Nothing appears — that is correct. ⚠️ **Never put this
  key in `apps/web/.env.local`**: that file must only ever hold rebuild-test's keys (the test guards
  depend on it).

### Step 36 — dry run: counts only, writes nothing
```bash
NEXT_PUBLIC_SUPABASE_URL=https://jwkcknyuyvcwcdeskrmz.supabase.co SUPABASE_SERVICE_ROLE_KEY="$FF_PROD_SERVICE_KEY" node scripts/s111-thumbnail-backfill.cjs --project-ref jwkcknyuyvcwcdeskrmz
```
- **Expected: the first line is `[backfill] target jwkcknyuyvcwcdeskrmz — DRY RUN (writes nothing)`**,
  then a block with `image_rows` (≈ Step 34's, plus any uploads since), `thumbnails_already_present`
  (**at least 1** — Step 32's photo), `thumbnails_missing`, and an estimate in MB.
- `REFUSING: --project-ref … but the URL is …` → the URL was mistyped → re-run this step exactly as
  written. `NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set` → Step 35 was skipped.
  Any other `FAILED` line → **STOP**.

### Step 37 — ⛔ the backfill itself (a production write; after hours)
```bash
NEXT_PUBLIC_SUPABASE_URL=https://jwkcknyuyvcwcdeskrmz.supabase.co SUPABASE_SERVICE_ROLE_KEY="$FF_PROD_SERVICE_KEY" node scripts/s111-thumbnail-backfill.cjs --project-ref jwkcknyuyvcwcdeskrmz --apply
```
- **Expected: first line `… — APPLY (writes thumbnails)`**, a progress line per 500 rows, then a
  summary with `generated`, `failed`, `source_object_missing`, `source_unrenderable`,
  `thumbnail_mb_written`, `mean_kb` and `ms_per_photo`. **Write the summary down** — Steps 38 and 39
  use it.
- **`failed` = 0** → done. **`failed` > 0** → run this same step again (it retries only what is
  missing). Still failing after a second run → **STOP** and send the listed failures.
- `source_object_missing` and `source_unrenderable` are **not failures**: rows whose photo file is gone
  from storage, or whose bytes Storage cannot render (corrupt / not really an image). They are listed by
  id; those photos keep showing exactly as they do today.

### Step 38 — how many photos now have a thumbnail (SQL editor, production)

```sql
SELECT count(*) AS image_rows,
       count(*) FILTER (WHERE EXISTS (
         SELECT 1 FROM storage.objects t
          WHERE t.bucket_id = 'project-files'
            AND left(t.name, length(f.file_path)) = f.file_path
            AND substr(t.name, length(f.file_path) + 1) ~ '^(\.m[0-9a-f]{8})?\.thumb\.webp$'
       )) AS rows_with_a_thumbnail
FROM files f
WHERE f.is_deleted = false AND f.mime_type LIKE 'image/%';
```
- **Expected: `rows_with_a_thumbnail` = `image_rows` − `source_object_missing` − `source_unrenderable`**
  (the last two from Step 37's summary). Measured on rebuild-test: 35 − 5 − 2 = **28**, and it read 28.
- Lower → run Step 37 again, then this step again. Still lower → **STOP**.

### Step 39 — dry run again: nothing left to do
```bash
NEXT_PUBLIC_SUPABASE_URL=https://jwkcknyuyvcwcdeskrmz.supabase.co SUPABASE_SERVICE_ROLE_KEY="$FF_PROD_SERVICE_KEY" node scripts/s111-thumbnail-backfill.cjs --project-ref jwkcknyuyvcwcdeskrmz
```
- **Expected: `thumbnails_missing` = `source_object_missing` + `source_unrenderable` from Step 37.**
  This also proves marked-up photos have the thumbnail of their CURRENT markup (the name carries the
  markup's fingerprint; a stale one would count as missing).

### Step 40 — forget the key
```bash
unset FF_PROD_SERVICE_KEY
```
- Expected: returns to the prompt with no output.

---

## PART 5 — leave the CLI on rebuild-test

### Step 41 — relink to REBUILD-TEST (again — so this runbook can never end pointed at production)
```bash
npx supabase link --project-ref nmyphyhmfttxkdoposvf
```
- Expected: `Finished supabase link.`

### Step 42 — the last step
```bash
cat supabase/.temp/project-ref
```
- **Expected: `nmyphyhmfttxkdoposvf`.** Done.

---

### Afterwards (no action — what to expect)

- Photos grids, the /m filmstrip, chat and the site-visit record now load 400px thumbnails:
  measured on 80 real photos, **133.49 MB → 2.20 MB** per full grid, and the site-visit record
  **21.48 MB → 0.31 MB**.
- iPhone HEIC photos that showed as blank tiles in Chrome now show (their thumbnails are WebP).
  Opening one full-size still shows it blank outside Safari — that is the separate, un-fixed HEIC
  conversion item.
- If users report grey tiles, broken-image tiles, or a blank grid that a refresh fixes: that is the
  Storage pool described in **READ FIRST**, not a new bug.
