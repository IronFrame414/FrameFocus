-- ============================================================================
-- 7G MIGRATION M-E — what PUTS work in the queue.
-- ============================================================================
--
-- NOT in 7g2-spec.md §7's migration list (§7 says "No migration is needed for
-- the worker, routes, UI, or disclosure"). That is true of those four things and
-- leaves out a fifth: **nothing was going to enqueue anything.** The queue, the
-- worker and every mapper existed and would have drained an empty table forever.
--
-- ----------------------------------------------------------------------------
-- ⚠️ WHY TRIGGERS RATHER THAN CALLS FROM THE SERVICE LAYER
-- ----------------------------------------------------------------------------
-- The obvious build is `enqueue(...)` called from the invoice send route, the
-- void path, the expense approval, and so on. It was rejected for two reasons:
--
--   1. **Most of those writes are CLIENT-SIDE.** `invoices-client.ts` voids an
--      invoice with the browser's anon key, and `qb_sync_queue` has NO client
--      INSERT policy by design ("a client-side INSERT would let a PM enqueue
--      arbitrary pushes to the company's books" — 20260929000000). A client
--      write simply cannot enqueue, so the hook has to live below it.
--   2. **A call site is a list someone forgets to add to.** CLAUDE.md names
--      this failure shape repeatedly (the middleware matcher, the lock-exempt
--      prefixes). A trigger catches EVERY path — client, server, RPC, a future
--      screen nobody has written — because it hangs off the row, not the caller.
--
-- ⚠️ AN ENQUEUE FAILURE MUST NEVER BLOCK THE BUSINESS ACTION. Sending an
-- invoice is not allowed to fail because QuickBooks bookkeeping could not be
-- queued. Every trigger below therefore swallows unexpected errors as a
-- WARNING. The cost is that a lost enqueue needs a manual re-sync; the
-- alternative is an Owner who cannot invoice because a queue table is unhappy.
--
-- ⚠️ NOTHING IS QUEUED FOR A TENANT THAT HAS NEVER CONNECTED. The gate is
-- `companies.qb_realm_id IS NOT NULL`, not `qb_connection_state = 'connected'`,
-- and the difference is deliberate: a company in `needs_reauth` MUST keep
-- queueing [Josh, S148] — "the work is still valid and flows the moment they
-- reconnect". Only a tenant that has never linked QuickBooks queues nothing.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- The helper. Idempotent by the one-live-per-(entity,op) rule.
-- ----------------------------------------------------------------------------
--
-- ⚠️ RETURNS THE EXISTING ROW'S ID ON A DUPLICATE rather than raising. The
-- unique index (`idx_qb_sync_queue_one_live_per_entity_op`) exists because
-- QuickBooks has NO PUT — a second POST creates a second object — so hitting it
-- means the guarantee worked. Callers below chain `depends_on_id` off this
-- return value, and they need the live row's id whether or not they created it.
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

REVOKE ALL ON FUNCTION public.qb_enqueue(uuid, text, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.qb_enqueue(uuid, text, uuid, text, uuid) TO service_role;

COMMENT ON FUNCTION public.qb_enqueue(uuid, text, uuid, text, uuid) IS
  '7G M-E. Adds one row to qb_sync_queue, returning the LIVE row id whether it '
  'was created or already existed. Returns NULL for a tenant that has never '
  'connected QuickBooks. Called only from the enqueue triggers (SECURITY '
  'DEFINER), never granted to a client role.';


-- ----------------------------------------------------------------------------
-- invoices — sent / voided / amended
-- ----------------------------------------------------------------------------
--
-- ⚠️ THE DEPENDENCY CHAIN IS BUILT HERE, and its order is the whole point:
-- customer -> sub-customer (job) -> invoice. QuickBooks cannot hold a job
-- without its parent customer, or an invoice against a job that does not exist.
-- `depends_on_id` is what makes the worker wait rather than fail.
CREATE OR REPLACE FUNCTION public.qb_enqueue_invoice()
RETURNS TRIGGER
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_contact_id uuid;
  v_customer_q uuid;
  v_job_q      uuid;
BEGIN
  -- SENT: the invoice becomes real. Queue the whole chain.
  IF NEW.status = 'sent' AND OLD.status IS DISTINCT FROM 'sent' THEN
    SELECT p.contact_id INTO v_contact_id FROM projects p WHERE p.id = NEW.project_id;

    IF v_contact_id IS NOT NULL THEN
      -- Only queue the parents that are not already linked. A contact that
      -- already carries qb_customer_id needs no work, and queueing it anyway
      -- would make the invoice wait behind a no-op.
      IF (SELECT qb_customer_id FROM contacts WHERE id = v_contact_id) IS NULL THEN
        v_customer_q := public.qb_enqueue(NEW.company_id, 'customer', v_contact_id, 'create', NULL);
      END IF;

      IF (SELECT qb_sub_customer_id FROM projects WHERE id = NEW.project_id) IS NULL THEN
        v_job_q := public.qb_enqueue(NEW.company_id, 'sub_customer', NEW.project_id, 'create', v_customer_q);
      END IF;
    END IF;

    PERFORM public.qb_enqueue(NEW.company_id, 'invoice', NEW.id, 'create',
                              COALESCE(v_job_q, v_customer_q));
    RETURN NEW;
  END IF;

  -- VOIDED: voided here means voided in QuickBooks. Only if it ever got there.
  IF NEW.status = 'voided' AND OLD.status IS DISTINCT FROM 'voided'
     AND NEW.qb_invoice_id IS NOT NULL THEN
    PERFORM public.qb_enqueue(NEW.company_id, 'invoice', NEW.id, 'void', NULL);
    RETURN NEW;
  END IF;

  -- AMENDED: the money on an invoice QuickBooks already holds has changed.
  -- ⚠️ Guarded on qb_invoice_id so this cannot fire for an invoice that has not
  -- been pushed — that one still has its `create` row and a stray `update`
  -- would go terminal against an object that does not exist yet.
  IF NEW.qb_invoice_id IS NOT NULL
     AND (NEW.billed_total IS DISTINCT FROM OLD.billed_total
          OR NEW.retainage_withheld IS DISTINCT FROM OLD.retainage_withheld
          OR NEW.due_date IS DISTINCT FROM OLD.due_date)
     AND NEW.status <> 'voided' THEN
    PERFORM public.qb_enqueue(NEW.company_id, 'invoice', NEW.id, 'update', NULL);
  END IF;

  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[7G] enqueue failed for invoice %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

CREATE TRIGGER invoices_qb_enqueue
  AFTER UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.qb_enqueue_invoice();


-- ----------------------------------------------------------------------------
-- expenses — approved / edited / deleted  [RULED S103 Q9]
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.qb_enqueue_expense()
RETURNS TRIGGER
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- DELETED -> bill:void. Checked FIRST: a soft-delete can coincide with other
  -- column changes, and voiding must win over amending a bill that is going away.
  IF NEW.is_deleted = true AND OLD.is_deleted IS DISTINCT FROM true
     AND NEW.qb_bill_id IS NOT NULL THEN
    PERFORM public.qb_enqueue(NEW.company_id, 'bill', NEW.id, 'void', NULL);
    RETURN NEW;
  END IF;

  -- APPROVED -> bill:create. Only an approved expense is a payable.
  IF NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved'
     AND NEW.qb_bill_id IS NULL THEN
    PERFORM public.qb_enqueue(NEW.company_id, 'bill', NEW.id, 'create', NULL);
    RETURN NEW;
  END IF;

  -- EDITED -> bill:update, but only once it is in QuickBooks.
  IF NEW.qb_bill_id IS NOT NULL AND NEW.is_deleted IS DISTINCT FROM true
     AND (NEW.amount IS DISTINCT FROM OLD.amount
          OR NEW.supplier IS DISTINCT FROM OLD.supplier
          OR NEW.description IS DISTINCT FROM OLD.description
          OR NEW.expense_date IS DISTINCT FROM OLD.expense_date
          OR NEW.cost_category IS DISTINCT FROM OLD.cost_category) THEN
    PERFORM public.qb_enqueue(NEW.company_id, 'bill', NEW.id, 'update', NULL);
  END IF;

  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[7G] enqueue failed for expense %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

CREATE TRIGGER expenses_qb_enqueue
  AFTER UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.qb_enqueue_expense();


-- ----------------------------------------------------------------------------
-- client_payments — a payment recorded HERE goes out to QuickBooks
-- ----------------------------------------------------------------------------
--
-- ⚠️ THE `qb_payment_id IS NULL` GUARD IS WHAT PREVENTS AN INFINITE LOOP.
-- A payment that ARRIVED from QuickBooks is inserted by
-- `qb_record_inbound_payment()` WITH its id already set (migration M-D writes
-- it in the same INSERT precisely so this guard can see it). Without that
-- ordering, an inbound payment would be queued straight back out and QuickBooks
-- would hold two Payments for money received once.
CREATE OR REPLACE FUNCTION public.qb_enqueue_payment()
RETURNS TRIGGER
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.qb_payment_id IS NULL AND COALESCE(NEW.is_deleted, false) = false THEN
    PERFORM public.qb_enqueue(NEW.company_id, 'payment', NEW.id, 'create', NULL);
  END IF;
  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[7G] enqueue failed for payment %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

CREATE TRIGGER client_payments_qb_enqueue
  AFTER INSERT ON public.client_payments
  FOR EACH ROW EXECUTE FUNCTION public.qb_enqueue_payment();


-- ----------------------------------------------------------------------------
-- client_refunds — a credit memo or refund receipt, once it is a transaction
-- ----------------------------------------------------------------------------
--
-- ⚠️ RULED [S103 #3]: a DERIVED credit syncs when it is APPLIED, not when it is
-- recorded — and a derived credit has NO ROW AT ALL (it is computed by
-- `creditAvailableOnPayment`). So there is deliberately nothing here for the
-- void-created credit; this trigger fires only for an EXPLICIT client_refunds
-- row, which exists only once a concrete transaction does.
CREATE OR REPLACE FUNCTION public.qb_enqueue_refund()
RETURNS TRIGGER
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.status = ANY (ARRAY['approved'::text, 'issued'::text])
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status)
     AND NEW.qb_refund_id IS NULL
     AND COALESCE(NEW.is_deleted, false) = false THEN
    PERFORM public.qb_enqueue(NEW.company_id, 'refund', NEW.id, 'create', NULL);
  END IF;
  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[7G] enqueue failed for refund %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

CREATE TRIGGER client_refunds_qb_enqueue
  AFTER INSERT OR UPDATE ON public.client_refunds
  FOR EACH ROW EXECUTE FUNCTION public.qb_enqueue_refund();
