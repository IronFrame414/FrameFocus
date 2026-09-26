-- ============================================================================
-- S112 — the recurring guard for the half of the anon root cause a migration
-- CANNOT close.
-- ============================================================================
--
-- ⚠️ WHAT IS STILL OPEN AFTER 20261870000000. That migration fixed the default
-- privileges FOR ROLE postgres, so a function created by a migration no longer
-- hands EXECUTE to anon. It could not fix this one, which production and
-- rebuild-test both still carry:
--
--     supabase_admin | public | f | {postgres=X,anon=X,authenticated=X,service_role=X}
--
-- MEASURED on rebuild-test, S112 follow-up, as the migration role (postgres):
--
--     ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
--       REVOKE EXECUTE ON FUNCTIONS FROM anon;
--     → ERROR 42501: permission denied to change default privileges
--
--     SET ROLE supabase_admin;
--     → ERROR 42501: permission denied to set role "supabase_admin"
--
-- postgres is not a superuser on Supabase and is not a member of
-- supabase_admin, so no migration, CLI push or SQL-editor statement can alter
-- it. Only Supabase can.
--
-- ⚠️ WHEN IT BITES. Only for a function CREATED BY supabase_admin in public —
-- the platform itself, e.g. an extension installed into `public` from the
-- dashboard. Today all 320 public functions on rebuild-test are owned by
-- postgres and none belongs to an extension, so it has not bitten. That is a
-- description of today, not a guarantee.
--
-- ⚠️ WHY A DETECTOR AND NOT A FIX-UP TRIGGER. An event trigger that revoked on
-- CREATE FUNCTION cannot revoke a grant supabase_admin made (postgres is not
-- the grantor), and one that RAISEd would break the platform's own DDL. So
-- the guard REPORTS, daily, through the existing schema-drift cron, which
-- already runs on production and already notifies. The fingerprint cannot do
-- this job: it digests policies, triggers, function BODIES and constraints —
-- GRANTS are explicitly outside it (20261620000000, header).
--
-- This function returns EVERY public function anon may EXECUTE, allowlisted or
-- not. The allowlist lives in lib/services/schema-drift.ts, beside the check,
-- so the database reports facts and the code decides what is acceptable.
-- has_function_privilege() counts a PUBLIC grant as anon's, which is the point:
-- the pre-S112 exposure was mostly PUBLIC, not anon by name.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.anon_execute_exposure()
RETURNS TABLE (
  signature text,
  owner text,
  security_definer boolean,
  extension text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $fn$
  SELECT
    p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
    p.proowner::regrole::text,
    p.prosecdef,
    e.extname::text
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  LEFT JOIN pg_depend d
    ON d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e'
  LEFT JOIN pg_extension e ON e.oid = d.refobjid
  WHERE n.nspname = 'public'
    AND has_function_privilege('anon', p.oid, 'EXECUTE')
  ORDER BY 1;
$fn$;

COMMENT ON FUNCTION public.anon_execute_exposure() IS
  'S112. Every public function the anon role may EXECUTE (directly or via '
  'PUBLIC). Read daily by /api/cron/schema-drift against a 3-name allowlist. '
  'Exists because supabase_admin''s default ACL still grants anon EXECUTE and '
  'cannot be altered from a migration (42501).';

-- A map of what the public key can call is exactly what an attacker wants, so
-- the same lock as schema_fingerprint(): service_role only. The postgres
-- default (post-20261870000000) grants authenticated, so revoke explicitly.
REVOKE ALL ON FUNCTION public.anon_execute_exposure() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.anon_execute_exposure() FROM anon;
REVOKE ALL ON FUNCTION public.anon_execute_exposure() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.anon_execute_exposure() TO service_role;
