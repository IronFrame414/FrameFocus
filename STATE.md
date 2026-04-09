# STATE.md — FrameFocus Current State

> **Last updated:** April 9, 2026 (end of Session 10 — verification session, no code written, 5 new tech debt items logged)
> **Purpose:** Snapshot of the current state of the codebase, infrastructure, and database. Lives in the repo root. Updated at the end of each session.
>
> **Note on Session 10:** Verification session. The Session 9 Option C refactor was verified safe in a production-equivalent environment. All 5 items in the Verification First checklist passed. Smoke testing surfaced 5 small UX/feature gaps in Modules 1 and 2 that were logged as new tech debt rather than fixed mid-session. The two open data-model decisions (T&M rate structure, photo markup format) were deferred to Session 11. See `docs/sessions/context11.md` for the full session narrative.

---

## Build Status

| Module                        | Status         | Notes                                                                                                                                                                                          |
| ----------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Settings, Admin & Billing  | ✅ COMPLETE    | All sub-modules + company settings page tested and live. Admin invite flow fixed Session 7 (Migration 015).                                                                                    |
| 2. Contacts & CRM             | ✅ COMPLETE    | Two-table design (contacts + subcontractors), full CRUD, filters, ratings, markup                                                                                                              |
| 3. Document & File Management | ⚪ NOT STARTED | Scheduled for Session 9 stretch goal or Session 10. Scope expanded Session 6: photo markup (desktop+mobile), AI auto-tagging via GPT-4o vision, receipt attachments linking to Module 8        |
| 4. Sales & Estimating         | ⚪ NOT STARTED |                                                                                                                                                                                                |
| 5. Project Management         | ⚪ NOT STARTED |                                                                                                                                                                                                |
| 6. Team & Field Operations    | ⚪ NOT STARTED | Scope significantly expanded Session 6. Time categorization, break tracking, OT, mileage, daily logs with safety, separate safety incident workflow, daily huddles, material delivery tracking |
| 7. Job Finances               | ⚪ NOT STARTED |                                                                                                                                                                                                |
| 8. Inventory & Tools          | ⚪ NOT STARTED | Added Session 6. Inventory catalog + tool tracking with required location, check-in/out log, bulk assignment                                                                                   |
| 9. Customer Experience Portal | ⚪ NOT STARTED | Scope expanded Session 6: material selections, decision log, photo gallery with client favorites, pre-construction checklist                                                                   |
| 10. Reporting & Analytics     | ⚪ NOT STARTED |                                                                                                                                                                                                |
| 11. AI Marketing & Social     | ⚪ NOT STARTED |                                                                                                                                                                                                |

### Module 1 sub-status

| Sub-module                           | Status                                                                |
| ------------------------------------ | --------------------------------------------------------------------- |
| 1A — Database foundation             | ✅ COMPLETE                                                           |
| 1B — Supabase client + middleware    | ✅ COMPLETE                                                           |
| 1C — Auth pages + dashboard shell    | ✅ COMPLETE                                                           |
| 1D — Sign-in flow + protected routes | ✅ COMPLETE                                                           |
| 1E — Invite system + Admin role      | ✅ COMPLETE (admin invite trigger bug fixed Session 7, Migration 015) |
| 1F — Stripe billing integration      | ✅ COMPLETE (tested end-to-end in production)                         |
| Company settings page                | ✅ COMPLETE (with logo upload)                                        |

### Module 2 sub-status

| Sub-module                                                   | Status      |
| ------------------------------------------------------------ | ----------- |
| 2A — contacts & subcontractors tables + RLS                  | ✅ COMPLETE |
| 2B — Contacts service layer (server + client)                | ✅ COMPLETE |
| 2C — Contacts CRUD pages (list, new, edit)                   | ✅ COMPLETE |
| 2D — Subcontractors service layer (server + client)          | ✅ COMPLETE |
| 2E — Subcontractors CRUD pages (list, new, edit)             | ✅ COMPLETE |
| 2F — Sub/vendor extras (EIN, hourly rate, preferred, markup) | ✅ COMPLETE |
| 2G — Sidebar navigation updates                              | ✅ COMPLETE |

---

## Infrastructure

