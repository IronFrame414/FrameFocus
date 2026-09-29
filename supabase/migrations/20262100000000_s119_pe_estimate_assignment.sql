-- ============================================================================
-- S119 ITEM D — a Project Executive sees an estimate ONLY when it is assigned to it.
-- [Josh, 2026-09-29, D-1 and D-2]
-- ============================================================================
--
-- D-2 (RULED): "I want to be able to assign an estimate to a PE and that is the
-- only one that PE can view." Both paths: "PE can create. I also want to be able
-- to add access to a PE for an estimate I started." This REPLACES the
-- author-floor model — nothing here reads `estimates.created_by` for a PE.
--
-- D-1 (RULED): "Leave PM as it was before all of this started. Nothing we are
-- doing should touch PM." So every PM policy is left BYTE-IDENTICAL: the PE gets
-- its OWN permissive policies beside them (permissive policies OR together, so
-- a PE arm cannot narrow or widen a PM arm). The three builder functions keep
-- their PM lines; each gains one role in its list and one PE block.
--
-- WHAT THE PE MAY DO ON AN ASSIGNED ESTIMATE — exactly what a PM may on its own:
-- read it and everything under it; while it is a draft, edit the estimate row
-- and insert/update/delete its categories, subcategories, lines, line rows and
-- files, insert/update sub bids; set a line cost, switch the
-- pricing mode, set a winning bid. WHAT IT MAY NOT (narrower, each a choice):
--   * send — the proposal routes are Owner/Admin (unchanged); its UPDATE arm
--     pins status = 'draft' before AND after, so it cannot mark sent, submit for
--     review, void or delete by a direct call either;
--   * convert (D-1: creating a project is company-level), void, mark lost or
--     clone — those four functions are NOT touched and still refuse a PE;
--   * write the company catalog or scope library (company-level lists).
--   * reach outside parties from an estimate: no sub BID REQUESTS (no PE arm on
--     estimate_sub_bid_requests; the send route refuses a PE) and no sharing of
--     files with bidders (the share route refuses a PE). It still records the
--     bids that come back (estimate_sub_bids) and picks the winner.
--
-- TWO READ PATHS NOW EXIST FOR A PE, and they are meant to:
--   1. estimates_select_pe_assigned (below) — an estimate assigned to it;
--   2. estimates_select_project_executive (20261830000000, UNCHANGED) — an
--      estimate on a project it is assigned to (i.e. converted), read-only.
-- Path 2 is live and not narrowed here. Only path 1 writes.
--
-- ONE PE PER ESTIMATE (narrower; the alternative is several): a partial unique
-- index. Owner/Admin re-point or remove the assignment; a PE never assigns.
--
-- CREATING ASSIGNS THE CREATOR: a BEFORE INSERT trigger on `estimates` writes
-- the assignment for a PE caller, so the app's `insert(...).select()` can read
-- the new row back in the same statement. The FK to `estimates` is DEFERRED
-- (checked at commit) because the estimate row does not exist yet at that
-- point, and `pe_assigned_estimate` is VOLATILE so the policy check on the
-- returned row sees the assignment the trigger just wrote.
-- ============================================================================

-- ── 1. The assignment table ─────────────────────────────────────────────────
CREATE TABLE public.estimate_assignments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL DEFAULT public.get_my_company_id() REFERENCES public.companies(id),
  estimate_id  uuid NOT NULL REFERENCES public.estimates(id) DEFERRABLE INITIALLY DEFERRED,
  member_id    uuid NOT NULL REFERENCES public.company_members(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by   uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  is_deleted   boolean NOT NULL DEFAULT false,
  deleted_at   timestamptz
);
CREATE INDEX idx_estimate_assignments_company_id ON public.estimate_assignments (company_id);
CREATE INDEX idx_estimate_assignments_member_id ON public.estimate_assignments (member_id) WHERE is_deleted = false;
CREATE UNIQUE INDEX idx_estimate_assignments_estimate_id_live
  ON public.estimate_assignments (estimate_id) WHERE is_deleted = false;
ALTER TABLE public.estimate_assignments ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER estimate_assignments_updated_at BEFORE UPDATE ON public.estimate_assignments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE OR REPLACE FUNCTION public.set_estimate_assignments_updated_by()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_by = auth.uid(); RETURN NEW; END; $$ LANGUAGE plpgsql SECURITY DEFINER;
CREATE TRIGGER estimate_assignments_set_updated_by BEFORE UPDATE ON public.estimate_assignments
  FOR EACH ROW EXECUTE FUNCTION public.set_estimate_assignments_updated_by();

