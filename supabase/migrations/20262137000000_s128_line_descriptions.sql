-- S128 2+3 — Part A of docs/specs/estimates-and-change-orders-spec.md: a description on every LINE.
--
-- Vocabulary (S128 phase 1): Josh's "line" is a ROW — estimate_line_rows / change_order_line_rows.
-- His "section" is estimate_line_items / change_order_line_items, which ALREADY carry a
-- `description` (the "Description (shown on proposal)"). A-3: the section description does not
-- change, and this migration does not touch it.
--
-- A-0 (verified S128): neither line table had any description column; no later migration added
-- one; nothing wrote or read one. So this is a new column, not a rendering gap.
--
-- A-1: every line, whatever its source; never required; NULL renders nothing.
-- A-4 (decided, S128): a 2,000-character cap, in the database as well as the form. The CHECK is
--   on a column this statement creates, so it is NULL on every existing row and cannot fail
--   over existing production rows (stop rule 3 does not apply: no existing value is judged).
-- A-2: which client sees it is decided by the READ PATH (client-proposal.ts), not here.
--
-- clone_estimate_line copies the new column, or a clone or reissue would drop every line
-- description. Every other line is byte-identical to the S128 1a version
-- (docs/sessions/S128-sabotage-originals/clone_estimate_line/s128-1a.sql, md5 c63ff7e3…).
-- The change-order reissue copies rows in app code (api/change-orders/[id]/reissue) and is
-- updated there.

ALTER TABLE public.estimate_line_rows
  ADD COLUMN description text
  CONSTRAINT estimate_line_rows_description_length
  CHECK (description IS NULL OR char_length(description) <= 2000);

COMMENT ON COLUMN public.estimate_line_rows.description IS
  'S128 Part A: the LINE''s description (not the section''s). Optional, at most 2,000 characters. '
  'Reaches a client only on the summary/itemized-with-descriptions, cost-plus and T&M proposal '
  'formats, decided in the client read path.';

ALTER TABLE public.change_order_line_rows
  ADD COLUMN description text
  CONSTRAINT change_order_line_rows_description_length
  CHECK (description IS NULL OR char_length(description) <= 2000);

COMMENT ON COLUMN public.change_order_line_rows.description IS
  'S128 Part A: the CO LINE''s description. Optional, at most 2,000 characters. A change order has '
  'no proposal format, so (S128 ASK-A2) it is staff-only: no client read path selects it.';

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
    total_override, total_override_basis,
    description
  )
  SELECT
    p_company_id, v_new_line_id, r.row_type, r.name, r.sort_order,
    r.markup_percent, r.apply_tax, r.total,
    r.rate, r.quantity, r.labor_unit,
    r.catalog_item_id, r.unit_of_measure, r.unit_cost,
    r.amount, r.subcontractor_id,
    r.total_override, r.total_override_basis,
    r.description
  FROM estimate_line_rows r
  WHERE r.line_item_id = p_line.id;

  RETURN v_new_line_id;
END;
$function$;
