-- ============================================================================
-- 7G SLICE 2 — entity ids, the last of the sync-status symmetry, and the QUEUE.
-- ============================================================================
--
-- Ruled [Josh, S148]. 7g1-spec.md §S — per client, per job, per invoice memo,
-- and the sync queue, which §S calls "the largest single item" and which had no
-- scaffolding at all.
--
-- ⚠️ SCHEMA ONLY. No OAuth route, no worker, no UI, nothing calls Intuit.
-- Everything here is inert exactly as 20260924000000's scaffolding was.
--
-- ----------------------------------------------------------------------------
-- ⚠️ TWO NAMING CONVENTIONS FOR QB WRITE GUARDS — AND WHICH ONE EACH NEW GUARD
--    FOLLOWS, because a sweep for the obvious one finds barely half of them
-- ----------------------------------------------------------------------------
--   `_column_scope`  a table that ALREADY had a column-scope guard for its own
--                    domain columns; the QB arm lives inside it.
--                      enforce_expenses_column_scope
--                      enforce_invoices_column_scope
--                      enforce_projects_column_scope          <- QB arm ADDED here
--                      enforce_time_clock_sessions_column_scope
--   `_qb_scope`      a table with NO pre-existing column-scope guard; a
--                    QB-only guard was created for it.
--                      enforce_client_payments_qb_scope
--                      enforce_client_refunds_qb_scope
--                      enforce_companies_qb_scope             (S148)
--                      enforce_contacts_qb_scope              <- NEW here
--
-- `contacts` had NO guard of any kind, so it takes the second convention.
-- `projects` already had one, so its QB column joins the existing function
-- rather than growing a second trigger on the same table.
--
-- At S148 a sweep for `enforce%column_scope` returned three of six and reported
-- the 7E pair as UNGUARDED. They are guarded. Anyone auditing "is every QB
-- column write-guarded?" must search for BOTH suffixes.
--
-- ----------------------------------------------------------------------------
-- ⚠️ EVERY FUNCTION BELOW IS THE LIVE BODY, READ FROM pg_get_functiondef()
-- ----------------------------------------------------------------------------
-- Postgres stores plpgsql as text. A hand-retyped body silently drops whatever
-- the author did not happen to copy, and S143 paid for that lesson twice on
-- these same functions. Each is reproduced verbatim with ONE added condition.
-- ============================================================================


-- ============================================================================
-- 1. Entity ids — per client, per job, and the invoice memo
-- ============================================================================

-- §S: per client, the QB Customer id.
ALTER TABLE public.contacts ADD COLUMN qb_customer_id text;

-- §S: per job, the QB sub-customer id. The naming convention is
-- `projects.project_number` (`PRJ-###`, verified live at S148: PRJ-100..PRJ-104)
-- plus the job name — both already exist, so no new SOURCE field is needed.
-- This column stores only what QuickBooks called the result.
ALTER TABLE public.projects ADD COLUMN qb_sub_customer_id text;

-- §S / #9: the memo text for void-reissue pairs. The id / status / synced trio
-- already shipped at 20260924000000; this is the one piece that did not.
ALTER TABLE public.invoices ADD COLUMN qb_void_memo text;


-- ============================================================================
-- 2. `qb_synced_at` on the remaining four synced objects [A9, Josh S148]
-- ============================================================================
--
-- Ruled for `client_payments`; extended to the other three here, and the
-- reasoning is the ruling's own: "the asymmetry is residue from two sessions
-- and this is the moment to remove it — same reasoning as S143's rename."
--
-- `qb_synced_at` answers ONE question — "when did this record last agree with
-- QuickBooks" — and that question is identical for all five synced objects.
-- Before this it existed on `invoices` alone. Adding it to `client_payments`
-- and stopping there would have replaced a 1-of-5 asymmetry with a 2-of-5 one,
-- which is the same defect with a better ratio. 20260924000000's own header put
-- it plainly: "Two names for one concept is exactly the residue this migration
-- exists to remove."
--
-- `time_clock_sessions` is included for the reason S143 included it at all
-- [B3]: payroll export is Module 6's rather than 7G's, and leaving the column
-- out means someone designs it a third way later.