| Component          | Status           | Details                                                                                                |
| ------------------ | ---------------- | ------------------------------------------------------------------------------------------------------ |
| GitHub repo        | ✅ Live          | github.com/IronFrame414/FrameFocus (private)                                                           |
| GitHub Codespaces  | ✅ Configured    | Current Codespace: "fantastic trout"; prior: "zany orbit"                                              |
| Turborepo monorepo | ✅ Scaffolded    | apps/web, apps/mobile, packages/shared, packages/supabase, packages/ui                                 |
| Supabase project   | ✅ Live          | jwkcknyuyvcwcdeskrmz.supabase.co                                                                       |
| Supabase Storage   | ✅ Live          | `company-logos` public bucket configured                                                               |
| Vercel deployment  | ✅ Live          | https://frame-focus-eight.vercel.app (auto-deploy from main)                                           |
| GitHub Actions CI  | ✅ Configured    | Lint + type-check on push to main/dev                                                                  |
| Stripe             | ✅ Live          | Test mode. 3 products + webhook + Customer Portal configured                                           |
| Supabase CLI       | ✅ Installed     | Installed Session 9. Linked to jwkcknyuyvcwcdeskrmz. Run `npx supabase login` after Codespace rebuild. |
| QuickBooks Online  | ⚪ Not connected | Strategy decided. Implementation deferred to Modules 6 & 7.                                            |
| OpenAI API         | ✅ Configured    | `OPENAI_API_KEY` set in `.env.local` and Vercel (Session 9). Ready for Module 3.                       |
| Claude Code        | ✅ Installed     | Installed Session 9. CLI in Codespace terminal.                                                        |

---

## Database State

### Tables (in production Supabase)

| Table             | Rows      | RLS                | Notes                                                                                                                                                                                                                                                                                                                   |
| ----------------- | --------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `companies`       | Multiple  | ✅ Enabled         | Has `slug` (NOT NULL, auto-generated by trigger), `stripe_customer_id`, plus address, phone, website, trade_type, license_number, logo_url (Migration 009). Legacy `subscription_tier`/`subscription_status` columns from earlier work. Several orphaned "My Company" rows from Session 7 debugging — optional cleanup. |
| `profiles`        | Multiple  | ✅ Enabled         | Linked to `auth.users` via `user_id` column. `is_deleted` column added in Migration 008                                                                                                                                                                                                                                 |
| `platform_admins` | 0         | ✅ Enabled         | No admins seeded yet                                                                                                                                                                                                                                                                                                    |
| `invitations`     | Test rows | ✅ Enabled         | Token-based, 7-day expiry, status: pending/accepted/expired/cancelled. Token column indexed                                                                                                                                                                                                                             |
| `subscriptions`   | Multiple  | ✅ Enabled         | One per company. Tracks plan_tier, status, seat_limit, trial dates, period dates. Only service_role can write                                                                                                                                                                                                           |
| `trial_emails`    | Multiple  | ❌ No RLS          | Tracks emails that have used a free trial. Only accessed by SECURITY DEFINER trigger                                                                                                                                                                                                                                    |
| `contacts`        | Test rows | ✅ Enabled         | Leads & clients. contact_type CHECK (lead/client), status, name, company, email, phone, mobile, address, source, notes, tags[]. Soft delete                                                                                                                                                                             |
| `subcontractors`  | Test rows | ✅ Enabled         | Subs & vendors. Full field set incl. EIN, default_hourly_rate, default_markup_percent, preferred, rating, insurance_expiry. Soft delete                                                                                                                                                                                 |
| `auth.users`      | Multiple  | (Supabase managed) | Test sign-ups + Session 7 debugging artifacts                                                                                                                                                                                                                                                                           |

### Storage Buckets

| Bucket          | Public         | Notes                                                                                     |
| --------------- | -------------- | ----------------------------------------------------------------------------------------- |
| `company-logos` | ✅ Public read | Folder: `{company_id}/logo.{ext}`. RLS: members can upload/update; owner/admin can delete |

### Helper functions

- `get_my_company_id()` — returns current user's company_id from profiles
- `get_my_role()` — returns current user's role from profiles
- `is_platform_admin()` — boolean check against platform_admins table
- `update_updated_at()` — trigger function for auto-updating timestamps
- `handle_new_user()` — fires on `auth.users` insert. Three behaviors: (1) invited user joins existing company via `get_invitation_for_signup()` helper; (2) new owner with new email gets 30-day trial; (3) new owner with previously-used email gets `incomplete` subscription. Auto-generates company slug. SECURITY DEFINER. Rewritten Session 7 (Migration 015) to use helper function.
- `get_invitation_by_token(invite_token UUID)` — SECURITY DEFINER function for unauthenticated invite lookups from the accept-invite page. Returns `(id, company_name, email, role, expires_at)`.
- `get_invitation_for_signup(invite_token UUID)` — SECURITY DEFINER SQL function called from `handle_new_user()` to look up invitations during signup, bypassing RLS. Returns `(id, company_id, role)`. Required because `SET row_security TO 'off'` at the function level does not actually bypass RLS in trigger contexts on `auth.users`. See Codebase Patterns / Lessons Learned.

### Triggers

- `companies_updated_at`, `profiles_updated_at`, `set_invitations_updated_at`, `update_subscriptions_updated_at`, `contacts_updated_at`, `subcontractors_updated_at` — updated_at timestamp triggers
- `on_auth_user_created` — fires `handle_new_user()` after insert on auth.users

