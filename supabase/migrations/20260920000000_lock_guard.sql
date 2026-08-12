-- ============================================================================
-- S138 — THE LOCK GUARD: closing the ≤60-minute window the ban leaves open.
--
-- Spec: docs/specs/trial-lifecycle-spec.md §6a
-- Depends on: 20260918000000_trial_lifecycle.sql
-- ============================================================================
--
-- ⚠️ MEASURED, NOT ASSUMED. Q3(c) chose session revocation on the reasoning
-- that banning the auth users made a routing or data gate unnecessary. S138
-- measured that claim against rebuild-test and it is only two-thirds true:
--
--     ACCESS TOKEN LIFETIME:              3600s
--     fresh sign-in after the ban:        refused — "User is banned"
--     token refresh after the ban:        refused — "Invalid Refresh Token: User Banned"
--     ALREADY-ISSUED token after the ban: rows=1, error=none      ← the hole
--
-- PostgREST validates a JWT by signature and `exp`. It does not consult
-- `auth.users.banned_until`. So a user holding a live access token at the
-- moment of the lock keeps FULL read and write access — through /m, through
-- every API route, and through any direct PostgREST call — for up to one hour.
--
-- Ruled [Josh, S138]: add a server-side guard rather than accept the window or
-- shorten every tenant's JWT lifetime.
--
-- ----------------------------------------------------------------------------
-- WHY THIS IS A FUNCTION AND NOT A POLICY OR A DIRECT READ
-- ----------------------------------------------------------------------------
-- `trial_lifecycle` is Owner-readable ONLY (20260918000000), and deliberately
-- so — the deletion date is not crew-visible information. But the guard has to
-- answer "is my company locked?" for EVERY role, including crew and
-- subcontractor, or it protects nobody. Widening the table's SELECT policy to
-- do that would leak `delete_after`, `trial_end` and the postponement fields to
-- everyone, which is the opposite of the S137 floor.
--
-- So this returns a BOOLEAN and nothing else. It is the narrowest possible
-- widening: one bit, about your own company, which you can already infer by
-- being unable to log in.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_my_company_locked()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.trial_lifecycle tl
     WHERE tl.company_id = public.get_my_company_id()
       AND tl.locked_at IS NOT NULL
       AND tl.deleted_at IS NULL
  );
$$;

-- SQL, not plpgsql, and SECURITY DEFINER: CLAUDE.md's rule for a helper that
-- must read an RLS-protected table from a context where the caller cannot.
--
-- Granted to `authenticated` because every signed-in role must be able to be
-- refused. NOT granted to `anon`: an unauthenticated caller has no company, so
-- `get_my_company_id()` is NULL and the question is meaningless.
REVOKE ALL ON FUNCTION public.is_my_company_locked() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_my_company_locked() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_my_company_locked() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_my_company_locked() TO service_role;
