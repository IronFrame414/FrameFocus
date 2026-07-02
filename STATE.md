# STATE.md — FrameFocus Current State

Last updated: 2026-07-01 — Session 54 (4D/4E built + revised on feature/4d-revision, pushed, unmerged to main; Module 5 in spec-writing; company_members foundation not yet built)

> **Purpose:** Snapshot of current state of codebase, infrastructure, and database. Updated at end of each session. For session narrative and decisions, see `docs/sessions/contextN.md`. For conventions and patterns, see `CLAUDE.md`.

---

## Build Status

| Module                        | Status         | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | --------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| 1. Settings, Admin & Billing  | ✅ COMPLETE    | Auth, roles, Stripe billing, company settings, invites, team management                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2. Contacts & CRM             | ✅ COMPLETE    | Two-table design (contacts + subcontractors), full CRUD, filters, ratings, markup                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 3. Document & File Management | ✅ COMPLETE    | Database, service layer, file list UI, upload, download, soft-delete, markup, favorites, trash, AI auto-tagging (Sessions 11–32).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 4. Sales & Estimating         | 🚧 IN PROGRESS | **4A ✅, 4B ✅, 4C ✅, 4D ✅, 4E ✅ — 4D/4E built + revised (2 revision arcs) on `feature/4d-revision`, pushed, NOT merged to main.** main has 4B + 4C only; 4D/4E await merge (typed-row line model + five-value pricing enum, 2 migrations). Specs: `docs/specs/4D-spec.md`, `docs/specs/4E-spec.md`. Launch scope locked Session 48 — IN: 4B–4F, 4J, 4K, 4M (+ Module 5); OUT (deferred): 4G versioning, 4H analytics, 4I AI assistant, 4L attachments UI. Architecture in `docs/specs/module4-architecture.md` (Sessions 33 + 41). v1 scope: 3-way markups, discounts, allowances, sub-bid tracking, file attachments, structured terms, configurable estimate-number prefix. |     
| 5. Project Management | 🚧 IN PROGRESS | Module 5 in spec-writing phase — no 5-series spec files written yet. Design authority: `docs/specs/module5-architecture.md`, committed `7eaaaa3` + pushed. Identity convention locked: all assignment via `company_members(id)` / `member_id`; `company_members` is a pre-M5 foundation, NOT yet built (no migration). Launch scope: 5A Projects & Conversion, 5B Tasks & Scheduling, 5C Punch Lists, 5D Change Orders, 5E Project Budget View. Post-launch (design-ready, build deferred): 5F Templates, 5G Closeout & Warranty, 5H Activity Log. |     |
| 6. Team & Field Operations    | ⚪ NOT STARTED | Scope expanded Session 6. Time categorization, break tracking, OT, mileage, safety logs, incident workflow, huddles, delivery tracking                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 7. Job Finances               | ⚪ NOT STARTED |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 8. Inventory & Tools          | ⚪ NOT STARTED | Added Session 6. Inventory catalog + tool tracking with location, check-in/out log, bulk assignment                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 9. Customer Experience Portal | ⚪ NOT STARTED | **BLOCKED by Pre-Module 9 Decision Gate.** Scope expanded Session 6: material selections, decision log, photo favorites, pre-construction checklist                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 10. Reporting & Analytics     | ⚪ NOT STARTED |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 11. AI Marketing & Social     | ⚪ NOT STARTED |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

---

## Infrastructure

