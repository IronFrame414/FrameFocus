-- ============================================================================
-- company_members — Foundation (pre-Module 5)
-- Spec: docs/specs/company_members-spec.md (Session 55)
-- Single assignable identity for crew (profile-linked) and subcontractors
-- (no profile until an optional invite is accepted).
--
-- NOTE (spec correction, verified against shipped schema): profiles.id is NOT
-- auth.uid() — profiles has its own id PK plus user_id UNIQUE -> auth.users.
-- get_my_member_id() therefore resolves auth.uid() -> profiles.user_id ->
-- profiles.id -> company_members.profile_id.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Table
-- ----------------------------------------------------------------------------

CREATE TABLE public.company_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid DEFAULT public.get_my_company_id() NOT NULL,
    profile_id uuid,
    member_type text NOT NULL,
    display_name text NOT NULL,
    schedule_color text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid DEFAULT auth.uid(),
    updated_by uuid DEFAULT auth.uid(),
    is_deleted boolean DEFAULT false,
    deleted_at timestamp with time zone,
    CONSTRAINT company_members_pkey PRIMARY KEY (id),
    CONSTRAINT company_members_member_type_check CHECK (member_type = ANY (ARRAY['crew'::text, 'subcontractor'::text]))
);

ALTER TABLE ONLY public.company_members
    ADD CONSTRAINT company_members_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);

ALTER TABLE ONLY public.company_members
    ADD CONSTRAINT company_members_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id);

ALTER TABLE ONLY public.company_members
    ADD CONSTRAINT company_members_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE ONLY public.company_members
    ADD CONSTRAINT company_members_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);

CREATE INDEX idx_company_members_company_id ON public.company_members USING btree (company_id);

-- One member row per profile (crew are 1:1; subs have profile_id NULL until invited)
CREATE UNIQUE INDEX idx_company_members_profile_id ON public.company_members USING btree (profile_id) WHERE (profile_id IS NOT NULL);

-- ----------------------------------------------------------------------------
-- 2. Standard triggers (updated_at + updated_by)
-- ----------------------------------------------------------------------------

CREATE TRIGGER company_members_updated_at
  BEFORE UPDATE ON public.company_members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE FUNCTION public.set_company_members_updated_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER company_members_set_updated_by
  BEFORE UPDATE ON public.company_members
  FOR EACH ROW EXECUTE FUNCTION public.set_company_members_updated_by();

-- ----------------------------------------------------------------------------
-- 3. RLS
--    Read: any company member (assignment pickers are visible to all roles).
--    Write: Owner/Admin (schedule_color and display_name are company-assigned).
--    Soft-delete filtering happens in the service layer (trash-bin pattern),
--    not in RLS.
-- ----------------------------------------------------------------------------

ALTER TABLE public.company_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY company_members_select_authenticated ON public.company_members
  FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id());

CREATE POLICY company_members_insert_authorized ON public.company_members
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
  );

CREATE POLICY company_members_update_authorized ON public.company_members
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
  );

-- ----------------------------------------------------------------------------
-- 4. get_my_member_id() — the RLS keystone for all 5-series assignment policies
--    SQL (not plpgsql) SECURITY DEFINER per repo pattern.
-- ----------------------------------------------------------------------------

CREATE FUNCTION public.get_my_member_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT m.id
  FROM company_members m
  JOIN profiles p ON p.id = m.profile_id
  WHERE p.user_id = auth.uid()
    AND p.is_deleted = false
    AND m.is_deleted = false
  LIMIT 1;
$$;

-- ----------------------------------------------------------------------------
-- 5. Roles — add 'subcontractor' to profiles + invitations CHECKs
--    (limited role: self clock-in, own assignments, photo upload — Module 6
--    surfaces; excluded from paid seats in app-layer seat counting)
-- ----------------------------------------------------------------------------

ALTER TABLE public.profiles DROP CONSTRAINT profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text, 'foreman'::text, 'crew_member'::text, 'client'::text, 'subcontractor'::text]));

ALTER TABLE public.invitations DROP CONSTRAINT invitations_role_check;
ALTER TABLE public.invitations ADD CONSTRAINT invitations_role_check
  CHECK (role = ANY (ARRAY['admin'::text, 'project_manager'::text, 'foreman'::text, 'crew_member'::text, 'client'::text, 'subcontractor'::text]));

