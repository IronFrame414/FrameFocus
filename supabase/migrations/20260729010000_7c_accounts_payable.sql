-- ============================================================================
-- Module 7C — Accounts Payable (7C-spec.md §2.1–§2.5) [S91]
--
-- Boundary (S89, locked): 7A = point-of-purchase receipts ONLY; anything
-- invoiced/billed enters through 7C. Commitments ARE expenses rows
-- (state='committed') — no parallel commitments table.
--
-- Money model (S89 close-out correction + S91 retainage fix, settled): DERIVED
-- AT READ. One row per stage/bill; the actual/committed split derives from
-- expense_payments (committed_remaining = GREATEST(amount − Σ payments, 0);
-- paid dollars are actual AT PAYMENT TIME). `state` is a SETTLEMENT MARKER
-- only — it flips to 'actual' when remaining hits 0 and is never a money source.
--
-- Retainage semantics (Josh, S91): a payment's `amount` is the GROSS billed
-- against the stage — it settles the stage. The check actually cut to the sub
-- is amount − retainage_withheld; CASH LEAVING THE COMPANY IS THE NET:
--   cash_out_7C(job) = Σ (amount − retainage_withheld) across payments
--                      — NOT Σ amount (§2.6 as amended).
-- The is_retainage accrual row is the BOOKKEEPING MIRROR of Σ withheld — the
-- same dollars held back, not a second obligation. Its release is its own
-- payment (retainage_withheld = 0), so at full settlement
-- Σ(amount − retainage_withheld) across ALL payments = the contract value.
--
-- Contents:
--   1. expenses — 7C columns (+ closeout CHECK, indexes)
--   2. expenses_insert_authorized — re-created (committed/subcontractor
--      writers = Owner/Admin/PM; the uniform pending gate stays pinned)
--   3. enforce_expenses_column_scope — extended (PM partial tier)
--   4. expense_payments — new table (record-only; immutable money fields)
--   5. subcontractor_contracts — retainage shape columns
--   6. purchase_orders.total_amount
--   7. subcontractor_compliance_documents — new table (5I §3a verbatim;
--      5I keeps design ownership — the portal build must NOT re-create it)
--   8. subcontractors.did_not_finish
--   9. RPCs: setup_payment_schedule, record_expense_payment,
--      set_po_total_amount (SECURITY INVOKER — approve_expense precedent;
--      RLS and the column-scope triggers still gate every row)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. expenses — 7C columns (spec §2.1)
-- ----------------------------------------------------------------------------

ALTER TABLE public.expenses
  ADD COLUMN sub_contract_id   uuid REFERENCES public.subcontractor_contracts(id),
  ADD COLUMN purchase_order_id uuid REFERENCES public.purchase_orders(id),
  ADD COLUMN stage_label       text,
  ADD COLUMN due_date          date,                            -- per-bill (§7.9 — vendor terms vary)
  ADD COLUMN awaiting_paper    boolean NOT NULL DEFAULT false,  -- decision 6: known number, bill expected
  ADD COLUMN is_retainage      boolean NOT NULL DEFAULT false,  -- shape (a) accrual row
  ADD COLUMN closed_out_at     timestamptz,                     -- orphaned-commitment closeout
  ADD COLUMN closed_out_by     uuid REFERENCES public.company_members(id),
  ADD COLUMN closeout_reason   text,
  ADD CONSTRAINT expenses_closeout_reason_check
    CHECK (closed_out_at IS NULL OR closeout_reason IS NOT NULL);

-- "Closeout only when remaining-owed > 0" is service/RPC-enforced — it sums a
-- child table (expense_payments), which a CHECK cannot reference.

CREATE INDEX idx_expenses_sub_contract_id   ON public.expenses (sub_contract_id);
CREATE INDEX idx_expenses_purchase_order_id ON public.expenses (purchase_order_id);
CREATE INDEX idx_expenses_due_date          ON public.expenses (due_date);

