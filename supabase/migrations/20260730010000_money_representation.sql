-- ============================================================================
-- Money Representation (docs/specs/money-representation.md, FINAL rev 4 +
-- S93 build amendments) [S93]
--
-- NOT APPLIED by the build session — Josh applies via `npm run db:push`.
--
-- Principles implemented here (spec §1):
--   P1/P2  budgeted_amount is COST; sell is derived; no sell/tax columns.
--   P3     budget cost is TAX-INCLUSIVE on any taxed row except labor (A-1).
--   P4/P5  contract type + negotiated rates live on the instrument,
--          effective-dated, backdating bounded by the previous rate (DB
--          trigger; first rate free — the signing date), supersede-able.
--   P6     signed COs write their own budget lines (apply_change_order_budget).
--   P7     split-at-capture allocations; lazy Miscellaneous line.
--   P8     committed_amount stores GROSS; actual gains NET commitment
--          payments; recomputes sort by ORIGIN, never `state`.
--   P10    no backfill — existing rows are disregarded.
--
-- 7C extent (spec §5.3 as amended S93, Phase 2 Q1): setup_payment_schedule
-- and set_po_total_amount gain ADDITIVE-OPTIONAL budget-line targets;
-- record_expense_payment and the settlement flip are untouched; nothing
-- else in 7C moves.
--
-- Contents:
--   1. estimates — contract_type + projected_value (§4.2)
--   2. estimate_line_items.override_cost + clone_estimate_line (§4.1)
--      + set_line_override_cost (S-6 pre-flight write path, §5.5)
--   3. instrument_rates — table, backdating-guard trigger, supersede RPC (§4.2)
--   4. project_budget_items — source_change_order_id, is_miscellaneous (§4.3)
--   5. get_or_create_misc_budget_item (§5.5)
--   6. convert_estimate_to_project — amended cost mapping (§5.1)
--   7. apply_change_order_budget (§5.2)
--   8. recompute_budget_item_actual / _committed + trigger chain (§4.5/§5.3)
--   9. expense_allocations RLS — widened to capture authors (§4.4)
--  10. setup_payment_schedule / set_po_total_amount — allocation targets (§4.4)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. estimates — instrument contract type + user-entered projection (§4.2)
-- ----------------------------------------------------------------------------

ALTER TABLE public.estimates
  ADD COLUMN contract_type text DEFAULT 'fixed_price'::text NOT NULL
    CONSTRAINT estimates_contract_type_check
    CHECK (contract_type = ANY (ARRAY['fixed_price'::text,
                                      'cost_plus'::text,
                                      'time_and_materials'::text])),
  -- P11: user-entered projection for cost-plus/T&M. Blank by default; NEVER
  -- auto-derived from grand_total or anything else. NULL is a normal state.
  ADD COLUMN projected_value numeric;

-- ----------------------------------------------------------------------------
-- 2. estimate_line_items.override_cost (§4.1) — the estimator's cost basis
--    for a flat-priced line (total_price_override is a PRICE, not a cost).
--    Nullable at rest ("not entered yet"); the conversion prompt + RPC guard
--    (§5.1) resolve NULLs at convert time.
-- ----------------------------------------------------------------------------

ALTER TABLE public.estimate_line_items
  ADD COLUMN override_cost numeric;

