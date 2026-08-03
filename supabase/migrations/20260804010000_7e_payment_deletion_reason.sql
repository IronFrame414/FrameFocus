-- =============================================================================
-- Migration: 7e_payment_deletion_reason
-- Authority: docs/specs/7e1-spec.md §2 (the correction path).
--
-- WHY THIS EXISTS. 20260804000000 froze `note` on client_payments, mirroring
-- 7C's enforce_expense_payments_column_scope, which freezes it too. That is
-- correct — the note is part of the record a payment IS.
--
-- But the correction path then had nowhere to put WHY a payment was removed:
-- voidPayment() appended the reason to `note` and the trigger rejected it,
-- exactly as designed. Caught by a live RPC test, not by type-check.
--
-- The fix is a column that is NOT part of the frozen record, written only at
-- soft-delete time, so the audit of a removal survives without weakening the
-- immutability rule. Deliberately left OUT of the column-scope trigger's
-- frozen list — it is metadata about the deletion, not about the money.
-- =============================================================================

ALTER TABLE public.client_payments
  ADD COLUMN IF NOT EXISTS deletion_reason text;

COMMENT ON COLUMN public.client_payments.deletion_reason IS
  'Why a recorded payment was removed (§2 correction path). Written only at soft-delete; deliberately not frozen by enforce_client_payments_column_scope, unlike every money column.';
