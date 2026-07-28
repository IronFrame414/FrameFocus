-- ============================================================================
-- Module 7 / 7A — Job Expenses + Job Cost Rollup (schema layer)
-- Spec: docs/specs/7A-spec.md §2.1–§2.6, §2.8 (S89 interview + amendments:
-- sell reversal, committed|actual state, burden frozen at approval
-- forward-only, receipts-only boundary). Services/UI ship separately —
-- this migration is the §2 schema ONLY. No 7C columns (sub_contract_id,
-- due_date, awaiting_paper, …) — those land with 7C's own migration.
--
-- Contents:
--   1. expenses               — receipts capture + uniform review gate
--   2. expense_allocations    — optional split against budget lines
--   3. actual_amount recompute (6D recompute pattern, SECURITY DEFINER)
--   4. files.expense_id       — receipt photos (20260721080000 precedent)
--   5. companies GL mapping   — four account-path columns (7G ride-along)
--   6. Labor burden           — member_burden_settings + company fixed $/hr
--                               + burden FROZEN into rate snapshots at
--                               approval (forward-only; NULL = pass-through)
--   7. RLS + column scope     — floor-honoring policies; INSERT-time gate
--   8. approve_expense RPC    — atomic approve + allocate (INVOKER)
--
-- Trigger hygiene per 20260728000000: SECURITY DEFINER functions carry
-- SET search_path TO 'public'; the column-scope trigger early-returns when
-- auth.uid() IS NULL so service-role writers are unaffected.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. expenses (§2.1)
-- ----------------------------------------------------------------------------

CREATE TABLE public.expenses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid DEFAULT public.get_my_company_id() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid DEFAULT auth.uid(),
    updated_by uuid DEFAULT auth.uid(),
    is_deleted boolean DEFAULT false,
    deleted_at timestamp with time zone,

    project_id uuid NOT NULL,                          -- Q2 (7A Phase 2): NOT NULL, job always required
    author_member_id uuid DEFAULT public.get_my_member_id() NOT NULL,  -- domain author (5D/6B/6D pattern)

    supplier text NOT NULL,
    expense_date date NOT NULL,                        -- client sets (company-tz calendar day, 6B log_date convention)
    amount numeric(12,2) NOT NULL,
    description text,
    -- 'labor' deliberately excluded (7A Q5). 'subcontractor' is NOT capturable
    -- (S89 7C boundary): capture surfaces + RLS below restrict it; the value
    -- exists solely for 7C bill/commitment writers.
    cost_category text DEFAULT 'material'::text NOT NULL,

    -- S89 amendment: committed/actual per architecture P1. v1 writes 'actual'
    -- ONLY — the INSERT policy pins it. Committed writers land with 7C.
    state text DEFAULT 'actual'::text NOT NULL,

    -- Uniform review gate (locked decision 3 + Phase 2 Q7): EVERY expense is
    -- pending until Owner/Admin approves; rejected requires a note.
    status text DEFAULT 'pending'::text NOT NULL,
    approved_by uuid,
    approved_at timestamp with time zone,
    rejected_by uuid,
    rejected_at timestamp with time zone,
    rejection_note text,

    source_segment_id uuid,                            -- set when born from a material-run prompt
    qb_export_status text,                             -- stub, Module 7G (time_clock_sessions precedent)

    CONSTRAINT expenses_pkey PRIMARY KEY (id),
    CONSTRAINT expenses_amount_positive_check CHECK (amount > 0),
    CONSTRAINT expenses_cost_category_check
      CHECK (cost_category = ANY (ARRAY['material'::text, 'subcontractor'::text, 'other'::text])),
    CONSTRAINT expenses_state_check
      CHECK (state = ANY (ARRAY['committed'::text, 'actual'::text])),
    CONSTRAINT expenses_status_check
      CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])),
    CONSTRAINT expenses_rejection_note_check
      CHECK (status <> 'rejected' OR rejection_note IS NOT NULL)
);

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);
ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id);
ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_author_member_id_fkey FOREIGN KEY (author_member_id) REFERENCES public.company_members(id);
ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.company_members(id);
ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_rejected_by_fkey FOREIGN KEY (rejected_by) REFERENCES public.company_members(id);
ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_source_segment_id_fkey FOREIGN KEY (source_segment_id) REFERENCES public.time_segments(id);
ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);

