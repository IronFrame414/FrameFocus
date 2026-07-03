# CLAUDE.md — FrameFocus Development Guide

> **Last updated:** April 25, 2026 (Session 42 — Standard triggers section added)
> **Purpose:** This file is the single source of truth for all development conversations. Read this before every session.

---

## Project Overview

**FrameFocus** is a subscription-based construction management SaaS platform for residential and commercial contractors. It covers the full business lifecycle: lead capture → estimating → project management → field operations → job finances → inventory & tools → client experience → business intelligence.

**Owner:** Josh Bishop (jsbishop14@gmail.com)
**Repo:** github.com/IronFrame414/FrameFocus (private)
**Live URL:** https://frame-focus-eight.vercel.app
**Status:** Modules 1, 2, and 3 complete. Platform has 11 modules total. See STATE.md for live build status.

> **See also:** [`CLAUDE_MODULES.md`](CLAUDE_MODULES.md) — Detailed module designs (Modules 3, 6, 8, 9), QuickBooks integration strategy, and change order workflow. [`docs/module4-architecture.md`](docs/module4-architecture.md) — Module 4 (Sales & Estimating) architecture (separate file due to size).

## Claude Code MCP Servers

Two MCP servers are standard for this repo:

- **Context7** — fetches live, version-specific docs at query time. **Trigger:** before writing or modifying code that touches Next.js, Supabase, Stripe, Tailwind, or Turborepo APIs. Solves training-cutoff hallucinations on the stack.
- **Serena** — symbol-level code navigation (find_symbol, find_referencing_symbols, insert_after_symbol). **Trigger:** before reading whole files for cross-file refactors, renames, or "where is this used" lookups. Cuts token use; catches references whole-file reads miss.

## Install commands and Codespace rebuild behavior: see STATE.md → "Claude Code MCP setup."

## Technology Stack

| Layer           | Technology                                                         | Notes                                                           |
| --------------- | ------------------------------------------------------------------ | --------------------------------------------------------------- |
| Web Frontend    | Next.js 14 + React + TypeScript + Tailwind CSS + shadcn/ui         | Office users (estimators, PMs, owners)                          |
| Mobile Frontend | React Native + Expo                                                | Field crew (techs, foremen)                                     |
| Shared Logic    | TypeScript packages in monorepo                                    | Types, validation, business logic shared across web + mobile    |
| Backend / DB    | Supabase (PostgreSQL + Auth + Storage + Realtime + Edge Functions) | Multi-tenant with RLS                                           |
| AI              | OpenAI API (GPT-4o vision + text) + Supabase pgvector              | Estimating, photo auto-tagging, reporting, summaries, marketing |
| Payments        | Stripe Billing + Stripe Connect                                    | Subscriptions + contractor-to-client payments                   |
| Accounting      | QuickBooks Online API (OAuth 2.0)                                  | Sync only — FrameFocus runs operations, QB runs the books       |
| Web Hosting     | Vercel                                                             | Auto-deploy from main branch                                    |
| Mobile Builds   | Expo EAS                                                           | Cloud iOS/Android builds + OTA updates                          |
| CI/CD           | GitHub Actions                                                     | Lint, test, build verification                                  |
| Monorepo        | Turborepo                                                          | Multi-package management                                        |
| Email           | Resend                                                             | Transactional emails                                            |
| E-Signatures    | DocuSign API or BoldSign                                           | Proposals, change orders, lien releases                         |
| Doc Generation  | React-PDF or Puppeteer                                             | PDF estimates, invoices, reports                                |

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
│   └── sessions/             # One file per session (contextN.md)
├── scripts/                  # Dev utility scripts
├── supabase/
│   └── migrations/           # Supabase migrations — 14-digit timestamp format required by CLI
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
- **Supabase Storage rejects `<` and `>` in object keys.** Storage paths inherit any URL segment that flows into them. If you test a route by typing a literal placeholder like `<some-uuid>` into the URL, the upload will fail with "Invalid key" and the cause is not obvious. For testing routes that need a `project_id` before Module 5 ships, use a real UUID format like `11111111-1111-1111-1111-111111111111`.
- **Supabase signed URLs default to inline disposition.** A signed URL serves the file with `Content-Disposition: inline` by default — images and PDFs render in-browser, they don't download. To force a download with a chosen filename, append `?download=<filename>` to the signed URL. This is not in Supabase's primary docs. Check this whenever a "download" feature seems to "preview" instead.
- **Claude Chat strips `<` characters when code is pasted into the Codespace editor.** Pasting `Pick<Database['public']['Tables']...>` will reliably drop the `<` and produce broken TypeScript. For any code containing `<`, use Claude Code, or write the file via `node -e "require('fs').writeFileSync(...)"` with single-quoted contents. Do not paste through the chat editor and assume it round-tripped.
- **Bash history expansion eats `!` even inside double-quoted strings.** A `node -e "..."` command containing `!user` or any `!`-prefixed token triggers `event not found` and kills the command. Workarounds: use `printf '...'` with single quotes (no expansion), or run the command through Claude Code, or `set +H` first to disable history expansion for the session.

