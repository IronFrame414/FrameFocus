-- ============================================================================
-- S175 #1 / TECH_DEBT `#2-s174` — A SENT ESTIMATE BECOMES IMMUTABLE
-- ============================================================================
--
-- ⚠️ THE HOLE, PROVED LIVE AT S174 AND STILL OPEN ON PRODUCTION.
--
-- Signed in as an Owner through the anon key — i.e. anything a browser console
-- can do — against an estimate at `status = 'sent'`:
--
--   UPDATE estimates SET name = …                        -> 1 row
--   UPDATE estimates SET grand_total = 999999, subtotal=… -> 1 row, read back 999999
--   UPDATE estimates SET scope_summary = …               -> 1 row
--   INSERT INTO estimate_line_items …                    -> REFUSED by RLS
--
-- **The CHILDREN are floored at the database and the PARENT ROW IS NOT.**
-- `estimate_line_items_insert_manager` and `..._update_manager` both carry
-- `AND e.status = 'draft'`. `estimates_update_manager` carries that predicate
-- **only on its project-manager arm**; the Owner/Admin arm is role-only. The
-- entire freeze for the two roles that can actually reach the screen was an
-- `if` in TypeScript — `estimates-client.ts:353` — and every write in this app
-- goes to PostgREST directly, so that `if` is not below the UI, it IS the UI.
--
-- Estimates predate all of this. **This hole is live on production**, where a
-- client is holding a PDF of a document the company can still silently edit.
--
-- ============================================================================
-- ⚠️ THE RULING [Josh, S175]: BOTH MECHANISMS, AND WHY NEITHER ALONE SUFFICED
-- ============================================================================
--
-- The build was offered three shapes and Josh ruled for the third, against the
-- recommendation. Recorded here in full because the argument is the design:
--
-- **A bare `auth.uid() IS NULL` exemption relocates the hole rather than
-- closing it.** It is the house pattern for `projects` (`20261013000000`) and
-- it would have closed the *proved* hole exactly — an authenticated Owner has a
-- non-null `auth.uid()`. But it hands a blanket rewrite of a client-facing
-- document to anything holding the service-role key, which is what `#2-s174`
-- exists to prevent. A freeze with a blanket exemption is not a freeze.
--
-- **Explicit transition arms alone risk the S164 disaster again.** Three of the
-- nine legitimate post-send writers run through the SERVICE-ROLE client —
-- client accept, client decline, unsubscribe (`signing-service.ts:256/337/376`)
-- — and a trigger is NOT bypassed by the service role. `20261022000000` records
-- what happens when this is got wrong: the original CO trigger froze
-- `signed_at` outright and *"broke every client signature from 2026-08-09"*,
-- undetected for two weeks. Arms that miss a writer fail exactly that way.
--
-- **So: both.** The frozen set below admits NO exemption for anyone, service
-- role included — that is what makes it a freeze. The legitimate writes are
-- then named ONE BY ONE as transition arms, so the exemption those three
-- service-role writers need is **bounded to the writes they actually make**
-- rather than granted to whoever holds the key. Josh: *"Explicit transition
-- arms name WHICH writes are legitimate … so the exemption is bounded rather
-- than blanket."*
--
-- There is deliberately no `IF auth.uid() IS NULL THEN RETURN NEW` branch in
-- this function. Its absence is the ruling.
--
-- ============================================================================
-- ⚠️ THE FREEZE STARTS AT `sent`, NOT AT "LEFT DRAFT" — and that differs from
-- the change-order trigger it otherwise mirrors.
-- ============================================================================
--
-- `enforce_change_order_immutability` opens `IF OLD.status = 'draft'`. Copying
-- that literally here would be WRONG, because an estimate has a state a change
-- order does not: **`review`**. A PM submits for review and an Owner/Admin
-- approves-and-sends (4D); `review` is an INTERNAL hand-off and nothing has
-- reached the client. The send transition itself runs FROM `review`
-- (`api/proposals/send/route.ts` accepts `draft|review` and stamps
-- `reviewed_by`/`reviewed_at` on the way), so a freeze that began at "left
-- draft" would refuse the very act of sending for every PM-authored estimate.
--
-- The boundary is **the document reaching the client**, which is `sent`.
--
-- ============================================================================
-- THE NINE LEGITIMATE POST-SEND WRITERS this was built against
-- ============================================================================
--   1. signing-service.ts:256  ADMIN   accepted / accepted_at / signed_proposal_file_id
--   2. signing-service.ts:337  ADMIN   declined / declined_at / decline_reason_*
--   3. signing-service.ts:376  ADMIN   client_unsubscribed_at
--   4. estimate-reminders.ts:130,139   status='expired'
--   5. estimate-reminders.ts:245       reminder_count / last_reminder_sent_at
--   6. estimates-client.ts:653         reminder_schedule
--   7. estimates-client.ts:413         is_deleted / deleted_at
--   8. contracts-client.ts:492         include_client_contract  ⚠️ ZERO CALLERS — see below
--   9. convert_estimate_to_project()   project_id / status='converted'
--
-- ⚠️ #8 IS FROZEN DELIBERATELY. `setEstimateContractToggle()` has **no callers
-- anywhere in the repo** (verified by grep across app/, lib/ and components/),
-- and its own docstring calls it *"the estimate-level choice the user makes
-- when sending a proposal"* — a pre-send decision. Whether a contract rides
-- along is part of what the client was sent. It is frozen; if a caller is added
-- later it must be a draft-side one.
--
-- `switch_pricing_mode()` needs no arm: it already refuses outright with
-- *"Estimate is not editable (status: %)"* for anything but draft.
--
-- ============================================================================
-- WHAT THIS DOES NOT DO, on purpose
-- ============================================================================
-- **No status-transition table.** The CO trigger enforces exactly one
-- transition rule ("a voided change order is frozen forever") and no more, and
-- this mirrors that restraint. A transition matrix is where breakage lives, it
-- is not what `#2-s174` is about, and `20261013000000` already shows how much
-- surface one brings. Void-and-reissue (S175 item 2) adds the one rule this
-- table will need, in its own migration, where it can be reasoned about alone.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_estimate_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- ── The boundary: the document has not reached the client yet ────────────
  -- `draft` and `review` are both internal. See the header — copying the CO
  -- trigger's `= 'draft'` here would refuse the send itself.
  IF OLD.status = 'draft' OR OLD.status = 'review' THEN
    RETURN NEW;
  END IF;

  -- ── THE FROZEN SET. No exemption for any caller, service role included. ──
  -- Money, scope and identity: everything the client is holding a PDF of.
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

  -- ── THE TRANSITION ARMS. This is the bounded exemption. ──────────────────
  -- Each names ONE legitimate post-send write. The shape is S164's, and it is
  -- the half that keeps the client's own acts working: the FIRST stamp is the
  -- event itself and must be allowed; any later change to it is a rewrite of
  -- the record and must not be.

  -- ARM 1 — the client ACCEPTS (signing-service.ts:256, service role).
  IF OLD.accepted_at IS NOT NULL AND NEW.accepted_at IS DISTINCT FROM OLD.accepted_at THEN
    RAISE EXCEPTION 'A signature stamp cannot be rewritten.';
  END IF;
  IF OLD.signed_proposal_file_id IS NOT NULL
     AND NEW.signed_proposal_file_id IS DISTINCT FROM OLD.signed_proposal_file_id THEN
    RAISE EXCEPTION 'A signature stamp cannot be rewritten.';
  END IF;
  -- Paired shape, the CO trigger's own precedent: a stamp may not exist
  -- without the status that explains it.
  IF OLD.accepted_at IS NULL AND NEW.accepted_at IS NOT NULL AND NEW.status <> 'accepted' THEN
    RAISE EXCEPTION 'An estimate cannot carry an acceptance date without being accepted.';
  END IF;

  -- ARM 2 — the client DECLINES (signing-service.ts:337, service role).
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

  -- ARM 3 — the client UNSUBSCRIBES (signing-service.ts:376, service role).
  -- Deliberately writable at ANY status and NOT paired to one: the client may
  -- click unsubscribe in an old reminder email long after the estimate has
  -- expired or been accepted, and the service says so in its own words.
  -- Re-clicking re-stamps the time, which is harmless and is not a record of
  -- anything the client agreed to.

  -- ARM 4 — CONVERSION (convert_estimate_to_project). `project_id` and
  -- `status = 'converted'` are left writable; the conversion function is
  -- SECURITY DEFINER and does its own role and state checks, and
  -- `20260806000000` separately freezes `projects.source_estimate_id` against
  -- re-pointing, which is the direction that silently re-prices.

  -- ARM 5 — the reminder machinery (estimate-reminders.ts) and the trash-bin
  -- columns are left writable by omission from the frozen set above. They are
  -- bookkeeping about the document, not the document.

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS estimates_z_immutability ON public.estimates;

