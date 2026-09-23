-- S110 Section D — the rows INSIDE a line can be reordered, and a row can never
-- leave its line. [RULED Josh, S110 Q16: "FIX IT HERE, in section D."]
--
-- ============================================================================
-- 1. #1-s110 — A ROW CANNOT MOVE TO A DIFFERENT LINE. ⚠️ FUTURE WRITES ONLY.
-- ============================================================================
-- THE HOLE (the sibling of S108 FILL-B5). `estimate_line_rows_update_manager`'s
-- USING is strong — the row's line must be on a DRAFT, and a PM only on their
-- own draft — so the SOURCE is protected. Its WITH CHECK is only
--   company_id = get_my_company_id() AND role IN (owner, admin, project_manager)
-- so the DESTINATION was never checked: by a direct PostgREST UPDATE a PM could
-- point a row's line_item_id at a line on ANOTHER PM's estimate or on a SENT
-- one, and the FK would accept it. Latent while nothing in the app writes
-- line_item_id after insert (UpdateLineRowInput omits it; set_winning_bid and
-- switch_pricing_mode never set it — measured S110). Row reorder is exactly the
-- feature that makes it reachable, as drag-across-categories did for lines.
--
-- WHY A TRIGGER AND NOT A POLICY REWRITE — the FILL-B5 reasoning, unchanged: a
-- trigger cannot be widened by a future permissive policy OR'd in beside the
-- existing one. And the rule is simpler than the line rule: nothing legitimate
-- moves a row between lines, so line_item_id is IMMUTABLE on UPDATE. (INSERT is
-- already checked by estimate_line_rows_insert_manager's WITH CHECK, which does
-- test the destination line's estimate: draft, and a PM's own.)
--
-- Governs FUTURE WRITES only; reads no stored row at apply time; cannot abort.
-- Rows on the table, for the record — rebuild-test: 99 rows over 32 lines.
-- Production (READ-ONLY):  select count(*) from estimate_line_rows;
CREATE OR REPLACE FUNCTION public.enforce_line_row_containment()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.line_item_id IS DISTINCT FROM OLD.line_item_id THEN
    RAISE EXCEPTION 'A row cannot be moved to a different line.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS estimate_line_rows_containment ON public.estimate_line_rows;
CREATE TRIGGER estimate_line_rows_containment
  BEFORE UPDATE OF line_item_id ON public.estimate_line_rows
  FOR EACH ROW EXECUTE FUNCTION public.enforce_line_row_containment();

REVOKE EXECUTE ON FUNCTION public.enforce_line_row_containment() FROM public;
REVOKE EXECUTE ON FUNCTION public.enforce_line_row_containment() FROM anon;
REVOKE EXECUTE ON FUNCTION public.enforce_line_row_containment() FROM authenticated;

-- ============================================================================
-- 2. reorder_estimate_line_rows — reorder the rows of ONE line, in ONE call
-- ============================================================================
-- p_ordered_ids is the line's COMPLETE row list in its new order. The function
-- renumbers sort_order 1..n. It renumbers rather than swapping two values
-- because sort_order is not unique and duplicates exist today (rebuild-test: 1
-- duplicated (line_item_id, sort_order) pair) — a swap of two equal values is a
-- no-op.
--
-- ⚠️ SECURITY INVOKER, ON PURPOSE — the reorder_estimate_lines shape. Authority
-- stays where it is: RLS (estimate_line_rows_update_manager — draft only; a PM
-- only on their own draft) and the containment trigger above. It adds no power
-- and never writes line_item_id.
--
-- ⚠️ IT REFUSES LOUDLY WHERE RLS REFUSES SILENTLY: the id list must be exactly
-- the line's rows (22023 otherwise — a stale or partial list would scramble the
-- order), and every UPDATE must hit exactly one row or the whole call rolls
-- back with 42501 (a sent estimate, or another PM's).
CREATE OR REPLACE FUNCTION public.reorder_estimate_line_rows(p_line_item_id uuid, p_ordered_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  v_current uuid[];
  v_id uuid;
  v_pos integer;
  v_n integer;
BEGIN
  IF p_ordered_ids IS NULL OR cardinality(p_ordered_ids) = 0 THEN
    RAISE EXCEPTION 'p_ordered_ids must list the line''s rows' USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(array_agg(id ORDER BY id), '{}') INTO v_current
    FROM estimate_line_rows WHERE line_item_id = p_line_item_id;

  IF cardinality(p_ordered_ids) <> cardinality(v_current)
     OR (SELECT array_agg(x ORDER BY x) FROM unnest(p_ordered_ids) x) IS DISTINCT FROM v_current THEN
    RAISE EXCEPTION 'Reorder refused: the list does not match this line''s rows (reload and try again).'
      USING ERRCODE = '22023';
  END IF;

  FOR v_pos IN 1 .. cardinality(p_ordered_ids) LOOP
    v_id := p_ordered_ids[v_pos];
    UPDATE estimate_line_rows SET sort_order = v_pos
     WHERE id = v_id AND line_item_id = p_line_item_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'Reorder refused: row % is not editable here (the estimate may have been sent, or it is not yours).', v_id
        USING ERRCODE = '42501';
    END IF;
  END LOOP;

  RETURN cardinality(p_ordered_ids);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.reorder_estimate_line_rows(uuid, uuid[]) FROM public;
REVOKE EXECUTE ON FUNCTION public.reorder_estimate_line_rows(uuid, uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.reorder_estimate_line_rows(uuid, uuid[]) TO authenticated;