---

## Database Patterns

**RLS-bypassing helper functions for triggers.** When a trigger on `auth.users` (or any table) needs to query an RLS-protected table, the trigger runs in a context where `get_my_company_id()` and similar helpers return NULL — meaning RLS filters out every row. The working pattern:

1. Create a `SECURITY DEFINER` **SQL** function (not plpgsql) that does the query
2. Call that function from the trigger

SQL functions with `SECURITY DEFINER` reliably bypass RLS in this context. See `get_invitation_for_signup()` (Migration 015) and `get_invitation_by_token()` (used by the invite acceptance page) for working examples.

**Why SQL and not plpgsql:** plpgsql `SECURITY DEFINER` functions still hit RLS in some trigger contexts. SQL `SECURITY DEFINER` functions bypass reliably. When in doubt, use SQL.

---

## Claude Code — run protocol

LAUNCH REQUIREMENT: start CC with `claude --dangerously-skip-permissions`
(set at launch, NOT mid-session). Permissions also come from `.claude/settings.json`.

Phase 0 — BRANCH: run `git branch --show-current`. If on `main`, create and switch
to a new feature branch (`git checkout -b feature/<short-task-name>`) BEFORE any
edit. Never edit, create, or migrate on `main` — `main` auto-deploys to production.
Merging to `main` is Josh's call, done manually.
Phase 1 — ANALYZE: read the prompt and every file it references; build full
understanding. No edits in this phase.
Phase 2 — QUESTIONS: surface ALL questions / ambiguities / spec↔schema conflicts
at once, then STOP and wait. If none, say so and continue.
Phase 3 — BUILD: perform all reads/edits/creates autonomously; show diffs at the
end; never commit — Josh commits manually.

## Generated Types Workflow

`packages/shared/types/database.ts` is auto-generated from the live Supabase schema. All service files import from this — never hand-write database type shapes. After every migration that adds, removes, or renames a column or table, run:

```bash
npm run db:push
```

This chains `supabase db push`, `npm run db:types`, and `npm run type-check`. Commit the updated `database.ts` alongside the migration.

**Two patterns for service types:**

- **`Pick<>`** when the query selects specific columns (`select('col1, col2')`). Reference: `apps/web/lib/services/company.ts`.
- **`Omit<Row> + intersection`** when `select('*')` AND the table has CHECK-constrained columns (e.g., `status`, `contact_type`, `sub_type`, `role`). The intersection re-narrows the loose `string` from the generator back to a string literal union. References: `apps/web/lib/services/contacts.ts`, `subcontractors.ts`.

**Rule:** always preserve string literal unions on CHECK-constrained columns. The Supabase generator can't see CHECK constraints; it emits `string`. Restore the union via intersection rather than using the loose `string`.

**Client files re-export, never redefine.** In `*-client.ts` files, use `import type { Foo } from '@/lib/services/foo'; export type { Foo };`. Never redefine types already in the server service file. Reference: `apps/web/lib/services/company-client.ts`.

---

## Platform Modules

11 modules total, built in a strict dependency chain. **Module 8 (Inventory & Tools) was inserted in Session 6 planning, bumping the previous 8/9/10 to 9/10/11.**

Status → [STATE.md](STATE.md). Module list and details → [CLAUDE_MODULES.md](CLAUDE_MODULES.md), [docs/module4-architecture.md](docs/module4-architecture.md), [docs/roadmap/FrameFocus_Quick_Reference.docx](docs/roadmap/FrameFocus_Quick_Reference.docx).

