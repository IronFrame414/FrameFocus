-- =============================================================================
-- Migration: 7d_invoicing  (Module 7D1 — client invoicing, SCHEMA LAYER)
-- Authority: docs/specs/7d1-spec.md as committed (§S filled, S97 rulings D1/D2
-- recorded). money-representation.md as amended (A-9 four cost-plus rates).
--
-- WHAT THIS CREATES
--   1. companies        — invoice_number_prefix / invoice_number_sequence (§10)
--   2. next_invoice_number()   — strictly sequential per company (§10)
--   3. invoices         — the invoice record (§2, §5, §9, §11)
--   4. invoice_lines    — every line incl. derived, discount and CREDIT lines
--                         (§8, §4a, §4b, §3a)
--   5. invoice_cost_claims — the billed marker for COSTS (§6.2 / §S K2)
--   6. invoice_hour_claims — the billed marker for HOURS (§7.2 / §S K2)
--   7. files.invoice_id — the invoice PDF link (§S S.8)
--   8. immutability trigger — a SENT invoice never changes (§8)
--
-- WHAT IT DELIBERATELY DOES **NOT** CREATE
--   * NO tax-base-per-instrument field (§6.3). §6.3 delegates this to CC with
--     an explicit collapse rule: "If [expense rows] hold only a tax-inclusive
--     total with no recoverable split, the pre-tax option cannot be computed
--     and this setting collapses to tax-inclusive only." VERIFIED against the
--     live schema: public.expenses carries supplier, expense_date, amount,
--     description, cost_category, state, status, approval columns,
--     source_segment_id, qb_export_status — and NO apply_tax flag, NO tax rate
--     and NO stored tax component (20260728010000). The split is therefore
--     unrecoverable and the setting collapses per the spec's own rule. Markup
--     is always computed on the stored (tax-inclusive, money-rep P3) cost.
--   * NO tasks->line-item link. Ruled WITHDRAWN by Josh (§7.2, S97 D2).
--   * NO structured selection-overage marker (PROVISIONAL — see below).
--   * NO draw-schedule object (§1 v1 boundary — the user types each draw).
--   * NO rate-supersede "flagged" column: §10's flag is DERIVED at read from
--     invoice_lines.instrument_rate_id -> instrument_rates.superseded_at. A
--     stored flag could go stale; a derivation cannot. This is also why §8
--     makes the rate ROW IDENTITY mandatory.
--   * NO negative-CO "available/placed" column: §4a's available state is
--     DERIVED — a signed CO with net_delta < 0 and no invoice_lines row of
--     type 'credit_negative_co' pointing at it is AVAILABLE.
--   * NO deposit "credit balance" column: §3a's remaining balance is DERIVED —
--     the deposit invoice's billed_total less the sum of credit_deposit lines
--     that reference it.
--   * NOTHING client-facing, no QuickBooks export, no pay link, no email
--     (Pre-M9 gate + 7G).
--
-- PROVISIONAL DECISIONS (Josh away; safest reversible option taken; each is
-- reversible without data loss — see docs/sessions/S97-7D-build.md):
--   P-1  MISC / UNATTRIBUTED COSTS ARE NOT BILLABLE. A cost reaches an
--        instrument only through expense_allocations -> project_budget_items
--        -> (source_line_* = the estimate instrument | source_change_order_id
--        = that CO). A cost allocated ONLY to the is_miscellaneous bucket, or
--        not allocated at all, has NO instrument and cannot be priced by any
--        instrument's rates (§S K1). It is therefore not billable. It is NOT
--        hidden: the picker surfaces it as blocked with the reason, honoring
--        §6.2's "nothing silently disappears". REVERSAL: a rule change in the
--        service layer only (no schema change) once Josh rules D3.
--   P-2  INVOICE NUMBERING is strictly sequential per company, immutable, no
--        reuse, no suffixes (§10), drawn from a company counter exactly like
--        estimates/projects. Prefix defaults to 'INV'. REVERSAL: change the
--        prefix default / the format inside next_invoice_number(); existing
--        numbers are immutable by design and are NOT rewritten.
--   P-3  NO structured selection-overage marker in v1 — a selection overage is
--        an ordinary change order (§S S.10, architecture §7.4). REVERSAL:
--        add a column or reason_category convention to change_orders later;
--        nothing here depends on its absence.
--   P-4  DAY-SPLIT ROUNDING: the picker keeps a person's day together and
--        warns when a day would be split across two invoices (§7.2's build
--        consequence). Enforced in the service/UI layer, not by constraint —
--        splitting a day is legal, just warned. REVERSAL: drop the warning.
--
-- CONVENTIONS: CLAUDE.md — standard columns, per-tenant column defaults, the
-- updated_at + set_*_updated_by trigger pair, RLS on every table, soft delete
-- (invoices are NEVER hard deleted — a voided invoice is retained forever,
-- §9), cost columns numeric(12,2) matching 7A/7C money columns.
--
-- ROLES: Owner/Admin/PM create (§12); PM-created invoices need Owner/Admin
-- approval before send. Foreman/Crew have NO access to client billing.
-- Row visibility rides can_view_project(), so a PM sees only assigned jobs.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. Company invoice numbering (§10, P-2)
-- ----------------------------------------------------------------------------

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS invoice_number_prefix text DEFAULT 'INV'::text NOT NULL;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS invoice_number_sequence integer DEFAULT 0 NOT NULL;

