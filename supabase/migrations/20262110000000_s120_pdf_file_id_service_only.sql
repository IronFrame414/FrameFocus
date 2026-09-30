-- S120 1-A — TECH_DEBT #175: `pdf_file_id` is written by the PDF pipeline ONLY.
--
-- The finding (S119 ITEM A-3, measured as CROSS-TENANT DELETION): the PDF
-- regeneration services (daily-log, delivery, incident) read the record's
-- current `pdf_file_id`, then hard-delete that `files` row and its storage
-- object WITH THE SERVICE ROLE. The record's author may set `pdf_file_id`
-- (nothing guarded it), and the FK is checked without RLS, so an author who
-- knows another company's file id could point their record at it and have the
-- next regeneration destroy it.
--
-- Two halves, both required [S120 SPEC 1-A]:
--   1. HERE: an authenticated user can never set or change `pdf_file_id` on
--      the four tables that carry a regenerated PDF. The pipeline repoints it
--      with the service role (auth.uid() IS NULL), which this lets through —
--      the same test `enforce_daily_logs_column_scope` uses for the same repoint.
--   2. In the services: the stale-file cleanup deletes only a file of the
--      record's OWN company and the expected PDF category, so a pointer that
--      got there by any other route still cannot reach a foreign file.
--
-- No live function writes `pdf_file_id` in a user context (measured on
-- rebuild-test: the only function mentioning it is the read
-- `pe_can_see_lien_file`). `material_signouts` already forbids a non-null
-- pointer on INSERT by policy and has no user UPDATE policy; it gets the
-- trigger too so all four tables state the same rule in the same place.
--
-- Not a constraint over existing rows: a trigger fires on writes only.
-- Production held 0 rows in all four tables on 2026-09-30 (read-only count).

CREATE OR REPLACE FUNCTION public.enforce_pdf_file_id_service_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;   -- service role: the PDF pipeline's repoint
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.pdf_file_id IS NOT NULL THEN
      RAISE EXCEPTION 'The PDF of a record is set by the system, not by a user.'
        USING ERRCODE = '42501';
    END IF;
  ELSIF NEW.pdf_file_id IS DISTINCT FROM OLD.pdf_file_id THEN
    RAISE EXCEPTION 'The PDF of a record is set by the system, not by a user.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER daily_logs_pdf_file_id_service_only
  BEFORE INSERT OR UPDATE OF pdf_file_id ON public.daily_logs
  FOR EACH ROW EXECUTE FUNCTION public.enforce_pdf_file_id_service_only();

CREATE TRIGGER deliveries_pdf_file_id_service_only
  BEFORE INSERT OR UPDATE OF pdf_file_id ON public.deliveries
  FOR EACH ROW EXECUTE FUNCTION public.enforce_pdf_file_id_service_only();

CREATE TRIGGER safety_incidents_pdf_file_id_service_only
  BEFORE INSERT OR UPDATE OF pdf_file_id ON public.safety_incidents
  FOR EACH ROW EXECUTE FUNCTION public.enforce_pdf_file_id_service_only();

CREATE TRIGGER material_signouts_pdf_file_id_service_only
  BEFORE INSERT OR UPDATE OF pdf_file_id ON public.material_signouts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_pdf_file_id_service_only();
