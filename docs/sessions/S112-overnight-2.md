# S112 overnight 2: report

**No production issue found.** Nothing on production was touched tonight: no migration, no query, no
service key. Nothing was merged to main.

> **Resume point:** read `S112-overnight-2-PLAN.md` first, then the **Log** at the bottom of this
> file. The last entry is where the work got to. Queue order: 1 runbook → 2a Files/photos → 2b
> multi-upload → 3 role-permission tests → 4 m-loading CI → 5 proposal payload → 6 CLAUDE.md
> restructure. Then STOP.

## NEEDS A RULING

### N3 — Which of the 37 file inputs get `multiple`? (queue 2b)

**The question in full.** You asked for a proposal: which upload controls take several files at
once, and which stay single, with a reason for each.

**The inventory, re-measured tonight.** The S111 command is
`grep -rn -E "type=[\"'{]*file|type: *['\"]file['\"]|\.type *= *['\"]file['\"]" apps/web packages --include=*.ts --include=*.tsx --exclude-dir=node_modules --exclude-dir=.next`.
It now returns **50 hits: 13 in tests, 37 source inputs** (S111 counted 36). Of those, **13 already
have `multiple` and 24 are single**. Each was classified from its own `<input … />` element, not
from the lines around it.

**Built tonight (the unambiguous two):** the desktop Files upload, and the desktop Photos "Add
photos" (moved onto the shared queue).

**Proposed to GET `multiple`**, all through the shared queue:

