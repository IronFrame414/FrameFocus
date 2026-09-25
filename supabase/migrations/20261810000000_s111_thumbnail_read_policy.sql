-- S111 D, option A — who may READ a stored grid thumbnail.
--
-- ⚠️ REBUILD-TEST FIRST; production only when Josh applies it. Policy-only: no
-- row is governed, moved or rewritten, and no object moves.
--
-- WHAT A THUMBNAIL IS. A 400x400 WebP of the file a photo DISPLAYS AS, stored
-- beside the original (packages/shared/utils/markup.ts thumbPathFor):
--   plain photo      {original}.thumb.webp
--   annotated photo  {original}.m{8 hex}.thumb.webp
-- It has NO `files` row — the same shape as the `.markup.jpg` derivative.
--
-- RULED [Josh]: its read rule must NOT borrow authority from the original's
-- `files` row. That is the proxy 20261790000000 / 20261800000000 removed from
-- the derivative arms. So this checks PROJECT ASSIGNMENT itself — the same
-- self-contained shape as those two.
--
-- ⚠️ A NEW, SEPARATE POLICY — deliberately not an edit of
-- project_files_select_non_client. This branch was cut from main, where that
-- policy is still the pre-hardening version; a DROP/CREATE of it here, applied
-- after 20261800000000, would silently UNDO that hardening. Permissive policies
-- are OR'd, so this one can only ADD the thumbnail arm, and its ordering
-- against the harden migrations does not matter.
--
-- What it grants: SELECT only. Owner/admin already read everything in the
-- bucket through project_files_select_non_client. Nothing here lets anyone
-- WRITE a thumbnail — they are written by the service role (lib/photos),
-- after the caller's access to the file row is checked.
--
-- Clients: excluded (`get_my_role() <> 'client'`). The portal does not read
-- thumbnails; project_files_select_client is untouched.
--
-- Storage policies use the inline profiles subquery, never get_my_company_id()
-- (CLAUDE.md: the helper returns NULL in storage.objects policies).
--
-- test/s111-thumbnail-read-floor.live.ts ran BEFORE this: unassigned sub 0
-- readable; assigned control 0 as well (red) — nothing granted it yet.

CREATE POLICY project_files_select_thumbnail_assigned ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'project-files'
    AND (storage.foldername(name))[1] = (
      SELECT profiles.company_id::text
        FROM profiles
       WHERE profiles.user_id = auth.uid() AND profiles.is_deleted = false
    )
    AND get_my_role() <> 'client'
    AND name ~ '(\.m[0-9a-f]{8})?\.thumb\.webp$'
    AND EXISTS (
      SELECT 1
        FROM files f
        JOIN project_assignments pa ON pa.project_id = f.project_id
        JOIN company_members m ON m.id = pa.member_id
        JOIN profiles p ON p.id = m.profile_id
       WHERE f.file_path = regexp_replace(objects.name, '(\.m[0-9a-f]{8})?\.thumb\.webp$', '')
         AND f.project_id IS NOT NULL
         AND pa.is_deleted = false
         AND m.is_deleted = false
         AND p.user_id = auth.uid()
         AND p.is_deleted = false
    )
  );
