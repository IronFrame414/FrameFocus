-- ============================================================================
-- CHAT — ND-34's switcher: thread ordering + per-thread unread, in ONE query.
-- Spec: chat-spec.md §7.1a-i, §4.4 (on `spec/chat-s124` @ 4b61b9d).
-- ============================================================================
--
-- ============================================================================
-- WHY THIS IS AN RPC AND NOT TWO POSTGREST CALLS — THE N+1 THE SPEC WARNED OF
-- ============================================================================
-- §7.1a-i names both of these as NEW work and says they should be "one query,
-- not a loop". The loop is easy to fall into and the payload trap behind it is
-- less obvious, so both are written down:
--
--   THE LOOP: "for each thread, count messages newer than my last_read_at" is
--   one round trip per thread. Ten projects with two threads each is twenty
--   requests every time the switcher opens.
--
--   THE TRAP THAT LOOKS LIKE THE FIX: fetching messages in bulk and counting in
--   JavaScript cannot express a PER-THREAD cutoff through PostgREST — each
--   thread has its own watermark. The nearest expressible query is "everything
--   newer than my OLDEST watermark across all threads", which is bounded by
--   whichever thread the user has ignored longest. On a busy job that is
--   thousands of rows transferred to count a number.
--
-- A SECURITY INVOKER function does the per-thread cutoff in SQL and returns one
-- small row per thread. 52 functions in this schema already; SECURITY INVOKER
-- has direct precedent (20260721020000_6a2_week_approval_fn.sql).
--
-- ============================================================================
-- SECURITY INVOKER IS LOAD-BEARING, NOT A DEFAULT LEFT ALONE
-- ============================================================================
-- The body reads chat_threads, chat_messages, chat_reads and projects. Under
-- INVOKER every one of those is filtered by the caller's own RLS, so:
--
--   · a subcontractor gets no crew-thread rows here, for the same reason they
--     get none anywhere else (ND-19);
--   · `projects_select_visible` restricts the list to projects they can see;
--   · `chat_reads_select_own` means the watermark joined below is theirs.
--
-- SECURITY DEFINER would silently return every thread in the company and the
-- switcher would become the one place the access model does not apply.

CREATE OR REPLACE FUNCTION chat_switcher_threads()
RETURNS TABLE (
  project_id      uuid,
  project_name    text,
  thread_id       uuid,
  kind            text,
  last_message_at timestamptz,
  unread_count    integer
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  SELECT
    p.id,
    p.name,
    t.id,
    t.kind,
    lm.last_at,
    COALESCE(uc.cnt, 0)::int
  FROM chat_threads t
  JOIN projects p ON p.id = t.project_id
  -- ND-34: ACTIVE projects only. An archived job's thread is reached through
  -- the tab, not the switcher — the messages do not vanish (R2), the project
  -- simply stops being one tap away.
  AND p.status = 'active'
  AND p.is_deleted = false
  LEFT JOIN chat_reads r
    ON r.thread_id = t.id
   AND r.profile_id = get_my_profile_id()
  LEFT JOIN LATERAL (
    SELECT max(m.created_at) AS last_at
    FROM chat_messages m
    WHERE m.thread_id = t.id
  ) lm ON true
  LEFT JOIN LATERAL (
    SELECT count(*) AS cnt
    FROM chat_messages m
    WHERE m.thread_id = t.id
      -- No read row yet means everything is unread, which is what a thread you
      -- have never opened should say.
      AND (r.last_read_at IS NULL OR m.created_at > r.last_read_at)
      -- ⚠️ YOUR OWN MESSAGES ARE NEVER UNREAD. Without this every message you
      -- send lights your own badge until you re-open the thread you just typed
      -- into — which trains people to ignore the badge, the same failure A-N44
      -- guards against at zero.
      AND m.author_profile_id IS DISTINCT FROM get_my_profile_id()
  ) uc ON true
  ORDER BY
    -- Ordered by the PROJECT's most recent activity, not the thread's, so a
    -- project's two threads stay together in the list instead of interleaving
    -- with other projects.
    max(lm.last_at) OVER (PARTITION BY p.id) DESC NULLS LAST,
    p.name,
    t.kind;
$$;

COMMENT ON FUNCTION chat_switcher_threads() IS
  'ND-34: active projects the caller can see, their chat threads, each thread''s '
  'last message time and the caller''s unread count. One round trip. SECURITY '
  'INVOKER so RLS decides what is returned.';
