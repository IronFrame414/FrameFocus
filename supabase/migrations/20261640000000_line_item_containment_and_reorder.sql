-- S108 Spec B — a line cannot leave its own estimate, and lines can be
-- reordered (within and across categories) in ONE atomic call.
--
-- ============================================================================
-- 1. THE CONTAINMENT GUARD (ASK Q1 → A) — ⚠️ GOVERNS FUTURE WRITES ONLY
-- ============================================================================
-- ⚠️ THIS TRIGGER VALIDATES THE NEW ROW OF AN INSERT OR AN UPDATE. IT DOES NOT,
-- AND CANNOT, REPAIR OR EVEN INSPECT ROWS ALREADY STORED. A row that was wrong
-- before this migration stays wrong until something rewrites its category — and
-- an unrelated edit to such a row (renaming it, say) is deliberately NOT
-- refused, because on UPDATE the check runs only when estimate_id, category_id
-- or subcategory_id actually CHANGES. [Josh's instruction: say so in the header.]
-- Rows governed at the time of writing: rebuild-test 0 of 35 violate it; the
-- production count is Spec E query B3 and must be read before this ships.
--
-- THE HOLE IT CLOSES (S108 FILL-B5). `estimate_line_items_update_manager`'s
-- USING is strong — draft only, and a PM only on their own draft — so the
-- SOURCE row is protected. Its WITH CHECK is only
--   company_id = get_my_company_id() AND role IN (owner, admin, project_manager)
-- so the DESTINATION was never checked: a PM could point a line at a category,
-- subcategory — or a whole other estimate — anywhere in the company, including
-- another PM's or a SENT estimate, and the FK (a plain category_id →
-- estimate_categories(id)) would accept it. Latent while nothing wrote
-- category_id after creation; drag-across-categories makes it a live path.
--
-- WHY A TRIGGER AND NOT A POLICY REWRITE. It covers INSERT as well as UPDATE,
-- and it cannot be defeated by a future permissive policy being OR'd in beside
-- the existing one — permissive policies widen, a trigger does not.
--
-- The rules:
--   · on UPDATE, estimate_id is IMMUTABLE — a line never moves between estimates
--     (nothing in the app does this; the WITH CHECK above would have allowed it);
--   · category_id must belong to the row's own estimate_id;
--   · subcategory_id, when set, must belong to the same estimate AND to that
--     category (a subcategory is a child of exactly one category).
--
-- SECURITY DEFINER so the lookup reads the true parent rows regardless of the
-- caller's visibility; it reveals nothing — it only compares ids.
CREATE OR REPLACE FUNCTION public.enforce_line_item_containment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.estimate_id IS DISTINCT FROM OLD.estimate_id THEN
      RAISE EXCEPTION 'A line cannot be moved to a different estimate.'
        USING ERRCODE = '23514';
    END IF;
    -- Future writes only: nothing that decides containment changed.
    IF NEW.category_id IS NOT DISTINCT FROM OLD.category_id
       AND NEW.subcategory_id IS NOT DISTINCT FROM OLD.subcategory_id THEN
      RETURN NEW;
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM estimate_categories c
    WHERE c.id = NEW.category_id AND c.estimate_id = NEW.estimate_id
  ) THEN
    RAISE EXCEPTION 'That category belongs to a different estimate.'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.subcategory_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM estimate_subcategories s
    WHERE s.id = NEW.subcategory_id
      AND s.estimate_id = NEW.estimate_id
      AND s.category_id = NEW.category_id
  ) THEN
    RAISE EXCEPTION 'That subcategory is not part of this line''s category.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS estimate_line_items_containment ON public.estimate_line_items;
CREATE TRIGGER estimate_line_items_containment
  BEFORE INSERT OR UPDATE OF estimate_id, category_id, subcategory_id
  ON public.estimate_line_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_line_item_containment();


-- ============================================================================
-- 2. reorder_estimate_lines — drag-reorder in ONE transaction
-- ============================================================================
-- A drag writes sort_order for every line in the affected list(s), plus the
-- moved line's category_id/subcategory_id. Issued as N separate UPDATEs, a
-- failure part-way leaves a half-applied order. Duplicated sort_order is legal
-- (no unique index), so that would only ever be a WRONG ORDER, never a lost row
-- — but one call is still the honest shape.
--
-- ⚠️ SECURITY INVOKER, ON PURPOSE. The authority stays exactly where it already
-- is: RLS (`estimate_line_items_update_manager` — draft only; a PM only on their
-- own draft) and the containment trigger above. This function adds no power.
--
-- ⚠️ IT REFUSES LOUDLY WHERE RLS REFUSES SILENTLY. An UPDATE that USING filters
-- out affects zero rows and raises nothing, so a reorder of a SENT estimate
-- would otherwise "succeed" having changed nothing. Every move must hit exactly
-- one row or the whole call rolls back with 42501.
--
-- p_moves: [{ "id": uuid, "category_id": uuid, "subcategory_id": uuid|null,
--             "sort_order": int }, ...]
CREATE OR REPLACE FUNCTION public.reorder_estimate_lines(p_estimate_id uuid, p_moves jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  v_move jsonb;
  v_n integer;
  v_total integer := 0;
BEGIN
  IF p_moves IS NULL OR jsonb_typeof(p_moves) <> 'array' THEN
    RAISE EXCEPTION 'p_moves must be a JSON array' USING ERRCODE = '22023';
  END IF;

  FOR v_move IN SELECT * FROM jsonb_array_elements(p_moves) LOOP
    UPDATE estimate_line_items
       SET category_id    = (v_move->>'category_id')::uuid,
           subcategory_id = NULLIF(v_move->>'subcategory_id', '')::uuid,
           sort_order     = (v_move->>'sort_order')::integer
     WHERE id = (v_move->>'id')::uuid
       AND estimate_id = p_estimate_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'Reorder refused: line % is not editable here (the estimate may have been sent, or it is not yours).',
        v_move->>'id'
        USING ERRCODE = '42501';
    END IF;
    v_total := v_total + 1;
  END LOOP;

  RETURN v_total;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.reorder_estimate_lines(uuid, jsonb) FROM public;
REVOKE EXECUTE ON FUNCTION public.reorder_estimate_lines(uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.reorder_estimate_lines(uuid, jsonb) TO authenticated;
