-- ============================================================================
-- 7G MIGRATION M-M — sub-customers are REMOVED. One Customer per client.
--                    [RULED Josh, S103]
-- ============================================================================
--
-- ⚠️ THE REASON IS A PRICING TIER, NOT A DESIGN PREFERENCE. QuickBooks
-- sub-customers (Customer with `Job: true` + `ParentRef`) require **Plus or
-- Advanced**. Josh runs **Simple Start** and intends to keep it. Left as built,
-- he would have to upgrade to use his own product — and **every contractor on
-- Simple Start would be locked out of the integration entirely.**
--
-- **After this: ONE QuickBooks Customer per client. The project goes in the
-- MEMO** on invoices and purchases.
--
-- ⚠️ JOSH HAS EXPLICITLY ACCEPTED WHAT A MEMO CANNOT DO: it does not group, it
-- does not roll up, and it does not report. **He does not want another field
-- investigated.** Do not "improve" this into Classes (Plus), Locations (Plus),
-- Projects (Plus) or a custom field (Advanced) — every one of them reintroduces
-- the tier problem this migration exists to remove.
--
-- ----------------------------------------------------------------------------
-- ⚠️ THE ONE THING THAT COULD STRAND A LIVE QUEUE, AND HOW IT IS HANDLED
-- ----------------------------------------------------------------------------
-- rebuild-test had **four queued rows at the moment this was written** — Josh's
-- own testing, including a live `customer -> sub_customer -> invoice` chain
-- (17:42 today). Production may be in the same state when this deploys.
--
-- `claimDue()` releases a dependant **only when its dependency reaches
-- `pushed`**. So if a queued `sub_customer:create` were failed or made
-- terminal, **the `invoice:create` behind it would never become claimable
-- again** — a silently stranded invoice, which is exactly the failure this
-- connector was built to avoid.
--
-- ⚠️ THEREFORE `sub_customer:create` NOW SUCCEEDS AS A NO-OP. The dispatch
-- returns `pushed` without calling QuickBooks (`entities.ts`). "Pushed" is the
-- honest answer: the step is no longer required, so it is done, and its
-- dependants are released in the same drain.
--
-- ----------------------------------------------------------------------------
-- ⚠️ WHAT IS DELIBERATELY NOT REMOVED
-- ----------------------------------------------------------------------------
--   * `projects.qb_sub_customer_id` — **KEPT.** Seven projects on rebuild-test
--     carry one, and the sub-customers they name still exist in QuickBooks with
--     invoices already referencing them. The column is the record of WHICH
--     QuickBooks object an old invoice belongs to. Dropping it would destroy
--     that link while the objects live on. It is now written by nothing.
--   * `'sub_customer'` in `qb_sync_queue_entity_type_check` — **KEPT.** Six
--     historical rows carry it; removing the value would make the CHECK reject
--     its own table.
--   * The sub-customers in the QuickBooks sandbox — **KEPT.** Test data, and
--     nothing here reaches into QuickBooks to tidy.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- The chain collapses from two levels to one
-- ----------------------------------------------------------------------------
--
-- _Superseded body, quoted rather than deleted:_
--
--     _IF (SELECT qb_sub_customer_id FROM projects WHERE id = p_project_id) IS NULL THEN_
--     _  v_job_q := public.qb_enqueue(p_company_id, 'sub_customer', p_project_id, 'create', v_customer_q);_
--     _END IF;_
--     _RETURN COALESCE(v_job_q, v_customer_q);_
--
-- ⚠️ THE REMAINING DEPENDENCY STILL HOLDS, AND IT IS THE ONE THAT MATTERS.
-- An invoice must not reach QuickBooks before its Customer exists, or Intuit
-- rejects it. This function still returns the **customer** queue id, and the
-- callers still pass it as `depends_on_id` — so `claimDue()` keeps the invoice
-- waiting exactly as before. Only the middle link is gone.
--
-- ⚠️ AND THE FUNCTION KEEPS ITS NAME on purpose. "Job chain" is now a slight
-- misnomer, but renaming it would touch both enqueue triggers for no behavioural
-- gain, and a rename is the kind of churn that hides a real change in a diff.
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

COMMENT ON FUNCTION public.qb_enqueue_job_chain(uuid, uuid) IS
  '7G M-M. Queues the CLIENT''s Customer for a project and returns the id to '
  'depend on (NULL when it already exists, or the project has no client). '
  'Sub-customers were removed at S103 -- they require QuickBooks Plus and Josh '
  'runs Simple Start. The project now travels in the invoice/purchase MEMO.';
