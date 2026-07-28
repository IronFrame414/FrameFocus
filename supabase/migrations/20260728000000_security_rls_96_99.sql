-- ============================================================================
-- Security fixes: TECH_DEBT #96–#99 (S89 M6B RLS probe; written Session 89,
-- scheduled S90). Target REBUILD-TEST FIRST — do not push to prod unreviewed.
--
--   #96  files company-wide RLS leak — files_select/insert/update_non_client
--        were company-scoped only. Now project-scoped with category gating:
--          category IN ('contracts','change_orders')  => owner/admin only
--          category =  'invoices'                     => owner/admin/PM (PM on
--                                                        visible projects)
--          all other categories                       => company AND
--                                                        can_view_project()
--          project_id IS NULL                         => owner/admin only
--        client_visible writes and recategorization INTO the gated trio are
--        owner/admin only (BEFORE UPDATE trigger — policies cannot see OLD).
--   #97  daily_logs INSERT author spoofing — WITH CHECK now binds
--        author_member_id to the caller (owner/admin override arm).
--   #98  daily_logs soft-delete reversal — BEFORE UPDATE trigger blocks
--        is_deleted/deleted_at changes in BOTH directions for non-owner/admin.
--   #99  daily_log_crew / daily_log_sub_entries — member_id must belong to the
--        caller's company (same-company EXISTS in INSERT WITH CHECK and a new
--        explicit UPDATE WITH CHECK; the FK alone accepted cross-tenant ids).
--
-- Storage (project-files bucket): the 20260714175906 policies are re-created
-- with the same gating where the PATH supports it. Path segment 2 is a project
-- UUID for uploadFile/log/delivery/incident objects, but a LITERAL folder for
-- admin-written artifacts ('proposals', 'change-orders', 'signatures',
-- 'company'). Rule: owner/admin read/write everything; everyone else needs a
-- UUID segment 2 + a live assignment to that project. Literal folders thus
-- fall to owner/admin automatically. Storage cannot see files.category, so a
-- gated-category file stored under a project path is protected by the TABLE
-- policy (row invisible => path undiscoverable); the storage arm is
-- defense-in-depth, not the primary gate.
--
-- Notes:
--   * Inline subqueries (not get_my_company_id()) in storage.objects policies
--     per the CLAUDE.md storage rule; get_my_role() retained for role arms —
--     it is live in the existing bucket policies today.
--   * The ::uuid cast is guarded by a CASE on a UUID regex so a literal
--     segment can never reach the cast (planner may reorder bare ANDs).
--   * Service-role writers (PDF services) bypass RLS but NOT triggers; both
--     triggers early-return when auth.uid() IS NULL so admin-client writes
--     are unaffected.
--   * project_files_delete_owner_admin (20260714175906) is already
--     owner/admin-scoped — untouched.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. #96 — public.files policies (drop + re-create, category + project rules)
-- ----------------------------------------------------------------------------

DROP POLICY files_select_non_client ON public.files;

CREATE POLICY files_select_non_client ON public.files
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() <> 'client'
    AND (
      public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
      OR (
        project_id IS NOT NULL
        AND (
          -- invoices: PM allowed, scoped to projects they can see
          (category = 'invoices'
             AND public.get_my_role() = 'project_manager'
             AND public.can_view_project(project_id))
          -- everything not category-gated: any non-client role, visible project
          OR (category <> ALL (ARRAY['contracts'::text, 'change_orders'::text, 'invoices'::text])
             AND public.can_view_project(project_id))
        )
      )
    )
  );

DROP POLICY files_insert_non_client ON public.files;

CREATE POLICY files_insert_non_client ON public.files
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text, 'foreman'::text, 'crew_member'::text])
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

DROP POLICY files_update_non_client ON public.files;

CREATE POLICY files_update_non_client ON public.files
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text, 'foreman'::text, 'crew_member'::text])
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
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text, 'foreman'::text, 'crew_member'::text])
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
-- 2. #96 — files column scope (client_visible + recategorization INTO the
--    gated trio). BEFORE UPDATE trigger: RLS WITH CHECK cannot reference OLD.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_files_column_scope()
RETURNS TRIGGER AS $$
BEGIN
  -- Service-role clients (PDF services) have no auth context; RLS already
  -- doesn't apply to them and this trigger must not break their writes.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text]) THEN
    RETURN NEW;
  END IF;

  IF NEW.client_visible IS DISTINCT FROM OLD.client_visible THEN
    RAISE EXCEPTION 'client_visible is Owner/Admin only.';
  END IF;

  IF NEW.category IS DISTINCT FROM OLD.category
     AND NEW.category = ANY (ARRAY['contracts'::text, 'change_orders'::text, 'invoices'::text]) THEN
    RAISE EXCEPTION 'Recategorizing a file into contracts/change_orders/invoices is Owner/Admin only.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

CREATE TRIGGER files_column_scope
  BEFORE UPDATE ON public.files
  FOR EACH ROW EXECUTE FUNCTION public.enforce_files_column_scope();

-- ----------------------------------------------------------------------------
-- 3. #97 — daily_logs INSERT: bind the author to the caller.
-- ----------------------------------------------------------------------------

DROP POLICY daily_logs_insert_authorized ON public.daily_logs;

CREATE POLICY daily_logs_insert_authorized ON public.daily_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND public.can_view_project(project_id)
    AND (
      author_member_id = public.get_my_member_id()
      OR public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  );

