-- ============================================================================
-- 🔴 A CHANGE ORDER SENT IN ERROR IS PERMANENT. THREE PATHS OUT. [S168]
-- ============================================================================
--
-- Closes `#1-s167fx`. Raised S167 after the S165 click-test signed a fixture CO
-- by accident and NOTHING could put it back — not a revert, not a delete.
-- Confirmed against a live row with the service-role key before this was
-- written (service role bypasses RLS, not triggers, and not foreign keys):
--
--   UPDATE  status/signed_at/net_delta  -> refused, correctly, by
--           `enforce_change_order_immutability()`. Those refusals are the S164
--           signature fix and the S123-era money freeze doing their jobs.
--   DELETE  the parent                  -> refused: `change_order_line_items_
--           change_order_id_fkey` has NO `ON DELETE CASCADE`.
--   DELETE  the line first              -> refused: `enforce_co_line_parent_
--           open()` freezes lines with their parent.
--
-- ⚠️ AND THE ESCAPE HATCH WAS IMAGINARY. `enforce_co_line_parent_open()`
-- returns early when the parent row is already gone, and says why in its own
-- comment: *"The parent is already gone (CASCADE delete) — nothing to protect,
-- and blocking here would make a change order undeletable."* **That branch was
-- unreachable, because the CASCADE it presumes does not exist.** The comment
-- described the exact defect it was written to prevent. §4 below makes it true.
--
-- ----------------------------------------------------------------------------
-- WHAT JOSH RULED [S168], AND THE BOUNDARY THAT IS THE WHOLE POINT
-- ----------------------------------------------------------------------------
--
--   VOID     any sent CO, signed or unsigned. **A REASON IS REQUIRED IN EVERY
--            CASE** — Josh ruled explicitly against distinguishing signed from
--            unsigned: *"user should give reason for void."* One path, one
--            requirement. The signed artifact is RETAINED (`signed-artifact-
--            spec.md`): a document the client actually saw is never destroyed.
--            Voiding retires it; it does not erase it.
--
--   REISSUE  the path the trigger already advertises. `enforce_change_order_
--            immutability()` says *"void and reissue instead"* — §3 makes that
--            sentence true, following `contract_documents.supersedes_document_id`
--            (7I §10.4) rather than inventing a second shape.
--
--   DELETE   **UNSIGNED ONLY.** Josh ruled option (a) of three and rejected
--            deleting signed COs and deleting artifacts. The reasoning, recorded
--            so a later session does not "complete" the feature: **a change
--            order is a legal document, and being able to prove you never sent
--            one is a claim the system must not be able to make falsely.**
--
-- ⚠️ TWO JUDGEMENT CALLS THIS MIGRATION MAKES, FLAGGED BECAUSE THE RULING DID
--    NOT REACH THEM. Overturn either without ceremony.
--
--   (i)  **WHO may delete: Owner/Admin, not PM.** The ruling names the
--        signed/unsigned boundary and is silent on authority. Void stays
--        owner/admin/author-PM (the shipped route's rule, matched to the #117
--        read floor); DELETE is narrower because it is destructive and
--        unrecoverable, and conservative is the right default when unspecified.
--   (ii) **WHICH unsigned states: draft, sent, AND voided-unsigned.** The
--        ruling names "unsigned + sent". The boundary it draws is the
--        SIGNATURE, so the predicate is the signature and nothing else — a
--        draft was never sent to anybody, and a CO voided without ever being
--        signed is still a CO nobody signed. `signed_at IS NULL AND status <>
--        'signed'`, in one place, in the database.
--
-- ----------------------------------------------------------------------------
-- WHY EVERY GATE HERE IS IN THE DATABASE
-- ----------------------------------------------------------------------------
-- `enforce_invoice_void_authority` (`20260923000000`) is the precedent and its
-- header is the argument: a service-layer-only gate closes the screen and
-- leaves the API open, which is how `#117`, the five S97 financial-floor
-- failures and the S140 compliance finding all happened. `#1-s146` is what a
-- service-layer void looks like when it fails open — a PM told a legal document
-- had been voided over a contract that was still live.
--
-- **One gate here goes further than the precedent and applies to the service
-- role too**: §5's BEFORE DELETE boundary. `enforce_invoice_void_authority`
-- returns early on `auth.uid() IS NULL` because void authority is a role
-- decision and a background job has no role. The signed/unsigned delete
-- boundary is NOT a role decision — it is a claim about the record — so it
-- holds for every caller, including a migration and including this repo's own
-- seed script.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. The void record — `void_reason` / `voided_by` / `voided_at`
--    Shape-checked BOTH ways, the `invoices_void_shape_check` /
--    `contract_documents_void_shape_check` precedent: a voided row cannot lack
--    its reason and a live row cannot carry one.
-- ----------------------------------------------------------------------------

