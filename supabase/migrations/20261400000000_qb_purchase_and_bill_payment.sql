-- ============================================================================
-- 7G MIGRATION M-G — expenses are PURCHASES, not Bills. [RULED Josh, S103]
-- ============================================================================
--
-- ⚠️ THIS REVERSES WHAT M-E (20261380000000) SHIPPED. Superseded text is quoted
-- rather than deleted, here and in the build log.
--
-- M-E pushed every approved expense as a QuickBooks **Bill** — a payable. Josh,
-- in his own words:
--
--   "in real world practice, I would have to go to QB for all expenses entered
--    through the new system -> mark as paid -> confirm pay date -> enter payment
--    to convert to expense. That is a step I am trying to avoid."
--
-- A Bill is an obligation. Every one we pushed created hand-work in QuickBooks
-- that the integration exists to remove.
--
-- ----------------------------------------------------------------------------
-- ⚠️ WHAT SYNCS NOW, AND THE FIELD THAT DECIDES IT
-- ----------------------------------------------------------------------------
--
-- The ruling: *"Only ACTUAL COSTS sync. Bills & commitments NEVER touch
-- QuickBooks."* The prompt asked which platform field carries that distinction
-- and told us to ESTABLISH it rather than assume. **It is not one column, and
-- the obvious candidate is the wrong answer.**
--
--   `expenses.state`  CHECK (state = ANY (ARRAY['committed','actual']))
--
-- looks like the field and is not. The two Bills the handshake pushed (QB 147
-- and 149) are both `state = 'actual'` **and both sit on the Bills &
-- commitments tab**, because that tab is not keyed on `state`. It is keyed on
-- 7C's payable predicate — `isPayableRow` / `PAYABLE_OR_FILTER`
-- (apps/web/lib/services/payables-shared.ts), five terms:
--
--      sub_contract_id IS NOT NULL        -- sub stage / retainage linkage
--      OR purchase_order_id IS NOT NULL   -- PO committed row
--      OR is_retainage                    -- retainage accrual row
--      OR EXISTS (payments)               -- has expense_payments rows
--      OR state = 'committed'             -- unpaid manual bill
--
-- money-representation.md §4.5 states the rule as **"money sorts by ORIGIN,
-- never `state`"**, and mirrors this predicate in SQL inside
-- `recompute_budget_item_actual` / `_committed` (20260730010000:830,890).
--
-- ⚠️ SO A RECEIPT IS `NOT payable`, AND THAT IS WHAT THE TRIGGER FILTERS ON.
-- The predicate below is a COPY of that mirror, term for term. It is READ,
-- NEVER MODIFIED: the spec locks it, and any change to it silently moves every
-- budget number in the platform. If it ever changes there, it changes here.
--
-- ----------------------------------------------------------------------------
-- ⚠️ WHAT A QUICKBOOKS PURCHASE REQUIRES — MEASURED, NOT RECALLED
-- ----------------------------------------------------------------------------
-- Probed against the live sandbox by making the API refuse (S182):
--
--   Line only .......................... "Required parameter PaymentType is missing"
--   AccountRef + Line, no PaymentType .. same refusal
--   PaymentType + Line, no AccountRef .. "Invalid account type"
--   AccountRef + PaymentType + Line .... ACCEPTED
--
-- ⚠️ **BOTH ARE REQUIRED**, and the platform captured NEITHER. `AccountRef` on
-- a Purchase is the account the money came FROM (Bank or Credit Card) — not the
-- expense account, which is the line's own `AccountRef`. Two different things
-- with the same field name, one level apart, which is a trap worth naming.
--
-- So this migration adds the three settings that make a Purchase postable, and
-- the trigger PARKS (never fails) when they are unset — the same shape as the
-- income-item prompt, for the same reason: a person has to choose, and guessing
-- which bank account paid for something is not ours to do.
--
-- ----------------------------------------------------------------------------
-- ⚠️ LEGACY BILLS ARE NOT ABANDONED
-- ----------------------------------------------------------------------------
-- QB 147 and 149 exist. 149 is OPEN because Josh paid it in EZ Binder and
-- nothing closed it. So:
--
--   * NO NEW BILL IS EVER CREATED. The `bill:create` arm is gone.
--   * `bill:update` / `bill:void` SURVIVE, guarded on `qb_bill_id IS NOT NULL`
--     — they can only ever touch a Bill that is already there.
--   * A payment recorded against an expense that HAS a `qb_bill_id` pushes a
--     **BillPayment**, which is what closes it. [§1b, the loop-closer]
--
-- ⚠️ AND ONE CONSEQUENCE IS DELIBERATELY LEFT UNRESOLVED, NOT PAPERED OVER.
-- Under this ruling a sub-contract payable never reaches QuickBooks at all —
-- not as a Bill (forbidden), and not as a Purchase (it is a payable, so the
-- receipt filter excludes it). **Subcontractor cost therefore stops appearing
-- in QuickBooks for any contract not already pushed.** Pushing a Purchase when
-- such a payable is PAID would fix it and is a one-line change to the payment
-- trigger below — but it is money movement into the customer's books that no
-- ruling authorises, so it is NOT done here. Flagged for Josh.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Columns
-- ----------------------------------------------------------------------------

