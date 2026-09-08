-- S105b item 6 (`#5-estred`) — conversion carries estimate file attachments onto
-- the project.
--
-- `convert_estimate_to_project()` set `projects.source_estimate_id` and re-pointed
-- contract_documents, but never touched `files`. With Migration
-- 20261540000000 an estimate attachment now lives with `estimate_id` set /
-- `project_id` NULL; on conversion it must move to the project or it is stranded
-- on a converted estimate. This adds ONE statement — the files re-point — to the
-- otherwise-verbatim live function body (captured from pg_get_functiondef on
-- rebuild-test, so this reproduces exactly what is deployed).
--
-- ⚠️ Rebuild-test only. Applied via MCP; ledger row hand-inserted; object verified
-- by re-reading pg_get_functiondef and confirming the re-point is present.

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

  -- S105b item 6 (#5-estred) — carry ESTIMATE FILE ATTACHMENTS onto the project.
  -- An estimate file lives with estimate_id set / project_id NULL
  -- (files_owner_arm_check arm 2); conversion moves it to the project (arm 1).
  -- BOTH columns change in ONE statement, so no row is transiently left with both
  -- NULL and a non-company category — which the CHECK would reject. SECURITY
  -- DEFINER carries this past files RLS for a converting PM, the same authority as
  -- the contract_documents re-point above, not a widening. No is_deleted filter:
  -- a soft-deleted estimate attachment moves with the rest so the project's trash
  -- is complete.
  UPDATE files
     SET project_id = v_project_id,
         estimate_id = NULL
   WHERE estimate_id = v_estimate.id;

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
