-- ============================================================================
-- Module 9 stage 2 — LIFECYCLE. One timer, three termination states. (S164)
-- ============================================================================
--
-- Spec: `docs/specs/9-spec.md` §3 — R1, R2, R4, R5, R17, and §S.1.
-- Builds on `20261016000000_m9_client_identity.sql` (stage 1).
--
-- ----------------------------------------------------------------------------
-- 1 — THE ONE TIMER, AND WHY IT IS A FUNCTION OF TWO COLUMNS
-- ----------------------------------------------------------------------------
-- R2: *"the invite is active until 45 days after project completion. A company
-- user may resend at any time. **There is no separate invite-expiry clock.**"*
--
-- That last sentence has teeth, because `invitations.expires_at` EXISTS and
-- **defaults to `now() + 7 days`**. Left alone, a client invite would quietly
-- acquire the very second clock R2 forbids, and it would be the shorter of the
-- two — the invite would die 7 days in while the ruling says it lives until 45
-- days after completion. So the invitation helpers below stop consulting
-- `expires_at` for client invites and consult the project instead.
--
-- ⚠️ `client_window_open()` IS THE ONLY PLACE THE 45 DAYS IS WRITTEN. Both
-- consumers call it:
--
--     is_client_of_project()        — the access clock  (R5)
--     get_invitation_for_signup()   — the invite clock  (R2)
--     get_invitation_by_token()     — the invite clock, pre-signup display
--     get_invitation_status()       — the invite clock, for the refusal reason
--
-- **A second copy of `+ 45` is how the two timers drift apart**, and they would
-- drift silently: nothing fails when an invite expires a fortnight before access
-- does. If the number ever changes, it changes here and nowhere else.
--
-- It takes `(status, actual_end_date)` rather than a project id ON PURPOSE. A
-- pure function of two scalars touches no table, so the planner INLINES it into
-- every caller and it costs nothing — where a `SECURITY DEFINER` function taking
-- an id would cost ~197 us/row nested inside `is_client_of_project()`, per
-- `docs/specs/S163-can-view-project-mechanism.md` §3. One definition AND no
-- nesting penalty; the two goals are not in tension here.
--
-- ⚠️ WHAT COUNTS AS COMPLETION, STATED BECAUSE THE RULING DOES NOT COVER IT.
-- `projects.status` is one of active / on_hold / complete / archived /
-- cancelled. R2 and R5 both say *"after project completion"*, and only
-- `complete` is completion. The window therefore closes **only** on
-- `status = 'complete'` WITH an `actual_end_date`, and stays OPEN for archived
-- or cancelled projects and for a `complete` project with no end date recorded.
--
-- That is deliberately fail-OPEN on access, for two reasons that are in the
-- ruling: R5 says deactivation is *"a switch, not a shredder"*, and R17 gives
-- Owner/Admin an explicit switch for exactly the case where they want somebody
-- out now. Automatic closure runs only on an unambiguous date; every other case
-- is the company's call rather than an inference this migration invents.
-- **This is flagged to Josh as an open question, not settled by it.**
--
-- ----------------------------------------------------------------------------
-- 2 — R5 IS AN ACCOUNT-LEVEL GATE, NOT A PER-PROJECT ONE. Read this twice.
-- ----------------------------------------------------------------------------
-- The obvious implementation — "she can see project X if X's window is open" —
-- is WRONG, and it contradicts the ruling in a way that only shows up on a
-- returning client. R5, in full:
--
--   > Login deactivates 45 days after completion; project data persists until a
--   > company user deletes it. **On reactivation she sees old projects in full —
--   > nothing narrows with age.** No standing archive access without an active
--   > project.
--
-- Three sentences, one rule: **the ACCOUNT is live if ANY linked project's
-- window is open, and a live account sees ALL its projects, however old.** Under
-- the per-project reading, a client back for a second kitchen would see the new
-- job and NOT the finished one — and "nothing narrows with age" says exactly
-- that must not happen. R4 says the same thing from the other side: *"more than
-- one → a list, old and new."*
--
-- So `is_client_of_project()` carries an EXISTS over her whole project set. It
-- is the sentence "no standing archive access without an active project"
-- written as SQL.
--
-- ----------------------------------------------------------------------------
-- 3 — R17: THREE STATES, AND WHY THERE IS AN AUDIT TABLE
-- ----------------------------------------------------------------------------
-- Josh's reasoning for R17 is *"it survives a lawyer asking what she had
-- access to."* A current-state column cannot answer that question — it answers
-- what she has access to NOW. So the state column is paired with an append-only
-- log of every transition, following the `ai_tag_logs` convention in CLAUDE.md:
-- no `updated_at`, no `updated_by`, no soft-delete, and no UPDATE or DELETE
-- policy at all.
--
-- **Owner/Admin only comes free and is already enforced.** `profiles` has
-- exactly two UPDATE policies, `profiles_update_owner` and
-- `profiles_update_admin`, and **no self-update arm** — so a client cannot
-- change her own state, and neither can a PM. Verified live at S164 before
-- relying on it.
--
-- ⚠️ THE TWO DOCUMENT-LIMITED STATES ARE NOT ENFORCED BY THIS MIGRATION, AND
-- THAT IS NOT AN OVERSIGHT. `signed_documents_only` and
-- `documents_for_signature` narrow WHICH DOCUMENTS she sees — and the document
-- surfaces (contracts, invoices, proposals, COs) do not exist for a client yet;
-- they are stage 2's seven policy arms. Both states therefore behave as "still
-- has access" here, and `my_client_access_level()` exists so those arms can ask.
-- **Any stage that adds a client-readable document surface MUST consult it.**
-- A state that is stored and never read is worse than one that is absent,
-- because the UI will report it as being in force.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The one timer.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.client_window_open(p_status text, p_actual_end date)
RETURNS boolean
LANGUAGE sql
STABLE                       -- STABLE not IMMUTABLE: current_date moves.
AS $fn$
  SELECT p_status IS DISTINCT FROM 'complete'
      OR p_actual_end IS NULL
      OR p_actual_end + 45 >= current_date;
