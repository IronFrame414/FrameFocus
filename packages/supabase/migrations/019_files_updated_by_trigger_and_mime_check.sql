-- ============================================================
-- FrameFocus — Migration 019: files updated_by trigger + mime_type check
-- ============================================================
-- Closes tech debt #43 (Session 15).
-- Two changes to the files table introduced in Migration 016:
--   1. BEFORE UPDATE trigger that stamps updated_by = auth.uid()
--      on every row update (mirrors the updated_at trigger pattern).
--   2. CHECK constraint ensuring mime_type is never an empty string.
-- ============================================================

-- ----------------------------------------
-- updated_by trigger
-- ----------------------------------------

CREATE OR REPLACE FUNCTION set_files_updated_by()
  RETURNS TRIGGER
  LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;

CREATE TRIGGER files_set_updated_by
  BEFORE UPDATE ON files
  FOR EACH ROW
  EXECUTE FUNCTION set_files_updated_by();

-- ----------------------------------------
-- mime_type non-empty constraint
-- ----------------------------------------

ALTER TABLE files
  ADD CONSTRAINT files_mime_type_not_empty CHECK (mime_type <> '');
