-- ═══════════════════════════════════════════════════════════════════════════
-- client_contract_amounts — the Financial Visibility Floor closes over client
-- contract values. Spec: docs/specs/client-contract-amounts-spec.md.
--
-- The ruling is about the VALUE, not the row: a PM keeps the contract (and
-- their notes-edit path, guarded by two deliberate triggers) and loses the
-- figure. Row-flooring client_contracts was tried and REJECTED twice — an
-- UPDATE … WHERE matches through the SELECT policy, so a SELECT floor
-- silently removes PM writes (measured: 0 rows matched on rebuild-test).
-- The side table is the project_financials precedent, third application.
--
-- ⚠️ client_contracts_select_visible stays broad ON PURPOSE. Do not "finish"
-- this by flooring the parent row.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1 ── the table (project_financials shape; per-tenant defaults checklist)
CREATE TABLE client_contract_amounts (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         UUID NOT NULL REFERENCES companies(id) DEFAULT get_my_company_id(),
  client_contract_id UUID NOT NULL UNIQUE REFERENCES client_contracts(id) ON DELETE CASCADE,
  contract_value     NUMERIC,
  created_at         TIMESTAMPTZ DEFAULT now(),
  updated_at         TIMESTAMPTZ DEFAULT now(),
  created_by         UUID REFERENCES auth.users(id) DEFAULT auth.uid(),
  updated_by         UUID REFERENCES auth.users(id) DEFAULT auth.uid()
);

CREATE INDEX idx_client_contract_amounts_company_id ON client_contract_amounts (company_id);

-- 2 ── RLS. Owner/Admin arms verbatim from project_financials; a client arm
--      because portal.ts shows HER contract's value (S164 — the Floor governs
--      staff, a client is a counterparty). NO DELETE policy: denied to all.
ALTER TABLE client_contract_amounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY client_contract_amounts_select_owner_admin ON client_contract_amounts
  FOR SELECT TO authenticated USING (
    company_id = get_my_company_id()
    AND get_my_role() = ANY (ARRAY['owner', 'admin'])
  );

-- ⚠️ NOT a bare FK-containment EXISTS on the parent — the parent's SELECT is
-- the OR of a broad staff arm and the client arm, so containment would admit
-- every staff role and defeat the floor this table exists to build. The
-- client predicate is RESTATED against the parent's own columns instead
-- (the amounts row carries neither project_id nor status).
CREATE POLICY client_contract_amounts_select_client ON client_contract_amounts
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM client_contracts cc
      WHERE cc.id = client_contract_amounts.client_contract_id
        AND cc.company_id = my_company_id_flat()
        AND is_client_of_project(cc.project_id)
        AND client_document_visible(cc.status)
    )
  );

CREATE POLICY client_contract_amounts_insert_owner_admin ON client_contract_amounts
  FOR INSERT TO authenticated WITH CHECK (
    company_id = get_my_company_id()
    AND get_my_role() = ANY (ARRAY['owner', 'admin'])
  );

CREATE POLICY client_contract_amounts_update_owner_admin ON client_contract_amounts
  FOR UPDATE TO authenticated USING (
    company_id = get_my_company_id()
    AND get_my_role() = ANY (ARRAY['owner', 'admin'])
  );

-- 3 ── standard triggers
CREATE TRIGGER client_contract_amounts_updated_at
  BEFORE UPDATE ON client_contract_amounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE FUNCTION set_client_contract_amounts_updated_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER client_contract_amounts_set_updated_by
  BEFORE UPDATE ON client_contract_amounts
  FOR EACH ROW EXECUTE FUNCTION set_client_contract_amounts_updated_by();

-- 4 ── backfill: one row per contract that has a value (readers LEFT-join;
--      the project_financials convention — no row when nothing to hold)
INSERT INTO client_contract_amounts (company_id, client_contract_id, contract_value, created_by, updated_by)
SELECT company_id, id, contract_value, created_by, updated_by
FROM client_contracts
WHERE contract_value IS NOT NULL;

