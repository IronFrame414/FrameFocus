# docs/claude/platform.md

> Project overview, stack, the PWA ruling, monorepo, dev environment, modules, AI rules. Verbatim from CLAUDE.md (main `80e15bad`).
> **Nothing here was rewritten.** CLAUDE.md carries the operative statement and links here.


<!-- CLAUDE.md lines 9–19 -->

## Project Overview

**FrameFocus** is a subscription-based construction management SaaS platform for residential and commercial contractors. It covers the full business lifecycle: lead capture → estimating → project management → field operations → job finances → inventory & tools → client experience → business intelligence.

**Owner:** Josh Bishop (jsbishop14@gmail.com)
**Repo:** github.com/IronFrame414/FrameFocus (private)
**Live URL:** https://frame-focus-eight.vercel.app
**Status:** Modules 1, 2, and 3 complete. Platform has 11 modules total. See STATE.md for live build status.

> **See also:** [`CLAUDE_MODULES.md`](CLAUDE_MODULES.md) — Detailed module designs (Modules 3, 6, 8, 9), QuickBooks integration strategy, and change order workflow. [`docs/module4-architecture.md`](docs/module4-architecture.md) — Module 4 (Sales & Estimating) architecture (separate file due to size).


<!-- CLAUDE.md lines 29–75 -->

## Technology Stack

| Layer             | Technology                                                         | Notes                                                           |
| ----------------- | ------------------------------------------------------------------ | --------------------------------------------------------------- |
| Web Frontend      | Next.js 14 + React + TypeScript + Tailwind CSS + shadcn/ui         | Office users (estimators, PMs, owners)                          |
| Mobile Frontend   | **PWA (the Next.js web app, installed to the home screen)**        | Field crew (techs, foremen) — **RULED [S97, 2026-08-03]**       |
| Shared Logic      | TypeScript packages in monorepo                                    | Types, validation, business logic shared across web + mobile    |
| Backend / DB      | Supabase (PostgreSQL + Auth + Storage + Realtime + Edge Functions) | Multi-tenant with RLS                                           |
| AI                | OpenAI API (GPT-4o vision + text) + Supabase pgvector              | Estimating, photo auto-tagging, reporting, summaries, marketing |
| Payments          | Stripe Billing + Stripe Connect                                    | Subscriptions + contractor-to-client payments                   |
| Accounting        | QuickBooks Online API (OAuth 2.0)                                  | Sync only — FrameFocus runs operations, QB runs the books       |
| Web Hosting       | Vercel                                                             | Auto-deploy from main branch                                    |
| ~~Mobile Builds~~ | ~~Expo EAS~~ — **SUPERSEDED [S97]**                                | No app-store build pipeline. See the PWA ruling below.          |
| CI/CD             | GitHub Actions                                                     | Lint, test, build verification                                  |
| Monorepo          | Turborepo                                                          | Multi-package management                                        |
| Email             | Resend                                                             | Transactional emails                                            |
| E-Signatures      | DocuSign API or BoldSign                                           | Proposals, change orders, lien releases                         |
| Doc Generation    | React-PDF or Puppeteer                                             | PDF estimates, invoices, reports                                |

**Language:** TypeScript everywhere — web, mobile, backend, shared.

### MOBILE IS A PWA, NOT REACT NATIVE — **RULED [Josh, S97, 2026-08-03]**

_Superseded rows, quoted rather than silently rewritten:_
_`| Mobile Frontend | React Native + Expo | Field crew (techs, foremen) |`_
_`| Mobile Builds   | Expo EAS            | Cloud iOS/Android builds + OTA updates |`_

**The mobile experience is the existing Next.js web app, delivered as a PWA and installed to the
home screen.** There is no React Native app and no app-store presence.

**Josh's reasons, as given:**

1. **He does not want to deal with the app store at this time.** No review cycles, no store listings,
   no separate release train.
2. **iOS requires a home-screen install for Web Push anyway** (Safari 16.4+ delivers push only to an
   installed PWA). So the PWA path is not merely an alternative to React Native — it is the
   **precondition for notifications on iPhone**, which is the next project after the mobile UI.

**What this changes:** `apps/mobile/` (Expo skeleton) is **PARKED, not deleted** — see
`apps/mobile/README.md`. The "React Native (Mobile — Expo)" conventions section below is superseded
and retained only as a record of the abandoned direction. Anything a spec previously deferred to
"the mobile app" now belongs to the web app's responsive/offline work.

**What is NOT decided by this ruling:** whether the mobile UI is a **repair of the existing
dashboard shell** or a **separate route tree for phones**. TECH_DEBT #101 assumed repair. That is
Josh's next decision and is recorded as OPEN in #101.


<!-- CLAUDE.md lines 107–176 -->

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
│   └── mobile/               # PARKED [S97] — Expo skeleton, superseded by the PWA ruling
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


<!-- CLAUDE.md lines 401–410 -->

## Platform Modules

11 modules total, built in a strict dependency chain. **Module 8 (Inventory & Tools) was inserted in Session 6 planning, bumping the previous 8/9/10 to 9/10/11.**

Status → [STATE.md](STATE.md). Module list and details → [CLAUDE_MODULES.md](CLAUDE_MODULES.md), [docs/module4-architecture.md](docs/module4-architecture.md), [docs/roadmap/FrameFocus_Quick_Reference.docx](docs/roadmap/FrameFocus_Quick_Reference.docx).

**Cross-cutting:** AI Layer (see AI Integration Rules below), Workflow Engine (Supabase Webhooks + Edge Functions, Phase 2+), QuickBooks Integration (Modules 6 & 7 — see CLAUDE_MODULES.md).

**Spec completeness rule (added 2026-07-20, Session 86).** Every module spec must include a UI section — screens, roles, entry points, nav placement — before the spec is considered complete. No UI build proceeds from a schema/service-only spec. UI gaps discovered at build time (the S85/S86 6A experience: interim nav links, a nav reindex owed against a stale handoff, screens specced after the schema shipped) are the failure this prevents.


<!-- CLAUDE.md lines 860–884 -->

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
