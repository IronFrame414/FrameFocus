-- ============================================================================
-- 7C — B1. Record the retainage rate that produced each withhold.
-- ============================================================================
--
-- RULING [Josh, S150/S151]: RETAINAGE RATE CHANGES ARE PROSPECTIVE ONLY.
-- A rate change never reaches back. Past accruals stand at the rate in force
-- when they were taken; the new rate applies from that point forward.
--
-- WHAT THIS MIGRATION IS FOR
-- ----------------------------------------------------------------------------
-- The runtime ALREADY behaved prospectively — `record_expense_payment` computes
-- the withhold from the contract's rate at payment time and freezes the dollar
-- amount onto the payment row, and `enforce_expense_payments_column_scope` makes
-- that dollar amount immutable for every role, Owner/Admin included.
--
-- But nothing recorded WHICH RATE produced it. Only the dollars were kept, so
-- the ruling was true in dollars and unprovable in rate terms: the rate could
-- only be inferred as `retainage_withheld / amount`, which is lossy at the cent
-- level. This turns prospective-only from a BEHAVIOUR into a RECORD.
--
-- It is also the precondition for the display fix (Part A): the "Retainage held"
-- line may name a rate only when that rate accounts for the entire held total,
-- and answering "one rate or several?" needs the rate, not a division.
--
-- ⚠️ THIS DOES NOT ENFORCE PROSPECTIVE-ONLY BY ITSELF. The remaining hole is
-- that the accrual row's `amount` is freely writable — `enforce_expenses_column_scope`
-- returns NEW immediately for owner/admin and guards `amount` for nobody, so a
-- direct UPDATE still restates history. That is B2(ii) (derive the accrual
-- instead of accumulating it), SPEC ONLY at S151 — see
-- `docs/specs/7C-retainage-accrual-spec.md`. Do not read this migration as
-- closing that.
--
-- NO BACKFILL, DELIBERATELY
-- ----------------------------------------------------------------------------
-- 7 of the 14 live payment rows carry a withhold and none carries a rate. We do
-- not know what rate produced them — that is the very gap this closes — and
-- writing a guess would be exactly the retroactive claim the ruling forbids.
-- They stay NULL. NULL means "taken before the rate was recorded", and Part A
-- treats it as unknown rather than as agreement, which is why a NULL cannot
-- silently make a multi-rate total look single-rate.
--
-- ⚠️ THE FUNCTION BODY BELOW WAS TAKEN FROM `pg_proc.prosrc` ON THE LINKED
-- DATABASE, not from a migration file, and was verified byte-identical to
-- 20260729010000's before being edited (md5 c4e35efdb45f5a906108a9e0fc122a14).
-- That check is the S143 lesson. Everything outside the three marked B1 edits
-- is verbatim.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The column.
-- ----------------------------------------------------------------------------

ALTER TABLE public.expense_payments
  ADD COLUMN IF NOT EXISTS retainage_percent_applied numeric(5,2);

COMMENT ON COLUMN public.expense_payments.retainage_percent_applied IS
  '7C B1 [S151]. The retainage rate in force when THIS payment was taken, recorded by record_expense_payment from the same expression that computed retainage_withheld. NULL means no rate was applied to this payment (no withhold), or that it predates this column. Prospective-only ruling [Josh, S150]: a later rate change never restates this.';

-- Range. A rate is a non-negative percentage.
ALTER TABLE public.expense_payments
  ADD CONSTRAINT expense_payments_retainage_percent_applied_check
    CHECK (retainage_percent_applied IS NULL OR retainage_percent_applied >= 0);

-- A withhold must say what produced it. NOT VALID so the 7 pre-existing
-- withhold rows are GRANDFATHERED rather than back-filled with a rate nobody
-- recorded; every new row is checked. `retainage_withheld` is already immutable,
-- so a grandfathered row cannot later acquire a withhold without a rate.
--
-- ⚠️ KNOWN TENSION, recorded rather than discovered later: this asserts that a
-- withhold always has a percentage behind it, which is true while
-- `percent_across` is the only shape that withholds. If `final_hold` is ever
-- made to withhold, that shape has no rate and this constraint refuses it —
-- which is a schema decision to take at that point, not a bug to work around.
-- The shape/percent pairing question is filed separately as `#1-audit` B3.
ALTER TABLE public.expense_payments
  ADD CONSTRAINT expense_payments_retainage_rate_recorded_check
    CHECK (retainage_withheld = 0 OR retainage_percent_applied IS NOT NULL)
    NOT VALID;