-- ----------------------------------------------------------------------------
-- 2. expenses INSERT policy — re-created for 7C writers (spec §2.1 + S90 P2 Q2)
--    Policy-only INSERT gating (Q3): WITH CHECK sees the full NEW row; no
--    BEFORE INSERT trigger needed (the UPDATE trigger exists because UPDATE
--    checks need OLD, which policies cannot see).
--    The 7A uniform gate stays pinned FOR EVERYONE: status='pending', empty
--    review columns. Approval happens only through approve_expense.
-- ----------------------------------------------------------------------------

DROP POLICY expenses_insert_authorized ON public.expenses;

CREATE POLICY expenses_insert_authorized ON public.expenses
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND public.can_view_project(project_id)
    AND (
      author_member_id = public.get_my_member_id()
      OR public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
    )
    -- Uniform review gate (7A, unchanged): everyone lands pending.
    AND status = 'pending'
    AND approved_by IS NULL
    AND approved_at IS NULL
    AND rejected_by IS NULL
    AND rejected_at IS NULL
    -- 7C: committed writers are Owner/Admin/PM (decision 3). Everyone else
    -- still writes 'actual' receipts only.
    AND (
      state = 'actual'
      OR public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text])
    )
    -- 7C: subcontractor category = bills, entered by Owner/Admin/PM only
    -- (widened from 7A's Owner/Admin — PM enters bills, landing pending).
    AND (
      cost_category <> 'subcontractor'
      OR public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text])
    )
    -- 7C linkage columns are set by 7C flows (Owner/Admin/PM).
    AND (
      (sub_contract_id IS NULL AND purchase_order_id IS NULL)
      OR public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text])
    )
    -- awaiting_paper is a bill concept — same writers.
    AND (
      awaiting_paper = false
      OR public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text])
    )
    -- The retainage accrual row is created only by record_expense_payment
    -- (whose caller is Owner/Admin — payments are money out).
    AND (
      is_retainage = false
      OR public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
    )
    -- Closeout is an UPDATE-side act; rows are never born closed out.
    AND closed_out_at IS NULL
    AND closed_out_by IS NULL
    AND closeout_reason IS NULL
  );

-- ----------------------------------------------------------------------------
-- 3. expenses column scope — extended (spec §2.1 + S90 P2 Q4)
--    PM is a PARTIAL tier, not a bail-through: PM passes the same blocked-
--    column checks as foreman/crew (never status/state/linkage/closeout), but
--    may recategorize their own pending bill INTO 'subcontractor' (PM enters
--    sub bills — decision 3). Author-editable-while-pending fields now also
--    include stage_label, due_date, awaiting_paper (descriptive bill fields);
--    the RLS UPDATE policy still limits non-Owner/Admin to author+pending.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_expenses_column_scope()
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

  -- Review + system columns (7A, unchanged).
  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.state IS DISTINCT FROM OLD.state
     OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
     OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
     OR NEW.rejected_by IS DISTINCT FROM OLD.rejected_by
     OR NEW.rejected_at IS DISTINCT FROM OLD.rejected_at
     OR NEW.rejection_note IS DISTINCT FROM OLD.rejection_note
     OR NEW.qb_export_status IS DISTINCT FROM OLD.qb_export_status
     OR NEW.author_member_id IS DISTINCT FROM OLD.author_member_id
     OR NEW.source_segment_id IS DISTINCT FROM OLD.source_segment_id
     OR NEW.company_id IS DISTINCT FROM OLD.company_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'Review and system columns are not editable for your role.';
  END IF;

  -- 7C linkage + closeout columns: below Owner/Admin nobody re-points a row
  -- at a different contract/PO, flags retainage, or closes out a commitment.
  IF NEW.sub_contract_id IS DISTINCT FROM OLD.sub_contract_id
     OR NEW.purchase_order_id IS DISTINCT FROM OLD.purchase_order_id
     OR NEW.is_retainage IS DISTINCT FROM OLD.is_retainage
     OR NEW.closed_out_at IS DISTINCT FROM OLD.closed_out_at
     OR NEW.closed_out_by IS DISTINCT FROM OLD.closed_out_by
     OR NEW.closeout_reason IS DISTINCT FROM OLD.closeout_reason THEN
    RAISE EXCEPTION '7C linkage and closeout columns are Owner/Admin only.';
  END IF;

  -- S89 7C boundary, amended for decision 3: a receipt is never recategorized
  -- 'subcontractor' EXCEPT by a PM correcting their own pending bill — PM may
  -- enter sub bills, so PM may recategorize into the category too.
  IF NEW.cost_category IS DISTINCT FROM OLD.cost_category
     AND NEW.cost_category = 'subcontractor'
     AND public.get_my_role() <> 'project_manager' THEN
    RAISE EXCEPTION 'The subcontractor category is set only by 7C bill writers.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

