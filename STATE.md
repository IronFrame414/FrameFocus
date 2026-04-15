# STATE.md — FrameFocus Current State

> **Last updated:** April 15, 2026 Session 29 — Module 3H foundation (tag_options schema + seeding)
> **Purpose:** Snapshot of current state of codebase, infrastructure, and database. Updated at end of each session. For session narrative and decisions, see `docs/sessions/contextN.md`. For conventions and patterns, see `CLAUDE.md`.

---

## Build Status

| Module                        | Status         | Notes                                                                                                                                                                                                                                                                |
| ----------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Settings, Admin & Billing  | ✅ COMPLETE    | Auth, roles, Stripe billing, company settings, invites, team management                                                                                                                                                                                              |
| 2. Contacts & CRM             | ✅ COMPLETE    | Two-table design (contacts + subcontractors), full CRUD, filters, ratings, markup                                                                                                                                                                                    |
| 3. Document & File Management | 🟡 IN PROGRESS | Database + service layer + file list UI + upload + download/soft-delete + markup + favorites + trash UI complete. AI auto-tagging (3H) foundation done — schema + seed function + default tag list shipped Session 29. Service layer, UI, and AI integration remain. |
| 4. Sales & Estimating         | ⚪ NOT STARTED |                                                                                                                                                                                                                                                                      |
| 5. Project Management         | ⚪ NOT STARTED |                                                                                                                                                                                                                                                                      |
| 6. Team & Field Operations    | ⚪ NOT STARTED | Scope expanded Session 6. Time categorization, break tracking, OT, mileage, safety logs, incident workflow, huddles, delivery tracking                                                                                                                               |
| 7. Job Finances               | ⚪ NOT STARTED |                                                                                                                                                                                                                                                                      |
| 8. Inventory & Tools          | ⚪ NOT STARTED | Added Session 6. Inventory catalog + tool tracking with location, check-in/out log, bulk assignment                                                                                                                                                                  |
| 9. Customer Experience Portal | ⚪ NOT STARTED | **BLOCKED by Pre-Module 9 Decision Gate.** Scope expanded Session 6: material selections, decision log, photo favorites, pre-construction checklist                                                                                                                  |
| 10. Reporting & Analytics     | ⚪ NOT STARTED |                                                                                                                                                                                                                                                                      |
| 11. AI Marketing & Social     | ⚪ NOT STARTED |                                                                                                                                                                                                                                                                      |

### Module 3 sub-status

| Sub-module                                                   | Status         |
| ------------------------------------------------------------ | -------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 3A — files table + RLS                                       | ✅ COMPLETE    |
| 3B — project-files storage bucket + RLS                      | ✅ COMPLETE    |
| 3C — column defaults migration (018)                         | ✅ COMPLETE    |
| 3D — file upload service layer (files.ts + client)           | ✅ COMPLETE    |
| 3E — polish migration (019: updated_by + mime CHECK)         | ✅ COMPLETE    |
| 3F — file list UI (web) + upload form + download/soft-delete | ✅ COMPLETE    |
| 3G — photo markup component (shared w/ Module 6)             | ✅ COMPLETE    | Schema + shared SVG viewer (Session 26). Web editor with 5 tools, undo, select/delete, save (Session 27).                  |
| 3H — AI auto-tagging via GPT-4o vision                       | 🟡 IN PROGRESS | Schema + seeding complete (Session 29). Service layer, settings UI, API route, upload wiring, display, edit UX all remain. |
| 3I — file favorites (is_favorite column + toggle UI)         | ✅ COMPLETE    | Company-wide. Boolean column on files (not junction table). Session 28.                                                    |
| 3J — trash UI (view soft-deleted, restore, permanent delete) | ✅ COMPLETE    | Session 28. Permanent delete hidden from non-owner/admin.                                                                  |

---

## Infrastructure