| Control | Reason |
| --- | --- |
| `estimate-files-tab.tsx:137` (estimate Files tab) | Same job as project Files: plans, specs and photos arrive in sets. |
| `bid-reply-client.tsx:245` (sub's bid reply, **logged out**) | A sub attaches a quote *and* plans. ⚠️ It is the anon token route, so the queue's limit matters most here. **Recommend yes, but after the bid-token branch lands**, since it reworks this route. |
| `/m` library siblings: `logs/new/log-form.tsx:381`, `safety/new/incident-form.tsx:361`, `punch/[itemId]/punch-actions.tsx:196` | A crew member picks several photos from the roll. **Only if** each form stores more than one photo per entry. The daily log and incident do (arrays); **punch completion stores ONE photo** (`completion photo`), so punch stays single. |
| `/m` damage photos, `deliveries/check-in/check-in-form.tsx:362` | Per damaged line, several angles are normal. Its desktop twin (`field-ops/.../check-in-form.tsx:358`) is already `multiple`, so this is a **PARITY fix**. |

**Proposed to STAY single:**

| Control | Reason |
| --- | --- |
| The 6 `capture="environment"` camera inputs (`mobile-shell.tsx:645`, `capture-screen.tsx:326`, `log-form.tsx:361`, `punch-actions.tsx:172`, `incident-form.tsx:341`, `check-in-form.tsx:335`) | One shutter press is one photo. `multiple` means nothing to a camera, and D-8's one-tap camera is ruled. |
| `punch-actions.tsx:196` (punch library) | Punch completion is one completion photo. |
| `settings-form.tsx:427` logo, `:486` signature | Exactly one of each. |
| `lien-release-settings-form.tsx:294`, `contract-settings-form.tsx:458` | One template PDF each. |
| `lien-releases/sub-releases-section.tsx:198`, `releases-panel.tsx:280` | One signed release document per release. |
| `expenses/bills-tab.tsx:282` ("Attach bill", per row) | One bill document per bill row. |
| `subcontractors/[id]/compliance-section.tsx:265` | One certificate per compliance item. |
| `estimates/[id]/bidding-tab.tsx:699`, `:1079` | A per-request scope document. **Could** be `multiple`; recommend single until the bid-docs-by-line work (`#2-bidtok`) decides how documents attach to a line. |
| `selections/[selectionId]/selection-sheet.tsx:309` | The option's single image. |

**Already `multiple`, and should move onto the shared queue** (they loop sequentially or in
parallel with no limit):

- `portal-writes-ui.tsx:405`
- desktop `check-in-form.tsx:358/407`
- `selection-sheet.tsx:493`
- `field-ops/.../daily-logs/log-form.tsx:280`
- `delivery-edit-form.tsx:270/325`
- `components/field/incident-form.tsx:460`
- `site-visit-record.tsx:453`
- `expense-capture-form.tsx:324`
- `/m` `mobile-shell.tsx:661` and `capture-screen.tsx:335`: these go through `/m`'s capture/offline
  pipeline, which is a separate question.

**Options:**
- **(a)** Apply the table as proposed.
- **(b)** Apply only the PARITY fix (`/m` damage photos) plus moving the existing `multiple` inputs
  onto the shared queue.
- **(c)** Leave everything but the two built tonight.
- **(d)** Also add a real per-file BYTE progress bar. That needs an XHR upload transport beside
  supabase-js, a second upload path, which the PARITY rule warns against.

**Recommendation: (a) without (d).** Move the existing `multiple` inputs onto the queue first. They
are where unbounded parallelism already lives today.

### N1 — Daily-log and safety IMAGES: stay in Documents → Files, or leave it too? (queue 2a)

**The question in full.** Queue 2a removes `category = 'photos'` rows from Projects → Documents →
Files, by category and never by MIME, as ruled. Daily-log and safety images keep their own
categories (`daily_logs`, `safety`), so **they stay in Files**. Since S111 Q18 they **also** appear
on the Photos page, because that query was widened to include them. So those images show in both
places. The ruling on 2a said to report this, not decide it.

**Measured on rebuild-test:** 14 such images (12 daily-log, 2 safety), out of 134 rows left in Files.

**Options:**
1. **Leave as built.** A daily log's images remain filed with their log's documents in Files, and
   are also browsable in Photos.
2. **Exclude them from Files as well**, by adding `daily_logs` and `safety` **image** rows to the
   exclusion. ⚠️ That needs a MIME test **inside** those two categories, and the ruling says
   "never by MIME". It also hides a photographed incident report filed under `safety`.
3. **Exclude the whole `daily_logs` and `safety` categories from Files.** That removes their
   non-image documents too (13 on rebuild-test).

**Recommendation: 1.** It is the only option that stays category-only, as ruled. The overlap is
harmless (the same row, reachable twice), and 2 would reintroduce exactly the MIME judgement the
ruling forbids.

### N2 — Should the Files upload still offer "Photos" as a category? (queue 2a)

**The question in full.** The desktop Files upload (`files/upload/upload-form.tsx:20`,
`MANUAL_KEYS`) lets the uploader choose the `photos` category. After 2a, a file uploaded there as
"Photos" **does not appear in Files**. It lands on the Photos page instead. That is consistent, but
could surprise someone who uploads from Files and doesn't see the result.

**Options:**
1. Keep "Photos" in the list. The upload lands in Photos, correctly.
2. Remove "Photos" from the Files upload. Photos are added from the Photos page ("Add photos", S111
   Q16).
3. Keep it, and after the upload show "Filed under Photos — view it there".

**Recommendation: 3**, or 2 if you want the simpler screen. No change has been made; this was not
ruled.

## DONE AND PROVEN

### Queue 1: the `20261840000000` production runbook: WRITTEN, NOT RUN

`docs/sessions/S112-R5b-PRODUCTION-RUNBOOK.md` (on this branch, and on `feature/s112-followup-docs`
at `f580e695`). It has 9 steps:

1. read-only pre-check
2. `cd`
3. check out `feature/s112-wave2-integration`
4. confirm the migration files
5. link to production and confirm the ref
6. **dry run with `--include-all`**, which must list exactly one file
7. push
8. verify by object
9. relink to rebuild-test (always)

`--include-all` is needed because `20261840000000` is older than production's newest,
`20261880000000`.

**The verification SQL was measured, not predicted.** On rebuild-test, where the migration is
applied, it returns:

| column | value |
| --- | --- |
| `args` | `p_project_id uuid` |
| `security_definer` | true |
| `anon_can_run` | **false** |
| `staff_can_run` | true |
| `mentions_money_column` | **false** |
| `ledger_row` | 1 |
| `anon_can_execute_total` | **3** |

The money-column check was proven able to fire: it returns **true** on `apply_change_order_budget`.

**Why R5b ships, in words rather than zeros:** production has **zero** change orders of any status,
so the money-in-text query was a pass on zero rows, which proves nothing. R5b ships title +
description + date because there is no legacy text to leak and the editor hint precedes the first
entry. The re-measure at about 20 signed COs is filed as `#1-cosum`.

### Queue 2a — Documents → Files no longer lists photos (`feature/s112-files-and-upload` @ `243221d1`)

- **The change:** `getDocumentFiles(projectId)` in `lib/services/files.ts`. It is `getFiles()` with
  `.neq('category', 'photos')` **in the query**. `category` is `NOT NULL`, so `neq` cannot drop a
  null row.
- **Both surfaces read it** (PARITY): desktop `files/page.tsx` and `/m`'s `files/page.tsx`.
- **Found on the way:** `/m` already split by category, but **in memory, after `getFiles()`' 500-row
  limit**. On a large project, photos could fill the page and push documents off it. That is fixed
  by the same change.
- **Never by MIME, as ruled.** The Files upload's category is chosen by the person (default
  `other`), never derived from the file type. A photographed permit uploaded to Files is `other`,
  and stays.
