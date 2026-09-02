-- Estimates redesign — Migration #2 of the S103 build: structured deposit terms.
-- Spec: docs/specs/estimates-redesign-spec.md §3.5 row 2; §2.2; R9; Q3.
--
-- Adds the estimate-level structured payment terms (16c) and the company
-- defaults they diff against ("changed from default"):
--   · estimates.deposit_percent      — % of grand total taken as deposit
--   · estimates.invoice_due_days     — net-days (integer, Q3); seeds
--     invoices.due_date and NEVER overwrites a set one (that seeding is a
--     SERVICE build, not this migration).
--   · companies.default_deposit_percent / default_retainage_percent — the
--     baseline for "changed from default". retainage_percent ALREADY exists on
--     estimates (20260926000000); only the company defaults are new here.
--
-- ⚠️ IMMUTABILITY FREEZE LIST (spec §3.5, §1.2). deposit_percent and
-- invoice_due_days are money/terms on a document the client holds once sent.
-- They MUST freeze on send exactly as retainage_percent already does, or a sent
-- estimate's deposit could be changed after the client agreed to it. This
-- migration re-creates enforce_estimate_immutability() with the two columns
-- added to the frozen set — the whole body is reproduced verbatim from the live
-- definition (20261032000000 lineage) with only those two lines inserted.
--
-- Independently pushable: schema + freeze in one transaction; depends on no
-- other migration in this build.

ALTER TABLE estimates
  ADD COLUMN deposit_percent numeric
    CONSTRAINT estimates_deposit_percent_check
    CHECK (deposit_percent IS NULL
           OR (deposit_percent >= 0 AND deposit_percent <= 100)),
  ADD COLUMN invoice_due_days integer
    CONSTRAINT estimates_invoice_due_days_check
    CHECK (invoice_due_days IS NULL OR invoice_due_days >= 0);

COMMENT ON COLUMN estimates.deposit_percent IS
  '% of grand total taken as deposit (16c). Seeds the deposit invoice amount. '
  'Frozen on send. Estimates redesign S103 migration #2.';
COMMENT ON COLUMN estimates.invoice_due_days IS
  'Invoice due as NET-DAYS (Q3). Seeds invoices.due_date = issue + N when not '
  'already set; never overwrites a chosen date. Frozen on send. S103 migration #2.';

ALTER TABLE companies
  ADD COLUMN default_deposit_percent numeric
    CONSTRAINT companies_default_deposit_percent_check
    CHECK (default_deposit_percent IS NULL
           OR (default_deposit_percent >= 0 AND default_deposit_percent <= 100)),
  ADD COLUMN default_retainage_percent numeric
    CONSTRAINT companies_default_retainage_percent_check
    CHECK (default_retainage_percent IS NULL
           OR (default_retainage_percent >= 0 AND default_retainage_percent <= 100));

COMMENT ON COLUMN companies.default_deposit_percent IS
  'Company default deposit %, the baseline 16c "changed from default" diffs against. S103 migration #2.';
COMMENT ON COLUMN companies.default_retainage_percent IS
  'Company default retainage %, the baseline 16c "changed from default" diffs against. S103 migration #2.';

-- Freeze deposit_percent + invoice_due_days on a sent estimate.
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
       OR NEW.decline_reason_notes IS DISTINCT FROM OLD.decline_reason_notes) THEN
    RAISE EXCEPTION 'A decline record cannot be rewritten.';
  END IF;
  IF OLD.declined_at IS NULL AND NEW.declined_at IS NOT NULL AND NEW.status <> 'declined' THEN
    RAISE EXCEPTION 'An estimate cannot carry a decline date without being declined.';
  END IF;

  RETURN NEW;
END;
$function$;
