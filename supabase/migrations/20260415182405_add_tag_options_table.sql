-- Migration 020: tag_options table for AI photo auto-tagging (Module 3H)
-- Per-company tag list. Companies seeded with default tags via handle_new_company trigger.
-- Deactivated tags stay on existing files; just stop being applied to new uploads.

CREATE TABLE tag_options (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  category    TEXT NOT NULL CHECK (category IN ('trade', 'stage', 'area', 'condition', 'documentation')),
  is_active   BOOLEAN NOT NULL DEFAULT true,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  created_by  UUID REFERENCES auth.users(id),
  updated_by  UUID REFERENCES auth.users(id),
  UNIQUE (company_id, name)
);

CREATE INDEX idx_tag_options_company_id ON tag_options(company_id);
CREATE INDEX idx_tag_options_company_active ON tag_options(company_id, is_active) WHERE is_active = true;

-- updated_at trigger
CREATE TRIGGER tag_options_updated_at
  BEFORE UPDATE ON tag_options
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- updated_by trigger (mirrors files/contacts/subcontractors pattern)
CREATE OR REPLACE FUNCTION set_tag_options_updated_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tag_options_set_updated_by
  BEFORE UPDATE ON tag_options
  FOR EACH ROW
  EXECUTE FUNCTION set_tag_options_updated_by();

-- RLS
ALTER TABLE tag_options ENABLE ROW LEVEL SECURITY;

-- Anyone in the company can read active + inactive tags (needed for filtering UI to show historical tags)
CREATE POLICY tag_options_select_authenticated ON tag_options
  FOR SELECT
  USING (company_id = get_my_company_id());

-- Owner and admin can insert
CREATE POLICY tag_options_insert_owner_admin ON tag_options
  FOR INSERT
  WITH CHECK (
    company_id = get_my_company_id()
    AND get_my_role() IN ('owner', 'admin')
  );

-- Owner and admin can update (rename, activate/deactivate, reorder)
CREATE POLICY tag_options_update_owner_admin ON tag_options
  FOR UPDATE
  USING (
    company_id = get_my_company_id()
    AND get_my_role() IN ('owner', 'admin')
  );

-- Owner only can hard delete (rare; deactivation is the normal flow)
CREATE POLICY tag_options_delete_owner ON tag_options
  FOR DELETE
  USING (
    company_id = get_my_company_id()
    AND get_my_role() = 'owner'
  );