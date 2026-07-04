-- Module 3I: Company-wide favorites on files
-- Anyone in the company can toggle is_favorite; everyone sees the same state.
-- No new RLS policies needed — existing files policies already cover this column.

ALTER TABLE files
  ADD COLUMN is_favorite BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX idx_files_is_favorite
  ON files (company_id, is_favorite)
  WHERE is_favorite = true AND is_deleted = false;