CREATE INDEX idx_expenses_company_id ON public.expenses USING btree (company_id);
CREATE INDEX idx_expenses_project_id ON public.expenses USING btree (project_id);
CREATE INDEX idx_expenses_status ON public.expenses USING btree (status);
CREATE INDEX idx_expenses_author_member_id ON public.expenses USING btree (author_member_id);
CREATE INDEX idx_expenses_expense_date ON public.expenses USING btree (expense_date);

CREATE TRIGGER expenses_updated_at
  BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE FUNCTION public.set_expenses_updated_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER expenses_set_updated_by
  BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.set_expenses_updated_by();

-- ----------------------------------------------------------------------------
-- 2. expense_allocations (§2.2) — optional split of an APPROVED expense
--    across budget lines. Σ(amount) <= expense.amount is enforced by the
--    approve_expense RPC + service layer (no cross-row CHECK).
-- ----------------------------------------------------------------------------

CREATE TABLE public.expense_allocations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid DEFAULT public.get_my_company_id() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid DEFAULT auth.uid(),
    updated_by uuid DEFAULT auth.uid(),
    is_deleted boolean DEFAULT false,
    deleted_at timestamp with time zone,

    expense_id uuid NOT NULL,
    budget_item_id uuid NOT NULL,
    amount numeric(12,2) NOT NULL,

    CONSTRAINT expense_allocations_pkey PRIMARY KEY (id),
    CONSTRAINT expense_allocations_amount_positive_check CHECK (amount > 0),
    CONSTRAINT expense_allocations_expense_line_key UNIQUE (expense_id, budget_item_id)
);

ALTER TABLE ONLY public.expense_allocations
    ADD CONSTRAINT expense_allocations_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);
ALTER TABLE ONLY public.expense_allocations
    ADD CONSTRAINT expense_allocations_expense_id_fkey FOREIGN KEY (expense_id) REFERENCES public.expenses(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.expense_allocations
    ADD CONSTRAINT expense_allocations_budget_item_id_fkey FOREIGN KEY (budget_item_id) REFERENCES public.project_budget_items(id);
ALTER TABLE ONLY public.expense_allocations
    ADD CONSTRAINT expense_allocations_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE ONLY public.expense_allocations
    ADD CONSTRAINT expense_allocations_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);

CREATE INDEX idx_expense_allocations_company_id ON public.expense_allocations USING btree (company_id);
CREATE INDEX idx_expense_allocations_expense_id ON public.expense_allocations USING btree (expense_id);
CREATE INDEX idx_expense_allocations_budget_item_id ON public.expense_allocations USING btree (budget_item_id);

CREATE TRIGGER expense_allocations_updated_at
  BEFORE UPDATE ON public.expense_allocations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE FUNCTION public.set_expense_allocations_updated_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER expense_allocations_set_updated_by
  BEFORE UPDATE ON public.expense_allocations
  FOR EACH ROW EXECUTE FUNCTION public.set_expense_allocations_updated_by();

-- ----------------------------------------------------------------------------
-- 3. actual_amount recompute (§2.3 — the 6D recompute pattern). SECURITY
--    DEFINER because project_budget_items has NO UPDATE policy: this trigger
--    chain is the only writer of actual_amount. INVARIANT (7A Q5,
--    load-bearing): actual_amount receives APPROVED, state='actual' expense
--    allocations ONLY — labor dollars are never persisted here (the table's
--    SELECT is can_view_project on all columns; persisted labor would leak
--    below the financial floor). The state filter is a v1 no-op — nothing
--    writes 'committed' — but keeps the column semantically actual-only when
--    7C's committed writers land.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.recompute_budget_item_actual(p_budget_item_id uuid)
RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_actual numeric;
BEGIN
  IF p_budget_item_id IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(a.amount), 0)
  INTO v_actual
  FROM expense_allocations a
  JOIN expenses e ON e.id = a.expense_id
  WHERE a.budget_item_id = p_budget_item_id
    AND a.is_deleted = false
    AND e.status = 'approved'
    AND e.state = 'actual'
    AND e.is_deleted = false;

  -- Guarded so an unchanged value doesn't churn updated_at (6D precedent).
  UPDATE project_budget_items
  SET actual_amount = v_actual
  WHERE id = p_budget_item_id
    AND actual_amount IS DISTINCT FROM v_actual;
