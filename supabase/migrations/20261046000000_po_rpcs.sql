-- ============================================================================
-- PO module §4.8 — the RPC family (R-Q1, R-Q5, R-L2, R-L3).
-- ============================================================================
--
-- Every writer of purchase_orders.total_amount lives HERE and takes the same
-- transaction-local app.po_total exemption the column-scope trigger honours
-- (financial_rls_floor_part3.sql:170-192). The trigger stays; direct UPDATEs
-- stay blocked; s97ct-floor3 §5's property survives every function below
-- (R-L2).
--
-- THE COMMITTED WRITER (R-Q1): sync_po_commitment maintains ONE expenses row
-- per PO — state='committed', purchase_order_id set (the origin predicate's
-- marker, correctly, because this row IS the commitment) — whose amount is
-- the Σ cost of ISSUED + FLAGGED lines, allocated per budget line. The row
-- follows the normal pending → approved review, exactly like today's
-- set_po_total_amount row (only 7C's retainage row is system-approved, and
-- this module does not extend that exception). When nothing is outstanding
-- the row is CLOSED OUT — countsTowardCommitted() then removes it from every
-- displayed committed figure (budget.ts + payables); the stored gross
-- committed_amount keeps its promise-never-mutated semantics.

BEGIN;

-- ── sync_po_commitment ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_po_commitment(p_po_id uuid)
RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_po RECORD;
  v_open_sum numeric;
  v_expense_id uuid;
  v_supplier text;
  v_alloc RECORD;
