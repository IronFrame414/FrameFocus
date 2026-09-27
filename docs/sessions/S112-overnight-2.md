# S112 overnight 2: report

**No production issue found.** Nothing on production was touched tonight: no migration, no query, no
service key. Nothing was merged to main.

> **Resume point:** read `S112-overnight-2-PLAN.md` first, then the **Log** at the bottom of this
> file. The last entry is where the work got to. Queue order: 1 runbook → 2a Files/photos → 2b
> multi-upload → 3 role-permission tests → 4 m-loading CI → 5 proposal payload → 6 CLAUDE.md
> restructure. Then STOP.

## NEEDS A RULING

_(none yet)_

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

## BUILT BUT UNTESTED

_(none yet)_

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

## Log

- 00:20Z: started. Plan recorded verbatim (`5b30616e`). main `80e15bad` verified. 36278907305
  green. 36282031683 running. Queue 1 done (runbook written 2026-09-27 ~00:10Z, not run).
