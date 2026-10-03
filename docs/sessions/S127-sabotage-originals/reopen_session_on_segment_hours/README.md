# reopen_session_on_segment_hours — captured original (S127 item 7)

Captured 2026-10-03 BEFORE any replace or sabotage, per the standing rule (commit the original first).

| | value |
| --- | --- |
| md5 of `pg_get_functiondef` | `27f18f288f62a006e12d033b5005741e` (rebuild-test **and** production, identical) |
| ACL | `{postgres=X/postgres,service_role=X/postgres,supabase_auth_admin=X/postgres}` |
| comment | NULL |
| trigger | `time_segments_z_reopen_on_hours_change BEFORE INSERT OR UPDATE ON time_segments FOR EACH ROW` (unchanged by S127) |
| defined in | `supabase/migrations/20262122000000_s122_session_clock_edit.sql` |

`definition.sql` is the function verbatim. `RESTORE.sql` re-creates it; run it against the target to undo
S127's `20262134200000` replacement (the trigger itself is untouched, so no trigger step is needed).