- **Measured on rebuild-test** (read-only, live project rows):

  | Measure | Rows |
  | --- | --- |
  | Files view before | **155** |
  | Files view after | **134** |
  | **Leaving** | **21** (20 images + **1 PDF filed under `photos`**, a 2026-08-31 fixture) |
  | Images **staying** in Files | 15 (12 daily-log, 2 safety, 1 receipt) |
  | Projects affected | 5 |

  These reconcile exactly with the per-category counts.
- **The PDF under `photos`:** it stays reachable, because the Photos page lists every `photos` row
  regardless of MIME. But it is no longer also in Files.
- **Proof:** `test/s112-document-files.test.ts`, **5/5**. It records the query actually built:
  - `neq category photos`, scoped by `project_id` and `is_deleted`;
  - **no `mime` filter** anywhere;
  - a control showing plain `getFiles()` has no `neq`;
  - both pages call the function, and `/m` no longer filters in memory.

  **Sabotage** (the exclusion removed from the function) → **red**, then restored. Full suite 123
  files / 1,710. tsc 0, eslint 0.

### Queue 2b — multi-file upload: ONE shared queue (`feature/s112-files-and-upload` @ `3dec2b85`)

- **The mechanism**, `lib/uploads/upload-batch.ts`, is shared because it lives in `lib/`:
  - **≤ 3 uploads in flight** by default. Unbounded per-file parallelism is the S111 Storage-exhaustion
    shape: one file is a Storage PUT, a `files` INSERT and, for images, an auto-tag call.
  - **Per-file status:** `queued → uploading → done / failed / skipped`.
  - **Failures named**, e.g. "2 of 5 could not be uploaded: f1.pdf, f3.pdf.", never just a count.
  - **Retry re-sends only the failed and skipped files.** Done files are not uploaded twice, and rows
    keep their place.
  - **A storage-limit refusal stops the queue.** The files after it are "Not attempted", with the
    reason, not "Failed".
  - **The auto-tag call runs inside the queue slot**, so the AI calls are bounded by the same limit.
- **The list**, `components/uploads/upload-batch-list.tsx`: a row per file with its status, the
  named-failure message, and a "Retry the N failed files" button.