END;
$$;

-- Row trigger on allocations: recompute the touched line(s) on every write.
CREATE OR REPLACE FUNCTION public.expense_allocations_recompute()
RETURNS TRIGGER
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_old uuid;
  v_new uuid;
BEGIN
  v_old := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN OLD.budget_item_id END;
  v_new := CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN NEW.budget_item_id END;

  IF v_new IS NOT NULL THEN
    PERFORM public.recompute_budget_item_actual(v_new);
  END IF;
  IF v_old IS NOT NULL AND v_old IS DISTINCT FROM v_new THEN
    PERFORM public.recompute_budget_item_actual(v_old);
  END IF;

  RETURN NULL;
END;
$$;

CREATE TRIGGER expense_allocations_recompute_actual
  AFTER INSERT OR UPDATE OR DELETE ON public.expense_allocations
  FOR EACH ROW EXECUTE FUNCTION public.expense_allocations_recompute();

-- Parent trigger: a status/state/amount/soft-delete change on an expense
-- re-derives every line it was allocated against.
CREATE OR REPLACE FUNCTION public.expenses_recompute_allocations()
RETURNS TRIGGER
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_item uuid;
BEGIN
  FOR v_item IN
    SELECT DISTINCT a.budget_item_id
    FROM expense_allocations a
    WHERE a.expense_id = NEW.id
      AND a.is_deleted = false
  LOOP
    PERFORM public.recompute_budget_item_actual(v_item);
  END LOOP;
  RETURN NULL;
END;
$$;

CREATE TRIGGER expenses_recompute_on_change
  AFTER UPDATE ON public.expenses
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status
        OR OLD.state IS DISTINCT FROM NEW.state
        OR OLD.amount IS DISTINCT FROM NEW.amount
        OR OLD.is_deleted IS DISTINCT FROM NEW.is_deleted)
  EXECUTE FUNCTION public.expenses_recompute_allocations();

-- ----------------------------------------------------------------------------
-- 4. files.expense_id (§2.4) — receipt photos, multi-photo per expense.
--    Exactly the 20260721080000 daily_log_id precedent: nullable domain
--    pointer on files, ON DELETE SET NULL (nothing cascades into files),
--    partial index. Category 'receipts' is already in files_category_check —
--    no CHECK change. Receipts always carry project_id (expenses.project_id
--    is NOT NULL), so they ride the #96 project-scoped policy arm.
-- ----------------------------------------------------------------------------

ALTER TABLE files ADD COLUMN IF NOT EXISTS expense_id uuid REFERENCES expenses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_files_expense_id
  ON files (expense_id)
  WHERE expense_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 5. companies — GL account mapping (§2.5). Free-text QB account paths;
--    NULL = connector prompts at 7G export time. gl_account_labor exists for
--    the FUTURE labor export (labor is not a capture category);
--    gl_account_subcontractor is consumed by 7C's bills.
-- ----------------------------------------------------------------------------

ALTER TABLE public.companies
  ADD COLUMN gl_account_labor          text,
  ADD COLUMN gl_account_material       text,
  ADD COLUMN gl_account_subcontractor  text,
  ADD COLUMN gl_account_other          text;

-- ----------------------------------------------------------------------------
-- 6. Labor burden (§2.6). Per-member multiplier + source toggle at the
--    pay-rates floor (Owner/Admin-only table — deliberately NOT columns on
--    company-readable company_members); company fixed $/hr on companies
--    (KNOWN floor caveat: companies_select_own exposes it company-wide —
--    carried to FINANCIAL-RLS-FLOOR). Burden is FROZEN into the approval
--    snapshot, forward-only: approved labor cost never re-prices.
-- ----------------------------------------------------------------------------