-- Mirrors next_project_number() / next_estimate_number(): advance the company
-- counter and format. 3-digit minimum, grows past 999 without truncation.
-- SECURITY DEFINER so the UPDATE on companies is not blocked by RLS.
CREATE OR REPLACE FUNCTION public.next_invoice_number() RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_company_id uuid := get_my_company_id();
  v_seq integer;
  v_prefix text;
BEGIN
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'next_invoice_number: no company for caller';
  END IF;

  UPDATE companies
  SET invoice_number_sequence = invoice_number_sequence + 1
  WHERE id = v_company_id
  RETURNING invoice_number_sequence, invoice_number_prefix
  INTO v_seq, v_prefix;

  RETURN COALESCE(v_prefix, 'INV') || '-' ||
    CASE
      WHEN length(v_seq::text) >= 4 THEN v_seq::text
      ELSE lpad(v_seq::text, 4, '0')
    END;
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. invoices (§2, §5, §9, §11)
--    status: draft -> pending_approval (PM path, §12) -> sent -> paid, plus
--    voided. 7D never sets 'paid' — 7E does when money lands; the value lives
--    in the CHECK here because 7D owns the status model (§9).
-- ----------------------------------------------------------------------------

CREATE TABLE public.invoices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid DEFAULT public.get_my_company_id() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid DEFAULT auth.uid(),
    updated_by uuid DEFAULT auth.uid(),
    is_deleted boolean DEFAULT false,
    deleted_at timestamp with time zone,

    project_id uuid NOT NULL,
    invoice_number text DEFAULT public.next_invoice_number() NOT NULL,
    author_member_id uuid DEFAULT public.get_my_member_id() NOT NULL,

    title text,
    status text DEFAULT 'draft'::text NOT NULL,

    -- 'deposit' invoices take NO retainage (§5) and open a job credit balance
    -- that draws down across later invoices (§3a).
    invoice_type text DEFAULT 'standard'::text NOT NULL,

    -- §4b: the under-allowance credit is offered ONLY on the final invoice.
    is_final boolean DEFAULT false NOT NULL,

    -- §11 — chosen per invoice; defaults from the source instrument's format
    -- in the service layer (the M4 "a setting with no control is a bug" lesson
    -- means this ships WITH a control).
    presentation_level text DEFAULT 'lump_sum'::text NOT NULL,

    issue_date date DEFAULT CURRENT_DATE NOT NULL,
    due_date date,

    -- §5 — defaults from projects.retainage_percent, editable per invoice,
    -- NEVER on a deposit or a T&M invoice (enforced in the service layer,
    -- which is the only place that knows the instrument's contract type).
    retainage_percent numeric(6,3),
    retainage_withheld numeric(12,2) DEFAULT 0 NOT NULL,

    -- §8 — BOTH figures survive. derived_total is what the system computed;
    -- billed_total is what the client was actually charged (derived lines +
    -- discount/credit lines). 7G exports and 7H reports BILLED, never derived.
    derived_total numeric(12,2) DEFAULT 0 NOT NULL,
    billed_total numeric(12,2) DEFAULT 0 NOT NULL,
    -- §5 — the receivable is billed_total - retainage_withheld. This is the
    -- ONLY figure that ages in 7E's 30/60/90; the withheld amount does not.
    amount_receivable numeric(12,2) DEFAULT 0 NOT NULL,

    -- §12 — PM-created invoices require Owner/Admin approval before send.
    approved_by uuid,
    approved_at timestamp with time zone,
    sent_at timestamp with time zone,

    -- §9 — void requires a reason. Retained forever, never deleted.
    voided_at timestamp with time zone,
    voided_by uuid,
    void_reason text,

    -- §10 — the correction is a NEW invoice linked back to its predecessor.
    -- Optional per §10 ("an optional supersedes link").
    supersedes_invoice_id uuid,

    notes text,

    CONSTRAINT invoices_pkey PRIMARY KEY (id),
    CONSTRAINT invoices_status_check
      CHECK (status = ANY (ARRAY['draft'::text, 'pending_approval'::text,
                                 'sent'::text, 'paid'::text, 'voided'::text])),
    CONSTRAINT invoices_type_check
      CHECK (invoice_type = ANY (ARRAY['standard'::text, 'deposit'::text])),
    CONSTRAINT invoices_presentation_level_check
      CHECK (presentation_level = ANY (ARRAY['full_detail'::text, 'by_section'::text,
                                             'lump_sum'::text])),
    -- §9: a void carries a reason, always. Shape-checked both ways so a void
    -- can never be recorded without one and a reason can never sit on a live
    -- invoice (the instrument_rates_superseded_shape precedent).
    CONSTRAINT invoices_void_shape_check
      CHECK ((voided_at IS NULL) = (void_reason IS NULL)),
    CONSTRAINT invoices_retainage_percent_check
      CHECK (retainage_percent IS NULL OR (retainage_percent >= 0 AND retainage_percent <= 100)),
    CONSTRAINT invoices_retainage_withheld_check CHECK (retainage_withheld >= 0),
    -- §5: a deposit invoice NEVER withholds retainage.
    CONSTRAINT invoices_deposit_no_retainage_check
      CHECK (invoice_type <> 'deposit' OR retainage_withheld = 0),
    CONSTRAINT invoices_company_invoice_number_key UNIQUE (company_id, invoice_number)
);

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);
ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id);
ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_author_member_id_fkey FOREIGN KEY (author_member_id) REFERENCES public.company_members(id);
ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.company_members(id);
ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_voided_by_fkey FOREIGN KEY (voided_by) REFERENCES public.company_members(id);
ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_supersedes_invoice_id_fkey FOREIGN KEY (supersedes_invoice_id) REFERENCES public.invoices(id);
ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);

