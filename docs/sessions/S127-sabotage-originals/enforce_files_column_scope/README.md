# enforce_files_column_scope — the ORIGINAL, captured before S127's photo-share widening

Captured 2026-10-03 from BOTH databases before any replace:
- production `jwkcknyuyvcwcdeskrmz`: md5 `6b1c44e87d1ddfac28dd009fd4883d0b`
- rebuild-test `nmyphyhmfttxkdoposvf`: md5 `6b1c44e87d1ddfac28dd009fd4883d0b` (identical)

ACL (production): `{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres,supabase_privileged_role=X/postgres,dashboard_user=X/postgres,supabase_admin=X/postgres,authenticator=X/postgres,cli_login_postgres=X/postgres,supabase_auth_admin=X/postgres,supabase_storage_admin=X/postgres,supabase_replication_admin=X/postgres,pgbouncer=X/postgres,supabase_read_only_user=X/postgres,supabase_etl_admin=X/postgres,supabase_realtime_admin=X/postgres}`

## RESTORE

Apply `original.sql` with `-f` (a leading comment line is parsed as a flag otherwise — the S127 item 1 lesson),
then read back `md5(pg_get_functiondef('public.enforce_files_column_scope()'::regprocedure))` and require
`6b1c44e87d1ddfac28dd009fd4883d0b`. The trigger `files_column_scope` is untouched by CREATE OR REPLACE.
