-- Item 1 [Josh, S103] — nobody edits a sent estimate.
--
-- The shipped enforce_estimate_immutability was a DENYLIST: it named the frozen
-- columns and left everything else writable. A live owner probe (anon key) on a
-- throwaway sent estimate confirmed the holes: internal_notes, projected_value and
-- reminder_schedule all APPLIED, along with the identity/audit columns and (on
-- main) deposit_percent/invoice_due_days/also_send_to. The original #2-s174 holes
-- (name/grand_total/scope_summary) were already closed, but a denylist cannot close
-- a column nobody remembered to list — including columns added in the future.
--
-- This converts the function to an ALLOWLIST: on a non-draft/review estimate, ONLY
-- the lifecycle/machinery columns may change; any other column (present or future)
-- freezes the write. The permitted set is the writer census recorded in
-- docs/sessions/sent-freeze-po-edit-log.md — the ruling's eight machinery columns
-- PLUS the columns the real writers touch on an already-sent row, without which the
-- proposal flow breaks:
--   void_estimate           -> void_reason, voided_by, voided_at
--   mark_estimate_lost      -> lost_reason_code
--   declineEstimate         -> decline_reason_code, decline_reason_notes
--   convert_estimate_to_project -> project_id
--   soft-delete / trash     -> is_deleted, deleted_at   (freezes the DOCUMENT, not the trash bin)
--   BEFORE UPDATE triggers  -> updated_at, updated_by   (estimates_z_immutability fires LAST, so
--                                                         these ALWAYS differ)
-- The existing once-set / void / status sub-guards are preserved verbatim. Same
-- function, same trigger (estimates_z_immutability) — no second trigger.

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
    'is_deleted', 'deleted_at', 'updated_at', 'updated_by'
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
