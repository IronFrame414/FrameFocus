# S118 — production runbook (CC applies, under S118's authorisation)

One migration per section. Each: a dry run that must list **exactly one file**, the push, then
verification by object with every expected value stated. ⚠️ A mismatch is a **stop**.
Always last: relink to rebuild-test (`nmyphyhmfttxkdoposvf`) and read it back.

Method for expected `md5(prosrc)`: Postgres stores a function body exactly as written between its
dollar quotes, so each expected value below is `md5` of that text in the migration FILE
(`scratchpad/fnmd5.cjs`). Control: the same script reproduces all four R10 values already verified on
production (`cd98c2cc…`, `cde4b466…`, `675545c2…`, `03790772…`).

⚠️ rebuild-test holds EARLIER DRAFTS of two bodies (`get_sub_bid_request` `5b63188b…`,
`close_sub_bid_request` `881c81ac…`) that differ from the files only by `--` comment lines (diffed).
Production gets the files' bodies. `schema_fingerprint()` strips line comments before hashing, so the
final fingerprint must still equal the committed baseline.

## Item 4 — the stranded branches' four migrations

Branch tree: `feature/s118-acl-guard` (stacked on `feature/s118-bid-token-status`), rebased on main.

### Pre-check (production, read-only) — measured 2026-09-29
| value | expected | measured |
| --- | --- | --- |
| newest | `20262020000000` | `20262020000000` |
| ledger_total | `258` (= 262 files − these 4) | `258` |
| owed_present | `0` | `0` |
| md5 `get_sub_bid_request` | `c642b6e8b57864a67763f52e731b63fe` (the 20261240000000 body) | same |
| new functions (`bid_token_state`, `close_sub_bid_request`, `anon_execute_exposure`) | `0` | `0` |
| anon / authenticated EXECUTE `get_sub_bid_request` | false / true | false / true |
| fingerprint | policies 458 `4c627cb4…`, triggers 287 `4c7920f6…`, constraints 1017 `710ff1e9…` equal the baseline; functions **330** `a419e54a…` (baseline 333) | as stated |

Isolation: the push directory holds only the section's file among the four (the others moved out,
uncommitted, restored with `git checkout` after). `--include-all` because all four are older than
production's newest (`20262020000000`).

