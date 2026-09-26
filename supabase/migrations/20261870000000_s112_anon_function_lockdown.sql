-- ============================================================================
-- S112 — MIGRATION 1 of 2: the anon key may EXECUTE exactly three functions.
-- ============================================================================
--
-- RULED [Josh, S112]: "TWO migrations, not one, and not several. Migration 1:
-- the privilege lockdown, ATOMIC. Change the default privileges so new
-- functions are not executable by anon, and revoke anon EXECUTE on everything
-- except an explicit ALLOWLIST ... Drop test_invite_lookup in migration 1."
-- Migration 2 (the caller checks inside each privileged function) is separate,
-- so this one can be rolled back without entangling it.
--
-- ----------------------------------------------------------------------------
-- WHAT WAS THERE — measured on rebuild-test before this migration
-- ----------------------------------------------------------------------------
--   321 functions in `public`, all owned by postgres; 280 executable by anon,
--   89 of those SECURITY DEFINER and callable through PostgREST.
--   Every ACL carried an explicit PUBLIC grant (`=X/postgres`) — anon inherits
--   PUBLIC — and pg_default_acl for `public`/functions read
--   {postgres=X, anon=X, authenticated=X, service_role=X}: every NEW function
--   was anon-executable by default.
--   Proven through the API with only the anon key: allocate_invoice_number
--   allocated INV-0002 for ANOTHER company (sequence 1 -> 2);
--   apply_change_order_budget, sync_po_commitment and seed_default_tags ran
--   their own bodies. (s112-anon-lockdown.live.ts)
--
-- ----------------------------------------------------------------------------
-- THE ALLOWLIST — every anon-key RPC on a logged-out path, measured from code
-- ----------------------------------------------------------------------------
--   git grep -nE "\.rpc\(" origin/main -- apps/web   → 289 call sites, 78 names,
--   traced through every route/page reachable without a session:
--     submit_sub_bid_reply     app/bid/[token]/bid-reply-client.tsx:87
--     get_invitation_status    app/invite/accept/accept-invite.tsx:110
--     get_invitation_by_token  app/invite/accept/accept-invite.tsx:116
--   All three run in the BROWSER with the anon key. Every other logged-out
--   surface reads through the service-role client (bid page and files, proposal
--   and CO signing, unsubscribes, resubscribe) or the Auth API (sign-in,
--   sign-up, password reset, auth callbacks). get_sub_bid_request is called by
--   the bid page with the SERVICE ROLE, so anon loses it — a token holder can
--   no longer call it directly.
--
-- ----------------------------------------------------------------------------
-- ⚠️ WHY EVERY OTHER ROLE IS RE-GRANTED EXPLICITLY FIRST
-- ----------------------------------------------------------------------------
-- anon can only be removed by revoking PUBLIC too, and PUBLIC is also how other
-- roles hold EXECUTE — supabase_auth_admin fires the auth.users signup triggers
-- and their functions run as it. So for every function, every role except anon
-- that CAN execute it now is granted it explicitly before PUBLIC goes. The only
-- privilege that changes is anon's.
--
-- ROLLBACK: the prior ACLs are kept in s112_anon_lockdown_backup;
-- docs/sessions/S112-anon-lockdown.md has the restore.
-- ============================================================================

-- 0. The record the rollback restores from. Not reachable through the API:
--    RLS on with no policy, and no grant to anon or authenticated.
CREATE TABLE IF NOT EXISTS public.s112_anon_lockdown_backup (
  fn text PRIMARY KEY,
  proacl text,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.s112_anon_lockdown_backup ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.s112_anon_lockdown_backup FROM PUBLIC, anon, authenticated;

INSERT INTO public.s112_anon_lockdown_backup (fn, proacl)
SELECT p.oid::regprocedure::text, p.proacl::text
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
ON CONFLICT (fn) DO NOTHING;

-- 1. A test function left in the schema, anon-callable, returning an invite's
--    email and role for a token.
DROP FUNCTION IF EXISTS public.test_invite_lookup(uuid);

-- 2. The lockdown.
DO $$
DECLARE
  f record;
  r record;
  v_allow constant text[] := ARRAY['submit_sub_bid_reply', 'get_invitation_status', 'get_invitation_by_token'];
BEGIN
  FOR f IN
    SELECT p.oid, p.oid::regprocedure AS sig, p.proname
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
  LOOP
    FOR r IN
      SELECT rolname FROM pg_roles
      WHERE rolname <> 'anon' AND rolname NOT LIKE 'pg\_%'
    LOOP
      IF has_function_privilege(r.rolname, f.oid, 'EXECUTE') THEN
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I', f.sig, r.rolname);
      END IF;
    END LOOP;

    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f.sig);

    IF f.proname = ANY (v_allow) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon', f.sig);
    END IF;
  END LOOP;
END
$$;

-- 3. New functions: not executable by anon, and not by PUBLIC. The roles the
--    app needs keep their default grant.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO authenticated, service_role, supabase_auth_admin;

-- 4. ATOMIC: refuse to commit unless the door is exactly as ruled.
DO $$
DECLARE
  v_anon text[];
BEGIN
  SELECT array_agg(p.proname ORDER BY p.proname) INTO v_anon
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND has_function_privilege('anon', p.oid, 'EXECUTE');

  IF v_anon IS DISTINCT FROM ARRAY['get_invitation_by_token', 'get_invitation_status', 'submit_sub_bid_reply'] THEN
    RAISE EXCEPTION 'S112 anon lockdown: anon can execute % — expected exactly the three allowlisted functions', v_anon;
  END IF;
END
$$;
