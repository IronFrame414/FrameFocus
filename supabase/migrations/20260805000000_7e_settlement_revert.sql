-- ============================================================================
-- Module 7E1 — the REVERT half of settlement (P-2 CONFIRMED, Josh, S97)
--
-- P-2 is CONFIRMED and STAYS: record_client_payment() / apply_client_credit()
-- auto-mark an invoice `paid` once applications settle its receivable. What was
-- missing is the other half — nothing set the status back when an application
-- was soft-deleted.
--
-- THE DEFECT THIS CLOSES (S97 automated click-test, assertion #13, FAIL):
--   Record a payment that settles an invoice, then remove it — the only
--   correction path 7E has (§2, "soft-delete and re-enter"). The debt correctly
--   returned (derived remaining went back to the full amount and the invoice
--   re-aged), but `invoices.status` stayed 'paid' because nothing reverted it,
--   and getOpenInvoices() offers only 'sent'. The reopened invoice was never
--   offered for payment again: the record-payment panel hides entirely when
--   that list is empty and the credit-apply panel early-returns on it. A dead
--   end on real money.
--
-- WHERE THE FIX LIVES: here, at the trigger layer, where the settlement is
-- decided — NOT in the UI and not in one service function. voidPayment() and
-- unapplyPayment() both reduce an invoice's applications, and any future caller
-- will too; all of them get this for free.
--
-- MANUAL RECORDING IS PERMANENT (Josh, S97). QuickBooks becomes the payment
-- processor and will confirm payments once 7G lands, but clients pay by check
-- and manual recording must always work. NOTHING here assumes an electronic
-- path: these are pure database triggers on the manual tables, and 7G will get
-- the same revert behaviour for free precisely because it lives at this layer.
--
-- A VOIDED INVOICE IS NEVER REVIVED. Guarded twice: this code only ever acts on
-- status = 'paid', and 7D's own enforce_invoice_immutability() independently
-- raises "A voided invoice is frozen forever (7D spec 9)" on any status change
-- out of 'voided'.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The decision, in one place.
--
--    Remaining is DERIVED, never stored (7C's discipline, 7E §2) — recomputed
--    here from the invoice's LIVE applications, exactly as remainingOnInvoice()
--    does at read. If anything is still owed and the invoice is sitting `paid`,
--    it goes back to `sent`.
--
--    SECURITY DEFINER because the trigger fires inside an ordinary user's
--    UPDATE on client_payment_applications, and the status write must not be
--    filtered by RLS on invoices.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.revert_invoice_settlement(p_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_status text;
  v_receivable numeric(12,2);
  v_applied numeric(12,2);
BEGIN
  SELECT status, amount_receivable INTO v_status, v_receivable
  FROM invoices
  WHERE id = p_invoice_id AND is_deleted = false;

  -- Only a settled invoice can un-settle. 'sent' needs nothing, and 'draft',
  -- 'pending_approval' and 'voided' are none of this function's business —
  -- a voided invoice in particular is frozen forever (7D §9).
  IF v_status IS DISTINCT FROM 'paid' THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(a.amount), 0) INTO v_applied
  FROM client_payment_applications a
  WHERE a.invoice_id = p_invoice_id AND a.is_deleted = false;

  -- The same 0.004 tolerance the settlement arm uses, so a cent of float noise
  -- can never flip an invoice back and forth.
  IF round(v_receivable - v_applied, 2) > 0.004 THEN
    UPDATE invoices SET status = 'sent' WHERE id = p_invoice_id;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.revert_invoice_settlement(uuid) IS
  '7E1 P-2: the revert half of auto-settlement. Puts a paid invoice back to sent when its live applications no longer cover the receivable. Never touches a voided invoice.';

-- ----------------------------------------------------------------------------
-- 2. Unapplying an application reverts its invoice.
--
--    This is THE signal — it fires for unapplyPayment() (one application) and
--    for voidPayment() (all of a payment's applications) alike, and for any
--    caller yet to be written.
--
--    Guarded on the false→true transition only, so re-writing deleted_at on an
--    already-deleted row is a no-op rather than a second recompute.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.client_payment_applications_revert_settlement()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.revert_invoice_settlement(OLD.invoice_id);
  RETURN NULL;
END;
$$;

CREATE TRIGGER client_payment_applications_revert_settlement
  AFTER UPDATE ON public.client_payment_applications
  FOR EACH ROW
  WHEN (OLD.is_deleted IS DISTINCT FROM true AND NEW.is_deleted IS true)
  EXECUTE FUNCTION public.client_payment_applications_revert_settlement();

-- ----------------------------------------------------------------------------
-- 3. Soft-deleting a PAYMENT retires its applications.
--
--    voidPayment() already does this in two statements, but it did not have to:
--    a caller that soft-deleted only the payment row would leave live
--    applications behind, and every derived figure — the invoice's remaining,
--    the client's credit balance, the aging — would still count money that has
--    been withdrawn. This makes the correction atomic in the database, so it
--    cannot be half-done by any caller.
--
--    Each row this touches fires the trigger above, which reverts the invoice.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.client_payments_retire_applications()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  UPDATE client_payment_applications
     SET is_deleted = true,
         deleted_at = COALESCE(NEW.deleted_at, now())
   WHERE payment_id = NEW.id
     AND is_deleted = false;
  RETURN NULL;
END;
$$;

CREATE TRIGGER client_payments_retire_applications
  AFTER UPDATE ON public.client_payments
  FOR EACH ROW
  WHEN (OLD.is_deleted IS DISTINCT FROM true AND NEW.is_deleted IS true)
  EXECUTE FUNCTION public.client_payments_retire_applications();
