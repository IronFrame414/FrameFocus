-- ============================================================================
-- S122 PART 0-C — A PER-LINE BILLING CEILING. ⚠️ MONEY.
-- ============================================================================
-- RULED [Josh, S122 Q7-A]: "a PM only sees invoices they wrote, so the screen's
-- 'remaining' can be wrong upward. That's a correctness problem, not defence in
-- depth."
--
-- Phase 1 (S122 1.5b) found that enforce_contract_billing_ceiling() — the only
-- billing ceiling — compares the CONTRACT TOTAL (`v_others + NEW.billed_amount
-- > v_contract`), on fixed-price projects only. No database function read
-- source_estimate_line_item_id. So a line billed above ITS OWN agreed price
-- was accepted whenever the contract as a whole still had headroom. The
-- percentage control could never do that (a percent of remaining never exceeds
-- remaining); a typed dollar amount (0-C) can, and the per-line remaining the
-- screen shows is computed under the caller's RLS, so for a PM it can be too
-- HIGH. This makes the line's sell the ceiling for that line, in the database.
--
-- SCOPE: fixed-price projects only, exactly as the contract ceiling (P11 —
-- on any other project type the estimate is a projection, not a price).
--
-- THE RULE: for one estimate line item,
--     Σ billed_amount of its lines on LIVE invoices  ≤  its sell
-- where sell = total_price_override when set, else total_price (the same rule
-- loadEstimateLineBilling and computeLineTotalsFromRows use), and LIVE = not
-- soft-deleted and not voided (voiding frees the remainder, as for the
-- contract). The ceiling is INCLUSIVE: billing exactly the sell is allowed.
--
-- PRE-CHECK ON PRODUCTION (read-only, before this file existed on any DB):
-- 3 billed line items / 3 lines; 0 over their sell; 2 EXACTLY at their sell
-- ($2,838.00 and $62,500.00) — which is why the comparison is `>`, not `>=`.
-- A trigger checks only rows being written, so no existing row can make this
-- migration fail; it adds no constraint over existing rows.
--
-- NOT CHANGED: the contract ceiling (still runs, first — trigger names sort
-- invoice_lines_z_contract_ceiling < invoice_lines_z_line_item_ceiling), the
-- one-at-a-time write in billEstimateLines, the discount-last order, every
-- RLS policy.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enforce_line_item_billing_ceiling()
RETURNS TRIGGER
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_project_type text;
  v_name   text;
  v_sell   numeric(12,2);
  v_others numeric(12,2);
BEGIN
  IF NEW.source_estimate_line_item_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- P11, mirrored from the contract ceiling: on a non-fixed-price project the
  -- estimate's figures are a PROJECTION that must never feed billing math, so
  -- a line's "sell" there is no ceiling either. (The line-item picker is a
  -- fixed-price feature; this keeps the two ceilings' scope identical.)
  SELECT p.project_type INTO v_project_type
  FROM public.invoices i JOIN public.projects p ON p.id = i.project_id
  WHERE i.id = NEW.invoice_id;
  IF v_project_type IS DISTINCT FROM 'fixed_price' THEN
    RETURN NEW;
  END IF;

  -- LOCK FIRST, THEN READ (the contract ceiling's order): two invoices billing
  -- the same line at once serialise on the item row, so both cannot pass.
  SELECT e.name, COALESCE(e.total_price_override, e.total_price)
    INTO v_name, v_sell
  FROM public.estimate_line_items e
  WHERE e.id = NEW.source_estimate_line_item_id
  FOR UPDATE;

  IF v_sell IS NULL THEN
    RETURN NEW;  -- an unpriced item has no ceiling to exceed
  END IF;

  -- SECURITY DEFINER: every live invoice counts, including ones the caller's
  -- RLS cannot see (a PM's view of "billed" is exactly what was wrong).
  SELECT COALESCE(SUM(l.billed_amount), 0) INTO v_others
  FROM public.invoice_lines l
  JOIN public.invoices i ON i.id = l.invoice_id
  WHERE l.source_estimate_line_item_id = NEW.source_estimate_line_item_id
    AND i.is_deleted = false
    AND i.status <> 'voided'
    AND l.id IS DISTINCT FROM NEW.id;

  IF v_others + NEW.billed_amount > v_sell THEN
    RAISE EXCEPTION
      'This would bill more than the line "%" is priced at. Its price is %, % is already billed on it, and this adds % — a total of %. Bill at most % on this line.',
      v_name, v_sell, v_others, NEW.billed_amount, v_others + NEW.billed_amount, GREATEST(v_sell - v_others, 0)
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_line_item_billing_ceiling() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER invoice_lines_z_line_item_ceiling
  BEFORE INSERT OR UPDATE ON public.invoice_lines
  FOR EACH ROW EXECUTE FUNCTION public.enforce_line_item_billing_ceiling();
