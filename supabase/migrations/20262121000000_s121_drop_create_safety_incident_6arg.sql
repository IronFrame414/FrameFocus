-- ============================================================================
-- S121 7-A — `#1-s180u`: DROP the dead 6-arg `create_safety_incident`.
-- ============================================================================
-- S120 (`20262113000000`) REVOKED its EXECUTE from PUBLIC, anon and
-- authenticated, so nothing could call it; this is the other half. It was the
-- SECURITY DEFINER overload from `20260711140000` (`create_safety_incident(
-- uuid, date, text, text, jsonb, jsonb)`); the LIVE one is the 7-arg SECURITY
-- INVOKER overload from `20260722020000` (… p_prevention_notes text …), which
-- this does not touch.
--
-- ⚠️ IRREVERSIBLE — proved first to have NO caller (S121 report §7-A, by what
-- is CALLED, not by a name filter):
--   · app/api/safety-incidents/route.ts:65 — the only production caller —
--     passes p_prevention_notes → the 7-arg overload.
--   · the only 6-arg callers are two NEGATIVE probes in
--     test/s120-incident-member-company.live.ts, inverted in place with this.
--   · database: 0 functions, 0 views reference it; 0 pg_depend dependents
--     (rebuild-test and production, counted before applying).
-- ============================================================================

DROP FUNCTION public.create_safety_incident(uuid, date, text, text, jsonb, jsonb);

-- The live overload must still be there after the drop.
DO $$
BEGIN
  IF to_regprocedure('public.create_safety_incident(uuid, date, text, text, text, jsonb, jsonb)') IS NULL THEN
    RAISE EXCEPTION 'S121 7-A: the live 7-arg create_safety_incident is missing';
  END IF;
  IF to_regprocedure('public.create_safety_incident(uuid, date, text, text, jsonb, jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'S121 7-A: the 6-arg overload is still present';
  END IF;
END;
$$;