ALTER TABLE public.client_payments     ADD COLUMN qb_synced_at timestamp with time zone;
ALTER TABLE public.client_refunds      ADD COLUMN qb_synced_at timestamp with time zone;
ALTER TABLE public.expenses            ADD COLUMN qb_synced_at timestamp with time zone;
ALTER TABLE public.time_clock_sessions ADD COLUMN qb_synced_at timestamp with time zone;


-- ============================================================================
-- 3. The guards — six functions, each the live body plus one condition
-- ============================================================================

-- ── contacts: NEW guard, `_qb_scope` convention (no pre-existing guard) ──────
CREATE OR REPLACE FUNCTION public.enforce_contacts_qb_scope()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text]) THEN
    RETURN NEW;
  END IF;
  IF NEW.qb_customer_id IS DISTINCT FROM OLD.qb_customer_id THEN
    RAISE EXCEPTION 'QuickBooks sync columns are written by the connector, not by hand.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

CREATE TRIGGER contacts_qb_scope
  BEFORE UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_contacts_qb_scope();

-- ── projects: existing guard, QB arm added ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_projects_column_scope()
RETURNS TRIGGER AS $$
BEGIN
  -- Service-role clients have no auth context; RLS already doesn't apply to
  -- them and this trigger must not break their writes.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text]) THEN
    RETURN NEW;
  END IF;

  -- contract_value is NOT listed here any more: it left this table entirely
  -- (RULING 2) and is now protected by RLS on project_financials, which covers
  -- reads as well as writes. The rest of the financial terms stay on the
  -- project row and stay frozen below Owner/Admin.
  IF NEW.retainage_percent IS DISTINCT FROM OLD.retainage_percent
     OR NEW.tax_rate IS DISTINCT FROM OLD.tax_rate
     OR NEW.source_estimate_id IS DISTINCT FROM OLD.source_estimate_id THEN
    RAISE EXCEPTION 'The financial terms of a project are Owner/Admin only.';
  END IF;

  -- [S149] Separate RAISE from the financial one: a connector column is not a
  -- financial term, and a message naming the wrong cause is worse than none.
  IF NEW.qb_sub_customer_id IS DISTINCT FROM OLD.qb_sub_customer_id THEN
    RAISE EXCEPTION 'QuickBooks sync columns are written by the connector, not by hand.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

-- ── invoices: existing QB arm, `qb_void_memo` added ─────────────────────────
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
     OR NEW.qb_synced_at IS DISTINCT FROM OLD.qb_synced_at
     OR NEW.qb_void_memo IS DISTINCT FROM OLD.qb_void_memo THEN   -- new [S149]
    RAISE EXCEPTION 'QuickBooks sync columns are written by the connector, not by hand.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

-- ── client_payments: `_qb_scope`, `qb_synced_at` added ──────────────────────
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
     OR NEW.qb_payment_id IS DISTINCT FROM OLD.qb_payment_id
     OR NEW.qb_synced_at IS DISTINCT FROM OLD.qb_synced_at THEN   -- new [S149]
    RAISE EXCEPTION 'QuickBooks sync columns are written by the connector, not by hand.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

-- ── client_refunds: `_qb_scope`, `qb_synced_at` added ───────────────────────
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
     OR NEW.qb_object_type IS DISTINCT FROM OLD.qb_object_type
     OR NEW.qb_synced_at IS DISTINCT FROM OLD.qb_synced_at THEN   -- new [S149]
    RAISE EXCEPTION 'QuickBooks sync columns are written by the connector, not by hand.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

-- ── expenses: existing guard, `qb_synced_at` added to the frozen list ───────
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
     OR NEW.qb_synced_at IS DISTINCT FROM OLD.qb_synced_at       -- new [S149]
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

