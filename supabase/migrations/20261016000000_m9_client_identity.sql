-- ============================================================================
-- Module 9 stage 1 — THE CLIENT PRINCIPAL. Identity, not access. (S164)
-- ============================================================================
--
-- Spec: `docs/specs/9-spec.md` §3 (R1-R5) and its open `§S`. Phase 1 findings:
-- `docs/specs/S164-m9-phase1-findings.md`. Rulings: Josh, S164 Phase 2 Q1/Q4.
--
-- This migration gives a client an IDENTITY and the two grants over her OWN
-- data. It grants NO access to project content — no files, no invoices, no
-- change orders, no schedule. Those are stage 2 and 3, and each is its own
-- policy arm proved against its own counterfactual.
--
-- ----------------------------------------------------------------------------
-- 1 — THE SHAPE, AND THE ONE THAT WAS REJECTED [RULED Josh, S164]
-- ----------------------------------------------------------------------------
-- `profiles.contact_id`, nullable + UNIQUE. Client policy arms use the
-- SECURITY DEFINER helpers below and NEVER `can_view_project()`.
--
-- ⚠️ THE REJECTED OPTION WAS "GIVE CLIENTS A `company_members` ROW", and the
-- reason it was rejected is worth keeping next to the column it explains.
-- Measured live at S164 against `pg_policies`: a client holding a member row
-- plus a project assignment would satisfy **21 policies across 18 tables** that
-- no client-specific rule mentions at all. Six of those are WRITES, including
-- `punch_lists` INSERT **and UPDATE** and `punch_list_items` INSERT — and
-- `9-spec.md` §5 (R14) rules the punch list **NO** for clients. The shape would
-- therefore have granted, as a side effect, write access to the exact surface
-- the requirements withhold. Josh: "permissions that have to be taken back are
-- worse than permissions never granted."
--
-- A second reason, from §3 `§S` itself: `get_my_member_id()` and
-- `can_view_project()` are called by policies across the whole application, and
-- giving clients member rows changes what they return **for every existing
-- caller**, silently. The helpers below are new, so nothing existing changes
-- meaning when they land.
--
-- ⚠️ `create_member_for_new_profile()` ALREADY SKIPS `client` —
-- `IF NEW.role IN ('client','subcontractor') THEN RETURN NEW; END IF;`. So "no
-- member row" is enforced at INSERT and is not merely the current state of the
-- fixtures. Do not "fix" that trigger to be uniform; it is load-bearing.
--
-- ----------------------------------------------------------------------------
-- 2 — WHY THESE HELPERS ARE FLAT, AND MUST STAY FLAT
-- ----------------------------------------------------------------------------
-- `docs/specs/S163-can-view-project-mechanism.md` §3 measured the cost of a
-- SECURITY DEFINER helper against the number of user functions its body calls:
--
--     0 nested calls -> 12-16 us/row      (is_project_creator, get_my_member_id)
--     1 nested call  -> 197 us/row        (is_assigned_to_project)
--     3 nested calls -> 590 us/row        (can_view_project)
--
-- Every helper below calls **zero** user functions — each reads `profiles`
-- directly rather than going through `get_my_company_id()` / `get_my_role()` /
-- `get_my_profile_id()`. That is deliberate and it is the whole reason the
-- portal's hot path is not built on `can_view_project()`.
--
-- ⚠️ IF YOU EDIT THESE, DO NOT "TIDY" THEM BY SUBSTITUTING THE HELPERS. The
-- duplicated `WHERE user_id = auth.uid() AND is_deleted = false` is not
-- copy-paste that someone forgot to factor out. Factoring it out costs roughly
-- an order of magnitude per row, and it will not fail any test.
--
-- ----------------------------------------------------------------------------
-- 3 — WHY NEW POLICIES RATHER THAN EDITS TO THE EXISTING ONES
-- ----------------------------------------------------------------------------
-- Every client grant M9 ships is its OWN policy, named `*_client_*`, added
-- alongside the existing floor rather than OR'd into it. Three reasons:
--
--   a. Permissive policies are OR'd, so an additive policy is the correct
--      mechanism for a WIDENING. (The S131 trap is the opposite case — a narrow
--      policy added next to a wide one narrows nothing. Widening is the
--      direction this mechanism actually works in.)
--   b. The whole M9 client surface is then auditable as one set:
--      `SELECT * FROM pg_policies WHERE policyname LIKE '%_client_%'`.
--   c. It is reversible by DROP, without reconstructing a floor that S131, S154
--      and S163 each tightened for reasons of their own. Editing
--      `contacts_select_authenticated` to bolt on an OR would put an M9 concern
--      inside a policy three prior sessions are invested in.
--
-- ----------------------------------------------------------------------------
-- 4 — WHAT THIS MIGRATION DELIBERATELY DOES NOT DO
-- ----------------------------------------------------------------------------
-- **No lifecycle gate yet.** R2/R5 put the access window at 45 days after
-- project completion, and R17 defines three termination states. Neither is in
-- `is_client_of_project()` yet — that is stage 2. The seam is marked in the
-- function body. It is ONE function, so stage 2 changes one place and every
-- policy arm built on it inherits the gate. **Do not add the window to a policy
-- instead**; that is how the two surfaces in #129 came to disagree.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The link.
-- ----------------------------------------------------------------------------
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL;

