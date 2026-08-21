-- ============================================================================
-- STAGE 1 of Allowances & Selections — 'allowance' is a FIFTH ROW TYPE. [S170]
-- ============================================================================
--
-- Spec: docs/specs/allowances-selections-spec.md §2. Analysis of record:
-- docs/specs/S169-allowances-selections-analysis.md §0, §1a, 2b.6.
--
-- RULED [Josh, S169 Q1]: MIGRATE. The old representation — a 'material' row
-- whose unit_of_measure = 'allowance' (4D §4.14: quantity ignored, unit_cost
-- IS the amount) — is retired. Two representations of one concept drift, and
-- the drift is silent.
--
-- WHAT THIS MIGRATION DOES, IN ORDER (one transaction):
--   1. Widens the four row_type/category CHECKs to admit 'allowance'.
--   2. Replaces both *_type_columns CHECKs with an explicit 'allowance' arm
--      (quantity + unit_cost only) AND an ELSE false. The old bodies ended
--      ELSE NULL, and NULL PASSES A CHECK — so a fifth value was accepted with
--      ANY column combination while the sibling row_type CHECK refused it. A
--      shape constraint that passes by falling through is not a constraint.
--   3. Rewrites existing material/allowance rows to row_type='allowance',
--      unit_of_measure='each', quantity=COALESCE(quantity,1) — on the two
--      line-row tables and on project_budget_items via source_line_row_id.
--      Live count on rebuild-test at S170: ZERO rows. The rewrite is kept
--      because production is a different database and the migration must be
--      correct there; the counts are RAISEd so the push log records them.
--   4. Drops 'allowance' from both unit_of_measure CHECKs (AFTER the rewrite).
--   5. Redefines the three SQL functions that branch on row_type with an
--      explicit 'allowance' arm. Before this, both budget writers fell to
--      ELSE COALESCE(amount, 0) for any unknown type — which would have
--      landed an allowance row's unit_cost figure at $0 with no error.
--
-- MARKUP [Josh, S169 Q3 as corrected]: sell derives per instrument. An
-- allowance rides the instrument's MATERIAL rate at every level — row
-- markup_percent -> estimates/change_orders.material_markup_percent ->
-- companies.default_material_markup_percent; on cost-plus,
-- cost_plus_material_percent. NO allowance_markup_percent columns and NO
-- cost_plus_allowance_percent rate type are added: the only reader the rate
-- type could have is the estimate/CO pricer, and 7D bills actual costs by
-- their EXPENSE category, which never carries 'allowance'.
--
-- ⚠️ companies.gl_account_* GAINS NOTHING, DELIBERATELY. The GL family maps
-- EXPENSE categories for QuickBooks, and expenses_cost_category_check is
-- three-valued (material | subcontractor | other). An actual cost incurred
-- against an allowance is booked as what it is — a tile purchase is
-- 'material'. Allowance is a BUDGET concept, not an expense category. Do not
-- "complete" the family; there is nothing to complete.
-- ============================================================================

BEGIN;

-- ── 1. row_type / category CHECKs ───────────────────────────────────────────
ALTER TABLE public.estimate_line_rows
  DROP CONSTRAINT estimate_line_rows_row_type_check,
  ADD CONSTRAINT estimate_line_rows_row_type_check
    CHECK (row_type = ANY (ARRAY['labor'::text, 'material'::text, 'subcontractor'::text, 'other'::text, 'allowance'::text]));

ALTER TABLE public.change_order_line_rows
  DROP CONSTRAINT change_order_line_rows_row_type_check,
  ADD CONSTRAINT change_order_line_rows_row_type_check
    CHECK (row_type = ANY (ARRAY['labor'::text, 'material'::text, 'subcontractor'::text, 'other'::text, 'allowance'::text]));

ALTER TABLE public.project_budget_items
  DROP CONSTRAINT project_budget_items_row_type_check,
  ADD CONSTRAINT project_budget_items_row_type_check
    CHECK (row_type IS NULL OR row_type = ANY (ARRAY['labor'::text, 'material'::text, 'subcontractor'::text, 'other'::text, 'allowance'::text]));

ALTER TABLE public.invoice_lines
  DROP CONSTRAINT invoice_lines_category_check,
  ADD CONSTRAINT invoice_lines_category_check
    CHECK (category IS NULL OR category = ANY (ARRAY['labor'::text, 'material'::text, 'subcontractor'::text, 'other'::text, 'allowance'::text]));

