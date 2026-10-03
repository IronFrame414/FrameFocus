# CLAUDE.md — FrameFocus Development Guide

> **Read this before every session.** It holds the rules in their operative form. Each section links
> to its **full, verbatim text** in [`docs/claude/`](docs/claude/): the rationale, the incidents, the
> superseded wording. Restructured S112 (936 → under 350 lines); nothing was deleted. The audit:
> [`docs/claude/AUDIT-S112.md`](docs/claude/AUDIT-S112.md). Update history: [`history.md`](docs/claude/history.md).

## Project

**FrameFocus**: subscription construction-management SaaS for residential and commercial contractors.
It covers lead capture → estimating → project management → field ops → job finances → inventory →
client experience → business intelligence. 11 modules; live status in [STATE.md](STATE.md).

**Owner:** Josh Bishop (jsbishop14@gmail.com) · **Repo:** github.com/IronFrame414/FrameFocus (private)
· **Live:** https://frame-focus-eight.vercel.app · Module designs: [`CLAUDE_MODULES.md`](CLAUDE_MODULES.md),
[`docs/specs/module4-architecture.md`](docs/specs/module4-architecture.md). Full text: [`platform.md`](docs/claude/platform.md).

## MCP servers

**Context7** (live docs): use it **before code touching Next.js, Supabase, Stripe, Tailwind or
Turborepo APIs**. **Serena** (symbols): use it **before whole-file reads for refactors, renames, and
"where is this used"**. Setup: STATE.md → "Claude Code MCP setup."

## Stack

TypeScript everywhere:
- **Web:** Next.js 14 (App Router) + Tailwind + shadcn/ui. **Mobile: a PWA** (below).
- **Shared:** `packages/shared` (types, Zod, pure logic).
- **Backend:** Supabase (Postgres, Auth, Storage, Realtime, Edge Functions; RLS multi-tenant).
- **AI:** OpenAI GPT-4o + pgvector.
- **Money:** Stripe Billing + Connect. QuickBooks Online is **sync only** (FrameFocus runs
  operations; QB runs the books).
- **Delivery:** Vercel (auto-deploys `main`), GitHub Actions, Turborepo.
- **Services:** Resend; DocuSign or BoldSign; React-PDF or Puppeteer.

### Mobile is a PWA, not React Native — **RULED [Josh, S97]**

