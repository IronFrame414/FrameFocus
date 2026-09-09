-- S106 Part B [RULED Josh] — a line item that HAS ROWS cannot carry a manual
-- total (`total_price_override`). Supersedes the grandfather+flag design: Josh ran
-- the query and ZERO rowed lines carry an override on BOTH rebuild-test and
-- production, so there is nothing to exempt — the rule goes in unconditionally.
--
-- A CHECK cannot subquery `estimate_line_rows`, so this is two SECURITY DEFINER
-- triggers, one per direction. `set_winning_bid` is amended so that awarding a bid
-- (which itemizes the line) CLEARS the flat total instead of being blocked by the
-- rows trigger; the UI prompts before the award, so the clear is never silent.

-- 1) SELF-GUARD (the "VALID, never NOT VALID" spirit): abort if any existing row
--    would violate the invariant, rather than install it over inconsistent data.
DO $$
DECLARE
  v_violators integer;
BEGIN
  SELECT count(*) INTO v_violators
  FROM estimate_line_items li
  WHERE li.total_price_override IS NOT NULL
    AND EXISTS (SELECT 1 FROM estimate_line_rows r WHERE r.line_item_id = li.id);
  IF v_violators > 0 THEN
    RAISE EXCEPTION 'Cannot install the total_price_override invariant: % line item(s) already carry an override AND have rows. Reconcile those before applying.', v_violators;
  END IF;
END $$;

-- 2) DIRECTION A — refuse setting an override on a line that has rows.
CREATE OR REPLACE FUNCTION public.enforce_no_override_with_rows()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.total_price_override IS NOT NULL
     AND EXISTS (SELECT 1 FROM estimate_line_rows WHERE line_item_id = NEW.id) THEN
    RAISE EXCEPTION 'A line with itemized rows cannot carry a manual total — edit the row totals, or remove the rows first.';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS estimate_line_items_no_override_with_rows ON public.estimate_line_items;
CREATE TRIGGER estimate_line_items_no_override_with_rows
  BEFORE INSERT OR UPDATE ON public.estimate_line_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_no_override_with_rows();

-- 3) DIRECTION B — refuse adding/reparenting a row onto a line that carries an
--    override. `set_winning_bid` clears the override before its row insert, so it
--    is unaffected.
CREATE OR REPLACE FUNCTION public.enforce_no_rows_on_override_line()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1 FROM estimate_line_items
    WHERE id = NEW.line_item_id AND total_price_override IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Clear this line''s manual total before adding itemized rows.';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS estimate_line_rows_no_rows_on_override ON public.estimate_line_rows;
CREATE TRIGGER estimate_line_rows_no_rows_on_override
  BEFORE INSERT OR UPDATE OF line_item_id ON public.estimate_line_rows
  FOR EACH ROW EXECUTE FUNCTION public.enforce_no_rows_on_override_line();

-- 4) set_winning_bid — verbatim (from pg_get_functiondef) + ONE change: in the
--    insert-row branch, clear total_price_override AND override_cost together,
--    BEFORE the row insert, so the direction-B trigger sees a cleared parent.
CREATE OR REPLACE FUNCTION public.set_winning_bid(p_line_item_id uuid, p_sub_bid_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  IF v_role = 'project_manager' AND v_estimate.created_by <> auth.uid() THEN
    RAISE EXCEPTION 'PMs can only modify their own estimates';
  END IF;

  UPDATE estimate_sub_bids
  SET is_winner = false
  WHERE line_item_id = p_line_item_id AND is_winner = true;

  UPDATE estimate_sub_bids SET is_winner = true WHERE id = p_sub_bid_id;

  SELECT count(*) INTO v_sub_row_count
  FROM estimate_line_rows
  WHERE line_item_id = p_line_item_id AND row_type = 'subcontractor';

  IF v_sub_row_count >= 2 THEN
    RAISE EXCEPTION 'Line has % subcontractor rows; winning-bid auto-management requires 0 or 1', v_sub_row_count;
  ELSIF v_sub_row_count = 1 THEN
    UPDATE estimate_line_rows
    SET subcontractor_id = v_bid.subcontractor_id,
        amount = CASE WHEN COALESCE(amount, 0) = 0 THEN v_bid.bid_amount ELSE amount END,
        total  = CASE WHEN COALESCE(amount, 0) = 0 THEN v_bid.bid_amount ELSE total  END
    WHERE line_item_id = p_line_item_id AND row_type = 'subcontractor';

    SELECT id INTO v_sub_row_id
    FROM estimate_line_rows
    WHERE line_item_id = p_line_item_id AND row_type = 'subcontractor';
  ELSE
    -- S106: awarding a bid ITEMIZES the line. If it carried a flat manual total,
    -- clear it (BOTH columns, one statement) BEFORE inserting the row, so the
    -- estimate_line_rows invariant trigger sees a cleared parent and a cost never
    -- outlives its rows. The UI prompts (fill-only-when-empty / #113 class) before
    -- calling this, so the clear is never silent.
    UPDATE estimate_line_items
       SET total_price_override = NULL, override_cost = NULL
     WHERE id = p_line_item_id;

    SELECT COALESCE(max(sort_order) + 1, 0) INTO v_next_sort
    FROM estimate_line_rows WHERE line_item_id = p_line_item_id;

    INSERT INTO estimate_line_rows (
      company_id, line_item_id, row_type, name, sort_order,
      markup_percent, apply_tax, total, amount, subcontractor_id
    ) VALUES (
      v_company_id, p_line_item_id, 'subcontractor', 'Subcontractor bid', v_next_sort,
      NULL, false, v_bid.bid_amount, v_bid.bid_amount, v_bid.subcontractor_id
    )
    RETURNING id INTO v_sub_row_id;
  END IF;

  INSERT INTO estimate_award_bases (
    company_id, line_row_id, sub_bid_id, labor_amount, material_amount, scope_coverage_percent, awarded_at
  ) VALUES (
    v_company_id, v_sub_row_id, p_sub_bid_id,
    v_bid.labor_amount, v_bid.material_amount, v_bid.scope_coverage_percent, now()
  )
  ON CONFLICT (line_row_id) DO UPDATE SET
    sub_bid_id             = EXCLUDED.sub_bid_id,
    labor_amount           = EXCLUDED.labor_amount,
    material_amount        = EXCLUDED.material_amount,
    scope_coverage_percent = EXCLUDED.scope_coverage_percent,
    awarded_at             = EXCLUDED.awarded_at;
END;
$function$;
