-- ============================================================================
-- S137 — TRIAL LIFECYCLE: schema
--
-- Spec: docs/specs/trial-lifecycle-spec.md
-- Interview (kept, not superseded): docs/specs/trial-lifecycle-interview.md
-- ============================================================================
--
--   day −7   warning        email + in-app, Owner and Admin
--   day −3   warning
--   day  0   trial expires  ACCOUNT LOCKED — auth users banned
--            14 days retained, recoverable only by paying
--   day 14   DELETED        71 tables + storage + the auth users
--
-- The export window is the PRE-EXPIRY period. Once locked, the data cannot be
-- reached at all — the 14 days is pay-to-recover, not export. That is why the
-- warnings sit at −7 and −3.
--
-- ============================================================================
-- ⚠️ THE DELETION JOB IS BUILT AND DELIBERATELY NOT SCHEDULED.
-- ============================================================================
-- TL-24 — whether these records may be deleted on this timetable AT ALL — is
-- UNANSWERED and with legal review. It can invalidate the expiry ruling
-- entirely. Josh ruled: build everything, and leave the deletion job OUT of
-- `apps/web/vercel.json`.
--
-- The tables below exist. The job exists. It is tested. IT DOES NOT RUN.
--
-- **If you are here because you noticed there is no cron entry for
-- /api/cron/trial-deletion: that is not an oversight.** Adding that one line
-- permanently destroys customer data across 71 tables and two storage buckets.
-- It is Josh's line to add, after legal returns. The same warning is in the
-- spec and in the route file.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. trial_lifecycle — one row per company, the whole lifecycle in one place.
--
--    NOT a new value on `subscriptions.status`. That column mirrors STRIPE's
--    vocabulary and this state is OURS; worse, `canceled` already exists and
--    means "paid, then cancelled", which the ruling gives 30 days of retention
--    against a trial's 14. Conflating them would make the two paths
--    indistinguishable at exactly the moment the difference matters.
--
--    No `created_by` / `updated_by`: every writer is a cron running as the
--    service role, where `auth.uid()` is NULL. Columns that could only ever be
--    NULL are worse than absent — they read as data that was lost.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.trial_lifecycle (
  company_id        uuid PRIMARY KEY REFERENCES public.companies(id),

  -- Denormalised from subscriptions at creation. The clock every step reads, so
  -- that a Stripe-side status change cannot silently move a deletion date.
  trial_end         timestamptz NOT NULL,

  -- Set by the warning cron. ALSO THE IDEMPOTENCY GUARD: a cron that runs twice
  -- in a day must not warn twice, and these are what stop it.
  warned_7_at       timestamptz,
  warned_3_at       timestamptz,

  -- Set when the account is locked and its auth users are banned.
  locked_at         timestamptz,
  -- locked_at + 14 days. The deletion job reads THIS and nothing else, so the
  -- retention window is a stored fact rather than arithmetic repeated in code.
  delete_after      timestamptz,

  -- Josh's manual postpone. Non-NULL and in the future => every step skips.
  -- Shaped for a future system-admin UI that does not exist and is not built.
  postponed_until   timestamptz,
  postponed_by      uuid REFERENCES auth.users(id),
  postponed_reason  text,

  deleted_at        timestamptz,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trial_lifecycle_trial_end
  ON public.trial_lifecycle (trial_end) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_trial_lifecycle_delete_after
  ON public.trial_lifecycle (delete_after) WHERE deleted_at IS NULL;

CREATE TRIGGER trial_lifecycle_updated_at
  BEFORE UPDATE ON public.trial_lifecycle
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.trial_lifecycle ENABLE ROW LEVEL SECURITY;

-- ⚠️ SELECT ONLY, AND NO WRITE POLICY OF ANY KIND. A tenant reading their own
-- expiry date is reasonable; a tenant WRITING it would move their own deletion
-- date, so there is deliberately no INSERT, UPDATE or DELETE policy and every
-- write is service-role. This is the whole security model of the table.
CREATE POLICY trial_lifecycle_select_owner_admin ON public.trial_lifecycle
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
  );


