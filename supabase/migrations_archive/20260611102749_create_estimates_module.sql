-- ============================================================
-- FrameFocus — Migration: Estimates schema & data layer (Sub-module 4C)
-- ============================================================
-- One atomic migration (decision D6): companies ALTER, 7 estimate
-- tables, numbering function, set_winning_bid RPC, triggers,
-- indexes, RLS.
--
-- References: docs/specs/4C-spec.md, docs/module4-architecture.md
-- §4.4–§4.14, CLAUDE.md conventions.
-- Template: 20260611002451_create_cost_catalog.sql (4B).
--
-- Locked decisions (Session 49):
--   D1 — estimates.project_id is a bare nullable UUID (no FK);
--        the FK is added by the Module 5 migration once the
--        projects table exists.
--   D2 — PM visibility = own estimates only (created_by = auth.uid()).
--   D3 — frozen-when-Sent enforced in BOTH the service guard and
--        RLS (see estimates UPDATE policy note below).
--   D4 — child-table RLS = company scope + EXISTS(parent estimate
--        visible to caller). The EXISTS subquery hits the parent's
--        own RLS, so visibility rules are not duplicated here.
--   D5 — next_estimate_number(): row-locking Postgres function.
--        Wired as the DEFAULT of estimates.estimate_number so the
--        sequence increment happens inside the INSERT transaction
--        (no gaps on failed inserts). Explicit values (version
--        copies keep their number) override the default.
--   D6 — single migration (this file).
--
-- Totals (subtotal/tax_total/discount_total/grand_total,
-- total_price, total_cost/tax_amount) are app-maintained plain
-- NUMERIC — estimate totals aggregate across child rows, which
-- DB-generated columns cannot reference. Formulas: §4.4a/§4.4b.
-- ============================================================

-- ----------------------------------------
-- 1. companies — estimating defaults (§4.14 "Modifications")
-- ----------------------------------------

ALTER TABLE companies
  ADD COLUMN estimate_number_prefix TEXT NOT NULL DEFAULT 'EST',
  ADD COLUMN estimate_number_sequence INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN default_subcontractor_markup_percent NUMERIC,
  ADD COLUMN default_material_markup_percent NUMERIC,
  ADD COLUMN default_labor_markup_percent NUMERIC,
  ADD COLUMN default_terms_sections JSONB,
  ADD COLUMN default_tax_rate NUMERIC;

-- ----------------------------------------
-- 2. Estimate numbering (D5)
--    Atomic: the UPDATE row-locks the caller's companies row, so
--    concurrent inserts serialize and never collide. SECURITY
--    DEFINER because the caller may not have UPDATE rights on
--    companies (PM creating an estimate).
-- ----------------------------------------

CREATE OR REPLACE FUNCTION next_estimate_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id UUID := get_my_company_id();
  v_prefix TEXT;
  v_seq INTEGER;
BEGIN
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'next_estimate_number: no company for caller';
  END IF;

  UPDATE companies
  SET estimate_number_sequence = estimate_number_sequence + 1
  WHERE id = v_company_id
  RETURNING estimate_number_prefix, estimate_number_sequence
  INTO v_prefix, v_seq;

  RETURN v_prefix || '-' || lpad(v_seq::text, 3, '0');
END;
$$;

-- ----------------------------------------
-- 3. estimates — soft delete
-- ----------------------------------------