| Component          | Status           | Details                                                                |
| ------------------ | ---------------- | ---------------------------------------------------------------------- |
| GitHub repo        | ✅ Live          | github.com/IronFrame414/FrameFocus (private)                           |
| GitHub Codespaces  | ✅ Configured    | Current: "fantastic trout"                                             |
| Turborepo monorepo | ✅ Scaffolded    | apps/web, apps/mobile, packages/shared, packages/supabase, packages/ui |
| Supabase project   | ✅ Live          | jwkcknyuyvcwcdeskrmz.supabase.co                                       |
| Supabase Storage   | ✅ Live          | `company-logos` public, `project-files` private                        |
| Vercel deployment  | ✅ Live          | https://frame-focus-eight.vercel.app (auto-deploy from main)           |
| GitHub Actions CI  | ✅ Configured    | Lint + type-check on push to main/dev                                  |
| Stripe             | ✅ Live          | Test mode. 3 products + webhook + Customer Portal configured           |
| Supabase CLI       | ✅ Installed     | Linked to jwkcknyuyvcwcdeskrmz. Migration history in sync (Session 17) |
| QuickBooks Online  | ⚪ Not connected | Strategy in CLAUDE_MODULES.md. Build during Modules 6 & 7              |
| OpenAI API         | ✅ Configured    | Key in `.env.local` and Vercel. Ready for Module 3                     |
| Claude Code        | ✅ Installed     | CLI in Codespace terminal                                              |

---

## Database State

### Tables (in production Supabase)

| Table             | Rows      | RLS                | Notes                                                                                                                                                                                                             |
| ----------------- | --------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `companies`       | Multiple  | ✅ Enabled         | `slug` (NOT NULL, auto-generated), `stripe_customer_id`, address/phone/website/trade_type/license_number/logo_url. Legacy `subscription_tier`/`subscription_status` columns unused.                               |
| `profiles`        | Multiple  | ✅ Enabled         | Linked to `auth.users` via `user_id`. Soft delete via `is_deleted`.                                                                                                                                               |
| `platform_admins` | 0         | ✅ Enabled         | No admins seeded yet                                                                                                                                                                                              |
| `invitations`     | Test rows | ✅ Enabled         | Token-based, 7-day expiry, status: pending/accepted/expired/cancelled                                                                                                                                             |
| `subscriptions`   | Multiple  | ✅ Enabled         | One per company. plan_tier, status, seat_limit, trial dates. Only service_role writes                                                                                                                             |
| `trial_emails`    | Multiple  | ❌ No RLS          | Tracks emails that have used a trial. Only accessed by SECURITY DEFINER trigger                                                                                                                                   |
| `contacts`        | Test rows | ✅ Enabled         | Leads & clients. contact_type CHECK, status, name, company, email, phone, address, source, tags. Soft delete                                                                                                      |
| `subcontractors`  | Test rows | ✅ Enabled         | Subs & vendors. EIN, default_hourly_rate, default_markup_percent, preferred, rating, insurance_expiry. Soft delete                                                                                                |
| `files`           | 0         | ✅ Enabled         | Module 3. project_id nullable until Module 5. markup_data JSONB. Soft delete. 4 RLS policies. Column defaults on company_id/created_by/updated_by. BEFORE UPDATE trigger sets updated_by.                         |
| `auth.users`      | Multiple  | (Supabase managed) |
| `tag_options`     | 66+ rows  | ✅ Enabled         | Module 3H. Per-company tag catalog. category CHECK (trade/stage/area/condition/documentation), is_active, sort_order. UNIQUE (company_id, name). 4 RLS policies. Seeded for Bishop Contracting via Migration 021. |

### Storage Buckets

| Bucket          | Public         | Notes                                                                                                              |
| --------------- | -------------- | ------------------------------------------------------------------------------------------------------------------ |
| `company-logos` | ✅ Public read | Folder: `{company_id}/logo.{ext}`. RLS: members upload/update; owner/admin delete                                  |
| `project-files` | ❌ Private     | Folder: `{company_id}/{project_id}/{uuid}-{filename}`. 4 RLS policies on storage.objects. Inline subquery pattern. |

### Helper functions

- `get_my_company_id()` — returns current user's company_id from profiles
- `get_my_role()` — returns current user's role from profiles
- `is_platform_admin()` — boolean check against platform_admins table
- `update_updated_at()` — trigger function for auto-updating timestamps
- `handle_new_user()` — fires on `auth.users` insert. Three behaviors: (1) invited user joins via `get_invitation_for_signup()`; (2) new owner with new email gets 30-day trial; (3) new owner with used email gets `incomplete` subscription. SECURITY DEFINER.
- `get_invitation_by_token(UUID)` — SECURITY DEFINER function for unauthenticated invite lookups from accept-invite page
- `get_invitation_for_signup(UUID)` — SECURITY DEFINER SQL function called from `handle_new_user()` to bypass RLS. See CLAUDE.md Database Patterns for why SQL (not plpgsql).
- `seed_default_tags(p_company_id UUID)` — SECURITY DEFINER plpgsql function. Inserts 66 default tags into `tag_options` for a company. Idempotent (ON CONFLICT DO NOTHING). Called from `handle_new_user()` on owner signup. Module 3H.

