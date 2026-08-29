-- ============================================================================
-- PO module §4.1 — cost_catalog gains a type, a display cost code, and
-- company-wide favorites (po-module-spec.md; rulings R-Q6, R-Q7).
-- ============================================================================
--
-- item_type powers the add-items sheet's left rail. THE ESTIMATE ROW_TYPE ENUM
-- IS NOT EXTENDED: 'equipment' is a catalog notion only — an equipment item
-- lands on the estimate as an 'other' row (amount = qty × unit_cost). Mapping
-- lives in ONE place, the sheet's service (estimate-items-client.ts).
--
-- cost_code is DISPLAY METADATA ("06 — CARPENTRY"). No key derives from it:
-- project_budget_items.cost_code remains the estimate category name, written
-- by convert_estimate_to_project — this column does not compete for that role
-- (spec §3.6).
--
-- is_favorite is COMPANY-WIDE by ruling (R-Q6), so it lives here and not on a
-- per-user table. Any role that can read the catalog can see stars; writes
-- follow the existing catalog UPDATE policy (Owner/Admin/PM).

BEGIN;

ALTER TABLE public.cost_catalog
  ADD COLUMN item_type text NOT NULL DEFAULT 'material'
    CONSTRAINT cost_catalog_item_type_check
    CHECK (item_type = ANY (ARRAY['material'::text, 'labor'::text, 'subcontractor'::text, 'equipment'::text, 'other'::text])),
  ADD COLUMN cost_code text,
  ADD COLUMN is_favorite boolean NOT NULL DEFAULT false;

-- Existing rows are all materials by construction (the table was material-only
-- until this migration); the DEFAULT covers them.

COMMIT;
