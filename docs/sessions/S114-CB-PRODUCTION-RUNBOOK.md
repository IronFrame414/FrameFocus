# S114 PARTS C and B — three migrations → production (Josh's action)

**Three migrations, one per section, in this order.** Each section applies exactly one file and proves
by object that it landed before the next begins. Applying them is **Josh's action** (no override this
session). C-branch 2 (`feature/s114-c-migration`) and PART B (`feature/s114-b-qb-exclusion`) do not merge
until their sections are verified here.

| § | migration | branch | what it does | touches existing rows? |
| --- | --- | --- | --- | --- |
| 1 | `20261990000000_s114_create_site_visit_name_or_company` | `feature/s114-c-migration` | `create_site_visit()`: a new contact needs first AND last name, OR a company; the company is stored | **no** (one function body) |
| 2 | `20262000000000_s114_pe_project_financials_write_drop` | `feature/s114-c-migration` | drops the Project Executive's INSERT/UPDATE arms on `project_financials` (its read stays) | **no** (two DROP POLICY) |
| 3 | `20262010000000_s114_qb_project_exclusion` | `feature/s114-b-qb-exclusion` | new table `project_qb_exclusions` (Owner-only), two resolver functions, entry gates in `qb_enqueue()` / `qb_enqueue_job_chain()` | **no** (new empty table; two function bodies) |

**No constraint governs an existing row** in any of the three (no `ADD CONSTRAINT`, `CHECK`, `NOT NULL` or
`ALTER COLUMN` on an existing table). The only `UNIQUE` is a partial index on the new, empty table.

**Effect on today's users:** §1 — site-visit contact entry accepts a company alone (after C-branch 2 merges,
the /m form offers the field). §2 — the Project Executive can no longer change its project's contract value;
no screen offers that today. §3 — nothing until the Owner excludes a project (the control ships with PART B);
QuickBooks is disconnected on both companies (P5), so no sync behaviour changes.

All commands: Codespace **terminal**. All SQL: Supabase dashboard → **production** (`jwkcknyuyvcwcdeskrmz`,
**not** rebuild-test) → SQL Editor → New query → Run.

⚠️ **Never `migration repair --status reverted`.** Production is legitimately missing four versions that live
on unmerged branches (`20261850000000`, `20261860000000`, `20261890000000`, `20261900000000`, PART E). That is
why every push below uses `--include-all`.

---

## Step 0 — read-only pre-check on PRODUCTION (SQL Editor), before linking anything

```sql
SELECT
  (SELECT max(version) FROM supabase_migrations.schema_migrations)                                   AS newest_migration,
  (SELECT count(*) FROM supabase_migrations.schema_migrations
     WHERE version IN ('20261990000000','20262000000000','20262010000000'))                          AS s114cb_ledger_rows,
  (SELECT md5(prosrc) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='create_site_visit')    AS md5_create_site_visit,
  (SELECT md5(prosrc) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='qb_enqueue')           AS md5_qb_enqueue,
  (SELECT md5(prosrc) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='qb_enqueue_job_chain') AS md5_job_chain,
  (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='project_financials')      AS pf_policies,
  (SELECT count(*) FROM pg_policies WHERE policyname LIKE '%\_project\_executive' AND cmd <> 'SELECT') AS pe_write_arms,
  (SELECT count(*) FROM pg_policies WHERE policyname LIKE '%\_project\_executive' AND cmd = 'SELECT')  AS pe_read_arms,
  (SELECT to_regclass('public.project_qb_exclusions') IS NOT NULL)                                     AS qbx_table_exists,
  (SELECT count(*) FROM companies WHERE qb_realm_id IS NOT NULL)                                       AS qb_linked_companies;
```

