-- ============================================================================
-- S175 #2 / TECH_DEBT `#3-s174` — VOID AND REISSUE FOR ESTIMATES
-- ============================================================================
--
-- Follows `20261031000000_estimate_immutability.sql` and depends on it: a void
-- on a row that can still be edited afterwards records nothing. That sequencing
-- was ruled before either was built.
--
-- The shape is S168's, taken from `20261023000000_co_void_reissue_delete.sql`
-- rather than reinvented: a REQUIRED reason in every case, a two-way shape
-- CHECK, authority in a trigger, `voided_by` stamped from `auth.uid()` and
-- never from the payload, and the whole record frozen once written.
--
-- ⚠️ DELETE IS DELIBERATELY NOT HERE. Ruled out of scope [Josh, S175]. What the
-- CO migration also shipped — `change_orders_delete_unsigned` and its boundary
-- trigger — has no counterpart in this file, and `softDeleteEstimate()` is left
-- exactly as it is. Its gap is real and is FILED, not fixed: a sent estimate
-- reaches the trash today with no reason recorded. See TECH_DEBT `#1-s175`.
--
-- ============================================================================
-- ⚠️ THE THREE DEAD VOCABULARIES, RETIRED IN THE SAME MIGRATION [Josh, S175]
-- ============================================================================
--
-- An estimate already carried THREE ways to say "this one replaces that one",
-- and two of them had never been written by anything. Adding a fourth without
-- retiring them would leave the next reader four candidates and no signal:
--
--   `cloned_from_estimate_id`  LIVE   — written by `clone_estimate()`. KEPT.
--                                       It means "copied from", which is a
--                                       different and still-true relationship:
--                                       one estimate is legitimately cloned
--                                       many times, so it can never carry a
--                                       one-to-one supersession.
--   `parent_estimate_id`       DEAD   — FK'd and indexed since the baseline,
--                                       named exactly "revision of", ZERO
--                                       writers anywhere in the repo.
--   `version_number`           DEAD   — `DEFAULT 'v1.1'`, ZERO writers; READ by
--                                       the builder header and the proposal
--                                       PDF, so it renders a version string
--                                       nothing has ever incremented.
--   `status = 'revised'`       DEAD   — in the CHECK and in the estimates-list
--                                       filter, ZERO writers.
--
-- Josh: *"a dead `revised` beside a live `voided` is a trap."* So `'revised'`
-- is DROPPED from the CHECK here (verified zero rows carry it), and the two
-- columns are COMMENTED as vestigial with what each was for quoted, rather than
-- dropped — dropping a column with an FK and an index is a bigger change than
-- this migration should make, and the comment is what stops the next reader
-- reviving it by accident.
--
-- ============================================================================
-- ⚠️ A CONVERTED ESTIMATE MAY NOT BE VOIDED — and this differs from the CO
-- ============================================================================
--
-- S168 ruled that ANY sent change order may be voided, signed or unsigned. That
-- ruling does not carry over, and the reason is structural [Josh, S175]:
-- **a change order ADDS to a project; an estimate IS its origin.**
--
-- A converted estimate is load-bearing through `projects.source_estimate_id`,
-- `project_financials.contract_value`, every budget line derived from it and —
-- after stage 5 — the selection variances that join contract value.
-- `20260806000000` already freezes `projects.source_estimate_id` because
-- re-pointing it *"silently re-prices"*. Nothing downstream reads the
-- estimate's status, so a voided-but-converted estimate would leave a live
-- project pointing at a withdrawn document with no defined meaning. The refusal
-- names the project, because "you cannot void this" without saying why is the
-- error message this codebase keeps ruling against.
-- ============================================================================

BEGIN;

-- ── 1. The status vocabulary: `voided` in, `revised` out ────────────────────
ALTER TABLE public.estimates DROP CONSTRAINT estimates_status_check;
ALTER TABLE public.estimates ADD CONSTRAINT estimates_status_check
  CHECK (status = ANY (ARRAY[
    'draft'::text, 'review'::text, 'sent'::text, 'viewed'::text,
    'accepted'::text, 'declined'::text, 'expired'::text,
    'converted'::text,
    -- [S175] NEW. The company withdrew this document after the client had it.
    'voided'::text
    -- [S175] REMOVED: 'revised'. Never written by anything, and it read as
    -- "the client asked for changes" while the mechanism that actually exists
    -- is void-and-reissue. Verified zero rows carried it before the drop.
  ]));

-- ── 2. The void record ──────────────────────────────────────────────────────
ALTER TABLE public.estimates
  ADD COLUMN IF NOT EXISTS void_reason text,
  ADD COLUMN IF NOT EXISTS voided_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS voided_at timestamptz;