-- The shape every assignment must have, whoever writes it: a LIVE member of the
-- same company whose login is a Project Executive, on an estimate of that
-- company; the estimate and company never move once written.
CREATE OR REPLACE FUNCTION public.enforce_estimate_assignment_shape()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_estimate_company uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.estimate_id IS DISTINCT FROM OLD.estimate_id
                           OR NEW.company_id IS DISTINCT FROM OLD.company_id) THEN
    RAISE EXCEPTION 'An estimate assignment cannot move to another estimate or company.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.is_deleted THEN
    RETURN NEW;  -- removing an assignment needs no member check
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM company_members m
      JOIN profiles p ON p.id = m.profile_id
     WHERE m.id = NEW.member_id
       AND m.company_id = NEW.company_id
       AND m.is_deleted = false
       AND p.is_deleted = false
       AND p.role = 'project_executive'
  ) THEN
    RAISE EXCEPTION 'An estimate can only be assigned to a Project Executive of this company.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT e.company_id INTO v_estimate_company FROM estimates e WHERE e.id = NEW.estimate_id;
  IF FOUND THEN
    IF v_estimate_company IS DISTINCT FROM NEW.company_id THEN
      RAISE EXCEPTION 'Estimate not found.' USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    -- The estimate is not visible yet: only the creation trigger below writes
    -- that, for the calling PE itself. The deferred FK proves it exists at commit.
    IF NOT (get_my_role() = 'project_executive' AND NEW.member_id = get_my_member_id()) THEN
      RAISE EXCEPTION 'Estimate not found.' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.enforce_estimate_assignment_shape() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER estimate_assignments_shape BEFORE INSERT OR UPDATE ON public.estimate_assignments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_estimate_assignment_shape();

-- READ: Owner/Admin (the assigners) — and a PE its OWN live rows, nothing else.
CREATE POLICY estimate_assignments_select_owner_admin ON public.estimate_assignments
  FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id()
         AND public.get_my_role() = ANY (ARRAY['owner', 'admin']));
CREATE POLICY estimate_assignments_select_project_executive ON public.estimate_assignments
  FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id()
         AND public.get_my_role() = 'project_executive'
         AND member_id = public.get_my_member_id()
         AND is_deleted = false);
-- WRITE: Owner/Admin only. No DELETE policy: an assignment is removed by soft delete.
CREATE POLICY estimate_assignments_insert_owner_admin ON public.estimate_assignments
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_my_company_id()
              AND public.get_my_role() = ANY (ARRAY['owner', 'admin']));
CREATE POLICY estimate_assignments_update_owner_admin ON public.estimate_assignments
  FOR UPDATE TO authenticated
  USING (company_id = public.get_my_company_id()
         AND public.get_my_role() = ANY (ARRAY['owner', 'admin']))
  WITH CHECK (company_id = public.get_my_company_id()
              AND public.get_my_role() = ANY (ARRAY['owner', 'admin']));

-- ── 2. The helper every PE arm uses ─────────────────────────────────────────
-- VOLATILE on purpose (see the header): a fresh snapshot per call, so the
-- policy check on a just-inserted estimate sees the creation trigger's row.
CREATE OR REPLACE FUNCTION public.pe_assigned_estimate(p_estimate_id uuid)
RETURNS boolean
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT get_my_role() = 'project_executive'
     AND EXISTS (SELECT 1 FROM estimate_assignments a
                  WHERE a.estimate_id = p_estimate_id
                    AND a.member_id = get_my_member_id()
                    AND a.company_id = get_my_company_id()
                    AND a.is_deleted = false);
$function$;
REVOKE ALL ON FUNCTION public.pe_assigned_estimate(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pe_assigned_estimate(uuid) TO authenticated;

-- ── 3. Creating assigns the creator ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.assign_creating_pe_to_estimate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL AND get_my_role() = 'project_executive' THEN
    INSERT INTO estimate_assignments (company_id, estimate_id, member_id, created_by, updated_by)
    VALUES (NEW.company_id, NEW.id, get_my_member_id(), auth.uid(), auth.uid());
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.assign_creating_pe_to_estimate() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER estimates_assign_creating_pe BEFORE INSERT ON public.estimates
  FOR EACH ROW EXECUTE FUNCTION public.assign_creating_pe_to_estimate();

-- ── 4. The PE's arms on `estimates` (the PM arms are untouched) ────────────
CREATE POLICY estimates_select_pe_assigned ON public.estimates
  FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id() AND public.pe_assigned_estimate(id));

