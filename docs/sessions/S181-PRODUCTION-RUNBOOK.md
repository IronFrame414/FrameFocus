# S181: the Project Executive migrations → production

**Five migrations, applied one at a time, in this order.** Each section below applies exactly one
of them and proves by object that it landed, before the next begins. Applying them is Josh's
action. The branch `feature/s111-project-role` does not merge until all five are verified here.

| # | migration | what it does | touches existing rows? |
| --- | --- | --- | --- |
| 1 | `20261820000000_s111_project_executive_role` | the role exists (both role CHECKs widened), timesheet rank, Owner-only grant (3 policies) | **no**, a widening |
| 2 | `20261830000000_s111_project_executive_floor_reads` | PE money READ arms on its projects (13 policies, 7 functions), plus `record_client_payment` for Q9 | no |
| 3 | `20261910000000_s111_project_executive_write_arms` | PE money WRITE arms (17 policies), and 3 trigger bodies gain one PE clause (invoice void, invoice approve, CO void). **No contract authority** (S181 Q2). | no |
| 4 | `20261920000000_s181_pe_expense_and_money_file_reads` | PE READ of its projects' expenses, allocations, expense payments, invoice/CO PDFs (4 policies, 1 function) | no |
| 5 | `20261930000000_s181_pe_lien_releases` | PE lien releases on its projects, both directions; read-only templates; release PDFs (7 policies + 1 storage policy, 3 functions) | no |

**Row counts:** none of the five adds a constraint that governs an existing row. #1 *replaces* the
two role CHECKs with supersets, so every existing row still passes. The Step 0 query counts them anyway.

**Effect on today's users (Josh and three staff):** none. Every new policy is either a permissive
arm that is true only for `role = 'project_executive'`, or an existing list with that role added.
The replaced trigger bodies are the current ones plus one clause that is true only for that role.
Step 0 proves the current bodies are the ones this was written against.

All commands run in the Codespace **terminal** (View → Terminal). All SQL runs in the Supabase
dashboard → **production** project (`jwkcknyuyvcwcdeskrmz`, **not** `framefocus-rebuild-test`) →
**SQL Editor** → **+ New query** → paste → **Run**.

---

## Step 0: read-only pre-check on PRODUCTION (SQL Editor)

```sql
SELECT
  (SELECT count(*) FROM profiles WHERE role = 'project_executive')                        AS pe_profiles_now,
  (SELECT max(version) FROM supabase_migrations.schema_migrations)                        AS newest_migration,
  (SELECT string_agg(version, ',' ORDER BY version) FROM supabase_migrations.schema_migrations
    WHERE version IN ('20261820000000','20261830000000','20261910000000','20261920000000','20261930000000')) AS already_recorded,
  (SELECT pg_get_constraintdef(oid) LIKE '%project_executive%' FROM pg_constraint WHERE conname = 'profiles_role_check') AS role_check_has_pe,
  (SELECT md5(prosrc) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = 'time_role_rank')                    AS md5_time_role_rank,
  (SELECT md5(prosrc) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = 'record_client_payment')             AS md5_record_client_payment,
  (SELECT md5(prosrc) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = 'enforce_invoice_void_authority')    AS md5_invoice_void,
  (SELECT md5(prosrc) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = 'enforce_invoices_column_scope')     AS md5_invoice_scope,
  (SELECT md5(prosrc) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = 'enforce_change_order_void_authority') AS md5_co_void,
  (SELECT string_agg(role || '=' || n, ' ' ORDER BY role) FROM (SELECT role, count(*) n FROM profiles GROUP BY role) p)       AS profiles_by_role,
  (SELECT string_agg(role || '=' || n, ' ' ORDER BY role) FROM (SELECT role, count(*) n FROM invitations GROUP BY role) i)    AS invitations_by_role;
```

**Expected:**

