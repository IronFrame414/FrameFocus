# S119 — production runbook (CC applies, under S119's authorisation)

One migration per section. Each: `section.sh` (link production → read back the ref → dry run must list
**exactly one file**, else exit 3 and nothing is pushed → push `--include-all` → ALWAYS relink rebuild-test
`nmyphyhmfttxkdoposvf` and read it back). Then verification by object, every expected value stated.
⚠️ A mismatch is a **stop**. Never `migration repair --status reverted`.

Expected function md5s are `md5` of the text between the dollar quotes in the migration FILE
(`scratchpad/fnmd5.cjs`). Control: the same script reproduces production's current
`selection_option_images` body from `20261028000000` (`ea83f07bc5cab6c42fc200676f97bc95`) — measured.

Stack: `feature/s119-material-signout` (item 11) on `feature/s119-profile-insert-floor` (Item A).

## Item A — pre-check (production, read-only) — measured 2026-09-29
| value | expected | measured |
| --- | --- | --- |
| ledger / newest | 267 / `20262070000000` | 267 / `20262070000000` |
| policies on `profiles` + `companies` | 9 | 9 |
| `profiles` INSERT policies | 1 (`with_check = true`) | 1, `true` |
| `companies_insert_unaffiliated` check | `(get_my_company_id() IS NULL)` | same |
| md5 `selection_option_images` | `ea83f07bc5cab6c42fc200676f97bc95` | same |
| auth users / without a profile | — / 0 | 9 / 0 |
| `selection_options` rows | 0 | 0 |
| `profiles` table comment | NULL (nothing overwritten) | NULL |
No section adds a constraint over existing rows.

### §A1 — `20262075000000_s119_profile_insert_floor`
After: ledger 268 (row `20262075000000` present); policies on `profiles`+`companies` **7**; `profiles`
INSERT policies **0**; `companies` INSERT policies **0**; `profiles_insert_authenticated` absent;
`companies_insert_unaffiliated` absent; `profiles` comment starts `One per auth user. [S119 A-1]`;
auth users without a profile still 0.

### §A2 — `20262076000000_s119_selection_images_scope`
After: ledger 269 (row `20262076000000` present); md5 `selection_option_images` =
**`6e8d61aaa98d9482c203f2f2c1cfcf99`** (= rebuild-test measured); SECURITY DEFINER true; EXECUTE anon
**false**, authenticated **true**.

## Item B — item 11 (runbook §10 from S118, re-measured before running)
### §B — `20262080000000_s118_material_signouts`
Pre-check and expected values: S118 runbook §10 (on `feature/s118-report`), with the ledger now **269**
before and **270** after (A1 + A2 first). Every other value unchanged; re-measured at run time.

## Final — fingerprint
Production `schema_fingerprint()` must equal the baseline committed on the stacked head (regenerated
from rebuild-test once its ledger equals the tree).

## Items C + D — stack `feature/s119-pe-estimate-assignment` (D) on `feature/s119-project-rename` (C)

### Pre-check (production, read-only) — measured 2026-09-29 ~22:20Z
| value | expected | measured |
| --- | --- | --- |
| ledger / newest | 270 / `20262080000000` | 270 / `20262080000000` |
| md5 `enforce_projects_column_scope` | `676653634b10a3568784e659dbf9c0db` (the base C rebuilds) | same |
| `project_name_history` / `estimate_assignments` | absent / absent | absent / absent |
| md5 `set_line_override_cost` / `set_winning_bid` / `switch_pricing_mode` | `faa7b771…` / `241d6e77…` / `e4ab430a…` (the bodies D edits) | same |
| estimates / live PEs | — | 15 / 1 |
Neither migration adds a constraint over existing rows (C's blank-name check binds CHANGES only; D is a new table).

### §C — `20262090000000_s118_project_rename`
After: ledger 271; `public.project_name_history` exists, RLS on, policies **1** (`project_name_history_select_owner_admin`, SELECT); trigger `projects_log_rename` on `projects`; md5 `enforce_projects_column_scope` = `a344ba290242bf8b1a58dee822b1f1cf`, `log_project_rename` = `be6e2de168996fcac61ec3f59228330b`, `project_name_at` = `3010d88561b4bc2e69eeadc746e8a776`; `project_name_at` EXECUTE anon false / authenticated true; rows 0.

### §D — `20262100000000_s119_pe_estimate_assignment`
After: ledger 272; `public.estimate_assignments` exists, RLS on, policies **4** (select owner_admin, select project_executive, insert owner_admin, update owner_admin; no DELETE); PE policies on estimate tables **20** (`estimates` 3 + 17 child); trigger `estimates_assign_creating_pe` on `estimates`; md5 `set_estimate_assignments_updated_by` = `f8eaaeeb…`, `enforce_estimate_assignment_shape` = `6e6c88bec50264b54927f75777f802fa`, `pe_assigned_estimate` = `365744ae5825628ff550aba72bbd33da`, `assign_creating_pe_to_estimate` = `e017531defafa8e7c64e5b8f71bf658b`, `set_line_override_cost` = `db985566cefd38b025555d9f41daa4d2`, `set_winning_bid` = `8996d7ef696b3358a37680e8f3ec4636`, `switch_pricing_mode` = `d2a324a251c77a00c0770b36f6810a36` (all file-derived = rebuild-test); `pe_assigned_estimate` EXECUTE anon false / authenticated true; rows 0; PM-naming policies on the estimate side unchanged (31, same md5 set as before §D).

### Final — fingerprint = committed baseline on the stacked head: policies 490 `1c0ca77c…`, triggers 302 `2fcd222a…`, functions 349 `985d5448…`, constraints 1074 `c32e668a…`, latest `20262100000000`.
