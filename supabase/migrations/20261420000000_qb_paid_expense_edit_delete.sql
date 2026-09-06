-- ============================================================================
-- 7G MIGRATION M-I — a PAID expense may be edited or deleted. [RULED Josh, S103]
-- ============================================================================
--
-- Josh: *"this isn't customer facing. Mistakes happen. I can see myself making
-- an expense before it actually hits my account, or typing the wrong number."*
--
-- ----------------------------------------------------------------------------
-- ⚠️ THIS DELIBERATELY DIFFERS FROM THE PAID-INVOICE RULE. DO NOT
-- "CONSISTENCY-FIX" THE TWO TOGETHER.
-- ----------------------------------------------------------------------------
-- A paid INVOICE cannot be voided by anyone — enforced at the database in
-- `20261340000000_paid_invoice_void_refusal` and live on production. A paid
-- EXPENSE can be corrected by Owner/Admin. That is not an inconsistency:
--
--   an INVOICE is a RECEIVABLE a CLIENT paid against. Rewriting it rewrites
--     someone else's record of what they bought and what they owe.
--   an EXPENSE is the company's OWN record of its OWN spending. Correcting it
--     corrects only itself.
--
-- The asymmetry is the point. A future session tidying "voids should behave the
-- same everywhere" would break the ruling in one direction or the other.
--
-- ----------------------------------------------------------------------------
-- ⚠️ WHAT THE DATABASE ALREADY ALLOWED, AND WHERE THE BLOCK ACTUALLY WAS
-- ----------------------------------------------------------------------------
-- Checked before anything was written: `expenses_update_authorized` already
-- admits `get_my_role() = ANY (owner, admin)` with **no status and no payment
-- condition**, and `enforce_expenses_column_scope` returns early for those two
-- roles. Soft-delete is an UPDATE, so it was permitted too.
--
-- **So no policy needed changing.** The block was entirely in the UI:
-- `expenses-page-client.tsx` rendered Edit/Delete under
-- `!isReviewer && ownPending` — the author's own PENDING row — which gives an
-- Owner exactly nothing on an approved or paid expense. Recorded here because
-- the obvious guess (an RLS gap) is wrong, and the next reader deserves not to
-- go looking for one.
--
-- ----------------------------------------------------------------------------
-- ⚠️ WHAT THIS MIGRATION DOES DO: MAKE QUICKBOOKS FOLLOW
-- ----------------------------------------------------------------------------
-- *"deleting a paid expense voids or deletes its Purchase — and its BillPayment
-- if one was pushed. Otherwise QuickBooks keeps a record for something that no
-- longer exists."*
--
-- M-G already enqueues `purchase:void` / `bill:void` on soft-delete. It does
-- NOT reverse a BillPayment, and **the order matters**: QuickBooks will not
-- delete a Bill that has a payment applied to it. So the payment reversal is
-- queued FIRST and the bill's deletion DEPENDS ON it — which is exactly what
-- `depends_on_id` is for, and why §2.6's in-drain cascade means both still land
-- in one pass.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. ⚠️ CLOSE THE HOLE M-G OPENED IN THE COLUMN GUARD
-- ----------------------------------------------------------------------------
-- `enforce_expenses_column_scope` denies non-Owner/Admin roles the system
-- columns by NAME, and it lists `qb_bill_id`, `qb_push_status` and
-- `qb_synced_at`. M-G added `qb_purchase_id` and did not add it here, so a
-- crew member editing their own pending receipt could have written a
-- QuickBooks object id straight onto it. A denylist only protects what it
-- names — which is the standing hazard of this pattern, restated at the site.
CREATE OR REPLACE FUNCTION public.enforce_expenses_column_scope()
RETURNS TRIGGER
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text]) THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.state IS DISTINCT FROM OLD.state
     OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
     OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
     OR NEW.rejected_by IS DISTINCT FROM OLD.rejected_by
     OR NEW.rejected_at IS DISTINCT FROM OLD.rejected_at
     OR NEW.rejection_note IS DISTINCT FROM OLD.rejection_note
     OR NEW.qb_push_status IS DISTINCT FROM OLD.qb_push_status   -- renamed [S143]
     OR NEW.qb_bill_id IS DISTINCT FROM OLD.qb_bill_id           -- new [S143]
     OR NEW.qb_purchase_id IS DISTINCT FROM OLD.qb_purchase_id   -- new [S182, M-I]
     OR NEW.qb_synced_at IS DISTINCT FROM OLD.qb_synced_at       -- new [S149]
     OR NEW.author_member_id IS DISTINCT FROM OLD.author_member_id
     OR NEW.source_segment_id IS DISTINCT FROM OLD.source_segment_id
     OR NEW.company_id IS DISTINCT FROM OLD.company_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'Review and system columns are not editable for your role.';
  END IF;

  IF NEW.cost_category IS DISTINCT FROM OLD.cost_category
     AND NEW.cost_category = 'subcontractor' THEN
    RAISE EXCEPTION 'The subcontractor category is set only by 7C bill writers.';
  END IF;

  RETURN NEW;
