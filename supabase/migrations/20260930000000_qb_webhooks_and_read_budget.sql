-- ============================================================================
-- 7G SLICE 3 — webhook idempotency, and the read-budget COUNTER.
-- ============================================================================
--
-- Ruled [Josh, S148]. 7g1-spec.md §S final two bullets. Schema only: no OAuth
-- route, no worker, no UI, nothing calls Intuit.
--
-- ⚠️ GUARD CONVENTION: neither table below takes a column-scope guard, because
-- neither has ANY client write policy at all — the service-role worker is the
-- only writer. A guard exists to stop a signed-in user writing a column they
-- can otherwise reach; here they cannot reach the table. (The two conventions,
-- `_column_scope` and `_qb_scope`, are documented in 20260929000000's header;
-- a sweep for the first finds barely half of them.)
-- ============================================================================


-- ============================================================================
-- 1. `qb_webhook_events` — the idempotency store
-- ============================================================================
--
-- ⚠️ WHAT A QUICKBOOKS WEBHOOK ACTUALLY CONTAINS, because it determines what
-- this table is for. Intuit sends a REFERENCE PAYLOAD ONLY — entity name, id,
-- operation, last-updated. It does NOT carry the changed record. Acting on one
-- therefore requires a FOLLOW-UP READ, and that read is a CorePlus call that
-- COUNTS AGAINST THE QUOTA (§7G.3a).
--
-- So this store does not merely prevent a duplicate write. IT PREVENTS A PAID
-- READ. Processing the same event twice costs quota against a Workspace-wide
-- ceiling shared by every customer, and on the Builder tier exhausting that
-- ceiling BLOCKS rather than throttles. Deduping is a cost control, not tidiness.
--
-- APPEND-ONLY LOG (CLAUDE.md's exception): rows are written once on receipt and
-- never updated or deleted, so `updated_at`, `created_by`, `updated_by`,
-- `is_deleted` and `deleted_at` are deliberately absent. Whether the follow-up
-- work SUCCEEDED is `qb_sync_queue`'s business, not this table's — one fact per
-- table, so neither can disagree with the other.

CREATE TABLE public.qb_webhook_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Nullable ON PURPOSE. A webhook arrives keyed on realmId, and the realm may
  -- not resolve to a company we know — a stale grant, or a tenant that
  -- disconnected. Recording the event anyway is what makes THAT diagnosable
  -- instead of invisible; a NOT NULL here would force us to drop it on the floor.
  company_id      uuid REFERENCES public.companies(id),
  realm_id        text NOT NULL,

  -- ⚠️ INTUIT'S OWN EVENT ID. This is the idempotency key and the reason the
  -- table exists; a locally generated id would dedupe nothing.
  intuit_event_id text NOT NULL,

  entity_name     text NOT NULL,
  entity_id       text NOT NULL,
  operation       text NOT NULL,
  -- Intuit's `lastUpdated` from the payload, not our clock. Two events for one
  -- entity are ordered by what QuickBooks says, not by when we happened to
  -- receive them.
  entity_last_updated timestamp with time zone,

  received_at     timestamp with time zone DEFAULT now(),
  created_at      timestamp with time zone DEFAULT now()
);

-- THE IDEMPOTENCY GUARANTEE. Unique on Intuit's id alone rather than on
-- (realm, id): the event id is Intuit-global, and scoping it per realm would
-- let the same event be processed once per realm if a payload ever spanned them.
CREATE UNIQUE INDEX idx_qb_webhook_events_intuit_event_id
  ON public.qb_webhook_events (intuit_event_id);

CREATE INDEX idx_qb_webhook_events_company_id ON public.qb_webhook_events (company_id);
CREATE INDEX idx_qb_webhook_events_realm ON public.qb_webhook_events (realm_id, received_at);

ALTER TABLE public.qb_webhook_events ENABLE ROW LEVEL SECURITY;

-- SELECT only, Owner/Admin. No INSERT policy: the webhook endpoint runs
-- service-role. A client-side INSERT would let a user forge a QuickBooks event.
CREATE POLICY qb_webhook_events_select_owner_admin ON public.qb_webhook_events
  FOR SELECT USING (
    company_id = get_my_company_id()
    AND get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
  );

COMMENT ON TABLE public.qb_webhook_events IS
  '7G §S [S149]. Idempotency store keyed on INTUIT''s event id. A QB webhook '
  'carries a reference payload only, so acting on one needs a follow-up read '
  'that is METERED against the Workspace-wide CorePlus quota — this table '
  'protects a PAID read, not just a duplicate write. Append-only.';