-- ----------------------------------------------------------------------------
-- 2. trial_warning_acknowledgements — who clicked, when.
--
--    ⚠️ NOT `notifications.read_at` [Josh, S137 Q6]. That is set by the
--    notification LIST rendering, so it proves a row appeared in a list — not
--    that a human read a warning about permanent data loss. This row is written
--    by a button on the warning screen and by nothing else.
--
--    Append-only (CLAUDE.md's log exception): no updated_at, no created_by, no
--    soft delete, SELECT + INSERT policies only.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.trial_warning_acknowledgements (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES public.companies(id),
  profile_id     uuid NOT NULL REFERENCES public.profiles(id),
  warning_kind   text NOT NULL CHECK (warning_kind IN ('day_7', 'day_3')),
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trial_ack_company
  ON public.trial_warning_acknowledgements (company_id, created_at DESC);

ALTER TABLE public.trial_warning_acknowledgements ENABLE ROW LEVEL SECURITY;

CREATE POLICY trial_ack_select_owner_admin ON public.trial_warning_acknowledgements
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
  );

-- The acknowledger must be acknowledging AS THEMSELVES. Without the profile
-- test an Admin could acknowledge on the Owner's behalf, which is precisely the
-- evidence this table exists to be.
CREATE POLICY trial_ack_insert_self ON public.trial_warning_acknowledgements
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
    AND profile_id = public.get_my_profile_id()
  );


-- ----------------------------------------------------------------------------
-- 3. trial_emails — a ROW PER TRIAL, not one row per address.
--
--    `trial_emails_email_key UNIQUE (email)` is dropped [Josh, S137]. A counter
--    would have been a smaller change; dates are needed to warn correctly on
--    trials 2 and 3, and a time window ("3 per year") can then be added without
--    another migration.
--
--    ⚠️ THESE ROWS SURVIVE COMPANY DELETION. If they went with the company the
--    three-trial count would reset and the mechanism would be defeated — which
--    is why `company_id` is NULLABLE and carries ON DELETE SET NULL rather than
--    the usual cascade.
-- ----------------------------------------------------------------------------
ALTER TABLE public.trial_emails DROP CONSTRAINT IF EXISTS trial_emails_email_key;

ALTER TABLE public.trial_emails
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;
ALTER TABLE public.trial_emails
  ADD COLUMN IF NOT EXISTS trial_number integer NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_trial_emails_email ON public.trial_emails (email);

COMMENT ON COLUMN public.trial_emails.trial_number IS
  'S137: 1, 2 or 3. A 4th signup on the same address is refused a trial.';
COMMENT ON COLUMN public.trial_emails.company_id IS
  'S137: ON DELETE SET NULL, not CASCADE — the row must outlive the company or '
  'the three-trial count resets when the company is deleted.';


-- ----------------------------------------------------------------------------
-- 4. deletion_jobs — per-table resumable state.
--
--    Deletion spans 71 company-scoped tables plus two storage buckets and
--    CANNOT BE ONE TRANSACTION: storage cannot join a database transaction. So
--    each step commits independently and records itself here, and a job that
--    dies is resumed rather than restarted.
--
--    ⚠️ ON REPEATED FAILURE IT STOPS AND ALARMS RATHER THAN RETRYING. A
--    half-deleted company needs a human, not another attempt — a retry loop
--    against a persistent error deletes more of a company nobody has looked at.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.deletion_jobs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id),
  state         text NOT NULL DEFAULT 'pending'
                  CHECK (state IN ('pending', 'running', 'stopped', 'complete')),
  tables_done   text[] NOT NULL DEFAULT '{}',
  storage_done  boolean NOT NULL DEFAULT false,
  auth_done     boolean NOT NULL DEFAULT false,
  attempts      integer NOT NULL DEFAULT 0,
  last_error    text,
  started_at    timestamptz,
  finished_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deletion_jobs_state ON public.deletion_jobs (state);

CREATE TRIGGER deletion_jobs_updated_at
  BEFORE UPDATE ON public.deletion_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.deletion_jobs ENABLE ROW LEVEL SECURITY;
-- No policies at all: service-role only. A tenant has no business reading the
-- job that deletes them, and certainly none writing it.