-- Sub invitations carry the member row the accepted profile links to
ALTER TABLE public.invitations ADD COLUMN member_id uuid;
ALTER TABLE ONLY public.invitations
    ADD CONSTRAINT invitations_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.company_members(id);

-- ----------------------------------------------------------------------------
-- 6. Backfill — one 'crew' member per existing non-client profile
-- ----------------------------------------------------------------------------

INSERT INTO public.company_members (company_id, profile_id, member_type, display_name, created_by)
SELECT
  p.company_id,
  p.id,
  'crew',
  COALESCE(NULLIF(TRIM(p.first_name || ' ' || p.last_name), ''), p.email),
  p.user_id
FROM public.profiles p
WHERE p.role <> 'client'
  AND p.is_deleted = false;

-- Parity assert: every eligible profile has exactly one member row
DO $$
DECLARE
  v_profiles integer;
  v_members integer;
BEGIN
  SELECT COUNT(*) INTO v_profiles FROM public.profiles WHERE role <> 'client' AND is_deleted = false;
  SELECT COUNT(*) INTO v_members FROM public.company_members WHERE member_type = 'crew' AND profile_id IS NOT NULL;
  IF v_profiles <> v_members THEN
    RAISE EXCEPTION 'company_members backfill parity failure: % eligible profiles, % crew members', v_profiles, v_members;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 7. Auto-create hooks
--    7a. New profile (signup / invite accept) -> crew member.
--        Skips client (not assignable) and subcontractor (links to an existing
--        member via handle_new_user below).
--    7b. New subcontractors row (Module 2) -> subcontractor member, no profile.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_member_for_new_profile()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.role IN ('client', 'subcontractor') THEN
    RETURN NEW;
  END IF;
  INSERT INTO company_members (company_id, profile_id, member_type, display_name, created_by)
  VALUES (
    NEW.company_id,
    NEW.id,
    'crew',
    COALESCE(NULLIF(TRIM(NEW.first_name || ' ' || NEW.last_name), ''), NEW.email),
    NEW.user_id
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_create_member
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.create_member_for_new_profile();

CREATE OR REPLACE FUNCTION public.create_member_for_new_subcontractor()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO company_members (company_id, profile_id, member_type, display_name, created_by)
  VALUES (NEW.company_id, NULL, 'subcontractor', NEW.company_name, NEW.created_by);
  RETURN NEW;
END;
$$;

CREATE TRIGGER subcontractors_create_member
  AFTER INSERT ON public.subcontractors
  FOR EACH ROW EXECUTE FUNCTION public.create_member_for_new_subcontractor();

-- Backfill members for existing subcontractors (display_name = company_name;
-- set once at creation, editable afterwards, no sync trigger — spec F-6 default)
INSERT INTO public.company_members (company_id, profile_id, member_type, display_name, created_by)
SELECT s.company_id, NULL, 'subcontractor', s.company_name, s.created_by
FROM public.subcontractors s
WHERE s.is_deleted = false;

-- ----------------------------------------------------------------------------
-- 8. Invite-accept linking — get_invitation_for_signup() gains member_id;
--    handle_new_user() links a subcontractor invite's profile to its existing
--    member row. (Return type changes, so DROP + CREATE.)
-- ----------------------------------------------------------------------------

DROP FUNCTION public.get_invitation_for_signup(uuid);

CREATE FUNCTION public.get_invitation_for_signup(invite_token uuid) RETURNS TABLE(id uuid, company_id uuid, role text, member_id uuid)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT i.id, i.company_id, i.role, i.member_id
  FROM invitations i
  WHERE i.token = invite_token
    AND i.status = 'pending'
    AND i.is_deleted = false
    AND i.expires_at > now();
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_company_id UUID;
  v_invitation RECORD;
  v_token UUID;
  v_had_trial BOOLEAN;
  v_slug TEXT;
  v_company_name TEXT;
  v_profile_id UUID;
BEGIN
  -- Parse invitation token from user metadata
  BEGIN
    v_token := (NEW.raw_user_meta_data ->> 'invitation_token')::UUID;
  EXCEPTION WHEN OTHERS THEN
    v_token := NULL;
  END;

  -- INVITE PATH
  IF v_token IS NOT NULL THEN
    SELECT gi.id, gi.company_id, gi.role, gi.member_id
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
      )
      RETURNING id INTO v_profile_id;

      -- Subcontractor invite: link the new profile to its existing member row
      -- (crew invites get their member row from the profiles_create_member trigger)
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
$$;
