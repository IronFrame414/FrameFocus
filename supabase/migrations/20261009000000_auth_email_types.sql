-- ============================================================================
-- P1 / P2 [S160] — email_types for the emails Supabase Auth composes.
-- ============================================================================
--
-- Findings: `docs/specs/S159-invite-email-investigation.md` §4 and §8.
-- Rulings: Josh, S160 — all five proposals approved.
--
-- ----------------------------------------------------------------------------
-- WHY THIS MIGRATION EXISTS
-- ----------------------------------------------------------------------------
-- `email_logs.email_type` is `NOT NULL` with
-- `email_logs_email_type_fkey → email_types(email_type) ON DELETE RESTRICT`, so
-- a row cannot be logged for a type that has not been declared here first.
--
-- Until S160, four surfaces sent email through Supabase Auth's own mailer —
-- sign-up confirmation, invite acceptance, forgot-password and the team page's
-- password reset — and **none of them wrote anything to `email_logs`**. That is
-- how the whole problem stayed invisible: a confirmation email that never
-- arrived left no trace in the product, in the logs, or in any harness.
--
-- P1 routes those sends through `email-service.ts` (Resend) via GoTrue's Send
-- Email Hook. P2 — logging them — then costs one `logEmail()` call, but only if
-- the types exist. They are added here rather than in application code because
-- `email_types` is a table, not an enum.
--
-- ----------------------------------------------------------------------------
-- THE `auth_` PREFIX IS LOAD-BEARING
-- ----------------------------------------------------------------------------
-- Every existing type — `proposal`, `invite`, `invoice`, `change_order` — names
-- an email THIS APPLICATION composes, from a React template, at a moment the
-- app chose. These six are different in kind: **GoTrue decides when they are
-- sent and what they must contain**, and the app only renders and delivers
-- them. A future reader filtering `email_logs` for "what did we send this
-- customer" wants to be able to tell those apart at a glance, and a shared
-- namespace is the cheapest way to say so.
--
-- ⚠️ `auth_invite` IS NOT THE SAME THING AS `invite`, and the difference is the
-- entire subject of the S159 investigation:
--
--   * `invite`      — `sendInviteEmail()`. OUR invitation, from OUR template,
--                     branded with the tenant company, Reply-To the company,
--                     carrying `/invite/accept?token=…`. This is the healthy
--                     path and it has always gone through Resend.
--   * `auth_invite` — GoTrue's own invite, which only fires if somebody uses
--                     the Supabase DASHBOARD's Authentication → Users → Invite
--                     button. Nothing in this repository triggers it. It is
--                     declared anyway because the hook must never drop an email
--                     it did not expect, and an unlogged send is the defect
--                     being fixed.
--
-- ----------------------------------------------------------------------------
-- ADDITIVE AND REVERSIBLE. Six rows in a lookup table; no column, constraint or
-- policy changes. `ON DELETE RESTRICT` means removing one later requires the
-- log rows to be gone first, which is the correct protection for an audit
-- trail.
-- ============================================================================

INSERT INTO public.email_types (email_type) VALUES
  -- `signup` — the confirmation a new account must click before it can sign in.
  -- The single most consequential one: `mailer_allow_unverified_email_sign_ins`
  -- is false, so a public sign-up that never receives this cannot sign in at
  -- all.
  ('auth_signup_confirmation'),
  -- `recovery` — forgot-password, and the team page's "send password reset".
  ('auth_recovery'),
  -- `magiclink` — passwordless sign-in. Not used by any app surface today;
  -- `scripts/seed-test-identities.mjs` and `test/live-session.ts` reach for
  -- magic links through `admin.generateLink()`, which RETURNS a link and sends
  -- nothing, so it does not reach the hook.
  ('auth_magic_link'),
  -- `email_change` / `email_change_current` / `email_change_new` — all three of
  -- GoTrue's change-of-address actions log under one type.
  -- `mailer_secure_email_change_enabled` is true on production, which means BOTH
  -- the old and the new address are mailed, so one action can produce two rows.
  ('auth_email_change'),
  -- `reauthentication` — the 6-digit code for a sensitive re-auth. No surface
  -- requests it yet.
  ('auth_reauthentication'),
  -- See the block comment above: this is NOT `invite`.
  ('auth_invite')
ON CONFLICT (email_type) DO NOTHING;

COMMENT ON TABLE public.email_types IS
  'Lookup for email_logs.email_type. Rows without a prefix name an email THIS APP composes and sends. Rows prefixed auth_ name an email SUPABASE AUTH (GoTrue) composes, delivered through the Send Email Hook at /api/auth/send-email so it goes out over Resend on the aligned sending domain and lands in email_logs like everything else [S160]. auth_invite is GoTrue''s dashboard invite and is NOT the app''s own `invite` — see 20261009000000.';