$fn$;

COMMENT ON FUNCTION public.client_window_open(text, date) IS
  'M9 R2/R5 [S164]: the 45-day client window, written ONCE. Consumed by '
  'is_client_of_project() (access) and the three invitation helpers (invite). '
  'A second copy of the 45 is how the two clocks drift apart. Not SECURITY '
  'DEFINER and touches no table, so the planner inlines it into every caller.';

-- ----------------------------------------------------------------------------
-- 2. R17 — the three termination states.
-- ----------------------------------------------------------------------------
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS client_access_state TEXT NOT NULL DEFAULT 'active';

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_client_access_state_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_client_access_state_check
  CHECK (client_access_state IN (
    'active',                    -- the default; the window alone governs
    'deactivated',               -- R17 (a): fully deactivate
    'signed_documents_only',     -- R17 (b): limit to signed documents only
    'documents_for_signature'    -- R17 (c): sent for signature, signed or not
  ));

-- A termination state on a non-client is meaningless and would read as a floor
-- that is not being enforced anywhere.
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_client_access_state_client_only;
ALTER TABLE profiles ADD CONSTRAINT profiles_client_access_state_client_only
  CHECK (client_access_state = 'active' OR role = 'client');

COMMENT ON COLUMN profiles.client_access_state IS
  'M9 R17 [S164]: Owner/Admin-only termination state. Enforced by the existing '
  'profiles_update_{owner,admin} policies — profiles has NO self-update arm, so '
  'a client cannot change her own. Every transition is logged to '
  'client_access_events, because R17 exists to survive a lawyer asking what she '
  'had access to and a current-state column cannot answer that.';

-- The audit trail. Append-only: see CLAUDE.md -> "Append-only audit log
-- exception". No updated_at/created_by-pair/soft-delete, no UPDATE or DELETE
-- policy.
CREATE TABLE IF NOT EXISTS client_access_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id),
  profile_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  from_state  TEXT NOT NULL,
  to_state    TEXT NOT NULL,
  reason      TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  actor_id    UUID REFERENCES auth.users(id)
);

