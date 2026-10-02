# stamp_schedule_template — captured original (S123 D-4), BEFORE any sabotage

Captured from **rebuild-test** (`nmyphyhmfttxkdoposvf`) right after migration `20262132000000_s123_stamp_schedule_template` was applied.

- `original.sql`: `pg_get_functiondef` (with a trailing `;`); `RESTORE.sql` is byte-identical to it.
- `md5.txt`: `md5(pg_get_functiondef(oid))` = `a18753193fcb33684df95cf91571ff17`
- `acl.txt`: `postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres,supabase_auth_admin=X/postgres` (anon: none; PUBLIC: none)
- `comment.txt`: the function comment.

Every sabotage is a `CREATE OR REPLACE` of the SAME signature, which keeps the ACL and the comment (no DROP, so no grant can be lost).
**To restore:** `npx supabase db query --linked -f docs/sessions/S123-sabotage-originals/stamp_schedule_template/RESTORE.sql` (CLI linked to
rebuild-test, read back first), then re-read the md5, ACL and comment above. All three must match.
