-- ============================================================================
-- S127 R-2 — BIND A PUBLIC SHARE LINK'S `share_path` TO ITS OWN PHOTO, IN THE
-- DATABASE. [RULED Josh, 2026-10-03 10:53: "A. BUILD THE DATABASE CHECK".]
-- ============================================================================
--
-- `photo_share_links.share_path` names the storage object the PUBLIC page
-- streams with the service role. The INSERT policy checked `file_id` (role,
-- company, a live image) but not `share_path`, so an Owner/Admin writing a row
-- AROUND the create route could name any object in `project-files` — another
-- company's included. S127 4e closed it in the app (`sharePathBelongsToFile`
-- in lib/photos/share-link.ts refuses such a row at read time); this closes it
-- at the write, so the row cannot exist at all. Defence in depth on the only
-- public surface in the app.
--
-- The allowed values are exactly what the create route writes: the photo's
-- own `file_path`, or its marked-up derivative `<file_path>.markup.jpg`
-- (packages/shared/utils/markup.ts DERIVATIVE_SUFFIX). UPDATE cannot change
-- `share_path` (enforce_photo_share_links_scope raises 42501), so INSERT is the
-- only door.
--
-- ALTER POLICY, not drop/create: the policy keeps its name, command, role and
-- USING. The original WITH CHECK is captured with a RESTORE in
-- docs/sessions/S127-sabotage-originals/photo_share_links_insert_owner_admin/
-- (md5 f5b0625d…, identical on both databases). Existing rows: 0 on production
-- at ship (read back in the section); no data is touched.
-- ============================================================================

ALTER POLICY photo_share_links_insert_owner_admin ON public.photo_share_links
  WITH CHECK (company_id = get_my_company_id() AND get_my_role() = ANY (ARRAY['owner', 'admin'])
              AND EXISTS (SELECT 1 FROM public.files f
                           WHERE f.id = file_id AND f.company_id = get_my_company_id()
                             AND f.is_deleted = false AND f.mime_type LIKE 'image/%'
                             AND (share_path = f.file_path OR share_path = f.file_path || '.markup.jpg')));