-- The Purchase's QuickBooks id. Deliberately SEPARATE from `qb_bill_id` rather
-- than reusing it: the two are different QuickBooks object types living at
-- different endpoints, and one column holding either would make every read
-- guess which. `qb_bill_id` stays as the record of what the Bill era created.
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS qb_purchase_id text;

CREATE INDEX IF NOT EXISTS idx_expenses_qb_purchase_id
  ON public.expenses (qb_purchase_id) WHERE qb_purchase_id IS NOT NULL;

COMMENT ON COLUMN public.expenses.qb_purchase_id IS
  '7G M-G. The QuickBooks Purchase id for an ACTUAL-COST receipt. Never set on '
  'a payable row (see the receipt predicate in qb_enqueue_expense). Distinct '
  'from qb_bill_id, which records the superseded Bill era.';

-- BillPayment tracking on the payment itself, so the push is idempotent the
-- same way every other entity's is: the handler's first act is to check whether
-- the id is already there.
ALTER TABLE public.expense_payments ADD COLUMN IF NOT EXISTS qb_bill_payment_id text;
ALTER TABLE public.expense_payments ADD COLUMN IF NOT EXISTS qb_synced_at timestamp with time zone;
ALTER TABLE public.expense_payments
  ADD COLUMN IF NOT EXISTS qb_push_status text NOT NULL DEFAULT 'not_pushed';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'expense_payments_qb_push_status_check') THEN
    ALTER TABLE public.expense_payments
      ADD CONSTRAINT expense_payments_qb_push_status_check
      CHECK (qb_push_status = ANY (ARRAY['not_pushed'::text, 'queued'::text,
                                         'pushed'::text, 'failed'::text]));
  END IF;
END $$;

-- ⚠️ THE IMMUTABILITY TRIGGER NEEDS NO CHANGE, and that is worth stating.
-- `enforce_expense_payments_column_scope` is a DENYLIST naming the money and
-- identity columns; the three above are not in it, so bookkeeping columns
-- remain writable while `amount`, `paid_date` and `retainage_withheld` stay
-- frozen. A recorded payment is still immutable in every sense that means.

-- The Purchase settings. Free-text NAME plus resolved ID, matching how the
-- income item is stored (id for the API, name for the screen).
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS qb_payment_account_id text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS qb_payment_account_name text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS qb_payment_type text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'companies_qb_payment_type_check') THEN
    ALTER TABLE public.companies
      ADD CONSTRAINT companies_qb_payment_type_check
      CHECK (qb_payment_type IS NULL
             OR qb_payment_type = ANY (ARRAY['Cash'::text, 'Check'::text, 'CreditCard'::text]));
  END IF;
END $$;

COMMENT ON COLUMN public.companies.qb_payment_account_id IS
  '7G M-G. QuickBooks Account id (Bank or Credit Card) that a Purchase is '
  'posted against — the account the money came FROM. Required by the Purchase '
  'API; an unset value PARKS the expense rather than failing it.';