CREATE TABLE estimates (
  -- Standard columns
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  created_by      UUID REFERENCES auth.users(id),
  updated_by      UUID REFERENCES auth.users(id),
  is_deleted      BOOLEAN DEFAULT false,
  deleted_at      TIMESTAMPTZ,

  -- Identity
  estimate_number TEXT NOT NULL DEFAULT next_estimate_number(),
  name            TEXT NOT NULL,

  -- Relations
  contact_id              UUID NOT NULL REFERENCES contacts(id),
  contact_address_id      UUID REFERENCES contact_addresses(id),
  project_id              UUID,  -- D1: no FK until Module 5 creates projects
  parent_estimate_id      UUID REFERENCES estimates(id),
  cloned_from_estimate_id UUID REFERENCES estimates(id),

  -- Lifecycle (§4.8)
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'review', 'sent', 'viewed', 'accepted',
    'declined', 'expired', 'revised'
  )),
  version_number TEXT NOT NULL DEFAULT 'v1.1',

  -- Pricing inputs (copied from company defaults on create; §4.4/§4.4a)
  tax_rate                      NUMERIC,
  subcontractor_markup_percent  NUMERIC,
  material_markup_percent       NUMERIC,
  labor_markup_percent          NUMERIC,

  -- Whole-estimate discount (§4.4b)
  discount_type   TEXT CHECK (discount_type IN ('percent', 'fixed')),
  discount_amount NUMERIC,

  -- App-maintained totals
  subtotal       NUMERIC NOT NULL DEFAULT 0,
  tax_total      NUMERIC NOT NULL DEFAULT 0,
  discount_total NUMERIC NOT NULL DEFAULT 0,
  grand_total    NUMERIC NOT NULL DEFAULT 0,

  -- Proposal content (§4.5)
  proposal_pricing_level TEXT NOT NULL DEFAULT 'total_only' CHECK (
    proposal_pricing_level IN ('total_only', 'category_totals', 'line_items')
  ),
  cover_letter   TEXT,
  scope_of_work  TEXT[],
  terms_sections JSONB,

  -- Expiration / lifecycle timestamps
  expiration_days INTEGER NOT NULL DEFAULT 30,
  expires_at      TIMESTAMPTZ,
  sent_at         TIMESTAMPTZ,
  viewed_at       TIMESTAMPTZ,  -- reserved, unused in v1 (§4.6)
  accepted_at     TIMESTAMPTZ,
  declined_at     TIMESTAMPTZ,

  -- Decline analytics (§4.8)
  decline_reason_code TEXT CHECK (decline_reason_code IN (
    'too_expensive', 'chose_competitor', 'project_canceled',
    'timing', 'scope_changed', 'other'
  )),
  decline_reason_notes TEXT,

  -- Signed proposal lives in Module 3 files; SET NULL preserves the
  -- estimate if the file is permanently deleted (CLAUDE.md FK rule).
  signed_proposal_file_id UUID REFERENCES files(id) ON DELETE SET NULL,

  -- Review workflow (§4.8 Review status — PM-created estimates only)
  created_by_role TEXT NOT NULL DEFAULT get_my_role(),
  reviewed_by     UUID REFERENCES profiles(id),
  reviewed_at     TIMESTAMPTZ
);

-- ----------------------------------------
-- 4. estimate_categories — hard delete
-- ----------------------------------------

CREATE TABLE estimate_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id),
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  created_by  UUID REFERENCES auth.users(id),
  updated_by  UUID REFERENCES auth.users(id),

  estimate_id UUID NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  sort_order  INTEGER NOT NULL
);

-- ----------------------------------------
-- 5. estimate_subcategories — hard delete, optional layer
-- ----------------------------------------

CREATE TABLE estimate_subcategories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id),
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  created_by  UUID REFERENCES auth.users(id),
  updated_by  UUID REFERENCES auth.users(id),

  estimate_id UUID NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES estimate_categories(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  sort_order  INTEGER NOT NULL
);

-- ----------------------------------------
-- 6. estimate_line_items — hard delete
-- ----------------------------------------

CREATE TABLE estimate_line_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id),
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  created_by  UUID REFERENCES auth.users(id),
  updated_by  UUID REFERENCES auth.users(id),

  estimate_id    UUID NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
  category_id    UUID NOT NULL REFERENCES estimate_categories(id) ON DELETE CASCADE,
  -- Subcategory removal drops lines back to category level, not away
  subcategory_id UUID REFERENCES estimate_subcategories(id) ON DELETE SET NULL,

  name        TEXT NOT NULL,
  description TEXT,
  line_type   TEXT NOT NULL CHECK (line_type IN ('detailed', 'lump_sum')),

  -- Lump-sum fields (winning bid is also copied here — §4.14)
  sub_bid_amount   NUMERIC,
  subcontractor_id UUID REFERENCES subcontractors(id),

  -- Detailed fields
  labor_cost             NUMERIC,
  material_cost_subtotal NUMERIC,  -- app-maintained from materials rows
  tax_amount             NUMERIC,  -- material_cost_subtotal × estimate tax_rate

  -- Markups (§4.4a — only the columns relevant to line_type are used)
  subcontractor_markup_percent NUMERIC,
  labor_markup_percent         NUMERIC,
  material_markup_percent      NUMERIC,

  -- Per-line discount (§4.4b)
  discount_type   TEXT CHECK (discount_type IN ('percent', 'fixed')),
  discount_amount NUMERIC,

  total_price NUMERIC NOT NULL DEFAULT 0,  -- app-maintained
  notes       TEXT,                        -- internal, not client-facing
  sort_order  INTEGER NOT NULL
);