ALTER TABLE client_access_events ALTER COLUMN company_id SET DEFAULT get_my_company_id();
ALTER TABLE client_access_events ALTER COLUMN actor_id SET DEFAULT auth.uid();

CREATE INDEX IF NOT EXISTS idx_client_access_events_profile_id
  ON client_access_events (profile_id, created_at DESC);

ALTER TABLE client_access_events ENABLE ROW LEVEL SECURITY;

-- Owner/Admin read it, because it is the answer to "what did she have access
-- to". The client herself does NOT — a termination record is a company record.
DROP POLICY IF EXISTS client_access_events_select_owner_admin ON client_access_events;
CREATE POLICY client_access_events_select_owner_admin ON client_access_events
  FOR SELECT USING (
    company_id = get_my_company_id()
    AND get_my_role() = ANY (ARRAY['owner', 'admin'])
  );

DROP POLICY IF EXISTS client_access_events_insert_owner_admin ON client_access_events;
CREATE POLICY client_access_events_insert_owner_admin ON client_access_events
  FOR INSERT WITH CHECK (
    company_id = get_my_company_id()
    AND get_my_role() = ANY (ARRAY['owner', 'admin'])
  );

-- ----------------------------------------------------------------------------
-- 3. The invitation carries the contact and the project.
-- ----------------------------------------------------------------------------
ALTER TABLE invitations
  ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE;
ALTER TABLE invitations
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE CASCADE;

COMMENT ON COLUMN invitations.project_id IS
  'M9 R2 [S164]: the project whose completion governs this invite. For a client '
  'invitation the validity check reads THIS, never expires_at — expires_at '
  'defaults to now()+7d and would be the second clock R2 forbids.';

-- ----------------------------------------------------------------------------
-- 4. The access level, for the document-limited states.
-- ----------------------------------------------------------------------------
-- Returns 'none' when the caller is not a live client at all, so a policy arm
-- can gate on `<> 'none'` without repeating the linkage rules.
CREATE OR REPLACE FUNCTION public.my_client_access_level()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT COALESCE(
    (
      SELECT CASE
               WHEN me.client_access_state = 'deactivated' THEN 'none'
               WHEN NOT EXISTS (
                 SELECT 1
                 FROM projects ap
                 WHERE ap.company_id = me.company_id
                   AND ap.is_deleted = false
                   AND client_window_open(ap.status, ap.actual_end_date)
                   AND (
                     ap.contact_id = me.contact_id
                     OR EXISTS (
                       SELECT 1 FROM project_contacts pc
                       WHERE pc.project_id = ap.id
                         AND pc.contact_id = me.contact_id
                         AND pc.is_deleted = false
                     )
                   )
               ) THEN 'none'
               WHEN me.client_access_state = 'signed_documents_only' THEN 'signed_documents_only'
               WHEN me.client_access_state = 'documents_for_signature' THEN 'documents_for_signature'
               ELSE 'full'
             END
      FROM profiles me
      WHERE me.user_id = auth.uid()
        AND me.is_deleted = false
        AND me.role = 'client'
        AND me.contact_id IS NOT NULL
      LIMIT 1
    ),
    'none'
  );
$fn$;