- **Applied to:**
  - **Desktop Files upload**: now `multiple`, one category per batch.
  - **Desktop Photos "Add photos"**. _Superseded:_ a sequential loop reporting only "3 of 10 photos
    could not be uploaded", with no retry.
  - Every other control is **proposal only**, below (N3).
- **Proof:** `test/s112-upload-batch.test.ts`, **8/8**:
  - 10 files → **max in flight = 3**; **CONTROL**: with the limit raised to 10 → **max = 10**, so the
    3 comes from the limiter, not from timing;
  - concurrency 1 → strictly sequential;
  - failures named in the message;
  - a retry calls **exactly** the 2 failed files;
  - a worker that throws becomes a `failed` item, and the batch does not crash;
  - storage-limited on file 2 of 6 → **2 calls made**, 5 marked "not attempted";
  - progress snapshots are exactly `uploading,queued → done,queued → done,uploading → done,done`.
- **Full gate:** suite 124 files / 1,718; tsc 0; eslint 0; `next build` 0.
- **Per-file progress is per-FILE STATE, not a byte bar.** `uploadFile()` goes through supabase-js
  Storage, which exposes no upload progress events. A byte bar would need an XHR upload path, a
  second transport (N3 item d).

### Queue 3 — role-permission tests are TOTAL maps (`feature/s112-role-permission-maps` @ `5fae3896`)

- **The mechanism**, `apps/web/test-support/role-matrix.ts`:
  - `forEveryRole(expected: Record<CompanyRole, T>, check)` iterates every key;
  - `JUNK_ROLES` holds strings that must fail closed (`''`, `'OWNER'`, `'Owner'`, `'superadmin'`,
    `'owner '`).
  - Test files are type-checked in CI: `apps/web/tsconfig.json` includes `**/*.ts`, and the
    "Lint & Type Check" job runs `tsc --noEmit`. So a missing role is a **CI failure**.
- **How many files the shape applies to, with the command.** From `apps/web`, over
  `git ls-files '*.test.ts' '*.test.tsx'`, which is **124 unit test files**, with
  `R="owner|admin|project_executive|project_manager|foreman|crew_member|subcontractor|client"`:

  | Shape | Pattern | Files |
  | --- | --- | --- |
  | A: predicate called with a role literal | `grep -lE "expect\(\s*[A-Za-z_][A-Za-z0-9_.]*\(\s*'($R)'"` | 5 |
  | B: role passed as a field | `grep -lE "[A-Za-z_]\(\{[^}]*role: '($R)'"` | 1 |
  | C: a loop over a hand-written list | `grep -lE "for \(const \w+ of \[\s*'($R)'"` | 4 |
  | **Union, distinct files** | | **7 of 124** |

  **6** are permission decisions, and all 6 are converted:
  - `payments-shared.test.ts`: `canRecordPayment`, `canIssueRefund`, `refundNeedsOwnerApproval`,
    `canApproveRefund` (the refund near-miss file)
  - `invoice-lifecycle.test.ts`: `canVoidInvoice` unpaid, and paid → nobody
  - `contracts-shared.test.ts`: `canManageContracts`
  - `budget-columns.test.ts`: `budgetColumnsFor` column set
  - `s131-dashboard-access.test.ts`: `isDashboardRole` plus the denied destination
  - `s109-password-wiring.test.ts`: `dashboardDeniedRedirect`

  The **7th**, `redesign-sections.test.tsx`, renders markup rather than deciding a permission. It
  now iterates `DASHBOARD_ROLES` instead of a hand copy of it.
- **Result: 10 total maps in 6 files.** Hand-written asserts were **inverted in place** with the
  superseded list quoted, not deleted.
- **PROOF that adding a role fails to compile.** I added `'project_executive'` to `CompanyRole`:
  - `tsc` → **exit 2, with exactly 10 errors in those 6 test files**: payments-shared 4,
    invoice-lifecycle 2, and 1 each in the other four. It also flagged app code such as
    `app/m/settings/page.tsx:33`.
  - Reverted: `roles.ts` shows no diff, and `tsc` → 0.