BEGIN
  SELECT po.*, s.company_name AS vendor_company_name
  INTO v_po
  FROM purchase_orders po
  LEFT JOIN subcontractors s ON s.id = po.vendor_id
  WHERE po.id = p_po_id AND po.is_deleted = false;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'sync_po_commitment: purchase order not found';
  END IF;

  SELECT COALESCE(SUM(round(poi.qty_ordered * poi.unit_cost, 2)), 0)
  INTO v_open_sum
  FROM purchase_order_items poi
  WHERE poi.purchase_order_id = p_po_id
    AND poi.is_deleted = false
    AND poi.unit_cost IS NOT NULL
    AND poi.line_status IN ('issued', 'flagged');

  v_supplier := COALESCE(v_po.vendor_company_name, v_po.vendor_name);

  SELECT id INTO v_expense_id
  FROM expenses
  WHERE purchase_order_id = p_po_id
    AND is_deleted = false
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_open_sum > 0 THEN
    IF v_expense_id IS NULL THEN
      INSERT INTO expenses (
        company_id, project_id, supplier, expense_date, amount,
        description, cost_category, state, purchase_order_id
      ) VALUES (
        v_po.company_id, v_po.project_id, v_supplier, CURRENT_DATE, v_open_sum,
        CASE WHEN v_po.po_number IS NOT NULL THEN 'PO ' || v_po.po_number ELSE 'Purchase order commitment' END,
        'material', 'committed', p_po_id
      ) RETURNING id INTO v_expense_id;
    ELSE
      UPDATE expenses
      SET amount = v_open_sum, closed_out_at = NULL, closed_out_by = NULL, closeout_reason = NULL
      WHERE id = v_expense_id;
    END IF;

    -- Reconcile allocations to the per-budget-line open sums (the
    -- multi-allocation shape set_po_total_amount's tail already tolerates).
    DELETE FROM expense_allocations WHERE expense_id = v_expense_id;
    FOR v_alloc IN
      SELECT poi.budget_item_id, SUM(round(poi.qty_ordered * poi.unit_cost, 2)) AS line_sum
      FROM purchase_order_items poi
      WHERE poi.purchase_order_id = p_po_id
        AND poi.is_deleted = false
        AND poi.unit_cost IS NOT NULL
        AND poi.budget_item_id IS NOT NULL
        AND poi.line_status IN ('issued', 'flagged')
      GROUP BY poi.budget_item_id
    LOOP
      INSERT INTO expense_allocations (company_id, expense_id, budget_item_id, amount)
      VALUES (v_po.company_id, v_expense_id, v_alloc.budget_item_id, v_alloc.line_sum);
    END LOOP;
  ELSIF v_expense_id IS NOT NULL THEN
    -- Nothing outstanding: the promise is done. Close out (amount kept as
    -- history); countsTowardCommitted() removes it from every display.
    UPDATE expenses
    SET closed_out_at = now(), closeout_reason = 'All PO lines purchased or cancelled'
    WHERE id = v_expense_id AND closed_out_at IS NULL;
  END IF;
END;
$$;

-- ── issue_po_lines (R-Q5: per-line issue; R-L3: number at first issue) ──────
CREATE OR REPLACE FUNCTION public.issue_po_lines(p_po_id uuid, p_item_ids uuid[])
RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_po RECORD;
  v_bad integer;
  v_total numeric;
BEGIN
  IF public.get_my_role() IS NULL
     OR public.get_my_role() NOT IN ('owner', 'admin', 'project_manager') THEN
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
$$;

-- ── flag_po_item_missing (R6.3/R7) ──────────────────────────────────────────
-- SECURITY DEFINER because the PO-items UPDATE policy is O/A/PM and the
-- flagger is a FIELD member: the gate here is being ASSIGNED to the line (or
-- being O/A/PM). The notification is raised by the calling route (notify() is
-- application code), not here.
CREATE OR REPLACE FUNCTION public.flag_po_item_missing(p_item_id uuid, p_note text)
RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_me uuid := public.get_my_member_id();
  v_item RECORD;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'flag_po_item_missing: no member identity';
  END IF;

  SELECT poi.*, po.company_id AS po_company_id
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

  IF public.get_my_role() NOT IN ('owner', 'admin', 'project_manager')
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
$$;

-- ── mark_po_lines_purchased (R6.5/R6.6 — a review-time act) ─────────────────
CREATE OR REPLACE FUNCTION public.mark_po_lines_purchased(p_po_id uuid, p_item_ids uuid[])
RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_bad integer;
BEGIN
  IF public.get_my_role() IS NULL OR public.get_my_role() NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Only Owner/Admin may mark PO lines purchased (it is a review act).';
  END IF;
  IF p_item_ids IS NULL OR array_length(p_item_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'mark_po_lines_purchased: nothing to mark';
  END IF;

  PERFORM set_config('app.po_total', 'on', true);

  PERFORM 1 FROM purchase_orders
  WHERE id = p_po_id AND company_id = public.get_my_company_id() AND is_deleted = false
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'mark_po_lines_purchased: purchase order not found';
  END IF;

  SELECT COUNT(*) INTO v_bad
  FROM unnest(p_item_ids) AS want(id)
  LEFT JOIN purchase_order_items poi
    ON poi.id = want.id AND poi.purchase_order_id = p_po_id AND poi.is_deleted = false
  WHERE poi.id IS NULL OR poi.line_status NOT IN ('issued', 'flagged');
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'mark_po_lines_purchased: % line(s) are not open lines of this PO', v_bad;
  END IF;

  UPDATE purchase_order_items
  SET line_status = 'purchased'
  WHERE id = ANY (p_item_ids);

  PERFORM public.sync_po_commitment(p_po_id);
  PERFORM public.recompute_po_status(p_po_id);
END;
$$;

-- ── set_po_total_amount — the LEGACY arm gains its guard (R-L1/R-L2) ────────
-- One clause added at the top of the existing body's checks; everything else
-- is 20260809's definition verbatim. A costed-line PO derives its total from
-- lines; hand-typing over it would let the header contradict the lines again
-- — the exact defect R3 removes.
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
     OR public.get_my_role() NOT IN ('owner', 'admin', 'project_manager') THEN
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

COMMIT;