ALTER TABLE public.change_orders ADD COLUMN void_reason text;
ALTER TABLE public.change_orders ADD COLUMN voided_by uuid;
ALTER TABLE public.change_orders ADD COLUMN voided_at timestamp with time zone;

ALTER TABLE ONLY public.change_orders
  ADD CONSTRAINT change_orders_voided_by_fkey
  FOREIGN KEY (voided_by) REFERENCES auth.users(id);

-- Backfill FIRST — a CO voided before this migration has no reason, and the
-- constraint below would refuse the table. The sentinel is deliberately not a
-- plausible reason: it says the record is absent, rather than inventing one.
--
-- ⚠️ THE TWO AUDIT TRIGGERS ARE SUSPENDED FOR THIS STATEMENT ONLY.
-- `change_orders_set_updated_by` sets `updated_by = auth.uid()`, which is NULL
-- in a migration — so a backfill would silently erase the last real editor of
-- every historically-voided CO, and `updated_at` would record this migration
-- rather than the edit. Neither is a change this migration is entitled to make.
-- `change_orders_immutability` stays ENABLED: nothing here touches a frozen
-- column, and it passing is evidence rather than an obstacle.
ALTER TABLE public.change_orders DISABLE TRIGGER change_orders_set_updated_by;
ALTER TABLE public.change_orders DISABLE TRIGGER change_orders_updated_at;

UPDATE public.change_orders
   SET void_reason = 'Voided before a reason was required. No reason was recorded (pre-S168).',
       voided_at   = COALESCE(updated_at, created_at, now()),
       voided_by   = COALESCE(updated_by, created_by)
 WHERE status = 'voided'
   AND voided_at IS NULL;

ALTER TABLE public.change_orders ENABLE TRIGGER change_orders_set_updated_by;
ALTER TABLE public.change_orders ENABLE TRIGGER change_orders_updated_at;

-- `voided_by` is NOT in the shape check. It is NULLABLE on purpose and the two
-- reasons are different: a pre-S168 row may have had no `updated_by`/`created_by`
-- to inherit, and a service-role void has no `auth.uid()` to record. The REASON
-- is what Josh ruled must always exist, and that is what is checked.
ALTER TABLE public.change_orders
  ADD CONSTRAINT change_orders_void_shape_check
  CHECK (
    (status = 'voided' AND void_reason IS NOT NULL AND btrim(void_reason) <> ''
                       AND voided_at IS NOT NULL)
    OR
    (status <> 'voided' AND void_reason IS NULL AND voided_by IS NULL
                        AND voided_at IS NULL)
  );


-- ----------------------------------------------------------------------------
-- 2. Void authority, and the reason, enforced BEFORE the constraint can produce
--    an unreadable error.
--
--    WHO: owner, admin, or the project_manager who AUTHORED it. That is not a
--    new rule — it is `change_orders_select_visible` as the S121 read floor
--    (`20260830000000`) left it, restated for the write. A PM who cannot SELECT
--    a change order has no business voiding one, and a PM who authored it must
--    be able to withdraw it.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_change_order_void_authority()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  -- Only a transition INTO voided is this function's business.
  IF NEW.status IS DISTINCT FROM 'voided' OR OLD.status = 'voided' THEN
    RETURN NEW;
  END IF;

  -- The reason, first, so the message names the actual problem rather than
  -- `change_orders_void_shape_check`.
  IF NEW.void_reason IS NULL OR btrim(NEW.void_reason) = '' THEN
    RAISE EXCEPTION 'A change order cannot be voided without a reason.';
  END IF;

  -- Stamp the record rather than trusting the payload. A caller that supplies
  -- somebody else''s id is not making a claim this table has to believe.
  IF auth.uid() IS NOT NULL THEN
    NEW.voided_by := auth.uid();
  END IF;
  NEW.voided_at := COALESCE(NEW.voided_at, now());

  -- Service-role clients carry no auth context and RLS does not apply to them;
  -- authority is a role decision and a background job has no role. The
  -- `enforce_invoice_void_authority` precedent, deliberately followed.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text]) THEN
    RETURN NEW;
  END IF;

  IF public.get_my_role() = 'project_manager'::text AND OLD.created_by = auth.uid() THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'Only Owner, Admin, or the Project Manager who wrote it can void a change order.';