### §1 — `20261850000000_s112_bid_token_status`
Expected after: ledger row 1; md5 `get_sub_bid_request` = `58081a23e0965204635e2586403c8747`;
anon EXECUTE false, authenticated true (CREATE OR REPLACE keeps the lockdown's grants).

### §2 — `20261860000000_s112_bid_token_closure`
Expected after: ledger row 1; md5 `bid_token_state` = `2c549142bf0e64551801b9e11b4e52f7`;
`get_sub_bid_request` = `01e71e66f0edf01a01001147efc31514`; `close_sub_bid_request` =
`8584a71451343c110a0005d9dce38417`; `bid_token_state` SECURITY DEFINER, EXECUTE anon false /
authenticated false / service_role true; `close_sub_bid_request` INVOKER, anon false / authenticated
true.

### §3 — `20261890000000_s112_bid_winner_survives_conversion`
Expected after: ledger row 1; md5 `bid_token_state` = `4ad866c42c417ce764960834dc64d80a` (equals
rebuild-test's live value); grants unchanged from §2.

### §4 — `20261900000000_s112_anon_execute_guard`
Expected after: ledger row 1; md5 `anon_execute_exposure` = `79d76176b1f565f9e9d2d3868f74d9e2` (equals
rebuild-test); SECURITY DEFINER; EXECUTE anon false / authenticated false / service_role true;
`anon_execute_exposure()` returns exactly the 3 allowlisted functions.

### Final — the drift detector's view
`public.schema_fingerprint()` on production must equal the committed baseline
(`apps/web/lib/schema-fingerprint-baseline.json`, regenerated `aa015abd`): policies 458
`4c627cb4f3b361f4e9280067a2c154f2`, triggers 287 `4c7920f63724f4b0c054975e508c4e0a`, functions 333
`7497bfda26bce431bd9a2d7fdece1fe3`, constraints 1017 `710ff1e9e4ab072278e3eb671bddc26e`, latest
`20262020000000`; ledger_total 262.

## Item 7 — the three ruled fixes (branch `feature/s118-ruled-fixes`)

Pre-check (production, read-only), measured before §5: newest `20262020000000`; md5
`enforce_files_column_scope` `21bee5d9725b0a020158b64b8b9a8d7d`, `setup_payment_schedule`
`d606120d8ec0cd8975009eca19749644`, `revise_sub_contract_schedule` `04e54d2db7a6815eef477350d6d5b8cc`
(all three = the files and rebuild-test before the change); `project_budget_amounts` policies 6 (2 UPDATE);
`#167` affected contracts **0** (live subcontracts 0). No section adds a constraint over existing rows.

### §5 — `20262030000000_s118_file_trash_floor`
After: ledger 1; md5 `enforce_files_column_scope` = `e333c3be04bde2b741ace17abc028c81` (= rebuild-test);
still SECURITY DEFINER; `files` policies unchanged.

### §6 — `20262040000000_s118_budget_amounts_direct_write_closed`
After: ledger 1; `project_budget_amounts` policies **4**, UPDATE **0**; both INSERT arms' WITH CHECK
contain `budgeted_amount = 0`; SELECT arms unchanged.

### §7 — `20262050000000_s118_payment_schedule_stage_label`
After: ledger 1; md5 `setup_payment_schedule` = `a60cf25a66e6e1adf561b73382e62cd8`,
`revise_sub_contract_schedule` = `4f7f172c1db77e4f7b911f99960fe4aa` (= rebuild-test); both SECURITY INVOKER.

### Final — fingerprint = committed baseline (`feature/s118-ruled-fixes`): policies 456
`67a3bcae0714563f1ee68a5e3be380fc`, triggers 287 `4c7920f6…`, functions 333 `9e6d0d6a34d8e589ba6f7ed99e72265b`,
constraints 1017 `710ff1e9…`, latest `20262050000000`; ledger 265.

## Item 16 — employee documents (branch `feature/s118-employee-documents`)

Pre-check (production, read-only) — FILL-16.4: table 0, bucket 0, objects 0, `files` matching `%employ%` 0,
`file_categories` matching 0, policies `employee_documents%` 0; newest `20262050000000`.

### §8 — `20262060000000_s118_employee_documents`
After: ledger 1; `public.employee_documents` exists, RLS on; table policies **4**
(`select_owner_admin`, `select_own`, `insert_owner_admin`, `update_owner_admin`; no DELETE); storage policies
**3** (`employee_documents_objects_select|insert|update`; no DELETE); bucket `employee-documents` exists,
`public = false`; md5 `enforce_employee_document_owner` = `5c382ae984e65d39408ab5964a3784f5`,
`set_employee_documents_updated_by` = `f8eaaeebfdf0752c0774d472ddddc742`; rows 0.
Final: fingerprint = committed baseline — policies 460 `1e17fe2f…`, triggers 290 `16c49e44…`, functions 335
`cf7bbdb0…`, constraints 1026 `5f3997d3…`, latest `20262060000000`; ledger 266.

## Item 12 — daily log close-out (branch `feature/s118-daily-log-closeout`)

⚠️ Order: phase 1 (every `daily_logs -> company_members` embed names its FK) must be LIVE on production
(merged to main and deployed by Vercel) BEFORE this migration, because its second FK makes a bare embed
PGRST201.

Pre-check (production, read-only, measured): ledger 266, newest `20262060000000`; `daily_logs` columns 21;
`enforce_daily_logs_column_scope` md5 `ba211f64…`; `daily_log_material_needs` absent; functions
`mark_daily_log_reviewed` / `set_daily_log_material_ordered` 0; `daily_logs` rows 0. Every new column is
nullable with no CHECK over existing rows.

### §9 — `20262070000000_s118_daily_log_closeout`
After: ledger 267; `daily_logs` columns **38** (+17); `public.daily_log_material_needs` exists, RLS on,
policies **3** (`…_select_visible`, `…_insert_authorized`, `…_update_authorized`; no DELETE); md5
`enforce_daily_logs_column_scope` = `ca0ef1a958de20e6a5880fcf15bb1383`, `mark_daily_log_reviewed` =
`d2843d267e474b87ef9ab58951b3f351`, `set_daily_log_material_needs_updated_by` =
`f8eaaeebfdf0752c0774d472ddddc742`, `enforce_daily_log_material_needs_column_scope` =
`7d3ca70959aa944fc2ed68774c4d3c25`, `set_daily_log_material_ordered` = `510583d8f74880a9b06a8f120e35c2b9`
(file-derived; all five equal rebuild-test's measured values); rows 0.
Final: fingerprint = committed baseline — policies 463 `b4e86072…`, triggers 293 `530741c6…`, functions 339
`c643725b…`, constraints 1035 `f0445bd7…`, latest `20262070000000`.

## Item 11 — material sign-out (branch `feature/s118-material-signout`)

Pre-check (production, read-only, measured): ledger must read 267, newest `20262070000000` (item 12 first);
companies **2**; `file_categories` key `material_signout` **0**; `material_signouts` and
`material_signout_photos` absent; `seed_file_categories` md5 `d190b5b7d0d5e59873094129c107a4c9`. The only
write to existing data is the additive category backfill (`INSERT … ON CONFLICT DO NOTHING`, one row per
company); no constraint over existing rows.

### §10 — `20262080000000_s118_material_signouts`
After: ledger 268; both tables exist, RLS on; policies **2 + 2** (`material_signouts_select_staff` r,
`material_signouts_insert_staff` a; `material_signout_photos_select_staff` r,
`material_signout_photos_insert_staff` a; NO update/delete on either); `file_categories` key
`material_signout` = **2** (= companies); md5 `record_material_signout_receipt` =
`b9dff991bfedf6715da5c210effe4a03`, `close_material_signout` = `3e961632098ae2ccc19bd80a5fae4f84`,
`seed_file_categories` = `e2d89996459ada902eefe3bab8a3e356`, `set_material_signouts_updated_by` and
`set_material_signout_photos_updated_by` = `f8eaaeebfdf0752c0774d472ddddc742` (file-derived; all five equal
rebuild-test's measured values); anon EXECUTE on the two new functions **0**; rows 0 / 0.
Final: fingerprint = committed baseline — policies 467 `6ecc8ac3…`, triggers 297 `8e6055f8…`, functions 343
`85f3a10a…`, constraints 1064 `743aaef5…`, latest `20262080000000`.