### Triggers

- updated_at timestamp triggers on: companies, profiles, invitations, subscriptions, contacts, subcontractors
- `on_auth_user_created` — fires `handle_new_user()` after insert on auth.users
- `files_set_updated_by` — BEFORE UPDATE on files, sets updated_by = auth.uid()
- `contacts_set_updated_by` — BEFORE UPDATE on contacts, sets updated_by = auth.uid()
- `subcontractors_set_updated_by` — BEFORE UPDATE on subcontractors, sets updated_by = auth.uid()
- `tag_options_updated_at` (timestamp), `tag_options_set_updated_by` — BEFORE UPDATE triggers on tag_options

### RLS policies (summary)

- **invitations:** `_select_owner_admin`, `_insert_owner_admin`, `_update_owner_admin`. Trigger bypasses via `get_invitation_for_signup()` helper.
- **companies:** `_update_owner_admin`
- **subscriptions:** `_select_owner_admin`. Only service_role (webhook) writes
- **profiles:** `_select_authenticated`
- **contacts / subcontractors:** `_select_authenticated`, `_insert_authorized`, `_update_authorized` (owner/admin/PM can write)
- **files:** 4 policies — non-client read/write, owner+admin permanent delete
- **storage.objects (company-logos):** upload, update, public read, delete (owner/admin)
- **storage.objects (project-files):** 4 policies, inline subquery pattern
- **tag_options:** `_select_authenticated` (anyone in company, active+inactive), `_insert_owner_admin`, `_update_owner_admin`, `_delete_owner`

### Indexes

- subscriptions: `idx_subscriptions_company_id`, `idx_subscriptions_stripe_subscription_id`
- invitations: `idx_invitations_token`
- contacts: `idx_contacts_company_id`, `idx_contacts_contact_type`, `idx_contacts_status`
- subcontractors: `idx_subcontractors_company_id`, `idx_subcontractors_sub_type`, `idx_subcontractors_status`, `idx_subcontractors_trade`
- tag_options: `idx_tag_options_company_id`, `idx_tag_options_company_active` (partial WHERE is_active=true)

### Migrations

All 22 migration files live in `supabase/migrations/` with 14-digit timestamp format. `npx supabase migration list` shows all 22 in sync (Local + Remote). Migration 006 was never created — intentional gap. Source of truth is the file list on disk.

---

## Codebase State

### apps/web (Next.js)