- **Suite** 122 files / 1,707; tsc 0; eslint 0.
- **⚠️ Consequence for `feature/s111-project-role` (item 5, deferred).** When it rebases onto this,
  every map needs the Project Executive's answer. `canRecordPayment` is **true** and
  `canIssueRefund` is **false**. That is the refund negative this whole item exists for, and it can
  no longer be forgotten.

### Queue 5 — Summary with Descriptions SHOWS its descriptions; payload trimmed to the corrected page (`feature/s112-proposal-payload` @ `2daf0d13`)

- **The defect, confirmed at the source.** Both renderers drew a line's description only inside the
  `plan.showLines` loop:
  - `proposal-html.tsx`, the signing page;
  - `proposal-template.tsx`, the PDF.

  "Summary with Descriptions" has `showLines: false, descriptions: true`
  (`packages/shared/utils/proposal-format.ts:123`), so **its descriptions were drawn nowhere**. The
  client signed a page without the text the format is named for.
- **Fixed the page first, in both renderers (PARITY).** In the category layout, when the plan says
  `descriptions`, each line **that has a description** is drawn with its name and description, and
  **no price**, because the format prices categories only.

  ⚠️ **A judgement inside the ruling:** the line **name** is drawn beside its description so the
  text has context. An undescribed line is not drawn. If you want descriptions without names,
  it's a one-line change.
- **Then the payload, trimmed to the corrected page.** The branch's own proof (signing-page markup
  from trimmed data must equal markup from full data) **went red on exactly this format** as soon
  as the page changed. That is the ruled order, enforced mechanically. The trim's `category` case
  now carries described lines only, name and description, with `total`, `originalTotal`, `cost`,
  `markupPercent` and `discountLabel` all null, and no rows. Plain "Summary" is unchanged:
  category names and subtotals only.
- **Tests** (`test/s112-client-proposal.test.tsx`, **23/23**):
  - the old "summary_with_descriptions carries no lines" assert is **inverted in place**, because it
    encoded the broken page;
  - descriptions drawn from full **and** trimmed data;
  - **CONTROL:** plain Summary draws none;
  - an undescribed line is neither drawn nor carried;
  - no line price drawn, **with a control.** That control caught my first draft, which asserted the
    absence of `4,321.09`, a figure no page draws. The Walls line is discounted, so its drawn price
    is `4,500.01`, and the test now uses that.
  - **Sabotage** (the page block switched off) → red.
- **Gate:** rebased onto main `80e15bad`. Suite 123 files / 1,728; tsc 0; eslint 0.
- **Commit order, stated plainly:** the original trim commit (`4c6f8655`) precedes the page fix
  (`2daf0d13`) in history. The **final state** is a trim derived from the corrected page, and the
  proof test keeps it that way.

## BUILT BUT UNTESTED

- **Queue 2a in a browser.** The desktop Files and `/m` Files pages have not been loaded against
  real rows tonight, because CI run 36282031683 holds rebuild-test. The query is proven at the
  unit level. A live row-count proof through the real service runs once CI is idle (next log
  entry).

## BLOCKED

_(none yet)_

## OWED TO PRODUCTION

1. **`20261840000000` (R5b)**, on `feature/s112-wave2-integration`. The runbook above covers it.
   Read-only pre-check:
   ```sql
   SELECT
     (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'get_approved_change_order_summaries') AS function_exists,
     (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20261840000000') AS already_recorded,
     (SELECT max(version) FROM supabase_migrations.schema_migrations)                               AS newest_migration,
     (SELECT count(*) FROM pg_proc q JOIN pg_namespace m ON m.oid = q.pronamespace
       WHERE m.nspname = 'public' AND has_function_privilege('anon', q.oid, 'EXECUTE'))            AS anon_can_execute_total;
   ```
   Expected: `0 | 0 | 20261880000000 | 3`.