-- 5 ── convert_estimate_to_project: the client_contracts INSERT loses
--      contract_value and RETURNS its id; the amount lands beside it in the
--      side table. Same SECURITY DEFINER authority the function already uses
--      for project_financials — not a widening. Body otherwise verbatim from
--      the live definition (rebuild-test, 2026-08-29).
CREATE OR REPLACE FUNCTION public.convert_estimate_to_project(p_estimate_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id UUID := get_my_company_id();
  v_role TEXT := get_my_role();
  v_estimate RECORD;
  v_project_id UUID;
  v_project_number TEXT;
  v_member_id UUID := get_my_member_id();
  v_is_signed BOOLEAN;
  v_contract_required BOOLEAN;
  v_contract_signed BOOLEAN;
  v_contract_value numeric;
  v_client_contract_id UUID;
  v_bid RECORD;
  v_unresolved text := '';
  v_brow RECORD;
  v_item_id uuid;
BEGIN
  -- Guards -------------------------------------------------------------------
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'convert_estimate_to_project: no company for caller';
  END IF;

  IF v_role IS NULL OR v_role NOT IN ('owner', 'admin', 'project_manager') THEN
    RAISE EXCEPTION 'convert_estimate_to_project: role % may not convert estimates', COALESCE(v_role, 'unknown');
  END IF;

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

  PERFORM 1
  FROM estimate_line_items li
  WHERE li.estimate_id = v_estimate.id
    AND li.total_price_override IS NOT NULL
    AND li.override_cost IS NULL
    AND NOT EXISTS (SELECT 1 FROM estimate_line_rows r WHERE r.line_item_id = li.id);
  IF FOUND THEN
    RAISE EXCEPTION 'convert_estimate_to_project: flat-priced lines are missing a cost — enter each line''s cost, then convert';
  END IF;

  v_project_number := 'PRJ-' || regexp_replace(v_estimate.estimate_number, '^.*-', '');

  v_is_signed := (v_estimate.signed_proposal_file_id IS NOT NULL) OR (v_estimate.accepted_at IS NOT NULL);

  -- 7I R16 [S150] — DECOUPLE, DO NOT GATE.
  --
  -- `v_is_signed` above tests PROPOSAL signals only, and that is correct for the
  -- proposal. What was wrong is that `client_contracts.status` was stamped from
  -- it: an estimate that asked for a written contract, whose client signed the
  -- proposal and never signed the contract, converted to a project carrying a
  -- client contract marked 'signed'. The record said the paperwork was done.
  --
  -- ⚠️ CONVERSION IS NOT BLOCKED, DELIBERATELY. §5.1a's option (i) would have
  -- taught `v_is_signed` about the toggle and refused to convert; R16 rejects
  -- that. The user needs to start building the job. Only the CONTRACT's own
  -- status is corrected, and the project carries a warning
  -- (`project_has_unsigned_contract`) until a signature arrives.
  v_contract_required := COALESCE(v_estimate.include_client_contract, false);

  v_contract_signed := EXISTS (
    SELECT 1 FROM contract_documents d
    WHERE d.estimate_id = v_estimate.id
      AND d.document_kind = 'client_contract'
      AND d.is_deleted = false
      AND d.status IN ('signed', 'notarized')
  );

  v_contract_value := CASE WHEN v_estimate.contract_type = 'fixed_price'
                           THEN v_estimate.grand_total
                           ELSE v_estimate.projected_value
                      END;

  INSERT INTO projects (
    company_id, project_number, name,
    contact_id, contact_address_id, source_estimate_id,
    project_type, status,
    tax_rate,
    scope_summary, scope_sections, cover_letter, terms_sections, internal_notes,
    change_order_sequence, created_by
  ) VALUES (
    v_company_id, v_project_number, v_estimate.name,
    v_estimate.contact_id, v_estimate.contact_address_id, v_estimate.id,
    v_estimate.contract_type, 'active',
    v_estimate.tax_rate,
    v_estimate.scope_summary, v_estimate.scope_sections, v_estimate.cover_letter, v_estimate.terms_sections, v_estimate.internal_notes,
    0, auth.uid()
  )
  RETURNING id INTO v_project_id;

  IF v_contract_value IS NOT NULL THEN
    INSERT INTO project_financials (company_id, project_id, contract_value, created_by)
    VALUES (v_company_id, v_project_id, v_contract_value, auth.uid());
  END IF;

  INSERT INTO client_contracts (
    company_id, project_id, status,
    signed_proposal_file_id, executed_date, created_by
  ) VALUES (
    v_company_id, v_project_id,
    -- R16 / Q3.1 — a required-but-unsigned contract is 'draft' with no executed
    -- date, whatever the proposal did. `signed_proposal_file_id` still carries
    -- across: the proposal WAS signed and that artifact is real.
    CASE
      WHEN v_contract_required AND NOT v_contract_signed THEN 'draft'
      WHEN v_is_signed THEN 'signed'
      ELSE 'draft'
    END,
    v_estimate.signed_proposal_file_id,
    CASE
      WHEN v_contract_required AND NOT v_contract_signed THEN NULL
      ELSE v_estimate.accepted_at::date
    END,
    auth.uid()
  )
  RETURNING id INTO v_client_contract_id;

  -- The value lives on the Owner/Admin side table (client-contract-amounts
  -- spec). SECURITY DEFINER carries the INSERT past the Owner/Admin-only
  -- policy for a converting PM — the same authority as project_financials
  -- above, not a widening.
  IF v_contract_value IS NOT NULL THEN
    INSERT INTO client_contract_amounts (company_id, client_contract_id, contract_value, created_by)
    VALUES (v_company_id, v_client_contract_id, v_contract_value, auth.uid());
  END IF;

  -- Q3.3 — carry the contract documents onto the project.
  --
  -- ⚠️ NOTHING SET THIS BEFORE. `contract_documents.project_id` is documented
  -- (20260926000000) as "NULL until conversion; backfilled then", and no code
  -- backfilled it — `convert_estimate_to_project` predates 7I by five
  -- redefinitions. Left unset it breaks R12: the project Contracts panel finds
  -- contracts by `project_id`, so a converted job would show none and there
  -- would be nowhere to upload a notarised copy that arrives after conversion.
  --
  -- SECURITY DEFINER, so the Owner/Admin-only RLS on contract_documents does not
  -- block this. That is the same authority the rest of this function already
  -- runs with, not a widening.
  UPDATE contract_documents
     SET project_id = v_project_id
   WHERE estimate_id = v_estimate.id
     AND is_deleted = false
     AND project_id IS NULL;

  -- 5. Budget baseline, one row per typed row. Loop rather than INSERT..SELECT
  --    so each line's amount can be written to project_budget_amounts against
  --    the id it belongs to. The cost expression is verbatim.
  FOR v_brow IN
    SELECT r.id AS row_id, li.id AS item_id, r.row_type, c.name AS cost_code, r.name AS description,
           CASE r.row_type
             WHEN 'labor' THEN COALESCE(r.rate, 0) * COALESCE(r.quantity, 0)
             ELSE round(
               (CASE r.row_type
                  -- [S170] allowance is its OWN row type (quantity x unit_cost,
                  -- never amount). The old material/unit_of_measure='allowance'
                  -- representation is retired by the same migration. Every arm
                  -- is explicit and the ELSE is NULL on purpose: a sixth type
                  -- would fail project_budget_amounts.budgeted_amount NOT NULL
                  -- loudly instead of landing at $0 through COALESCE(amount).
                  WHEN 'material'      THEN COALESCE(r.unit_cost, 0) * COALESCE(r.quantity, 0)
                  WHEN 'allowance'     THEN COALESCE(r.unit_cost, 0) * COALESCE(r.quantity, 0)
                  WHEN 'subcontractor' THEN COALESCE(r.amount, 0)
                  WHEN 'other'         THEN COALESCE(r.amount, 0)
                  ELSE NULL
                END)
               * (CASE WHEN r.apply_tax
                       THEN 1 + COALESCE(v_estimate.tax_rate, 0) / 100
                       ELSE 1 END)
             , 2)
           END AS amount
    FROM estimate_line_rows r
    JOIN estimate_line_items li ON li.id = r.line_item_id
    JOIN estimate_categories c ON c.id = li.category_id
    WHERE li.estimate_id = v_estimate.id
  LOOP
    INSERT INTO project_budget_items (
      company_id, project_id, source_line_row_id, source_line_item_id,
      row_type, cost_code, description, created_by
    ) VALUES (
      v_company_id, v_project_id, v_brow.row_id, v_brow.item_id,
      v_brow.row_type, v_brow.cost_code, v_brow.description, auth.uid()
    )
    RETURNING id INTO v_item_id;

    INSERT INTO project_budget_amounts (company_id, budget_item_id, budgeted_amount)
    VALUES (v_company_id, v_item_id, v_brow.amount);
  END LOOP;

  -- 5b. Flat-priced fallback (A-2): a line with a total_price_override and NO
  --     cost rows gets one budget row carrying its COST basis (override_cost —
  --     guarded non-NULL above), never the sell price.
  FOR v_brow IN
    SELECT li.id AS item_id, c.name AS cost_code,
           li.name || ' (flat-priced line)' AS description,
           li.override_cost AS amount
    FROM estimate_line_items li
    JOIN estimate_categories c ON c.id = li.category_id
    WHERE li.estimate_id = v_estimate.id
      AND li.total_price_override IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM estimate_line_rows r WHERE r.line_item_id = li.id)
  LOOP
    INSERT INTO project_budget_items (
      company_id, project_id, source_line_row_id, source_line_item_id,
      row_type, cost_code, description, created_by
    ) VALUES (
      v_company_id, v_project_id, NULL, v_brow.item_id,
      NULL, v_brow.cost_code, v_brow.description, auth.uid()
    )
    RETURNING id INTO v_item_id;

    INSERT INTO project_budget_amounts (company_id, budget_item_id, budgeted_amount)
    VALUES (v_company_id, v_item_id, v_brow.amount);
  END LOOP;

  FOR v_bid IN
    SELECT b.id, b.bid_amount, b.bid_document_file_id,
           li.name AS line_name,
           s.member_id AS sub_member_id, s.company_name AS sub_name
    FROM estimate_sub_bids b
    JOIN estimate_line_items li ON li.id = b.line_item_id
    JOIN subcontractors s ON s.id = b.subcontractor_id
    WHERE li.estimate_id = v_estimate.id
      AND b.is_winner = true
      AND b.is_deleted = false
  LOOP
    IF v_bid.sub_member_id IS NULL THEN
      v_unresolved := v_unresolved
        || CASE WHEN v_unresolved = '' THEN '' ELSE ', ' END
        || v_bid.sub_name;
      CONTINUE;
    END IF;

    INSERT INTO subcontractor_contracts (
      company_id, project_id, member_id,
      contract_value, status, requires_formal_contract,
      scope_of_work, signed_doc_file_id, created_by
    ) VALUES (
      v_company_id, v_project_id, v_bid.sub_member_id,
      v_bid.bid_amount, 'draft', false,
      v_bid.line_name, v_bid.bid_document_file_id, auth.uid()
    );
  END LOOP;

  IF v_unresolved <> '' THEN
    RAISE EXCEPTION 'convert_estimate_to_project: complete the sub profile before converting — no linked team member for: %', v_unresolved;
  END IF;

  UPDATE estimates
  SET project_id = v_project_id,
      status = 'converted'
  WHERE id = v_estimate.id;

  IF v_member_id IS NOT NULL THEN
    INSERT INTO project_assignments (company_id, project_id, member_id, role_on_project, created_by)
    VALUES (v_company_id, v_project_id, v_member_id, 'converter', auth.uid())
    ON CONFLICT (project_id, member_id) DO NOTHING;
  END IF;

  RETURN v_project_id;
END;
$function$;

-- 6 ── the column-scope trigger loses ONLY its contract_value clause. The
--      signed_proposal_file_id and executed_date clauses stay — they are not
--      moving tables, and they are why this trigger survives the migration.
--      (enforce_contract_void_authority is untouched: it is shared by three
--      triggers and has nothing to do with the money column.)
CREATE OR REPLACE FUNCTION public.enforce_client_contracts_column_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Service-role clients have no auth context; RLS already doesn't apply to
  -- them and this trigger must not break their writes.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text]) THEN
    RETURN NEW;
  END IF;

  -- contract_value no longer lives on this row — it moved to
  -- client_contract_amounts (Owner/Admin + client-of-project RLS), so its
  -- clause is gone from this guard rather than made dead code.
  IF NEW.signed_proposal_file_id IS DISTINCT FROM OLD.signed_proposal_file_id
     OR NEW.executed_date IS DISTINCT FROM OLD.executed_date THEN
    RAISE EXCEPTION 'The financial terms of a client contract are Owner/Admin only.';
  END IF;

  RETURN NEW;
END;
$function$;

-- 7 ── drop the column (after the RPC no longer references it)
ALTER TABLE client_contracts DROP COLUMN contract_value;
