-- Estimates redesign — Migration #3 of the S103 build: the estimate event log.
-- Spec: docs/specs/estimates-redesign-spec.md §3.5 row 3; R3.
--
-- One append-only log feeding BOTH 16d's history rail and 19b's client-activity
-- "repriced/margin-dropped" lines. Kinds captured: reprice, send, award,
-- convert. CLONE IS EXCLUDED [R3].
--
-- Append-only-log conventions (CLAUDE.md): columns are id, company_id,
-- created_at, plus domain fields — NO updated_at/created_by/updated_by/
-- is_deleted/deleted_at, NO updated_at trigger, and NO UPDATE or DELETE policy
-- (only SELECT + INSERT). A write is a fact; it is never edited.
--
-- Visibility mirrors the estimate's: the SELECT policy leans on estimates' own
-- RLS via EXISTS, so Owner/Admin see company-wide and a PM sees only their own
-- estimates' events — the same pattern proposal_views uses (20261052000000).
-- Independently pushable: a new table, depends on no other migration here.

CREATE TABLE estimate_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL DEFAULT get_my_company_id() REFERENCES companies(id),
  estimate_id uuid NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('reprice', 'send', 'award', 'convert')),
  actor_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  payload     jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE estimate_events IS
  'Append-only estimate event log (S103 migration #3). Feeds 16d history rail + '
  '19b client activity. Kinds: reprice/send/award/convert (clone excluded, R3). '
  'No UPDATE/DELETE — a write is a fact.';

-- The rail reads events for one estimate newest-first; index for it (and to keep
-- any .limit(1) latest-event read deterministic — CLAUDE.md ORDER-BY rule).
CREATE INDEX idx_estimate_events_estimate_id_created_at
  ON estimate_events (estimate_id, created_at DESC);

ALTER TABLE estimate_events ENABLE ROW LEVEL SECURITY;

-- SELECT: company-scoped AND the caller can see the parent estimate (RLS on the
-- EXISTS subquery does the role scoping — O/A company-wide, PM own only).
CREATE POLICY estimate_events_select_visible ON estimate_events
  FOR SELECT USING (
    company_id = get_my_company_id()
    AND EXISTS (SELECT 1 FROM estimates e WHERE e.id = estimate_events.estimate_id)
  );

-- INSERT: same scoping. SECURITY DEFINER writers (convert RPC, set_winning_bid)
-- bypass this; the client-side reprice writer runs as the user and is covered.
CREATE POLICY estimate_events_insert_visible ON estimate_events
  FOR INSERT WITH CHECK (
    company_id = get_my_company_id()
    AND EXISTS (SELECT 1 FROM estimates e WHERE e.id = estimate_events.estimate_id)
  );

-- No UPDATE, no DELETE policy — append-only.
