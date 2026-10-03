# mark_schedule_dirty_from_row — captured original (S127 item 6)

Captured 2026-10-03 BEFORE `20262134400000` replaces it (to add `company_holiday_rules` to the tables that mark every
Critical Path project dirty). md5 of `pg_get_functiondef`: `460edf02566fde6158f6896ce52215b3` on rebuild-test; production's md5 is recorded in
the S127 report. ACL `{postgres=X/postgres,service_role=X/postgres,supabase_auth_admin=X/postgres}`. Comment: None.

Restore: `npx supabase db query --linked -f RESTORE.sql` (the file starts with `CREATE`; a leading `--` comment
breaks the CLI's argument form).