-- ----------------------------------------------------------------------------
-- 2. Immutability. A recorded rate is as immutable as the dollars it explains —
--    otherwise the record is rewritable and closes nothing.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_expense_payments_column_scope()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.expense_id IS DISTINCT FROM OLD.expense_id
     OR NEW.paid_date IS DISTINCT FROM OLD.paid_date
     OR NEW.amount IS DISTINCT FROM OLD.amount
     OR NEW.retainage_withheld IS DISTINCT FROM OLD.retainage_withheld
     -- B1 [S151].
     OR NEW.retainage_percent_applied IS DISTINCT FROM OLD.retainage_percent_applied
     OR NEW.method IS DISTINCT FROM OLD.method
     OR NEW.note IS DISTINCT FROM OLD.note
     OR NEW.over_stage IS DISTINCT FROM OLD.over_stage
     OR NEW.company_id IS DISTINCT FROM OLD.company_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'A recorded payment is immutable — soft-delete and re-enter to correct it.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

-- (The existing expense_payments_column_scope trigger re-binds to the replaced
-- function automatically — no trigger re-create needed.)

-- ----------------------------------------------------------------------------
-- 3. record_expense_payment — the writer. Three B1 edits, everything else
--    verbatim from pg_proc.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_expense_payment(
  p_expense_id uuid,
  p_paid_date date,
  p_amount numeric,
  p_method text DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_override_over_stage boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
-- ⚠️ SECURITY INVOKER — NO `SECURITY DEFINER` CLAUSE, AND THAT IS DELIBERATE.
-- Verified against pg_proc: `prosecdef` is FALSE on the live function. The
-- original comment says why — "Caller must be Owner/Admin (INSERT policy)" —
-- so RLS on expense_payments IS the enforcement, evaluated as the caller.
-- Adding SECURITY DEFINER here would bypass that and silently widen who can
-- record a payment. Do not "fix" this to match its SECURITY DEFINER siblings.
SET search_path TO 'public'
AS $$
DECLARE
  v_me uuid := public.get_my_member_id();
  v_expense RECORD;
  v_contract RECORD;
  v_paid numeric := 0;
  v_over boolean := false;
  v_remaining numeric;
  v_contract_remaining numeric;
  v_withhold numeric := 0;
  -- B1 [S151] — the rate that produced v_withhold, recorded onto the payment.
  v_rate_applied numeric(5,2);
  v_retainage_id uuid;
BEGIN
  IF public.get_my_role() IS NULL
     OR public.get_my_role() NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Only Owner/Admin may record payments.';
  END IF;
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'No member identity for the payer.';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'record_expense_payment: amount must be positive';
  END IF;
  IF p_paid_date IS NULL THEN
    RAISE EXCEPTION 'record_expense_payment: paid_date is required';
  END IF;

  SELECT * INTO v_expense
  FROM expenses
  WHERE id = p_expense_id AND is_deleted = false
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'record_expense_payment: expense not found';
  END IF;
  IF v_expense.status <> 'approved' THEN
    RAISE EXCEPTION 'record_expense_payment: only approved rows take payments (this one is %)', v_expense.status;
  END IF;
  IF v_expense.closed_out_at IS NOT NULL THEN
    RAISE EXCEPTION 'record_expense_payment: this commitment was closed out';
  END IF;
  -- Payments are a payable concept: a 7A point-of-purchase receipt was paid
  -- at the register and never takes payments.
  IF v_expense.state <> 'committed'
     AND v_expense.sub_contract_id IS NULL
     AND v_expense.purchase_order_id IS NULL
     AND NOT v_expense.is_retainage THEN
    RAISE EXCEPTION 'record_expense_payment: this row is a receipt, not a payable';
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_paid
  FROM expense_payments
  WHERE expense_id = p_expense_id AND is_deleted = false;

  v_over := (v_paid + p_amount) > v_expense.amount + 0.004;
  IF v_over AND NOT p_override_over_stage THEN
    RAISE EXCEPTION 'OVER_STAGE: this payment exceeds the remaining balance — confirm the override to proceed';
  END IF;

  -- Owner-ONLY arms (CLAUDE.md owner-only #5): retainage release, and the
  -- payment that settles the sub contract's full schedule.
  IF v_expense.is_retainage AND public.get_my_role() <> 'owner' THEN
    RAISE EXCEPTION 'Retainage release is Owner only.';
  END IF;
  IF NOT v_expense.is_retainage AND v_expense.sub_contract_id IS NOT NULL THEN
    SELECT COALESCE(SUM(GREATEST(e.amount - COALESCE(p.paid, 0), 0)), 0)
      INTO v_contract_remaining
    FROM expenses e
    LEFT JOIN (
      SELECT expense_id, SUM(amount) AS paid
      FROM expense_payments
      WHERE is_deleted = false
      GROUP BY expense_id
    ) p ON p.expense_id = e.id
    WHERE e.sub_contract_id = v_expense.sub_contract_id
      AND e.is_retainage = false
      AND e.closed_out_at IS NULL
      AND e.is_deleted = false
      AND e.status = 'approved';
    IF v_contract_remaining - p_amount <= 0.004 AND public.get_my_role() <> 'owner' THEN
      RAISE EXCEPTION 'The final payment of a sub''s schedule is Owner only.';
    END IF;
  END IF;

  -- Shape (a) retainage: compute the withhold on THIS payment first, so it
  -- is stored ON the payment row (S91 fix — amount is GROSS, the check cut
  -- is amount − retainage_withheld, cash out is the NET).
  IF NOT v_expense.is_retainage AND v_expense.sub_contract_id IS NOT NULL THEN
    SELECT * INTO v_contract
    FROM subcontractor_contracts
    WHERE id = v_expense.sub_contract_id AND is_deleted = false;

    IF FOUND AND v_contract.retainage_shape = 'percent_across'
       AND COALESCE(v_contract.retainage_percent, 0) > 0 THEN
      v_withhold := round(p_amount * v_contract.retainage_percent / 100.0, 2);
      -- B1 [S151]. Captured in the SAME arm, from the SAME expression that
      -- computed the withhold, so the two cannot describe different rates.
      -- Left NULL on every other path: a payment that withheld nothing had
      -- no rate applied to it, and inventing one would be a claim.
      v_rate_applied := v_contract.retainage_percent;
    END IF;
  END IF;

  INSERT INTO expense_payments (expense_id, paid_date, amount, retainage_withheld,
                                retainage_percent_applied, method, note, over_stage)
  VALUES (p_expense_id, p_paid_date, p_amount, v_withhold,
          v_rate_applied, p_method, p_note, v_over);

  -- Mirror the withhold into the contract's auto-maintained accrual row —
  -- the bookkeeping mirror of Σ retainage_withheld (the same held-back
  -- dollars, committed until released), never a second obligation.
  IF v_withhold > 0 THEN
    SELECT id INTO v_retainage_id
    FROM expenses
    WHERE sub_contract_id = v_expense.sub_contract_id
      AND is_retainage = true
      AND is_deleted = false
    FOR UPDATE;

    IF v_retainage_id IS NULL THEN
      -- Born approved in effect: inserted pending (the policy pins it),
      -- then approved in the same transaction — a system bookkeeping row
      -- must not sit in the founder's review queue.
      INSERT INTO expenses (
        project_id, supplier, expense_date, amount,
        cost_category, state, sub_contract_id, stage_label, is_retainage
      ) VALUES (
        v_expense.project_id,
        'Retainage held — ' || COALESCE((SELECT display_name FROM company_members WHERE id = v_contract.member_id), 'sub'),
        CURRENT_DATE, v_withhold,
        'subcontractor', 'committed', v_expense.sub_contract_id, 'Retainage', true
      ) RETURNING id INTO v_retainage_id;

      UPDATE expenses
      SET status = 'approved', approved_by = v_me, approved_at = now()
      WHERE id = v_retainage_id;
    ELSE
      UPDATE expenses
      SET amount = amount + v_withhold
      WHERE id = v_retainage_id;
    END IF;
  END IF;

  -- Settlement marker only (§2.2): money math never reads state.
  v_remaining := v_expense.amount - (v_paid + p_amount);
  IF v_remaining <= 0.004 AND v_expense.state = 'committed' THEN
    UPDATE expenses SET state = 'actual' WHERE id = p_expense_id;
  END IF;

  RETURN jsonb_build_object(
    'over_stage', v_over,
    'remaining', GREATEST(v_remaining, 0),
    'retainage_withheld', v_withhold
  );
END;
$$;
