-- ============================================================================
-- 7D §5 / 7E §6 — PAYMENT TERMS RULED (Josh, S97 2026-08-02).
--
-- The due date is SET BY THE USER per invoice, defaulting to DUE ON RECEIPT.
-- This closes 7D open item #3 and 7E's P-1.
--
-- THE ONE SCHEMA-SIDE CONSEQUENCE: due_date joins the invoice immutability
-- trigger's frozen set.
--
-- WHY IT BELONGS THERE. Everything that decides what the client owes, or when,
-- is already frozen the moment an invoice is sent — amount_receivable,
-- retainage, the invoice number and, tellingly, `issue_date`. The due date is
-- the same class of fact: it is the date the client is measured against, so
-- moving it after the bill has gone out silently rewrites whether they are late
-- and how the receivable ages. Freezing it is the consistent choice, not a new
-- one. Settable freely on a draft; frozen on send; corrected the way every
-- other sent-invoice money term is corrected — void and reissue.
--
-- Declaration byte-exact against the live pg_get_functiondef read at apply
-- time. The ONLY change is `due_date` added to the frozen list, beside
-- issue_date where it belongs.
--
-- NO DATA MIGRATION, deliberately. "Due on receipt" is represented as
-- `due_date IS NULL`, which is what every existing invoice already carries — so
-- nothing shifts for a single existing row and no backfill is needed. The
-- reasoning is written up in agingBucketFor().
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enforce_invoice_immutability()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  -- Nothing is frozen while the invoice is still a draft or awaiting approval.
  IF OLD.status = ANY (ARRAY['draft'::text, 'pending_approval'::text]) THEN
    RETURN NEW;
  END IF;

  -- From here OLD.status is sent, paid or voided: the money is frozen.
  IF NEW.derived_total      IS DISTINCT FROM OLD.derived_total
     OR NEW.billed_total    IS DISTINCT FROM OLD.billed_total
     OR NEW.amount_receivable IS DISTINCT FROM OLD.amount_receivable
     OR NEW.retainage_withheld IS DISTINCT FROM OLD.retainage_withheld
     OR NEW.retainage_percent  IS DISTINCT FROM OLD.retainage_percent
     OR NEW.invoice_number  IS DISTINCT FROM OLD.invoice_number
     OR NEW.invoice_type    IS DISTINCT FROM OLD.invoice_type
     OR NEW.project_id      IS DISTINCT FROM OLD.project_id
     OR NEW.issue_date      IS DISTINCT FROM OLD.issue_date
     OR NEW.due_date        IS DISTINCT FROM OLD.due_date THEN
    RAISE EXCEPTION 'A sent invoice is immutable (7D spec 8). Void and reissue instead.';
  END IF;

  -- A voided invoice is frozen forever and never returns to life (9).
  IF OLD.status = 'voided' AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'A voided invoice is frozen forever (7D spec 9).';
  END IF;

  RETURN NEW;
END;
$function$;
