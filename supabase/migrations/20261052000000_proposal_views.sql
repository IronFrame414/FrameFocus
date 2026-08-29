-- ═══════════════════════════════════════════════════════════════════════════
-- proposal_views — row-per-view tracking for the public proposal link (P3).
-- Spec: docs/specs/proposal-view-tracking-spec.md.
--
-- Append-only log (CLAUDE.md pattern): no updated_*, no created_by, no
-- soft-delete. One row per open of /sign/[token]; created_at IS the view
-- moment. Total-opened / last-opened are DERIVED at read time, and so is the
-- scanner filter (user agent) — write-time filtering would freeze today's
-- scanner rule into data that cannot be corrected.
--
-- ⚠️ THE WRITE PATH HAS NO POLICY, ON PURPOSE. The link is public and
-- logged-out; the row is written server-side by the signing page via the
-- service role, exactly like every other write on that surface
-- (signing_sessions has no write policies either). Do not add an anon arm.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE proposal_views (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id),
  -- CASCADE, not the audit-log SET NULL: a view row with no estimate answers
  -- nothing — the "log row genuinely makes no sense without the parent" case.
  estimate_id UUID NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_agent  TEXT
);

CREATE INDEX idx_proposal_views_estimate_id ON proposal_views (estimate_id, created_at);

ALTER TABLE proposal_views ENABLE ROW LEVEL SECURITY;

-- Read visibility mirrors the ESTIMATE's own SELECT — Owner/Admin plus the
-- authoring PM [Josh, 2026-08-29]: "a PM who can reach their own estimate
-- should see its activity, or the column renders empty for the person who
-- sent it." The EXISTS runs as the invoker, so estimates' own policy applies
-- inside it and this arm tracks any future change to the estimate floor.
-- Deliberate containment in the invoice_lines sense — here the parent's
-- visibility IS the ruled visibility. Clients and subs have no estimates arm
-- and are excluded for free.
CREATE POLICY proposal_views_select_estimate_visible ON proposal_views
  FOR SELECT TO authenticated USING (
    company_id = get_my_company_id()
    AND EXISTS (SELECT 1 FROM estimates e WHERE e.id = proposal_views.estimate_id)
  );

-- No INSERT / UPDATE / DELETE policies: the service role writes, nobody edits
-- a view, and pruning goes through prune_proposal_views() below.

-- Retention — the event log's G1 #4 rule (outstanding-work-register.md), which
-- proposal views JOIN by ruling [Josh, 2026-08-29]: prune at six months,
-- EXCEPT where the parent is still open. For estimates the register names
-- converted/voided as the only terminal states, and a CONVERTED estimate's
-- history is kept as the project's history — so the prune reaches VOIDED
-- estimates only. Six months is that rule's clock, not a platform default.
--
-- ⚠️ No scheduler exists on this project (no pg_cron) — the function ships
-- callable and unscheduled. TECH_DEBT #1-blk tracks giving it a clock.
CREATE OR REPLACE FUNCTION prune_proposal_views()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH gone AS (
    DELETE FROM proposal_views pv
    USING estimates e
    WHERE e.id = pv.estimate_id
      AND e.status = 'voided'
      AND pv.created_at < now() - interval '6 months'
    RETURNING 1
  )
  SELECT count(*)::integer FROM gone;
$$;

-- Owner/Admin may run the prune by hand; nobody else calls it.
REVOKE EXECUTE ON FUNCTION prune_proposal_views() FROM public, anon, authenticated;