-- ----------------------------------------
-- 7. estimate_line_materials — hard delete
-- ----------------------------------------

CREATE TABLE estimate_line_materials (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id),
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  created_by  UUID REFERENCES auth.users(id),
  updated_by  UUID REFERENCES auth.users(id),

  line_item_id    UUID NOT NULL REFERENCES estimate_line_items(id) ON DELETE CASCADE,
  -- Nullable: ad-hoc entries have no catalog source. Cost is
  -- snapshotted at add-time; catalog edits never retro-change this row.
  catalog_item_id UUID REFERENCES cost_catalog(id),

  name TEXT NOT NULL,
  -- 'allowance' flags a placeholder amount aggregated into the
  -- proposal allowance summary (§4.5); unit_cost IS the allowance.
  unit_of_measure TEXT NOT NULL CHECK (unit_of_measure IN (
    'each', 'sq_ft', 'linear_ft', 'box', 'bundle', 'bag',
    'gallon', 'pair', 'set', 'allowance', 'other'
  )),
  unit_cost  NUMERIC NOT NULL,
  quantity   NUMERIC,                     -- ignored when allowance
  total_cost NUMERIC NOT NULL DEFAULT 0   -- app-maintained
);

-- ----------------------------------------
-- 8. estimate_sub_bids — soft delete (audit trail of all bids)
-- ----------------------------------------

CREATE TABLE estimate_sub_bids (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id),
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  created_by  UUID REFERENCES auth.users(id),
  updated_by  UUID REFERENCES auth.users(id),
  is_deleted  BOOLEAN DEFAULT false,
  deleted_at  TIMESTAMPTZ,

  estimate_id      UUID NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
  line_item_id     UUID NOT NULL REFERENCES estimate_line_items(id) ON DELETE CASCADE,
  subcontractor_id UUID NOT NULL REFERENCES subcontractors(id),

  bid_amount           NUMERIC NOT NULL,
  -- SET NULL preserves the bid record if the file is permanently deleted
  bid_document_file_id UUID REFERENCES files(id) ON DELETE SET NULL,
  notes                TEXT,
  is_winner            BOOLEAN NOT NULL DEFAULT false,
  received_at          TIMESTAMPTZ
);

-- One winner per line item; soft-deleted winners free the slot
CREATE UNIQUE INDEX idx_estimate_sub_bids_one_winner
  ON estimate_sub_bids(line_item_id)
  WHERE is_winner = true AND is_deleted = false;

-- ----------------------------------------
-- 9. estimate_files — hard-delete junction
-- ----------------------------------------

CREATE TABLE estimate_files (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id),
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  created_by  UUID REFERENCES auth.users(id),
  updated_by  UUID REFERENCES auth.users(id),

  estimate_id UUID NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
  -- Junction row is meaningless without the file (CLAUDE.md FK rule)
  file_id     UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,

  attachment_type TEXT NOT NULL CHECK (attachment_type IN (
    'site_photo', 'plan', 'sub_bid', 'other'
  )),
  notes      TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- ----------------------------------------
-- 10. Per-tenant column defaults (CLAUDE.md checklist)
-- ----------------------------------------

ALTER TABLE estimates ALTER COLUMN company_id SET DEFAULT get_my_company_id();
ALTER TABLE estimates ALTER COLUMN created_by SET DEFAULT auth.uid();
ALTER TABLE estimates ALTER COLUMN updated_by SET DEFAULT auth.uid();

