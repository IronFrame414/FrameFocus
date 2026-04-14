-- ============================================================
-- FrameFocus — Migration 019: contacts + subcontractors defaults and trigger
-- ============================================================
-- Closes tech debt #23 (Session 24).
-- Brings contacts and subcontractors into alignment with the
-- pattern established for `files` in migrations 017 and 018:
--   1. Postgres column defaults for company_id, created_by, updated_by
--      so the client service layer doesn't manually look them up.
--   2. BEFORE UPDATE trigger that stamps updated_by = auth.uid()
--      on every row update.
--
-- RLS policies still enforce that the resulting row matches the
-- user's company. These defaults are a convenience, not a security
-- boundary.
-- ============================================================

-- ----------------------------------------
-- contacts: column defaults
-- ----------------------------------------
ALTER TABLE contacts ALTER COLUMN company_id  SET DEFAULT get_my_company_id();
ALTER TABLE contacts ALTER COLUMN created_by  SET DEFAULT auth.uid();
ALTER TABLE contacts ALTER COLUMN updated_by  SET DEFAULT auth.uid();

-- ----------------------------------------
-- contacts: updated_by trigger
-- ----------------------------------------
CREATE OR REPLACE FUNCTION set_contacts_updated_by()
  RETURNS TRIGGER
  LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;

CREATE TRIGGER contacts_set_updated_by
  BEFORE UPDATE ON contacts
  FOR EACH ROW
  EXECUTE FUNCTION set_contacts_updated_by();

-- ----------------------------------------
-- subcontractors: column defaults
-- ----------------------------------------
ALTER TABLE subcontractors ALTER COLUMN company_id  SET DEFAULT get_my_company_id();
ALTER TABLE subcontractors ALTER COLUMN created_by  SET DEFAULT auth.uid();
ALTER TABLE subcontractors ALTER COLUMN updated_by  SET DEFAULT auth.uid();

-- ----------------------------------------
-- subcontractors: updated_by trigger
-- ----------------------------------------
CREATE OR REPLACE FUNCTION set_subcontractors_updated_by()
  RETURNS TRIGGER
  LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;

CREATE TRIGGER subcontractors_set_updated_by
  BEFORE UPDATE ON subcontractors
  FOR EACH ROW
  EXECUTE FUNCTION set_subcontractors_updated_by();