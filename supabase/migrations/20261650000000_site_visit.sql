-- S108 Spec A — SITE VISIT: a site visit IS an estimate, in a status before
-- `draft`, recorded on a phone by ANY internal role — and a foreman or crew
-- member who records one never receives a money column, before or after it
-- becomes an estimate. [RULED Josh, S108; ASK-A1..A8, Q3, voice ruling]
--
-- ============================================================================
-- ⚠️ THE FLOOR, AND HOW THIS MIGRATION MEETS IT
-- ============================================================================
-- RLS is row-level: a role that can SELECT an `estimates` row receives all 67
-- columns, four of them NOT NULL money totals (FILL-A1). So foreman and crew
-- are granted NOTHING on `estimates` — not SELECT, not INSERT — now or ever
-- (ASK-A1 → A). Instead:
--   · they CREATE and EDIT a visit only through SECURITY DEFINER RPCs that
--     return ids and write only money-free columns;
--   · everything they capture — conditions, scope, measurements, blockers,
--     voice transcripts — lives in money-free `site_visit_*` tables keyed by
--     estimate_id (ASK-A2 → A), which they may READ where created_by is them.
-- The estimate row is therefore never exposed to them, before or after
-- promotion. Photos are `files` rows reached only through the estimate-files
-- route, whose floor becomes "did you record this visit" (Q3 → A).
--
-- ⚠️ NO CONSTRAINT HERE PAIRS status WITH estimate_number. That is the exact
-- shape of the reverted 20261610000000 and it is deferred until Josh has run
-- the production count (Spec E, query A2). Every change below is a widening, a
-- DROP NOT NULL, or a new object — none can abort on existing data.

-- ----------------------------------------------------------------------------
-- 1. `site_visit` is a status (widening; governs no existing row)
-- ----------------------------------------------------------------------------
ALTER TABLE public.estimates DROP CONSTRAINT estimates_status_check;
ALTER TABLE public.estimates ADD CONSTRAINT estimates_status_check
  CHECK (status IN ('site_visit', 'draft', 'review', 'sent', 'viewed', 'accepted',
                    'declined', 'expired', 'converted', 'voided'));

-- ----------------------------------------------------------------------------
-- 2. The number is assigned at PROMOTION, not creation (RULED)
-- ----------------------------------------------------------------------------
-- next_estimate_number() increments companies.estimate_number_sequence, so a
-- visit created the ordinary way would burn a client-visible number and an
-- abandoned visit would leave a gap. The DEFAULT stays — the ordinary create
-- path is unchanged — and create_site_visit() passes NULL explicitly.
-- Dropping NOT NULL cannot fail on existing data.
ALTER TABLE public.estimates ALTER COLUMN estimate_number DROP NOT NULL;

-- ----------------------------------------------------------------------------
-- 3. enforce_estimate_immutability — a site visit is EDITABLE, and becomes a
--    draft exactly once. ⚠️ FOUND AT BUILD, missed by FILL-A2's reader table.
-- ----------------------------------------------------------------------------
-- The trigger treats every status except draft/review as a SENT document:
-- any column change outside the allowlist raises, and any transition INTO
-- draft raises. Unamended, a site visit could not be edited and PROMOTION
-- (site_visit → draft) would be refused as "a sent estimate cannot be returned
-- to draft". Body verbatim from 20261330000000 plus the two S108 arms, marked.
CREATE OR REPLACE FUNCTION public.enforce_estimate_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  permitted CONSTANT text[] := ARRAY[
    'status', 'viewed_at', 'accepted_at', 'declined_at', 'reminder_count',
    'last_reminder_sent_at', 'client_unsubscribed_at', 'signed_proposal_file_id',
    'decline_reason_code', 'decline_reason_notes', 'lost_reason_code',
    'void_reason', 'voided_by', 'voided_at', 'project_id',
    'is_deleted', 'deleted_at', 'updated_at', 'updated_by',
    -- [S103] internal bookkeeping — editable on a sent estimate (the client
    -- never sees these; the DOCUMENT is what freezes).
    'internal_notes', 'reminder_schedule', 'include_client_contract', 'projected_value'
  ];
