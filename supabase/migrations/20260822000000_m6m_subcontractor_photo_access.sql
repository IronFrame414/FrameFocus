-- ============================================================================
-- M6M §7a — Required migration 1 of 2: subcontractor photo access (D-20,
-- extended [S98]). BUILD STEP 1 — lands before any route, screen or component.
-- ============================================================================
--
-- WHY
--   D-11 puts every role on /m and §3.2 puts the camera in the centre of the
--   tab bar on every mobile screen. Today a subcontractor who taps it is
--   rejected AFTER taking the photo. Shipping the shell first would demo every
--   screen with its most prominent control broken for one role.
--
-- IT IS FOUR POLICIES, NOT ONE
--   A photo is TWO writes governed by TWO independent policy sets:
--     - the ROW      in public.files
--     - the BYTES    in storage.objects
--   'subcontractor' is missing from both. Widening only public.files produces a
--   subcontractor who can insert a file row whose bytes storage then refuses —
--   and A-21d (the row insert) would pass while capture stayed broken. A-21g
--   asserts the bytes specifically for exactly this reason.
--
--   1. files_insert_non_client          public.files      the row            (D-20)
--   2. files_update_non_client          public.files      Markup Save writes
--                                                         files.markup_data   [S98 ruling]
--   3. project_files_insert_non_client  storage.objects   the bytes           [S98]
--   4. project_files_update_non_client  storage.objects   derivative re-write  [S98]
--
-- THE ROLE ARRAY IS THE ONLY THING THAT CHANGES
--   Six occurrences of the five-role array across the four policies (INSERT
--   policies have one each; UPDATE policies have one in USING and one in
--   WITH CHECK). Each gets 'subcontractor'::text appended. EVERY OTHER ARM IS
--   REPRODUCED BYTE-IDENTICALLY from 20260728000000_security_rls_96_99.sql,
--   which was verified against the live definitions before this was written.
--
--   Left deliberately untouched, because each already admits an assigned
--   subcontractor correctly (§7a, verified arm by arm):
--     - the client_visible arm — a sub's field photo is not client-visible, so
--       this passes unchanged AND keeps subs out of the client portal.
--     - the category/project arm — can_view_project() is ROLE-BLIND, so an
--       assigned sub passes and an unassigned one does not.
--     - the storage company arm — the inline-subquery form the house rule
--       requires (get_my_company_id() returns NULL in storage.objects policies).
--     - the storage project-assignment arm — the join through
--       project_assignments -> company_members -> profiles is role-blind too.
--     - the ARRAY['owner','admin'] sub-arrays — NOT the five-role array. These
--       are the owner/admin bypasses and must keep exactly two entries.
--
--   NOT IN SCOPE, do not "tidy" to match:
--     - project_files_select_non_client  — gates on get_my_role() <> 'client',
--       which a subcontractor already passes. No change needed.
--     - project_files_delete_owner_admin — DELETE stays Owner/Admin.
--
-- NET GRANT
--   On a project they are assigned to, a subcontractor may write and re-write a
--   non-client-visible, non-financial file and its bytes. Nothing else.
--
-- No data change, no column change, no backfill. Four DROP/CREATE pairs.
-- Evidence: A-21d (fails before, passes after) through A-21j.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. public.files — INSERT (the file row for a captured photo)
-- ----------------------------------------------------------------------------

DROP POLICY files_insert_non_client ON public.files;

CREATE POLICY files_insert_non_client ON public.files
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text, 'foreman'::text, 'crew_member'::text, 'subcontractor'::text])
    -- client_visible at INSERT: owner/admin only (the UPDATE guard is a
    -- BEFORE UPDATE trigger and cannot see inserts). NULL treated as false.
    AND (
      public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
      OR COALESCE(client_visible, false) = false
    )
    AND (
      public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
      OR (
        project_id IS NOT NULL
        AND (
          (category = 'invoices'
             AND public.get_my_role() = 'project_manager'
             AND public.can_view_project(project_id))
          OR (category <> ALL (ARRAY['contracts'::text, 'change_orders'::text, 'invoices'::text])
             AND public.can_view_project(project_id))
        )
      )
    )
  );


