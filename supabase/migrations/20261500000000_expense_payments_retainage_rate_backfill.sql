-- ============================================================================
-- S104 — back-fill `expense_payments.retainage_percent_applied`, then VALIDATE
--        `expense_payments_retainage_rate_recorded_check`.
-- ============================================================================
--
-- ⚠️ THIS OVERTURNS AN EXPLICIT S151 DECISION. READ THAT DECISION BEFORE
-- READING THE FIX.
--
-- `20261003000000_7c_retainage_rate_recorded.sql` added the constraint as
-- **NOT VALID** on purpose, and said why in its own words:
--
--   _"NOT VALID so the 7 pre-existing withhold rows are GRANDFATHERED rather
--    than back-filled with a rate nobody recorded; every new row is checked."_
--
-- and the column comment agrees: _"NULL means no rate was applied to this
-- payment (no withhold), or that it predates this column."_
--
-- **RULED [Josh, S104]: back-fill them and validate.** Recorded as a ruling
-- change, not as a discovered drift — the S151 reasoning was sound and is not
-- being called wrong.
--
-- ----------------------------------------------------------------------------
-- ⚠️ WHY IT HAD TO CHANGE — `NOT VALID` IS NOT INERT, AND IT BIT
-- ----------------------------------------------------------------------------
-- `NOT VALID` exempts a row only until something UPDATEs it. Any update then
-- re-checks the WHOLE row and fails. So the seven grandfathered rows are not
-- merely un-validated — they are **permanently un-writable**, by anything.
--
-- That is a live defect, measured at S104:
--
--   * The 7G connector's `expense_payment:create` handler pushes a **Purchase**
--     to QuickBooks and then writes `qb_purchase_id` back. On a grandfathered
--     row that write is REJECTED, so the Purchase exists in the customer's books
--     with nothing in FrameFocus pointing at it.
--   * Until S104 the handler did not check the error and returned `pushed`
--     anyway, so the orphan was invisible. See `lib/quickbooks/reconcile.ts`.
--   * S187 met this same constraint on the DISCONNECT path and worked around it
--     by scoping the update to rows carrying a link. **A sync writer cannot use
--     that escape** — it must update the one row it just pushed.
--
-- S187's own comment says *"One such row exists on rebuild-test."* The measured
-- number at S104 is **SEVEN**.
--
-- ----------------------------------------------------------------------------
-- ⚠️ WHERE THE RATE COMES FROM, AND WHY NOT FROM THE CONTRACT
-- ----------------------------------------------------------------------------
-- S151's objection was *"a rate nobody recorded"*. It is answered by arithmetic
-- rather than by overruling: the rate IS recorded, implicitly, in the two
-- numbers already on the row. `retainage_withheld / amount` is exact.
--
-- ⚠️ THE OBVIOUS SOURCE — the contract's `retainage_percent` — IS WRONG, and
-- measuring it is what proved the derivation is the right one. On rebuild-test
-- **four of the seven rows imply 5% while their contract says 10%**, including
-- **two rows on the SAME contract** (`ed0c33aa…`) implying 5% and 10%. Rates
-- move, and the prospective-only ruling [Josh, S150] means a later change never
-- restates an earlier payment. So the contract rate is the CURRENT rate, not the
-- rate that produced these dollars. Only the row's own arithmetic is.
--
-- ⚠️ AND IT ABORTS RATHER THAN ROUNDING. `retainage_percent_applied` is
-- `numeric(5,2)`. If any row's implied rate does not survive a round-trip to two
-- decimal places EXACTLY, this migration raises and writes nothing — because a
-- rounded rate would be a rate nobody recorded, which is precisely what S151
-- refused and what this migration must not do by the back door. Every one of the
-- seven is exactly 5.00 or 10.00 today.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Abort before any write if a rate is not exactly representable.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_bad integer;
BEGIN
  SELECT count(*) INTO v_bad
  FROM public.expense_payments
  WHERE retainage_withheld <> 0
    AND retainage_percent_applied IS NULL
    AND (
      amount IS NULL
      OR amount = 0
      -- The round-trip test: two decimal places must reproduce the dollars.
      OR round(round(100.0 * retainage_withheld / amount, 2) * amount / 100.0, 2)
         <> round(retainage_withheld, 2)
    );

  IF v_bad > 0 THEN
    RAISE EXCEPTION
      'S104 back-fill refused: % expense_payments row(s) have a retainage rate that is not exactly representable as numeric(5,2). Nothing was written. Resolve these by hand — a rounded rate is exactly the "rate nobody recorded" that S151 refused.',
      v_bad;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. The back-fill.
-- ----------------------------------------------------------------------------
-- ⚠️ The BEFORE UPDATE guard `enforce_expense_payments_column_scope` freezes
-- `retainage_percent_applied` for every end-user editor. It opens with
-- `IF auth.uid() IS NULL THEN RETURN NEW`, and a migration has no `auth.uid()`,
-- so this passes for the same reason the 7G service-role worker does. The
-- immutability the trigger enforces is unchanged for everyone else.
UPDATE public.expense_payments
SET retainage_percent_applied = round(100.0 * retainage_withheld / amount, 2)
WHERE retainage_withheld <> 0
  AND retainage_percent_applied IS NULL;

-- ----------------------------------------------------------------------------
-- 3. Prove it before trusting it.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_left integer;
BEGIN
  SELECT count(*) INTO v_left
  FROM public.expense_payments
  WHERE retainage_withheld <> 0 AND retainage_percent_applied IS NULL;

  IF v_left > 0 THEN
    RAISE EXCEPTION 'S104 back-fill incomplete: % row(s) still violate the constraint.', v_left;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 4. VALIDATE, so the NOT VALID trap cannot bite a third path.
-- ----------------------------------------------------------------------------
-- ⚠️ THIS IS THE HALF THAT MATTERS FOR THE FUTURE. The back-fill fixes seven
-- rows; validating the constraint means Postgres has checked EVERY row and
-- there is no longer a class of quietly un-writable rows on this table. A
-- `NOT VALID` constraint is a landmine whose radius grows with the table.
ALTER TABLE public.expense_payments
  VALIDATE CONSTRAINT expense_payments_retainage_rate_recorded_check;

COMMENT ON COLUMN public.expense_payments.retainage_percent_applied IS
  '7C B1 [S151]. The retainage rate in force when THIS payment was taken, recorded by record_expense_payment from the same expression that computed retainage_withheld. Prospective-only ruling [Josh, S150]: a later rate change never restates this. ⚠️ AMENDED [S104] — NULL no longer means "predates this column". The seven grandfathered rows were back-filled from retainage_withheld/amount (the contract rate was measured and is WRONG on four of them), and expense_payments_retainage_rate_recorded_check is now VALIDATED. A withhold without a rate is impossible on this table, old rows included.';

COMMENT ON CONSTRAINT expense_payments_retainage_rate_recorded_check ON public.expense_payments IS
  'S104: VALIDATED, no longer NOT VALID. It was NOT VALID from S151 to S104 to grandfather seven rows — which made those rows permanently un-updatable, because NOT VALID exempts a row only until something writes to it. That silently broke the 7G QuickBooks link-back write. Do not re-add a NOT VALID constraint to this table without reading 20261500000000.';
