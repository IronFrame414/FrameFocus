-- ============================================================================
-- D3.1 [S135] — "does this address already have an account?", asked safely
-- ============================================================================
--
-- Josh invited `josh+test2@worthprop.com` and the invitation could never be
-- accepted: that address already had an auth user, a profile and a company of
-- its own — a four-month-old test tenant created 2026-04-04. The form issued a
-- link that could not work and said nothing.
--
-- The invite form cannot see this by itself. `profiles` is company-scoped by
-- RLS, so an Owner reads only their OWN company's rows, and `auth.users` is not
-- exposed through PostgREST at all. Hence a SECURITY DEFINER helper.
--
-- ----------------------------------------------------------------------------
-- ⚠️ WHY THIS IS NOT AN ENUMERATION ORACLE
-- ----------------------------------------------------------------------------
-- It answers a question about an address the CALLER SUPPLIED, which is a real
-- disclosure — so it is fenced three ways:
--
--   1. It returns a BOOLEAN. No company name, no role, no id, no user id.
--      Which tenant the address belongs to is exactly what must not leak, and
--      it is what Josh would have liked to see — that trade is deliberate.
--   2. It is OWNER/ADMIN ONLY, checked inside the function body. The same two
--      roles `invitations_insert_owner_admin` already admits, so it grants no
--      reach that issuing the invitation itself would not.
--   3. EXECUTE is granted to `authenticated` alone — never `anon`. An
--      unauthenticated visitor cannot probe addresses at all.
--
-- The remaining exposure is an Owner learning whether an address they typed has
-- a FrameFocus account somewhere. That is strictly less than they learn today
-- by inviting it and watching what happens, and it is the only way to warn them
-- before a dead link goes out.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.email_has_account(p_email text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF public.get_my_role() IS DISTINCT FROM 'owner'
     AND public.get_my_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only Owner or Admin may check whether an address is already in use.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM profiles p
    WHERE LOWER(p.email) = LOWER(TRIM(p_email))
      AND p.is_deleted = false
  );
END;
$$;

COMMENT ON FUNCTION public.email_has_account(text) IS
  'D3.1 [S135]: true when an address already has a FrameFocus profile in ANY '
  'company. Boolean only — never which company. Owner/Admin only, authenticated '
  'only. Lets the invite form refuse to issue a link that could not be accepted.';

REVOKE ALL ON FUNCTION public.email_has_account(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.email_has_account(text) TO authenticated;
