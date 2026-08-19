-- ============================================================================
-- M9 — THE CLIENT WRITE SURFACE (S164)
-- ============================================================================
--
-- `9-spec.md` §7. Three writes, and only three: signing a change order (R10/
-- R13), adding a photo with a note (R11), and asking a question (R11). Nothing
-- else in the portal writes anything.
--
-- ----------------------------------------------------------------------------
-- 1 — R11 IS A THREAD, SO IT REUSES THE THREAD THAT EXISTS
-- ----------------------------------------------------------------------------
-- §7.2: *"Photo and note stay tied together — one unit, not two records …
-- Owner/Admin/PM can respond directly. It is a **thread, not a drop box**."*
--
-- `chat_threads` / `chat_messages` / `chat_message_photos` is already that
-- shape, down to the detail that decides it: **one message with N photos
-- attached**, which is precisely "one unit, not two records". A new
-- `client_messages` table would be a second implementation of a thread — the
-- CLAUDE.md PARITY failure, *"a second implementation that 'does the same
-- thing' IS the divergence, written in a form that looks like agreement."*
--
-- So this adds a THIRD `kind` alongside `crew` and `sub`.
--
-- ----------------------------------------------------------------------------
-- 2 — ⚠️ AND ADDING A KIND SILENTLY WIDENS THE TWO THAT EXIST. READ THIS.
-- ----------------------------------------------------------------------------
-- Every existing chat SELECT policy is shaped:
--
--     ... AND can_view_project(t.project_id)
--         AND (t.kind = 'sub' OR get_my_role() IS DISTINCT FROM 'subcontractor')
--
-- That predicate was written when `kind` had exactly two values. It says "if it
-- is not the sub thread, anyone who is not a subcontractor may read it" —
-- which, the moment a third kind exists, **admits FOREMAN and CREW to the
-- client's private conversation with the office**, on every assigned project,
-- with nothing failing and no policy edited.
--
-- R11 names who may respond: **Owner, Admin and PM. Not Foreman.** So the fix
-- is a RESTRICTIVE gate rather than a rewrite of the three permissive policies:
--
--   * RESTRICTIVE ANDs with the whole permissive set, so `kind = 'client'` is
--     closed to everyone the gate does not name — including any policy added
--     later by someone who has not read this comment.
--   * The `crew` and `sub` paths are untouched **by construction**: the gate is
--     `kind <> 'client' OR ...`, so it is vacuously true for them. Rewriting the
--     three existing policies to handle a third case would have put M6M's chat
--     behaviour at risk for a Module 9 feature.
--
-- ----------------------------------------------------------------------------
-- 3 — R11: HER PHOTOS ARE CLIENT-VISIBLE BY THE CONSTRAINT, NOT BY THE CALLER
-- ----------------------------------------------------------------------------
-- §6: *"Client-added photos are automatically client-visible (R11) — no tick
-- required on her own uploads."*
--
-- Written into the WITH CHECK as `client_visible = true` rather than defaulted
-- in the service. `files.client_visible` is `NOT NULL DEFAULT false`, so a
-- client upload that forgot to set it would insert a photo SHE COULD NOT THEN
-- READ — she would post a picture into a thread and see a blank. The policy
-- refuses that row instead of storing it.
--
-- ⚠️ `category = 'photos'` is likewise a CHECK and not a suggestion. The file
-- categories `contracts`, `change_orders` and `invoices` are documents the
-- COMPANY issues; a client able to insert into them could file a "contract"
-- into her own project.
--
-- ----------------------------------------------------------------------------
-- 4 — R10/Q6: ONE WRITE PATH, DISTINGUISHABLE CALLERS
-- ----------------------------------------------------------------------------
-- Josh, S164 Q6: *"`completeCoSignature` takes a caller-context parameter: an
-- authenticated portal session and an anonymous token holder are materially
-- different evidence, and `signer_ip`, `signer_user_agent` and the consent
-- record must be able to say which."*
--
-- Two columns, because the evidence has two halves — **how** she signed, and
-- **who was signed in** while she did:
--
--   `signer_channel`     'token_link' | 'portal_session'
--   `signer_profile_id`  the authenticated profile, NULL on the token path
--
-- ⚠️ A CHECK TIES THEM TOGETHER, so the pair cannot record a contradiction: a
-- portal signature without a profile, or a token signature carrying one, are
-- both refused. That matters because this row IS the binding record — §7.1 —
-- and "who signed" is the question it exists to answer.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The third thread kind.
-- ----------------------------------------------------------------------------
ALTER TABLE chat_threads DROP CONSTRAINT IF EXISTS chat_threads_kind_check;
ALTER TABLE chat_threads ADD CONSTRAINT chat_threads_kind_check
  CHECK (kind = ANY (ARRAY['crew', 'sub', 'client']));

