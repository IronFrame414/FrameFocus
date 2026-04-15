-- Migration 021: Seed default tags on new company creation (Module 3H)
-- Creates seed_default_tags(company_id) helper and patches handle_new_user()
-- to call it on the owner path.
--
-- IMPORTANT: The default tag list here MUST stay in sync with
-- packages/shared/constants/default-tags.ts. When editing one, edit the other.

CREATE OR REPLACE FUNCTION public.seed_default_tags(p_company_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO tag_options (company_id, name, category, sort_order) VALUES
    -- Trade
    (p_company_id, 'framing', 'trade', 100),
    (p_company_id, 'foundation', 'trade', 110),
    (p_company_id, 'concrete', 'trade', 120),
    (p_company_id, 'masonry', 'trade', 130),
    (p_company_id, 'roofing', 'trade', 140),
    (p_company_id, 'siding', 'trade', 150),
    (p_company_id, 'windows', 'trade', 160),
    (p_company_id, 'doors', 'trade', 170),
    (p_company_id, 'insulation', 'trade', 180),
    (p_company_id, 'drywall', 'trade', 190),
    (p_company_id, 'painting', 'trade', 200),
    (p_company_id, 'flooring', 'trade', 210),
    (p_company_id, 'tile', 'trade', 220),
    (p_company_id, 'cabinets', 'trade', 230),
    (p_company_id, 'countertops', 'trade', 240),
    (p_company_id, 'trim-and-millwork', 'trade', 250),
    (p_company_id, 'electrical', 'trade', 260),
    (p_company_id, 'plumbing', 'trade', 270),
    (p_company_id, 'hvac', 'trade', 280),
    (p_company_id, 'landscaping', 'trade', 290),
    (p_company_id, 'demolition', 'trade', 300),
    (p_company_id, 'excavation', 'trade', 310),
    -- Stage
    (p_company_id, 'pre-construction', 'stage', 400),
    (p_company_id, 'site-prep', 'stage', 410),
    (p_company_id, 'rough-in', 'stage', 420),
    (p_company_id, 'inspection', 'stage', 430),
    (p_company_id, 'punch-list', 'stage', 440),
    (p_company_id, 'final-walkthrough', 'stage', 450),
    (p_company_id, 'post-completion', 'stage', 460),
    -- Area
    (p_company_id, 'kitchen', 'area', 500),
    (p_company_id, 'bathroom', 'area', 510),
    (p_company_id, 'bedroom', 'area', 520),
    (p_company_id, 'living-room', 'area', 530),
    (p_company_id, 'dining-room', 'area', 540),
    (p_company_id, 'basement', 'area', 550),
    (p_company_id, 'attic', 'area', 560),
    (p_company_id, 'garage', 'area', 570),
    (p_company_id, 'exterior', 'area', 580),
    (p_company_id, 'yard', 'area', 590),
    (p_company_id, 'driveway', 'area', 600),
    (p_company_id, 'deck-or-patio', 'area', 610),
    (p_company_id, 'stairs', 'area', 620),
    (p_company_id, 'hallway', 'area', 630),
    (p_company_id, 'laundry-room', 'area', 640),
    (p_company_id, 'office', 'area', 650),
    (p_company_id, 'mechanical-room', 'area', 660),
    -- Condition
    (p_company_id, 'damage', 'condition', 700),
    (p_company_id, 'water-damage', 'condition', 710),
    (p_company_id, 'mold', 'condition', 720),
    (p_company_id, 'pest-damage', 'condition', 730),
    (p_company_id, 'code-violation', 'condition', 740),
    (p_company_id, 'safety-hazard', 'condition', 750),
    (p_company_id, 'defect', 'condition', 760),
    (p_company_id, 'existing-condition', 'condition', 770),
    (p_company_id, 'progress', 'condition', 780),
    (p_company_id, 'completed-work', 'condition', 790),
    (p_company_id, 'before', 'condition', 800),
    (p_company_id, 'after', 'condition', 810),
    -- Documentation
    (p_company_id, 'receipt', 'documentation', 900),
    (p_company_id, 'delivery', 'documentation', 910),
    (p_company_id, 'material-sample', 'documentation', 920),
    (p_company_id, 'selection', 'documentation', 930),
    (p_company_id, 'change-order-evidence', 'documentation', 940),
    (p_company_id, 'warranty-claim', 'documentation', 950),
    (p_company_id, 'daily-log', 'documentation', 960),
    (p_company_id, 'client-requested', 'documentation', 970)
  ON CONFLICT (company_id, name) DO NOTHING;
END;
$$;

-- Patch handle_new_user() to call seed_default_tags() on the owner path.
-- Full function redefined to preserve all existing logic.
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
  -- Parse invitation token from user metadata
  BEGIN
    v_token := (NEW.raw_user_meta_data ->> 'invitation_token')::UUID;
  EXCEPTION WHEN OTHERS THEN
    v_token := NULL;
  END;

  -- INVITE PATH
  IF v_token IS NOT NULL THEN
    SELECT gi.id, gi.company_id, gi.role
    INTO v_invitation
    FROM public.get_invitation_for_signup(v_token) gi;

    IF v_invitation.id IS NOT NULL THEN
      INSERT INTO profiles (user_id, company_id, role, first_name, last_name, email)
      VALUES (
        NEW.id,
        v_invitation.company_id,
        v_invitation.role,
        COALESCE(NEW.raw_user_meta_data ->> 'first_name', ''),
        COALESCE(NEW.raw_user_meta_data ->> 'last_name', ''),
        NEW.email
      );

      UPDATE invitations
      SET status = 'accepted',
          updated_at = now()
      WHERE id = v_invitation.id;

      RETURN NEW;
    END IF;
  END IF;

  -- OWNER PATH
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

  -- Seed default tag list for the new company (Module 3H)
  PERFORM public.seed_default_tags(v_company_id);

  RETURN NEW;
END;
$function$;