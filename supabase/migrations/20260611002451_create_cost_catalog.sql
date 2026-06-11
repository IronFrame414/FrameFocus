-- ============================================================
-- FrameFocus — Migration: cost_catalog (Sub-module 4B)
-- ============================================================
-- Per-company library of materials with known unit costs, used
-- when building detailed estimate line items (4C/4D). Catalog
-- unit cost is snapshotted into estimates at add-time — catalog
-- edits never retro-change existing estimates.
--
-- References: docs/specs/Spec 4b cost catalog,
-- docs/module4-architecture.md §4.3 + §4.14, CLAUDE.md conventions.
-- Template: 20260425235056_create_contact_addresses.sql (4A).
--
-- Decisions (locked in SPEC): soft delete only; SELECT for any
-- company member; INSERT/UPDATE for Owner/Admin/PM; no hard-DELETE
-- policy; `unit_of_measure` excludes `allowance` (estimate-time
-- concept, not a catalog property).
-- ============================================================

-- ----------------------------------------
-- Table
-- ----------------------------------------

CREATE TABLE cost_catalog (
  -- Standard columns
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  created_by      UUID REFERENCES auth.users(id),
  updated_by      UUID REFERENCES auth.users(id),
  is_deleted      BOOLEAN DEFAULT false,
  deleted_at      TIMESTAMPTZ,

  -- Catalog data
  name              TEXT NOT NULL,
  category          TEXT NOT NULL CHECK (category IN (
                      'lumber', 'fasteners', 'electrical', 'plumbing',
                      'finishes', 'concrete', 'drywall', 'roofing',
                      'paint', 'hardware', 'insulation', 'other'
                    )),
  unit_of_measure   TEXT NOT NULL CHECK (unit_of_measure IN (
                      'each', 'sq_ft', 'linear_ft', 'box', 'bundle',
                      'bag', 'gallon', 'pair', 'set', 'other'
                    )),
  unit_cost         NUMERIC(12,2) NOT NULL,
  default_vendor_id UUID REFERENCES subcontractors(id),
  product_url       TEXT,
  last_verified_at  TIMESTAMPTZ,
  notes             TEXT
);

-- ----------------------------------------
-- Per-tenant column defaults
-- (CLAUDE.md "Per-tenant table column-defaults checklist")
-- ----------------------------------------

ALTER TABLE cost_catalog ALTER COLUMN company_id SET DEFAULT get_my_company_id();
ALTER TABLE cost_catalog ALTER COLUMN created_by SET DEFAULT auth.uid();
ALTER TABLE cost_catalog ALTER COLUMN updated_by SET DEFAULT auth.uid();

-- ----------------------------------------
-- Indexes
-- ----------------------------------------

CREATE INDEX idx_cost_catalog_company_id ON cost_catalog(company_id);
CREATE INDEX idx_cost_catalog_category ON cost_catalog(category);
CREATE INDEX idx_cost_catalog_default_vendor_id ON cost_catalog(default_vendor_id);

-- ----------------------------------------
-- Standard triggers (BEFORE UPDATE)
--   updated_at trigger reuses the shared `update_updated_at()` function
--   from Migration 20260101000001. updated_by trigger follows the
--   per-table function pattern (Migrations 018, 019, tag_options, 4A).
-- ----------------------------------------

CREATE TRIGGER cost_catalog_updated_at
  BEFORE UPDATE ON cost_catalog
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE FUNCTION set_cost_catalog_updated_by()
  RETURNS TRIGGER
  LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;

CREATE TRIGGER cost_catalog_set_updated_by
  BEFORE UPDATE ON cost_catalog
  FOR EACH ROW
  EXECUTE FUNCTION set_cost_catalog_updated_by();

-- ----------------------------------------
-- Row-Level Security
--   SELECT: any company member. INSERT/UPDATE: Owner/Admin/PM
--   (§4.13 "Manage cost catalog"); the UPDATE path also serves
--   soft delete. No hard-DELETE policy (soft delete only).
--   RLS does NOT filter is_deleted; the service layer enforces
--   that per CLAUDE.md trash-bin pattern (so a restore flow can
--   read soft-deleted rows by id).
-- ----------------------------------------

ALTER TABLE cost_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY cost_catalog_select_authenticated ON cost_catalog
  FOR SELECT
  TO authenticated
  USING (company_id = get_my_company_id());

CREATE POLICY cost_catalog_insert_manager ON cost_catalog
  FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id = get_my_company_id()
    AND get_my_role() IN ('owner', 'admin', 'project_manager')
  );

CREATE POLICY cost_catalog_update_manager ON cost_catalog
  FOR UPDATE
  TO authenticated
  USING (
    company_id = get_my_company_id()
    AND get_my_role() IN ('owner', 'admin', 'project_manager')
  )
  WITH CHECK (
    company_id = get_my_company_id()
    AND get_my_role() IN ('owner', 'admin', 'project_manager')
  );