COMMENT ON COLUMN chat_threads.kind IS
  'crew | sub | client. `client` added by M9 R11 [S164] — the client''s photos, '
  'notes and questions, and the office''s replies. ⚠️ Adding a fourth kind '
  'requires re-reading §2 of 20261021000000: the pre-existing SELECT policies '
  'admit any non-subcontractor to any kind that is not `sub`.';

-- ----------------------------------------------------------------------------
-- 2. The RESTRICTIVE gate. See header §2 — this is the load-bearing half.
-- ----------------------------------------------------------------------------
-- Who may be in a client thread AT ALL: the office (owner/admin/PM) and the
-- client herself. Foreman, crew and subcontractor are out.
CREATE OR REPLACE FUNCTION public.may_enter_client_thread()
RETURNS boolean
LANGUAGE sql
STABLE
AS $fn$
  SELECT get_my_role() = ANY (ARRAY['owner', 'admin', 'project_manager', 'client']);
$fn$;

COMMENT ON FUNCTION public.may_enter_client_thread() IS
  'M9 R11 [S164]: the audience of a `client` chat thread. Owner/Admin/PM per '
  'R11 ("Owner/Admin/PM can respond directly"), plus the client. Foreman is '
  'excluded BY THE RULING, not by omission — R11 names the notification '
  'audience as Owner, Admin and PM, "not Foreman".';

DROP POLICY IF EXISTS chat_threads_client_kind_gate ON chat_threads;
CREATE POLICY chat_threads_client_kind_gate ON chat_threads
  AS RESTRICTIVE FOR ALL USING (
    kind <> 'client' OR may_enter_client_thread()
  ) WITH CHECK (
    kind <> 'client' OR may_enter_client_thread()
  );

DROP POLICY IF EXISTS chat_messages_client_kind_gate ON chat_messages;
CREATE POLICY chat_messages_client_kind_gate ON chat_messages
  AS RESTRICTIVE FOR ALL USING (
    NOT EXISTS (
      SELECT 1 FROM chat_threads t
      WHERE t.id = chat_messages.thread_id AND t.kind = 'client'
    )
    OR may_enter_client_thread()
  ) WITH CHECK (
    NOT EXISTS (
      SELECT 1 FROM chat_threads t
      WHERE t.id = chat_messages.thread_id AND t.kind = 'client'
    )
    OR may_enter_client_thread()
  );

-- ⚠️ The two child tables need the gate too. They are pure containment on
-- `chat_messages` — the §3.3 shape — so they follow whatever the parent allows,
-- and the parent's own permissive policy is the one §2 describes as too wide.
DROP POLICY IF EXISTS chat_message_photos_client_kind_gate ON chat_message_photos;
CREATE POLICY chat_message_photos_client_kind_gate ON chat_message_photos
  AS RESTRICTIVE FOR ALL USING (
    NOT EXISTS (
      SELECT 1 FROM chat_messages m
      JOIN chat_threads t ON t.id = m.thread_id
      WHERE m.id = chat_message_photos.message_id AND t.kind = 'client'
    )
    OR may_enter_client_thread()
  ) WITH CHECK (
    NOT EXISTS (
      SELECT 1 FROM chat_messages m
      JOIN chat_threads t ON t.id = m.thread_id
      WHERE m.id = chat_message_photos.message_id AND t.kind = 'client'
    )
    OR may_enter_client_thread()
  );

