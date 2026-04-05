# CLAUDE.md — FrameFocus Development Guide

> **Last updated:** April 5, 2026 (Session 5)
> **Purpose:** This file is the single source of truth for all development conversations. Read this before every session.

---

## Project Overview

**FrameFocus** is a subscription-based construction management SaaS platform for residential and commercial contractors. It covers the full business lifecycle: lead capture → estimating → project management → field operations → job finances → client experience → business intelligence.

**Owner:** Josh Bishop (jsbishop14@gmail.com)
**Repo:** github.com/IronFrame414/FrameFocus (private)
**Live URL:** https://frame-focus-eight.vercel.app
**Status:** Module 1 complete. Module 2 complete. Ready for Module 3.

---

## Technology Stack

| Layer           | Technology                                                         | Notes                                                        |
| --------------- | ------------------------------------------------------------------ | ------------------------------------------------------------ |
| Web Frontend    | Next.js 14 + React + TypeScript + Tailwind CSS + shadcn/ui         | Office users (estimators, PMs, owners)                       |
| Mobile Frontend | React Native + Expo                                                | Field crew (techs, foremen)                                  |
| Shared Logic    | TypeScript packages in monorepo                                    | Types, validation, business logic shared across web + mobile |
| Backend / DB    | Supabase (PostgreSQL + Auth + Storage + Realtime + Edge Functions) | Multi-tenant with RLS                                        |
| AI              | OpenAI API (GPT-4o) + Supabase pgvector                            | Estimating, reporting, summaries, marketing                  |
| Payments        | Stripe Billing + Stripe Connect                                    | Subscriptions + contractor-to-client payments                |
| Accounting      | QuickBooks Online API (OAuth 2.0)                                  | Sync only — FrameFocus runs operations, QB runs the books    |
| Web Hosting     | Vercel                                                             | Auto-deploy from main branch                                 |
| Mobile Builds   | Expo EAS                                                           | Cloud iOS/Android builds + OTA updates                       |
| CI/CD           | GitHub Actions                                                     | Lint, test, build verification                               |
| Monorepo        | Turborepo                                                          | Multi-package management                                     |
| Email           | Resend                                                             | Transactional emails                                         |
| E-Signatures    | DocuSign API or BoldSign                                           | Proposals, change orders, lien releases                      |
| Doc Generation  | React-PDF or Puppeteer                                             | PDF estimates, invoices, reports                             |

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
│   │   ├── migrations/       # SQL migration files (001–011)
│   │   ├── functions/        # Edge Functions
│   │   ├── seed/             # Seed data
│   │   └── types/            # Auto-generated database types
│   └── ui/                   # Shared UI primitives (placeholder)
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

---

## Platform Modules (10 total)

Build order follows strict dependency chain. Each module depends on the ones above it.

### Phase 1: Foundation Layer (Months 1–3)

| #   | Module                     | Status      | Description                                                                                                                                                                               |
| --- | -------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Settings, Admin & Billing  | ✅ COMPLETE | Multi-tenant auth, roles/permissions (owner + admin), Stripe subscriptions (3 tiers), company settings with logo upload, trial system with abuse prevention, invite flow, team management |
| 2   | Contacts & CRM             | ✅ COMPLETE | Two-table design: `contacts` (leads & clients) + `subcontractors` (subs & vendors). Full CRUD with search, filtering, star ratings, preferred flags, EIN, insurance tracking              |
| 3   | Document & File Management | NOT STARTED | Supabase Storage, file tagging, project folders, upload from web + mobile camera                                                                                                          |

### Phase 2: Core Business Modules (Months 3–7)

| #   | Module                  | Status      | Description                                                                                 |
| --- | ----------------------- | ----------- | ------------------------------------------------------------------------------------------- |
| 4   | Sales & Estimating      | NOT STARTED | Estimate builder, cost catalog, AI line-item suggestions, proposals, e-signatures, pipeline |
| 5   | Project Management      | NOT STARTED | Phases, milestones, Kanban tasks, scheduling, templates, change order initiation            |
| 6   | Team & Field Operations | NOT STARTED | Mobile-first: clock in/out with GPS, daily logs, photo markup, punch lists, offline mode    |
| 7   | Job Finances            | NOT STARTED | Budget vs. actual, cost codes, change orders, invoicing, sub pay apps, retainage            |

### Phase 3: Differentiator Layer (Months 7–10)

| #   | Module                     | Status      | Description                                                                                            |
| --- | -------------------------- | ----------- | ------------------------------------------------------------------------------------------------------ |
| 8   | Customer Experience Portal | NOT STARTED | Client login, project timeline, AI weekly summaries (owner-approved), selections, payments, messaging  |
| 9   | Reporting & Analytics      | NOT STARTED | Profitability, estimating accuracy, pipeline metrics, AI queries, anomaly detection, custom dashboards |

### Phase 4: Premium Add-On (Months 10–12)

