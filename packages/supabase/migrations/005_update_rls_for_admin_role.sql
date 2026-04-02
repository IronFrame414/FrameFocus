-- Drop all old and new versions to start clean
DROP POLICY IF EXISTS invitations_insert_owner ON invitations;
DROP POLICY IF EXISTS invitations_insert_owner_admin ON invitations;
DROP POLICY IF EXISTS invitations_update_owner ON invitations;
DROP POLICY IF EXISTS invitations_update_owner_admin ON invitations;
DROP POLICY IF EXISTS companies_update_owner ON companies;
DROP POLICY IF EXISTS companies_update_owner_admin ON companies;
DROP POLICY IF EXISTS profiles_select_authenticated ON profiles;

-- Recreate all policies
CREATE POLICY invitations_insert_owner_admin ON invitations
  FOR INSERT WITH CHECK (
    company_id = get_my_company_id()
    AND get_my_role() IN ('owner', 'admin')
  );

CREATE POLICY invitations_update_owner_admin ON invitations
  FOR UPDATE USING (
    company_id = get_my_company_id()
    AND get_my_role() IN ('owner', 'admin')
  );

CREATE POLICY companies_update_owner_admin ON companies
  FOR UPDATE USING (
    id = get_my_company_id()
    AND get_my_role() IN ('owner', 'admin')
  );

CREATE POLICY profiles_select_authenticated ON profiles
  FOR SELECT USING (
    company_id = get_my_company_id()
    AND is_deleted = false
  );