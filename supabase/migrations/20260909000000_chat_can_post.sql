-- ============================================================================
-- CHAT — "may I post in this thread?", asked of the DATABASE.
-- Spec: chat-spec.md §5.2, §7.4, M6M D-54. Slice 4.
-- ============================================================================
--
-- Slice 4 renders the sub thread, where the crew-reading case needs a composer
-- that is ABSENT rather than disabled — M6M D-54: "a hidden button is not a
-- permission". The composer's absence must be a policy, not CSS.
--
-- ----------------------------------------------------------------------------
-- WHY A FUNCTION AND NOT AN `if (role === 'crew_member')` IN THE ROUTE
-- ----------------------------------------------------------------------------
-- The UI has to decide whether to render a composer BEFORE anyone types, and
-- the only authority on that is `chat_messages_insert_authorized`. A TypeScript
-- re-statement of that predicate would be a second definition of who may post,
-- and the two would drift the first time either changed — #129's shape exactly,
-- and the failure CLAUDE.md's parity ruling exists to prevent ("the rules live
-- below the UI ... so neither surface can enforce a different version").
--
-- So the predicate is written once more, HERE, deliberately adjacent to the
-- policy, and `s126-chat-sub.live.ts` asserts that this function and a real
-- INSERT agree for every role. That test is the guard against the drift this
-- function would otherwise introduce: if someone edits the policy and not this,
-- it fails.
--
-- ⚠️ SECURITY INVOKER. It must answer for the CALLER, and it must not become a
-- way to ask about a thread the caller cannot see: the body reads
-- `chat_threads`, which is itself RLS-filtered, so an invisible thread yields
-- no row and the answer is false.
--
-- Mirrors the thread clause of `chat_messages_insert_authorized`
-- (20260906000000). The company and author checks are omitted on purpose —
-- those are properties of the ROW being written, not of the caller's right to
-- write one, and the composer question is only the latter.

CREATE OR REPLACE FUNCTION chat_can_post(p_thread_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM chat_threads t
    WHERE t.id = p_thread_id
      AND (
        -- Crew thread: anyone who can see the project, except a subcontractor.
        (
          t.kind = 'crew'
          AND get_my_role() IS DISTINCT FROM 'subcontractor'
          AND can_view_project(t.project_id)
        )
        -- Sub thread (ND-20): Owner and Admin by role; PM and the project's
        -- assigned subs by assignment. Foreman and crew are READERS only, and
        -- their absence here is what §7.4's banner is telling them about.
        OR (
          t.kind = 'sub'
          AND (
            get_my_role() = ANY (ARRAY['owner', 'admin'])
            OR (get_my_role() = 'project_manager' AND is_assigned_to_project(t.project_id))
            OR (get_my_role() = 'subcontractor' AND is_assigned_to_project(t.project_id))
          )
        )
      )
  );
$$;

COMMENT ON FUNCTION chat_can_post(uuid) IS
  'ND-20/D-54: may the caller post in this thread? Mirrors the thread clause of '
  'chat_messages_insert_authorized so the composer can be ABSENT rather than '
  'disabled. SECURITY INVOKER. Kept honest by s126-chat-sub.live.ts, which '
  'asserts this function and a real INSERT agree for every role.';

-- ----------------------------------------------------------------------------
-- ND-25 — does a project have a sub thread AT ALL?
-- ----------------------------------------------------------------------------
-- "Where a project has no assigned sub with a profile, the sub thread does not
-- render." Not an empty thread, not a disabled second segment (§7.1e) — no
-- second segment.
--
-- Threads are created lazily, so this cannot be answered by looking for a
-- `chat_threads` row: the question is whether one SHOULD exist, which is asked
-- before the first one ever does.
--
-- ⚠️ SECURITY DEFINER, and the reason is narrow. A crew member cannot
-- necessarily read the subcontractor's `profiles` row, so an INVOKER version
-- would answer "no sub thread" for exactly the readers §7.4's banner is for —
-- the sub thread would vanish for crew and appear for Owners, which is a
-- divergence in what EXISTS rather than in what is permitted. The function
-- leaks one boolean per project and no identity, and it is scoped to projects
-- the caller can already see via can_view_project().
CREATE OR REPLACE FUNCTION chat_sub_thread_exists(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT can_view_project(p_project_id)
     AND EXISTS (
    SELECT 1
    FROM project_assignments pa
    JOIN company_members m ON m.id = pa.member_id
    JOIN profiles pr ON pr.id = m.profile_id
    WHERE pa.project_id = p_project_id
      AND pa.is_deleted = false
      AND m.is_deleted = false
      AND pr.is_deleted = false
      AND pr.role = 'subcontractor'
  );
$$;

COMMENT ON FUNCTION chat_sub_thread_exists(uuid) IS
  'ND-25: does this project have at least one assigned subcontractor WITH a '
  'profile, i.e. should a sub thread render at all? Answered before any '
  'chat_threads row exists, because threads are created lazily. SECURITY '
  'DEFINER so a crew reader gets the same answer as an Owner; gated by '
  'can_view_project() so it answers only for projects the caller can see.';
