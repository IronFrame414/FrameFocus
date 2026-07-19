-- ============================================================================
-- Module 6 / 6C — Safety Incidents
-- Spec: docs/specs/6C-spec.md (Sessions 63–69). Build decisions locked in the
-- Module 6B/6C/6D build prompt (Session 70 Phase 2, all confirmed):
--
-- Three tables:
--   safety_incidents           — the formal record (injury / property damage
--                                / near miss). project_id NULLABLE — a shop or
--                                yard incident has no project and must still
--                                be reportable (locked 6C-1).
--   safety_incident_injuries   — injured parties, one row each; a single
--                                incident can hurt more than one person, and
--                                treatment is captured PER injured person
--                                (spec §2.1). Member OR outsider.
--   safety_incident_witnesses  — witnesses, member OR outsider (spec §2.2).
--
-- Locked build decisions applied here:
--   * Injury invariant — incident_type = 'injury' requires at least one
--     injuries row — is enforced by DEFERRABLE INITIALLY DEFERRED CONSTRAINT
--     TRIGGERS (fail closed, checked at COMMIT). Creation goes through the
--     create_safety_incident() RPC so parent + children land in ONE
--     transaction (PostgREST runs each REST call in its own transaction —
--     separate inserts would trip the deferred check). App code pre-validates
--     too, but the trigger is the enforcement (locked 6C-3 / Q9).
--   * Edit rights: reporter + Owner/Admin — treatment details arrive late and
--     may be added by the Owner even when a crew member filed it (locked 6C-2).
--     The record never locks.
--   * Domain reporter is reported_by_member_id (company_members FK, DEFAULT
--     get_my_member_id()); created_by/updated_by stay audit auth.uid() —
--     the change_orders.author_member_id pattern (5D).
--   * Member-or-outsider identity on both child tables via
--     CHECK (num_nonnulls(member_id, <name>) = 1) — verified Postgres-native.
--   * incident_type values are declared ONCE in
--     packages/shared/constants/safety.ts; this CHECK mirrors that file.
--     Do not hand-declare the list anywhere else (the row_type enum
--     duplicated across five files is the anti-pattern).
--   * email_logs.email_type CHECK widened with 'safety_incident';
--     files.category CHECK widened with 'safety' (incident PDFs file to a
--     Safety location: {company_id}/{project_id}/... for project incidents,
--     {company_id}/safety/... for NULL-project incidents — storage RLS keys
--     only on the first path segment, verified against the bucket migration).
--
-- RLS (spec §5 as resolved + locked 6C-8 + Q8):
--   * Read: project incidents via can_view_project(); NULL-project incidents
--     readable by Owner/Admin/PM/Foreman AND by their reporter (Q8 — a crew
--     member who files a shop injury must be able to see it afterward).
--   * Create: any member, on a visible project (or no project).
--   * Edit: reporter or Owner/Admin. Soft delete: Owner/Admin only
--     (WITH CHECK-enforced). No DELETE policy on the parent.
--   * Children inherit the parent's visibility/editability.
--
-- Ordering note: tables are created BEFORE the functions that reference them
-- (bodies validate at CREATE time — the 6A lesson).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. CHECK widenings.
-- ----------------------------------------------------------------------------

-- email_logs: allow 'safety_incident' (keeps 'material_delivery' added by 6D).
ALTER TABLE public.email_logs DROP CONSTRAINT email_logs_email_type_check;
ALTER TABLE public.email_logs ADD CONSTRAINT email_logs_email_type_check
  CHECK (email_type = ANY (ARRAY[
    'proposal'::text,
    'reminder'::text,
    'signature_complete'::text,
    'signature_declined'::text,
    'estimate_expired'::text,
    'change_order'::text,
    'co_reminder'::text,
    'co_signature_complete'::text,
    'co_signature_declined'::text,
    'safety_incident'::text,
    'material_delivery'::text
  ]));
