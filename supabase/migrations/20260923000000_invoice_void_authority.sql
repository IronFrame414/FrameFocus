-- ============================================================================
-- 7D §9 — WHO MAY VOID AN INVOICE, ENFORCED IN THE DATABASE
-- ============================================================================
--
-- Ruled [Josh, S143]:
--
--   | Role  | A paid or partially-paid invoice          |
--   | PM    | CANNOT void                                |
--   | Owner | CAN void, with a warning                   |
--   | Admin | CANNOT void  (A1 — see below)              |
--   | Effect| a client credit is created                 |
--
-- ----------------------------------------------------------------------------
-- WHY THIS IS A MIGRATION AND NOT A UI FIX
-- ----------------------------------------------------------------------------
--
-- The visible symptom was a hardcoded constant. `invoice-builder.tsx` passed
-- `hasPayment: false` into canVoidInvoice() with the comment "7E owns payments
-- and is not built — no payment can exist yet." 7E landed at S97. So the
-- four-arm matrix always took its unpaid arm and an Owner OR Admin could void
-- a paid invoice with no warning.
--
-- THAT WAS THE DISPLAY HALF OF A DATABASE HOLE [S142 survey, S143 Phase 1]:
--
--   * `invoices_update_authorized` admits project_manager on UPDATE.
--   * The complete guard set on `invoices` is five triggers — assign_number,
--     column_scope, immutability, set_updated_by, updated_at.
--     `enforce_invoices_column_scope` guards ONLY approved_by/approved_at.
--     `enforce_invoice_immutability` freezes the money columns and blocks
--     voided -> anything, and is role-blind.
--   * NOTHING ANYWHERE CONSULTED client_payment_applications.
--
-- So a PM could void ANY invoice — paid or unpaid — through a direct PostgREST
-- call, bypassing canVoidInvoice() entirely. Wiring the real payment state into
-- the builder would have closed the screen and left the API open: the exact
-- defect class that produced TECH_DEBT #117, the five S97 financial-floor
-- failures, and this project's own S140 compliance finding, where the ruling
-- said Owner/Admin and the live policy admitted PM.
--
-- The gate goes in the database. The UI change ships alongside it so the user
-- sees the rule rather than discovering it as an error.
--
-- ----------------------------------------------------------------------------
-- WHY ADMIN IS EXCLUDED (A1)
-- ----------------------------------------------------------------------------
-- The ruling names PM and Owner. Admin is excluded, and that is not inference
-- from silence — three shipped artifacts already say so:
--   * canVoidInvoice()'s second arm is `if (ctx.role !== 'owner') refuse`;
--   * its docstring reads "partially paid, NOT yet in QB -> Owner ONLY";
--   * invoice-lifecycle.test.ts:30 is named "PARTIALLY PAID … Owner ONLY".
-- And CLAUDE.md reserves "releasing final sub payments (money out the door)"
-- to the Owner. Turning a client's paid money into a credit is that family.
--
-- ----------------------------------------------------------------------------
-- BOTH ARMS, NOT JUST THE PAID ONE (A4)
-- ----------------------------------------------------------------------------
-- The ruling is about paid invoices, but the same hole let a PM void an UNPAID
-- one, contradicting §9/§12's "Only Owner or Admin can void an invoice". It is
-- the same IF. Closing half is how #117 happened.
--
--   unpaid            -> owner, admin
--   paid / part-paid  -> owner ONLY
--
-- Anything already-voided, draft or pending_approval is refused by
-- canVoidInvoice() in the service layer and is not restated here: this trigger
-- governs AUTHORITY, not the lifecycle.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_invoice_void_authority()
RETURNS TRIGGER AS $$
DECLARE
  v_applied numeric(12,2);
BEGIN
  -- Only a transition INTO voided is this function's business. Every other
  -- update on an invoice passes untouched.
  IF NEW.status IS DISTINCT FROM 'voided' OR OLD.status = 'voided' THEN
    RETURN NEW;
  END IF;

  -- Service-role clients carry no auth context. RLS does not apply to them and
  -- this trigger must not break them — the enforce_expenses_column_scope
  -- precedent. A background job voiding an invoice is not a role decision.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- THE FIGURE NOBODY WAS READING. 7E's applications are the only record that
  -- money has landed against this invoice.
  SELECT COALESCE(SUM(a.amount), 0) INTO v_applied
  FROM client_payment_applications a
  WHERE a.invoice_id = NEW.id AND a.is_deleted = false;

  IF v_applied > 0 THEN
    IF public.get_my_role() IS DISTINCT FROM 'owner' THEN
      RAISE EXCEPTION
        'Once a payment has been applied, only the Owner can void this invoice (7D 9).';
    END IF;
    RETURN NEW;
  END IF;

  IF public.get_my_role() <> ALL (ARRAY['owner'::text, 'admin'::text]) THEN
    RAISE EXCEPTION 'Only Owner or Admin can void an invoice (7D 9/12).';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

CREATE TRIGGER invoices_void_authority
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.enforce_invoice_void_authority();

-- ----------------------------------------------------------------------------
-- THE CREDIT EFFECT (A3) — retire the applications, and the credit appears
-- ----------------------------------------------------------------------------
--
-- The ruling says voiding a paid invoice creates a client credit. Nothing did
-- that: voidInvoice() voided the row and released cost/hour claims, and the
-- warning text promised a credit that was never written.
--
-- NO CREDIT IS STORED, AND NONE SHOULD BE. 7E's credit on account is DERIVED —
-- `creditAvailableOnPayment()` is `payment.amount - SUM(live applications)`,
-- and `clientCreditBalance()` sums that across a client's live payments
-- (payments-shared.ts 3). So retiring this invoice's applications turns the
-- payment's now-unapplied surplus into the client's credit automatically, with
-- no second source of truth to drift.
--
-- The precedent is one table over and does exactly this: when a payment is
-- soft-deleted, `client_payments_retire_applications` soft-deletes its
-- applications. This is the same move keyed on the invoice instead.
--
-- IT LIVES IN THE DATABASE, NOT IN voidInvoice(), for the same reason the
-- guard above does: a direct PostgREST void must not strand applications on a
-- dead invoice, pointing money at a document that no longer exists.
--
-- ORDERING, VERIFIED AGAINST THE SHIPPED CHAIN. Soft-deleting an application
-- fires `client_payment_applications_revert_settlement` ->
-- `revert_invoice_settlement()`, which early-returns unless the invoice is
-- 'paid'. By the time this AFTER trigger runs the invoice is 'voided', so that
-- function returns without touching anything. A voided invoice is frozen
-- forever (7D 9) and must never be flipped back to 'sent'.

CREATE OR REPLACE FUNCTION public.retire_applications_on_invoice_void()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM 'voided' OR OLD.status = 'voided' THEN
    RETURN NULL;
  END IF;

  UPDATE client_payment_applications
     SET is_deleted = true,
         deleted_at = now()
   WHERE invoice_id = NEW.id
     AND is_deleted = false;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

CREATE TRIGGER invoices_retire_applications_on_void
  AFTER UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.retire_applications_on_invoice_void();

COMMENT ON FUNCTION public.enforce_invoice_void_authority() IS
  '7D 9 void authority [S143]. Unpaid: owner/admin. Paid or partially paid: '
  'OWNER ONLY. Enforced here because invoices_update_authorized admits '
  'project_manager and no other guard consulted client_payment_applications, '
  'so a PM could void any invoice through a direct API call. Guarded by '
  'apps/web/test/s143-void-authority.live.ts.';