**Cross-cutting:** AI Layer (see AI Integration Rules below), Workflow Engine (Supabase Webhooks + Edge Functions, Phase 2+), QuickBooks Integration (Modules 6 & 7 — see CLAUDE_MODULES.md).

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

**Per-tenant table column-defaults checklist.** Every new per-tenant table migration must include three column defaults so client-side INSERTs pass RLS without the caller manually setting these fields:

```sql
ALTER TABLE {table_name} ALTER COLUMN company_id SET DEFAULT get_my_company_id();
ALTER TABLE {table_name} ALTER COLUMN created_by SET DEFAULT auth.uid();
ALTER TABLE {table_name} ALTER COLUMN updated_by SET DEFAULT auth.uid();
```

Without these, the client INSERT sends `company_id = NULL`, RLS checks `NULL = get_my_company_id()` → false, and the insert fails with a 403 that doesn't obviously point to the missing default. Migration 022 (`tag_options`) was a fix for this exact miss on first attempt; Migration 018 (`files`) caught it during build. Get the defaults in on the first migration that creates the table.

**Standard triggers on every per-tenant table.** Every per-tenant table needs two BEFORE UPDATE triggers so `updated_at` and `updated_by` advance correctly on every UPDATE. Both must be installed in the same migration that creates the table, not added later.

```sql
-- 1. updated_at — reuses the shared function from Migration 001. Do NOT redefine it.
CREATE TRIGGER {table_name}_updated_at
  BEFORE UPDATE ON {table_name}
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 2. updated_by — per-table function, created in the same migration as the table.
CREATE OR REPLACE FUNCTION set_{table_name}_updated_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER {table_name}_set_updated_by
  BEFORE UPDATE ON {table_name}
  FOR EACH ROW EXECUTE FUNCTION set_{table_name}_updated_by();
```

**Naming convention:** trigger names are `{table_name}_updated_at` and `{table_name}_set_updated_by`. The per-table function is `set_{table_name}_updated_by()`. Confirmed across `tag_options`, `companies`, `profiles`, `files`, `contacts`, `subcontractors`, `contact_addresses`.

**Service-layer contract:** because these triggers exist, service code MUST NOT set `updated_at` or `updated_by` explicitly in update payloads. Mirror the comment style used in `contacts-client.ts`:

```typescript
// BEFORE UPDATE trigger `{table}_set_updated_by` handles updated_by.
// updated_at is handled by the existing updated_at trigger.
const { error } = await supabase.from('{table}').update(updates).eq('id', id);
```

Without the triggers, `updated_at` and `updated_by` never advance after the original INSERT — a silent data-quality bug that won't surface until an audit needs the timestamps.

**Reference implementations:** Migration 018 (`files`), Migration 023 (`tag_options`), Migration 028 (`contact_addresses`).

**Known holdover:** `companies` table is missing `companies_set_updated_by` and `company-client.ts` sets `updated_at` explicitly. Pre-trigger pattern. Tracked in TECH_DEBT.md — do not copy this file's pattern when building new tables.

**Append-only audit log exception.** A narrow category of tables are pure append-only logs — rows are written once and never updated or deleted. These tables intentionally OMIT the following standard columns: `updated_at`, `created_by`, `updated_by`, `is_deleted`, `deleted_at`. They also have NO UPDATE or DELETE RLS policies — only SELECT (scoped appropriately) and INSERT.

Columns present on an append-only log: `id`, `company_id` (where per-tenant), `created_at`, plus whatever domain-specific fields the log captures.

Current examples:

- `ai_tag_logs` — per-call cost tracking for GPT-4o vision auto-tagging (Module 3H, Session 30).
- `trial_emails` — one row per email address that has used a free trial.

Use this pattern for any future table that is a pure event log or audit trail. If the table ever needs to be edited or soft-deleted after insert, it is NOT an append-only log — use the standard columns above instead.
**Cost-column precision and audit-log FK behavior.** Two conventions for any table that stores money or references rows that may be deleted later:

