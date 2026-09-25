# S111 — photos hardening report (`feature/s111-photos-harden`) — appended after every step

> Two hardening items on Part Two (already merged at `ec8eb72a`). Kept apart from
> `S111-report-photos.md` so this branch does not conflict on an append-only file.

## Step H0 — branch, and the state found [2026-09-25]

- `feature/s111-photos-harden` cut from `main` at `ec8eb72a`.
- ⚠️ **The Supabase CLI is linked to PRODUCTION.** `supabase/.temp/project-ref` =
  `jwkcknyuyvcwcdeskrmz`, `linked-project.json` name "FrameFocus", written 03:08Z today — after
  Part Two's last step (P8, 03:03Z). STATE.md says the link must be rebuild-test
  (`nmyphyhmfttxkdoposvf`). Presumably Josh re-linked to apply Part Two's migrations. **No `db push`
  was run while it pointed there.** It is re-linked to rebuild-test before this branch's migration
  (Step H4), and that is stated here so the change is not a surprise.
- The Supabase MCP targets rebuild-test (`get_project_url` → `nmyphyhmfttxkdoposvf`). Every SQL
  read in this report went through it. **Nothing in this session read or wrote production.**
- Actions API: `main` run 36125818354 on `ec8eb72a` was in progress. All rebuild-test work was held
  until it completed (**success, 11:29:06Z**; 0 in progress, 0 queued).

## Step H1 — item 1: the conversion tripwire in CI (written; CI run pending)

`apps/web/e2e/desktop-photos-conversion-s111.spec.ts` (`e683b008`). `test/s111-photo-conversion.live.ts`
is **unchanged**.

- Fixture: the owner records a site visit (`create_site_visit`, real session), the service role
  attaches **exactly 3 files — 2 images + 1 PDF control**: a `site_visit_capture` image in category
  `'other'` (the pre-S111 write path, i.e. what production rows look like), a `'photos'` image, and a
  PDF. Promoted, then **accepted**, so the capture is frozen.
- Fixture checks, asserted before converting: `frozen_at` is stamped; **CONTROL** — a direct
  re-point of the capture raises `frozen` (so the regression's trigger is really armed); the estimate
  carries **3 files, 2 images** (exact).
- The conversion is the **real UI**: owner clicks "Convert to Project", accepts the confirm dialog,
  lands on `/dashboard/projects/{id}`.
- Assertions, all exact: the Photos query (`project_id` + `category = 'photos'` + not deleted — the
  predicate `getProjectPhotos()` runs) on the **owner's session returns exactly the 2 image ids**; the
  page reads `Photos · 2 total`; each image tile's `naturalWidth` is **8** (the real bytes resolved
  through the signed URL, not a broken tile); the PDF has **0** tiles.
- **Row count the e2e asserts on: 2** Photos-query rows (and 3 attached files / 2 images before
  conversion). A pass on 0 attached images is impossible: `toHaveLength(3)`, `toBe(2)` and
  `toEqual([2 ids])` all fail on zero.
- Type-check: `tsc --noEmit` **TSC_EXIT=0, 0 errors**. Not yet run — see H3.

## Step H2 — item 2(a): the negative test, FIRST, against the CURRENT policy — ✅ PASSES (no live leak)

`apps/web/test/s111-markup-derivative-floor.live.ts` (`f8eb80a7`), written and run **before any
policy change**. Policy under test: `project_files_insert_non_client` as of `20261780000000`,
confirmed from `pg_policies` on rebuild-test.

