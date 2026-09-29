# S115 — one migration → production (Josh's action)

**One migration, one section.** Applying it is **Josh's action** (no override this session). `feature/s115-r10-budget-edit`
does not merge until this section is verified. Everything else S115 built carries **no** migration.

| § | migration | branch | what it does | touches existing rows? |
| --- | --- | --- | --- | --- |
| 1 | `20262020000000_s115_r10_original_budget_edit` | `feature/s115-r10-budget-edit` | R10: original budget lines editable (Owner/Admin/PE) until the first invoice is issued, through two SECURITY DEFINER functions | **no rewrite, no constraint** — one NULLABLE column with a constant default (`added_to_original_budget boolean DEFAULT false`); existing rows read `false`. No CHECK, no NOT NULL, no policy change. |

**No constraint governs an existing row**, so there is no production count to take first.

**Effect on today's users:** none until someone opens a project's Budget & Cost as Owner/Admin/PE on a project with
no issued invoice — they then see "+ Add line to original budget" and an "Edit" link on original lines. A PM sees
nothing new (ASK-R10-PM). Change-order and ad-hoc lines are unchanged.

All commands: Codespace **terminal**. All SQL: Supabase dashboard → **production** (`jwkcknyuyvcwcdeskrmz`, **not**
rebuild-test) → SQL Editor → New query → Run.

⚠️ **Never `migration repair --status reverted`.** Production legitimately lacks `20261850000000`, `20261860000000`,
`20261890000000`, `20261900000000` (PART E, unmerged branches). That is why the push uses `--include-all`.

## Step 0 — read-only pre-check on PRODUCTION (SQL Editor)

```sql
SELECT
  (SELECT max(version) FROM supabase_migrations.schema_migrations)                                          AS newest_migration,
  (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version='20262020000000')               AS r10_ledger_rows,
  (SELECT count(*) FROM information_schema.columns WHERE table_schema='public'
     AND table_name='project_budget_items' AND column_name='added_to_original_budget')                     AS column_exists,
  (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN
     ('project_has_issued_invoice','can_edit_original_budget','add_original_budget_line','update_original_budget_line')) AS fn_count,
  (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='project_budget_items')        AS pbi_policies;
```
| column | expected | if not |
| --- | --- | --- |
| `newest_migration` | `20262010000000` | STOP, send me the row |
| `r10_ledger_rows` | `0` | STOP (already applied) |
| `column_exists` | `0` | STOP |
| `fn_count` | `0` | STOP |
| `pbi_policies` | `2` | STOP (S97's pinned set changed) |

## Step 1 — branch and link

```bash
cd /workspaces/FrameFocus && git fetch origin && git checkout feature/s115-r10-budget-edit && git pull --ff-only && git status --short
```
Expected: nothing under `supabase/` (untracked `RUNBOOK.md` / `S114-C-questions.md` at the root are fine).
```bash
cat supabase/.temp/project-ref                   # expect nmyphyhmfttxkdoposvf (rebuild-test)
npx supabase link --project-ref jwkcknyuyvcwcdeskrmz
cat supabase/.temp/project-ref                   # expect jwkcknyuyvcwcdeskrmz — anything else: STOP, then "Always last"
```

## §1 — `20262020000000`

```bash
npx supabase db push --dry-run --include-all     # EXACTLY one line: 20262020000000_s115_r10_original_budget_edit.sql
npx supabase db push --include-all               # type Y — "Applying migration 20262020000000_…" then "Finished supabase db push."
```
Verify (production SQL Editor):
```sql
SELECT
  (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version='20262020000000') AS ledger_row,
  (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='project_budget_items'
     AND column_name='added_to_original_budget' AND is_nullable='YES' AND column_default='false')   AS column_ok,
  (SELECT count(*) FROM project_budget_items WHERE added_to_original_budget IS DISTINCT FROM false)  AS rows_not_false,
  (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='project_budget_items')  AS pbi_policies,
  (SELECT md5(prosrc) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='project_has_issued_invoice')  AS md5_issued,
  (SELECT md5(prosrc) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='can_edit_original_budget')    AS md5_can_edit,
  (SELECT md5(prosrc) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='add_original_budget_line')    AS md5_add,
  (SELECT md5(prosrc) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='update_original_budget_line') AS md5_update,
  (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND prosecdef AND proname IN
     ('project_has_issued_invoice','can_edit_original_budget','add_original_budget_line','update_original_budget_line')) AS secdef_count,
  has_function_privilege('anon','public.add_original_budget_line(uuid,text,numeric,text)','EXECUTE')            AS anon_add,
  has_function_privilege('anon','public.update_original_budget_line(uuid,text,numeric,text)','EXECUTE')         AS anon_update,
  has_function_privilege('authenticated','public.update_original_budget_line(uuid,text,numeric,text)','EXECUTE') AS auth_update;
```
Expected — every value measured on rebuild-test after the same migration:

| column | expected |
| --- | --- |
| `ledger_row` | `1` |
| `column_ok` | `1` |
| `rows_not_false` | `0` |
| `pbi_policies` | `2` (unchanged — no policy added) |
| `md5_issued` | `cd98c2cc21842a38c0ef735c7cf71259` |
| `md5_can_edit` | `cde4b4660b237e93d816e3d2f035c28f` |
| `md5_add` | `675545c2c6b0699377e4ee3884859095` |
| `md5_update` | `037907723a7e53e99b54e7bca180cd82` |
| `secdef_count` | `4` |
| `anon_add` / `anon_update` | `false` / `false` |
| `auth_update` | `true` |

## Always last — relink to rebuild-test

```bash
npx supabase link --project-ref nmyphyhmfttxkdoposvf
cat supabase/.temp/project-ref                   # expect nmyphyhmfttxkdoposvf
```
Then tell CC "R10 applied" with the verify row; CC merges under R8 once the branch's CI is green on current main.
