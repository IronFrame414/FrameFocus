-- ============================================================
-- FrameFocus — project-files storage.objects RLS policies
-- ============================================================
-- Ports the four RLS policies on storage.objects for the private
-- `project-files` bucket into the active migration set. These were
-- previously only present in migrations_archive/20260101000016_project_files_bucket.sql,
-- which is not applied by the squashed baseline — so the bucket
-- existed with zero policies.
--
-- The bucket insert is intentionally omitted here: the `project-files`
-- bucket already exists on the target project.
--
-- Folder structure: {company_id}/{project_id}/{filename}
-- Company isolation is enforced via (storage.foldername(name))[1]
-- which matches the first path segment (company_id).
--
-- Policy logic is copied verbatim from the archive — do not modify.
-- ============================================================

-- SELECT: all company members except clients can read files
CREATE POLICY "project_files_select_non_client"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'project-files'
  AND (storage.foldername(name))[1] = (SELECT company_id::text FROM profiles WHERE user_id = auth.uid() AND is_deleted = false)
  AND get_my_role() != 'client'
);

-- INSERT: any company member except client can upload files
CREATE POLICY "project_files_insert_non_client"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'project-files'
  AND (storage.foldername(name))[1] = (SELECT company_id::text FROM profiles WHERE user_id = auth.uid() AND is_deleted = false)
  AND get_my_role() IN ('owner', 'admin', 'project_manager', 'foreman', 'crew_member')
);

-- UPDATE: any company member except client can update files
CREATE POLICY "project_files_update_non_client"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'project-files'
  AND (storage.foldername(name))[1] = (SELECT company_id::text FROM profiles WHERE user_id = auth.uid() AND is_deleted = false)
  AND get_my_role() IN ('owner', 'admin', 'project_manager', 'foreman', 'crew_member')
)
WITH CHECK (
  bucket_id = 'project-files'
  AND (storage.foldername(name))[1] = (SELECT company_id::text FROM profiles WHERE user_id = auth.uid() AND is_deleted = false)
  AND get_my_role() IN ('owner', 'admin', 'project_manager', 'foreman', 'crew_member')
);

-- DELETE: owner and admin only — permanent storage delete restricted to these two roles
CREATE POLICY "project_files_delete_owner_admin"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'project-files'
  AND (storage.foldername(name))[1] = (SELECT company_id::text FROM profiles WHERE user_id = auth.uid() AND is_deleted = false)
  AND get_my_role() IN ('owner', 'admin')
);