ALTER TABLE estimate_categories ALTER COLUMN company_id SET DEFAULT get_my_company_id();
ALTER TABLE estimate_categories ALTER COLUMN created_by SET DEFAULT auth.uid();
ALTER TABLE estimate_categories ALTER COLUMN updated_by SET DEFAULT auth.uid();

ALTER TABLE estimate_subcategories ALTER COLUMN company_id SET DEFAULT get_my_company_id();
ALTER TABLE estimate_subcategories ALTER COLUMN created_by SET DEFAULT auth.uid();
ALTER TABLE estimate_subcategories ALTER COLUMN updated_by SET DEFAULT auth.uid();

ALTER TABLE estimate_line_items ALTER COLUMN company_id SET DEFAULT get_my_company_id();
ALTER TABLE estimate_line_items ALTER COLUMN created_by SET DEFAULT auth.uid();
ALTER TABLE estimate_line_items ALTER COLUMN updated_by SET DEFAULT auth.uid();

ALTER TABLE estimate_line_materials ALTER COLUMN company_id SET DEFAULT get_my_company_id();
ALTER TABLE estimate_line_materials ALTER COLUMN created_by SET DEFAULT auth.uid();
ALTER TABLE estimate_line_materials ALTER COLUMN updated_by SET DEFAULT auth.uid();

ALTER TABLE estimate_sub_bids ALTER COLUMN company_id SET DEFAULT get_my_company_id();
ALTER TABLE estimate_sub_bids ALTER COLUMN created_by SET DEFAULT auth.uid();
ALTER TABLE estimate_sub_bids ALTER COLUMN updated_by SET DEFAULT auth.uid();

ALTER TABLE estimate_files ALTER COLUMN company_id SET DEFAULT get_my_company_id();
ALTER TABLE estimate_files ALTER COLUMN created_by SET DEFAULT auth.uid();
ALTER TABLE estimate_files ALTER COLUMN updated_by SET DEFAULT auth.uid();

-- ----------------------------------------
-- 11. Indexes (company_id + FK indexes per table)
-- ----------------------------------------

CREATE INDEX idx_estimates_company_id ON estimates(company_id);
CREATE INDEX idx_estimates_contact_id ON estimates(contact_id);
CREATE INDEX idx_estimates_contact_address_id ON estimates(contact_address_id);
CREATE INDEX idx_estimates_status ON estimates(status);
CREATE INDEX idx_estimates_estimate_number ON estimates(estimate_number);
CREATE INDEX idx_estimates_parent_estimate_id ON estimates(parent_estimate_id);
CREATE INDEX idx_estimates_cloned_from_estimate_id ON estimates(cloned_from_estimate_id);
CREATE INDEX idx_estimates_signed_proposal_file_id ON estimates(signed_proposal_file_id);
CREATE INDEX idx_estimates_reviewed_by ON estimates(reviewed_by);

CREATE INDEX idx_estimate_categories_company_id ON estimate_categories(company_id);
CREATE INDEX idx_estimate_categories_estimate_id ON estimate_categories(estimate_id);

CREATE INDEX idx_estimate_subcategories_company_id ON estimate_subcategories(company_id);
CREATE INDEX idx_estimate_subcategories_estimate_id ON estimate_subcategories(estimate_id);
CREATE INDEX idx_estimate_subcategories_category_id ON estimate_subcategories(category_id);

CREATE INDEX idx_estimate_line_items_company_id ON estimate_line_items(company_id);
CREATE INDEX idx_estimate_line_items_estimate_id ON estimate_line_items(estimate_id);
CREATE INDEX idx_estimate_line_items_category_id ON estimate_line_items(category_id);
CREATE INDEX idx_estimate_line_items_subcategory_id ON estimate_line_items(subcategory_id);
CREATE INDEX idx_estimate_line_items_subcontractor_id ON estimate_line_items(subcontractor_id);

CREATE INDEX idx_estimate_line_materials_company_id ON estimate_line_materials(company_id);
CREATE INDEX idx_estimate_line_materials_line_item_id ON estimate_line_materials(line_item_id);
CREATE INDEX idx_estimate_line_materials_catalog_item_id ON estimate_line_materials(catalog_item_id);

