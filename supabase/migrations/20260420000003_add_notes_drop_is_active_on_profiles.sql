-- Migration 026: profiles cleanup
-- 1. Add notes column for team member notes (tech debt #17)
-- 2. Drop unused is_active column (verified zero callers Session 37)

ALTER TABLE profiles ADD COLUMN notes TEXT;

ALTER TABLE profiles DROP COLUMN is_active;