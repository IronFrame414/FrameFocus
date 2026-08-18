-- ============================================================================
-- Module 2 audit fixes — GROUP A. Soft delete works again. (S154)
-- ============================================================================
--
-- Finding: `docs/specs/S153-m2-audit.md` §1 M2-02. Ruling: Josh, S154.
--
-- ----------------------------------------------------------------------------
-- WHAT WAS WRONG — soft delete was IMPOSSIBLE, not merely awkward
-- ----------------------------------------------------------------------------
-- `contacts_select_authenticated` and `subcontractors_select_authenticated` both
-- carried `AND is_deleted = false`. PostgREST's UPDATE returns rows, so the
-- UPDATED row must still satisfy the SELECT policy — and a row with
-- `is_deleted = true` cannot. Postgres answered:
--
--     42501 — new row violates row-level security policy for table "contacts"
--
-- Isolated column by column at S153 as a real Owner: `last_name`, `status` and
-- even `deleted_at` all wrote fine. ONLY `is_deleted = true` was refused.
--
-- Corroborated by a count, not by reading code: **0 of 22 contacts, and 0
-- subcontractors, had ever been soft-deleted.** The "Delete" button in
-- `contacts-list.tsx:39` has never once succeeded, and `:44` alerted the raw
-- Postgres string to the user.
--
-- This is a violation of CLAUDE.md's own trash-bin rule, which is explicit:
-- *"RLS policies do not filter on `is_deleted`. Filtering is enforced in the
-- service layer, not in RLS. This is deliberate: a restore-from-trash flow must
-- be able to read soft-deleted rows."*
--
-- `contact_addresses` never carried the clause and soft-deletes correctly, which
-- is what ruled out "deliberate design": one module, two tables, opposite
-- answers.
--
-- ----------------------------------------------------------------------------
-- ⚠️ THE LIST SURFACES WERE SWEPT BEFORE THIS RAN. That ordering was the whole
-- risk in this change, and it is discharged, not assumed:
-- ----------------------------------------------------------------------------
-- Removing the clause means RLS stops hiding deleted rows, so anything relying
-- on RLS rather than its own filter would start rendering them. Every read of
-- both tables was enumerated at S154 [REPO]:
--
--   contacts — 3 service reads + 10 consumers.
--     * LIST: `getContacts()` (contacts.ts:24) and `listContactOptions()`
--       (contacts-client.ts:61) — BOTH already `.eq('is_deleted', false)`.
--     * The other 10 are BY-ID (`.eq('id', …)` / `.in('id', …)`): proposal,
--       invoice, CO, lien-release and the four send routes. A by-id resolve of a
--       counterparty a document was already made out to MUST NOT filter — that
--       is the same convention, and they were correct before this change and
--       remain correct after it.
--
--   subcontractors — 7 reads.
--     * LIST: `getSubcontractors()` (subcontractors.ts:19) and the picker
--       (subcontractors-client.ts:121) — BOTH already filter.
--     * The rest are by-`member_id` or by-name lookups; all already filter.
--
-- **No surface depended on the RLS filter.** Nothing starts showing deleted rows.
--
-- ----------------------------------------------------------------------------
-- ⚠️ DELIBERATE ASYMMETRY — DO NOT "FIX" THIS IN A LATER PASS [RULED Josh, S154]
-- ----------------------------------------------------------------------------
-- `contact_addresses` KEEPS its hard DELETE policy. Josh's words: *"just hard
-- delete, no reason for those to stay."*
--
--   * ADDRESSES hard delete. They are a detail of a contact, cheap to re-enter,
--     and `estimates.contact_address_id` / `projects.contact_address_id` are
--     both `ON DELETE NO ACTION`, so an address a document actually references
--     cannot be removed. The FK is the guard.
--   * CONTACTS and SUBCONTRACTORS soft delete. Josh explicitly REJECTED
--     extending hard delete to contacts, which carry FKs from estimates,
--     projects, invoices, payments, refunds and contracts.
--
-- S153 filed the difference as M2-08 (a consistency finding). It is now a
-- RULING. A later pass that "harmonises" these two is undoing a decision.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. contacts — same policy, minus the is_deleted clause.
--    The company scoping and the S131 role floor are UNCHANGED.
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS contacts_select_authenticated ON public.contacts;

CREATE POLICY contacts_select_authenticated ON public.contacts
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() <> ALL (ARRAY['subcontractor'::text, 'client'::text])
  );

COMMENT ON POLICY contacts_select_authenticated ON public.contacts IS
  'M2-02 [S154]. Company scoping + the S131 roster floor. Deliberately does NOT filter is_deleted: PostgREST UPDATE returns rows, so an is_deleted filter here makes soft delete impossible, and a restore flow could never read the row back. Deleted rows are filtered in the service layer (getContacts, listContactOptions).';

-- ----------------------------------------------------------------------------
-- 2. subcontractors — identical change, identical reason.
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS subcontractors_select_authenticated ON public.subcontractors;

CREATE POLICY subcontractors_select_authenticated ON public.subcontractors
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() <> ALL (ARRAY['subcontractor'::text, 'client'::text])
  );

COMMENT ON POLICY subcontractors_select_authenticated ON public.subcontractors IS
  'M2-02 [S154]. See contacts_select_authenticated — same defect, same fix. Deleted rows are filtered in the service layer (getSubcontractors, listSubcontractorOptions).';

-- ----------------------------------------------------------------------------
-- 3. The asymmetry, recorded on the table itself so it is found in place.
-- ----------------------------------------------------------------------------

COMMENT ON TABLE public.contact_addresses IS
  'M2 addresses. HARD DELETE is deliberate [RULED Josh, S154] — an address is a detail of a contact, and estimates/projects.contact_address_id are ON DELETE NO ACTION so a referenced one cannot be removed. contacts and subcontractors SOFT delete instead, because they carry FKs from estimates, projects, invoices, payments and contracts. Do not harmonise these two; the difference is a decision.';
