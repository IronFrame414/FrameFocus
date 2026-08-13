-- ============================================================================
-- QuickBooks scaffolding — ONE DESIGN, not two. Everything stays INERT.
-- ============================================================================
--
-- Ruled [Josh, S143] from the S142 survey. 7G IS NOT BEING BUILT. This
-- migration reconciles the placeholder columns that landed ahead of it so that
-- whoever does build 7G inherits one design instead of arbitrating between two.
--
-- ----------------------------------------------------------------------------
-- WHAT WAS WRONG: two incompatible designs for one integration
-- ----------------------------------------------------------------------------
--
--                   Design A (6A + 7A)          Design B (7E)
--   column          qb_export_status            qb_push_status
--   nullability     nullable, no default        NOT NULL DEFAULT 'not_pushed'
--   vocabulary      NONE — free text            CHECK of four values
--   remote id       none                        qb_payment_id / qb_refund_id
--   write-guarded   YES (column-scope trigger)  NO
--   intent recorded "stub" — one word           a full paragraph
--
-- Design B is a designed placeholder; Design A is a reserved word. B's shape
-- is adopted everywhere [B1, B2]. Note the two are not even the same age:
-- `time_clock_sessions.qb_export_status` was added by MODULE 6A on 2026-07-10
-- (20260710130000), predating Module 7 entirely.
--
-- ----------------------------------------------------------------------------
-- ⚠️ THE SEMANTICS, WRITTEN DOWN — this is the point of the migration
-- ----------------------------------------------------------------------------
-- The S142 survey's finding was that "there is no document anywhere saying what
-- qb_export_status = 'x' should mean." There is now, and it is here, because a
-- migration is what a future 7G reads.
--
--   not_pushed  The default and the resting state. This record has never been
--               offered to QuickBooks. NOT an error, NOT a queue entry.
--   queued      Accepted for sync and awaiting a worker. A record sits here
--               while QB is disconnected (7G #8: queue everything, sync on
--               reconnect) — so `queued` explicitly does NOT mean "in QB", and
--               nothing may treat it as though the money has landed.
--   pushed      QuickBooks has accepted it and `qb_*_id` holds the remote id.
--               THIS IS THE ONLY VALUE THAT MEANS THE BOOKS AGREE, and the only
--               one 7D §9's third void arm may key on.
--   failed      A TERMINAL failure — QB will never accept this record as it
--               stands (7G §7: a duplicate DisplayName, a malformed record).
--               Transient failures (429, network, expired token) stay `queued`
--               and retry. `failed` needs a human.
--
-- A row NEVER moves backwards out of `pushed` on its own. Correcting something
-- already in QuickBooks is a credit or a refund (7E §5), never a re-push.
--
-- ----------------------------------------------------------------------------
-- EVERYTHING HERE IS INERT AND MUST STAY THAT WAY
-- ----------------------------------------------------------------------------
-- Nothing reads or writes these columns today. Two TypeScript files narrow
-- their types and that is all. This migration adds no reader, no writer, no
-- trigger that sets a value, and no default other than the resting state.
-- ----------------------------------------------------------------------------


-- ============================================================================
-- 1. One vocabulary, one name [B1, B2]
-- ============================================================================
--
-- RENAME rather than keep two names. Two names for one concept is exactly the
-- residue this migration exists to remove, and nothing consumes either column,
-- so the cost is two trigger bodies and a types regeneration.

-- ⚠️ ORDER MATTERS AND THE FIRST ATTEMPT GOT IT WRONG. Postgres does not
-- rewrite plpgsql bodies on a rename, so the moment these columns are renamed
-- the 6A and 7A column-scope triggers reference a field that no longer exists.
-- The backfill UPDATEs below are themselves ordinary UPDATEs and FIRE THOSE
-- TRIGGERS — the first run of this migration died on exactly that:
--
--   ERROR: record "new" has no field "qb_export_status" (SQLSTATE 42703)
--   At statement: 3  UPDATE public.time_clock_sessions ...
--
-- and rolled back cleanly. It failed on `time_clock_sessions` and not on
-- `expenses` because `enforce_expenses_column_scope` opens with an
-- `auth.uid() IS NULL` escape and 6A's trigger does NOT — so a service-role
-- write walks straight into 6A's frozen-column check.
--
-- Hence: ALL DDL FIRST, then the trigger functions, then any data write.

