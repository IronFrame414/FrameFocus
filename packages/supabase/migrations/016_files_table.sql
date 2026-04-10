-- ============================================================
-- FrameFocus — Migration 016: Files table (Module 3)
-- ============================================================
-- Creates the `files` table for Document & File Management.
-- project_id is nullable with NO foreign key constraint —
-- the projects table does not exist until Module 5.
-- ============================================================

CREATE TABLE files (
  -- Standard columns
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  created_by      UUID REFERENCES auth.users(id),
  updated_by      UUID REFERENCES auth.users(id),
  is_deleted      BOOLEAN DEFAULT false,
  deleted_at      TIMESTAMPTZ,

  -- File identity
  project_id      UUID,                                   -- nullable; no FK until Module 5 adds projects table
  category        TEXT NOT NULL CHECK (category IN (
                    'photos',
                    'contracts',
                    'plans',
                    'permits',
                    'invoices',
                    'change_orders',
                    'daily_logs',
                    'receipts',
                    'other'
                  )),
  file_name       TEXT NOT NULL,
  file_path       TEXT NOT NULL,                          -- Supabase Storage path
  file_size       BIGINT NOT NULL,                        -- bytes
  mime_type       TEXT NOT NULL,

  -- Tagging
  tags            TEXT[] DEFAULT '{}',                    -- user-applied tags
  ai_tags         TEXT[] DEFAULT '{}',                    -- GPT-4o vision auto-tags

  -- Versioning
  version         INTEGER DEFAULT 1,
  supersedes_id   UUID REFERENCES files(id),              -- points to previous version; NULL if first version

  -- Markup
  markup_data     JSONB                                   -- canvas annotation layer (nullable)
);

-- ----------------------------------------
-- Indexes
-- ----------------------------------------

CREATE INDEX idx_files_company_id  ON files(company_id);
CREATE INDEX idx_files_project_id  ON files(project_id);
CREATE INDEX idx_files_category    ON files(category);

-- ----------------------------------------
-- updated_at trigger
-- ----------------------------------------

CREATE TRIGGER files_updated_at
  BEFORE UPDATE ON files
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ----------------------------------------
-- Row-Level Security
-- ----------------------------------------

ALTER TABLE files ENABLE ROW LEVEL SECURITY;

-- SELECT: all company members except clients can read files
-- (client access to specific files is handled via a separate policy in Module 9)
CREATE POLICY files_select_non_client ON files
  FOR SELECT
  TO authenticated
  USING (
    company_id = get_my_company_id()
    AND get_my_role() != 'client'
  );

-- INSERT: any company member except client can upload files
CREATE POLICY files_insert_non_client ON files
  FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id = get_my_company_id()
    AND get_my_role() IN ('owner', 'admin', 'project_manager', 'foreman', 'crew_member')
  );

-- UPDATE: owner, admin, project_manager, foreman, crew_member can edit file metadata
-- (covers both soft-delete and restore — setting is_deleted = true or false)
CREATE POLICY files_update_non_client ON files
  FOR UPDATE
  TO authenticated
  USING (
    company_id = get_my_company_id()
    AND get_my_role() IN ('owner', 'admin', 'project_manager', 'foreman', 'crew_member')
  )
  WITH CHECK (
    company_id = get_my_company_id()
    AND get_my_role() IN ('owner', 'admin', 'project_manager', 'foreman', 'crew_member')
  );

-- DELETE: owner and admin only — permanent delete is restricted to these two roles
CREATE POLICY files_delete_owner_admin ON files
  FOR DELETE
  TO authenticated
  USING (
    company_id = get_my_company_id()
    AND get_my_role() IN ('owner', 'admin')
  );
