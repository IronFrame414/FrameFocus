-- ============================================================
-- FrameFocus — Migration 018: Files column defaults (Module 3)
-- ============================================================
-- Sets Postgres column defaults so the service layer can insert
-- into `files` without manually looking up auth.uid() and
-- profile.company_id on every write. RLS still enforces that
-- the resulting row matches the user's company.
--
-- This pattern is new in Module 3. Earlier modules (contacts,
-- subcontractors) still do manual lookups in their client
-- services and will be migrated in a later polish session.
-- ============================================================

ALTER TABLE files ALTER COLUMN created_by SET DEFAULT auth.uid();
ALTER TABLE files ALTER COLUMN updated_by SET DEFAULT auth.uid();
ALTER TABLE files ALTER COLUMN company_id SET DEFAULT get_my_company_id();