-- (The existing expenses_column_scope trigger re-binds to the replaced
-- function automatically — no trigger re-create needed.)

-- ----------------------------------------------------------------------------
-- 4. expense_payments (spec §2.2) — record-only; partials are v1
-- ----------------------------------------------------------------------------

CREATE TABLE public.expense_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid DEFAULT public.get_my_company_id() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid DEFAULT auth.uid(),
    updated_by uuid DEFAULT auth.uid(),
    is_deleted boolean DEFAULT false,
    deleted_at timestamp with time zone,

    expense_id uuid NOT NULL,
    paid_date  date NOT NULL,
    -- GROSS billed against the stage — settles remaining. The check actually
    -- cut to the sub is amount − retainage_withheld (net cash out).
    amount     numeric(12,2) NOT NULL,
    -- Shape-(a) withhold on THIS payment. Mirrored into the contract's
    -- is_retainage accrual row by record_expense_payment — same dollars, not
    -- a second obligation. 0 on retainage-release payments.
    retainage_withheld numeric(12,2) NOT NULL DEFAULT 0,
    method     text,                              -- free text v1 (7G may force an enum)
    note       text,
    -- Over-stage flag (§7.9): this payment pushed Σ payments past the row's
    -- amount. Recorded, surfaced, never blocking (override at record time).
    over_stage boolean NOT NULL DEFAULT false,

    CONSTRAINT expense_payments_pkey PRIMARY KEY (id),
    CONSTRAINT expense_payments_amount_positive_check CHECK (amount > 0),
    CONSTRAINT expense_payments_retainage_withheld_check
      CHECK (retainage_withheld >= 0),
    CONSTRAINT expense_payments_retainage_withheld_max_check
      CHECK (retainage_withheld <= amount)
);

ALTER TABLE ONLY public.expense_payments
    ADD CONSTRAINT expense_payments_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);
ALTER TABLE ONLY public.expense_payments
    ADD CONSTRAINT expense_payments_expense_id_fkey FOREIGN KEY (expense_id) REFERENCES public.expenses(id);
ALTER TABLE ONLY public.expense_payments
    ADD CONSTRAINT expense_payments_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE ONLY public.expense_payments
    ADD CONSTRAINT expense_payments_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);

CREATE INDEX idx_expense_payments_expense_id ON public.expense_payments (expense_id);
CREATE INDEX idx_expense_payments_company_id ON public.expense_payments (company_id);

-- Standard BEFORE UPDATE triggers (CLAUDE.md).
CREATE TRIGGER expense_payments_updated_at
  BEFORE UPDATE ON public.expense_payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE FUNCTION public.set_expense_payments_updated_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER expense_payments_set_updated_by
  BEFORE UPDATE ON public.expense_payments
  FOR EACH ROW EXECUTE FUNCTION public.set_expense_payments_updated_by();

-- A recorded payment is a RECORD: every money/identity field is immutable for
-- every role (Owner/Admin included). The only legal update is the soft-delete
-- correction path (soft-delete + re-entry). Derived-at-read means a
-- soft-deleted payment re-derives the split automatically.
CREATE OR REPLACE FUNCTION public.enforce_expense_payments_column_scope()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.expense_id IS DISTINCT FROM OLD.expense_id
     OR NEW.paid_date IS DISTINCT FROM OLD.paid_date
     OR NEW.amount IS DISTINCT FROM OLD.amount
     OR NEW.retainage_withheld IS DISTINCT FROM OLD.retainage_withheld
     OR NEW.method IS DISTINCT FROM OLD.method
     OR NEW.note IS DISTINCT FROM OLD.note
     OR NEW.over_stage IS DISTINCT FROM OLD.over_stage
     OR NEW.company_id IS DISTINCT FROM OLD.company_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'A recorded payment is immutable — soft-delete and re-enter to correct it.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