END;
$$;

CREATE TRIGGER change_orders_void_authority
  BEFORE UPDATE ON public.change_orders
  FOR EACH ROW EXECUTE FUNCTION public.enforce_change_order_void_authority();

COMMENT ON FUNCTION public.enforce_change_order_void_authority() IS
  'S168 / #1-s167fx. A reason is REQUIRED on every void, signed or unsigned '
  '[Josh, S168]. Stamps voided_by from auth.uid() rather than the payload. '
  'Authority mirrors the S121 read floor: owner/admin, or the authoring PM. '
  'Guarded by apps/web/test/s168-co-lifecycle.live.ts.';


-- ----------------------------------------------------------------------------
-- 3. REISSUE — `supersedes_change_order_id`
--
--    `enforce_change_order_immutability()` has told users "void and reissue
--    instead" since 20260809000000 and there was no reissue. This is the link,
--    shaped after `contract_documents.supersedes_document_id` (7I §10.4).
--
--    The COPY is the service's job (`/api/change-orders/[id]/reissue`); what
--    belongs here is what must be true of the link no matter who writes it.
-- ----------------------------------------------------------------------------

ALTER TABLE public.change_orders ADD COLUMN supersedes_change_order_id uuid;

ALTER TABLE ONLY public.change_orders
  ADD CONSTRAINT change_orders_supersedes_fkey
  FOREIGN KEY (supersedes_change_order_id) REFERENCES public.change_orders(id);

CREATE INDEX idx_change_orders_supersedes
  ON public.change_orders USING btree (supersedes_change_order_id)
  WHERE supersedes_change_order_id IS NOT NULL;

-- A voided CO is superseded by AT MOST ONE reissue. Without this, "reissue"
-- clicked twice produces two live drafts for one withdrawal and the revised
-- contract value double-counts the moment both are signed.
CREATE UNIQUE INDEX change_orders_supersedes_once
  ON public.change_orders (supersedes_change_order_id)
  WHERE supersedes_change_order_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.enforce_change_order_supersedes_valid()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_status     text;
  v_project    uuid;
  v_company    uuid;
BEGIN
  IF NEW.supersedes_change_order_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.supersedes_change_order_id = NEW.id THEN
    RAISE EXCEPTION 'A change order cannot supersede itself.';
  END IF;

  SELECT status, project_id, company_id
    INTO v_status, v_project, v_company
    FROM change_orders
   WHERE id = NEW.supersedes_change_order_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'The superseded change order does not exist.';
  END IF;

  -- Same tenant and same job. A reissue that lands on another project is a
  -- silent misfiling of a money document, not an error anybody would notice.
  IF v_company IS DISTINCT FROM NEW.company_id OR v_project IS DISTINCT FROM NEW.project_id THEN
    RAISE EXCEPTION 'A reissue must belong to the same company and project as the change order it replaces.';
  END IF;

  -- Only a WITHDRAWN change order is replaced. Superseding a live one would
  -- leave two COs claiming the same scope with nothing marking either dead.
  IF v_status <> 'voided' THEN
    RAISE EXCEPTION 'Only a voided change order can be reissued (it is currently %).', v_status;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER change_orders_supersedes_valid
  BEFORE INSERT OR UPDATE ON public.change_orders
  FOR EACH ROW EXECUTE FUNCTION public.enforce_change_order_supersedes_valid();