BEGIN
  -- [S108 Spec A] Nothing ENTERS site_visit from another status: a visit is
  -- born one (create_site_visit) and leaves exactly once, to draft.
  IF NEW.status = 'site_visit' AND OLD.status <> 'site_visit' THEN
    RAISE EXCEPTION 'An estimate cannot be turned back into a site visit.';
  END IF;

  -- [S108 Spec A] A site visit is fully editable (it has no document yet), and
  -- its only exit is PROMOTION to draft — never straight to sent, accepted, …
  IF OLD.status = 'site_visit' THEN
    IF NEW.status NOT IN ('site_visit', 'draft') THEN
      RAISE EXCEPTION 'A site visit becomes a draft estimate first (status: %).', NEW.status;
    END IF;
    RETURN NEW;
  END IF;

  -- Draft/review is fully editable; the draft/review -> sent transition itself
  -- runs through here (OLD.status is still draft/review at that moment).
  IF OLD.status = 'draft' OR OLD.status = 'review' THEN
    RETURN NEW;
  END IF;

  -- ALLOWLIST. Strip the permitted keys from both row images and compare what is
  -- left: any change to any other column — including one added after this was
  -- written — freezes the write.
  IF (to_jsonb(NEW) - permitted) IS DISTINCT FROM (to_jsonb(OLD) - permitted) THEN
    RAISE EXCEPTION 'A sent estimate is immutable — void and reissue instead.';
  END IF;

  -- No going back to draft/review (this is what closed #4-s174).
  IF NEW.status = 'draft' OR NEW.status = 'review' THEN
    RAISE EXCEPTION 'A sent estimate cannot be returned to draft — void it and reissue instead.';
  END IF;

  -- The void record, once written, is as frozen as the document.
  IF OLD.voided_at IS NOT NULL
     AND (NEW.void_reason IS DISTINCT FROM OLD.void_reason
          OR NEW.voided_by  IS DISTINCT FROM OLD.voided_by
          OR NEW.voided_at  IS DISTINCT FROM OLD.voided_at) THEN
    RAISE EXCEPTION 'A void record cannot be rewritten.';
  END IF;

  -- A voided estimate is frozen forever and never returns to life.
  IF OLD.status = 'voided' AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'A voided estimate is frozen forever.';
  END IF;

  -- Signature / decision stamps, once set, cannot be rewritten (unchanged arms).
  IF OLD.accepted_at IS NOT NULL AND NEW.accepted_at IS DISTINCT FROM OLD.accepted_at THEN
    RAISE EXCEPTION 'A signature stamp cannot be rewritten.';
  END IF;
  IF OLD.signed_proposal_file_id IS NOT NULL
     AND NEW.signed_proposal_file_id IS DISTINCT FROM OLD.signed_proposal_file_id THEN
    RAISE EXCEPTION 'A signature stamp cannot be rewritten.';
  END IF;
  IF OLD.accepted_at IS NULL AND NEW.accepted_at IS NOT NULL AND NEW.status <> 'accepted' THEN
    RAISE EXCEPTION 'An estimate cannot carry an acceptance date without being accepted.';
  END IF;
  IF OLD.declined_at IS NOT NULL AND NEW.declined_at IS DISTINCT FROM OLD.declined_at THEN
    RAISE EXCEPTION 'A decline record cannot be rewritten.';
  END IF;
  IF OLD.declined_at IS NOT NULL
     AND (NEW.decline_reason_code  IS DISTINCT FROM OLD.decline_reason_code
       OR NEW.decline_reason_notes IS DISTINCT FROM OLD.decline_reason_notes
       OR NEW.lost_reason_code     IS DISTINCT FROM OLD.lost_reason_code) THEN
    RAISE EXCEPTION 'A decline record cannot be rewritten.';
  END IF;
  IF OLD.declined_at IS NULL AND NEW.declined_at IS NOT NULL AND NEW.status <> 'declined' THEN
    RAISE EXCEPTION 'An estimate cannot carry a decline date without being declined.';
  END IF;

  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. The money-free side tables (ASK-A2 → A). Per-tenant checklist: the three
--    column defaults and the two BEFORE UPDATE triggers, in THIS migration.
-- ----------------------------------------------------------------------------
-- ⚠️ NO MONEY COLUMN MAY EVER BE ADDED TO ANY site_visit_* TABLE. Their SELECT
-- policies admit the RECORDER (a foreman or crew member), which is the whole
-- reason they exist; a money column here would ship to exactly the roles the
-- Floor withholds it from. s108-site-visit.live.ts asserts the column sets.

-- 4a. site_visits — one row per visit; the recorder's own handle on it.
CREATE TABLE public.site_visits (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid NOT NULL REFERENCES public.companies(id),
  estimate_id        uuid NOT NULL UNIQUE REFERENCES public.estimates(id) ON DELETE CASCADE,
  title              text NOT NULL CHECK (btrim(title) <> ''),
  -- Snapshots of what the RECORDER chose. The estimate row holds the live
  -- values; these let the recorder see who/where without reading that row.
  contact_id         uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  contact_address_id uuid REFERENCES public.contact_addresses(id) ON DELETE SET NULL,
  visited_at         timestamptz NOT NULL DEFAULT now(),
  promoted_at        timestamptz,
  promoted_by        uuid REFERENCES auth.users(id),
  created_at         timestamptz DEFAULT now(),
  updated_at         timestamptz DEFAULT now(),
  created_by         uuid REFERENCES auth.users(id),
  updated_by         uuid REFERENCES auth.users(id),
  is_deleted         boolean DEFAULT false,
  deleted_at         timestamptz
);
CREATE INDEX idx_site_visits_company_id ON public.site_visits (company_id);
CREATE INDEX idx_site_visits_created_by ON public.site_visits (created_by);

-- 4b. site_visit_notes — conditions, scope and blockers, SEPARATE by kind.
--     "Tile is cracked" is a condition; "demo tile, install LVP" is scope.
--     A blocker is a checkable item with a resolved flag (ASK-A6 → A).
CREATE TABLE public.site_visit_notes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id),
  estimate_id uuid NOT NULL REFERENCES public.estimates(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('condition', 'scope', 'blocker')),
  body        text NOT NULL CHECK (btrim(body) <> ''),
  resolved    boolean NOT NULL DEFAULT false,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id),
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  created_by  uuid REFERENCES auth.users(id),
  updated_by  uuid REFERENCES auth.users(id),
  is_deleted  boolean DEFAULT false,
  deleted_at  timestamptz,
  CONSTRAINT site_visit_notes_resolved_blocker_only CHECK (kind = 'blocker' OR resolved = false)
);
CREATE INDEX idx_site_visit_notes_estimate_id ON public.site_visit_notes (estimate_id);
CREATE INDEX idx_site_visit_notes_company_id ON public.site_visit_notes (company_id);