CREATE TRIGGER expense_payments_column_scope
  BEFORE UPDATE ON public.expense_payments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_expense_payments_column_scope();

ALTER TABLE public.expense_payments ENABLE ROW LEVEL SECURITY;

-- SELECT: the expense-dollars audience (Owner/Admin/PM/Foreman) via the
-- parent expense's project — the expense_allocations pattern. Crew excluded
-- (§4: crew has nothing in 7C; their own receipts never carry payments).
CREATE POLICY expense_payments_select_scoped ON public.expense_payments
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text, 'foreman'::text])
    AND EXISTS (
      SELECT 1 FROM public.expenses e
      WHERE e.id = expense_payments.expense_id
        AND public.can_view_project(e.project_id)
    )
  );

-- INSERT: Owner/Admin only — recording a payment is money out. (The
-- Owner-ONLY arms — schedule-final + retainage release — are enforced in
-- record_expense_payment; RLS cannot see "final".)
CREATE POLICY expense_payments_insert_authorized ON public.expense_payments
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
    AND EXISTS (
      SELECT 1 FROM public.expenses e
      WHERE e.id = expense_payments.expense_id
        AND public.can_view_project(e.project_id)
    )
  );

-- UPDATE: Owner/Admin only; the column-scope trigger narrows this to the
-- soft-delete columns. No DELETE policy — trash-bin pattern.
CREATE POLICY expense_payments_update_owner_admin ON public.expense_payments
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
  )
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
  );

-- ----------------------------------------------------------------------------
-- 5. subcontractor_contracts — retainage shape (spec §2.3, decision 5)
--    Chosen per sub, per job, at payment-schedule setup. No cross-column
--    CHECK: final_hold legitimately has NULL percent; the setup RPC validates
--    the pairing.
-- ----------------------------------------------------------------------------

ALTER TABLE public.subcontractor_contracts
  ADD COLUMN retainage_shape   text CHECK (retainage_shape IS NULL
                                           OR retainage_shape IN ('percent_across', 'final_hold')),
  ADD COLUMN retainage_percent numeric(5,2) CHECK (retainage_percent IS NULL
                                                   OR retainage_percent >= 0);

-- ----------------------------------------------------------------------------
-- 6. purchase_orders.total_amount (spec §2.4, locked decision 2b + Q8)
--    Nullable; NO line-item pricing (locked). Entering the total IS the
--    commitment — set_po_total_amount (below) upserts the PO's committed
--    expense row. recompute_po_status is quantity-only; zero interaction.
-- ----------------------------------------------------------------------------

ALTER TABLE public.purchase_orders
  ADD COLUMN total_amount numeric(12,2);

-- ----------------------------------------------------------------------------
-- 7. subcontractor_compliance_documents (spec §2.5 — shipped verbatim from
--    5I §3a; 5I keeps design ownership). Compliance status is DERIVED, never
--    stored (current/expiring_soon/expired from expiration_date vs today;
--    thresholds −30/−7). expiration_date NULL = no expiry (W9), never alerted.
-- ----------------------------------------------------------------------------

CREATE TABLE public.subcontractor_compliance_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid DEFAULT public.get_my_company_id() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid DEFAULT auth.uid(),
    updated_by uuid DEFAULT auth.uid(),
    is_deleted boolean DEFAULT false,
    deleted_at timestamp with time zone,

    member_id       uuid NOT NULL,
    doc_type        text NOT NULL,
    file_id         uuid,
    issued_date     date,
    expiration_date date,
    notes           text,

    CONSTRAINT subcontractor_compliance_documents_pkey PRIMARY KEY (id),
    CONSTRAINT subcontractor_compliance_documents_doc_type_check
      CHECK (doc_type = ANY (ARRAY['coi'::text, 'license'::text, 'w9'::text, 'other'::text]))
);

