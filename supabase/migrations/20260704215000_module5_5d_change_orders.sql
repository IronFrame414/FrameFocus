-- ============================================================================
-- Module 5 / 5D — Change Orders
-- Spec: docs/specs/5D-spec.md (Session 55 locked decisions D-1..D-7);
-- design authority module5-architecture.md §5.7 as amended (Amendments A + B).
--
-- Model: a CO is written IDENTICALLY to an estimate — line items → typed rows
-- (labor/material/subcontractor/other), same §4.4a tax-then-markup (D-1).
-- Credits are negative values on normal rows; no is_credit flag (D-2/D-3).
-- Send = internal acceptance; client signature = binding (D-4). Owner/Admin/PM
-- all create AND send — no Owner-final-approval gate (D-5, Amendment A).
-- Money is display-only: projects.contract_value is NEVER mutated here (D-6,
-- TECH_DEBT #80 — Module 7 owns the write-through).
--
-- Lifecycle (confirmed at build): draft → sent → signed, plus voided for a
-- CO withdrawn before signature. No post-send edit path at launch — revising
-- means void + write a new CO.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. change_orders
-- ----------------------------------------------------------------------------

CREATE TABLE public.change_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid DEFAULT public.get_my_company_id() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid DEFAULT auth.uid(),
    updated_by uuid DEFAULT auth.uid(),
    is_deleted boolean DEFAULT false,
    deleted_at timestamp with time zone,
    project_id uuid NOT NULL,
    co_number text NOT NULL,                          -- CO-####-## (D-7)
    title text NOT NULL,
    description text,
    reason_category text,

    -- Per-CO type, independent of project type (locked §5.7a)
    co_type text DEFAULT 'fixed_price'::text NOT NULL,

    -- Authorship at member grain (spec §3) alongside the standard auth.users
    -- audit column — both kept so the standard-columns convention holds.
    author_member_id uuid DEFAULT public.get_my_member_id() NOT NULL,

    -- Lifecycle (D-4; enum confirmed at build)
    status text DEFAULT 'draft'::text NOT NULL,
    sent_at timestamp with time zone,                 -- internal acceptance
    signed_at timestamp with time zone,               -- binding

    -- §4.4a pricing context, copied from the source estimate (or company
    -- defaults) at creation — CO rows inherit estimate math, never redefine it
    pricing_mode text DEFAULT 'markup'::text NOT NULL,
    tax_rate numeric,
    subcontractor_markup_percent numeric,
    material_markup_percent numeric,
    labor_markup_percent numeric,

    -- Denormalized Σ of row totals (app-maintained like estimate totals);
    -- signed — can be negative for net-credit COs
    net_delta numeric DEFAULT 0 NOT NULL,

    -- Impact metadata
    schedule_impact_days integer,

    -- Module 9 hook: with D-4, every CO binds via client signature
    requires_client_signature boolean DEFAULT true,

    CONSTRAINT change_orders_pkey PRIMARY KEY (id),
    CONSTRAINT change_orders_co_type_check CHECK (co_type = ANY (ARRAY['fixed_price'::text, 'time_and_materials'::text, 'cost_plus'::text])),
    CONSTRAINT change_orders_status_check CHECK (status = ANY (ARRAY['draft'::text, 'sent'::text, 'signed'::text, 'voided'::text])),
    CONSTRAINT change_orders_pricing_mode_check CHECK (pricing_mode = ANY (ARRAY['markup'::text, 'margin'::text])),
    CONSTRAINT change_orders_company_co_number_key UNIQUE (company_id, co_number)
);

ALTER TABLE ONLY public.change_orders
    ADD CONSTRAINT change_orders_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);
ALTER TABLE ONLY public.change_orders
    ADD CONSTRAINT change_orders_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id);
ALTER TABLE ONLY public.change_orders
    ADD CONSTRAINT change_orders_author_member_id_fkey FOREIGN KEY (author_member_id) REFERENCES public.company_members(id);
ALTER TABLE ONLY public.change_orders
    ADD CONSTRAINT change_orders_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE ONLY public.change_orders
    ADD CONSTRAINT change_orders_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);