| column | expected | if not |
| --- | --- | --- |
| `pe_profiles_now` | **0** | ⚠️ **STOP.** Someone already holds the role on production; hiding it from the pickers is no longer the whole answer [S181 Q3]. |
| `newest_migration` | `20261880000000` | STOP and send me the row. |
| `already_recorded` | empty (NULL) | Some are already applied: skip their sections below. Send me the row first. |
| `role_check_has_pe` | `false` (or `true` if #1 is already recorded) | STOP |
| `md5_time_role_rank` | `b5a19b8363dc23d257470fb6f5e1b047` | STOP |
| `md5_record_client_payment` | `94da59462b5d7d66e36531d85abf53dd` | STOP |
| `md5_invoice_void` | `29b35ed5727d17c9bb0d1ee33634ee30` | STOP |
| `md5_invoice_scope` | `e7d1b870f0a9e6319b36b6d35a615e8a` | STOP |
| `md5_co_void` | `56bfb56299e35fce3040b9d9fb4fb65a` | STOP |
| `profiles_by_role`, `invitations_by_role` | every role one of owner, admin, project_manager, foreman, crew_member, client, subcontractor (invitations: no owner) | STOP |

The five hashes are the bodies these migrations were written against, computed from the migration
files. The method was checked on rebuild-test: its post-migration bodies hash to exactly the values the
files predict. A different hash means production's function is not what `main` says it is, and
replacing it could silently undo something.

## Step 1: get the branch and hold back all but the first migration

```bash
cd /workspaces/FrameFocus
```
```bash
git fetch origin && git checkout feature/s111-project-role && git pull --ff-only && git status --short
```
- Expected: `Switched to branch 'feature/s111-project-role'` (or `Already on`), and **no** lines from
  `git status --short`. Any line → STOP.

```bash
mkdir -p /tmp/s181-hold && mv supabase/migrations/20261830000000_s111_project_executive_floor_reads.sql supabase/migrations/20261910000000_s111_project_executive_write_arms.sql supabase/migrations/20261920000000_s181_pe_expense_and_money_file_reads.sql supabase/migrations/20261930000000_s181_pe_lien_releases.sql /tmp/s181-hold/ && ls /tmp/s181-hold
```
- Expected: the four file names.

## Step 2: point the CLI at PRODUCTION

```bash
npx supabase link --project-ref jwkcknyuyvcwcdeskrmz
```
```bash
cat supabase/.temp/project-ref
```
- **Expected: `jwkcknyuyvcwcdeskrmz`.** Anything else → STOP, then Step 9.

---

## Section 1: `20261820000000`, the role exists

```bash
npx supabase db push --dry-run --include-all
```
- **Expected:** `Would push these migrations:` then **exactly one** line:
  `20261820000000_s111_project_executive_role.sql`. More, fewer or different → STOP, then Step 9.
  `Remote migration versions not found in local migrations directory` → STOP, then Step 9. Do
  **not** run the `migration repair` it suggests.

```bash
npx supabase db push --include-all
```
- Type **`Y`**. Expected: `Applying migration 20261820000000_s111_project_executive_role.sql...` then
  `Finished supabase db push.` Any error → STOP, then Step 9 (one transaction: nothing half-applied).

**Verify by object (SQL Editor):**
```sql
SELECT
  (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20261820000000') AS ledger_row,
  (SELECT pg_get_constraintdef(oid) LIKE '%project_executive%' FROM pg_constraint WHERE conname = 'profiles_role_check')    AS profiles_check_has_pe,
  (SELECT pg_get_constraintdef(oid) LIKE '%project_executive%' FROM pg_constraint WHERE conname = 'invitations_role_check') AS invitations_check_has_pe,
  (SELECT md5(prosrc) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = 'time_role_rank')              AS md5_time_role_rank,
  (SELECT count(*) FROM pg_policies WHERE policyname IN ('profiles_update_admin','invitations_insert_owner_admin','invitations_update_owner_admin')
     AND coalesce(qual,'') || coalesce(with_check,'') LIKE '%project_executive%')                                             AS grant_policies_with_pe;
```
- **Expected:** `ledger_row 1`, `true`, `true`, `md5_time_role_rank 8ae4c32dcb2ab329a372f65cead8428f`,
  `grant_policies_with_pe 3`.

Then release the next file:
```bash
mv /tmp/s181-hold/20261830000000_s111_project_executive_floor_reads.sql supabase/migrations/
```

## Section 2: `20261830000000`, money READ arms

Dry run as above. **Expected exactly one line:** `20261830000000_s111_project_executive_floor_reads.sql`.
Then push as above (`Y`, one `Applying migration …`, `Finished`).

**Verify:**
```sql
SELECT
  (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20261830000000') AS ledger_row,
  (SELECT count(*) FROM pg_policies WHERE policyname LIKE '%\_project\_executive' AND cmd = 'SELECT') AS pe_read_arms,
  (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname LIKE 'pe\_%') AS pe_functions,
  (SELECT md5(prosrc) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = 'record_client_payment') AS md5_record_client_payment,
  (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname LIKE 'pe\_%'
     AND has_function_privilege('anon', oid, 'EXECUTE')) AS pe_functions_anon_can_run;
```
- **Expected:** `ledger_row 1`, `pe_read_arms 13`, `pe_functions 7`,
  `md5_record_client_payment 6470d73297bd802a45533c91c7bd0cb0`, `pe_functions_anon_can_run 0`.

```bash
mv /tmp/s181-hold/20261910000000_s111_project_executive_write_arms.sql supabase/migrations/
```

## Section 3: `20261910000000`, money WRITE arms

Dry run → **exactly one line:** `20261910000000_s111_project_executive_write_arms.sql`. Push.

**Verify:**
```sql
SELECT
  (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20261910000000') AS ledger_row,
  (SELECT count(*) FROM pg_policies WHERE policyname LIKE '%\_project\_executive' AND cmd <> 'SELECT') AS pe_write_arms,
  (SELECT md5(prosrc) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = 'enforce_invoice_void_authority')      AS md5_invoice_void,
  (SELECT md5(prosrc) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = 'enforce_invoices_column_scope')       AS md5_invoice_scope,
  (SELECT md5(prosrc) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = 'enforce_change_order_void_authority') AS md5_co_void,
  (SELECT prosrc LIKE '%pe_on_project%' FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = 'enforce_contract_void_authority') AS contract_void_has_pe,
  (SELECT pg_get_expr(polwithcheck, polrelid) LIKE '%project_executive%' FROM pg_policy WHERE polname = 'invoices_insert_authorized') AS invoice_insert_has_pe;
```
- **Expected:** `ledger_row 1`, `pe_write_arms 17`,
  `md5_invoice_void fe21eb3dcf35798edf62d2afa819c3be`, `md5_invoice_scope d60f60fc9bd3fc9edd4f7bcb320d83aa`,
  `md5_co_void 0bd45f0f8b3c2b377b68380af501ed74`, **`contract_void_has_pe false`** (S181 Q2: no
  contract authority), `invoice_insert_has_pe true`. The three hashes were measured identically on rebuild-test.

```bash
mv /tmp/s181-hold/20261920000000_s181_pe_expense_and_money_file_reads.sql supabase/migrations/
```

## Section 4: `20261920000000`, expense and money-file READS

Dry run → **exactly one line:** `20261920000000_s181_pe_expense_and_money_file_reads.sql`. Push.

**Verify:**
```sql
SELECT
  (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20261920000000') AS ledger_row,
  (SELECT count(*) FROM pg_policies WHERE policyname IN ('expenses_select_project_executive','expense_allocations_select_project_executive',
     'expense_payments_select_project_executive','files_select_project_executive_money') AND cmd = 'SELECT') AS arms,
  (SELECT has_function_privilege('anon', 'public.pe_on_expense(uuid)', 'EXECUTE')) AS anon_can_run;
```
- **Expected:** `ledger_row 1`, `arms 4`, `anon_can_run false`.

```bash
mv /tmp/s181-hold/20261930000000_s181_pe_lien_releases.sql supabase/migrations/ && ls /tmp/s181-hold | wc -l
```
- Expected: `0`.

## Section 5: `20261930000000`, lien releases

Dry run → **exactly one line:** `20261930000000_s181_pe_lien_releases.sql`. Push.

**Verify:**
```sql
SELECT
  (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20261930000000') AS ledger_row,
  (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND policyname IN ('lien_releases_select_project_executive',
     'lien_releases_insert_project_executive','lien_releases_update_project_executive','lien_release_templates_select_project_executive',
     'lien_release_template_boxes_select_project_executive','files_select_project_executive_lien','files_insert_project_executive_lien')) AS public_arms,
  (SELECT count(*) FROM pg_policies WHERE schemaname = 'storage' AND policyname = 'project_files_insert_project_executive_lien') AS storage_arm,
  (SELECT count(*) FROM pg_policies WHERE tablename LIKE 'lien_release%' AND policyname LIKE '%project_executive' AND cmd IN ('DELETE','ALL')) AS delete_arms,
  (SELECT count(*) FROM pg_policies WHERE tablename LIKE 'lien_release_template%' AND policyname LIKE '%project_executive' AND cmd <> 'SELECT') AS template_write_arms,
  (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace
     AND proname IN ('pe_on_lien_subject','pe_can_see_lien_file','pe_can_attach_lien_release')
     AND has_function_privilege('anon', oid, 'EXECUTE')) AS anon_can_run;
```
- **Expected:** `ledger_row 1`, `public_arms 7`, `storage_arm 1`, **`delete_arms 0`**,
  **`template_write_arms 0`** (Q6: read only), `anon_can_run 0`.

---

## Step 9: point the CLI back at REBUILD-TEST (always, even after a STOP)

```bash
npx supabase link --project-ref nmyphyhmfttxkdoposvf && cat supabase/.temp/project-ref
```
- **Expected: `nmyphyhmfttxkdoposvf`.**

If you stopped part-way, put the held files back so the branch is whole again:
```bash
mv /tmp/s181-hold/*.sql supabase/migrations/ 2>/dev/null; git status --short
```
- Expected: **no** lines.

## Then

Send me the five verification rows. The branch merges only when all of these hold (RULED merge
authority): CI green on the branch rebased onto current `main`; every agreed check passed with
its number; **all five verified here**.

⚠️ **The drift detector:** production gains the objects above, so the daily fingerprint check will
report them against a baseline that is itself built from a shared rebuild-test (`#1-s112f`).
That's the known cause, not new drift.
