-- ============================================================================
-- Module 5 / 5C — Punch Lists
-- Spec: docs/specs/5C-spec.md; design authority module5-architecture.md §5.9
-- (+ future_module_architecture §5.3). Supersedes CLAUDE_MODULES.md §6.4.
--
-- Interview deltas vs §5.9 (locked): two photos (reference + completion)
-- replace the single photo_file_id; per-item requirement toggles
-- (requires_completion_photo / requires_verification, both default ON);
-- completed_by/completed_at support the "completer can't verify own" rule.
--
-- Enforcement split (§7): RLS carries the row-level role gates; column-level
-- and cross-field rules (crew can't change toggles; photo-before-complete;
-- verifier ≠ completer) are SERVICE-LAYER. A hardening trigger for the toggle
-- columns is logged as tech debt.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. punch_lists (§2) — multiple lists per project
-- ----------------------------------------------------------------------------

CREATE TABLE public.punch_lists (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid DEFAULT public.get_my_company_id() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid DEFAULT auth.uid(),
    updated_by uuid DEFAULT auth.uid(),
    is_deleted boolean DEFAULT false,
    deleted_at timestamp with time zone,
    project_id uuid NOT NULL,
    name text NOT NULL,
    CONSTRAINT punch_lists_pkey PRIMARY KEY (id)
);

ALTER TABLE ONLY public.punch_lists
    ADD CONSTRAINT punch_lists_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);
ALTER TABLE ONLY public.punch_lists
    ADD CONSTRAINT punch_lists_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id);
ALTER TABLE ONLY public.punch_lists
    ADD CONSTRAINT punch_lists_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE ONLY public.punch_lists
    ADD CONSTRAINT punch_lists_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);

CREATE INDEX idx_punch_lists_company_id ON public.punch_lists USING btree (company_id);
CREATE INDEX idx_punch_lists_project_id ON public.punch_lists USING btree (project_id);

CREATE TRIGGER punch_lists_updated_at
  BEFORE UPDATE ON public.punch_lists
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE FUNCTION public.set_punch_lists_updated_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER punch_lists_set_updated_by
  BEFORE UPDATE ON public.punch_lists
  FOR EACH ROW EXECUTE FUNCTION public.set_punch_lists_updated_by();

-- ----------------------------------------------------------------------------
-- 2. punch_list_items (§3)
-- ----------------------------------------------------------------------------

CREATE TABLE public.punch_list_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid DEFAULT public.get_my_company_id() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid DEFAULT auth.uid(),
    updated_by uuid DEFAULT auth.uid(),
    is_deleted boolean DEFAULT false,
    deleted_at timestamp with time zone,
    punch_list_id uuid NOT NULL,
    project_id uuid NOT NULL,   -- denormalized for direct project queries (project-complete gate)
    title text NOT NULL,
    description text,
    status text DEFAULT 'open'::text NOT NULL,
    priority text,
    location text,
    trade text,

    assignee_id uuid,   -- broad; NOT membership-gated

    -- Photos (both Module 3 files; annotatable via the shared MarkupViewer)
    reference_photo_file_id uuid,
    completion_photo_file_id uuid,
    requires_completion_photo boolean DEFAULT true NOT NULL,
    requires_verification boolean DEFAULT true NOT NULL,

    -- Completion (supports verifier ≠ completer)
    completed_by uuid,
    completed_at timestamp with time zone,

    -- Verification
    verified_by uuid,
    verified_at timestamp with time zone,

    -- Module 9 hook (stub)
    is_client_visible boolean DEFAULT false,

    CONSTRAINT punch_list_items_pkey PRIMARY KEY (id),
    CONSTRAINT punch_list_items_status_check CHECK (status = ANY (ARRAY['open'::text, 'in_progress'::text, 'complete'::text, 'verified'::text])),
    CONSTRAINT punch_list_items_priority_check CHECK ((priority IS NULL) OR (priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'urgent'::text])))
);

