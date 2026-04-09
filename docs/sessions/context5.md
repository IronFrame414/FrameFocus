# Context — FrameFocus Build Session (April 5, 2026)

## What happened this session

This was the fourth session. System audit fixes were applied and full end-to-end testing was completed. All Module 1 features (1A–1F) are now verified working in production.

### Audit fixes applied:

1. **Subscription enforcement in middleware** — Expired trials, canceled, unpaid, or incomplete subscriptions now redirect to `/dashboard/billing/plans`. Billing pages are exempted so users can fix their subscription.
2. **Trial abuse prevention** — New `trial_emails` table tracks emails that have used a free trial. The `handle_new_user()` trigger checks this table; repeat emails get `incomplete` status instead of `trialing`.
3. **Slug generation** — `handle_new_user()` now generates a URL-safe slug for new companies (lowercase name + random suffix) to satisfy the NOT NULL constraint on `companies.slug`.
4. **RLS update policy on companies** — Added `companies_update_owner_admin` policy so Owners/Admins can update their own company row.
5. **Stripe Customer Portal** — New `/api/stripe/portal` route + "Manage Subscription & Payment Method" button on billing page. Portal configured in Stripe Dashboard for plan switching, payment method updates, and cancellation.
6. **Webhook metadata fallback** — `customer.subscription.updated` and `customer.subscription.deleted` now fall back to looking up `company_id` by `stripe_subscription_id` if metadata is missing.
7. **Price IDs moved to env vars** — `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PROFESSIONAL`, `STRIPE_PRICE_BUSINESS` in `.env.local` and Vercel.
8. **`NEXT_PUBLIC_APP_URL` added** — Set to `https://frame-focus-eight.vercel.app` in both `.env.local` and Vercel.
9. **`is_deleted` column verified** on profiles table.
10. **Index added** on `invitations.token` for fast lookups.
11. **Lazy initialization** — Stripe client (`getStripe()`) and Supabase admin client (`getSupabaseAdmin()`) are now lazily initialized to prevent build-time crashes when env vars aren't available.
12. **Suspense boundary** — `/invite/accept` page split into `page.tsx` (Suspense wrapper) and `accept-invite.tsx` (client component with `useSearchParams`).

### Database changes (Migration 008 — run in Supabase):

- Added `is_deleted` column to profiles (if missing)
- Added index `idx_invitations_token` on invitations.token
- Added RLS policy `companies_update_owner_admin` on companies table
- Created `trial_emails` table
- Updated `handle_new_user()` with slug generation + trial abuse prevention

### Files created this session:

- `packages/supabase/migrations/008_audit_fixes.sql`
- `apps/web/app/api/stripe/portal/route.ts` — Stripe Customer Portal session
- `apps/web/app/dashboard/billing/manage-subscription-button.tsx` — Portal button component
- `apps/web/app/invite/accept/accept-invite.tsx` — Invite acceptance client component (extracted from page.tsx)

### Files modified this session:

- `apps/web/middleware.ts` — Added subscription enforcement (blocks expired/canceled, exempts billing pages)
- `apps/web/app/dashboard/layout.tsx` — Reverted to clean version (enforcement moved to middleware)
- `apps/web/app/api/stripe/webhook/route.ts` — Lazy Supabase init, metadata fallback on updated/deleted events, typed as `any` to fix build errors
- `apps/web/app/api/stripe/checkout/route.ts` — Lazy Stripe init, Price IDs from env vars
- `apps/web/app/api/stripe/portal/route.ts` — Lazy Stripe init
- `apps/web/lib/stripe.ts` — Changed from direct export to `getStripe()` lazy factory
- `apps/web/app/dashboard/billing/page.tsx` — Added ManageSubscriptionButton, shows only when Stripe subscription exists
- `apps/web/app/invite/accept/page.tsx` — Now a Suspense wrapper importing accept-invite.tsx