COMMENT ON FUNCTION public.enforce_change_order_supersedes_valid() IS
  'S168. A reissue points at a VOIDED change order on the same project in the '
  'same company, never at itself, and each voided CO is superseded at most once '
  '(change_orders_supersedes_once). Makes the immutability trigger''s own advice '
  '— "void and reissue instead" — a real path.';


-- ----------------------------------------------------------------------------
-- 4. THE DEADLOCK, FIXED WITH THE CASCADE THE COMMENT ALREADY ASSUMED
--
--    ⚠️ CASCADE, NOT AN ORDERED DELETE, AND THE REASON IS NOT CONVENIENCE.
--
--    An ordered delete (rows -> items -> parent) through PostgREST is THREE
--    round trips with no transaction: a failure at step two leaves a change
--    order with half its lines, which is worse than the row being undeletable.
--    Worse, it does not even work — `enforce_co_line_parent_open()` refuses a
--    line DELETE while the parent is not a draft, so an ordered delete would
--    ALSO require relaxing that trigger. CASCADE requires relaxing nothing:
--    the parent row is already gone when the referential action fires the
--    child trigger, so its `IF v_status IS NULL THEN RETURN` branch — written
--    for exactly this and never before reachable — takes over.
--
--    THE THREE FKs LEFT ALONE ARE THE INTERESTING PART. `invoice_lines
--    .source_change_order_id` and `project_budget_items.source_change_order_id`
--    keep NO ACTION **deliberately**: a change order that has been billed or
--    budgeted must not be deletable, and the FK refusing is the guard. The
--    route turns that refusal into a sentence a human can act on rather than
--    a Postgres error code.
-- ----------------------------------------------------------------------------

-- The CO's own children. They have no meaning without it.
ALTER TABLE public.change_order_line_items
  DROP CONSTRAINT change_order_line_items_change_order_id_fkey;
ALTER TABLE ONLY public.change_order_line_items
  ADD CONSTRAINT change_order_line_items_change_order_id_fkey
  FOREIGN KEY (change_order_id) REFERENCES public.change_orders(id) ON DELETE CASCADE;

ALTER TABLE public.change_order_line_rows
  DROP CONSTRAINT change_order_line_rows_line_item_id_fkey;
ALTER TABLE ONLY public.change_order_line_rows
  ADD CONSTRAINT change_order_line_rows_line_item_id_fkey
  FOREIGN KEY (line_item_id) REFERENCES public.change_order_line_items(id) ON DELETE CASCADE;

-- A signing ceremony for a change order that no longer exists is not a record
-- of anything. (Only UNSIGNED COs are deletable, so no completed client
-- signature is ever reached by this.)
ALTER TABLE public.co_signing_sessions
  DROP CONSTRAINT co_signing_sessions_change_order_id_fkey;
ALTER TABLE ONLY public.co_signing_sessions
  ADD CONSTRAINT co_signing_sessions_change_order_id_fkey
  FOREIGN KEY (change_order_id) REFERENCES public.change_orders(id) ON DELETE CASCADE;

-- `instrument_rates` CASCADEs rather than SET NULL, and it is forced:
-- `instrument_rates_one_instrument` is `(estimate_id IS NOT NULL) <>
-- (change_order_id IS NOT NULL)`, so nulling the column violates the row. The
-- rates were recorded FOR this change order; NO ACTION would simply restore the
-- undeletable bug for any CO that reached send.
ALTER TABLE public.instrument_rates
  DROP CONSTRAINT instrument_rates_change_order_id_fkey;
ALTER TABLE ONLY public.instrument_rates
  ADD CONSTRAINT instrument_rates_change_order_id_fkey
  FOREIGN KEY (change_order_id) REFERENCES public.change_orders(id) ON DELETE CASCADE;

-- A task outlives the change order that spawned it — the work is real whether
-- or not the paperwork survives. `tasks.change_order_id` is nullable, so SET
-- NULL is available here and CASCADE would delete field work.
ALTER TABLE public.tasks
  DROP CONSTRAINT tasks_change_order_id_fkey;
ALTER TABLE ONLY public.tasks
  ADD CONSTRAINT tasks_change_order_id_fkey
  FOREIGN KEY (change_order_id) REFERENCES public.change_orders(id) ON DELETE SET NULL;