CREATE INDEX idx_estimate_sub_bids_company_id ON estimate_sub_bids(company_id);
CREATE INDEX idx_estimate_sub_bids_estimate_id ON estimate_sub_bids(estimate_id);
CREATE INDEX idx_estimate_sub_bids_line_item_id ON estimate_sub_bids(line_item_id);
CREATE INDEX idx_estimate_sub_bids_subcontractor_id ON estimate_sub_bids(subcontractor_id);
CREATE INDEX idx_estimate_sub_bids_bid_document_file_id ON estimate_sub_bids(bid_document_file_id);

CREATE INDEX idx_estimate_files_company_id ON estimate_files(company_id);
CREATE INDEX idx_estimate_files_estimate_id ON estimate_files(estimate_id);
CREATE INDEX idx_estimate_files_file_id ON estimate_files(file_id);

-- ----------------------------------------
-- 12. Standard triggers (CLAUDE.md — updated_at + updated_by)
-- ----------------------------------------

CREATE TRIGGER estimates_updated_at
  BEFORE UPDATE ON estimates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE FUNCTION set_estimates_updated_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER estimates_set_updated_by
  BEFORE UPDATE ON estimates
  FOR EACH ROW EXECUTE FUNCTION set_estimates_updated_by();

CREATE TRIGGER estimate_categories_updated_at
  BEFORE UPDATE ON estimate_categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE FUNCTION set_estimate_categories_updated_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER estimate_categories_set_updated_by
  BEFORE UPDATE ON estimate_categories
  FOR EACH ROW EXECUTE FUNCTION set_estimate_categories_updated_by();

CREATE TRIGGER estimate_subcategories_updated_at
  BEFORE UPDATE ON estimate_subcategories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE FUNCTION set_estimate_subcategories_updated_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER estimate_subcategories_set_updated_by
  BEFORE UPDATE ON estimate_subcategories
  FOR EACH ROW EXECUTE FUNCTION set_estimate_subcategories_updated_by();

CREATE TRIGGER estimate_line_items_updated_at
  BEFORE UPDATE ON estimate_line_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE FUNCTION set_estimate_line_items_updated_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER estimate_line_items_set_updated_by
  BEFORE UPDATE ON estimate_line_items
  FOR EACH ROW EXECUTE FUNCTION set_estimate_line_items_updated_by();

CREATE TRIGGER estimate_line_materials_updated_at
  BEFORE UPDATE ON estimate_line_materials
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE FUNCTION set_estimate_line_materials_updated_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER estimate_line_materials_set_updated_by
  BEFORE UPDATE ON estimate_line_materials
  FOR EACH ROW EXECUTE FUNCTION set_estimate_line_materials_updated_by();

CREATE TRIGGER estimate_sub_bids_updated_at
  BEFORE UPDATE ON estimate_sub_bids
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE FUNCTION set_estimate_sub_bids_updated_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER estimate_sub_bids_set_updated_by
  BEFORE UPDATE ON estimate_sub_bids
  FOR EACH ROW EXECUTE FUNCTION set_estimate_sub_bids_updated_by();

CREATE TRIGGER estimate_files_updated_at
  BEFORE UPDATE ON estimate_files
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE FUNCTION set_estimate_files_updated_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER estimate_files_set_updated_by
  BEFORE UPDATE ON estimate_files
  FOR EACH ROW EXECUTE FUNCTION set_estimate_files_updated_by();

-- ----------------------------------------
-- 13. set_winning_bid RPC (Q4 — atomic winner flip)
--     Clears any existing winner on the line, marks the new winner,
--     and copies bid_amount + subcontractor onto the line item so
--     proposal generation reads the line, not the bids table.
--     total_price recompute stays app-maintained (service layer).
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
BEGIN
  IF v_role IS NULL OR v_role NOT IN ('owner', 'admin', 'project_manager') THEN
    RAISE EXCEPTION 'Only Owner, Admin, or PM can set a winning bid';
  END IF;

  SELECT * INTO v_line FROM estimate_line_items WHERE id = p_line_item_id;
  IF NOT FOUND OR v_line.company_id <> v_company_id THEN
    RAISE EXCEPTION 'Line item not found';
  END IF;

  IF v_line.line_type <> 'lump_sum' THEN
    RAISE EXCEPTION 'Winning bids apply only to lump-sum line items';
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

  -- Clear first so the partial unique index never sees two winners
  UPDATE estimate_sub_bids
  SET is_winner = false
  WHERE line_item_id = p_line_item_id AND is_winner = true;

  UPDATE estimate_sub_bids SET is_winner = true WHERE id = p_sub_bid_id;

  UPDATE estimate_line_items
  SET sub_bid_amount = v_bid.bid_amount,
      subcontractor_id = v_bid.subcontractor_id
  WHERE id = p_line_item_id;
