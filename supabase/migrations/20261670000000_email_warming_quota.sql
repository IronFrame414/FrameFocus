-- ============================================================================
-- Per-company weekly warming quota [RULED Josh, 2026-09-22]
-- ============================================================================
--
-- The warming sender shipped with ONE number for every tenant:
-- `WEEKLY_QUOTA_PER_COMPANY = 12` in `lib/services/warming-email.ts`. The quota
-- is now PER COMPANY — Worth Properties 20, H&H Signature Renovations 10.
--
-- ⚠️ WHY A COLUMN AND NOT A MAP KEYED ON SLUG IN CODE. Ruled [Josh], and it is
-- the same reasoning that made `email_warming_enabled` a column rather than an
-- env var or a hardcoded list (20261590000000):
--
--   1. #119'S COLLISION RULE CAN CHANGE A SLUG. `20260917000000` renames
--      `worth-properties` to `worth-properties-2` on collision. A quota map
--      keyed on slug would silently fall back to the default at the moment the
--      slug moved — wrong quietly, which is the failure mode this repo keeps
--      paying for. A column travels with the row.
--   2. HARDCODING TENANTS IN THE PRODUCT IS WRONG. Two named companies in a
--      shipped constant is customer data in the source tree, and it makes a
--      per-tenant setting need a deploy.
--   3. DEPLOY-FREE, like the off switch beside it. One UPDATE in the Supabase
--      dashboard takes effect on the next cron fire.
--
-- ⚠️ THE UPPER BOUND IS NOT DECORATION — IT PREVENTS CLOCKWORK.
-- The cron offers exactly 200 slots a week (`*/15 13-22 * * 1-5` = 4/hour ×
-- 10 hours × 5 weekdays). `shouldSendNow` sends with probability
-- (remaining / slotsLeft), and its end-of-week guarantee fires EVERY remaining
-- slot once `slotsLeft <= remaining`. So a quota at or near 200 degenerates into
-- a fixed quarter-hourly send — precisely the detectable pattern the design
-- exists to avoid, on the one domain that cannot afford it.
--
-- 50 keeps the opening probability at 50/200 = 0.25, comfortably irregular,
-- and is already generous for four fixed inboxes: 50/week/company is ~12 per
-- inbox per week from ONE tenant. The structural ceiling is 200; the sane
-- ceiling is far lower, and this is it. 0 is allowed deliberately — it pauses a
-- tenant's sending without clearing `email_warming_enabled`, which keeps the
-- "is this tenant armed" and "how much" questions separate.
--
-- ⚠️ THIS MIGRATION MUST LAND BEFORE THE CODE THAT READS THE COLUMN.
-- The new `runEmailWarming` selects `email_warming_weekly_quota`; against a
-- database without it, the companies query errors and the sender stops (loudly
-- — the error is read, not discarded). The reverse order is safe: this column
-- on the OLD code is simply ignored. Apply, then deploy.
-- ============================================================================

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS email_warming_weekly_quota INTEGER NOT NULL DEFAULT 12;

-- Separate statement rather than a column-level CHECK so re-running against a
-- database that already has the column still installs the constraint.
ALTER TABLE public.companies
  DROP CONSTRAINT IF EXISTS companies_email_warming_weekly_quota_check;

ALTER TABLE public.companies
  ADD CONSTRAINT companies_email_warming_weekly_quota_check
  CHECK (email_warming_weekly_quota >= 0 AND email_warming_weekly_quota <= 50);

COMMENT ON COLUMN public.companies.email_warming_weekly_quota IS
  'Deliverability warming sender [2026-09-22]. Messages this tenant sends per ISO '
  'week when email_warming_enabled is true. DEFAULT 12 mirrors the previous shared '
  'constant; capped at 50 because the cron offers 200 slots a week and a quota near '
  'that turns irregular spacing into clockwork. See 20261670000000_email_warming_quota.sql.';
