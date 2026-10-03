# enforce_files_column_scope — the ORIGINAL before R-9 (ASK-R9 → A, Josh 2026-10-03)

This is the function as 4d left it (migration 20262134600000), captured 2026-10-03 from production
`jwkcknyuyvcwcdeskrmz` by `pg_get_functiondef`, before R-9's replace:
- production: md5 `ec55121d75be49b48c42eb2162b08cf6`
- rebuild-test `nmyphyhmfttxkdoposvf`: md5 `ec55121d75be49b48c42eb2162b08cf6` (identical)

ACL identical on both databases (owner `postgres`; EXECUTE for authenticated, service_role and the
Supabase system roles).

## RESTORE

Apply `original.sql` with `supabase db query --linked -f original.sql` (`-f`: a leading comment line is
otherwise parsed as a flag). Then read back
`md5(pg_get_functiondef('public.enforce_files_column_scope()'::regprocedure))` and require
`ec55121d75be49b48c42eb2162b08cf6`. CREATE OR REPLACE leaves the trigger `files_column_scope` untouched.

This file is also R-9's SABOTAGE: applying it removes the "move out of a money category" arm.
