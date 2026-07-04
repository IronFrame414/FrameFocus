-- ============================================================
-- Migration 003: Add admin role + invitations table
-- ============================================================

-- ----------------------------------------
-- 1. Add 'admin' to profiles role constraint
-- ----------------------------------------

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('owner', 'admin', 'project_manager', 'foreman', 'crew_member', 'client'));


-- ----------------------------------------
-- 2. Create invitations table
-- ----------------------------------------

CREATE TABLE invitations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  email           TEXT NOT NULL,
  role            TEXT NOT NULL CHECK (role IN ('admin', 'project_manager', 'foreman', 'crew_member', 'client')),
  invited_by      UUID NOT NULL REFERENCES auth.users(id),
  token           UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  expires_at      TIMESTAMPTZ DEFAULT (now() + INTERVAL '7 days'),
  created_by      UUID REFERENCES auth.users(id),
  updated_by      UUID REFERENCES auth.users(id),
  is_deleted      BOOLEAN DEFAULT false,
  deleted_at      TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_invitations_company_id ON invitations(company_id);
CREATE INDEX idx_invitations_token ON invitations(token);
CREATE INDEX idx_invitations_email ON invitations(email);

-- Auto-update updated_at
CREATE TRIGGER set_invitations_updated_at
  BEFORE UPDATE ON invitations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();


-- ----------------------------------------
-- 3. RLS policies for invitations
-- ----------------------------------------

ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

-- Owners and admins can view their company's invitations
CREATE POLICY invitations_select_owner_admin ON invitations
  FOR SELECT USING (
    company_id = get_my_company_id()
    AND get_my_role() IN ('owner', 'admin')
    AND is_deleted = false
  );

-- Only owners can create invitations
CREATE POLICY invitations_insert_owner ON invitations
  FOR INSERT WITH CHECK (
    company_id = get_my_company_id()
    AND get_my_role() = 'owner'
  );

-- Only owners can update invitations (e.g. cancel)
CREATE POLICY invitations_update_owner ON invitations
  FOR UPDATE USING (
    company_id = get_my_company_id()
    AND get_my_role() = 'owner'
  );


-- ----------------------------------------
-- 4. Secure function for invite accept page
-- ----------------------------------------
-- SECURITY DEFINER bypasses RLS so unauthenticated
-- users can look up their invitation by token.
-- Only returns limited info — no sensitive data.

CREATE OR REPLACE FUNCTION get_invitation_by_token(invite_token UUID)
RETURNS TABLE (
  id          UUID,
  company_name TEXT,
  email       TEXT,
  role        TEXT,
  expires_at  TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    i.id,
    c.name AS company_name,
    i.email,
    i.role,
    i.expires_at
  FROM invitations i
  JOIN companies c ON c.id = i.company_id
  WHERE i.token = invite_token
    AND i.status = 'pending'
    AND i.is_deleted = false
    AND i.expires_at > now();
$$;