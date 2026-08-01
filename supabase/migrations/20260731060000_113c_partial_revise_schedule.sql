-- =============================================================================
-- Migration: 113c_partial_revise_schedule
-- SUPERSEDES the RPC body shipped earlier today in
-- 20260731050000_113c_stage5_revise_schedule.sql (same function name and
-- signature — CREATE OR REPLACE; that migration stays in history, but its
-- header no longer describes the live behavior).
--
-- Josh's rulings (2026-07-31, S95 second ruling set) — 113c-spec.md §5 as
-- amended today:
--   1. Revise applies to ANY contract — the requires_formal_contract gate is
--      DROPPED. Editability is decoupled from the formal flag; italic stays a
--      display signal only.
--   2. PARTIAL revise: unpaid stages fully editable (torn down + replaced).
--      A PARTIALLY-PAID stage stays editable IN PLACE with its amount FLOORED
--      AT GROSS PAID (Σ expense_payments.amount, withholding included) —
--      never below money already out.
--   3. FROZEN: closed-out stages, and any stage on a signed or void contract.
--   4. contract_value: WARN ONLY (Σ stages vs value), no hard floor — the
--      standing P2 posture.
--   5. The is_retainage withheld-accrual row is NEVER touched. Retainage
--      percent changes AND shape switches (percent_across ↔ final_hold) are
--      allowed mid-stream — forward-only automatically, because withholding
--      is computed per payment at record time.
--   6. Edited/replaced UNPAID stages land status='pending' and need
--      Owner/Admin re-approval before they count toward committed. An edited
--      PARTIALLY-PAID stage KEEPS status='approved' — flipping it pending
--      would drop committed while money is already out.
--   7. Owner/Admin only (unchanged from stage 5).
--
-- Shape (Option A): soft-delete ONLY unpaid/unclosed non-retainage stage rows
-- + their allocations; INSERT replacement rows directly; edit partially-paid
-- rows in place; leave frozen rows and the retainage accrual untouched. The
-- rebuild is NOT delegated to setup_payment_schedule: the surviving
-- partially-paid rows would trip its one-schedule guard. Stage + retainage
-- validation is RESTATED from setup_payment_schedule (20260730010000 §10a)
-- rather than factored into a shared helper — a helper would force a
-- same-migration rewrite of setup for no behavior change. THE TWO STATEMENTS
-- MUST CHANGE TOGETHER; this file is the only other statement of those rules.
--
-- Posture: SECURITY INVOKER (7C RPC posture) + SET search_path; Owner/Admin
-- check inside; RLS scopes the contract; signed/void guards. Owner/Admin pass
-- enforce_expenses_column_scope via its early return and the Owner/Admin arm
-- of expenses_update_authorized (both read this session).
--
-- Verify at apply (this migration is WRITTEN, NOT APPLIED — confirm against
-- the live schema, not this header):
--   * expenses_recompute_on_change fires on amount / is_deleted updates and
--     expense_allocations_recompute on allocation writes → committed
--     re-derives for every touched line (wiring read at 20260730010000
--     lines 916–1002);
--   * record_expense_payment pays only approved rows → every partially-paid
--     row is approved; the in-place edit never touches status;
--   * the allocations unique key (expense_id, budget_item_id) has no
--     is_deleted predicate — retargeting an edited stage onto a line that
--     already holds a SOFT-DELETED allocation for the same pair raises
--     unique_violation; surfaced as an error, reconciled in review.
--
-- No schema changes — one replaced RPC. No database.ts regen needed
-- (functions are not in generated types).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.revise_sub_contract_schedule(
  p_sub_contract_id uuid,
  p_stages jsonb,                        -- [{"id"?, "label", "amount", "budget_item_id"?}, ...]
                                         -- "id" present  = in-place edit of a PARTIALLY-PAID stage
                                         -- "id" absent   = replacement stage (lands pending)
  p_retainage_shape text DEFAULT NULL,   -- the NEW full retainage state (NULL = no retainage),
  p_retainage_percent numeric DEFAULT NULL, -- not "keep" — the panel edit submits full state
  p_contract_value numeric DEFAULT NULL  -- NULL = keep the current value
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_contract RECORD;
  v_supplier text;
  v_stage RECORD;
  v_row RECORD;
  v_gross_paid numeric;
  v_alloc_count integer;
  v_expense_id uuid;
  v_edited integer := 0;
  v_removed integer := 0;
  v_inserted integer := 0;
  v_live_count integer;
  v_live_total numeric;
  v_check_value numeric;
  v_multi_alloc boolean := false;
  v_warning text := NULL;
BEGIN
  IF public.get_my_role() IS NULL
     OR public.get_my_role() NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Only Owner/Admin may revise a payment schedule.';
  END IF;

  -- RLS scopes the contract; the lock serializes concurrent revises.
  SELECT * INTO v_contract
  FROM subcontractor_contracts
  WHERE id = p_sub_contract_id AND is_deleted = false
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'revise_sub_contract_schedule: contract not found';
  END IF;
  IF v_contract.status = 'void' THEN
    RAISE EXCEPTION 'revise_sub_contract_schedule: the contract is void — its schedule is frozen';
  END IF;
  IF v_contract.status = 'signed' THEN
    RAISE EXCEPTION 'revise_sub_contract_schedule: the contract is signed — its schedule is frozen; corrections go through void and re-enter';
  END IF;
  -- Ruling 1: NO requires_formal_contract gate. Ruling 2: NO blanket
  -- payments-exist gate — payments now freeze per stage (floor), not the path.

  IF p_contract_value IS NOT NULL AND p_contract_value <= 0 THEN
    RAISE EXCEPTION 'revise_sub_contract_schedule: the contract value must be greater than zero';
  END IF;

  -- Retainage pairing — RESTATED from setup_payment_schedule (change both
  -- together). percent_across needs a percent; final_hold and none do not.
  IF p_retainage_shape IS NOT NULL
     AND p_retainage_shape NOT IN ('percent_across', 'final_hold') THEN
    RAISE EXCEPTION 'revise_sub_contract_schedule: unknown retainage shape %', p_retainage_shape;
  END IF;
  IF p_retainage_shape = 'percent_across'
     AND (p_retainage_percent IS NULL OR p_retainage_percent < 0) THEN
    RAISE EXCEPTION 'revise_sub_contract_schedule: percent_across needs a retainage percent';
  END IF;

  SELECT display_name INTO v_supplier
  FROM company_members WHERE id = v_contract.member_id;

  -- Pass 0 — per-stage validation, RESTATED once from setup_payment_schedule
  -- (change both together): label, positive amount, budget line on the
  -- contract's own project.
  FOR v_stage IN
    SELECT s ->> 'label' AS label,
           (s ->> 'amount')::numeric AS amount,
           (s ->> 'budget_item_id')::uuid AS budget_item_id
    FROM jsonb_array_elements(p_stages) s
  LOOP
    IF v_stage.label IS NULL OR btrim(v_stage.label) = '' THEN
      RAISE EXCEPTION 'revise_sub_contract_schedule: every stage needs a label';
    END IF;
    IF v_stage.amount IS NULL OR v_stage.amount <= 0 THEN
      RAISE EXCEPTION 'revise_sub_contract_schedule: every stage needs a positive amount';
    END IF;
    IF v_stage.budget_item_id IS NOT NULL THEN
      PERFORM 1 FROM project_budget_items b
      WHERE b.id = v_stage.budget_item_id
        AND b.project_id = v_contract.project_id
        AND b.is_deleted = false;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'revise_sub_contract_schedule: budget line % is not on this contract''s project', v_stage.budget_item_id;
      END IF;
    END IF;
  END LOOP;

  -- Pass 1 — in-place edits: entries carrying "id" (partially-paid rows
  -- ONLY; unpaid rows are replaced, not edited). The retainage accrual is
  -- unreachable here (is_retainage = false filter).
  FOR v_stage IN
    SELECT (s ->> 'id')::uuid AS id,
           s ->> 'label' AS label,
           (s ->> 'amount')::numeric AS amount,
           (s ->> 'budget_item_id')::uuid AS budget_item_id
    FROM jsonb_array_elements(p_stages) s
    WHERE s ->> 'id' IS NOT NULL
  LOOP
    SELECT * INTO v_row
    FROM expenses
    WHERE id = v_stage.id
      AND sub_contract_id = p_sub_contract_id
      AND is_retainage = false
      AND is_deleted = false
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'revise_sub_contract_schedule: stage % is not a live stage on this contract', v_stage.id;
    END IF;
    IF v_row.closed_out_at IS NOT NULL THEN
      RAISE EXCEPTION 'revise_sub_contract_schedule: stage "%" was closed out — closed-out stages are frozen', v_row.stage_label;
    END IF;

    -- GROSS paid = Σ payment amounts, retainage withholding included — the
    -- floor is money committed out the door, not net cash.
    SELECT COALESCE(SUM(p.amount), 0) INTO v_gross_paid
    FROM expense_payments p
    WHERE p.expense_id = v_row.id AND p.is_deleted = false;

    IF v_gross_paid = 0 THEN
      RAISE EXCEPTION 'revise_sub_contract_schedule: stage "%" has no payments — unpaid stages are replaced, not edited; resend it without "id"', v_row.stage_label;
    END IF;
    IF v_stage.amount < v_gross_paid THEN
      RAISE EXCEPTION 'revise_sub_contract_schedule: stage "%" already has % paid (gross) — its amount cannot go below that', v_row.stage_label, v_gross_paid;
    END IF;

    -- status is deliberately NOT touched (ruling 6): the row is approved
    -- (payments land only on approved rows) and must keep counting.
    UPDATE expenses
    SET amount = v_stage.amount,
        stage_label = btrim(v_stage.label)
    WHERE id = v_row.id;

    -- A single allocation tracks the new amount (set_po_total_amount
    -- pattern), and the entry may retarget it. A manual multi-line split is
    -- left for the review popup to reconcile rather than guessing a
    -- proration — flagged in the returned warning.
    SELECT COUNT(*) INTO v_alloc_count
    FROM expense_allocations
    WHERE expense_id = v_row.id AND is_deleted = false;

    IF v_alloc_count = 1 THEN
      UPDATE expense_allocations
      SET amount = v_stage.amount,
          budget_item_id = COALESCE(v_stage.budget_item_id, budget_item_id)
      WHERE expense_id = v_row.id AND is_deleted = false;
    ELSIF v_alloc_count = 0 AND v_stage.budget_item_id IS NOT NULL THEN
      INSERT INTO expense_allocations (expense_id, budget_item_id, amount)
      VALUES (v_row.id, v_stage.budget_item_id, v_stage.amount);
    ELSIF v_alloc_count > 1 THEN
      v_multi_alloc := true;
    END IF;

    v_edited := v_edited + 1;
  END LOOP;

  -- Pass 2 — tear down every UNPAID, UNCLOSED, non-retainage stage (+ its
  -- allocations). Soft delete only (trash-bin pattern). Frozen rows
  -- (closed-out) and the is_retainage accrual are excluded by predicate;
  -- partially-paid rows are excluded by the NOT EXISTS. The soft-deletes
  -- fire the shipped recompute triggers — those lines' committed drops until
  -- the replacements are re-approved.
  UPDATE expense_allocations a
  SET is_deleted = true, deleted_at = now()
  FROM expenses e
  WHERE a.expense_id = e.id
    AND e.sub_contract_id = p_sub_contract_id
    AND e.is_retainage = false
    AND e.closed_out_at IS NULL
    AND e.is_deleted = false
    AND a.is_deleted = false
    AND NOT EXISTS (
      SELECT 1 FROM expense_payments p
      WHERE p.expense_id = e.id AND p.is_deleted = false
    );

  UPDATE expenses e
  SET is_deleted = true, deleted_at = now()
  WHERE e.sub_contract_id = p_sub_contract_id
    AND e.is_retainage = false
    AND e.closed_out_at IS NULL
    AND e.is_deleted = false
    AND NOT EXISTS (
      SELECT 1 FROM expense_payments p
      WHERE p.expense_id = e.id AND p.is_deleted = false
    );
  GET DIAGNOSTICS v_removed = ROW_COUNT;

  -- Pass 3 — INSERT replacement stages (entries without "id"), directly —
  -- NOT via setup_payment_schedule (its one-schedule guard would trip on the
  -- surviving partially-paid rows). Rows land status='pending' by default —
  -- the Owner/Admin approval gate re-applies before committed counts again
  -- (ruling 6). INSERT shape mirrors setup_payment_schedule.
  FOR v_stage IN
    SELECT s ->> 'label' AS label,
           (s ->> 'amount')::numeric AS amount,
           (s ->> 'budget_item_id')::uuid AS budget_item_id
    FROM jsonb_array_elements(p_stages) s
    WHERE s ->> 'id' IS NULL
  LOOP
    INSERT INTO expenses (
      project_id, supplier, expense_date, amount,
      cost_category, state, sub_contract_id, stage_label
    ) VALUES (
      v_contract.project_id, COALESCE(v_supplier, 'Subcontractor'), CURRENT_DATE,
      v_stage.amount, 'subcontractor', 'committed', p_sub_contract_id,
      btrim(v_stage.label)
    ) RETURNING id INTO v_expense_id;

    IF v_stage.budget_item_id IS NOT NULL THEN
      INSERT INTO expense_allocations (expense_id, budget_item_id, amount)
      VALUES (v_expense_id, v_stage.budget_item_id, v_stage.amount);
    END IF;

    v_inserted := v_inserted + 1;
  END LOOP;

  -- A revised schedule must keep at least one live stage — wiping the
  -- schedule is not a revise; abandoning the contract is a void.
  SELECT COUNT(*), COALESCE(SUM(amount), 0) INTO v_live_count, v_live_total
  FROM expenses
  WHERE sub_contract_id = p_sub_contract_id
    AND is_retainage = false
    AND is_deleted = false;

  IF v_live_count = 0 THEN
    RAISE EXCEPTION 'revise_sub_contract_schedule: a revised schedule needs at least one stage — to abandon the contract, void it instead';
  END IF;

  -- Contract updates. Retainage params are the NEW full state (NULL shape =
  -- no retainage) — the panel edit submits full state. Mid-stream
  -- percent/shape switches are forward-only automatically: withholding is
  -- computed per payment at record time, and the accrual row was never
  -- touched above (ruling 5). contract_value: NULL keeps the current value.
  UPDATE subcontractor_contracts
  SET retainage_shape = p_retainage_shape,
      retainage_percent = p_retainage_percent,
      contract_value = COALESCE(p_contract_value, contract_value)
  WHERE id = p_sub_contract_id;

  -- Ruling 4: Σ stages vs contract value WARNS, never blocks.
  v_check_value := COALESCE(p_contract_value, v_contract.contract_value);
  IF v_check_value IS NULL THEN
    v_warning := 'No contract value on record — stages entered without a total to check against.';
  ELSIF v_live_total <> v_check_value THEN
    v_warning := format('Stages total %s but the contract value is %s.', v_live_total, v_check_value);
  END IF;
  IF v_multi_alloc THEN
    v_warning := COALESCE(v_warning || ' ', '')
      || 'An edited stage carries a manual multi-line allocation split — reconcile its allocations in review.';
  END IF;

  RETURN jsonb_build_object(
    'stage_count', v_live_count,
    'stage_total', v_live_total,
    'edited_count', v_edited,
    'removed_count', v_removed,
    'new_count', v_inserted,
    'warning', v_warning
  );
END;
$$;