-- ⚠️ OWNER-ONLY, matching qb_income_item_id rather than gl_account_*. Both are
-- mappings, but this one names the bank account money leaves from, and the
-- income item — its exact analogue on the revenue side — is already Owner-only
-- in this guard. Consistency on the money-facing side wins over consistency
-- with the GL text fields. [Reversible default, S182; logged.]
CREATE OR REPLACE FUNCTION public.enforce_companies_qb_scope()
RETURNS TRIGGER
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.get_my_role() = 'owner' THEN
    RETURN NEW;
  END IF;

  IF NEW.qb_realm_id IS DISTINCT FROM OLD.qb_realm_id
     OR NEW.qb_token_secret_id IS DISTINCT FROM OLD.qb_token_secret_id
     OR NEW.qb_payments_enabled IS DISTINCT FROM OLD.qb_payments_enabled
     OR NEW.qb_income_item_id IS DISTINCT FROM OLD.qb_income_item_id
     OR NEW.qb_income_item_name IS DISTINCT FROM OLD.qb_income_item_name
     OR NEW.qb_payment_account_id IS DISTINCT FROM OLD.qb_payment_account_id
     OR NEW.qb_payment_account_name IS DISTINCT FROM OLD.qb_payment_account_name
     OR NEW.qb_payment_type IS DISTINCT FROM OLD.qb_payment_type
     OR NEW.qb_connection_state IS DISTINCT FROM OLD.qb_connection_state
     OR NEW.qb_connected_at IS DISTINCT FROM OLD.qb_connected_at
     OR NEW.qb_last_refresh_at IS DISTINCT FROM OLD.qb_last_refresh_at
     OR NEW.qb_refresh_rotated_at IS DISTINCT FROM OLD.qb_refresh_rotated_at
     OR NEW.qb_reauth_required_after IS DISTINCT FROM OLD.qb_reauth_required_after THEN
    RAISE EXCEPTION 'Connecting or disconnecting QuickBooks is Owner-only.';
  END IF;

  RETURN NEW;
END;
$$;


-- ----------------------------------------------------------------------------
-- 2. Two new queue entity types
-- ----------------------------------------------------------------------------
ALTER TABLE public.qb_sync_queue DROP CONSTRAINT IF EXISTS qb_sync_queue_entity_type_check;
ALTER TABLE public.qb_sync_queue
  ADD CONSTRAINT qb_sync_queue_entity_type_check
  CHECK (entity_type = ANY (ARRAY['customer'::text, 'sub_customer'::text, 'invoice'::text,
                                  'payment'::text, 'refund'::text, 'vendor'::text,
                                  'bill'::text, 'time_activity'::text,
                                  'purchase'::text, 'bill_payment'::text]));


-- ----------------------------------------------------------------------------
-- 3. The job chain, extracted so BOTH triggers use ONE copy
-- ----------------------------------------------------------------------------
--
-- ⚠️ THIS IS THE FIX FOR §2.8, AND THE CAUSE WAS NOT A MISSING FIELD.
-- `buildBillBody()` has always set a line-level `CustomerRef` when the project
-- carries `qb_sub_customer_id`. It never fired, because **only the invoice
-- trigger ever built the customer -> sub-customer chain.** Rosewood Master
-- Suite (PRJ-102), the project behind QB bill 147, has `qb_sub_customer_id`
-- NULL to this day. The expense had no job to point at.
--
-- ⚠️ CLAUDE.md's PARITY ruling in its literal form: "share the mechanism, not
-- just the intent. A second implementation that does the same thing IS the
-- divergence, written in a form that looks like agreement." The chain was about
-- to be written twice, so it is written once and called twice.
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
  v_job_q      uuid;
BEGIN
  SELECT p.contact_id INTO v_contact_id FROM projects p WHERE p.id = p_project_id;
  IF v_contact_id IS NULL THEN
    RETURN NULL;   -- no client on the project: nothing to hang a job from.
  END IF;

  -- Only queue the parents that are not already linked. A contact that already
  -- carries qb_customer_id needs no work, and queueing it anyway would make the
  -- dependant wait behind a no-op.
  IF (SELECT qb_customer_id FROM contacts WHERE id = v_contact_id) IS NULL THEN
    v_customer_q := public.qb_enqueue(p_company_id, 'customer', v_contact_id, 'create', NULL);
  END IF;

  IF (SELECT qb_sub_customer_id FROM projects WHERE id = p_project_id) IS NULL THEN
    v_job_q := public.qb_enqueue(p_company_id, 'sub_customer', p_project_id, 'create', v_customer_q);
  END IF;

  RETURN COALESCE(v_job_q, v_customer_q);
END;
$$;

REVOKE ALL ON FUNCTION public.qb_enqueue_job_chain(uuid, uuid) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.qb_enqueue_job_chain(uuid, uuid) IS
  '7G M-G. Queues customer -> sub-customer for a project and returns the id to '
  'depend on (NULL when both already exist, or the project has no client). One '
  'copy, called by both the invoice and expense enqueue triggers.';