The mobile experience is the Next.js app, installed to the home screen. There is no React Native app
and no app-store presence. The two reasons: Josh does not want to deal with the app store, and **iOS
delivers Web Push only to an installed PWA.** `apps/mobile/` is **parked, not deleted**. OPEN: the
mobile UI is either a repair of the dashboard shell or a separate route tree (#101). Full text and the
superseded rows: [`platform.md`](docs/claude/platform.md), [`superseded.md`](docs/claude/superseded.md).

## PARITY: one feature, both surfaces, same behaviour — **RULED [Josh, S122]**

Anything viewable on desktop and mobile **behaves the same on both**. Layout may differ; what gets
written, the rules, what an error means, and what the user ends up with may not. (#129: two markup
editors disagreed about what a save produces, and an annotated photo showed unannotated elsewhere,
silently.)

- **Share the mechanism, not just the intent.** A second implementation that "does the same thing"
  *is* the divergence.
- **A helper under `app/m/` or `app/dashboard/` claims that surface owns it.** If both need it, it
  belongs in `lib/`.
- **The rules live below the UI**, in RLS, a service function, or a shared util.
- **When surfaces must genuinely differ, say so where the code is**, with the reason (e.g. `/m`
  opens files inline; desktop appends `?download=`, M6M §4.11.16).

Full text: [`rules.md`](docs/claude/rules.md).

## Environment

GitHub Codespaces only; no local environment. Node 20. Supabase via the dashboard plus the CLI.
Vercel auto-deploys `apps/web` from `main`. Monorepo layout: `apps/web` (Next.js), `apps/mobile`
(parked), `packages/shared` (types, validation, constants, utils), `packages/supabase`,
`supabase/migrations` (14-digit timestamps), `docs/`, `scripts/`. Full tree:
[`platform.md`](docs/claude/platform.md).

### Codespaces gotchas (full text: [`gotchas.md`](docs/claude/gotchas.md))

- `.env.local` is gitignored and **does not survive a rebuild**. Recreate it from the Vercel env vars.
- **Heredocs eat `<a` in JSX and have mangled a SQL migration.** Write files with Claude Code or
  `fs.writeFileSync`.
- **Claude Chat strips `<` when code is pasted.** Bash history expansion eats `!`, even inside double
  quotes; use `set +H` or single quotes.
- The web editor truncates long pastes (paste in two parts). Browser drag-drop misses (use
  right-click → Upload). The anon key is `sb_publishable_…`. Storage rejects `<` and `>` in keys.
  **Signed URLs are inline**; append `?download=<name>` to force a download.
- **`SET row_security TO 'off'` inside a SECURITY DEFINER trigger is silently ignored.** Put the
  RLS-protected query in a separate **SQL** (not plpgsql) SECURITY DEFINER function and call that.
  Reference: `get_invitation_for_signup()` (Migration 015).
- **Context files describe intent; git describes state.** Run `git log --oneline -15` at session
  start.
- ⚠️ **Dev-mode first-hit timings are Next.js compilation, not latency.** Measure only against
  production or `next build && next start`. That trap burned four sessions; it is RULED CLOSED
  (S179, `GATED.md`).

## Run protocol

**Launch:** `claude --dangerously-skip-permissions`, set at launch. Permissions also come from
`.claude/settings.json`.

- **Phase 0, BRANCH:** `git branch --show-current`. If it says `main`, create
  `feature/<short-task-name>` **before any edit**. Never edit, create or migrate on `main`, because it
  auto-deploys to production. Merging to `main` is Josh's call.
- **Phase 1, ANALYZE:** read the prompt and every file it references. No edits.
- **Phase 2, QUESTIONS:** surface every question and spec↔schema conflict at once, then STOP and wait.
  If there are none, say so and continue.
- **Phase 3, BUILD:** do all the reads and edits autonomously and show the diffs. **Attended: never
  commit; Josh commits.** Unattended: see below.

### Unattended runs commit after each discrete step — **RULED [Josh, S173]**

A step is one finding, one fix, or one battery check: the smallest unit still worth having if the next
step never ran. **Commit it path-scoped, then push the FEATURE branch to origin, after every commit.**
The Codespace has destroyed unattended work at least twelve times, and a local branch dies with the
box. **Attended: Josh commits and CC never pushes. Unattended: CC commits and pushes the feature
branch.** In both: never push to `main`, never `git add -A` over an unrelated tree, and merging is
Josh's. Full text: [`rules.md`](docs/claude/rules.md).

### CC may merge to `main` without approval when three conditions hold — **RULED [Josh, S180]**

Narrows "merging is Josh's call", and only that. CC merges a feature branch to `main` without a
round-trip when **all three** hold, else it stays Josh's explicit call: (1) **CI green on the branch
rebased onto CURRENT `main`** — a green run on a stale base does not count. **Tree-identity
exemption:** a green run PLUS a proof the rebased tree is byte-identical to the tested tree *outside a
delta that build, tests and runtime never read* also satisfies (1). The delta is defined by
**EXCLUSION, not intuition**: it may touch ONLY `docs/` and root-level `*.md`; any path under `apps/`,
`packages/`, `scripts/`, `supabase/` or `.github/` disqualifies it (`.github/` especially — a workflow
change IS a change to what CI does). The merge message AND the report must state the proof — the full
changed-path list and the command used — because "it's docs-only" is a claim and the file list is the
evidence. (2) **every agreed check
passed, with its measurement stated** (the number, not an assertion); (3) **⚠️ every migration the
branch carries is ALREADY on production, verified by object — never waived** (deploying code ahead of
its migration errors real users). Only the approval round-trip changed; **applying a migration to
production is still Josh's action**, so a migration-bearing branch cannot merge until he has. Full
text: [`rules.md`](docs/claude/rules.md).

### CI speed: measure first; coverage is never the price — **RULED [Josh, 2026-10-03, S127]**

**Never optimise CI on a guess** (the 2026-09-29 performance diagnosis was one). Break a run down before changing
it: wall time, setup vs test execution, the slowest specs, peak DB connections, and say which number came from
logs and which from instrumentation. Baseline (S127, run `37130101549`): **32.7 of ~36 min is the Playwright
step; 28.1 min of that is inside tests** (727, ~2.3 s each), 4.5 min hooks/setup (3.2 of it the S111 thumbnail
fixtures). **`workers: 1` is a ruling, not an accident** (`ci.yml`, TECH_DEBT #150, CI #201): every speedup that
runs tests concurrently against the one rebuild-test DB reintroduces assert-absence/count collisions.
- ❌ **REJECTED, do not re-propose: a test SUBSET on branches with the full suite only on `main`.** The `main`
  run is skipped by tree identity, so nothing would ever catch what the subset missed.
- **The ranked backlog, in order:** (1) a reproducible e2e seed (#149) + per-worker namespaced fixtures, then
  `workers > 1`, test count proven identical before/after; (2) CI's own database (one per run, or a second
  project) — the root of both red classes; (3) shard across jobs, **only after (2)**; (4) Codespace idle
  timeout / machine size (Josh decides). A bigger runner buys little while `workers: 1` holds; re-assess after (1).
Full text: [`rules.md`](docs/claude/rules.md).

### Questions are asked in plain text, never the interactive picker — **MANDATORY [Josh, S180]**

Every question to Josh goes in the FINAL message of a turn, as plain text, then the turn ends. Never
`AskUserQuestion`, never a one-answer-at-a-time chooser. Why: the picker delivers one question per
turn (six questions → six round-trips); Josh is notified only when a turn ENDS, so it leaves the
session idle; its options are not quotable, so a conditional ruling flattens to a bare choice; and the
returned ruling loses the question ("Q3: option A" is useless later). Shape: `Qn. [ASK-n] <question in
full, assume no memory> / Options: A) … B) … / My recommendation: <which, why>`. State EVERY question
in full, ask all of a turn's at once, then end the turn. Full text:
[`rules.md`](docs/claude/rules.md).

### The thing inspected must be the thing being judged — **MANDATORY [S108/S122]**

Before stating a result, name what produced the evidence and confirm it is the thing in question. The
instruments that have lied here:

a **wrapper's status** (`tail`, `echo`, `time`, a task summary); **truncated output** (a grep through
`head`); a **script that threw** and fell through to a conclusion; an **absent tool** ("no output" is
not "no result"); a **cached result** (a Turbo hit is not a run); the **wrong scope** (Prettier on a
`/tmp` copy); a **probe that cannot fail**. **State row counts, and run a control that must fire.**

**An off-project negative written with `.insert().select()` measures the READ policy, not the write policy: write without returning rows, and count with the service role.** [Josh, S181c; `#2-pe`]

The exit-status rules:

1. **Never judge through a pipe.** Use `cmd > log 2>&1; echo $?` immediately, or `set -o pipefail`,
   or read `${PIPESTATUS[0]}`.
2. **Print the real code and read that line.** `cmd; echo "exit: $?"` reports the echo's status.
3. **Corroborate with an independent tally**: a `✘` count or a test total.
4. **Never `pkill -f <pattern>`.** It can match its own shell. List the PIDs and `kill <PID>`,
   excluding `$$` (`scripts/e2e-preflight.sh`).

In CI a masked failure ships red as green. `ci.yml` sets `bash -euo pipefail`, but nothing closes the
trailing-command case except not writing it. Full text: [`rules.md`](docs/claude/rules.md).

### Audit by what is CALLED, not by what matches a catalog filter — **MANDATORY [Josh, S180]**

Same family as above. A catalog query (`prosecdef`, a name pattern, a schema, a table list) defines a
set by a property, which is **not** the set of things that run. Two overloads share a name; one is
live, one is dead, and the filter cannot tell you which. **Cross-reference every enumeration against
actual call sites**, and ask what the filter EXCLUDED that shares a name or job with what it included.
Instance: the S180 `authenticated`-writer audit read all 39 `prosecdef` functions; `create_safety_incident`'s
live 7-arg SECURITY INVOKER path was outside the filter and never read — RLS-safe by luck, not method.
Report the excluded set as a stated residual, never as covered. Full text:
[`rules.md`](docs/claude/rules.md).

### A fix session sweeps for EXISTING tests of the behaviour it overturns — **MANDATORY [Josh, S157]**

Changing a rule (a policy, a floor, a constraint, a ruling) is not finished when your own probes are
updated. **Grep the table, column, policy or function across `apps/web/test/`, `apps/web/e2e/` and
the specs. Read the describe and it TITLES.** Assume a partially-stale file is still green (it goes
red only on the roles you changed). **Invert, do not delete.** And check any assertion named
"default", "none" or "never": it must read the schema, not a mutable row. (S154/S121: a file titled
"contact_addresses SELECT is NOT floored" stayed green through two audits.) Full text:
[`rules.md`](docs/claude/rules.md).

### A `.limit(1)` is ORDERED, or SCOPED to what the caller depends on — **MANDATORY [Josh, S165]**

An unordered `.limit(1)` returns heap order, which shifts on any update. Every one is one of three:

1. **Ordering fixes it.** Any stable row will do, so add `.order(…)`.
2. **Ordering does NOT fix it.** Downstream code relies on a property (a role, an author, an
   assignment, a status) the query never filtered for. **Scope it** with that `.eq`/`.in`/`.not`. This
   is the category that keeps recurring. A silent early-out on a wrong pick is an untested run.
3. **Genuinely arbitrary.** Leave it, **with a one-line comment saying so**.

This applies to `app/` and `lib/`, not only tests. Full text: [`rules.md`](docs/claude/rules.md).

### Never reformat a file the repo does not already format — **MANDATORY [Josh, S112]**

**Run a formatter only on files already formatted on main, and only on the lines you changed.**
First run `npx prettier --check` on the file **as it is on main**. If that fails, match its style by
hand. **An unreviewable diff is where authority errors hide.** At S112, `prettier --write` buried
about 40 real lines in about 1,300 lines of reflow. The cleanup then used zero-context patches, which
moved `canRecordPayment`'s body into `canIssueRefund`, **giving the Project Executive refund
authority**. It compiled, and no test failed. Only checking every file against the intended change
caught it.

- If a file's changed-line count is far larger than your edit, **stop**.
- **Never apply `--unidiff-zero` patches to code.** Rebuild from the pre-edit file against anchors
  that must match exactly once.
- **An authority change needs its negative asserted** (see the next rule).

Full incident: [`rules.md`](docs/claude/rules.md).

### Role-permission tests are TOTAL maps — **MANDATORY [Josh, S112]**

A test deciding a role's permission states the answer for **every** role, as a
`Record<CompanyRole, T>` through `forEveryRole()` (`apps/web/test-support/role-matrix.ts`), plus
`JUNK_ROLES`, which must fail closed. Test files are type-checked in CI, so **adding a role fails to
compile until every permission states its answer.** Assert the deny as well as the allow. (The
hand-listed `canIssueRefund` test said nothing about the Project Executive.) Full text:
[`rules.md`](docs/claude/rules.md).

### Tech-debt numbering — **RULED [Josh, S136]**

**Never allocate a bare `#N` on a branch.** File as `#N-<branch-tag>` (`#12-notif`), numbered from 1
within the branch. Convert to a real number **when the branch lands**, taking the next free number
from main's `TECH_DEBT.md`, and update its cross-references in the same commit. Full text:
[`rules.md`](docs/claude/rules.md).

## Database (full text and SQL templates: [`database.md`](docs/claude/database.md))

- **Every table has `company_id`; RLS is on every table, no exceptions.** Policies use
  `get_my_company_id()`.
- **Storage policies must use an inline subquery, not the helper.** In `storage.objects` the helper
  silently returns NULL:
  `(storage.foldername(name))[1]::uuid = (SELECT company_id FROM profiles WHERE id = auth.uid())`
  (migrations 013 and 017).
- **Naming:** plural snake_case tables; `{singular}_id` FKs; `idx_{table}_{column}`;
  policies `{table}_{action}_{role}`.
- **Standard columns:** `id`, `company_id`, `created_at`, `updated_at`, `created_by`, `updated_by`,
  `is_deleted`, `deleted_at`. **Soft delete only.**
- **Every new per-tenant table, in its creating migration:** defaults `company_id =
  get_my_company_id()`, `created_by`/`updated_by = auth.uid()` (without them client INSERTs fail RLS
  with a 403), plus the `{table}_updated_at` trigger and `{table}_set_updated_by` /
  `set_{table}_updated_by()`.
- **Service code never sets `updated_at` or `updated_by`.** The triggers do. Known holdover:
  `companies`.
- **Append-only logs** (`ai_tag_logs`, `trial_emails`) omit `updated_*`, `created_by` and the
  soft-delete columns, and have SELECT and INSERT policies only.
- **Cost columns are `NUMERIC(10,6)`.** Audit-log FKs to deletable rows are `ON DELETE SET NULL`.
- **Trash bin:** RLS does not filter `is_deleted`. `get{Entity}s()` filters it out, `get{Entity}(id)`
  does not, and `getTrash()` returns only deleted rows. Reference: `lib/services/files.ts`.
- **Generated types** (`packages/shared/types/database.ts`): after any column or table change, run
  `npm run db:push` and commit `database.ts` with the migration. Never hand-write DB shapes. Use
  `Pick<>` for column selects and `Omit<Row> +` intersection to restore CHECK literal unions (the
  generator emits `string`). `*-client.ts` files **re-export** types, never redefine them.
- **Service layer:** server reads live in `lib/services/{entity}.ts`, client writes in
  `{entity}-client.ts`. `next/headers` can never reach a client component; use `import type` across
  the boundary. `getStripe()` and `getSupabaseAdmin()` are lazy.

## Code conventions

- **TypeScript:** strict; no `any` (use `unknown` and narrow); interfaces for shapes; Zod schemas in
  `packages/shared/validation/`; `import type` across the server/client boundary.
- **React:** App Router; Server Components by default and `"use client"` only for interactivity;
  shadcn/ui + Tailwind; kebab-case files; colocate component files.
- **Data:** every DB call goes through a service module, never from a component. Edge Functions for
  server-only logic.
- **Errors:** an error never names an unverified cause. Auth/permission failures are 401/403 with
  their own message and never fall through to "not found". **Every error response logs the real
  cause server-side** with the route and the failing check.
- **Git:** `main` is production. Feature branches are `feature/{module}-{description}`. Commits are
  `[Module] Description`.

## Roles (full text, every banner and history: [`roles.md`](docs/claude/roles.md))

**Two separate layers.** **Platform admins** live in `platform_admins`, reach `/admin`, and have no
company. **Company users** are tenant-scoped:

| Role | DB value | Web | Key permissions |
| --- | --- | --- | --- |
| Owner | `owner` | Full | Everything, including billing and the owner-only list below |
| Admin | `admin` | Full | Owner minus money-out/billing minus promoting Admins |
| Project Manager | `project_manager` | Assigned projects | Estimates, projects, COs, client comms; **actual + committed cost only** |
| Foreman | `foreman` | Limited | Crews, daily logs, crew scheduling, punch, QC; **actual cost only** |
| Crew Member | `crew_member` | Minimal | Clock in/out, logs, photos, tasks |
| Client | `client` | Portal only | Timeline, photos, selections, signing, payments |

### Roster Visibility Floor — **RULED [Josh, S131]**

`DASHBOARD_ROLES` is enforced by `lib/dashboard-access.ts` in both `middleware.ts` and the
`/dashboard` layout. A `subcontractor` goes to `/m/projects`; a `client` goes to the portal
placeholder. **A redirect protects no data**, so the data floor is RLS
(`20260911000000_roster_visibility_floor.sql`):

| Role | Team roster | `contacts` | `subcontractors` |
| --- | --- | --- | --- |
| subcontractor | Owner, Admin, PM only | none | none |
| client | none | none | none |
| the 5 dashboard roles | unchanged | unchanged | unchanged |

**Every role can always read its own row.** Traps: **the roster is TWO tables** (`profiles` and
`company_members`); **permissive policies OR together**, so a narrower third policy changes nothing.

### Financial Visibility Floor — **RULED [Josh, S150]**

**Owner and Admin see contract, budget, sell and CO dollar figures. A Project Manager sees actual and
committed cost. Foreman and crew see actual cost only.** The S150 decision narrowed foreman
deliberately. It is not a drift: `#1-m7cpl` is CLOSED, and `budgetColumnsFor()` gives full 7 /
committed 5 / actual_only 3 / none.

- **Gated from PM, foreman and crew:** contract value (`project_financials.contract_value`),
  budgeted/sell (`project_budget_amounts.budgeted_amount`), rates (`instrument_rates`), variance,
  margin, and CO dollars (`change_orders.net_delta`).
- **Visible to all:** actual and committed cost (`project_budget_items`, which has **no role floor
  in RLS, and must keep none**), and non-dollar facts.
- **A PM sees only invoices they AUTHORED** (`author_member_id`). Payments and every AR aggregate are
  Owner/Admin. That overturned the S97 carve-out.

| Figure | Enforcement |
| --- | --- |
| Contract value | **DB**, Owner/Admin: `project_financials` (20260811…, 20260812…) |
| Budgeted amount | **DB**, Owner/Admin: `project_budget_amounts` (20260816…, 20260817…) |
| Rates | **DB**, Owner/Admin SELECT (20260806…) |
| CO dollars | **Partly DB.** `change_orders_select_visible` admits Owner/Admin plus a PM on **their own** COs only (20260830…); foreman, crew and subs read none. A PM seeing `net_delta` on their own CO is deliberate (#117). **[S112 R5b] Every staff role now sees that APPROVED COs exist — number, title, description, date, NO money — via `get_approved_change_order_summaries()` (20261840…); a no-price hint guards title+description. Re-measure at 20 signed COs (#1-cosum). Full text: [`roles.md`](docs/claude/roles.md).** |

**Do not "finish" this by flooring `change_orders`** without reading #117. The obvious fix breaks CO
authoring for PMs.

### A client is a counterparty, not staff — **RULED [Josh, S164]**

The Floor governs staff. A client sees **more** than a PM on cost-plus and T&M, and **less** on lump
sum:

| Instrument | The client sees |
| --- | --- |
| Cost-plus | Budgeted, actual, markup %, hourly rate, line totals, category and project totals. **Not** committed. |
| T&M | What the company paid, the markup %, and the total billed, with the pre-markup figure beside it |
| Lump sum | The total billed, by bill. No line prices, no cost basis. |

**A lump-sum job can carry a T&M change order, and the CO's rule follows the CO**, so never assume one
visibility setting per project. **"They see what is on the invoice"**: `invoices.presentation_level`
is the single source of truth, and the portal aggregates it. **Enforced in the DB:** the client's
`invoice_lines` arm requires `presentation_level = 'full_detail'`.

### The Admin Role Principle

**Admin = Owner minus money minus Admin promotion.** Unless an action is on this list, Admin can do
it. Owner-only:

(1) billing and subscription; (2) promoting to Admin; (3) transferring ownership; (4) connecting or
disconnecting QuickBooks; (5) releasing final sub payments; (6) approving client-facing AI weekly
summaries; (7) approving marketing content; (8) deleting the company.

When unsure, the default is "Owner + Admin".

| Approval | Owner | Admin | PM | Foreman |
| --- | --- | --- | --- | --- |
| Billing · Promote to Admin · Connect QB · Release sub payments · AI weekly summaries · Marketing | ✓ | — | — | — |
| Sub pay apps (review) · Estimates for sending · Foreman timesheets | ✓ | ✓ | ✓ | — |
| Crew timesheets | ✓ | ✓ | ✓ | ✓ |
| Invite users (non-Admin) · Edit company settings | ✓ | ✓ | — | — |
| Delete files | ✓ | ✓ | ✓ | — |

The old "CO final approval: Owner" row is **superseded**: Owner, Admin and PM all create and send COs
(module5 §5.7c, S55). In workflows, Admin matches Owner except final payment release, owner-only AI
approvals, and billing. The automated workflows are listed in `docs/roadmap/FrameFocus_Quick_Reference.docx`.

## AI rules (full text: [`platform.md`](docs/claude/platform.md))

**AI drafts, humans approve.** **Owner only:** weekly client summaries, marketing, and billing
narratives. **Owner or Admin:** estimate line suggestions, daily-log summaries, punch proposals and
anomaly flags. **Photo auto-tags apply instantly.** Every prompt carries company context; every output
goes through an approval queue.

The reference implementation is `lib/services/ai-tagging.ts`: a lazy `getOpenAI()`; a cost log on
success **and** failure; a bail-early order (auth → row → MIME → add-on → config → OpenAI); validation
against an allowed set; `response.model` logged; no auto-retry. Tests assert structure, not content.

## Instructions for Josh

Step-by-step, click-level guidance with explicit file paths, one thing at a time, and paste-ready
code, assuming Codespaces in a browser. **No heredocs for multi-line file content.**

## References

Env, infrastructure and test data: [STATE.md](STATE.md). Tech debt: `TECH_DEBT.md` (open, and the
numbering authority), `TECH_DEBT_CLOSED.md`, `TECH_DEBT_IDEAS.md`. Gated work: `GATED.md`. Roadmap:
`docs/roadmap/`. Sessions: `docs/sessions/contextN.md` (read the latest). **Full rules and history:**
[`docs/claude/`](docs/claude/) (`rules.md`, `roles.md`, `database.md`, `platform.md`, `gotchas.md`,
`conventions.md`, `superseded.md`).