CREATE INDEX idx_change_orders_company_id ON public.change_orders USING btree (company_id);
CREATE INDEX idx_change_orders_project_id ON public.change_orders USING btree (project_id);
CREATE INDEX idx_change_orders_status ON public.change_orders USING btree (status);

CREATE TRIGGER change_orders_updated_at
  BEFORE UPDATE ON public.change_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE FUNCTION public.set_change_orders_updated_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER change_orders_set_updated_by
  BEFORE UPDATE ON public.change_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_change_orders_updated_by();

-- ----------------------------------------------------------------------------
-- 2. change_order_line_items — mirrors estimate_line_items (D-1): no cost
--    columns on the item; cost is the roll-up of its rows. COs are flat
--    (no category tree) — cost_code-level grouping is not part of a CO.
-- ----------------------------------------------------------------------------

CREATE TABLE public.change_order_line_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid DEFAULT public.get_my_company_id() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid DEFAULT auth.uid(),
    updated_by uuid DEFAULT auth.uid(),
    change_order_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    sort_order integer NOT NULL,
    total_price numeric DEFAULT 0 NOT NULL,   -- Σ row totals (app-maintained; signed)
    CONSTRAINT change_order_line_items_pkey PRIMARY KEY (id)
);

ALTER TABLE ONLY public.change_order_line_items
    ADD CONSTRAINT change_order_line_items_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);
ALTER TABLE ONLY public.change_order_line_items
    ADD CONSTRAINT change_order_line_items_change_order_id_fkey FOREIGN KEY (change_order_id) REFERENCES public.change_orders(id);
ALTER TABLE ONLY public.change_order_line_items
    ADD CONSTRAINT change_order_line_items_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE ONLY public.change_order_line_items
    ADD CONSTRAINT change_order_line_items_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);

CREATE INDEX idx_change_order_line_items_company_id ON public.change_order_line_items USING btree (company_id);
CREATE INDEX idx_change_order_line_items_change_order_id ON public.change_order_line_items USING btree (change_order_id);

CREATE TRIGGER change_order_line_items_updated_at
  BEFORE UPDATE ON public.change_order_line_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE FUNCTION public.set_change_order_line_items_updated_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER change_order_line_items_set_updated_by
  BEFORE UPDATE ON public.change_order_line_items
  FOR EACH ROW EXECUTE FUNCTION public.set_change_order_line_items_updated_by();

-- ----------------------------------------------------------------------------
-- 3. change_order_line_rows — mirrors estimate_line_rows, including the
--    type-column CHECK. Values are SIGNED: a credit is a normal row with a
--    negative rate/unit_cost/amount (D-2); §4.4a applies unchanged (D-3).
-- ----------------------------------------------------------------------------

CREATE TABLE public.change_order_line_rows (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid DEFAULT public.get_my_company_id() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid DEFAULT auth.uid(),
    updated_by uuid DEFAULT auth.uid(),
    line_item_id uuid NOT NULL,
    row_type text NOT NULL,
    name text NOT NULL,               -- carries the "credit" meaning for negative rows (D-2)
    sort_order integer NOT NULL,
    markup_percent numeric,
    apply_tax boolean DEFAULT false NOT NULL,
    total numeric DEFAULT 0 NOT NULL, -- marked-up price (§4.4a), signed
    rate numeric,
    quantity numeric,
    labor_unit text,
    unit_of_measure text,
    unit_cost numeric,
    amount numeric,
    subcontractor_id uuid,
    CONSTRAINT change_order_line_rows_pkey PRIMARY KEY (id),
    CONSTRAINT change_order_line_rows_labor_unit_check CHECK (((labor_unit IS NULL) OR (labor_unit = ANY (ARRAY['hours'::text, 'days'::text])))),
    CONSTRAINT change_order_line_rows_row_type_check CHECK ((row_type = ANY (ARRAY['labor'::text, 'material'::text, 'subcontractor'::text, 'other'::text]))),
    CONSTRAINT change_order_line_rows_type_columns CHECK (
CASE row_type
    WHEN 'labor'::text THEN ((amount IS NULL) AND (subcontractor_id IS NULL) AND (unit_of_measure IS NULL) AND (unit_cost IS NULL) AND (apply_tax = false))
    WHEN 'material'::text THEN ((rate IS NULL) AND (labor_unit IS NULL) AND (amount IS NULL) AND (subcontractor_id IS NULL))
    WHEN 'subcontractor'::text THEN ((rate IS NULL) AND (quantity IS NULL) AND (labor_unit IS NULL) AND (unit_of_measure IS NULL) AND (unit_cost IS NULL))
    WHEN 'other'::text THEN ((rate IS NULL) AND (quantity IS NULL) AND (labor_unit IS NULL) AND (unit_of_measure IS NULL) AND (unit_cost IS NULL) AND (subcontractor_id IS NULL))
    ELSE NULL::boolean
END),
    CONSTRAINT change_order_line_rows_unit_of_measure_check CHECK (((unit_of_measure IS NULL) OR (unit_of_measure = ANY (ARRAY['each'::text, 'sq_ft'::text, 'linear_ft'::text, 'box'::text, 'bundle'::text, 'bag'::text, 'gallon'::text, 'pair'::text, 'set'::text, 'allowance'::text, 'other'::text]))))
);

