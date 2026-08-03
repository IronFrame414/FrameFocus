-- ============================================================================
-- budgeted_amount — STAGE 4: retire project_budget_items.budgeted_amount.
--
-- THE IRREVERSIBLE ONE. Stages 1-3 were additive and rolled back with a DROP
-- TABLE or a code revert. From here the column is gone.
--
-- ONE TRANSACTION, and the ORDER inside it is the whole safety property:
--   1. the four writers are replaced so none of them writes the column;
--   2. the transitional sync trigger is dropped;
--   3. the column is dropped.
-- The trigger must not outlive the column (it reads NEW.budgeted_amount and
-- would raise on every budget-line write), and the column must not outlive the
-- writers (they would keep filling a column nothing reads). Splitting these
-- leaves a window where budget-line CREATION fails outright — worse than a
-- hidden figure, because it is no line at all.
--
-- All four bodies were read from the LIVE pg_get_functiondef at apply time and
-- their declarations are byte-exact. The ONLY change in each is where the
-- budgeted figure is written.
--
-- ONE SHAPE CHANGE, recorded deliberately: the two set-based INSERT...SELECT
-- writers (apply_change_order_budget, convert_estimate_to_project §5/§5b)
-- become row-by-row loops. A set INSERT cannot return the new line id paired
-- with its amount unless the amount is a column of the inserted row, and it no
-- longer is. The alternative was to start writing source_line_row_id on CO
-- rows purely to make a join work, which would change grouping semantics to
-- serve the migration — worse. Row counts here are budget lines per CO or per
-- estimate: small.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. create_budget_line_at_capture — the simplest: a literal 0.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_budget_line_at_capture(p_project_id uuid, p_description text, p_cost_code text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id uuid;
  v_id uuid;
BEGIN
  IF public.get_my_role() IS NULL
     OR public.get_my_role() NOT IN ('owner', 'admin', 'project_manager') THEN
    RAISE EXCEPTION 'Only Owner/Admin/PM may create a budget line at capture.';
  END IF;
  IF p_description IS NULL OR btrim(p_description) = '' THEN
    RAISE EXCEPTION 'create_budget_line_at_capture: a description is required';
  END IF;
  IF NOT public.can_view_project(p_project_id) THEN
    RAISE EXCEPTION 'create_budget_line_at_capture: project not visible';
  END IF;

  SELECT company_id INTO v_company_id
  FROM projects
  WHERE id = p_project_id AND company_id = public.get_my_company_id();
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'create_budget_line_at_capture: project not found';
  END IF;

  INSERT INTO project_budget_items (
    company_id, project_id, description, cost_code, created_by
  ) VALUES (
    v_company_id, p_project_id, btrim(p_description),
    NULLIF(btrim(COALESCE(p_cost_code, '')), ''), auth.uid()
  )
  RETURNING id INTO v_id;

  -- [RULING] the budgeted figure now lives in project_budget_amounts.
  INSERT INTO project_budget_amounts (company_id, budget_item_id, budgeted_amount)
  VALUES (v_company_id, v_id, 0);

  RETURN v_id;
END;
$function$;

-- ----------------------------------------------------------------------------
-- 2. get_or_create_misc_budget_item — note the ON CONFLICT DO NOTHING race
--    path: the amounts row is written only when THIS call created the line.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_or_create_misc_budget_item(p_project_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id uuid;
  v_id uuid;
BEGIN
  IF NOT public.can_view_project(p_project_id) THEN
    RAISE EXCEPTION 'get_or_create_misc_budget_item: project not visible';
  END IF;

  SELECT company_id INTO v_company_id
  FROM projects
  WHERE id = p_project_id AND company_id = public.get_my_company_id();
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'get_or_create_misc_budget_item: project not found';
  END IF;

  SELECT id INTO v_id
  FROM project_budget_items
  WHERE project_id = p_project_id AND is_miscellaneous AND is_deleted = false;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO project_budget_items (
    company_id, project_id, description, is_miscellaneous, created_by
  ) VALUES (
    v_company_id, p_project_id, 'Miscellaneous', true, auth.uid()
  )
  ON CONFLICT (project_id) WHERE is_miscellaneous AND NOT is_deleted DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    -- Lost the race — the winner's row is the line, and the winner wrote its
    -- own amounts row.
    SELECT id INTO v_id
    FROM project_budget_items
    WHERE project_id = p_project_id AND is_miscellaneous AND is_deleted = false;
  ELSE
    -- [RULING] only the caller that actually created the line writes it.
    INSERT INTO project_budget_amounts (company_id, budget_item_id, budgeted_amount)
    VALUES (v_company_id, v_id, 0)
    ON CONFLICT (budget_item_id) DO NOTHING;
  END IF;

  RETURN v_id;
END;
$function$;

-- ----------------------------------------------------------------------------
-- 3. apply_change_order_budget — set INSERT becomes a loop (see header).
-- ----------------------------------------------------------------------------
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
           WHEN 'material' THEN
             CASE WHEN v_row.unit_of_measure = 'allowance'
                  THEN COALESCE(v_row.unit_cost, 0)
                  ELSE COALESCE(v_row.unit_cost, 0) * COALESCE(v_row.quantity, 0) END
           ELSE COALESCE(v_row.amount, 0)
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
$function$;

-- ----------------------------------------------------------------------------
-- 4. convert_estimate_to_project — §5 and §5b become loops. Everything else in
--    this long function is untouched, including the RULING 2 project_financials
--    insert added earlier; only the two budget inserts changed.
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
    CASE WHEN v_is_signed THEN 'signed' ELSE 'draft' END,
    v_contract_value,
    v_estimate.signed_proposal_file_id,
    v_estimate.accepted_at::date,
    auth.uid()
  );

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

-- ----------------------------------------------------------------------------
-- 5. The transitional trigger goes BEFORE the column — it reads
--    NEW.budgeted_amount and plpgsql resolves that at runtime.
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS project_budget_items_sync_amount ON public.project_budget_items;
DROP FUNCTION IF EXISTS public.sync_budget_amount_to_split();

-- ----------------------------------------------------------------------------
-- 6. Now the column can go.
-- ----------------------------------------------------------------------------
ALTER TABLE public.project_budget_items DROP COLUMN budgeted_amount;

COMMIT;
