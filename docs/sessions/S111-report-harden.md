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