### RLS policies (summary)

- **invitations:** `_select_owner_admin`, `_insert_owner_admin`, `_update_owner_admin` — Note: SELECT policy was root cause of Session 7 admin invite bug. Trigger now bypasses via `get_invitation_for_signup()` helper.
- **companies:** `_update_owner_admin` (added Migration 008)
- **subscriptions:** `_select_owner_admin`. No insert/update policy — only service_role (webhook) writes
- **profiles:** `_select_authenticated`
- **contacts:** `_select_authenticated`, `_insert_authorized`, `_update_authorized` (owner/admin/PM can write)
- **subcontractors:** same pattern as contacts
- **storage.objects (company-logos):** `company_logos_upload`, `company_logos_update`, `company_logos_read` (public), `company_logos_delete` (owner/admin)

### Indexes

- Subscriptions: `idx_subscriptions_company_id`, `idx_subscriptions_stripe_subscription_id`
- Invitations: `idx_invitations_token` (added Migration 008)
- Contacts: `idx_contacts_company_id`, `idx_contacts_contact_type`, `idx_contacts_status`
- Subcontractors: `idx_subcontractors_company_id`, `idx_subcontractors_sub_type`, `idx_subcontractors_status`, `idx_subcontractors_trade`

### Migrations applied

| #   | File                                         | Status                                                                                     |
| --- | -------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 001 | `001_foundation_tables.sql`                  | ✅ Run in production, in repo                                                              |
| 002 | `002_signup_trigger.sql`                     | ✅ Run in production, in repo                                                              |
| 003 | `003_admin_role_and_invitations.sql`         | ✅ Run in production, in repo                                                              |
| 004 | `004_update_handle_new_user_for_invites.sql` | ✅ Run in production, in repo                                                              |
| 005 | `005_update_rls_for_admin_role.sql`          | ✅ Run in production, in repo                                                              |
| 006 | `006_fix_handle_new_user_columns.sql`        | ✅ Run in production, in repo                                                              |
| 007 | `007_subscriptions.sql`                      | ✅ Run in production, in repo                                                              |
| 008 | `008_audit_fixes.sql`                        | ✅ Run in production, in repo                                                              |
| 009 | `009_company_settings.sql`                   | ✅ Run in production, in repo                                                              |
| 010 | `010_contacts_subcontractors.sql`            | ✅ Run in production, in repo                                                              |
| 011 | `011_subcontractor_extras.sql`               | ✅ Run in production, in repo                                                              |
| 012 | `012_vendor_markup.sql`                      | ✅ Run in production, in repo                                                              |
| 013 | `013_fix_handle_new_user_invite_update.sql`  | ✅ Run in production, in repo (committed as part of Session 7/8 bundle — commit `b43c9f6`) |
| 014 | `014_handle_new_User_Bypass_rls.sql`         | ✅ Run in production, in repo. Filename has inconsistent capitalization — tech debt #26    |
| 015 | `015_handle_new_user_use_helper.sql`         | ✅ Run in production, in repo. **This is the actual fix for the admin invite bug.**        |

---

## Codebase State

### apps/web (Next.js)