-- ── time_clock_sessions: the S148 escape retained, `qb_synced_at` added ─────
-- ⚠️ THE `auth.uid() IS NULL` ESCAPE ON THE FIRST LINE IS #1-s143's FIX
-- (20260927000000). Without it 7G's service-role worker cannot write any QB
-- column on this table. Do not drop it while editing this body.
CREATE OR REPLACE FUNCTION public.enforce_time_clock_sessions_column_scope()
RETURNS TRIGGER AS $$
DECLARE
  v_me uuid := public.get_my_member_id();
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

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
     OR NEW.qb_synced_at IS DISTINCT FROM OLD.qb_synced_at               -- new [S149]
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


-- ============================================================================
-- 4. `qb_sync_queue` — durable, per-realm, dependency-ordered
-- ============================================================================
--
-- §7G.7 and §S. #8 rules that work CONTINUES while QuickBooks is unreachable,
-- which is what makes this first-class rather than an implementation detail.
--
-- ----------------------------------------------------------------------------
-- ⚠️ THE STATUS MODEL, AND THE ONE THING IT MUST NOT SAY
-- ----------------------------------------------------------------------------
--   queued           Awaiting a worker. THE RESTING STATE WHILE DISCONNECTED.
--   in_flight        Claimed by a worker; a crash leaves this stale, which is
--                    why `next_attempt_at` is the reclaim clock and not a lock.
--   pushed           QuickBooks accepted it. Terminal, and the ONLY value that
--                    means the books agree — matching 20260924000000's
--                    `qb_push_status = 'pushed'` exactly, deliberately.
--   failed_transient A retryable error (429, network, 5xx). Retries with
--                    backoff via `attempts` + `next_attempt_at`.
--   failed_terminal  QB will never accept this record as it stands. Needs a
--                    human. §7G.7's distinct terminal state.
--
-- ⚠️ `invalid_grant` IS NOT A FAILURE OF THE RECORD [Josh, S148]. When a
-- refresh fails, the connection goes `needs_reauth` and the queue KEEPS
-- QUEUEING. Rows stay `queued`. Nothing is marked `failed_transient` and
-- nothing is marked `failed_terminal` — the work is still valid, nothing is
-- wrong with the records, and it flows the moment they reconnect. Marking these
-- rows failed would turn a reconnect into a manual recovery, which is exactly
-- the failure this design avoids.
--
-- ⚠️ WHY THIS TABLE HAS BOTH A STATUS AND `is_deleted`, and which one wins:
-- STATUS is authoritative for processing. `is_deleted` exists only for a row
-- that should never have been queued at all (a record withdrawn upstream) and
-- is not a way to say "done" — `pushed` is. Two vocabularies for one concept is
-- the residue S143 existed to remove, so the distinction is stated rather than
-- left to be inferred.

CREATE TABLE public.qb_sync_queue (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES public.companies(id),

  -- Denormalised from `companies.qb_realm_id` ON PURPOSE. §S requires the queue
  -- be per-realmId, and a company that disconnects and reconnects to a
  -- DIFFERENT realm must not have its old queue silently retarget at the new
  -- books. The realm the work was queued for is a property of the work.
  realm_id          text,

  entity_type       text NOT NULL,
  entity_id         uuid NOT NULL,
  operation         text NOT NULL,

  -- Dependency ordering: a payment cannot be pushed before its invoice, and an
  -- invoice cannot be pushed before its customer. SET NULL rather than CASCADE
  -- — losing the ordering is recoverable, silently dropping queued work is not.
  depends_on_id     uuid REFERENCES public.qb_sync_queue(id) ON DELETE SET NULL,

  status            text NOT NULL DEFAULT 'queued',
  attempts          integer NOT NULL DEFAULT 0,
  next_attempt_at   timestamp with time zone,
  last_error        text,

  created_at        timestamp with time zone DEFAULT now(),
  updated_at        timestamp with time zone DEFAULT now(),
  created_by        uuid REFERENCES auth.users(id),
  updated_by        uuid REFERENCES auth.users(id),
  is_deleted        boolean DEFAULT false,
  deleted_at        timestamp with time zone,

  CONSTRAINT qb_sync_queue_status_check
    CHECK (status = ANY (ARRAY['queued'::text, 'in_flight'::text, 'pushed'::text,
                               'failed_transient'::text, 'failed_terminal'::text])),
  CONSTRAINT qb_sync_queue_entity_type_check
    CHECK (entity_type = ANY (ARRAY['customer'::text, 'sub_customer'::text, 'invoice'::text,
                                    'payment'::text, 'refund'::text, 'vendor'::text,
                                    'bill'::text, 'time_activity'::text])),
  CONSTRAINT qb_sync_queue_operation_check
    CHECK (operation = ANY (ARRAY['create'::text, 'update'::text, 'void'::text])),

  -- A row cannot depend on itself. Deeper cycles are the worker's problem; this
  -- catches the one that costs nothing to catch.
  CONSTRAINT qb_sync_queue_no_self_dependency_check
    CHECK (depends_on_id IS NULL OR depends_on_id <> id)
);

