-- ============================================================================
-- S175 #3 — STAGE 5, part 2: the COST side has a shape, and approval keeps it
-- ============================================================================
--
-- `20261034000000` added `expense_allocations.source_selection_id` under the
-- ONE EXPENSE PER SELECTION ruling [Josh, S175]. Two things it did not do:
--
--   1. Say what a valid tag IS. Every allocation write reaches PostgREST
--      straight from the browser (capture form, split editor, review popup),
--      so the rule has to live in a trigger — a TypeScript check would be one
--      surface's opinion.
--
--   2. Survive approval. `approve_expense()` RECONCILES the split by deleting
--      every allocation row and re-inserting the passed set. It read exactly
--      two keys from each JSON element — `budget_item_id` and `amount` — so a
--      selection tagged at capture was silently dropped the moment an Owner
--      approved the expense, and the cost went back to being the allowance's.
--      That is the `final_hold` shape: accepted by the schema, acted on
--      nowhere. The column would have looked populated on every pending row
--      and empty on every approved one, which is the only kind that counts.
--
-- ============================================================================
-- THE SHAPE
-- ============================================================================
--
--   (a) The selection must be on the SAME PROJECT as the expense. A cost on
--       job A tagged with job B's selection is a cross-project attribution and
--       nothing downstream could make sense of it.
--
--   (b) If the selection is LINKED to an allowance budget line, the allocation
--       must be against THAT line. The whole point of the tag is that "this
--       cost is the selection's, booked against the allowance it draws on";
--       a tag on some other line is a contradiction rather than a choice.
--       An UNLINKED selection (Q8 — no allowance, variance = full sell) may be
--       booked against any line on the project: there is no allowance line
--       for it to be "the" one.
--
--   (c) A CLIENT-SUPPLIED selection carries no money by CHECK
--       (`selections_client_supplied_no_money`) and the company incurs no cost
--       for it. Tagging a cost with one is refused: a cost that exists is not
--       that selection's.
--
-- NOT enforced: that the selection is approved. A cost is routinely booked
-- before the client signs (the tile is ordered, then the signature comes
-- through), and refusing the tag until then would push every such cost back
-- onto the allowance line — exactly the attribution loss the column exists to
-- stop. Downstream readers (`profitability.ts`) attribute only APPROVED
-- selections and leave the rest on the allowance until the signature lands.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_expense_allocation_selection()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_expense_project uuid;
  v_sel RECORD;
BEGIN
  IF NEW.source_selection_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT e.project_id INTO v_expense_project
  FROM public.expenses e WHERE e.id = NEW.expense_id;

  SELECT s.project_id, s.allowance_budget_item_id, s.client_supplied, s.name
    INTO v_sel
  FROM public.selections s
  WHERE s.id = NEW.source_selection_id;

  IF v_sel IS NULL THEN
    RAISE EXCEPTION 'That selection does not exist.';
  END IF;

  IF v_sel.project_id IS DISTINCT FROM v_expense_project THEN
    RAISE EXCEPTION
      'Selection "%" is on a different project from this expense — a cost can only be tagged with a selection on its own job.',
      v_sel.name;
  END IF;

  IF v_sel.client_supplied THEN
    RAISE EXCEPTION
      'Selection "%" is client-supplied and carries no cost to the company; this expense cannot be its.',
      v_sel.name;
  END IF;

  IF v_sel.allowance_budget_item_id IS NOT NULL
     AND v_sel.allowance_budget_item_id IS DISTINCT FROM NEW.budget_item_id THEN
    RAISE EXCEPTION
      'Selection "%" draws on a different allowance line — book this cost against that allowance, or clear the selection.',
      v_sel.name;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_expense_allocation_selection() IS
$c$S175 stage 5 — the shape of `expense_allocations.source_selection_id`: same
project as the expense; not client-supplied; and, when the selection is linked
to an allowance line, booked against THAT line. Approval is deliberately not
required — costs precede signatures (see the migration header).$c$;

DROP TRIGGER IF EXISTS expense_allocations_selection_shape ON public.expense_allocations;
CREATE TRIGGER expense_allocations_selection_shape
  BEFORE INSERT OR UPDATE ON public.expense_allocations
  FOR EACH ROW EXECUTE FUNCTION public.enforce_expense_allocation_selection();

-- ── approve_expense carries the tag through reconciliation ──────────────────
-- Body from 20260730010000 (money representation), with ONE change: each JSON
-- element may carry `source_selection_id`, and it is written with the row. The
-- shape trigger above validates it — this function does not restate the rule.
CREATE OR REPLACE FUNCTION public.approve_expense(p_expense_id uuid, p_allocations jsonb DEFAULT '[]'::jsonb)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_me uuid := public.get_my_member_id();
  v_expense RECORD;
  v_alloc RECORD;
  v_total numeric := 0;
  v_count integer := 0;
BEGIN
  IF public.get_my_role() IS NULL
     OR public.get_my_role() NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Only Owner/Admin may approve expenses.';
  END IF;
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'No member identity for approver.';
  END IF;

  -- Row lock prevents two concurrent approvals of the same expense.
  SELECT * INTO v_expense
  FROM expenses
  WHERE id = p_expense_id
    AND company_id = public.get_my_company_id()
    AND is_deleted = false
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'approve_expense: expense not found';
  END IF;
  IF v_expense.status <> 'pending' THEN
    RAISE EXCEPTION 'approve_expense: expense is %, not pending', v_expense.status;
  END IF;

  -- Reconcile: the passed set replaces whatever capture (or an earlier
  -- review pass) wrote. See the header note on hard vs soft delete.
  DELETE FROM expense_allocations WHERE expense_id = p_expense_id;

  FOR v_alloc IN
    SELECT (a ->> 'budget_item_id')::uuid      AS budget_item_id,
           (a ->> 'amount')::numeric           AS amount,
           -- [S175 stage 5] NULL when absent — every caller that predates the
           -- column keeps working, and an untagged cost stays the allowance's.
           (a ->> 'source_selection_id')::uuid AS source_selection_id
    FROM jsonb_array_elements(p_allocations) a
  LOOP
    IF v_alloc.budget_item_id IS NULL OR v_alloc.amount IS NULL OR v_alloc.amount <= 0 THEN
      RAISE EXCEPTION 'approve_expense: each allocation needs a budget line and a positive amount';
    END IF;

    -- Every line must belong to the expense's own project + company.
    PERFORM 1
    FROM project_budget_items b
    WHERE b.id = v_alloc.budget_item_id
      AND b.project_id = v_expense.project_id
      AND b.company_id = v_expense.company_id
      AND b.is_deleted = false;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'approve_expense: budget line % is not on this expense''s project', v_alloc.budget_item_id;
    END IF;

    v_total := v_total + v_alloc.amount;
    v_count := v_count + 1;

    INSERT INTO expense_allocations (company_id, expense_id, budget_item_id, amount, source_selection_id)
    VALUES (v_expense.company_id, p_expense_id, v_alloc.budget_item_id, v_alloc.amount, v_alloc.source_selection_id);
  END LOOP;

  -- FINAL-state guard (A-7): every approval carries a full split.
  IF v_count = 0 THEN
    RAISE EXCEPTION 'approve_expense: at least one budget-line allocation is required';
  END IF;
  IF abs(v_total - v_expense.amount) >= 0.005 THEN
    RAISE EXCEPTION 'approve_expense: allocations (%) must equal the expense amount (%) exactly', v_total, v_expense.amount;
  END IF;

  UPDATE expenses
  SET status = 'approved',
      approved_by = v_me,
      approved_at = now()
  WHERE id = p_expense_id;
END;
$$;

COMMIT;
