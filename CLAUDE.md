# CLAUDE.md — FrameFocus Development Guide

> **Last updated:** April 9, 2026 (Session 8 — Housekeeping, repo restructure, generated types decision)
> **Purpose:** This file is the single source of truth for all development conversations. Read this before every session.

---

## Project Overview

**FrameFocus** is a subscription-based construction management SaaS platform for residential and commercial contractors. It covers the full business lifecycle: lead capture → estimating → project management → field operations → job finances → inventory & tools → client experience → business intelligence.

**Owner:** Josh Bishop (jsbishop14@gmail.com)
**Repo:** github.com/IronFrame414/FrameFocus (private)
**Live URL:** https://frame-focus-eight.vercel.app
**Status:** Module 1 complete. Module 2 complete. Ready for Module 3. **Platform now has 11 modules** (Inventory & Tools added as Module 8 during Session 6 planning).

> **See also:** [`CLAUDE_MODULES.md`](CLAUDE_MODULES.md) — Detailed module designs (Modules 3, 6, 8, 9), QuickBooks integration strategy, and change order workflow.

---

## Technology Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Web Frontend | Next.js 14 + React + TypeScript + Tailwind CSS + shadcn/ui | Office users (estimators, PMs, owners) |
| Mobile Frontend | React Native + Expo | Field crew (techs, foremen) |
| Shared Logic | TypeScript packages in monorepo | Types, validation, business logic shared across web + mobile |
| Backend / DB | Supabase (PostgreSQL + Auth + Storage + Realtime + Edge Functions) | Multi-tenant with RLS |
| AI | OpenAI API (GPT-4o vision + text) + Supabase pgvector | Estimating, photo auto-tagging, reporting, summaries, marketing |
| Payments | Stripe Billing + Stripe Connect | Subscriptions + contractor-to-client payments |
| Accounting | QuickBooks Online API (OAuth 2.0) | Sync only — FrameFocus runs operations, QB runs the books |
| Web Hosting | Vercel | Auto-deploy from main branch |
| Mobile Builds | Expo EAS | Cloud iOS/Android builds + OTA updates |
| CI/CD | GitHub Actions | Lint, test, build verification |
| Monorepo | Turborepo | Multi-package management |
| Email | Resend | Transactional emails |
| E-Signatures | DocuSign API or BoldSign | Proposals, change orders, lien releases |
| Doc Generation | React-PDF or Puppeteer | PDF estimates, invoices, reports |

**Language:** TypeScript everywhere — web, mobile, backend, shared.

---

## Monorepo Structure

```
framefocus/
├── apps/
│   ├── web/                  # Next.js 14 web application
│   │   ├── app/              # App router pages and layouts
│   │   │   ├── dashboard/
│   │   │   │   ├── billing/       # Billing pages (Owner only)
│   │   │   │   ├── contacts/      # Contacts CRUD (leads & clients)
│   │   │   │   ├── settings/      # Company settings
│   │   │   │   ├── subcontractors/ # Subs & vendors CRUD
│   │   │   │   └── team/          # Team management & invites
│   │   │   ├── auth/              # Auth callback
│   │   │   └── invite/            # Invite acceptance
│   │   ├── components/       # Web-specific UI components
│   │   ├── lib/              # Web-specific utilities
│   │   │   ├── services/     # Data access layer (server + client pairs)
│   │   │   ├── stripe.ts     # Stripe client (lazy init via getStripe())
│   │   │   ├── supabase-browser.ts  # Client-side Supabase
│   │   │   └── supabase-server.ts   # Server-side Supabase
│   │   └── public/           # Static assets
│   └── mobile/               # Expo / React Native app (placeholder)
├── packages/
│   ├── shared/               # Shared across web + mobile
│   │   ├── types/            # TypeScript type definitions (roles.ts)
│   │   ├── validation/       # Zod schemas
│   │   ├── constants/        # Role hierarchy, labels, descriptions (roles.ts)
│   │   └── utils/            # Pure business logic functions
│   ├── supabase/             # Supabase-specific package
│   │   ├── migrations/       # SQL migration files (001–012)
│   │   ├── functions/        # Edge Functions
│   │   ├── seed/             # Seed data
│   │   └── types/            # Auto-generated database types
│   └── ui/                   # Shared UI primitives (placeholder)
├── docs/                     # Reference documentation (added Session 8)
│   ├── roadmap/              # Platform roadmap docs (.docx, .xlsx)
│   │   ├── FrameFocus_Development_Roadmap.docx
│   │   ├── FrameFocus_Platform_Roadmap.docx
│   │   ├── FrameFocus_Platform_Roadmap.xlsx
│   │   └── FrameFocus_Quick_Reference.docx
│   └── sessions/             # Session-by-session context files
│       ├── context1.md       # Session 1: Strategic planning
│       ├── context2.md       # Session 2: First coding session
│       ├── context3.md       # Session 3: Module 1E (Invites + Admin)
│       ├── context4.md       # Session 4: Module 1F (Stripe billing)
│       ├── context5.md       # Session 5: Audit fixes + full system test
│       ├── context6.md       # Session 6: Company settings + Module 2
│       ├── context7.md       # Session 7: Module 3 planning
│       ├── context8.md       # Session 8: Admin invite bug fix (Migration 015)
│       └── context9.md       # Session 9: Housekeeping + Option C decision
├── scripts/                  # Dev utility scripts
├── STATE.md                  # Live repo state dashboard (added Session 8)
├── .devcontainer/            # GitHub Codespaces configuration
├── turbo.json
├── package.json
├── CLAUDE.md                 # This file
└── README.md
```

---

## Development Environment

**Primary:** GitHub Codespaces (browser-based VS Code)
**No local dev environment required.** Everything runs in the cloud.

The `.devcontainer/devcontainer.json` pre-configures:
- Node.js 20 LTS
- Required VS Code extensions: ESLint, Prettier, Tailwind IntelliSense, Prisma (for Supabase types)
- Automatic `npm install` on Codespace creation
- Port forwarding for Next.js dev server (3000) and Expo (8081)

**Supabase:** Managed via Supabase Dashboard (app.supabase.com) + CLI in Codespaces for migrations.
**Vercel:** Connected to repo, auto-deploys `apps/web` on push to `main`.
**Expo EAS:** Cloud builds triggered from Codespaces terminal.