ALTER TABLE public.invoices ALTER COLUMN company_id SET DEFAULT public.get_my_company_id();
ALTER TABLE public.invoices ALTER COLUMN created_by SET DEFAULT auth.uid();
ALTER TABLE public.invoices ALTER COLUMN updated_by SET DEFAULT auth.uid();

CREATE INDEX idx_invoices_company_id ON public.invoices USING btree (company_id);
CREATE INDEX idx_invoices_project_id ON public.invoices USING btree (project_id);
CREATE INDEX idx_invoices_status ON public.invoices USING btree (status);
CREATE INDEX idx_invoices_supersedes_invoice_id ON public.invoices USING btree (supersedes_invoice_id)
  WHERE supersedes_invoice_id IS NOT NULL;

CREATE TRIGGER invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE FUNCTION public.set_invoices_updated_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER invoices_set_updated_by
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_invoices_updated_by();

-- ----------------------------------------------------------------------------
-- 3. invoice_lines (§8, §11, §4a, §4b, §3a)
--    Every client-visible line. A DISCOUNT and every CREDIT are ordinary lines
--    with a NEGATIVE billed_amount (§8, §4a as amended) — there is no separate
--    credit document anywhere in 7D.
-- ----------------------------------------------------------------------------

CREATE TABLE public.invoice_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid DEFAULT public.get_my_company_id() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid DEFAULT auth.uid(),
    updated_by uuid DEFAULT auth.uid(),

    invoice_id uuid NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,

    -- 'derived_cost'   — a picked cost row priced at its category's rate (§6.1)
    -- 'derived_labor'  — billable hours x the flat labor rate (§6.1 / §7)
    -- 'fixed'          — a fixed-price draw or a standalone/manual line (§2)
    -- 'discount'       — R1 reduction, negative, client-visible (§8)
    -- 'credit_negative_co'  — signed negative CO placed here (§4a)
    -- 'credit_allowance'    — under-allowance credit, final invoice only (§4b)
    -- 'credit_deposit'      — deposit credit balance drawn down (§3a)
    line_type text NOT NULL,

    -- §15-B: "the client sees the title Josh puts on the line item" — there is
    -- no separate description model.
    description text NOT NULL,

    -- §8 — determines WHICH of the four cost-plus rates applied. NULL on
    -- non-derived lines.
    category text,

    -- Labor lines render as "hours @ rate" (§11 layout A). quantity also
    -- carries the ROUNDED billable hours (§7.2) — re-derivable from the hour
    -- claims below, stored because it is what the client was billed.
    quantity numeric(12,2),
    unit_rate numeric(12,2),

    -- §11 layout A shows the client the ACTUAL COST of each row. UNBURDENED
    -- always (§6.4 — burden never reaches a client bill).
    cost_basis numeric(12,2),

    -- §8 — both survive. billed_amount is SIGNED (negative for discount and
    -- every credit line); derived_amount is what the system computed.
    derived_amount numeric(12,2),
    billed_amount numeric(12,2) DEFAULT 0 NOT NULL,

    -- §8/§10 — THE RATE ROW'S IDENTITY, not just its value. Without this the
    -- invoices affected by a superseded rate cannot be found. instrument_rates
    -- is append-only with a one-way supersede stamp and has no DELETE policy,
    -- so a plain FK is audit-stable.
    instrument_rate_id uuid,

    -- Which instrument this line bills against (§2 — one invoice may pull from
    -- the estimate AND several COs). Both NULL on a standalone/manual line.
    source_estimate_id uuid,
    source_change_order_id uuid,

    -- §3a — the deposit invoice this credit line draws down.
    source_deposit_invoice_id uuid,

    CONSTRAINT invoice_lines_pkey PRIMARY KEY (id),
    CONSTRAINT invoice_lines_line_type_check
      CHECK (line_type = ANY (ARRAY['derived_cost'::text, 'derived_labor'::text,
                                    'fixed'::text, 'discount'::text,
                                    'credit_negative_co'::text,
                                    'credit_allowance'::text,
                                    'credit_deposit'::text])),
    CONSTRAINT invoice_lines_category_check
      CHECK (category IS NULL OR category = ANY (ARRAY['labor'::text, 'material'::text,
                                                       'subcontractor'::text, 'other'::text])),
    -- Every credit and the discount are NEGATIVE by construction — this is the
    -- constraint that makes "no credit stands loose" (§1) structural rather
    -- than conventional.
    CONSTRAINT invoice_lines_credit_sign_check
      CHECK (line_type NOT IN ('discount', 'credit_negative_co', 'credit_allowance',
                               'credit_deposit')
             OR billed_amount <= 0),
    -- A line bills against at most ONE instrument (the instrument_rates
    -- one_instrument precedent).
    CONSTRAINT invoice_lines_one_instrument_check
      CHECK (source_estimate_id IS NULL OR source_change_order_id IS NULL),
    -- A labor line is hours x rate; both must be present to render §11's
    -- "42 hrs @ $100/hr".
    CONSTRAINT invoice_lines_labor_shape_check
      CHECK (line_type <> 'derived_labor'
             OR (quantity IS NOT NULL AND unit_rate IS NOT NULL))
);

