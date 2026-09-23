-- S108 follow-up — FINISHING a site visit is not PROMOTING it.
--
-- Field defect [Josh, production, 2026-09-23]: the phone had nothing to tap
-- when a visit was done, and the only "done"-shaped control anywhere was the
-- office's "Create estimate from this visit" — which PROMOTES (assigns the
-- client-visible number, creates the first money-bearing state). Finishing and
-- promoting were one gesture because only one of them existed.
--
-- This adds the other one:
--
--   FINISH  — "I am done capturing; the office can price it."
--             Who:   anyone site_visit_access() admits for writing — the office
--                    (owner/admin/PM), or the RECORDER while it is still a visit.
--             Does:  stamps site_visits.finished_at / finished_by. NOTHING on
--                    `estimates` changes: status stays 'site_visit', no number,
--                    the sequence is untouched, no money state is created.
--             After: the recorder may STILL correct it until promotion (ASK-A8
--                    is unchanged — finishing is a signal, not a lock).
--   PROMOTE — unchanged (promote_site_visit, owner/admin/PM, ASK-A3).
--
-- ⚠️ Two nullable columns on a money-free table and one new RPC. No CHECK, no
-- NOT NULL, no constraint of any kind — nothing here governs an existing row,
-- so nothing can abort on production data. (Production count for the record:
-- `select count(*) from site_visits;` — every row simply reads finished_at NULL.)
-- ⚠️ site_visits stays MONEY-FREE: its SELECT policy admits the recorder.

ALTER TABLE public.site_visits
  ADD COLUMN finished_at timestamptz,
  ADD COLUMN finished_by uuid REFERENCES auth.users(id);

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
  -- site_visit_access() is NULL for: another company, a sub/client, a foreman
  -- or crew member who did not record it, an abandoned visit, and the
  -- recorder once the visit has been promoted.
  IF v_access IS NULL THEN
    RAISE EXCEPTION 'You cannot finish this site visit.' USING ERRCODE = '42501';
  END IF;
  SELECT status INTO v_status FROM estimates WHERE id = p_estimate_id;
  IF v_status <> 'site_visit' THEN
    RAISE EXCEPTION 'This visit is already an estimate.' USING ERRCODE = '22023';
  END IF;

  -- Idempotent: a second tap (or a retry on a weak signal) keeps the FIRST
  -- finish stamp rather than moving it.
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

REVOKE EXECUTE ON FUNCTION public.finish_site_visit(uuid) FROM public;
REVOKE EXECUTE ON FUNCTION public.finish_site_visit(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.finish_site_visit(uuid) TO authenticated;
