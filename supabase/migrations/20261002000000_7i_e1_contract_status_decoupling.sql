-- ============================================================================
-- Module 7I — E1. R16: decouple the contract's status from the proposal's.
-- ============================================================================
--
-- Rulings [Josh, S150]: R16 (decouple, do NOT gate), Q3.1 (draft + NULL
-- executed_date), Q3.2 (a PM-visible boolean, without widening RLS),
-- Q3.3 (backfill contract_documents.project_id).
--
-- ----------------------------------------------------------------------------
-- ⚠️ THIS IS THE SIXTH REDEFINITION OF convert_estimate_to_project.
-- ----------------------------------------------------------------------------
-- The chain: 20260704212000 -> 20260730010000 -> 20260731030000 ->
-- 20260811010000 -> 20260817000000 -> this one.
--
-- The body below was taken from `pg_proc.prosrc` on the LINKED database, not
-- from a migration file, and was verified byte-identical to 20260817000000's
-- before being edited. That check is the whole point: S143 shipped a body that
-- had drifted from the migration a spec cited, and specs in this repo still
-- cite 20260731030000 as the owner of this function — two revisions stale.
--
-- Everything outside the three marked edits is verbatim.
--
-- ----------------------------------------------------------------------------
-- WHAT THIS DOES NOT DO
-- ----------------------------------------------------------------------------
--   * It does NOT gate conversion. A signed proposal converts even when a
--     required contract is unsigned [R16, explicitly narrower than §5.1a's
--     option (i)]. The user needs to start building the job.
--   * It does NOT touch `v_is_signed`. That variable is about the PROPOSAL and
--     is correct; the defect was stamping the CONTRACT's status from it.
--   * It does NOT widen RLS on `contract_documents` [Q3.2]. The PM-visible
--     warning is a SECURITY DEFINER function returning one boolean.
-- ----------------------------------------------------------------------------

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
    company_id, project_id, status, contract_value,
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
    v_contract_value,
    v_estimate.signed_proposal_file_id,
    CASE
      WHEN v_contract_required AND NOT v_contract_signed THEN NULL
      ELSE v_estimate.accepted_at::date
    END,
    auth.uid()
  );

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
                  WHEN 'material' THEN
                    CASE WHEN r.unit_of_measure = 'allowance'
                         THEN COALESCE(r.unit_cost, 0)
                         ELSE COALESCE(r.unit_cost, 0) * COALESCE(r.quantity, 0) END
                  ELSE COALESCE(r.amount, 0)
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


-- ============================================================================
-- Q3.2 — the PM-visible warning, WITHOUT widening contract_documents
-- ============================================================================
--
-- R16 requires the project to carry a persistent warning that its contract is
-- unsigned, and Josh ruled that a PM must SEE it: the PM is often the person
-- running the job, so a warning invisible to them defeats its own purpose.
--
-- ⚠️ BUT `contract_documents` IS OWNER/ADMIN ON SELECT (20260926000000 §6), and
-- widening that policy was refused. A contract displays contract value, which
-- the Financial Visibility Floor holds at Owner/Admin "on every surface".
--
-- So this returns ONE BOOLEAN and nothing else. The PM learns that paperwork is
-- outstanding; they still cannot read the contract, its value, its terms, or
-- even how many documents exist. SECURITY DEFINER is what lets it see past the
-- policy; the narrow return type is what keeps that safe.
--
-- ⚠️ IT KEYS ON THE ESTIMATE'S FLAG, NOT THE COMPANY TOGGLE. `include_client_
-- contract` is the durable record that THIS job was supposed to have a
-- contract. The master toggle is a company-wide setting that can be switched off
-- later, and switching it off must not silence a warning about a contract that
-- was actually sent and never signed.
--
-- Tenant-scoped and project-scoped: `get_my_company_id()` stops cross-tenant
-- probing, and `can_view_project()` means a PM cannot enumerate jobs they are
-- not on by calling this with random ids.

CREATE OR REPLACE FUNCTION public.project_has_unsigned_contract(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM projects p
    JOIN estimates e ON e.id = p.source_estimate_id
    WHERE p.id = p_project_id
      AND p.company_id = public.get_my_company_id()
      AND public.can_view_project(p.id)
      AND e.include_client_contract
      AND NOT EXISTS (
        SELECT 1
        FROM contract_documents d
        WHERE d.estimate_id = e.id
          AND d.document_kind = 'client_contract'
          AND d.is_deleted = false
          AND d.status IN ('signed', 'notarized')
      )
  );
$$;

COMMENT ON FUNCTION public.project_has_unsigned_contract(uuid) IS
  '7I R16 / Q3.2 [S150]. Does this project owe a client-contract signature? '
  'Returns a bare boolean so a project_manager can be warned WITHOUT widening '
  'contract_documents RLS, which is Owner/Admin on SELECT because a contract '
  'displays contract value. Keyed on estimates.include_client_contract so '
  'turning the company toggle off later cannot silence a warning about a '
  'contract that was actually sent.';

REVOKE ALL ON FUNCTION public.project_has_unsigned_contract(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.project_has_unsigned_contract(uuid) TO authenticated;
