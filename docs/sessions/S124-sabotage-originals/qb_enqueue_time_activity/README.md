# qb_enqueue_time_activity — captured before the S124 Part 1 sabotage

Captured from **rebuild-test `nmyphyhmfttxkdoposvf`** with `pg_get_functiondef`, right after migration
`20262135000000` was applied. `md5.txt` is md5(pg_get_functiondef). `acl.txt` is `proacl`, and
`comment.txt` is the function comment.

**Restore:** run `RESTORE.sql` (a `CREATE OR REPLACE` of the same definition, which keeps the ACL and comment) on
rebuild-test with `npx supabase db query --linked -f RESTORE.sql`, then read back md5 = `md5.txt`.
