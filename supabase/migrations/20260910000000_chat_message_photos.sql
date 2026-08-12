-- ============================================================================
-- CHAT slice 6 — chat_message_photos (ND-22, ND-28).
-- Spec: chat-spec.md §4.3, §5.4, §4.5a. Deferred out of slice 1 on purpose:
-- its FK and CASCADE are only exercised here.
-- ============================================================================
--
-- A JOIN TABLE, NOT A COLUMN. A message may reference more than one photo
-- (trace 3b references two), and it carries NO file column and NO storage path
-- — chat holds a reference to a row the gallery already owns.
--
-- ----------------------------------------------------------------------------
-- THERE IS NO `photos` TABLE — §S4, answered by live read at S124
-- ----------------------------------------------------------------------------
-- _Superseded shape, quoted not rewritten: `photo_id → photos(id)`._ Photos are
-- `files` rows with `category = 'photos'` and a `project_id`, so the FK points
-- at `files(id)`.
--
-- ⚠️ AN FK CANNOT ENFORCE `category = 'photos'`, AND THIS MIGRATION DOES NOT
-- PRETEND OTHERWISE. `files` holds receipts, contracts, invoices and
-- change-order PDFs alongside photos, so `file_id → files(id)` permits a chat
-- message to reference any of them. The restriction is a SERVICE-LAYER check —
-- in chat's send path and in the picker's query — and A-C17c is its only
-- backstop. Same posture CLAUDE.md records for punch VERIFY (#146) and the
-- project gate (#82): a rule with no database enforcement, said out loud.
--
-- ----------------------------------------------------------------------------
-- ON DELETE CASCADE, AND THE DELETION IS GENUINELY DESTRUCTIVE
-- ----------------------------------------------------------------------------
-- `files-client.ts:286` soft-deletes, but `:334` HARD-deletes the row after
-- removing the storage blob (owner/admin by RLS). So a chat message can outlive
-- its photo's row entirely, not merely a flagged one. Under CASCADE the
-- reference vanishes and THE MESSAGE KEEPS ITS TEXT (A-C17b).
--
-- `RESTRICT` was considered and rejected [S124, Josh]: it would let a chat
-- message block an owner from deleting a file, and nothing else in the app can
-- do that.
--
-- ⚠️ §4.5a — CASCADE DELETES THROUGH THE FK, WHICH IS WHY A TABLE WITH NO
-- DELETE POLICY IS COMPATIBLE WITH IT. Referential actions are performed by the
-- system, not by the caller, so they are not subject to RLS. This migration
-- therefore ships SELECT and INSERT only, exactly like chat_message_mentions —
-- and s126-chat-photos.live.ts PROVES the cascade rather than assuming it.

CREATE TABLE chat_message_photos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id),
  message_id  uuid NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  file_id     uuid NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz DEFAULT now(),

  -- One photo cannot be attached to one message twice. The composer
  -- de-duplicates first; this is the guarantee.
  UNIQUE (message_id, file_id)
);

-- Per-tenant default so a client-side INSERT passes RLS without the caller
-- setting company_id itself (CLAUDE.md's column-defaults checklist). The
-- append-only columns — updated_at, created_by, updated_by, is_deleted,
-- deleted_at — are deliberately ABSENT: rows are written once with the message
-- and never edited, the same posture as chat_message_mentions.
ALTER TABLE chat_message_photos ALTER COLUMN company_id SET DEFAULT get_my_company_id();

CREATE INDEX idx_chat_message_photos_message_id ON chat_message_photos(message_id);
CREATE INDEX idx_chat_message_photos_file_id ON chat_message_photos(file_id);

ALTER TABLE chat_message_photos ENABLE ROW LEVEL SECURITY;

-- Visible exactly when the MESSAGE is visible. Restating the message's own
-- predicate here rather than joining to a view keeps it identical in shape to
-- chat_message_mentions_select_visible — including ND-19's subcontractor
-- exclusion, so a sub cannot enumerate the photos on a crew-thread message any
-- more than they can read the message.
CREATE POLICY chat_message_photos_select_visible ON chat_message_photos
  FOR SELECT USING (
    company_id = get_my_company_id()
    AND EXISTS (
      SELECT 1
      FROM chat_messages m
      JOIN chat_threads t ON t.id = m.thread_id
      WHERE m.id = chat_message_photos.message_id
        AND can_view_project(t.project_id)
        AND (t.kind = 'sub' OR get_my_role() IS DISTINCT FROM 'subcontractor')
    )
  );

-- Only the message's own author may attach to it. This is what stops a third
-- party bolting a photo onto somebody else's message — the same reasoning
-- chat_message_mentions_insert_author carries for mentions.
CREATE POLICY chat_message_photos_insert_author ON chat_message_photos
  FOR INSERT WITH CHECK (
    company_id = get_my_company_id()
    AND EXISTS (
      SELECT 1
      FROM chat_messages m
      WHERE m.id = chat_message_photos.message_id
        AND m.author_profile_id = get_my_profile_id()
    )
  );

-- NO UPDATE POLICY AND NO DELETE POLICY — §4.5a. Both commands are denied to
-- every role. A reference is written once and removed only by the CASCADE above
-- when its file or its message goes.

COMMENT ON TABLE chat_message_photos IS
  'ND-22/ND-28: chat messages reference existing files rows (category=photos); '
  'chat never ingests a file. FK cannot enforce the category — that is a '
  'service-layer rule with A-C17c as its only backstop. CASCADE from both '
  'parents; no UPDATE or DELETE policy (spec §4.5a).';