-- 4c. site_visit_measurements — STRUCTURED (ASK-A5 → A): area, L × W, and the
--     square feet computed by the database, so it feeds Spec B's sq-ft unit.
CREATE TABLE public.site_visit_measurements (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id),
  estimate_id uuid NOT NULL REFERENCES public.estimates(id) ON DELETE CASCADE,
  area_name   text NOT NULL CHECK (btrim(area_name) <> ''),
  length_ft   numeric(10,2) NOT NULL CHECK (length_ft > 0),
  width_ft    numeric(10,2) NOT NULL CHECK (width_ft > 0),
  square_feet numeric(14,2) GENERATED ALWAYS AS (round(length_ft * width_ft, 2)) STORED,
  notes       text,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  created_by  uuid REFERENCES auth.users(id),
  updated_by  uuid REFERENCES auth.users(id),
  is_deleted  boolean DEFAULT false,
  deleted_at  timestamptz
);
CREATE INDEX idx_site_visit_measurements_estimate_id ON public.site_visit_measurements (estimate_id);
CREATE INDEX idx_site_visit_measurements_company_id ON public.site_visit_measurements (company_id);

-- 4d. site_visit_voice_notes — audio AND transcript both kept (voice ruling).
--     The audio is a `files` row that nothing ever rewrites. `transcript_machine`
--     is what the model returned and is never edited; `transcript` is the
--     editable copy. The 10-minute cap is enforced BEFORE upload on the phone
--     and again here.
CREATE TABLE public.site_visit_voice_notes (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid NOT NULL REFERENCES public.companies(id),
  estimate_id           uuid NOT NULL REFERENCES public.estimates(id) ON DELETE CASCADE,
  file_id               uuid REFERENCES public.files(id) ON DELETE SET NULL,
  duration_seconds      numeric(6,1) NOT NULL CHECK (duration_seconds > 0 AND duration_seconds <= 600),
  transcript_status     text NOT NULL DEFAULT 'pending'
                          CHECK (transcript_status IN ('pending', 'done', 'failed')),
  transcript_machine    text,
  transcript            text,
  transcript_language   text,
  transcript_model      text,
  transcript_error      text,
  transcribed_at        timestamptz,
  transcript_edited_at  timestamptz,
  transcript_edited_by  uuid REFERENCES auth.users(id),
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now(),
  created_by            uuid REFERENCES auth.users(id),
  updated_by            uuid REFERENCES auth.users(id),
  is_deleted            boolean DEFAULT false,
  deleted_at            timestamptz
);
CREATE INDEX idx_site_visit_voice_notes_estimate_id ON public.site_visit_voice_notes (estimate_id);
CREATE INDEX idx_site_visit_voice_notes_company_id ON public.site_visit_voice_notes (company_id);

-- Defaults + triggers, one block per table (CLAUDE.md per-tenant checklist).
DO $blk$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['site_visits', 'site_visit_notes', 'site_visit_measurements', 'site_visit_voice_notes'] LOOP
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN company_id SET DEFAULT get_my_company_id()', t);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN created_by SET DEFAULT auth.uid()', t);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN updated_by SET DEFAULT auth.uid()', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION update_updated_at()',
                   t || '_updated_at', t);
  END LOOP;
END
$blk$;

CREATE OR REPLACE FUNCTION public.set_site_visits_updated_by()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_by = auth.uid(); RETURN NEW; END; $$ LANGUAGE plpgsql SECURITY DEFINER;
CREATE TRIGGER site_visits_set_updated_by BEFORE UPDATE ON public.site_visits
  FOR EACH ROW EXECUTE FUNCTION public.set_site_visits_updated_by();