- **Cost columns use `NUMERIC(10,6)`.** Six decimal places preserves sub-cent values like a $0.00382 GPT-4o call. `NUMERIC(10,2)` rounds to zero and silently destroys cost-tracking data. Reference: `ai_tag_logs.estimated_cost` (Migration 023).
- **Audit-log FKs to deletable rows use `ON DELETE SET NULL`, not `ON DELETE CASCADE`.** When an audit log references a row that can be permanently deleted (e.g., `ai_tag_logs.file_id` references `files.id`, and files have a permanent-delete path for owner/admin), `CASCADE` would erase the cost record along with the file. `SET NULL` preserves the cost row with the FK nulled out, keeping the financial trail intact. Default to `SET NULL` for any append-only log FK; only use `CASCADE` when the log row genuinely makes no sense without the parent.

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

**Current service files:** see [STATE.md](STATE.md) → "Codebase State" for the annotated active list. Convention: future add-on flags (e.g., `ai_marketing_enabled`) belong in `add-ons.ts`, not `company.ts`.

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

| Role           | Description                                                                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Platform Admin | Full access to all companies, subscriptions, support tools, platform analytics, and system configuration. Josh and any future FrameFocus team members. |

**Implementation:** Platform Admins are stored in a separate `platform_admins` table (not the company `profiles` table). They access a separate admin dashboard route (`/admin`). They do NOT have a `company_id`.

### Layer 2: Company Users (contractor customers)

Each subscribing company is an isolated tenant. Within that company, there are 6 roles with descending access levels. The Owner is always the billing contact.

| Role            | DB Value          | Web Access                         | Mobile Access     | Key Permissions                                                                                                                                                   |
| --------------- | ----------------- | ---------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owner           | `owner`           | Full                               | Full              | All features, billing/subscription management, user invitations, approval authority on change orders/payments/AI content, company settings, QuickBooks connection — [SUPERSEDED for COs — Owner-final-approval gate removed; see module5-architecture.md §5.7c AMENDMENT (Session 55). Owner/Admin/PM all create+send.] |
| Admin           | `admin`           | Full                               | Full              | Everything Owner can do EXCEPT items in the owner-only list below                                                                                                 |
| Project Manager | `project_manager` | Full (scoped to assigned projects) | Full              | Create/manage estimates, manage assigned projects, assign tasks, create change orders, view job finances, manage client communication                             |
| Foreman         | `foreman`         | Limited                            | Full              | Manage assigned field crews, daily logs, schedule crew tasks, review Crew Member submissions, punch lists, quality control                                        |
| Crew Member     | `crew_member`     | Minimal                            | Full              | Clock in/out with GPS, daily log entries, photo capture, task status updates, view assigned tasks and schedule                                                    |
| Client          | `client`          | Portal only                        | No (future phase) | View project timeline, photo gallery, approve selections, sign documents, make payments, message PM, view AI weekly summaries                                     |

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

### Role Permissions Quick Reference (By Action)

For any action not listed in the owner-only section above, assume Admin has access. When building a new feature, if a permission decision needs to be made, default to "Owner + Admin can do it" unless there is a specific reason (financial sign-off, billing, or client-facing owner-approval) to restrict it to Owner only.

**Who can approve what (summary):**

| Approval                           | Owner | Admin | PM  | Foreman |
| ---------------------------------- | ----- | ----- | --- | ------- |
| Billing changes                    | ✓     | —     | —   | —       |
| Promote to Admin                   | ✓     | —     | —   | —       |
| Connect QuickBooks                 | ✓     | —     | —   | —       |
| Release sub payments               | ✓     | —     | —   | —       |
| Approve AI weekly summaries        | ✓     | —     | —   | —       |
| Approve marketing content          | ✓     | —     | —   | —       |
| Approve change orders (final)      | ✓     | —     | —   | —       | — [SUPERSEDED for COs — Owner-final-approval gate removed; see module5-architecture.md §5.7c AMENDMENT (Session 55). Owner/Admin/PM all create+send.]
| Approve sub pay apps (review step) | ✓     | ✓     | ✓   | —       |
| Approve estimates for sending      | ✓     | ✓     | ✓   | —       |
| Approve foreman timesheets         | ✓     | ✓     | ✓   | —       |
| Approve crew timesheets            | ✓     | ✓     | ✓   | ✓       |
| Invite users (non-Admin)           | ✓     | ✓     | —   | —       |
| Delete files                       | ✓     | ✓     | ✓   | —       |
| Edit company settings              | ✓     | ✓     | —   | —       |

