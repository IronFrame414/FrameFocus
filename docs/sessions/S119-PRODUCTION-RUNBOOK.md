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