-- ── 2. *_type_columns — explicit arm, and ELSE false ────────────────────────
ALTER TABLE public.estimate_line_rows
  DROP CONSTRAINT estimate_line_rows_type_columns,
  ADD CONSTRAINT estimate_line_rows_type_columns CHECK (
    CASE row_type
      WHEN 'labor'         THEN amount IS NULL AND subcontractor_id IS NULL AND catalog_item_id IS NULL AND unit_of_measure IS NULL AND unit_cost IS NULL AND apply_tax = false
      WHEN 'material'      THEN rate IS NULL AND labor_unit IS NULL AND amount IS NULL AND subcontractor_id IS NULL
      WHEN 'allowance'     THEN rate IS NULL AND labor_unit IS NULL AND amount IS NULL AND subcontractor_id IS NULL AND catalog_item_id IS NULL
      WHEN 'subcontractor' THEN rate IS NULL AND quantity IS NULL AND labor_unit IS NULL AND catalog_item_id IS NULL AND unit_of_measure IS NULL AND unit_cost IS NULL
      WHEN 'other'         THEN rate IS NULL AND quantity IS NULL AND labor_unit IS NULL AND catalog_item_id IS NULL AND unit_of_measure IS NULL AND unit_cost IS NULL AND subcontractor_id IS NULL
      ELSE false
    END
  );

ALTER TABLE public.change_order_line_rows
  DROP CONSTRAINT change_order_line_rows_type_columns,
  ADD CONSTRAINT change_order_line_rows_type_columns CHECK (
    CASE row_type
      WHEN 'labor'         THEN amount IS NULL AND subcontractor_id IS NULL AND unit_of_measure IS NULL AND unit_cost IS NULL AND apply_tax = false
      WHEN 'material'      THEN rate IS NULL AND labor_unit IS NULL AND amount IS NULL AND subcontractor_id IS NULL
      WHEN 'allowance'     THEN rate IS NULL AND labor_unit IS NULL AND amount IS NULL AND subcontractor_id IS NULL
      WHEN 'subcontractor' THEN rate IS NULL AND quantity IS NULL AND labor_unit IS NULL AND unit_of_measure IS NULL AND unit_cost IS NULL
      WHEN 'other'         THEN rate IS NULL AND quantity IS NULL AND labor_unit IS NULL AND unit_of_measure IS NULL AND unit_cost IS NULL AND subcontractor_id IS NULL
      ELSE false
    END
  );

-- ── 3. Rewrite the old representation ───────────────────────────────────────
DO $do$
DECLARE
  v_est  integer;
  v_co   integer;
  v_bud  integer;
BEGIN
  -- Budget lines first, while the source rows still identify themselves.
  UPDATE public.project_budget_items b
     SET row_type = 'allowance'
   WHERE b.row_type = 'material'
     AND (
       EXISTS (SELECT 1 FROM public.estimate_line_rows r
                WHERE r.id = b.source_line_row_id
                  AND r.row_type = 'material' AND r.unit_of_measure = 'allowance')
       OR EXISTS (SELECT 1 FROM public.change_order_line_rows r
                WHERE r.id = b.source_line_row_id
                  AND r.row_type = 'material' AND r.unit_of_measure = 'allowance')
     );
  GET DIAGNOSTICS v_bud = ROW_COUNT;

  UPDATE public.estimate_line_rows
     SET row_type = 'allowance', unit_of_measure = 'each', quantity = COALESCE(quantity, 1)
   WHERE row_type = 'material' AND unit_of_measure = 'allowance';
  GET DIAGNOSTICS v_est = ROW_COUNT;

  UPDATE public.change_order_line_rows
     SET row_type = 'allowance', unit_of_measure = 'each', quantity = COALESCE(quantity, 1)
   WHERE row_type = 'material' AND unit_of_measure = 'allowance';
  GET DIAGNOSTICS v_co = ROW_COUNT;

  RAISE NOTICE '[S170] allowance rewrite: estimate_line_rows=%, change_order_line_rows=%, project_budget_items=%', v_est, v_co, v_bud;
END
$do$;

-- ── 4. unit_of_measure loses 'allowance' ────────────────────────────────────
ALTER TABLE public.estimate_line_rows
  DROP CONSTRAINT estimate_line_rows_unit_of_measure_check,
  ADD CONSTRAINT estimate_line_rows_unit_of_measure_check
    CHECK (unit_of_measure IS NULL OR unit_of_measure = ANY (ARRAY['each'::text, 'sq_ft'::text, 'linear_ft'::text, 'box'::text, 'bundle'::text, 'bag'::text, 'gallon'::text, 'pair'::text, 'set'::text, 'other'::text]));

