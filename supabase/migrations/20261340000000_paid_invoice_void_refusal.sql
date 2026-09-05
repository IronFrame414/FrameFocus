-- ============================================================================
-- A PAID INVOICE CANNOT BE VOIDED. FULL STOP. [Josh, S103]
-- ============================================================================
--
-- This is a LIVE MONEY DEFECT, and it is NOT QuickBooks work. The money moved;
-- voiding an invoice with a payment applied strands that payment and unbalances
-- the books — true whether or not QuickBooks knows the invoice exists.
--
-- ----------------------------------------------------------------------------
-- WHAT WAS WRONG, PRECISELY
-- ----------------------------------------------------------------------------
-- `enforce_invoice_void_authority` (20260923000000) read
-- `client_payment_applications` and, when a payment was applied, allowed the
-- OWNER to void anyway:
--
--     IF v_applied > 0 THEN
--       IF get_my_role() IS DISTINCT FROM 'owner' THEN RAISE ...; END IF;
--       RETURN NEW;                         -- <- owner voids a PAID invoice
--     END IF;
--
-- The trigger never consulted QuickBooks at all. The "paid AND synced to QB ->
-- nobody" qualifier lived only in the service-layer `canVoidInvoice()`, so an
-- Owner could void a paid invoice that had never reached QuickBooks through the
-- UI or a direct PostgREST call. The QB-synced condition was never the reason —
-- it was a trigger someone happened to write in the service layer. The reason
-- is that MONEY MOVED.
--
-- ----------------------------------------------------------------------------
-- WHAT "PAID" MEANS HERE — decided [S103 prep]
-- ----------------------------------------------------------------------------
-- ANY payment applied — partial or full. A partially-paid invoice has also had
-- money move. This keys on `SUM(live client_payment_applications.amount) > 0`,
-- exactly the figure the guard already computed and exactly what the service
-- layer's `hasPayment` computes, so the two agree by construction.
--
-- ----------------------------------------------------------------------------
-- THE FIX
-- ----------------------------------------------------------------------------
-- When a payment is applied, refuse for EVERYONE — Owner included. The remedy
-- is a CREDIT MEMO (adjusts the balance, preserves invoice + payment + audit
-- trail) or a REFUND where money actually goes back. QuickBooks refuses a void
-- of a paid invoice for the same reason, so the platform and QB now agree.
--
-- The refusal NAMES that path, per this project's rule: name the consequence,
-- not the mechanism.
--
-- ----------------------------------------------------------------------------
-- WHAT IS AND IS NOT CHANGED
-- ----------------------------------------------------------------------------
-- * Existing rows are UNTOUCHED. CREATE OR REPLACE redefines the function; it
--   changes what is PERMITTED going forward, nothing already voided.
-- * The unpaid arm is unchanged: an unpaid invoice is still void-able by
--   owner/admin.
-- * The `auth.uid() IS NULL` service-role escape is KEPT — a background job has
--   no role and RLS does not apply to it; the connector never enqueues a
--   paid-invoice void, and this fix governs USER authority, not the escape.
-- * The AFTER trigger `retire_applications_on_invoice_void` is left as-is: it is
--   now only reachable via the service-role escape, and remains correct there.
--
-- Superseded behaviour quoted, not deleted: "Paid or partially paid: OWNER
-- ONLY." That is retired — paid is now nobody.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enforce_invoice_void_authority()
RETURNS TRIGGER AS $$
DECLARE
  v_applied numeric(12,2);
BEGIN
  -- Only a transition INTO voided is this function's business.
  IF NEW.status IS DISTINCT FROM 'voided' OR OLD.status = 'voided' THEN
    RETURN NEW;
  END IF;

  -- Service-role clients carry no auth context; RLS does not apply and this
  -- trigger must not break background jobs (the enforce_expenses_column_scope
  -- precedent). A background void is not a role decision.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- The only record that money has landed against this invoice.
  SELECT COALESCE(SUM(a.amount), 0) INTO v_applied
  FROM client_payment_applications a
  WHERE a.invoice_id = NEW.id AND a.is_deleted = false;

  -- [S103] PAID = any payment applied. NOBODY may void it — not even the Owner.
  -- Name the path: a credit memo or a refund, never a void.
  IF v_applied > 0 THEN
    RAISE EXCEPTION
      'This invoice has a payment applied and cannot be voided. Issue a credit memo or a refund in 7E instead (7D 9 / S103).';
  END IF;

  -- Unpaid: owner/admin, as before.
  IF public.get_my_role() <> ALL (ARRAY['owner'::text, 'admin'::text]) THEN
    RAISE EXCEPTION 'Only Owner or Admin can void an invoice (7D 9/12).';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

COMMENT ON FUNCTION public.enforce_invoice_void_authority() IS
  '7D 9 void authority [S143; TIGHTENED S103]. Unpaid: owner/admin. ANY payment '
  'applied (partial or full): NOBODY may void — issue a credit memo or refund. '
  'The QB-synced qualifier was never the reason; the money moved. Superseded: '
  '"paid or partially paid -> OWNER ONLY". Guarded by '
  'apps/web/test/s143-void-authority.live.ts.';
