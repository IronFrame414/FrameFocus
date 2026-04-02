-- ============================================================
-- Migration 005: Update RLS policies for admin role
-- ============================================================

-- ----------------------------------------
-- 1. Invitations: allow admin to create invitations
-- ----------------------------------------

DROP POLICY IF EXISTS invitations_insert_owner ON invitations;

CREATE POLICY invitations_insert_owner_admin ON invitations
  FOR INSERT WITH CHECK (
    company_id = get_my_company_id()
    AND get_my_role() IN ('owner', 'admin')
  );

-- ----------------------------------------
-- 2. Invitations: allow admin to update invitations (cancel)
-- ----------------------------------------

DROP POLICY IF EXISTS invitations_update_owner ON invitations;

CREATE POLICY invitations_update_owner_admin ON invitations
  FOR UPDATE USING (
    company_id = get_my_company_id()
    AND get_my_role() IN ('owner', 'admin')
  );

-- ----------------------------------------
-- 3. Companies: allow admin to update company settings
--    (If a policy already exists for owner-only update, replace it)
-- ----------------------------------------

DROP POLICY IF EXISTS companies_update_owner ON companies;

CREATE POLICY companies_update_owner_admin ON companies
  FOR UPDATE USING (
    id = get_my_company_id()
    AND get_my_role() IN ('owner', 'admin')
  );

-- ----------------------------------------
-- 4. Profiles: allow admin to view all company profiles
--    (May already exist — safe to drop and recreate)
-- ----------------------------------------

DROP POLICY IF EXISTS profiles_select_authenticated ON profiles;

CREATE POLICY profiles_select_authenticated ON profiles
  FOR SELECT USING (
    company_id = get_my_company_id()
    AND is_deleted = false
  );