2. **Queue 2a has no migration.** This is the read-only count of rows that will **leave** the Files
   view once it deploys:
   ```sql
   SELECT
     count(*) FILTER (WHERE category = 'photos')                                              AS leaving_files_view,
     count(*) FILTER (WHERE category = 'photos' AND mime_type NOT LIKE 'image/%')             AS leaving_that_are_not_images,
     count(*) FILTER (WHERE category <> 'photos' AND mime_type LIKE 'image/%')                AS images_staying_in_files,
     count(*) FILTER (WHERE category IN ('daily_logs','safety') AND mime_type LIKE 'image/%') AS daily_log_and_safety_images_staying,
     count(*) FILTER (WHERE category <> 'photos')                                             AS files_view_after,
     count(*)                                                                                 AS files_view_before,
     count(DISTINCT project_id) FILTER (WHERE category = 'photos')                            AS projects_affected
   FROM files
   WHERE is_deleted = false AND project_id IS NOT NULL;
   ```
   Rebuild-test gives `21 | 1 | 15 | 14 | 134 | 155 | 5`. **Look at `leaving_that_are_not_images`.**
   If it is above 0, real documents are filed under Photos and will now show only there.

## WHAT JOSH MUST CLICK

1. **The R5b runbook**, steps 1 through 9. Then send me step 8's row. `feature/s112-wave2-integration`
   is **not** merged until that row matches **and** its CI is green.
2. **Expect the 11:00Z drift alarm.** It is **right**: production has 310 functions at
   `20261880000000`, while the baseline says 311 at `20261810000000`, because the lockdown merge
   skipped regenerating it. Once you run the R5b runbook, it will also show the new function. **Do
   not rebaseline from production** (ruled and refused). The fix is `#1-s112f`, which derives the
   baseline from the migration files.

## BRANCHES

| Branch | CI | Ready? |
| --- | --- | --- |
| `main` @ `80e15bad` | post-merge run **36278907305 ✅**: 590 passed, 1 flaky (`desktop-chat-switcher` ND-34, the known chat flake, while a duplicate PR-triggered run shared rebuild-test), 21 skipped | — |
| `feature/s112-wave2-integration` @ `ac3a9680` | run **36282031683**: running | **No.** Needs green CI **and** Josh's runbook step 8. |
| `feature/s112-files-and-upload` @ `3dec2b85` | not run yet (one slot) | 2a + 2b done; needs CI + N1/N2/N3. No migration. |
| `feature/s112-role-permission-maps` @ `5fae3896` | not run yet | Tests only. Needs CI. |
| `feature/s112-proposal-payload` @ `2daf0d13` | not run yet | Needs CI. No migration. |

## Log

- 00:20Z: started. Plan recorded verbatim (`5b30616e`). main `80e15bad` verified. 36278907305
  green. 36282031683 running. Queue 1 done (runbook written 2026-09-27 ~00:10Z, not run).
- 00:28Z (logged at the time as '~00:45Z', an estimate, not a clock read) — queue 2a built and proven at unit level (`243221d1`); N1, N2 raised. Starting 2b.
- 00:36Z (logged at the time as '~01:05Z', same mistake; every entry from here uses `date -u`) — 2b built (`3dec2b85`), unit-proven; N3 raised. 10-file timing + 2a live proof wait for CI 36282031683 to free rebuild-test. Starting queue 3 (code only).
- 00:43Z — queue 3 done (`5fae3896`). Found and fixed: the BUILT BUT UNTESTED heading had been dropped by the 2b edit. CI 36282031683 still in E2E (started 00:17Z). Next: queue 5 code while CI runs; 10-file timing + 2a live proof once rebuild-test is free.
- 00:46Z — queue 5 done (`2daf0d13`). CI 36282031683 still in E2E. Next: queue 6 audit table (docs only) while waiting; then CI queue: m-loading (queue 4) and the three new branches, one at a time.