ALTER TABLE public.expenses            RENAME COLUMN qb_export_status TO qb_push_status;
ALTER TABLE public.time_clock_sessions RENAME COLUMN qb_export_status TO qb_push_status;


-- ============================================================================
-- 2. A remote-id companion on every synced object [B3]
-- ============================================================================
--
-- Without one, an exported record has nowhere to store what QuickBooks called
-- it — and a sparse update or a reconciliation needs exactly that. QB's API
-- has no PUT/PATCH: an update is a POST carrying the entity's own id.
--
-- `invoices` is the striking omission. It is the PRIMARY export object and it
-- was skipped entirely while payments got both columns.

ALTER TABLE public.invoices
  ADD COLUMN qb_invoice_id text,
  ADD COLUMN qb_push_status text DEFAULT 'not_pushed'::text NOT NULL,
  ADD COLUMN qb_synced_at timestamp with time zone,
  ADD CONSTRAINT invoices_qb_push_status_check
    CHECK (qb_push_status = ANY (ARRAY['not_pushed'::text, 'queued'::text,
                                       'pushed'::text, 'failed'::text]));

-- Sub bill / commitment -> QB Bill (7C).
ALTER TABLE public.expenses ADD COLUMN qb_bill_id text;

-- Approved timesheet -> QB TimeActivity. INCLUDED even though payroll export
-- is Module 6 / payroll's rather than 7G's [B3]: the stub is already on this
-- table, and leaving it out means someone designs it a third way later.
ALTER TABLE public.time_clock_sessions ADD COLUMN qb_time_activity_id text;


-- ============================================================================
-- 3. Credit vs refund — the accounting question, decided once [B4]
-- ============================================================================
--
-- 7E §5 distinguishes two DIFFERENT QuickBooks objects for two different
-- things: a CreditMemo is a credit on the client's account; a RefundReceipt is
-- money actually sent back. `client_refunds` could record neither.
--
-- STORED, not derived from `source`/`method` at export time. Deriving would
-- re-decide an accounting question on every sync, and a rule that runs twice
-- can answer differently twice.
--
-- Nullable: a row that has never been offered to QB has not had the question
-- put to it yet. 7G decides at export and writes it once.

ALTER TABLE public.client_refunds
  ADD COLUMN qb_object_type text,
  ADD CONSTRAINT client_refunds_qb_object_type_check
    CHECK (qb_object_type IS NULL
           OR qb_object_type = ANY (ARRAY['credit_memo'::text, 'refund_receipt'::text]));


-- ============================================================================
-- 4. One write rule, everywhere [B1 — ruled: guard them all]
-- ============================================================================
--
-- Design A guarded its column inside the column-scope triggers; Design B
-- guarded nothing, so a PM could hand-write `qb_push_status = 'pushed'` on a
-- payment and assert that money had reached the accounting system. That is a
-- books-integrity hole, and closing it costs a sync worker nothing: a worker
-- runs service-role, where `auth.uid() IS NULL` short-circuits every one of
-- these triggers before the role is consulted.
--
-- The 6A and 7A triggers already guard this column and are only being renamed
-- through; the two 7E triggers and the new invoices arm are the real change.

CREATE OR REPLACE FUNCTION public.enforce_expenses_column_scope()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text]) THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.state IS DISTINCT FROM OLD.state
     OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
     OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
     OR NEW.rejected_by IS DISTINCT FROM OLD.rejected_by
     OR NEW.rejected_at IS DISTINCT FROM OLD.rejected_at
     OR NEW.rejection_note IS DISTINCT FROM OLD.rejection_note
     OR NEW.qb_push_status IS DISTINCT FROM OLD.qb_push_status   -- renamed [S143]
     OR NEW.qb_bill_id IS DISTINCT FROM OLD.qb_bill_id           -- new [S143]
     OR NEW.author_member_id IS DISTINCT FROM OLD.author_member_id
     OR NEW.source_segment_id IS DISTINCT FROM OLD.source_segment_id
     OR NEW.company_id IS DISTINCT FROM OLD.company_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'Review and system columns are not editable for your role.';
  END IF;

  IF NEW.cost_category IS DISTINCT FROM OLD.cost_category
     AND NEW.cost_category = 'subcontractor' THEN
    RAISE EXCEPTION 'The subcontractor category is set only by 7C bill writers.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

