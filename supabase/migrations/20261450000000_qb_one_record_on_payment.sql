-- ============================================================================
-- 7G MIGRATION M-L — ONE record, on approval of an actual payment.
--                    The Bill / BillPayment pair is removed. [RULED Josh, S103]
-- ============================================================================
--
-- Josh, having tested it: *"I only said to keep bills because you said it was
-- built. I do not need bill entered to QB. I only need the actual payment."*
--
-- ⚠️ A BILL THAT EXISTS ONLY TO BE CLOSED BY A BILLPAYMENT IS **TWO QuickBooks
-- records for ONE real event**, and every one of them is a payable that reads
-- as outstanding until its payment lands. M-G kept the arms because they
-- existed. That is not a reason, and this removes them.
--
-- ----------------------------------------------------------------------------
-- ⚠️ THE EVENT THE PUSH HANGS ON — established by reading, not assumed
-- ----------------------------------------------------------------------------
-- "The office has approved an actual payment" is **two RPCs, never one**, and
-- they are disjoint by construction rather than by our discipline:
--
--   `approve_expense`          — a RECEIPT (money already spent at the register)
--                                becomes approved. THIS IS the payment
--                                confirmation for that shape.
--   `record_expense_payment`   — a PAYABLE is paid. Inserts `expense_payments`.
--
-- ⚠️ THEY CANNOT OVERLAP, AND THE RPC ITSELF SAYS SO. `record_expense_payment`
-- refuses a receipt outright:
--
--     "record_expense_payment: this row is a receipt, not a payable"
--
-- and the receipt push is gated on `NOT payable`. So **a receipt pushes exactly
-- one Purchase at approval; a payable pushes exactly one Purchase per payment;
-- no row can ever do both.** That is what makes "one record per real event"
-- safe without a guard against double-counting.
--
-- ⚠️ AND A CORRECTION TO THE PROMPT, which says the commitment distinction was
-- made with `bill_status = 'unpaid'`. **There is no `bill_status` column.** The
-- distinction is 7C's five-term payable predicate (`state`, `sub_contract_id`,
-- `purchase_order_id`, `is_retainage`, and the existence of payments), the same
-- one `record_expense_payment` mirrors in its own refusal above.
--
-- ----------------------------------------------------------------------------
-- ⚠️ WHERE THE ERROR FIRES, AND WHERE IT MUST NOT
-- ----------------------------------------------------------------------------
-- Josh: the field is optional everywhere except payment confirmation, because
-- *"until money moves you may not know which account paid, and nothing must
-- obstruct a field user logging a receipt."*
--
--   commitment / bill entry ........ optional
--   expense entry .................. optional
--   review of a COMMITMENT ......... optional  <- the S183 defect Josh found
--   review of a RECEIPT ............ BLOCKS — that approval IS the payment
--   record payment ................. BLOCKS
--
-- The receipt case looks like an exception to "payment confirmation only" and
-- is not: for a receipt, approval **is** the payment confirmation. M-J's
-- `enforce_expense_payment_account` already draws exactly that line (it exempts
-- every payable), so it is left alone.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. The payment carries its own account and its own QuickBooks id
-- ----------------------------------------------------------------------------
--
-- ⚠️ ON THE PAYMENT, NOT THE EXPENSE. A sub contract is paid in stages, so ONE
-- commitment produces MANY payments — each its own Purchase, each potentially
-- from a different card. `expenses.payment_account_id` (M-J) stays for the
-- receipt shape, where there is exactly one of each.
ALTER TABLE public.expense_payments
  ADD COLUMN IF NOT EXISTS payment_account_id uuid
  REFERENCES public.company_payment_accounts(id);

ALTER TABLE public.expense_payments
  ADD COLUMN IF NOT EXISTS qb_purchase_id text;

-- ⚠️ DROPPED, NOT DEPRECATED. Nothing ever wrote it (0 rows carry a value —
-- checked before dropping), the two BillPayments that existed were deleted from
-- the sandbox at S182, and leaving a column for a record type we no longer
-- create is exactly the residue this migration exists to remove.
ALTER TABLE public.expense_payments DROP COLUMN IF EXISTS qb_bill_payment_id;