END;
$$;

-- ----------------------------------------
-- 14. Row-Level Security
--
-- estimates SELECT (D2): Owner/Admin company-wide; PM own only;
-- Foreman/Crew none. No is_deleted filter (trash-bin pattern —
-- service layer filters listings).
--
-- estimates UPDATE (D3 note): PMs are hard-frozen to Draft by RLS.
-- Owner/Admin may UPDATE past Draft because status transitions
-- (review→sent, sent→accepted/declined/expired/revised) are
-- themselves UPDATEs on non-draft rows; the content freeze for
-- Owner/Admin is enforced by the service-layer draft guard.
-- Soft delete (is_deleted = true) is Owner/Admin only via WITH CHECK.
--
-- Child tables (D4): company scope + EXISTS(parent estimate).
-- The EXISTS subquery is evaluated under the estimates SELECT
-- policy, so parent visibility (incl. PM own-only) applies
-- automatically. Writes additionally require parent status =
-- 'draft' and PM ownership of the parent.
-- ----------------------------------------

ALTER TABLE estimates ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimate_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimate_subcategories ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimate_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimate_line_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimate_sub_bids ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimate_files ENABLE ROW LEVEL SECURITY;

-- estimates

CREATE POLICY estimates_select_authenticated ON estimates
  FOR SELECT
  TO authenticated
  USING (
    company_id = get_my_company_id()
    AND (
      get_my_role() IN ('owner', 'admin')
      OR (get_my_role() = 'project_manager' AND created_by = auth.uid())
    )
  );

CREATE POLICY estimates_insert_manager ON estimates
  FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id = get_my_company_id()
    AND get_my_role() IN ('owner', 'admin', 'project_manager')
  );

CREATE POLICY estimates_update_manager ON estimates
  FOR UPDATE
  TO authenticated
  USING (
    company_id = get_my_company_id()
    AND (
      get_my_role() IN ('owner', 'admin')
      OR (
        get_my_role() = 'project_manager'
        AND created_by = auth.uid()
        AND status = 'draft'
      )
    )
  )
  WITH CHECK (
    company_id = get_my_company_id()
    AND get_my_role() IN ('owner', 'admin', 'project_manager')
    -- Soft delete is Owner/Admin only (§4.13 "Delete estimate")
    AND (is_deleted = false OR get_my_role() IN ('owner', 'admin'))
  );

-- Helper predicates used by every child policy, inlined per table:
--   visibility: EXISTS parent (parent's own SELECT RLS applies)
--   writability: parent is draft + PM owns the parent

-- estimate_categories

CREATE POLICY estimate_categories_select_authenticated ON estimate_categories
  FOR SELECT
  TO authenticated
  USING (
    company_id = get_my_company_id()
    AND EXISTS (SELECT 1 FROM estimates e WHERE e.id = estimate_id)
  );

CREATE POLICY estimate_categories_insert_manager ON estimate_categories
  FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id = get_my_company_id()
    AND get_my_role() IN ('owner', 'admin', 'project_manager')
    AND EXISTS (
      SELECT 1 FROM estimates e
      WHERE e.id = estimate_id AND e.status = 'draft'
        AND (get_my_role() IN ('owner', 'admin') OR e.created_by = auth.uid())
    )
  );

CREATE POLICY estimate_categories_update_manager ON estimate_categories
  FOR UPDATE
  TO authenticated
  USING (
    company_id = get_my_company_id()
    AND get_my_role() IN ('owner', 'admin', 'project_manager')
    AND EXISTS (
      SELECT 1 FROM estimates e
      WHERE e.id = estimate_id AND e.status = 'draft'
        AND (get_my_role() IN ('owner', 'admin') OR e.created_by = auth.uid())
    )
  )
  WITH CHECK (
    company_id = get_my_company_id()
    AND get_my_role() IN ('owner', 'admin', 'project_manager')
  );

