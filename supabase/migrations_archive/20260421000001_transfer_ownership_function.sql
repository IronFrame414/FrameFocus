-- ============================================================
-- FrameFocus — Migration 027: Tech debt #66
-- transfer_ownership(p_new_owner_id UUID)
-- Atomic Owner -> Admin role swap.
--
-- SECURITY DEFINER is required because Migration 025's Owner
-- UPDATE policy blocks self-demotion
-- (user_id != auth.uid() OR role = 'owner').
--
-- Two sequential UPDATEs inside plpgsql avoid transient
-- violation of Migration 024's partial unique index
-- profiles_one_owner_per_company: demote caller first
-- (zero owners), then promote target (one owner).
-- ============================================================

CREATE OR REPLACE FUNCTION public.transfer_ownership(p_new_owner_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller profiles%ROWTYPE;
  target profiles%ROWTYPE;
BEGIN
  SELECT * INTO caller FROM profiles WHERE user_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Caller profile not found';
  END IF;

  IF caller.role <> 'owner' THEN
    RAISE EXCEPTION 'Only the Owner can transfer ownership';
  END IF;

  SELECT * INTO target FROM profiles WHERE id = p_new_owner_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target admin not found';
  END IF;

  IF target.company_id <> caller.company_id THEN
    RAISE EXCEPTION 'Target is not in your company';
  END IF;

  IF target.is_deleted THEN
    RAISE EXCEPTION 'Target admin is deleted';
  END IF;

  IF target.role <> 'admin' THEN
    RAISE EXCEPTION 'Target must currently be an Admin';
  END IF;

  UPDATE profiles
    SET role = 'admin',
        updated_at = now(),
        updated_by = auth.uid()
    WHERE id = caller.id;

  UPDATE profiles
    SET role = 'owner',
        updated_at = now(),
        updated_by = auth.uid()
    WHERE id = p_new_owner_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.transfer_ownership(UUID) TO authenticated;
