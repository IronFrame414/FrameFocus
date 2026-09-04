-- Estimates redesign §1.2 [R2′, Q2] — version is DERIVED, never stored.
--
-- The vestigial `estimates.version_number` (DEFAULT 'v1.1', zero writers) is
-- frozen on send by the immutability trigger, which is exactly why a stored
-- counter was rejected: it would freeze at the moment it needed to advance. The
-- version is instead the length of the void/reissue supersede chain, walked at
-- read time. A reissue writes a fresh draft whose `supersedes_estimate_id`
-- points at the voided original (see reissueEstimate / reissue path), so
-- walking BACKWARD from any estimate to the root gives its position in the
-- chain — which is its version.
--
--   first send   → supersedes_estimate_id IS NULL → depth 1 → "v1"
--   one reissue  → chain length 2               → depth 2 → "v2"
--
-- Nothing is written. The label the app renders is "v" || this integer; the
-- vestigial 'v1.1' never surfaces (the column is left in place, unread).

CREATE OR REPLACE FUNCTION get_estimate_version(p_estimate_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
-- SECURITY INVOKER (default): RLS scopes the walk to the caller's company. The
-- service-role client (public signing page / send) bypasses RLS and sees the
-- whole chain, which is correct. The company_id match in the recursive step is
-- belt-and-suspenders — enforce_estimate_supersedes_valid already forbids a
-- cross-company supersede.
SET search_path = public
AS $$
  WITH RECURSIVE chain AS (
    SELECT id, supersedes_estimate_id, company_id, 1 AS depth
    FROM estimates
    WHERE id = p_estimate_id
    UNION ALL
    SELECT e.id, e.supersedes_estimate_id, e.company_id, c.depth + 1
    FROM estimates e
    JOIN chain c
      ON e.id = c.supersedes_estimate_id
     AND e.company_id = c.company_id
  )
  SELECT COALESCE(MAX(depth), 1) FROM chain;
$$;

GRANT EXECUTE ON FUNCTION get_estimate_version(uuid) TO authenticated, service_role;
