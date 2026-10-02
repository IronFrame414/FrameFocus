# S122 — originals of database objects a sabotage DROPS or REPLACES

[Josh, 2026-10-02] Before any sabotage that drops or replaces a database object (not a file edit), its captured
original is committed and pushed here, **in its own commit, before the drop runs**. If the Codespace dies between
the drop and the restore, this folder is how the next session knows what the object was and how to put it back.
Files stay here afterwards; they are the written record of the original.

## `public.client_schedule(uuid)` — rebuild-test `nmyphyhmfttxkdoposvf`, captured 2026-10-02 (S122 Part 7)

- `client_schedule.original.sql`: `pg_get_functiondef` as captured (from `20261019000000_m9_client_read_arms.sql`).
- `client_schedule.comment.txt`: its COMMENT.
- `client_schedule.baseline.json`: md5 of the definition, the ACL text, md5 of the comment, the result type, secdef, volatility.
- `client_schedule.baseline-query.sql`: the read-only query that produced them. Re-run it after a restore; every value must match.
- `client_schedule.sabotage.sql`: DROP + CREATE with ONE added column (`duration_days`), for the CP-off regression control
  (`apps/web/test/s122-cp-client-schedule-regression.live.ts`). It must go red.
- **`client_schedule.RESTORE.sql`**: DROP + CREATE from the original + COMMENT + the 11 grants a re-created function does NOT get from default privileges (found on the first restore: ACL 4 grantees vs 15), in one transaction. Run it **as `postgres`** (the owner and
  every grantor; `npx supabase db query --linked -f …` runs as `postgres`), so the ACL comes back identical.

**If you find `client_schedule` missing or carrying `duration_days` on rebuild-test:** run `client_schedule.RESTORE.sql`, then
`client_schedule.baseline-query.sql`, and compare against `client_schedule.baseline.json`.

## `public.client_critical_path(uuid)` — rebuild-test, captured 2026-10-02 (S122 Part 7, migration 20262130000000)

Same files, same use. Its sabotages (`sabotage-L` = the link check removed, `sabotage-C` = the Critical Path gate removed) are
`CREATE OR REPLACE` with the SAME return type, so the ACL and the comment survive; `RESTORE.sql` re-applies the captured definition.
The migration file itself is also the original. **If found without `is_client_of_project` or `critical_path_enabled = true` in its body:**
run `client_critical_path.RESTORE.sql`, then the baseline query, and compare.