-- `invoices` had NO QB arm because it had no QB columns. It has both now.
CREATE OR REPLACE FUNCTION public.enforce_invoices_column_scope()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text]) THEN
    RETURN NEW;
  END IF;

  IF NEW.approved_by IS DISTINCT FROM OLD.approved_by
     OR NEW.approved_at IS DISTINCT FROM OLD.approved_at THEN
    RAISE EXCEPTION 'Approving an invoice is Owner/Admin only (7D §12).';
  END IF;

  IF NEW.qb_push_status IS DISTINCT FROM OLD.qb_push_status
     OR NEW.qb_invoice_id IS DISTINCT FROM OLD.qb_invoice_id
     OR NEW.qb_synced_at IS DISTINCT FROM OLD.qb_synced_at THEN
    RAISE EXCEPTION 'QuickBooks sync columns are written by the connector, not by hand.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

-- ⚠️ 6A's trigger MUST be recreated, not just left alone. Postgres does not
-- rewrite function bodies on a column rename — `enforce_time_clock_sessions_
-- column_scope` still says `qb_export_status` and would raise
-- "record NEW has no field" on the next non-Owner session edit, breaking
-- Module 6A's clock-out for crew. The body below is the LIVE definition read
-- at S143, with only the column name changed and the new id column added.
CREATE OR REPLACE FUNCTION public.enforce_time_clock_sessions_column_scope()
RETURNS TRIGGER AS $$
DECLARE
  v_me uuid := public.get_my_member_id();
BEGIN
  IF public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text]) THEN
    RETURN NEW;
  END IF;

  -- Frozen for every non-Owner/Admin editor.
  IF NEW.member_id     IS DISTINCT FROM OLD.member_id
     OR NEW.company_id IS DISTINCT FROM OLD.company_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.gps_in     IS DISTINCT FROM OLD.gps_in
     OR NEW.qb_push_status IS DISTINCT FROM OLD.qb_push_status          -- renamed [S143]
     OR NEW.qb_time_activity_id IS DISTINCT FROM OLD.qb_time_activity_id -- new [S143]
     THEN
    RAISE EXCEPTION 'Session system columns are not editable for your role.';
  END IF;

  IF OLD.member_id IS NOT DISTINCT FROM v_me THEN
    -- Self: live clock-out + the clock-in undo path only.
    IF NEW.clock_in IS DISTINCT FROM OLD.clock_in
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
       OR NEW.approved_at IS DISTINCT FROM OLD.approved_at THEN
      RAISE EXCEPTION 'Clock-in time and approval state are not editable on your own session.';
    END IF;
    IF NEW.clock_out IS DISTINCT FROM OLD.clock_out
       AND OLD.clock_out IS NOT NULL THEN
      RAISE EXCEPTION 'Clock times on a closed session are not editable. Ask an Owner/Admin.';
    END IF;
    RETURN NEW;
  END IF;

  IF public.can_approve_member(OLD.member_id) THEN
    -- Supervisor: clock correction + the approval columns only.
    IF NEW.gps_out IS DISTINCT FROM OLD.gps_out
       OR NEW.is_deleted IS DISTINCT FROM OLD.is_deleted
       OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
      RAISE EXCEPTION 'Supervisors may correct clock times and approve only; deletion is Owner/Admin.';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'You are not authorized to edit this session.';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- The two 7E tables guarded nothing. Their existing bodies are preserved and a
-- QB arm is appended — read from the live definitions at S143, not rewritten
-- from the migration that created them.
CREATE OR REPLACE FUNCTION public.enforce_client_payments_qb_scope()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text]) THEN
    RETURN NEW;
  END IF;
  IF NEW.qb_push_status IS DISTINCT FROM OLD.qb_push_status
     OR NEW.qb_payment_id IS DISTINCT FROM OLD.qb_payment_id THEN
    RAISE EXCEPTION 'QuickBooks sync columns are written by the connector, not by hand.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

CREATE TRIGGER client_payments_qb_scope
  BEFORE UPDATE ON public.client_payments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_client_payments_qb_scope();

