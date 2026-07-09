-- ============================================================================
-- Module 5 / 5A §8 — Estimate → Project conversion, budget baseline,
-- Module 4 amendments.
-- Spec: docs/specs/5A-section8-spec.md (built against the merged typed-row
-- M4 model verified in the prod baseline).
--
-- M4 amendments here (§5.13):
--   1. estimates.project_id FK        — added in the 5A projects migration.
--   2. next_estimate_number() 4-digit — ALREADY SHIPPED (conditional lpad);
--                                        deliberately untouched.
--   3. estimate status gains 'converted' — added below.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Estimate status gains 'converted' (§5.13 #3)
-- ----------------------------------------------------------------------------

ALTER TABLE public.estimates DROP CONSTRAINT estimates_status_check;
ALTER TABLE public.estimates ADD CONSTRAINT estimates_status_check
  CHECK (status = ANY (ARRAY['draft'::text, 'review'::text, 'sent'::text, 'viewed'::text, 'accepted'::text, 'declined'::text, 'expired'::text, 'revised'::text, 'converted'::text]));

-- ----------------------------------------------------------------------------
-- 2. project_budget_items (§8 §2 — per-typed-row baseline; supersedes §5.6a's
--    per-line-item grain)
-- ----------------------------------------------------------------------------

CREATE TABLE public.project_budget_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid DEFAULT public.get_my_company_id() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid DEFAULT auth.uid(),
    updated_by uuid DEFAULT auth.uid(),
    is_deleted boolean DEFAULT false,
    deleted_at timestamp with time zone,
    project_id uuid NOT NULL,
    source_line_row_id uuid,
    source_line_item_id uuid,
    row_type text,
    cost_code text,
    description text NOT NULL,
    budgeted_amount numeric DEFAULT 0 NOT NULL,
    committed_amount numeric DEFAULT 0,
    actual_amount numeric DEFAULT 0,
    CONSTRAINT project_budget_items_pkey PRIMARY KEY (id),
    CONSTRAINT project_budget_items_row_type_check CHECK ((row_type IS NULL) OR (row_type = ANY (ARRAY['labor'::text, 'material'::text, 'subcontractor'::text, 'other'::text])))
);

ALTER TABLE ONLY public.project_budget_items
    ADD CONSTRAINT project_budget_items_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);
ALTER TABLE ONLY public.project_budget_items
    ADD CONSTRAINT project_budget_items_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id);
ALTER TABLE ONLY public.project_budget_items
    ADD CONSTRAINT project_budget_items_source_line_row_id_fkey FOREIGN KEY (source_line_row_id) REFERENCES public.estimate_line_rows(id);
ALTER TABLE ONLY public.project_budget_items
    ADD CONSTRAINT project_budget_items_source_line_item_id_fkey FOREIGN KEY (source_line_item_id) REFERENCES public.estimate_line_items(id);
ALTER TABLE ONLY public.project_budget_items
    ADD CONSTRAINT project_budget_items_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE ONLY public.project_budget_items
    ADD CONSTRAINT project_budget_items_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);

CREATE INDEX idx_project_budget_items_company_id ON public.project_budget_items USING btree (company_id);
CREATE INDEX idx_project_budget_items_project_id ON public.project_budget_items USING btree (project_id);

CREATE TRIGGER project_budget_items_updated_at
  BEFORE UPDATE ON public.project_budget_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE FUNCTION public.set_project_budget_items_updated_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER project_budget_items_set_updated_by
  BEFORE UPDATE ON public.project_budget_items
  FOR EACH ROW EXECUTE FUNCTION public.set_project_budget_items_updated_by();

-- Read-only at launch (5E displays; Module 7 writes actuals later). Rows are
-- created by the SECURITY DEFINER conversion RPC, which bypasses RLS, so no
-- INSERT/UPDATE policies are defined yet.
ALTER TABLE public.project_budget_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY project_budget_items_select_visible ON public.project_budget_items
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.can_view_project(project_id)
  );