ALTER TABLE ONLY public.change_order_line_rows
    ADD CONSTRAINT change_order_line_rows_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);
ALTER TABLE ONLY public.change_order_line_rows
    ADD CONSTRAINT change_order_line_rows_line_item_id_fkey FOREIGN KEY (line_item_id) REFERENCES public.change_order_line_items(id);
ALTER TABLE ONLY public.change_order_line_rows
    ADD CONSTRAINT change_order_line_rows_subcontractor_id_fkey FOREIGN KEY (subcontractor_id) REFERENCES public.subcontractors(id);
ALTER TABLE ONLY public.change_order_line_rows
    ADD CONSTRAINT change_order_line_rows_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE ONLY public.change_order_line_rows
    ADD CONSTRAINT change_order_line_rows_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);

CREATE INDEX idx_change_order_line_rows_company_id ON public.change_order_line_rows USING btree (company_id);
CREATE INDEX idx_change_order_line_rows_line_item_id ON public.change_order_line_rows USING btree (line_item_id);
CREATE INDEX idx_change_order_line_rows_subcontractor_id ON public.change_order_line_rows USING btree (subcontractor_id);

CREATE TRIGGER change_order_line_rows_updated_at
  BEFORE UPDATE ON public.change_order_line_rows
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE FUNCTION public.set_change_order_line_rows_updated_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER change_order_line_rows_set_updated_by
  BEFORE UPDATE ON public.change_order_line_rows
  FOR EACH ROW EXECUTE FUNCTION public.set_change_order_line_rows_updated_by();

-- ----------------------------------------------------------------------------
-- 4. co_signing_sessions — mirrors the M4 signing_sessions capture (in-house
--    draw/type signature, consent, IP/UA). NO email delivery at launch — the
--    contractor shares the tokenized link manually (client delivery is gated
--    by the Pre-Module 9 Decision Gate); recipient_email is therefore
--    nullable, unlike M4.
-- ----------------------------------------------------------------------------

CREATE TABLE public.co_signing_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    change_order_id uuid NOT NULL,
    token text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    recipient_email text,
    recipient_name text,
    expires_at timestamp with time zone NOT NULL,
    signed_at timestamp with time zone,
    signature_type text,
    signature_data text,
    signer_name text,
    declined_at timestamp with time zone,
    decline_notes text,
    signer_ip text,
    signer_user_agent text,
    consent_given boolean DEFAULT false NOT NULL,
    consent_text text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT co_signing_sessions_pkey PRIMARY KEY (id),
    CONSTRAINT co_signing_sessions_token_key UNIQUE (token),
    CONSTRAINT co_signing_sessions_signature_type_check CHECK ((signature_type IS NULL) OR (signature_type = ANY (ARRAY['draw'::text, 'type'::text]))),
    CONSTRAINT co_signing_sessions_status_check CHECK (status = ANY (ARRAY['pending'::text, 'completed'::text, 'declined'::text, 'expired'::text, 'invalidated'::text]))
);

ALTER TABLE ONLY public.co_signing_sessions
    ADD CONSTRAINT co_signing_sessions_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);
ALTER TABLE ONLY public.co_signing_sessions
    ADD CONSTRAINT co_signing_sessions_change_order_id_fkey FOREIGN KEY (change_order_id) REFERENCES public.change_orders(id);

