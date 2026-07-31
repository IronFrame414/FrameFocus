-- =============================================================================
-- Migration: award_no_cost_overwrite
-- Josh's ruling (2026-07-31, S95) — REVERSES the S93 TECH_DEBT #113
-- NON-ISSUE: setting a winning bid must NOT overwrite a subcontractor cost
-- the estimator already entered. Awarding is a record + identity update,
-- not a repricing. Fill-only-when-empty:
--   * existing sub row with a NON-ZERO amount → update subcontractor_id
--     ONLY; amount/total untouched (no cost change, no sell reflow).
--   * existing sub row with amount 0 or NULL → seed amount = bid_amount
--     (and total) as before — nothing estimator-entered is lost.
--   * no sub row → INSERT as before (amount = bid_amount). The ROW
--     CREATION stays: #113(c) stage 4 ties the sub-contract to the budget
--     line via source_line_row_id, so the row must exist at conversion.
-- Winner flip and all guards unchanged. The client wrapper's
-- recalculateEstimateTotals call becomes a no-op when the cost is kept.
--
-- Body reproduced byte-for-byte from the shipped function
-- (20260101000000_baseline_schema.sql:738-811 — its only definition;
-- declaration preserved exactly: SECURITY DEFINER, SET search_path TO
-- 'public', default volatility) except the single-row UPDATE branch.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.set_winning_bid(p_line_item_id uuid, p_sub_bid_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_company_id UUID := get_my_company_id();
  v_role TEXT := get_my_role();
  v_line estimate_line_items%ROWTYPE;
  v_bid estimate_sub_bids%ROWTYPE;
  v_estimate estimates%ROWTYPE;
  v_sub_row_count INTEGER;
  v_sub_row_id UUID;
  v_next_sort INTEGER;
BEGIN
  IF v_role IS NULL OR v_role NOT IN ('owner', 'admin', 'project_manager') THEN
    RAISE EXCEPTION 'Only Owner, Admin, or PM can set a winning bid';
  END IF;

  SELECT * INTO v_line FROM estimate_line_items WHERE id = p_line_item_id;
  IF NOT FOUND OR v_line.company_id <> v_company_id THEN
    RAISE EXCEPTION 'Line item not found';
  END IF;

  SELECT * INTO v_bid FROM estimate_sub_bids WHERE id = p_sub_bid_id;
  IF NOT FOUND OR v_bid.company_id <> v_company_id
     OR v_bid.line_item_id <> p_line_item_id OR v_bid.is_deleted THEN
    RAISE EXCEPTION 'Sub bid not found for this line item';
  END IF;

  SELECT * INTO v_estimate FROM estimates WHERE id = v_line.estimate_id;
  IF v_estimate.status <> 'draft' THEN
    RAISE EXCEPTION 'Estimate is not editable (status: %)', v_estimate.status;
  END IF;

  -- D2: PMs can only act on estimates they created
  IF v_role = 'project_manager' AND v_estimate.created_by <> auth.uid() THEN
    RAISE EXCEPTION 'PMs can only modify their own estimates';
  END IF;

  -- Flip the winner on the audit table (clear first so the partial
  -- unique index never sees two winners).
  UPDATE estimate_sub_bids
  SET is_winner = false
  WHERE line_item_id = p_line_item_id AND is_winner = true;

  UPDATE estimate_sub_bids SET is_winner = true WHERE id = p_sub_bid_id;

  -- Upsert exactly one subcontractor row on the line (Rev 2 §2.5).
  SELECT count(*) INTO v_sub_row_count
  FROM estimate_line_rows
  WHERE line_item_id = p_line_item_id AND row_type = 'subcontractor';

  IF v_sub_row_count >= 2 THEN
    RAISE EXCEPTION 'Line has % subcontractor rows; winning-bid auto-management requires 0 or 1', v_sub_row_count;
  ELSIF v_sub_row_count = 1 THEN
    -- S95 ruling: fill-only-when-empty. An estimator-entered cost is never
    -- overwritten by an award; an empty (0/NULL) cost is seeded from the bid.
    UPDATE estimate_line_rows
    SET subcontractor_id = v_bid.subcontractor_id,
        amount = CASE WHEN COALESCE(amount, 0) = 0 THEN v_bid.bid_amount ELSE amount END,
        total  = CASE WHEN COALESCE(amount, 0) = 0 THEN v_bid.bid_amount ELSE total  END   -- service recomputes with markup/tax
    WHERE line_item_id = p_line_item_id AND row_type = 'subcontractor';
  ELSE
    SELECT COALESCE(max(sort_order) + 1, 0) INTO v_next_sort
    FROM estimate_line_rows WHERE line_item_id = p_line_item_id;

    INSERT INTO estimate_line_rows (
      company_id, line_item_id, row_type, name, sort_order,
      markup_percent, apply_tax, total, amount, subcontractor_id
    ) VALUES (
      v_company_id, p_line_item_id, 'subcontractor', 'Subcontractor bid', v_next_sort,
      NULL, false, v_bid.bid_amount, v_bid.bid_amount, v_bid.subcontractor_id
    );
  END IF;
END;
$$;