-- Named `_z_` so it sorts AFTER `estimates_set_updated_by` and
-- `estimates_updated_at`: those two rewrite NEW on every UPDATE, and a freeze
-- that ran first would be judging a row the other triggers had not finished
-- building. Same ordering trick, and the same reason, as
-- `invoice_lines_z_contract_ceiling` (20260821000000).
CREATE TRIGGER estimates_z_immutability
  BEFORE UPDATE ON public.estimates
  FOR EACH ROW EXECUTE FUNCTION public.enforce_estimate_immutability();

COMMENT ON FUNCTION public.enforce_estimate_immutability() IS
$c$S175 / TECH_DEBT #2-s174 — freezes an estimate once it reaches the CLIENT.

The boundary is `sent`, NOT "left draft" as on change orders: an estimate has an
internal `review` state and the send transition runs from it, so freezing at
"left draft" would refuse the send itself for every PM-authored estimate.

RULED [Josh, S175] to carry BOTH mechanisms. The frozen set admits no exemption
for anyone, service role included — a blanket `auth.uid() IS NULL` escape would
relocate the hole rather than close it. The legitimate post-send writes are then
named one by one as transition arms, so the exemption the three service-role
writers need (client accept, client decline, unsubscribe) is bounded to the
writes they actually make. Arms alone would risk S164 again, where freezing a
stamp outright broke every client signature for two weeks; an exemption alone
would not be a freeze. Neither was sufficient.

Replaces a TypeScript `if` in estimates-client.ts:353 that never applied to
Owner or Admin, because `estimates_update_manager` carries `status = draft` only
on its project-manager arm.$c$;

COMMIT;
