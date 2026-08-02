-- ============================================================================
-- RULING 2, step 2 — the SQL-side writer.
--
-- convert_estimate_to_project() sets a new project's contract value from the
-- accepted estimate. That value now lives in project_financials.
--
-- Body taken from the LIVE definition read at apply time (pg_get_functiondef),
-- not from an older copy. Declaration preserved byte-exact:
--   CREATE OR REPLACE FUNCTION public.convert_estimate_to_project(p_estimate_id uuid)
--    RETURNS uuid / LANGUAGE plpgsql / SECURITY DEFINER / SET search_path TO 'public'
--
-- EXACTLY TWO CHANGES, both marked [RULING 2] below:
--   1. `contract_value` dropped from the INSERT INTO projects column list and
--      `v_contract_value` from its VALUES list.
--   2. A new INSERT INTO project_financials after the project row is created.
--
-- Everything else — including the client_contracts INSERT, which writes
-- client_contracts.contract_value, a DIFFERENT column that is staying — is
-- unchanged.
--
-- SECURITY DEFINER means the Owner/Admin RLS on project_financials does not
-- block this, which is correct: conversion is a PM-permitted action and the
-- figure comes from the estimate, not from the PM.
-- ============================================================================

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
  v_contract_value numeric;
  v_bid RECORD;
  v_unresolved text := '';
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

  -- §5.1 guard (OQ-10): every flat-priced line needs a cost basis before
  -- conversion. The convert screen prompts for these (S-6); this RAISE is
  -- defense in depth behind it — fill in and retry, never silently zeroed.
  PERFORM 1
  FROM estimate_line_items li
  WHERE li.estimate_id = v_estimate.id
    AND li.total_price_override IS NOT NULL
    AND li.override_cost IS NULL
    AND NOT EXISTS (SELECT 1 FROM estimate_line_rows r WHERE r.line_item_id = li.id);
  IF FOUND THEN
    RAISE EXCEPTION 'convert_estimate_to_project: flat-priced lines are missing a cost — enter each line''s cost, then convert';
  END IF;

  -- 1. Public number: the estimate's digits with the PRJ prefix (copied
  --    as-is — no independent re-padding). EST-0001 -> PRJ-0001.
  v_project_number := 'PRJ-' || regexp_replace(v_estimate.estimate_number, '^.*-', '');

  v_is_signed := (v_estimate.signed_proposal_file_id IS NOT NULL) OR (v_estimate.accepted_at IS NOT NULL);

  -- Contract value (P11): fixed copies the computed grand_total; cost-plus /
  -- T&M copy the USER-ENTERED projection — grand_total is never copied for
  -- non-fixed types and the projection is never auto-derived. NULL = none,
  -- a normal state. Display-only, labeled non-binding, excluded from
  -- variance and over/under math (spec §7.1).
  v_contract_value := CASE WHEN v_estimate.contract_type = 'fixed_price'
                           THEN v_estimate.grand_total
                           ELSE v_estimate.projected_value
                      END;

  -- 2–3. INSERT projects (project_internal_seq drawn by its column default;
  --      project_type now mirrors the instrument's contract_type)
  -- [RULING 2] contract_value removed from this INSERT — it lives in
  -- project_financials now (Owner/Admin RLS). tax_rate stays.
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

  -- [RULING 2] The contract value, in its own Owner/Admin-floored table. Only
  -- when there is one: a project without a value simply has no row, which reads
  -- identically to the NULL it used to carry.
  IF v_contract_value IS NOT NULL THEN
    INSERT INTO project_financials (company_id, project_id, contract_value, created_by)
    VALUES (v_company_id, v_project_id, v_contract_value, auth.uid());
  END IF;

  -- 4. Client contract record: signed when a signature exists, draft otherwise
  INSERT INTO client_contracts (
    company_id, project_id, status, contract_value,
    signed_proposal_file_id, executed_date, created_by
  ) VALUES (
    v_company_id, v_project_id,
    CASE WHEN v_is_signed THEN 'signed' ELSE 'draft' END,
    v_contract_value,
    v_estimate.signed_proposal_file_id,
    v_estimate.accepted_at::date,
    auth.uid()
  );

  -- 5. Budget baseline: one row per typed row. budgeted_amount = pre-markup
  --    cost, TAX-INCLUSIVE on any taxed row (A-1 — labor is never taxed by
  --    construction; the type-column CHECK pins apply_tax = false on labor).
  --    Matches computeRowBudgetCost() in estimate-totals.ts.
  INSERT INTO project_budget_items (
    company_id, project_id, source_line_row_id, source_line_item_id,
    row_type, cost_code, description, budgeted_amount, created_by
  )
  SELECT
    v_company_id, v_project_id, r.id, li.id,
    r.row_type, c.name, r.name,
    CASE r.row_type
      WHEN 'labor' THEN COALESCE(r.rate, 0) * COALESCE(r.quantity, 0)
      ELSE round(
        (CASE r.row_type
           WHEN 'material' THEN
             CASE WHEN r.unit_of_measure = 'allowance'
                  THEN COALESCE(r.unit_cost, 0)
                  ELSE COALESCE(r.unit_cost, 0) * COALESCE(r.quantity, 0) END
           ELSE COALESCE(r.amount, 0)   -- subcontractor / other
         END)
        * (CASE WHEN r.apply_tax
                THEN 1 + COALESCE(v_estimate.tax_rate, 0) / 100
                ELSE 1 END)
      , 2)
    END,
    auth.uid()
  FROM estimate_line_rows r
  JOIN estimate_line_items li ON li.id = r.line_item_id
  JOIN estimate_categories c ON c.id = li.category_id
  WHERE li.estimate_id = v_estimate.id;

  -- 5b. Flat-priced fallback (A-2): a line with a total_price_override and
  --     NO cost rows gets one budget row carrying its COST basis
  --     (override_cost — guarded non-NULL above), never the sell price.
  INSERT INTO project_budget_items (
    company_id, project_id, source_line_row_id, source_line_item_id,
    row_type, cost_code, description, budgeted_amount, created_by
  )
  SELECT
    v_company_id, v_project_id, NULL, li.id,
    NULL, c.name, li.name || ' (flat-priced line)', li.override_cost,
    auth.uid()
  FROM estimate_line_items li
  JOIN estimate_categories c ON c.id = li.category_id
  WHERE li.estimate_id = v_estimate.id
    AND li.total_price_override IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM estimate_line_rows r WHERE r.line_item_id = li.id);

  -- 5c. 113c-spec §3 — one DRAFT sub-contract per winning bid. Identity via
  --     subcontractors.member_id (#105(a)); EVERY unresolved sub is collected
  --     and raised in one error (E11) — atomic abort, nothing half-built.
  --     No committed dollars here: a draft has no schedule, so no expense
  --     rows and $0 committed (spec §1). The budget-line tie is re-derived
  --     at confirm from source_line_row_id — deliberately not stored (§3.3).
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
$function$;
