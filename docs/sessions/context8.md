# Context — FrameFocus Debug Session (April 8, 2026)

## What happened this session

This was Session 7 — a focused debugging session that resolved a critical bug in the admin invite flow. No new features were built. The session started with an attempt to begin Module 3, but a "Database error saving new user" appeared when testing an admin invitation and took priority.

### The bug

When accepting an admin invite, the new user was being created as an **Owner of a brand new company ("My Company")** instead of joining the invited company (Bishop Contracting) as an Admin. The invitation was receiving the correct token in `raw_user_meta_data`, but the trigger kept falling through to the owner path.

### Root cause (finally identified)

`handle_new_user()` on `auth.users` was looking up the invitation with a direct `SELECT` against the `invitations` table. The RLS SELECT policy on `invitations` requires `get_my_company_id()` and `get_my_role()` to match — but during signup, the new user has no profile yet, so both helpers return NULL and RLS filters out every row. The lookup returned zero matches and the trigger fell through to the owner-creation branch.

### What didn't work (important for future reference)

- **Migration 013** — fixed a separate bug: the trigger was updating a non-existent `invitations.accepted_at` column. Real bug, but not the cause of the owner-path fallthrough.
- **Migration 014** — added `SET row_security TO 'off'` at the function level. This setting is **silently ignored** in Postgres unless the executing role is a superuser or table owner. Inside a `SECURITY DEFINER` trigger on `auth.users`, it did not bypass RLS. Left in place for the `is_deleted = false` filter it added, but it did not solve the problem.

### What worked — Migration 015

Created a dedicated `SECURITY DEFINER` SQL function `get_invitation_for_signup(invite_token uuid)` that returns `(id, company_id, role)` and called it from `handle_new_user()` instead of querying the invitations table directly. SQL functions with `SECURITY DEFINER` reliably bypass RLS when called from a trigger context — same pattern the existing `get_invitation_by_token()` uses for the accept-invite page.

**This fix is proven working end-to-end.** A test admin invite for `josh+test40@worthprop.com` was accepted successfully and the profile was created with `role = 'admin'` and `company_id = 4a0f9073-bca2-485f-8fbb-34e71102ab42` (Bishop Contracting).

### Key lesson learned

**RLS bypass in triggers:** `SET row_security TO 'off'` at the function level does NOT reliably bypass RLS inside `SECURITY DEFINER` trigger functions on `auth.users`. The working pattern is to put the RLS-protected query inside a separate `SECURITY DEFINER` SQL function (not plpgsql) and call that from the trigger. See `get_invitation_for_signup()` and Migration 015. This should be added to CLAUDE.md.

### Other things that came up during debugging

- **Supabase email rate limits** — the free tier has a global ~2-4 emails/hour ceiling across the whole project. Hit during repeat testing. Worked around by temporarily disabling "Confirm email" in Authentication → Providers → Email. **This needs to be re-enabled before any real users sign up.**
- **Vercel stale deployments** — ruled out as a factor, but worth knowing the redeploy path: Vercel Dashboard → Deployments → three-dot menu on latest → Redeploy (uncheck "Use existing Build Cache").
- **signUp rate limit vs. email rate limit** — these are separate. Disabling email confirmation bypasses the email limit but not the signup limit.

### Migrations run this session

13. **013_fix_handle_new_user_invite_update.sql** — removed non-existent `accepted_at` column from invitations UPDATE
14. **014_handle_new_user_bypass_rls.sql** — added `SET row_security TO 'off'` (did not actually fix the bug, kept for the `is_deleted = false` filter it added)
15. **015_handle_new_user_use_helper.sql** — created `get_invitation_for_signup()` helper and rewrote `handle_new_user()` to use it. **This is the fix.**

All three migration files need to be committed to `packages/supabase/migrations/` and pushed to GitHub. As of the end of this session, they were run directly in Supabase SQL Editor but not yet saved to the repo.

### Test data state at end of session

- Working admin account: `josh+test40@worthprop.com` (Admin of Bishop Contracting) — leave in place for future testing
- Multiple orphaned test accounts and "My Company" entries still lingering in the database from earlier failed signups (josh+test11, test20, test30, etc.) — not cleaned up, optional cleanup next session

### Housekeeping still outstanding

1. **Re-enable email confirmation** in Supabase Dashboard → Authentication → Providers → Email → toggle "Confirm email" back ON. Currently OFF from the rate-limit workaround.
2. **Commit Migrations 013, 014, 015** to `packages/supabase/migrations/` and push.
3. **Update CLAUDE.md** with the RLS-in-triggers lesson learned (new entry in Codespaces Gotchas or a new "Database Patterns" section).
4. **Optional cleanup** of orphaned test accounts (josh+test11, test20, test30, test@test.com, test@gmail.com and their orphaned "My Company" entries).

---

## What's next (next session plan)

The plan agreed to at the end of this session, in order:

### 1. Session 5 audit fixes (start here)

