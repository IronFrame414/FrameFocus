-- S110 Section A — SITE-VISIT ACCESS, REWRITTEN. [RULED Josh, 2026-09-23;
-- Phase 2 Q1–Q4, 2026-09-23/24]
--
--   1. Read and edit widen to ANY internal employee (owner, admin, PM, foreman,
--      crew) on ANY site visit in their company. Never subcontractors, never
--      clients. [Q1 → A]
--   2. The lock is at SEND, not at promotion. [ruling 2]
--   3. The lock covers only the material that EXISTED at the moment of send.
--      ADDING stays open at every status, for any internal employee. [ruling 3,
--      Q2 → A] A post-send addition freezes when the estimate reaches its
--      OUTCOME — accepted, declined, expired, voided; `viewed` does not count.
--      [Q3 → B] A transcription pending at send MAY complete afterwards. [Q3]
--   4. Site-visit PHOTOS are marked: files.site_visit_capture. Foreman and crew
--      read ONLY marked files, never an estimate's other PDFs — the Financial
--      Visibility Floor. [Q4 → A]
--
-- ============================================================================
-- SUPERSEDED, QUOTED RATHER THAN DELETED
-- ============================================================================
-- 20261690000000 (S108 ruling 3): "site_visit_access() drops the office arm past
--   draft/review … a BEFORE INSERT/UPDATE trigger … refuses any write to a sent
--   estimate's record — INCLUDING the service-role client … UNRESOLVED BLOCKERS
--   AFTER SEND: frozen as they stand — an open blocker stays open, on the
--   record, permanently."  → Narrowed: only rows that EXISTED at send are frozen.
-- 20261650000000 (S108 ASK-A8 / Q3 cond. 1): "recorder — the foreman or crew
--   member who recorded it, ONLY while the estimate is still a site visit …
--   after promotion the recorder keeps READ … and LOSES every write." → Gone:
--   promotion changes nothing about who may write.
-- 20261650000000 §5: "Office (owner/admin/PM) reads every visit in the company.
--   Anyone else reads only the rows THEY created." → Every internal employee
--   reads every visit in the company.
--
-- ============================================================================
-- ⚠️ THE FREEZE IS KEYED ON site_visits.frozen_at, NEVER ON estimates.sent_at
-- ============================================================================
-- Measured at S110 Phase 1 (FILLED-A.1): 14 of 21 estimates past review on
-- rebuild-test carry NO sent_at — `enforce_estimate_immutability` lets draft go
-- straight to accepted, and signing-service writes it. A sent_at cutoff would
-- treat every one of those as never sent. [Josh, S110: "A zero result on today's
-- tiny dataset is not evidence the cutoff is safe; it is evidence the dataset is
-- small."] So the DATABASE stamps frozen_at on the status TRANSITION itself,
-- whoever writes it.
--
-- ============================================================================
-- PRODUCTION ROWS GOVERNED [Josh ran them, 2026-09-23]
-- ============================================================================
-- No CHECK, no NOT NULL without a default: nothing here can abort on existing
-- rows. Backfills, with the production counts measured before this shipped:
--   · site_visits.frozen_at on visits whose estimate is already past review —
--     FILL-A.8 query 1: 0 visits (0 notes, 0 measurements, 0 voice).
--   · files.site_visit_capture — FILL-A.8 query 3: 6 files.

-- ----------------------------------------------------------------------------
-- 1. site_visits.frozen_at — "the material that existed at this moment is fixed"
-- ----------------------------------------------------------------------------
ALTER TABLE public.site_visits ADD COLUMN frozen_at timestamptz;
COMMENT ON COLUMN public.site_visits.frozen_at IS
  'S110 A: stamped by the database when the estimate is sent (leaves draft/review) and moved forward at its outcome (accepted/declined/expired/voided). A row on this visit created at or before it is frozen.';

-- Backfill: anything already past review is frozen NOW — deliberately not
-- sent_at, so nothing frozen under 20261690000000 can thaw. (Production: 0.)
UPDATE public.site_visits sv
   SET frozen_at = now()
  FROM public.estimates e
 WHERE e.id = sv.estimate_id
   AND e.status NOT IN ('site_visit', 'draft', 'review')
   AND sv.frozen_at IS NULL;

-- ----------------------------------------------------------------------------
-- 2. files.site_visit_capture — "this file was captured through the site-visit
--    record". The ONLY files a foreman or crew member may read on an estimate.
-- ----------------------------------------------------------------------------
ALTER TABLE public.files ADD COLUMN site_visit_capture boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.files.site_visit_capture IS
  'S110 A (Q4): captured through the site-visit record. Foreman and crew read only these on an estimate — never its other files (vendor quotes are money). Set by the service role in the estimate-files and voice routes; a user session cannot change it.';

-- Backfill — the S108 visit-era rule, applied once: images and audio on an
-- estimate that has a visit, created at or before promotion (or not promoted),
-- plus every voice note's audio. (Production: 6 files.)
UPDATE public.files f
   SET site_visit_capture = true
  FROM public.site_visits sv
 WHERE sv.estimate_id = f.estimate_id
   AND NOT coalesce(f.is_deleted, false)
   AND (f.mime_type LIKE 'image/%' OR f.mime_type LIKE 'audio/%')
   AND (sv.promoted_at IS NULL OR f.created_at <= sv.promoted_at);
UPDATE public.files f
   SET site_visit_capture = true
 WHERE f.id IN (SELECT v.file_id FROM public.site_visit_voice_notes v WHERE v.file_id IS NOT NULL)
   AND NOT f.site_visit_capture;

-- ----------------------------------------------------------------------------
-- 3. The stamp — on the estimate's STATUS TRANSITION, whoever writes it.
--    SECURITY DEFINER: the caller (an owner sending, a client accepting through
--    the signing service, the expiry cron) need not be able to write site_visits.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.stamp_site_visit_frozen_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  pre CONSTANT text[] := ARRAY['site_visit', 'draft', 'review'];
  outcomes CONSTANT text[] := ARRAY['accepted', 'declined', 'expired', 'voided'];
BEGIN
  -- SEND: leaving draft/review for anything else. First stamp only.
  IF OLD.status = ANY (pre) AND NOT (NEW.status = ANY (pre)) THEN
    UPDATE site_visits SET frozen_at = coalesce(frozen_at, now()) WHERE estimate_id = NEW.id;
  END IF;
  -- OUTCOME [Q3 → B]: the stamp MOVES FORWARD, so what was added after the send
  -- freezes now. `viewed` is deliberately not an outcome.
  IF NEW.status = ANY (outcomes) AND NEW.status IS DISTINCT FROM OLD.status THEN
    UPDATE site_visits SET frozen_at = now() WHERE estimate_id = NEW.id;
  END IF;
  RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS estimates_site_visit_frozen_stamp ON public.estimates;
CREATE TRIGGER estimates_site_visit_frozen_stamp
  AFTER UPDATE OF status ON public.estimates
  FOR EACH ROW EXECUTE FUNCTION public.stamp_site_visit_frozen_at();

REVOKE EXECUTE ON FUNCTION public.stamp_site_visit_frozen_at() FROM public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. THE FREEZE — rewritten. Still BEFORE INSERT OR UPDATE on all four tables
--    (the triggers from 20261690000000 stay; their function is replaced), and
--    STILL BLIND TO THE CALLER'S ROLE — the service role is refused exactly like
--    anyone else (S108's deliberate arm, kept).
-- ----------------------------------------------------------------------------
--   INSERT  always admitted, at every status [ruling 3]. created_at := now(), so
--           a row cannot be backdated to pose as pre-send evidence.
--   UPDATE  created_at is immutable. A row created AFTER frozen_at (or with no
--           frozen_at yet) is editable. A row created AT OR BEFORE it is frozen,
--           except for four shapes that change no evidence:
--             · the stamp itself moving (site_visits.frozen_at);
--             · an FK nulled by ON DELETE SET NULL (contact, address, file);
--             · a transcription that was PENDING completing [Q3];
--             · the editable transcript being SEEDED from the machine text,
--               before anyone has edited it.
--   (Soft delete is an UPDATE and is frozen. Hard delete stays untriggered: the
--    estimate's cascade — tenant deletion, test sweeps — must still work.)
CREATE OR REPLACE FUNCTION public.enforce_site_visit_freeze()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_frozen timestamptz;
  o jsonb;
  n jsonb;
  diff text[];
  fk_cols CONSTANT text[] := ARRAY['contact_id', 'contact_address_id', 'file_id'];
  transcription CONSTANT text[] := ARRAY['transcript_status', 'transcript_machine', 'transcript',
    'transcript_language', 'transcript_model', 'transcript_error', 'transcribed_at'];
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := now();
    RETURN NEW;
  END IF;

  o := to_jsonb(OLD);
  n := to_jsonb(NEW);

  IF (n -> 'created_at') IS DISTINCT FROM (o -> 'created_at') THEN
    RAISE EXCEPTION 'A site-visit record''s creation time cannot be changed.' USING ERRCODE = '42501';
  END IF;

  IF TG_TABLE_NAME = 'site_visits' THEN
    v_frozen := (o ->> 'frozen_at')::timestamptz;
  ELSE
    SELECT sv.frozen_at INTO v_frozen FROM site_visits sv WHERE sv.estimate_id = (n ->> 'estimate_id')::uuid;
  END IF;

  -- Not frozen: before any send, or added after it.
  IF v_frozen IS NULL OR (o ->> 'created_at')::timestamptz > v_frozen THEN
    RETURN NEW;
  END IF;

  SELECT coalesce(array_agg(key ORDER BY key), '{}') INTO diff
    FROM jsonb_each(n) AS e(key, value)
   WHERE e.value IS DISTINCT FROM (o -> e.key)
     AND e.key NOT IN ('updated_at', 'updated_by');

  IF cardinality(diff) = 0 THEN
    RETURN NEW;
  END IF;

  -- The stamp moving (and only the stamp).
  IF TG_TABLE_NAME = 'site_visits' AND diff = ARRAY['frozen_at'] THEN
    RETURN NEW;
  END IF;

  -- An ON DELETE SET NULL action: FK columns only, and only TO null.
  IF diff <@ fk_cols
     AND NOT EXISTS (SELECT 1 FROM unnest(diff) k WHERE n ->> k IS NOT NULL) THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'site_visit_voice_notes' THEN
    -- A transcription pending at send completes [Q3: "it writes the machine
    -- transcript of audio that already existed"].
    IF o ->> 'transcript_status' = 'pending' AND diff <@ transcription THEN
      RETURN NEW;
    END IF;
    -- …and its editable copy is seeded from it, before anyone edited it.
    IF diff = ARRAY['transcript']
       AND o ->> 'transcript' IS NULL
       AND o ->> 'transcript_edited_at' IS NULL
       AND (n -> 'transcript') IS NOT DISTINCT FROM (o -> 'transcript_machine') THEN
      RETURN NEW;
    END IF;
  END IF;

  RAISE EXCEPTION 'The site visit record is frozen: this was captured before the estimate was sent. Add a new note instead.'
    USING ERRCODE = '42501';
END;
$fn$;

-- ----------------------------------------------------------------------------
-- 5. Site-visit FILES freeze the same way, and the capture flag is not a user's
--    to set. (S108 "known edge": an owner could delete a visit photo after send
--    through the Files tab — closed here for captured files.)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_site_visit_file_freeze()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_frozen timestamptz;
BEGIN
  -- The flag decides what foreman and crew may read. A user session never moves
  -- it; the service role (the estimate-files and voice routes) sets it.
  IF auth.uid() IS NOT NULL AND NEW.site_visit_capture IS DISTINCT FROM OLD.site_visit_capture THEN
    RAISE EXCEPTION 'Only the site-visit record marks a file as captured on site.' USING ERRCODE = '42501';
  END IF;
  IF NOT OLD.site_visit_capture THEN
    RETURN NEW;
  END IF;
  SELECT sv.frozen_at INTO v_frozen FROM site_visits sv WHERE sv.estimate_id = OLD.estimate_id;
  IF v_frozen IS NULL OR OLD.created_at > v_frozen THEN
    RETURN NEW;
  END IF;
  IF NEW.is_deleted IS DISTINCT FROM OLD.is_deleted
     OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
     OR NEW.file_name IS DISTINCT FROM OLD.file_name
     OR NEW.file_path IS DISTINCT FROM OLD.file_path
     OR NEW.file_size IS DISTINCT FROM OLD.file_size
     OR NEW.mime_type IS DISTINCT FROM OLD.mime_type
     OR NEW.markup_data IS DISTINCT FROM OLD.markup_data
     OR NEW.estimate_id IS DISTINCT FROM OLD.estimate_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.site_visit_capture IS DISTINCT FROM OLD.site_visit_capture THEN
    RAISE EXCEPTION 'This site-visit photo is frozen: it was captured before the estimate was sent.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS files_z_site_visit_freeze ON public.files;
CREATE TRIGGER files_z_site_visit_freeze
  BEFORE UPDATE ON public.files
  FOR EACH ROW EXECUTE FUNCTION public.enforce_site_visit_file_freeze();

REVOKE EXECUTE ON FUNCTION public.enforce_site_visit_file_freeze() FROM public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 6. READ — every internal employee, every visit in the company [Q1 → A].
--    ONE role list for all four tables, so they cannot drift. Subcontractor and
--    client are not in it. ⚠️ No site_visit_* table carries a money column
--    (FILLED-A.4) — that is what makes this widening safe.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS site_visits_select_scoped ON public.site_visits;
DROP POLICY IF EXISTS site_visit_notes_select_scoped ON public.site_visit_notes;
DROP POLICY IF EXISTS site_visit_measurements_select_scoped ON public.site_visit_measurements;
DROP POLICY IF EXISTS site_visit_voice_notes_select_scoped ON public.site_visit_voice_notes;

CREATE POLICY site_visits_select_internal ON public.site_visits FOR SELECT
  USING (company_id = get_my_company_id()
         AND get_my_role() = ANY (ARRAY['owner','admin','project_manager','foreman','crew_member']));
CREATE POLICY site_visit_notes_select_internal ON public.site_visit_notes FOR SELECT
  USING (company_id = get_my_company_id()
         AND get_my_role() = ANY (ARRAY['owner','admin','project_manager','foreman','crew_member']));
CREATE POLICY site_visit_measurements_select_internal ON public.site_visit_measurements FOR SELECT
  USING (company_id = get_my_company_id()
         AND get_my_role() = ANY (ARRAY['owner','admin','project_manager','foreman','crew_member']));
CREATE POLICY site_visit_voice_notes_select_internal ON public.site_visit_voice_notes FOR SELECT
  USING (company_id = get_my_company_id()
         AND get_my_role() = ANY (ARRAY['owner','admin','project_manager','foreman','crew_member']));

-- ----------------------------------------------------------------------------
-- 7. site_visit_access() — "may ADD to this visit". 'office' (owner/admin/PM) or
--    'staff' (foreman/crew), at EVERY status; NULL for another company, a sub or
--    a client, or an abandoned visit (staff). Whether a given ROW may still be
--    EDITED is the freeze trigger's answer, not this function's.
--    Superseded: 'office' only on site_visit/draft/review; 'recorder' only while
--    still a site visit and only for the person who recorded it.
-- ----------------------------------------------------------------------------
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
         AND NOT coalesce(sv.is_deleted, false)
         AND NOT coalesce(e.is_deleted, false) THEN 'staff'
    ELSE NULL
  END
  FROM estimates e
  JOIN site_visits sv ON sv.estimate_id = e.id
  WHERE e.id = p_estimate_id
    AND e.company_id = get_my_company_id();
$fn$;

-- ----------------------------------------------------------------------------
-- 8. The RPCs. Edits no longer require being the note's author [ruling 1: "and
--    edit them"]; the freeze trigger decides frozen-ness. The VISIT-level acts —
--    rename, finish, abandon — stay with the office or the person who recorded
--    it (ruling 1 speaks of notes, measurements, blockers and photos; S110
--    FILLED-A.2 kept these), and stay site_visit-only as before.
-- ----------------------------------------------------------------------------

-- Office, or the recorder. Raises 42501 otherwise.
CREATE OR REPLACE FUNCTION public.site_visit_assert_owner_of_visit(p_estimate_id uuid, p_access text)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  IF p_access = 'office' THEN
    RETURN;
  END IF;
  IF p_access = 'staff' AND EXISTS (
    SELECT 1 FROM site_visits WHERE estimate_id = p_estimate_id AND created_by = auth.uid()
  ) THEN
    RETURN;
  END IF;
  RAISE EXCEPTION 'Only the office or the person who recorded this visit can do that.' USING ERRCODE = '42501';
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.site_visit_assert_owner_of_visit(uuid, text) FROM public, anon, authenticated;

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
  PERFORM site_visit_assert_owner_of_visit(p_estimate_id, v_access);
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

  -- [S110 ruling 1] any internal employee edits any note — no author check. The
  -- freeze trigger refuses a note that existed when the estimate was sent.
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
  RETURNING n.id INTO v_id;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'That note was not found on this visit.' USING ERRCODE = '42501';
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
  v_n        integer;
BEGIN
  SELECT estimate_id INTO v_estimate FROM site_visit_notes WHERE id = p_note_id;
  IF site_visit_access(v_estimate) IS NULL THEN
    RAISE EXCEPTION 'You cannot edit this site visit.' USING ERRCODE = '42501';
  END IF;
  UPDATE site_visit_notes SET is_deleted = true, deleted_at = now() WHERE id = p_note_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN
    RAISE EXCEPTION 'That note was not found.' USING ERRCODE = '42501';
  END IF;
END;
$fn$;

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
  RETURNING m.id INTO v_id;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'That measurement was not found on this visit.' USING ERRCODE = '42501';
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
  v_n        integer;
BEGIN
  SELECT estimate_id INTO v_estimate FROM site_visit_measurements WHERE id = p_measurement_id;
  IF site_visit_access(v_estimate) IS NULL THEN
    RAISE EXCEPTION 'You cannot edit this site visit.' USING ERRCODE = '42501';
  END IF;
  UPDATE site_visit_measurements SET is_deleted = true, deleted_at = now() WHERE id = p_measurement_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN
    RAISE EXCEPTION 'That measurement was not found.' USING ERRCODE = '42501';
  END IF;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.update_voice_note_transcript(p_voice_note_id uuid, p_transcript text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_estimate uuid;
  v_n        integer;
BEGIN
  SELECT estimate_id INTO v_estimate FROM site_visit_voice_notes
   WHERE id = p_voice_note_id AND NOT coalesce(is_deleted, false);
  IF site_visit_access(v_estimate) IS NULL THEN
    RAISE EXCEPTION 'You cannot edit this transcript.' USING ERRCODE = '42501';
  END IF;
  UPDATE site_visit_voice_notes
     SET transcript = p_transcript, transcript_edited_at = now(), transcript_edited_by = auth.uid()
   WHERE id = p_voice_note_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN
    RAISE EXCEPTION 'That transcript was not found.' USING ERRCODE = '42501';
  END IF;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.finish_site_visit(p_estimate_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_access   text := site_visit_access(p_estimate_id);
  v_status   text;
  v_finished timestamptz;
BEGIN
  IF v_access IS NULL THEN
    RAISE EXCEPTION 'You cannot finish this site visit.' USING ERRCODE = '42501';
  END IF;
  -- The recorder's "done" (or the office's). Another crew member reading the
  -- visit does not finish it for them.
  PERFORM site_visit_assert_owner_of_visit(p_estimate_id, v_access);
  SELECT status INTO v_status FROM estimates WHERE id = p_estimate_id;
  IF v_status <> 'site_visit' THEN
    RAISE EXCEPTION 'This visit is already an estimate.' USING ERRCODE = '22023';
  END IF;
  UPDATE site_visits
     SET finished_at = coalesce(finished_at, now()),
         finished_by = coalesce(finished_by, auth.uid())
   WHERE estimate_id = p_estimate_id
     AND NOT coalesce(is_deleted, false)
  RETURNING finished_at INTO v_finished;
  IF v_finished IS NULL THEN
    RAISE EXCEPTION 'Site visit not found.' USING ERRCODE = '42501';
  END IF;
  RETURN v_finished;
END;
$fn$;

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
  PERFORM site_visit_assert_owner_of_visit(p_estimate_id, v_access);
  SELECT status INTO v_status FROM estimates WHERE id = p_estimate_id;
  IF v_status <> 'site_visit' THEN
    RAISE EXCEPTION 'Only a site visit can be abandoned; this is already an estimate.' USING ERRCODE = '22023';
  END IF;
  UPDATE estimates SET is_deleted = true, deleted_at = now() WHERE id = p_estimate_id;
  UPDATE site_visits SET is_deleted = true, deleted_at = now() WHERE estimate_id = p_estimate_id;
END;
$fn$;
