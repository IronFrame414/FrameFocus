-- S176 [public-site-and-trial-conversion-spec.md §S1] — a new Starter starts
-- with seat_limit 3, not 2, to match the advertised "3 team members".
--
-- Seats ARE enforced (seats.ts blocks invites past subscription.seat_limit), so
-- a trialing Starter capped at 2 while the pricing page says 3 makes a published
-- number false. The catalog (plan-catalog.ts) now says starter.seats = 3; this
-- brings the signup trigger's hardcoded literal into agreement.
--
-- ⚠️ Reproduced VERBATIM from pg_get_functiondef('handle_new_user') — the ONLY
-- change is the two seat_limit literals in the OWNER PATH (2 -> 3). Do not
-- hand-edit anything else in this SECURITY DEFINER trigger on auth.users.

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
  v_trial_count INTEGER;
  v_slug TEXT;
  v_company_name TEXT;
  v_profile_id UUID;
  v_reason TEXT;
  v_trial_end TIMESTAMPTZ;
BEGIN
  BEGIN
    v_token := (NEW.raw_user_meta_data ->> 'invitation_token')::UUID;
  EXCEPTION WHEN OTHERS THEN
    v_token := NULL;
  END;

  -- INVITE PATH
  IF v_token IS NOT NULL THEN
    SELECT gi.id, gi.company_id, gi.role, gi.member_id, gi.contact_id
    INTO v_invitation
    FROM public.get_invitation_for_signup(v_token) gi;

    IF v_invitation.id IS NOT NULL THEN
      -- M9 [S164]: the client's counterparty link travels with the invitation.
      -- NULL for every other role — get_invitation_for_signup() returns
      -- contact_id only when the invitation's role is 'client', and
      -- profiles_contact_id_client_only would refuse it otherwise.
      INSERT INTO profiles (user_id, company_id, role, first_name, last_name, email, contact_id)
      VALUES (
        NEW.id,
        v_invitation.company_id,
        v_invitation.role,
        COALESCE(NEW.raw_user_meta_data ->> 'first_name', ''),
        COALESCE(NEW.raw_user_meta_data ->> 'last_name', ''),
        NEW.email,
        v_invitation.contact_id
      )
      RETURNING id INTO v_profile_id;

      IF v_invitation.member_id IS NOT NULL THEN
        UPDATE company_members
        SET profile_id = v_profile_id
        WHERE id = v_invitation.member_id
          AND profile_id IS NULL;
      END IF;

      UPDATE invitations
      SET status = 'accepted',
          updated_at = now()
      WHERE id = v_invitation.id;

      RETURN NEW;
    END IF;

    -- D1 [S135] — the fallthrough stays closed.
    v_reason := public.get_invitation_status(v_token);
    RAISE EXCEPTION 'invitation_% : this invite cannot be used (token %)', v_reason, v_token
      USING ERRCODE = 'check_violation',
            HINT = 'Ask the company to resend the invitation.';
  END IF;

  -- OWNER PATH
  v_company_name := COALESCE(NEW.raw_user_meta_data ->> 'company_name', 'My Company');
  v_slug := public.generate_company_slug(v_company_name);

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

  -- S137: a COUNT, not an EXISTS. Three trials per address; the fourth signup
  -- gets `incomplete` and no trial dates, which is what routes it to its own
  -- screen instead of the price list.
  SELECT COUNT(*) INTO v_trial_count
  FROM trial_emails WHERE email = LOWER(NEW.email);

  IF v_trial_count >= 3 THEN
    INSERT INTO subscriptions (company_id, plan_tier, status, seat_limit)
    VALUES (v_company_id, 'starter', 'incomplete', 3);
  ELSE
    v_trial_end := now() + INTERVAL '30 days';

    INSERT INTO subscriptions (company_id, plan_tier, status, seat_limit, trial_start, trial_end)
    VALUES (v_company_id, 'starter', 'trialing', 3, now(), v_trial_end);

    INSERT INTO trial_emails (email, company_id, trial_number)
    VALUES (LOWER(NEW.email), v_company_id, v_trial_count + 1);

    -- The lifecycle row is created WITH the trial, not discovered later by a
    -- cron sweeping subscriptions. A row that must exist for deletion to be
    -- possible should not depend on a scheduled job having run.
    INSERT INTO trial_lifecycle (company_id, trial_end)
    VALUES (v_company_id, v_trial_end)
    ON CONFLICT (company_id) DO NOTHING;
  END IF;

  PERFORM public.seed_default_tags(v_company_id);

  RETURN NEW;
END;
$function$;
