# Context — FrameFocus Build Session (April 1, 2026)

## What happened this session

This was the second coding session. Module 1E (Invite System & Admin Role) was built end to end.

### Module 1E completed:

**Database changes (run in Supabase):**
- Migration 003: Added `admin` to profiles role CHECK constraint, created `invitations` table with token-based lookup, RLS policies, and `get_invitation_by_token()` SECURITY DEFINER function
- Migration 004: Updated `handle_new_user()` trigger with two paths — invited users join existing company, new owners create a company
- Migration 005: Updated RLS policies so admin role can create/cancel invitations and update company settings
- Migration 006: Fixed `handle_new_user()` trigger to use `user_id` column (not `id`) and include `email` when inserting profiles

**Shared packages:**
- `packages/shared/types/roles.ts` — CompanyRole, InvitableRole, TeamRole, InvitationStatus types
- `packages/shared/constants/roles.ts` — ROLE_HIERARCHY, ROLE_LABELS, ROLE_DESCRIPTIONS, INVITABLE_ROLES, canManageRole(), DASHBOARD_ROLES, TEAM_MANAGEMENT_ROLES
- Both barrel-exported from their respective index.ts files

**Web app files created/modified:**
- `apps/web/lib/services/team.ts` — Service functions: getTeamMembers, getPendingInvitations, cancelInvitation, createInvitation
- `apps/web/app/dashboard/team/page.tsx` — Team page (server component, fetches user role)
- `apps/web/app/dashboard/team/team-page-client.tsx` — Team member list + pending invitations table
- `apps/web/app/dashboard/team/invite/page.tsx` — Invite page (server component, owner/admin only)
- `apps/web/app/dashboard/team/invite/invite-form.tsx` — Invite form with email input, role radio picker, generates copyable invite link
- `apps/web/app/invite/accept/page.tsx` — Invite acceptance page (client component, unauthenticated) — shows company name, role, collects name + password, calls signUp with invitation_token in metadata
- `apps/web/app/dashboard/dashboard-shell.tsx` — Updated sidebar nav with Team link

### Architecture decisions made this session:

1. **Invite flow is token-based** — Owner creates invitation → token generated in DB → invite link shared manually → invitee clicks link → sets name/password → signUp with token in metadata → trigger creates profile under correct company/role → invitation marked accepted
2. **Email sending deferred** — Currently the Owner copies the invite link manually. Resend integration for automated invite emails will come later.
3. **Admin can invite** — Both Owner and Admin roles can create and cancel invitations (RLS + page access updated). Admin still cannot manage billing or promote to Admin.
4. **Profiles table uses user_id column** — The `user_id` column (not `id`) stores the auth user UUID. All profile queries use `.eq('user_id', user.id)`.

### Important technical notes:

- Supabase email confirmation is enabled. After invite signUp, the invitee must confirm their email before signing in.
- The `get_invitation_by_token()` function is SECURITY DEFINER so unauthenticated users can look up their invitation on the accept page.
- Invitations expire after 7 days (set by `DEFAULT (now() + INTERVAL '7 days')` on `expires_at`).

### Known accounts:

- **Supabase:** josh@worthprop.com, FrameFocus project at jwkcknyuyvcwcdeskrmz.supabase.co
- **GitHub:** IronFrame414, repo: FrameFocus
- **Vercel:** Connected via GitHub, project: FrameFocus, URL: https://frame-focus-eight.vercel.app
- **Test user in database:** Josh Bishop (jsbishop14@gmail.com), Owner of Bishop Contracting

### Migrations run (all saved to packages/supabase/migrations/):

1. 001 — companies, profiles, platform_admins tables
2. 002 — handle_new_user() trigger (original)
3. 003 — admin role + invitations table
4. 004 — handle_new_user() updated for invite flow
5. 005 — RLS policies updated for admin role
6. 006 — handle_new_user() fixed to use user_id column

### What's next (first tasks for next session):

1. **1F — Stripe billing integration**
   - Set up Stripe account
   - Create subscription products/prices for Starter ($79/mo), Professional ($149/mo), Business ($249/mo)
   - Integrate Stripe Checkout for initial subscription
   - Billing settings page for Owner
   - Seat-based billing for additional users

2. **Company settings page** — Edit company name, address, trade type, logo

3. **End-to-end invite test** — Create an invitation, accept it in a different browser, confirm the new user appears on the team page with the correct role

### How to start the next session:

Paste this context.md and CLAUDE.md and say: "Starting a new FrameFocus session. Picking up with Module 1F — Stripe billing integration."
