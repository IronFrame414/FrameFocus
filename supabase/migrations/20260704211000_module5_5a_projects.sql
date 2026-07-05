-- ============================================================================
-- Module 5 / 5A — Projects & Conversion (part 1: tables, numbering, RLS)
-- Spec: docs/specs/5A-spec.md §1–7; design authority module5-architecture.md
-- Conversion RPC + budget baseline + M4 amendments land in the follow-up
-- migration (5A §8).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Numbering counters + helpers (§2)
--    Q-N1 = shared pool: manual projects draw from the SAME
--    companies.estimate_number_sequence as estimates, so EST and PRJ numbers
--    never collide. project_internal_seq has its own counter.
-- ----------------------------------------------------------------------------

ALTER TABLE public.companies ADD COLUMN project_internal_sequence integer DEFAULT 0 NOT NULL;

CREATE FUNCTION public.next_project_internal_seq() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_company_id UUID := get_my_company_id();
  v_seq INTEGER;
BEGIN
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'next_project_internal_seq: no company for caller';
  END IF;

  UPDATE companies
  SET project_internal_sequence = project_internal_sequence + 1
  WHERE id = v_company_id
  RETURNING project_internal_sequence
  INTO v_seq;

  RETURN v_seq;
END;
$$;

-- Manual (non-converted) projects draw a fresh number from the shared
-- estimate pool. Converted projects copy the estimate's digits instead
-- (handled by the conversion RPC) and never call this.
CREATE FUNCTION public.next_project_number() RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_company_id UUID := get_my_company_id();
  v_seq INTEGER;
BEGIN
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'next_project_number: no company for caller';
  END IF;

  UPDATE companies
  SET estimate_number_sequence = estimate_number_sequence + 1
  WHERE id = v_company_id
  RETURNING estimate_number_sequence
  INTO v_seq;

  -- Same conditional lpad as next_estimate_number(): 3-digit minimum, grow
  -- past 999 without truncation.
  RETURN 'PRJ-' ||
    CASE
      WHEN length(v_seq::text) >= 3 THEN v_seq::text
      ELSE lpad(v_seq::text, 3, '0')
    END;
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. projects (§2)
-- ----------------------------------------------------------------------------

CREATE TABLE public.projects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid DEFAULT public.get_my_company_id() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid DEFAULT auth.uid(),
    updated_by uuid DEFAULT auth.uid(),
    is_deleted boolean DEFAULT false,
    deleted_at timestamp with time zone,

    -- Identity
    project_number text DEFAULT public.next_project_number() NOT NULL,
    project_internal_seq integer DEFAULT public.next_project_internal_seq() NOT NULL,
    name text NOT NULL,

    -- Relations
    contact_id uuid NOT NULL,
    contact_address_id uuid,
    source_estimate_id uuid,

    -- Type & lifecycle
    project_type text DEFAULT 'fixed_price'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,

    -- Financials (baseline at launch; Module 7 populates actuals)
    contract_value numeric,
    retainage_percent numeric,
    tax_rate numeric,

    -- Scheduling summary (denormalized convenience)
    start_date date,
    target_end_date date,
    actual_end_date date,

    -- Carryover content (mirrors the merged M4 estimate scope model)
    scope_summary text,
    scope_sections jsonb,
    cover_letter text,
    terms_sections jsonb,
    internal_notes text,

    -- CO counter (5D numbering)
    change_order_sequence integer DEFAULT 0 NOT NULL,

    CONSTRAINT projects_pkey PRIMARY KEY (id),
    CONSTRAINT projects_project_type_check CHECK (project_type = ANY (ARRAY['fixed_price'::text, 'time_and_materials'::text, 'cost_plus'::text])),
    CONSTRAINT projects_status_check CHECK (status = ANY (ARRAY['active'::text, 'on_hold'::text, 'complete'::text, 'archived'::text, 'cancelled'::text])),
    CONSTRAINT projects_company_project_number_key UNIQUE (company_id, project_number)
);

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);
ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id);
ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_contact_address_id_fkey FOREIGN KEY (contact_address_id) REFERENCES public.contact_addresses(id);
ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_source_estimate_id_fkey FOREIGN KEY (source_estimate_id) REFERENCES public.estimates(id);
ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);