| #   | Module                | Status      | Description                                                                                     |
| --- | --------------------- | ----------- | ----------------------------------------------------------------------------------------------- |
| 10  | AI Marketing & Social | NOT STARTED | Auto social posts from projects, Facebook/Google integration, review requests, content calendar |

### Cross-Cutting Systems (built incrementally)

- **AI Layer** — Woven into modules 4, 5, 7, 8, 9, 10. Uses OpenAI GPT-4o + pgvector. Core principle: AI drafts, humans approve.
- **Workflow Engine** — Event-driven automation via Supabase Webhooks + Edge Functions. Built during Phase 2, extended in Phase 3.
- **QuickBooks Integration** — Cross-cutting sync layer built during Modules 6 and 7. See dedicated section below.

---

## QuickBooks Integration Strategy

**Core principle:** FrameFocus runs daily operations. QuickBooks runs the books. Data syncs so contractors never double-enter.

**Connection:** OAuth 2.0 via QuickBooks Online API. Owner connects QB from Company Settings. Refresh token stored securely. Sync handled by Supabase Edge Functions or webhook queue.

### Sync Points by Module

| Module               | FrameFocus → QuickBooks                          | Direction |
| -------------------- | ------------------------------------------------ | --------- |
| Module 2 (Contacts)  | Clients → QB Customers                           | FF → QB   |
| Module 2 (Contacts)  | Subs/Vendors (with EIN) → QB Vendors             | FF → QB   |
| Module 6 (Field Ops) | Approved timesheets → QB Time/Payroll entries    | FF → QB   |
| Module 7 (Finances)  | Client invoices → QB Invoices                    | FF → QB   |
| Module 7 (Finances)  | Sub pay applications → QB Bills                  | FF → QB   |
| Module 7 (Finances)  | Sub payments → QB Bill Payments                  | FF → QB   |
| Module 7 (Finances)  | Approved change orders → QB contract adjustments | FF → QB   |

### Key Design Rules

1. **FrameFocus is source of truth for project data.** QB is source of truth for accounting.
2. **Never replace QuickBooks for accounting.** No P&L, no tax prep, no bank reconciliation in FrameFocus.
3. **QB handles 1099s.** Vendor records with EINs and payment totals sync from FrameFocus; QB generates the actual 1099 filings.
4. **Timeclock flow:** Crew member clocks in/out on mobile → Foreman/PM approves timesheet → approved hours sync to QB as time entries tied to employee + job → QB handles payroll.
5. **Build during Modules 6 and 7.** QB connection UI lives in Company Settings. Each financial action optionally syncs.

---

## Change Order Workflow (Detailed)

Change orders span Modules 5, 7, and 8:

**Module 5 (Project Management) — Creation:**

- PM or Owner creates a CO tied to a specific project
- References original estimate line items from Module 4
- Shows cost and schedule impact
- Status lifecycle: `draft` → `pending_approval` → `approved` → `rejected` or `executed`

**Module 7 (Job Finances) — Budget Impact:**

- Approved CO automatically updates project budget (contract value, cost codes, projected profit)
- If CO involves a sub, creates or modifies the sub's pay application
- Approved CO syncs to QuickBooks as contract adjustment

**Module 8 (Client Portal) — Client Sign-off:**

- If CO changes scope or price, it routes to the client for e-signature
- Client sees CO in their portal with before/after comparison

**Change Order Approval Chain Workflow:**
PM creates CO → Owner notified → Owner approves → (if client-facing) client signs via portal → CO marked `executed` → budget auto-updates → QB sync

**Data model (planned):**

- `change_orders` — linked to project, created_by, amounts, description, reason category, status
- `change_order_line_items` — what changed, before/after quantities and prices
- `change_order_approvals` — who approved when
- Document attachments (photos, revised drawings)

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
- `subcontractors` — subs and vendors. Fields: sub_type (subcontractor/vendor), status, company_name, contact_first_name, contact_last_name, email, phone, mobile, address fields, trade_type, license_number, insurance_expiry, rating (1-5), rating_notes, ein, default_hourly_rate, preferred, notes, tags[]

### Storage Buckets

- `company-logos` — public bucket for company logo uploads, organized by company_id folders

---

## Database Conventions

**Multi-tenancy:** Every table has a `company_id` column. All queries are filtered by company via RLS policies.

**Row-Level Security:** Enabled on ALL tables. No exceptions. Every policy uses a `get_my_company_id()` helper function that reads company_id from the user's profile.

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

**Soft deletes only.** Never hard delete records. All queries filter `WHERE is_deleted = false`.

---

## Service Layer Pattern

Server and client Supabase clients must be in separate files to avoid Next.js build errors (`next/headers` cannot be imported in client components).

**Pattern for each data entity:**

- `lib/services/{entity}.ts` — Server-side functions (imports from `@/lib/supabase-server`). Used in server components and page.tsx files. Contains read operations (getAll, getById).
- `lib/services/{entity}-client.ts` — Client-side functions (imports from `@/lib/supabase-browser`). Used in `'use client'` form components. Contains write operations (create, update, delete).

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

