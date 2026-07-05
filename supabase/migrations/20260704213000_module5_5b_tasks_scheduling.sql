-- ============================================================================
-- Module 5 / 5B — Tasks & Scheduling
-- Spec: docs/specs/5B-spec.md; design authority module5-architecture.md §5.4/§5.5
--
-- Locked model: a task's dates ARE its schedule (Q-N5) — schedule_entries
-- holds general (task-less) items only; the calendar reads a UNION of dated
-- tasks + general entries + inspections (inspections as a job-level third
-- source per the flagged Q-N12 divergence).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. phases (§4) — name + sort order only; dates/status roll up from tasks
--    at read, never stored.
-- ----------------------------------------------------------------------------

CREATE TABLE public.phases (
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
    sort_order integer NOT NULL,
    CONSTRAINT phases_pkey PRIMARY KEY (id)
);

ALTER TABLE ONLY public.phases
    ADD CONSTRAINT phases_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);
ALTER TABLE ONLY public.phases
    ADD CONSTRAINT phases_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id);
ALTER TABLE ONLY public.phases
    ADD CONSTRAINT phases_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE ONLY public.phases
    ADD CONSTRAINT phases_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);

CREATE INDEX idx_phases_company_id ON public.phases USING btree (company_id);
CREATE INDEX idx_phases_project_id ON public.phases USING btree (project_id);

CREATE TRIGGER phases_updated_at
  BEFORE UPDATE ON public.phases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE FUNCTION public.set_phases_updated_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER phases_set_updated_by
  BEFORE UPDATE ON public.phases
  FOR EACH ROW EXECUTE FUNCTION public.set_phases_updated_by();

-- ----------------------------------------------------------------------------
-- 2. tasks (§2)
-- ----------------------------------------------------------------------------

CREATE TABLE public.tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid DEFAULT public.get_my_company_id() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid DEFAULT auth.uid(),
    updated_by uuid DEFAULT auth.uid(),
    is_deleted boolean DEFAULT false,
    deleted_at timestamp with time zone,
    project_id uuid NOT NULL,
    phase_id uuid,
    title text NOT NULL,
    description text,
    status text DEFAULT 'not_started'::text NOT NULL,
    priority text,
    percent_complete integer DEFAULT 0,

    -- Dating: open-ended OR date-assigned (dates ARE the schedule)
    start_date date,
    due_date date,
    is_scheduled boolean GENERATED ALWAYS AS ((start_date IS NOT NULL) OR (due_date IS NOT NULL)) STORED,

    -- Completion, independent of the plan (§2)
    completed_at timestamp with time zone,

    -- Assignment — any company member, NOT gated by project membership
    assignee_id uuid,

    -- 5D forward hook: bare nullable UUID, NO FK (change_orders doesn't exist
    -- yet; the FK is added by the 5D migration — same stubbing pattern as
    -- 4C's estimates.project_id)
    change_order_id uuid,

    CONSTRAINT tasks_pkey PRIMARY KEY (id),
    CONSTRAINT tasks_status_check CHECK (status = ANY (ARRAY['not_started'::text, 'in_progress'::text, 'blocked'::text, 'complete'::text])),
    CONSTRAINT tasks_priority_check CHECK ((priority IS NULL) OR (priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'urgent'::text]))),
    CONSTRAINT tasks_percent_complete_check CHECK (percent_complete >= 0 AND percent_complete <= 100)
);

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);
ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id);
ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_phase_id_fkey FOREIGN KEY (phase_id) REFERENCES public.phases(id);
ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_assignee_id_fkey FOREIGN KEY (assignee_id) REFERENCES public.company_members(id);
ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);

CREATE INDEX idx_tasks_company_id ON public.tasks USING btree (company_id);
CREATE INDEX idx_tasks_project_id ON public.tasks USING btree (project_id);
CREATE INDEX idx_tasks_phase_id ON public.tasks USING btree (phase_id);
CREATE INDEX idx_tasks_assignee_id ON public.tasks USING btree (assignee_id);
CREATE INDEX idx_tasks_start_date ON public.tasks USING btree (start_date);

CREATE TRIGGER tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE FUNCTION public.set_tasks_updated_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER tasks_set_updated_by
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_tasks_updated_by();

-- ----------------------------------------------------------------------------
-- 3. task_dependencies (§3) — powers Gantt dependency lines.
--    Cycle prevention is SERVICE-LAYER at launch (Q-N4; tech debt for DB
--    enforcement). Self-links rejected here.
-- ----------------------------------------------------------------------------

