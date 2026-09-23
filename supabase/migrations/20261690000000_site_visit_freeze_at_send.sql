-- S108 follow-up — THE SITE-VISIT RECORD FREEZES WHEN THE ESTIMATE IS SENT.
-- [RULED Josh, 2026-09-23, ruling 3]
--
-- "It is the evidence of what was found on site at the price quoted, and an
-- editable record is not evidence. Enforce it in the database, not the UI."
--
-- SENT = any status past draft/review: sent, viewed, accepted, declined,
-- expired, converted, voided. enforce_estimate_immutability already forbids a
-- sent estimate from returning to draft/review, so the freeze is permanent.
-- Writable: site_visit, draft, review.
--
-- TWO LAYERS, because there are two write paths:
--   1. site_visit_access() — the one write rule every RPC and both voice
--      routes consult — stops answering 'office' after send. (The recorder
--      arm already ended at promotion; unchanged.) Every RPC therefore refuses
--      with 42501, and the screens drop their controls because they ask the
--      same function.
--   2. A BEFORE INSERT/UPDATE trigger on all four site_visit_* tables refuses
--      any write to a sent estimate's record — INCLUDING the service-role
--      client, which bypasses RLS and does not call site_visit_access() (the
--      voice upload/transcription path writes through it). So nothing reaches
--      these rows once the estimate is sent, whatever the caller.
--
-- ⚠️ DELETE IS NOT TRIGGERED, deliberately: the estimate's ON DELETE CASCADE
-- (tenant deletion walk, test sweeps) must still remove the rows. No RPC
-- hard-deletes; the soft deletes are UPDATEs and are frozen.
-- ⚠️ ONE UPDATE SHAPE IS ADMITTED after send: an FK being nulled
-- (contact_id / contact_address_id / file_id → NULL). Those are ON DELETE SET
-- NULL actions fired when a contact, address or file is hard-deleted
-- elsewhere; refusing them would make those deletes impossible. Nothing else
-- may change, and those columns may only move TO NULL.
--
-- UNRESOLVED BLOCKERS AFTER SEND: frozen as they stand — an open blocker stays
-- open, on the record, permanently. Resolving one after send is NOT allowed by
-- this migration; if it is wanted, it is a separate ruling (Josh).
--
-- Governs FUTURE WRITES only; no constraint, nothing that reads existing rows
-- at apply time — it cannot abort on production data. Production count of
-- rows it will govern:
--   select count(*) from site_visit_notes n join estimates e on e.id = n.estimate_id
--    where e.status not in ('site_visit','draft','review');   (and the same for
--   site_visits, site_visit_measurements, site_visit_voice_notes)

CREATE OR REPLACE FUNCTION public.site_visit_access(p_estimate_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT CASE
    -- [2026-09-23 ruling 3] the office writes only until the estimate is SENT.
    WHEN get_my_role() = ANY (ARRAY['owner','admin','project_manager'])
         AND e.status = ANY (ARRAY['site_visit','draft','review']) THEN 'office'
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

CREATE OR REPLACE FUNCTION public.enforce_site_visit_freeze()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_status text;
  fk_cols CONSTANT text[] := ARRAY['contact_id', 'contact_address_id', 'file_id'];
  -- updated_at / updated_by are set by the standard BEFORE UPDATE triggers,
  -- which run BEFORE this one (trigger names sort: set_updated_by, updated_at,
  -- then z_freeze).
  permitted CONSTANT text[] := ARRAY['contact_id', 'contact_address_id', 'file_id', 'updated_at', 'updated_by'];
  k text;
BEGIN
  SELECT status INTO v_status FROM estimates WHERE id = NEW.estimate_id;
  IF v_status IS NULL OR v_status = ANY (ARRAY['site_visit', 'draft', 'review']) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND (to_jsonb(NEW) - permitted) IS NOT DISTINCT FROM (to_jsonb(OLD) - permitted) THEN
    FOREACH k IN ARRAY fk_cols LOOP
      IF (to_jsonb(NEW) -> k) IS DISTINCT FROM (to_jsonb(OLD) -> k)
         AND (to_jsonb(NEW) ->> k) IS NOT NULL THEN
        RAISE EXCEPTION 'The site visit record is frozen: the estimate has been sent (status: %).', v_status
          USING ERRCODE = '42501';
      END IF;
    END LOOP;
    RETURN NEW;  -- only FK columns moved to NULL: an ON DELETE SET NULL action
  END IF;

  RAISE EXCEPTION 'The site visit record is frozen: the estimate has been sent (status: %).', v_status
    USING ERRCODE = '42501';
END;
$fn$;

CREATE TRIGGER site_visits_z_freeze_after_send
  BEFORE INSERT OR UPDATE ON public.site_visits
  FOR EACH ROW EXECUTE FUNCTION public.enforce_site_visit_freeze();
CREATE TRIGGER site_visit_notes_z_freeze_after_send
  BEFORE INSERT OR UPDATE ON public.site_visit_notes
  FOR EACH ROW EXECUTE FUNCTION public.enforce_site_visit_freeze();
CREATE TRIGGER site_visit_measurements_z_freeze_after_send
  BEFORE INSERT OR UPDATE ON public.site_visit_measurements
  FOR EACH ROW EXECUTE FUNCTION public.enforce_site_visit_freeze();
CREATE TRIGGER site_visit_voice_notes_z_freeze_after_send
  BEFORE INSERT OR UPDATE ON public.site_visit_voice_notes
  FOR EACH ROW EXECUTE FUNCTION public.enforce_site_visit_freeze();

-- A trigger function, not an RPC: nobody calls it directly.
REVOKE EXECUTE ON FUNCTION public.enforce_site_visit_freeze() FROM public;
REVOKE EXECUTE ON FUNCTION public.enforce_site_visit_freeze() FROM anon;
REVOKE EXECUTE ON FUNCTION public.enforce_site_visit_freeze() FROM authenticated;
