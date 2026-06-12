-- ============================================================
-- Module 4 Spec 1 (4M + 4D + 4K) — additive extensions to 4C
--
-- 1. companies: estimate_number_sequence default 0 → 99 (+ backfill
--    so the first estimate per company is PREFIX-100),
--    default_pricing_mode, three margin defaults (stored
--    independently from the markup defaults — no translation).
-- 2. estimates: pricing_mode (markup | margin), internal_notes.
-- 3. estimate_line_materials: apply_tax (per-row material tax flag).
-- 4. estimate_line_items: total_price_override — build-time addition
--    (not in the spec's enumerated columns) required by the locked
--    toggle behavior: "total overrides preserved as-is" across
--    pricing-mode switches and totals recomputes. Without a stored
--    override the recompute would clobber a user-entered total.
--    NULL = computed total; non-NULL = user override wins.
-- 5. clone_estimate() RPC — atomic 4K clone (estimate + categories +
--    subcategories + line items + materials; never sub bids/files).
-- 6. switch_pricing_mode() RPC — atomic markup/margin toggle with
--    sticky-value semantics (Session 48 locked decision).
--
-- No new RLS policies: all touched tables already have full
-- coverage (companies Owner/Admin UPDATE; estimates D3 draft guard;
-- child-table EXISTS checks). RPCs are SECURITY DEFINER with
-- explicit company/role/draft/ownership checks, mirroring
-- set_winning_bid() from the 4C migration.
-- ============================================================

-- ----------------------------------------
-- 1. companies
-- ----------------------------------------

ALTER TABLE companies
  ALTER COLUMN estimate_number_sequence SET DEFAULT 99;

-- One-time backfill: only companies that have NOT yet issued an
-- estimate (sequence still at the old default of 0).
UPDATE companies
  SET estimate_number_sequence = 99
  WHERE estimate_number_sequence = 0;

ALTER TABLE companies
  ADD COLUMN default_pricing_mode TEXT NOT NULL DEFAULT 'markup'
    CHECK (default_pricing_mode IN ('markup', 'margin')),
  ADD COLUMN default_subcontractor_margin_percent NUMERIC,
  ADD COLUMN default_material_margin_percent      NUMERIC,
  ADD COLUMN default_labor_margin_percent         NUMERIC;

-- ----------------------------------------
-- 2. estimates
-- ----------------------------------------

ALTER TABLE estimates
  ADD COLUMN pricing_mode TEXT NOT NULL DEFAULT 'markup'
    CHECK (pricing_mode IN ('markup', 'margin')),
  ADD COLUMN internal_notes TEXT;

-- ----------------------------------------
-- 3. estimate_line_materials
-- ----------------------------------------

ALTER TABLE estimate_line_materials
  ADD COLUMN apply_tax BOOLEAN NOT NULL DEFAULT true;

-- ----------------------------------------
-- 4. estimate_line_items — total override (see header note)
-- ----------------------------------------

ALTER TABLE estimate_line_items
  ADD COLUMN total_price_override NUMERIC;

-- ----------------------------------------
-- 5. clone_estimate RPC (4K)
--
-- Atomic: new Draft estimate + full child tree in one transaction.
-- Carries over: pricing fields, discounts, terms, scope, cover
-- letter, proposal_pricing_level, expiration_days, totals,
-- categories/subcategories/line items/materials (snapshot pricing —
-- no catalog refresh).
-- Does NOT carry: status (always draft), version (always v1.1),
-- timestamps, sub bids, estimate_files, signed proposal,
-- project_id, internal_notes, contact (new from input).
-- Fresh estimate_number via the next_estimate_number() column
-- default. cloned_from_estimate_id = source (lineage).
--
-- SECURITY DEFINER, so source visibility is re-checked explicitly:
-- PMs may only clone estimates they created (D2 parity).
-- ----------------------------------------

CREATE OR REPLACE FUNCTION clone_estimate(
  p_source_id UUID,
  p_contact_id UUID,
  p_contact_address_id UUID,
  p_name TEXT
)
RETURNS TABLE (new_estimate_id UUID, new_estimate_number TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id UUID := get_my_company_id();
  v_role TEXT := get_my_role();
  v_source estimates%ROWTYPE;
  v_new_id UUID;
  v_new_number TEXT;
  v_cat RECORD;
  v_sub RECORD;
  -- %ROWTYPE (not RECORD) so the variable carries the named
  -- composite type expected by clone_estimate_line().
  v_line estimate_line_items%ROWTYPE;
  v_new_cat_id UUID;
  v_new_sub_id UUID;
  v_new_line_id UUID;
BEGIN
  IF v_role IS NULL OR v_role NOT IN ('owner', 'admin', 'project_manager') THEN
    RAISE EXCEPTION 'Only Owner, Admin, or PM can clone an estimate';
  END IF;

  SELECT * INTO v_source FROM estimates WHERE id = p_source_id;
  IF NOT FOUND OR v_source.company_id <> v_company_id THEN
    RAISE EXCEPTION 'Source estimate not found';
  END IF;

  -- D2 parity: PMs only see (and may only clone) their own estimates
  IF v_role = 'project_manager' AND v_source.created_by <> auth.uid() THEN
    RAISE EXCEPTION 'PMs can only clone their own estimates';
  END IF;

  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'New estimate name is required';
  END IF;

  -- New contact + address must belong to the caller's company,
  -- and the address must belong to the chosen contact.
  IF NOT EXISTS (
    SELECT 1 FROM contacts
    WHERE id = p_contact_id AND company_id = v_company_id
  ) THEN
    RAISE EXCEPTION 'Contact not found';
  END IF;

  IF p_contact_address_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM contact_addresses
    WHERE id = p_contact_address_id
      AND company_id = v_company_id
      AND contact_id = p_contact_id
  ) THEN
    RAISE EXCEPTION 'Address not found for this contact';
  END IF;

  -- New Draft estimate. estimate_number / created_by /
  -- created_by_role fill in via column defaults.
  INSERT INTO estimates (
    company_id, name, contact_id, contact_address_id,
    cloned_from_estimate_id,
    pricing_mode, tax_rate,
    subcontractor_markup_percent, material_markup_percent, labor_markup_percent,
    discount_type, discount_amount,
    subtotal, tax_total, discount_total, grand_total,
    proposal_pricing_level, cover_letter, scope_of_work, terms_sections,
    expiration_days
  ) VALUES (
    v_company_id, trim(p_name), p_contact_id, p_contact_address_id,
    p_source_id,
    v_source.pricing_mode, v_source.tax_rate,
    v_source.subcontractor_markup_percent, v_source.material_markup_percent, v_source.labor_markup_percent,
    v_source.discount_type, v_source.discount_amount,
    v_source.subtotal, v_source.tax_total, v_source.discount_total, v_source.grand_total,
    v_source.proposal_pricing_level, v_source.cover_letter, v_source.scope_of_work, v_source.terms_sections,
    v_source.expiration_days
  )
  RETURNING id, estimate_number INTO v_new_id, v_new_number;

  -- Child tree. Snapshot semantics: material unit_cost et al copy
  -- as-is from the source — no refresh from the current catalog.
  FOR v_cat IN
    SELECT * FROM estimate_categories
    WHERE estimate_id = p_source_id
    ORDER BY sort_order
  LOOP
    INSERT INTO estimate_categories (company_id, estimate_id, name, sort_order)
    VALUES (v_company_id, v_new_id, v_cat.name, v_cat.sort_order)
    RETURNING id INTO v_new_cat_id;

    -- Line items directly under the category (no subcategory)
    FOR v_line IN
      SELECT * FROM estimate_line_items
      WHERE category_id = v_cat.id AND subcategory_id IS NULL
      ORDER BY sort_order
    LOOP
      v_new_line_id := clone_estimate_line(v_line, v_new_id, v_new_cat_id, NULL, v_company_id);
    END LOOP;

    FOR v_sub IN
      SELECT * FROM estimate_subcategories
      WHERE category_id = v_cat.id
      ORDER BY sort_order
    LOOP
      INSERT INTO estimate_subcategories (company_id, estimate_id, category_id, name, sort_order)
      VALUES (v_company_id, v_new_id, v_new_cat_id, v_sub.name, v_sub.sort_order)
      RETURNING id INTO v_new_sub_id;

      FOR v_line IN
        SELECT * FROM estimate_line_items
        WHERE subcategory_id = v_sub.id
        ORDER BY sort_order
      LOOP
        v_new_line_id := clone_estimate_line(v_line, v_new_id, v_new_cat_id, v_new_sub_id, v_company_id);
      END LOOP;
    END LOOP;
  END LOOP;

  RETURN QUERY SELECT v_new_id, v_new_number;
END;
$$;

-- Helper for clone_estimate(): copies one line item + its material
-- rows onto the new estimate. Not exposed to PostgREST callers
-- directly (revoked below); only meaningful inside clone_estimate.
CREATE OR REPLACE FUNCTION clone_estimate_line(
  p_line estimate_line_items,
  p_new_estimate_id UUID,
  p_new_category_id UUID,
  p_new_subcategory_id UUID,
  p_company_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_line_id UUID;
BEGIN
  INSERT INTO estimate_line_items (
    company_id, estimate_id, category_id, subcategory_id,
    name, description, line_type,
    sub_bid_amount, subcontractor_id,
    labor_cost, material_cost_subtotal, tax_amount,
    subcontractor_markup_percent, labor_markup_percent, material_markup_percent,
    discount_type, discount_amount,
    total_price, total_price_override, notes, sort_order
  ) VALUES (
    p_company_id, p_new_estimate_id, p_new_category_id, p_new_subcategory_id,
    p_line.name, p_line.description, p_line.line_type,
    p_line.sub_bid_amount, p_line.subcontractor_id,
    p_line.labor_cost, p_line.material_cost_subtotal, p_line.tax_amount,
    p_line.subcontractor_markup_percent, p_line.labor_markup_percent, p_line.material_markup_percent,
    p_line.discount_type, p_line.discount_amount,
    p_line.total_price, p_line.total_price_override, p_line.notes, p_line.sort_order
  )
  RETURNING id INTO v_new_line_id;

  INSERT INTO estimate_line_materials (
    company_id, line_item_id, catalog_item_id, name,
    unit_of_measure, unit_cost, quantity, total_cost, apply_tax
  )
  SELECT
    p_company_id, v_new_line_id, m.catalog_item_id, m.name,
    m.unit_of_measure, m.unit_cost, m.quantity, m.total_cost, m.apply_tax
  FROM estimate_line_materials m
  WHERE m.line_item_id = p_line.id;

  RETURN v_new_line_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION clone_estimate_line(estimate_line_items, UUID, UUID, UUID, UUID)
  FROM PUBLIC, anon, authenticated;

-- ----------------------------------------
-- 6. switch_pricing_mode RPC (4D toggle)
--
-- Sticky-value semantics (locked Session 48):
--   * a % still equal to the ACTIVE-mode company default swaps to
--     the NEW-mode company default;
--   * a % modified away from the default stays exactly as left;
--   * NULL line-level %s keep inheriting (stay NULL);
--   * total overrides are untouched.
-- Caller (service layer) runs the totals recompute afterwards with
-- the new mode's equations.
-- ----------------------------------------

CREATE OR REPLACE FUNCTION switch_pricing_mode(
  p_estimate_id UUID,
  p_new_mode TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id UUID := get_my_company_id();
  v_role TEXT := get_my_role();
  v_estimate estimates%ROWTYPE;
  v_company companies%ROWTYPE;
  v_active_sub NUMERIC;
  v_active_mat NUMERIC;
  v_active_lab NUMERIC;
  v_new_sub NUMERIC;
  v_new_mat NUMERIC;
  v_new_lab NUMERIC;
BEGIN
  IF p_new_mode NOT IN ('markup', 'margin') THEN
    RAISE EXCEPTION 'Invalid pricing mode: %', p_new_mode;
  END IF;

  IF v_role IS NULL OR v_role NOT IN ('owner', 'admin', 'project_manager') THEN
    RAISE EXCEPTION 'Only Owner, Admin, or PM can change pricing mode';
  END IF;

  SELECT * INTO v_estimate FROM estimates WHERE id = p_estimate_id;
  IF NOT FOUND OR v_estimate.company_id <> v_company_id THEN
    RAISE EXCEPTION 'Estimate not found';
  END IF;

  IF v_role = 'project_manager' AND v_estimate.created_by <> auth.uid() THEN
    RAISE EXCEPTION 'PMs can only modify their own estimates';
  END IF;

  IF v_estimate.status <> 'draft' THEN
    RAISE EXCEPTION 'Estimate is not editable (status: %)', v_estimate.status;
  END IF;

  IF v_estimate.pricing_mode = p_new_mode THEN
    RETURN;  -- no-op
  END IF;

  SELECT * INTO v_company FROM companies WHERE id = v_company_id;

  IF v_estimate.pricing_mode = 'markup' THEN
    v_active_sub := v_company.default_subcontractor_markup_percent;
    v_active_mat := v_company.default_material_markup_percent;
    v_active_lab := v_company.default_labor_markup_percent;
  ELSE
    v_active_sub := v_company.default_subcontractor_margin_percent;
    v_active_mat := v_company.default_material_margin_percent;
    v_active_lab := v_company.default_labor_margin_percent;
  END IF;

  IF p_new_mode = 'markup' THEN
    v_new_sub := v_company.default_subcontractor_markup_percent;
    v_new_mat := v_company.default_material_markup_percent;
    v_new_lab := v_company.default_labor_markup_percent;
  ELSE
    v_new_sub := v_company.default_subcontractor_margin_percent;
    v_new_mat := v_company.default_material_margin_percent;
    v_new_lab := v_company.default_labor_margin_percent;
  END IF;

  -- Estimate-level %s: swap only the ones still at the active-mode
  -- default (IS NOT DISTINCT FROM treats NULL=NULL as "at default" —
  -- correct here, since an unset value follows the company default).
  UPDATE estimates
  SET pricing_mode = p_new_mode,
      subcontractor_markup_percent = CASE
        WHEN subcontractor_markup_percent IS NOT DISTINCT FROM v_active_sub THEN v_new_sub
        ELSE subcontractor_markup_percent END,
      material_markup_percent = CASE
        WHEN material_markup_percent IS NOT DISTINCT FROM v_active_mat THEN v_new_mat
        ELSE material_markup_percent END,
      labor_markup_percent = CASE
        WHEN labor_markup_percent IS NOT DISTINCT FROM v_active_lab THEN v_new_lab
        ELSE labor_markup_percent END
  WHERE id = p_estimate_id;

  -- Line-level %s: NULL means "inherit from estimate" and must stay
  -- NULL, so only non-NULL values equal to the active default swap.
  UPDATE estimate_line_items
  SET subcontractor_markup_percent = CASE
        WHEN subcontractor_markup_percent IS NOT NULL
         AND subcontractor_markup_percent IS NOT DISTINCT FROM v_active_sub THEN v_new_sub
        ELSE subcontractor_markup_percent END,
      labor_markup_percent = CASE
        WHEN labor_markup_percent IS NOT NULL
         AND labor_markup_percent IS NOT DISTINCT FROM v_active_lab THEN v_new_lab
        ELSE labor_markup_percent END,
      material_markup_percent = CASE
        WHEN material_markup_percent IS NOT NULL
         AND material_markup_percent IS NOT DISTINCT FROM v_active_mat THEN v_new_mat
        ELSE material_markup_percent END
  WHERE estimate_id = p_estimate_id;
END;
$$;