CREATE TABLE public.task_dependencies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid DEFAULT public.get_my_company_id() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid DEFAULT auth.uid(),
    updated_by uuid DEFAULT auth.uid(),
    is_deleted boolean DEFAULT false,
    deleted_at timestamp with time zone,
    predecessor_id uuid NOT NULL,
    successor_id uuid NOT NULL,
    dependency_type text DEFAULT 'finish_to_start'::text NOT NULL,
    CONSTRAINT task_dependencies_pkey PRIMARY KEY (id),
    CONSTRAINT task_dependencies_pair_key UNIQUE (predecessor_id, successor_id),
    CONSTRAINT task_dependencies_no_self_link CHECK (predecessor_id <> successor_id),
    CONSTRAINT task_dependencies_type_check CHECK (dependency_type = ANY (ARRAY['finish_to_start'::text, 'start_to_start'::text, 'finish_to_finish'::text, 'start_to_finish'::text]))
);

ALTER TABLE ONLY public.task_dependencies
    ADD CONSTRAINT task_dependencies_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);
ALTER TABLE ONLY public.task_dependencies
    ADD CONSTRAINT task_dependencies_predecessor_id_fkey FOREIGN KEY (predecessor_id) REFERENCES public.tasks(id);
ALTER TABLE ONLY public.task_dependencies
    ADD CONSTRAINT task_dependencies_successor_id_fkey FOREIGN KEY (successor_id) REFERENCES public.tasks(id);
ALTER TABLE ONLY public.task_dependencies
    ADD CONSTRAINT task_dependencies_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE ONLY public.task_dependencies
    ADD CONSTRAINT task_dependencies_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);

CREATE INDEX idx_task_dependencies_company_id ON public.task_dependencies USING btree (company_id);
CREATE INDEX idx_task_dependencies_predecessor_id ON public.task_dependencies USING btree (predecessor_id);
CREATE INDEX idx_task_dependencies_successor_id ON public.task_dependencies USING btree (successor_id);

CREATE TRIGGER task_dependencies_updated_at
  BEFORE UPDATE ON public.task_dependencies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE FUNCTION public.set_task_dependencies_updated_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER task_dependencies_set_updated_by
  BEFORE UPDATE ON public.task_dependencies
  FOR EACH ROW EXECUTE FUNCTION public.set_task_dependencies_updated_by();

-- ----------------------------------------------------------------------------
-- 4. schedule_entries (§5) — GENERAL (task-less) entries only, per Q-N5.
--    No entry_type / task_id columns: dated tasks are the calendar's other
--    source and are never copied here.
-- ----------------------------------------------------------------------------

CREATE TABLE public.schedule_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid DEFAULT public.get_my_company_id() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid DEFAULT auth.uid(),
    updated_by uuid DEFAULT auth.uid(),
    is_deleted boolean DEFAULT false,
    deleted_at timestamp with time zone,
    member_id uuid NOT NULL,
    project_id uuid,
    entry_date date NOT NULL,
    end_date date,
    general_kind text DEFAULT 'project'::text NOT NULL,
    notes text,
    CONSTRAINT schedule_entries_pkey PRIMARY KEY (id),
    CONSTRAINT schedule_entries_general_kind_check CHECK (general_kind = ANY (ARRAY['project'::text, 'pto'::text, 'shop'::text, 'other'::text])),
    CONSTRAINT schedule_entries_date_range_check CHECK ((end_date IS NULL) OR (end_date >= entry_date))
);

ALTER TABLE ONLY public.schedule_entries
    ADD CONSTRAINT schedule_entries_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);
ALTER TABLE ONLY public.schedule_entries
    ADD CONSTRAINT schedule_entries_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.company_members(id);
ALTER TABLE ONLY public.schedule_entries
    ADD CONSTRAINT schedule_entries_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id);
ALTER TABLE ONLY public.schedule_entries
    ADD CONSTRAINT schedule_entries_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE ONLY public.schedule_entries
    ADD CONSTRAINT schedule_entries_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);

CREATE INDEX idx_schedule_entries_company_id ON public.schedule_entries USING btree (company_id);
CREATE INDEX idx_schedule_entries_member_id ON public.schedule_entries USING btree (member_id);
CREATE INDEX idx_schedule_entries_project_id ON public.schedule_entries USING btree (project_id);
CREATE INDEX idx_schedule_entries_entry_date ON public.schedule_entries USING btree (entry_date);

CREATE TRIGGER schedule_entries_updated_at
  BEFORE UPDATE ON public.schedule_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE FUNCTION public.set_schedule_entries_updated_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER schedule_entries_set_updated_by
  BEFORE UPDATE ON public.schedule_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_schedule_entries_updated_by();

-- ----------------------------------------------------------------------------
-- 5. inspections (§7) — the inspection event/outcome; the permit PDF itself
--    is a Module 3 file. Job-level calendar events (no member).
-- ----------------------------------------------------------------------------