-- Shape-checked BOTH ways, the `contract_documents_void_shape_check` precedent:
-- a voided row cannot lack its reason and a live row cannot carry one.
ALTER TABLE public.estimates ADD CONSTRAINT estimates_void_shape_check CHECK (
  (status = 'voided'
     AND void_reason IS NOT NULL AND voided_by IS NOT NULL AND voided_at IS NOT NULL)
  OR (status <> 'voided'
     AND void_reason IS NULL AND voided_by IS NULL AND voided_at IS NULL)
);

-- ── 3. Supersession ─────────────────────────────────────────────────────────
ALTER TABLE public.estimates
  ADD COLUMN IF NOT EXISTS supersedes_estimate_id uuid REFERENCES public.estimates(id);

-- ONE reissue per withdrawal, ever. Partial so the many NULLs do not collide —
-- `change_orders_supersedes_once`'s shape exactly.
CREATE UNIQUE INDEX IF NOT EXISTS estimates_supersedes_once
  ON public.estimates (supersedes_estimate_id)
  WHERE supersedes_estimate_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_estimates_supersedes_estimate_id
  ON public.estimates (supersedes_estimate_id)
  WHERE supersedes_estimate_id IS NOT NULL;

-- ── 4. The dead vocabularies, labelled ──────────────────────────────────────
COMMENT ON COLUMN public.estimates.parent_estimate_id IS
$c$VESTIGIAL [S175] — FK'd and indexed since the baseline and NEVER WRITTEN by
anything in this repository. It was the original "this estimate is a revision of
that one" link, from before void-and-reissue existed. Superseded by
`supersedes_estimate_id`, which carries a once-only unique index this column
never had. DO NOT REVIVE IT: a second live supersession link is how two readers
come to disagree about which document replaced which.$c$;

COMMENT ON COLUMN public.estimates.version_number IS
$c$VESTIGIAL [S175] — `DEFAULT 'v1.1'` and NEVER WRITTEN. It is still READ, by
the builder header and the proposal PDF, so every estimate ever produced has
displayed the string "v1.1". It was the original hand-maintained revision
counter. Superseded by `supersedes_estimate_id`. Left in place because the two
readers would otherwise need a fallback; do not build an incrementer for it.$c$;

COMMENT ON COLUMN public.estimates.supersedes_estimate_id IS
$c$[S175] The VOIDED estimate this one replaces. One reissue per withdrawal —
`estimates_supersedes_once`. Distinct from `cloned_from_estimate_id`, which
means "copied from" and is legitimately one-to-many.$c$;

-- ── 5. Authority, and the converted refusal ─────────────────────────────────
-- Owner/Admin or the AUTHORING PM — the same shape as
-- `estimates_select_authenticated`, so anyone who can see an estimate to want
-- it withdrawn is exactly who can withdraw it.
CREATE OR REPLACE FUNCTION public.enforce_estimate_void_authority()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_role         text;
  v_project_name text;
BEGIN
  -- Only the transition INTO voided is governed here.
  IF NEW.status <> 'voided' OR OLD.status = 'voided' THEN
    RETURN NEW;
  END IF;

  -- ⚠️ A CONVERTED ESTIMATE IS THE ORIGIN OF A LIVE PROJECT. See the header.
  IF OLD.status = 'converted' OR OLD.project_id IS NOT NULL THEN
    SELECT p.name INTO v_project_name FROM projects p WHERE p.id = OLD.project_id;
    RAISE EXCEPTION
      'This estimate was converted into the project "%" and cannot be voided — its contract value, budget and change orders all derive from it. Raise a change order against the project instead.',
      COALESCE(v_project_name, '(unknown)');
  END IF;

  -- Service-role callers (auth.uid() IS NULL) have no role to check. The
  -- authority test is about a PERSON acting; a migration or a cron voiding an
  -- estimate is not something this trigger can meaningfully authorise, and the
  -- shape check above still applies to them.
  IF auth.uid() IS NOT NULL THEN
    v_role := get_my_role();
    IF NOT (v_role = ANY (ARRAY['owner'::text, 'admin'::text])
            OR (v_role = 'project_manager' AND OLD.created_by = auth.uid())) THEN
      RAISE EXCEPTION 'Only an Owner, an Admin, or the project manager who wrote this estimate may void it.';
    END IF;
    -- Stamped from the session, NEVER from the payload — S168's rule, so the
    -- record cannot name someone who did not do it.
    NEW.voided_by := auth.uid();
  END IF;

  NEW.voided_at := COALESCE(NEW.voided_at, now());

  IF NEW.void_reason IS NULL OR btrim(NEW.void_reason) = '' THEN
    RAISE EXCEPTION 'A void needs a reason. It is kept permanently.';
  END IF;

  RETURN NEW;
