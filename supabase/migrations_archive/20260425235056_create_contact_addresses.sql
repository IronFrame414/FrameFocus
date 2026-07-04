-- ============================================================
-- FrameFocus — Migration: contact_addresses (Sub-module 4A)
-- ============================================================
-- Lifts address fields off the `contacts` table into a dedicated
-- `contact_addresses` table. Existing contact UI continues to show
-- and edit a single primary address. Multi-address management UI
-- lands later in sub-module 4D.
--
-- References: SPEC.md at repo root, docs/module4-architecture.md §4.14.
-- Decision (Session 42): Option A — schema migration + primary-
-- address-only UI. Multi-address UI deferred to 4D. Existing contacts
-- hold throwaway test data only — no data migration; address columns
-- are dropped without preserving values.
-- ============================================================

-- ----------------------------------------
-- Table
-- ----------------------------------------

CREATE TABLE contact_addresses (
  -- Standard columns
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  created_by      UUID REFERENCES auth.users(id),
  updated_by      UUID REFERENCES auth.users(id),
  is_deleted      BOOLEAN DEFAULT false,
  deleted_at      TIMESTAMPTZ,

  -- Relationship
  contact_id      UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,

  -- Address data (per SPEC § "Decisions made in this SPEC")
  --   label is required only when a contact has more than one address (4D);
  --   primary address may have no label. address_line2 is optional.
  label           TEXT,
  address_line1   TEXT NOT NULL,
  address_line2   TEXT,
  city            TEXT NOT NULL,
  state           TEXT NOT NULL,
  zip             TEXT NOT NULL,

  -- Caller sets true on the primary. Partial unique index below enforces
  -- at most one active primary per contact.
  is_primary      BOOLEAN NOT NULL DEFAULT false
);

-- ----------------------------------------
-- Per-tenant column defaults
-- (CLAUDE.md "Per-tenant table column-defaults checklist")
-- ----------------------------------------

ALTER TABLE contact_addresses ALTER COLUMN company_id SET DEFAULT get_my_company_id();
ALTER TABLE contact_addresses ALTER COLUMN created_by SET DEFAULT auth.uid();
ALTER TABLE contact_addresses ALTER COLUMN updated_by SET DEFAULT auth.uid();

-- ----------------------------------------
-- Indexes
-- ----------------------------------------

CREATE INDEX idx_contact_addresses_company_id ON contact_addresses(company_id);
CREATE INDEX idx_contact_addresses_contact_id ON contact_addresses(contact_id);

-- At most one primary address per contact (active rows only).
CREATE UNIQUE INDEX idx_contact_addresses_one_primary
  ON contact_addresses(contact_id)
  WHERE is_primary = true AND is_deleted = false;

-- ----------------------------------------
-- Standard triggers (BEFORE UPDATE)
--   updated_at trigger reuses the shared `update_updated_at()` function
--   from Migration 20260101000001. updated_by trigger follows the
--   per-table function pattern established in Migrations 018, 019, and
--   the `tag_options` migration.
-- ----------------------------------------

CREATE TRIGGER contact_addresses_updated_at
  BEFORE UPDATE ON contact_addresses
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE FUNCTION set_contact_addresses_updated_by()
  RETURNS TRIGGER
  LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;

CREATE TRIGGER contact_addresses_set_updated_by
  BEFORE UPDATE ON contact_addresses
  FOR EACH ROW
  EXECUTE FUNCTION set_contact_addresses_updated_by();

-- ----------------------------------------
-- Row-Level Security
--   Standard four policies (SELECT, INSERT, UPDATE, DELETE) all scoped
--   to company_id only — no role restriction (per SPEC §RLS policies).
--   RLS does NOT filter is_deleted; the service layer enforces that
--   per CLAUDE.md trash-bin pattern (so a restore-from-trash flow can
--   read soft-deleted rows by id).
-- ----------------------------------------

ALTER TABLE contact_addresses ENABLE ROW LEVEL SECURITY;

CREATE POLICY contact_addresses_select_authenticated ON contact_addresses
  FOR SELECT
  TO authenticated
  USING (company_id = get_my_company_id());

CREATE POLICY contact_addresses_insert_authenticated ON contact_addresses
  FOR INSERT
  TO authenticated
  WITH CHECK (company_id = get_my_company_id());

CREATE POLICY contact_addresses_update_authenticated ON contact_addresses
  FOR UPDATE
  TO authenticated
  USING (company_id = get_my_company_id())
  WITH CHECK (company_id = get_my_company_id());

-- DELETE policy intentionally included even though no 4A service function
-- performs a hard DELETE. Reasons (per SPEC):
--   (a) keeps the table contract consistent with every other per-tenant
--       table in the project,
--   (b) ON DELETE CASCADE from contacts may invoke it during admin cleanup,
--   (c) avoids a migration revisit when 4D or a later session adds
--       delete paths.
CREATE POLICY contact_addresses_delete_authenticated ON contact_addresses
  FOR DELETE
  TO authenticated
  USING (company_id = get_my_company_id());

-- ----------------------------------------
-- Drop address columns from contacts
--   Test data only — no preservation needed per SPEC.
-- ----------------------------------------

ALTER TABLE contacts DROP COLUMN address_line1;
ALTER TABLE contacts DROP COLUMN address_line2;
ALTER TABLE contacts DROP COLUMN city;
ALTER TABLE contacts DROP COLUMN state;
ALTER TABLE contacts DROP COLUMN zip;
