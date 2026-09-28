-- ============================================================================
-- S114 PART A, section 2 — the Project Executive may UPLOAD to its projects.
-- ============================================================================
--
-- FILL-A-2: of 13 storage.objects policies, the one gap is
-- project_files_insert_non_client, whose role list omits this role. SELECT and
-- UPDATE already admit it (an EXISTS on a `files` row the caller can read).
-- Without this arm the role cannot upload a photo or a file on its own job.
--
-- ⚠️ STORAGE TRAP (CLAUDE.md, migrations 013/017): in storage.objects the
-- company helper silently returns NULL. Neither this policy nor its helper
-- calls get_my_company_id(), get_my_role() or pe_on_project(): the caller is
-- resolved from auth.uid() inline, as pe_can_attach_lien_release() does.
--
-- Scope, mirroring the PM policy's two branches:
--   · the object's folder [2] is a project the caller is assigned to; or
--   · it is a markup derivative (`<original>.markup.jpg`) of a `files` row on
--     such a project.
-- Folder [1] must be the caller's company. Delete stays Owner/Admin.
-- ============================================================================

CREATE FUNCTION public.pe_can_upload_project_file(p_name text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM profiles me
      JOIN company_members m ON m.profile_id = me.id AND m.is_deleted = false
      JOIN project_assignments pa ON pa.member_id = m.id AND pa.is_deleted = false
      JOIN projects pr ON pr.id = pa.project_id AND pr.company_id = me.company_id
     WHERE me.user_id = auth.uid()
       AND me.is_deleted = false
       AND me.role = 'project_executive'
       AND (
         pr.id::text = (storage.foldername(p_name))[2]
         OR (p_name LIKE '%.markup.jpg'
             AND EXISTS (SELECT 1 FROM files f
                          WHERE f.company_id = me.company_id
                            AND f.project_id = pr.id
                            AND f.file_path = left(p_name, length(p_name) - 11)))
       ));
$$;

REVOKE ALL ON FUNCTION public.pe_can_upload_project_file(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pe_can_upload_project_file(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.pe_can_upload_project_file(text) TO authenticated;

CREATE POLICY project_files_insert_project_executive ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'project-files'
    AND (storage.foldername(name))[1] = (SELECT profiles.company_id::text FROM public.profiles
                                          WHERE profiles.user_id = auth.uid() AND profiles.is_deleted = false)
    AND public.pe_can_upload_project_file(name));