-- files: add the 'safety' category for incident PDFs.
ALTER TABLE public.files DROP CONSTRAINT files_category_check;
ALTER TABLE public.files ADD CONSTRAINT files_category_check
  CHECK (category = ANY (ARRAY[
    'photos'::text,
    'contracts'::text,
    'plans'::text,
    'permits'::text,
    'invoices'::text,
    'change_orders'::text,
    'daily_logs'::text,
    'receipts'::text,
    'safety'::text,
    'other'::text
  ]));
-- ----------------------------------------------------------------------------
-- 1. safety_incidents (§2)
-- ----------------------------------------------------------------------------

CREATE TABLE public.safety_incidents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid DEFAULT public.get_my_company_id() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid DEFAULT auth.uid(),
    updated_by uuid DEFAULT auth.uid(),
    is_deleted boolean DEFAULT false,
    deleted_at timestamp with time zone,

    project_id uuid,                          -- NULLABLE: shop/yard incident (locked 6C-1)
    incident_date date NOT NULL,
    incident_type text NOT NULL,              -- mirrors packages/shared/constants/safety.ts
    description text NOT NULL,
    pdf_file_id uuid,                         -- M3; regenerated (overwritten) on edit (§7)
    reported_by_member_id uuid DEFAULT public.get_my_member_id() NOT NULL,  -- domain reporter (§5)

    CONSTRAINT safety_incidents_pkey PRIMARY KEY (id),
    CONSTRAINT safety_incidents_incident_type_check
      CHECK (incident_type = ANY (ARRAY['injury'::text, 'property_damage'::text, 'near_miss'::text]))
);
ALTER TABLE ONLY public.safety_incidents
    ADD CONSTRAINT safety_incidents_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);
ALTER TABLE ONLY public.safety_incidents
    ADD CONSTRAINT safety_incidents_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id);
ALTER TABLE ONLY public.safety_incidents
    ADD CONSTRAINT safety_incidents_pdf_file_id_fkey FOREIGN KEY (pdf_file_id) REFERENCES public.files(id);
ALTER TABLE ONLY public.safety_incidents
    ADD CONSTRAINT safety_incidents_reported_by_member_id_fkey FOREIGN KEY (reported_by_member_id) REFERENCES public.company_members(id);
ALTER TABLE ONLY public.safety_incidents
    ADD CONSTRAINT safety_incidents_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE ONLY public.safety_incidents
    ADD CONSTRAINT safety_incidents_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);
CREATE INDEX idx_safety_incidents_company_id ON public.safety_incidents USING btree (company_id);
CREATE INDEX idx_safety_incidents_project_id ON public.safety_incidents USING btree (project_id);
CREATE INDEX idx_safety_incidents_incident_date ON public.safety_incidents USING btree (incident_date);
CREATE TRIGGER safety_incidents_updated_at
  BEFORE UPDATE ON public.safety_incidents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE OR REPLACE FUNCTION public.set_safety_incidents_updated_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
CREATE TRIGGER safety_incidents_set_updated_by
  BEFORE UPDATE ON public.safety_incidents
  FOR EACH ROW EXECUTE FUNCTION public.set_safety_incidents_updated_by();
-- ----------------------------------------------------------------------------
-- 2. safety_incident_injuries — injured parties, one row each (§2.1)
-- ----------------------------------------------------------------------------

CREATE TABLE public.safety_incident_injuries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid DEFAULT public.get_my_company_id() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid DEFAULT auth.uid(),
    updated_by uuid DEFAULT auth.uid(),
    is_deleted boolean DEFAULT false,
    deleted_at timestamp with time zone,

    incident_id uuid NOT NULL,
    member_id uuid,                           -- nullable: roster member…
    injured_name text,                        -- …or outsider (the homeowner who trips)
    treatment_sought boolean DEFAULT false NOT NULL,
    treatment_notes text,                     -- free text; costs/co-pays NOT structured in v1

    CONSTRAINT safety_incident_injuries_pkey PRIMARY KEY (id),
    -- Exactly one identity: member or outsider, never both, never neither.
    CONSTRAINT safety_incident_injuries_identity_check
      CHECK (num_nonnulls(member_id, injured_name) = 1)
);
ALTER TABLE ONLY public.safety_incident_injuries
    ADD CONSTRAINT safety_incident_injuries_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);
