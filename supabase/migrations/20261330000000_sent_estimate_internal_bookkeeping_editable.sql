-- Item 1 correction [Josh, S103] — THE CLIENT-FACING DOCUMENT FREEZES; INTERNAL
-- BOOKKEEPING DOES NOT.
--
-- 20261310000000 converted enforce_estimate_immutability to an allowlist and, in
-- doing so, froze four columns that are internal bookkeeping, not the document the
-- client holds. The estimates branch's own tests encode the intended boundary and
-- caught it: s175-estimate-freeze B7/B8 assert internal_notes and reminder_schedule
-- stay editable on a sent estimate ("bookkeeping about the document, not the
-- document"), and s146-contract-services C5 toggles include_client_contract on a
-- sent estimate. projected_value carried no test; Josh has now ruled it internal too.
--
-- This is a FORWARD migration (20261310000000 is already applied on rebuild-test;
-- rewriting an applied migration is how ledgers diverge). It only adds the four
-- columns to the permitted set — everything else in the function is byte-identical
-- to 20261310000000.
--
--   internal_notes         — internal notes, never on the proposal
--   reminder_schedule      — the follow-up cadence, company bookkeeping
--   include_client_contract — a company config toggle, not proposal content
--   projected_value        — the cost-plus/T&M projection, internal [Josh ruling]

CREATE OR REPLACE FUNCTION public.enforce_estimate_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  permitted CONSTANT text[] := ARRAY[
    'status', 'viewed_at', 'accepted_at', 'declined_at', 'reminder_count',
    'last_reminder_sent_at', 'client_unsubscribed_at', 'signed_proposal_file_id',
    'decline_reason_code', 'decline_reason_notes', 'lost_reason_code',
    'void_reason', 'voided_by', 'voided_at', 'project_id',
    'is_deleted', 'deleted_at', 'updated_at', 'updated_by',
    -- [S103] internal bookkeeping — editable on a sent estimate (the client
    -- never sees these; the DOCUMENT is what freezes).
    'internal_notes', 'reminder_schedule', 'include_client_contract', 'projected_value'
  ];
BEGIN
  -- Draft/review is fully editable; the draft/review -> sent transition itself
  -- runs through here (OLD.status is still draft/review at that moment).
  IF OLD.status = 'draft' OR OLD.status = 'review' THEN
    RETURN NEW;
  END IF;

  -- ALLOWLIST. Strip the permitted keys from both row images and compare what is
  -- left: any change to any other column — including one added after this was
  -- written — freezes the write.
  IF (to_jsonb(NEW) - permitted) IS DISTINCT FROM (to_jsonb(OLD) - permitted) THEN
    RAISE EXCEPTION 'A sent estimate is immutable — void and reissue instead.';
  END IF;

  -- No going back to draft/review (this is what closed #4-s174).
  IF NEW.status = 'draft' OR NEW.status = 'review' THEN
    RAISE EXCEPTION 'A sent estimate cannot be returned to draft — void it and reissue instead.';
  END IF;

  -- The void record, once written, is as frozen as the document.
  IF OLD.voided_at IS NOT NULL
     AND (NEW.void_reason IS DISTINCT FROM OLD.void_reason
          OR NEW.voided_by  IS DISTINCT FROM OLD.voided_by
          OR NEW.voided_at  IS DISTINCT FROM OLD.voided_at) THEN
    RAISE EXCEPTION 'A void record cannot be rewritten.';
  END IF;

  -- A voided estimate is frozen forever and never returns to life.
  IF OLD.status = 'voided' AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'A voided estimate is frozen forever.';
  END IF;

  -- Signature / decision stamps, once set, cannot be rewritten (unchanged arms).
  IF OLD.accepted_at IS NOT NULL AND NEW.accepted_at IS DISTINCT FROM OLD.accepted_at THEN
    RAISE EXCEPTION 'A signature stamp cannot be rewritten.';
  END IF;
  IF OLD.signed_proposal_file_id IS NOT NULL
     AND NEW.signed_proposal_file_id IS DISTINCT FROM OLD.signed_proposal_file_id THEN
    RAISE EXCEPTION 'A signature stamp cannot be rewritten.';
  END IF;
  IF OLD.accepted_at IS NULL AND NEW.accepted_at IS NOT NULL AND NEW.status <> 'accepted' THEN
    RAISE EXCEPTION 'An estimate cannot carry an acceptance date without being accepted.';
  END IF;
  IF OLD.declined_at IS NOT NULL AND NEW.declined_at IS DISTINCT FROM OLD.declined_at THEN
    RAISE EXCEPTION 'A decline record cannot be rewritten.';
  END IF;
  IF OLD.declined_at IS NOT NULL
     AND (NEW.decline_reason_code  IS DISTINCT FROM OLD.decline_reason_code
       OR NEW.decline_reason_notes IS DISTINCT FROM OLD.decline_reason_notes
       OR NEW.lost_reason_code     IS DISTINCT FROM OLD.lost_reason_code) THEN
    RAISE EXCEPTION 'A decline record cannot be rewritten.';
  END IF;
  IF OLD.declined_at IS NULL AND NEW.declined_at IS NOT NULL AND NEW.status <> 'declined' THEN
    RAISE EXCEPTION 'An estimate cannot carry a decline date without being declined.';
  END IF;

  RETURN NEW;
END;
$$;