| Component               | Status           | Details                                                                                                                                                                            |
| ----------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub repo             | ✅ Live          | github.com/IronFrame414/FrameFocus (private)                                                                                                                                       |
| GitHub Codespaces       | ✅ Configured    | Current: "fantastic trout"                                                                                                                                                         |
| Turborepo monorepo      | ✅ Scaffolded    | apps/web, apps/mobile, packages/shared, packages/supabase, packages/ui                                                                                                             |
| Supabase project        | ✅ Live          | jwkcknyuyvcwcdeskrmz.supabase.co (was paused; un-paused Session 48)                                                                                                                |
| Supabase Storage        | ✅ Live          | `company-logos` public, `project-files` private                                                                                                                                    |
| Vercel deployment       | ✅ Live          | https://frame-focus-eight.vercel.app (auto-deploy from main)                                                                                                                       |
| GitHub Actions CI       | ✅ Configured    | Lint + type-check on push to main/dev                                                                                                                                              |
| Stripe                  | ✅ Live          | Test mode. 3 products + webhook + Customer Portal configured                                                                                                                       |
| Supabase CLI            | ✅ Installed     | Linked to jwkcknyuyvcwcdeskrmz. Migration history in sync (re-verified Session 48). Re-link after Codespace rebuild.                                                               |
| QuickBooks Online       | ⚪ Not connected | Strategy in CLAUDE_MODULES.md. Build during Modules 6 & 7                                                                                                                          |
| OpenAI API              | ✅ Configured    | Key in `.env.local` and Vercel. Ready for Module 3                                                                                                                                 |
| Claude Code             | ✅ Installed     | CLI in Codespace terminal. Reinstall after each Codespace rebuild (`npm install -g @anthropic-ai/claude-code`).                                                                    |
| Claude Code MCP servers | ✅ Connected     | Context7 + Serena connected (project-scoped `.mcp.json`); Serena needs `uv` after each Codespace rebuild. Supabase MCP unused — CLI handles DB. See "Claude Code MCP setup" below. |

## Claude Code MCP setup

**Decision (2026-05-15), installed + connected Session 48:** Serena + Context7 are standard MCP servers for Claude Code. Triggers in CLAUDE.md → "Claude Code MCP Servers." Project-scoped via `--scope project` → config lives in `.mcp.json` (in git, survives Codespace rebuilds).

**Prereq after each Codespace rebuild** (`.mcp.json` itself survives in git, but `uv` does not):

```bash
# Reinstall uv (not in default Codespaces image; Serena won't connect without it)
curl -LsSf https://astral.sh/uv/install.sh | sh
```

**Original install (already done — only needed if `.mcp.json` is ever lost):**

```bash
# Serena
claude mcp add --scope project serena -- \
  uvx --from git+https://github.com/oraios/serena serena-mcp-server \
  --context ide-assistant --project "$(pwd)"

# Context7
claude mcp add --scope project context7 -- npx -y @upstash/context7-mcp@latest

# Confirm
claude mcp list
```

**Context7 API key (optional, higher rate limits):** sign up at context7.com/dashboard, store as Codespace secret, verify env-var pass-through syntax against Context7 docs before re-adding.

---

## Database State

### Tables (in production Supabase)

| Table               | Rows      | RLS                | Notes                                                                                                                                                                                                                                                                                                                                         |
| ------------------- | --------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `companies`         | Multiple  | ✅ Enabled         | `slug` (NOT NULL, auto-generated), `stripe_customer_id`, address/phone/website/trade_type/license_number/logo_url, `ai_tagging_enabled` (boolean, default false — paid add-on flag). 4C ALTER added estimate settings (markups, default terms, estimate-number prefix, tax). Legacy `subscription_tier`/`subscription_status` columns unused. |
| `profiles`          | Multiple  | ✅ Enabled         |
| `platform_admins`   | 0         | ✅ Enabled         | No admins seeded yet                                                                                                                                                                                                                                                                                                                          |
| `invitations`       | Test rows | ✅ Enabled         |
| `subscriptions`     | Multiple  | ✅ Enabled         |
| `trial_emails`      | Multiple  | ❌ No RLS          | Tracks emails that have used a trial. Only accessed by SECURITY DEFINER trigger                                                                                                                                                                                                                                                               |
| `contacts`          | Test rows | ✅ Enabled         | Address columns (`address_line1`/`address_line2`/`city`/`state`/`zip`) dropped in Migration 028 — addresses now live in `contact_addresses`.                                                                                                                                                                                                  |
| `subcontractors`    | Test rows | ✅ Enabled         |
| `files`             | 0         | ✅ Enabled         |
| `auth.users`        | Multiple  | (Supabase managed) |
| `tag_options`       | 66+ rows  | ✅ Enabled         |
| `ai_tag_logs`       | 0         | ✅ Enabled         |
| `contact_addresses` | Test rows | ✅ Enabled         | Per-contact addresses (label, line1/2, city, state, zip, is_primary). Partial unique index ensures one active primary per contact. Standard triggers wired. Migration 028.                                                                                                                                                                    |
| `cost_catalog`      | Test rows | ✅ Enabled         | Per-company cost item catalog (4B). Column defaults + standard triggers. ⚠️ Tech debt #78: `set_cost_catalog_updated_by()` omits SECURITY DEFINER.                                                                                                                                                                                            |
| `estimates`         | Test rows | ✅ Enabled         | 4C header table. `next_estimate_number()` row-locking numbering fn (per-company EST-NNN). `project_id` nullable UUID, **no FK until Module 5**. Frozen-when-Sent enforced in service + RLS. PM sees own only. `set_winning_bid()` RPC.                                                                                                        |
| `estimate_*` (6)    | Test rows | ✅ Enabled         | 4C children: `estimate_categories`, `estimate_subcategories`, `estimate_line_items`, `estimate_line_materials`, `estimate_sub_bids`, `estimate_files`. Child RLS = company scope + `EXISTS(parent visible)`. Partial unique index allows one winning sub-bid per line item; sub-bid FK `ON DELETE CASCADE` on `line_item_id`.                 |