CREATE POLICY estimates_insert_project_executive ON public.estimates
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_my_company_id()
              AND public.get_my_role() = 'project_executive'
              AND status = 'draft'
              AND project_id IS NULL
              AND COALESCE(is_deleted, false) = false);

CREATE POLICY estimates_update_project_executive ON public.estimates
  FOR UPDATE TO authenticated
  USING (company_id = public.get_my_company_id()
         AND status = 'draft'
         AND public.pe_assigned_estimate(id))
  WITH CHECK (company_id = public.get_my_company_id()
              AND status = 'draft'
              AND project_id IS NULL
              AND COALESCE(is_deleted, false) = false
              AND public.pe_assigned_estimate(id));

-- ── 5. The PE's arms on the seven child tables (mirroring the PM set) ──────
CREATE POLICY estimate_categories_insert_project_executive ON public.estimate_categories
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_my_company_id()
    AND public.get_my_role() = 'project_executive'
    AND EXISTS (SELECT 1 FROM public.estimates e
                 WHERE e.id = estimate_categories.estimate_id
                   AND e.status = 'draft'
                   AND public.pe_assigned_estimate(e.id)));

CREATE POLICY estimate_categories_update_project_executive ON public.estimate_categories
  FOR UPDATE TO authenticated
  USING (company_id = public.get_my_company_id()
    AND public.get_my_role() = 'project_executive'
    AND EXISTS (SELECT 1 FROM public.estimates e
                 WHERE e.id = estimate_categories.estimate_id
                   AND e.status = 'draft'
                   AND public.pe_assigned_estimate(e.id)))
  WITH CHECK (company_id = public.get_my_company_id()
    AND public.get_my_role() = 'project_executive'
    AND EXISTS (SELECT 1 FROM public.estimates e
                 WHERE e.id = estimate_categories.estimate_id
                   AND e.status = 'draft'
                   AND public.pe_assigned_estimate(e.id)));

CREATE POLICY estimate_categories_delete_project_executive ON public.estimate_categories
  FOR DELETE TO authenticated
  USING (company_id = public.get_my_company_id()
    AND public.get_my_role() = 'project_executive'
    AND EXISTS (SELECT 1 FROM public.estimates e
                 WHERE e.id = estimate_categories.estimate_id
                   AND e.status = 'draft'
                   AND public.pe_assigned_estimate(e.id)));

CREATE POLICY estimate_subcategories_insert_project_executive ON public.estimate_subcategories
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_my_company_id()
    AND public.get_my_role() = 'project_executive'
    AND EXISTS (SELECT 1 FROM public.estimates e
                 WHERE e.id = estimate_subcategories.estimate_id
                   AND e.status = 'draft'
                   AND public.pe_assigned_estimate(e.id)));

CREATE POLICY estimate_subcategories_update_project_executive ON public.estimate_subcategories
  FOR UPDATE TO authenticated
  USING (company_id = public.get_my_company_id()
    AND public.get_my_role() = 'project_executive'
    AND EXISTS (SELECT 1 FROM public.estimates e
                 WHERE e.id = estimate_subcategories.estimate_id
                   AND e.status = 'draft'
                   AND public.pe_assigned_estimate(e.id)))
  WITH CHECK (company_id = public.get_my_company_id()
    AND public.get_my_role() = 'project_executive'
    AND EXISTS (SELECT 1 FROM public.estimates e
                 WHERE e.id = estimate_subcategories.estimate_id
                   AND e.status = 'draft'
                   AND public.pe_assigned_estimate(e.id)));

CREATE POLICY estimate_subcategories_delete_project_executive ON public.estimate_subcategories
  FOR DELETE TO authenticated
  USING (company_id = public.get_my_company_id()
    AND public.get_my_role() = 'project_executive'
    AND EXISTS (SELECT 1 FROM public.estimates e
                 WHERE e.id = estimate_subcategories.estimate_id
                   AND e.status = 'draft'
                   AND public.pe_assigned_estimate(e.id)));

CREATE POLICY estimate_line_items_insert_project_executive ON public.estimate_line_items
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_my_company_id()
    AND public.get_my_role() = 'project_executive'
    AND EXISTS (SELECT 1 FROM public.estimates e
                 WHERE e.id = estimate_line_items.estimate_id
                   AND e.status = 'draft'
                   AND public.pe_assigned_estimate(e.id)));