-- ----------------------------------------------------------------------------
-- 3. convert_estimate_to_project() (§8 §4)
--    Single atomic SECURITY DEFINER transaction (4C/4K RPC precedent).
--    Role gate: owner + admin + project_manager (Josh's confirmed decision —
--    supersedes the spec's Owner/PM shorthand).
-- ----------------------------------------------------------------------------

CREATE FUNCTION public.convert_estimate_to_project(p_estimate_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_company_id UUID := get_my_company_id();
  v_role TEXT := get_my_role();
  v_estimate RECORD;
  v_project_id UUID;
  v_project_number TEXT;
  v_member_id UUID := get_my_member_id();
  v_is_signed BOOLEAN;
BEGIN
  -- Guards -------------------------------------------------------------------
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'convert_estimate_to_project: no company for caller';
  END IF;

  IF v_role IS NULL OR v_role NOT IN ('owner', 'admin', 'project_manager') THEN
    RAISE EXCEPTION 'convert_estimate_to_project: role % may not convert estimates', COALESCE(v_role, 'unknown');
  END IF;

  -- Row lock prevents two concurrent conversions of the same estimate
  SELECT * INTO v_estimate
  FROM estimates
  WHERE id = p_estimate_id
    AND company_id = v_company_id
    AND is_deleted = false
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'convert_estimate_to_project: estimate not found';
  END IF;

  IF v_estimate.project_id IS NOT NULL THEN
    RAISE EXCEPTION 'convert_estimate_to_project: estimate % is already converted', v_estimate.estimate_number;
  END IF;

  -- 1. Public number: the estimate's digits with the PRJ prefix (copied
  --    as-is — no independent re-padding). EST-0001 -> PRJ-0001.
  v_project_number := 'PRJ-' || regexp_replace(v_estimate.estimate_number, '^.*-', '');

  v_is_signed := (v_estimate.signed_proposal_file_id IS NOT NULL) OR (v_estimate.accepted_at IS NOT NULL);

  -- 2–3. INSERT projects (project_internal_seq drawn by its column default;
  --      project_type defaults to fixed_price — estimates carry no type)
  INSERT INTO projects (
    company_id, project_number, name,
    contact_id, contact_address_id, source_estimate_id,
    project_type, status,
    contract_value, tax_rate,
    scope_summary, scope_sections, cover_letter, terms_sections, internal_notes,
    change_order_sequence, created_by
  ) VALUES (
    v_company_id, v_project_number, v_estimate.name,
    v_estimate.contact_id, v_estimate.contact_address_id, v_estimate.id,
    'fixed_price', 'active',
    v_estimate.grand_total, v_estimate.tax_rate,
    v_estimate.scope_summary, v_estimate.scope_sections, v_estimate.cover_letter, v_estimate.terms_sections, v_estimate.internal_notes,
    0, auth.uid()
  )
  RETURNING id INTO v_project_id;

  -- 4. Client contract record: signed when a signature exists, draft otherwise
  INSERT INTO client_contracts (
    company_id, project_id, status, contract_value,
    signed_proposal_file_id, executed_date, created_by
  ) VALUES (
    v_company_id, v_project_id,
    CASE WHEN v_is_signed THEN 'signed' ELSE 'draft' END,
    v_estimate.grand_total,
    v_estimate.signed_proposal_file_id,
    v_estimate.accepted_at::date,
    auth.uid()
  );

  -- 5. Budget baseline: one row per typed row (§8 §3 cost mapping).
  --    budgeted_amount = pre-markup, pre-tax cost:
  --      labor         rate x quantity
  --      material      unit_cost x quantity (allowance rows: unit_cost only)
  --      subcontractor amount
  --      other         amount
  --    cost_code = the parent line item's category name.
  INSERT INTO project_budget_items (
    company_id, project_id, source_line_row_id, source_line_item_id,
    row_type, cost_code, description, budgeted_amount, created_by
  )
  SELECT
    v_company_id, v_project_id, r.id, li.id,
    r.row_type, c.name, r.name,
    CASE r.row_type
      WHEN 'labor' THEN COALESCE(r.rate, 0) * COALESCE(r.quantity, 0)
      WHEN 'material' THEN
        CASE WHEN r.unit_of_measure = 'allowance'
          THEN COALESCE(r.unit_cost, 0)
          ELSE COALESCE(r.unit_cost, 0) * COALESCE(r.quantity, 0)
        END
      ELSE COALESCE(r.amount, 0)
    END,
    auth.uid()
  FROM estimate_line_rows r
  JOIN estimate_line_items li ON li.id = r.line_item_id
  JOIN estimate_categories c ON c.id = li.category_id
  WHERE li.estimate_id = v_estimate.id;

  -- 5b. Override-only fallback (§8 §3 edge case, confirmed decision): a line
  --     item with a total_price_override and NO cost rows still gets one
  --     budget row; its price stands in for cost, flagged in the description.
  INSERT INTO project_budget_items (
    company_id, project_id, source_line_row_id, source_line_item_id,
    row_type, cost_code, description, budgeted_amount, created_by
  )
  SELECT
    v_company_id, v_project_id, NULL, li.id,
    NULL, c.name, li.name || ' (price override — no cost rows)', li.total_price_override,
    auth.uid()
  FROM estimate_line_items li
  JOIN estimate_categories c ON c.id = li.category_id
  WHERE li.estimate_id = v_estimate.id
    AND li.total_price_override IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM estimate_line_rows r WHERE r.line_item_id = li.id);

  -- 6. Estimate gains its project link + terminal 'converted' status
  UPDATE estimates
  SET project_id = v_project_id,
      status = 'converted'
  WHERE id = v_estimate.id;

  -- 7. Module 3 project folders are path-convention (created on first
  --    upload under {company_id}/{project_id}/...) — no storage writes here.

  -- 8. Seed the converter's project assignment: PM visibility is
  --    assignment-based, so without this a PM could not see the project
  --    they just created.
  IF v_member_id IS NOT NULL THEN
    INSERT INTO project_assignments (company_id, project_id, member_id, role_on_project, created_by)
    VALUES (v_company_id, v_project_id, v_member_id, 'converter', auth.uid())
    ON CONFLICT (project_id, member_id) DO NOTHING;
  END IF;

  RETURN v_project_id;
END;
$$;