```
apps/web/
├── app/
│   ├── api/
│   │   ├── stripe/
│   │   │   ├── checkout/route.ts          ✅
│   │   │   ├── webhook/route.ts           ✅ Lazy init, metadata fallback
│   │   │   └── portal/route.ts            ✅
│   │   └── files/signed-url/route.ts      ✅ Session 25
│   ├── auth/callback/route.ts             ✅ Honors ?next= param (Session 23)
│   ├── dashboard/
│   │   ├── layout.tsx                     ✅
│   │   ├── dashboard-shell.tsx            ✅ Sidebar nav
│   │   ├── page.tsx                       ✅
│   │   ├── billing/                       ✅ All 5 files
│   │   ├── settings/
│   │   │   ├── page.tsx                   ✅
│   │   │   └── settings-form.tsx          ✅ Uses shared TRADE_TYPES, US_STATES
│   │   ├── contacts/                      ✅ list, form, new, edit
│   │   ├── subcontractors/                ✅ list, form, new, edit
│   │   ├── team/
│   │   │   ├── page.tsx                   ✅
│   │   │   ├── team-page-client.tsx       ⚠️ Local ROLE_LABELS (tech debt #18)
│   │   │   └── invite/
│   │   │       ├── page.tsx               ✅
│   │   │       └── invite-form.tsx        ⚠️ Local INVITABLE_ROLES (tech debt #19/20)
│   │   └── projects/[id]/files/
│   │       ├── page.tsx                   ✅ Session 28 — list + Trash link + row-click view
│   │       ├── file-row.tsx               ✅ Session 28 — clickable row (view on click)
│   │       ├── file-row-actions.tsx       ✅ Session 28 — Markup (image-gated) + Download + Delete
│   │       ├── favorite-toggle.tsx        ✅ Session 28 — star/unstar button (optimistic)
│   │       ├── upload/
│   │       │   ├── page.tsx               ✅ Session 25
│   │       │   └── upload-form.tsx        ✅ Session 25
│   │       ├── trash/
│   │       │   ├── page.tsx               ✅ Session 28 — lists soft-deleted files
│   │       │   └── trash-row.tsx          ✅ Session 28 — Restore + Delete forever (owner/admin)
│   │       ├── markup-test/
│   │       │   └── page.tsx               ⚠️ Throwaway test page (tech debt #50)
│   │       └── [fileId]/markup/
│   │           ├── page.tsx               ✅ Session 27 — server: fetches file, signs URL, image-gates
│   │           └── markup-editor.tsx      ✅ Session 27 — client: 5 tools, undo, select/delete, save
│   ├── forgot-password/page.tsx           ✅ Session 23
│   ├── reset-password/page.tsx            ✅ Session 23
│   ├── invite/accept/                     ✅
│   ├── sign-in/page.tsx                   ✅
│   ├── sign-up/page.tsx                   ✅
│   └── layout.tsx / page.tsx              ✅
├── lib/
│   ├── services/
│   │   ├── team.ts                        ✅
│   │   ├── billing.ts                     ✅
│   │   ├── seats.ts                       ✅
│   │   ├── company.ts / -client.ts        ✅ Generated types
│   │   ├── contacts.ts / -client.ts       ✅ Generated types
│   │   ├── subcontractors.ts / -client.ts ✅ Generated types
│   │   └── files.ts / -client.ts          ✅ Module 3
│   ├── stripe.ts                          ✅ Lazy getStripe()
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
│   ├── index.ts                            ⚠️ Tech debt #21 (High priority, latent bug — missing admin role in inline COMPANY_ROLES)
│   ├── roles.ts                            ✅ Full role definitions with admin
│   └── form-options.ts                     ✅ TRADE_TYPES, US_STATES, LEAD_SOURCES
├── components/
│   └── MarkupViewer.tsx                    ✅ Session 26 — shared SVG markup viewer (Module 3G)
├── types/
│   ├── index.ts                            ⚠️ Tech debt #22 (Company interface missing website/license_number). Re-exports markup.
│   ├── roles.ts                            ✅
│   ├── markup.ts                           ✅ Session 26 — shape schema (arrow, circle, rectangle, pen, text) + createEmptyMarkup
│   └── database.ts                         ✅ Auto-generated from Supabase schema (707 lines)
├── validation/                             (Zod schemas)
├── utils/
└── index.ts                                ✅ Barrel export
```

### apps/mobile (Expo)

Placeholder. Phase 2 work.

### docs/

```
docs/
├── roadmap/                                ✅ All roadmap docx/xlsx
└── sessions/                               ✅ context1.md through context17.md
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
OPENAI_API_KEY=(sk-... key)
```

Vercel env vars must match `.env.local` exactly.

---

## Supabase Configuration

| Setting                     | Value                                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------------- |
| Email provider              | ✅ Enabled                                                                                  |
| Email confirmation          | ✅ Enabled                                                                                  |
| Site URL                    | `https://frame-focus-eight.vercel.app`                                                      |
| Redirect URLs               | `https://frame-focus-eight.vercel.app/auth/callback`, `http://localhost:3000/auth/callback` |
| Automatic RLS on new tables | ✅ Enabled                                                                                  |
| Data API                    | ✅ Enabled                                                                                  |
| OTP/email link expiry       | 24 hours (raised Session 23 from default)                                                   |
| Redirect URLs               | + wildcards `/auth/callback?next=*` for prod and localhost                                  |

---

## Stripe Configuration

| Setting          | Value                                                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Mode             | Test mode                                                                                                                |
| Products         | Starter ($79/mo), Professional ($149/mo), Business ($249/mo)                                                             |
| Webhook endpoint | `https://frame-focus-eight.vercel.app/api/stripe/webhook`                                                                |
| Webhook events   | `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed` |
| Customer Portal  | Configured: plan switching, payment method updates, cancellation enabled                                                 |
| Stripe Connect   | Not enabled (deferred to Module 7/8)                                                                                     |

---

## Test Data

- **Josh Bishop** (jsbishop14@gmail.com) — Owner of Bishop Contracting. Predates Migration 007, may need manual subscription row insert.
- **josh+test40@worthprop.com** — Admin of Bishop Contracting. Use for Admin role testing.
- Various orphaned test accounts from Session 7 debugging. Optional cleanup.

Clear all test data:

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

## Open Decisions (block future module work)

