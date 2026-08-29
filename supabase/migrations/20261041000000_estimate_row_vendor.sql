-- ============================================================================
-- PO module §4.2 — estimate_line_rows.vendor_id (ruling R4).
-- ============================================================================
--
-- The vendor SNAPSHOT on a material row: stamped from
-- cost_catalog.default_vendor_id at pick time (the catalog default can change
-- later without rewriting history — the platform's freeze philosophy),
-- editable in the sheet's row detail, NULL for manually-typed rows (R4's
-- honest blank: never guess a string). Conversion's PO-drafting service groups
-- material rows by this key; NULL lands on the "no vendor yet" card.
--
-- The type-columns CHECK is REPLACED wholesale (its 20261025 form, which this
-- supersedes): vendor_id is legal on MATERIAL rows only. Every other arm gains
-- `AND vendor_id IS NULL` — a labor/allowance/sub/other row carrying a vendor
-- is a shaping bug the DB refuses, same as catalog_item_id on an allowance.

BEGIN;

ALTER TABLE public.estimate_line_rows
  ADD COLUMN vendor_id uuid REFERENCES public.subcontractors(id);

ALTER TABLE public.estimate_line_rows
  DROP CONSTRAINT estimate_line_rows_type_columns,
  ADD CONSTRAINT estimate_line_rows_type_columns CHECK (
    CASE row_type
      WHEN 'labor'         THEN amount IS NULL AND subcontractor_id IS NULL AND catalog_item_id IS NULL AND unit_of_measure IS NULL AND unit_cost IS NULL AND apply_tax = false AND vendor_id IS NULL
      WHEN 'material'      THEN rate IS NULL AND labor_unit IS NULL AND amount IS NULL AND subcontractor_id IS NULL
      WHEN 'allowance'     THEN rate IS NULL AND labor_unit IS NULL AND amount IS NULL AND subcontractor_id IS NULL AND catalog_item_id IS NULL AND vendor_id IS NULL
      WHEN 'subcontractor' THEN rate IS NULL AND quantity IS NULL AND labor_unit IS NULL AND catalog_item_id IS NULL AND unit_of_measure IS NULL AND unit_cost IS NULL AND vendor_id IS NULL
      WHEN 'other'         THEN rate IS NULL AND quantity IS NULL AND labor_unit IS NULL AND catalog_item_id IS NULL AND unit_of_measure IS NULL AND unit_cost IS NULL AND subcontractor_id IS NULL AND vendor_id IS NULL
      ELSE false
    END
  );

CREATE INDEX idx_estimate_line_rows_vendor_id ON public.estimate_line_rows (vendor_id);

COMMIT;
