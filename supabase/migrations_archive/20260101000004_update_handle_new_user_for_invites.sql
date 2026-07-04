-- ============================================================
-- Migration 004: Update handle_new_user() for invite flow
-- ============================================================
-- CREATE OR REPLACE overwrites the existing function.
-- The trigger on auth.users stays in place — no need to recreate it.

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invite_record RECORD;
  new_company_id UUID;
BEGIN

  -- =============================================
  -- PATH 1: Invited user (has invitation_token)
  -- =============================================
  IF NEW.raw_user_meta_data->>'invitation_token' IS NOT NULL THEN

    -- Look up the pending invitation
    SELECT * INTO invite_record
    FROM invitations
    WHERE token = (NEW.raw_user_meta_data->>'invitation_token')::UUID
      AND status = 'pending'
      AND is_deleted = false
      AND expires_at > now();

    -- If no valid invitation found, block sign-up
    IF invite_record.id IS NULL THEN
      RAISE EXCEPTION 'Invalid or expired invitation';
    END IF;

    -- Create profile under the inviter's company with the invited role
    INSERT INTO profiles (id, company_id, role, first_name, last_name)
    VALUES (
      NEW.id,
      invite_record.company_id,
      invite_record.role,
      COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
      COALESCE(NEW.raw_user_meta_data->>'last_name', '')
    );

    -- Mark invitation as accepted
    UPDATE invitations
    SET status = 'accepted',
        updated_at = now()
    WHERE id = invite_record.id;

    RETURN NEW;
  END IF;

  -- =============================================
  -- PATH 2: New owner sign-up (no invitation)
  -- =============================================

  -- Create a new company
  INSERT INTO companies (name)
  VALUES (COALESCE(NEW.raw_user_meta_data->>'company_name', 'My Company'))
  RETURNING id INTO new_company_id;

  -- Create owner profile
  INSERT INTO profiles (id, company_id, role, first_name, last_name)
  VALUES (
    NEW.id,
    new_company_id,
    'owner',
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', '')
  );

  RETURN NEW;
END;
$$;