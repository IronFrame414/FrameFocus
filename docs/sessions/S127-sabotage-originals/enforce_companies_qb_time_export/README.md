# enforce_companies_qb_time_export — S127 item 1 definition, captured before its sabotages

Captured on rebuild-test `nmyphyhmfttxkdoposvf` right after `20262134100000` applied, BEFORE either sabotage.
The pre-S127 (S124 Part 2) original is in `docs/sessions/S124-sabotage-originals/enforce_companies_qb_time_export/`
(md5 `57240739631328c1215351024c4f4a43`, confirmed live before the push).

| | value |
| --- | --- |
| md5 of `pg_get_functiondef` | `c18819c27c3bb8d2be7219082119d241` |
| ACL | `{postgres=X/postgres,service_role=X/postgres,supabase_auth_admin=X/postgres}` |

`RESTORE.sql` re-creates it and its comment. The trigger `companies_qb_time_export_scope` is unchanged.

**Run it with `npx supabase db query --linked -f RESTORE.sql`.** ⚠️ Passing its text as the argument fails: the
leading `--` comment is parsed as a CLI flag and the CLI prints help and changes nothing. That happened once in S127,
and the md5 read-back caught it: the "restored" md5 equalled the sabotage's. The bare `definition.sql` was then
applied, and the md5 read back `c18819c27c3bb8d2be7219082119d241`, identical.

**Superseded definition (S127, same session).** The notification text said "FrameFocus", the pre-rebrand name, and
`brand-literals.test.ts` caught the same string in the TS copy. The migration's user-facing text now says "EZ
Contractor Binder". The function was re-applied on rebuild-test from the corrected migration, and `definition.sql` /
`RESTORE.sql` were re-captured from it: md5 **`65284c5df44f2980c736df045cc869ed`** (was `c18819c27c3bb8d2be7219082119d241`).