CREATE POLICY estimate_categories_delete_manager ON estimate_categories
  FOR DELETE
  TO authenticated
  USING (
    company_id = get_my_company_id()
    AND get_my_role() IN ('owner', 'admin', 'project_manager')
    AND EXISTS (
      SELECT 1 FROM estimates e
      WHERE e.id = estimate_id AND e.status = 'draft'
        AND (get_my_role() IN ('owner', 'admin') OR e.created_by = auth.uid())
    )
  );

-- estimate_subcategories

CREATE POLICY estimate_subcategories_select_authenticated ON estimate_subcategories
  FOR SELECT
  TO authenticated
  USING (
    company_id = get_my_company_id()
    AND EXISTS (SELECT 1 FROM estimates e WHERE e.id = estimate_id)
  );

CREATE POLICY estimate_subcategories_insert_manager ON estimate_subcategories
  FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id = get_my_company_id()
    AND get_my_role() IN ('owner', 'admin', 'project_manager')
    AND EXISTS (
      SELECT 1 FROM estimates e
      WHERE e.id = estimate_id AND e.status = 'draft'
        AND (get_my_role() IN ('owner', 'admin') OR e.created_by = auth.uid())
    )
  );

CREATE POLICY estimate_subcategories_update_manager ON estimate_subcategories
  FOR UPDATE
  TO authenticated
  USING (
    company_id = get_my_company_id()
    AND get_my_role() IN ('owner', 'admin', 'project_manager')
    AND EXISTS (
      SELECT 1 FROM estimates e
      WHERE e.id = estimate_id AND e.status = 'draft'
        AND (get_my_role() IN ('owner', 'admin') OR e.created_by = auth.uid())
    )
  )
  WITH CHECK (
    company_id = get_my_company_id()
    AND get_my_role() IN ('owner', 'admin', 'project_manager')
  );

CREATE POLICY estimate_subcategories_delete_manager ON estimate_subcategories
  FOR DELETE
  TO authenticated
  USING (
    company_id = get_my_company_id()
    AND get_my_role() IN ('owner', 'admin', 'project_manager')
    AND EXISTS (
      SELECT 1 FROM estimates e
      WHERE e.id = estimate_id AND e.status = 'draft'
        AND (get_my_role() IN ('owner', 'admin') OR e.created_by = auth.uid())
    )
  );

-- estimate_line_items

CREATE POLICY estimate_line_items_select_authenticated ON estimate_line_items
  FOR SELECT
  TO authenticated
  USING (
    company_id = get_my_company_id()
    AND EXISTS (SELECT 1 FROM estimates e WHERE e.id = estimate_id)
  );

CREATE POLICY estimate_line_items_insert_manager ON estimate_line_items
  FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id = get_my_company_id()
    AND get_my_role() IN ('owner', 'admin', 'project_manager')
    AND EXISTS (
      SELECT 1 FROM estimates e
      WHERE e.id = estimate_id AND e.status = 'draft'
        AND (get_my_role() IN ('owner', 'admin') OR e.created_by = auth.uid())
    )
  );

CREATE POLICY estimate_line_items_update_manager ON estimate_line_items
  FOR UPDATE
  TO authenticated
  USING (
    company_id = get_my_company_id()
    AND get_my_role() IN ('owner', 'admin', 'project_manager')
    AND EXISTS (
      SELECT 1 FROM estimates e
      WHERE e.id = estimate_id AND e.status = 'draft'
        AND (get_my_role() IN ('owner', 'admin') OR e.created_by = auth.uid())
    )
  )
  WITH CHECK (
    company_id = get_my_company_id()
    AND get_my_role() IN ('owner', 'admin', 'project_manager')
  );

