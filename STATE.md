# STATE.md — FrameFocus Current State

> **Last updated:** April 16, 2026 Session 34 — Module 3H UI complete, Module 3 fully complete
> **Purpose:** Snapshot of current state of codebase, infrastructure, and database. Updated at end of each session. For session narrative and decisions, see `docs/sessions/contextN.md`. For conventions and patterns, see `CLAUDE.md`.

---

## Build Status

| Module                        | Status         | Notes                                                                                                                                               |
| ----------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Settings, Admin & Billing  | ✅ COMPLETE    | Auth, roles, Stripe billing, company settings, invites, team management                                                                             |
| 2. Contacts & CRM             | ✅ COMPLETE    | Two-table design (contacts + subcontractors), full CRUD, filters, ratings, markup                                                                   |
| 3. Document & File Management | ✅ COMPLETE    | Database, service layer, file list UI, upload, download, soft-delete, markup, favorites, trash, AI auto-tagging (Sessions 11–32).                   |
| 4. Sales & Estimating         | ⚪ NOT STARTED |                                                                                                                                                     |
| 5. Project Management         | ⚪ NOT STARTED |                                                                                                                                                     |
| 6. Team & Field Operations    | ⚪ NOT STARTED | Scope expanded Session 6. Time categorization, break tracking, OT, mileage, safety logs, incident workflow, huddles, delivery tracking              |
| 7. Job Finances               | ⚪ NOT STARTED |                                                                                                                                                     |
| 8. Inventory & Tools          | ⚪ NOT STARTED | Added Session 6. Inventory catalog + tool tracking with location, check-in/out log, bulk assignment                                                 |
| 9. Customer Experience Portal | ⚪ NOT STARTED | **BLOCKED by Pre-Module 9 Decision Gate.** Scope expanded Session 6: material selections, decision log, photo favorites, pre-construction checklist |
| 10. Reporting & Analytics     | ⚪ NOT STARTED |                                                                                                                                                     |
| 11. AI Marketing & Social     | ⚪ NOT STARTED |                                                                                                                                                     |

### Module 3 sub-status

| Sub-module                                                   | Status      |
| ------------------------------------------------------------ | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3A — files table + RLS                                       | ✅ COMPLETE |
| 3B — project-files storage bucket + RLS                      | ✅ COMPLETE |
| 3C — column defaults migration (018)                         | ✅ COMPLETE |
| 3D — file upload service layer (files.ts + client)           | ✅ COMPLETE |
| 3E — polish migration (019: updated_by + mime CHECK)         | ✅ COMPLETE |
| 3F — file list UI (web) + upload form + download/soft-delete | ✅ COMPLETE |
| 3G — photo markup component (shared w/ Module 6)             | ✅ COMPLETE | Schema + shared SVG viewer (Session 26). Web editor with 5 tools, undo, select/delete, save (Session 27).                                                                                                                                    |
| 3H — AI auto-tagging via GPT-4o vision                       | ✅ COMPLETE | Schema + seeding (Session 29). Service layer, settings UI, OpenAI client, add-on flag, cost log table (Session 30). API route + ai-tagging service (Session 31). Billing toggle, upload wiring, tag display, inline tag editor (Session 32). |
| 3I — file favorites (is_favorite column + toggle UI)         | ✅ COMPLETE | Company-wide. Boolean column on files (not junction table). Session 28.                                                                                                                                                                      |
| 3J — trash UI (view soft-deleted, restore, permanent delete) | ✅ COMPLETE | Session 28. Permanent delete hidden from non-owner/admin.                                                                                                                                                                                    |

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

