-- ============================================================================
-- S112 — MIGRATION 2 of 2: privileged functions check who is calling.
-- ============================================================================
--
-- RULED [Josh, S112]: "Migration 2, separately: the caller checks inside each
-- privileged function. Defence in depth, and a different kind of risk. Keeping
-- them apart means migration 1 can be rolled back without entangling migration 2."
--
-- Migration 1 (20261870000000) shut out the anon key. This is about SIGNED-IN
-- users of ANOTHER company. Found by listing every SECURITY DEFINER function
-- `authenticated` may execute whose body never consults the caller (auth.uid,
-- get_my_*, my_company_id, auth.jwt, can_view_project, ...): 24. Four are
-- token-credentialed by design (the invite and bid-token functions); four
-- site-visit functions DO check, through site_visit_access() — false positives
-- of the pattern; invited_signup_autoconfirm_installed only reports whether a
-- trigger exists. That leaves the 15 below plus apply_change_order_budget,
-- whose check had a hole.
--
-- MEASURED before this migration (s112-caller-checks.live.ts, two companies'
-- owners as real sessions): owner A allocated INV-0002 in company B; four
-- internal functions ran their bodies for a signed-in stranger;
-- member_profile_role and time_session_member answered about another company;
-- apply_change_order_budget told company B "CO-100-01 is voided".
--
-- ----------------------------------------------------------------------------
-- A. INTERNAL-ONLY FUNCTIONS — no longer an API for signed-in users (13)
-- ----------------------------------------------------------------------------
-- No app code calls these (git grep of every .rpc( in apps/web and scripts);
-- they are called only by other functions and triggers, and EVERY such caller
-- is SECURITY DEFINER (measured in pg_proc) — it runs as the owner, so removing
-- `authenticated` breaks no caller. A check INSIDE would see the triggering
-- user and could refuse a legitimate system recompute; removing the grant
-- closes the direct path without touching the internal one. service_role keeps
-- EXECUTE (live tests call get_invitation_for_signup with it).
--
-- ----------------------------------------------------------------------------
-- B. POLICY HELPERS — must stay executable, so they check inside (2)
-- ----------------------------------------------------------------------------
-- member_profile_role and time_session_member are used in RLS policies
-- (company_members, project_assignments, time_segments), which evaluate AS the
-- signed-in user. They now answer only about the caller's own company. A NULL
-- auth.uid() (service role, cron, a trigger on a service-role write) keeps the
-- old behaviour: anon can no longer reach them (migration 1), and those
-- callers are the system itself.
--
-- ----------------------------------------------------------------------------
-- C. apply_change_order_budget — the hole in its own check
-- ----------------------------------------------------------------------------
-- It treated "no auth.uid()" as the trusted signing flow — true only of the
-- service role, but anon had it too. Now: no user is admitted only when the
-- JWT says service_role, or there is no JWT at all (direct DB, cron). And the
-- company check runs BEFORE any message that names the change order.
-- ============================================================================

-- A.
DO $$
DECLARE
  f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'allocate_invoice_number', 'clone_estimate_line', 'compute_member_coi_expiry',
        'get_invitation_for_signup', 'recompute_budget_item', 'recompute_budget_item_actual',
        'recompute_budget_item_committed', 'recompute_delivery_exceptions', 'recompute_po_status',
        'revert_invoice_settlement', 'seed_default_tags', 'seed_file_categories', 'sync_po_commitment'
      )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', f.sig);
  END LOOP;
END
$$;