1. **Selection deadline enforcement (Module 9)** — Soft reminder only or auto-block project progress? Decide before Module 9.
2. **Decision log edit history policy (Module 9)** — Append-only (legally defensible) or editable? Leaning append-only. Decide before Module 9.

---

## Pre-Module 9 Decision Gate (HARD BLOCK)

**Module 9 design and build are blocked until this is resolved.** Two product ideas surfaced in Session 15 that fundamentally affect client experience shape.

**Idea 1 — Outbound webhook system (potential Module 12):** Per-company API keys + webhook configs + HMAC-signed events. Allows each company to push project updates to their own external website. Full spec in `docs/sessions/context15.md`.

**Idea 2 — Client-experience pivot (no logins):** Replace FrameFocus-hosted client portal with email + magic-link tokenized pages (for signing COs, picking materials) + webhook sync to the company's own website. Eliminates client accounts.

**Questions to resolve:** Is FrameFocus the client portal, is the company website the client portal, or both? What replaces client messaging thread if clients don't log in? Does magic-link signing fit on all tiers or only Business? Where does invoice payment live?

---

## Module 5 follow-up (must not be forgotten)

When Module 5 builds the `projects` table:

1. Add FK: `ALTER TABLE files ADD CONSTRAINT files_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id);`
2. `projects` table must include `contact_id UUID NOT NULL REFERENCES contacts(id)` — one client, many projects, each with its own address.

## Module 9 follow-up (must not be forgotten)

Add a SECOND SELECT policy on `files` to grant clients read access to specifically-shared files. Likely via a `file_shares` junction table.

---

## Open Tech Debt

> Numbered sequentially. Gaps in numbering (where applicable) are intentional — closed items have been deleted; git log preserves history.

### Pre-Beta

- **#1** No tags UI on contacts/subs forms (columns exist as TEXT[], no input component yet)
- **#2** No loading.tsx or error.tsx boundary files for any routes
- **#3** No CSV import for contacts or subcontractors
- **#4** No active page highlighting in sidebar nav
- **#5** No phone format enforcement in any forms
- **#6** Source CHECK constraint may be too restrictive (real contractors may want yard sign, trade show, Angi, HomeAdvisor, etc.)
- **#7** Optional cleanup of Session 7 debugging artifacts — orphaned test users

### Code Quality

- **#8** `team-page-client.tsx` has local `ROLE_LABELS` — should import from `@framefocus/shared`
- **#9** `invite-form.tsx` has local `INVITABLE_ROLES` — should import from `@framefocus/shared`
- **#10** `invite-form.tsx` imports `Invitation` without `import type` — cross-boundary type import should use `import type`
- **#12** `packages/shared/types/index.ts` `Company` interface missing `website` and `license_number` — partially mitigated by generated types in service files

### UX Polish

- **#13** Row click should open read-only detail view (contacts + subcontractors) — currently Edit button is only way in
- **#14** Team member edit UI — no `/dashboard/team/[id]` page yet
- **#15** Team member delete UI
- **#16** Team member password reset (Owner/Admin action)
- **#17** Team member notes field

Items #14–#17 share the same fix pattern: build `/dashboard/team/[id]` detail page with edit/delete/notes/reset-password actions.

### Track for Module 4 (Estimating)

- **#18** Add `converted_at` timestamp to contacts — for lead-to-client conversion tracking
- **#19** Add cursor-based pagination to list pages — contacts and subcontractors currently load all records

### Track for Module 5/6

- **#20** Add insurance_carrier and insurance_policy_number to subcontractors — for Insurance Expiration Alert workflow
- **#21** `tm_rate` column on `profiles` (Module 6 prep) — decided Session 12, needs migration

### Module 3 Follow-Ups

- **#24** `uploadFile` still does auth + profile lookup for storage path — unavoidable until `company_id` is in JWT custom claims. Defer.
- **#25** Verify Postgres column defaults fire correctly on first real `files` INSERT — confirmed via `information_schema`, but no INSERT has run against `files` yet
- **#50** Delete `apps/web/app/dashboard/markup-test/page.tsx` once Module 3G editor is complete — throwaway visual test for MarkupViewer
- **#51** Add `.claude/` to `.gitignore` — Claude Code local config showing up as untracked

### Lower Priority / Existing

