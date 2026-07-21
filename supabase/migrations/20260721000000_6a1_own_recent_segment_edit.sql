-- ============================================================================
-- Module 6 / 6A-1 — Own most-recent-segment edit (spec 6A-1 §4.3 / §S-2,
-- option B, approved Session 85 Phase 2 item 1).
--
-- ⚠️ WRITTEN, NOT APPLIED. Josh applies manually (queues behind the pending
-- signed-artifacts migration — see STATE.md). Run `npm run db:push` after
-- applying to regenerate types.
--
-- Two changes:
--   1. RLS row scope — a member may UPDATE their own MOST-RECENT segment
--      (open OR the latest ended one), replacing the previous own-OPEN-only
--      rule. Owner/Admin retain full edit (§8.1 unchanged).
--   2. Column scope — a NEW BEFORE UPDATE trigger restricts what a non-
--      Owner/Admin editor may change. This is a deliberate departure from the
--      repo's service-layer-only column convention (5B crew updates): both 6A
--      specs' acceptance criteria require that a DIRECT client call bypassing
--      the UI is rejected server-side, and the service layer is client-side
--      JS — it cannot satisfy that on its own. The service allowlist still
--      exists (friendly errors); the trigger is the enforcement.
--
-- Self-edit column scope (caller = the segment's session member, not
-- Owner/Admin):
--   * editable:  project_id, task_id, segment_type, note, completion
--   * segment_end: NULL -> value only (the live end-segment flow; an already-
--     ended segment's times are frozen for the member)
--   * frozen:    segment_start, session_id, company_id, created_at,
--                created_by, is_deleted, deleted_at (segment soft-delete stays
--                Owner/Admin, §8.1)
-- The supervisor arm (6A-2 §S-2) is added by the next migration, which
-- CREATE OR REPLACEs enforce_time_segments_column_scope().
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Helpers (SQL SECURITY DEFINER per repo pattern — CLAUDE.md Database
--    Patterns: SQL, not plpgsql, so RLS is reliably bypassed in policy/trigger
--    contexts).
-- ----------------------------------------------------------------------------

-- The member a session belongs to. Used by the column-scope triggers (this
-- migration and the next) so a plpgsql trigger never queries the RLS-protected
-- sessions table directly.
CREATE FUNCTION public.time_session_member(p_session_id uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT s.member_id
  FROM time_clock_sessions s
  WHERE s.id = p_session_id
  LIMIT 1;
$$;

-- True iff p_segment_id is the caller's own most-recent non-deleted segment
-- (by segment_start, created_at tiebreak) across their non-deleted sessions.
-- The open segment, when one exists, is always the most recent — so this
-- subsumes the previous owns_open_session(...) AND segment_end IS NULL arm.
CREATE FUNCTION public.is_my_recent_segment(p_segment_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT p_segment_id = (
    SELECT seg.id
    FROM time_segments seg
    JOIN time_clock_sessions s ON s.id = seg.session_id
    WHERE s.member_id = get_my_member_id()
      AND seg.is_deleted = false
      AND s.is_deleted = false
    ORDER BY seg.segment_start DESC, seg.created_at DESC
    LIMIT 1
  );
$$;

-- ----------------------------------------------------------------------------
-- 2. RLS — widen the member arm from own-open to own-most-recent.
--    Previous predicate (migration 20260710130000):
--      owner/admin OR (owns_open_session(session_id) AND segment_end IS NULL)
-- ----------------------------------------------------------------------------

DROP POLICY time_segments_update_authorized ON public.time_segments;

CREATE POLICY time_segments_update_authorized ON public.time_segments
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND (
      public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
      OR public.is_my_recent_segment(id)
    )
  );

-- ----------------------------------------------------------------------------
-- 3. Column scope — BEFORE UPDATE trigger. Named so it fires before the
--    updated_at / set_updated_by triggers (alphabetical firing order);
--    updated_at / updated_by are owned by those triggers and are not checked
--    here.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_time_segments_column_scope()
RETURNS TRIGGER AS $$
DECLARE
  v_me uuid := public.get_my_member_id();
  v_session_member uuid;
BEGIN
  -- Owner/Admin retain full edit (§8.1).
  IF public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text]) THEN
    RETURN NEW;
  END IF;

  -- Frozen for every non-Owner/Admin editor.
  IF NEW.session_id    IS DISTINCT FROM OLD.session_id
     OR NEW.company_id IS DISTINCT FROM OLD.company_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.segment_start IS DISTINCT FROM OLD.segment_start THEN
    RAISE EXCEPTION 'Segment times and system columns are not editable for your role.';
  END IF;

  v_session_member := public.time_session_member(OLD.session_id);

  IF v_session_member IS NOT DISTINCT FROM v_me THEN
    -- Self: attribution fields + live end only.
    IF NEW.is_deleted IS DISTINCT FROM OLD.is_deleted
       OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
      RAISE EXCEPTION 'Deleting a segment is an Owner/Admin action.';
    END IF;
    IF NEW.segment_end IS DISTINCT FROM OLD.segment_end
       AND OLD.segment_end IS NOT NULL THEN
      RAISE EXCEPTION 'Clock times on an ended segment are not editable. Ask an Owner/Admin.';
    END IF;
    RETURN NEW;
  END IF;

  -- Not self, not Owner/Admin: no supervisor arm yet (added by the 6A-2
  -- tiered-RLS migration, which replaces this function).
  RAISE EXCEPTION 'You are not authorized to edit this segment.';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER time_segments_column_scope
  BEFORE UPDATE ON public.time_segments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_time_segments_column_scope();