```
apps/web/
├── app/
│   ├── api/stripe/
│   │   ├── checkout/route.ts              ✅
│   │   ├── webhook/route.ts               ✅ Lazy init, metadata fallback
│   │   └── portal/route.ts                ✅
│   ├── auth/callback/route.ts             ✅
│   ├── dashboard/
│   │   ├── layout.tsx                     ✅
│   │   ├── dashboard-shell.tsx            ✅ Sidebar nav
│   │   ├── page.tsx                       ✅
│   │   ├── billing/                       ✅ All 5 files
│   │   ├── settings/
│   │   │   ├── page.tsx                   ✅
│   │   │   └── settings-form.tsx          ✅ Uses shared TRADE_TYPES, US_STATES (Session 8)
│   │   ├── contacts/
│   │   │   ├── page.tsx                   ✅
│   │   │   ├── contacts-list.tsx          ✅ Uses `import type`
│   │   │   ├── contact-form.tsx           ✅ Uses shared LEAD_SOURCES, US_STATES (Session 8)
│   │   │   ├── new/page.tsx               ✅
│   │   │   └── [id]/edit/page.tsx         ✅
│   │   ├── subcontractors/
│   │   │   ├── page.tsx                   ✅
│   │   │   ├── subcontractors-list.tsx    ✅ Uses `import type`
│   │   │   ├── subcontractor-form.tsx     ✅ Uses shared TRADE_TYPES, US_STATES (Session 8)
│   │   │   ├── new/page.tsx               ✅
│   │   │   └── [id]/edit/page.tsx         ✅
│   │   └── team/
│   │       ├── page.tsx                   ✅
│   │       ├── team-page-client.tsx       ⚠️ Has local ROLE_LABELS — tech debt #18. Null guards added Session 9.
│   │       └── invite/
│   │           ├── page.tsx               ✅
│   │           └── invite-form.tsx        ⚠️ Has local INVITABLE_ROLES — tech debt #22
│   ├── invite/accept/
│   │   ├── page.tsx                       ✅ Suspense wrapper
│   │   └── accept-invite.tsx              ✅
│   ├── sign-in/page.tsx                   ✅
│   ├── sign-up/page.tsx                   ✅
│   ├── globals.css                        ✅
│   ├── layout.tsx                         ✅
│   └── page.tsx                           ✅ Landing page
├── components/                             (empty)
├── lib/
│   ├── services/
│   │   ├── team.ts                        ✅
│   │   ├── billing.ts                     ✅
│   │   ├── seats.ts                       ✅
│   │   ├── company.ts                     ✅ Uses generated types (Session 9)
│   │   ├── company-client.ts              ✅ Re-exports CompanyData from company.ts (Session 9)
│   │   ├── contacts.ts                    ✅ Uses generated types (Session 9)
│   │   ├── contacts-client.ts             ✅
│   │   ├── subcontractors.ts              ✅ Uses generated types (Session 9)
│   │   └── subcontractors-client.ts       ✅
│   ├── stripe.ts                          ✅ Lazy getStripe() factory
│   ├── supabase-browser.ts                ✅
│   ├── supabase-server.ts                 ✅
│   └── utils.ts                           ✅
├── middleware.ts                           ✅
├── next.config.js                          ✅
└── package.json                            ✅
```

### packages/shared

```
packages/shared/
├── constants/
│   ├── index.ts                            ⚠️ Inline role/subscription/module definitions AND re-exports ./roles — tech debt #24 (High priority, latent bug)
│   ├── roles.ts                            ✅ Full role definitions with admin
│   └── form-options.ts                     ✅ TRADE_TYPES, US_STATES, LEAD_SOURCES (Session 8 consolidation)
├── types/
│   ├── index.ts                            ⚠️ Company interface missing website/license_number — tech debt #22. Partially mitigated by generated types in service files; hand-written types/index.ts still drifts.
│   └── roles.ts                            ✅
├── validation/                             (Zod schemas — in use)
├── utils/                                  (utilities)
├── index.ts                                ✅ Barrel export
└── package.json                            ✅ Name: @framefocus/shared
```

### packages/supabase

```
packages/supabase/
├── migrations/                             ✅ All 15 migrations in sync with production
├── functions/                              (empty — no Edge Functions yet)
├── seed/                                   (empty)
└── types/index.ts                          ✅ Placeholder (real generated types at packages/shared/types/database.ts)
```

### apps/mobile (Expo)

```
apps/mobile/                                Placeholder. Phase 2 work.
```

### docs/ (NEW — Session 8)

```
docs/
├── roadmap/
│   ├── FrameFocus_Development_Roadmap.docx
│   ├── FrameFocus_Platform_Roadmap.docx
│   ├── FrameFocus_Platform_Roadmap.xlsx
│   └── FrameFocus_Quick_Reference.docx
└── sessions/
    └── context1.md through context9.md    ✅ All session context files in repo
```

---

## Environment Variables

### apps/web/.env.local (Codespace, gitignored, does NOT persist across rebuilds)

```
NEXT_PUBLIC_SUPABASE_URL=https://jwkcknyuyvcwcdeskrmz.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=(sb_publishable_ key)
SUPABASE_SERVICE_ROLE_KEY=(eyJ... service role key)
STRIPE_SECRET_KEY=(sk_test_ key)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=(pk_test_ key)
STRIPE_WEBHOOK_SECRET=(whsec_ key)
STRIPE_PRICE_STARTER=price_1THpfMCgYe8l4i02H6iQ0Dfs
STRIPE_PRICE_PROFESSIONAL=price_1THpg4CgYe8l4i02allsU1Js
STRIPE_PRICE_BUSINESS=price_1THpgOCgYe8l4i023gQwTtYi
NEXT_PUBLIC_APP_URL=https://frame-focus-eight.vercel.app
OPENAI_API_KEY=(sk-... key — set Session 9, ready for Module 3)
```

### Vercel environment variables

Same complete set as `.env.local`. All variables must be set in both places.

---

## Supabase Configuration

| Setting                     | Value                                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------------- |
| Email provider              | ✅ Enabled                                                                                  |
| Email confirmation          | ✅ Re-enabled (Session 9)                                                                   |
| Site URL                    | `https://frame-focus-eight.vercel.app`                                                      |
| Redirect URLs               | `https://frame-focus-eight.vercel.app/auth/callback`, `http://localhost:3000/auth/callback` |
| Automatic RLS on new tables | ✅ Enabled                                                                                  |
| Data API                    | ✅ Enabled                                                                                  |
| Storage buckets             | `company-logos` (public)                                                                    |