-- ----------------------------------------------------------------------------
-- 4. #98 — daily_logs soft-delete: block is_deleted transitions in BOTH
--    directions for non-owner/admin (the policy WITH CHECK only pinned
--    true-ward writes; the author could reverse an Owner/Admin delete).
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_daily_logs_column_scope()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;   -- service-role (PDF repoint) — unaffected
  END IF;

  IF public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text]) THEN
    RETURN NEW;
  END IF;

  IF NEW.is_deleted IS DISTINCT FROM OLD.is_deleted
     OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
    RAISE EXCEPTION 'Deleting or restoring a daily log is Owner/Admin only.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

CREATE TRIGGER daily_logs_column_scope
  BEFORE UPDATE ON public.daily_logs
  FOR EACH ROW EXECUTE FUNCTION public.enforce_daily_logs_column_scope();

-- ----------------------------------------------------------------------------
-- 5. #99 — daily_log_crew / daily_log_sub_entries: member_id must belong to
--    the caller's company. Added to INSERT WITH CHECK; UPDATE gains an
--    explicit WITH CHECK (previously none — USING doubled for the new row).
-- ----------------------------------------------------------------------------

DROP POLICY daily_log_crew_insert_authorized ON public.daily_log_crew;

CREATE POLICY daily_log_crew_insert_authorized ON public.daily_log_crew
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM public.daily_logs dl
      WHERE dl.id = daily_log_crew.daily_log_id
        AND (
          dl.author_member_id = public.get_my_member_id()
          OR public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
        )
    )
    AND EXISTS (
      SELECT 1 FROM public.company_members m
      WHERE m.id = daily_log_crew.member_id
        AND m.company_id = public.get_my_company_id()
    )
  );

DROP POLICY daily_log_crew_update_authorized ON public.daily_log_crew;

CREATE POLICY daily_log_crew_update_authorized ON public.daily_log_crew
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM public.daily_logs dl
      WHERE dl.id = daily_log_crew.daily_log_id
        AND (
          dl.author_member_id = public.get_my_member_id()
          OR public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
        )
    )
  )
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM public.daily_logs dl
      WHERE dl.id = daily_log_crew.daily_log_id
        AND (
          dl.author_member_id = public.get_my_member_id()
          OR public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
        )
    )
    AND EXISTS (
      SELECT 1 FROM public.company_members m
      WHERE m.id = daily_log_crew.member_id
        AND m.company_id = public.get_my_company_id()
    )
  );

DROP POLICY daily_log_sub_entries_insert_authorized ON public.daily_log_sub_entries;

CREATE POLICY daily_log_sub_entries_insert_authorized ON public.daily_log_sub_entries
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM public.daily_logs dl
      WHERE dl.id = daily_log_sub_entries.daily_log_id
        AND (
          dl.author_member_id = public.get_my_member_id()
          OR public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
        )
    )
    AND EXISTS (
      SELECT 1 FROM public.company_members m
      WHERE m.id = daily_log_sub_entries.member_id
        AND m.company_id = public.get_my_company_id()
    )
  );

DROP POLICY daily_log_sub_entries_update_authorized ON public.daily_log_sub_entries;

CREATE POLICY daily_log_sub_entries_update_authorized ON public.daily_log_sub_entries
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM public.daily_logs dl
      WHERE dl.id = daily_log_sub_entries.daily_log_id
        AND (
          dl.author_member_id = public.get_my_member_id()
          OR public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
        )
    )
  )
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM public.daily_logs dl
      WHERE dl.id = daily_log_sub_entries.daily_log_id
        AND (
          dl.author_member_id = public.get_my_member_id()
          OR public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
        )
    )
    AND EXISTS (
      SELECT 1 FROM public.company_members m
      WHERE m.id = daily_log_sub_entries.member_id
        AND m.company_id = public.get_my_company_id()
    )
  );

-- ----------------------------------------------------------------------------
-- 6. #96 — storage.objects (project-files bucket): project scoping where the
--    path supports it. Inline subqueries for company/assignment lookups (the
--    CLAUDE.md storage rule); get_my_role() retained for role arms. Literal
--    segment-2 folders ('proposals','change-orders','signatures','company')
--    fail the UUID regex and thus fall to the owner/admin arm.
-- ----------------------------------------------------------------------------

DROP POLICY "project_files_select_non_client" ON storage.objects;

CREATE POLICY "project_files_select_non_client"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'project-files'
  AND (storage.foldername(name))[1] = (SELECT company_id::text FROM public.profiles WHERE user_id = auth.uid() AND is_deleted = false)
  AND public.get_my_role() <> 'client'
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

DROP POLICY "project_files_insert_non_client" ON storage.objects;

CREATE POLICY "project_files_insert_non_client"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'project-files'
  AND (storage.foldername(name))[1] = (SELECT company_id::text FROM public.profiles WHERE user_id = auth.uid() AND is_deleted = false)
  AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text, 'foreman'::text, 'crew_member'::text])
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

DROP POLICY "project_files_update_non_client" ON storage.objects;

CREATE POLICY "project_files_update_non_client"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'project-files'
  AND (storage.foldername(name))[1] = (SELECT company_id::text FROM public.profiles WHERE user_id = auth.uid() AND is_deleted = false)
  AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text, 'foreman'::text, 'crew_member'::text])
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
  AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text, 'foreman'::text, 'crew_member'::text])
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
