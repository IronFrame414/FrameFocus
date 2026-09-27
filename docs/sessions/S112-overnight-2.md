# S112 overnight 2: report

**No production issue found.** Nothing on production was touched tonight: no migration, no query, no
service key. Nothing was merged to main.

> **Resume point:** read `S112-overnight-2-PLAN.md` first, then the **Log** at the bottom of this
> file. The last entry is where the work got to. Queue order: 1 runbook → 2a Files/photos → 2b
> multi-upload → 3 role-permission tests → 4 m-loading CI → 5 proposal payload → 6 CLAUDE.md
> restructure. Then STOP.

## NEEDS A RULING

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
| `feature/s112-files-and-upload` @ `243221d1` | not run yet (one slot; wave 2 holds it) | 2a done; 2b in progress. |

## Log

- 00:20Z: started. Plan recorded verbatim (`5b30616e`). main `80e15bad` verified. 36278907305
  green. 36282031683 running. Queue 1 done (runbook written 2026-09-27 ~00:10Z, not run).
- ~00:45Z — queue 2a built and proven at unit level (`243221d1`); N1, N2 raised. Starting 2b.