-- ----------------------------------------------------------------------------
-- 5. export_jobs — the export, which is a job because multi-GB is expected.
--
--    `maxDuration` on Vercel is 300 SECONDS. That ceiling is per invocation and
--    is not negotiable, so a full export cannot be one pass regardless of any
--    other ruling — `cursor` is what lets the next invocation continue.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.export_jobs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES public.companies(id),
  requested_by   uuid NOT NULL REFERENCES public.profiles(id),
  categories     text[] NOT NULL DEFAULT '{}',
  format         text NOT NULL DEFAULT 'zip' CHECK (format IN ('zip', 'zip_csv')),
  state          text NOT NULL DEFAULT 'pending'
                   CHECK (state IN ('pending', 'running', 'complete', 'failed', 'expired')),
  cursor         jsonb NOT NULL DEFAULT '{}'::jsonb,
  bytes_written  bigint NOT NULL DEFAULT 0,
  object_path    text,
  expires_at     timestamptz,
  last_error     text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_export_jobs_state ON public.export_jobs (state);
CREATE INDEX IF NOT EXISTS idx_export_jobs_company ON public.export_jobs (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_export_jobs_expires ON public.export_jobs (expires_at)
  WHERE expires_at IS NOT NULL;

CREATE TRIGGER export_jobs_updated_at
  BEFORE UPDATE ON public.export_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.export_jobs ENABLE ROW LEVEL SECURITY;

-- ⚠️ THIS TABLE IS THE EXPORT AUDIT [Josh]. "A departing employee exporting
-- everything on their last day is a real scenario", so the row is readable by
-- Owner/Admin and is never deleted when the object expires — the object goes,
-- the record of who took it stays.
CREATE POLICY export_jobs_select_owner_admin ON public.export_jobs
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
  );

-- No INSERT policy: the route creates the job with the service role AFTER
-- checking role and lock state, so a client cannot enqueue an export for a
-- company whose trial has expired by writing the row directly.


-- ----------------------------------------------------------------------------
-- 6. The `exports` bucket — private, and separate from `project-files`.
--
--    Separate [Josh, S137 Q2] so the deletion walk does not have to
--    special-case a reserved prefix inside a bucket it is already walking. Path
--    is `{company_id}/{export_job_id}.zip`, so `(storage.foldername(name))[1]`
--    is the company id exactly as the other buckets do it.
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('exports', 'exports', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- ⚠️ INLINE SUBQUERY, NOT get_my_company_id() (CLAUDE.md). The helper silently
-- returns NULL inside storage.objects policies, which makes the policy match
-- nothing and fails in a way that looks unrelated to the policy.
DROP POLICY IF EXISTS exports_select_owner_admin ON storage.objects;
CREATE POLICY exports_select_owner_admin ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'exports'
    AND (storage.foldername(name))[1] = (
      SELECT company_id::text FROM public.profiles
      WHERE user_id = auth.uid() AND is_deleted = false
    )
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
  );

-- No INSERT/UPDATE/DELETE policy: only the export job (service role) writes
-- here, and only the sweep removes.


-- ----------------------------------------------------------------------------
-- 7. The two registries the warnings need.
--
--    `notifications.type` is a CHECK; `email_logs.email_type` is FK-backed by
--    `email_types` (S136 established that the baseline's CHECK was dropped in
--    20260720000000). Two registries, two different edits — and the TypeScript
--    `EmailType` union is the third half that only fails at compile time.
-- ----------------------------------------------------------------------------
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'mention',
    'assignment',
    'incident',
    'signed',
    'reminders_exhausted',
    'discrepancy',
    'timesheet_ready',
    'daily_log_missing',
    'still_clocked_in',
    'contract_signed',
    'punch_assigned',
    'low_stock',
    'trial_warning'      -- S137
  ));

INSERT INTO public.email_types (email_type)
VALUES ('trial_warning')
ON CONFLICT (email_type) DO NOTHING;


-- ----------------------------------------------------------------------------
-- 8. handle_new_user() — the trial COUNT replaces the trial EXISTS.
--
--    Reproduced from 20260917000000 byte for byte except the trial block. The
--    D1 refusal, the invited path, the subcontractor member link and the tag
--    seed are unchanged; showing the whole body is the only way a reader can
--    see that.
--
--    ⚠️ THE IDENTITY IS AN EMAIL ADDRESS AND `josh+1@` DEFEATS IT. That is
--    ACCEPTED [Josh, S137], not an oversight. Do NOT "fix" it by normalising
--    plus-addressing: that breaks every person who legitimately uses + tags to
--    route mail, which is common. A real limit needs a different signal and a
--    ruling, not a regex.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;
