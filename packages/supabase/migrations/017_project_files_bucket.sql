-- ============================================================
-- FrameFocus — Migration 017: project-files storage bucket
-- ============================================================
-- Creates the private `project-files` Supabase Storage bucket
-- and RLS policies on storage.objects.
--
-- Folder structure: {company_id}/{project_id}/{category}/{filename}
-- Company isolation is enforced via (storage.foldername(name))[1]
-- which matches the first path segment (company_id).
-- ============================================================

-- ----------------------------------------
-- 1. Create bucket (idempotent)
-- ----------------------------------------

INSERT INTO storage.buckets (id, name, public)
VALUES ('project-files', 'project-files', false)
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------
-- 2. RLS policies on storage.objects
-- ----------------------------------------

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
