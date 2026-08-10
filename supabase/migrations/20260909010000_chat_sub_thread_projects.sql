-- ============================================================================
-- CHAT — ND-25 across the whole switcher, in one round trip.
-- Spec: chat-spec.md §5.3, §7.1a-i, §7.1e. Slice 4.
-- ============================================================================
--
-- The switcher must know, for EVERY project it lists, whether a sub thread
-- should render — §7.1e: "Where only the crew thread exists (ND-25): no
-- segmented control at all, and not a disabled second segment."
--
-- ----------------------------------------------------------------------------
-- IT DELEGATES TO chat_sub_thread_exists() RATHER THAN RESTATING THE RULE
-- ----------------------------------------------------------------------------
-- The obvious shape — inline the "assigned subcontractor with a profile" join
-- here — would be a SECOND definition of when a sub thread exists, and the two
-- would drift the first time either changed. §7.1a-i already warns about this
-- for membership: "a switcher that assembled its own membership would be a
-- second definition of who can read a thread". Same hazard, different rule.
--
-- The alternative rejected was calling the single-project function once per
-- project from TypeScript — the N+1 §7.1a-i names, across the whole switcher,
-- every time the panel opens.
--
-- ⚠️ SECURITY INVOKER, so `projects` is filtered by projects_select_visible and
-- the caller can only be told about projects they can already see. The inner
-- function is DEFINER for the reason recorded in 20260909000000 (a crew reader
-- cannot necessarily read the subcontractor's profiles row) and carries its own
-- can_view_project() gate, so the pair does not widen anything.

CREATE OR REPLACE FUNCTION chat_sub_thread_projects()
RETURNS TABLE (project_id uuid)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  SELECT p.id
  FROM projects p
  WHERE p.status = 'active'
    AND p.is_deleted = false
    AND chat_sub_thread_exists(p.id);
$$;

COMMENT ON FUNCTION chat_sub_thread_projects() IS
  'ND-25 for the whole switcher in one round trip: the active projects the '
  'caller can see that have at least one assigned subcontractor with a profile, '
  'and therefore render a Subs segment. Delegates to chat_sub_thread_exists() '
  'so the rule has one definition.';
