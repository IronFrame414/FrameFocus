-- ============================================================================
-- M6M — Migration 3 of 3: the four capture constraints (D-30 [S99, Josh])
-- Spec: docs/specs/M6M-mobile-pwa-spec.md §7c
--
-- §7c names four rules the design requires and the database does not enforce.
-- Verified against the live rebuild-test schema before writing this file, and
-- TWO of the four turned out to be wrong about the current state. Both
-- corrections are recorded here rather than silently acted on.
--
--   Rule 1  work_performed required on a daily log   -> ENFORCED HERE (new CHECK)
--   Rule 2  an injury must name a party              -> ALREADY ENFORCED. §7c is
--                                                       WRONG. No DDL. See §2.
--   Rule 3  an orderless check-in needs a project    -> ALREADY ENFORCED. §7c
--                                                       says so. No DDL. See §3.
--   Rule 4  damage requires >=1 photo before submit  -> ENFORCED HERE, in a
--                                                       SECURITY DEFINER RPC.
--                                                       Not a table constraint,
--                                                       and §7c says why.
--
-- Nothing in this migration touches production. Applied to rebuild-test only.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Rule 1 — daily_logs.work_performed must be present and non-blank.
--
--    §7c: "Prefer the CHECK -- NOT NULL alone admits '', which passes the
--    constraint and fails the intent." Followed exactly.
--
--    BACKFILL DECISION: none needed, and this is measured, not assumed.
--    Counted on rebuild-test immediately before writing this file:
--      total rows 10, work_performed IS NULL 0, btrim(work_performed) = '' 0.
--    The constraint is therefore added VALID, not NOT VALID. If this migration
--    is ever pointed at a database with violating rows it will fail loudly at
--    ALTER TABLE time, which is the correct outcome -- a NOT VALID constraint
--    would let bad rows survive and quietly never be checked.
--
--    CONSEQUENCE THIS OWNS, stated rather than discovered later:
--    apps/web/app/dashboard/field-ops/[projectId]/daily-logs/log-form.tsx:116
--    writes `work_performed: fields.work_performed?.trim() || null` on BOTH the
--    create and the update path, and the textarea at :210-216 has no required
--    marker and no client-side validation. A desktop user who saves a daily log
--    with the field empty has been writing NULL, and after this migration gets a
--    raw 23514 from Supabase surfaced through the form's generic
--    `setError(result.error)`. That is the ruling working as intended -- the
--    field IS required -- but the desktop form does not yet say so.
--    A-28 forbids this slice from EDITING dashboard/**; it does not exempt
--    dashboard/** from this ruling's consequences. Same posture as D-34 and the
--    live-board gps_in consequence. Fix belongs to a desktop slice, not this one.
-- ----------------------------------------------------------------------------

ALTER TABLE public.daily_logs
  ADD CONSTRAINT daily_logs_work_performed_check
  CHECK (work_performed IS NOT NULL AND btrim(work_performed) <> '');

COMMENT ON CONSTRAINT daily_logs_work_performed_check ON public.daily_logs IS
  'D-30 / M6M §7c rule 1. work_performed is the one field 7c requires. NOT NULL '
  'alone would admit the empty string, so the presence test is btrim(...) <> ''''. '
  'Desktop log-form.tsx still writes NULL when the textarea is empty and has no '
  'client-side required check -- known, owned by a desktop slice.';


-- ----------------------------------------------------------------------------
-- 2. Rule 2 — an injury must name a party. NO DDL. §7c IS WRONG ABOUT THIS.
--
--    §7c states: "safety_incident_injuries.member_id and injured_name are both
--    nullable, and nothing ties the rule to incident_type='injury'". Both halves
--    of that sentence are false against the live schema. Verified by querying
--    pg_constraint on rebuild-test, not by reading migration text:
--
--    (a) The "must identify someone" half is already enforced, and MORE
--        strictly than §7c proposed. §7c asked for
--          CHECK (member_id IS NOT NULL OR injured_name IS NOT NULL)   -- inclusive OR
--        What exists is
--          safety_incident_injuries_identity_check
--          CHECK (num_nonnulls(member_id, injured_name) = 1)           -- exclusive
--        from 20260711140000_module6_6c_safety_incidents.sql. The existing
--        constraint additionally forbids naming BOTH a member and an outsider on
--        one row, which is the member-OR-outsider model 6C locked. Adding §7c's
--        weaker OR would be redundant and would read as if it were the gate.
--
--    (b) The harder half -- an 'injury' incident must have at least one child
--        row -- is already enforced too, by exactly the mechanism §7c recommends
--        ("Recommend the trigger"). Two DEFERRABLE INITIALLY DEFERRED constraint
--        triggers, checked at COMMIT, one on each side of the relationship:
--          safety_incidents.safety_incidents_injury_invariant
--          safety_incident_injuries.safety_incident_injuries_injury_invariant
--        Deferred is what makes parent-then-children insertion legal inside one
--        transaction, which is why 6C also shipped the create_safety_incident()
--        RPC -- PostgREST runs each REST call in its own transaction, so
--        separate inserts would trip the check.
--
--    Adding anything here would duplicate a working invariant. The probes for
--    rule 2 in this session's evidence therefore demonstrate the EXISTING
--    constraints firing under impersonation, not new ones.
-- ----------------------------------------------------------------------------


-- ----------------------------------------------------------------------------
-- 3. Rule 3 — an orderless check-in still needs a project. NO DDL.
--
--    Already correct and §7c already says so: deliveries.project_id is NOT NULL
--    while deliveries.purchase_order_id is nullable, so a no-PO check-in is
--    legal and a no-project check-in is not. Re-verified on rebuild-test.
--    The gap §4.12.4 found is a UI defect -- the handoff's header draws PO,
--    vendor and truck and no project field. M-22 must supply a project. Nothing
--    for a migration to do.
-- ----------------------------------------------------------------------------


-- ----------------------------------------------------------------------------
-- 4. Rule 4 — damage requires >=1 photo. The RPC, because a CHECK cannot reach.
--
--    §7c's three reasons stand: it is a cross-table count; it is a submit-time
--    rule, not a row-time rule (the photo is taken AFTER the damaged line is
--    written, so a per-row constraint would make the correct sequence
--    impossible); and the photo is two writes, of which a files row is only one.
--
--    ENFORCEMENT POINT: submit_delivery_check_in(). 7d is online-only (D-6), so
--    there is no queued path around it.
--
--    WHAT THIS RPC DOES NOT DO, said plainly. deliveries has no status column
--    and no finalisation timestamp -- verified, the columns are project_id,
--    purchase_order_id, vendor_name, delivery_date, has_exceptions, notes,
--    received_by, pdf_file_id plus the standard set. So "finalise" has no state
--    to flip. This RPC is a gate, not a state transition: it authorises, it
--    validates, and on success it recomputes has_exceptions. M-22 calls it as
--    the submit action and only proceeds -- navigating away, firing the
--    Owner/Admin/PM notification -- when it returns without raising.
--    OPEN FOR JOSH: whether deliveries should gain a checked_in_at column so the
--    gate is stateful and a half-entered check-in is distinguishable from a
--    finished one. Not decided here; adding a column to a Module 6D table is
--    outside "the four capture constraints" and has desktop blast radius.
--
--    RESIDUAL, restating §7c so it is not lost: outside this RPC the rule is a
--    UI rule. A direct PostgREST caller can insert a damaged delivery_items row
--    with no photo and never call this function. Accepted.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.submit_delivery_check_in(p_delivery_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_project_id  uuid;
  v_received_by uuid;
  v_company_id  uuid;
  v_offenders   text[];
BEGIN
  IF p_delivery_id IS NULL THEN
    RAISE EXCEPTION 'submit_delivery_check_in: delivery id is required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Existence is scoped to the caller's company. A cross-tenant id reads as
  -- not-found on purpose: tenant isolation must not leak the existence of
  -- another company's row. Within the company, a permission failure below is
  -- reported AS a permission failure and never falls through to not-found.
  SELECT d.project_id, d.received_by, d.company_id
    INTO v_project_id, v_received_by, v_company_id
  FROM deliveries d
  WHERE d.id = p_delivery_id
    AND d.company_id = get_my_company_id()
    AND d.is_deleted = false;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'submit_delivery_check_in: delivery % not found', p_delivery_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- This function is SECURITY DEFINER, so it must re-assert by hand every gate
  -- the table policies would have applied. Read gate: deliveries_select_visible.
  IF NOT can_view_project(v_project_id) THEN
    RAISE EXCEPTION 'submit_delivery_check_in: not permitted on this project'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Write gate: mirrors deliveries_update_authorized, because the success path
  -- writes has_exceptions. The receiver or an Owner/Admin, nobody else. Without
  -- this the DEFINER context would hand every project member a write the table
  -- policy denies them.
  IF NOT (v_received_by = get_my_member_id()
          OR get_my_role() = ANY (ARRAY['owner', 'admin'])) THEN
    RAISE EXCEPTION 'submit_delivery_check_in: not permitted to submit this check-in'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- The rule. Every live line reporting damage must have at least one live file
  -- linked to it. files.delivery_item_id is the link (20260723000000).
  -- company_id is compared explicitly: DEFINER bypasses files_select_non_client,
  -- so a same-id row belonging to another tenant must not be able to satisfy
  -- this test.
  SELECT array_agg(i.description ORDER BY i.created_at, i.id)
    INTO v_offenders
  FROM delivery_items i
  WHERE i.delivery_id = p_delivery_id
    AND i.is_deleted = false
    AND i.qty_damaged > 0
    AND NOT EXISTS (
      SELECT 1
      FROM files f
      WHERE f.delivery_item_id = i.id
        AND f.is_deleted = false
        AND f.company_id = v_company_id
    );

  IF v_offenders IS NOT NULL AND array_length(v_offenders, 1) > 0 THEN
    RAISE EXCEPTION
      'submit_delivery_check_in: every damaged line needs a photo. Missing on: %',
      array_to_string(v_offenders, '; ')
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM recompute_delivery_exceptions(p_delivery_id);
END;
$$;

COMMENT ON FUNCTION public.submit_delivery_check_in(uuid) IS
  'D-30 / M6M §7c rule 4. Submit gate for 7d / M-22: refuses when any live '
  'delivery_items row has qty_damaged > 0 and no live files row linked via '
  'delivery_item_id. A table CHECK cannot express this (cross-table, '
  'submit-time, and a files row is only half a photo). Safe as the sole gate '
  'because 7d is online-only per D-6 -- no queued path bypasses it. Outside '
  'this function the rule is a UI rule; that residual is accepted in §7c.';

REVOKE ALL ON FUNCTION public.submit_delivery_check_in(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_delivery_check_in(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.submit_delivery_check_in(uuid) TO authenticated;