CREATE OR REPLACE FUNCTION public.enforce_client_refunds_qb_scope()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text]) THEN
    RETURN NEW;
  END IF;
  IF NEW.qb_push_status IS DISTINCT FROM OLD.qb_push_status
     OR NEW.qb_refund_id IS DISTINCT FROM OLD.qb_refund_id
     OR NEW.qb_object_type IS DISTINCT FROM OLD.qb_object_type THEN
    RAISE EXCEPTION 'QuickBooks sync columns are written by the connector, not by hand.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

CREATE TRIGGER client_refunds_qb_scope
  BEFORE UPDATE ON public.client_refunds
  FOR EACH ROW EXECUTE FUNCTION public.enforce_client_refunds_qb_scope();


-- ============================================================================
-- 5. Out of scope, deliberately [B5]
-- ============================================================================
-- `companies.gl_account_{labor,material,subcontractor,other}` are NOT touched.
-- They are cost-side account MAPPING, not per-record sync state — a different
-- concern that already has a settings UI and a live writer.

COMMENT ON COLUMN public.invoices.qb_push_status IS
  'QuickBooks sync state [S143]. not_pushed (resting, never offered) | queued '
  '(accepted, awaiting a worker — NOT in QB) | pushed (QB accepted it; '
  'qb_invoice_id holds the id — the ONLY value meaning the books agree) | '
  'failed (terminal; needs a human). INERT until 7G ships.';


-- ============================================================================
-- 6. Backfill and constrain — LAST, once every trigger body is current
-- ============================================================================
--
-- Design A's columns were nullable with no default. Every existing row is NULL
-- (36 expenses, 15 sessions on rebuild-test) and NULL means exactly what
-- 'not_pushed' means, so backfill and then constrain. These are the statements
-- that fire the column-scope triggers, which is why they sit below the
-- function definitions rather than beside the rename.

UPDATE public.expenses SET qb_push_status = 'not_pushed' WHERE qb_push_status IS NULL;

-- ⚠️ A SECOND ORDERING TRAP, AND A LATENT 6A ASYMMETRY WORTH RECORDING.
-- With the body fixed, the backfill on `time_clock_sessions` still failed:
--
--   ERROR: Session system columns are not editable for your role. (P0001)
--
-- `enforce_time_clock_sessions_column_scope` is the ONLY column-scope trigger
-- in this repo with no `auth.uid() IS NULL` escape — expenses, invoices and
-- both 7E tables all open with one. So a service-role or system write to a
-- time session is refused outright, which is why 6A's is the one that blocked
-- a migration and 7A's is not.
--
-- NOT "FIXED" HERE, deliberately. Adding the escape would change a shipped
-- Module 6A guard that nobody asked to change, in a migration about
-- QuickBooks columns. It is recorded as TECH_DEBT #1-s143 instead. The
-- backfill suspends the trigger for its own two statements only — inside this
-- transaction, restored before the migration commits.

ALTER TABLE public.time_clock_sessions DISABLE TRIGGER time_clock_sessions_column_scope;
UPDATE public.time_clock_sessions SET qb_push_status = 'not_pushed' WHERE qb_push_status IS NULL;
ALTER TABLE public.time_clock_sessions ENABLE TRIGGER time_clock_sessions_column_scope;

ALTER TABLE public.expenses
  ALTER COLUMN qb_push_status SET DEFAULT 'not_pushed'::text,
  ALTER COLUMN qb_push_status SET NOT NULL;
ALTER TABLE public.time_clock_sessions
  ALTER COLUMN qb_push_status SET DEFAULT 'not_pushed'::text,
  ALTER COLUMN qb_push_status SET NOT NULL;

ALTER TABLE public.expenses ADD CONSTRAINT expenses_qb_push_status_check
  CHECK (qb_push_status = ANY (ARRAY['not_pushed'::text, 'queued'::text,
                                     'pushed'::text, 'failed'::text]));
ALTER TABLE public.time_clock_sessions ADD CONSTRAINT time_clock_sessions_qb_push_status_check
  CHECK (qb_push_status = ANY (ARRAY['not_pushed'::text, 'queued'::text,
                                     'pushed'::text, 'failed'::text]));
