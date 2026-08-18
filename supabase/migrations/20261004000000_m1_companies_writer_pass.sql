-- ============================================================================
-- Module 1 audit fixes — Groups A and B (S152)
-- ============================================================================
--
-- Findings: `docs/specs/S151-m1-audit.md` §1 (M1-02, M1-06). Rulings: Josh, S152.
--
-- ----------------------------------------------------------------------------
-- GROUP B — M1-02. The company INSERT policy, narrowed. RULED: option (a).
-- ----------------------------------------------------------------------------
--
-- WHAT WAS WRONG. `companies_insert_authenticated` was PERMISSIVE, TO authenticated,
-- WITH CHECK (true). No role floor, no tenant scoping, no limit: any signed-in
-- user of any role could insert unlimited `companies` rows. Proved live at S151
-- with a real crew_member session (`s151-m1-audit.live.ts` F2).
--
-- Not a data leak — `companies_select_own` is `id = get_my_company_id() OR
-- is_platform_admin()`, so the creator cannot read the row back (F2b). The
-- exposure is unbounded write amplification and orphan-row pollution of the
-- platform's tenant table.
--
-- ⚠️ THE CONDITION ON THIS RULING WAS "CHECK IT AGAINST THE SIGNUP TRIGGER, NOT
-- IN THE ABSTRACT". Checked, and the answer is that signup NEVER TOUCHES THIS
-- POLICY:
--
--   * The only `INSERT INTO companies` anywhere in the repo is inside
--     `handle_new_user()` — every other hit is a prior redefinition of that same
--     function. There is NO app-side, API-route, edge-function or script insert
--     as `authenticated` (grepped across apps/, packages/, scripts/, supabase/).
--   * `handle_new_user()` is SECURITY DEFINER owned by `postgres`, and
--     `postgres` carries `rolbypassrls = true` [LIVE, pg_roles]. RLS does not
--     apply inside it at all.
--
-- So the policy is dead weight on the legitimate path and wide open on the
-- illegitimate one. Narrowing it forecloses nothing the product supports:
-- Josh's model is ONE LOGIN, ONE COMPANY — "a user will have to use a separate
-- email if they want access with a second company" — and a second email is a
-- second `auth.uid()` with no profile, which passes.
--
-- WHY `get_my_company_id() IS NULL` AND NOT A `profiles` SUBQUERY. A subquery
-- against `profiles` inside a policy is evaluated as the CALLER and therefore
-- hits `profiles`' own RLS — the trap CLAUDE.md records for storage policies and
-- SECURITY DEFINER triggers. `get_my_company_id()` is the platform's existing
-- SECURITY DEFINER helper, owned by `postgres`, already relied on by ~266
-- policies. Using anything else here would be inventing a second answer to a
-- question the platform already answers one way.
--
-- KNOWN AND ACCEPTED: `get_my_company_id()` filters `is_deleted = false`, so a
-- user whose profile has been SOFT-DELETED resolves to NULL and may create a new
-- company. That is the intended reading — a user removed from their company is
-- starting over — and it is a far narrower hole than "any authenticated user,
-- unlimited". Recorded rather than discovered later.
--
-- STRICTLY TIGHTER OPTION, DELIBERATELY NOT TAKEN: because signup bypasses RLS,
-- the INSERT policy could be DROPPED outright and nothing would break today.
-- Option (a) was ruled, and it preserves a company-less authenticated user's
-- ability to create one — a path the product may want and does not have to
-- re-litigate later. Noted so a future session knows the tighter door exists.
--
-- ----------------------------------------------------------------------------
-- GROUP A — M1-06. The `updated_by` half of the trigger holdover.
-- ----------------------------------------------------------------------------
--
-- ⚠️ THE FINDING WAS HALF WRONG, AND THE CORRECTION IS WHY THIS MIGRATION IS
-- SMALLER THAN IT WAS SPECCED TO BE.
--
-- `companies_updated_at` ALREADY EXISTS [LIVE, pg_trigger] — BEFORE UPDATE FOR
-- EACH ROW EXECUTE FUNCTION update_updated_at(), which sets
-- `NEW.updated_at = now()` unconditionally. So:
--
--   * S151's M1-06 said 7I's `setClientContractsEnabled()` "never advances
--     updated_at". FALSE. The trigger stamps it regardless of the payload.
--   * The eight service call sites that set `updated_at` by hand are pure
--     REDUNDANCY, not load-bearing — the trigger overwrites them. Removing that
--     line is what CLAUDE.md's service-layer contract already requires; this
--     migration is what makes the removal safe to state.
--   * `CLAUDE.md`'s "Known holdover" note and the comments in
--     `company-client.ts` both conflate the two triggers. Corrected in this pass.
--
-- What is genuinely missing is `companies_set_updated_by`, and it cannot be
-- installed as-is because **`companies` has no `updated_by` column at all**
-- [LIVE, information_schema] — nor `created_by`, `is_deleted` or `deleted_at`.
-- The column is added here because the trigger cannot exist without it.
--
-- `created_by` is deliberately NOT added. Its convention is a column DEFAULT of
-- `auth.uid()`, and the only INSERT path is `handle_new_user()`, an AFTER INSERT
-- trigger on `auth.users` where there is no JWT and `auth.uid()` is NULL. A
-- `created_by` column would therefore be NULL on every real company row while
-- looking like an audit trail. Adding it would be worse than not having it.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. GROUP B — the INSERT policy.
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS companies_insert_authenticated ON public.companies;

CREATE POLICY companies_insert_unaffiliated ON public.companies
  FOR INSERT TO authenticated
  WITH CHECK (public.get_my_company_id() IS NULL);

COMMENT ON POLICY companies_insert_unaffiliated ON public.companies IS
  'M1-02 [S152]. One login, one company: a caller who already belongs to a company cannot create another. Signup is unaffected — handle_new_user() is SECURITY DEFINER owned by postgres (rolbypassrls) and never evaluates this policy. Replaces companies_insert_authenticated, which was WITH CHECK (true).';

-- ----------------------------------------------------------------------------
-- 2. GROUP A — `updated_by`, and the trigger that maintains it.
-- ----------------------------------------------------------------------------

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id);

COMMENT ON COLUMN public.companies.updated_by IS
  'M1-06 [S152]. Maintained by the companies_set_updated_by trigger. Added because the trigger CLAUDE.md mandates for every per-tenant table could not be installed without it. NULL on rows last written before S152, and on any write with no JWT (the signup trigger).';

-- Per-table function, per CLAUDE.md's naming convention:
-- set_{table_name}_updated_by() / {table_name}_set_updated_by.
CREATE OR REPLACE FUNCTION public.set_companies_updated_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

DROP TRIGGER IF EXISTS companies_set_updated_by ON public.companies;
CREATE TRIGGER companies_set_updated_by
  BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.set_companies_updated_by();

-- NOTE: `companies_updated_at` is NOT created here. It already exists and has
-- since before this audit — see the header. Creating it again would be a no-op
-- at best and a second timestamp writer at worst.
