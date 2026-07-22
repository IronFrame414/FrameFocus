-- 6B UI build (S87): get_project_day_presence(project_id, date)
--
-- Crew-present auto-fill and the daily-log hours rail need "who had a
-- project-bearing segment on this project on this company-tz day, and for how
-- many hours." 6A's tiered time RLS (time_clock_sessions_select_scoped: self OR
-- strictly-lower rank) blocks a crew/foreman log author from reading peers'
-- sessions, so a direct client query cannot satisfy 6B-spec §5.
--
-- This SECURITY DEFINER SQL function (CLAUDE.md pattern — SQL, not plpgsql)
-- exposes ONLY member_id + hour totals + a warranty-only marker for a single
-- project-day, gated by can_view_project(). No session rows, timestamps, GPS,
-- or approval state leak, so the tiered payroll-visibility intent survives.
--
-- Day boundary: segment_start falling within [local midnight, next local
-- midnight) of p_date in the project's company timezone (6B-spec §5 / §13.2).
-- warranty_only: every segment for that member on this project-day is
-- 'warranty' — presence-vs-cost label per 6B-spec Q4 (warranty hours are
-- budget-excluded but the person was physically on site).

CREATE OR REPLACE FUNCTION get_project_day_presence(p_project_id uuid, p_date date)
RETURNS TABLE (member_id uuid, hours numeric, warranty_only boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    s.member_id,
    ROUND(
      (SUM(EXTRACT(EPOCH FROM (COALESCE(seg.segment_end, now()) - seg.segment_start))) / 3600.0)::numeric,
      2
    ) AS hours,
    BOOL_AND(seg.segment_type = 'warranty') AS warranty_only
  FROM time_segments seg
  JOIN time_clock_sessions s ON s.id = seg.session_id
  CROSS JOIN LATERAL (
    SELECT c.timezone
    FROM projects pr
    JOIN companies c ON c.id = pr.company_id
    WHERE pr.id = p_project_id
  ) z
  WHERE can_view_project(p_project_id)
    AND seg.project_id = p_project_id
    AND COALESCE(seg.is_deleted, false) = false
    AND COALESCE(s.is_deleted, false) = false
    AND seg.segment_start >= (p_date::timestamp AT TIME ZONE z.timezone)
    AND seg.segment_start <  ((p_date + 1)::timestamp AT TIME ZONE z.timezone)
  GROUP BY s.member_id;
$$;