### System test results (all passing):

- ✅ Fresh Owner sign-up creates company + profile + trial subscription + trial_emails entry
- ✅ Dashboard accessible during trial
- ✅ Billing page shows Free Trial status with 30-day countdown
- ✅ Plan selection page displays three tiers correctly
- ✅ Stripe Checkout opens with correct amounts for all three tiers
- ✅ Stripe test card payment completes successfully
- ✅ Post-checkout redirects to success page
- ✅ Webhook updates subscription record in Supabase
- ✅ Billing page shows Manage Subscription button after subscribing
- ✅ Stripe Customer Portal opens and allows plan switching
- ✅ Team page works, invitations can be created
- ✅ Invite links work and render the acceptance page
- ✅ Seat enforcement banner displays on invite page

### Important technical notes:

- `.env.local` is gitignored and does not persist across Codespace rebuilds. If your Codespace is rebuilt, you must recreate it. All env vars are also stored in Vercel.
- The Stripe and Supabase admin clients use lazy initialization (`getStripe()` and `getSupabaseAdmin()`) to avoid build-time errors. All API routes must use these instead of direct imports.
- The `.env.local.example` template file had a space in the filename (`.env.local. example`). The actual env file must be named exactly `.env.local`.
- Stripe Customer Portal must be configured in Stripe Dashboard (Settings → Customer portal) to enable plan switching and cancellation.
- The `companies` table has a `slug` NOT NULL column that was added outside our migration chain. The trigger now auto-generates slugs.
- The `companies` table also has `subscription_tier` and `subscription_status` columns from earlier work, separate from our `subscriptions` table. These are redundant but not causing issues.

### Environment variables (complete list for .env.local and Vercel):

```
NEXT_PUBLIC_SUPABASE_URL=https://jwkcknyuyvcwcdeskrmz.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=(anon key)
SUPABASE_SERVICE_ROLE_KEY=(service role key)
STRIPE_SECRET_KEY=(sk_test_ key)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=(pk_test_ key)
STRIPE_WEBHOOK_SECRET=(whsec_ key)
STRIPE_PRICE_STARTER=(price_ id)
STRIPE_PRICE_PROFESSIONAL=(price_ id)
STRIPE_PRICE_BUSINESS=(price_ id)
NEXT_PUBLIC_APP_URL=https://frame-focus-eight.vercel.app
```

### Known accounts:

- **Supabase:** josh@worthprop.com, FrameFocus project at jwkcknyuyvcwcdeskrmz.supabase.co
- **GitHub:** IronFrame414, repo: FrameFocus
- **Vercel:** Connected via GitHub, project: FrameFocus, URL: https://frame-focus-eight.vercel.app
- **Stripe:** FrameFocus sandbox (test mode), webhook + customer portal configured
- **Test users in database:** Josh Bishop (jsbishop14@gmail.com) Owner of Bishop Contracting, plus test accounts created during testing

### Migrations run (all saved to packages/supabase/migrations/):

1. 001 — companies, profiles, platform_admins tables
2. 002 — handle_new_user() trigger (original)
3. 003 — admin role + invitations table
4. 004 — handle_new_user() updated for invite flow
5. 005 — RLS policies updated for admin role
6. 006 — handle_new_user() fixed to use user_id column
7. 007 — subscriptions table + handle_new_user() updated for auto trial creation
8. 008 — audit fixes (trial_emails, slug generation, RLS, indexes)

### What's next (first tasks for next session):

1. **Company settings page** — Edit company name, address, trade type, logo
2. **Module 2: Contacts & CRM** — Unified people database (leads, clients, subs, suppliers). Referenced by all later modules.
3. **Module 3: Document & File Management** — Supabase Storage, file tagging, project folders

### How to start the next session:

Paste this context.md and CLAUDE.md and say: "Starting a new FrameFocus session. Building the company settings page, then moving to Module 2: Contacts & CRM."
