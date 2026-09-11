-- ============================================================================
-- Warming sender [Josh, deliverability session, 2026-09-10]
-- ============================================================================
--
-- Google Postmaster reports ezcontractorbinder.com fully compliant on every
-- requirement and says: "You haven't sent enough email to personal Gmail
-- accounts to determine deliverability status." Nothing is misconfigured; the
-- gap is volume Gmail can count. This adds a low, steady, non-clockwork sender.
--
-- TWO HALVES, AND THEY MUST LAND TOGETHER.
--
-- 1. `email_types.warming` — the registry row. ⚠️ The other half of this
--    registry is the `EmailType` union in `lib/services/email-service.ts`, and
--    it has been shipped without its partner before (`mention`, S126): the
--    table half fails at RUNTIME and the union half at COMPILE time, so one
--    without the other ships silently. Both halves are in this commit. This is
--    the fifth time that rule is written down.
--
--    ⚠️ WHY A NEW TYPE RATHER THAN REUSING ONE. Ruled [Josh]: no existing
--    message type can be made inert. Every one of the other 25 is defined by a
--    record it points at — an estimate, an invoice, a PO, an invitation — so
--    reusing one means either fabricating that record or mailing a real one.
--    Logging warming mail as `proposal` would also poison the one table the
--    deliverability work reads.
--
-- 2. `companies.email_warming_enabled` — THE OFF SWITCH, and the selector.
--
--    ⚠️ IT IS A COLUMN AND NOT AN ENV VAR ON PURPOSE. The requirement was an
--    off switch that does not need a deploy, and a Vercel environment variable
--    does not satisfy it: env values are snapshotted into a deployment, so
--    editing one in the dashboard changes nothing until a redeploy. This flips
--    with one UPDATE in the Supabase dashboard and takes effect on the next
--    cron fire.
--
--    It is also the SELECTOR — the cron sends for every company with the flag
--    true, so no slug is hardcoded anywhere. That matters because of #119's
--    collision rule (20260917000000): `worth-properties` becomes
--    `worth-properties-2` on collision, and a hardcoded sender address would
--    silently become wrong rather than loudly missing.
--
--    DEFAULT false: every existing tenant, and every tenant created later, is
--    off until somebody deliberately turns it on.
--
--    ⚠️ NOTE ON WHO CAN TOGGLE IT. This column inherits `companies`' existing
--    policies, so an Owner/Admin can set it for their own tenant. That is not a
--    data-exposure risk — the recipient list is a hardcoded constant in
--    `lib/services/warming-email.ts`, four addresses Josh owns — but it does
--    mean a tenant could start sending Josh warming mail. Deliberately left
--    rather than floored: a narrower policy on one column of `companies` would
--    be the first of its kind in this schema, and the consequence is mail to
--    Josh rather than a leak. Revisit if a real tenant ever finds the toggle.
--
-- THE THREE LEVERS, in descending scope, so nobody has to guess which to reach
-- for: (1) EMAIL_SEND_ENABLED=false stops ALL platform mail and needs a
-- redeploy; (2) disabling the cron in the Vercel dashboard stops the job,
-- deploy-free; (3) this column, deploy-free and per company. (3) is the one to
-- reach for.
-- ============================================================================

INSERT INTO public.email_types (email_type)
VALUES ('warming')
ON CONFLICT (email_type) DO NOTHING;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS email_warming_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.companies.email_warming_enabled IS
  'Deliverability warming sender [2026-09-10]. When true, the /api/cron/email-warming '
  'job sends this tenant''s share of the weekly warming quota. Deploy-free off switch '
  'and selector — see 20261590000000_email_warming.sql.';