ALTER TABLE ONLY public.safety_incident_injuries
    ADD CONSTRAINT safety_incident_injuries_incident_id_fkey FOREIGN KEY (incident_id) REFERENCES public.safety_incidents(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.safety_incident_injuries
    ADD CONSTRAINT safety_incident_injuries_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.company_members(id);
ALTER TABLE ONLY public.safety_incident_injuries
    ADD CONSTRAINT safety_incident_injuries_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE ONLY public.safety_incident_injuries
    ADD CONSTRAINT safety_incident_injuries_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);
CREATE INDEX idx_safety_incident_injuries_company_id ON public.safety_incident_injuries USING btree (company_id);
CREATE INDEX idx_safety_incident_injuries_incident_id ON public.safety_incident_injuries USING btree (incident_id);
CREATE TRIGGER safety_incident_injuries_updated_at
  BEFORE UPDATE ON public.safety_incident_injuries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE OR REPLACE FUNCTION public.set_safety_incident_injuries_updated_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
CREATE TRIGGER safety_incident_injuries_set_updated_by
  BEFORE UPDATE ON public.safety_incident_injuries
  FOR EACH ROW EXECUTE FUNCTION public.set_safety_incident_injuries_updated_by();
-- ----------------------------------------------------------------------------
-- 3. safety_incident_witnesses (§2.2)
-- ----------------------------------------------------------------------------

CREATE TABLE public.safety_incident_witnesses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid DEFAULT public.get_my_company_id() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid DEFAULT auth.uid(),
    updated_by uuid DEFAULT auth.uid(),
    is_deleted boolean DEFAULT false,
    deleted_at timestamp with time zone,

    incident_id uuid NOT NULL,
    member_id uuid,                           -- nullable: roster member…
    witness_name text,                        -- …or outsider

    CONSTRAINT safety_incident_witnesses_pkey PRIMARY KEY (id),
    -- Same member-or-outsider rule as §2.1 — the two tables must not drift
    -- on who counts as a person.
    CONSTRAINT safety_incident_witnesses_identity_check
      CHECK (num_nonnulls(member_id, witness_name) = 1)
);
ALTER TABLE ONLY public.safety_incident_witnesses
    ADD CONSTRAINT safety_incident_witnesses_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);
ALTER TABLE ONLY public.safety_incident_witnesses
    ADD CONSTRAINT safety_incident_witnesses_incident_id_fkey FOREIGN KEY (incident_id) REFERENCES public.safety_incidents(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.safety_incident_witnesses
    ADD CONSTRAINT safety_incident_witnesses_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.company_members(id);
ALTER TABLE ONLY public.safety_incident_witnesses
    ADD CONSTRAINT safety_incident_witnesses_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE ONLY public.safety_incident_witnesses
    ADD CONSTRAINT safety_incident_witnesses_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);
CREATE INDEX idx_safety_incident_witnesses_company_id ON public.safety_incident_witnesses USING btree (company_id);
CREATE INDEX idx_safety_incident_witnesses_incident_id ON public.safety_incident_witnesses USING btree (incident_id);
CREATE TRIGGER safety_incident_witnesses_updated_at
  BEFORE UPDATE ON public.safety_incident_witnesses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE OR REPLACE FUNCTION public.set_safety_incident_witnesses_updated_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
CREATE TRIGGER safety_incident_witnesses_set_updated_by
  BEFORE UPDATE ON public.safety_incident_witnesses
  FOR EACH ROW EXECUTE FUNCTION public.set_safety_incident_witnesses_updated_by();
-- ----------------------------------------------------------------------------
-- 4. Injury invariant — incident_type = 'injury' ⇒ ≥1 live injuries row
--    (locked 6C-3). DEFERRABLE INITIALLY DEFERRED constraint triggers checked
--    at COMMIT, so the create RPC's parent + children inserts pass as one
--    transaction while a bare parent insert fails closed. SECURITY DEFINER so
--    the check sees children regardless of the caller's RLS view.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_injury_has_injured_party()
RETURNS TRIGGER
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_incident_id uuid;
  v_type text;
  v_deleted boolean;