-- Invoice trigger, rewritten only to call the shared chain. Behaviour identical.
CREATE OR REPLACE FUNCTION public.qb_enqueue_invoice()
RETURNS TRIGGER
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_dep uuid;
BEGIN
  IF NEW.status = 'sent' AND OLD.status IS DISTINCT FROM 'sent' THEN
    v_dep := public.qb_enqueue_job_chain(NEW.company_id, NEW.project_id);
    PERFORM public.qb_enqueue(NEW.company_id, 'invoice', NEW.id, 'create', v_dep);
    RETURN NEW;
  END IF;

  IF NEW.status = 'voided' AND OLD.status IS DISTINCT FROM 'voided'
     AND NEW.qb_invoice_id IS NOT NULL THEN
    PERFORM public.qb_enqueue(NEW.company_id, 'invoice', NEW.id, 'void', NULL);
    RETURN NEW;
  END IF;

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


-- ----------------------------------------------------------------------------
-- 4. Expenses — receipts become Purchases; payables never sync
-- ----------------------------------------------------------------------------
--
-- _Superseded arm, quoted rather than deleted (M-E):_
--   _"APPROVED -> bill:create. Only an approved expense is a payable."_
--   _IF NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved'_
--   _   AND NEW.qb_bill_id IS NULL THEN_
--   _  PERFORM public.qb_enqueue(NEW.company_id, 'bill', NEW.id, 'create', NULL);_
--
-- That arm's own comment gives the reason it is gone: it called an approved
-- expense "a payable", and pushed one. Under S103 an approved RECEIPT is money
-- already spent, and a payable is not ours to create.
CREATE OR REPLACE FUNCTION public.qb_enqueue_expense()
RETURNS TRIGGER
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_is_payable boolean;
  v_dep        uuid;
BEGIN
  -- ⚠️ THE RECEIPT TEST. A COPY of the locked payable predicate
  -- (payables-shared.ts / money_representation 20260730010000:830), term for
  -- term. Read, never modified — it is also the budget recompute's origin test.
  v_is_payable := (
       NEW.sub_contract_id IS NOT NULL
    OR NEW.purchase_order_id IS NOT NULL
    OR NEW.is_retainage
    OR NEW.state = 'committed'
    OR EXISTS (SELECT 1 FROM expense_payments p
               WHERE p.expense_id = NEW.id AND p.is_deleted = false)
  );

  -- DELETED first: a soft-delete can coincide with other column changes, and
  -- removing must win over amending something that is going away.
  IF NEW.is_deleted = true AND OLD.is_deleted IS DISTINCT FROM true THEN
    IF NEW.qb_purchase_id IS NOT NULL THEN
      PERFORM public.qb_enqueue(NEW.company_id, 'purchase', NEW.id, 'void', NULL);
    ELSIF NEW.qb_bill_id IS NOT NULL THEN
      -- Legacy Bill era. Still honoured so QuickBooks does not keep a record
      -- for something that no longer exists here.
      PERFORM public.qb_enqueue(NEW.company_id, 'bill', NEW.id, 'void', NULL);
    END IF;
    RETURN NEW;
  END IF;

  -- APPROVED -> purchase:create, RECEIPTS ONLY.
  IF NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved'
     AND NEW.qb_purchase_id IS NULL AND NEW.qb_bill_id IS NULL
     AND NOT v_is_payable THEN
    -- §2.8: build the job first, so the Purchase line can carry a CustomerRef
    -- pointing at the sub-customer instead of only naming the project in prose.
    v_dep := public.qb_enqueue_job_chain(NEW.company_id, NEW.project_id);
    PERFORM public.qb_enqueue(NEW.company_id, 'purchase', NEW.id, 'create', v_dep);
    RETURN NEW;
  END IF;

  -- EDITED -> update whichever object QuickBooks actually holds.
  IF NEW.is_deleted IS DISTINCT FROM true
     AND (NEW.amount IS DISTINCT FROM OLD.amount
          OR NEW.supplier IS DISTINCT FROM OLD.supplier
          OR NEW.description IS DISTINCT FROM OLD.description
          OR NEW.expense_date IS DISTINCT FROM OLD.expense_date
          OR NEW.cost_category IS DISTINCT FROM OLD.cost_category) THEN
    IF NEW.qb_purchase_id IS NOT NULL THEN
      PERFORM public.qb_enqueue(NEW.company_id, 'purchase', NEW.id, 'update', NULL);
    ELSIF NEW.qb_bill_id IS NOT NULL THEN
      PERFORM public.qb_enqueue(NEW.company_id, 'bill', NEW.id, 'update', NULL);
    END IF;
  END IF;

  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[7G] enqueue failed for expense %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;


