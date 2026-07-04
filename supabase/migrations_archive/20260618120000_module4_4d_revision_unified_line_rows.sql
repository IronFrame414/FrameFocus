-- ============================================================
-- FrameFocus — Migration: 4D Revision (unified line/row model)
-- ============================================================
-- One atomic migration (spec docs/specs/.../4d revision spec.md Rev 2):
--   1. Delete throwaway estimate data (Rev 2 §4 data assumption).
--   2. estimates: drop scope_of_work TEXT[]; add scope_summary +
--      scope_sections JSONB. proposal_pricing_level UNCHANGED — it is
--      the estimate-level presentation control (Q1 = option C).
--   3. estimate_categories: add presentation_mode (itemized|lump_sum).
--   4. estimate_line_items: drop line_type + lump-sum/detailed cost +
--      three line-level markup columns; add presentation_mode; keep
--      total_price_override.
--   5. drop estimate_line_materials; create estimate_line_rows (four
--      row types) with RLS + triggers + column defaults.
--   6. companies: add default_labor_rate.
--   7. rewrite switch_pricing_mode / set_winning_bid / clone_estimate /
--      clone_estimate_line against the new model.
--
-- Conventions: get_my_company_id() + profiles.id; standard columns +
-- BEFORE UPDATE triggers + column defaults on the new per-tenant table;
-- Sent-freeze enforced in RLS (parent estimate status = 'draft').
-- ============================================================

-- ----------------------------------------
-- 1. Delete throwaway estimate data
--    signing_sessions.estimate_id is NOT NULL with no ON DELETE rule,
--    so it must be cleared before estimates. email_logs.estimate_id is
--    ON DELETE SET NULL and is left intact. All estimate_* children
--    cascade from estimates / line_items.
-- ----------------------------------------

DELETE FROM signing_sessions;
DELETE FROM estimates;

-- ----------------------------------------
-- 2. estimates — scope restructure
-- ----------------------------------------

ALTER TABLE estimates
  DROP COLUMN scope_of_work,
  ADD COLUMN scope_summary  TEXT,
  ADD COLUMN scope_sections JSONB;   -- array of { title, bullets: [] }

-- ----------------------------------------
-- 3. estimate_categories — per-category presentation override
-- ----------------------------------------

ALTER TABLE estimate_categories
  ADD COLUMN presentation_mode TEXT
    CHECK (presentation_mode IN ('itemized', 'lump_sum'));   -- NULL = inherit

-- ----------------------------------------
-- 4. estimate_line_items — remove line_type/cost/markup columns,
--    add presentation override. total_price_override is KEPT.
-- ----------------------------------------

ALTER TABLE estimate_line_items
  DROP COLUMN line_type,
  DROP COLUMN sub_bid_amount,
  DROP COLUMN subcontractor_id,
  DROP COLUMN labor_cost,
  DROP COLUMN material_cost_subtotal,
  DROP COLUMN tax_amount,
  DROP COLUMN subcontractor_markup_percent,
  DROP COLUMN labor_markup_percent,
  DROP COLUMN material_markup_percent,
  ADD COLUMN presentation_mode TEXT
    CHECK (presentation_mode IN ('itemized', 'lump_sum'));   -- NULL = inherit

-- ----------------------------------------
-- 5. estimate_line_rows — generalizes estimate_line_materials
-- ----------------------------------------

DROP TABLE estimate_line_materials;
DROP FUNCTION IF EXISTS set_estimate_line_materials_updated_by();