CREATE POLICY estimate_line_items_update_project_executive ON public.estimate_line_items
  FOR UPDATE TO authenticated
  USING (company_id = public.get_my_company_id()
    AND public.get_my_role() = 'project_executive'
    AND EXISTS (SELECT 1 FROM public.estimates e
                 WHERE e.id = estimate_line_items.estimate_id
                   AND e.status = 'draft'
                   AND public.pe_assigned_estimate(e.id)))
  WITH CHECK (company_id = public.get_my_company_id()
    AND public.get_my_role() = 'project_executive'
    AND EXISTS (SELECT 1 FROM public.estimates e
                 WHERE e.id = estimate_line_items.estimate_id
                   AND e.status = 'draft'
                   AND public.pe_assigned_estimate(e.id)));

CREATE POLICY estimate_line_items_delete_project_executive ON public.estimate_line_items
  FOR DELETE TO authenticated
  USING (company_id = public.get_my_company_id()
    AND public.get_my_role() = 'project_executive'
    AND EXISTS (SELECT 1 FROM public.estimates e
                 WHERE e.id = estimate_line_items.estimate_id
                   AND e.status = 'draft'
                   AND public.pe_assigned_estimate(e.id)));

CREATE POLICY estimate_files_insert_project_executive ON public.estimate_files
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_my_company_id()
    AND public.get_my_role() = 'project_executive'
    AND EXISTS (SELECT 1 FROM public.estimates e
                 WHERE e.id = estimate_files.estimate_id
                   AND e.status = 'draft'
                   AND public.pe_assigned_estimate(e.id)));

CREATE POLICY estimate_files_update_project_executive ON public.estimate_files
  FOR UPDATE TO authenticated
  USING (company_id = public.get_my_company_id()
    AND public.get_my_role() = 'project_executive'
    AND EXISTS (SELECT 1 FROM public.estimates e
                 WHERE e.id = estimate_files.estimate_id
                   AND e.status = 'draft'
                   AND public.pe_assigned_estimate(e.id)))
  WITH CHECK (company_id = public.get_my_company_id()
    AND public.get_my_role() = 'project_executive'
    AND EXISTS (SELECT 1 FROM public.estimates e
                 WHERE e.id = estimate_files.estimate_id
                   AND e.status = 'draft'
                   AND public.pe_assigned_estimate(e.id)));

CREATE POLICY estimate_files_delete_project_executive ON public.estimate_files
  FOR DELETE TO authenticated
  USING (company_id = public.get_my_company_id()
    AND public.get_my_role() = 'project_executive'
    AND EXISTS (SELECT 1 FROM public.estimates e
                 WHERE e.id = estimate_files.estimate_id
                   AND e.status = 'draft'
                   AND public.pe_assigned_estimate(e.id)));

CREATE POLICY estimate_line_rows_insert_project_executive ON public.estimate_line_rows
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_my_company_id()
    AND public.get_my_role() = 'project_executive'
    AND EXISTS (SELECT 1 FROM public.estimate_line_items li
                  JOIN public.estimates e ON e.id = li.estimate_id
                 WHERE li.id = estimate_line_rows.line_item_id
                   AND e.status = 'draft'
                   AND public.pe_assigned_estimate(e.id)));

CREATE POLICY estimate_line_rows_update_project_executive ON public.estimate_line_rows
  FOR UPDATE TO authenticated
  USING (company_id = public.get_my_company_id()
    AND public.get_my_role() = 'project_executive'
    AND EXISTS (SELECT 1 FROM public.estimate_line_items li
                  JOIN public.estimates e ON e.id = li.estimate_id
                 WHERE li.id = estimate_line_rows.line_item_id
                   AND e.status = 'draft'
                   AND public.pe_assigned_estimate(e.id)))
  WITH CHECK (company_id = public.get_my_company_id()
    AND public.get_my_role() = 'project_executive'
    AND EXISTS (SELECT 1 FROM public.estimate_line_items li
                  JOIN public.estimates e ON e.id = li.estimate_id
                 WHERE li.id = estimate_line_rows.line_item_id
                   AND e.status = 'draft'
                   AND public.pe_assigned_estimate(e.id)));

CREATE POLICY estimate_line_rows_delete_project_executive ON public.estimate_line_rows
  FOR DELETE TO authenticated
  USING (company_id = public.get_my_company_id()
    AND public.get_my_role() = 'project_executive'
    AND EXISTS (SELECT 1 FROM public.estimate_line_items li
                  JOIN public.estimates e ON e.id = li.estimate_id
                 WHERE li.id = estimate_line_rows.line_item_id
                   AND e.status = 'draft'
                   AND public.pe_assigned_estimate(e.id)));

