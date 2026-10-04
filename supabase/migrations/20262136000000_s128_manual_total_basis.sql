-- S128 1a — Part B of docs/specs/estimates-and-change-orders-spec.md: the manually set total.
--
-- [Josh, 2026-10-03] "the number manually entered always wins on estimates and change orders."
-- [Josh, 2026-10-03] "leave manual total when the cost changes but change the text to red"
--
-- Two changes, both about a typed total (estimate_line_rows.total_override, S106):
--
-- 1. total_override_basis — the row's pricing base (cost + tax, the same figure the editor's
--    rowBase() back-solves against) AT THE MOMENT the total was typed. The editor turns the
--    typed total RED when the current base no longer equals it: the mark that this total is no
--    longer cost x markup. It is a record, not a price: nothing computes money from it, and
--    computeRowPricing still returns total_override verbatim.
--    NULL on every existing row (no constraint added, nothing backfilled): a total typed before
--    S128 has no recorded basis, so it is never shown red until it is retyped. Stated gap.
--
-- 2. clone_estimate_line now copies total_override and total_override_basis. Before this, a
--    clone or a REISSUE (reissueEstimate -> clone_estimate -> clone_estimate_line) copied the
--    row's stored `total` but not the override, so its next recalculation silently replaced the
--    typed total with default-markup x cost. Every other line of the function is byte-identical
--    to the captured original (docs/sessions/S128-sabotage-originals/clone_estimate_line,
--    md5 c93289708a15f1de5223db5da9b5acb5 on production and rebuild-test). CREATE OR REPLACE
--    keeps the ACL (no authenticated/anon EXECUTE; only clone_estimate calls it).

ALTER TABLE public.estimate_line_rows
  ADD COLUMN total_override_basis numeric;

COMMENT ON COLUMN public.estimate_line_rows.total_override_basis IS
  'S128: the row''s pricing base (cost + tax) when total_override was typed. Display-only '
  'marker: when the current base differs, the editor shows the typed total in red. NULL when '
  'total_override is NULL, and on totals typed before S128. Never used to compute money.';

CREATE OR REPLACE FUNCTION public.clone_estimate_line(p_line estimate_line_items, p_new_estimate_id uuid, p_new_category_id uuid, p_new_subcategory_id uuid, p_company_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    amount, subcontractor_id,
    total_override, total_override_basis
  )
  SELECT
    p_company_id, v_new_line_id, r.row_type, r.name, r.sort_order,
    r.markup_percent, r.apply_tax, r.total,
    r.rate, r.quantity, r.labor_unit,
    r.catalog_item_id, r.unit_of_measure, r.unit_cost,
    r.amount, r.subcontractor_id,
    r.total_override, r.total_override_basis
  FROM estimate_line_rows r
  WHERE r.line_item_id = p_line.id;

  RETURN v_new_line_id;
END;
$function$;