CREATE INDEX idx_projects_company_id ON public.projects USING btree (company_id);
CREATE INDEX idx_projects_contact_id ON public.projects USING btree (contact_id);
CREATE INDEX idx_projects_source_estimate_id ON public.projects USING btree (source_estimate_id);
CREATE INDEX idx_projects_status ON public.projects USING btree (status);

CREATE TRIGGER projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE FUNCTION public.set_projects_updated_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER projects_set_updated_by
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.set_projects_updated_by();

-- ----------------------------------------------------------------------------
-- 3. project_assignments (§4) — the visibility key for PM/Foreman/Crew
-- ----------------------------------------------------------------------------

CREATE TABLE public.project_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid DEFAULT public.get_my_company_id() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid DEFAULT auth.uid(),
    updated_by uuid DEFAULT auth.uid(),
    is_deleted boolean DEFAULT false,
    deleted_at timestamp with time zone,
    project_id uuid NOT NULL,
    member_id uuid NOT NULL,
    role_on_project text,
    CONSTRAINT project_assignments_pkey PRIMARY KEY (id),
    CONSTRAINT project_assignments_project_member_key UNIQUE (project_id, member_id)
);

ALTER TABLE ONLY public.project_assignments
    ADD CONSTRAINT project_assignments_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);
ALTER TABLE ONLY public.project_assignments
    ADD CONSTRAINT project_assignments_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id);
ALTER TABLE ONLY public.project_assignments
    ADD CONSTRAINT project_assignments_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.company_members(id);
ALTER TABLE ONLY public.project_assignments
    ADD CONSTRAINT project_assignments_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE ONLY public.project_assignments
    ADD CONSTRAINT project_assignments_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);

CREATE INDEX idx_project_assignments_company_id ON public.project_assignments USING btree (company_id);
CREATE INDEX idx_project_assignments_project_id ON public.project_assignments USING btree (project_id);
CREATE INDEX idx_project_assignments_member_id ON public.project_assignments USING btree (member_id);

CREATE TRIGGER project_assignments_updated_at
  BEFORE UPDATE ON public.project_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE FUNCTION public.set_project_assignments_updated_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER project_assignments_set_updated_by
  BEFORE UPDATE ON public.project_assignments
  FOR EACH ROW EXECUTE FUNCTION public.set_project_assignments_updated_by();

-- ----------------------------------------------------------------------------
-- 4. Visibility helpers (§3)
--    SECURITY DEFINER SQL so the projects policy can consult
--    project_assignments (and children can consult projects) WITHOUT circular
--    RLS recursion. Same pattern as get_invitation_for_signup (Migration 015).
-- ----------------------------------------------------------------------------

CREATE FUNCTION public.is_assigned_to_project(p_project_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM project_assignments pa
    WHERE pa.project_id = p_project_id
      AND pa.member_id = get_my_member_id()
      AND pa.is_deleted = false
  );
$$;

-- Creator check (RLS-bypassing): lets a PM self-assign to a project they just
-- created — without this, manual creation by a PM strands the project
-- (visibility is assignment-based, and the assignment INSERT policy would
-- otherwise require already being assigned).
CREATE FUNCTION public.is_project_creator(p_project_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM projects pr
    WHERE pr.id = p_project_id
      AND pr.created_by = auth.uid()
  );
$$;

-- Owner/Admin see every company project; PM/Foreman/Crew see assigned only
-- (Q-N2 as locked in 5A §3). Child-table policies call this for the
-- parent-visible pattern.
CREATE FUNCTION public.can_view_project(p_project_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM projects pr
    WHERE pr.id = p_project_id
      AND pr.company_id = get_my_company_id()
      AND (
        get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
        OR is_assigned_to_project(p_project_id)
      )
  );
