-- S111 hardening, ruling B — the `.markup.jpg` arms of
-- project_files_select_non_client and project_files_update_non_client carry
-- their OWN authority, as 20261790000000 did for INSERT.
--
-- ⚠️ REBUILD-TEST FIRST. Production: ONE attended push together with
-- 20261790000000 (ruling C), never either alone — a tight INSERT beside a loose
-- READ/UPDATE is the state this pair exists to avoid. Policy-only: no row is
-- governed, moved or rewritten, and no object moves.
--
-- WHY. Both arms were added by 20261008000000 as
--   name LIKE '%.markup.jpg'
--   AND EXISTS (SELECT 1 FROM files f WHERE f.file_path = <original>)
-- scoped ONLY by the caller's `files` RLS. Correct today, because
-- files_select_non_client requires can_view_project() for every non
-- owner/admin role; a coupling, not a floor. Ruling B [Josh]: a loose UPDATE
-- lets someone not on the project OVERWRITE an existing markup — worse than
-- creating one — and a loose READ is the same leak as reading the original.
-- test/s111-markup-derivative-read-update-floor.live.ts measured both arms
-- refusing an unassigned subcontractor BEFORE this change.
--
-- THE FIX is the 20261790000000 shape, verbatim: inside the EXISTS, the
-- ORIGINAL's project must be one the caller is assigned to. owner/admin still
-- pass on the first OR branch. On UPDATE it goes in BOTH USING and WITH CHECK.
--
-- ⚠️ DELIBERATELY NOT CHANGED: the ORIGINALS arm,
--   EXISTS (SELECT 1 FROM files f WHERE f.file_path = objects.name)
-- That one is the designed delegation (20261007000000 / s157 A5–A8): an
-- original's bytes are exactly as readable as its `files` row, including the
-- non-project carve-outs files RLS makes (a PM's own invoices). Tying it to
-- assignment would silently remove those. It is recorded in the S111 report
-- as the same class of coupling, for a ruling — not changed here.
--
-- Both policies are replaced in this one file. A migration runs in one
-- transaction, so there is no window with either policy missing.
--
-- Storage policies use the inline profiles subquery, never get_my_company_id()
-- (CLAUDE.md). Every other clause is reproduced verbatim from pg_policies on
-- rebuild-test, including `TO authenticated`.

DROP POLICY IF EXISTS project_files_select_non_client ON storage.objects;

CREATE POLICY project_files_select_non_client ON storage.objects
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
    AND (
      get_my_role() = ANY (ARRAY['owner','admin'])
      OR EXISTS (SELECT 1 FROM files f WHERE f.file_path = objects.name)
      -- [S111 harden] The markup derivative of an original on a project the
      -- caller is ASSIGNED to — checked here, not inherited from `files` RLS.
      OR (
        name LIKE '%.markup.jpg'
        AND EXISTS (
          SELECT 1
            FROM files f
            JOIN project_assignments pa ON pa.project_id = f.project_id
            JOIN company_members m ON m.id = pa.member_id
            JOIN profiles p ON p.id = m.profile_id
           WHERE f.file_path = left(objects.name, length(objects.name) - 11)
             AND f.project_id IS NOT NULL
             AND pa.is_deleted = false
             AND m.is_deleted = false
             AND p.user_id = auth.uid()
             AND p.is_deleted = false
        )
      )
    )
  );

DROP POLICY IF EXISTS project_files_update_non_client ON storage.objects;

CREATE POLICY project_files_update_non_client ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'project-files'
    AND (storage.foldername(name))[1] = (
      SELECT profiles.company_id::text
        FROM profiles
       WHERE profiles.user_id = auth.uid() AND profiles.is_deleted = false
    )
    AND get_my_role() <> 'client'
    AND (
      get_my_role() = ANY (ARRAY['owner','admin'])
      OR EXISTS (SELECT 1 FROM files f WHERE f.file_path = objects.name)
      -- [S111 harden] See the SELECT policy above.
      OR (
        name LIKE '%.markup.jpg'
        AND EXISTS (
          SELECT 1
            FROM files f
            JOIN project_assignments pa ON pa.project_id = f.project_id
            JOIN company_members m ON m.id = pa.member_id
            JOIN profiles p ON p.id = m.profile_id
           WHERE f.file_path = left(objects.name, length(objects.name) - 11)
             AND f.project_id IS NOT NULL
             AND pa.is_deleted = false
             AND m.is_deleted = false
             AND p.user_id = auth.uid()
             AND p.is_deleted = false
        )
      )
    )
  )
  WITH CHECK (
    bucket_id = 'project-files'
    AND (storage.foldername(name))[1] = (
      SELECT profiles.company_id::text
        FROM profiles
       WHERE profiles.user_id = auth.uid() AND profiles.is_deleted = false
    )
    AND get_my_role() <> 'client'
    AND (
      get_my_role() = ANY (ARRAY['owner','admin'])
      OR EXISTS (SELECT 1 FROM files f WHERE f.file_path = objects.name)
      -- [S111 harden] See the SELECT policy above.
      OR (
        name LIKE '%.markup.jpg'
        AND EXISTS (
          SELECT 1
            FROM files f
            JOIN project_assignments pa ON pa.project_id = f.project_id
            JOIN company_members m ON m.id = pa.member_id
            JOIN profiles p ON p.id = m.profile_id
           WHERE f.file_path = left(objects.name, length(objects.name) - 11)
             AND f.project_id IS NOT NULL
             AND pa.is_deleted = false
             AND m.is_deleted = false
             AND p.user_id = auth.uid()
             AND p.is_deleted = false
        )
      )
    )
  );
