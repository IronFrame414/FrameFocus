-- ============================================================================
-- Retention warnings + the tokenized resubscribe path
-- [Josh's Phase-3 rulings on docs/specs/deletion-sweep-analysis.md: Q1, Q5, Q9]
-- ============================================================================
-- Three warnings precede permanent deletion (R3, copy ruled in
-- docs/specs/retention-warning-emails.md):
--
--   cancellation (90-day window):  email 1 at <= 60 days remaining
--                                  email 2 at <= 30 days remaining
--   trial        (14-day window):  email 1 at <=  4 days remaining
--
-- Day arithmetic counts BACK from `delete_after` (Q9) — the stored fact the
-- email names and the sweep enforces — never forward from `locked_at`.
--
-- The stamps below are the idempotency guard, same shape as warned_7_at /
-- warned_3_at: written in the same step as the send, read instead of the
-- calendar, so a missed cron day sends LATE rather than silently skipping.
-- ============================================================================

ALTER TABLE public.trial_lifecycle
  ADD COLUMN retention_warned_1_at timestamptz,
  ADD COLUMN retention_warned_2_at timestamptz;

COMMENT ON COLUMN public.trial_lifecycle.retention_warned_1_at IS
  'Idempotency stamp: first retention warning (cancellation <=60d remaining, or trial <=4d). Same doctrine as warned_7_at.';
COMMENT ON COLUMN public.trial_lifecycle.retention_warned_2_at IS
  'Idempotency stamp: second retention warning (cancellation <=30d remaining; unused on the trial path). Same doctrine as warned_3_at.';

-- ----------------------------------------------------------------------------
-- The resubscribe token [Q1 ruling: option (a)].
--
-- ⚠️ THE LOCK IS AN AUTH BAN, so the warning emails' one named action —
-- resubscribe — cannot sit behind sign-in: a banned user's sign-in fails with
-- "User is banned" and any pre-ban session died within an hour of the lock
-- (S138 measurement). The token is the credential that replaces the session
-- on exactly one surface: /resubscribe and /api/resubscribe/checkout.
--
-- STORED-RANDOM RATHER THAN HMAC-SIGNED, deliberately, and this is the one
-- place the implementation departs from the ruling's word ("signed") while
-- keeping its properties. A stored gen_random_uuid() is equally unguessable
-- (122 bits), needs no new signing secret in Vercel (an attended env-var step
-- the signed variant would gate the build on), and is REVOCABLE — which a
-- signature is not: unlock_trial_company() below rotates it, so a link in a
-- stale email stops working the moment the company pays or is unlocked.
--   * Company-scoped: the token IS the row key; the row is one company.
--   * Expiring: valid only while locked_at IS NOT NULL, deleted_at IS NULL
--     and delete_after > now() — enforced at both token surfaces, and the
--     rotation on unlock ends it early.
--
-- NOT NULL with a default so every existing and future lifecycle row has one
-- from birth; the column is reachable only through the service role
-- (trial_lifecycle has no tenant SELECT arm on this surface).
-- ----------------------------------------------------------------------------
ALTER TABLE public.trial_lifecycle
  ADD COLUMN resubscribe_token uuid NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX idx_trial_lifecycle_resubscribe_token
  ON public.trial_lifecycle (resubscribe_token);

COMMENT ON COLUMN public.trial_lifecycle.resubscribe_token IS
  'Unauthenticated resubscribe credential for LOCKED accounts (Q1a). Valid only while locked and before delete_after; rotated by unlock_trial_company().';

-- ----------------------------------------------------------------------------
-- email_types — the retention warning. Both halves or neither (the `mention`
-- lesson): the EmailType union member lands in the same commit as this row.
-- One type for all three emails; email_logs.metadata carries the kind
-- ('cancellation_60' | 'cancellation_30' | 'trial_4').
-- ----------------------------------------------------------------------------
INSERT INTO public.email_types (email_type)
VALUES ('retention_warning')
ON CONFLICT (email_type) DO NOTHING;

-- ----------------------------------------------------------------------------
-- unlock_trial_company() — unchanged except ONE added assignment: rotate the
-- resubscribe token when the lock ends. A paid-or-unlocked company's old
-- warning emails then hold a dead link, which is the correct end state for a
-- credential that exists only to escape a lock that no longer exists.
--
-- The two ban guards are reproduced VERBATIM from 20260919000000 — they are
-- load-bearing (deactivated members must stay banned) and this replacement
-- must not drift from them.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.unlock_trial_company(p_company_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_unbanned integer := 0;
BEGIN
  -- ⚠️ TWO GUARDS, AND NEITHER IS DECORATION. A trial lock must not become a
  -- back door that reinstates a member somebody deliberately removed.
  --
  --   `p.is_deleted = false`  — `softDeleteTeamMember()` (lib/services/team.ts)
  --                             sets is_deleted AND bans. Those people are gone
  --                             on purpose and must stay gone.
  --   `< now() + 50 years`    — the horizon tells the two bans apart. The trial
  --                             lock is `8760h` (~1 year); a deactivation is
  --                             `876000h` (100 years).
  UPDATE auth.users u
     SET banned_until = NULL
    FROM public.profiles p
   WHERE p.user_id = u.id
     AND p.company_id = p_company_id
     AND p.is_deleted = false
     AND u.banned_until IS NOT NULL
     AND u.banned_until < now() + INTERVAL '50 years';
  GET DIAGNOSTICS v_unbanned = ROW_COUNT;

  -- Clearing `delete_after` takes the company out of the deletion sweep;
  -- rotating `resubscribe_token` kills the emailed escape-hatch link in the
  -- same breath [20261053].
  UPDATE public.trial_lifecycle
     SET locked_at = NULL,
         delete_after = NULL,
         resubscribe_token = gen_random_uuid()
   WHERE company_id = p_company_id
     AND locked_at IS NOT NULL;

  RETURN v_unbanned;
END;
$$;