-- B.
CREATE OR REPLACE FUNCTION public.member_profile_role(p_member_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p.role
  FROM company_members m
  JOIN profiles p ON p.id = m.profile_id
  WHERE m.id = p_member_id
    -- [S112] only about the caller's own company; see the header.
    AND (auth.uid() IS NULL OR m.company_id = get_my_company_id());
$function$;

CREATE OR REPLACE FUNCTION public.time_session_member(p_session_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT s.member_id
  FROM time_clock_sessions s
  WHERE s.id = p_session_id
    -- [S112] only about the caller's own company; see the header.
    AND (auth.uid() IS NULL OR s.company_id = get_my_company_id())
  LIMIT 1;  -- id is the primary key: at most one row, nothing depends on order
$function$;

-- C.
CREATE OR REPLACE FUNCTION public.apply_change_order_budget(p_change_order_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_co RECORD;
  v_count integer := 0;
  v_row RECORD;
  v_item_id uuid;
  v_amount numeric;
BEGIN
  -- Service-role (the signing flow) or Owner/Admin (the retry surface).
  -- [S112] "No user" is trusted ONLY for the service role or a caller with no
  -- JWT at all (direct DB, cron). _Superseded:_ any NULL auth.uid() passed,
  -- which included the anon key.
  IF auth.uid() IS NULL THEN
    IF coalesce(auth.jwt() ->> 'role', 'none') NOT IN ('service_role', 'none') THEN
      RAISE EXCEPTION 'apply_change_order_budget: not permitted' USING ERRCODE = '42501';
    END IF;
  ELSIF public.get_my_role() IS NULL OR public.get_my_role() NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'apply_change_order_budget: Owner/Admin only';
  END IF;

  SELECT * INTO v_co
  FROM change_orders
  WHERE id = p_change_order_id AND is_deleted = false
  FOR UPDATE;

  -- [S112] Company FIRST, so no message below ever describes another
  -- company's change order. _Superseded:_ this ran after the "not signed"
  -- check, which named the CO and its status to anyone holding its id.
  IF NOT FOUND OR (auth.uid() IS NOT NULL AND v_co.company_id <> public.get_my_company_id()) THEN
    RAISE EXCEPTION 'apply_change_order_budget: change order not found';
  END IF;
  IF v_co.status <> 'signed' THEN
    RAISE EXCEPTION 'apply_change_order_budget: change order % is %, not signed', v_co.co_number, v_co.status;
  END IF;

  -- Idempotent: budget rows already written for this CO -> no-op.
  PERFORM 1 FROM project_budget_items
  WHERE source_change_order_id = p_change_order_id AND is_deleted = false;
  IF FOUND THEN
    RETURN 0;
  END IF;

  -- One budget row per CO line row — the §5.1 cost expression verbatim
  -- (tax-inclusive on any taxed non-labor row). cost_code NULL (COs are
  -- flat — no category tree); provenance is the FK, labeling is UI-side.
  FOR v_row IN
    SELECT r.row_type, r.name, r.rate, r.quantity, r.unit_of_measure,
           r.unit_cost, r.amount, r.apply_tax
    FROM change_order_line_rows r
    JOIN change_order_line_items li ON li.id = r.line_item_id
    WHERE li.change_order_id = p_change_order_id
  LOOP
    v_amount := CASE v_row.row_type
      WHEN 'labor' THEN COALESCE(v_row.rate, 0) * COALESCE(v_row.quantity, 0)
      ELSE round(
        (CASE v_row.row_type
           -- [S170] see convert_estimate_to_project: explicit arms, NULL else.
           WHEN 'material'      THEN COALESCE(v_row.unit_cost, 0) * COALESCE(v_row.quantity, 0)
           WHEN 'allowance'     THEN COALESCE(v_row.unit_cost, 0) * COALESCE(v_row.quantity, 0)
           WHEN 'subcontractor' THEN COALESCE(v_row.amount, 0)
           WHEN 'other'         THEN COALESCE(v_row.amount, 0)
           ELSE NULL
         END)
        * (CASE WHEN v_row.apply_tax
                THEN 1 + COALESCE(v_co.tax_rate, 0) / 100
                ELSE 1 END)
      , 2)
    END;

    INSERT INTO project_budget_items (
      company_id, project_id, source_change_order_id,
      row_type, cost_code, description, created_by
    ) VALUES (
      v_co.company_id, v_co.project_id, p_change_order_id,
      v_row.row_type, NULL, v_row.name, auth.uid()
    )
    RETURNING id INTO v_item_id;

    INSERT INTO project_budget_amounts (company_id, budget_item_id, budgeted_amount)
    VALUES (v_co.company_id, v_item_id, v_amount);

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;
