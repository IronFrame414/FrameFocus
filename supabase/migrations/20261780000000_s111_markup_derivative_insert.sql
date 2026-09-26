-- S111 Part Two — ride-along (approved): the flattened markup copy of a CONVERTED
-- estimate photo could not be written by a PM, foreman or crew member.
--
-- ⚠️ REBUILD-TEST FIRST; production only when Josh applies it. Policy-only: no
-- row is governed, moved or rewritten, and no file moves (ruling: "Move no files").
--
-- WHY. saveMarkup() writes files.markup_data, then UPSERTS the flattened JPEG to
-- `{file_path}.markup.jpg` (photos-client.ts:131-136; derivativePathFor,
-- packages/shared/utils/markup.ts:66). The first save of a derivative is an
-- INSERT on storage.objects. project_files_insert_non_client admits a non
-- owner/admin role only when (storage.foldername(name))[2] is a project UUID they
-- are assigned to — but an image uploaded to an estimate and then converted keeps
-- its path `{company}/estimates/{estimateId}/…` (conversion re-points the ROW,
-- never the object). Segment 2 is the literal 'estimates', so the INSERT is
-- refused: markup_data saves, the derivative does not, saveMarkup returns
-- 'derivative_failed'. Owner/Admin were never affected. Measured before and
-- after on rebuild-test — see test/s111-photo-conversion.live.ts.
--
-- THE FIX mirrors the arm project_files_select_non_client and
-- project_files_update_non_client ALREADY carry: a `.markup.jpg` whose ORIGINAL
-- the caller can read through `files` RLS. That EXISTS runs as the caller, and
-- files_select_non_client requires project_id IS NOT NULL + can_view_project()
-- for every non owner/admin role — so the new arm reaches only files on the
-- caller's OWN projects (an estimate file still on its estimate has project_id
-- NULL and is invisible to them). It cannot write an original, only a
-- `.markup.jpg` beside one it can already see, which UPDATE already permitted.
--
-- Storage policies use the inline profiles subquery, never get_my_company_id()
-- (CLAUDE.md: the helper returns NULL in storage.objects policies). The existing
-- clauses are reproduced verbatim from pg_policies on rebuild-test.

DROP POLICY IF EXISTS project_files_insert_non_client ON storage.objects;

CREATE POLICY project_files_insert_non_client ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'project-files'
    AND (storage.foldername(name))[1] = (
      SELECT profiles.company_id::text
        FROM profiles
       WHERE profiles.user_id = auth.uid() AND profiles.is_deleted = false
    )
    AND get_my_role() = ANY (ARRAY['owner','admin','project_manager','foreman','crew_member','subcontractor'])
    AND (
      get_my_role() = ANY (ARRAY['owner','admin'])
      OR CASE
        WHEN (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN EXISTS (
          SELECT 1
            FROM project_assignments pa
            JOIN company_members m ON m.id = pa.member_id
            JOIN profiles p ON p.id = m.profile_id
           WHERE pa.project_id = ((storage.foldername(objects.name))[2])::uuid
             AND pa.is_deleted = false
             AND m.is_deleted = false
             AND p.user_id = auth.uid()
             AND p.is_deleted = false
        )
        ELSE false
      END
      -- [S111] The markup derivative of an original the caller can read.
      OR (
        name LIKE '%.markup.jpg'
        AND EXISTS (SELECT 1 FROM files f WHERE f.file_path = left(objects.name, length(objects.name) - 11))
      )
    )
  );
