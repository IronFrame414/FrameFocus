-- ============================================================================
-- S119 ITEM A-1 — a profile-less login can no longer write itself into a company.
-- [Josh ruled yes, 2026-09-29; finding S118 item 9]
-- ============================================================================
--
-- `profiles_insert_authenticated` was `WITH CHECK (true)` (baseline :3682). A
-- signed-in user with NO `profiles` row could insert
-- `{user_id: self, company_id: <any company>, role: 'admin'}`, and the AFTER
-- INSERT trigger `profiles_create_member` then added its `company_members` row:
-- Admin of a company it was never invited to. Confirmed on rebuild-test before
-- this migration (S119 report): admin insert → 1 profile + 1 member row; owner
-- insert into an owner-less company → 1; a user WITH a profile → 23505.
--
-- `companies_insert_unaffiliated` (`get_my_company_id() IS NULL`, 20261004000000)
-- admits exactly the same caller — the profile-less login — and it could mint a
-- company for the profile policy above to make it the Owner of.
--
-- WHY DROP, NOT CONSTRAIN. Neither policy serves a real caller [measured S119]:
--   * the ONLY SQL inserting into either table is handle_new_user() — SECURITY
--     DEFINER, owned by postgres (rolbypassrls), tables not FORCE RLS — so both
--     onboarding paths (owner signup, invited signup) never evaluate them;
--   * app/lib/components/packages/edge functions: zero `authenticated` inserts
--     or upserts on `profiles` or `companies`.
-- A constrained policy (`user_id = auth.uid() AND company_id IS NULL …`) would
-- still admit a row nobody writes, and a NULL-company profile fails the member
-- trigger anyway. No policy is the narrowest statement of "profiles and
-- companies are created by signup only".
--
-- Supersedes `s152-m1-fixes.live.ts` B2 ("an unaffiliated caller CAN still
-- insert … would break signup"), inverted in place: signup never read it.
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS profiles_insert_authenticated ON public.profiles;
DROP POLICY IF EXISTS companies_insert_unaffiliated ON public.companies;

COMMENT ON TABLE public.profiles IS
  'One per auth user. [S119 A-1] NO INSERT policy on purpose: every profile is created by handle_new_user() (SECURITY DEFINER, bypasses RLS) on the owner or invited signup path. A client INSERT policy let a profile-less login make itself Admin of any company.';

COMMIT;