-- clone_estimate_line copies an explicit column list — override_cost must
-- ride along or cloning silently drops the cost basis.
CREATE OR REPLACE FUNCTION public.clone_estimate_line(p_line public.estimate_line_items, p_new_estimate_id uuid, p_new_category_id uuid, p_new_subcategory_id uuid, p_company_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_new_line_id UUID;
BEGIN
  INSERT INTO estimate_line_items (
    company_id, estimate_id, category_id, subcategory_id,
    name, description,
    discount_type, discount_amount,
    total_price, total_price_override, override_cost, notes, sort_order
  ) VALUES (
    p_company_id, p_new_estimate_id, p_new_category_id, p_new_subcategory_id,
    p_line.name, p_line.description,
    p_line.discount_type, p_line.discount_amount,
    p_line.total_price, p_line.total_price_override, p_line.override_cost, p_line.notes, p_line.sort_order
  )
  RETURNING id INTO v_new_line_id;

  INSERT INTO estimate_line_rows (
    company_id, line_item_id, row_type, name, sort_order,
    markup_percent, apply_tax, total,
    rate, quantity, labor_unit,
    catalog_item_id, unit_of_measure, unit_cost,
    amount, subcontractor_id
  )
  SELECT
    p_company_id, v_new_line_id, r.row_type, r.name, r.sort_order,
    r.markup_percent, r.apply_tax, r.total,
    r.rate, r.quantity, r.labor_unit,
    r.catalog_item_id, r.unit_of_measure, r.unit_cost,
    r.amount, r.subcontractor_id
  FROM estimate_line_rows r
  WHERE r.line_item_id = p_line.id;

  RETURN v_new_line_id;
END;
$$;

-- set_line_override_cost — the S-6 conversion pre-flight's write path (§5.5).
-- estimate_line_items_update_manager pins line UPDATEs to DRAFT estimates,
-- but the pre-flight fills missing costs at CONVERT time, when the estimate
-- is typically accepted/frozen. SECURITY DEFINER, deliberately narrow: the
-- one column, flat-priced lines only, Owner/Admin/PM (the conversion
-- audience, §7.3), never after conversion. It records a cost basis — it can
-- never move sell.
CREATE FUNCTION public.set_line_override_cost(
  p_line_id uuid,
  p_cost numeric
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_line RECORD;
  v_estimate RECORD;
BEGIN
  IF public.get_my_role() IS NULL
     OR public.get_my_role() NOT IN ('owner', 'admin', 'project_manager') THEN
    RAISE EXCEPTION 'Only Owner/Admin/PM may set a line cost.';
  END IF;
  IF p_cost IS NULL OR p_cost < 0 THEN
    RAISE EXCEPTION 'set_line_override_cost: cost must be zero or more';
  END IF;

  SELECT * INTO v_line
  FROM estimate_line_items
  WHERE id = p_line_id AND company_id = public.get_my_company_id()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'set_line_override_cost: line not found';
  END IF;
  IF v_line.total_price_override IS NULL THEN
    RAISE EXCEPTION 'set_line_override_cost: not a flat-priced line';
  END IF;

  SELECT * INTO v_estimate
  FROM estimates
  WHERE id = v_line.estimate_id AND is_deleted = false;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'set_line_override_cost: estimate not found';
  END IF;
  IF v_estimate.status = 'converted' OR v_estimate.project_id IS NOT NULL THEN
    RAISE EXCEPTION 'set_line_override_cost: this estimate is already converted';
  END IF;

  UPDATE estimate_line_items SET override_cost = p_cost WHERE id = p_line_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. instrument_rates (§4.2) — effective-dated negotiated rates. Append-only
--    with ONE narrow, one-way exception: the Owner-only supersede stamp
--    (supersede_instrument_rate below), applied at most once per row via RPC.
--    Rows are never deleted and never otherwise edited, so the CLAUDE.md
--    append-only pattern applies: no updated_*, no is_deleted; the supersede
--    columns carry their own audit fields.
-- ----------------------------------------------------------------------------

CREATE TABLE public.instrument_rates (
    id              uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id      uuid DEFAULT public.get_my_company_id() NOT NULL,
    created_at      timestamp with time zone DEFAULT now(),
    created_by      uuid DEFAULT auth.uid(),
    estimate_id     uuid,
    change_order_id uuid,
    rate_type       text NOT NULL,
    rate            numeric(8,2) NOT NULL,
    effective_from  date NOT NULL,
    -- Supersede stamp (spec §5.5): one-way correction of a mistyped rate.
    superseded_at     timestamp with time zone,
    superseded_by     uuid,
    superseded_reason text,

    CONSTRAINT instrument_rates_pkey PRIMARY KEY (id),
    CONSTRAINT instrument_rates_rate_type_check
      CHECK (rate_type = ANY (ARRAY['cost_plus_percent'::text,
                                    'tm_labor_hourly'::text,
                                    'tm_nonlabor_percent'::text])),
    CONSTRAINT instrument_rates_rate_check CHECK (rate >= 0),
    CONSTRAINT instrument_rates_one_instrument CHECK (
      (estimate_id IS NOT NULL) <> (change_order_id IS NOT NULL)),
    CONSTRAINT instrument_rates_superseded_shape CHECK (
      (superseded_at IS NULL) = (superseded_reason IS NULL))
);

ALTER TABLE ONLY public.instrument_rates
    ADD CONSTRAINT instrument_rates_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);
ALTER TABLE ONLY public.instrument_rates
    ADD CONSTRAINT instrument_rates_estimate_id_fkey FOREIGN KEY (estimate_id) REFERENCES public.estimates(id);
ALTER TABLE ONLY public.instrument_rates
    ADD CONSTRAINT instrument_rates_change_order_id_fkey FOREIGN KEY (change_order_id) REFERENCES public.change_orders(id);
ALTER TABLE ONLY public.instrument_rates
    ADD CONSTRAINT instrument_rates_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE ONLY public.instrument_rates
    ADD CONSTRAINT instrument_rates_superseded_by_fkey FOREIGN KEY (superseded_by) REFERENCES auth.users(id);

CREATE INDEX idx_instrument_rates_company_id ON public.instrument_rates USING btree (company_id);
CREATE INDEX idx_instrument_rates_estimate_id ON public.instrument_rates USING btree (estimate_id);
CREATE INDEX idx_instrument_rates_change_order_id ON public.instrument_rates USING btree (change_order_id);

-- Uniqueness (spec §4.2): a single UNIQUE across both instrument columns is
-- a NO-OP — exactly one is always NULL and NULLs are distinct. Two partial
-- unique indexes instead, one per instrument column. Superseded rows are
-- excluded so a corrective rate (§5.5) can reuse the superseded typo's
-- EXACT date — leaving even one day priced under the prior rate is not
-- acceptable.
CREATE UNIQUE INDEX instrument_rates_estimate_type_date_key
  ON public.instrument_rates (estimate_id, rate_type, effective_from)
  WHERE estimate_id IS NOT NULL AND superseded_at IS NULL;
CREATE UNIQUE INDEX instrument_rates_co_type_date_key
  ON public.instrument_rates (change_order_id, rate_type, effective_from)
  WHERE change_order_id IS NOT NULL AND superseded_at IS NULL;

-- Backdating guard (OQ-8 as amended — Josh's ruling, S93 follow-up):
--   * NO rate may be dated in the future. Nothing legitimate needs one.
--   * The FIRST rate on an instrument+rate_type may otherwise take ANY
--     effective_from, including months back — it records the contract
--     signing date. An agreement is often struck days before it can be
--     entered; the delay is data entry, not a change in the deal. Costs
--     dated between the handshake and the entry DO reprice — correct, the
--     deal was in force.
--   * LATER rates must be dated on or after the latest existing
--     (non-superseded) rate for that instrument+rate_type.
-- This does NOT reopen OQ-8: history before the previous rate stays
-- immutable, and there are still no UPDATE/DELETE policies. Superseded rows
-- drop out of the floor (and out of the unique indexes above), so a
-- correction (§5.5) can reuse the superseded typo's exact date.
-- Documented known issues (accepted): CURRENT_DATE is UTC, so users in
-- timezones ahead of UTC entering "today" late in their day can trip the
-- future-date rejection; and concurrent renegotiations are not serialized —
-- two simultaneous inserts can read the same floor.
CREATE FUNCTION public.instrument_rates_backdating_guard()
RETURNS TRIGGER AS $$
DECLARE
  v_latest date;
BEGIN
  IF NEW.effective_from > CURRENT_DATE THEN
    RAISE EXCEPTION 'A rate cannot be dated in the future (effective_from %).', NEW.effective_from;
  END IF;

  SELECT MAX(effective_from) INTO v_latest
  FROM public.instrument_rates
  WHERE rate_type = NEW.rate_type
    AND superseded_at IS NULL
    AND ((NEW.estimate_id IS NOT NULL AND estimate_id = NEW.estimate_id)
      OR (NEW.change_order_id IS NOT NULL AND change_order_id = NEW.change_order_id));

  -- First rate: backdate freely — it records the signing date.
  IF v_latest IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.effective_from < v_latest THEN
    RAISE EXCEPTION 'A renegotiated rate cannot be dated before the latest existing rate (%). History before the previous rate is immutable.', v_latest;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER instrument_rates_backdating_guard
  BEFORE INSERT ON public.instrument_rates
  FOR EACH ROW EXECUTE FUNCTION public.instrument_rates_backdating_guard();

ALTER TABLE public.instrument_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY instrument_rates_select_company ON public.instrument_rates
  FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id());

-- Renegotiation is Owner AND Admin (the Admin Role Principle — not on the
-- owner-only list). No UPDATE/DELETE policies: the supersede stamp is
-- applied only through the SECURITY DEFINER RPC below, never a policy.
CREATE POLICY instrument_rates_insert_authorized ON public.instrument_rates
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
  );

