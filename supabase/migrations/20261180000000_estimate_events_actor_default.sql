-- Estimates redesign — service phase: estimate_events.actor_id default.
-- Spec: docs/specs/estimates-redesign-spec.md §3.5 row 3 (event writers).
--
-- BUILD DECISION [S103, recorded per §0 narrowed-autonomy]. The event writers
-- emit from the TS layer (client services + the send route), best-effort and
-- non-blocking — NOT from inside convert_estimate_to_project()/set_winning_bid(),
-- because re-creating a 200-line SECURITY DEFINER RPC by hand to add one INSERT
-- is transcription risk for an ADVISORY log (the history rail), and the log is
-- not a security or financial boundary.
--
-- The history rail shows the actor ("Josh Bishop · Aug 25"), so actor_id must be
-- populated. Giving it DEFAULT auth.uid() — the same idiom created_by uses across
-- this project — lets the three RLS-scoped client writers (reprice/award/convert)
-- auto-stamp the acting user with no extra round-trip. The service-role send
-- writer passes actor_id explicitly (auth.uid() is null under service role).
--
-- Additive, no data rewrite; independently pushable.

ALTER TABLE estimate_events ALTER COLUMN actor_id SET DEFAULT auth.uid();

COMMENT ON COLUMN estimate_events.actor_id IS
  'The acting user (auth.users.id). DEFAULT auth.uid() auto-stamps RLS-scoped '
  'client writers; the service-role send writer passes it explicitly. S103.';