ALTER TABLE ONLY public.invoice_lines
    ADD CONSTRAINT invoice_lines_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);
ALTER TABLE ONLY public.invoice_lines
    ADD CONSTRAINT invoice_lines_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.invoice_lines
    ADD CONSTRAINT invoice_lines_instrument_rate_id_fkey FOREIGN KEY (instrument_rate_id) REFERENCES public.instrument_rates(id);
ALTER TABLE ONLY public.invoice_lines
    ADD CONSTRAINT invoice_lines_source_estimate_id_fkey FOREIGN KEY (source_estimate_id) REFERENCES public.estimates(id);
ALTER TABLE ONLY public.invoice_lines
    ADD CONSTRAINT invoice_lines_source_change_order_id_fkey FOREIGN KEY (source_change_order_id) REFERENCES public.change_orders(id);
ALTER TABLE ONLY public.invoice_lines
    ADD CONSTRAINT invoice_lines_source_deposit_invoice_id_fkey FOREIGN KEY (source_deposit_invoice_id) REFERENCES public.invoices(id);
ALTER TABLE ONLY public.invoice_lines
    ADD CONSTRAINT invoice_lines_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE ONLY public.invoice_lines
    ADD CONSTRAINT invoice_lines_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);

ALTER TABLE public.invoice_lines ALTER COLUMN company_id SET DEFAULT public.get_my_company_id();
ALTER TABLE public.invoice_lines ALTER COLUMN created_by SET DEFAULT auth.uid();
ALTER TABLE public.invoice_lines ALTER COLUMN updated_by SET DEFAULT auth.uid();