CREATE TABLE estimate_line_rows (
  -- Standard columns
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id),
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  created_by  UUID REFERENCES auth.users(id),
  updated_by  UUID REFERENCES auth.users(id),

  line_item_id UUID NOT NULL REFERENCES estimate_line_items(id) ON DELETE CASCADE,

  row_type   TEXT NOT NULL CHECK (row_type IN ('labor', 'material', 'subcontractor', 'other')),
  name       TEXT NOT NULL,
  sort_order INTEGER NOT NULL,

  -- Shared pricing
  markup_percent NUMERIC,                          -- per-row; NULL inherits estimate default
  apply_tax      BOOLEAN NOT NULL DEFAULT false,   -- forced false for labor (see CHECK)
  total          NUMERIC NOT NULL DEFAULT 0,        -- app-maintained row total

  -- Labor
  rate       NUMERIC,
  quantity   NUMERIC,                              -- shared with material
  labor_unit TEXT CHECK (labor_unit IS NULL OR labor_unit IN ('hours', 'days')),

  -- Material
  catalog_item_id UUID REFERENCES cost_catalog(id),
  unit_of_measure TEXT CHECK (unit_of_measure IS NULL OR unit_of_measure IN (
    'each', 'sq_ft', 'linear_ft', 'box', 'bundle', 'bag',
    'gallon', 'pair', 'set', 'allowance', 'other'
  )),
  unit_cost NUMERIC,

  -- Subcontractor / Other
  amount           NUMERIC,
  subcontractor_id UUID REFERENCES subcontractors(id),

  -- Only the columns valid for row_type may be non-null; labor untaxed.
  CONSTRAINT estimate_line_rows_type_columns CHECK (
    CASE row_type
      WHEN 'labor' THEN
        amount IS NULL AND subcontractor_id IS NULL
        AND catalog_item_id IS NULL AND unit_of_measure IS NULL AND unit_cost IS NULL
        AND apply_tax = false
      WHEN 'material' THEN
        rate IS NULL AND labor_unit IS NULL
        AND amount IS NULL AND subcontractor_id IS NULL
      WHEN 'subcontractor' THEN
        rate IS NULL AND quantity IS NULL AND labor_unit IS NULL
        AND catalog_item_id IS NULL AND unit_of_measure IS NULL AND unit_cost IS NULL
      WHEN 'other' THEN
        rate IS NULL AND quantity IS NULL AND labor_unit IS NULL
        AND catalog_item_id IS NULL AND unit_of_measure IS NULL AND unit_cost IS NULL
        AND subcontractor_id IS NULL
    END
  )
);

-- Column defaults (CLAUDE.md per-tenant checklist)
ALTER TABLE estimate_line_rows ALTER COLUMN company_id SET DEFAULT get_my_company_id();
ALTER TABLE estimate_line_rows ALTER COLUMN created_by SET DEFAULT auth.uid();
ALTER TABLE estimate_line_rows ALTER COLUMN updated_by SET DEFAULT auth.uid();

CREATE INDEX idx_estimate_line_rows_company_id       ON estimate_line_rows(company_id);
CREATE INDEX idx_estimate_line_rows_line_item_id     ON estimate_line_rows(line_item_id);
CREATE INDEX idx_estimate_line_rows_catalog_item_id  ON estimate_line_rows(catalog_item_id);
CREATE INDEX idx_estimate_line_rows_subcontractor_id ON estimate_line_rows(subcontractor_id);

-- Standard triggers (CLAUDE.md — updated_at + updated_by)
CREATE TRIGGER estimate_line_rows_updated_at
  BEFORE UPDATE ON estimate_line_rows
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE FUNCTION set_estimate_line_rows_updated_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER estimate_line_rows_set_updated_by
  BEFORE UPDATE ON estimate_line_rows
  FOR EACH ROW EXECUTE FUNCTION set_estimate_line_rows_updated_by();

-- RLS — scope via parent line item, whose own RLS chains to the
-- estimate (mirrors the dropped estimate_line_materials policies).
-- Writes additionally require the parent estimate to be 'draft'
-- (Sent-freeze) and PM ownership of the parent.
ALTER TABLE estimate_line_rows ENABLE ROW LEVEL SECURITY;

CREATE POLICY estimate_line_rows_select_authenticated ON estimate_line_rows
  FOR SELECT
  TO authenticated
  USING (
    company_id = get_my_company_id()
    AND EXISTS (SELECT 1 FROM estimate_line_items li WHERE li.id = line_item_id)
  );