### Known Codespaces Gotchas

- `.env.local` is gitignored and does NOT persist across Codespace rebuilds. Recreate from Vercel env vars if rebuilt.
- Shell heredocs (`cat << 'EOF'`) eat `<a` tags from JSX. Use Node.js `fs.writeFileSync()` or create files directly in the Codespace editor instead.
- Long file replacements via GitHub's web editor frequently truncate. Use a two-part paste strategy for long files.
- The Supabase anon key uses `sb_publishable_...` format.
- **RLS inside SECURITY DEFINER triggers:** `SET row_security TO 'off'` at the function level is silently ignored in Postgres unless the executing role is a superuser or table owner. Inside a `SECURITY DEFINER` trigger on `auth.users`, it does NOT bypass RLS. The working pattern is to put the RLS-protected query inside a separate `SECURITY DEFINER` **SQL** function (not plpgsql) and call that from the trigger. See `get_invitation_for_signup()` in Migration 015 for the reference implementation.
- **Context files describe intent, git describes state.** Never trust `context-N.md` files for "is X committed?" — always run `git log --oneline -15` at the start of a session to ground truth the repo. Session 8 wasted ~30 minutes chasing phantom work because context8.md said migrations were uncommitted when git log showed they were already in.
- **VS Code browser drag-and-drop targets are finicky.** Drop zones are ambiguous — files can end up at filesystem root (`/`) instead of the intended folder. If uploading fails with "Insufficient permissions" errors referencing `\filename.md`, the drop missed the target folder. Right-click the destination folder → "Upload..." is more reliable when available.

---

## Database Patterns

**RLS-bypassing helper functions for triggers.** When a trigger on `auth.users` (or any table) needs to query an RLS-protected table, the trigger runs in a context where `get_my_company_id()` and similar helpers return NULL — meaning RLS filters out every row. The working pattern:

1. Create a `SECURITY DEFINER` **SQL** function (not plpgsql) that does the query
2. Call that function from the trigger

SQL functions with `SECURITY DEFINER` reliably bypass RLS in this context. See `get_invitation_for_signup()` (Migration 015) and `get_invitation_by_token()` (used by the invite acceptance page) for working examples.

**Why SQL and not plpgsql:** plpgsql `SECURITY DEFINER` functions still hit RLS in some trigger contexts. SQL `SECURITY DEFINER` functions bypass reliably. When in doubt, use SQL.

---

## Generated Types Workflow

**Single source of truth:** `packages/shared/types/database.ts` is auto-generated from the live Supabase schema. All service files import from this file — never hand-write database type shapes.

**Regenerate after every migration that adds, removes, or renames a column or table:**
```bash
npm run db:types
```
Then run `npm run type-check` to surface any callers that need updating. Commit the updated `database.ts` alongside the migration.

**Two patterns for deriving service types:**

**Pattern 1 — `Pick<>` (use when the query selects specific columns):**
```typescript
// apps/web/lib/services/company.ts
import type { Database } from '@framefocus/shared/types/database';

export type CompanyData = Pick<
  Database['public']['Tables']['companies']['Row'],
  'id' | 'name' | 'address_line1' | 'logo_url' // ... only selected columns
>;
```
Use `Pick<>` when the query uses `select('col1, col2, ...')`. The type is honest about what the query actually returns.

**Pattern 2 — `Omit<Row> + intersection` (use when `select('*')` AND the table has CHECK-constrained columns):**
```typescript
// apps/web/lib/services/contacts.ts
import type { Database } from '@framefocus/shared/types/database';

type ContactRow = Database['public']['Tables']['contacts']['Row'];
export type Contact = Omit<ContactRow, 'contact_type' | 'status'> & {
  contact_type: 'lead' | 'client';
  status: 'active' | 'inactive' | 'archived';
};
```
Use this when `select('*')` returns the full Row but the generated types use `string` for CHECK-constrained columns. The intersection re-narrows those fields to string literal unions so discriminated checks (`if (contact.contact_type === 'lead')`) remain type-safe.

**Rule: always preserve string literal unions on CHECK-constrained columns.** The Supabase type generator cannot see CHECK constraints, so it emits `string` for columns like `contact_type`, `status`, `sub_type`, `role`. Restore them via intersection rather than using the loose `string`. Current examples: `contact_type`/`status` in `contacts.ts`, `sub_type`/`status` in `subcontractors.ts`.

**Client files re-export, never redefine:**
```typescript
// apps/web/lib/services/company-client.ts
import type { CompanyData } from '@/lib/services/company';
export type { CompanyData }; // re-export preserves public API
```
Client-side service files (`*-client.ts`) must never redefine types already in the server service file. Use `import type` (not `import`) to avoid pulling server-only code into client bundles.

**Refactored files (Phase 4, Session 9) — use as reference implementations:**
- `Pick<>` pattern: `apps/web/lib/services/company.ts`
- `Omit + intersection` pattern: `apps/web/lib/services/contacts.ts`, `apps/web/lib/services/subcontractors.ts`
- `Pick<>` with multiple tables: `apps/web/lib/services/team.ts`
- Re-export pattern: `apps/web/lib/services/company-client.ts`

---

## Session Workflow

Every session should follow this pattern to avoid drift between context and reality:

**At session start:**
1. Run the ground-truth snapshot (`scripts/session-start.sh` once created, or run the commands manually) and paste the output
2. State a definition-of-done for the session (3–5 specific, verifiable outcomes)
3. Review `STATE.md` for current status and open items

**During the session:**
- Commit often, even for WIP (prefix messages with `WIP:`)
- Use `// TODO(session-N):` comments for anything deferred to a later session
- Don't chase rabbit holes — log new tech debt to `STATE.md` and keep moving

**At session end:**
1. Update `STATE.md` with new state and any new tech debt discovered
2. Create `docs/sessions/contextN.md` with decisions made, outstanding items, and next session plan
3. Commit and push everything, including documentation files
4. Verify next session can be resumed by reading only `STATE.md` + the latest context file