-- ----------------------------------------------------------------------------
-- 5. expense_payments — paying a bill HERE closes it THERE  [§1b]
-- ----------------------------------------------------------------------------
--
-- ⚠️ THE LOOP-CLOSER, AND THE HANDSHAKE PROVED IT WAS MISSING. Josh approved an
-- $800 bill (QB 149) and paid it in EZ Binder. Nothing enqueued. QB 149 is
-- still OPEN.
--
-- ⚠️ GUARDED ON `qb_bill_id IS NOT NULL`, and that guard is the whole design.
-- A BillPayment can only settle a Bill. A receipt pushed as a Purchase is
-- already money-out — pushing a payment for it would double-count the spend.
-- So this fires ONLY for the legacy Bills that exist, which is exactly the set
-- that can be left hanging open.
CREATE OR REPLACE FUNCTION public.qb_enqueue_expense_payment()
RETURNS TRIGGER
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_expense expenses%ROWTYPE;
BEGIN
  IF NEW.is_deleted = true THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_expense FROM expenses WHERE id = NEW.expense_id;
  IF NOT FOUND OR v_expense.qb_bill_id IS NULL THEN
    RETURN NEW;   -- nothing in QuickBooks to settle.
  END IF;

  PERFORM public.qb_enqueue(NEW.company_id, 'bill_payment', NEW.id, 'create', NULL);
  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  -- Recording a payment must never fail because bookkeeping could not queue.
  RAISE WARNING '[7G] enqueue failed for expense payment %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS expense_payments_qb_enqueue ON public.expense_payments;

CREATE TRIGGER expense_payments_qb_enqueue
  AFTER INSERT ON public.expense_payments
  FOR EACH ROW EXECUTE FUNCTION public.qb_enqueue_expense_payment();

COMMENT ON FUNCTION public.qb_enqueue_expense_payment() IS
  '7G M-G §1b. A payment against an expense that already has a QuickBooks Bill '
  'pushes a BillPayment, which closes it. Guarded on qb_bill_id: a receipt is '
  'pushed as a Purchase (money already out) and must never also be paid.';

-- ----------------------------------------------------------------------------
-- 6. M-F's un-park trigger must know about the new settings
-- ----------------------------------------------------------------------------
--
-- ⚠️ M-F (20261390000000) fixed "the Owner fixes the thing a park asked for and
-- nothing wakes". Its WHEN clause was written before these columns existed, so
-- WITHOUT THIS the Purchase path would reintroduce the exact defect M-F closed:
-- an expense parks on "choose a payment account", the Owner chooses one, and
-- the row sits out its five minutes anyway.
--
-- Recreated in full rather than patched, because a trigger's WHEN clause cannot
-- be altered in place.
DROP TRIGGER IF EXISTS companies_qb_wake_parked_queue ON public.companies;

CREATE TRIGGER companies_qb_wake_parked_queue
  AFTER UPDATE ON public.companies
  FOR EACH ROW
  WHEN (
       OLD.gl_account_labor        IS DISTINCT FROM NEW.gl_account_labor
    OR OLD.gl_account_material     IS DISTINCT FROM NEW.gl_account_material
    OR OLD.gl_account_subcontractor IS DISTINCT FROM NEW.gl_account_subcontractor
    OR OLD.gl_account_other        IS DISTINCT FROM NEW.gl_account_other
    OR OLD.qb_income_item_id       IS DISTINCT FROM NEW.qb_income_item_id
    OR OLD.qb_income_item_name     IS DISTINCT FROM NEW.qb_income_item_name
    OR OLD.qb_payment_account_id   IS DISTINCT FROM NEW.qb_payment_account_id
    OR OLD.qb_payment_type         IS DISTINCT FROM NEW.qb_payment_type
    OR (NEW.qb_connection_state = 'connected'
        AND OLD.qb_connection_state IS DISTINCT FROM NEW.qb_connection_state)
  )
  EXECUTE FUNCTION public.qb_wake_parked_queue();