CREATE POLICY estimate_line_rows_insert_manager ON estimate_line_rows
  FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id = get_my_company_id()
    AND get_my_role() IN ('owner', 'admin', 'project_manager')
    AND EXISTS (
      SELECT 1
      FROM estimate_line_items li
      JOIN estimates e ON e.id = li.estimate_id
      WHERE li.id = line_item_id AND e.status = 'draft'
        AND (get_my_role() IN ('owner', 'admin') OR e.created_by = auth.uid())
    )
  );

CREATE POLICY estimate_line_rows_update_manager ON estimate_line_rows
  FOR UPDATE
  TO authenticated
  USING (
    company_id = get_my_company_id()
    AND get_my_role() IN ('owner', 'admin', 'project_manager')
    AND EXISTS (
      SELECT 1
      FROM estimate_line_items li
      JOIN estimates e ON e.id = li.estimate_id
      WHERE li.id = line_item_id AND e.status = 'draft'
        AND (get_my_role() IN ('owner', 'admin') OR e.created_by = auth.uid())
    )
  )
  WITH CHECK (
    company_id = get_my_company_id()
    AND get_my_role() IN ('owner', 'admin', 'project_manager')
  );

CREATE POLICY estimate_line_rows_delete_manager ON estimate_line_rows
  FOR DELETE
  TO authenticated
  USING (
    company_id = get_my_company_id()
    AND get_my_role() IN ('owner', 'admin', 'project_manager')
    AND EXISTS (
      SELECT 1
      FROM estimate_line_items li
      JOIN estimates e ON e.id = li.estimate_id
      WHERE li.id = line_item_id AND e.status = 'draft'
        AND (get_my_role() IN ('owner', 'admin') OR e.created_by = auth.uid())
    )
  );

-- ----------------------------------------
-- 6. companies — default labor rate
-- ----------------------------------------

ALTER TABLE companies
  ADD COLUMN default_labor_rate NUMERIC;

-- ----------------------------------------
-- 7a. switch_pricing_mode — swap markup/margin on row markup_percent
--     Estimate-level %s (estimates.*_markup_percent) keep the same
--     sticky-value swap; line-level markups now live on rows, keyed by
--     row_type (labor→labor default, material→material default,
--     subcontractor/other→subcontractor default). NULL row markups stay
--     NULL (inherit). total recompute runs in the service layer after.
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
  -- default (IS NOT DISTINCT FROM treats NULL=NULL as "at default").
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

  -- Row-level markups: NULL means "inherit from estimate" and stays
  -- NULL; non-NULL values equal to the active default (for that row's
  -- type) swap to the new default.
  UPDATE estimate_line_rows r
  SET markup_percent = CASE
        WHEN r.markup_percent IS NULL THEN NULL
        WHEN r.row_type = 'labor'
             AND r.markup_percent IS NOT DISTINCT FROM v_active_lab THEN v_new_lab
        WHEN r.row_type = 'material'
             AND r.markup_percent IS NOT DISTINCT FROM v_active_mat THEN v_new_mat
        WHEN r.row_type IN ('subcontractor', 'other')
             AND r.markup_percent IS NOT DISTINCT FROM v_active_sub THEN v_new_sub
        ELSE r.markup_percent END
  FROM estimate_line_items li
  WHERE r.line_item_id = li.id AND li.estimate_id = p_estimate_id;
END;
$$;

-- ----------------------------------------
-- 7b. set_winning_bid — upsert ONE subcontractor row on the line
--     (Rev 2 §2.5). 0 rows → insert; 1 row → update; 2+ → error.
--     estimate_sub_bids winner flip is unchanged. total recompute runs
--     in the service layer afterward.
-- ----------------------------------------

