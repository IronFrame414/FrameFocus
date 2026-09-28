-- ============================================================================
-- S114 PART A, section 3 — the seven functions whose role list omits the PE.
-- ============================================================================
--
-- FILL-A-1 (functions): 21 public functions name project_manager. Seven are
-- project operations R1 gives this role; each is replaced here with ONLY its
-- role clause changed, and the PE always scoped to ITS projects through
-- pe_on_project() — several of these admit a PM company-wide (issue_po_lines,
-- flag_po_item_missing, set_po_total_amount read the PO by company only).
--
-- Bodies are the live definitions (pg_get_functiondef on rebuild-test, equal
-- to main: none of 20261850/1860/1890/1900 touches them). md5(prosrc) before:
--   chat_can_post                        c420c2c34f2d247d9bc2fbd5cb9d5d70
--   may_enter_client_thread              030fa292d5748ff737f3c0f1d8928e7b
--   create_budget_line_at_capture        ac7cfdfb272d68e10a9c47d3f6b219cb
--   flag_po_item_missing                 42b561a94d0ee2aaec69a47ba21c32d7
--   issue_po_lines                       9fcbda5e424c581c41ed4e99715c7562
--   set_po_total_amount                  7c596d84b7a049d76c29bffa6f52b960
--   get_approved_change_order_summaries  28969adaf0422a925e490fdbc96335c3
--
-- ⚠️ NOT CHANGED, deliberately:
--   - setup_payment_schedule(): sets a subcontract's stages and retainage
--     terms — contract authority [Josh, S114 Q5 A]. Live negative N8.
--   - the eleven sales-stage / site-visit functions (S111 Q7).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- chat_can_post — the PE posts in its projects' sub threads (mirrors the arm
-- chat_messages_insert_project_executive, 20261940000000).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.chat_can_post(p_thread_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM chat_threads t
    WHERE t.id = p_thread_id
      AND (
        -- Crew thread: anyone who can see the project, except a subcontractor.
        (
          t.kind = 'crew'
          AND get_my_role() IS DISTINCT FROM 'subcontractor'
          AND can_view_project(t.project_id)
        )
        -- Sub thread (ND-20): Owner and Admin by role; PM and the project's
        -- assigned subs by assignment. Foreman and crew are READERS only, and
        -- their absence here is what §7.4's banner is telling them about.
        -- [S114] The Project Executive on its own projects.
        OR (
          t.kind = 'sub'
          AND (
            get_my_role() = ANY (ARRAY['owner', 'admin'])
            OR (get_my_role() = 'project_manager' AND is_assigned_to_project(t.project_id))
            OR (get_my_role() = 'project_executive' AND pe_on_project(t.project_id))
            OR (get_my_role() = 'subcontractor' AND is_assigned_to_project(t.project_id))
          )
        )
      )
  );
$function$;

-- ---------------------------------------------------------------------------
-- may_enter_client_thread — Q9 A. The client-kind gate only; every SELECT on
-- a thread's messages still requires can_view_project (its projects).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.may_enter_client_thread()
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  SELECT get_my_role() = ANY (ARRAY['owner', 'admin', 'project_executive', 'project_manager', 'client']);
$function$;

-- ---------------------------------------------------------------------------
-- create_budget_line_at_capture — already refuses a project the caller cannot
-- see (can_view_project = assigned, for this role).
-- ---------------------------------------------------------------------------
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
     OR public.get_my_role() NOT IN ('owner', 'admin', 'project_executive', 'project_manager') THEN
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

