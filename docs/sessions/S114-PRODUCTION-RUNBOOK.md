# S114 PART A — production runbook (worked by CC under Josh's scoped override, this session only)

**Scope of the override [Josh, 2026-09-27, S114 Phase 2]:** CC applies **only** PART A's five migrations to
production (`jwkcknyuyvcwcdeskrmz`) and then merges. Not 20261850/1860/1890/1900 or anything else. Nothing is
written to production but the migrations: no rows, no role grants, no backfills. CLAUDE.md and R8 are unchanged —
applying a migration to production remains Josh's action outside this session.

**Hard stops (any one → relink to rebuild-test, prove it, record, commit, push, end):** a verification value that
does not match; `pe_profiles_now` ≠ 0; a dry run listing anything but the one file its section names; a constraint
over existing rows (PART A adds none — no `ADD CONSTRAINT`, `CHECK`, `UNIQUE`, `NOT NULL` or `ALTER COLUMN` in any of
the five files). ⚠️ **Never `migration repair --status reverted`.**

⚠️ **Count pattern.** Arm counts use `policyname LIKE '%\_project\_executive'` (ENDS-WITH). The contains-pattern
also catches `_project_executive_lien` / `_money` and reads higher (S181b). Baseline on production after S181d
(Josh's row, 2026-09-27 20:20 ET): `pe_read_arms 19`, `pe_write_arms 19`.

## Step 0 — link and read-only pre-checks (production)

```bash
cat supabase/.temp/project-ref                          # expect nmyphyhmfttxkdoposvf
npx supabase link --project-ref jwkcknyuyvcwcdeskrmz
cat supabase/.temp/project-ref                          # expect jwkcknyuyvcwcdeskrmz
```
```sql
SELECT
  (SELECT count(*) FROM profiles WHERE role = 'project_executive')                                         AS pe_profiles_now,        -- 0
  (SELECT max(version) FROM supabase_migrations.schema_migrations)                                          AS newest_migration,       -- 20261930000000
  (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version >= '20261940000000')            AS s114_ledger_rows,       -- 0
  (SELECT count(*) FROM pg_policies WHERE policyname LIKE '%\_project\_executive' AND cmd = 'SELECT')      AS pe_read_arms,           -- 19
  (SELECT count(*) FROM pg_policies WHERE policyname LIKE '%\_project\_executive' AND cmd <> 'SELECT')     AS pe_write_arms,          -- 19
  (SELECT count(*) FROM pg_policies WHERE policyname IN ('client_contract_amounts_insert_project_executive',
     'client_contract_amounts_update_project_executive'))                                                   AS contract_amount_arms,   -- 2
  (SELECT count(*) FROM pg_proc WHERE proname = 'pe_can_upload_project_file')                               AS upload_helper,          -- 0
  (SELECT string_agg(proname || '=' || md5(prosrc), ',' ORDER BY proname) FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace AND proname IN ('chat_can_post','may_enter_client_thread',
      'create_budget_line_at_capture','flag_po_item_missing','issue_po_lines','set_po_total_amount',
      'get_approved_change_order_summaries'))                                                               AS fn_md5_before;
```
`fn_md5_before` must equal the header of `20261960000000` (the bodies being replaced are the live ones):
chat_can_post `c420c2c3…`, create_budget_line_at_capture `ac7cfdfb…`, flag_po_item_missing `42b561a9…`,
get_approved_change_order_summaries `28969ada…`, issue_po_lines `9fcbda5e…`, may_enter_client_thread `030fa292…`,
set_po_total_amount `7c596d84…`. A different hash means production's body differs from the one this file replaces
→ STOP.

Hold sections 2–5 out of the directory so each dry run can list exactly one file:
```bash
mkdir -p $HOLD && mv supabase/migrations/2026195*.sql supabase/migrations/2026196*.sql \
  supabase/migrations/2026197*.sql supabase/migrations/2026198*.sql $HOLD/
```

## Per section

```bash
npx supabase db push --dry-run            # EXACTLY one line: the section's file
npx supabase db push --yes                # "Applying migration <file>..." then "Finished supabase db push."
```
Then the section's verification; append the row to `S114-report.md`; **commit and push before the next section**;
release the next file with `mv $HOLD/<file> supabase/migrations/`.

| § | File | Verification (all must hold) |
| --- | --- | --- |
| 1 | `20261940000000_s114_pe_operational_arms.sql` | ledger row 1; `pe_read_arms 24` (19+5); `pe_write_arms 60` (19+41); the 46 named arms 46 |
| 2 | `20261950000000_s114_pe_storage_upload_arm.sql` | ledger row 1; storage arm `project_files_insert_project_executive` 1; `pe_write_arms 61`; `pe_can_upload_project_file` md5 `f72520ec11555bb6d74a47c258dce771`, anon EXECUTE false |
| 3 | `20261960000000_s114_pe_functions.sql` | ledger row 1; md5 after = rebuild-test's: chat_can_post `c576b7fa8c622e9584e3313101a3446a`, create_budget_line_at_capture `b499b0085c4d58a70a7e70ed41b081b6`, flag_po_item_missing `f8b4fb4b5800a7e371ca64b2057274a4`, get_approved_change_order_summaries `dcbc9ccf9d85c41e62dc4472e9ed14fa`, issue_po_lines `d88f4fa6ee180b515abd451aef11aea1`, may_enter_client_thread `e3bf9066e29aa705094db89b3129461b`, set_po_total_amount `ccfe85c605385084cbc5463c7a7d36b9`; `setup_payment_schedule` has no PE; `enforce_contract_void_authority` has no PE |
| 4 | `20261970000000_s114_pe_roster_catalog_reads.sql` | ledger row 1; the 3 named SELECT arms 3; `pe_read_arms 27` |
| 5 | `20261980000000_s114_pe_contract_amount_drops.sql` | ledger row 1; `contract_amount_arms 0`; `client_contract_amounts_select_project_executive` 1; `pe_write_arms 59` |

Final, after §5: `db push --dry-run` → "Remote database is up to date."; `pe_profiles_now 0`; carve-out write arms naming
the PE (`client_refunds`, `client_contracts`, `subcontractor_contracts`, `contract_documents` non-SELECT) **0**.

## Always last — relink to rebuild-test (even after a STOP)

```bash
mv $HOLD/*.sql supabase/migrations/ 2>/dev/null; git status --short supabase/migrations   # expect nothing
npx supabase link --project-ref nmyphyhmfttxkdoposvf
cat supabase/.temp/project-ref                                                            # expect nmyphyhmfttxkdoposvf
```