ALTER TABLE ONLY public.punch_list_items
    ADD CONSTRAINT punch_list_items_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);
ALTER TABLE ONLY public.punch_list_items
    ADD CONSTRAINT punch_list_items_punch_list_id_fkey FOREIGN KEY (punch_list_id) REFERENCES public.punch_lists(id);
ALTER TABLE ONLY public.punch_list_items
    ADD CONSTRAINT punch_list_items_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id);
ALTER TABLE ONLY public.punch_list_items
    ADD CONSTRAINT punch_list_items_assignee_id_fkey FOREIGN KEY (assignee_id) REFERENCES public.company_members(id);
ALTER TABLE ONLY public.punch_list_items
    ADD CONSTRAINT punch_list_items_reference_photo_file_id_fkey FOREIGN KEY (reference_photo_file_id) REFERENCES public.files(id);
ALTER TABLE ONLY public.punch_list_items
    ADD CONSTRAINT punch_list_items_completion_photo_file_id_fkey FOREIGN KEY (completion_photo_file_id) REFERENCES public.files(id);
ALTER TABLE ONLY public.punch_list_items
    ADD CONSTRAINT punch_list_items_completed_by_fkey FOREIGN KEY (completed_by) REFERENCES public.company_members(id);
ALTER TABLE ONLY public.punch_list_items
    ADD CONSTRAINT punch_list_items_verified_by_fkey FOREIGN KEY (verified_by) REFERENCES public.company_members(id);
ALTER TABLE ONLY public.punch_list_items
    ADD CONSTRAINT punch_list_items_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE ONLY public.punch_list_items
    ADD CONSTRAINT punch_list_items_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);

CREATE INDEX idx_punch_list_items_company_id ON public.punch_list_items USING btree (company_id);
CREATE INDEX idx_punch_list_items_punch_list_id ON public.punch_list_items USING btree (punch_list_id);
CREATE INDEX idx_punch_list_items_project_id ON public.punch_list_items USING btree (project_id);
CREATE INDEX idx_punch_list_items_assignee_id ON public.punch_list_items USING btree (assignee_id);
CREATE INDEX idx_punch_list_items_status ON public.punch_list_items USING btree (status);

CREATE TRIGGER punch_list_items_updated_at
  BEFORE UPDATE ON public.punch_list_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE FUNCTION public.set_punch_list_items_updated_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER punch_list_items_set_updated_by
  BEFORE UPDATE ON public.punch_list_items
  FOR EACH ROW EXECUTE FUNCTION public.set_punch_list_items_updated_by();

-- ----------------------------------------------------------------------------
-- 3. RLS (§7/§8)
--    Read: project-visible (crew must see a project's lists to add to them).
--    Create lists/items + edit item fields: ALL roles including Crew.
--    Column-level rules (toggles Foreman+; verify not-completer; photo gate)
--    and soft-delete restriction (Foreman+) are service-layer.
-- ----------------------------------------------------------------------------

ALTER TABLE public.punch_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY punch_lists_select_visible ON public.punch_lists
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.can_view_project(project_id)
  );

CREATE POLICY punch_lists_insert_authenticated ON public.punch_lists
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND public.can_view_project(project_id)
  );

CREATE POLICY punch_lists_update_authenticated ON public.punch_lists
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.can_view_project(project_id)
  );

ALTER TABLE public.punch_list_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY punch_list_items_select_visible ON public.punch_list_items
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND (
      public.can_view_project(project_id)
      -- broad assignment: an assignee sees their own punch item even without
      -- a project_assignments row (consistent with tasks)
      OR assignee_id = public.get_my_member_id()
    )
  );

CREATE POLICY punch_list_items_insert_authenticated ON public.punch_list_items
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND public.can_view_project(project_id)
  );

CREATE POLICY punch_list_items_update_authenticated ON public.punch_list_items
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND (
      public.can_view_project(project_id)
      OR assignee_id = public.get_my_member_id()
    )
  );