CREATE POLICY estimate_sub_bids_insert_project_executive ON public.estimate_sub_bids
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_my_company_id()
    AND public.get_my_role() = 'project_executive'
    AND EXISTS (SELECT 1 FROM public.estimates e
                 WHERE e.id = estimate_sub_bids.estimate_id
                   AND e.status = 'draft'
                   AND public.pe_assigned_estimate(e.id)));

CREATE POLICY estimate_sub_bids_update_project_executive ON public.estimate_sub_bids
  FOR UPDATE TO authenticated
  USING (company_id = public.get_my_company_id()
    AND public.get_my_role() = 'project_executive'
    AND EXISTS (SELECT 1 FROM public.estimates e
                 WHERE e.id = estimate_sub_bids.estimate_id
                   AND e.status = 'draft'
                   AND public.pe_assigned_estimate(e.id)))
  WITH CHECK (company_id = public.get_my_company_id()
    AND public.get_my_role() = 'project_executive'
    AND EXISTS (SELECT 1 FROM public.estimates e
                 WHERE e.id = estimate_sub_bids.estimate_id
                   AND e.status = 'draft'
                   AND public.pe_assigned_estimate(e.id)));

-- ── 6. The three builder functions: PM lines unchanged; + project_executive, + one PE block ─
-- (live bodies from pg_get_functiondef; production == rebuild-test by md5, measured S119)
CREATE OR REPLACE FUNCTION public.set_line_override_cost(p_line_id uuid, p_cost numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_line RECORD;
  v_estimate RECORD;
BEGIN
  IF public.get_my_role() IS NULL
     OR public.get_my_role() NOT IN ('owner', 'admin', 'project_manager', 'project_executive') THEN
    RAISE EXCEPTION 'Only Owner/Admin/PM may set a line cost.';
  END IF;
  IF p_cost IS NULL OR p_cost < 0 THEN
    RAISE EXCEPTION 'set_line_override_cost: cost must be zero or more';
  END IF;

  SELECT * INTO v_line
  FROM estimate_line_items
  WHERE id = p_line_id AND company_id = public.get_my_company_id()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'set_line_override_cost: line not found';
  END IF;
  IF v_line.total_price_override IS NULL THEN
    RAISE EXCEPTION 'set_line_override_cost: not a flat-priced line';
  END IF;

  SELECT * INTO v_estimate
  FROM estimates
  WHERE id = v_line.estimate_id AND is_deleted = false;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'set_line_override_cost: estimate not found';
  END IF;

  -- PM arm of the estimates SELECT policy (see header): a PM may only touch
  -- estimates they created. Same message as the not-found branch — to a PM,
  -- an invisible estimate and a nonexistent one must be indistinguishable.
  IF public.get_my_role() = 'project_manager'
     AND v_estimate.created_by IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'set_line_override_cost: estimate not found';
  END IF;

  -- [S119 D-2] A Project Executive works only on an estimate ASSIGNED to it
  -- (estimate_assignments). The PM rule above is unchanged.
  IF public.get_my_role() = 'project_executive'
     AND NOT public.pe_assigned_estimate(v_estimate.id) THEN
    RAISE EXCEPTION 'set_line_override_cost: estimate not found';
  END IF;

  IF v_estimate.status = 'converted' OR v_estimate.project_id IS NOT NULL THEN
    RAISE EXCEPTION 'set_line_override_cost: this estimate is already converted';
  END IF;

  UPDATE estimate_line_items SET override_cost = p_cost WHERE id = p_line_id;
END;
$function$;

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
  IF v_role IS NULL OR v_role NOT IN ('owner', 'admin', 'project_manager', 'project_executive') THEN
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

  -- [S119 D-2] A Project Executive works only on an estimate ASSIGNED to it
  -- (estimate_assignments). The PM rule above is unchanged.
  IF v_role = 'project_executive'
     AND NOT public.pe_assigned_estimate(v_estimate.id) THEN
    RAISE EXCEPTION 'Estimate not found';
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

CREATE OR REPLACE FUNCTION public.switch_pricing_mode(p_estimate_id uuid, p_new_mode text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id UUID := get_my_company_id();
  v_role TEXT := get_my_role();
  v_estimate estimates%ROWTYPE;
  v_company companies%ROWTYPE;
  v_active_sub NUMERIC;
  v_active_mat NUMERIC;
  v_active_lab NUMERIC;
  v_new_sub NUMERIC;
  v_new_mat NUMERIC;
  v_new_lab NUMERIC;
BEGIN
  IF p_new_mode NOT IN ('markup', 'margin') THEN
    RAISE EXCEPTION 'Invalid pricing mode: %', p_new_mode;
  END IF;

  IF v_role IS NULL OR v_role NOT IN ('owner', 'admin', 'project_manager', 'project_executive') THEN
    RAISE EXCEPTION 'Only Owner, Admin, or PM can change pricing mode';
  END IF;

  SELECT * INTO v_estimate FROM estimates WHERE id = p_estimate_id;
  IF NOT FOUND OR v_estimate.company_id <> v_company_id THEN
    RAISE EXCEPTION 'Estimate not found';
  END IF;

  IF v_role = 'project_manager' AND v_estimate.created_by <> auth.uid() THEN
    RAISE EXCEPTION 'PMs can only modify their own estimates';
  END IF;

  -- [S119 D-2] A Project Executive works only on an estimate ASSIGNED to it
  -- (estimate_assignments). The PM rule above is unchanged.
  IF v_role = 'project_executive'
     AND NOT public.pe_assigned_estimate(v_estimate.id) THEN
    RAISE EXCEPTION 'Estimate not found';
  END IF;

  IF v_estimate.status <> 'draft' THEN
    RAISE EXCEPTION 'Estimate is not editable (status: %)', v_estimate.status;
  END IF;

  IF v_estimate.pricing_mode = p_new_mode THEN
    RETURN;  -- no-op
  END IF;

  SELECT * INTO v_company FROM companies WHERE id = v_company_id;

  IF v_estimate.pricing_mode = 'markup' THEN
    v_active_sub := v_company.default_subcontractor_markup_percent;
    v_active_mat := v_company.default_material_markup_percent;
    v_active_lab := v_company.default_labor_markup_percent;
  ELSE
    v_active_sub := v_company.default_subcontractor_margin_percent;
    v_active_mat := v_company.default_material_margin_percent;
    v_active_lab := v_company.default_labor_margin_percent;
  END IF;

  IF p_new_mode = 'markup' THEN
    v_new_sub := v_company.default_subcontractor_markup_percent;
    v_new_mat := v_company.default_material_markup_percent;
    v_new_lab := v_company.default_labor_markup_percent;
  ELSE
    v_new_sub := v_company.default_subcontractor_margin_percent;
    v_new_mat := v_company.default_material_margin_percent;
    v_new_lab := v_company.default_labor_margin_percent;
  END IF;

  -- Estimate-level %s: swap only the ones still at the active-mode
  -- default (IS NOT DISTINCT FROM treats NULL=NULL as "at default").
  UPDATE estimates
  SET pricing_mode = p_new_mode,
      subcontractor_markup_percent = CASE
        WHEN subcontractor_markup_percent IS NOT DISTINCT FROM v_active_sub THEN v_new_sub
        ELSE subcontractor_markup_percent END,
      material_markup_percent = CASE
        WHEN material_markup_percent IS NOT DISTINCT FROM v_active_mat THEN v_new_mat
        ELSE material_markup_percent END,
      labor_markup_percent = CASE
        WHEN labor_markup_percent IS NOT DISTINCT FROM v_active_lab THEN v_new_lab
        ELSE labor_markup_percent END
  WHERE id = p_estimate_id;

  -- Row-level markups: NULL means "inherit from estimate" and stays
  -- NULL; non-NULL values equal to the active default (for that row's
  -- type) swap to the new default.
  UPDATE estimate_line_rows r
  SET markup_percent = CASE
        WHEN r.markup_percent IS NULL THEN NULL
        WHEN r.row_type = 'labor'
             AND r.markup_percent IS NOT DISTINCT FROM v_active_lab THEN v_new_lab
        -- [S170] an allowance row takes the MATERIAL default (Q3: it rides
        -- material's rate at every level), so it swaps with material here.
        WHEN r.row_type IN ('material', 'allowance')
             AND r.markup_percent IS NOT DISTINCT FROM v_active_mat THEN v_new_mat
        WHEN r.row_type IN ('subcontractor', 'other')
             AND r.markup_percent IS NOT DISTINCT FROM v_active_sub THEN v_new_sub
        ELSE r.markup_percent END
  FROM estimate_line_items li
  WHERE r.line_item_id = li.id AND li.estimate_id = p_estimate_id;
END;
$function$;