- Actor: `josh+qa-sub@worthprop.com`, role `subcontractor` (in the policy's role array — asserted), same
  company as the owner (asserted, so the folder check is not what refuses). A fresh project with the
  sub **not assigned: 0 assignment rows** (asserted).
- Two originals on that project: one on the normal `{company}/{projectId}/…` path, and one on the
  `{company}/estimates/{uuid}/…` path a converted photo keeps. On the second, segment 2 is not a
  UUID, so the CASE arm is false and **the markup arm is the only way in**.
- "Zero rows written" is **measured with the service role** (exact-name object lookup) after each
  attempt, not inferred from the client error.

`npx vitest run --config test/live.vitest.config.ts s111-markup-derivative-floor --reporter=verbose --silent=false`
→ **VITEST_EXIT=0, 6 passed / 6**, live-guard `nmyphyhmfttxkdoposvf`:

| case | client | objects written (service role) |
| --- | --- | --- |
| 2-projpath, unassigned sub | `new row violates row-level security policy` | **0** |
| 2-estpath, unassigned sub | `new row violates row-level security policy` | **0** |
| 3b CONTROL, same sub **after** assignment, estpath | success | **1** |

The control proves the probe can register a write, so the two zeros are the policy refusing, not a
bad path or a dead session. **No live leak → proceeding to 2(b).**

### The coupling, measured rather than argued (rolled back)

One `DO` block on rebuild-test, run as the sub (`SET LOCAL ROLE authenticated` + JWT claims), a
`files` row on a project the sub is not assigned to (`3a01d018…`), estimates-shaped path, direct
`INSERT INTO storage.objects` of its `.markup.jpg`; ended by `RAISE EXCEPTION`, so **everything
rolled back**:

- `files` SELECT as today → **REFUSED** (`new row violates row-level security policy for table "objects"`)
- `files` SELECT widened (`CREATE POLICY … USING (true)`, inside the block) → **WRITTEN**

So under today's arm, a later widening of `files` SELECT widens **who can write storage** with no
edit to the storage policy. Residue afterwards: files 0, objects 0, projects 0, probe policy 0.

## Step H3 — item 1 proven in CI

CI run **36129811882 on `440d71b4`**: Lint & Type Check **success**, E2E (Playwright) **success**
(head SHA matches the pushed tip). The new spec **ran** — its lines are in the job log:
`[S111 e2e] attached to the estimate: 3 files, 2 images`, `[S111 e2e] Photos query rows: 2 (expected 2)`.
Suite tally **585 passed, 10 skipped, 0 failed, 0 flaky** (the 13 "failed" grep hits are all
`[WebServer]` app log lines — translate/english-check with no model key, an invoice-send delivery, a
deliveries PDF — not test results). `next build` locally: **BUILD_EXIT_LINE=0**; eslint on both new
files exit 0.

**Item 1 is done: the conversion regression now has a CI tripwire, asserting on 2 Photos-query rows.**

## Step H4 — item 2(b): the arm made self-contained — `20261790000000`, rebuild-test only

- CLI re-linked: `supabase link --project-ref nmyphyhmfttxkdoposvf` → `linked-project.json` name
  **framefocus-rebuild-test**. Actions API 0 in progress / 0 queued. `db push --dry-run` listed exactly
  one pending migration, `20261790000000`; pushed, DBPUSH_EXIT=0.
- The `.markup.jpg` arm now JOINs `files → project_assignments → company_members → profiles` on
  `p.user_id = auth.uid()`, with `f.project_id IS NOT NULL` — the same assignment test the CASE arm
  already uses. `files` RLS still applies on top (it can only narrow). Owner/admin unchanged.
  Confirmed from `pg_policies` after the push.
- **AFTER, real sessions** — `s111-markup-derivative-floor` + the unchanged `s111-photo-conversion`:
  **VITEST_EXIT=0, 14 passed / 14**. Unassigned sub: **0 objects** on both paths; assigned sub
  (control): **1**; conversion 2b rows moved **3**, 2c Photos rows **2**; 4a assigned PM still writes
  the derivative; 4b unassigned crew still refused.
- **AFTER, the coupling probe** (same rolled-back `DO` block, `files` SELECT widened to `USING (true)`):
  unassigned project `3a01d018…` → **REFUSED**; CONTROL, a project the sub IS assigned to
  (`4a4f8567…`) → **WRITTEN**. Before the migration the unassigned case was **WRITTEN**. The authority
  now sits in the storage policy. Residue: files 0, objects 0, projects 0, probe policy 0.
- `npm run db:fingerprint` → latest migration `20261790000000` (functions n=311, unchanged — policies
  are not fingerprinted); both baseline files committed with the migration (`1a50a1b8`).
- Sweep for older tests encoding the old rule (CLAUDE.md, S157): grep `project_files_insert_non_client`
  / `markup.jpg` / `derivativePathFor` across `test/`, `e2e/`, `docs/specs` — 11 test files. None
  asserts that an UNASSIGNED user may write a derivative; `s157` A7/A8 cover the SELECT arm
  (unchanged); `s111-photo-conversion` 4a/4b are consistent with the new rule and passed.

## Step H5 — local e2e against the migrated rebuild-test

Production build (`next start`, the H3 build; no app code changed since). Actions API 0/0 before.
`desktop-photos-conversion-s111`, `m-photos` (incl. the crew markup SAVE, which writes a derivative),
`desktop-photos-add-s111`, `m-photos-add-s111`: **45 passed, 0 failed, 0 flaky, PW_EXIT=0**. Server
stopped by PID.

## Owed to production — `20261790000000` (NOT applied; Josh applies)

**Policy-only. It governs no existing row or object** — an INSERT policy is evaluated only on new
writes. Production must already carry `20261780000000`, which this replaces. What changes going
forward: a non owner/admin can write a `.markup.jpg` only beside a file on a project they are
assigned to.

Sizing query, read-only, for Josh to run on production first. The last column is how many EXISTING
derivatives were written by someone the new rule would not admit. On rebuild-test: 17 derivative
objects, 1 by a non owner/admin — orphaned test residue with no original row — so the last column is
**0**. It was **not** run on production (this session has no production access and did not use any).

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

A non-zero last column does not block the migration (nothing existing is touched); it would mean
someone once wrote a derivative on a project they are not assigned to now.

## Not done, recorded for a ruling

- **The same coupling remains in `project_files_select_non_client` and `project_files_update_non_client`.**
  Both carry the identical `.markup.jpg` arm scoped only by `files` RLS. UPDATE is the path the
  `saveMarkup()` upsert takes on every save after the first. Item 2 named the INSERT arm only, so both
  are untouched.
