-- ============================================================================
-- 🔴 THE CHANGE-ORDER SIGNATURE HAS BEEN IMPOSSIBLE SINCE 2026-08-09 (S164)
-- ============================================================================
--
-- ⚠️ THIS IS NOT A MODULE 9 BUG. It is a live production defect on the M5
-- signing flow, found while building M9 R10 because R10's portal signature
-- reaches the same write and hit the same wall.
--
-- ----------------------------------------------------------------------------
-- WHAT IS BROKEN
-- ----------------------------------------------------------------------------
-- `enforce_change_order_immutability()` (`20260809000000_financial_rls_floor_
-- part3.sql` §1) freezes a change order once it leaves draft, and among the
-- frozen columns it lists `signed_at`:
--
--     IF NEW.contractor_signed_at IS DISTINCT FROM OLD.contractor_signed_at
--        OR NEW.contractor_signed_by IS DISTINCT FROM OLD.contractor_signed_by
--        OR NEW.signed_at            IS DISTINCT FROM OLD.signed_at THEN
--       RAISE EXCEPTION 'A signature stamp cannot be rewritten.';
--     END IF;
--
-- `completeCoSignature()` — the ONLY writer of a client signature, and the sole
-- writer `contract-value.ts` recognises — does exactly this, on a CO whose
-- status is `sent`:
--
--     .update({ status: 'signed', signed_at: signedAt }).eq('status', 'sent')
--
-- `OLD.signed_at` is NULL and `NEW.signed_at` is a timestamp, so the two ARE
-- distinct, so the trigger raises. **Every client change-order signature has
-- failed with "A signature stamp cannot be rewritten." since that migration
-- shipped.** The route returns 409 and the client sees an error where the
-- binding act should be.
--
-- ----------------------------------------------------------------------------
-- HOW IT SURVIVED, WHICH IS THE PART WORTH RECORDING
-- ----------------------------------------------------------------------------
-- **No test ever ran the write.** `s123-co-signed-notify.live.ts` INSERTs a row
-- with `status: 'signed'` directly and asserts the notifications; it never calls
-- `completeCoSignature`. `s97ct-floor3.live.ts` **1c** asserts the trigger's
-- refusal and passes — correctly, because it rewrites a stamp that already
-- exists. The suite covered the rule and the consequence, and nothing covered
-- the act between them.
--
-- Corroborated live, three ways, before this fix was written:
--   1. The write was attempted against a real `sent` CO and refused, by name.
--   2. **Every `signed` change order in the database predates 2026-08-09.**
--      The newest is 2026-07-31 — the migration's own date is the cut-off.
--   3. The trigger permits `status = 'signed'` on its own; it forbids only the
--      timestamp. A CO could be marked signed with no record of when, and
--      could not be marked signed with one. That incoherence is the tell that
--      this is a defect rather than a rule.
--
-- ----------------------------------------------------------------------------
-- THE FIX, AND WHY IT IS THIS NARROW
-- ----------------------------------------------------------------------------
-- The exception's own words are **"cannot be REWRITTEN"**, and the predicate
-- forbade *writing*. Restoring the sentence is the whole change:
--
--   * `signed_at` NULL -> a value, **as part of becoming `signed`**: allowed.
--     That is the signature itself.
--   * `signed_at` value -> anything else: still refused. That is a rewrite.
--   * `signed_at` NULL -> a value on a CO that is NOT becoming signed: refused.
--     A stamp without the status is a date attached to nothing.
--
-- ⚠️ `contractor_signed_at` AND `contractor_signed_by` ARE DELIBERATELY LEFT
-- EXACTLY AS THEY WERE. The contractor signs BEFORE the CO is sent, so those
-- stamps are already set when the freeze begins and relaxing them would grant
-- something nobody needs — and would weaken `s97ct-floor3.live.ts` **1c**,
-- which is a real floor test on a PM. Only the client's stamp moves.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enforce_change_order_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  -- Nothing is frozen while the change order is still a draft.
  IF OLD.status = 'draft' THEN
    RETURN NEW;
  END IF;

  -- From here OLD.status is sent, signed or voided: the money and the
  -- contractor's signature are the record of what was agreed.
  IF NEW.tax_rate                       IS DISTINCT FROM OLD.tax_rate
     OR NEW.subcontractor_markup_percent IS DISTINCT FROM OLD.subcontractor_markup_percent
     OR NEW.material_markup_percent      IS DISTINCT FROM OLD.material_markup_percent
     OR NEW.labor_markup_percent         IS DISTINCT FROM OLD.labor_markup_percent
     OR NEW.pricing_mode                 IS DISTINCT FROM OLD.pricing_mode
     OR NEW.co_type                      IS DISTINCT FROM OLD.co_type
     OR NEW.net_delta                    IS DISTINCT FROM OLD.net_delta
     OR NEW.project_id                   IS DISTINCT FROM OLD.project_id
     OR NEW.co_number                    IS DISTINCT FROM OLD.co_number THEN
    RAISE EXCEPTION 'A sent change order is immutable — void and reissue instead.';
  END IF;

  -- The CONTRACTOR's stamps: unchanged from 20260809000000. They are written
  -- while the CO is still a draft, so they are always already present here.
  IF NEW.contractor_signed_at IS DISTINCT FROM OLD.contractor_signed_at
     OR NEW.contractor_signed_by IS DISTINCT FROM OLD.contractor_signed_by THEN
    RAISE EXCEPTION 'A signature stamp cannot be rewritten.';
  END IF;

  -- The CLIENT's stamp. ⚠️ SEE THE HEADER — the first write of this column IS
  -- the signature, and forbidding it broke the signing flow outright.
  IF OLD.signed_at IS NOT NULL AND NEW.signed_at IS DISTINCT FROM OLD.signed_at THEN
    RAISE EXCEPTION 'A signature stamp cannot be rewritten.';
  END IF;
  IF OLD.signed_at IS NULL AND NEW.signed_at IS NOT NULL AND NEW.status <> 'signed' THEN
    RAISE EXCEPTION 'A change order cannot carry a signature date without being signed.';
  END IF;

  -- A voided change order is frozen forever and never returns to life.
  IF OLD.status = 'voided' AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'A voided change order is frozen forever.';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_change_order_immutability() IS
  'Freezes a change order once it leaves draft (20260809000000 §1). '
  '⚠️ AMENDED [S164]: the original froze `signed_at` outright, which made the '
  'FIRST stamp impossible and broke every client signature from 2026-08-09 '
  'onward — completeCoSignature() writes status=signed AND signed_at in one '
  'UPDATE. A rewrite is still refused; only the first stamp, on the transition '
  'into `signed`, is allowed.';