**Chat vs. Claude Code:**
- **Claude Chat:** Strategy, architecture decisions, product planning, document generation (roadmaps, context files, CLAUDE.md updates), product research with web search, explaining concepts
- **Claude Code:** Multi-file edits, investigation (`grep`, file reads), refactors across the codebase, running migrations and verifying results, debugging builds, anything that involves touching code in the repo
- **Hybrid:** Plan in Chat → execute in Claude Code → review in Chat → close session in Chat

---

## Platform Modules (11 total)

Build order follows strict dependency chain. Each module depends on the ones above it. **Module 8 (Inventory & Tools) was added during Session 6 planning, which bumped the previous Modules 8, 9, 10 to 9, 10, 11.**

### Phase 1: Foundation Layer (Months 1–3)

| # | Module | Status | Description |
|---|--------|--------|-------------|
| 1 | Settings, Admin & Billing | ✅ COMPLETE | Multi-tenant auth, roles/permissions (owner + admin), Stripe subscriptions (3 tiers), company settings with logo upload, trial system with abuse prevention, invite flow, team management |
| 2 | Contacts & CRM | ✅ COMPLETE | Two-table design: `contacts` (leads & clients) + `subcontractors` (subs & vendors). Full CRUD with search, filtering, star ratings, preferred flags, EIN, default hourly rate, standard markup %, insurance tracking |
| 3 | Document & File Management | NOT STARTED | Supabase Storage, file tagging, project folders, upload from web + mobile camera, photo markup & annotation (desktop + mobile), AI auto-tagging of photos via GPT-4o vision, receipt attachments linked to Module 8 inventory items |

### Phase 2: Core Business Modules (Months 3–8)

| # | Module | Status | Description |
|---|--------|--------|-------------|
| 4 | Sales & Estimating | NOT STARTED | Estimate builder, cost catalog, AI line-item suggestions, proposals, e-signatures, pipeline. When a vendor is selected for a material line item, auto-populate markup from their default_markup_percent (override per line item). Estimates link to contacts (client/lead). Sub bids link to subcontractors. |
| 5 | Project Management | NOT STARTED | Phases, milestones, Kanban tasks, scheduling, templates, change order initiation |
| 6 | Team & Field Operations | NOT STARTED | Mobile-first: clock in/out with GPS, **time categorization** (regular/OT/travel/drive/shop), **break tracking**, **overtime calculation**, **mileage tracking**, **hours allocated to tasks/change orders/T&M jobs**, daily logs with **safety hazards section** (checkbox + text), **safety incident reporting** (separate formal workflow with PDF), photo capture with markup (shared component from Module 3), punch lists, **daily huddle/crew briefing** (optional), **material delivery tracking** (checked in by anyone assigned to project, contents via receipt photo or typed list), offline mode, voice-to-text daily logs. Approved timesheets sync to QB Time/Payroll. |
| 7 | Job Finances | NOT STARTED | Budget vs. actual, cost codes, change orders, invoicing (including T&M invoicing pulling hours from Module 6 and materials from Module 8), sub pay apps, retainage. Track actual vendor cost vs. marked-up client price for profit analysis. Sub pay apps reference subcontractors table (EIN for 1099s, default_hourly_rate for labor estimates). QB sync for invoices, bills, and payments. |
| 8 | **Inventory & Tools (NEW)** | NOT STARTED | **Inventory:** categorized items (lumber, fasteners, drywall, electrical, plumbing, finishes, consumables, other) with unit of measure, default vendor, photo, receipt attachment, flag-for-return with notes. **Tools:** categorized durables (power tools, hand tools, ladders, safety equipment, measurement, heavy equipment, other) with brand, model, serial, photo, notes for specs (blade size, voltage, capacity). Tool location required (shop/job site/truck/custom). Tool-to-person assignment optional. Check-in/check-out log tracks every location or assignment change. Bulk assignment of multiple tools at once. All roles (Owner through Crew) can check tools in/out. |

### Phase 3: Differentiator Layer (Months 8–10)

| # | Module | Status | Description |
|---|--------|--------|-------------|
| 9 | Customer Experience Portal | NOT STARTED | Client login, project timeline, AI weekly summaries (owner-approved), **material selections workflow** (separate pages by category, grouped by room, finalized list auto-logs to decision log), **decision log** (timestamped record of every significant client decision, exportable as PDF), **photo gallery with client favorites** (clients heart photos, favorites feed Module 11 marketing), **pre-construction checklist** (permits, insurance, deposit, HOA, selections, start date), selection deadlines with reminders, change order e-signature, invoice viewing + payment via Stripe Connect, PM messaging thread |
| 10 | Reporting & Analytics | NOT STARTED | Profitability, estimating accuracy, pipeline metrics, AI natural language queries, anomaly detection, custom dashboards. Vendor cost vs. markup analysis for profit tracking. (Crew productivity, estimate accuracy by type, sub scorecards, cash flow forecast all deferred to post-launch.) |

### Phase 4: Premium Add-On (Months 10–12)

| # | Module | Status | Description |
|---|--------|--------|-------------|
| 11 | AI Marketing & Social | NOT STARTED | Auto social posts from projects (pulling from client-favorited photos in Module 9), Facebook/Google Business integration, review requests, content calendar |

### Cross-Cutting Systems (built incrementally)

- **AI Layer** — Woven into modules 3, 4, 5, 6 (post-launch), 7, 9, 10, 11. Uses OpenAI GPT-4o (text + vision) + pgvector. Core principle: AI drafts, humans approve. First AI feature: photo auto-tagging in Module 3. Exception to the approval rule: photo auto-tags apply instantly since they are internal organization only.
- **Workflow Engine** — Event-driven automation via Supabase Webhooks + Edge Functions. Built during Phase 2, extended in Phase 3.
- **QuickBooks Integration** — Cross-cutting sync layer built during Modules 6 and 7. See dedicated section below.

---

## Database Tables (Current)

### Module 1 Tables
- `companies` — tenant table with name, slug, address, phone, website, trade_type, license_number, logo_url, stripe_customer_id
- `profiles` — company users with user_id, company_id, role (owner/admin/project_manager/foreman/crew_member/client), first_name, last_name, email
- `platform_admins` — FrameFocus internal admin users (no company_id)
- `subscriptions` — Stripe subscription tracking per company (plan_tier, status, seat_limit, trial dates)
- `invitations` — token-based invite system with role, status, expiry
- `trial_emails` — prevents trial abuse by tracking emails that have used a trial

