-- ============================================================================
-- CHAT — slice 1. Schema and RLS.
-- Spec: docs/specs/chat-spec.md §4, §5.2, §S1 (on branch spec/chat-s124 @ 4b61b9d;
-- NOT on this branch — see docs/sessions/S126-progress.md).
-- ============================================================================
--
-- Four tables: chat_threads, chat_messages, chat_message_mentions, chat_reads.
-- chat_message_photos is slice 6 (ND-22/ND-28) and is deliberately absent.
--
-- ============================================================================
-- ⚠️ THE ONE POLICY THAT CARRIES THE FEATURE: THE SUBCONTRACTOR EXCLUSION
-- ============================================================================
-- ND-19 exists for exactly one reason — a subcontractor must never read crew
-- conversation. The spec's §5.2 originally said the crew thread is gated by
-- `can_view_project()`, "the parent's rule, unchanged".
--
-- THAT HELPER DOES NOT DELIVER IT, and this was verified against live schema
-- again before writing this file rather than taken from a report:
--
--   is_assigned_to_project(uuid) is ROLE-BLIND. Its entire body is
--     EXISTS (SELECT 1 FROM project_assignments
--             WHERE project_id = $1 AND member_id = get_my_member_id()
--               AND is_deleted = false)
--   — no role test anywhere. And subcontractors ARE in project_assignments:
--   josh+qa-sub@worthprop.com is assigned to 'test' and 'QA A — isolation
--   fixture', both live.
--
-- So an assigned subcontractor PASSES can_view_project(), and a crew thread
-- gated on that helper alone is readable by precisely the role §5.2 marks
-- "never". Every other criterion in the spec would still pass.
--
-- The fix is the clause `punch_list_items_select_visible` already opens with:
--     get_my_role() IS DISTINCT FROM 'subcontractor'
-- It appears below on chat_threads SELECT and INSERT, and is inherited by
-- chat_messages and chat_message_mentions through their EXISTS on the thread.
--
-- ============================================================================
-- `kind` IS A CHECK, NOT AN ENUM — house precedent over the spec's wording
-- ============================================================================
-- The spec writes `kind ENUM('crew','sub')`. This database has **zero** native
-- enum types in `public` and **139** CHECK constraints; `projects.status` and
-- `files.category` are both CHECKs. A native enum would be the first, and it
-- would be the one type in the schema that needs ALTER TYPE to extend.
-- Following the house.
--
-- ============================================================================
-- APPEND-ONLY, AND WHICH TABLES IT ACTUALLY COVERS
-- ============================================================================
-- CLAUDE.md's exception: omit updated_at, created_by, updated_by, is_deleted,
-- deleted_at; keep id, company_id, created_at; NO UPDATE or DELETE policies.
--
--   chat_messages           append-only  (R2 — the log is permanent)
--   chat_message_mentions   append-only  (written once with its message)
--   chat_threads            ORDINARY — standard set, both triggers
--   chat_reads              ORDINARY — last_read_at is UPDATEd on every open
--
-- chat_reads is emphatically NOT append-only. It is the one chat table with an
-- UPDATE policy, and the one that needs both BEFORE UPDATE triggers.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. chat_threads
-- ---------------------------------------------------------------------------
CREATE TABLE chat_threads (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('crew', 'sub')),
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  created_by  UUID REFERENCES auth.users(id),
  updated_by  UUID REFERENCES auth.users(id),
  is_deleted  BOOLEAN DEFAULT false,
  deleted_at  TIMESTAMPTZ,
  -- One crew thread and one sub thread per project. This is what makes a
  -- thread addressable before anyone has spoken (ND-25) and what chat_reads
  -- keys against.
  UNIQUE (project_id, kind)
);

ALTER TABLE chat_threads ALTER COLUMN company_id SET DEFAULT get_my_company_id();
ALTER TABLE chat_threads ALTER COLUMN created_by SET DEFAULT auth.uid();
ALTER TABLE chat_threads ALTER COLUMN updated_by SET DEFAULT auth.uid();

CREATE INDEX idx_chat_threads_company_id ON chat_threads(company_id);
CREATE INDEX idx_chat_threads_project_id ON chat_threads(project_id);

ALTER TABLE chat_threads ENABLE ROW LEVEL SECURITY;

-- A sub thread is visible to everyone who can view the project — crew READ it
-- (ND-20) — plus the assigned sub. A crew thread is visible to the same set
-- MINUS subcontractors. One predicate expresses both.
CREATE POLICY chat_threads_select_visible ON chat_threads
  FOR SELECT USING (
    company_id = get_my_company_id()
    AND can_view_project(project_id)
    AND (kind = 'sub' OR get_my_role() IS DISTINCT FROM 'subcontractor')
  );