$$;

-- ----------------------------------------------------------------------------
-- 5. RLS — projects + project_assignments
--    Soft-delete stays visible to RLS (trash-bin pattern: filtering is
--    service-layer). Soft-delete restricted to Owner/Admin in the service
--    layer, consistent with contacts/subcontractors.
-- ----------------------------------------------------------------------------

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY projects_select_visible ON public.projects
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND (
      public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
      OR public.is_assigned_to_project(id)
    )
  );

CREATE POLICY projects_insert_authorized ON public.projects
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text])
  );

CREATE POLICY projects_update_authorized ON public.projects
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND (
      public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
      OR (
        public.get_my_role() = 'project_manager'::text
        AND public.is_assigned_to_project(id)
      )
    )
  );

ALTER TABLE public.project_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY project_assignments_select_visible ON public.project_assignments
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.can_view_project(project_id)
  );

CREATE POLICY project_assignments_insert_authorized ON public.project_assignments
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND (
      public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
      OR (
        public.get_my_role() = 'project_manager'::text
        AND (
          public.is_assigned_to_project(project_id)
          -- self-assignment on a project this PM created (bootstrap case)
          OR (
            member_id = public.get_my_member_id()
            AND public.is_project_creator(project_id)
          )
        )
      )
    )
  );

CREATE POLICY project_assignments_update_authorized ON public.project_assignments
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND (
      public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
      OR (
        public.get_my_role() = 'project_manager'::text
        AND public.is_assigned_to_project(project_id)
      )
    )
  );

-- ----------------------------------------------------------------------------
-- 6. client_contracts (§6a, Q-N9 = own table; re-issues are new rows)
-- ----------------------------------------------------------------------------

CREATE TABLE public.client_contracts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid DEFAULT public.get_my_company_id() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid DEFAULT auth.uid(),
    updated_by uuid DEFAULT auth.uid(),
    is_deleted boolean DEFAULT false,
    deleted_at timestamp with time zone,
    project_id uuid NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    contract_value numeric,
    signed_proposal_file_id uuid,
    executed_date date,
    notes text,
    CONSTRAINT client_contracts_pkey PRIMARY KEY (id),
    CONSTRAINT client_contracts_status_check CHECK (status = ANY (ARRAY['draft'::text, 'sent'::text, 'signed'::text, 'void'::text]))
);

ALTER TABLE ONLY public.client_contracts
    ADD CONSTRAINT client_contracts_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);
ALTER TABLE ONLY public.client_contracts
    ADD CONSTRAINT client_contracts_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id);
ALTER TABLE ONLY public.client_contracts
    ADD CONSTRAINT client_contracts_signed_proposal_file_id_fkey FOREIGN KEY (signed_proposal_file_id) REFERENCES public.files(id);
ALTER TABLE ONLY public.client_contracts
    ADD CONSTRAINT client_contracts_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE ONLY public.client_contracts
    ADD CONSTRAINT client_contracts_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);

CREATE INDEX idx_client_contracts_company_id ON public.client_contracts USING btree (company_id);
CREATE INDEX idx_client_contracts_project_id ON public.client_contracts USING btree (project_id);

CREATE TRIGGER client_contracts_updated_at
  BEFORE UPDATE ON public.client_contracts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE FUNCTION public.set_client_contracts_updated_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER client_contracts_set_updated_by
  BEFORE UPDATE ON public.client_contracts
  FOR EACH ROW EXECUTE FUNCTION public.set_client_contracts_updated_by();

ALTER TABLE public.client_contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY client_contracts_select_visible ON public.client_contracts
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.can_view_project(project_id)
  );

CREATE POLICY client_contracts_insert_authorized ON public.client_contracts
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND (
      public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
      OR (
        public.get_my_role() = 'project_manager'::text
        AND public.is_assigned_to_project(project_id)
      )
    )
  );