| Table             | Rows      | RLS                | Notes                                                                                                                                                                                                                                                                                  |
| ----------------- | --------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| `companies`       | Multiple  | ✅ Enabled         | `slug` (NOT NULL, auto-generated), `stripe_customer_id`, address/phone/website/trade_type/license_number/logo_url, `ai_tagging_enabled` (boolean, default false — paid add-on flag). Legacy `subscription_tier`/`subscription_status` columns unused.                                  |
| `profiles`        | Multiple  | ✅ Enabled         | Linked to `auth.users` via `user_id`. Soft delete via `is_deleted`.                                                                                                                                                                                                                    |
| `platform_admins` | 0         | ✅ Enabled         | No admins seeded yet                                                                                                                                                                                                                                                                   |
| `invitations`     | Test rows | ✅ Enabled         | Token-based, 7-day expiry, status: pending/accepted/expired/cancelled                                                                                                                                                                                                                  |
| `subscriptions`   | Multiple  | ✅ Enabled         | One per company. plan_tier, status, seat_limit, trial dates. Only service_role writes                                                                                                                                                                                                  |
| `trial_emails`    | Multiple  | ❌ No RLS          | Tracks emails that have used a trial. Only accessed by SECURITY DEFINER trigger                                                                                                                                                                                                        |
| `contacts`        | Test rows | ✅ Enabled         | Leads & clients. contact_type CHECK, status, name, company, email, phone, address, source, tags. Soft delete                                                                                                                                                                           |
| `subcontractors`  | Test rows | ✅ Enabled         | Subs & vendors. EIN, default_hourly_rate, default_markup_percent, preferred, rating, insurance_expiry. Soft delete                                                                                                                                                                     |
| `files`           | 0         | ✅ Enabled         | Module 3. project_id nullable until Module 5. markup_data JSONB. Soft delete. 4 RLS policies. Column defaults on company_id/created_by/updated_by. BEFORE UPDATE trigger sets updated_by.                                                                                              |
| `auth.users`      | Multiple  | (Supabase managed) |
| `tag_options`     | 66+ rows  | ✅ Enabled         | Module 3H. Per-company tag catalog. category CHECK (trade/stage/area/condition/documentation), is_active, sort_order. UNIQUE (company_id, name). 4 RLS policies. Column defaults on company_id/created_by/updated_by (Migration 022). Seeded for Bishop Contracting via Migration 021. |
| `ai_tag_logs`     | 0         | ✅ Enabled         | Module 3H. Append-only cost log for GPT-4o vision calls. NO standard audit columns by design (no updated_at, no created_by, no soft-delete). 2 RLS policies (owner/admin select, authenticated insert). Indexes on company_id and created_at DESC.                                     |     |

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
- **ai_tag_logs:** `_select_owner_admin`, `_insert_authenticated`. No UPDATE/DELETE policies (append-only).

### Indexes

- subscriptions: `idx_subscriptions_company_id`, `idx_subscriptions_stripe_subscription_id`
- invitations: `idx_invitations_token`
- contacts: `idx_contacts_company_id`, `idx_contacts_contact_type`, `idx_contacts_status`
- subcontractors: `idx_subcontractors_company_id`, `idx_subcontractors_sub_type`, `idx_subcontractors_status`, `idx_subcontractors_trade`
- tag_options: `idx_tag_options_company_id`, `idx_tag_options_company_active` (partial WHERE is_active=true)
- ai_tag_logs: `idx_ai_tag_logs_company_id`, `idx_ai_tag_logs_created_at` (DESC)

### Migrations