COMMENT ON COLUMN profiles.contact_id IS
  'M9 [S164]: the client account''s counterparty record. NULL for every non-client. '
  'UNIQUE — one contact, at most one login. `profiles.email` is the credential; '
  '`contacts.email` is the business record the invite is SENT to. They are not '
  'kept in sync and contacts.email is NOT a fallback credential [RULED Josh, S164 Q1].';

-- One contact, at most one account. Josh, S164 Q1: a person cannot hold
-- accounts with two different contractors, so `profiles.company_id NOT NULL` is
-- already correct and this is the matching rule on the other side.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_contact_id_key
  ON profiles (contact_id) WHERE contact_id IS NOT NULL;

-- `contact_id` is meaningless on a non-client, and a role change AWAY from
-- client that left it set would leave a dangling portal grant behind. This
-- makes that change fail loudly and demand an explicit unlink.
--
-- ⚠️ NOT the constraint M2-04 rejected. That ruling was about `contacts.email`
-- and about never blocking a contractor from saving their own lead. This column
-- is internal, written only by the M9 invite path, and never touched by a user
-- filling in a form.
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_contact_id_client_only;
ALTER TABLE profiles ADD CONSTRAINT profiles_contact_id_client_only
  CHECK (contact_id IS NULL OR role = 'client');

-- ----------------------------------------------------------------------------
-- 2. The helpers. Zero nested user-function calls each — see §2 above.
-- ----------------------------------------------------------------------------

-- The caller's own contact record, or NULL for anyone who is not a linked
-- client. Self-gating on role, so a policy arm using it cannot leak to a
-- non-client even if the arm forgets its own role check.
CREATE OR REPLACE FUNCTION public.get_my_contact_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT p.contact_id
  FROM profiles p
  WHERE p.user_id = auth.uid()
    AND p.is_deleted = false
    AND p.role = 'client'
  LIMIT 1;
$fn$;

-- Is the caller the client of this project?
--
-- TWO ARMS, because R3 says the client side is not one person:
--   a. `projects.contact_id`     — the primary client on the job
--   b. `project_contacts`        — the additional contacts R3 requires
--
-- ⚠️ THIS IS THE ONLY PLACE A CLIENT'S PROJECT SCOPE IS DECIDED. Stage 2's
-- 45-day window (R2/R5) and the three termination states (R17) belong HERE,
-- inside this function, not in the policies that call it.
CREATE OR REPLACE FUNCTION public.is_client_of_project(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM profiles me
    JOIN projects pr
      ON pr.id = p_project_id
     AND pr.company_id = me.company_id
     AND pr.is_deleted = false
    WHERE me.user_id = auth.uid()
      AND me.is_deleted = false
      AND me.role = 'client'
      AND me.contact_id IS NOT NULL
      AND (
        pr.contact_id = me.contact_id
        OR EXISTS (
          SELECT 1
          FROM project_contacts pc
          WHERE pc.project_id = pr.id
            AND pc.contact_id = me.contact_id
            AND pc.is_deleted = false
        )
      )
  );
$fn$;

-- The site addresses of the caller's own projects — ONE address per project,
-- the one the project points at.
--
-- ⚠️ NOT the contact's address list, and that distinction IS the grant.
-- Deliberately the same shape as `my_assigned_site_address_ids()`
-- (`20261006000000`, the S154 sub grant), for the same reason stated there: a
-- client has a HOME address and one or more SITE addresses on the same contact
-- record, and "let her read her contact's addresses" would hand back the home
-- address she is not asking about. Josh, S164 Q4: "do not unlock the contact's
-- address list."
CREATE OR REPLACE FUNCTION public.my_client_site_address_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT pr.contact_address_id
  FROM profiles me
  JOIN projects pr
    ON pr.company_id = me.company_id
   AND pr.is_deleted = false
   AND pr.contact_address_id IS NOT NULL
  WHERE me.user_id = auth.uid()
    AND me.is_deleted = false
    AND me.role = 'client'
    AND me.contact_id IS NOT NULL
    AND (
      pr.contact_id = me.contact_id
      OR EXISTS (
        SELECT 1
        FROM project_contacts pc
        WHERE pc.project_id = pr.id
          AND pc.contact_id = me.contact_id
          AND pc.is_deleted = false
      )
    );
$fn$;

-- ----------------------------------------------------------------------------
-- 3. The two grants over the client's OWN data. [RULED Josh, S164 Q4]
-- ----------------------------------------------------------------------------
-- Additive policies, per §3 above. `contacts_select_authenticated` and
-- `contact_addresses_select_scoped` are NOT modified.

-- Her own contact record. Exactly one row: `id = get_my_contact_id()`.
-- Every other contact in the company stays refused by the existing floor.
DROP POLICY IF EXISTS contacts_select_client_own ON contacts;
CREATE POLICY contacts_select_client_own ON contacts
  FOR SELECT USING (
    company_id = (
      SELECT p.company_id FROM profiles p
      WHERE p.user_id = auth.uid() AND p.is_deleted = false
      LIMIT 1
    )
    AND id = get_my_contact_id()
  );

-- The site address of a project she is the client of. Never her home address,
-- never another contact's anything.
DROP POLICY IF EXISTS contact_addresses_select_client_site ON contact_addresses;
CREATE POLICY contact_addresses_select_client_site ON contact_addresses
  FOR SELECT USING (
    company_id = (
      SELECT p.company_id FROM profiles p
      WHERE p.user_id = auth.uid() AND p.is_deleted = false
      LIMIT 1
    )
    AND id IN (SELECT my_client_site_address_ids())
  );