CREATE POLICY client_contracts_update_authorized ON public.client_contracts
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND (
      public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
      OR (
        public.get_my_role() = 'project_manager'::text
        AND public.is_assigned_to_project(project_id)
      )
    )
  );

-- ----------------------------------------------------------------------------
-- 7. subcontractor_contracts (§6b, Q-N10 — record here; M7 draw schedule
--    FKs to this table later)
-- ----------------------------------------------------------------------------

CREATE TABLE public.subcontractor_contracts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid DEFAULT public.get_my_company_id() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid DEFAULT auth.uid(),
    updated_by uuid DEFAULT auth.uid(),
    is_deleted boolean DEFAULT false,
    deleted_at timestamp with time zone,
    project_id uuid NOT NULL,
    member_id uuid NOT NULL,
    scope_of_work text,
    contract_value numeric,
    signed_doc_file_id uuid,
    status text DEFAULT 'draft'::text NOT NULL,
    executed_date date,
    notes text,
    CONSTRAINT subcontractor_contracts_pkey PRIMARY KEY (id),
    CONSTRAINT subcontractor_contracts_status_check CHECK (status = ANY (ARRAY['draft'::text, 'sent'::text, 'signed'::text, 'void'::text]))
);

ALTER TABLE ONLY public.subcontractor_contracts
    ADD CONSTRAINT subcontractor_contracts_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);
ALTER TABLE ONLY public.subcontractor_contracts
    ADD CONSTRAINT subcontractor_contracts_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id);
ALTER TABLE ONLY public.subcontractor_contracts
    ADD CONSTRAINT subcontractor_contracts_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.company_members(id);
ALTER TABLE ONLY public.subcontractor_contracts
    ADD CONSTRAINT subcontractor_contracts_signed_doc_file_id_fkey FOREIGN KEY (signed_doc_file_id) REFERENCES public.files(id);
ALTER TABLE ONLY public.subcontractor_contracts
    ADD CONSTRAINT subcontractor_contracts_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE ONLY public.subcontractor_contracts
    ADD CONSTRAINT subcontractor_contracts_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);

CREATE INDEX idx_subcontractor_contracts_company_id ON public.subcontractor_contracts USING btree (company_id);
CREATE INDEX idx_subcontractor_contracts_project_id ON public.subcontractor_contracts USING btree (project_id);
CREATE INDEX idx_subcontractor_contracts_member_id ON public.subcontractor_contracts USING btree (member_id);

CREATE TRIGGER subcontractor_contracts_updated_at
  BEFORE UPDATE ON public.subcontractor_contracts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE FUNCTION public.set_subcontractor_contracts_updated_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER subcontractor_contracts_set_updated_by
  BEFORE UPDATE ON public.subcontractor_contracts
  FOR EACH ROW EXECUTE FUNCTION public.set_subcontractor_contracts_updated_by();

ALTER TABLE public.subcontractor_contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY subcontractor_contracts_select_visible ON public.subcontractor_contracts
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.can_view_project(project_id)
  );

CREATE POLICY subcontractor_contracts_insert_authorized ON public.subcontractor_contracts
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND (
      public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
      OR (
        public.get_my_role() = 'project_manager'::text
        AND public.is_assigned_to_project(project_id)
      )
    )
  );

CREATE POLICY subcontractor_contracts_update_authorized ON public.subcontractor_contracts
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND (
      public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
      OR (
        public.get_my_role() = 'project_manager'::text
        AND public.is_assigned_to_project(project_id)
      )
    )
  );

-- ----------------------------------------------------------------------------
-- 8. Project contacts (§7)
--    7a: widen contacts.contact_type for external stakeholders (verified: the
--        CHECK exists in the shipped schema, so this is a real migration).
--    7b: project_contacts junction (write-through to the Module 2 CRM list).
-- ----------------------------------------------------------------------------