CREATE INDEX idx_invoice_lines_company_id ON public.invoice_lines USING btree (company_id);
CREATE INDEX idx_invoice_lines_invoice_id ON public.invoice_lines USING btree (invoice_id);
CREATE INDEX idx_invoice_lines_instrument_rate_id ON public.invoice_lines USING btree (instrument_rate_id)
  WHERE instrument_rate_id IS NOT NULL;
CREATE INDEX idx_invoice_lines_source_change_order_id ON public.invoice_lines USING btree (source_change_order_id)
  WHERE source_change_order_id IS NOT NULL;
CREATE INDEX idx_invoice_lines_source_deposit_invoice_id ON public.invoice_lines USING btree (source_deposit_invoice_id)
  WHERE source_deposit_invoice_id IS NOT NULL;

CREATE TRIGGER invoice_lines_updated_at
  BEFORE UPDATE ON public.invoice_lines
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE FUNCTION public.set_invoice_lines_updated_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER invoice_lines_set_updated_by
  BEFORE UPDATE ON public.invoice_lines
  FOR EACH ROW EXECUTE FUNCTION public.set_invoice_lines_updated_by();

-- ----------------------------------------------------------------------------
-- 4. invoice_cost_claims — the BILLED MARKER for costs (§6.2, §S K2)
--    Claims an expense_allocation, not an expense: an expense may be split
--    across budget items belonging to DIFFERENT instruments, and only the
--    allocated portion belongs to this instrument.
--    A claimed allocation stops appearing in the picker; releasing the claim
--    (voiding the invoice) returns it to the picker (§6.2, §9).
--
--    DELIBERATE DEVIATION from the append-only-log convention (CLAUDE.md):
--    claim rows carry id/company_id/created_at/created_by and NO updated_*/
--    is_deleted — they are INSERT-or-DELETE, never updated — but unlike a pure
--    audit log they DO get a DELETE policy. Voiding an invoice must RELEASE its
--    claims so the costs return to the picker and the reissue (§10) can claim
--    them again; without release, a voided invoice would strand its costs
--    permanently. The audit of what a voided invoice billed survives on its
--    frozen invoice_lines, which are retained forever (§9).
-- ----------------------------------------------------------------------------

