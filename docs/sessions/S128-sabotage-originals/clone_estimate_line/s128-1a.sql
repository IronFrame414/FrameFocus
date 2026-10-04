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
$function$
;
