# photo_share_links_insert_owner_admin — the ORIGINAL, captured before S127 R-2

Captured 2026-10-03 from BOTH databases before any change (identical):
- `md5(with_check)` = `f5b0625df9f4748833ec9391c1931972` on production `jwkcknyuyvcwcdeskrmz` and rebuild-test
  `nmyphyhmfttxkdoposvf`
- `FOR INSERT TO authenticated`, PERMISSIVE, no USING.

`WITH CHECK` (as `pg_policies` prints it):

```
((company_id = get_my_company_id()) AND (get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])) AND (EXISTS ( SELECT 1
   FROM files f
  WHERE ((f.id = photo_share_links.file_id) AND (f.company_id = get_my_company_id()) AND (f.is_deleted = false) AND (f.mime_type ~~ 'image/%'::text)))))
```

## RESTORE

Apply `RESTORE.sql` with `supabase db query --linked -f RESTORE.sql`, then read back
`md5(with_check)` from `pg_policies` and require `f5b0625df9f4748833ec9391c1931972`.