ALTER TABLE public.qb_sync_queue ALTER COLUMN company_id SET DEFAULT get_my_company_id();
ALTER TABLE public.qb_sync_queue ALTER COLUMN created_by SET DEFAULT auth.uid();
ALTER TABLE public.qb_sync_queue ALTER COLUMN updated_by SET DEFAULT auth.uid();

-- One LIVE queue entry per (entity, operation). Re-queueing the same update
-- twice would push it twice, and QB has no PUT — a second POST creates a second
-- object. Terminal states are excluded so a record CAN legitimately be
-- re-queued after it was pushed, or after a human clears a terminal failure.
CREATE UNIQUE INDEX idx_qb_sync_queue_one_live_per_entity_op
  ON public.qb_sync_queue (entity_type, entity_id, operation)
  WHERE status = ANY (ARRAY['queued'::text, 'in_flight'::text, 'failed_transient'::text])
    AND is_deleted = false;

-- The worker's claim query: "what is due for this tenant, oldest first".
CREATE INDEX idx_qb_sync_queue_claim
  ON public.qb_sync_queue (company_id, status, next_attempt_at)
  WHERE is_deleted = false;

CREATE INDEX idx_qb_sync_queue_realm ON public.qb_sync_queue (realm_id);
CREATE INDEX idx_qb_sync_queue_company_id ON public.qb_sync_queue (company_id);

ALTER TABLE public.qb_sync_queue ENABLE ROW LEVEL SECURITY;

-- ⚠️ SELECT ONLY, AND OWNER/ADMIN ONLY. There is deliberately NO INSERT, UPDATE
-- or DELETE policy: the queue is written exclusively by the service-role worker,
-- which bypasses RLS. A client-side INSERT would let a PM enqueue arbitrary
-- pushes to the company's books.
CREATE POLICY qb_sync_queue_select_owner_admin ON public.qb_sync_queue
  FOR SELECT USING (
    company_id = get_my_company_id()
    AND get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
  );

CREATE TRIGGER qb_sync_queue_updated_at
  BEFORE UPDATE ON public.qb_sync_queue
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE FUNCTION public.set_qb_sync_queue_updated_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER qb_sync_queue_set_updated_by
  BEFORE UPDATE ON public.qb_sync_queue
  FOR EACH ROW EXECUTE FUNCTION public.set_qb_sync_queue_updated_by();

COMMENT ON TABLE public.qb_sync_queue IS
  '7G §7G.7 [S149]. Durable per-realm sync queue. Written ONLY by the '
  'service-role worker — no client INSERT/UPDATE/DELETE policy exists. On '
  'invalid_grant rows stay `queued` and the connection goes needs_reauth; '
  'nothing is marked failed [Josh, S148].';

COMMENT ON COLUMN public.qb_sync_queue.realm_id IS
  'The realm the work was queued FOR. Denormalised so a disconnect-and-'
  'reconnect to a different realm cannot silently retarget an existing queue.';