CREATE TABLE public.invoice_cost_claims (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid DEFAULT public.get_my_company_id() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    created_by uuid DEFAULT auth.uid(),

    invoice_id uuid NOT NULL,
    invoice_line_id uuid NOT NULL,
    expense_allocation_id uuid NOT NULL,

    -- Snapshot of what was billed against, so the claim survives an upstream
    -- edit (money-rep P3: cost is stored tax-inclusive; §6.4: never burdened).
    claimed_amount numeric(12,2) NOT NULL,
    expense_date date NOT NULL,
    cost_category text NOT NULL,

    CONSTRAINT invoice_cost_claims_pkey PRIMARY KEY (id),
    CONSTRAINT invoice_cost_claims_category_check
      CHECK (cost_category = ANY (ARRAY['material'::text, 'subcontractor'::text, 'other'::text]))
);

ALTER TABLE ONLY public.invoice_cost_claims
    ADD CONSTRAINT invoice_cost_claims_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);
ALTER TABLE ONLY public.invoice_cost_claims
    ADD CONSTRAINT invoice_cost_claims_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.invoice_cost_claims
    ADD CONSTRAINT invoice_cost_claims_invoice_line_id_fkey FOREIGN KEY (invoice_line_id) REFERENCES public.invoice_lines(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.invoice_cost_claims
    ADD CONSTRAINT invoice_cost_claims_expense_allocation_id_fkey FOREIGN KEY (expense_allocation_id) REFERENCES public.expense_allocations(id);
ALTER TABLE ONLY public.invoice_cost_claims
    ADD CONSTRAINT invoice_cost_claims_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE public.invoice_cost_claims ALTER COLUMN company_id SET DEFAULT public.get_my_company_id();
ALTER TABLE public.invoice_cost_claims ALTER COLUMN created_by SET DEFAULT auth.uid();

CREATE INDEX idx_invoice_cost_claims_company_id ON public.invoice_cost_claims USING btree (company_id);
CREATE INDEX idx_invoice_cost_claims_invoice_id ON public.invoice_cost_claims USING btree (invoice_id);
CREATE INDEX idx_invoice_cost_claims_expense_allocation_id
  ON public.invoice_cost_claims USING btree (expense_allocation_id);

-- ONE live claim per allocation: a cost can be billed once. The claim row is
-- deleted when its invoice is voided/deleted (CASCADE), which returns the cost
-- to the picker — exactly §6.2's "keeps appearing until billed".
CREATE UNIQUE INDEX invoice_cost_claims_one_per_allocation
  ON public.invoice_cost_claims (expense_allocation_id);

-- ----------------------------------------------------------------------------
-- 5. invoice_hour_claims — the BILLED MARKER for hours (§7.2, §S K2)
--    One row per CLAIMED SEGMENT. The rounded billable quantity lives on the
--    invoice_line, and is fully RE-DERIVABLE from these rows: group by
--    (member_id, work_date), sum raw_hours, round each group UP to the half
--    hour, sum the groups (§7.2). Storing the claim set is what makes the
--    rounding reproducible — the segments alone are not enough because the
--    SELECTION is the input.
-- ----------------------------------------------------------------------------

CREATE TABLE public.invoice_hour_claims (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid DEFAULT public.get_my_company_id() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    created_by uuid DEFAULT auth.uid(),

    invoice_id uuid NOT NULL,
    invoice_line_id uuid NOT NULL,
    time_segment_id uuid NOT NULL,

    -- The rounding group (§7.2: per person, per day) and the raw contribution.
    member_id uuid NOT NULL,
    work_date date NOT NULL,
    raw_hours numeric(8,4) NOT NULL,

    CONSTRAINT invoice_hour_claims_pkey PRIMARY KEY (id),
    CONSTRAINT invoice_hour_claims_raw_hours_check CHECK (raw_hours >= 0)
);

ALTER TABLE ONLY public.invoice_hour_claims
    ADD CONSTRAINT invoice_hour_claims_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);