CREATE OR REPLACE FUNCTION public.set_site_visit_notes_updated_by()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_by = auth.uid(); RETURN NEW; END; $$ LANGUAGE plpgsql SECURITY DEFINER;
CREATE TRIGGER site_visit_notes_set_updated_by BEFORE UPDATE ON public.site_visit_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_site_visit_notes_updated_by();

CREATE OR REPLACE FUNCTION public.set_site_visit_measurements_updated_by()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_by = auth.uid(); RETURN NEW; END; $$ LANGUAGE plpgsql SECURITY DEFINER;
CREATE TRIGGER site_visit_measurements_set_updated_by BEFORE UPDATE ON public.site_visit_measurements
  FOR EACH ROW EXECUTE FUNCTION public.set_site_visit_measurements_updated_by();

CREATE OR REPLACE FUNCTION public.set_site_visit_voice_notes_updated_by()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_by = auth.uid(); RETURN NEW; END; $$ LANGUAGE plpgsql SECURITY DEFINER;
CREATE TRIGGER site_visit_voice_notes_set_updated_by BEFORE UPDATE ON public.site_visit_voice_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_site_visit_voice_notes_updated_by();

-- ----------------------------------------------------------------------------
-- 5. RLS — READ only. Every write goes through the RPCs below (ASK-A8: "via
--    the RPC only — never through a SELECT grant"), so there are NO
--    INSERT / UPDATE / DELETE policies on any site_visit_* table.
-- ----------------------------------------------------------------------------
-- Office (owner/admin/PM) reads every visit in the company. Anyone else reads
-- only the rows THEY created — the recorder's READ, which survives promotion
-- (RULED) because it keys on created_by, not on the estimate's status.
-- Subcontractor and client: nothing (they never create one).
CREATE POLICY site_visits_select_scoped ON public.site_visits FOR SELECT
  USING (company_id = get_my_company_id()
         AND (get_my_role() = ANY (ARRAY['owner','admin','project_manager'])
              OR (get_my_role() = ANY (ARRAY['foreman','crew_member']) AND created_by = auth.uid())));
CREATE POLICY site_visit_notes_select_scoped ON public.site_visit_notes FOR SELECT
  USING (company_id = get_my_company_id()
         AND (get_my_role() = ANY (ARRAY['owner','admin','project_manager'])
              OR (get_my_role() = ANY (ARRAY['foreman','crew_member']) AND created_by = auth.uid())));
CREATE POLICY site_visit_measurements_select_scoped ON public.site_visit_measurements FOR SELECT
  USING (company_id = get_my_company_id()
         AND (get_my_role() = ANY (ARRAY['owner','admin','project_manager'])
              OR (get_my_role() = ANY (ARRAY['foreman','crew_member']) AND created_by = auth.uid())));
CREATE POLICY site_visit_voice_notes_select_scoped ON public.site_visit_voice_notes FOR SELECT
  USING (company_id = get_my_company_id()
         AND (get_my_role() = ANY (ARRAY['owner','admin','project_manager'])
              OR (get_my_role() = ANY (ARRAY['foreman','crew_member']) AND created_by = auth.uid())));

-- ----------------------------------------------------------------------------
-- 6. ai_transcription_logs — APPEND-ONLY cost log (Module 3H rule: a row on
--    success AND failure; the RESOLVED model, never the alias).
-- ----------------------------------------------------------------------------
CREATE TABLE public.ai_transcription_logs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid NOT NULL REFERENCES public.companies(id),
  -- SET NULL, not CASCADE: the cost record outlives the note (CLAUDE.md).
  voice_note_id      uuid REFERENCES public.site_visit_voice_notes(id) ON DELETE SET NULL,
  model              text NOT NULL,
  audio_seconds      numeric(8,1),
  estimated_cost_usd numeric(10,6),
  success            boolean NOT NULL,
  error_message      text,
  created_at         timestamptz DEFAULT now()
);
CREATE INDEX idx_ai_transcription_logs_company_id ON public.ai_transcription_logs (company_id);
ALTER TABLE public.ai_transcription_logs ENABLE ROW LEVEL SECURITY;
-- Same shape as ai_tag_logs: Owner/Admin read; written only by the service role.
CREATE POLICY ai_transcription_logs_select_owner_admin ON public.ai_transcription_logs FOR SELECT
  USING (company_id = get_my_company_id() AND get_my_role() = ANY (ARRAY['owner','admin']));