COMMENT ON COLUMN public.expense_payments.qb_purchase_id IS
  '7G M-L. The QuickBooks Purchase for THIS payment. A payable pushes one '
  'Purchase per payment; a receipt pushes one at approval (expenses.'
  'qb_purchase_id). The two shapes are disjoint — record_expense_payment '
  'refuses receipts.';


-- ----------------------------------------------------------------------------
-- 2. A queue entity for "a payment became a Purchase"
-- ----------------------------------------------------------------------------
--
-- ⚠️ A SEPARATE ENTITY TYPE, because `entity_id` has to be unambiguous. Reusing
-- `purchase` would mean the id is sometimes an `expenses.id` and sometimes an
-- `expense_payments.id`, and every handler would have to guess which.
--
-- ⚠️ `bill` AND `bill_payment` STAY IN THE CHECK, and that is deliberate. Nine
-- historical rows carry them (4 bill, 5 bill_payment, all `pushed`) and they
-- are the record of what actually happened. Removing the values would make the
-- CHECK reject its own table. **Nothing produces them any more** — that is what
-- the ruling asks for, and it is enforced in the triggers below, not here.
ALTER TABLE public.qb_sync_queue DROP CONSTRAINT IF EXISTS qb_sync_queue_entity_type_check;
ALTER TABLE public.qb_sync_queue
  ADD CONSTRAINT qb_sync_queue_entity_type_check
  CHECK (entity_type = ANY (ARRAY['customer'::text, 'sub_customer'::text, 'invoice'::text,
                                  'payment'::text, 'refund'::text, 'vendor'::text,
                                  'bill'::text, 'time_activity'::text,
                                  'purchase'::text, 'bill_payment'::text,
                                  'expense_payment'::text]));


-- ----------------------------------------------------------------------------
-- 3. `record_expense_payment` takes the account, and REFUSES without one
-- ----------------------------------------------------------------------------
--
-- ⚠️ THE OLD SIGNATURE IS DROPPED EXPLICITLY. Appending a defaulted parameter
-- creates an OVERLOAD rather than replacing the function, and PostgREST would
-- then have two candidates and refuse the call as ambiguous. Callers all use
-- named arguments, so appending is otherwise safe.
DROP FUNCTION IF EXISTS public.record_expense_payment(uuid, date, numeric, text, text, boolean);

CREATE OR REPLACE FUNCTION public.record_expense_payment(
  p_expense_id uuid,
  p_paid_date date,
  p_amount numeric,
  p_method text DEFAULT NULL::text,
  p_note text DEFAULT NULL::text,
  p_override_over_stage boolean DEFAULT false,
  p_payment_account_id uuid DEFAULT NULL::uuid
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
  v_has_accounts boolean;
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

  -- ⚠️ M-L — THE ONE POINT WHERE AN EMPTY ACCOUNT BLOCKS. This is the payment
  -- confirmation, so this is where the question can finally be answered and
  -- where an unanswered one must stop the money.
  --
  -- ⚠️ IT NEVER BLOCKS A COMPANY THAT HAS NOTHING TO PICK. No QuickBooks realm,
  -- or no payment accounts configured, means there is no question to ask —
  -- the same two exemptions M-J's approval guard makes, for the same reason.
  IF p_payment_account_id IS NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM company_payment_accounts
      WHERE company_id = v_expense.company_id AND is_deleted = false
    ) INTO v_has_accounts;

    IF v_has_accounts
       AND (SELECT qb_realm_id FROM companies WHERE id = v_expense.company_id) IS NOT NULL THEN
      RAISE EXCEPTION 'Choose which account this payment was made from.'
        USING ERRCODE = 'check_violation';
    END IF;
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
                                retainage_percent_applied, method, note, over_stage,
                                payment_account_id)
  VALUES (p_expense_id, p_paid_date, p_amount, v_withhold,
          v_rate_applied, p_method, p_note, v_over,
          p_payment_account_id);

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
$function$;