ALTER TABLE ONLY public.subcontractor_compliance_documents
    ADD CONSTRAINT subcontractor_compliance_documents_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);
ALTER TABLE ONLY public.subcontractor_compliance_documents
    ADD CONSTRAINT subcontractor_compliance_documents_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.company_members(id);
-- Files have a permanent-delete path (Owner/Admin): the compliance row must
-- survive as "doc missing" rather than vanish with the blob.
ALTER TABLE ONLY public.subcontractor_compliance_documents
    ADD CONSTRAINT subcontractor_compliance_documents_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.files(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.subcontractor_compliance_documents
    ADD CONSTRAINT subcontractor_compliance_documents_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE ONLY public.subcontractor_compliance_documents
    ADD CONSTRAINT subcontractor_compliance_documents_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);

CREATE INDEX idx_subcontractor_compliance_documents_member_id
  ON public.subcontractor_compliance_documents (member_id);
-- Backs the −30/−7 expiry sweep (calendar + advisory surfaces).
CREATE INDEX idx_subcontractor_compliance_documents_expiration_date
  ON public.subcontractor_compliance_documents (expiration_date);

CREATE TRIGGER subcontractor_compliance_documents_updated_at
  BEFORE UPDATE ON public.subcontractor_compliance_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE FUNCTION public.set_subcontractor_compliance_documents_updated_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER subcontractor_compliance_documents_set_updated_by
  BEFORE UPDATE ON public.subcontractor_compliance_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_subcontractor_compliance_documents_updated_by();

ALTER TABLE public.subcontractor_compliance_documents ENABLE ROW LEVEL SECURITY;

-- 5I Path A: the office (Owner/Admin/PM) uploads and maintains docs. Members
-- are company-scoped, not project-scoped. Sub self-service is 5I's portal
-- (Path B), not built here. No DELETE policy — soft delete.
CREATE POLICY subcontractor_compliance_documents_select_authorized
  ON public.subcontractor_compliance_documents
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text])
  );

CREATE POLICY subcontractor_compliance_documents_insert_authorized
  ON public.subcontractor_compliance_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text])
  );

CREATE POLICY subcontractor_compliance_documents_update_authorized
  ON public.subcontractor_compliance_documents
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text])
  )
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text])
  );

-- ----------------------------------------------------------------------------
-- 8. subcontractors.did_not_finish (spec §6.6, placement settled S90: the sub
--    record — it sits beside the other reputation fields, rating/preferred).
--    The narrative lives on the closed-out expense rows (closeout_reason);
--    the sub record carries only the flag. Written by the closeout flow.
-- ----------------------------------------------------------------------------

ALTER TABLE public.subcontractors
  ADD COLUMN did_not_finish boolean NOT NULL DEFAULT false;

-- ----------------------------------------------------------------------------
-- 9. RPCs — SECURITY INVOKER throughout (approve_expense precedent): RLS and
--    the column-scope triggers still gate every row these functions touch.
-- ----------------------------------------------------------------------------