-- Supersede (spec §5.5): Owner-only — deliberately stricter than the
-- Owner/Admin INSERT (correcting history is a bigger lever than adding to
-- it). Requires a non-empty reason; stamps exactly once; the original row
-- is retained and there is no un-supersede. Rate-in-force lookups exclude
-- superseded rows, so a correction retroactively fixes derived sell
-- computed under the typo — intended.
CREATE FUNCTION public.supersede_instrument_rate(
  p_rate_id uuid,
  p_reason text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_rate RECORD;
BEGIN
  IF public.get_my_role() IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'Superseding a rate is Owner only.';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'supersede_instrument_rate: a reason is required';
  END IF;

  SELECT * INTO v_rate
  FROM instrument_rates
  WHERE id = p_rate_id AND company_id = public.get_my_company_id()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'supersede_instrument_rate: rate not found';
  END IF;
  IF v_rate.superseded_at IS NOT NULL THEN
    RAISE EXCEPTION 'supersede_instrument_rate: this rate is already superseded';
  END IF;

  UPDATE instrument_rates
  SET superseded_at = now(),
      superseded_by = auth.uid(),
      superseded_reason = btrim(p_reason)
  WHERE id = p_rate_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. project_budget_items — instrument provenance + Miscellaneous (§4.3).
--    Explicitly NOT added: any sell, profit, margin, or tax column (P1/P2).
-- ----------------------------------------------------------------------------

ALTER TABLE public.project_budget_items
  ADD COLUMN source_change_order_id uuid REFERENCES public.change_orders(id),
  ADD COLUMN is_miscellaneous boolean DEFAULT false NOT NULL;

CREATE INDEX idx_project_budget_items_source_change_order_id
  ON public.project_budget_items (source_change_order_id)
  WHERE source_change_order_id IS NOT NULL;

-- At most one LIVE Miscellaneous line per project; makes lazy get-or-create
-- race-safe (insert → unique violation → re-select). NOT is_deleted keeps
-- the predicate aligned with the function's liveness view (§5.5): a
-- soft-deleted Misc line must neither block the INSERT nor satisfy the
-- re-select, or the function returns NULL without error.
CREATE UNIQUE INDEX idx_project_budget_items_misc_one_per_project
  ON public.project_budget_items (project_id)
  WHERE is_miscellaneous AND NOT is_deleted;

-- ----------------------------------------------------------------------------
-- 5. get_or_create_misc_budget_item (§5.5) — lazy, on first use (OQ-9).
--    SECURITY DEFINER because field-role callers do not pass
--    project_budget_items_insert_admin (Owner/Admin only). Works identically
--    on estimate-born, no-estimate, and T&M projects — creation is
--    conversion-independent.
-- ----------------------------------------------------------------------------

CREATE FUNCTION public.get_or_create_misc_budget_item(p_project_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_company_id uuid;
  v_id uuid;
BEGIN
  IF NOT public.can_view_project(p_project_id) THEN
    RAISE EXCEPTION 'get_or_create_misc_budget_item: project not visible';
  END IF;

  SELECT company_id INTO v_company_id
  FROM projects
  WHERE id = p_project_id AND company_id = public.get_my_company_id();
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'get_or_create_misc_budget_item: project not found';
  END IF;

  SELECT id INTO v_id
  FROM project_budget_items
  WHERE project_id = p_project_id AND is_miscellaneous AND is_deleted = false;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO project_budget_items (
    company_id, project_id, description, budgeted_amount, is_miscellaneous, created_by
  ) VALUES (
    v_company_id, p_project_id, 'Miscellaneous', 0, true, auth.uid()
  )
  ON CONFLICT (project_id) WHERE is_miscellaneous AND NOT is_deleted DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    -- Lost the race — the winner's row is the line.
    SELECT id INTO v_id
    FROM project_budget_items
    WHERE project_id = p_project_id AND is_miscellaneous AND is_deleted = false;
  END IF;

  RETURN v_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. convert_estimate_to_project (§5.1) — three amendments to the 5A §8 RPC
--    (20260704212000): (1) tax-inclusive cost on every taxed non-labor row
--    (A-1); (2) the override fallback carries override_cost, never the sell
--    price (A-2), with a NULL guard behind the convert-screen prompt; (3)
--    contract_value is contract-type-aware — fixed copies grand_total,
--    cost-plus/T&M copy the user-entered projection (P11). No Miscellaneous
--    seeding (lazy, §5.5). Everything else is unchanged from the shipped RPC.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.convert_estimate_to_project(p_estimate_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_company_id UUID := get_my_company_id();
  v_role TEXT := get_my_role();
  v_estimate RECORD;
  v_project_id UUID;
  v_project_number TEXT;
  v_member_id UUID := get_my_member_id();
  v_is_signed BOOLEAN;
  v_contract_value numeric;
BEGIN
  -- Guards -------------------------------------------------------------------
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'convert_estimate_to_project: no company for caller';
  END IF;

  IF v_role IS NULL OR v_role NOT IN ('owner', 'admin', 'project_manager') THEN
    RAISE EXCEPTION 'convert_estimate_to_project: role % may not convert estimates', COALESCE(v_role, 'unknown');
  END IF;

  -- Row lock prevents two concurrent conversions of the same estimate
  SELECT * INTO v_estimate
  FROM estimates
  WHERE id = p_estimate_id
    AND company_id = v_company_id
    AND is_deleted = false
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'convert_estimate_to_project: estimate not found';
  END IF;

  IF v_estimate.project_id IS NOT NULL THEN
    RAISE EXCEPTION 'convert_estimate_to_project: estimate % is already converted', v_estimate.estimate_number;
  END IF;

  -- §5.1 guard (OQ-10): every flat-priced line needs a cost basis before
  -- conversion. The convert screen prompts for these (S-6); this RAISE is
  -- defense in depth behind it — fill in and retry, never silently zeroed.
  PERFORM 1
  FROM estimate_line_items li
  WHERE li.estimate_id = v_estimate.id
    AND li.total_price_override IS NOT NULL
    AND li.override_cost IS NULL
    AND NOT EXISTS (SELECT 1 FROM estimate_line_rows r WHERE r.line_item_id = li.id);
  IF FOUND THEN
    RAISE EXCEPTION 'convert_estimate_to_project: flat-priced lines are missing a cost — enter each line''s cost, then convert';
  END IF;

  -- 1. Public number: the estimate's digits with the PRJ prefix (copied
  --    as-is — no independent re-padding). EST-0001 -> PRJ-0001.
  v_project_number := 'PRJ-' || regexp_replace(v_estimate.estimate_number, '^.*-', '');

  v_is_signed := (v_estimate.signed_proposal_file_id IS NOT NULL) OR (v_estimate.accepted_at IS NOT NULL);

  -- Contract value (P11): fixed copies the computed grand_total; cost-plus /
  -- T&M copy the USER-ENTERED projection — grand_total is never copied for
  -- non-fixed types and the projection is never auto-derived. NULL = none,
  -- a normal state. Display-only, labeled non-binding, excluded from
  -- variance and over/under math (spec §7.1).
  v_contract_value := CASE WHEN v_estimate.contract_type = 'fixed_price'
                           THEN v_estimate.grand_total
                           ELSE v_estimate.projected_value
                      END;

  -- 2–3. INSERT projects (project_internal_seq drawn by its column default;
  --      project_type now mirrors the instrument's contract_type)
  INSERT INTO projects (
    company_id, project_number, name,
    contact_id, contact_address_id, source_estimate_id,
    project_type, status,
    contract_value, tax_rate,
    scope_summary, scope_sections, cover_letter, terms_sections, internal_notes,
    change_order_sequence, created_by
  ) VALUES (
    v_company_id, v_project_number, v_estimate.name,
    v_estimate.contact_id, v_estimate.contact_address_id, v_estimate.id,
    v_estimate.contract_type, 'active',
    v_contract_value, v_estimate.tax_rate,
    v_estimate.scope_summary, v_estimate.scope_sections, v_estimate.cover_letter, v_estimate.terms_sections, v_estimate.internal_notes,
    0, auth.uid()
  )
  RETURNING id INTO v_project_id;

  -- 4. Client contract record: signed when a signature exists, draft otherwise
  INSERT INTO client_contracts (
    company_id, project_id, status, contract_value,
    signed_proposal_file_id, executed_date, created_by
  ) VALUES (
    v_company_id, v_project_id,
    CASE WHEN v_is_signed THEN 'signed' ELSE 'draft' END,
    v_contract_value,
    v_estimate.signed_proposal_file_id,
    v_estimate.accepted_at::date,
    auth.uid()
  );

  -- 5. Budget baseline: one row per typed row. budgeted_amount = pre-markup
  --    cost, TAX-INCLUSIVE on any taxed row (A-1 — labor is never taxed by
  --    construction; the type-column CHECK pins apply_tax = false on labor).
  --    Matches computeRowBudgetCost() in estimate-totals.ts.
  INSERT INTO project_budget_items (
    company_id, project_id, source_line_row_id, source_line_item_id,
    row_type, cost_code, description, budgeted_amount, created_by
  )
  SELECT
    v_company_id, v_project_id, r.id, li.id,
    r.row_type, c.name, r.name,
    CASE r.row_type
      WHEN 'labor' THEN COALESCE(r.rate, 0) * COALESCE(r.quantity, 0)
      ELSE round(
        (CASE r.row_type
           WHEN 'material' THEN
             CASE WHEN r.unit_of_measure = 'allowance'
                  THEN COALESCE(r.unit_cost, 0)
                  ELSE COALESCE(r.unit_cost, 0) * COALESCE(r.quantity, 0) END
           ELSE COALESCE(r.amount, 0)   -- subcontractor / other
         END)
        * (CASE WHEN r.apply_tax
                THEN 1 + COALESCE(v_estimate.tax_rate, 0) / 100
                ELSE 1 END)
      , 2)
    END,
    auth.uid()
  FROM estimate_line_rows r
  JOIN estimate_line_items li ON li.id = r.line_item_id
  JOIN estimate_categories c ON c.id = li.category_id
  WHERE li.estimate_id = v_estimate.id;

  -- 5b. Flat-priced fallback (A-2): a line with a total_price_override and
  --     NO cost rows gets one budget row carrying its COST basis
  --     (override_cost — guarded non-NULL above), never the sell price.
  INSERT INTO project_budget_items (
    company_id, project_id, source_line_row_id, source_line_item_id,
    row_type, cost_code, description, budgeted_amount, created_by
  )
  SELECT
    v_company_id, v_project_id, NULL, li.id,
    NULL, c.name, li.name || ' (flat-priced line)', li.override_cost,
    auth.uid()
  FROM estimate_line_items li
  JOIN estimate_categories c ON c.id = li.category_id
  WHERE li.estimate_id = v_estimate.id
    AND li.total_price_override IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM estimate_line_rows r WHERE r.line_item_id = li.id);

  -- 6. Estimate gains its project link + terminal 'converted' status
  UPDATE estimates
  SET project_id = v_project_id,
      status = 'converted'
  WHERE id = v_estimate.id;

  -- 7. Module 3 project folders are path-convention (created on first
  --    upload under {company_id}/{project_id}/...) — no storage writes here.

  -- 8. Seed the converter's project assignment: PM visibility is
  --    assignment-based, so without this a PM could not see the project
  --    they just created.
  IF v_member_id IS NOT NULL THEN
    INSERT INTO project_assignments (company_id, project_id, member_id, role_on_project, created_by)
    VALUES (v_company_id, v_project_id, v_member_id, 'converter', auth.uid())
    ON CONFLICT (project_id, member_id) DO NOTHING;
  END IF;

  RETURN v_project_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- 7. apply_change_order_budget (§5.2, P6) — signed COs write their OWN
--    budget lines from change_order_line_rows cost detail, with the CO's own
--    tax_rate. Values are SIGNED (credit COs produce negative rows, D-2).
--    Idempotent (no-op when rows exist — safe retry). Called by
--    completeCoSignature (service-role, auth.uid() IS NULL) right after the
--    status flip; the merged budget screen offers an Owner/Admin retry.
--    Failure never rolls back the binding signature.
-- ----------------------------------------------------------------------------

CREATE FUNCTION public.apply_change_order_budget(p_change_order_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_co RECORD;
  v_count integer := 0;
BEGIN
  -- Service-role (the signing flow) or Owner/Admin (the retry surface).
  IF auth.uid() IS NOT NULL
     AND (public.get_my_role() IS NULL
          OR public.get_my_role() NOT IN ('owner', 'admin')) THEN
    RAISE EXCEPTION 'apply_change_order_budget: Owner/Admin only';
  END IF;

  SELECT * INTO v_co
  FROM change_orders
  WHERE id = p_change_order_id AND is_deleted = false
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'apply_change_order_budget: change order not found';
  END IF;
  IF v_co.status <> 'signed' THEN
    RAISE EXCEPTION 'apply_change_order_budget: change order % is %, not signed', v_co.co_number, v_co.status;
  END IF;
  IF auth.uid() IS NOT NULL AND v_co.company_id <> public.get_my_company_id() THEN
    RAISE EXCEPTION 'apply_change_order_budget: change order not found';
  END IF;

  -- Idempotent: budget rows already written for this CO → no-op.
  PERFORM 1 FROM project_budget_items
  WHERE source_change_order_id = p_change_order_id AND is_deleted = false;
  IF FOUND THEN
    RETURN 0;
  END IF;

  -- One budget row per CO line row — the §5.1 cost expression verbatim
  -- (tax-inclusive on any taxed non-labor row). cost_code NULL (COs are
  -- flat — no category tree); provenance is the FK, labeling is UI-side.
  INSERT INTO project_budget_items (
    company_id, project_id, source_change_order_id,
    row_type, cost_code, description, budgeted_amount, created_by
  )
  SELECT
    v_co.company_id, v_co.project_id, p_change_order_id,
    r.row_type, NULL, r.name,
    CASE r.row_type
      WHEN 'labor' THEN COALESCE(r.rate, 0) * COALESCE(r.quantity, 0)
      ELSE round(
        (CASE r.row_type
           WHEN 'material' THEN
             CASE WHEN r.unit_of_measure = 'allowance'
                  THEN COALESCE(r.unit_cost, 0)
                  ELSE COALESCE(r.unit_cost, 0) * COALESCE(r.quantity, 0) END
           ELSE COALESCE(r.amount, 0)
         END)
        * (CASE WHEN r.apply_tax
                THEN 1 + COALESCE(v_co.tax_rate, 0) / 100
                ELSE 1 END)
      , 2)
    END,
    auth.uid()
  FROM change_order_line_rows r
  JOIN change_order_line_items li ON li.id = r.line_item_id
  WHERE li.change_order_id = p_change_order_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ----------------------------------------------------------------------------
-- 8. Recompute pair (§4.5, the N-2 ruling): money sorts by ORIGIN, never
--    `state`. Origin = 7C's own payable predicate — isPayableRow /
--    PAYABLE_OR_FILTER in apps/web/lib/services/payables-shared.ts:22,29-37,
--    mirrored here EXACTLY:
--
--      sub_contract_id IS NOT NULL        -- sub stage / retainage linkage
--      OR purchase_order_id IS NOT NULL   -- PO committed row
--      OR is_retainage                    -- retainage accrual row
--      OR EXISTS (payments)               -- has expense_payments rows
--      OR state = 'committed'             -- unpaid manual bill
--
--    ⚠ ACCEPTED RISK (spec §4.5, locked): this definition lives in code,
--    not in a column. These functions are CONSUMERS of the payables-shared
--    predicate alongside the payables screens — ANY change to that predicate
--    silently moves budget numbers and must be reviewed against
--    docs/specs/money-representation.md. The predicate is flip-stable: the
--    only state transition (the 7C settlement flip, 20260729010000:728-731)
--    fires only after payments exist, and payments are their own term.
--
--    committed_amount stores GROSS — the original promise, never mutated by
--    payments, close-outs, or the settlement flip. Remaining is derived at
--    read (budget.ts), never stored.
--
--    actual_amount = receipt-origin allocations + NET payments on
--    commitment-origin expenses, prorated by allocation share
--    ((amount − retainage_withheld) × alloc/expense — the S93 Q2 amendment;
--    gross would double-count withheld retainage). Labor stays derived
--    read-time, never persisted (7A invariant, unchanged).
--
--    This supersedes the 7A actual-only invariant per spec A-4: this
--    trigger chain is the ONLY writer of BOTH columns.
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

  WITH alloc AS (
    SELECT a.expense_id,
           a.amount AS alloc_amount,
           e.amount AS expense_amount,
           (e.sub_contract_id IS NOT NULL
            OR e.purchase_order_id IS NOT NULL
            OR e.is_retainage
            OR e.state = 'committed'
            OR EXISTS (SELECT 1 FROM expense_payments p
                       WHERE p.expense_id = e.id AND p.is_deleted = false)
           ) AS is_commitment
    FROM expense_allocations a
    JOIN expenses e ON e.id = a.expense_id
    WHERE a.budget_item_id = p_budget_item_id
      AND a.is_deleted = false
      AND e.status = 'approved'
      AND e.is_deleted = false
  )
  SELECT COALESCE(SUM(
    CASE WHEN NOT alloc.is_commitment THEN alloc.alloc_amount
         ELSE COALESCE((
           SELECT SUM(round(
             (p.amount - p.retainage_withheld)
             * alloc.alloc_amount / NULLIF(alloc.expense_amount, 0)
           , 2))
           FROM expense_payments p
           WHERE p.expense_id = alloc.expense_id AND p.is_deleted = false
         ), 0)
    END
  ), 0)
  INTO v_actual
  FROM alloc;

  -- Guarded so an unchanged value doesn't churn updated_at (6D precedent).
  UPDATE project_budget_items
  SET actual_amount = v_actual
  WHERE id = p_budget_item_id
    AND actual_amount IS DISTINCT FROM v_actual;
END;
$$;

CREATE FUNCTION public.recompute_budget_item_committed(p_budget_item_id uuid)
RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_committed numeric;
BEGIN
  IF p_budget_item_id IS NULL THEN
    RETURN;
  END IF;

  -- GROSS: Σ allocation amounts of approved commitment-origin expenses,
  -- regardless of state, payments, or close-outs (the promise, never
  -- mutated). Origin predicate per the header comment above.
  SELECT COALESCE(SUM(a.amount), 0)
  INTO v_committed
  FROM expense_allocations a
  JOIN expenses e ON e.id = a.expense_id
  WHERE a.budget_item_id = p_budget_item_id
    AND a.is_deleted = false
    AND e.status = 'approved'
    AND e.is_deleted = false
    AND (e.sub_contract_id IS NOT NULL
         OR e.purchase_order_id IS NOT NULL
         OR e.is_retainage
         OR e.state = 'committed'
         OR EXISTS (SELECT 1 FROM expense_payments p
                    WHERE p.expense_id = e.id AND p.is_deleted = false));

  UPDATE project_budget_items
  SET committed_amount = v_committed
  WHERE id = p_budget_item_id
    AND committed_amount IS DISTINCT FROM v_committed;
END;
$$;

-- Convenience: both columns for one line.
CREATE FUNCTION public.recompute_budget_item(p_budget_item_id uuid)
RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  PERFORM public.recompute_budget_item_actual(p_budget_item_id);
  PERFORM public.recompute_budget_item_committed(p_budget_item_id);
END;
$$;

-- Row trigger on allocations now recomputes BOTH columns.
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
    PERFORM public.recompute_budget_item(v_new);
  END IF;
  IF v_old IS NOT NULL AND v_old IS DISTINCT FROM v_new THEN
    PERFORM public.recompute_budget_item(v_old);
  END IF;

  RETURN NULL;
END;
$$;

-- Parent trigger: re-derive every allocated line when money-relevant
-- expense columns change. `state` is DELIBERATELY NOT a condition — no
-- recompute result depends on it (the N-2 ruling), so the settlement flip
-- fires nothing. Linkage columns join because they change origin.
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
    PERFORM public.recompute_budget_item(v_item);
  END LOOP;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS expenses_recompute_on_change ON public.expenses;
CREATE TRIGGER expenses_recompute_on_change
  AFTER UPDATE ON public.expenses
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status
        OR OLD.amount IS DISTINCT FROM NEW.amount
        OR OLD.is_deleted IS DISTINCT FROM NEW.is_deleted
        OR OLD.sub_contract_id IS DISTINCT FROM NEW.sub_contract_id
        OR OLD.purchase_order_id IS DISTINCT FROM NEW.purchase_order_id
        OR OLD.is_retainage IS DISTINCT FROM NEW.is_retainage)
  EXECUTE FUNCTION public.expenses_recompute_allocations();

-- Payments trigger: a payment (or its soft-delete) re-derives the paid
-- expense's allocated lines. Payments feed actual (NET) and can flip a
-- row's origin via the EXISTS term, so both columns recompute.
CREATE FUNCTION public.expense_payments_recompute()
RETURNS TRIGGER
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_expense_id uuid := COALESCE(NEW.expense_id, OLD.expense_id);
  v_item uuid;
BEGIN
  FOR v_item IN
    SELECT DISTINCT a.budget_item_id
    FROM expense_allocations a
    WHERE a.expense_id = v_expense_id
      AND a.is_deleted = false
  LOOP
    PERFORM public.recompute_budget_item(v_item);
  END LOOP;
  RETURN NULL;
END;
$$;

CREATE TRIGGER expense_payments_recompute_budget
  AFTER INSERT OR UPDATE OR DELETE ON public.expense_payments
  FOR EACH ROW EXECUTE FUNCTION public.expense_payments_recompute();

-- ----------------------------------------------------------------------------
-- 9. expense_allocations RLS — split-at-capture (§4.4, Phase 2 Q4). The
--    link is written AT CAPTURE by whoever can capture the expense, so the
--    policies widen from Owner/Admin-only to: Owner/Admin always, OR the
--    parent expense's author while it is still pending. The one arm covers
--    field capture AND the 7C RPC paths (SECURITY INVOKER — PM-created
--    stage/PO rows land pending with the PM as author). Approved-expense
--    adjustments stay Owner/Admin. Allocation rows on unapproved expenses
--    are inert — neither recompute counts them until status='approved'.
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS expense_allocations_insert_admin ON public.expense_allocations;
DROP POLICY IF EXISTS expense_allocations_update_admin ON public.expense_allocations;
DROP POLICY IF EXISTS expense_allocations_delete_admin ON public.expense_allocations;

CREATE POLICY expense_allocations_insert_authorized ON public.expense_allocations
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND (
      public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
      OR EXISTS (
        SELECT 1 FROM public.expenses e
        WHERE e.id = expense_allocations.expense_id
          AND e.author_member_id = public.get_my_member_id()
          AND e.status = 'pending'
      )
    )
  );

CREATE POLICY expense_allocations_update_authorized ON public.expense_allocations
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND (
      public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
      OR EXISTS (
        SELECT 1 FROM public.expenses e
        WHERE e.id = expense_allocations.expense_id
          AND e.author_member_id = public.get_my_member_id()
          AND e.status = 'pending'
      )
    )
  )
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND (
      public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
      OR EXISTS (
        SELECT 1 FROM public.expenses e
        WHERE e.id = expense_allocations.expense_id
          AND e.author_member_id = public.get_my_member_id()
          AND e.status = 'pending'
      )
    )
  );

