[CLAUDE.md](https://github.com/user-attachments/files/26336390/CLAUDE.md)
# CLAUDE.md — FrameFocus Development Guide

> **Last updated:** March 2026
> **Purpose:** This file is the single source of truth for all development conversations. Read this before every session.

---

## Project Overview

**FrameFocus** is a subscription-based construction management SaaS platform for residential and commercial contractors. It covers the full business lifecycle: lead capture → estimating → project management → field operations → job finances → client experience → business intelligence.

**Owner:** Josh Bishop (jsbishop14@gmail.com)
**Repo:** GitHub — to be created (new repo, fresh start)
**Status:** Pre-development. Roadmap finalized. Ready to scaffold.

---

## Technology Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Web Frontend | Next.js 14 + React + TypeScript + Tailwind CSS + shadcn/ui | Office users (estimators, PMs, owners) |
| Mobile Frontend | React Native + Expo | Field crew (techs, foremen) |
| Shared Logic | TypeScript packages in monorepo | Types, validation, business logic shared across web + mobile |
| Backend / DB | Supabase (PostgreSQL + Auth + Storage + Realtime + Edge Functions) | Multi-tenant with RLS |
| AI | OpenAI API (GPT-4o) + Supabase pgvector | Estimating, reporting, summaries, marketing |
| Payments | Stripe Billing + Stripe Connect | Subscriptions + contractor-to-client payments |
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
│   │   ├── components/       # Web-specific UI components
│   │   ├── lib/              # Web-specific utilities
│   │   └── public/           # Static assets
│   └── mobile/               # Expo / React Native app
│       ├── app/              # Expo Router screens
│       ├── components/       # Mobile-specific UI components
│       └── lib/              # Mobile-specific utilities
├── packages/
│   ├── shared/               # Shared across web + mobile
│   │   ├── types/            # TypeScript type definitions
│   │   ├── validation/       # Zod schemas for form/API validation
│   │   ├── constants/        # Enums, status codes, role definitions
│   │   └── utils/            # Pure business logic functions
│   ├── supabase/             # Supabase-specific package
│   │   ├── migrations/       # SQL migration files (numbered)
│   │   ├── functions/        # Edge Functions
│   │   ├── seed/             # Seed data for development
│   │   └── types/            # Auto-generated database types
│   └── ui/                   # Shared UI primitives (if needed later)
├── .devcontainer/            # GitHub Codespaces configuration
│   └── devcontainer.json
├── .github/
│   └── workflows/            # GitHub Actions CI/CD
├── turbo.json                # Turborepo configuration
├── package.json              # Root workspace config
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

---

## Platform Modules (10 total)

Build order follows strict dependency chain. Each module depends on the ones above it.

### Phase 1: Foundation Layer (Months 1–3)

| # | Module | Status | Description |
|---|--------|--------|-------------|
| 1 | Settings, Admin & Billing | NOT STARTED | Multi-tenant auth, roles/permissions, Stripe subscriptions, company setup |
| 2 | Contacts & CRM | NOT STARTED | Unified people database: leads, clients, subs, suppliers. Referenced by all modules |
| 3 | Document & File Management | NOT STARTED | Supabase Storage, file tagging, project folders, upload from web + mobile camera |

### Phase 2: Core Business Modules (Months 3–7)

| # | Module | Status | Description |
|---|--------|--------|-------------|
| 4 | Sales & Estimating | NOT STARTED | Estimate builder, cost catalog, AI line-item suggestions, proposals, e-signatures, pipeline |
| 5 | Project Management | NOT STARTED | Phases, milestones, Kanban tasks, scheduling, templates, change order initiation |
| 6 | Team & Field Operations | NOT STARTED | Mobile-first: clock in/out with GPS, daily logs, photo markup, punch lists, offline mode |
| 7 | Job Finances | NOT STARTED | Budget vs. actual, cost codes, change orders, invoicing, sub pay apps, retainage |

### Phase 3: Differentiator Layer (Months 7–10)

| # | Module | Status | Description |
|---|--------|--------|-------------|
| 8 | Customer Experience Portal | NOT STARTED | Client login, project timeline, AI weekly summaries (owner-approved), selections, payments, messaging |
| 9 | Reporting & Analytics | NOT STARTED | Profitability, estimating accuracy, pipeline metrics, AI queries, anomaly detection, custom dashboards |

### Phase 4: Premium Add-On (Months 10–12)

| # | Module | Status | Description |
|---|--------|--------|-------------|
| 10 | AI Marketing & Social | NOT STARTED | Auto social posts from projects, Facebook/Google integration, review requests, content calendar |

### Cross-Cutting Systems (built incrementally)

- **AI Layer** — Woven into modules 4, 5, 7, 8, 9, 10. Uses OpenAI GPT-4o + pgvector. Core principle: AI drafts, humans approve.
- **Workflow Engine** — Event-driven automation via Supabase Webhooks + Edge Functions. Built during Phase 2, extended in Phase 3.

---

## Key Milestones

| Month | Milestone |
|-------|-----------|
| 5 | **BETA RELEASE** — Sales & Estimating + Project Management usable. Onboard 3–5 contractors for testing. |
| 10 | **FEATURE COMPLETE** — All core + differentiator modules live. |
| 12 | **PRODUCTION LAUNCH** — Subscription billing enforced. Public marketing. |

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

| Role | Description |
|------|-------------|
| Platform Admin | Full access to all companies, subscriptions, support tools, platform analytics, and system configuration. Josh and any future FrameFocus team members. |

**Platform Admin capabilities:**
- View and manage all company accounts
- Access platform-wide analytics (MRR, churn, usage metrics)
- Manage subscription plans and pricing
- Handle support escalations
- Impersonate company users for debugging/support
- System configuration and feature flags

**Implementation:** Platform Admins are stored in a separate `platform_admins` table (not the company `profiles` table). They access a separate admin dashboard route (`/admin`). They do NOT have a `company_id`.

### Layer 2: Company Users (contractor customers)

Each subscribing company is an isolated tenant. Within that company, there are 5 roles with descending access levels. The Owner is always the billing contact.

| Role | DB Value | Web Access | Mobile Access | Key Permissions |
|------|----------|-----------|---------------|-----------------|
| Owner | `owner` | Full | Full | All features, billing/subscription management, user invitations, approval authority on change orders/payments/AI content, company settings |
| Project Manager | `project_manager` | Full (scoped to assigned projects) | Full | Create/manage estimates, manage assigned projects, assign tasks to Foremen and Crew, create change orders, view job finances, manage client communication |
| Foreman | `foreman` | Limited | Full | Manage assigned field crews, daily logs, schedule crew tasks, review Crew Member submissions, punch lists, quality control, report to PM |
| Crew Member | `crew_member` | Minimal | Full | Clock in/out with GPS, daily log entries, photo capture, task status updates, view assigned tasks and schedule |
| Client | `client` | Portal only | No (future phase) | View project timeline, photo gallery, approve selections, sign documents, make payments, message PM, view AI weekly summaries |

**Role hierarchy and rules:**
- Every company must have exactly 1 Owner. Ownership can be transferred but not deleted.
- Owner is the only role that can manage billing (Stripe subscription) and invite/remove users.
- Owner is the only role that can approve: AI-generated weekly summaries, change orders above a threshold, final payments to subs, marketing content for publishing.
- Project Managers can do everything a Foreman can, plus estimating and job finances.
- Foremen can do everything a Crew Member can, plus crew management and punch list oversight.
- Clients are completely isolated — they only see their own project(s) through the portal. They never see company-internal data.

**Database implementation:**
- Company users are stored in the `profiles` table with a `role` column (enum: `owner`, `project_manager`, `foreman`, `crew_member`, `client`).
- Every profile row has a `company_id` foreign key.
- RLS policies reference the user's role from their profile to determine access.
- The `role` column is used in application logic for UI rendering (what screens/tabs to show) and API authorization (what actions are allowed).

---

## Subscription Tiers

User counts below refer to Company Users (Owner + Project Manager + Foreman + Crew Member). Client portal accounts are unlimited on the Business tier.

| | Starter ($79/mo) | Professional ($149/mo) | Business ($249/mo) |
|---|---|---|---|
| Company Users | 2 | 5 | 15 |
| Additional Users | $15/user/mo | $15/user/mo | $12/user/mo |
| Storage | 10 GB | 50 GB | 200 GB |
| AI Estimates | 5/mo | 25/mo | Unlimited |
| Client Portal | — | — | ✓ (unlimited client accounts) |
| Workflow Automation | — | Core | All + custom |
| AI Marketing | — | — | Add-on $99/mo |

---

## Built-In Workflow Automations

1. **Lien Release on Sub Completion** — Sub marks work complete → system generates lien release → e-signature request → signed release unlocks payment approval → payment recorded
2. **Change Order Approval Chain** — PM creates CO → owner approves → client signs → budget/schedule updated
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

---

## Current Session Context

**What's been decided:**
- Full tech stack (React/Next.js + Expo + Supabase + TypeScript)
- 10-module architecture with 4 build phases
- AI integration strategy across 6 modules
- Workflow automation engine with 6 built-in workflows
- 3-tier subscription model with pricing
- GitHub Codespaces as dev environment
- 12-month roadmap with Month 5 beta target

**What's next:**
- Create new GitHub repo
- Scaffold the Turborepo monorepo
- Configure GitHub Codespaces (.devcontainer)
- Set up Supabase project
- Connect Vercel for web deployment
- Begin Module 1: Settings, Admin & Billing

**Known accounts:**
- Supabase: existing account (josh@worthprop.com was prior test account)
- GitHub: IronFrame414
- Vercel: to be connected
- Stripe: to be set up

---

## Claude Code

**Status:** NOT YET SET UP — Install when Codespaces is running and Module 1 begins.

**What it is:** Claude Code is a command-line tool that runs directly in the terminal. It can read the full codebase, edit multiple files, run commands, and execute multi-step coding tasks without copy-pasting.

**When to set it up:** Once the Turborepo monorepo is scaffolded and GitHub Codespaces is configured. Install it inside the Codespace terminal so it stays browser-based.

**How to use both tools together:**
- **Claude Code (in Codespaces terminal)** — Hands-on coding: building components, writing migrations, creating services, fixing errors, running tests. Use for tasks like "build the contacts table and CRUD service" or "create the estimate builder screen."
- **Claude Chat (this interface)** — Planning and review: data model design, architecture decisions, module planning, document creation, research, and big-picture strategy. Use for tasks like "let's plan the invoicing data model" or "review my approach to the workflow engine."

**Setup instructions (for when the time comes):**
1. Open your Codespace terminal
2. Run: `npm install -g @anthropic-ai/claude-code`
3. Run: `claude` to authenticate
4. Claude Code will read CLAUDE.md automatically for project context
5. Start giving it coding tasks

---

## Reference Documents

- `FrameFocus_Development_Roadmap.docx` — Full business roadmap with module details, pricing, and timeline
- This file (`CLAUDE.md`) — Technical development guide (update after every major session)