-- ----------------------------------------------------------------------------
-- 5. Access: linkage (stage 1) AND the window AND the termination state.
-- ----------------------------------------------------------------------------
-- ⚠️ The lifecycle lives HERE and in nothing that calls this. Stage 1 marked
-- this function as the seam and it is still the seam.
CREATE OR REPLACE FUNCTION public.is_client_of_project(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM profiles me
    JOIN projects pr
      ON pr.id = p_project_id
     AND pr.company_id = me.company_id
     AND pr.is_deleted = false
    WHERE me.user_id = auth.uid()
      AND me.is_deleted = false
      AND me.role = 'client'
      AND me.contact_id IS NOT NULL
      -- R17: 'deactivated' is total. The two document-limited states still
      -- reach the project; they narrow WHICH DOCUMENTS, and that narrowing
      -- belongs to the document policies via my_client_access_level().
      AND me.client_access_state <> 'deactivated'
      -- Linkage to THIS project — R3's two arms, unchanged from stage 1.
      AND (
        pr.contact_id = me.contact_id
        OR EXISTS (
          SELECT 1 FROM project_contacts pc
          WHERE pc.project_id = pr.id
            AND pc.contact_id = me.contact_id
            AND pc.is_deleted = false
        )
      )
      -- R5, and note it is over ALL her projects, not this one:
      -- "no standing archive access without an active project", and its
      -- converse, "on reactivation she sees old projects IN FULL".
      AND EXISTS (
        SELECT 1
        FROM projects ap
        WHERE ap.company_id = me.company_id
          AND ap.is_deleted = false
          AND client_window_open(ap.status, ap.actual_end_date)
          AND (
            ap.contact_id = me.contact_id
            OR EXISTS (
              SELECT 1 FROM project_contacts pc2
              WHERE pc2.project_id = ap.id
                AND pc2.contact_id = me.contact_id
                AND pc2.is_deleted = false
            )
          )
      )
  );
$fn$;

-- ----------------------------------------------------------------------------
-- 6. The site addresses, rewritten onto is_client_of_project().
-- ----------------------------------------------------------------------------
-- ⚠️ STAGE 1 DUPLICATED THE LINKAGE RULES HERE AND THAT WAS A LATENT BUG.
-- It re-stated both arms of `is_client_of_project()` rather than calling it, so
-- adding the window and the termination state above would have gated the
-- PROJECT and left the ADDRESS readable by a deactivated client. Nothing would
-- have failed; the address is not obviously part of the same rule until you go
-- looking. Rewritten to ask the one function, which is what stage 1 should have
-- done.
CREATE OR REPLACE FUNCTION public.my_client_site_address_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT pr.contact_address_id
  FROM projects pr
  WHERE pr.contact_address_id IS NOT NULL
    AND pr.is_deleted = false
    AND is_client_of_project(pr.id);
$fn$;

-- ----------------------------------------------------------------------------
-- 7. Her own contact record follows the same lifecycle.
-- ----------------------------------------------------------------------------
-- A deactivated client must not read her own contact row either. Stage 1's
-- policy gated on `get_my_contact_id()` alone, which is pure linkage.
DROP POLICY IF EXISTS contacts_select_client_own ON contacts;
CREATE POLICY contacts_select_client_own ON contacts
  FOR SELECT USING (
    company_id = (
      SELECT p.company_id FROM profiles p
      WHERE p.user_id = auth.uid() AND p.is_deleted = false
      LIMIT 1
    )
    AND id = get_my_contact_id()
    AND my_client_access_level() <> 'none'
  );

-- ----------------------------------------------------------------------------
-- 8. The invitation helpers — one timer, not two.
-- ----------------------------------------------------------------------------
-- Each gains the same CASE: a client invitation is governed by its project's
-- window; every other role keeps `expires_at` exactly as before.