BEGIN
  -- Which incident to check depends on which table fired us.
  IF TG_TABLE_NAME = 'safety_incidents' THEN
    v_incident_id := NEW.id;
  ELSE
    -- injuries row changed/removed: check the parent it is LEAVING.
    v_incident_id := COALESCE(OLD.incident_id, NEW.incident_id);
  END IF;

  SELECT si.incident_type, COALESCE(si.is_deleted, false)
  INTO v_type, v_deleted
  FROM safety_incidents si
  WHERE si.id = v_incident_id;

  -- Parent gone (CASCADE) or soft-deleted or not an injury: nothing to hold.
  IF v_type IS NULL OR v_deleted OR v_type <> 'injury' THEN
    RETURN NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM safety_incident_injuries i
    WHERE i.incident_id = v_incident_id AND i.is_deleted = false
  ) THEN
    RAISE EXCEPTION
      'safety_incidents: incident_type = ''injury'' requires at least one injured party (safety_incident_injuries) — incident %',
      v_incident_id;
  END IF;

  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER safety_incidents_injury_invariant
  AFTER INSERT OR UPDATE ON public.safety_incidents
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.enforce_injury_has_injured_party();
CREATE CONSTRAINT TRIGGER safety_incident_injuries_injury_invariant
  AFTER UPDATE OR DELETE ON public.safety_incident_injuries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.enforce_injury_has_injured_party();
-- ----------------------------------------------------------------------------
-- 5. create_safety_incident RPC (Q9) — parent + injuries + witnesses in ONE
--    transaction so the deferred invariant passes at commit. SECURITY DEFINER
--    (bypasses RLS), so it re-implements the create authorization explicitly:
--    caller must have a company, a member identity, and — for project
--    incidents — visibility of the project. NULL project = shop/yard.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_safety_incident(
  p_project_id uuid,
  p_incident_date date,
  p_incident_type text,
  p_description text,
  p_injuries jsonb DEFAULT '[]'::jsonb,
  p_witnesses jsonb DEFAULT '[]'::jsonb
) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_company_id uuid;
  v_member_id uuid;
  v_incident_id uuid;
  v_row jsonb;
BEGIN
  v_company_id := get_my_company_id();
  v_member_id := get_my_member_id();
  IF v_company_id IS NULL OR v_member_id IS NULL THEN
    RAISE EXCEPTION 'create_safety_incident: no company/member identity for caller';
  END IF;

  IF p_project_id IS NOT NULL AND NOT can_view_project(p_project_id) THEN
    RAISE EXCEPTION 'create_safety_incident: project not visible to caller';
  END IF;

  INSERT INTO safety_incidents (
    company_id, project_id, incident_date, incident_type, description,
    reported_by_member_id, created_by, updated_by
  ) VALUES (
    v_company_id, p_project_id, p_incident_date, p_incident_type, p_description,
    v_member_id, auth.uid(), auth.uid()
  ) RETURNING id INTO v_incident_id;

  FOR v_row IN SELECT * FROM jsonb_array_elements(COALESCE(p_injuries, '[]'::jsonb))
  LOOP
    INSERT INTO safety_incident_injuries (
      company_id, incident_id, member_id, injured_name,
      treatment_sought, treatment_notes, created_by, updated_by
    ) VALUES (
      v_company_id,
      v_incident_id,
      NULLIF(v_row->>'member_id', '')::uuid,
      NULLIF(v_row->>'injured_name', ''),
      COALESCE((v_row->>'treatment_sought')::boolean, false),
      NULLIF(v_row->>'treatment_notes', ''),
      auth.uid(), auth.uid()
    );
  END LOOP;

  FOR v_row IN SELECT * FROM jsonb_array_elements(COALESCE(p_witnesses, '[]'::jsonb))
  LOOP
    INSERT INTO safety_incident_witnesses (
      company_id, incident_id, member_id, witness_name, created_by, updated_by
    ) VALUES (
      v_company_id,
      v_incident_id,
      NULLIF(v_row->>'member_id', '')::uuid,
      NULLIF(v_row->>'witness_name', ''),
      auth.uid(), auth.uid()
    );
  END LOOP;

  -- The deferred injury invariant fires at COMMIT of this transaction.
  RETURN v_incident_id;