ALTER TABLE public.contacts DROP CONSTRAINT contacts_contact_type_check;
ALTER TABLE public.contacts ADD CONSTRAINT contacts_contact_type_check
  CHECK (contact_type = ANY (ARRAY['lead'::text, 'client'::text, 'vendor'::text, 'architect'::text, 'inspector'::text, 'building_dept'::text, 'other_external'::text]));

CREATE TABLE public.project_contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid DEFAULT public.get_my_company_id() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid DEFAULT auth.uid(),
    updated_by uuid DEFAULT auth.uid(),
    is_deleted boolean DEFAULT false,
    deleted_at timestamp with time zone,
    project_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    role text,
    notes text,
    CONSTRAINT project_contacts_pkey PRIMARY KEY (id),
    CONSTRAINT project_contacts_project_contact_key UNIQUE (project_id, contact_id)
);

ALTER TABLE ONLY public.project_contacts
    ADD CONSTRAINT project_contacts_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);
ALTER TABLE ONLY public.project_contacts
    ADD CONSTRAINT project_contacts_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id);
ALTER TABLE ONLY public.project_contacts
    ADD CONSTRAINT project_contacts_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id);
ALTER TABLE ONLY public.project_contacts
    ADD CONSTRAINT project_contacts_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE ONLY public.project_contacts
    ADD CONSTRAINT project_contacts_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);

CREATE INDEX idx_project_contacts_company_id ON public.project_contacts USING btree (company_id);
CREATE INDEX idx_project_contacts_project_id ON public.project_contacts USING btree (project_id);
CREATE INDEX idx_project_contacts_contact_id ON public.project_contacts USING btree (contact_id);

CREATE TRIGGER project_contacts_updated_at
  BEFORE UPDATE ON public.project_contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE FUNCTION public.set_project_contacts_updated_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER project_contacts_set_updated_by
  BEFORE UPDATE ON public.project_contacts
  FOR EACH ROW EXECUTE FUNCTION public.set_project_contacts_updated_by();

ALTER TABLE public.project_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY project_contacts_select_visible ON public.project_contacts
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.can_view_project(project_id)
  );

CREATE POLICY project_contacts_insert_authorized ON public.project_contacts
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND (
      public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
      OR (
        public.get_my_role() = 'project_manager'::text
        AND public.is_assigned_to_project(project_id)
      )
    )
  );

CREATE POLICY project_contacts_update_authorized ON public.project_contacts
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND (
      public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
      OR (
        public.get_my_role() = 'project_manager'::text
        AND public.is_assigned_to_project(project_id)
      )
    )
  );

-- ----------------------------------------------------------------------------
-- 9. Wire the pre-existing bare project_id columns (§5, §5.13 #1 partial)
--    files.project_id has carried project paths since Module 3;
--    estimates.project_id was reserved by 4C decision D1.
-- ----------------------------------------------------------------------------

-- Orphan guard: Module 3 was tested with placeholder project UUIDs before
-- projects existed (STATE.md known gotcha). NULL any project_id that doesn't
-- resolve so the FK can be added. (Reported at apply time for review.)
DO $$
DECLARE
  v_orphans integer;
BEGIN
  UPDATE public.files f
  SET project_id = NULL
  WHERE f.project_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.projects p WHERE p.id = f.project_id);
  GET DIAGNOSTICS v_orphans = ROW_COUNT;
  IF v_orphans > 0 THEN
    RAISE NOTICE 'files.project_id: nulled % orphaned placeholder value(s) before adding FK', v_orphans;
  END IF;

  UPDATE public.estimates e
  SET project_id = NULL
  WHERE e.project_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.projects p WHERE p.id = e.project_id);
  GET DIAGNOSTICS v_orphans = ROW_COUNT;
  IF v_orphans > 0 THEN
    RAISE NOTICE 'estimates.project_id: nulled % orphaned value(s) before adding FK', v_orphans;
  END IF;
END $$;

ALTER TABLE ONLY public.files
    ADD CONSTRAINT files_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id);

ALTER TABLE ONLY public.estimates
    ADD CONSTRAINT estimates_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id);
