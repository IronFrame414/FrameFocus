-- Migration 007: Subscriptions table + Stripe customer tracking
-- ============================================================

-- 1. stripe_customer_id already exists on companies table — skipping

-- 2. Create subscriptions table
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  plan_tier TEXT NOT NULL DEFAULT 'starter' CHECK (plan_tier IN ('starter', 'professional', 'business')),
  status TEXT NOT NULL DEFAULT 'trialing' CHECK (status IN ('trialing', 'active', 'past_due', 'canceled', 'unpaid', 'incomplete')),
  seat_limit INTEGER NOT NULL DEFAULT 2,
  trial_start TIMESTAMPTZ,
  trial_end TIMESTAMPTZ,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Auto-update updated_at
CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- 4. Index for lookups
CREATE INDEX idx_subscriptions_company_id ON subscriptions(company_id);
CREATE INDEX idx_subscriptions_stripe_subscription_id ON subscriptions(stripe_subscription_id);

-- 5. RLS
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Owner and Admin can view their company's subscription
CREATE POLICY subscriptions_select_owner_admin ON subscriptions
  FOR SELECT
  USING (company_id = get_my_company_id());

-- Only service_role (webhook) can insert/update subscriptions — no user-facing writes
-- This is intentional: subscriptions are only modified by Stripe webhooks via service_role key

-- 6. Update handle_new_user() to create a trial subscription on owner sign-up
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

  -- NEW OWNER: create company + profile + trial subscription
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

  -- Create trial subscription (30 days, starter plan)
  INSERT INTO subscriptions (company_id, plan_tier, status, seat_limit, trial_start, trial_end)
  VALUES (
    v_company_id,
    'starter',
    'trialing',
    2,
    now(),
    now() + INTERVAL '30 days'
  );

  RETURN NEW;
END;
$$;