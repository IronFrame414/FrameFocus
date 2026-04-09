# Context — FrameFocus Build Session (April 2, 2026)

## What happened this session

This was the third coding session. Module 1F (Stripe Billing Integration) was built end to end.

### Module 1F completed:

**Stripe account setup:**
- Stripe account created under FrameFocus sandbox (test mode)
- SDK language set to Node.js
- Recurring payments enabled
- 3 subscription products created in Stripe Dashboard: Starter ($79/mo), Professional ($149/mo), Business ($249/mo)
- Webhook endpoint registered: `https://frame-focus-eight.vercel.app/api/stripe/webhook`
- Webhook listens for: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`

**Database changes (run in Supabase):**
- Migration 007: Created `subscriptions` table (company_id, stripe_subscription_id, plan_tier, status, seat_limit, trial dates, period dates, cancel_at_period_end). `stripe_customer_id` column already existed on `companies` table from earlier work. Updated `handle_new_user()` trigger to auto-create a 30-day trial subscription on Starter plan when a new Owner signs up. RLS allows any company member to read their subscription; only service_role (webhook) can write.

**Files created:**
- `packages/supabase/migrations/007_subscriptions.sql` — subscriptions table + updated trigger
- `apps/web/lib/stripe.ts` — Stripe server client (no hardcoded API version, uses account default)
- `apps/web/lib/services/billing.ts` — getSubscription(), getTrialDaysRemaining(), isTrialExpired() helpers
- `apps/web/lib/services/seats.ts` — getSeatUsage() helper (counts members + pending invites vs seat limit, excludes client role)
- `apps/web/app/api/stripe/checkout/route.ts` — POST endpoint creates Stripe Checkout session with plan selection, carries remaining trial days to Stripe, creates Stripe customer if needed
- `apps/web/app/api/stripe/webhook/route.ts` — Processes Stripe events using service_role Supabase client to bypass RLS. Handles checkout completion, subscription updates, subscription deletion, and failed payments
- `apps/web/app/dashboard/billing/page.tsx` — Owner-only billing settings page showing plan, status, trial countdown, and warnings for past_due/canceled states
- `apps/web/app/dashboard/billing/plans/page.tsx` — Plan selection server component
- `apps/web/app/dashboard/billing/plans/plan-selection.tsx` — Pricing cards UI with checkout redirect
- `apps/web/app/dashboard/billing/success/page.tsx` — Post-checkout confirmation page

**Files modified:**
- `apps/web/app/dashboard/dashboard-shell.tsx` — Added Billing nav link (visible to Owner role only)
- `apps/web/app/dashboard/team/invite/page.tsx` — Added seat usage check before rendering invite form
- `apps/web/app/dashboard/team/invite/invite-form.tsx` — Added SeatUsage prop, seat usage banner, blocks invite submission when seats full (client invites exempt)

### Architecture decisions made this session:

1. **30-day free trial on sign-up** — Every new Owner gets a 30-day trial on the Starter plan (2 seats). No credit card required. Trial length is controlled by a single value in the database trigger and carried to Stripe during checkout.
2. **Trial-first checkout flow** — Owners browse the dashboard in trial mode. When they choose a plan via /dashboard/billing/plans, remaining trial days carry over to Stripe so they aren't charged until the original trial period expires.
3. **Service role for webhook writes** — The webhook handler uses a Supabase service_role client (bypasses RLS) because webhook requests aren't authenticated as any user. The service_role key is stored as SUPABASE_SERVICE_ROLE_KEY env var.
4. **Seat enforcement excludes clients** — Client invites don't count toward the plan's seat limit. Only Owner, Admin, PM, Foreman, and Crew Member count.
5. **Stripe Connect deferred** — "Build a platform or marketplace" was not enabled during Stripe setup. Will be enabled later when Module 7/8 (client payments) is built.

### Environment variables (apps/web/.env.local and Vercel):

- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon key
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase service role key (added this session)
- `STRIPE_SECRET_KEY` — sk_test_... key
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` — pk_test_... key
- `STRIPE_WEBHOOK_SECRET` — whsec_... signing secret

### Important technical notes:

- The Stripe SDK version installed uses API version `2026-03-25.dahlia`. No hardcoded apiVersion in stripe.ts — it uses the account default.
- Price IDs for the three tiers are hardcoded in `apps/web/app/api/stripe/checkout/route.ts`. If products are recreated in Stripe, these IDs must be updated.
- The `supabase-server.ts` exports `createClient` (not `createServerClient`). All server-side imports use `import { createClient } from '@/lib/supabase-server'`.
- The checkout route creates a Stripe customer on first checkout and saves the `stripe_customer_id` to the companies table.

### Known accounts:

- **Supabase:** josh@worthprop.com, FrameFocus project at jwkcknyuyvcwcdeskrmz.supabase.co
- **GitHub:** IronFrame414, repo: FrameFocus
- **Vercel:** Connected via GitHub, project: FrameFocus, URL: https://frame-focus-eight.vercel.app
- **Stripe:** FrameFocus sandbox (test mode), webhook endpoint configured
- **Test user in database:** Josh Bishop (jsbishop14@gmail.com), Owner of Bishop Contracting

### Migrations run (all saved to packages/supabase/migrations/):

1. 001 — companies, profiles, platform_admins tables
2. 002 — handle_new_user() trigger (original)
3. 003 — admin role + invitations table
4. 004 — handle_new_user() updated for invite flow
5. 005 — RLS policies updated for admin role
6. 006 — handle_new_user() fixed to use user_id column
7. 007 — subscriptions table + handle_new_user() updated for auto trial creation

### What's next (first tasks for next session):

1. **Full system test** — Before building anything new, test the entire flow end to end:
   - Create a new Owner account (fresh sign-up on the live Vercel URL)
   - Confirm email and sign in
   - Verify trial subscription was auto-created (check Supabase subscriptions table)
   - Verify Billing page shows "Free Trial" status with 30-day countdown
   - Go to Choose Plan → select a tier → complete Stripe Checkout using test card 4242 4242 4242 4242 (any future expiry, any CVC, any zip)
   - Verify webhook updated the subscription record in Supabase
   - Go to Team → Invite a team member → verify seat usage banner appears
   - Test seat enforcement by inviting up to the seat limit
   - Test that client invites bypass the seat limit
   - Accept an invitation in a different browser/incognito window
   - Verify the invited user appears on the team page with correct role

2. **Company settings page** — Edit company name, address, trade type, logo

3. **Module 2: Contacts & CRM** — Unified people database (leads, clients, subs, suppliers). Referenced by all later modules.

### How to start the next session:

Paste this context.md and CLAUDE.md and say: "Starting a new FrameFocus session. Running the full system test first, then continuing the build."