- **#27** Invite emails not automated — Owner copies invite link manually. Resend integration deferred.
- **#28** No Edge Functions yet — `functions/` empty. Module 3 AI auto-tagging may be first candidate.
- **#29** No shared UI components — `apps/web/components/` and `packages/ui/` empty. shadcn/ui not yet installed.
- **#30** Mobile app is a placeholder. Phase 2 work.
- **#31** No tests. Test infrastructure not set up.
- **#32** `profiles` table uses `user_id` column — all queries use `.eq('user_id', user.id)`
- **#33** Promote-to-admin UI not built
- **#34** Per-seat overage billing not implemented
- **#35** `.env.local` doesn't persist across Codespace rebuilds
- **#36** Legacy `subscription_tier`/`subscription_status` columns on companies table (unused but redundant)
- **#37** TypeScript `any` workaround in webhook
- **#38** Bishop Contracting may need manual subscription row — predates Migration 007
- **#39** Role-check patterns repeated across page.tsx files — would benefit from `isOwnerOrAdmin()` / `canManageProjects()` helpers
- **#40** Inline style objects duplicated across forms — cleanup with shadcn/ui migration
- **#43** `profiles_update_owner` RLS policy is Owner-only. Per Admin Role Principle (Owner minus billing minus Admin promotion), Admin should be able to edit other users' profiles EXCEPT promoting them to Admin. No live impact today because no `/dashboard/team/[id]` edit UI exists yet (see #14). When #14 ships, the RLS policy needs to be updated to allow Admin writes while still preventing Admin from setting `role='admin'`. Likely a column-level grant or a CHECK in a new policy. Discovered Session 21 during tech debt #41 audit.
  **#47** Customize Supabase auth emails (recovery, invite, signup confirmation) to use FrameFocus branding and copy. Currently using Supabase defaults. Set in Supabase Dashboard → Authentication → Email Templates.
- **#49** Inline styles across Module 3 pages (3F, 3G, 3I, 3J: page.tsx, upload-form.tsx, file-row.tsx, file-row-actions.tsx, favorite-toggle.tsx, markup-editor.tsx, markup/page.tsx, trash/page.tsx, trash-row.tsx) — same pattern as tech debt #40. Clean up with shadcn/ui migration in one focused pass.
- **#52** Polished markup text editor — replace `window.prompt()` in `markup-editor.tsx` with inline text input: positioned at click location, multi-line, per-shape font size control, click-to-edit existing text in select mode. Functional but unpolished in v1.
- **#53** Flattened markup image export — currently markup is JSON-only (rendered as SVG overlay). Need a flattened PNG/JPEG export when markup needs to leave the app: email attachments (Module 6 daily logs), client downloads, printed daily-log PDFs. Render via canvas (client-side) or Puppeteer (server-side). Decide when first email-sending feature ships.
- **#54** `getFiles()` returns all files and the trash page filters client-side to `is_deleted = true`. For small projects this is fine; for projects with thousands of files, add a dedicated `getTrash()` server function (or an `only_deleted: true` flag) that filters in the DB. Discovered Session 28.
- **#55** Image-aware file browsing for the files page. Two coupled pieces: (a) **thumbnail grid view** for images (likely when category = Photos, or for any image mixed in the table) — investigate Supabase image transformations vs. upload-time thumbnail generation; (b) **in-app fullscreen viewer** opened by clicking a thumbnail — same window, left/right arrow navigation across the project's images (keyboard + on-screen buttons), Open Markup button, Download button, close returns to grid. Non-image files keep current behavior (table row, Download opens new tab). Estimated 400-600 lines, dedicated session.
- **#56** SQL/TS tag list drift risk. `seed_default_tags()` in migration 021 and `DEFAULT_TAGS` in `packages/shared/constants/default-tags.ts` must be kept in sync manually. Add automated diff check before public launch. Both files have header warnings. Discovered Session 29.
- **#57** Empty migration file `20260415182317_add_tag_options_table.sql` — kept in repo intentionally because it was applied to remote (accidental double-create during Session 29). Won't fix; documented for clarity.

---

## How to Start the Next Session

1. Open the Codespace at `github.com/IronFrame414/FrameFocus`
2. Run:
   ```bash
   git checkout main
   git pull
   bash scripts/session-start.sh
   ```
3. Open a new Claude Chat (inside the FrameFocus Claude Project with `CLAUDE.md`, `STATE.md`, `CLAUDE_MODULES.md`, and Quick Reference as project knowledge)
4. Paste the snapshot output plus the latest `docs/sessions/contextN.md`
5. State goal for the session (pick next Module 3 build target, OR open Pre-Module 9 Decision Gate, OR polish work)
6. Switch to Claude Code in the terminal once a plan is agreed
7. Return to Claude Chat at end of session to generate next context file and update `STATE.md`
