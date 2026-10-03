# enforce_companies_qb_time_export — S127 item 1 definition, captured before its sabotages

Captured on rebuild-test `nmyphyhmfttxkdoposvf` right after `20262134100000` applied, BEFORE either sabotage.
The pre-S127 (S124 Part 2) original is in `docs/sessions/S124-sabotage-originals/enforce_companies_qb_time_export/`
(md5 `57240739631328c1215351024c4f4a43`, confirmed live before the push).

| | value |
| --- | --- |
| md5 of `pg_get_functiondef` | `c18819c27c3bb8d2be7219082119d241` |
| ACL | `{postgres=X/postgres,service_role=X/postgres,supabase_auth_admin=X/postgres}` |

`RESTORE.sql` re-creates it and its comment. The trigger `companies_qb_time_export_scope` is unchanged.
