# client_critical_path — captured original (S123 D-1), BEFORE the DROP + CREATE

Captured from **rebuild-test** (`nmyphyhmfttxkdoposvf`) before migration `20262133000000_s123_client_schedule_one_view` was applied.
Its md5 equals production's (`ac958d4f…`, measured S123 1.4a), so this is also production's original.

- `original.sql` — `pg_get_functiondef` (+ `;`). Return type: `TABLE(phase_name text, phase_sort integer, phase_start date, phase_finish date, task_title text, task_sort integer, projected_finish date)`.
- `md5.txt` — `md5(pg_get_functiondef(oid))` = `ac958d4fde68d96d9ac0904192024f53`
- `acl.txt` — `postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres,supabase_auth_admin=X/postgres` (no anon, no PUBLIC)
- `comment.txt` — the S122 Part 7 comment.
- `RESTORE.sql` — DROP the current function, CREATE the original, REVOKE PUBLIC/anon, GRANT authenticated, the comment. The remaining ACL
  entries (postgres, service_role, supabase_auth_admin) come from Supabase's default privileges on a new function. **After running it, re-read
  md5, ACL and comment. All three must equal the files above.**

Because the return type differs, the app code must match the function: restoring this on a database also means running the
pre-D-1 app (`lib/services/portal.ts` reads `task_start`/`task_finish` only after D-1).