-- ---------------------------------------------------------------------------
-- flag_po_item_missing — the PE flags any line on its projects' POs.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.flag_po_item_missing(p_item_id uuid, p_note text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_me uuid := public.get_my_member_id();
  v_item RECORD;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'flag_po_item_missing: no member identity';
  END IF;

  SELECT poi.*, po.company_id AS po_company_id, po.project_id AS po_project_id
  INTO v_item
  FROM purchase_order_items poi
  JOIN purchase_orders po ON po.id = poi.purchase_order_id
  WHERE poi.id = p_item_id AND poi.is_deleted = false
    AND po.company_id = public.get_my_company_id();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'flag_po_item_missing: line not found';
  END IF;
  IF v_item.line_status <> 'issued' THEN
    RAISE EXCEPTION 'flag_po_item_missing: only an issued line can be flagged (this one is %)', v_item.line_status;
  END IF;

  -- [S114] The Project Executive: any line on ITS projects' POs.
  IF public.get_my_role() NOT IN ('owner', 'admin', 'project_manager')
     AND NOT (public.get_my_role() = 'project_executive' AND public.pe_on_project(v_item.po_project_id))
     AND NOT EXISTS (
       SELECT 1 FROM purchase_order_item_assignments a
       WHERE a.po_item_id = p_item_id AND a.member_id = v_me AND a.is_deleted = false
     ) THEN
    RAISE EXCEPTION 'flag_po_item_missing: you are not assigned to this line';
  END IF;

  UPDATE purchase_order_items
  SET line_status = 'flagged',
      flag_note = NULLIF(trim(p_note), ''),
      flagged_at = now(),
      flagged_by = v_me
  WHERE id = p_item_id;

  -- The flagged line stays in the committed sum (it is still to be bought —
  -- R7 keeps it open), so the sync is a no-op on money today; called anyway
  -- so a later definition change cannot silently skip it.
  PERFORM public.sync_po_commitment(v_item.purchase_order_id);
END;
$function$;

-- ---------------------------------------------------------------------------
-- issue_po_lines — the PE issues lines on its projects' POs only.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.issue_po_lines(p_po_id uuid, p_item_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_po RECORD;
  v_bad integer;
  v_total numeric;
