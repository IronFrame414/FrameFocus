-- S120 1-D — TECH_DEBT #178: an incident's injured party and witnesses are
-- members of the incident's OWN company.
--
-- The finding (S119 ITEM A-3): `create_safety_incident` puts the member ids in
-- `p_injuries` / `p_witnesses` straight into safety_incident_injuries /
-- safety_incident_witnesses. The FKs (`*_member_id_fkey` → company_members) are
-- checked without RLS, and the child tables' INSERT/UPDATE policies check the
-- row's company and the incident's reporter — never the MEMBER's company. So a
-- reporter could name another company's person on their incident.
--
-- Measured S120 (read-only), beyond the entry: BOTH overloads carry EXECUTE
-- for `authenticated` on production — including the 6-arg SECURITY DEFINER one
-- the entry calls dead (#1-s180u). It has no caller (apps/web, tests, scripts:
-- the only caller passes p_prevention_notes → the 7-arg INVOKER form), but it
-- is reachable, and as DEFINER it bypasses the child-table RLS too.
--
-- The rule goes BELOW both functions, on the child tables themselves, so it
-- holds for either overload, a direct INSERT, and a later UPDATE:
--   a non-null member_id must be a member of the row's own company.
-- SECURITY DEFINER to read the member row whatever the caller's roster RLS —
-- the pattern of enforce_employee_document_owner (20262060000000).
--
-- And the dead DEFINER overload loses EXECUTE for every client role (the
-- narrower, reversible step; dropping it outright stays #1-s180u's proposal).
--
-- Not a constraint over existing rows: a trigger fires on writes only.
-- Production: 0 injury and 0 witness rows (2026-09-30, read-only). Rebuild-test:
-- 2 + 3 rows, 0 naming a member outside the row's company.

CREATE OR REPLACE FUNCTION public.enforce_incident_party_member_company()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.member_id IS NULL THEN
    RETURN NEW;
  END IF;
  PERFORM 1 FROM company_members m
   WHERE m.id = NEW.member_id
     AND m.company_id = NEW.company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That person is not a member of this company.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER safety_incident_injuries_member_company
  BEFORE INSERT OR UPDATE OF member_id, company_id ON public.safety_incident_injuries
  FOR EACH ROW EXECUTE FUNCTION public.enforce_incident_party_member_company();

CREATE TRIGGER safety_incident_witnesses_member_company
  BEFORE INSERT OR UPDATE OF member_id, company_id ON public.safety_incident_witnesses
  FOR EACH ROW EXECUTE FUNCTION public.enforce_incident_party_member_company();

-- The dead SECURITY DEFINER overload (#1-s180u): no caller, no client reach.
REVOKE ALL ON FUNCTION public.create_safety_incident(uuid, date, text, text, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_safety_incident(uuid, date, text, text, jsonb, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.create_safety_incident(uuid, date, text, text, jsonb, jsonb) FROM authenticated;