CREATE TABLE public.inspections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid DEFAULT public.get_my_company_id() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid DEFAULT auth.uid(),
    updated_by uuid DEFAULT auth.uid(),
    is_deleted boolean DEFAULT false,
    deleted_at timestamp with time zone,
    project_id uuid NOT NULL,
    inspection_type text NOT NULL,
    scheduled_date date,
    result text DEFAULT 'pending'::text NOT NULL,
    inspector text,
    permit_file_id uuid,
    notes text,
    CONSTRAINT inspections_pkey PRIMARY KEY (id),
    CONSTRAINT inspections_result_check CHECK (result = ANY (ARRAY['pass'::text, 'fail'::text, 'pending'::text]))
);

ALTER TABLE ONLY public.inspections
    ADD CONSTRAINT inspections_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);
ALTER TABLE ONLY public.inspections
    ADD CONSTRAINT inspections_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id);
ALTER TABLE ONLY public.inspections
    ADD CONSTRAINT inspections_permit_file_id_fkey FOREIGN KEY (permit_file_id) REFERENCES public.files(id);
ALTER TABLE ONLY public.inspections
    ADD CONSTRAINT inspections_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE ONLY public.inspections
    ADD CONSTRAINT inspections_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);

CREATE INDEX idx_inspections_company_id ON public.inspections USING btree (company_id);
CREATE INDEX idx_inspections_project_id ON public.inspections USING btree (project_id);
CREATE INDEX idx_inspections_scheduled_date ON public.inspections USING btree (scheduled_date);

CREATE TRIGGER inspections_updated_at
  BEFORE UPDATE ON public.inspections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE FUNCTION public.set_inspections_updated_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER inspections_set_updated_by
  BEFORE UPDATE ON public.inspections
  FOR EACH ROW EXECUTE FUNCTION public.set_inspections_updated_by();

-- ----------------------------------------------------------------------------
-- 6. RLS (§9)
--    Reads inherit 5A §3 project visibility. Assignment/schedule writes:
--    Owner/Admin/PM/Foreman. Crew: may update status/progress on their OWN
--    assigned tasks (column-level rules service-layer); sees only their own
--    schedule_entries (§5.5b crew = own only).
-- ----------------------------------------------------------------------------

ALTER TABLE public.phases ENABLE ROW LEVEL SECURITY;

CREATE POLICY phases_select_visible ON public.phases
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.can_view_project(project_id)
  );

CREATE POLICY phases_insert_authorized ON public.phases
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text, 'foreman'::text])
    AND public.can_view_project(project_id)
  );

CREATE POLICY phases_update_authorized ON public.phases
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text, 'foreman'::text])
    AND public.can_view_project(project_id)
  );

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY tasks_select_visible ON public.tasks
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND (
      public.can_view_project(project_id)
      -- broad assignment: an assignee always sees their own task even
      -- without a project_assignments row (assignment is NOT job-gated)
      OR assignee_id = public.get_my_member_id()
    )
  );

CREATE POLICY tasks_insert_authorized ON public.tasks
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text, 'foreman'::text])
    AND public.can_view_project(project_id)
  );

CREATE POLICY tasks_update_authorized ON public.tasks
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND (
      (
        public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text, 'foreman'::text])
        AND public.can_view_project(project_id)
      )
      -- crew: status/progress updates on their own tasks (column-level
      -- restriction enforced in the service layer)
      OR assignee_id = public.get_my_member_id()
    )
  );

ALTER TABLE public.task_dependencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY task_dependencies_select_visible ON public.task_dependencies
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_dependencies.predecessor_id
        AND public.can_view_project(t.project_id)
    )
  );

CREATE POLICY task_dependencies_insert_authorized ON public.task_dependencies
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text, 'foreman'::text])
  );

CREATE POLICY task_dependencies_update_authorized ON public.task_dependencies
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text, 'foreman'::text])
  );

ALTER TABLE public.schedule_entries ENABLE ROW LEVEL SECURITY;

-- §5.5b: Owner/Admin/PM/Foreman view everyone; Crew views OWN ONLY.
CREATE POLICY schedule_entries_select_scoped ON public.schedule_entries
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND (
      public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text, 'foreman'::text])
      OR member_id = public.get_my_member_id()
    )
  );

CREATE POLICY schedule_entries_insert_authorized ON public.schedule_entries
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text, 'foreman'::text])
  );

CREATE POLICY schedule_entries_update_authorized ON public.schedule_entries
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text, 'foreman'::text])
  );

ALTER TABLE public.inspections ENABLE ROW LEVEL SECURITY;

CREATE POLICY inspections_select_visible ON public.inspections
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.can_view_project(project_id)
  );

CREATE POLICY inspections_insert_authorized ON public.inspections
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text, 'foreman'::text])
    AND public.can_view_project(project_id)
  );

CREATE POLICY inspections_update_authorized ON public.inspections
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text, 'foreman'::text])
    AND public.can_view_project(project_id)
  );