### Storage Buckets

| Bucket          | Public         | Notes                                                                                                              |
| --------------- | -------------- | ------------------------------------------------------------------------------------------------------------------ |
| `company-logos` | ✅ Public read | Folder: `{company_id}/logo.{ext}`. RLS: members upload/update; owner/admin delete                                  |
| `project-files` | ❌ Private     | Folder: `{company_id}/{project_id}/{uuid}-{filename}`. 4 RLS policies on storage.objects. Inline subquery pattern. |

### Helpers, triggers, RLS policies, and indexes are documented per-migration in supabase/migrations/

### Migrations

## All 32 migration files live in `supabase/migrations/` with 14-digit timestamp format. `npx supabase migration list` shows all 32 in sync (Local + Remote; re-verified Session 48). Latest two: `20260611002451` (cost_catalog, 4B) and `20260611102749` (estimates module, 4C) — both applied to prod. Migration 006 was never created — intentional gap in the historical ordinal numbering. Source of truth is the file list on disk.

## Codebase State

### apps/web (Next.js)

```
apps/web/ — annotated files only

app/api/files/auto-tag/route.ts          Thin route, delegates to ai-tagging service (Session 31)
app/auth/callback/route.ts               Honors ?next= param (Session 23)
app/dashboard/billing/add-ons-section.tsx  ai_tagging_enabled toggle (Session 32)
app/dashboard/settings/tags/             Per-company tag catalog UI (Session 30)
app/dashboard/team/team-page-client.tsx  Row-click to detail page (Session 39). ⚠️ Local ROLE_LABELS (#18)
app/dashboard/team/invite/invite-form.tsx  ⚠️ Local INVITABLE_ROLES (#19)
app/dashboard/team/[id]/page.tsx         Server-rendered edit page; Owner-self renders TransferForm (Session 40), Admin-self shows amber notice
app/dashboard/team/[id]/edit-form.tsx    Client form — edit/delete/reset for team member (Session 39)
app/dashboard/team/[id]/transfer-form.tsx  Client form — ownership transfer for Owner-self only (Session 40, #66)
app/dashboard/team/[id]/actions.ts       Server actions for #14–#17 + transferOwnershipAction (Session 40)
app/dashboard/projects/[id]/files/       Module 3 file UI: list, upload, markup, trash, ai-tag editor
app/dashboard/projects/[id]/files/markup-test/page.tsx  ⚪ Throwaway (#50)
app/dashboard/catalog/                   4B cost-catalog UI — page, list, form, labels, [id] edit, new (Session 48)

lib/services/ai-tagging.ts               Reference impl for all future AI features (Session 31)
lib/services/add-ons.ts / -client.ts     Add-on flag reads/writes — separate from company.ts (Session 32)
lib/services/team.ts                     Team detail + getCompanyAdmins() for ownership transfer (Session 40, #66)
lib/supabase-admin.ts                    Shared getSupabaseAdmin(), used by Stripe webhook + team actions (Session 37, #68)
lib/openai.ts                            Lazy getOpenAI()
lib/stripe.ts                            Lazy getStripe()
lib/services/contact-addresses.ts        Server — getPrimaryAddress() with .maybeSingle() (Session 44, 4A)
lib/services/contact-addresses-client.ts Client — createAddress() + updatePrimaryAddress() upsert (Session 44, 4A)
lib/services/cost-catalog-client.ts      4B catalog CRUD + search/filter (Session 48)
lib/services/estimates-client.ts         4C estimate CRUD; frozen-when-Sent enforced in service layer (Session 48)
lib/services/estimate-items-client.ts    4C categories / subcategories / line items / materials / sub-bids (Session 48)
app/dashboard/contacts/contact-form.tsx  Refactored for two-step submit (create) / two-call save (edit); accepts existingAddress prop; address optional per Step 14 decision (Session 44, 4A)
```