-- ----------------------------------------------------------------------------
-- 7. The access rule, in ONE place. SQL SECURITY DEFINER (CLAUDE.md: SQL, not
--    plpgsql, where the RLS bypass matters).
-- ----------------------------------------------------------------------------
-- Returns 'office' | 'recorder' | NULL for the caller on one visit:
--   office   — owner / admin / PM in the visit's company (any visit, any time);
--   recorder — the foreman or crew member who recorded it, ONLY while the
--              estimate is still a site visit and not abandoned (Q3 cond. 1:
--              after promotion the recorder keeps READ — through the SELECT
--              policies above — and LOSES every write).
CREATE OR REPLACE FUNCTION public.site_visit_access(p_estimate_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT CASE
    WHEN get_my_role() = ANY (ARRAY['owner','admin','project_manager']) THEN 'office'
    WHEN get_my_role() = ANY (ARRAY['foreman','crew_member'])
         AND sv.created_by = auth.uid()
         AND e.status = 'site_visit'
         AND NOT coalesce(sv.is_deleted, false)
         AND NOT coalesce(e.is_deleted, false) THEN 'recorder'
    ELSE NULL
  END
  FROM estimates e
  JOIN site_visits sv ON sv.estimate_id = e.id
  WHERE e.id = p_estimate_id
    AND e.company_id = get_my_company_id();
$fn$;

-- ----------------------------------------------------------------------------
-- 8. The RPCs. Every one: SECURITY DEFINER, pinned search_path, EXECUTE revoked
--    from public/anon and granted to authenticated. They return ids / numbers
--    only — never an estimates row.
-- ----------------------------------------------------------------------------

-- 8a. create_site_visit — any INTERNAL role (owner, admin, PM, foreman, crew).
--     Contact and address may be existing or new; creating them here means NO
--     widening of contacts_insert_authorized (FILL-A10).
CREATE OR REPLACE FUNCTION public.create_site_visit(
  p_title text,
  p_contact_id uuid DEFAULT NULL,
  p_contact_address_id uuid DEFAULT NULL,
  p_new_contact jsonb DEFAULT NULL,
  p_new_address jsonb DEFAULT NULL,
  p_visited_at timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_company uuid := get_my_company_id();
  v_role    text := get_my_role();
  v_uid     uuid := auth.uid();
  v_contact uuid;
  v_address uuid;
  v_estimate uuid;
BEGIN
  IF v_uid IS NULL OR v_company IS NULL
     OR v_role IS NULL OR NOT (v_role = ANY (ARRAY['owner','admin','project_manager','foreman','crew_member'])) THEN
    RAISE EXCEPTION 'Only company staff can record a site visit.' USING ERRCODE = '42501';
  END IF;
  IF p_title IS NULL OR btrim(p_title) = '' THEN
    RAISE EXCEPTION 'A site visit needs a name.' USING ERRCODE = '22023';
  END IF;

  IF p_contact_id IS NOT NULL THEN
    SELECT id INTO v_contact FROM contacts
     WHERE id = p_contact_id AND company_id = v_company AND NOT coalesce(is_deleted, false);
    IF v_contact IS NULL THEN
      RAISE EXCEPTION 'That contact was not found.' USING ERRCODE = '22023';
    END IF;
  ELSIF p_new_contact IS NOT NULL THEN
    IF btrim(coalesce(p_new_contact->>'first_name', '')) = ''
       OR btrim(coalesce(p_new_contact->>'last_name', '')) = '' THEN
      RAISE EXCEPTION 'A new contact needs a first and last name.' USING ERRCODE = '22023';
    END IF;
    INSERT INTO contacts (company_id, first_name, last_name, phone, email, contact_type, created_by, updated_by)
    VALUES (v_company, btrim(p_new_contact->>'first_name'), btrim(p_new_contact->>'last_name'),
            nullif(btrim(p_new_contact->>'phone'), ''), nullif(btrim(p_new_contact->>'email'), ''),
            'lead', v_uid, v_uid)
    RETURNING id INTO v_contact;
  ELSE
    RAISE EXCEPTION 'Choose a contact or add a new one.' USING ERRCODE = '22023';
  END IF;

  IF p_contact_address_id IS NOT NULL THEN
    SELECT id INTO v_address FROM contact_addresses
     WHERE id = p_contact_address_id AND contact_id = v_contact AND company_id = v_company
       AND NOT coalesce(is_deleted, false);
    IF v_address IS NULL THEN
      RAISE EXCEPTION 'That address does not belong to that contact.' USING ERRCODE = '22023';
    END IF;
  ELSIF p_new_address IS NOT NULL THEN
    IF btrim(coalesce(p_new_address->>'address_line1', '')) = ''
       OR btrim(coalesce(p_new_address->>'city', '')) = ''
       OR btrim(coalesce(p_new_address->>'state', '')) = ''
       OR btrim(coalesce(p_new_address->>'zip', '')) = '' THEN
      RAISE EXCEPTION 'A new address needs street, city, state and ZIP.' USING ERRCODE = '22023';
    END IF;
    INSERT INTO contact_addresses (company_id, contact_id, address_line1, address_line2, city, state, zip,
                                   is_primary, created_by, updated_by)
    VALUES (v_company, v_contact, btrim(p_new_address->>'address_line1'),
            nullif(btrim(p_new_address->>'address_line2'), ''), btrim(p_new_address->>'city'),
            btrim(p_new_address->>'state'), btrim(p_new_address->>'zip'),
            NOT EXISTS (SELECT 1 FROM contact_addresses a WHERE a.contact_id = v_contact
                          AND a.is_primary AND NOT coalesce(a.is_deleted, false)),
            v_uid, v_uid)
    RETURNING id INTO v_address;
  END IF;

  -- ⚠️ estimate_number => NULL explicitly: the default would burn a number.
  INSERT INTO estimates (company_id, contact_id, contact_address_id, name, status, estimate_number,
                         created_by, updated_by)
  VALUES (v_company, v_contact, v_address, btrim(p_title), 'site_visit', NULL, v_uid, v_uid)
  RETURNING id INTO v_estimate;

  INSERT INTO site_visits (company_id, estimate_id, title, contact_id, contact_address_id, visited_at,
                           created_by, updated_by)
  VALUES (v_company, v_estimate, btrim(p_title), v_contact, v_address, coalesce(p_visited_at, now()),
          v_uid, v_uid);

  RETURN v_estimate;
END;
$fn$;

-- 8b. update_site_visit — the header (name, when, who, where), pre-promotion.
CREATE OR REPLACE FUNCTION public.update_site_visit(
  p_estimate_id uuid,
  p_title text,
  p_visited_at timestamptz DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_access text := site_visit_access(p_estimate_id);
  v_status text;
BEGIN
  IF v_access IS NULL THEN
    RAISE EXCEPTION 'You cannot edit this site visit.' USING ERRCODE = '42501';
  END IF;
  SELECT status INTO v_status FROM estimates WHERE id = p_estimate_id;
  IF v_status <> 'site_visit' THEN
    RAISE EXCEPTION 'This visit is already an estimate; edit it there.' USING ERRCODE = '42501';
  END IF;
  IF p_title IS NULL OR btrim(p_title) = '' THEN
    RAISE EXCEPTION 'A site visit needs a name.' USING ERRCODE = '22023';
  END IF;
  UPDATE site_visits SET title = btrim(p_title), visited_at = coalesce(p_visited_at, visited_at)
   WHERE estimate_id = p_estimate_id;
  UPDATE estimates SET name = btrim(p_title) WHERE id = p_estimate_id;
END;
$fn$;

-- 8c. save_site_visit_note — add (p_note_id NULL) or edit a condition / scope /
--     blocker. A recorder edits only their own notes, only pre-promotion.
CREATE OR REPLACE FUNCTION public.save_site_visit_note(
  p_estimate_id uuid,
  p_note_id uuid,
  p_kind text,
  p_body text,
  p_resolved boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_access  text := site_visit_access(p_estimate_id);
  v_company uuid := get_my_company_id();
  v_id      uuid;
  v_resolved boolean := coalesce(p_resolved, false) AND p_kind = 'blocker';
BEGIN
  IF v_access IS NULL THEN
    RAISE EXCEPTION 'You cannot edit this site visit.' USING ERRCODE = '42501';
  END IF;
  IF p_note_id IS NULL THEN
    INSERT INTO site_visit_notes (company_id, estimate_id, kind, body, resolved, resolved_at, resolved_by,
                                  sort_order, created_by, updated_by)
    VALUES (v_company, p_estimate_id, p_kind, btrim(coalesce(p_body, '')), v_resolved,
            CASE WHEN v_resolved THEN now() END, CASE WHEN v_resolved THEN auth.uid() END,
            (SELECT coalesce(max(sort_order), 0) + 1 FROM site_visit_notes WHERE estimate_id = p_estimate_id),
            auth.uid(), auth.uid())
    RETURNING id INTO v_id;
    RETURN v_id;
  END IF;

  UPDATE site_visit_notes n
     SET kind = p_kind,
         body = btrim(coalesce(p_body, '')),
         resolved = v_resolved,
         resolved_at = CASE WHEN v_resolved AND NOT n.resolved THEN now()
                            WHEN v_resolved THEN n.resolved_at END,
         resolved_by = CASE WHEN v_resolved AND NOT n.resolved THEN auth.uid()
                            WHEN v_resolved THEN n.resolved_by END
   WHERE n.id = p_note_id
     AND n.estimate_id = p_estimate_id
     AND NOT coalesce(n.is_deleted, false)
     AND (v_access = 'office' OR n.created_by = auth.uid())
  RETURNING n.id INTO v_id;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'That note was not found on this visit, or is not yours to edit.' USING ERRCODE = '42501';
  END IF;
  RETURN v_id;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.delete_site_visit_note(p_note_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_estimate uuid;
  v_access   text;
  v_n        integer;
BEGIN
  SELECT estimate_id INTO v_estimate FROM site_visit_notes WHERE id = p_note_id;
  v_access := site_visit_access(v_estimate);
  IF v_access IS NULL THEN
    RAISE EXCEPTION 'You cannot edit this site visit.' USING ERRCODE = '42501';
  END IF;
  UPDATE site_visit_notes SET is_deleted = true, deleted_at = now()
   WHERE id = p_note_id AND (v_access = 'office' OR created_by = auth.uid());
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN
    RAISE EXCEPTION 'That note is not yours to remove.' USING ERRCODE = '42501';
  END IF;
END;
$fn$;

-- 8d. save_site_visit_measurement / delete_site_visit_measurement.
CREATE OR REPLACE FUNCTION public.save_site_visit_measurement(
  p_estimate_id uuid,
  p_measurement_id uuid,
  p_area_name text,
  p_length_ft numeric,
  p_width_ft numeric,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_access  text := site_visit_access(p_estimate_id);
  v_company uuid := get_my_company_id();
  v_id      uuid;
BEGIN
  IF v_access IS NULL THEN
    RAISE EXCEPTION 'You cannot edit this site visit.' USING ERRCODE = '42501';
  END IF;
  IF p_measurement_id IS NULL THEN
    INSERT INTO site_visit_measurements (company_id, estimate_id, area_name, length_ft, width_ft, notes,
                                         sort_order, created_by, updated_by)
    VALUES (v_company, p_estimate_id, btrim(coalesce(p_area_name, '')), p_length_ft, p_width_ft,
            nullif(btrim(coalesce(p_notes, '')), ''),
            (SELECT coalesce(max(sort_order), 0) + 1 FROM site_visit_measurements WHERE estimate_id = p_estimate_id),
            auth.uid(), auth.uid())
    RETURNING id INTO v_id;
    RETURN v_id;
  END IF;
  UPDATE site_visit_measurements m
     SET area_name = btrim(coalesce(p_area_name, '')), length_ft = p_length_ft, width_ft = p_width_ft,
         notes = nullif(btrim(coalesce(p_notes, '')), '')
   WHERE m.id = p_measurement_id AND m.estimate_id = p_estimate_id
     AND NOT coalesce(m.is_deleted, false)
     AND (v_access = 'office' OR m.created_by = auth.uid())
  RETURNING m.id INTO v_id;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'That measurement was not found on this visit, or is not yours to edit.' USING ERRCODE = '42501';
  END IF;
  RETURN v_id;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.delete_site_visit_measurement(p_measurement_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_estimate uuid;
  v_access   text;
  v_n        integer;
BEGIN
  SELECT estimate_id INTO v_estimate FROM site_visit_measurements WHERE id = p_measurement_id;
  v_access := site_visit_access(v_estimate);
  IF v_access IS NULL THEN
    RAISE EXCEPTION 'You cannot edit this site visit.' USING ERRCODE = '42501';
  END IF;
  UPDATE site_visit_measurements SET is_deleted = true, deleted_at = now()
   WHERE id = p_measurement_id AND (v_access = 'office' OR created_by = auth.uid());
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN
    RAISE EXCEPTION 'That measurement is not yours to remove.' USING ERRCODE = '42501';
  END IF;
END;
$fn$;

-- 8e. edit a transcript. The RECORDER until promotion; OWNER/ADMIN/PM after
--     (and before). transcript_machine and the audio are never touched.
CREATE OR REPLACE FUNCTION public.update_voice_note_transcript(p_voice_note_id uuid, p_transcript text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_estimate uuid;
  v_access   text;
  v_n        integer;
BEGIN
  SELECT estimate_id INTO v_estimate FROM site_visit_voice_notes
   WHERE id = p_voice_note_id AND NOT coalesce(is_deleted, false);
  v_access := site_visit_access(v_estimate);
  IF v_access IS NULL THEN
    RAISE EXCEPTION 'You cannot edit this transcript.' USING ERRCODE = '42501';
  END IF;
  UPDATE site_visit_voice_notes
     SET transcript = p_transcript, transcript_edited_at = now(), transcript_edited_by = auth.uid()
   WHERE id = p_voice_note_id AND (v_access = 'office' OR created_by = auth.uid());
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN
    RAISE EXCEPTION 'That transcript is not yours to edit.' USING ERRCODE = '42501';
  END IF;
END;
$fn$;

-- 8f. promote_site_visit — OWNER / ADMIN / PM only (ASK-A3). Assigns the number
--     NOW, seeds the company pricing defaults exactly as the ordinary create
--     path does (createEstimate()), and hands authorship to the promoter so a
--     PM can edit the draft they just made (estimates_update_manager is
--     "PM own draft"). The recorder stays on site_visits.created_by.
CREATE OR REPLACE FUNCTION public.promote_site_visit(p_estimate_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_role    text := get_my_role();
  v_company uuid := get_my_company_id();
  v_est     estimates%ROWTYPE;
  v_co      companies%ROWTYPE;
  v_number  text;
BEGIN
  IF v_role IS NULL OR NOT (v_role = ANY (ARRAY['owner','admin','project_manager'])) THEN
    RAISE EXCEPTION 'Only an Owner, Admin or Project Manager can turn a site visit into an estimate.'
      USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_est FROM estimates WHERE id = p_estimate_id AND company_id = v_company FOR UPDATE;
  IF NOT FOUND OR coalesce(v_est.is_deleted, false) THEN
    RAISE EXCEPTION 'Site visit not found.' USING ERRCODE = '42501';
  END IF;
  IF v_est.status <> 'site_visit' THEN
    RAISE EXCEPTION 'This is already an estimate (status: %).', v_est.status USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_co FROM companies WHERE id = v_company;
  v_number := next_estimate_number();

  UPDATE estimates SET
    status = 'draft',
    estimate_number = v_number,
    created_by = auth.uid(),
    created_by_role = v_role,
    pricing_mode = coalesce(v_co.default_pricing_mode, pricing_mode),
    tax_rate = v_co.default_tax_rate,
    subcontractor_markup_percent = CASE WHEN v_co.default_pricing_mode = 'margin'
      THEN v_co.default_subcontractor_margin_percent ELSE v_co.default_subcontractor_markup_percent END,
    material_markup_percent = CASE WHEN v_co.default_pricing_mode = 'margin'
      THEN v_co.default_material_margin_percent ELSE v_co.default_material_markup_percent END,
    labor_markup_percent = CASE WHEN v_co.default_pricing_mode = 'margin'
      THEN v_co.default_labor_margin_percent ELSE v_co.default_labor_markup_percent END,
    terms_sections = v_co.default_terms_sections,
    expiration_days = coalesce(v_co.default_expiration_days, expiration_days),
    proposal_pricing_level = coalesce(v_co.default_proposal_pricing_level, proposal_pricing_level)
  WHERE id = p_estimate_id;

  UPDATE site_visits SET promoted_at = now(), promoted_by = auth.uid() WHERE estimate_id = p_estimate_id;
  RETURN v_number;
END;
$fn$;

-- 8g. abandon_site_visit — SOFT delete (ASK-A7 → A). It never had a number, so
--     nothing is orphaned; it leaves every list and stays recoverable.
CREATE OR REPLACE FUNCTION public.abandon_site_visit(p_estimate_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_access text := site_visit_access(p_estimate_id);
  v_status text;
BEGIN
  IF v_access IS NULL THEN
    RAISE EXCEPTION 'You cannot abandon this site visit.' USING ERRCODE = '42501';
  END IF;
  SELECT status INTO v_status FROM estimates WHERE id = p_estimate_id;
  IF v_status <> 'site_visit' THEN
    RAISE EXCEPTION 'Only a site visit can be abandoned; this is already an estimate.' USING ERRCODE = '22023';
  END IF;
  UPDATE estimates SET is_deleted = true, deleted_at = now() WHERE id = p_estimate_id;
  UPDATE site_visits SET is_deleted = true, deleted_at = now() WHERE estimate_id = p_estimate_id;
END;
$fn$;

DO $grants$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'site_visit_access(uuid)',
    'create_site_visit(text, uuid, uuid, jsonb, jsonb, timestamptz)',
    'update_site_visit(uuid, text, timestamptz)',
    'save_site_visit_note(uuid, uuid, text, text, boolean)',
    'delete_site_visit_note(uuid)',
    'save_site_visit_measurement(uuid, uuid, text, numeric, numeric, text)',
    'delete_site_visit_measurement(uuid)',
    'update_voice_note_transcript(uuid, text)',
    'promote_site_visit(uuid)',
    'abandon_site_visit(uuid)'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM public', f);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', f);
  END LOOP;
END
$grants$;

-- ----------------------------------------------------------------------------
-- 9. The office is told (ASK-A4 → A): in-app + push, NOT emailed — so no
--    email_types row and no second CHECK widening.
-- ----------------------------------------------------------------------------
ALTER TABLE public.notifications DROP CONSTRAINT notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('mention', 'assignment', 'incident', 'signed', 'reminders_exhausted',
                  'discrepancy', 'timesheet_ready', 'daily_log_missing', 'still_clocked_in',
                  'contract_signed', 'punch_assigned', 'low_stock', 'trial_warning',
                  'selection_approved', 'selection_denied', 'po_item_missing', 'qb_sync_blocked',
                  'schema_drift', 'site_visit_recorded'));
