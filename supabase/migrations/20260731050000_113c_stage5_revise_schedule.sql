-- =============================================================================
-- Migration: 113c_stage5_revise_schedule
-- 113c-spec.md §5 (stage 5 of the §10 build sequence) — the
-- editable-while-unsigned revise path. While a sub-contract is
-- requires_formal_contract = true AND status <> 'signed' AND no payments
-- exist against its rows, the schedule (and the contract value) may be
-- revised: the existing stage rows and their allocations are SOFT-DELETED
-- and setup_payment_schedule re-runs — ONE transaction, atomic. Once
-- signed, or once any payment lands, the path is closed (RAISE) and
-- corrections go through the normal 7C void → re-enter.
--
-- Verified-at-build mechanics ([BUILD-VERIFY] items from the spec):
--   * one-schedule guard: setup_payment_schedule counts only
--     is_deleted = false stage rows, so the re-run passes after the
--     soft-delete;
--   * column-scope trigger (enforce_expenses_column_scope): Owner/Admin
--     early-return; is_deleted is not a restricted column;
--   * allocations unique key (expense_id, budget_item_id) has no
--     is_deleted predicate — no collision, replacement stages are NEW
--     expense rows;
--   * recompute: the soft-deletes fire the shipped expense/allocation
--     recompute triggers — committed returns to 0 until re-approval.
--
-- ROLES — documented deviation from spec §8: revise is OWNER/ADMIN only,
-- not Owner/Admin/PM. Two reasons: (a) SECURITY INVOKER (the 7C RPC
-- posture, kept here) — the expenses_update_authorized policy lets a PM
-- update only own PENDING rows, so a PM cannot soft-delete approved stage
-- rows; (b) revising tears down APPROVED committed rows, which is
-- approve-level authority PM explicitly lacks (spec §4). The spec's PM
-- grant carried a [BUILD-VERIFY] tag; this is its resolution.
--
-- No schema changes — one new RPC. No database.ts regen needed (functions
-- are not in generated types).
-- =============================================================================

CREATE FUNCTION public.revise_sub_contract_schedule(
  p_sub_contract_id uuid,
  p_stages jsonb,                        -- [{"label", "amount", "budget_item_id"?}, ...]
  p_retainage_shape text DEFAULT NULL,
  p_retainage_percent numeric DEFAULT NULL,
  p_contract_value numeric DEFAULT NULL  -- NULL = keep the current value
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_contract RECORD;
  v_result jsonb;
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
    RAISE EXCEPTION 'revise_sub_contract_schedule: contract is void';
  END IF;
  IF v_contract.status = 'signed' THEN
    RAISE EXCEPTION 'revise_sub_contract_schedule: the contract is signed — revise is closed; corrections go through void and re-enter';
  END IF;
  IF NOT v_contract.requires_formal_contract THEN
    RAISE EXCEPTION 'revise_sub_contract_schedule: revise applies only to contracts awaiting a formal signature (113c §5)';
  END IF;
  IF p_contract_value IS NOT NULL AND p_contract_value <= 0 THEN
    RAISE EXCEPTION 'revise_sub_contract_schedule: the contract value must be greater than zero';
  END IF;

  -- §5: any payment closes the revise path — money already moved.
  PERFORM 1
  FROM expense_payments p
  JOIN expenses e ON e.id = p.expense_id
  WHERE e.sub_contract_id = p_sub_contract_id
    AND e.is_deleted = false
    AND p.is_deleted = false;
  IF FOUND THEN
    RAISE EXCEPTION 'revise_sub_contract_schedule: payments exist against this schedule — revise is closed; corrections go through void and re-enter';
  END IF;

  -- Tear down: allocations first, then the stage/retainage rows. Soft
  -- delete only (trash-bin pattern); the recompute triggers fire here and
  -- pull the lines' committed back to 0.
  UPDATE expense_allocations a
  SET is_deleted = true, deleted_at = now()
  FROM expenses e
  WHERE a.expense_id = e.id
    AND e.sub_contract_id = p_sub_contract_id
    AND e.is_deleted = false
    AND a.is_deleted = false;

  UPDATE expenses
  SET is_deleted = true, deleted_at = now()
  WHERE sub_contract_id = p_sub_contract_id
    AND is_deleted = false;

  IF p_contract_value IS NOT NULL THEN
    UPDATE subcontractor_contracts
    SET contract_value = p_contract_value
    WHERE id = p_sub_contract_id;
  END IF;

  -- Rebuild through the shipped setup RPC (same transaction, same caller —
  -- both SECURITY INVOKER): one-schedule guard now passes (deleted rows are
  -- excluded), stage validation + budget-line targeting + retainage pairing
  -- all reused, never restated. New stage rows land status='pending' — the
  -- Owner/Admin approval gate re-applies before committed counts again.
  v_result := public.setup_payment_schedule(
    p_sub_contract_id, p_stages, p_retainage_shape, p_retainage_percent
  );

  RETURN v_result;
END;
$$;
