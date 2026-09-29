-- =============================================================================
-- S115 R10 — ORIGINAL BUDGET LINES ARE EDITABLE INSIDE THE PROJECT, GATED BY STATE
-- =============================================================================
-- RULED [Josh, 2026-09-28], R10: "Owner, Admin, Project Manager and Project
-- Executive may add and edit original-budget line items until the first invoice
-- is issued. After that, changes go through change orders as they do today.
-- Not gated on the QuickBooks exclusion flag."
--
-- WHAT THIS OVERTURNS, AND ONLY THIS. `20260818000000_budget_line_immutability`
-- made budget lines immutable ("the absence of UPDATE and DELETE policies on
-- this table is deliberate… if a line genuinely must change, the answer is a
-- new line via a change order"). R10 is Josh's newer ruling for ORIGINAL lines
-- BEFORE the first invoice. The mechanism keeps S97's shape: NO UPDATE or DELETE
-- policy is added to project_budget_items (the pinned policy set is untouched);
-- the only new write path is the two SECURITY DEFINER functions below, which
-- check the role, the project, that the line is original, and the invoice gate.
-- Change-order lines and ad-hoc / Miscellaneous lines stay immutable. Nothing
-- is deleted (R10 names add and edit; a charged line is FK-undeletable anyway).
--
-- ⚠️ THE PROJECT MANAGER IS NOT ADMITTED — S115 ASK-R10-PM. An original line's
-- only money is project_budget_amounts.budgeted_amount, which the Financial
-- Visibility Floor [RULED S150] withholds from a PM for read AND write. Letting
-- a PM write it is a Floor ruling, not an R10 detail (stop rule 4). Admitting
-- the PM later is one array element in `can_edit_original_budget`, once Josh
-- says which shape (Q2: non-money fields only / write-only amount / Floor change).
--
-- "ISSUED" [S115 ASK-19, taken A]: an invoice on the project with status
-- sent, paid or voided — i.e. it left draft/pending_approval and was numbered.
-- A void does NOT reopen the window. Evaluated SECURITY DEFINER: a PM sees only
-- invoices it authored (20261038000000), so an RLS-scoped EXISTS would miss them.
--
-- NOT GATED ON project_qb_exclusions — nothing below reads it (R10's ⚠️).
--
-- TOUCHES NO EXISTING ROW. One nullable column with a constant default (no
-- rewrite, no CHECK, no NOT NULL), three new functions. No constraint governs
-- an existing row.
-- =============================================================================

-- 1. The marker for a line ADDED to the original budget after conversion.
--    Converted lines are recognised by their estimate source; a line added under
--    R10 has none, and without this it would be indistinguishable from an
--    expense-capture ad-hoc line (which R10 does not make editable).
ALTER TABLE public.project_budget_items
  ADD COLUMN added_to_original_budget boolean DEFAULT false;

COMMENT ON COLUMN public.project_budget_items.added_to_original_budget IS
  'S115 R10: true only for a line added to the ORIGINAL budget via add_original_budget_line() before the first invoice. Converted lines are original by their estimate source columns instead.';

-- 2. Has the project issued an invoice? (ASK-19 A: sent, paid or voided.)
CREATE FUNCTION public.project_has_issued_invoice(p_project_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM invoices i
     WHERE i.project_id = p_project_id
       AND i.company_id = get_my_company_id()
       AND COALESCE(i.is_deleted, false) = false
       AND i.status = ANY (ARRAY['sent', 'paid', 'voided'])
  );
$$;

-- 3. May the caller edit this project's original budget right now?
--    Owner/Admin on a project of their company, or a Project Executive on an
--    ASSIGNED project (pe_on_project) — and no invoice issued yet.
CREATE FUNCTION public.can_edit_original_budget(p_project_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT (
           (get_my_role() = ANY (ARRAY['owner', 'admin'])
             AND EXISTS (SELECT 1 FROM projects pr
                          WHERE pr.id = p_project_id
                            AND pr.company_id = get_my_company_id()
                            AND COALESCE(pr.is_deleted, false) = false))
           OR pe_on_project(p_project_id)
         )
     AND NOT project_has_issued_invoice(p_project_id);
$$;

-- 4. Add a line to the original budget.
CREATE FUNCTION public.add_original_budget_line(
  p_project_id uuid,
  p_description text,
  p_budgeted_amount numeric,
  p_cost_code text DEFAULT NULL
) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_company_id uuid;
  v_id uuid;
BEGIN
  IF NOT public.can_edit_original_budget(p_project_id) THEN
    RAISE EXCEPTION 'add_original_budget_line: not permitted (role, project, or an invoice has been issued — use a change order)'
      USING ERRCODE = '42501';
  END IF;
  IF p_description IS NULL OR btrim(p_description) = '' THEN
    RAISE EXCEPTION 'add_original_budget_line: a description is required' USING ERRCODE = '22023';
  END IF;
  IF p_budgeted_amount IS NULL OR p_budgeted_amount < 0 THEN
    RAISE EXCEPTION 'add_original_budget_line: the budgeted amount must be zero or more' USING ERRCODE = '22023';
  END IF;

  SELECT company_id INTO v_company_id FROM projects WHERE id = p_project_id;

  INSERT INTO project_budget_items (
    company_id, project_id, description, cost_code, added_to_original_budget, created_by
  ) VALUES (
    v_company_id, p_project_id, btrim(p_description),
    NULLIF(btrim(COALESCE(p_cost_code, '')), ''), true, auth.uid()
  )
  RETURNING id INTO v_id;

  INSERT INTO project_budget_amounts (company_id, budget_item_id, budgeted_amount)
  VALUES (v_company_id, v_id, round(p_budgeted_amount, 2));

  RETURN v_id;
END;
$$;

-- 5. Edit an original line: its description, cost code and budgeted amount.
CREATE FUNCTION public.update_original_budget_line(
  p_budget_item_id uuid,
  p_description text,
  p_budgeted_amount numeric,
  p_cost_code text DEFAULT NULL
) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_line RECORD;
BEGIN
  SELECT id, company_id, project_id, source_change_order_id, source_line_row_id,
         source_line_item_id, is_miscellaneous, added_to_original_budget, is_deleted
    INTO v_line
    FROM project_budget_items
   WHERE id = p_budget_item_id AND company_id = get_my_company_id();
  IF v_line.id IS NULL OR COALESCE(v_line.is_deleted, false) THEN
    RAISE EXCEPTION 'update_original_budget_line: line not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.can_edit_original_budget(v_line.project_id) THEN
    RAISE EXCEPTION 'update_original_budget_line: not permitted (role, project, or an invoice has been issued — use a change order)'
      USING ERRCODE = '42501';
  END IF;
  -- ORIGINAL only: from the estimate, or added to the original budget under R10.
  -- A change-order line, an ad-hoc capture line and Miscellaneous stay immutable.
  IF v_line.source_change_order_id IS NOT NULL
     OR COALESCE(v_line.is_miscellaneous, false)
     OR NOT (v_line.source_line_row_id IS NOT NULL
             OR v_line.source_line_item_id IS NOT NULL
             OR COALESCE(v_line.added_to_original_budget, false)) THEN
    RAISE EXCEPTION 'update_original_budget_line: only an original budget line can be edited' USING ERRCODE = '42501';
  END IF;
  IF p_description IS NULL OR btrim(p_description) = '' THEN
    RAISE EXCEPTION 'update_original_budget_line: a description is required' USING ERRCODE = '22023';
  END IF;
  IF p_budgeted_amount IS NULL OR p_budgeted_amount < 0 THEN
    RAISE EXCEPTION 'update_original_budget_line: the budgeted amount must be zero or more' USING ERRCODE = '22023';
  END IF;

  UPDATE project_budget_items
     SET description = btrim(p_description),
         cost_code = NULLIF(btrim(COALESCE(p_cost_code, '')), '')
   WHERE id = v_line.id;

  INSERT INTO project_budget_amounts (company_id, budget_item_id, budgeted_amount)
  VALUES (v_line.company_id, v_line.id, round(p_budgeted_amount, 2))
  ON CONFLICT (budget_item_id) DO UPDATE SET budgeted_amount = EXCLUDED.budgeted_amount;
END;
$$;

-- Callable by signed-in users only; each function checks the caller itself.
REVOKE ALL ON FUNCTION public.project_has_issued_invoice(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.can_edit_original_budget(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.add_original_budget_line(uuid, text, numeric, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.update_original_budget_line(uuid, text, numeric, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.project_has_issued_invoice(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_edit_original_budget(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_original_budget_line(uuid, text, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_original_budget_line(uuid, text, numeric, text) TO authenticated;
