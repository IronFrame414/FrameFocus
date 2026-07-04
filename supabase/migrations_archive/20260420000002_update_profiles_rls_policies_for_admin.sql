-- Migration 025: profiles UPDATE RLS policies
-- Tech debt #43

-- 1. Drop self-update policy (no one updates own profile via this path)
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;

-- 2. Replace Owner update policy: Owner can edit any profile in company,
--    but cannot demote self (Owner must remain Owner)
DROP POLICY IF EXISTS profiles_update_owner ON public.profiles;

CREATE POLICY profiles_update_owner ON public.profiles
  FOR UPDATE
  USING (
    company_id = get_my_company_id()
    AND get_my_role() = 'owner'
  )
  WITH CHECK (
    company_id = get_my_company_id()
    AND get_my_role() = 'owner'
    AND (user_id != auth.uid() OR role = 'owner')
  );

-- 3. Admin update policy: Admin can edit non-Owner, non-Admin, non-self profiles.
--    Cannot promote anyone to admin or owner.
CREATE POLICY profiles_update_admin ON public.profiles
  FOR UPDATE
  USING (
    company_id = get_my_company_id()
    AND get_my_role() = 'admin'
    AND user_id != auth.uid()
    AND role NOT IN ('owner', 'admin')
  )
  WITH CHECK (
    company_id = get_my_company_id()
    AND get_my_role() = 'admin'
    AND user_id != auth.uid()
    AND role NOT IN ('owner', 'admin')
  );