-- 9a. setup_payment_schedule (spec §3.2 → shipped with schema, 7A precedent).
--     Atomic: contract retainage columns + one committed stage row per stage.
--     Stage rows land status='pending' (the uniform gate — approval via the
--     existing queue/approve_expense; the founder's confirm in the trace).
--     Σ-vs-contract_value mismatch RETURNS a warning, never errors (P2);
--     NULL contract_value → warn + manual stages (Q7ii).
CREATE FUNCTION public.setup_payment_schedule(
  p_sub_contract_id uuid,
  p_stages jsonb,                        -- [{"label": text, "amount": numeric}, ...]
  p_retainage_shape text DEFAULT NULL,
  p_retainage_percent numeric DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_contract RECORD;
  v_supplier text;
  v_stage RECORD;
  v_total numeric := 0;
  v_count integer := 0;
  v_warning text := NULL;
BEGIN
  IF public.get_my_role() IS NULL
     OR public.get_my_role() NOT IN ('owner', 'admin', 'project_manager') THEN
    RAISE EXCEPTION 'Only Owner/Admin/PM may set up a payment schedule.';
  END IF;

  -- RLS scopes the contract (PM must be assigned to the project).
  SELECT * INTO v_contract
  FROM subcontractor_contracts
  WHERE id = p_sub_contract_id AND is_deleted = false
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'setup_payment_schedule: contract not found';
  END IF;
  IF v_contract.status = 'void' THEN
    RAISE EXCEPTION 'setup_payment_schedule: contract is void';
  END IF;

  -- One schedule per contract in v1.
  PERFORM 1 FROM expenses
  WHERE sub_contract_id = p_sub_contract_id
    AND is_retainage = false
    AND is_deleted = false;
  IF FOUND THEN
    RAISE EXCEPTION 'setup_payment_schedule: a schedule already exists for this contract';
  END IF;

  -- Retainage pairing (§2.3): percent_across needs a percent; final_hold and
  -- no-retainage do not.
  IF p_retainage_shape IS NOT NULL
     AND p_retainage_shape NOT IN ('percent_across', 'final_hold') THEN
    RAISE EXCEPTION 'setup_payment_schedule: unknown retainage shape %', p_retainage_shape;
  END IF;
  IF p_retainage_shape = 'percent_across'
     AND (p_retainage_percent IS NULL OR p_retainage_percent < 0) THEN
    RAISE EXCEPTION 'setup_payment_schedule: percent_across needs a retainage percent';
  END IF;

  SELECT display_name INTO v_supplier
  FROM company_members WHERE id = v_contract.member_id;

  FOR v_stage IN
    SELECT s ->> 'label' AS label, (s ->> 'amount')::numeric AS amount
    FROM jsonb_array_elements(p_stages) s
  LOOP
    IF v_stage.label IS NULL OR btrim(v_stage.label) = '' THEN
      RAISE EXCEPTION 'setup_payment_schedule: every stage needs a label';
    END IF;
    IF v_stage.amount IS NULL OR v_stage.amount <= 0 THEN
      RAISE EXCEPTION 'setup_payment_schedule: every stage needs a positive amount';
    END IF;

    INSERT INTO expenses (
      project_id, supplier, expense_date, amount,
      cost_category, state, sub_contract_id, stage_label
    ) VALUES (
      v_contract.project_id, COALESCE(v_supplier, 'Subcontractor'), CURRENT_DATE, v_stage.amount,
      'subcontractor', 'committed', p_sub_contract_id, btrim(v_stage.label)
    );

    v_total := v_total + v_stage.amount;
    v_count := v_count + 1;
  END LOOP;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'setup_payment_schedule: at least one stage is required';
  END IF;

  UPDATE subcontractor_contracts
  SET retainage_shape = p_retainage_shape,
      retainage_percent = p_retainage_percent
  WHERE id = p_sub_contract_id;

  IF v_contract.contract_value IS NULL THEN
    v_warning := 'No contract value on record — stages entered without a total to check against.';
  ELSIF v_total <> v_contract.contract_value THEN
    v_warning := format('Stages total %s but the contract value is %s.', v_total, v_contract.contract_value);
  END IF;

  RETURN jsonb_build_object('stage_count', v_count, 'stage_total', v_total, 'warning', v_warning);
END;
$$;

-- 9b. record_expense_payment — the payment write (§2.2/§2.6, live split).
--     Paid dollars are actual AT PAYMENT TIME by derivation; this function
--     additionally: flags over-stage (override allowed, never silently),
--     withholds shape-(a) retainage into the auto-maintained accrual row,
--     flips the settlement marker when remaining hits 0, and enforces the
--     Owner-ONLY arms (retainage release; the payment that settles a sub
--     contract's full schedule). Caller must be Owner/Admin (INSERT policy).
CREATE FUNCTION public.record_expense_payment(
  p_expense_id uuid,
  p_paid_date date,
  p_amount numeric,
  p_method text DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_override_over_stage boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_me uuid := public.get_my_member_id();
  v_expense RECORD;
  v_contract RECORD;
  v_paid numeric := 0;
  v_over boolean := false;
  v_remaining numeric;
  v_contract_remaining numeric;
  v_withhold numeric := 0;
  v_retainage_id uuid;
BEGIN
  IF public.get_my_role() IS NULL
     OR public.get_my_role() NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Only Owner/Admin may record payments.';
  END IF;
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'No member identity for the payer.';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'record_expense_payment: amount must be positive';
  END IF;
  IF p_paid_date IS NULL THEN
    RAISE EXCEPTION 'record_expense_payment: paid_date is required';
  END IF;

  SELECT * INTO v_expense
  FROM expenses
  WHERE id = p_expense_id AND is_deleted = false
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'record_expense_payment: expense not found';
  END IF;
  IF v_expense.status <> 'approved' THEN
    RAISE EXCEPTION 'record_expense_payment: only approved rows take payments (this one is %)', v_expense.status;
  END IF;
  IF v_expense.closed_out_at IS NOT NULL THEN
    RAISE EXCEPTION 'record_expense_payment: this commitment was closed out';
  END IF;
  -- Payments are a payable concept: a 7A point-of-purchase receipt was paid
  -- at the register and never takes payments.
  IF v_expense.state <> 'committed'
     AND v_expense.sub_contract_id IS NULL
     AND v_expense.purchase_order_id IS NULL
     AND NOT v_expense.is_retainage THEN
    RAISE EXCEPTION 'record_expense_payment: this row is a receipt, not a payable';
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_paid
  FROM expense_payments
  WHERE expense_id = p_expense_id AND is_deleted = false;

  v_over := (v_paid + p_amount) > v_expense.amount + 0.004;
  IF v_over AND NOT p_override_over_stage THEN
    RAISE EXCEPTION 'OVER_STAGE: this payment exceeds the remaining balance — confirm the override to proceed';
  END IF;

  -- Owner-ONLY arms (CLAUDE.md owner-only #5): retainage release, and the
  -- payment that settles the sub contract's full schedule.
  IF v_expense.is_retainage AND public.get_my_role() <> 'owner' THEN
    RAISE EXCEPTION 'Retainage release is Owner only.';
  END IF;
  IF NOT v_expense.is_retainage AND v_expense.sub_contract_id IS NOT NULL THEN
    SELECT COALESCE(SUM(GREATEST(e.amount - COALESCE(p.paid, 0), 0)), 0)
      INTO v_contract_remaining
    FROM expenses e
    LEFT JOIN (
      SELECT expense_id, SUM(amount) AS paid
      FROM expense_payments
      WHERE is_deleted = false
      GROUP BY expense_id
    ) p ON p.expense_id = e.id
    WHERE e.sub_contract_id = v_expense.sub_contract_id
      AND e.is_retainage = false
      AND e.closed_out_at IS NULL
      AND e.is_deleted = false
      AND e.status = 'approved';
    IF v_contract_remaining - p_amount <= 0.004 AND public.get_my_role() <> 'owner' THEN
      RAISE EXCEPTION 'The final payment of a sub''s schedule is Owner only.';
    END IF;
  END IF;

  -- Shape (a) retainage: compute the withhold on THIS payment first, so it
  -- is stored ON the payment row (S91 fix — amount is GROSS, the check cut
  -- is amount − retainage_withheld, cash out is the NET).
  IF NOT v_expense.is_retainage AND v_expense.sub_contract_id IS NOT NULL THEN
    SELECT * INTO v_contract
    FROM subcontractor_contracts
    WHERE id = v_expense.sub_contract_id AND is_deleted = false;

    IF FOUND AND v_contract.retainage_shape = 'percent_across'
       AND COALESCE(v_contract.retainage_percent, 0) > 0 THEN
      v_withhold := round(p_amount * v_contract.retainage_percent / 100.0, 2);
    END IF;
  END IF;

  INSERT INTO expense_payments (expense_id, paid_date, amount, retainage_withheld, method, note, over_stage)
  VALUES (p_expense_id, p_paid_date, p_amount, v_withhold, p_method, p_note, v_over);

  -- Mirror the withhold into the contract's auto-maintained accrual row —
  -- the bookkeeping mirror of Σ retainage_withheld (the same held-back
  -- dollars, committed until released), never a second obligation.
  IF v_withhold > 0 THEN
    SELECT id INTO v_retainage_id
    FROM expenses
    WHERE sub_contract_id = v_expense.sub_contract_id
      AND is_retainage = true
      AND is_deleted = false
    FOR UPDATE;

    IF v_retainage_id IS NULL THEN
      -- Born approved in effect: inserted pending (the policy pins it),
      -- then approved in the same transaction — a system bookkeeping row
      -- must not sit in the founder's review queue.
      INSERT INTO expenses (
        project_id, supplier, expense_date, amount,
        cost_category, state, sub_contract_id, stage_label, is_retainage
      ) VALUES (
        v_expense.project_id,
        'Retainage held — ' || COALESCE((SELECT display_name FROM company_members WHERE id = v_contract.member_id), 'sub'),
        CURRENT_DATE, v_withhold,
        'subcontractor', 'committed', v_expense.sub_contract_id, 'Retainage', true
      ) RETURNING id INTO v_retainage_id;

      UPDATE expenses
      SET status = 'approved', approved_by = v_me, approved_at = now()
      WHERE id = v_retainage_id;
    ELSE
      UPDATE expenses
      SET amount = amount + v_withhold
      WHERE id = v_retainage_id;
    END IF;
  END IF;

  -- Settlement marker only (§2.2): money math never reads state.
  v_remaining := v_expense.amount - (v_paid + p_amount);
  IF v_remaining <= 0.004 AND v_expense.state = 'committed' THEN
    UPDATE expenses SET state = 'actual' WHERE id = p_expense_id;
  END IF;

  RETURN jsonb_build_object(
    'over_stage', v_over,
    'remaining', GREATEST(v_remaining, 0),
    'retainage_withheld', v_withhold
  );
END;
$$;

-- 9c. set_po_total_amount — entering the total IS the commitment (Q8).
--     Upserts the PO's open committed expense row; editing the total adjusts
--     it. No separate commit button.
CREATE FUNCTION public.set_po_total_amount(
  p_po_id uuid,
  p_amount numeric
) RETURNS uuid
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_po RECORD;
  v_expense_id uuid;
BEGIN
  IF public.get_my_role() IS NULL
     OR public.get_my_role() NOT IN ('owner', 'admin', 'project_manager') THEN
    RAISE EXCEPTION 'Only Owner/Admin/PM may set a PO total.';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'set_po_total_amount: amount must be positive';
  END IF;

  SELECT * INTO v_po
  FROM purchase_orders
  WHERE id = p_po_id AND is_deleted = false
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'set_po_total_amount: purchase order not found';
  END IF;

  UPDATE purchase_orders SET total_amount = p_amount WHERE id = p_po_id;

  -- Plain SELECT (not FOR UPDATE): a FOR UPDATE here is RLS-filtered by the
  -- UPDATE policy, so a PM adjusting an approved commitment would silently
  -- see no row and INSERT a duplicate. Find it first, then let the UPDATE's
  -- own RLS answer decide.
  SELECT id INTO v_expense_id
  FROM expenses
  WHERE purchase_order_id = p_po_id
    AND closed_out_at IS NULL
    AND is_deleted = false;

  IF v_expense_id IS NULL THEN
    INSERT INTO expenses (
      project_id, supplier, expense_date, amount,
      description, cost_category, state, purchase_order_id
    ) VALUES (
      v_po.project_id, v_po.vendor_name, CURRENT_DATE, p_amount,
      CASE WHEN v_po.po_number IS NOT NULL THEN 'PO ' || v_po.po_number ELSE 'Purchase order commitment' END,
      'material', 'committed', p_po_id
    ) RETURNING id INTO v_expense_id;
  ELSE
    UPDATE expenses SET amount = p_amount WHERE id = v_expense_id;
    IF NOT FOUND THEN
      -- RLS refused the adjust (e.g. PM on an approved row — Owner/Admin only).
      RAISE EXCEPTION 'set_po_total_amount: you cannot adjust this commitment (approved commitments are Owner/Admin)';
    END IF;
  END IF;

  RETURN v_expense_id;
END;
$$;