---

## Stripe Configuration

| Setting          | Value                                                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Mode             | Test mode                                                                                                                |
| Account name     | FrameFocus sandbox                                                                                                       |
| Products         | Starter ($79/mo), Professional ($149/mo), Business ($249/mo)                                                             |
| Webhook endpoint | `https://frame-focus-eight.vercel.app/api/stripe/webhook`                                                                |
| Webhook events   | `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed` |
| Customer Portal  | Configured: plan switching, payment method updates, cancellation enabled                                                 |
| Stripe Connect   | Not enabled (deferred to Module 7/8)                                                                                     |

---

## QuickBooks Integration (Planned, not built)

**Status:** Strategy decided Session 5. Implementation deferred to Modules 6 & 7.

**Approach:** OAuth 2.0 via QuickBooks Online API. FrameFocus runs operations, QB runs the books. One-way sync at key transaction points.

**Sync points planned:**

- Module 2 → QB Customers (clients) and QB Vendors (subs/vendors with EIN)
- Module 6 → QB Time/Payroll (approved timesheets)
- Module 7 → QB Invoices, QB Bills, QB Bill Payments, QB contract adjustments (change orders)

**Key rule:** QB handles 1099 filings using synced vendor records with EINs and payment totals. FrameFocus never replaces accounting functionality.

---

## Session Workflow (established Session 8)

**At session start:**

1. `git pull` to sync the Codespace
2. Run ground-truth snapshot (`scripts/session-start.sh`): `bash scripts/session-start.sh`
3. Read `STATE.md` (this file) and the latest `docs/sessions/contextN.md`
4. State a 3–5 item definition-of-done for the session

**During the session:**

- Commit often, even for WIP (prefix with `WIP:`)
- Use `// TODO(session-N):` comments for anything deferred
- Log new tech debt to STATE.md immediately — don't chase rabbit holes
- Verify file state with git before planning edits

**At session end:**

1. Update `STATE.md` to reflect new state and any new tech debt
2. Create `docs/sessions/contextN+1.md` with decisions, outstanding items, next session plan
3. Commit and push documentation alongside code
4. Verify next session can be resumed by reading only `STATE.md` + latest context file

**Chat vs. Claude Code:**

- **Claude Chat:** Strategy, architecture, planning, document generation, product research, concept explanations
- **Claude Code:** Multi-file edits, investigation (grep, file reads), refactors, running migrations, debugging builds — anything touching code
- **Hybrid:** Plan in Chat → execute in Claude Code → review in Chat → close session in Chat

---

## Codebase Patterns / Lessons Learned

### RLS bypass in triggers (Session 7)

`SET row_security TO 'off'` at the function level does **NOT** reliably bypass RLS inside `SECURITY DEFINER` trigger functions on `auth.users`. The setting is silently ignored unless the executing role is a superuser or table owner. The proven working pattern:

1. Create a separate `SECURITY DEFINER` **SQL function** (not plpgsql) that performs the RLS-protected query and returns the needed columns.
2. Call that helper from the trigger.

SQL functions with `SECURITY DEFINER` reliably bypass RLS in trigger contexts because the planner evaluates them with the function owner's privileges in a simpler context than plpgsql triggers. See `get_invitation_for_signup()` and Migration 015 for the canonical example. Use the same pattern any time a trigger on `auth.users` (or any other context where the new user has no profile yet) needs to read from an RLS-protected table.

**This lesson is captured in `CLAUDE.md` under Database Patterns.**

### Context vs. git source of truth (Session 8)

Context files (`docs/sessions/contextN.md`) describe **intent and decisions**, not state. Git describes **state**. Never trust a context file for "is X committed?" — always run `git log --oneline -15` at session start. Session 8 wasted roughly 30 minutes chasing phantom work because context8.md said certain migrations were uncommitted, when git log showed they were already in.

### VS Code browser drag-and-drop targeting (Session 8)

When uploading files via drag-and-drop in browser VS Code, drop zones are ambiguous — files can end up at filesystem root (`/`) instead of the intended folder. If uploads fail with "Insufficient permissions" errors referencing `\filename.md`, the drop missed the target folder. Right-click the destination folder → "Upload..." is more reliable.

---

## System Test Results

### Module 1 (April 5, 2026)

All Module 1 features verified working in production:

- ✅ Fresh Owner sign-up creates company + profile + 30-day trial subscription
- ✅ Trial countdown displays on billing page
- ✅ Plan selection page works for all three tiers
- ✅ Stripe Checkout completes successfully with test card
- ✅ Webhook updates subscription record after checkout
- ✅ Stripe Customer Portal opens and allows plan changes
- ✅ Team page displays correctly
- ✅ Invitation creation generates working links
- ✅ Seat enforcement banner shows on invite page
- ✅ Subscription enforcement middleware blocks expired/canceled accounts
- ✅ Trial abuse prevention via trial_emails table

### Admin Invite Flow (April 8, 2026 — Session 7, after Migration 015)

- ✅ Owner creates admin invitation from Team page
- ✅ Invite link renders accept-invite page with correct company name and role label
- ✅ accept-invite passes `invitation_token` correctly in signUp options.data
- ✅ `handle_new_user()` trigger reads token from raw_user_meta_data
- ✅ `get_invitation_for_signup()` helper returns the invitation row, bypassing RLS
- ✅ Profile created with correct `role = 'admin'` and `company_id`
- ✅ Invitation `status` updated to `'accepted'`
- ✅ New admin lands in dashboard for the correct company

### Company Settings Page (April 5, 2026)

- ✅ Settings page loads for owner/admin only
- ✅ Form pre-fills with current company data
- ✅ Save persists changes to database
- ✅ Logo upload works, displays in preview, persists across page loads
- ✅ Trade type dropdown, US states, address all functional

### Module 2 (April 5, 2026)

- ✅ Contacts page accessible to all team members
- ✅ Add Contact button visible only to owner/admin/PM
- ✅ Create lead → save → appears in list with correct badge
- ✅ Edit lead → change to client → status badge updates
- ✅ Filter by type/status, search all work
- ✅ Soft delete works
- ✅ Subs & Vendors page same patterns
- ✅ Star rating clickable, persists, displays in list
- ✅ EIN, hourly rate, markup %, preferred checkbox all save and reload correctly
- ✅ Insurance expiry date picker functional

---

## Known Test Data

- **Josh Bishop** (jsbishop14@gmail.com) — Owner of Bishop Contracting (predates Migration 007, may need manual subscription row insert)
- **josh+test40@worthprop.com** — Admin of Bishop Contracting. Created Session 7 debugging, currently functional. Use for future Admin role testing.
- Multiple orphaned test accounts and "My Company" entries from Session 7 debugging (josh+test11, josh+test1, josh+test2, josh+test20, josh+test30, test@test.com, test@gmail.com). Optional cleanup.
- Test contacts and subs/vendors created during Module 2 testing

Clear all test data with:

```sql
DELETE FROM subcontractors;
DELETE FROM contacts;
DELETE FROM trial_emails;
DELETE FROM subscriptions;
DELETE FROM invitations;
DELETE FROM profiles;
DELETE FROM companies;
DELETE FROM auth.users;
```

---

## Outstanding Items / Tech Debt

### Session 10 Accomplishments (April 9, 2026)

- ✅ Ran Verification First checklist — all 5 items green
  - `bash scripts/session-start.sh` — clean repo, Supabase CLI linked
  - `npm run type-check` — 5/5 packages pass
  - `npm run build` — production build clean, all 22 routes compile
  - Vercel preview deploy on `verify/session-10` branch built and Ready
  - Browser smoke test on preview URL — settings, contacts, subcontractors, team, team/invite all render correctly with no console errors
- ✅ Verified Session 9 null guards working in live preview (team-page-client.tsx dates render correctly)
- ✅ Discovered Vercel deduplicates preview deploys by SHA — pushing a branch at the same SHA as `main` will not trigger a build. Force a fresh deploy with `git commit --allow-empty`. Logged as a lesson for future verification sessions.
- ✅ Logged 5 new tech debt items surfaced during smoke test (see Code Quality / UX Polish section below)
- ✅ Cleaned up `verify/session-10` branch (deleted local + origin)
- ❌ Open decisions (T&M rate structure, photo markup format) deferred to Session 11
- ❌ Module 3 build deferred to Session 11

### Session 9 Accomplishments (April 9, 2026)

- ✅ Implemented Option C (generated Supabase types as single source of truth)
  - Generated `packages/shared/types/database.ts` from live schema (707 lines)
  - Added `npm run db:types` script
  - Refactored all 5 service files: `company.ts`, `company-client.ts`, `contacts.ts`, `subcontractors.ts`, `team.ts`
  - Established Pick<> and Omit + intersection patterns (documented in CLAUDE.md)
  - Surfaced and fixed 2 real latent bugs (null guards on timestamps in team-page-client.tsx)
- ✅ Created `scripts/session-start.sh` ground-truth snapshot script
- ✅ Added Generated Types Workflow section to CLAUDE.md
- ✅ Cleaned up .gitignore (removed dead entry, added supabase/.temp/, \*.tsbuildinfo)
- ✅ Re-enabled Supabase email confirmation
- ✅ Added OPENAI_API_KEY to .env.local and Vercel
- ✅ Installed Claude Code in Codespace
- `npm run type-check` passes for all 5 packages