-- ----------------------------------------------------------------------------
-- 4. A payment becomes a PURCHASE. Not a BillPayment.
-- ----------------------------------------------------------------------------
--
-- _Superseded (M-G), quoted rather than deleted:_ this trigger enqueued
-- `bill_payment:create`, and only when the parent expense already carried a
-- `qb_bill_id` — so a payable that had never been pushed as a Bill produced
-- nothing at all, which is the hole that made subcontractor cost vanish from
-- QuickBooks. One Purchase per payment closes it.
CREATE OR REPLACE FUNCTION public.qb_enqueue_expense_payment()
RETURNS TRIGGER
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_expense expenses%ROWTYPE;
BEGIN
  IF NEW.is_deleted = true THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_expense FROM expenses WHERE id = NEW.expense_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- ⚠️ A RECEIPT ALREADY PUSHED ITS OWN PURCHASE AT APPROVAL. Belt to the RPC's
  -- braces: `record_expense_payment` refuses receipts outright, so this arm
  -- should be unreachable — but a direct INSERT (a seeder, a future service)
  -- would otherwise book the same spend twice.
  IF v_expense.qb_purchase_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  PERFORM public.qb_enqueue(NEW.company_id, 'expense_payment', NEW.id, 'create', NULL);
  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  -- Recording a payment must never fail because bookkeeping could not queue.
  RAISE WARNING '[7G] enqueue failed for expense payment %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.qb_enqueue_expense_payment() IS
  '7G M-L. A recorded payment becomes ONE QuickBooks Purchase. Replaces the '
  'Bill/BillPayment pair, which was two records for one real event.';


-- ----------------------------------------------------------------------------
-- 5. Expenses: the Bill arms are GONE
-- ----------------------------------------------------------------------------
--
-- _Superseded arms, quoted rather than deleted (M-G / M-I):_
--   _ELSIF NEW.qb_bill_id IS NOT NULL THEN … 'bill', NEW.id, 'void' …_
--   _ELSIF NEW.qb_bill_id IS NOT NULL THEN … 'bill', NEW.id, 'update' …_
--   _plus the loop that queued `bill_payment:void` before `bill:void`._
--
-- ⚠️ WHAT THIS COSTS, STATED PLAINLY: the two Bills already in the sandbox
-- (147, 149) will no longer be updated or deleted from here. **That is the
-- ruling** — they are test data, and Josh tidies them by hand. On production
-- no Bill was ever pushed, so there is nothing to strand.
CREATE OR REPLACE FUNCTION public.qb_enqueue_expense()
RETURNS TRIGGER
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_is_payable boolean;
  v_dep        uuid;
BEGIN
  -- The locked payable predicate, term for term (payables-shared.ts).
  v_is_payable := (
       NEW.sub_contract_id IS NOT NULL
    OR NEW.purchase_order_id IS NOT NULL
    OR NEW.is_retainage
    OR NEW.state = 'committed'
    OR EXISTS (SELECT 1 FROM expense_payments p
               WHERE p.expense_id = NEW.id AND p.is_deleted = false)
  );

  -- DELETED first: a soft-delete can coincide with other column changes.
  IF NEW.is_deleted = true AND OLD.is_deleted IS DISTINCT FROM true THEN
    IF NEW.qb_purchase_id IS NOT NULL THEN
      PERFORM public.qb_enqueue(NEW.company_id, 'purchase', NEW.id, 'void', NULL);
    END IF;
    RETURN NEW;
  END IF;

  -- APPROVED -> purchase:create, RECEIPTS ONLY. For a receipt this approval IS
  -- the payment confirmation: the money left at the register.
  IF NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved'
     AND NEW.qb_purchase_id IS NULL
     AND NOT v_is_payable THEN
    v_dep := public.qb_enqueue_job_chain(NEW.company_id, NEW.project_id);
    PERFORM public.qb_enqueue(NEW.company_id, 'purchase', NEW.id, 'create', v_dep);
    RETURN NEW;
  END IF;

  -- EDITED -> update the Purchase QuickBooks holds, if it holds one.
  IF NEW.is_deleted IS DISTINCT FROM true
     AND NEW.qb_purchase_id IS NOT NULL
     AND (NEW.amount IS DISTINCT FROM OLD.amount
          OR NEW.supplier IS DISTINCT FROM OLD.supplier
          OR NEW.description IS DISTINCT FROM OLD.description
          OR NEW.expense_date IS DISTINCT FROM OLD.expense_date
          OR NEW.cost_category IS DISTINCT FROM OLD.cost_category) THEN
    PERFORM public.qb_enqueue(NEW.company_id, 'purchase', NEW.id, 'update', NULL);
  END IF;

  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[7G] enqueue failed for expense %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;