-- ⚠️ DROP, not CREATE OR REPLACE. The return type gains a column, and Postgres
-- refuses that in place: "cannot change return type of existing function ...
-- Row type defined by OUT parameters is different" (42P13). Safe to drop —
-- handle_new_user() is plpgsql and resolves the call at runtime, and it is
-- recreated in section 9 below anyway.
DROP FUNCTION IF EXISTS public.get_invitation_for_signup(uuid);
CREATE OR REPLACE FUNCTION public.get_invitation_for_signup(invite_token uuid)
RETURNS TABLE(id uuid, company_id uuid, role text, member_id uuid, contact_id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT
    i.id,
    i.company_id,
    i.role,
    i.member_id,
    -- Defensive: never hand a contact link back for a non-client invitation.
    -- `profiles_contact_id_client_only` would refuse the INSERT anyway, but it
    -- would refuse it inside an auth trigger, where the error surfaces as a
    -- failed signup rather than as a bad invitation.
    CASE WHEN i.role = 'client' THEN i.contact_id ELSE NULL END AS contact_id
  FROM invitations i
  LEFT JOIN projects pr ON pr.id = i.project_id
  WHERE i.token = invite_token
    AND i.status = 'pending'
    AND i.is_deleted = false
    AND CASE
          WHEN i.role = 'client'
            THEN pr.id IS NOT NULL
             AND pr.is_deleted = false
             AND client_window_open(pr.status, pr.actual_end_date)
          ELSE i.expires_at > now()
        END;
$fn$;

CREATE OR REPLACE FUNCTION public.get_invitation_by_token(invite_token uuid)
RETURNS TABLE(id uuid, company_name text, email text, role text, expires_at timestamp with time zone)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT
    i.id,
    c.name AS company_name,
    i.email,
    i.role,
    i.expires_at
  FROM invitations i
  JOIN companies c ON c.id = i.company_id
  LEFT JOIN projects pr ON pr.id = i.project_id
  WHERE i.token = invite_token
    AND i.status = 'pending'
    AND i.is_deleted = false
    AND CASE
          WHEN i.role = 'client'
            THEN pr.id IS NOT NULL
             AND pr.is_deleted = false
             AND client_window_open(pr.status, pr.actual_end_date)
          ELSE i.expires_at > now()
        END;
$fn$;

CREATE OR REPLACE FUNCTION public.get_invitation_status(invite_token uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT COALESCE(
    (
      SELECT CASE
        -- A soft-deleted invitation is not distinguishable from one that never
        -- existed. Deliberate: it is the one state that leaks an admin action.
        WHEN i.is_deleted            THEN 'unknown'
        WHEN i.status = 'accepted'   THEN 'already_used'
        WHEN i.status = 'cancelled'  THEN 'cancelled'
        WHEN i.status = 'expired'    THEN 'expired'
        -- The clock differs by role, and this is the branch that has to agree
        -- with get_invitation_for_signup() or the refusal reason contradicts
        -- the refusal.
        WHEN i.role = 'client' THEN
          CASE
            WHEN NOT EXISTS (
              SELECT 1 FROM projects pr
              WHERE pr.id = i.project_id
                AND pr.is_deleted = false
                AND client_window_open(pr.status, pr.actual_end_date)
            ) THEN 'expired'
            WHEN i.status = 'pending' THEN 'valid'
            ELSE 'unknown'
          END
        WHEN i.expires_at <= now()   THEN 'expired'
        WHEN i.status = 'pending'    THEN 'valid'
        ELSE 'unknown'
      END
      FROM invitations i
      WHERE i.token = invite_token
    ),
    'unknown'
  );
$fn$;

-- ----------------------------------------------------------------------------
-- 9. handle_new_user() — carry the contact link through signup.
-- ----------------------------------------------------------------------------
-- ⚠️ REPRODUCED FROM THE LIVE DEFINITION, NOT RETYPED, with exactly two edits:
-- `gi.contact_id` added to the SELECT, and `contact_id` added to the INVITE
-- branch's profile INSERT. **The OWNER branch's INSERT is deliberately
-- untouched** — a self-signup has no invitation and therefore no contact.
--
-- This is the seam that makes an invited client a LINKED client. Without it the
-- account is created, `contact_id` stays NULL, `my_client_access_level()`
-- returns 'none', and she signs in successfully to a portal that shows her
-- nothing — the worst failure available, because it looks like a data problem
-- rather than a wiring one.
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
    VALUES (v_company_id, 'starter', 'incomplete', 2);
  ELSE
    v_trial_end := now() + INTERVAL '30 days';

    INSERT INTO subscriptions (company_id, plan_tier, status, seat_limit, trial_start, trial_end)
    VALUES (v_company_id, 'starter', 'trialing', 2, now(), v_trial_end);

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