DROP POLICY IF EXISTS chat_message_mentions_client_kind_gate ON chat_message_mentions;
CREATE POLICY chat_message_mentions_client_kind_gate ON chat_message_mentions
  AS RESTRICTIVE FOR ALL USING (
    NOT EXISTS (
      SELECT 1 FROM chat_messages m
      JOIN chat_threads t ON t.id = m.thread_id
      WHERE m.id = chat_message_mentions.message_id AND t.kind = 'client'
    )
    OR may_enter_client_thread()
  ) WITH CHECK (
    NOT EXISTS (
      SELECT 1 FROM chat_messages m
      JOIN chat_threads t ON t.id = m.thread_id
      WHERE m.id = chat_message_mentions.message_id AND t.kind = 'client'
    )
    OR may_enter_client_thread()
  );

-- ----------------------------------------------------------------------------
-- 3. The client's own arms on the thread.
-- ----------------------------------------------------------------------------
-- ⚠️ SHE MAY CREATE THE THREAD, and that is not an oversight. `resolveThread()`
-- creates lazily on first use; a client who could read a thread but not open
-- one would find R11 unavailable on every project where nobody from the office
-- had spoken first — which is most of them, at the point she has a question.
DROP POLICY IF EXISTS chat_threads_select_client ON chat_threads;
CREATE POLICY chat_threads_select_client ON chat_threads
  FOR SELECT USING (
    company_id = my_company_id_flat()
    AND kind = 'client'
    AND is_client_of_project(project_id)
    AND client_has_full_access()
  );

DROP POLICY IF EXISTS chat_threads_insert_client ON chat_threads;
CREATE POLICY chat_threads_insert_client ON chat_threads
  FOR INSERT WITH CHECK (
    company_id = my_company_id_flat()
    AND kind = 'client'
    AND is_client_of_project(project_id)
    AND client_has_full_access()
  );

DROP POLICY IF EXISTS chat_messages_select_client ON chat_messages;
CREATE POLICY chat_messages_select_client ON chat_messages
  FOR SELECT USING (
    company_id = my_company_id_flat()
    AND EXISTS (
      SELECT 1 FROM chat_threads t
      WHERE t.id = chat_messages.thread_id
        AND t.kind = 'client'
        AND is_client_of_project(t.project_id)
    )
    AND client_has_full_access()
  );

DROP POLICY IF EXISTS chat_messages_insert_client ON chat_messages;
CREATE POLICY chat_messages_insert_client ON chat_messages
  FOR INSERT WITH CHECK (
    company_id = my_company_id_flat()
    -- Same clause the existing policy uses, and for the same reason: a message
    -- attributed to somebody else is refused by the database rather than
    -- silently mis-attributed.
    AND author_profile_id = get_my_profile_id()
    AND EXISTS (
      SELECT 1 FROM chat_threads t
      WHERE t.id = chat_messages.thread_id
        AND t.kind = 'client'
        AND is_client_of_project(t.project_id)
    )
    AND client_has_full_access()
  );

DROP POLICY IF EXISTS chat_message_photos_select_client ON chat_message_photos;
CREATE POLICY chat_message_photos_select_client ON chat_message_photos
  FOR SELECT USING (
    company_id = my_company_id_flat()
    AND EXISTS (
      SELECT 1 FROM chat_messages m
      JOIN chat_threads t ON t.id = m.thread_id
      WHERE m.id = chat_message_photos.message_id
        AND t.kind = 'client'
        AND is_client_of_project(t.project_id)
    )
    AND client_has_full_access()
  );