CREATE TABLE public.member_burden_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid DEFAULT public.get_my_company_id() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid DEFAULT auth.uid(),
    updated_by uuid DEFAULT auth.uid(),
    is_deleted boolean DEFAULT false,
    deleted_at timestamp with time zone,

    member_id uuid NOT NULL,
    burden_multiplier numeric(6,3) DEFAULT 1.0 NOT NULL,   -- 1.0 = pass-through until Bishop
                                                           -- calculates its true burden (§7.8.3)
    burden_source text DEFAULT 'member_multiplier'::text NOT NULL,

    CONSTRAINT member_burden_settings_pkey PRIMARY KEY (id),
    CONSTRAINT member_burden_settings_member_key UNIQUE (member_id),
    CONSTRAINT member_burden_settings_multiplier_check CHECK (burden_multiplier > 0),
    CONSTRAINT member_burden_settings_source_check
      CHECK (burden_source = ANY (ARRAY['member_multiplier'::text, 'company_fixed'::text]))
);

ALTER TABLE ONLY public.member_burden_settings
    ADD CONSTRAINT member_burden_settings_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);
ALTER TABLE ONLY public.member_burden_settings
    ADD CONSTRAINT member_burden_settings_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.company_members(id);
ALTER TABLE ONLY public.member_burden_settings
    ADD CONSTRAINT member_burden_settings_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE ONLY public.member_burden_settings
    ADD CONSTRAINT member_burden_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);

CREATE INDEX idx_member_burden_settings_company_id ON public.member_burden_settings USING btree (company_id);
CREATE INDEX idx_member_burden_settings_member_id ON public.member_burden_settings USING btree (member_id);

CREATE TRIGGER member_burden_settings_updated_at
  BEFORE UPDATE ON public.member_burden_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE FUNCTION public.set_member_burden_settings_updated_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER member_burden_settings_set_updated_by
  BEFORE UPDATE ON public.member_burden_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_member_burden_settings_updated_by();

ALTER TABLE public.member_burden_settings ENABLE ROW LEVEL SECURITY;

-- Financial Visibility Floor: Owner/Admin only, reads AND writes — the
-- member_pay_rates template (20260721040000). No DELETE policy.
CREATE POLICY member_burden_settings_select_admin ON public.member_burden_settings
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
  );

CREATE POLICY member_burden_settings_insert_admin ON public.member_burden_settings
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
  );

CREATE POLICY member_burden_settings_update_admin ON public.member_burden_settings
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
  )
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
  );

-- Company fixed burden, dollars per hour (the '+' arm of the toggle).
ALTER TABLE public.companies
  ADD COLUMN fixed_burden_per_hour numeric(10,2);   -- nullable; NULL treated as 0

-- Burden freeze columns on the approval snapshot. Nullable: sessions approved
-- before these columns exist carry NULL = pass-through pricing, PERMANENTLY
-- (correct, not a data bug — do not backfill).
ALTER TABLE public.time_session_rate_snapshots
  ADD COLUMN burden_multiplier numeric(6,3),
  ADD COLUMN fixed_burden_per_hour numeric(10,2),
  ADD COLUMN burden_source text
    CONSTRAINT time_session_rate_snapshots_burden_source_check
      CHECK (burden_source IS NULL
             OR burden_source = ANY (ARRAY['member_multiplier'::text, 'company_fixed'::text]));

-- Extend snapshot_session_rate(): freeze the member's burden alongside the
-- rate at the pending->approved transition. ON CONFLICT DO NOTHING stands —
-- frozen means frozen, burden included; a later burden change affects FUTURE
-- approvals only (S89 follow-up decision).
CREATE OR REPLACE FUNCTION public.snapshot_session_rate()
RETURNS TRIGGER AS $$
DECLARE
  v_local_date date;
  v_rate numeric(10,2);
  v_effective date;
  v_burden_multiplier numeric(6,3);
  v_burden_source text;
  v_fixed numeric(10,2);