## All 24 migration files live in `supabase/migrations/` with 14-digit timestamp format. `npx supabase migration list` shows all 24 in sync (Local + Remote). Migration 006 was never created — intentional gap. Source of truth is the file list on disk.

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
│   │   └── files/
│   │       ├── signed-url/route.ts        ✅ Session 25
│   │       └── auto-tag/route.ts          ✅ Session 31 — thin route, delegates to ai-tagging service
│   ├── auth/callback/route.ts             ✅ Honors ?next= param (Session 23)
│   ├── dashboard/
│   │   ├── layout.tsx                     ✅
│   │   ├── dashboard-shell.tsx            ✅ Sidebar nav
│   │   ├── page.tsx                       ✅
│   │   ├── billing/
│   │   │   ├── page.tsx                    ✅ Session 32 — imports getAddOns, renders AddOnsSection
│   │   │   ├── add-ons-section.tsx         ✅ Session 32 — 'use client' toggle for ai_tagging_enabled
│   │   │   ├── manage-subscription-button.tsx ✅
│   │   │   ├── plans/                      ✅
│   │   │   └── success/                    ✅
│   │   ├── settings/
│   │   │   ├── page.tsx                   ✅
│   │   │   ├── settings-form.tsx          ✅ Uses shared TRADE_TYPES, US_STATES
│   │   │   └── tags/
│   │   │       ├── page.tsx               ✅ Session 30 — owner/admin role gate
│   │   │       └── tags-manager.tsx       ✅ Session 30 — add/deactivate/reactivate, grouped by category
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
│   │       ├── ai-tag-editor.tsx           ✅ Session 32 — inline add/remove AI tags with dropdown
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
│   │   ├── files.ts / -client.ts          ✅ Module 3
│   │   ├── tag-options.ts / -client.ts    ✅ Session 30 — Module 3H
│   │   └── ai-tagging.ts                  ✅ Session 31 — autoTagFile(), server-only, reference impl for all future AI features
│   │   ├── add-ons.ts / -client.ts         ✅ Session 32 — read/write add-on flags (ai_tagging_enabled). Separate from company.ts by design.
│   ├── openai.ts                          ✅ Module 3H — lazy getOpenAI(), Session 30
│   ├── stripe.ts                          ✅ Lazy getStripe()
│   ├── supabase-browser.ts                ✅
│   ├── supabase-server.ts                 ✅
│   └── utils.ts                           ✅
├── middleware.ts                          ✅
├── next.config.js                         ✅
└── package.json                           ✅
```

### packages/shared

```
packages/shared/
├── constants/
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

### Environment variables (stored as GitHub Codespace secrets)

All env vars below are stored as **GitHub Codespace secrets** and auto-inject into the shell environment on Codespace start. `apps/web/.env.local` does NOT need to exist for the dev server to work. Verify with `printenv | grep -E "SUPABASE|STRIPE|OPENAI"` if uncertain. Vercel env vars must match these values exactly.

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

- **Josh Bishop** (jsbishop14@gmail.com) — Owner of Bishop Contracting. Predates Migration 007, may need manual subscription row insert. `ai_tagging_enabled = true` as of Session 31 (left on for Session 32 upload-wiring testing).
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

## Open Design Questions (by module)

These are design questions surfaced during planning that need answers before the relevant module's design phase, not its build phase. Tracked here so they don't get forgotten and don't drift into tech debt.

### Module 3 (ongoing)

- **Photo storage at scale.** 200 GB Business cap may not be enough for high-volume commercial contractors. Decide before pricing changes or first overage complaint.

### Module 6

- **Offline sync conflicts.** Two crew members edit the same daily log offline, both come back online — who wins? Current plan: last-write-wins. Needs validation against real field workflows before build.
- **Mobile performance on low-end Android.** Markup, offline sync, and AI features need testing on low-end devices. Decide minimum supported device tier before build.
- **Crew adoption product risk.** If foremen don't actually use the mobile app, the field ops value prop collapses. Needs extreme simplicity and a real beta-tester pilot before scope expansion.

### Module 7

- **QuickBooks sync drift.** What if the contractor edits a synced invoice directly in QB? Current design is one-way FF→QB; could create drift. Decide whether to detect/warn, force re-sync, or accept drift before build.

### Module 8

- **Inventory unit conversions.** Buying lumber by board-foot but using by piece. Decide whether to build a conversion layer or stay simple and require consistent units.

### Module 9

- **Client portal messaging.** Real-time chat or async email-style? Real-time is more work. Tied to the Pre-Module 9 Decision Gate above — answer this when that gate is resolved.

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

> Tech debt is tracked in `TECH_DEBT.md` at the repo root. Not loaded into project knowledge — view on demand.

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
