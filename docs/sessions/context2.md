# Context — FrameFocus Build Session (March 30, 2026)

## What happened this session

This was the first coding session. The full development environment was set up and Module 1 (Settings, Admin & Billing) was started. The sign-up, sign-in, and dashboard flows are working end to end.

### Infrastructure completed:

1. **GitHub repo created** — github.com/IronFrame414/FrameFocus (private, under IronFrame414 account)
2. **Monorepo scaffolded** — Turborepo with apps/web (Next.js 14), apps/mobile (Expo placeholder), packages/shared (types, validation, constants, utils), packages/supabase (migrations, functions, seed), packages/ui (placeholder)
3. **GitHub Codespaces configured** — .devcontainer/devcontainer.json with Node 20, VS Code extensions, port forwarding for 3000 and 8081. Codespace name: "zany orbit"
4. **Supabase project created** — Project URL: `https://jwkcknyuyvcwcdeskrmz.supabase.co`. Publishable key starts with `sb_publishable_CohyWuCQrtn20grA7gfTjw_`. Keys stored in apps/web/.env.local (gitignored). Email provider enabled, email confirmation enabled.
5. **Vercel connected** — Auto-deploys from main branch. Root directory set to `apps/web`. Framework preset: Next.js. Live at `https://frame-focus-eight.vercel.app`. Environment variables set (SUPABASE_URL and ANON_KEY).
6. **Supabase URL Configuration** — Site URL set to `https://frame-focus-eight.vercel.app`. Redirect URLs added for both Vercel (`/auth/callback`) and localhost (`http://localhost:3000/auth/callback`).

### Module 1 progress (Settings, Admin & Billing):

**1A — Database foundation ✅**
- Migration 001 run: `companies`, `profiles`, `platform_admins` tables created
- Helper functions: `get_my_company_id()`, `get_my_role()`, `is_platform_admin()`, `update_updated_at()` trigger
- RLS policies on all three tables
- Migration 002 run: `handle_new_user()` trigger on `auth.users` — auto-creates company + owner profile on sign-up (fixed with SECURITY DEFINER to bypass RLS)
- Both migrations saved to `packages/supabase/migrations/`

**1B — Supabase client setup ✅**
- `apps/web/lib/supabase-browser.ts` — client-side Supabase client
- `apps/web/lib/supabase-server.ts` — server-side Supabase client (typed for strict mode)
- `apps/web/middleware.ts` — auth session refresh, redirects unauthenticated users from /dashboard to /sign-in, redirects authenticated users from /sign-in and /sign-up to /dashboard

**1C — Auth pages ✅**
- `apps/web/app/sign-up/page.tsx` — Owner-only registration (first name, last name, company name, email, password)
- `apps/web/app/sign-in/page.tsx` — Email + password sign-in
- `apps/web/app/auth/callback/route.ts` — Handles email confirmation redirect, exchanges code for session
- `apps/web/app/dashboard/layout.tsx` — Server component that fetches user profile and company
- `apps/web/app/dashboard/dashboard-shell.tsx` — Client component sidebar with company name, user name, role label, sign-out button, nav links
- `apps/web/app/dashboard/page.tsx` — Welcome page with module status cards
- `apps/web/app/page.tsx` — Landing page with "Sign in" and "Start free trial" buttons

**1D — Sign-in flow** — Not yet a separate step; sign-in works via the sign-in page created in 1C.

### Architecture decisions made this session:

1. **Admin role added** — New role between Owner and Project Manager. Owner can promote someone to Admin. Admin has full access to everything except billing/subscription management and promoting others to Admin. Not yet implemented in code — will be added in the next session during the invite flow (1E). Changes needed: add `'admin'` to profiles.role CHECK constraint, update shared types/constants/role hierarchy, update RLS policies to check `owner OR admin` where appropriate.

2. **Owner-only sign-up confirmed** — The sign-up page is exclusively for new company Owners. All other roles (Admin, PM, Foreman, Crew Member, Client) are created only through the Owner's invite system.

3. **Invite flow design confirmed** — Owner invites by email + role selection. Invited user gets an email link, lands on a simple "set password + confirm name" page. No company creation, no role selection for invitees.

4. **Additional user billing confirmed** — Stripe will track seat count per company. Over-limit invites trigger per-seat charges on the Owner's subscription.

### Commits pushed:

1. `Scaffold monorepo structure` — initial monorepo with all packages and apps
2. `Add auth pages, dashboard, and Supabase client` — all Module 1B and 1C files
3. `Save migration files to repo` — SQL migrations in packages/supabase/migrations/

### Known accounts:

- **Supabase:** josh@worthprop.com (existing account), FrameFocus project at jwkcknyuyvcwcdeskrmz.supabase.co
- **GitHub:** IronFrame414, repo: FrameFocus
- **Vercel:** Connected via GitHub, project: FrameFocus, URL: https://frame-focus-eight.vercel.app
- **Test user in database:** Whatever credentials Josh used to test sign-up (at least one owner account exists)

### What's next (first tasks for next session):

1. **1E — Invite system + Admin role**
   - Add `admin` to the role CHECK constraint in the database
   - Update shared types, constants, and role hierarchy
   - Update RLS policies for owner OR admin where appropriate
   - Build team management page (dashboard/settings or dashboard/team)
   - Build invite flow: Owner selects email + role → sends invite email → invited user sets password
   - Build the invite acceptance page (simple: set password, confirm name)

2. **1F — Stripe billing integration**
   - Set up Stripe account
   - Create subscription products/prices for Starter, Professional, Business tiers
   - Integrate Stripe Checkout for initial subscription
   - Billing settings page for Owner
   - Seat-based billing for additional users

3. **Company settings page** — Edit company name, address, trade type, logo

4. **Claude Code setup** — Now that Codespaces is running and coding has begun, this is a good time to install Claude Code in the Codespace terminal for hands-on coding tasks

### How to start the next session:

Paste this context.md and CLAUDE.md and say: "Starting a new FrameFocus session. Picking up with Module 1E — invite system and admin role."