CREATE INDEX idx_co_signing_sessions_company_id ON public.co_signing_sessions USING btree (company_id);
CREATE INDEX idx_co_signing_sessions_change_order_id ON public.co_signing_sessions USING btree (change_order_id);

CREATE TRIGGER co_signing_sessions_updated_at
  BEFORE UPDATE ON public.co_signing_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ----------------------------------------------------------------------------
-- 5. next_co_number(project) — CO-####-## (D-7): the project's number digits
--    + a per-project 2-digit sequence, row-locked on projects.
-- ----------------------------------------------------------------------------

CREATE FUNCTION public.next_co_number(p_project_id uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_company_id UUID := get_my_company_id();
  v_project_number TEXT;
  v_seq INTEGER;
BEGIN
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'next_co_number: no company for caller';
  END IF;

  UPDATE projects
  SET change_order_sequence = change_order_sequence + 1
  WHERE id = p_project_id
    AND company_id = v_company_id
  RETURNING project_number, change_order_sequence
  INTO v_project_number, v_seq;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'next_co_number: project not found';
  END IF;

  -- CO-<project digits>-<seq, 2-digit minimum>
  RETURN 'CO-' || regexp_replace(v_project_number, '^.*-', '') || '-' ||
    CASE
      WHEN length(v_seq::text) >= 2 THEN v_seq::text
      ELSE lpad(v_seq::text, 2, '0')
    END;
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. Wire the 5B forward hook (F-6): tasks.change_order_id gains its FK.
-- ----------------------------------------------------------------------------

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_change_order_id_fkey FOREIGN KEY (change_order_id) REFERENCES public.change_orders(id);

CREATE INDEX idx_tasks_change_order_id ON public.tasks USING btree (change_order_id);

-- ----------------------------------------------------------------------------
-- 7. RLS
--    Create/send: owner + admin + project_manager (D-5). View: project
--    visibility (Owner/Admin all; PM/Foreman/Crew assigned). Soft-delete
--    Owner/Admin (service layer). co_signing_sessions: the public signing
--    flow runs on the service-role client (M4 pattern) — no anon policies;
--    managers read sessions for activity display.
-- ----------------------------------------------------------------------------

ALTER TABLE public.change_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY change_orders_select_visible ON public.change_orders
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.can_view_project(project_id)
  );

CREATE POLICY change_orders_insert_authorized ON public.change_orders
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text])
  );

CREATE POLICY change_orders_update_authorized ON public.change_orders
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text])
  );

ALTER TABLE public.change_order_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY change_order_line_items_select_visible ON public.change_order_line_items
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM public.change_orders co
      WHERE co.id = change_order_line_items.change_order_id
        AND public.can_view_project(co.project_id)
    )
  );

CREATE POLICY change_order_line_items_insert_authorized ON public.change_order_line_items
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text])
  );

CREATE POLICY change_order_line_items_update_authorized ON public.change_order_line_items
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text])
  );

CREATE POLICY change_order_line_items_delete_authorized ON public.change_order_line_items
  FOR DELETE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text])
  );

ALTER TABLE public.change_order_line_rows ENABLE ROW LEVEL SECURITY;

CREATE POLICY change_order_line_rows_select_visible ON public.change_order_line_rows
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND EXISTS (
      SELECT 1
      FROM public.change_order_line_items li
      JOIN public.change_orders co ON co.id = li.change_order_id
      WHERE li.id = change_order_line_rows.line_item_id
        AND public.can_view_project(co.project_id)
    )
  );

CREATE POLICY change_order_line_rows_insert_authorized ON public.change_order_line_rows
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text])
  );

CREATE POLICY change_order_line_rows_update_authorized ON public.change_order_line_rows
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text])
  );

CREATE POLICY change_order_line_rows_delete_authorized ON public.change_order_line_rows
  FOR DELETE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text])
  );

ALTER TABLE public.co_signing_sessions ENABLE ROW LEVEL SECURITY;

-- Managers see CO signing activity; the public signing flow bypasses RLS via
-- the service-role client (M4 pattern: no write policies, token = credential).
CREATE POLICY co_signing_sessions_select_manager ON public.co_signing_sessions
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text])
  );