BEGIN
  -- Only the pending->approved transition (or a direct approved INSERT).
  IF TG_OP = 'UPDATE' AND (OLD.status IS NOT DISTINCT FROM NEW.status) THEN
    RETURN NULL;
  END IF;
  IF NEW.status IS DISTINCT FROM 'approved' THEN
    RETURN NULL;
  END IF;

  -- The session's calendar date in the COMPANY timezone (decision 8: an
  -- overnight session prices entirely at its clock-in date).
  SELECT (NEW.clock_in AT TIME ZONE c.timezone)::date
  INTO v_local_date
  FROM companies c
  WHERE c.id = NEW.company_id;

  -- Rate effective that day: latest effective_date <= the session date.
  SELECT r.hourly_rate, r.effective_date
  INTO v_rate, v_effective
  FROM member_pay_rates r
  WHERE r.member_id = NEW.member_id
    AND r.company_id = NEW.company_id
    AND r.is_deleted = false
    AND r.effective_date <= v_local_date
  ORDER BY r.effective_date DESC
  LIMIT 1;

  -- 7A §2.6: the member's burden AS OF THIS MOMENT, frozen forever.
  -- No burden row => NULLs => pass-through pricing (bare snapshot rate).
  SELECT b.burden_multiplier, b.burden_source
  INTO v_burden_multiplier, v_burden_source
  FROM member_burden_settings b
  WHERE b.member_id = NEW.member_id
    AND b.company_id = NEW.company_id
    AND b.is_deleted = false
  LIMIT 1;

  IF v_burden_source = 'company_fixed' THEN
    SELECT c.fixed_burden_per_hour
    INTO v_fixed
    FROM companies c
    WHERE c.id = NEW.company_id;
  END IF;

  -- Always write the freeze row — a NULL rate is itself frozen (decision 5).
  INSERT INTO time_session_rate_snapshots
    (company_id, session_id, member_id, hourly_rate, rate_effective_date,
     burden_multiplier, fixed_burden_per_hour, burden_source)
  VALUES
    (NEW.company_id, NEW.id, NEW.member_id, v_rate, v_effective,
     v_burden_multiplier, v_fixed, v_burden_source)
  ON CONFLICT (session_id) DO NOTHING;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

-- ----------------------------------------------------------------------------
-- 7. RLS — expenses + expense_allocations + project_budget_items INSERT
--    (§2.8). Self-contained: does not depend on the pending
--    FINANCIAL-RLS-FLOOR migration.
-- ----------------------------------------------------------------------------

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

-- SELECT: Owner/Admin/PM/Foreman on visible projects; crew their OWN rows
-- only (7A Q3 — crew see their own amounts + status, nothing else).
CREATE POLICY expenses_select_scoped ON public.expenses
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND (
      author_member_id = public.get_my_member_id()
      OR (
        public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text, 'foreman'::text])
        AND public.can_view_project(project_id)
      )
    )
  );

-- INSERT: any member on a visible project logs their own; Owner/Admin may
-- log for others (6A backfill precedent). INSERT-time gate (#96 lesson —
-- an UPDATE trigger cannot see inserts): every row arrives pending/actual
-- with empty review columns, for EVERY role (uniform gate, decision 3).
-- The subcontractor category is not capturable (S89 7C boundary).
-- >>> 7C MUST WIDEN THIS when committed writers land: state='committed' and
-- >>> cost_category='subcontractor' become legal for 7C's owner/admin/PM
-- >>> bill/commitment writers ONLY.
CREATE POLICY expenses_insert_authorized ON public.expenses
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND public.can_view_project(project_id)
    AND (
      author_member_id = public.get_my_member_id()
      OR public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
    )
    AND status = 'pending'
    AND state = 'actual'
    AND approved_by IS NULL
    AND approved_at IS NULL
    AND rejected_by IS NULL
    AND rejected_at IS NULL
    AND (
      cost_category <> 'subcontractor'
      OR public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  );

-- UPDATE: author while pending; Owner/Admin always. Column scope below
-- limits what a pending author may touch.
CREATE POLICY expenses_update_authorized ON public.expenses
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND (
      public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
      OR (author_member_id = public.get_my_member_id() AND status = 'pending')
    )
  )
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND (
      public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
      OR (author_member_id = public.get_my_member_id() AND status = 'pending')
    )
  );

-- No DELETE policy — soft delete is an UPDATE (trash-bin pattern).

-- Column scope (6A-2 pattern, 20260728000000 hygiene): the pending author
-- touches capture fields + their own soft-delete only; review and system
-- columns are Owner/Admin.
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

  -- S89 7C boundary: a receipt is never recategorized subcontractor —
  -- that's a 7C bill, written by 7C's writers only.
  IF NEW.cost_category IS DISTINCT FROM OLD.cost_category
     AND NEW.cost_category = 'subcontractor' THEN
    RAISE EXCEPTION 'The subcontractor category is set only by 7C bill writers.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

CREATE TRIGGER expenses_column_scope
  BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.enforce_expenses_column_scope();

