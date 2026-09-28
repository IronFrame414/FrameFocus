-- S114 PART B [RULED Josh 2026-09-28, R3 + Q16–Q18] — EXCLUDE A PROJECT FROM QUICKBOOKS.
--
-- Per project, OWNER ONLY (not Admin), changeable at any time, stops FUTURE syncing only. Records
-- already in QuickBooks are left alone; nothing is unlinked or deleted. The Project Executive can
-- neither set nor READ it (QuickBooks is company books).
--
-- 1. project_qb_exclusions — one LIVE row per excluded project (partial unique index). Including a
--    project again SOFT-DELETES its row (who/when kept); excluding again inserts a new one.
--    RLS: SELECT Owner + Admin (Q16: the Admin sees a read-only line); INSERT/UPDATE Owner only;
--    no DELETE policy (soft delete only). No PM / PE / foreman / crew / sub / client arm.
-- 2. qb_project_excluded(uuid) / qb_entity_excluded(text, uuid) — SECURITY DEFINER, EXECUTE for
--    service_role only (the worker's exit gate); the queue functions call them as definer.
--    qb_entity_excluded, by entity type (FILL-B-2's call graph: every push is born in qb_enqueue):
--      invoice → invoices.project_id · purchase → expenses.project_id ·
--      expense_payment → its expense's project · refund → client_refunds.project_id ·
--      payment → TRUE if ANY invoice it is applied to is on an excluded project (Q17 d: push a
--                client payment only if EVERY invoice it covers is on a non-excluded project) ·
--      customer and everything else → FALSE (a Customer is per client, not per project).
-- 3. qb_enqueue() — ENTRY GATE after its realm check. Redefined whole; only the gate is added.
--      pre  md5(prosrc) = ea8985407cf3f014eb93fcf19c40ea55  (20261380000000; = rebuild-test)
--      post md5(prosrc) = fa91dad71bd86d45268d8786de408d4e
-- 4. qb_enqueue_job_chain() — an excluded project queues no customer. Only the gate is added.
--      pre  md5(prosrc) = 96a7a3bdee7e09fd24b825626e953401  (20261460000000; = rebuild-test)
--      post md5(prosrc) = 165f64ca54888feb155f188c3b000e02
--
-- ⚠️ NO CONSTRAINT OVER EXISTING ROWS. A new, empty table; two new functions; two function bodies.
-- Production (P5, 2026-09-28): QuickBooks disconnected on both companies, 0 records pushed, 0 queued.
-- ⚠️ Q17 (a)–(e) are BUILT TO RULING, UNPROVEN AGAINST LIVE QUICKBOOKS DATA — there is none.

-- 1. The flag ---------------------------------------------------------------------------------------
CREATE TABLE public.project_qb_exclusions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id),
  project_id  uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  created_by  uuid REFERENCES auth.users(id),
  updated_by  uuid REFERENCES auth.users(id),
  is_deleted  boolean NOT NULL DEFAULT false,
  deleted_at  timestamptz
);
CREATE INDEX idx_project_qb_exclusions_company_id ON public.project_qb_exclusions (company_id);
CREATE UNIQUE INDEX idx_project_qb_exclusions_project_id_live
  ON public.project_qb_exclusions (project_id) WHERE is_deleted = false;

ALTER TABLE public.project_qb_exclusions ALTER COLUMN company_id SET DEFAULT get_my_company_id();
ALTER TABLE public.project_qb_exclusions ALTER COLUMN created_by SET DEFAULT auth.uid();
ALTER TABLE public.project_qb_exclusions ALTER COLUMN updated_by SET DEFAULT auth.uid();
ALTER TABLE public.project_qb_exclusions ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER project_qb_exclusions_updated_at BEFORE UPDATE ON public.project_qb_exclusions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE OR REPLACE FUNCTION public.set_project_qb_exclusions_updated_by()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_by = auth.uid(); RETURN NEW; END; $$ LANGUAGE plpgsql SECURITY DEFINER;
CREATE TRIGGER project_qb_exclusions_set_updated_by BEFORE UPDATE ON public.project_qb_exclusions
  FOR EACH ROW EXECUTE FUNCTION public.set_project_qb_exclusions_updated_by();

CREATE POLICY project_qb_exclusions_select_owner_admin ON public.project_qb_exclusions
  FOR SELECT TO authenticated
  USING (company_id = get_my_company_id() AND get_my_role() = ANY (ARRAY['owner', 'admin']));

CREATE POLICY project_qb_exclusions_insert_owner ON public.project_qb_exclusions
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = get_my_company_id()
    AND get_my_role() = 'owner'
    AND EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.company_id = get_my_company_id())
  );

CREATE POLICY project_qb_exclusions_update_owner ON public.project_qb_exclusions
  FOR UPDATE TO authenticated
  USING (company_id = get_my_company_id() AND get_my_role() = 'owner')
  WITH CHECK (company_id = get_my_company_id() AND get_my_role() = 'owner');

