-- ============================================================
-- FrameFocus — Migration 022: tag_options column defaults (Module 3H)
-- ============================================================
-- Sets Postgres column defaults so the client service can insert
-- into `tag_options` without manually looking up auth.uid() and
-- profile.company_id on every write. RLS still enforces that
-- the resulting row matches the user's company.
--
-- Mirrors Migration 018 (files column defaults).
-- ============================================================
ALTER TABLE tag_options ALTER COLUMN created_by SET DEFAULT auth.uid();
ALTER TABLE tag_options ALTER COLUMN updated_by SET DEFAULT auth.uid();
ALTER TABLE tag_options ALTER COLUMN company_id SET DEFAULT get_my_company_id();