### packages/shared

```
packages/shared/ — annotated files only

components/MarkupViewer.tsx              Shared SVG viewer, portable to React Native (Session 26)
types/markup.ts                          Shape schema + createEmptyMarkup (Session 26)
types/database.ts                        Auto-generated, never hand-edit. Run `npm run db:types` after migrations.
validation/contact-address.ts            Zod schema — contactAddressSchema, snake_case to match service inputs (Session 44, 4A)
validation/cost-catalog.ts               Zod schema — 4B (Session 48)
validation/estimate.ts                   Zod schema — 4C estimates, mirrors CHECK constraints (Session 48)
validation/estimate-items.ts             Zod schema — 4C child tables, mirrors CHECK constraints (Session 48)
utils/estimate-totals.ts                 Shared estimate totals math, pure functions used by 4C services (Session 48)
```

### apps/mobile (Expo)

Placeholder. Phase 2 work.

### docs/

```
docs/
├── roadmap/                                ✅ All roadmap docx/xlsx
├── specs/                                  4A–4D specs (4D-spec.md covers 4M + 4D + 4K + additive 4C migration)
└── sessions/                               ✅ context1.md through context48.md
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
- Bishop Contracting cost catalog test items (`2x6 Joist`, `Romex 12/2`, `Drywall Sheet`; soft-deleted `2x4 Stud`) — intentionally kept (Session 48).
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
3. **E-signature provider (Module 4F)** — DocuSign vs. BoldSign. Decide at 4F build based on cost and feature needs.
4. **Catalog price refresh on template clone (Module 4K)** — When "New estimate from existing" copies materials, snapshot from source estimate or refresh from current cost catalog? Decide at 4K build.

---

## Open Design Questions (by module)

These are design questions surfaced during planning that need answers before the relevant module's design phase, not its build phase. Tracked here so they don't get forgotten and don't drift into tech debt.

### ### Module 3 (ongoing)

- **Photo storage at scale.** 200 GB Business cap may not be enough for high-volume commercial contractors. Decide before pricing changes or first overage complaint.

### Module 4

- **Per-line discount visibility on proposal.** Show original price next to discounted, or just show net? Pure render decision, decide at 4E build.
- **Allowance UX in builder.** When a material row's unit is set to `'allowance'`, what happens to the quantity field — hide it, grey it out, or leave it editable but ignored? Decide at 4D build.

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

## ## Module 5 follow-up (must not be forgotten)

When Module 5 builds the `projects` table:

1. Add FK: `ALTER TABLE files ADD CONSTRAINT files_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id);`
2. Add FK: `ALTER TABLE estimates ADD CONSTRAINT estimates_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id);` (for accepted-estimate-to-project conversion).
3. `projects` table must include `contact_id UUID NOT NULL REFERENCES contacts(id)` — one client, many projects, each with its own address.
4. Build the estimate-to-project conversion logic in Module 5 (Module 4 provides the data and FK, Module 5 owns the conversion).

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
5. State goal for the session — next Module 4 build target is **4D (Estimate Builder UI)**, spec in `docs/specs/4D-spec.md`; OR open Pre-Module 9 Decision Gate, OR polish work
6. Switch to Claude Code in the terminal once a plan is agreed
7. Return to Claude Chat at end of session to generate next context file and update `STATE.md`
