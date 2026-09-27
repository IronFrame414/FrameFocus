# S112 R5b: apply `20261840000000` to production

**What it does:** it adds ONE function, `get_approved_change_order_summaries()`, and changes no row
and no existing object. Every staff role can then see the number, title, description and date of a
**signed** change order, and no money column. RULED [Josh, S112 follow-up]: ship title +
description + date.

**Branch:** `feature/s112-wave2-integration`. That's co-summary (with audit-rulings R3–R6 inside) plus
the title/description no-price hint plus amber-sweep Q5, on top of main `80e15bad`.

⚠️ **This migration is OLDER than production's newest (`20261880000000`).** A plain `db push`
refuses it, so every push command below carries `--include-all`. **The dry run in Step 6 is what
proves only this one file would be applied.**

All steps run in the Codespace **terminal** (View → Terminal).

---

### Step 1: read-only pre-check on PRODUCTION (SQL Editor)
Supabase dashboard → open the **production** project (**not** `framefocus-rebuild-test`) →
**SQL Editor** → **+ New query** → paste → **Run**:
```sql
SELECT
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_approved_change_order_summaries') AS function_exists,
  (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20261840000000') AS already_recorded,
  (SELECT max(version) FROM supabase_migrations.schema_migrations)                               AS newest_migration,
  (SELECT count(*) FROM pg_proc q JOIN pg_namespace m ON m.oid = q.pronamespace
    WHERE m.nspname = 'public' AND has_function_privilege('anon', q.oid, 'EXECUTE'))            AS anon_can_execute_total;
```
- **Expected:** `function_exists 0`, `already_recorded 0`, `newest_migration 20261880000000`,
  `anon_can_execute_total 3`.
- **Any other value → STOP** and send it to me.

### Step 2: go to the repo folder
```bash
cd /workspaces/FrameFocus
```

### Step 3: check out the branch that holds the migration
```bash
git fetch origin && git checkout feature/s112-wave2-integration && git pull --ff-only
```
- Expected: `Switched to branch 'feature/s112-wave2-integration'`, and no error.

### Step 4: confirm the migration files
```bash
ls supabase/migrations | tail -3
```
- **Expected, in this order:** `20261840000000_s112_approved_change_order_summaries.sql`,
  `20261870000000_s112_anon_function_lockdown.sql`,
  `20261880000000_s112_privileged_function_caller_checks.sql`. Anything else → **STOP**.

### Step 5: point the CLI at PRODUCTION
```bash
npx supabase link --project-ref jwkcknyuyvcwcdeskrmz
```
- Expected: `Finished supabase link.`
- If it asks for a database password, it wants **production's** (Supabase dashboard → production →
  Project Settings → Database).

Then confirm where it points:
```bash
cat supabase/.temp/project-ref
```
- **Expected: `jwkcknyuyvcwcdeskrmz`.** Anything else → **STOP**.

### Step 6: DRY RUN (writes nothing)
```bash
npx supabase db push --dry-run --include-all
```
- **Expected:** `Would push these migrations:` followed by **exactly one** line:
  `20261840000000_s112_approved_change_order_summaries.sql`.
- **More than one, or a different file → STOP**, then do Step 9.
- `Remote migration versions not found in local migrations directory` → **STOP**, then do Step 9.
  Do **NOT** run the `migration repair` command it suggests.

### Step 7: PUSH (the one production write)
```bash
npx supabase db push --include-all
```
- It lists the same single file and asks `Do you want to push these migrations to the remote
  database?`. Type **`Y`** and press Enter.
- **Expected:** one `Applying migration 20261840000000_s112_approved_change_order_summaries.sql...`,
  then `Finished supabase db push.`
- **Any error → STOP**, then do Step 9. The file runs in one transaction, so a failure leaves
  nothing half-applied.

### Step 8: VERIFY BY OBJECT on production (SQL Editor, as in Step 1)
```sql
SELECT p.proname,
       pg_get_function_identity_arguments(p.oid)                        AS args,
       p.prosecdef                                                       AS security_definer,
       has_function_privilege('anon', p.oid, 'EXECUTE')                  AS anon_can_run,
       has_function_privilege('authenticated', p.oid, 'EXECUTE')         AS staff_can_run,
       pg_get_functiondef(p.oid) ~* 'net_delta|markup_percent|tax_rate'  AS mentions_money_column,
       (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20261840000000') AS ledger_row,
       (SELECT count(*) FROM pg_proc q JOIN pg_namespace m ON m.oid = q.pronamespace
         WHERE m.nspname = 'public' AND has_function_privilege('anon', q.oid, 'EXECUTE')) AS anon_can_execute_total
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'get_approved_change_order_summaries';
```
- **Expected: exactly ONE row:**

  | column | expected |
  | --- | --- |
  | `args` | `p_project_id uuid` |
  | `security_definer` | `true` |
  | `anon_can_run` | **`false`** |
  | `staff_can_run` | `true` |
  | `mentions_money_column` | **`false`** |
  | `ledger_row` | `1` |
  | `anon_can_execute_total` | **`3`**, still, since the lockdown must hold |

  Measured identically on rebuild-test. The money check is proven able to fire: it returns `true`
  on `apply_change_order_budget`.
- **Zero rows, `anon_can_run true`, `anon_can_execute_total` not 3, or `mentions_money_column true`
  → tell me before anything merges.**

### Step 9: point the CLI back at REBUILD-TEST (always, even after a STOP)
```bash
npx supabase link --project-ref nmyphyhmfttxkdoposvf
```
```bash
cat supabase/.temp/project-ref
```
- **Expected: `nmyphyhmfttxkdoposvf`.**

### Then
Tell me the Step 8 row. The merge happens only once both of these hold:

1. CI on `feature/s112-wave2-integration` is green;
2. Step 8 matches.

⚠️ **The drift detector:** this adds a function to production, so the daily fingerprint check will
show it on top of the lockdown difference already expected. That's the same known cause (#1-s112f),
not new drift.