-- ============================================================================
-- 2. `qb_read_budget` — the counter, and ONLY the counter
-- ============================================================================
--
-- ⚠️ WHY THE COUNTER SHIPS NOW AND THE ALERT DOES NOT [Josh, S148]. Recorded so
-- nobody trims it as unused scaffolding:
--
--   Deferring the ALERT is cheap — it can be added any time from data already
--   on disk. Deferring the COUNT means THE DATA DOES NOT EXIST RETROSPECTIVELY;
--   when the ceiling is finally hit there is no history to reason from.
--
--   And the ceiling is a CLIFF, not a slope. The CorePlus quota is per
--   WORKSPACE across every production app — Intuit's own wording — not per
--   realmId, so all customers share it. On the Builder tier exhausting it
--   BLOCKS rather than throttles: every connected company's sync stops at once,
--   with no warning. Without this table the first symptom IS that.
--
-- ⚠️ ONLY SUCCESSFUL 2xx CALLS ARE METERED (verified from Intuit). Two
-- consequences the worker must honour, stated here because this table is where
-- someone will look:
--   1. The counter increments ONLY on a 2xx. Incrementing on failure would
--      overstate consumption and trigger a false ceiling.
--   2. Retries are therefore CHEAPER than 7g1-spec originally assumed — a
--      failed call costs nothing, so backoff can be generous.
--
-- Core (data-IN: creating invoices, bills, customers) is FREE AND UNCAPPED on
-- every tier. So the entire OUTBOUND export path costs nothing and is NOT
-- counted here. This table counts CorePlus — data-OUT reads — only.

CREATE TABLE public.qb_read_budget (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id),

  -- First day of the month, in UTC. Intuit's quota resets monthly.
  period_month    date NOT NULL,

  -- CorePlus calls that returned 2xx. Never incremented on failure.
  coreplus_reads  integer NOT NULL DEFAULT 0,
  last_read_at    timestamp with time zone,

  created_at      timestamp with time zone DEFAULT now(),
  updated_at      timestamp with time zone DEFAULT now(),
  created_by      uuid REFERENCES auth.users(id),
  updated_by      uuid REFERENCES auth.users(id),
  is_deleted      boolean DEFAULT false,
  deleted_at      timestamp with time zone,

  CONSTRAINT qb_read_budget_reads_non_negative_check CHECK (coreplus_reads >= 0),
  -- A count is per company per month, once. Two rows for one period would be
  -- two partial answers to a question that has one.
  CONSTRAINT qb_read_budget_company_period_key UNIQUE (company_id, period_month)
);

ALTER TABLE public.qb_read_budget ALTER COLUMN company_id SET DEFAULT get_my_company_id();
ALTER TABLE public.qb_read_budget ALTER COLUMN created_by SET DEFAULT auth.uid();
ALTER TABLE public.qb_read_budget ALTER COLUMN updated_by SET DEFAULT auth.uid();

CREATE INDEX idx_qb_read_budget_company_id ON public.qb_read_budget (company_id);
CREATE INDEX idx_qb_read_budget_period ON public.qb_read_budget (period_month);

ALTER TABLE public.qb_read_budget ENABLE ROW LEVEL SECURITY;

-- SELECT only, Owner/Admin. No client write policy: a user who could edit the
-- counter could hide consumption from the very ceiling it exists to warn about.
CREATE POLICY qb_read_budget_select_owner_admin ON public.qb_read_budget
  FOR SELECT USING (
    company_id = get_my_company_id()
    AND get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
  );

CREATE TRIGGER qb_read_budget_updated_at
  BEFORE UPDATE ON public.qb_read_budget
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE FUNCTION public.set_qb_read_budget_updated_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER qb_read_budget_set_updated_by
  BEFORE UPDATE ON public.qb_read_budget
  FOR EACH ROW EXECUTE FUNCTION public.set_qb_read_budget_updated_by();

COMMENT ON TABLE public.qb_read_budget IS
  '7G §S [S149]. THE COUNTER ONLY — no alerting, no dashboard [Josh, S148]. '
  'Counts CorePlus (data-OUT) calls that returned 2xx; Core (data-IN) is free '
  'and uncapped and is not counted. The quota is per WORKSPACE across all '
  'customers and the Builder tier BLOCKS rather than throttles, so without this '
  'the first symptom of the ceiling is every company''s sync stopping at once.';

COMMENT ON COLUMN public.qb_read_budget.coreplus_reads IS
  'Incremented ONLY on a 2xx. Only successful calls are metered by Intuit, so '
  'counting failures would overstate consumption and trigger a false ceiling.';