ALTER TABLE public.expense_allocations ENABLE ROW LEVEL SECURITY;

-- SELECT: expense-dollars — the decision-6 expense audience (Owner/Admin/PM/
-- Foreman) via the parent expense's project. Crew excluded (allocation is
-- Owner/Admin bookkeeping; crew see their own expense rows, not the split).
CREATE POLICY expense_allocations_select_scoped ON public.expense_allocations
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text, 'foreman'::text])
    AND EXISTS (
      SELECT 1 FROM public.expenses e
      WHERE e.id = expense_allocations.expense_id
        AND public.can_view_project(e.project_id)
    )
  );

-- Writes: Owner/Admin only (the review flow).
CREATE POLICY expense_allocations_insert_admin ON public.expense_allocations
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
  );

CREATE POLICY expense_allocations_update_admin ON public.expense_allocations
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
  )
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
  );

CREATE POLICY expense_allocations_delete_admin ON public.expense_allocations
  FOR DELETE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
  );

-- Ad-hoc budget lines (7A Q4b): Owner/Admin may create lines from the review
-- popup (required for T&M/no-estimate projects, which start with zero lines).
-- project_budget_items previously had NO INSERT policy — conversion writes
-- via SECURITY DEFINER. Still no UPDATE policy: the recompute trigger is the
-- only writer of actual_amount.
CREATE POLICY project_budget_items_insert_admin ON public.project_budget_items
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
    AND public.can_view_project(project_id)
  );

-- ----------------------------------------------------------------------------
-- 8. approve_expense RPC (§3.3) — atomic approve + allocate. SECURITY
--    INVOKER (the approve_member_week precedent): RLS and the column-scope
--    trigger still gate every row; the actual_amount recompute fires from
--    the SECURITY DEFINER trigger chain, not from this function. Zero
--    allocations is legal (Option B — split is optional).
-- ----------------------------------------------------------------------------

CREATE FUNCTION public.approve_expense(
  p_expense_id uuid,
  p_allocations jsonb DEFAULT '[]'::jsonb
) RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_me uuid := public.get_my_member_id();
  v_expense RECORD;
  v_alloc RECORD;
  v_total numeric := 0;
BEGIN
  IF public.get_my_role() IS NULL
     OR public.get_my_role() NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Only Owner/Admin may approve expenses.';
  END IF;
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'No member identity for approver.';
  END IF;

  -- Row lock prevents two concurrent approvals of the same expense.
  SELECT * INTO v_expense
  FROM expenses
  WHERE id = p_expense_id
    AND company_id = public.get_my_company_id()
    AND is_deleted = false
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'approve_expense: expense not found';
  END IF;
  IF v_expense.status <> 'pending' THEN
    RAISE EXCEPTION 'approve_expense: expense is %, not pending', v_expense.status;
  END IF;

  FOR v_alloc IN
    SELECT (a ->> 'budget_item_id')::uuid AS budget_item_id,
           (a ->> 'amount')::numeric      AS amount
    FROM jsonb_array_elements(p_allocations) a
  LOOP
    IF v_alloc.budget_item_id IS NULL OR v_alloc.amount IS NULL OR v_alloc.amount <= 0 THEN
      RAISE EXCEPTION 'approve_expense: each allocation needs a budget line and a positive amount';
    END IF;

    -- Every line must belong to the expense's own project + company.
    PERFORM 1
    FROM project_budget_items b
    WHERE b.id = v_alloc.budget_item_id
      AND b.project_id = v_expense.project_id
      AND b.company_id = v_expense.company_id
      AND b.is_deleted = false;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'approve_expense: budget line % is not on this expense''s project', v_alloc.budget_item_id;
    END IF;

    v_total := v_total + v_alloc.amount;

    INSERT INTO expense_allocations (company_id, expense_id, budget_item_id, amount)
    VALUES (v_expense.company_id, p_expense_id, v_alloc.budget_item_id, v_alloc.amount);
  END LOOP;

  IF v_total > v_expense.amount THEN
    RAISE EXCEPTION 'approve_expense: allocations (%) exceed the expense amount (%)', v_total, v_expense.amount;
  END IF;

  UPDATE expenses
  SET status = 'approved',
      approved_by = v_me,
      approved_at = now()
  WHERE id = p_expense_id;
END;
$$;