-- Threads are created lazily on first open or first message (§4.1), by whoever
-- reaches them — so creation carries the same predicate as reading. A
-- subcontractor cannot bring a crew thread into existence.
CREATE POLICY chat_threads_insert_visible ON chat_threads
  FOR INSERT WITH CHECK (
    company_id = get_my_company_id()
    AND can_view_project(project_id)
    AND (kind = 'sub' OR get_my_role() IS DISTINCT FROM 'subcontractor')
  );

-- NO UPDATE and NO DELETE policy: a thread is never edited and never removed.
-- The two triggers below are therefore inert today. They are installed anyway
-- because CLAUDE.md requires them on every per-tenant table and because a
-- table that later gains an UPDATE path must not also need a migration to
-- start tracking who did it.
CREATE TRIGGER chat_threads_updated_at
  BEFORE UPDATE ON chat_threads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE FUNCTION set_chat_threads_updated_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER chat_threads_set_updated_by
  BEFORE UPDATE ON chat_threads
  FOR EACH ROW EXECUTE FUNCTION set_chat_threads_updated_by();

-- ---------------------------------------------------------------------------
-- 2. chat_messages — APPEND-ONLY
-- ---------------------------------------------------------------------------
CREATE TABLE chat_messages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES companies(id),
  thread_id         UUID NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  author_profile_id UUID NOT NULL REFERENCES profiles(id),
  body              TEXT NOT NULL,
  created_at        TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE chat_messages ALTER COLUMN company_id SET DEFAULT get_my_company_id();

CREATE INDEX idx_chat_messages_company_id ON chat_messages(company_id);
-- The poll's index (ND-26): "messages in this thread newer than X", which is
-- the ONLY read shape the transport uses. A thread-only index would still
-- scan the thread's whole history on every 12-second poll.
CREATE INDEX idx_chat_messages_thread_id_created_at
  ON chat_messages(thread_id, created_at);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Visibility is the thread's visibility, inherited whole — including the
-- subcontractor exclusion on crew threads.
CREATE POLICY chat_messages_select_visible ON chat_messages
  FOR SELECT USING (
    company_id = get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM chat_threads t
      WHERE t.id = chat_messages.thread_id
        AND can_view_project(t.project_id)
        AND (t.kind = 'sub' OR get_my_role() IS DISTINCT FROM 'subcontractor')
    )
  );

-- ⚠️ POSTING IS NARROWER THAN READING, AND THAT DIVERGENCE IS THE POINT (§S1).
-- Crew thread: anyone who can view the project, except a subcontractor.
-- Sub thread: Owner, Admin, the project's assigned PM, and that project's
-- assigned subs — NOT foreman, NOT crew, who read it with no composer (ND-20).
--
-- Shape follows live precedent rather than invention: inspections/phases/tasks
-- are read-wide/write-narrow with a role list AND can_view_project(); the
-- subcontractor branch mirrors punch_list_items_select_visible.
CREATE POLICY chat_messages_insert_authorized ON chat_messages
  FOR INSERT WITH CHECK (
    company_id = get_my_company_id()
    -- You may only post as yourself. Precedent: daily_logs_insert_authorized's
    -- `author_member_id = get_my_member_id()`. Without it a member could write
    -- a message attributed to anyone in the company.
    AND author_profile_id = get_my_profile_id()
    AND EXISTS (
      SELECT 1 FROM chat_threads t
      WHERE t.id = chat_messages.thread_id
        AND (
          (t.kind = 'crew'
            AND get_my_role() IS DISTINCT FROM 'subcontractor'
            AND can_view_project(t.project_id))
          OR
          (t.kind = 'sub' AND (
                get_my_role() = ANY (ARRAY['owner', 'admin'])
             OR (get_my_role() = 'project_manager' AND is_assigned_to_project(t.project_id))
             OR (get_my_role() = 'subcontractor'   AND is_assigned_to_project(t.project_id))
          ))
        )
    )
  );

-- NO UPDATE, NO DELETE. R2 — the chat log is permanent, and edit/delete are
-- out of scope precisely so that permanence is not quietly negotiable.

-- ---------------------------------------------------------------------------
-- 3. chat_message_mentions — APPEND-ONLY (ND-39)
-- ---------------------------------------------------------------------------
CREATE TABLE chat_message_mentions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           UUID NOT NULL REFERENCES companies(id),
  message_id           UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  mentioned_profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at           TIMESTAMPTZ DEFAULT now(),
  -- ⚠️ THIS CONSTRAINT *IS* A-C14. "@Josh … @Josh" in one message writes ONE
  -- row, enforced by the database rather than by the parser remembering to
  -- de-duplicate. A parser-side dedupe passes the same test until the day
  -- someone changes the parser.
  UNIQUE (message_id, mentioned_profile_id)
);

