-- ============================================================================
-- contact_addresses — a WRITE role floor. RULED [S121, Josh].
-- ============================================================================
--
-- "CREW AND SUBS CANNOT EDIT, CREATE OR DELETE CONTACT ADDRESSES.
--  contact_addresses has no role floor at all today — company_id only. That
--  needs a migration, not a UI change."
--
-- WHAT WAS THERE, quoted from 20260101000000_baseline_schema.sql so the change
-- is legible without a second file open:
--
--   contact_addresses_insert_authenticated
--     WITH CHECK (company_id = public.get_my_company_id())
--   contact_addresses_update_authenticated
--     USING (company_id = public.get_my_company_id())
--     WITH CHECK (company_id = public.get_my_company_id())
--   contact_addresses_delete_authenticated
--     USING (company_id = public.get_my_company_id())
--
-- Tenant scoping and nothing else. Every role in the company — crew, foreman
-- and subcontractor included — could rewrite or permanently DELETE any
-- contact's address, including a client's. Found while auditing the mobile edit
-- surfaces (docs/specs/M6M-edit-surfaces-spec.md, finding 3): M-36 renders the
-- address, so the obvious mobile edit form would have been the first
-- field-facing route to a table that gates nothing.
--
-- ----------------------------------------------------------------------------
-- THE FLOOR IS owner / admin / project_manager, AND THAT EXCLUDES FOREMAN
-- ----------------------------------------------------------------------------
-- ⛔ RULED HERE, NOT BY JOSH'S SENTENCE — flagged so it can be reversed on
-- purpose rather than discovered. The ruling names CREW and SUBS. It is silent
-- on FOREMAN, and foreman is neither.
--
-- This migration mirrors the PARENT table exactly:
--
--   contacts_insert_authorized / contacts_update_authorized
--     role = ANY (ARRAY['owner','admin','project_manager'])   (baseline:3255, :3277)
--
-- An address is a column of a contact that happens to live on its own row —
-- Migration 028 split it for cardinality, not for permissions. A floor that
-- admitted foreman to the child while the parent refuses them would mean a
-- foreman could not correct a typo in a client's NAME but could move that
-- client to a different street, which is not a coherent permission. Matching
-- the parent is the only arrangement where "who may edit this contact" has one
-- answer.
--
-- ----------------------------------------------------------------------------
-- SELECT IS DELIBERATELY UNTOUCHED
-- ----------------------------------------------------------------------------
-- The ruling is about EDIT, CREATE and DELETE — three verbs, named. Reading an
-- address is what makes a site visit possible, M-36 renders it to every role
-- that can reach a contact, and narrowing SELECT here would break that screen
-- for the field users it exists for. `contact_addresses_select_authenticated`
-- stays as it is.
--
-- ----------------------------------------------------------------------------
-- WITH CHECK ON BOTH ARMS OF UPDATE — and why, given finding 4
-- ----------------------------------------------------------------------------
-- The old UPDATE policy already carried WITH CHECK, and it is kept. Note the
-- contrast the audit turned up: `contacts_update_authorized`,
-- `subcontractors_update_authorized` and `company_members_update_authorized`
-- carry USING with NO WITH CHECK, so an authorised caller can move one of those
-- rows to another tenant. That is finding 4 — pre-existing, desktop-wide, and
-- deliberately NOT fixed here: this migration implements one ruling, and
-- rewriting three unrelated policies inside it would be the kind of drive-by
-- that makes a revert dangerous. Filed separately.
--
-- REBUILD-TEST ONLY. Evidence: test/s121-contact-addresses-floor.live.ts, a
-- failing-then-passing pair per verb under the S90 impersonation harness — real
-- user JWTs on the anon key, never `postgres`, which would bypass RLS and prove
-- nothing.
-- ============================================================================

-- INSERT ----------------------------------------------------------------------
DROP POLICY IF EXISTS contact_addresses_insert_authenticated ON public.contact_addresses;

CREATE POLICY contact_addresses_insert_authorized ON public.contact_addresses
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text])
  );

-- UPDATE ----------------------------------------------------------------------
DROP POLICY IF EXISTS contact_addresses_update_authenticated ON public.contact_addresses;

CREATE POLICY contact_addresses_update_authorized ON public.contact_addresses
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text])
  )
  -- Kept from the original. Without it an authorised caller could set
  -- company_id to another tenant on the way out — the hole finding 4 records
  -- on the three tables that lack this clause.
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text])
  );

-- DELETE ----------------------------------------------------------------------
DROP POLICY IF EXISTS contact_addresses_delete_authenticated ON public.contact_addresses;

CREATE POLICY contact_addresses_delete_authorized ON public.contact_addresses
  FOR DELETE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text])
  );

COMMENT ON TABLE public.contact_addresses IS
  'Contact addresses (Migration 028). WRITE floor owner/admin/project_manager [S121] — mirrors the '
  'parent contacts table exactly; foreman is excluded because the parent excludes it. SELECT is '
  'company-wide by design: M-36 renders the address to every field role that can reach a contact.';