### Open Decisions Needed Before Building

These came up in Session 6 planning and are not resolved. They affect data model design:

7. **T&M rate structure (Module 6)** — Rates set per employee or per role? Per employee is more flexible but more admin overhead. Per role is simpler. Affects `time_entries` and `users` data model.
8. **Photo markup storage format (Module 3)** — JSON (coordinates of shapes, editable) or rendered image (simpler but loses editability)? Leaning JSON. Decide before Module 3 build because component is shared with Module 6.
9. **Selection deadline enforcement (Module 9)** — Soft reminder only or auto-block project progress? Decide before Module 9.
10. **Decision log edit history policy (Module 9)** — Append-only (more legally defensible) or editable? Leaning append-only. Decide before Module 9.

### Track for Module 4 (Estimating)

11. **Add `converted_at` timestamp to contacts** — For lead-to-client conversion tracking and pipeline reporting in Module 10.
12. **Add cursor-based pagination to list pages** — Both contacts and subcontractors lists currently load all records.

### Track for Module 5/6

13. **Add insurance_carrier and insurance_policy_number to subcontractors** — For Insurance Expiration Alert workflow.

### Pre-Beta

14. **No tags UI on contacts/subs forms** — Columns exist (`tags TEXT[]`), no input component yet.
15. **No loading.tsx or error.tsx** boundary files for any routes.
16. **No CSV import** for contacts or subcontractors.
17. **No active page highlighting** in sidebar nav.
18. **No phone format enforcement** in any forms.
19. **Source CHECK constraint may be too restrictive** — Currently limits to referral/website/google/social_media/repeat/other. Real contractors may want yard sign, trade show, Angi, HomeAdvisor, etc.
20. **Optional cleanup of Session 7 debugging artifacts** — Orphaned test users and "My Company" rows. Not blocking.

### Code Quality (Discovered Session 8)

18. **`team-page-client.tsx` has local `ROLE_LABELS`** — Should import from `@framefocus/shared`. Null guards added Session 9 but local constants still not consolidated.
19. **`invite-form.tsx` has local `INVITABLE_ROLES`** — Should import from `@framefocus/shared`.
20. **`invite-form.tsx` imports `Invitation` type without `import type`** — Cross-boundary type import should use `import type` per convention.
21. **`packages/shared/constants/index.ts` duplication (HIGH PRIORITY — latent bug)** — Has inline `COMPANY_ROLES`, `ROLE_LABELS`, `ROLE_HIERARCHY`, `SUBSCRIPTION_TIERS`, `MODULE_STATUS` **AND** re-exports from `./roles`. The inline `COMPANY_ROLES` and `ROLE_LABELS` are **missing the `admin` role** — which export wins depends on order. Fix: move inline `SUBSCRIPTION_TIERS` and `MODULE_STATUS` to their own files (`subscriptions.ts`, `modules.ts`), make `index.ts` a pure barrel.
22. **`packages/shared/types/index.ts` `Company` interface missing `website` and `license_number`** — Columns exist in DB (Migration 009) but not in the type. Partially mitigated by generated types in service files; hand-written types/index.ts still drifts.
23. **Migration filename `014_handle_new_User_Bypass_rls.sql` breaks naming convention** — Rename to `014_handle_new_user_bypass_rls.sql`. Cosmetic only, low priority.

### UX Polish (Discovered Session 10)

These all surfaced during the Session 10 smoke test. None are blocking, all are real product gaps. Best fixed as a "Module 1/2 polish" mini-session before Module 4, or folded into whichever module touches the affected pages next.

24. **Row click should open read-only detail view (contacts + subcontractors)** — Currently the only way to open a contact or vendor is the Edit button. Clicking the row should open a read-only detail view; editing should still require the explicit Edit button. Prevents accidental changes when users just want to look at a record. Same fix needed in both contacts and subcontractors.
25. **Team member edit UI** — Owner/Admin currently cannot open or edit existing team members from the team page. Need a `/dashboard/team/[id]` detail page similar to contacts.
26. **Team member delete UI** — Owner/Admin currently cannot remove a team member from the team page. Add to the team detail page.
27. **Team member password reset (Owner/Admin action)** — Owner/Admin should be able to trigger a password reset for a team member from the team detail page. Likely a Supabase admin API call.
28. **Team member notes field** — Add a simple text notes field on the team member detail page. Visible only when you click into the member, not in the list view. Useful for things like "handles framing crew, prefers text over email."

Items 25–28 share the same fix pattern: build a `/dashboard/team/[id]` detail page with edit/delete/notes/reset-password actions. Probably 1–2 hours total once the page exists.