ALTER TABLE chat_message_mentions ALTER COLUMN company_id SET DEFAULT get_my_company_id();

CREATE INDEX idx_chat_message_mentions_company_id ON chat_message_mentions(company_id);
CREATE INDEX idx_chat_message_mentions_message_id ON chat_message_mentions(message_id);
-- "mentions of me" (§4.3a's stated future read) without a schema change.
CREATE INDEX idx_chat_message_mentions_mentioned_profile_id
  ON chat_message_mentions(mentioned_profile_id);

ALTER TABLE chat_message_mentions ENABLE ROW LEVEL SECURITY;

-- Visible exactly where its message is visible. The nested EXISTS carries the
-- thread's subcontractor exclusion through two levels.
CREATE POLICY chat_message_mentions_select_visible ON chat_message_mentions
  FOR SELECT USING (
    company_id = get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM chat_messages m
      JOIN chat_threads t ON t.id = m.thread_id
      WHERE m.id = chat_message_mentions.message_id
        AND can_view_project(t.project_id)
        AND (t.kind = 'sub' OR get_my_role() IS DISTINCT FROM 'subcontractor')
    )
  );

-- Only the message's own author writes its mentions, and only as part of
-- writing the message. This is what stops a third party attaching a mention to
-- somebody else's message to make it notify.
CREATE POLICY chat_message_mentions_insert_author ON chat_message_mentions
  FOR INSERT WITH CHECK (
    company_id = get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM chat_messages m
      WHERE m.id = chat_message_mentions.message_id
        AND m.author_profile_id = get_my_profile_id()
    )
  );

-- NO UPDATE, NO DELETE — append-only, same as its message.

-- ---------------------------------------------------------------------------
-- 4. chat_reads — ORDINARY TABLE. NOT append-only.
-- ---------------------------------------------------------------------------
CREATE TABLE chat_reads (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id),
  profile_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  thread_id     UUID NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  last_read_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  created_by    UUID REFERENCES auth.users(id),
  updated_by    UUID REFERENCES auth.users(id),
  is_deleted    BOOLEAN DEFAULT false,
  deleted_at    TIMESTAMPTZ,
  -- Unread is per person PER THREAD (§4.4) — reading the crew thread must
  -- leave the sub thread unread. A project-keyed row cannot express that.
  UNIQUE (profile_id, thread_id)
);

ALTER TABLE chat_reads ALTER COLUMN company_id SET DEFAULT get_my_company_id();
ALTER TABLE chat_reads ALTER COLUMN created_by SET DEFAULT auth.uid();
ALTER TABLE chat_reads ALTER COLUMN updated_by SET DEFAULT auth.uid();

CREATE INDEX idx_chat_reads_company_id ON chat_reads(company_id);
CREATE INDEX idx_chat_reads_profile_id ON chat_reads(profile_id);
CREATE INDEX idx_chat_reads_thread_id ON chat_reads(thread_id);

ALTER TABLE chat_reads ENABLE ROW LEVEL SECURITY;

-- Your own read state, and nobody else's. There is no reason for one member to
-- see when another last read a thread, and read receipts are explicitly out of
-- scope (§2.3) — a company-wide SELECT here would build them by accident.
CREATE POLICY chat_reads_select_own ON chat_reads
  FOR SELECT USING (
    company_id = get_my_company_id() AND profile_id = get_my_profile_id()
  );

CREATE POLICY chat_reads_insert_own ON chat_reads
  FOR INSERT WITH CHECK (
    company_id = get_my_company_id() AND profile_id = get_my_profile_id()
  );

-- THE ONE UPDATE POLICY IN THIS MIGRATION. last_read_at advances on every
-- thread open; both USING and WITH CHECK are scoped so a row cannot be moved
-- to another profile on the way through.
CREATE POLICY chat_reads_update_own ON chat_reads
  FOR UPDATE
  USING (company_id = get_my_company_id() AND profile_id = get_my_profile_id())
  WITH CHECK (company_id = get_my_company_id() AND profile_id = get_my_profile_id());

CREATE TRIGGER chat_reads_updated_at
  BEFORE UPDATE ON chat_reads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE FUNCTION set_chat_reads_updated_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER chat_reads_set_updated_by
  BEFORE UPDATE ON chat_reads
  FOR EACH ROW EXECUTE FUNCTION set_chat_reads_updated_by();

-- ---------------------------------------------------------------------------
-- 5. email_types — the `mention` row (ND-42)
-- ---------------------------------------------------------------------------
-- email_logs carries a FOREIGN KEY to email_types, so a mention email log
-- INSERT fails on the FK until this row exists. The send path is slice 4; the
-- registry row is here because schema precedes the path that uses it.
INSERT INTO email_types (email_type) VALUES ('mention')
  ON CONFLICT (email_type) DO NOTHING;