CREATE POLICY estimate_line_items_delete_manager ON estimate_line_items
  FOR DELETE
  TO authenticated
  USING (
    company_id = get_my_company_id()
    AND get_my_role() IN ('owner', 'admin', 'project_manager')
    AND EXISTS (
      SELECT 1 FROM estimates e
      WHERE e.id = estimate_id AND e.status = 'draft'
        AND (get_my_role() IN ('owner', 'admin') OR e.created_by = auth.uid())
    )
  );

-- estimate_line_materials (no estimate_id — scope via parent line item,
-- whose own RLS chains up to the estimate)

CREATE POLICY estimate_line_materials_select_authenticated ON estimate_line_materials
  FOR SELECT
  TO authenticated
  USING (
    company_id = get_my_company_id()
    AND EXISTS (SELECT 1 FROM estimate_line_items li WHERE li.id = line_item_id)
  );

CREATE POLICY estimate_line_materials_insert_manager ON estimate_line_materials
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

CREATE POLICY estimate_line_materials_update_manager ON estimate_line_materials
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

CREATE POLICY estimate_line_materials_delete_manager ON estimate_line_materials
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

-- estimate_sub_bids (soft delete — no DELETE policy; UPDATE serves
-- soft delete)

CREATE POLICY estimate_sub_bids_select_authenticated ON estimate_sub_bids
  FOR SELECT
  TO authenticated
  USING (
    company_id = get_my_company_id()
    AND EXISTS (SELECT 1 FROM estimates e WHERE e.id = estimate_id)
  );

CREATE POLICY estimate_sub_bids_insert_manager ON estimate_sub_bids
  FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id = get_my_company_id()
    AND get_my_role() IN ('owner', 'admin', 'project_manager')
    AND EXISTS (
      SELECT 1 FROM estimates e
      WHERE e.id = estimate_id AND e.status = 'draft'
        AND (get_my_role() IN ('owner', 'admin') OR e.created_by = auth.uid())
    )
  );

CREATE POLICY estimate_sub_bids_update_manager ON estimate_sub_bids
  FOR UPDATE
  TO authenticated
  USING (
    company_id = get_my_company_id()
    AND get_my_role() IN ('owner', 'admin', 'project_manager')
    AND EXISTS (
      SELECT 1 FROM estimates e
      WHERE e.id = estimate_id AND e.status = 'draft'
        AND (get_my_role() IN ('owner', 'admin') OR e.created_by = auth.uid())
    )
  )
  WITH CHECK (
    company_id = get_my_company_id()
    AND get_my_role() IN ('owner', 'admin', 'project_manager')
  );

-- estimate_files (hard-delete junction)

CREATE POLICY estimate_files_select_authenticated ON estimate_files
  FOR SELECT
  TO authenticated
  USING (
    company_id = get_my_company_id()
    AND EXISTS (SELECT 1 FROM estimates e WHERE e.id = estimate_id)
  );

CREATE POLICY estimate_files_insert_manager ON estimate_files
  FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id = get_my_company_id()
    AND get_my_role() IN ('owner', 'admin', 'project_manager')
    AND EXISTS (
      SELECT 1 FROM estimates e
      WHERE e.id = estimate_id AND e.status = 'draft'
        AND (get_my_role() IN ('owner', 'admin') OR e.created_by = auth.uid())
    )
  );

CREATE POLICY estimate_files_update_manager ON estimate_files
  FOR UPDATE
  TO authenticated
  USING (
    company_id = get_my_company_id()
    AND get_my_role() IN ('owner', 'admin', 'project_manager')
    AND EXISTS (
      SELECT 1 FROM estimates e
      WHERE e.id = estimate_id AND e.status = 'draft'
        AND (get_my_role() IN ('owner', 'admin') OR e.created_by = auth.uid())
    )
  )
  WITH CHECK (
    company_id = get_my_company_id()
    AND get_my_role() IN ('owner', 'admin', 'project_manager')
  );

CREATE POLICY estimate_files_delete_manager ON estimate_files
  FOR DELETE
  TO authenticated
  USING (
    company_id = get_my_company_id()
    AND get_my_role() IN ('owner', 'admin', 'project_manager')
    AND EXISTS (
      SELECT 1 FROM estimates e
      WHERE e.id = estimate_id AND e.status = 'draft'
        AND (get_my_role() IN ('owner', 'admin') OR e.created_by = auth.uid())
    )
  );