END;
$$;
-- ----------------------------------------------------------------------------
-- 6. RLS
-- ----------------------------------------------------------------------------

ALTER TABLE public.safety_incidents ENABLE ROW LEVEL SECURITY;
-- Project incidents follow can_view_project (Owner/Admin all; others
-- assigned-only — spec §5 as resolved). NULL-project incidents:
-- Owner/Admin/PM/Foreman (locked 6C-8) plus the reporter (Q8).
CREATE POLICY safety_incidents_select_visible ON public.safety_incidents
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND (
      (project_id IS NOT NULL AND public.can_view_project(project_id))
      OR (
        project_id IS NULL
        AND (
          public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text, 'foreman'::text])
          OR reported_by_member_id = public.get_my_member_id()
        )
      )
    )
  );
-- Any member; project must be visible when present. (The create RPC is the
-- normal path; this keeps direct inserts equally gated.)
CREATE POLICY safety_incidents_insert_authorized ON public.safety_incidents
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND (project_id IS NULL OR public.can_view_project(project_id))
  );
-- Reporter + Owner/Admin edit (locked 6C-2). Soft delete Owner/Admin only.
CREATE POLICY safety_incidents_update_authorized ON public.safety_incidents
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND (
      reported_by_member_id = public.get_my_member_id()
      OR public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  )
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND (
      reported_by_member_id = public.get_my_member_id()
      OR public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
    )
    AND (is_deleted = false OR public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text]))
  );
ALTER TABLE public.safety_incident_injuries ENABLE ROW LEVEL SECURITY;
CREATE POLICY safety_incident_injuries_select_visible ON public.safety_incident_injuries
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM public.safety_incidents si
      WHERE si.id = safety_incident_injuries.incident_id
    )
  );
CREATE POLICY safety_incident_injuries_insert_authorized ON public.safety_incident_injuries
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM public.safety_incidents si
      WHERE si.id = safety_incident_injuries.incident_id
        AND (
          si.reported_by_member_id = public.get_my_member_id()
          OR public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
        )
    )
  );
CREATE POLICY safety_incident_injuries_update_authorized ON public.safety_incident_injuries
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM public.safety_incidents si
      WHERE si.id = safety_incident_injuries.incident_id
        AND (
          si.reported_by_member_id = public.get_my_member_id()
          OR public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
        )
    )
  );
CREATE POLICY safety_incident_injuries_delete_authorized ON public.safety_incident_injuries
  FOR DELETE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM public.safety_incidents si
      WHERE si.id = safety_incident_injuries.incident_id
        AND (
          si.reported_by_member_id = public.get_my_member_id()
          OR public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
        )
    )
  );
ALTER TABLE public.safety_incident_witnesses ENABLE ROW LEVEL SECURITY;
CREATE POLICY safety_incident_witnesses_select_visible ON public.safety_incident_witnesses
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM public.safety_incidents si
      WHERE si.id = safety_incident_witnesses.incident_id
    )
  );
CREATE POLICY safety_incident_witnesses_insert_authorized ON public.safety_incident_witnesses
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM public.safety_incidents si
      WHERE si.id = safety_incident_witnesses.incident_id
        AND (
          si.reported_by_member_id = public.get_my_member_id()
          OR public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
        )
    )
  );
CREATE POLICY safety_incident_witnesses_update_authorized ON public.safety_incident_witnesses
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM public.safety_incidents si
      WHERE si.id = safety_incident_witnesses.incident_id
        AND (
          si.reported_by_member_id = public.get_my_member_id()
          OR public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
        )
    )
  );
CREATE POLICY safety_incident_witnesses_delete_authorized ON public.safety_incident_witnesses
  FOR DELETE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM public.safety_incidents si
      WHERE si.id = safety_incident_witnesses.incident_id
        AND (
          si.reported_by_member_id = public.get_my_member_id()
          OR public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
        )
    )
  );