END;
$$;

-- Sorts before `estimates_z_immutability` so authority is judged before the
-- freeze reads the row this trigger has finished stamping.
DROP TRIGGER IF EXISTS estimates_void_authority ON public.estimates;
CREATE TRIGGER estimates_void_authority
  BEFORE UPDATE ON public.estimates
  FOR EACH ROW EXECUTE FUNCTION public.enforce_estimate_void_authority();

-- ── 6. Supersession validity ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_estimate_supersedes_valid()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_target record;
BEGIN
  IF NEW.supersedes_estimate_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.supersedes_estimate_id = NEW.id THEN
    RAISE EXCEPTION 'An estimate cannot supersede itself.';
  END IF;

  SELECT id, status, company_id INTO v_target
  FROM estimates WHERE id = NEW.supersedes_estimate_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The superseded estimate does not exist.';
  END IF;
  IF v_target.company_id <> NEW.company_id THEN
    RAISE EXCEPTION 'An estimate can only supersede one from the same company.';
  END IF;
  IF v_target.status <> 'voided' THEN
    RAISE EXCEPTION 'An estimate can only supersede a VOIDED one — void it first, with a reason.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS estimates_supersedes_valid ON public.estimates;
CREATE TRIGGER estimates_supersedes_valid
  BEFORE INSERT OR UPDATE OF supersedes_estimate_id ON public.estimates
  FOR EACH ROW EXECUTE FUNCTION public.enforce_estimate_supersedes_valid();

-- ── 7. The freeze, amended ──────────────────────────────────────────────────
-- Three additions, all ruled [Josh, S175 Q2.2]: the void record is frozen once
-- written; `voided` is terminal; and BACKWARDS transitions are refused, which
-- is what actually closes `#4-s174` (unsend). Deliberately NOT a full
-- transition matrix — the CO trigger carries exactly one transition rule and no
-- more, and a matrix is where breakage lives.
CREATE OR REPLACE FUNCTION public.enforce_estimate_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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

  -- ⚠️ [S175 #2] NO GOING BACK. This is what closes `#4-s174`: until now
  -- `sent → draft` succeeded, and the only thing defending that boundary was
  -- the absence of a button. An emailed estimate is a document the client
  -- holds; editing it silently is exactly what void-and-reissue exists to
  -- prevent, and an unsend would have re-opened the LINE ITEMS too, because
  -- their own policies key on the same `status = 'draft'`.
  IF NEW.status = 'draft' OR NEW.status = 'review' THEN
    RAISE EXCEPTION 'A sent estimate cannot be returned to draft — void it and reissue instead.';
  END IF;

  -- The void record, once written, is as frozen as the document.
  IF OLD.voided_at IS NOT NULL
     AND (NEW.void_reason IS DISTINCT FROM OLD.void_reason
          OR NEW.voided_by IS DISTINCT FROM OLD.voided_by
          OR NEW.voided_at IS DISTINCT FROM OLD.voided_at) THEN
    RAISE EXCEPTION 'A void record cannot be rewritten.';
  END IF;

  -- What an estimate supersedes is settled when it is created, not after.
  IF NEW.supersedes_estimate_id IS DISTINCT FROM OLD.supersedes_estimate_id THEN
    RAISE EXCEPTION 'A sent estimate is immutable — void and reissue instead.';
  END IF;

  -- A voided estimate is frozen forever and never returns to life.
  IF OLD.status = 'voided' AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'A voided estimate is frozen forever.';
  END IF;

  -- ── The transition arms (unchanged from 20261031000000) ─────────────────
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
$$;

COMMENT ON FUNCTION public.enforce_estimate_immutability() IS
$c$S175 — freezes an estimate once it reaches the CLIENT (`sent`, not "left
draft": `review` is internal and the send transition runs from it).

RULED [Josh, S175] to carry BOTH mechanisms: the frozen set admits no exemption
for anyone, service role included, and the legitimate post-send writes are named
one by one as transition arms so the exemption the three service-role writers
need is bounded to the writes they make.

AMENDED [S175 #2]: backwards transitions to draft/review are refused — which is
what closes #4-s174, since nothing but the absence of a button defended that
boundary; the void record is frozen once written; and `voided` is terminal.
Deliberately NOT a full transition matrix.$c$;

COMMIT;
