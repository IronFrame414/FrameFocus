-- Estimates redesign — Migration #8 of the S103 build: mark-lost reason set.
-- Spec: docs/specs/estimates-redesign-spec.md §5 (Q6); 19b delete→mark-lost [R12].
--
-- Q6 RULED [Josh, S103]: a DISCRIMINATOR, NOT a widening of the existing
-- decline CHECK. The live decline reasons (too_expensive, chose_competitor,
-- project_canceled, timing, scope_changed, other) are things THE CLIENT SAID.
-- "Mark lost" is what YOU concluded when the client said nothing. Mixing them
-- makes win-rate analysis unable to tell one from the other.
--
-- Mechanism: a new `lost_reason_code` column with its OWN value set. Both a
-- client decline and a self-initiated mark-lost land on status='declined'; the
-- DISCRIMINATOR is which reason column is set — decline_reason_code (client) vs
-- lost_reason_code (self). A CHECK forbids both being set at once, so analytics
-- can always tell them apart.
--
-- Lost reasons: lost_to_competitor · no_response · client_postponed ·
-- we_declined · other. (`no_response` is the load-bearing one — the most common
-- real outcome, which a client-decline list cannot express.)
--
-- ⚠️ Existing declined rows keep their decline_reason_code untouched;
-- lost_reason_code is brand-new (all NULL), so both new CHECKs pass for every
-- existing row — no data rewrite. Independently pushable.

ALTER TABLE estimates
  ADD COLUMN lost_reason_code text
    CONSTRAINT estimates_lost_reason_code_check
    CHECK (lost_reason_code IS NULL OR lost_reason_code = ANY (ARRAY[
      'lost_to_competitor', 'no_response', 'client_postponed', 'we_declined', 'other'
    ])),
  -- The discriminator's integrity: a loss is EITHER a client decline OR a
  -- self-initiated mark-lost, never both.
  ADD CONSTRAINT estimates_decline_xor_lost_check
    CHECK (decline_reason_code IS NULL OR lost_reason_code IS NULL);

COMMENT ON COLUMN estimates.lost_reason_code IS
  'Self-initiated "mark lost" reason (19b), DISTINCT from client decline_reason_code '
  '(Q6 discriminator). Values: lost_to_competitor/no_response/client_postponed/'
  'we_declined/other. Frozen once declined_at is set. S103 migration #8.';

-- Freeze lost_reason_code once the loss record exists, exactly as
-- decline_reason_code is frozen. Full body reproduced from the live definition
-- (20261120000000 lineage) with lost_reason_code added to the decline-record arm.
CREATE OR REPLACE FUNCTION public.enforce_estimate_immutability()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.status = 'draft' OR OLD.status = 'review' THEN
    RETURN NEW;
  END IF;

  IF NEW.subtotal                     IS DISTINCT FROM OLD.subtotal
     OR NEW.tax_total                 IS DISTINCT FROM OLD.tax_total
     OR NEW.grand_total               IS DISTINCT FROM OLD.grand_total
     OR NEW.discount_total            IS DISTINCT FROM OLD.discount_total
     OR NEW.discount_type             IS DISTINCT FROM OLD.discount_type
     OR NEW.discount_amount           IS DISTINCT FROM OLD.discount_amount
     OR NEW.tax_rate                  IS DISTINCT FROM OLD.tax_rate
     OR NEW.retainage_percent         IS DISTINCT FROM OLD.retainage_percent
     OR NEW.deposit_percent           IS DISTINCT FROM OLD.deposit_percent
     OR NEW.invoice_due_days          IS DISTINCT FROM OLD.invoice_due_days
     OR NEW.pricing_mode              IS DISTINCT FROM OLD.pricing_mode
     OR NEW.contract_type             IS DISTINCT FROM OLD.contract_type
     OR NEW.labor_markup_percent      IS DISTINCT FROM OLD.labor_markup_percent
     OR NEW.material_markup_percent   IS DISTINCT FROM OLD.material_markup_percent
     OR NEW.subcontractor_markup_percent IS DISTINCT FROM OLD.subcontractor_markup_percent
     OR NEW.proposal_pricing_level    IS DISTINCT FROM OLD.proposal_pricing_level
     OR NEW.estimate_number           IS DISTINCT FROM OLD.estimate_number
     OR NEW.contact_id                IS DISTINCT FROM OLD.contact_id
     OR NEW.contact_address_id        IS DISTINCT FROM OLD.contact_address_id
     OR NEW.name                      IS DISTINCT FROM OLD.name
     OR NEW.scope_summary             IS DISTINCT FROM OLD.scope_summary
     OR NEW.scope_sections            IS DISTINCT FROM OLD.scope_sections
     OR NEW.terms_sections            IS DISTINCT FROM OLD.terms_sections
     OR NEW.cover_letter              IS DISTINCT FROM OLD.cover_letter
     OR NEW.legal_description         IS DISTINCT FROM OLD.legal_description
     OR NEW.expiration_days           IS DISTINCT FROM OLD.expiration_days
     OR NEW.expires_at                IS DISTINCT FROM OLD.expires_at
     OR NEW.start_date                IS DISTINCT FROM OLD.start_date
     OR NEW.target_end_date           IS DISTINCT FROM OLD.target_end_date
     OR NEW.substantial_completion_days IS DISTINCT FROM OLD.substantial_completion_days
     OR NEW.version_number            IS DISTINCT FROM OLD.version_number
     OR NEW.include_client_contract   IS DISTINCT FROM OLD.include_client_contract
     OR NEW.sent_at                   IS DISTINCT FROM OLD.sent_at
     OR NEW.reviewed_by               IS DISTINCT FROM OLD.reviewed_by
     OR NEW.reviewed_at               IS DISTINCT FROM OLD.reviewed_at THEN
    RAISE EXCEPTION 'A sent estimate is immutable — void and reissue instead.';
  END IF;

  IF NEW.status = 'draft' OR NEW.status = 'review' THEN
    RAISE EXCEPTION 'A sent estimate cannot be returned to draft — void it and reissue instead.';
  END IF;

  IF OLD.voided_at IS NOT NULL
     AND (NEW.void_reason IS DISTINCT FROM OLD.void_reason
          OR NEW.voided_by IS DISTINCT FROM OLD.voided_by
          OR NEW.voided_at IS DISTINCT FROM OLD.voided_at) THEN
    RAISE EXCEPTION 'A void record cannot be rewritten.';
  END IF;

  IF NEW.supersedes_estimate_id IS DISTINCT FROM OLD.supersedes_estimate_id THEN
    RAISE EXCEPTION 'A sent estimate is immutable — void and reissue instead.';
  END IF;

  IF OLD.status = 'voided' AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'A voided estimate is frozen forever.';
  END IF;

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
$function$;