-- ----------------------------------------------------------------------------
-- 2. public.files — UPDATE (Markup Save writes files.markup_data)
-- ----------------------------------------------------------------------------

DROP POLICY files_update_non_client ON public.files;

CREATE POLICY files_update_non_client ON public.files
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text, 'foreman'::text, 'crew_member'::text, 'subcontractor'::text])
    AND (
      public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
      OR (
        project_id IS NOT NULL
        AND (
          (category = 'invoices'
             AND public.get_my_role() = 'project_manager'
             AND public.can_view_project(project_id))
          OR (category <> ALL (ARRAY['contracts'::text, 'change_orders'::text, 'invoices'::text])
             AND public.can_view_project(project_id))
        )
      )
    )
  )
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text, 'foreman'::text, 'crew_member'::text, 'subcontractor'::text])
    AND (
      public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
      OR (
        project_id IS NOT NULL
        AND (
          (category = 'invoices'
             AND public.get_my_role() = 'project_manager'
             AND public.can_view_project(project_id))
          OR (category <> ALL (ARRAY['contracts'::text, 'change_orders'::text, 'invoices'::text])
             AND public.can_view_project(project_id))
        )
      )
    )
  );


-- ----------------------------------------------------------------------------
-- 3. storage.objects — INSERT (the photo bytes, and the first markup derivative)
-- ----------------------------------------------------------------------------

DROP POLICY "project_files_insert_non_client" ON storage.objects;

CREATE POLICY "project_files_insert_non_client"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'project-files'
  AND (storage.foldername(name))[1] = (SELECT company_id::text FROM public.profiles WHERE user_id = auth.uid() AND is_deleted = false)
  AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text, 'foreman'::text, 'crew_member'::text, 'subcontractor'::text])
  AND (
    public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
    OR CASE
         WHEN (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         THEN EXISTS (
           SELECT 1
           FROM public.project_assignments pa
           JOIN public.company_members m ON m.id = pa.member_id
           JOIN public.profiles p ON p.id = m.profile_id
           WHERE pa.project_id = ((storage.foldername(name))[2])::uuid
             AND pa.is_deleted = false
             AND m.is_deleted = false
             AND p.user_id = auth.uid()
             AND p.is_deleted = false
         )
         ELSE false
       END
  )
);


-- ----------------------------------------------------------------------------
-- 4. storage.objects — UPDATE (overwriting the derivative in place on re-edit)
-- ----------------------------------------------------------------------------

DROP POLICY "project_files_update_non_client" ON storage.objects;

CREATE POLICY "project_files_update_non_client"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'project-files'
  AND (storage.foldername(name))[1] = (SELECT company_id::text FROM public.profiles WHERE user_id = auth.uid() AND is_deleted = false)
  AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text, 'foreman'::text, 'crew_member'::text, 'subcontractor'::text])
  AND (
    public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
    OR CASE
         WHEN (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         THEN EXISTS (
           SELECT 1
           FROM public.project_assignments pa
           JOIN public.company_members m ON m.id = pa.member_id
           JOIN public.profiles p ON p.id = m.profile_id
           WHERE pa.project_id = ((storage.foldername(name))[2])::uuid
             AND pa.is_deleted = false
             AND m.is_deleted = false
             AND p.user_id = auth.uid()
             AND p.is_deleted = false
         )
         ELSE false
       END
  )
)
WITH CHECK (
  bucket_id = 'project-files'
  AND (storage.foldername(name))[1] = (SELECT company_id::text FROM public.profiles WHERE user_id = auth.uid() AND is_deleted = false)
  AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text, 'foreman'::text, 'crew_member'::text, 'subcontractor'::text])
  AND (
    public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
    OR CASE
         WHEN (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         THEN EXISTS (
           SELECT 1
           FROM public.project_assignments pa
           JOIN public.company_members m ON m.id = pa.member_id
           JOIN public.profiles p ON p.id = m.profile_id
           WHERE pa.project_id = ((storage.foldername(name))[2])::uuid
             AND pa.is_deleted = false
             AND m.is_deleted = false
             AND p.user_id = auth.uid()
             AND p.is_deleted = false
         )
         ELSE false
       END
  )
);