DROP POLICY IF EXISTS chat_message_photos_insert_client ON chat_message_photos;
CREATE POLICY chat_message_photos_insert_client ON chat_message_photos
  FOR INSERT WITH CHECK (
    company_id = my_company_id_flat()
    -- Her OWN message only — the clause that stops anyone hanging a photo off
    -- somebody else's note.
    AND EXISTS (
      SELECT 1 FROM chat_messages m
      WHERE m.id = chat_message_photos.message_id
        AND m.author_profile_id = get_my_profile_id()
    )
    AND client_has_full_access()
  );

-- ----------------------------------------------------------------------------
-- 4. Her photo upload. Header §3.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS files_insert_client ON files;
CREATE POLICY files_insert_client ON files
  FOR INSERT WITH CHECK (
    company_id = my_company_id_flat()
    AND get_my_role() = 'client'
    AND project_id IS NOT NULL
    AND is_client_of_project(project_id)
    AND client_has_full_access()
    -- R11, enforced rather than defaulted. See header §3.
    AND client_visible = true
    AND category = 'photos'
  );

-- The object behind the row. Mirrors `project_files_insert_non_client`'s shape
-- — folder[1] is the company, folder[2] is the project — but resolves the
-- project through `is_client_of_project()` rather than `project_assignments`,
-- because a client has no member row and therefore no assignment, by ruling.
DROP POLICY IF EXISTS project_files_insert_client ON storage.objects;
CREATE POLICY project_files_insert_client ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'project-files'
    AND (storage.foldername(name))[1] = (
      SELECT (profiles.company_id)::text
      FROM profiles
      WHERE profiles.user_id = auth.uid() AND profiles.is_deleted = false
    )
    AND get_my_role() = 'client'
    AND CASE
          WHEN (storage.foldername(name))[2] ~*
               '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            THEN is_client_of_project(((storage.foldername(objects.name))[2])::uuid)
          ELSE false
        END
  );

-- ----------------------------------------------------------------------------
-- 5. R10 / Q6 — the signing evidence says which caller produced it.
-- ----------------------------------------------------------------------------
ALTER TABLE co_signing_sessions
  ADD COLUMN IF NOT EXISTS signer_channel text,
  ADD COLUMN IF NOT EXISTS signer_profile_id uuid REFERENCES profiles(id);

ALTER TABLE co_signing_sessions DROP CONSTRAINT IF EXISTS co_signing_sessions_channel_shape;
ALTER TABLE co_signing_sessions ADD CONSTRAINT co_signing_sessions_channel_shape
  CHECK (
    -- Unsigned sessions carry neither. Both are written at completion.
    (signer_channel IS NULL AND signer_profile_id IS NULL)
    -- An anonymous token holder: no authenticated profile, by definition.
    OR (signer_channel = 'token_link' AND signer_profile_id IS NULL)
    -- A portal signature: there IS one, and it must be recorded.
    OR (signer_channel = 'portal_session' AND signer_profile_id IS NOT NULL)
  );

COMMENT ON COLUMN co_signing_sessions.signer_channel IS
  'M9 R10 [Josh, S164 Q6]: WHICH surface produced this signature — '
  '''token_link'' (the emailed /sign-co/[token] page, no session) or '
  '''portal_session'' (an authenticated client in the portal). ONE write path, '
  'distinguishable callers: signer_ip and signer_user_agent mean different '
  'things on the two, and this row is the binding record.';

COMMENT ON COLUMN co_signing_sessions.signer_profile_id IS
  'M9 R10 [Josh, S164 Q6]: the authenticated profile that signed, on the portal '
  'path. NULL on the token path and CHECK-enforced both ways, so the pair can '
  'never record a portal signature with nobody signed in.';

CREATE INDEX IF NOT EXISTS idx_co_signing_sessions_signer_profile_id
  ON co_signing_sessions (signer_profile_id);