CREATE OR REPLACE FUNCTION set_winning_bid(p_line_item_id UUID, p_sub_bid_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id UUID := get_my_company_id();
  v_role TEXT := get_my_role();
  v_line estimate_line_items%ROWTYPE;
  v_bid estimate_sub_bids%ROWTYPE;
  v_estimate estimates%ROWTYPE;
  v_sub_row_count INTEGER;
  v_sub_row_id UUID;
  v_next_sort INTEGER;
BEGIN
  IF v_role IS NULL OR v_role NOT IN ('owner', 'admin', 'project_manager') THEN
    RAISE EXCEPTION 'Only Owner, Admin, or PM can set a winning bid';
  END IF;

  SELECT * INTO v_line FROM estimate_line_items WHERE id = p_line_item_id;
  IF NOT FOUND OR v_line.company_id <> v_company_id THEN
    RAISE EXCEPTION 'Line item not found';
  END IF;

  SELECT * INTO v_bid FROM estimate_sub_bids WHERE id = p_sub_bid_id;
  IF NOT FOUND OR v_bid.company_id <> v_company_id
     OR v_bid.line_item_id <> p_line_item_id OR v_bid.is_deleted THEN
    RAISE EXCEPTION 'Sub bid not found for this line item';
  END IF;

  SELECT * INTO v_estimate FROM estimates WHERE id = v_line.estimate_id;
  IF v_estimate.status <> 'draft' THEN
    RAISE EXCEPTION 'Estimate is not editable (status: %)', v_estimate.status;
  END IF;

  -- D2: PMs can only act on estimates they created
  IF v_role = 'project_manager' AND v_estimate.created_by <> auth.uid() THEN
    RAISE EXCEPTION 'PMs can only modify their own estimates';
  END IF;

  -- Flip the winner on the audit table (clear first so the partial
  -- unique index never sees two winners).
  UPDATE estimate_sub_bids
  SET is_winner = false
  WHERE line_item_id = p_line_item_id AND is_winner = true;

  UPDATE estimate_sub_bids SET is_winner = true WHERE id = p_sub_bid_id;

  -- Upsert exactly one subcontractor row on the line (Rev 2 §2.5).
  SELECT count(*) INTO v_sub_row_count
  FROM estimate_line_rows
  WHERE line_item_id = p_line_item_id AND row_type = 'subcontractor';

  IF v_sub_row_count >= 2 THEN
    RAISE EXCEPTION 'Line has % subcontractor rows; winning-bid auto-management requires 0 or 1', v_sub_row_count;
  ELSIF v_sub_row_count = 1 THEN
    UPDATE estimate_line_rows
    SET amount = v_bid.bid_amount,
        subcontractor_id = v_bid.subcontractor_id,
        total = v_bid.bid_amount   -- service recomputes with markup/tax
    WHERE line_item_id = p_line_item_id AND row_type = 'subcontractor';
  ELSE
    SELECT COALESCE(max(sort_order) + 1, 0) INTO v_next_sort
    FROM estimate_line_rows WHERE line_item_id = p_line_item_id;

    INSERT INTO estimate_line_rows (
      company_id, line_item_id, row_type, name, sort_order,
      markup_percent, apply_tax, total, amount, subcontractor_id
    ) VALUES (
      v_company_id, p_line_item_id, 'subcontractor', 'Subcontractor bid', v_next_sort,
      NULL, false, v_bid.bid_amount, v_bid.bid_amount, v_bid.subcontractor_id
    );
  END IF;
END;
$$;

-- ----------------------------------------
-- 7c. clone_estimate / clone_estimate_line — clone the new line/row
--     shape. scope_of_work replaced by scope_summary + scope_sections;
--     line markups/costs gone (now on rows); presentation_mode +
--     total_price_override carried over.
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
    name, description, presentation_mode,
    discount_type, discount_amount,
    total_price, total_price_override, notes, sort_order
  ) VALUES (
    p_company_id, p_new_estimate_id, p_new_category_id, p_new_subcategory_id,
    p_line.name, p_line.description, p_line.presentation_mode,
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
    INSERT INTO estimate_categories (company_id, estimate_id, name, sort_order, presentation_mode)
    VALUES (v_company_id, v_new_id, v_cat.name, v_cat.sort_order, v_cat.presentation_mode)
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
