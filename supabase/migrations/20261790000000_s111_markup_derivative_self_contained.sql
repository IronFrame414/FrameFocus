-- S111 hardening, item 2(b) — make the `.markup.jpg` arm of
-- project_files_insert_non_client carry its OWN authority.
--
-- ⚠️ REBUILD-TEST FIRST; production only when Josh applies it. Policy-only: no
-- row is governed, moved or rewritten, and no object moves.
--
-- WHY. 20261780000000 added the arm
--   name LIKE '%.markup.jpg'
--   AND EXISTS (SELECT 1 FROM files f WHERE f.file_path = <original>)
-- whose ONLY scoping is that the EXISTS runs under the caller's `files` RLS.
-- It is correct today because files_select_non_client requires
-- project_id IS NOT NULL + can_view_project() for every non owner/admin role.
-- That is a coupling, not a floor: any later widening of `files` SELECT (a
-- company-wide photo gallery, a new role, a category carve-out) would widen
-- WHO CAN WRITE STORAGE here, silently, in a policy nobody would think to
-- re-read. test/s111-markup-derivative-floor.live.ts measured the current arm
-- refusing an unassigned subcontractor BEFORE this change.
--
-- THE FIX adds, inside the EXISTS, the same assignment test the CASE arm above
-- it already uses for project-path uploads: the ORIGINAL file's project must be
-- one the caller is assigned to. The authority now sits in this policy; `files`
-- RLS still applies on top (it can only narrow, never widen).
--   * owner/admin are unaffected — they pass on the first OR branch.
--   * a file with project_id NULL (still on its estimate) can never match,
--     exactly as today.
--
-- Deliberately NOT applied to project_files_select_non_client or
-- project_files_update_non_client, which carry the same arm. Item 2 names the
-- INSERT arm only; the other two are recorded in the S111 report as the same
-- coupling, for Josh to rule on.
--
-- Storage policies use the inline profiles subquery, never get_my_company_id()
-- (CLAUDE.md: the helper returns NULL in storage.objects policies). Every other
-- clause is reproduced verbatim from 20261780000000 / pg_policies on
-- rebuild-test.

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
      -- [S111] The markup derivative of an original on a project the caller is
      -- ASSIGNED to. [S111 harden] The assignment is checked HERE, not
      -- inherited from `files` RLS.
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