**a. Fix `import type` in 4 client component files.** These files import TypeScript interfaces from server service files (which use `next/headers`). Works today due to TypeScript type erasure but is fragile.

Files to edit:

- `apps/web/app/dashboard/contacts/contacts-list.tsx`
- `apps/web/app/dashboard/contacts/contact-form.tsx`
- `apps/web/app/dashboard/subcontractors/subcontractors-list.tsx`
- `apps/web/app/dashboard/subcontractors/subcontractor-form.tsx`

Change `import { Contact }` to `import type { Contact }` (and similarly for `Subcontractor`). Split into two imports if the file imports runtime values alongside types.

**b. Consolidate duplicated constants.** Move to `packages/shared/constants/form-options.ts`:

- `US_STATES` array (currently copy-pasted in 3 form files)
- `TRADE_TYPES` array (currently duplicated in 2 form files)
- `LEAD_SOURCES` array

**c. Consolidate `CompanyData` interface.** Currently duplicated in `company.ts` and `company-client.ts`. Move to `packages/shared/types/`.

### 2. Answer 2 key Session 6 open questions

These affect Module 3 and Module 6 data models and need decisions before those modules are built:

**a. T&M rate structure (affects Module 6)**

- Per-employee: each crew member has their own billable rate. Flexible but admin-heavy.
- Per-role: rate is set per role (Foreman rate, Crew Member rate). Simpler but less flexible.

**b. Photo markup storage format (affects Module 3)**

- JSON (coordinates of shapes): editable after save, more complex to render
- Rendered image: simpler, loses editability after save
- Current lean: JSON

The other ten open questions from context7.md (AI cost at scale, offline sync conflicts, photo storage at scale, mobile performance, QuickBooks sync edge cases, crew adoption, inventory unit conversions, client portal messaging, selection deadline enforcement, decision log edit history) can wait — they affect later modules.

### 3. Start Module 3: Document & File Management

Before beginning:

- **Add `OPENAI_API_KEY`** to `.env.local` and Vercel (for photo auto-tagging)

Build order per context7.md:

1. Migration for `files` table + RLS
2. Supabase Storage bucket `project-files`
3. Server service (`files.ts`) + client service (`files-client.ts`)
4. Upload component (web drag-and-drop)
5. File list page with filtering
6. Category/project folder navigation
7. Tag editing
8. Photo markup component (Fabric.js web, research needed for mobile)
9. OpenAI vision integration for auto-tagging (Edge Function or API route)
10. Receipt attachment linking (placeholder for Module 8)

Refer to `FrameFocus_Platform_Roadmap.docx` for full Module 3 detail.

---

## Known accounts (unchanged from Session 6)

- **Supabase:** josh@worthprop.com, FrameFocus project at jwkcknyuyvcwcdeskrmz.supabase.co
- **GitHub:** IronFrame414, repo: FrameFocus
- **Vercel:** Connected via GitHub, project: FrameFocus, URL: https://frame-focus-eight.vercel.app
- **Stripe:** FrameFocus sandbox (test mode)
- **OpenAI:** To be set up before Module 3 build
- **Test users:**
  - Josh Bishop (jsbishop14@gmail.com) — Owner of Bishop Contracting
  - josh+test40@worthprop.com — Admin of Bishop Contracting (created during this session's debug testing, functional)

---

## Migrations run to date (all should be in packages/supabase/migrations/)

1. 001 — companies, profiles, platform_admins tables
2. 002 — handle_new_user() trigger (original)
3. 003 — admin role + invitations table
4. 004 — handle_new_user() updated for invite flow
5. 005 — RLS policies updated for admin role
6. 006 — handle_new_user() fixed to use user_id column
7. 007 — subscriptions table + handle_new_user() updated for auto trial creation
8. 008 — audit fixes (trial_emails, slug generation, RLS, indexes)
9. 009 — company settings columns + logo storage bucket
10. 010 — contacts and subcontractors tables with RLS
11. 011 — subcontractor extras (ein, default_hourly_rate, preferred)
12. 012 — vendor default_markup_percent
13. **013 — fix handle_new_user invite UPDATE (remove non-existent accepted_at column)** ⚠️ not yet committed to repo
14. **014 — add SET row_security TO 'off' + is_deleted filter** ⚠️ not yet committed to repo (note: the row_security setting did NOT fix the bug but the is_deleted filter is still a good addition)
15. **015 — use get_invitation_for_signup() helper to bypass RLS in trigger** ⚠️ not yet committed to repo (this is the actual fix)

---

## How to start the next session

Paste this `context8.md` plus the updated `CLAUDE.md` and say:

> "Starting a new FrameFocus session. I have context8.md from the Session 7 debug work. The admin invite bug is fixed via Migration 015. Ready to start the audit fixes — beginning with `import type` changes to the 4 client component files."

Reference `FrameFocus_Platform_Roadmap.docx` when Module 3 planning comes up. The Quick Reference doc is good for refreshing the overall shape of the platform.