ALTER TABLE ONLY public.invoice_hour_claims
    ADD CONSTRAINT invoice_hour_claims_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.invoice_hour_claims
    ADD CONSTRAINT invoice_hour_claims_invoice_line_id_fkey FOREIGN KEY (invoice_line_id) REFERENCES public.invoice_lines(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.invoice_hour_claims
    ADD CONSTRAINT invoice_hour_claims_time_segment_id_fkey FOREIGN KEY (time_segment_id) REFERENCES public.time_segments(id);
ALTER TABLE ONLY public.invoice_hour_claims
    ADD CONSTRAINT invoice_hour_claims_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.company_members(id);
ALTER TABLE ONLY public.invoice_hour_claims
    ADD CONSTRAINT invoice_hour_claims_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE public.invoice_hour_claims ALTER COLUMN company_id SET DEFAULT public.get_my_company_id();
ALTER TABLE public.invoice_hour_claims ALTER COLUMN created_by SET DEFAULT auth.uid();

CREATE INDEX idx_invoice_hour_claims_company_id ON public.invoice_hour_claims USING btree (company_id);
CREATE INDEX idx_invoice_hour_claims_invoice_id ON public.invoice_hour_claims USING btree (invoice_id);
CREATE INDEX idx_invoice_hour_claims_time_segment_id
  ON public.invoice_hour_claims USING btree (time_segment_id);
CREATE INDEX idx_invoice_hour_claims_group
  ON public.invoice_hour_claims USING btree (member_id, work_date);

-- ONE live claim per segment: an hour can be billed once (§7.2).
CREATE UNIQUE INDEX invoice_hour_claims_one_per_segment
  ON public.invoice_hour_claims (time_segment_id);

-- ----------------------------------------------------------------------------
-- 6. files.invoice_id (§S S.8) — the invoice PDF, inheriting the whole
--    files/project-files pattern. Nullable domain pointer, ON DELETE SET NULL
--    (nothing cascades into files), partial index — the 20260728010000
--    expense_id precedent. Category 'invoices' is ALREADY in
--    files_category_check (baseline) and already gated to Owner/Admin/PM by
--    the 20260728000000 security pass — no CHECK change, no policy change.
-- ----------------------------------------------------------------------------

ALTER TABLE public.files
  ADD COLUMN IF NOT EXISTS invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_files_invoice_id
  ON public.files (invoice_id)
  WHERE invoice_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 7. Immutability of a SENT invoice (§8: "A sent invoice is immutable. Its
--    billed amounts are frozen at send.")
--    Enforced in the DB because it is load-bearing money behavior, not a UI
--    nicety. Once status is sent/paid/voided the money columns freeze; only
--    the lifecycle transitions and their own columns may still move.
--    Owner/Admin are NOT exempt — immutability is the point.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_invoice_immutability()
RETURNS TRIGGER AS $$
BEGIN
  -- Nothing is frozen while the invoice is still a draft or awaiting approval.
  IF OLD.status = ANY (ARRAY['draft'::text, 'pending_approval'::text]) THEN
    RETURN NEW;
  END IF;

  -- From here OLD.status is sent, paid or voided: the money is frozen.
  IF NEW.derived_total      IS DISTINCT FROM OLD.derived_total
     OR NEW.billed_total    IS DISTINCT FROM OLD.billed_total
     OR NEW.amount_receivable IS DISTINCT FROM OLD.amount_receivable
     OR NEW.retainage_withheld IS DISTINCT FROM OLD.retainage_withheld
     OR NEW.retainage_percent  IS DISTINCT FROM OLD.retainage_percent
     OR NEW.invoice_number  IS DISTINCT FROM OLD.invoice_number
     OR NEW.invoice_type    IS DISTINCT FROM OLD.invoice_type
     OR NEW.project_id      IS DISTINCT FROM OLD.project_id
     OR NEW.issue_date      IS DISTINCT FROM OLD.issue_date THEN
    RAISE EXCEPTION 'A sent invoice is immutable (7D spec 8). Void and reissue instead.';
  END IF;

  -- A voided invoice is frozen forever and never returns to life (9).
  IF OLD.status = 'voided' AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'A voided invoice is frozen forever (7D spec 9).';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER invoices_immutability
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.enforce_invoice_immutability();

-- Lines of a sent invoice are frozen too — otherwise the total could stay put
-- while its composition changed underneath.
-- NOTE: TG_OP is branched explicitly rather than using COALESCE(NEW, OLD).
-- In a DELETE trigger NEW is NOT ASSIGNED (not merely NULL), so touching
-- NEW.invoice_id — or COALESCE over the whole record — raises
-- "record new is not assigned yet".
CREATE OR REPLACE FUNCTION public.enforce_invoice_line_parent_open()
RETURNS TRIGGER AS $$
DECLARE
  v_status text;
  v_invoice uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_invoice := OLD.invoice_id;
  ELSE
    v_invoice := NEW.invoice_id;
  END IF;

  SELECT status INTO v_status FROM public.invoices WHERE id = v_invoice;

  -- The parent is already gone (CASCADE delete of the invoice) — nothing to
  -- protect, and blocking here would make an invoice undeletable.
  IF v_status IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  IF v_status <> ALL (ARRAY['draft'::text, 'pending_approval'::text]) THEN
    RAISE EXCEPTION 'Lines of a sent invoice are immutable (7D spec 8). Void and reissue instead.';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER invoice_lines_parent_open
  BEFORE INSERT OR UPDATE OR DELETE ON public.invoice_lines
  FOR EACH ROW EXECUTE FUNCTION public.enforce_invoice_line_parent_open();

-- ----------------------------------------------------------------------------
-- 8. RLS
--    Client billing is Owner/Admin/PM only (12). Foreman/Crew never see it.
--    Row visibility rides can_view_project(), so a PM sees only assigned jobs
--    — the same predicate change_orders uses.
--    No DELETE policy anywhere: an invoice is soft-deleted while draft and a
--    voided invoice is retained forever (9).
-- ----------------------------------------------------------------------------

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY invoices_select_visible ON public.invoices
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text])
    AND public.can_view_project(project_id)
  );