-- `email_logs.change_order_id` and `.co_signing_session_id` already carry
-- ON DELETE SET NULL (20260710120000) — the delivery record survives, which is
-- correct, and nothing is changed here.


-- ----------------------------------------------------------------------------
-- 5. THE BOUNDARY: UNSIGNED ONLY, AND IT BINDS EVERY CALLER
--
--    Two layers doing two different jobs, on purpose:
--
--      RLS policy  — WHO. Owner/Admin, inside the tenant. RLS does not apply
--                    to the service role, and should not: a background job is
--                    not a role.
--      BEFORE DELETE trigger — WHAT. A signed change order is not deletable BY
--                    ANYONE, service role and migrations included. This is the
--                    half that must not have an escape hatch, because the claim
--                    it protects is *"we never sent that"* and an escape hatch
--                    is precisely how such a claim gets made falsely.
-- ----------------------------------------------------------------------------

CREATE POLICY change_orders_delete_unsigned ON public.change_orders
  FOR DELETE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
    AND signed_at IS NULL
    AND status <> 'signed'
  );

CREATE OR REPLACE FUNCTION public.enforce_change_order_delete_boundary()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.signed_at IS NOT NULL OR OLD.status = 'signed' THEN
    RAISE EXCEPTION
      'A signed change order cannot be deleted. Void it instead — the signed copy is kept.';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER change_orders_delete_boundary
  BEFORE DELETE ON public.change_orders
  FOR EACH ROW EXECUTE FUNCTION public.enforce_change_order_delete_boundary();

COMMENT ON FUNCTION public.enforce_change_order_delete_boundary() IS
  'S168 / #1-s167fx [Josh]. UNSIGNED change orders only. Deliberately has NO '
  'service-role escape: "a change order is a legal document, and being able to '
  'prove you never sent one is a claim the system must not be able to make '
  'falsely." WHO may delete is the RLS policy change_orders_delete_unsigned; '
  'this is WHAT may be deleted, and it binds every caller.';


-- ----------------------------------------------------------------------------
-- 6. The immutability trigger, amended — the void record is a record
--
--    Everything added above is worthless if it can be rewritten afterwards. A
--    void reason that can be edited is not a reason, it is a note. Same
--    sentence the S164 signature fix used, applied to the same shape:
--      NULL -> value, as part of becoming voided  : allowed, that IS the void
--      value -> anything else                     : refused, that is a rewrite
-- ----------------------------------------------------------------------------

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

  -- The CLIENT's stamp. ⚠️ SEE 20261022000000 — the first write of this column
  -- IS the signature, and forbidding it broke the signing flow outright.
  IF OLD.signed_at IS NOT NULL AND NEW.signed_at IS DISTINCT FROM OLD.signed_at THEN
    RAISE EXCEPTION 'A signature stamp cannot be rewritten.';
  END IF;
  IF OLD.signed_at IS NULL AND NEW.signed_at IS NOT NULL AND NEW.status <> 'signed' THEN
    RAISE EXCEPTION 'A change order cannot carry a signature date without being signed.';
  END IF;

  -- ⚠️ [S168] THE VOID RECORD, once written, is as frozen as the signature.
  IF OLD.voided_at IS NOT NULL
     AND (NEW.void_reason IS DISTINCT FROM OLD.void_reason
          OR NEW.voided_by IS DISTINCT FROM OLD.voided_by
          OR NEW.voided_at IS DISTINCT FROM OLD.voided_at) THEN
    RAISE EXCEPTION 'A void record cannot be rewritten.';
  END IF;

  -- ⚠️ [S168] And what a change order supersedes is settled before it is sent.
  IF NEW.supersedes_change_order_id IS DISTINCT FROM OLD.supersedes_change_order_id THEN
    RAISE EXCEPTION 'A sent change order is immutable — void and reissue instead.';
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
  'AMENDED [S164]: the FIRST signature stamp is allowed on the transition into '
  '`signed` — the original froze it outright and broke every client signature '
  'from 2026-08-09. AMENDED [S168]: the void record (void_reason/voided_by/'
  'voided_at) and supersedes_change_order_id are frozen the same way, so the '
  'reason Josh required cannot be edited after the fact.';