END;
$$;


-- ----------------------------------------------------------------------------
-- 2. A `void` operation for a BillPayment
-- ----------------------------------------------------------------------------
-- No CHECK change is needed — `qb_sync_queue_operation_check` already admits
-- `create | update | void`, and M-G added `bill_payment` to the entity types.
-- Stated so nobody adds a redundant migration looking for one.


-- ----------------------------------------------------------------------------
-- 3. Deleting an expense now reverses its payments FIRST
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.qb_enqueue_expense()
RETURNS TRIGGER
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_is_payable boolean;
  v_dep        uuid;
  v_pay        record;
  v_last_pay_q uuid;
BEGIN
  -- ⚠️ THE RECEIPT TEST. A COPY of the locked payable predicate
  -- (payables-shared.ts / money_representation 20260730010000:830), term for
  -- term. Read, never modified — it is also the budget recompute's origin test.
  v_is_payable := (
       NEW.sub_contract_id IS NOT NULL
    OR NEW.purchase_order_id IS NOT NULL
    OR NEW.is_retainage
    OR NEW.state = 'committed'
    OR EXISTS (SELECT 1 FROM expense_payments p
               WHERE p.expense_id = NEW.id AND p.is_deleted = false)
  );

  -- DELETED first: a soft-delete can coincide with other column changes, and
  -- removing must win over amending something that is going away.
  IF NEW.is_deleted = true AND OLD.is_deleted IS DISTINCT FROM true THEN
    IF NEW.qb_purchase_id IS NOT NULL THEN
      -- A Purchase is money already out; there is no payment to reverse.
      PERFORM public.qb_enqueue(NEW.company_id, 'purchase', NEW.id, 'void', NULL);

    ELSIF NEW.qb_bill_id IS NOT NULL THEN
      -- ⚠️ REVERSE THE PAYMENTS BEFORE THE BILL, AND MAKE THE QUEUE ENFORCE IT.
      -- QuickBooks refuses to delete a Bill that has a payment applied. Each
      -- pushed BillPayment is queued for deletion, and the bill's own deletion
      -- DEPENDS ON the last of them, so the worker cannot run them out of order.
      FOR v_pay IN
        SELECT id FROM expense_payments
         WHERE expense_id = NEW.id
           AND qb_bill_payment_id IS NOT NULL
           AND is_deleted = false
         ORDER BY created_at
      LOOP
        v_last_pay_q := public.qb_enqueue(
          NEW.company_id, 'bill_payment', v_pay.id, 'void', v_last_pay_q);
      END LOOP;

      PERFORM public.qb_enqueue(NEW.company_id, 'bill', NEW.id, 'void', v_last_pay_q);
    END IF;
    RETURN NEW;
  END IF;

  -- APPROVED -> purchase:create, RECEIPTS ONLY.
  IF NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved'
     AND NEW.qb_purchase_id IS NULL AND NEW.qb_bill_id IS NULL
     AND NOT v_is_payable THEN
    v_dep := public.qb_enqueue_job_chain(NEW.company_id, NEW.project_id);
    PERFORM public.qb_enqueue(NEW.company_id, 'purchase', NEW.id, 'create', v_dep);
    RETURN NEW;
  END IF;

  -- EDITED -> update whichever object QuickBooks actually holds.
  --
  -- ⚠️ THIS ARM IS WHAT MAKES A PAID EXPENSE EDITABLE END TO END. It carries no
  -- status or payment condition on purpose: correcting a wrong number after the
  -- money moved is the ruled case, and QuickBooks has to follow the correction.
  IF NEW.is_deleted IS DISTINCT FROM true
     AND (NEW.amount IS DISTINCT FROM OLD.amount
          OR NEW.supplier IS DISTINCT FROM OLD.supplier
          OR NEW.description IS DISTINCT FROM OLD.description
          OR NEW.expense_date IS DISTINCT FROM OLD.expense_date
          OR NEW.cost_category IS DISTINCT FROM OLD.cost_category) THEN
    IF NEW.qb_purchase_id IS NOT NULL THEN
      PERFORM public.qb_enqueue(NEW.company_id, 'purchase', NEW.id, 'update', NULL);
    ELSIF NEW.qb_bill_id IS NOT NULL THEN
      PERFORM public.qb_enqueue(NEW.company_id, 'bill', NEW.id, 'update', NULL);
    END IF;
  END IF;

  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[7G] enqueue failed for expense %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;
