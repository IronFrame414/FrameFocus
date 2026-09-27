# docs/claude/conventions.md

> Sections kept in CLAUDE.md, in their original wording, so a compressed line can always be checked against the original. Verbatim from CLAUDE.md (main `80e15bad`).
> **Nothing here was rewritten.** CLAUDE.md carries the operative statement and links here.


<!-- CLAUDE.md lines 20–28 -->

## Claude Code MCP Servers

Two MCP servers are standard for this repo:

- **Context7** — fetches live, version-specific docs at query time. **Trigger:** before writing or modifying code that touches Next.js, Supabase, Stripe, Tailwind, or Turborepo APIs. Solves training-cutoff hallucinations on the stack.
- **Serena** — symbol-level code navigation (find_symbol, find_referencing_symbols, insert_after_symbol). **Trigger:** before reading whole files for cross-file refactors, renames, or "where is this used" lookups. Cuts token use; catches references whole-file reads miss.

## Install commands and Codespace rebuild behavior: see STATE.md → "Claude Code MCP setup."


<!-- CLAUDE.md lines 538–555 -->

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


<!-- CLAUDE.md lines 570–588 -->

### API / Data Layer

- Supabase client initialized once per app in a shared provider
- All database calls go through service modules: `services/contacts.ts`, `services/estimates.ts`, etc.
- Never call Supabase directly from components — always through a service function
- Edge Functions for server-side logic that can't run on client (webhook handlers, AI calls, PDF generation)
- API errors never name a cause that hasn't been verified. Auth and permission failures return 401/403 with their own message — never fall
  through to a "not found" path. A "not found" response means auth passed and the record genuinely doesn't exist.
- Every error response logs the real cause server-side with the route and the failing check. The client message may be generic; the log never is.

### Git Workflow

- `main` branch is production (auto-deploys to Vercel)
- `dev` branch for integration
- Feature branches: `feature/{module}-{description}` (e.g., `feature/contacts-csv-import`)
- Commit messages: `[Module] Description` (e.g., `[Contacts] Add CSV import with field mapping`)

---


<!-- CLAUDE.md lines 854–859 -->

## Built-In Workflow Automations

See [docs/roadmap/FrameFocus_Quick_Reference.docx](docs/roadmap/FrameFocus_Quick_Reference.docx) → "Automated Workflows" for the full list.

## **Admin role in workflows:** Admin matches Owner throughout EXCEPT (a) final payment release, (b) owner-only approval of client-facing AI content, (c) billing/subscription actions. Admin receives all Owner notifications and can act on Owner's behalf for operational matters.


<!-- CLAUDE.md lines 908–936 -->

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
- `STATE.md` — live repo state; tech debt is split across `TECH_DEBT.md` (OPEN — owed work, and the numbering authority), `TECH_DEBT_CLOSED.md` (closed), and `TECH_DEBT_IDEAS.md` (deferred decisions). A number lives in exactly one; each file cross-links the other two.
- `GATED.md` — register of gated/blocked work: what is blocked, behind what, and what unblocks it (Pre-M9 gate, test identities, 7D–7H readiness, deferred-by-decision, standing rulings)

```

```