### Lower Priority / Existing

29. **Invite emails not automated** — Owner currently copies the invite link manually. Resend integration deferred.
30. **No Edge Functions yet** — `packages/supabase/functions/` is empty. Stripe webhook handler is a Next.js API route. Module 3 AI auto-tagging may be the first Edge Function candidate.
31. **No shared UI components** — `apps/web/components/` and `packages/ui/` are empty. shadcn/ui not yet installed.
32. **Mobile app is a placeholder** — No real screens, no Supabase wiring, no NativeWind. Phase 2 work.
33. **No tests** — Test infrastructure not set up.
34. **`profiles` table uses `user_id` column** — All queries use `.eq('user_id', user.id)`.
35. **Promote-to-admin UI not built** — Owners can invite Admin role but no UI to promote existing members.
36. **Per-seat overage billing not implemented** — Module 1F blocks invites at limit but doesn't charge extra. Deferred until pricing model is finalized.
37. **`.env.local` doesn't persist across Codespace rebuilds** — Must be recreated from Vercel env vars.
38. **Legacy columns on companies table** — `subscription_tier` and `subscription_status` from earlier work, separate from `subscriptions` table. Unused but redundant.
39. **TypeScript `any` workaround in webhook** — `_supabaseAdmin` typed as `any`.
40. **Bishop Contracting may need manual subscription row** — Predates Migration 007.
41. **Role-check patterns repeated** — `['owner', 'admin', 'project_manager'].includes(profile.role)` in every page.tsx. Extend `canManageRole()` pattern. Helper functions like `isOwnerOrAdmin()`, `canManageProjects()` would prevent Admin role drift.
42. **Inline style objects duplicated** across all three forms. Will be cleaned up with shadcn/ui migration.

---

## Reference Documents

All reference documents now live in the repo. Nothing is uploaded per-session anymore (except temporary screenshots or data files).

**In repo root:**

- `CLAUDE.md` — Main technical reference (conventions, stack, modules, roles, QB strategy, change order workflow, tech debt, Admin Role Principle)
- `STATE.md` — This file (current state snapshot, updated end of each session)

**In `docs/`:**

**In `docs/roadmap/`:**

- `FrameFocus_Platform_Roadmap.docx` — 51-page comprehensive reference. **Primary planning reference.**
- `FrameFocus_Quick_Reference.docx` — 5-page scannable summary.
- `FrameFocus_Platform_Roadmap.xlsx` — 8-tab planning spreadsheet.
- `FrameFocus_Development_Roadmap.docx` — Original Session 1 business roadmap (superseded, kept for history).

**In `docs/sessions/`:**

- `context1.md` through `context9.md` — Session-by-session build, planning, and debug logs. **`context9.md` is the most recent.**

---

## Session 11 — Starting Point

Verification First was completed in Session 10 — all 5 items passed. The Session 9 Option C refactor is verified safe. No re-verification needed at the start of Session 11 unless something has changed since Session 10 closed.

### Open Decisions — Must Answer Before Building

These two decisions from Session 6 are still blocking the Module 3 data model. **Answer photo markup format first since it directly blocks Module 3.** T&M rate structure can technically wait until closer to Module 6, but better to decide upfront.

1. **Photo markup storage format (blocks Module 3 photo markup feature)** — JSON or rendered image?
   - JSON (shape coordinates): editable, non-destructive, larger implementation
   - Rendered image: simpler, loses editability
   - Decision affects `files` table schema (`markup_data` column type) and component architecture

2. **T&M rate structure (blocks Module 6 data model)** — rates per employee or per role?
   - Per employee: more flexible, more admin overhead
   - Per role: simpler, less granular
   - Decision affects `time_entries` schema and the Module 6 build

### Once both decisions are made, Session 11 work is:

- Migration 016: `files` table + RLS (Module 3 foundation)
- Supabase Storage: `project-files` bucket + RLS policies
- File upload service layer (server + client) using the Option C generated types pattern
- Basic file list UI (web)

---

## How to Start the Next Session

1. Open the Codespace at `github.com/IronFrame414/FrameFocus`
2. Run:
   ```bash
   git pull
   bash scripts/session-start.sh
   ```
3. Open a new Claude Chat (ideally inside a "FrameFocus" Claude Project with `CLAUDE.md`, `STATE.md`, and Quick Reference as project knowledge)
4. Paste the output from step 2 plus `docs/sessions/context11.md`
5. Say: **"Starting Session 11. First task is to answer the photo markup storage format decision before any Module 3 code."**
6. Once both open decisions are made, switch to Claude Code in the terminal for the actual Migration 016 + Module 3 build
7. Return to Claude Chat at end of session to generate `context12.md` and update `STATE.md`