CREATE POLICY invoices_insert_authorized ON public.invoices
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text])
    AND public.can_view_project(project_id)
  );

CREATE POLICY invoices_update_authorized ON public.invoices
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text])
    AND public.can_view_project(project_id)
  );

ALTER TABLE public.invoice_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY invoice_lines_select_visible ON public.invoice_lines
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = invoice_lines.invoice_id
    )
  );

CREATE POLICY invoice_lines_insert_authorized ON public.invoice_lines
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = invoice_lines.invoice_id
    )
  );

CREATE POLICY invoice_lines_update_authorized ON public.invoice_lines
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = invoice_lines.invoice_id
    )
  );

CREATE POLICY invoice_lines_delete_authorized ON public.invoice_lines
  FOR DELETE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = invoice_lines.invoice_id
    )
  );

ALTER TABLE public.invoice_cost_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY invoice_cost_claims_select_visible ON public.invoice_cost_claims
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = invoice_cost_claims.invoice_id
    )
  );

CREATE POLICY invoice_cost_claims_insert_authorized ON public.invoice_cost_claims
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = invoice_cost_claims.invoice_id
    )
  );

CREATE POLICY invoice_cost_claims_delete_authorized ON public.invoice_cost_claims
  FOR DELETE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = invoice_cost_claims.invoice_id
    )
  );

ALTER TABLE public.invoice_hour_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY invoice_hour_claims_select_visible ON public.invoice_hour_claims
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = invoice_hour_claims.invoice_id
    )
  );

CREATE POLICY invoice_hour_claims_insert_authorized ON public.invoice_hour_claims
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = invoice_hour_claims.invoice_id
    )
  );

CREATE POLICY invoice_hour_claims_delete_authorized ON public.invoice_hour_claims
  FOR DELETE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = invoice_hour_claims.invoice_id
    )
  );