| column | expected | if not |
| --- | --- | --- |
| `newest_migration` | `20261980000000` | STOP, send me the row |
| `s114cb_ledger_rows` | `0` | STOP (something already applied) |
| `md5_create_site_visit` | `125d2667de7f5076786ee039a7052418` | STOP — the body §1 replaces is not the one it was written against |
| `md5_qb_enqueue` | `ea8985407cf3f014eb93fcf19c40ea55` | STOP |
| `md5_job_chain` | `96a7a3bdee7e09fd24b825626e953401` | STOP |
| `pf_policies` | `6` | STOP |
| `pe_write_arms` | `59` | STOP (PART A's verified value, `%\_project\_executive` ENDS-WITH) |
| `pe_read_arms` | `27` | STOP |
| `qbx_table_exists` | `false` | STOP |
| `qb_linked_companies` | `0` (P5) | not a stop — but tell me; §3 then changes live behaviour |

## Step 1 — C-branch 2, hold back §2, link to production

```bash
cd /workspaces/FrameFocus && git fetch origin && git checkout feature/s114-c-migration && git pull --ff-only && git status --short
```
Expected: no lines from `git status --short` (an untracked `S114-C-questions.md` at the root is fine). Anything
under `supabase/` → STOP.
```bash
export HOLD=/tmp/s114cb-hold && mkdir -p $HOLD && mv supabase/migrations/20262000000000_s114_pe_project_financials_write_drop.sql $HOLD/ && ls $HOLD
cat supabase/.temp/project-ref                   # expect nmyphyhmfttxkdoposvf (rebuild-test)
npx supabase link --project-ref jwkcknyuyvcwcdeskrmz
cat supabase/.temp/project-ref                   # expect jwkcknyuyvcwcdeskrmz — anything else: STOP, then "Always last"
```

## §1 — `20261990000000`, site-visit contact: name OR company

```bash
npx supabase db push --dry-run --include-all     # EXACTLY one line: 20261990000000_s114_create_site_visit_name_or_company.sql
npx supabase db push --include-all               # type Y — "Applying migration 20261990000000_…" then "Finished supabase db push."
```
Verify:
```sql
SELECT
  (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version='20261990000000')   AS ledger_row,
  (SELECT md5(prosrc) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='create_site_visit') AS md5_create_site_visit,
  has_function_privilege('anon','public.create_site_visit(text,uuid,uuid,jsonb,jsonb,timestamptz)','EXECUTE')          AS anon_can_run,
  has_function_privilege('authenticated','public.create_site_visit(text,uuid,uuid,jsonb,jsonb,timestamptz)','EXECUTE') AS authenticated_can_run;
```
Expected: `ledger_row 1`, `md5_create_site_visit ad38f7f8b84dc11996e362c4a6ca701d` (rebuild-test's, measured),
`anon_can_run false`, `authenticated_can_run true`.

Release §2: `mv $HOLD/20262000000000_s114_pe_project_financials_write_drop.sql supabase/migrations/`

## §2 — `20262000000000`, the PE stops writing `project_financials`

```bash
npx supabase db push --dry-run --include-all     # EXACTLY one line: 20262000000000_s114_pe_project_financials_write_drop.sql
npx supabase db push --include-all               # Y
```
Verify:
```sql
SELECT
  (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version='20262000000000')         AS ledger_row,
  (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='project_financials')     AS pf_policies,
  (SELECT string_agg(policyname, ',' ORDER BY policyname) FROM pg_policies
     WHERE schemaname='public' AND tablename='project_financials' AND policyname LIKE '%\_project\_executive') AS pf_pe_arms,
  (SELECT count(*) FROM pg_policies WHERE policyname LIKE '%\_project\_executive' AND cmd <> 'SELECT') AS pe_write_arms,
  (SELECT count(*) FROM pg_policies WHERE policyname LIKE '%\_project\_executive' AND cmd = 'SELECT')  AS pe_read_arms;
```
Expected: `ledger_row 1`, `pf_policies 4`, `pf_pe_arms project_financials_select_project_executive`,
`pe_write_arms 57` (59 − 2), `pe_read_arms 27` (unchanged).

## Step 2 — switch to PART B for §3

PART B's branch holds only its own migration, so §1–§2's two files are copied in, uncommitted, so the CLI
sees every version production now has (the S114 PART A precedent):
```bash
git checkout feature/s114-b-qb-exclusion && git pull --ff-only
git show origin/feature/s114-c-migration:supabase/migrations/20261990000000_s114_create_site_visit_name_or_company.sql > supabase/migrations/20261990000000_s114_create_site_visit_name_or_company.sql
git show origin/feature/s114-c-migration:supabase/migrations/20262000000000_s114_pe_project_financials_write_drop.sql > supabase/migrations/20262000000000_s114_pe_project_financials_write_drop.sql
git status --short supabase/                     # expect exactly those two as ??
cat supabase/.temp/project-ref                   # still jwkcknyuyvcwcdeskrmz
```

## §3 — `20262010000000`, exclude a project from QuickBooks

```bash
npx supabase db push --dry-run --include-all     # EXACTLY one line: 20262010000000_s114_qb_project_exclusion.sql
npx supabase db push --include-all               # Y
```
Verify:
```sql
SELECT
  (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version='20262010000000')                    AS ledger_row,
  (SELECT md5(prosrc) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='qb_enqueue')           AS md5_qb_enqueue,
  (SELECT md5(prosrc) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='qb_enqueue_job_chain') AS md5_job_chain,
  (SELECT relrowsecurity FROM pg_class WHERE oid='public.project_qb_exclusions'::regclass)                       AS qbx_rls,
  (SELECT string_agg(policyname||':'||cmd, ', ' ORDER BY policyname) FROM pg_policies
     WHERE schemaname='public' AND tablename='project_qb_exclusions')                                             AS qbx_policies,
  (SELECT count(*) FROM project_qb_exclusions)                                                                    AS qbx_rows,
  has_function_privilege('authenticated','public.qb_entity_excluded(text,uuid)','EXECUTE')                        AS auth_can_run_resolver,
  has_function_privilege('anon','public.qb_project_excluded(uuid)','EXECUTE')                                    AS anon_can_run_resolver,
  has_function_privilege('service_role','public.qb_entity_excluded(text,uuid)','EXECUTE')                        AS service_can_run_resolver;
```
Expected: `ledger_row 1`, `md5_qb_enqueue fa91dad71bd86d45268d8786de408d4e`, `md5_job_chain 165f64ca54888feb155f188c3b000e02`
(both rebuild-test's, measured), `qbx_rls true`,
`qbx_policies project_qb_exclusions_insert_owner:INSERT, project_qb_exclusions_select_owner_admin:SELECT, project_qb_exclusions_update_owner:UPDATE`,
`qbx_rows 0`, `auth_can_run_resolver false`, `anon_can_run_resolver false`, `service_can_run_resolver true`.

Final: `npx supabase db push --dry-run --include-all` → "Remote database is up to date."

## Always last — relink to rebuild-test (even after a STOP)

```bash
rm -f supabase/migrations/20261990000000_s114_create_site_visit_name_or_company.sql supabase/migrations/20262000000000_s114_pe_project_financials_write_drop.sql 2>/dev/null   # only on the PART B branch
mv $HOLD/*.sql supabase/migrations/ 2>/dev/null
git status --short supabase/migrations           # expect nothing
npx supabase link --project-ref nmyphyhmfttxkdoposvf
cat supabase/.temp/project-ref                   # expect nmyphyhmfttxkdoposvf
```
⚠️ On the PART B branch the `rm` removes the two copies; on `feature/s114-c-migration` those files are tracked —
run the `rm` only if you are on the PART B branch (`git branch --show-current`).

Send me the three verification rows (or the STOP row). Then C-branch 2 and PART B can be merged (R8: CI green on
current `main`, checks measured, migrations on production by object).