---

## Built-In Workflow Automations

See [docs/roadmap/FrameFocus_Quick_Reference.docx](docs/roadmap/FrameFocus_Quick_Reference.docx) → "Automated Workflows" for the full list.

## **Admin role in workflows:** Admin matches Owner throughout EXCEPT (a) final payment release, (b) owner-only approval of client-facing AI content, (c) billing/subscription actions. Admin receives all Owner notifications and can act on Owner's behalf for operational matters.

## AI Integration Rules

1. **AI drafts, humans approve.** Nothing client-facing or financially significant ships without human review.
2. **Owner-only approvals:** AI weekly client summaries, marketing content for publishing, and AI-drafted financial narratives that affect billing require **Owner** approval specifically. Admin cannot approve these.
3. **Admin-or-Owner approvals:** AI line item suggestions in estimates, AI-drafted daily log summaries, AI punch list proposals, and AI anomaly flags can be reviewed and approved by **Owner or Admin**.
4. **Exception: AI photo auto-tags apply instantly.** Auto-tagging is internal organization, not client-facing. Tags are editable by any team member who can view the file. No approval queue needed.
5. **Historical data powers suggestions.** Estimating AI uses pgvector embeddings of completed job line items.
6. **Company context included in all prompts.** Trade type, region, typical project size, approved brand voice.
7. **Approval queue for all AI outputs.** Weekly summaries, social posts, report narratives all go through a review step before anything reaches a client.

---

**Reference Implementation — `apps/web/lib/services/ai-tagging.ts`**

Module 3H patterns for every future AI feature (Module 4 estimating, 9 client summaries, 10 NL queries, 11 marketing):

1. Lazy client via `getOpenAI()` — never instantiate at module load (build crash if env var missing).
2. Cost log on every call (success and failure) into `ai_*_logs` — failed calls still cost money.
3. Bail-early pre-flight ordered cheapest → most expensive: auth → DB row → MIME → add-on flag → config → OpenAI.
4. Validate LLM output against a known allowed set; discard anything else (security property — prevents prompt-injection-style pollution).
5. Log `response.model` (the resolved version like `gpt-4o-2024-08-06`), not the request alias.
6. No retry logic in v1 — risk of double-charging. Use a manual retry button or background queue if needed.

**Testing AI features.** GPT-4o is non-deterministic even at temperature 0.2. Tests assert structure (well-formed, validation discarded unknowns, output ≤ cap, cost row inserted), not exact content.

## Instruction Preferences

When generating code, migrations, or instructions for Josh:

- **Step-by-step, click-level guidance.** Don't assume familiarity with dev tooling.
- **Explicit file paths.** Always state exactly which file to create/edit and where.
- **One thing at a time.** Don't bundle multiple changes into a single instruction block. Break them into numbered steps.
- **Paste-ready code.** Code blocks should be complete and copy-pasteable, not fragments requiring assembly.
- **Browser-based workflow.** All instructions assume GitHub Codespaces. Never reference local terminal, VS Code desktop, or local file system.
- **Avoid shell heredocs for any multi-line file content.** Known failure cases: JSX files (heredocs eat `<a` tags and cause build failures) and SQL migration files (a multi-line SQL heredoc was silently mangled on a migration in Session 12). Use Node.js fs.writeFileSync() or create files directly in the Codespace editor instead.

---

## Environment & Accounts

## See [STATE.md](STATE.md) → "Environment Variables" and "Infrastructure" / "Test Data" sections. Single source of truth lives there.

## Reference Documents

- `docs/roadmap/FrameFocus_Platform_Roadmap.docx` — primary roadmap (all 11 modules, workflows, AI, roles, dependencies)
- `docs/roadmap/FrameFocus_Quick_Reference.docx` — scannable summary of features and workflows
- `docs/roadmap/FrameFocus_Platform_Roadmap.xlsx` — planning spreadsheet
- `docs/sessions/contextN.md` — one per session; read the most recent at session start
- `STATE.md` — live repo state; tech debt in `TECH_DEBT.md`

```

```