| Role           | Description                                                                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Platform Admin | Full access to all companies, subscriptions, support tools, platform analytics, and system configuration. Josh and any future FrameFocus team members. |

**Implementation:** Platform Admins are stored in a separate `platform_admins` table (not the company `profiles` table). They access a separate admin dashboard route (`/admin`). They do NOT have a `company_id`.

### Layer 2: Company Users (contractor customers)

Each subscribing company is an isolated tenant. Within that company, there are 6 roles with descending access levels. The Owner is always the billing contact.

| Role            | DB Value          | Web Access                         | Mobile Access     | Key Permissions                                                                                                                            |
| --------------- | ----------------- | ---------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Owner           | `owner`           | Full                               | Full              | All features, billing/subscription management, user invitations, approval authority on change orders/payments/AI content, company settings |
| Admin           | `admin`           | Full                               | Full              | Everything except billing, promoting to Admin                                                                                              |
| Project Manager | `project_manager` | Full (scoped to assigned projects) | Full              | Create/manage estimates, manage assigned projects, assign tasks, create change orders, view job finances, manage client communication      |
| Foreman         | `foreman`         | Limited                            | Full              | Manage assigned field crews, daily logs, schedule crew tasks, review Crew Member submissions, punch lists, quality control                 |
| Crew Member     | `crew_member`     | Minimal                            | Full              | Clock in/out with GPS, daily log entries, photo capture, task status updates, view assigned tasks and schedule                             |
| Client          | `client`          | Portal only                        | No (future phase) | View project timeline, photo gallery, approve selections, sign documents, make payments, message PM, view AI weekly summaries              |

---

## Subscription Tiers

User counts below refer to Company Users (Owner + Admin + PM + Foreman + Crew Member). Client portal accounts are unlimited on the Business tier.

|                     | Starter ($79/mo) | Professional ($149/mo) | Business ($249/mo)            |
| ------------------- | ---------------- | ---------------------- | ----------------------------- |
| Company Users       | 2                | 5                      | 15                            |
| Additional Users    | $15/user/mo      | $15/user/mo            | $12/user/mo                   |
| Storage             | 10 GB            | 50 GB                  | 200 GB                        |
| AI Estimates        | 5/mo             | 25/mo                  | Unlimited                     |
| Client Portal       | —                | —                      | ✓ (unlimited client accounts) |
| Workflow Automation | —                | Core                   | All + custom                  |
| AI Marketing        | —                | —                      | Add-on $99/mo                 |
| QuickBooks Sync     | ✓                | ✓                      | ✓                             |

---

## Built-In Workflow Automations

1. **Lien Release on Sub Completion** — Sub marks work complete → system generates lien release → e-signature request → signed release unlocks payment approval → payment recorded
2. **Change Order Approval Chain** — PM creates CO → owner approves → client signs → budget/schedule updated → QB sync
3. **Milestone Client Notification** — Milestone complete → portal updated → client notified → invoice generated if billing milestone
4. **Estimate Follow-Up** — No response in 3 days → owner reminder → optional auto follow-up to client
5. **Insurance Expiration Alert** — Sub cert within 30 days of expiry → notifications → auto-request to sub
6. **Project Completion Closeout** — All tasks/punch done → final invoice with retainage → satisfaction survey → portfolio prompt → archive

---

## AI Integration Rules

1. **AI drafts, humans approve.** Nothing client-facing or financially significant ships without owner review.
2. **Historical data powers suggestions.** Estimating AI uses pgvector embeddings of completed job line items.
3. **Company context included in all prompts.** Trade type, region, typical project size, approved brand voice.
4. **Approval queue for all AI outputs.** Weekly summaries, social posts, report narratives all go through a review step.

---

## Instruction Preferences

When generating code, migrations, or instructions for Josh:

- **Step-by-step, click-level guidance.** Don't assume familiarity with dev tooling.
- **Explicit file paths.** Always state exactly which file to create/edit and where.
- **Success/failure indicators.** After each step, describe what Josh should see if it worked and what to check if it didn't.
- **One thing at a time.** Don't bundle multiple changes into a single instruction block. Break them into numbered steps.
- **Paste-ready code.** Code blocks should be complete and copy-pasteable, not fragments requiring assembly.
- **Browser-based workflow.** All instructions assume GitHub Codespaces. Never reference local terminal, VS Code desktop, or local file system.
- **Avoid shell heredocs for JSX files.** Use Node.js fs.writeFileSync() or create files directly in the Codespace editor. Shell heredocs eat `<a` tags and cause build failures.

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

**What's next:**

- Module 3: Document & File Management
- Module 4: Sales & Estimating (first core business module)

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

- `FrameFocus_Development_Roadmap.docx` — Full business roadmap with module details, pricing, and timeline
- This file (`CLAUDE.md`) — Technical development guide (update after every major session)
- `context1.md` through `context5.md` — Session-by-session build logs
