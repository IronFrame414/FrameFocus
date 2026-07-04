-- Migration 013: Fix handle_new_user() invite branch
-- Bug: trigger updated non-existent invitations.accepted_at column,
-- causing "Database error saving new user" on invite signups.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id UUID;
  v_invitation RECORD;
  v_token UUID;
  v_had_trial BOOLEAN;
  v_slug TEXT;
  v_company_name TEXT;
BEGIN
  -- Try to parse invitation token from user metadata
  BEGIN
    v_token := (NEW.raw_user_meta_data ->> 'invitation_token')::UUID;
  EXCEPTION WHEN OTHERS THEN
    v_token := NULL;
  END;

  -- INVITE PATH: token present and valid
  IF v_token IS NOT NULL THEN
    SELECT * INTO v_invitation
    FROM invitations
    WHERE token = v_token
      AND status = 'pending'
      AND expires_at > now();

    IF v_invitation IS NOT NULL THEN
      INSERT INTO profiles (user_id, company_id, role, first_name, last_name, email)
      VALUES (
        NEW.id,
        v_invitation.company_id,
        v_invitation.role,
        COALESCE(NEW.raw_user_meta_data ->> 'first_name', ''),
        COALESCE(NEW.raw_user_meta_data ->> 'last_name', ''),
        NEW.email
      );

      -- FIX: removed accepted_at (column does not exist on invitations)
      UPDATE invitations
      SET status = 'accepted',
          updated_at = now()
      WHERE id = v_invitation.id;

      RETURN NEW;
    END IF;
  END IF;

  -- OWNER PATH: no token, create new company + trial subscription
  v_company_name := COALESCE(NEW.raw_user_meta_data ->> 'company_name', 'My Company');
  v_slug := LOWER(REGEXP_REPLACE(v_company_name, '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug := TRIM(BOTH '-' FROM v_slug);
  v_slug := v_slug || '-' || SUBSTR(gen_random_uuid()::text, 1, 8);

  INSERT INTO companies (name, slug)
  VALUES (v_company_name, v_slug)
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

  SELECT EXISTS(
    SELECT 1 FROM trial_emails WHERE email = LOWER(NEW.email)
  ) INTO v_had_trial;

  IF v_had_trial THEN
    INSERT INTO subscriptions (company_id, plan_tier, status, seat_limit)
    VALUES (v_company_id, 'starter', 'incomplete', 2);
  ELSE
    INSERT INTO subscriptions (company_id, plan_tier, status, seat_limit, trial_start, trial_end)
    VALUES (v_company_id, 'starter', 'trialing', 2, now(), now() + INTERVAL '30 days');
    INSERT INTO trial_emails (email) VALUES (LOWER(NEW.email));
  END IF;

  RETURN NEW;
END;
$function$;