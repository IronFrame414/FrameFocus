# STATE.md — FrameFocus Current State

> **Last updated:** April 21, 2026 — Session 38 (STATE.md codebase tree trim)
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

| Table             | Rows      | RLS                | Notes                                                                                                                                                                                                                                                 |
| ----------------- | --------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `companies`       | Multiple  | ✅ Enabled         | `slug` (NOT NULL, auto-generated), `stripe_customer_id`, address/phone/website/trade_type/license_number/logo_url, `ai_tagging_enabled` (boolean, default false — paid add-on flag). Legacy `subscription_tier`/`subscription_status` columns unused. |
| `profiles`        | Multiple  | ✅ Enabled         |
| `platform_admins` | 0         | ✅ Enabled         | No admins seeded yet                                                                                                                                                                                                                                  |
| `invitations`     | Test rows | ✅ Enabled         |
| `subscriptions`   | Multiple  | ✅ Enabled         |
| `trial_emails`    | Multiple  | ❌ No RLS          | Tracks emails that have used a trial. Only accessed by SECURITY DEFINER trigger                                                                                                                                                                       |
| `contacts`        | Test rows | ✅ Enabled         |
| `subcontractors`  | Test rows | ✅ Enabled         |
| `files`           | 0         | ✅ Enabled         |
| `auth.users`      | Multiple  | (Supabase managed) |
| `tag_options`     | 66+ rows  | ✅ Enabled         |
| `ai_tag_logs`     | 0         | ✅ Enabled         |

### Storage Buckets

| Bucket          | Public         | Notes                                                                                                              |
| --------------- | -------------- | ------------------------------------------------------------------------------------------------------------------ |
| `company-logos` | ✅ Public read | Folder: `{company_id}/logo.{ext}`. RLS: members upload/update; owner/admin delete                                  |
| `project-files` | ❌ Private     | Folder: `{company_id}/{project_id}/{uuid}-{filename}`. 4 RLS policies on storage.objects. Inline subquery pattern. |

### Helpers, triggers, RLS policies, and indexes are documented per-migration in supabase/migrations/

### Migrations

## All 26 migration files live in `supabase/migrations/` with 14-digit timestamp format. `npx supabase migration list` shows all 26 in sync (Local + Remote). Migration 006 was never created — intentional gap. Source of truth is the file list on disk.

## Codebase State

### apps/web (Next.js)

```
apps/web/ — annotated files only

app/api/files/auto-tag/route.ts          Thin route, delegates to ai-tagging service (Session 31)
app/auth/callback/route.ts               Honors ?next= param (Session 23)
app/dashboard/billing/add-ons-section.tsx  ai_tagging_enabled toggle (Session 32)
app/dashboard/settings/tags/             Per-company tag catalog UI (Session 30)
app/dashboard/team/team-page-client.tsx  ⚠️ Local ROLE_LABELS (#18)
app/dashboard/team/invite/invite-form.tsx  ⚠️ Local INVITABLE_ROLES (#19)
app/dashboard/team/[id]/actions.ts       Server actions for #14–#17 (Session 37, IN PROGRESS)
app/dashboard/projects/[id]/files/       Module 3 file UI: list, upload, markup, trash, ai-tag editor
app/dashboard/projects/[id]/files/markup-test/page.tsx  ⚠️ Throwaway (#50)

lib/services/ai-tagging.ts               Reference impl for all future AI features (Session 31)
lib/services/add-ons.ts / -client.ts     Add-on flag reads/writes — separate from company.ts (Session 32)
lib/services/files.ts / -client.ts       Canonical trash-bin pattern reference
lib/supabase-admin.ts                    Shared getSupabaseAdmin(), used by Stripe webhook + team actions (Session 37, #68)
lib/openai.ts                            Lazy getOpenAI()
lib/stripe.ts                            Lazy getStripe()
```

### packages/shared

```
packages/shared/ — annotated files only

components/MarkupViewer.tsx              Shared SVG viewer, portable to React Native (Session 26)
types/markup.ts                          Shape schema + createEmptyMarkup (Session 26)
types/database.ts                        Auto-generated, never hand-edit. Run `npm run db:types` after migrations.
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
5. State goal for the session (pick next Module 4 build target, OR open Pre-Module 9 Decision Gate, OR polish work)
6. Switch to Claude Code in the terminal once a plan is agreed
7. Return to Claude Chat at end of session to generate next context file and update `STATE.md`
