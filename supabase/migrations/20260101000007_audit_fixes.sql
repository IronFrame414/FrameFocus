-- Migration 008: System audit fixes
-- ==================================

-- FIX 9: Add is_deleted to profiles if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'is_deleted'
  ) THEN
    ALTER TABLE profiles ADD COLUMN is_deleted BOOLEAN DEFAULT false;
    ALTER TABLE profiles ADD COLUMN deleted_at TIMESTAMPTZ;
  END IF;
END $$;

-- FIX 10: Add index on invitations.token for fast lookups
CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations(token);

-- FIX 3: Allow Owner and Admin to update their own company
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'companies' AND policyname = 'companies_update_owner_admin'
  ) THEN
    CREATE POLICY companies_update_owner_admin ON companies
      FOR UPDATE
      USING (id = get_my_company_id())
      WITH CHECK (id = get_my_company_id());
  END IF;
END $$;

-- FIX 11: Trial abuse prevention — track emails that have used a free trial
CREATE TABLE IF NOT EXISTS trial_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- No RLS needed — only accessed by the SECURITY DEFINER trigger function

-- FIX 1 + 11: Update handle_new_user() with trial email tracking
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id UUID;
  v_invitation RECORD;
  v_token TEXT;
  v_had_trial BOOLEAN;
BEGIN
  -- Check if this user was invited
  v_token := NEW.raw_user_meta_data ->> 'invitation_token';

  IF v_token IS NOT NULL THEN
    -- INVITED USER: look up the invitation
    SELECT * INTO v_invitation
    FROM invitations
    WHERE token = v_token
      AND status = 'pending'
      AND expires_at > now();

    IF v_invitation IS NOT NULL THEN
      -- Create profile under the inviter's company
      INSERT INTO profiles (user_id, company_id, role, first_name, last_name, email)
      VALUES (
        NEW.id,
        v_invitation.company_id,
        v_invitation.role,
        COALESCE(NEW.raw_user_meta_data ->> 'first_name', ''),
        COALESCE(NEW.raw_user_meta_data ->> 'last_name', ''),
        NEW.email
      );

      -- Mark invitation as accepted
      UPDATE invitations
      SET status = 'accepted', accepted_at = now()
      WHERE id = v_invitation.id;

      RETURN NEW;
    END IF;
  END IF;

  -- NEW OWNER: create company + profile
  INSERT INTO companies (name)
  VALUES (COALESCE(NEW.raw_user_meta_data ->> 'company_name', 'My Company'))
  RETURNING id INTO v_company_id;

  INSERT INTO profiles (user_id, company_id, role, first_name, last_name, email)
  VALUES (
    NEW.id,
    v_company_id,
    'owner',
    COALESCE(NEW.raw_user_meta_data ->> 'first_name', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'last_name', ''),
    NEW.email
  );

  -- Check if this email has already used a free trial
  SELECT EXISTS(
    SELECT 1 FROM trial_emails WHERE email = LOWER(NEW.email)
  ) INTO v_had_trial;

  IF v_had_trial THEN
    -- No trial — create subscription that requires immediate payment
    INSERT INTO subscriptions (company_id, plan_tier, status, seat_limit)
    VALUES (
      v_company_id,
      'starter',
      'incomplete',
      2
    );
  ELSE
    -- First time — grant 30-day trial
    INSERT INTO subscriptions (company_id, plan_tier, status, seat_limit, trial_start, trial_end)
    VALUES (
      v_company_id,
      'starter',
      'trialing',
      2,
      now(),
      now() + INTERVAL '30 days'
    );

    -- Record this email as having used a trial
    INSERT INTO trial_emails (email) VALUES (LOWER(NEW.email));
  END IF;

  RETURN NEW;
END;
$$;