ALTER TABLE public.change_order_line_rows
  DROP CONSTRAINT change_order_line_rows_unit_of_measure_check,
  ADD CONSTRAINT change_order_line_rows_unit_of_measure_check
    CHECK (unit_of_measure IS NULL OR unit_of_measure = ANY (ARRAY['each'::text, 'sq_ft'::text, 'linear_ft'::text, 'box'::text, 'bundle'::text, 'bag'::text, 'gallon'::text, 'pair'::text, 'set'::text, 'other'::text]));

-- ── 5. The three SQL functions that branch on row_type ──────────────────────
-- Bodies are the LIVE definitions read at S170 (pg_get_functiondef), edited
-- only at the row_type arms. Previous definers: convert_estimate_to_project
-- 20261002000000; apply_change_order_budget 20260817000000;
-- switch_pricing_mode 20260101000000 (baseline).

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
$function$

;

CREATE OR REPLACE FUNCTION public.apply_change_order_budget(p_change_order_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_co RECORD;
  v_count integer := 0;
  v_row RECORD;
  v_item_id uuid;
  v_amount numeric;
BEGIN
  -- Service-role (the signing flow) or Owner/Admin (the retry surface).
  IF auth.uid() IS NOT NULL
     AND (public.get_my_role() IS NULL
          OR public.get_my_role() NOT IN ('owner', 'admin')) THEN
    RAISE EXCEPTION 'apply_change_order_budget: Owner/Admin only';
  END IF;

  SELECT * INTO v_co
  FROM change_orders
  WHERE id = p_change_order_id AND is_deleted = false
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'apply_change_order_budget: change order not found';
  END IF;
  IF v_co.status <> 'signed' THEN
    RAISE EXCEPTION 'apply_change_order_budget: change order % is %, not signed', v_co.co_number, v_co.status;
  END IF;
  IF auth.uid() IS NOT NULL AND v_co.company_id <> public.get_my_company_id() THEN
    RAISE EXCEPTION 'apply_change_order_budget: change order not found';
  END IF;

  -- Idempotent: budget rows already written for this CO -> no-op.
  PERFORM 1 FROM project_budget_items
  WHERE source_change_order_id = p_change_order_id AND is_deleted = false;
  IF FOUND THEN
    RETURN 0;
  END IF;

  -- One budget row per CO line row — the §5.1 cost expression verbatim
  -- (tax-inclusive on any taxed non-labor row). cost_code NULL (COs are
  -- flat — no category tree); provenance is the FK, labeling is UI-side.
  FOR v_row IN
    SELECT r.row_type, r.name, r.rate, r.quantity, r.unit_of_measure,
           r.unit_cost, r.amount, r.apply_tax
    FROM change_order_line_rows r
    JOIN change_order_line_items li ON li.id = r.line_item_id
    WHERE li.change_order_id = p_change_order_id
  LOOP
    v_amount := CASE v_row.row_type
      WHEN 'labor' THEN COALESCE(v_row.rate, 0) * COALESCE(v_row.quantity, 0)
      ELSE round(
        (CASE v_row.row_type
           -- [S170] see convert_estimate_to_project: explicit arms, NULL else.
           WHEN 'material'      THEN COALESCE(v_row.unit_cost, 0) * COALESCE(v_row.quantity, 0)
           WHEN 'allowance'     THEN COALESCE(v_row.unit_cost, 0) * COALESCE(v_row.quantity, 0)
           WHEN 'subcontractor' THEN COALESCE(v_row.amount, 0)
           WHEN 'other'         THEN COALESCE(v_row.amount, 0)
           ELSE NULL
         END)
        * (CASE WHEN v_row.apply_tax
                THEN 1 + COALESCE(v_co.tax_rate, 0) / 100
                ELSE 1 END)
      , 2)
    END;

    INSERT INTO project_budget_items (
      company_id, project_id, source_change_order_id,
      row_type, cost_code, description, created_by
    ) VALUES (
      v_co.company_id, v_co.project_id, p_change_order_id,
      v_row.row_type, NULL, v_row.name, auth.uid()
    )
    RETURNING id INTO v_item_id;

    INSERT INTO project_budget_amounts (company_id, budget_item_id, budgeted_amount)
    VALUES (v_co.company_id, v_item_id, v_amount);

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$

;

CREATE OR REPLACE FUNCTION public.switch_pricing_mode(p_estimate_id uuid, p_new_mode text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id UUID := get_my_company_id();
  v_role TEXT := get_my_role();
  v_estimate estimates%ROWTYPE;
  v_company companies%ROWTYPE;
  v_active_sub NUMERIC;
  v_active_mat NUMERIC;
  v_active_lab NUMERIC;
  v_new_sub NUMERIC;
  v_new_mat NUMERIC;
  v_new_lab NUMERIC;
BEGIN
  IF p_new_mode NOT IN ('markup', 'margin') THEN
    RAISE EXCEPTION 'Invalid pricing mode: %', p_new_mode;
  END IF;

  IF v_role IS NULL OR v_role NOT IN ('owner', 'admin', 'project_manager') THEN
    RAISE EXCEPTION 'Only Owner, Admin, or PM can change pricing mode';
  END IF;

  SELECT * INTO v_estimate FROM estimates WHERE id = p_estimate_id;
  IF NOT FOUND OR v_estimate.company_id <> v_company_id THEN
    RAISE EXCEPTION 'Estimate not found';
  END IF;

  IF v_role = 'project_manager' AND v_estimate.created_by <> auth.uid() THEN
    RAISE EXCEPTION 'PMs can only modify their own estimates';
  END IF;

  IF v_estimate.status <> 'draft' THEN
    RAISE EXCEPTION 'Estimate is not editable (status: %)', v_estimate.status;
  END IF;

  IF v_estimate.pricing_mode = p_new_mode THEN
    RETURN;  -- no-op
  END IF;

  SELECT * INTO v_company FROM companies WHERE id = v_company_id;

  IF v_estimate.pricing_mode = 'markup' THEN
    v_active_sub := v_company.default_subcontractor_markup_percent;
    v_active_mat := v_company.default_material_markup_percent;
    v_active_lab := v_company.default_labor_markup_percent;
  ELSE
    v_active_sub := v_company.default_subcontractor_margin_percent;
    v_active_mat := v_company.default_material_margin_percent;
    v_active_lab := v_company.default_labor_margin_percent;
  END IF;

  IF p_new_mode = 'markup' THEN
    v_new_sub := v_company.default_subcontractor_markup_percent;
    v_new_mat := v_company.default_material_markup_percent;
    v_new_lab := v_company.default_labor_markup_percent;
  ELSE
    v_new_sub := v_company.default_subcontractor_margin_percent;
    v_new_mat := v_company.default_material_margin_percent;
    v_new_lab := v_company.default_labor_margin_percent;
  END IF;

  -- Estimate-level %s: swap only the ones still at the active-mode
  -- default (IS NOT DISTINCT FROM treats NULL=NULL as "at default").
  UPDATE estimates
  SET pricing_mode = p_new_mode,
      subcontractor_markup_percent = CASE
        WHEN subcontractor_markup_percent IS NOT DISTINCT FROM v_active_sub THEN v_new_sub
        ELSE subcontractor_markup_percent END,
      material_markup_percent = CASE
        WHEN material_markup_percent IS NOT DISTINCT FROM v_active_mat THEN v_new_mat
        ELSE material_markup_percent END,
      labor_markup_percent = CASE
        WHEN labor_markup_percent IS NOT DISTINCT FROM v_active_lab THEN v_new_lab
        ELSE labor_markup_percent END
  WHERE id = p_estimate_id;

  -- Row-level markups: NULL means "inherit from estimate" and stays
  -- NULL; non-NULL values equal to the active default (for that row's
  -- type) swap to the new default.
  UPDATE estimate_line_rows r
  SET markup_percent = CASE
        WHEN r.markup_percent IS NULL THEN NULL
        WHEN r.row_type = 'labor'
             AND r.markup_percent IS NOT DISTINCT FROM v_active_lab THEN v_new_lab
        -- [S170] an allowance row takes the MATERIAL default (Q3: it rides
        -- material's rate at every level), so it swaps with material here.
        WHEN r.row_type IN ('material', 'allowance')
             AND r.markup_percent IS NOT DISTINCT FROM v_active_mat THEN v_new_mat
        WHEN r.row_type IN ('subcontractor', 'other')
             AND r.markup_percent IS NOT DISTINCT FROM v_active_sub THEN v_new_sub
        ELSE r.markup_percent END
  FROM estimate_line_items li
  WHERE r.line_item_id = li.id AND li.estimate_id = p_estimate_id;
END;
$function$

;

COMMIT;
