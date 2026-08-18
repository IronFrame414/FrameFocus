-- ============================================================================
-- Module 2 audit fixes — GROUP B. Floor the addresses, then grant the site. (S154)
-- ============================================================================
--
-- Finding: `docs/specs/S153-m2-audit.md` §1 M2-01. Rulings: Josh, S154.
--
-- ⚠️ SEQUENCED AFTER `20261005000000` ON PURPOSE. That migration removed
-- `is_deleted = false` from `contacts_select_authenticated`. Copying the
-- contacts policy shape BEFORE it would have propagated M2-02's defect to a
-- second table — CC's own warning at S153, and it stands. The floor below is
-- written from the corrected shape.
--
-- ----------------------------------------------------------------------------
-- B1 — WHAT WAS WRONG. The S131 floor stopped at the contact.
-- ----------------------------------------------------------------------------
-- `contact_addresses_select_authenticated` was `company_id = get_my_company_id()`
-- and NOTHING ELSE, while `contacts_select_authenticated` excludes
-- `subcontractor` and `client`. Proved live at S153 (`s153-m2-audit.live.ts` F1):
-- a subcontractor read `[]` from `contacts` and the full
-- `address_line1, city, state, zip` of that same contact — for EVERY address row
-- in the company, not one fixture row.
--
-- S131 exists because a subcontractor and a client each signed in and read the
-- company's contacts list. The fix floored `contacts`, `subcontractors` and the
-- two roster tables. The addresses hanging off those contacts were missed, and
-- an address is arguably the more sensitive half — a client's HOME address, read
-- by a role that cannot see their name.
--
-- ----------------------------------------------------------------------------
-- B2 — AND THEN A REAL GRANT. "Sub can see site address." [RULED Josh, S154]
-- ----------------------------------------------------------------------------
-- This is a NEW CAPABILITY, not a restoration. Verified before ruling: subs
-- cannot see a job-site address anywhere today — `apps/web/app/m/projects/`
-- contains no address reference at all, and subs are already floored out of
-- `contacts`. So B1 takes nothing away that anyone had.
--
-- ⚠️ THE SCOPING TRAP, AND HOW IT IS AVOIDED. `contact_addresses` hangs off the
-- CONTACT, not the project. A client may have a home address and several sites.
-- Granting "the assigned sub can see this contact's addresses" would re-open
-- B1's leak through a narrower door — the home address travels with the client.
--
-- So the grant resolves through `projects.contact_address_id`: an assigned
-- subcontractor sees **exactly the one address row their project points at**,
-- and nothing else on that contact. If a project has no site address, they see
-- nothing.
--
-- Scoped by ASSIGNMENT, not by role. A subcontractor with no assignment reads
-- nothing.
--
-- ⚠️ ENFORCED IN THE DATABASE, DELIBERATELY. `apps/web/app/m/detail-access.ts`
-- says in its own header that the sub exclusion on the detail routes is UI-only
-- and that RLS will not catch a bypass. B2 is not built on that guard.
--
-- ----------------------------------------------------------------------------
-- COST — measured, not assumed. See the S154 report and `S153-m2-audit.md`.
-- ----------------------------------------------------------------------------
-- Pass 1 measured `can_view_project()` at 636 µs and `is_assigned_to_project()`
-- at 203 µs PER ROW, because each is a per-row function call. Neither is used
-- here.
--
-- `my_assigned_site_address_ids()` takes NO argument and returns a SET, so
-- `id IN (SELECT …)` is an UNCORRELATED subquery: Postgres evaluates it ONCE per
-- query as an InitPlan and probes it per row by hash. It calls
-- `get_my_member_id()` exactly once, not once per row. This is pass 1's
-- "the rewrite that pays is set-based" applied at the point of writing rather
-- than retrofitted.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The set: which address rows may an assigned subcontractor see?
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.my_assigned_site_address_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  -- ONE address per assigned project: the site address the project points at.
  -- NOT the contact's other addresses — that distinction is the whole point.
  SELECT p.contact_address_id
  FROM project_assignments pa
  JOIN projects p ON p.id = pa.project_id
  WHERE pa.member_id = public.get_my_member_id()
    AND pa.is_deleted = false
    AND p.is_deleted = false
    AND p.contact_address_id IS NOT NULL;
$$;

COMMENT ON FUNCTION public.my_assigned_site_address_ids() IS
  'M2-01 / B2 [S154]. The contact_address rows the CALLER may see by virtue of a project assignment — exactly projects.contact_address_id for their assigned, non-deleted projects. Zero-argument and set-returning so `id IN (SELECT …)` hoists to one evaluation per query; do NOT convert this to a per-row is_assigned_to_project(project_id) call, which pass 1 measured at 203 microseconds PER ROW.';

-- ----------------------------------------------------------------------------
-- 2. The policy. Renamed, because its meaning changed and a same-named policy
--    with different behaviour is hard to spot in a diff. Precedent:
--    instrument_rates_select_company -> _select_owner_admin (S97),
--    companies_insert_authenticated -> _insert_unaffiliated (S152).
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS contact_addresses_select_authenticated ON public.contact_addresses;

CREATE POLICY contact_addresses_select_scoped ON public.contact_addresses
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND (
      -- B1: the S131 roster floor, matching contacts_select_authenticated.
      public.get_my_role() <> ALL (ARRAY['subcontractor'::text, 'client'::text])
      -- B2: or the site address of a project the caller is assigned to.
      OR id IN (SELECT public.my_assigned_site_address_ids())
    )
  );

COMMENT ON POLICY contact_addresses_select_scoped ON public.contact_addresses IS
  'M2-01 [S154]. B1: the S131 roster floor, which stopped at contacts and missed the addresses hanging off them. B2: an ASSIGNED subcontractor additionally sees the ONE site address their project points at (projects.contact_address_id) and nothing else on that contact — a client home address never travels with the grant. Deliberately does NOT filter is_deleted (M2-02 / the trash-bin convention).';