### Module 2 Tables
- `contacts` — leads and clients. Fields: contact_type (lead/client), status, first_name, last_name, company_name, email, phone, mobile, address fields, source, notes, tags[]
- `subcontractors` — subs and vendors. Fields: sub_type (subcontractor/vendor), status, company_name, contact_first_name, contact_last_name, email, phone, mobile, address fields, trade_type, license_number, insurance_expiry, rating (1-5), rating_notes, ein, default_hourly_rate, default_markup_percent, preferred, notes, tags[]

### Module 3 Tables (planned)
- `files` — all uploaded documents and photos. Fields: id, company_id, project_id (nullable), category, file_name, file_path, file_size, mime_type, tags[], ai_tags[], version, supersedes_id, uploaded_by, markup_data (JSONB), is_deleted, created_at, updated_at

### Module 6 Tables (planned)
- `time_entries` — with categorization (regular/ot/travel/drive/shop), GPS, task_id / change_order_id / tm_line_id allocation, approval tracking
- `daily_logs` — including hazards_present bool + hazard_notes
- `safety_incidents` — formal incident reports with OSHA fields, PDF reference
- `mileage_entries` — per user per project
- `material_deliveries` — with contents_file_id (receipt photo) OR contents_text (typed list), discrepancy flag
- `crew_briefings` — daily huddle records

### Module 8 Tables (planned — NEW)
- `inventory_items` — catalog with category, unit, default_vendor_id, last_cost, photo, notes
- `inventory_transactions` — adds, uses, assignments, returns-flagged with notes
- `tools` — durables with brand, model, serial, current location (required), assigned person (optional), notes, photo
- `tool_history` — every location or assignment change logged

### Module 9 Tables (planned)
- `material_selection_categories` — per project, with deadlines
- `material_selection_options` — per category
- `material_selections` — chosen options, finalization tracking, room grouping
- `decision_log` — append-only timestamped client decisions
- `photo_favorites` — client-hearted photos
- `preconstruction_checklist` — per project

### Storage Buckets
- `company-logos` — public bucket for company logo uploads, organized by company_id folders
- `project-files` — (Module 3, planned) private bucket for all project documents, photos, and files. Organized by company_id/project_id/category/.

---

## Database Conventions

**Multi-tenancy:** Every table has a `company_id` column. All queries are filtered by company via RLS policies.

**Row-Level Security:** Enabled on ALL tables. No exceptions. Every policy uses a `get_my_company_id()` helper function that reads company_id from the user's profile.

**Storage RLS policies: use inline subqueries, not helper functions.** `get_my_company_id()` works correctly in RLS policies on regular tables in the `public` schema. It does NOT work in `storage.objects` policies — in that context the helper silently returns NULL, which makes the policy match nothing and causes uploads/reads to fail with permission errors that appear unrelated to the policy logic.

Use an inline subquery against `profiles` instead:
```sql
(storage.foldername(name))[1]::uuid = (SELECT company_id FROM profiles WHERE id = auth.uid())
```

`(storage.foldername(name))[1]` extracts the first folder segment of the object path, which by convention is the `company_id` (e.g., `{company_id}/project-id/filename`). Reference implementations: migration 013 (company-logos bucket) and migration 017 (project-files bucket, Session 11) both use this pattern.

**Naming conventions:**
- Tables: `snake_case`, plural (e.g., `contacts`, `estimates`, `line_items`)
- Columns: `snake_case` (e.g., `company_id`, `created_at`, `updated_by`)
- Foreign keys: `{referenced_table_singular}_id` (e.g., `contact_id`, `project_id`)
- Indexes: `idx_{table}_{column}` (e.g., `idx_contacts_company_id`)
- RLS policies: `{table}_{action}_{role}` (e.g., `contacts_select_authenticated`)