-- 2. The resolvers ----------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.qb_project_excluded(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT p_project_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM project_qb_exclusions x WHERE x.project_id = p_project_id AND x.is_deleted = false
  );
$fn$;

CREATE OR REPLACE FUNCTION public.qb_entity_excluded(p_entity_type text, p_entity_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT CASE p_entity_type
    WHEN 'invoice' THEN qb_project_excluded((SELECT i.project_id FROM invoices i WHERE i.id = p_entity_id))
    WHEN 'purchase' THEN qb_project_excluded((SELECT e.project_id FROM expenses e WHERE e.id = p_entity_id))
    WHEN 'expense_payment' THEN qb_project_excluded((
      SELECT e.project_id FROM expense_payments ep JOIN expenses e ON e.id = ep.expense_id WHERE ep.id = p_entity_id))
    WHEN 'refund' THEN qb_project_excluded((SELECT r.project_id FROM client_refunds r WHERE r.id = p_entity_id))
    WHEN 'payment' THEN EXISTS (
      SELECT 1 FROM client_payment_applications a JOIN invoices i ON i.id = a.invoice_id
       WHERE a.payment_id = p_entity_id AND a.is_deleted = false AND qb_project_excluded(i.project_id))
    ELSE false
  END;
$fn$;

REVOKE ALL ON FUNCTION public.qb_project_excluded(uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.qb_entity_excluded(text, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.qb_project_excluded(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.qb_entity_excluded(text, uuid) TO service_role;

-- 3. The entry gate ---------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.qb_enqueue(
  p_company_id  uuid,
  p_entity_type text,
  p_entity_id   uuid,
  p_operation   text,
  p_depends_on  uuid DEFAULT NULL
) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_realm text;
  v_id    uuid;
BEGIN
  SELECT qb_realm_id INTO v_realm FROM companies WHERE id = p_company_id;
  IF v_realm IS NULL THEN
    RETURN NULL;   -- never connected: nothing to queue for.
  END IF;

  -- [S114 PART B, RULED Josh R3] ENTRY GATE — a record on a project the Owner
  -- excluded from QuickBooks is never queued. The worker re-checks at pickup
  -- (exit gate) for rows queued BEFORE an exclusion and for client payments,
  -- whose invoice applications may not exist yet when their trigger fires.
  IF public.qb_entity_excluded(p_entity_type, p_entity_id) THEN
    RETURN NULL;
  END IF;

  -- The index's predicate, exactly. Scoped rather than merely limited: these
  -- four columns plus the status set are the index, so at most one row matches.
  SELECT id INTO v_id
  FROM qb_sync_queue
  WHERE company_id = p_company_id
    AND entity_type = p_entity_type
    AND entity_id = p_entity_id
    AND operation = p_operation
    AND is_deleted = false
    AND status = ANY (ARRAY['queued'::text, 'in_flight'::text, 'failed_transient'::text])
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO qb_sync_queue (company_id, realm_id, entity_type, entity_id, operation, depends_on_id, status)
  VALUES (p_company_id, v_realm, p_entity_type, p_entity_id, p_operation, p_depends_on, 'queued')
  RETURNING id INTO v_id;

  RETURN v_id;

EXCEPTION
  WHEN unique_violation THEN
    -- Lost a race with a concurrent enqueue. The other row is the live one.
    SELECT id INTO v_id
    FROM qb_sync_queue
    WHERE company_id = p_company_id
      AND entity_type = p_entity_type
      AND entity_id = p_entity_id
      AND operation = p_operation
      AND is_deleted = false
      AND status = ANY (ARRAY['queued'::text, 'in_flight'::text, 'failed_transient'::text])
    LIMIT 1;
    RETURN v_id;
END;
$$;

-- 4. The job chain ----------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.qb_enqueue_job_chain(
  p_company_id uuid,
  p_project_id uuid
) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_contact_id uuid;
  v_customer_q uuid;
BEGIN
  -- [S114 PART B] an excluded project queues no customer on its own account.
  IF public.qb_project_excluded(p_project_id) THEN
    RETURN NULL;
  END IF;

  SELECT p.contact_id INTO v_contact_id FROM projects p WHERE p.id = p_project_id;
  IF v_contact_id IS NULL THEN
    RETURN NULL;   -- no client on the project: nothing to hang an invoice from.
  END IF;

  -- Only queue the customer if it is not already linked. A contact that already
  -- carries `qb_customer_id` needs no work, and queueing it anyway would make
  -- the invoice wait behind a no-op.
  IF (SELECT qb_customer_id FROM contacts WHERE id = v_contact_id) IS NULL THEN
    v_customer_q := public.qb_enqueue(p_company_id, 'customer', v_contact_id, 'create', NULL);
  END IF;

  RETURN v_customer_q;
END;
$$;
