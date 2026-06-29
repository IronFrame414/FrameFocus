-- ============================================================
-- FrameFocus — Migration: 4D Revision Rev 3 (proposal presentation levels)
-- ============================================================
-- Additive on top of 20260618120000 (Rev 2, immutable). One atomic migration
-- (spec docs/specs/4D-revision-spec-rev3.md):
--   1. Drop the per-line / per-category presentation_mode override columns
--      (estimate_line_items, estimate_categories) — the override model is gone.
--   2. Expand proposal_pricing_level (estimates) and default_proposal_pricing_level
--      (companies) from the shipped 3-value enum to the 5-value enum, migrating
--      existing rows and column defaults.
--   3. Rewrite clone_estimate_line() / clone_estimate() to drop every
--      presentation_mode reference (these RPCs were defined in Rev 2 and would
--      otherwise break). proposal_pricing_level cloning is unchanged.
--
-- Five values: lump_sum, category_with_price, category_no_price,
--              detail_with_price_qty, detail_no_price. Quantity is detail-level
--              only. category_no_price / detail_no_price suppress the per-row/
--              line/category breakdown but the proposal still shows the grand total.
--
-- Value map (throwaway test data — kept sane so the company default survives):
--   total_only      -> lump_sum
--   category_totals -> category_with_price
--   line_items      -> detail_with_price_qty
-- ============================================================

-- ----------------------------------------
-- 1. Drop the presentation_mode override columns
-- ----------------------------------------
ALTER TABLE estimate_line_items DROP COLUMN presentation_mode;
ALTER TABLE estimate_categories DROP COLUMN presentation_mode;

-- ----------------------------------------
-- 2a. estimates.proposal_pricing_level -> five values
--     (created in 20260611102749 with an inline column CHECK named
--      estimates_proposal_pricing_level_check and DEFAULT 'total_only')
-- ----------------------------------------
ALTER TABLE estimates ALTER COLUMN proposal_pricing_level DROP DEFAULT;
ALTER TABLE estimates DROP CONSTRAINT estimates_proposal_pricing_level_check;

UPDATE estimates SET proposal_pricing_level = CASE proposal_pricing_level
  WHEN 'total_only'      THEN 'lump_sum'
  WHEN 'category_totals' THEN 'category_with_price'
  WHEN 'line_items'      THEN 'detail_with_price_qty'
  ELSE proposal_pricing_level
END;

ALTER TABLE estimates ADD CONSTRAINT estimates_proposal_pricing_level_check
  CHECK (proposal_pricing_level IN (
    'lump_sum',
    'category_with_price',
    'category_no_price',
    'detail_with_price_qty',
    'detail_no_price'
  ));

ALTER TABLE estimates ALTER COLUMN proposal_pricing_level SET DEFAULT 'lump_sum';

-- ----------------------------------------
-- 2b. companies.default_proposal_pricing_level -> five values
--     (added in 20260612161659 with an inline CHECK named
--      companies_default_proposal_pricing_level_check and DEFAULT 'category_totals')
-- ----------------------------------------
ALTER TABLE companies ALTER COLUMN default_proposal_pricing_level DROP DEFAULT;
ALTER TABLE companies DROP CONSTRAINT companies_default_proposal_pricing_level_check;

UPDATE companies SET default_proposal_pricing_level = CASE default_proposal_pricing_level
  WHEN 'total_only'      THEN 'lump_sum'
  WHEN 'category_totals' THEN 'category_with_price'
  WHEN 'line_items'      THEN 'detail_with_price_qty'
  ELSE default_proposal_pricing_level
END;

ALTER TABLE companies ADD CONSTRAINT companies_default_proposal_pricing_level_check
  CHECK (default_proposal_pricing_level IN (
    'lump_sum',
    'category_with_price',
    'category_no_price',
    'detail_with_price_qty',
    'detail_no_price'
  ));

ALTER TABLE companies ALTER COLUMN default_proposal_pricing_level SET DEFAULT 'category_with_price';

-- ----------------------------------------
-- 3. Rewrite clone functions without presentation_mode
--    (bodies copied from Rev 2 20260618120000, presentation_mode removed only;
--     proposal_pricing_level cloning unchanged)
-- ----------------------------------------

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
    name, description,
    discount_type, discount_amount,
    total_price, total_price_override, notes, sort_order
  ) VALUES (
    p_company_id, p_new_estimate_id, p_new_category_id, p_new_subcategory_id,
    p_line.name, p_line.description,
    p_line.discount_type, p_line.discount_amount,
    p_line.total_price, p_line.total_price_override, p_line.notes, p_line.sort_order
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

REVOKE EXECUTE ON FUNCTION clone_estimate_line(estimate_line_items, UUID, UUID, UUID, UUID)
  FROM PUBLIC, anon, authenticated;

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

  IF v_role = 'project_manager' AND v_source.created_by <> auth.uid() THEN
    RAISE EXCEPTION 'PMs can only clone their own estimates';
  END IF;

  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'New estimate name is required';
  END IF;

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

  INSERT INTO estimates (
    company_id, name, contact_id, contact_address_id,
    cloned_from_estimate_id,
    pricing_mode, tax_rate,
    subcontractor_markup_percent, material_markup_percent, labor_markup_percent,
    discount_type, discount_amount,
    subtotal, tax_total, discount_total, grand_total,
    proposal_pricing_level, cover_letter, scope_summary, scope_sections, terms_sections,
    expiration_days
  ) VALUES (
    v_company_id, trim(p_name), p_contact_id, p_contact_address_id,
    p_source_id,
    v_source.pricing_mode, v_source.tax_rate,
    v_source.subcontractor_markup_percent, v_source.material_markup_percent, v_source.labor_markup_percent,
    v_source.discount_type, v_source.discount_amount,
    v_source.subtotal, v_source.tax_total, v_source.discount_total, v_source.grand_total,
    v_source.proposal_pricing_level, v_source.cover_letter, v_source.scope_summary, v_source.scope_sections, v_source.terms_sections,
    v_source.expiration_days
  )
  RETURNING id, estimate_number INTO v_new_id, v_new_number;

  FOR v_cat IN
    SELECT * FROM estimate_categories
    WHERE estimate_id = p_source_id
    ORDER BY sort_order
  LOOP
    INSERT INTO estimate_categories (company_id, estimate_id, name, sort_order)
    VALUES (v_company_id, v_new_id, v_cat.name, v_cat.sort_order)
    RETURNING id INTO v_new_cat_id;

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