CREATE POLICY expense_allocations_delete_authorized ON public.expense_allocations
  FOR DELETE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND (
      public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
      OR EXISTS (
        SELECT 1 FROM public.expenses e
        WHERE e.id = expense_allocations.expense_id
          AND e.author_member_id = public.get_my_member_id()
          AND e.status = 'pending'
      )
    )
  );

-- ----------------------------------------------------------------------------
-- 10. 7C writer RPCs — additive-optional budget-line targets (§4.4, Phase 2
--     Q1(a)). The ONLY 7C changes in this migration. record_expense_payment
--     and the settlement flip are untouched. Existing callers keep working:
--     the new inputs default to absent.
-- ----------------------------------------------------------------------------

-- 10a. setup_payment_schedule — each stage may carry a budget_item_id; when
--      present, the stage's committed row is allocated to that line in the
--      same transaction (SECURITY INVOKER — the §9 policies gate the write:
--      the stage row lands pending with the caller as author).
CREATE OR REPLACE FUNCTION public.setup_payment_schedule(
  p_sub_contract_id uuid,
  p_stages jsonb,                        -- [{"label", "amount", "budget_item_id"?}, ...]
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
  v_expense_id uuid;
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
    SELECT s ->> 'label' AS label,
           (s ->> 'amount')::numeric AS amount,
           (s ->> 'budget_item_id')::uuid AS budget_item_id
    FROM jsonb_array_elements(p_stages) s
  LOOP
    IF v_stage.label IS NULL OR btrim(v_stage.label) = '' THEN
      RAISE EXCEPTION 'setup_payment_schedule: every stage needs a label';
    END IF;
    IF v_stage.amount IS NULL OR v_stage.amount <= 0 THEN
      RAISE EXCEPTION 'setup_payment_schedule: every stage needs a positive amount';
    END IF;

    -- Additive-optional budget target [S93]: the line must sit on the
    -- contract's own project.
    IF v_stage.budget_item_id IS NOT NULL THEN
      PERFORM 1 FROM project_budget_items b
      WHERE b.id = v_stage.budget_item_id
        AND b.project_id = v_contract.project_id
        AND b.is_deleted = false;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'setup_payment_schedule: budget line % is not on this contract''s project', v_stage.budget_item_id;
      END IF;
    END IF;

    INSERT INTO expenses (
      project_id, supplier, expense_date, amount,
      cost_category, state, sub_contract_id, stage_label
    ) VALUES (
      v_contract.project_id, COALESCE(v_supplier, 'Subcontractor'), CURRENT_DATE, v_stage.amount,
      'subcontractor', 'committed', p_sub_contract_id, btrim(v_stage.label)
    ) RETURNING id INTO v_expense_id;

    IF v_stage.budget_item_id IS NOT NULL THEN
      INSERT INTO expense_allocations (expense_id, budget_item_id, amount)
      VALUES (v_expense_id, v_stage.budget_item_id, v_stage.amount);
    END IF;

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

-- 10b. set_po_total_amount — optional p_budget_item_id [S93]. On create, the
--      committed row is allocated in full to that line. On adjust, a single
--      existing allocation tracks the new total (Σ = amount); multi-line
--      splits are left for the review popup to reconcile.
--      The shipped 7C signature (uuid, numeric) is dropped first: the added
--      p_budget_item_id changes the argument list, so CREATE OR REPLACE
--      would create an OVERLOAD beside it and every existing two-argument
--      call would fail with "function is not unique".
DROP FUNCTION IF EXISTS public.set_po_total_amount(uuid, numeric);
CREATE FUNCTION public.set_po_total_amount(
  p_po_id uuid,
  p_amount numeric,
  p_budget_item_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_po RECORD;
  v_expense_id uuid;
  v_alloc_id uuid;
  v_alloc_count integer;
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

  IF p_budget_item_id IS NOT NULL THEN
    PERFORM 1 FROM project_budget_items b
    WHERE b.id = p_budget_item_id
      AND b.project_id = v_po.project_id
      AND b.is_deleted = false;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'set_po_total_amount: budget line % is not on this PO''s project', p_budget_item_id;
    END IF;
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

    IF p_budget_item_id IS NOT NULL THEN
      INSERT INTO expense_allocations (expense_id, budget_item_id, amount)
      VALUES (v_expense_id, p_budget_item_id, p_amount);
    END IF;
  ELSE
    UPDATE expenses SET amount = p_amount WHERE id = v_expense_id;
    IF NOT FOUND THEN
      -- RLS refused the adjust (e.g. PM on an approved row — Owner/Admin only).
      RAISE EXCEPTION 'set_po_total_amount: you cannot adjust this commitment (approved commitments are Owner/Admin)';
    END IF;

    -- Keep a single allocation in step with the adjusted total (Σ = amount).
    SELECT COUNT(*) INTO v_alloc_count
    FROM expense_allocations
    WHERE expense_id = v_expense_id AND is_deleted = false;

    IF v_alloc_count = 1 THEN
      SELECT id INTO v_alloc_id
      FROM expense_allocations
      WHERE expense_id = v_expense_id AND is_deleted = false;
      UPDATE expense_allocations SET amount = p_amount WHERE id = v_alloc_id;
    ELSIF v_alloc_count = 0 AND p_budget_item_id IS NOT NULL THEN
      INSERT INTO expense_allocations (expense_id, budget_item_id, amount)
      VALUES (v_expense_id, p_budget_item_id, p_amount);
    END IF;
    -- v_alloc_count > 1: a manual multi-line split exists — leave it for the
    -- review popup to reconcile rather than guessing a proration.
  END IF;

  RETURN v_expense_id;
END;
$$;