**Standard columns on every table:**
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
company_id      UUID NOT NULL REFERENCES companies(id)
created_at      TIMESTAMPTZ DEFAULT now()
updated_at      TIMESTAMPTZ DEFAULT now()
created_by      UUID REFERENCES auth.users(id)
updated_by      UUID REFERENCES auth.users(id)
is_deleted      BOOLEAN DEFAULT false        -- soft delete, never hard delete
deleted_at      TIMESTAMPTZ
```

**Trash-bin pattern.** Soft deletes only. Never hard delete records.

- RLS policies do not filter on `is_deleted`. Filtering is enforced in the service layer, not in RLS. This is deliberate: a restore-from-trash flow must be able to read soft-deleted rows without requiring a separate RLS policy to expose them.
- `get{Entity}s()` (the list function) filters `is_deleted = false` by default so deleted rows never appear in normal listings.
- `get{Entity}(id)` (single-row fetch by id) does **not** filter `is_deleted`. It must return soft-deleted rows so a restore flow can fetch a deleted record by id before un-deleting it.
- A separate `getTrash()` (or `listDeleted()`) function filters `is_deleted = true` to power the trash UI.

Reference implementation: `apps/web/lib/services/files.ts` (Module 3, Session 13) is the canonical example of all three functions.

---

## Service Layer Pattern

Server and client Supabase clients must be in separate files to avoid Next.js build errors (`next/headers` cannot be imported in client components).

**Pattern for each data entity:**
- `lib/services/{entity}.ts` — Server-side functions (imports from `@/lib/supabase-server`). Used in server components and page.tsx files. Contains read operations (getAll, getById).
- `lib/services/{entity}-client.ts` — Client-side functions (imports from `@/lib/supabase-browser`). Used in `'use client'` form components. Contains write operations (create, update, delete).
- Client components must use `import type { ... }` when importing interfaces from server service files.

**Current service files:**
- `company.ts` / `company-client.ts` — Company settings CRUD + logo upload
- `contacts.ts` / `contacts-client.ts` — Contacts (leads & clients) CRUD
- `subcontractors.ts` / `subcontractors-client.ts` — Subs & vendors CRUD
- `billing.ts` — Subscription data (server only)
- `seats.ts` — Seat usage counting (server only)
- `team.ts` — Team member and invitation management

**Lazy initialization:** Stripe client (`getStripe()`) and Supabase admin client (`getSupabaseAdmin()`) use lazy init to prevent build-time crashes. All API routes must use these.

---

## Code Conventions

### TypeScript
- Strict mode enabled (`"strict": true` in tsconfig)
- No `any` types — use `unknown` and narrow
- Interfaces for data shapes, types for unions/aliases
- Zod schemas in `packages/shared/validation/` for all form and API validation
- Use `import type { ... }` when importing types across server/client boundaries

### React (Web — Next.js)
- App Router (not Pages Router)
- Server Components by default; `"use client"` only when state/interactivity needed
- shadcn/ui components as the base; customize via Tailwind
- File naming: `kebab-case.tsx` for components, `kebab-case.ts` for utilities
- Colocate component-specific files: `components/estimate-builder/estimate-builder.tsx`

### React Native (Mobile — Expo)
- Expo Router for navigation
- Expo SDK managed workflow (no bare workflow)
- NativeWind (Tailwind for React Native) for styling consistency with web
- Offline-first for field operations using Expo SQLite with sync queue

### API / Data Layer
- Supabase client initialized once per app in a shared provider
- All database calls go through service modules: `services/contacts.ts`, `services/estimates.ts`, etc.
- Never call Supabase directly from components — always through a service function
- Edge Functions for server-side logic that can't run on client (webhook handlers, AI calls, PDF generation)

### Git Workflow
- `main` branch is production (auto-deploys to Vercel)
- `dev` branch for integration
- Feature branches: `feature/{module}-{description}` (e.g., `feature/contacts-csv-import`)
- Commit messages: `[Module] Description` (e.g., `[Contacts] Add CSV import with field mapping`)

---

## User & Role Architecture

There are two completely separate layers of users. They use different auth systems and should never be confused.

### Layer 1: Platform Admins (FrameFocus internal team)

These users manage the FrameFocus platform itself. They are NOT tied to any company tenant.

| Role | Description |
|------|-------------|
| Platform Admin | Full access to all companies, subscriptions, support tools, platform analytics, and system configuration. Josh and any future FrameFocus team members. |

**Implementation:** Platform Admins are stored in a separate `platform_admins` table (not the company `profiles` table). They access a separate admin dashboard route (`/admin`). They do NOT have a `company_id`.

### Layer 2: Company Users (contractor customers)

Each subscribing company is an isolated tenant. Within that company, there are 6 roles with descending access levels. The Owner is always the billing contact.

| Role | DB Value | Web Access | Mobile Access | Key Permissions |
|------|----------|-----------|---------------|-----------------|
| Owner | `owner` | Full | Full | All features, billing/subscription management, user invitations, approval authority on change orders/payments/AI content, company settings, QuickBooks connection |
| Admin | `admin` | Full | Full | Everything Owner can do EXCEPT items in the owner-only list below |
| Project Manager | `project_manager` | Full (scoped to assigned projects) | Full | Create/manage estimates, manage assigned projects, assign tasks, create change orders, view job finances, manage client communication |
| Foreman | `foreman` | Limited | Full | Manage assigned field crews, daily logs, schedule crew tasks, review Crew Member submissions, punch lists, quality control |
| Crew Member | `crew_member` | Minimal | Full | Clock in/out with GPS, daily log entries, photo capture, task status updates, view assigned tasks and schedule |
| Client | `client` | Portal only | No (future phase) | View project timeline, photo gallery, approve selections, sign documents, make payments, message PM, view AI weekly summaries |

### The Admin Role Principle (authoritative)

**Admin is defined as "Owner minus money minus Admin promotion."** Anywhere in the platform where the rule for an action is not explicitly owner-only, Admin has the same access as Owner. When in doubt during implementation, Admin can do it.

**Owner-only actions (Admin is NOT allowed):**

1. **Billing and subscription management** — viewing/changing the subscription plan, updating payment methods, canceling the subscription, viewing billing history. Admin cannot see the Billing page at all.
2. **Promoting a user to the Admin role** — Admin cannot create more Admins. Only Owner can invite at the Admin level or promote an existing user to Admin.
3. **Transferring ownership** — only the current Owner can transfer ownership to another user. Admin cannot initiate ownership transfer.
4. **Connecting or disconnecting QuickBooks** — QB connection is treated as billing-adjacent because it controls financial data flow out of FrameFocus. Owner-only.
5. **Releasing final sub payments (money out the door)** — Admin can review, adjust, and approve sub pay applications, but the final "release payment" click that actually records payment and triggers the QB sync is Owner-only.
6. **Approving client-facing AI weekly summaries** — before an AI-drafted weekly project summary is shown to the client, it must be approved by the Owner specifically. Admin cannot approve these.
7. **Approving marketing content for publishing** — AI-generated social posts, review request emails, and any marketing content going out under the company name must be Owner-approved before publishing. Admin cannot approve these.
8. **Deleting the company account** — only Owner can close the company account (this is a billing-adjacent action).

**What Admin CAN do (non-exhaustive — this is the default, not the list):**
- Full access to all modules (1 through 11) except the Billing page
- Invite and remove users at all levels EXCEPT Admin (cannot invite at Admin level)
- Edit company settings (name, logo, address, trade type, etc.)
- Create, edit, and approve estimates
- Create and edit projects, tasks, phases, milestones
- Create change orders (but Owner gives final approval)
- Approve timesheets (Foreman and below)
- Review and approve sub pay applications (but Owner releases final payment)
- Manage contacts, subcontractors, vendors, inventory, and tools
- Upload, edit, and delete files
- View all project finances, budgets, and reports
- File and manage safety incident reports
- Message clients through the portal (Admin, PM, and Owner all can)
- Approve AI estimate suggestions, AI punch list proposals, AI anomaly flags, AI-drafted daily log summaries (everything except client-facing AI and marketing AI)

### Role Permissions Quick Reference (By Action)

For any action not listed in the owner-only section above, assume Admin has access. When building a new feature, if a permission decision needs to be made, default to "Owner + Admin can do it" unless there is a specific reason (financial sign-off, billing, or client-facing owner-approval) to restrict it to Owner only.

**Who can approve what (summary):**

| Approval | Owner | Admin | PM | Foreman |
|----------|-------|-------|----|---------| 
| Billing changes | ✓ | — | — | — |
| Promote to Admin | ✓ | — | — | — |
| Connect QuickBooks | ✓ | — | — | — |
| Release sub payments | ✓ | — | — | — |
| Approve AI weekly summaries | ✓ | — | — | — |
| Approve marketing content | ✓ | — | — | — |
| Approve change orders (final) | ✓ | — | — | — |
| Approve sub pay apps (review step) | ✓ | ✓ | ✓ | — |
| Approve estimates for sending | ✓ | ✓ | ✓ | — |
| Approve foreman timesheets | ✓ | ✓ | ✓ | — |
| Approve crew timesheets | ✓ | ✓ | ✓ | ✓ |
| Invite users (non-Admin) | ✓ | ✓ | — | — |
| Delete files | ✓ | ✓ | ✓ | — |
| Edit company settings | ✓ | ✓ | — | — |

---

## Subscription Tiers

User counts below refer to Company Users (Owner + Admin + PM + Foreman + Crew Member). Client portal accounts are unlimited on the Business tier.

| | Starter ($79/mo) | Professional ($149/mo) | Business ($249/mo) |
|---|---|---|---|
| Company Users | 2 | 5 | 15 |
| Additional Users | $15/user/mo | $15/user/mo | $12/user/mo |
| Storage | 10 GB | 50 GB | 200 GB |
| AI Estimates | 5/mo | 25/mo | Unlimited |
| Client Portal | — | — | ✓ (unlimited client accounts) |
| Workflow Automation | — | Core | All + custom |
| AI Marketing | — | — | Add-on $99/mo |
| QuickBooks Sync | ✓ | ✓ | ✓ |

---

## Built-In Workflow Automations

**Note on Admin role in workflows:** Admin has the same access as Owner throughout these workflows EXCEPT for (a) final payment release, (b) owner-only approval of client-facing AI content, and (c) billing/subscription actions. Admin receives all notifications that Owner receives and can take most actions on Owner's behalf for operational matters.

1. **Lien Release on Sub Completion** — Sub marks work complete → system generates lien release → e-signature request → signed release unlocks payment approval → payment recorded → QB sync
2. **Change Order Approval Chain** — PM or Admin creates CO → Owner (and Admin) notified → Owner approves (owner-only final approval) → client signs via portal → budget/schedule updated → auto-log to Decision Log → QB sync
3. **Milestone Client Notification** — Milestone complete → portal updated → client notified → invoice generated if billing milestone → Owner, Admin, and PM notified
4. **Estimate Follow-Up** — No response in 3 days → Owner and Admin reminder → optional auto follow-up to client
5. **Insurance Expiration Alert** — Sub cert within 30 days of expiry → Owner, Admin, and assigned PM notified → auto-request to sub → block from new work if expired
6. **Project Completion Closeout** — All tasks/punch done → final invoice with retainage → satisfaction survey → portfolio prompt → archive. Owner, Admin, and PM involved in closeout steps.
7. **Daily Log Auto-Report** (NEW) — End of day → compile log entries, photos, time, safety hazards → PDF → file to Module 3 → notify PM and Admin
8. **Safety Incident Report** (NEW) — Incident reported → PDF generated → filed to Module 3 → **Owner, Admin, and assigned PM notified immediately** → company incident log updated
9. **New Client Welcome Package** (NEW) — Lead → Client conversion → portal account created (Business tier) → welcome email → signed proposal auto-filed → PM and Admin notified → QB Customer sync
10. **Sub Payment Processing** (NEW) — Pay app submitted → PM or Admin reviews → PM or Admin approves pay app → **Owner releases payment (owner-only final approval)** → payment recorded → QB sync → retainage tracked
11. **Material Delivery Arrival** (NEW) — Scheduled delivery arrives → any project member checks in via mobile → receipt photo or typed list → discrepancies flagged → flow to Module 8 inventory returns → PM and Admin notified of discrepancies
12. **Material Selection Finalization** (NEW) — Client finalizes a selection category → auto-log to Decision Log → contributes to approved material list → PM and Admin notified

---

## AI Integration Rules

1. **AI drafts, humans approve.** Nothing client-facing or financially significant ships without human review.
2. **Owner-only approvals:** AI weekly client summaries, marketing content for publishing, and AI-drafted financial narratives that affect billing require **Owner** approval specifically. Admin cannot approve these.
3. **Admin-or-Owner approvals:** AI line item suggestions in estimates, AI-drafted daily log summaries, AI punch list proposals, and AI anomaly flags can be reviewed and approved by **Owner or Admin**.
4. **Exception: AI photo auto-tags apply instantly.** Auto-tagging is internal organization, not client-facing. Tags are editable by any team member who can view the file. No approval queue needed.
5. **Historical data powers suggestions.** Estimating AI uses pgvector embeddings of completed job line items.
6. **Company context included in all prompts.** Trade type, region, typical project size, approved brand voice.
7. **Approval queue for all AI outputs.** Weekly summaries, social posts, report narratives all go through a review step before anything reaches a client.

---

## Instruction Preferences

When generating code, migrations, or instructions for Josh:

- **Step-by-step, click-level guidance.** Don't assume familiarity with dev tooling.
- **Explicit file paths.** Always state exactly which file to create/edit and where.
- **Success/failure indicators.** After each step, describe what Josh should see if it worked and what to check if it didn't.
- **One thing at a time.** Don't bundle multiple changes into a single instruction block. Break them into numbered steps.
- **Paste-ready code.** Code blocks should be complete and copy-pasteable, not fragments requiring assembly.
- **Browser-based workflow.** All instructions assume GitHub Codespaces. Never reference local terminal, VS Code desktop, or local file system.
- **Avoid shell heredocs for any multi-line file content.** Known failure cases: JSX files (heredocs eat `<a` tags and cause build failures) and SQL migration files (a multi-line SQL heredoc was silently mangled on a migration in Session 12). Use Node.js fs.writeFileSync() or create files directly in the Codespace editor instead.

---

## Known Technical Debt (from Session 5 Audit)

Track these items for resolution in upcoming sessions:

| Priority | Issue | When to Fix |
|----------|-------|-------------|
| Next session | US_STATES and TRADE_TYPES duplicated in 3 form files — move to packages/shared/constants/form-options.ts | Module 3 |
| Next session | CompanyData interface duplicated in company.ts and company-client.ts — move shared interfaces to packages/shared/types/ | Module 3 |
| Module 4 | Add `converted_at` timestamp to contacts for lead-to-client conversion tracking | Module 4 |
| Module 4 | Add cursor-based pagination to list pages | Module 4 |
| Pre-beta | Add tags UI (add/remove/display) to contacts and subcontractors forms | Pre-beta |
| Pre-beta | Add loading.tsx and error.tsx to contacts and subcontractors routes | Pre-beta |
| Pre-beta | Add active page highlighting to sidebar nav | Pre-beta |
| Pre-beta | Add CSV import for contacts and subcontractors | Pre-beta |
| Pre-beta | Add insurance_carrier and insurance_policy_number to subcontractors | Module 5/6 |

**Items discovered Session 8:**

| # | Item | Priority | Discovered | Notes |
|---|------|----------|------------|-------|
| 18 | `team-page-client.tsx` has local `ROLE_LABELS` | Medium | Session 8 | Should import from `@framefocus/shared`. Resolves once Option C (generated types) lands in Session 9. |
| 19 | `invite-form.tsx` has local `INVITABLE_ROLES` | Medium | Session 8 | Should import from `@framefocus/shared`. |
| 20 | `invite-form.tsx` imports `Invitation` without `import type` | Low | Session 8 | Cross-boundary type import should use `import type` per convention. |
| 21 | `packages/shared/constants/index.ts` has role constants inline AND re-exports `./roles` | High | Session 8 | Duplication inside the shared package. The inline `COMPANY_ROLES` and `ROLE_LABELS` are **missing the `admin` role** — latent drift bug. Fix: move inline `SUBSCRIPTION_TIERS` and `MODULE_STATUS` to their own files, make `index.ts` a pure barrel. |
| 22 | `packages/shared/types/index.ts` `Company` interface missing `website` and `license_number` | Medium | Session 8 | Columns exist in DB (Migration 009) but not in the type. Will be fixed automatically by Option C generated types in Session 9. |
| 23 | Migration filename `014_handle_new_User_Bypass_rls.sql` breaks naming convention | Low | Session 8 | Rename to `014_handle_new_user_bypass_rls.sql` for consistency. Cosmetic only. |
| 24 | Supabase email confirmation was OFF (from Session 7 rate-limit workaround) | High | Session 7 | Re-enabled in Session 9. Tracked here for reference. |

### Admin Role Verification (audit from Session 6)

The Admin role was added mid-Session 2 during the Module 1E invite system build. It was designed to mean "Owner minus billing minus Admin promotion," but as the platform has grown, it is worth explicitly verifying what was actually built in Modules 1 and 2 matches the Admin Role Principle (see User & Role Architecture section). The following items should be checked against the live codebase during the next build session, and any gaps fixed before Module 3 starts:

| Area | What to verify | Status |
|------|----------------|--------|
| **Module 1: Invite flow** | Admin can invite Owner, PM, Foreman, Crew Member, Client (NOT Admin). UI should not show Admin as an invitable role when the current user is Admin. | **Verify** — was built this way but has not been re-tested since. |
| **Module 1: Team management** | Admin can remove users at all levels except Owner. Admin cannot promote another user to Admin. | **Verify** |
| **Module 1: Billing page** | Admin should get a 403 or redirect when navigating to `/dashboard/billing`. RLS + middleware check. | **Verify** — middleware enforcement added in Session 5 audit fixes; confirm it blocks Admin. |
| **Module 1: Company settings** | Admin can edit company name, logo, address, phone, website, trade type, license number. | **Verify** — should work based on RLS policies written in Session 5. |
| **Module 1: QuickBooks connection button** | Per Session 6 decision, QB connection is Owner-only. The Connect QB button on company settings should be hidden from Admin. QB build has not happened yet, so this is a note for when it does. | **Note for future** |
| **Module 2: Contacts CRUD** | Admin can create, edit, delete contacts. RLS policy `contacts_*_admin_or_above` or equivalent. | **Verify** — RLS was written for "owner or admin or PM" per Session 5 notes. |
| **Module 2: Subcontractors CRUD** | Admin can create, edit, delete subcontractors. | **Verify** — same as contacts. |
| **Module 2: Sidebar navigation** | Admin sees Contacts, Subcontractors, Team, Settings in the sidebar. Does NOT see Billing. | **Verify** — sidebar gating was built for owner/admin on Settings; confirm Billing is hidden from Admin. |
| **Seat counting** | Admin users count against the plan's seat limit (same as any other company user). Client accounts do not. | **Verify** — seat counting logic excludes `client` role; confirm it includes `admin`. |
| **handle_new_user() trigger** | When an invited Admin signs up, trigger creates profile with `role = 'admin'` and correct `company_id`. No special Admin creation path outside of Owner-sent invites. | **Verify** |
| **Database CHECK constraint** | `profiles.role` CHECK constraint includes `'admin'` as a valid value (added in migration 003). | **Confirmed** — migration 003 added this. |
| **Shared types** | `packages/shared/types/roles.ts` includes `admin` in the role union type. `packages/shared/constants/roles.ts` has ROLE_HIERARCHY, ROLE_LABELS, ROLE_DESCRIPTIONS, INVITABLE_ROLES, canManageRole() correctly handling Admin. | **Confirmed** — built during Session 2. |

### Admin Role Verification — Action Items

Before starting Module 3, run a verification pass on the live codebase:

1. **Sign in as Admin** (create a test Admin account via Owner invite if one does not exist) and click through every page in the dashboard. Confirm:
   - Billing page is blocked
   - Team page shows invite form but "Admin" is not a selectable role in the dropdown
   - Company Settings page is accessible and editable
   - Contacts and Subcontractors pages work fully (create, edit, delete)
   - Sidebar shows all expected nav items and no unexpected ones

2. **Check RLS policies** in Supabase SQL Editor:
   ```sql
   SELECT policyname, cmd, qual, with_check 
   FROM pg_policies 
   WHERE schemaname = 'public' 
   ORDER BY tablename, policyname;
   ```
   Confirm every write policy that allows Owner also allows Admin (except billing-related tables like `subscriptions`).

3. **Check middleware** in `apps/web/middleware.ts`:
   - Confirm Admin cannot access `/dashboard/billing/*` routes
   - Confirm Admin CAN access `/dashboard/settings`, `/dashboard/team`, `/dashboard/contacts`, `/dashboard/subcontractors`

4. **Check sidebar gating** in `apps/web/app/dashboard/dashboard-shell.tsx`:
   - Confirm Settings link shows for Owner and Admin
   - Confirm Billing link shows for Owner ONLY
   - Confirm Team link shows for Owner and Admin

5. **Check invite form** in `apps/web/app/dashboard/team/invite/invite-form.tsx`:
   - Confirm INVITABLE_ROLES constant excludes "admin" when the current user is Admin (only Owner can invite at Admin level)

If any of these fail, log the issue and fix before Module 3. The Admin role is foundational — every subsequent module assumes it works correctly.

---

## Environment Variables (apps/web/.env.local and Vercel)

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
OPENAI_API_KEY=(sk-... key — needed for Module 3 AI auto-tagging, set up when Module 3 build starts)
```

---

## Migrations Run (all saved to packages/supabase/migrations/)

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

---

## Known Accounts

- **Supabase:** josh@worthprop.com, FrameFocus project at jwkcknyuyvcwcdeskrmz.supabase.co
- **GitHub:** IronFrame414, repo: FrameFocus
- **Vercel:** Connected via GitHub, project: FrameFocus, URL: https://frame-focus-eight.vercel.app
- **Stripe:** FrameFocus sandbox (test mode), webhook + customer portal configured
- **Test users:** Josh Bishop (jsbishop14@gmail.com) Owner of Bishop Contracting

---

## Current Session Context

**What's been completed:**
- Full tech stack and architecture finalized (Session 1)
- Infrastructure scaffolded: monorepo, Codespaces, Supabase, Vercel (Session 2)
- Module 1 complete: auth, invites, admin role, Stripe billing, company settings (Sessions 2–5)
- Module 2 complete: contacts (leads/clients) + subcontractors (subs/vendors) with full CRUD (Session 5)
- QuickBooks integration strategy decided (Session 5)
- Change order workflow detailed (Session 5)
- Architecture audit completed with tech debt tracked (Session 5)
- Module 3 detailed design completed: file management, photo markup & annotation, AI auto-tagging (Session 6)
- Platform roadmap spreadsheet produced (8 tabs) (Session 6)
- **Major platform expansion during Session 6 planning:**
  - Added Module 8: Inventory & Tools (NEW) — bumped Client Portal → 9, Reporting → 10, AI Marketing → 11
  - Added time categorization (regular/OT/travel/drive/shop), break tracking, overtime, mileage tracking to Module 6
  - Added hours-to-change-order and hours-to-T&M-line allocation to Module 6
  - Added safety hazards section to daily logs + separate Safety Incident Reporting workflow
  - Added daily huddle/crew briefing (optional) to Module 6
  - Added material delivery tracking (anyone on project can check in, receipt photo or typed list) to Module 6
  - Added receipt attachment capability to Module 3, linked to Module 8 inventory items
  - Added Material Selections workflow to Module 9 (separate category pages, room grouping, auto-log to Decision Log)
  - Added Decision Log to Module 9 (timestamped, append-only planned, exportable PDF)
  - Added photo gallery client favorites to Module 9 (feeds Module 11 marketing)
  - Added pre-construction checklist to Module 9
  - Added voice-to-text daily logs, offline photo queue, quick-add punch list from photo/video/audio (video/audio post-launch)
  - Canceled weather-based work cancellation and customer referral tracking
  - Deferred to post-launch: tool maintenance, low-stock alerts, barcode scanning, automated return workflow, AI punch list from video/audio
- **Session 6 deliverables produced:**
  - `FrameFocus_Platform_Roadmap.xlsx` — 8-tab planning spreadsheet
  - `FrameFocus_Platform_Roadmap.docx` — 51-page comprehensive reference document (10th grade reading level)
  - `FrameFocus_Quick_Reference.docx` — 5-page scannable summary
  - `context7.md` — session summary log

**What's next:**
- Run audit fixes from Session 5 (import type, consolidate duplicated constants)
- Module 3: Document & File Management (build) — first build session for the new expanded scope
- Decide open questions before building: T&M rate structure (per-employee vs. per-role), photo markup storage format (JSON vs. image), selection deadline enforcement, decision log edit history policy
- Set up OpenAI API key in env vars before Module 3 build starts

---

## Claude Code

**Status:** NOT YET SET UP — Consider installing for Module 3+.

**What it is:** Claude Code is a command-line tool that runs directly in the terminal. It can read the full codebase, edit multiple files, run commands, and execute multi-step coding tasks without copy-pasting.

**How to use both tools together:**
- **Claude Code (in Codespaces terminal)** — Hands-on coding: building components, writing migrations, creating services, fixing errors, running tests.
- **Claude Chat (this interface)** — Planning and review: data model design, architecture decisions, module planning, document creation.

**Setup instructions:**
1. Open your Codespace terminal
2. Run: `npm install -g @anthropic-ai/claude-code`
3. Run: `claude` to authenticate
4. Claude Code will read CLAUDE.md automatically for project context

---

## Reference Documents

All reference documents now live in `docs/roadmap/` in the repo (no longer uploaded per session):

- `docs/roadmap/FrameFocus_Platform_Roadmap.docx` — **Primary reference.** 51-page comprehensive roadmap with all 11 modules, workflows, AI features, roles, dependencies, data flow, success metrics, known risks, beta plan placeholder, and post-launch roadmap. 10th grade reading level. Updated during Session 6.
- `docs/roadmap/FrameFocus_Quick_Reference.docx` — 5-page scannable summary of all features and workflows. For sharing with reviewers or quick refreshers.
- `docs/roadmap/FrameFocus_Platform_Roadmap.xlsx` — 8-tab planning spreadsheet with integrations, workflows, AI features, roles/permissions, QB sync, and future ideas.
- `docs/roadmap/FrameFocus_Development_Roadmap.docx` — Original Session 1 business roadmap (superseded by the docs above; kept for historical reference).
- `docs/sessions/context1.md` through `context9.md` — Session-by-session build and planning logs. Read the most recent one at the start of each new session.
- `STATE.md` — Live repo state dashboard. Updated at end of each session.
- This file (`CLAUDE.md`) — Technical development guide (update after every major session).