BEGIN
  IF public.get_my_role() IS NULL
     OR public.get_my_role() NOT IN ('owner', 'admin', 'project_executive', 'project_manager') THEN
    RAISE EXCEPTION 'Only Owner/Admin/PM may issue PO lines.';
  END IF;
  IF p_item_ids IS NULL OR array_length(p_item_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'issue_po_lines: nothing to issue';
  END IF;

  PERFORM set_config('app.po_total', 'on', true);

  SELECT * INTO v_po
  FROM purchase_orders
  WHERE id = p_po_id AND company_id = public.get_my_company_id() AND is_deleted = false
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'issue_po_lines: purchase order not found';
  END IF;
  -- [S114] The Project Executive only on its own projects.
  IF public.get_my_role() = 'project_executive' AND NOT public.pe_on_project(v_po.project_id) THEN
    RAISE EXCEPTION 'issue_po_lines: purchase order not found';
  END IF;
  IF v_po.status = 'closed' THEN
    RAISE EXCEPTION 'issue_po_lines: this PO is closed';
  END IF;

  -- Every named line must be a DRAFT line of THIS PO carrying a cost and a
  -- budget line — the two things an issued line commits against.
  SELECT COUNT(*) INTO v_bad
  FROM unnest(p_item_ids) AS want(id)
  LEFT JOIN purchase_order_items poi
    ON poi.id = want.id AND poi.purchase_order_id = p_po_id AND poi.is_deleted = false
  WHERE poi.id IS NULL
     OR poi.line_status <> 'draft'
     OR poi.unit_cost IS NULL
     OR poi.budget_item_id IS NULL;
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'issue_po_lines: % line(s) are not draft lines of this PO with a cost and a budget line', v_bad;
  END IF;

  UPDATE purchase_order_items
  SET line_status = 'issued'
  WHERE id = ANY (p_item_ids);

  UPDATE purchase_orders
  SET status = 'issued',
      po_number = COALESCE(po_number, public.next_po_number(v_po.project_id)),
      ordered_at = COALESCE(ordered_at, CURRENT_DATE)
  WHERE id = p_po_id;

  -- The ordered value: Σ every non-draft costed line (R3 — the total foots).
  SELECT COALESCE(SUM(round(poi.qty_ordered * poi.unit_cost, 2)), 0)
  INTO v_total
  FROM purchase_order_items poi
  WHERE poi.purchase_order_id = p_po_id
    AND poi.is_deleted = false
    AND poi.unit_cost IS NOT NULL
    AND poi.line_status <> 'draft';
  UPDATE purchase_orders SET total_amount = v_total WHERE id = p_po_id;

  PERFORM public.sync_po_commitment(p_po_id);
END;
$function$;

-- ---------------------------------------------------------------------------
-- set_po_total_amount — SECURITY INVOKER: RLS already scopes the PO it can
-- read; the explicit check keeps the refusal identical in shape.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_po_total_amount(p_po_id uuid, p_amount numeric, p_budget_item_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_po RECORD;
  v_expense_id uuid;
  v_alloc_id uuid;
  v_alloc_count integer;
BEGIN
  IF public.get_my_role() IS NULL
     OR public.get_my_role() NOT IN ('owner', 'admin', 'project_executive', 'project_manager') THEN
    RAISE EXCEPTION 'Only Owner/Admin/PM may set a PO total.';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'set_po_total_amount: amount must be positive';
  END IF;

  -- PO module R-L1: a line-bearing PO's total derives from its lines.
  IF EXISTS (
    SELECT 1 FROM purchase_order_items poi
    WHERE poi.purchase_order_id = p_po_id
      AND poi.is_deleted = false AND poi.unit_cost IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'set_po_total_amount: this PO carries costed lines — its total derives from them (issue lines instead)';
  END IF;

  PERFORM set_config('app.po_total', 'on', true);

  SELECT * INTO v_po
  FROM purchase_orders
  WHERE id = p_po_id AND is_deleted = false
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'set_po_total_amount: purchase order not found';
  END IF;
  -- [S114] The Project Executive only on its own projects.
  IF public.get_my_role() = 'project_executive' AND NOT public.pe_on_project(v_po.project_id) THEN
    RAISE EXCEPTION 'set_po_total_amount: purchase order not found';
  END IF;

  IF p_budget_item_id IS NOT NULL THEN
    PERFORM 1 FROM project_budget_items b
    WHERE b.id = p_budget_item_id
      AND b.project_id = v_po.project_id
      AND b.is_deleted = false;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'set_po_total_amount: budget line % is not on this PO''s project', p_budget_item_id;
    END IF;
  END IF;

  UPDATE purchase_orders SET total_amount = p_amount WHERE id = p_po_id;

  SELECT id INTO v_expense_id
  FROM expenses
  WHERE purchase_order_id = p_po_id
    AND closed_out_at IS NULL
    AND is_deleted = false;

  IF v_expense_id IS NULL THEN
    INSERT INTO expenses (
      project_id, supplier, expense_date, amount,
      description, cost_category, state, purchase_order_id
    ) VALUES (
      v_po.project_id, v_po.vendor_name, CURRENT_DATE, p_amount,
      CASE WHEN v_po.po_number IS NOT NULL THEN 'PO ' || v_po.po_number ELSE 'Purchase order commitment' END,
      'material', 'committed', p_po_id
    ) RETURNING id INTO v_expense_id;

    IF p_budget_item_id IS NOT NULL THEN
      INSERT INTO expense_allocations (expense_id, budget_item_id, amount)
      VALUES (v_expense_id, p_budget_item_id, p_amount);
    END IF;
  ELSE
    UPDATE expenses SET amount = p_amount WHERE id = v_expense_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'set_po_total_amount: you cannot adjust this commitment (approved commitments are Owner/Admin)';
    END IF;

    SELECT COUNT(*) INTO v_alloc_count
    FROM expense_allocations
    WHERE expense_id = v_expense_id AND is_deleted = false;

    IF v_alloc_count = 1 THEN
      SELECT id INTO v_alloc_id
      FROM expense_allocations
      WHERE expense_id = v_expense_id AND is_deleted = false;
      UPDATE expense_allocations SET amount = p_amount WHERE id = v_alloc_id;
    ELSIF v_alloc_count = 0 AND p_budget_item_id IS NOT NULL THEN
      INSERT INTO expense_allocations (expense_id, budget_item_id, amount)
      VALUES (v_expense_id, p_budget_item_id, p_amount);
    END IF;
  END IF;

  RETURN v_expense_id;
END;
$function$;

-- ---------------------------------------------------------------------------
-- get_approved_change_order_summaries — no money; the PE already reads full
-- COs on its projects. Added so a surface calling it answers the same.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_approved_change_order_summaries(p_project_id uuid)
 RETURNS TABLE(id uuid, project_id uuid, co_number text, title text, description text, signed_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT co.id, co.project_id, co.co_number, co.title, co.description, co.signed_at
  FROM change_orders co
  WHERE co.project_id = p_project_id
    AND co.company_id = get_my_company_id()
    AND get_my_role() = ANY (ARRAY['owner', 'admin', 'project_executive', 'project_manager', 'foreman', 'crew_member'])
    AND can_view_project(co.project_id)
    AND co.status = 'signed'
    AND co.is_deleted = false
  ORDER BY co.signed_at DESC NULLS LAST, co.co_number;
$function$;
