-- ============================================================================
-- #1-s143 CLOSED — the one column-scope guard with no service-role escape.
-- ============================================================================
--
-- Ruled [Josh, S148, option (a)]: add the escape, matching every sibling. It is
-- the anomaly, not the rule.
--
-- ----------------------------------------------------------------------------
-- WHY THIS BLOCKS 7G, MEASURED RATHER THAN REASONED
-- ----------------------------------------------------------------------------
-- Fifteen `enforce_*_column_scope` / `*_qb_scope` functions exist. Fourteen open
-- with `IF auth.uid() IS NULL THEN RETURN NEW; END IF;` so a service-role or
-- system write passes before any role is consulted. This one opened with
-- `get_my_role()` instead — and for a caller with no JWT that returns NULL, so
-- `NULL = ANY(ARRAY['owner','admin'])` is NULL, not true, and control falls
-- through to the frozen-column list.
--
-- 7G's sync worker is ruled SERVICE ROLE (7g1-spec §S). Probed at S148 with a
-- paired control, both writes made with no JWT:
--
--   invoices.qb_push_status          (escape present) -> WRITE SUCCEEDED
--   time_clock_sessions.qb_push_status (no escape)    -> REFUSED:
--       "Session system columns are not editable for your role."
--
-- So the TimeActivity export path was closed at the database before a line of
-- it could be written, and the two columns S143 added to this table
-- (`qb_push_status`, `qb_time_activity_id`) were unreachable by their only
-- intended writer.
--
-- The two rejected alternatives, recorded so they are not revisited:
--   (b) drop TimeActivity from 7G — drops scope to accommodate a defect.
--   (c) have the worker suspend the trigger — what 20260924000000 had to do for
--       its own backfill, and more dangerous than the escape it works around.
--
-- ----------------------------------------------------------------------------
-- ⚠️ RECREATED FROM THE LIVE BODY, NOT ALTERED
-- ----------------------------------------------------------------------------
-- Read from `pg_get_functiondef()` at S148 and reproduced verbatim below with
-- ONE addition: the four escape lines. Postgres stores plpgsql as text, so a
-- hand-retyped body silently drops whatever the author did not happen to copy —
-- S143 paid for that lesson once on this same function.
--
-- This changes NOTHING for a signed-in user. Every existing branch is byte-for-
-- byte what it was; the new lines are only reachable when `auth.uid()` is NULL,
-- which no browser session ever is.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enforce_time_clock_sessions_column_scope()
RETURNS TRIGGER AS $$
DECLARE
  v_me uuid := public.get_my_member_id();
BEGIN
  -- [S148, #1-s143] The escape every sibling has had all along. A service-role
  -- or system write carries no JWT and is not a role decision.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text]) THEN
    RETURN NEW;
  END IF;

  -- Frozen for every non-Owner/Admin editor.
  IF NEW.member_id     IS DISTINCT FROM OLD.member_id
     OR NEW.company_id IS DISTINCT FROM OLD.company_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.gps_in     IS DISTINCT FROM OLD.gps_in
     OR NEW.qb_push_status IS DISTINCT FROM OLD.qb_push_status          -- renamed [S143]
     OR NEW.qb_time_activity_id IS DISTINCT FROM OLD.qb_time_activity_id -- new [S143]
     THEN
    RAISE EXCEPTION 'Session system columns are not editable for your role.';
  END IF;

  IF OLD.member_id IS NOT DISTINCT FROM v_me THEN
    -- Self: live clock-out + the clock-in undo path only.
    IF NEW.clock_in IS DISTINCT FROM OLD.clock_in
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
       OR NEW.approved_at IS DISTINCT FROM OLD.approved_at THEN
      RAISE EXCEPTION 'Clock-in time and approval state are not editable on your own session.';
    END IF;
    IF NEW.clock_out IS DISTINCT FROM OLD.clock_out
       AND OLD.clock_out IS NOT NULL THEN
      RAISE EXCEPTION 'Clock times on a closed session are not editable. Ask an Owner/Admin.';
    END IF;
    RETURN NEW;
  END IF;

  IF public.can_approve_member(OLD.member_id) THEN
    -- Supervisor: clock correction + the approval columns only.
    IF NEW.gps_out IS DISTINCT FROM OLD.gps_out
       OR NEW.is_deleted IS DISTINCT FROM OLD.is_deleted
       OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
      RAISE EXCEPTION 'Supervisors may correct clock times and approve only; deletion is Owner/Admin.';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'You are not authorized to edit this session.';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.enforce_time_clock_sessions_column_scope() IS
  '6A session column scope. [S148] Gained the auth.uid() IS NULL escape that '
  'all fourteen sibling guards already had (#1-s143) — without it 7G''s '
  'service-role sync worker could not write qb_push_status or '
  'qb_time_activity_id at all. Probed by s148-qb-connection.live.ts.';
