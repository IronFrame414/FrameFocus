# S125 — Performance audit, the STATIC half

> **An audit. It fixes nothing.** Code reading, repo/config inspection and one local `next build`.
> No timing was taken, no database was queried, no Supabase CLI command was run, no CI was triggered.
> Spec: `docs/specs/performance-audit-spec.md` (read from commit `401c4690` on
> `origin/feature/s124-qb-timesheets`; it is not on `main`). Running order: `docs/sessions/S125-prompt.md`.

**Ref every finding was taken on:** branch `feature/s125-perf-audit-static`, cut from `main` @ `91fa32e1`.
The branch adds only `docs/sessions/` files, so **application code = `main` @ `91fa32e1`**.

**Status: IN PROGRESS** — sections are filled as they complete; this line is removed when the report is final.

---

## ⚠️ AREA A FIRST — the database and the functions are in the SAME region

**Supabase production `us-east-1` (N. Virginia); Vercel functions `iad1` (Washington DC / N. Virginia).
Same region. There is no cross-region toll.** The cost per screen is the **number** of round trips, not
their distance — which is what Areas B and G are about.

---

## A — Where the data physically is

| what | region | evidence | taken |
| --- | --- | --- | --- |
| Vercel function region | **`iad1`** | `docs/sessions/S120-report.md:342` — live `x-vercel-id` header `iad1::iad1::…` from `/sign-in`, 2026-09-30 | S120 (not re-read today — re-reading would be a live request; not needed, see below) |
| Supabase production `jwkcknyuyvcwcdeskrmz` | **`us-east-1`** | `docs/sessions/S120-report.md:343` — Management API `GET /v1/projects/…` → `region: "us-east-1"`; corroborated independently by the pooler host `aws-1-us-east-1.pooler.supabase.com` (`docs/sessions/context98.md:33`, `context61.md:41,53`) | S120 / earlier sessions |
| Supabase rebuild-test `nmyphyhmfttxkdoposvf` | `us-east-2` (Ohio) | `S120-report.md:344`, `context61.md:15` | — |

**What I re-verified today, on this ref, from the repo only:**
- `apps/web/vercel.json` declares **no `regions`** (it holds only `crons`, lines 1–68).
- `git grep -n -E 'preferredRegion|export const runtime|"regions"' HEAD -- apps/web` → **no `preferredRegion`, no
  `regions`**; the only `runtime` exports are `runtime = 'nodejs'` in `app/api/portal/messages/route.ts:31` and
  `app/api/portal/photos/route.ts:17` (no edge runtime anywhere — functions all run in the project region).
- So the function region is still the project default that S120 read as `iad1`. **Residual:** a change made in the
  Vercel dashboard since 2026-09-30 would not show in the repo. If Josh wants it re-confirmed: Vercel → the FrameFocus
  project → **Settings → Functions → Function Region**; Supabase → project → **Settings → General** (region
  is shown at the top). Neither is expected to have changed.

**Connection pooling (from config only).**
- The web app has **no direct Postgres client**: `apps/web/package.json` dependencies contain no `pg`, `postgres`,
  `prisma`, `drizzle-orm`, `kysely` or `@neondatabase/serverless` (grep exit 1, 0 hits; same over `packages/*/package.json`).
  Every app query goes through `@supabase/supabase-js` / `@supabase/ssr` → **PostgREST over HTTPS**.
  So serverless functions **do not open database connections at all**; PostgREST holds its own pool on the Supabase
  side. "Session vs transaction mode" applies only to clients that speak the Postgres wire protocol.
- The only wire-protocol use in the repo's history is operator tooling (`pg_dump`, migration pushes) via the
  **session pooler on port 5432** (`docs/sessions/tech-debt-79-decision.md:11,22`, `context98.md:32-33`).
  No repo file names port 6543 (the transaction pooler).
- The rebuild-test connection exhaustion under CI load is the Supabase CLI / test harness, not the app's runtime
  path. Production's PostgREST pool size is a dashboard setting, not visible from the repo — **deferred** (it needs
  the dashboard or a database query).

---

## E — Middleware (`apps/web/middleware.ts`, 419 lines)

**Reported, not reopened.** Measuring its cost is deferred.

**Matcher** (`middleware.ts:399-418`): `/dashboard/:path*`, `/m`, `/m/:path*`, `/portal`, `/portal/:path*`,
`/onboarding`, `/onboarding/:path*`, `/sign-in`, `/sign-up`, `/locked`, `/trial-limit`, **`/api/:path*`**.
Not matched: `/`, marketing pages, `/bid/[token]`, `/sign/[token]`, `/sign-co/[token]`, `/invite/*`,
`/forgot-password`, `/reset-password`, static assets. Note `next.config.js` answers `/m` → `/m/timeclock` as a
307 **before** middleware (`next.config.js` `redirects()`, S119 E-2).

**What it does per matched request, in order:**

| # | step | network? | where |
| --- | --- | --- | --- |
| 1 | Build a Supabase SSR client over the request cookies | no | `:21-42` |
| 2 | Identity. `/sign-in`, `/sign-up`: `auth.getUser()` (**Auth server round trip**). Everything else: `auth.getClaims()` — verifies the JWT locally against the cached ES256 JWKS; **network only when the access token has expired** (refresh) or the JWKS is not yet cached in the instance | sign-in/up: yes; else: normally no | `:60-68` |
| 3 | Unauthenticated + `/dashboard*` → 307 `/sign-in` | no | `:71-74` |
| 4 | Authenticated + `/sign-in`/`/sign-up` → 307 to `?next=` or the device landing | no | `:86-132` |
| 5 | Trial-lock check, for every authenticated path not lock-exempt (incl. `/m`, `/portal`, `/api`). **Skipped when a signed `ff_lock_ok` cookie is valid**: HMAC-verified locally, TTL **30 s** (`lib/trial/lock-cookie.ts:33`). Otherwise `rpc('is_my_company_locked')` (`lib/trial/lock-guard.ts:33`) — **one round trip at most once per 30 s per browser** | conditional | `:182-194` |
| 6 | `/dashboard*` only: `profiles.select('role, company_id')` **in parallel with** step 5 (`Promise.all`) | yes, `/dashboard` only | `:189-194` |
| 7 | Locked → `/portal` checks `rpc('my_company_lock_reason')` (carve-out); otherwise 403 JSON for `/api`, 307 `/locked` for pages | locked tenants only | `:197-224` |
| 8 | `/dashboard*`: role guard (`dashboardDeniedRedirect`, local) | no | `:241-245` |
| 9 | `/dashboard*` with billing enforcement on: `companies.payment_method_on_file` (owners only) **in parallel with** `subscriptions` (not on `/dashboard/billing*`) | yes, `/dashboard` only | `:267-285` |
| 10 | Card gate → `/onboarding`; expired/limited/unpaid subscription → `/trial-limit` or `/dashboard/billing/plans` | no | `:287-332` |
| 11 | Sets `ff_lock_ok` after a definite "not locked" | no | `:337-348` |

**Round trips per request, typical warm session (lock cookie valid, token not expired):**
`/m/*`, `/portal/*`, `/api/*`: **0**. `/dashboard/*`: **2 sequential batches** — {profile} then
{company ∥ subscription} (owner) or {subscription} (others); with billing enforcement disabled, **1**.
Every 30 s add one lock RPC (in the first batch, in parallel — not an extra batch on `/dashboard`).

**Stale comment (documentation finding, not a defect):** `middleware.ts:389-390` says *"Every API request now runs
getUser() plus one `is_my_company_locked()` RPC."* Both halves are out of date on this ref: identity is
`getClaims()` (S115/S116, `:65`) and the RPC is cached for 30 s (S120 3-B, `:187-188`). The comment is the trade's
justification, so it matters that it states the current cost. **Not edited — this audit changes no application file.**

**Why it still matters even at 0 round trips:** the comment at `:176` records that *"one screen load runs this
middleware 19–32 times (prefetches)"*. Each `/dashboard` prefetch therefore pays the 1–2 batches of step 6/9. That
count was measured in S115 and is not re-measured here (deferred).

---

## B — Database work per screen (code reading)

### Repo-wide inventory of the "M1-03 / M2-06 / M3-05" shapes

**`select('*')`** — `grep -rn -E "select\(\s*['\"]\*['\"]" app lib components` on this ref: **99 raw hits; 14 are
comments** (they *describe* a `select('*')` elsewhere — e.g. `app/m/subs/page.tsx:22`), **85 are code.** Classified
by reading each statement window (script-assisted, then spot-checked):

| class | count | meaning |
| --- | --- | --- |
| one row (`.single()` / `.maybeSingle()`) | 16 | wide row, but one row |
| count only (`head: true`) | 6 | returns no rows — not a payload issue (e.g. `lib/services/projects-client.ts:266,273`, `lib/services/dashboard.ts:93`) |
| bounded (`.limit`/`.range`) | 4 | `lib/services/files.ts:132` (the M3-05 fix, `DEFAULT_FILE_PAGE_SIZE = 500`, `:100`), `subcontractors.ts:59`, `contacts.ts:76`, `lib/trial/export.ts:137` |
| list, no limit | 59 | almost all are **child rows scoped by a parent id and ordered** (estimate lines, CO lines, contract boxes, lien-release boxes, selection options/messages…). Bounded in practice by the parent, not by the query |

### How the per-route counts below were made

Every `page.tsx` under `app/m/` (53), `app/dashboard/` and `app/portal/`, and all six layouts, were read along with
every `lib/services` / `lib/critical-path` function they reach (three read-only reading passes, then the load-bearing
claims re-read by me on this ref — marked ✔ where I re-verified). **RT** = Supabase round trips in the page's own
server render (layouts counted separately), counting `.from()`, `.rpc()`, storage signing and Auth-server calls.
**Depth** = the longest chain that must run one after another. Counts are upper bounds where a branch skips a query.
They are **counts from reading, not measurements** — the timing half traces the real number.

Shared per request by React `cache()` (a second call is free): `createClient`, `getRequestUser`
(`lib/supabase-server.ts:25,68`), `getMyLanguage` (`lib/i18n/server.ts:12`), `getProject` (`lib/services/projects.ts:63`).
**Nothing else is cached** — every repeat below is a real query (see F-1).

### B-1. Cross-cutting findings (rank order inside Area B)

**B-1a. ✔ 79 dashboard/portal `page.tsx` files call `supabase.auth.getUser()` directly** (`grep -rln
"supabase.auth.getUser()" app/dashboard app/portal --include=page.tsx` → 79; `app/m` → 1). The cached
`getRequestUser()` exists for exactly this; S115 measured why it matters (`lib/supabase-server.ts:50-57`): *"6 calls
to the Auth server for one render … They cannot overlap: auth-js runs every auth operation on a client through one
queue, and every PostgREST query waits on that same queue for its session, so each getUser() in flight stalls every
query behind it."* The S115 fix moved the layouts onto `getRequestUser()`; **the pages were not moved.** So every
dashboard page pays **one extra Auth-server round trip that also stalls its own queries**. Portal pages ask the Auth
server up to **3×** per request (`app/portal/layout.tsx:73`, `lib/services/portal.ts:173` from both the project
layout and the page). Fix: mechanical replacement with `getRequestUser()`; small per file, 79 files; risk low (same
call, memoised) — the one trap is a page that deliberately needs a *fresh* user after a write in the same request
(none expected in a GET render; check Server Actions).

**B-1b. ✔ The dashboard home and the projects list run a full profitability report per project.**
`lib/services/dashboard.ts:236-238` — `Promise.all(activeProjects.map(getProfitabilityReport))` on the Owner/Admin
home; `app/dashboard/projects/page.tsx:125-129` — every project, 6 at a time. One report is ~19–33 queries ~10 deep
(`lib/services/profitability.ts:123…433`, counted by reading), and it also reads **all** `instrument_rates` with no
filter (`profitability.ts:209-211`) each time. **This is the one place the query count scales with the company's
size.** A company with 30 active projects → ~600–1000 queries for one home-page render (arithmetic on the reading
count; not measured). Fix: a set-based portfolio rollup (one RPC or a handful of grouped queries) — **medium-large**;
risk: the profitability numbers are Financial-Floor-governed money figures, so the rewrite needs the same
role-matrix tests as the original.

**B-1c. Reads with NO filter at all — company-wide, every time:**
- ✔ `lib/services/selections.ts:124` — `selection_option_amounts` with **no `.in('option_id', ids)`** (the
  neighbouring `selection_notes` read at `:127` has one). Runs on `/m/p/[projectId]/selections`, dashboard selections (twice on
  `selections/[selectionId]`), and the portal. Correctness-adjacent: the caller presumably filters in JS.
- ✔ `lib/services/invoices.ts:469-472` — every credit `invoice_lines` row in the company (`getAvailableCredits`,
  invoices pages).
- `lib/services/profitability.ts:209-211` — all `instrument_rates` (per project, inside B-1b).
- `lib/services/payables.ts:238-243` — all compliance docs, on every calendar render (`getExpiringCompliance`).

**B-1d. ✔ Lists that grow without bound and are only ever shown partly:**
- `getCalendarEvents` (`lib/services/schedule.ts:129-265`) — **no date window, 4 sequential reads**
  (tasks `:149` → entries `:172` → inspections `:205` → compliance `:239`), behind `/m/schedule`, the `/m` project hub,
  `/m/p/[projectId]/schedule`, `/dashboard`, `/dashboard/schedule`, dashboard project overview and schedule. The
  screens show a day / a week / "up next".
- `getMobileDailyLogs` (`lib/services/daily-logs.ts:260-270`) — **every daily log in the company, all time, no
  limit** behind `/m/logs`; then `files.in('daily_log_id', <every id>)` just to count photos (`:289-293`) — that `IN`
  list grows with the log history; then `companies.timezone` (`:318`) and a count (`:322`) — 4 sequential.
- `getProjects()` (`lib/services/projects.ts:39-49`) — `select('*', contact)`, no limit; `/m/projects` calls it with
  **no status filter** (archived included); `/m/timeclock` and `/m/capture` use it for a picker that needs id + name.
- `getContacts` (`contacts.ts:22-26`), `getSubcontractors` (`subcontractors.ts:22-25`), `getExpenses`
  (`expenses.ts:45-50`, all company expenses on `/m/expenses`), `listSiteVisits` (`site-visits.ts:44-49`),
  `getDailyLogs` (`daily-logs.ts:97-103`), portal photo/file lists (`portal.ts:473-488, 538-543, 714-718`),
  `listEstimates` from the browser (`estimates-client.ts:245-251`).
- Already bounded (the M3-05 fix, fine): `getFiles` — range 500, ordered (`files.ts:100,130-138`).

**B-1e. N+1 reads:**
- ✔ `/m/timeclock` — `Promise.all(ownSessions.map(getSessionSegments))` (`app/m/timeclock/page.tsx:54`), N queries
  after the first batch. `SESSION_SELECT` (`lib/services/time-tracking.ts:45`) already embeds segments, so the
  first-batch `getSessions` could return them — removes the N+1 **and** one sequential step. **Small.**
- `/m/expenses` — one `files` read per expense (`app/m/expenses/page.tsx:155-157`); the comment says no batch
  function exists, but `getExpenseReceiptsByExpense` is at `lib/services/expenses.ts:120`.
- `/dashboard/projects/[id]/invoices/[invoiceId]` — `derivedInstruments.map(getPickableCosts)` (`:129`), 4 each.
- `/portal/[projectId]/financials` — one RPC per invoice (`portal.ts:634-638`); `/portal/[projectId]/selections`
  — up to 4 per selection (`selections.ts:464-474`).
- `/m/projects` — `getOpenPunchCounts` fetches every open punch row to count in JS (`punch.ts:285-293`).
- Site-visit media — one fetch per photo, in parallel (D-4).
- Photo capture — 5 round trips per photo, 3 of them the same identity/profile/cap reads (G-4).
- Dashboard B-1b.

**B-1f. Data fetched only to count it** (server waste, no payload): `/m` layout `getMembers()` → `members.length`
(`app/m/layout.tsx:90,133` ✔, on **every** `/m` request); `/m` hub and `/m/field` fetch up to 500 `files` rows
`select('*')` → `photos.length` (`app/m/p/[projectId]/page.tsx:125,191`); hub delivery lists → damaged count
(`:119-120`). A `count: 'exact', head: true` query does each.

### B-2. `/m` field routes (53 pages + layout)

**The `/m` layout** (`app/m/layout.tsx`, every `/m` request): 5 round trips, depth 3 —
Auth `getUser` (`:79`, cached for the page) → `profiles` (`:96`) ∥ `getMembers` + `getUnreadCount` (started `:90-91`)
→ `companies.name` (`:113`). Embedding `companies(name)` in the profile select drops a step; B-1f drops a list read.

| route | RT (page) | depth | not-parallel but independent | N+1 | unbounded | key note |
| --- | --- | --- | --- | --- | --- | --- |
| **/m/timeclock** | 7+N | 3 | 0 | **y** `:54` | y | B-1e; `profiles` read 3× per request; client effect adds 2 sequential browser reads (`timeclock-screen.tsx:206`) |
| /m/timeclock/switch | 4 | 2 | 0 | n | y (`getProjects`) | |
| **/m/logs** | 8–9 | **7** | 1 (`:49`→`:57`) | n | **y** | **deepest chain of the field routes** (B-1d) |
| /m/logs/new | 3 | 1 | 0 | n | y (`getMembers`, repeats layout) | presence RPC on mount |
| /m/logs/[logId] | 5 | 2 | 0 | n | n | profile read twice |
| **/m/capture** | 1 | 1 | 0 | per-photo writes | y (`getProjects` `*` for a picker) | the cost is the upload path (G-4) |
| **/m/projects** | 7 (9 "Mine") | 3 | 0 | punch counts | **y** (all projects incl. archived) | `get_my_member_id` RPC up to 3× |
| **/m/schedule** | 10 | 6 | 3 inside `getCalendarEvents` | n | **y** | B-1d; `getMembers` repeats layout |
| **/m/p/[projectId]/schedule** | 8 → ~19 | ~6 | 1 (`:153`→`:158`) + 2 | n | **y** | `getMobileCriticalPath` loads CP data **even when the project is not on Critical Path** (~9 wasted queries; `lib/critical-path/load.ts:53,62,115`) |
| /m/p/[projectId] (hub) | 15 | 5 | 2 | n | **y** | B-1f; calendar unbounded |
| **/m/p/[projectId]/overview** | 5 | **1** | 0 — `Promise.all` at `:245` ✅ | n | n | **the model to copy**; residual: a second `projects` read for the site address |
| **/m/p/[projectId]/photos** | 7 | 4 | 2 (`:67`→`:72`, `:72`→`:102`) | n | 500 × `*` | signs up to **1500** paths per render; **every search pause / chip tap re-runs all 7** (`photo-search.tsx:53-62` → `router.replace`) |
| /m/p/[projectId]/photos/[fileId] | 6–8 | 3–5 | 0 | n | 500 × `*` | C-4a: whole gallery per photo, per swipe |
| /m/p/[projectId]/punch | 7–8 | 5 | 2 | n | **y** (`punch.ts:165-170`) | |
| /m/p/[projectId]/punch/[itemId] | 7 | 4 | 1 | n | n | |
| /m/p/[projectId]/punch/new | 6–7 | 3 | 1 | n | y | `getMembers` repeats layout |
| /m/p/[projectId]/punch/lists/new | 4–5 | 3 | 1 | n | y | every item `*` loaded to read list names |
| /m/field | 11 | 3 | 0 | n | **y** | B-1f |
| /m/expenses | 6+N | 3 | 1 | **y** | **y** | B-1e |
| /m/notifications | 2 | 2 | 1 | n | n (limit 100, ordered) | |
| /m/account, /m/settings | 7 | 3 | 0–1 | n | n | 4 `profiles` reads each |
| /m/contacts, /m/subs, /m/team | 3 | 1 | 0 | n | y | |
| /m/contacts/[contactId] | 5 | 3 | 2 | n | n | |
| /m/subs/[subId], /m/team/[memberId] | 4 | 2–3 | 1–2 | n | n | |
| `…/edit` (contacts, subs, team) | 2–3 | 2–3 | 1 | n | n | |
| /m/site-visits | 4 | 3 | 1 | n | **y** | |
| /m/site-visits/[id] | 7 | 4 | 1 | **y, client** (D-4) | n | uncached `auth.getUser()` `:23` |
| /m/site-visits/[id]/photos/[fileId]/markup | 7–8 | 7–8 | 0 | n | n | all sequential, uncached `getUser` (`lib/site-visits/markup-page.ts:33`) |
| /m/site-visits/new | 3 | 3 | 1 | n | y | |
| /m/p/[projectId]/changes | 5 | 2–3 | 1 | n | n | |
| /m/p/[projectId]/changes/[coId] | 10 | 5 | 2 | n | n | |
| /m/p/[projectId]/changes/new | 2–5 | 2 | 1 | n | n | |
| /m/p/[projectId]/contacts, /team, /signouts | 4–5 | 1–2 | 0 | n | n | |
| /m/p/[projectId]/deliveries | 4 | 2 | 0 | n | y | client mount fetch adds 3 sequential browser reads |
| /m/p/[projectId]/deliveries/check-in | 4 | 1 | 0 | n | y | |
| /m/p/[projectId]/files | 4 | 2 | 0 | n | 500 × `*` | |
| /m/p/[projectId]/safety, /safety/new | 3–4 | 1–2 | 0–1 | n | y | |
| /m/p/[projectId]/selections | 9 | 4 | 1 | n | **B-1c** | |
| /m/p/[projectId]/signouts/new, /[signoutId] | 6–10 | 2–4 | 0–1 | n | n | `companies` read twice in one `Promise.all` (`material-signouts.ts:227,229`) |
| /m/p/[projectId]/photos/[fileId]/markup | 3 | 3 | 1 | n | n | |
| /m/offline | 0 server | — | — | n | n | client page, one read on mount |
| /m, /m/[...missing] | 0 | — | — | — | — | redirect / notFound |

Correctness notes found in passing (not performance; recorded so they are not lost): `/m` hub and `/m/field` count
damaged **orderless deliveries twice** (`getProjectDeliveries` already includes them — `deliveries.ts:170`, then
`[...withPo, ...orderless]` at `app/m/p/[projectId]/page.tsx:167`); `app/m/subs/[subId]/page.tsx:96` comment says
`getSubcontractor` filters `is_deleted` — it does not (`subcontractors.ts:74-81`); `app/m/settings/page.tsx:45-50`
comment says the layout selects `company_id` only — it also selects `role` (`app/m/layout.tsx:104`). **Unverified by
me; agent-reported.**

### B-3. Dashboard, estimates, portal

**Layouts, per request:** `app/dashboard/layout.tsx` **9** (1 Auth + 8 DB, ~3 deep; `profiles` and `companies` each
read twice inside it — `:37` & `members.ts:87`; `:84` & `company.ts:113`). `app/dashboard/projects/[id]/layout.tsx`
+2 (`getProject` cached ∥ `profiles.role`). `app/portal/layout.tsx` 2 sequential (uncached `getUser` `:73` →
`profiles`). `app/portal/[projectId]/layout.tsx` 6 sequential (identity: Auth `getUser` again + profiles + RPC →
branding `:331` → projects `:337` — branding and projects are independent). So **every
`/dashboard/projects/[id]/*` request starts at ~11 layout round trips, other `/dashboard/*` at ~9, `/portal/[projectId]/*`
at ~8 (3 of them Auth)** — plus middleware's 1–2 batches on `/dashboard` (E).

| route | RT (page) | notes |
| --- | --- | --- |
| **/dashboard** (home) | Owner ~21 + **N × 19–33**; crew ~16 | B-1b; B-1d calendar; `getDashboardData` 9 queries ~8 deep (`dashboard.ts:51,61,74,83,90,100`), `getPortfolioRevisedContract` 4 independent-but-sequential (`contract-value.ts:582,595,602,615`) |
| /dashboard/projects | ~11 + N RPC + **N × 19–33** | B-1b; RPC per project `:97` |
| /dashboard/projects/new | 3 | |
| **projects/[id]** (overview) | ~23, ~5 deep | `Promise.all` at `:101` ✅; 4th `profiles` read `:72`; `companies` `.maybeSingle()` with no filter `:126` |
| projects/[id]/budget | **~46** (Owner/Admin) | 11 services in one `Promise.all` (`:142`) ✅, but inside them `expenses` ~5×, `invoices` ~6×, `projects` 4× more, signed COs 3×; RPC `:451` could join the batch |
| projects/[id]/schedule | ~23, ~9 deep (+recompute) | `tasks` read 4×, `inspections` 2×, deps 2×, `projects` 3×; `loadPendingEdits` `:68` and `loadCriticalPathData` `:77` independent but sequential |
| projects/[id]/critical-path | ~18 (+recompute) | recompute updates each task in a loop (`lib/critical-path/recompute.ts:109-116`) |
| projects/[id]/photos | 5, 2 deep | one signing call ≤1500 paths ✅ |
| projects/[id]/invoices | ≤24 | B-1c `invoices.ts:469` |
| projects/[id]/invoices/[invoiceId] | ~40 + 4/instrument | 8 independent reads in a row (`:71,112,156,163,170,181,188,190`); B-1e |
| projects/[id]/payments | ~22 | |
| projects/[id]/profitability | 25–39 | |
| projects/[id]/lien-releases | 12 | |
| projects/[id]/changes, /[coId] | 8, ~12 | |
| projects/[id]/contacts, /contracts, /deliveries, /files, /punch, /selections, /team | 4–9 | selections: B-1c |
| projects/[id]/selections/[selectionId] | ~23 | `getProjectSelections` runs twice (7 queries each) |
| projects/[id]/chat | 2 + client fetch after mount | |
| projects/[id]/files/* | 2–5 | |
| projects/[id]/costs | 0 (redirect) | layouts still run (~11) — unverified whether before the redirect |
| /dashboard/estimates | 4 + client `listEstimates` (`select('*')`, no limit) | |
| estimates/new | 2 + same client list | |
| **estimates/[id]** | 9–14, **all sequential** (`:20,23,39,46,58,64,67,72`), then ~8 more **from the browser after hydration** (`estimate-builder.tsx:154-161`) | client-side waterfall after a server waterfall; also the heaviest JS route (324 KB) |
| estimates/[id]/proposal | 11 | |
| /dashboard/schedule | ~11 | B-1d |
| /dashboard/timeclock | 8 | repeats the layout's open session / member / company |
| /dashboard/timeclock/timesheets | 11 | `/dashboard/timesheets` redirects here — the layout runs **twice** across the two requests |
| timeclock/timesheets/[sessionId] | ~10 | |
| /dashboard/field-ops/** (25 pages) | 2–11 | mostly one independent pair run in sequence each; `daily-logs.ts:185-190` `.limit(1000)` ordered by non-unique `log_date` only |
| /dashboard/{catalog,contacts,subcontractors,team,expenses,settings,site-visits,notifications,billing,trial,account}/** | not read route-by-route | ⚠️ **residual — outside the read set** (see H) |
| **/portal/[projectId]** | 6–7 page + 8 layout ≈ **14–15, 3 Auth** | identity and projects re-read on purpose (`:40-44` comment) — but uncached, so really re-queried |
| /portal/[projectId]/files | ~16 | two separate signing calls; lists unbounded |
| /portal/[projectId]/financials | ~11 + N | B-1e |
| /portal/[projectId]/selections | ~13 + ≤4/selection | B-1e, B-1c |
| /portal | 5–6 | |

**`.limit()` without `.order()`** — 44 `.limit(` calls in code; **15 have no `.order()` in the statement.** None
is a performance problem; per the S165 rule they are correctness questions. Read individually:

| site | verdict |
| --- | --- |
| `lib/quickbooks/cdc-backstop.ts:266`, `:277`; `lib/quickbooks/reauth-notify.ts:147`; `lib/quickbooks/entities.ts:245`; `lib/services/email-unsubscribe.ts:138`; `app/sign/[token]/page.tsx:90` | existence probe or ≤1 row by constraint — **already commented as such** (S165 cat. 3/2) |
| `app/api/trial/export/route.ts:86`; `lib/quickbooks/park-notify.ts:52`; `lib/services/expenses-client.ts:554`; `lib/services/client-portal.ts:131`; `lib/services/contracts.ts:284` | existence probes (`length > 0` only) — **no comment saying so** (S165 cat. 3 wants one). Not a perf issue |
| `app/api/trial/export/route.ts:86` (also) | uses `inflight[0].id` in the 409 body — which in-flight job is named is arbitrary; harmless (at most one by design) |
| `lib/services/email-service.ts:547` | `profiles … role='owner' … limit(1)` — scoped to the property used (one owner per company); no comment |
| `lib/services/reminders.ts:32` | `companies … limit(1).maybeSingle()` with no `.eq('id')` — relies on RLS returning only the caller's company. Correct under RLS; no comment |
| `lib/services/contacts-client.ts:23` | `ilike(email).limit(5)` then exact match in JS — if >5 near-matches exist the exact one can be missed. Correctness, rare |
| `lib/trial/deletion.ts:561` | chunked delete loop; order irrelevant |

---

## C — What reaches the browser

### C-1. First Load JS per route (`next build`)

**How it was taken.** `npm run build` in `apps/web` on ref `918f8654` (application code = `main` @ `91fa32e1`),
Next 14.2.35, with `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:1` and a dummy anon key, so **no prerender could reach
any database** (no `.env.local` exists in this checkout; the log shows no connection errors). First attempt died of a
JavaScript heap OOM in the lint/type-check stage (the background wrapper reported exit 0; the build's own line read
`BUILD_EXIT=1` — log kept as `build-attempt1-oom.log` in the session scratchpad). Re-run with
`NODE_OPTIONS=--max-old-space-size=4096`: **`BUILD_EXIT=0`**, `✓ Compiled successfully`, 170 app pages + 112 API routes.

⚠️ **Next's printed "First Load JS" under-counts every route under a layout with client code**: it leaves out the
layout's chunks. `/m/contacts` prints **97 kB**, but its layout (`/m/layout`) loads 18 chunks the page entry does not
list. So the table below is recomputed from `.next/app-build-manifest.json`: the **union** of the root layout +
each intermediate layout + the page's chunks, each file gzipped with Node `zlib` (level 6). Vercel serves Brotli, so
bytes on the wire are somewhat smaller; **compare these numbers with each other, not with a network trace.** Size is
not time — parse/execute cost on a mid-range phone is the timing half's.

| route | Next prints | **real first-load JS (gz, incl. layouts)** | chunks |
| --- | --- | --- | --- |
| `/` (marketing) | 96.7 kB | 95 KB | 7 |
| `/sign-in` | 159 kB | 156 KB | 10 |
| **`/m/timeclock`** | 209 kB | **232 KB** | 22 |
| `/m/timeclock/switch` | 212 kB | 234 KB | 22 |
| **`/m/logs`** | 204 kB | **229 KB** | 21 |
| `/m/logs/new` | 209 kB | 234 KB | 21 |
| `/m/logs/[logId]` | 208 kB | 231 KB | 21 |
| **`/m/capture`** | 200 kB | **231 KB** | 20 |
| **`/m/p/[projectId]/photos`** | 205 kB | **234 KB** | 21 |
| `/m/p/[projectId]/photos/[fileId]` | 204 kB | 233 KB | 21 |
| **`/m/schedule`** | 197 kB | **238 KB** | 23 |
| `/m/p/[projectId]/schedule` | 204 kB | 245 KB | 24 |
| `/m/p/[projectId]` (hub) | 206 kB | 238 KB | 23 |
| `/m/p/[projectId]/overview` | 158 kB | 226 KB | 20 |
| `/m/projects` | 195 kB | 227 KB | 20 |
| `/m/p/[projectId]/punch` | 158 kB | 226 KB | 20 |
| `/m/p/[projectId]/punch/[itemId]` | 203 kB | 232 KB | 21 |
| `/m/contacts` | **97 kB** | **226 KB** | 20 |
| `/dashboard` | 112 kB | 248 KB | 24 |
| `/dashboard/projects/[id]` | 237 kB | 276 KB | 31 |
| `/dashboard/projects/[id]/schedule` | 215 kB | 270 KB | 28 |
| `/dashboard/projects/[id]/photos` | 201 kB | 244 KB | 23 |
| `/dashboard/estimates/[id]` (largest) | 299 kB | **324 KB** | 29 |
| `/dashboard/timesheets` | 87.9 kB | 233 KB | 21 |
| `/portal/[projectId]` | 87.9 kB | 138 KB | 11 |
| `/portal/[projectId]/files` | 206 kB | 213 KB | 18 |

All `/m` pages: **226–248 KB**. All `/dashboard` pages: **233–324 KB**. Full per-route list (170 rows):
`firstload-union.tsv` in the session scratchpad — not committed (generated, reproducible from the build).
Middleware bundle: 93.6 kB (Next's figure).

**C-1a. ⚠️ The `/m` weight is the SHELL, not the screens.** The root layout + `/m` layout alone are **226 KB gz in
19 files**; every field page adds only **0–19 KB** on top. What the shell carries (largest chunks, gz):

| KB | chunk | what it is (fingerprinted by content) |
| --- | --- | --- |
| 52 + 31 | `1dd3208c…`, `1528…` | React / Next runtime (the 87.8 kB "shared by all"; root layout total 86 KB) |
| **41 + 12** | `5422…`, `75504863…` | **the browser Supabase client** — `createBrowserClient`, `GoTrueClient`, and **`RealtimeClient` (Phoenix websocket)** |
| **35** | `3437…` | **the whole i18n message catalog, English AND Spanish, every area** (`lib/i18n/messages.ts:2-9` imports all 8 areas; `en` `:72`, `es` `:127`) — 130 KB raw |
| ≤9 each | others | shell, offline sync, nav, file sheet (C-2b), geolocation helper (`5964…`, timeclock only) |

So **~88 KB of the 140 KB the `/m` shell adds over the framework is two things**: the Supabase browser client
(on every `/m` page: `app/m/mobile-shell.tsx:24` imports `@/lib/supabase-browser` directly, and again via
`app/m/offline-sync.tsx:12-13` → `lib/services/files-client.ts:1` — verified) and a two-language catalog of which a user reads one. Fix shapes, for Josh to rule: ship one language's
catalog per user (≈ −17 KB, small change, risk: a missed key renders its id); load the Supabase browser client /
offline-sync lazily after first paint (larger change, risk: offline queue replay timing). **Bytes only — whether
226 KB is "slow" on a mid-range phone on LTE is a timing-half question.**

### C-2. Heavy libraries — mostly handled well

`next.config.js` has no `images` key and no `optimizePackageImports`. No chart library is installed; the Gantt
(`components/schedule/gantt.tsx`, 573 lines) and calendar (`components/schedule/calendar.tsx`, 462 lines) are hand-drawn.

| library | reaches the browser? | where it loads | verdict |
| --- | --- | --- | --- |
| `pdf-lib` | **no** | `lib/services/lien-release-pdf-service.ts:2`, `lib/services/proposal-service.ts:3` (both `server-only`) | fine |
| `@react-pdf/renderer` | only `PDFViewer` in `app/dashboard/estimates/[id]/proposal/pdf-preview.tsx:3` | `next/dynamic`, `ssr:false`: `review-send-sheet.tsx:45` (only when review is open) and `proposal-preview-client.tsx:21` (the proposal page, where the PDF *is* the page). PDF generation is server-only (`app/api/pos/[id]/pdf/route.ts:2`, `lib/services/*-pdf-service.ts`) | fine |
| `pdfjs-dist` | yes, lazily | `await import()` inside effects: `components/files/pdf-pages.tsx:55` (only when a PDF is opened), `components/box-map/pdf-page-raster.tsx:57` (settings forms) | fine; uses the **legacy** build (larger than modern) |
| `heic2any` | yes, lazily | one site, `await import()` in `lib/services/files-client.ts:54`, only for HEIC/HEIF MIME (`:83-87`) | fine |
| `react-signature-canvas` | yes, **statically** | `components/signature/signature-capture.tsx:4` → signout new/detail (`/m` + dashboard), portal financials/selections/**files**; `app/sign/[token]/signing-client.tsx:4`, `app/sign-co/[token]/co-signing-client.tsx:4` | **C-2a:** on every route the pad appears only after a state change; on **`/portal/[projectId]/files` it never appears** (the page uses only `ClientComposer`, `:127`, but imports the whole `portal-writes-ui.tsx:7-13`). Small library — **low impact**; `next/dynamic` fixes it |
| `react-markdown`, `remark-gfm` | **no** | `components/public/markdown-doc.tsx:1-2` (server), `/terms`, `/privacy` | fine |
| `fflate`, `openai`, `stripe`, `@react-email/*` | **no** | server/API only (every importer checked: none `'use client'`) | fine. Hardening gap, not perf: `lib/openai.ts`, `lib/stripe.ts`, `lib/services/ai-tagging.ts`, `lib/trial/export.ts` lack `import 'server-only'` |
| `lucide-react` | yes | 20 files, all named per-icon imports (no namespace / dynamic-icon) | fine |
| Markup editors | yes | each imported only by its own markup route | fine |
| Gantt | yes | only `/dashboard/projects/[id]/schedule` and `/critical-path`; `/m` has none; portal `client-gantt.tsx` is server-rendered | fine |

**C-2b.** `FileSheetProvider` is mounted in the `/m`, `/dashboard` and `/portal` layouts (`app/m/layout.tsx:9`,
`app/dashboard/layout.tsx:13`, `app/portal/layout.tsx:6`), so `components/files/file-sheet.tsx` (384 lines) and
`lib/markup/export-marked.ts` + `flatten-*` (~560 lines) ship on **every** page of those trees. `pdfjs` itself stays
lazy. Small; measure in C-1.

### C-3. Client components that could be server components

Only minor cases. `'use client'` pages: `app/m/offline/page.tsx`, `app/sign-up/page.tsx`,
`app/forgot-password/page.tsx`. Client components whose only hook is `useT`: `app/m/slice-placeholder.tsx`,
`components/material-signouts/signout-list.tsx` (80 lines, rendered by `/m` and dashboard signouts pages),
`components/material-signouts/signout-attention.tsx`. **Low impact.**

### C-4. What server components pass down (code analysis; measured sizes deferred)

| # | route | prop → client component | what is in it | needed at first paint? |
| --- | --- | --- | --- | --- |
| C-4a | **`/m/p/[projectId]/photos/[fileId]`** (viewer) | `photos={rows}` — the **entire gallery** (`page.tsx:51-103`, `getProjectPhotos` at `:52`) | up to 500 rows × 3 signed URLs + markup JSON + tags + uploader + source link | **no** — and **every swipe re-sends it**: next/prev is `router.push` to a new URL (`viewer.tsx:161`), filmstrip is `<Link>` (`:640`), so the server re-runs `getProjectPhotos` (up to 500 rows + one signing call for 400–600 paths) per photo viewed |
| C-4b | **`/m/p/[projectId]/photos`** (grid) | `photos={rows}` → `PhotoGrid` (606 lines) `page.tsx:107-127,187` | per row `displayUrl`, `thumbUrl`, `originalUrl`, `filePath`, full `markup`; source `getProjectPhotos` (`lib/services/photos.ts:181-250`) → `getFiles` `select('*')` capped 500 (`files.ts:100,130-138`) | tile needs only `thumbUrl`; `originalUrl` + `markup` serve Share/Export only (`photo-grid.tsx:489-491`). Estimated ~350–450 KB uncompressed for 200 photos (**inference**, ~500-char URLs × 3) |
| C-4c | **`/m/schedule`**, **`/m/p/[projectId]`**, **`/m/p/[projectId]/schedule`** | `events` → `DayView` (one day shown) | `getCalendarEvents` (`lib/services/schedule.ts:129-265`) has **no date window** — every scheduled task (one event per assignee), entry, inspection, compliance expiry, all time; and its reads are **sequential**: tasks `:149` → entries `:172` → inspections `:205` → compliance `:239` | no — one day (or "up next") is shown. Also used by `app/dashboard/page.tsx:47`, `dashboard/schedule/page.tsx:36`, `dashboard/projects/[id]/page.tsx:133`, `.../schedule/page.tsx:54` |
| C-4d | `/m/p/[projectId]` (hub) | — (server waste, not payload) | `getFiles({photo_view})` (`page.tsx:125`, `select('*')` ≤500 rows) only for `photos.length` (`:191`); full delivery lists (`:119-120`) only to count damaged | a count query would do |
| C-4e | **every `/m` request** | — (server waste) | `app/m/layout.tsx:90,133` runs `getMembers()` (`select('*', …)`) only to pass `members.length` | a count would do |
| C-4f | every dashboard project tab | full `project` row → `ProjectHeader` (`app/dashboard/projects/[id]/layout.tsx:42-43`) | `select('*, contact…')` (`lib/services/projects.ts:41`) | header reads `id`, `name`, `status`, `project_number` only (`project-header.tsx:158-221`) |
| C-4g | `/dashboard/projects/[id]/files` | `files` (≤500 `FileRecord`, incl. `markup_data`) → `FilesList` (`page.tsx:34,46-47`) | | partly |
| — | `/m/timeclock`, `/m/capture`, dashboard photos | ✅ map to small pickers / server-rendered grid (`timeclock/page.tsx:58-62`; `capture/page.tsx`; `dashboard/projects/[id]/photos/grid-thumb.tsx`) | | done well |

## D — Images

**Zero `next/image` imports and zero `loading="lazy"` attributes in `app/` and `components/`** (grep on this ref,
0 and 0). `next.config.js` has no `images` key. Lazy loading is done by hand where it exists.

**What exists and is good:** a stored **400×400 WebP thumbnail** per photo, made once per upload / markup save
(`lib/services/files-client.ts:284,301` → `/api/photos/thumbnail` → `lib/photos/thumbnail-server.ts:84-119`, Supabase
transform `THUMB_TRANSFORM` `lib/photos/thumbnail.ts:35`, which also renders HEIC). Signed in **one batch**
`createSignedUrls` per page (`files.ts:303-325`, via `photos.ts:216`). Displayed ~117 CSS px in the 3-column `/m` grid
(`photo-grid.tsx:192`) ≈ 350 device px at 3× — **400 px is right-sized**.

| surface | image shown | lazy? | finding |
| --- | --- | --- | --- |
| **`/m` photo grid** | `thumbUrl` (`photo-grid.tsx:255,278-311`) | yes — `useLazySrc`, IntersectionObserver, 6 concurrent, 3 retries (`use-lazy-src.ts:34-35`) | **D-1:** look-ahead is **12 screens** on mobile, 3 when constrained (`thumbnail.ts:40-45`) — but "constrained" is read from `navigator.connection`, which **Safari does not expose** (`thumbnail.ts:46-51`, the code says so), so **every iPhone gets 12 screens ≈ 220 tiles ≈ the whole grid of a 200-photo project on first view**. **D-2:** a photo without a stored thumbnail falls back to the **full original** (`photos.ts:245-247`) |
| **`/m` viewer filmstrip** | thumb, else full file (`viewer.tsx:90-94,653`) | **no — all N `<img>` mounted at once** (`viewer.tsx:636-660`) | **D-3:** opening one photo of 200 requests ~200 thumbnails |
| `/m` viewer main image | `displayUrl` = full file (`viewer.tsx:491`) | n/a | expected |
| dashboard project photos | thumb (`grid-thumb.tsx`, 2-screen buffer) | yes | fine |
| site-visit record (dashboard + `/m/site-visits/[id]`) | thumb → display → original (`site-visit-record.tsx:488`) | no | **D-4:** **one API call per photo** (`lib/site-visits/media.ts:71` → `/api/estimates/…/url`), each signing separately — an N+1 (fired in parallel, `media.ts:72-74`, so N concurrent requests rather than a chain) |
| **material sign-out detail (also `/m`)** | **full original** (`signout-detail.tsx:105`; `lib/services/material-signouts.ts:113`) | no | **D-5** |
| `/m/logs/[logId]` | none in a grid; signed per tap (`app/m/logs/[logId]/page.tsx:231-255`) | n/a | fine |
| portal photos / chat-thread photos | **full original or markup file** (`app/portal/[projectId]/files/page.tsx:166,246` — the chat thumbnails display at 108×81 px) | no | **D-6**; portal photo list has **no limit** (`lib/services/portal.ts:474-488`) |
| dashboard daily-log / safety / delivery detail | **full original** (`daily-logs/[logId]/page.tsx:90-98` — a comment calls them "thumbnails"; `safety/[incidentId]/page.tsx:73-79,199`; `deliveries/d/[deliveryId]/page.tsx:66-68,195,238`) | no | **D-7** |

**D-8. No browser caching of images is possible today (inference from code).** Signed URLs are minted fresh on every
server render (2-hour TTL, `lib/services/signed-url-ttl.ts`), so the URL string — the cache key — changes on every visit and every
`router.refresh()`; uploads set no `cacheControl` (`files-client.ts:241-244`, `thumbnail-server.ts:109-111`); the
service worker skips cross-origin requests (`public/sw.js:135`), so Supabase images are never cached there either.
**Every visit to a photo grid re-downloads every thumbnail.**

**D-9. Upload size and HEIC.** Nothing downsizes before upload — *"Uploads keep full resolution"*
(`lib/photos/thumbnail.ts:28`, confirmed). A 12 MP photo goes up as ~2–5 MB over LTE (**inference**: typical phone
JPEG/HEIC size). HEIC→JPEG runs **on the phone's main thread** via `heic2any` before upload
(`files-client.ts:83-91`, called `:194`), one at a time by design to avoid crashing older iPhones
(`capture-screen.tsx:36-41`). iOS Safari typically transcodes to JPEG itself for `accept="image/*"`, so `heic2any`
likely fires mostly on Android/desktop (**inference about platform behaviour — the timing half should confirm on a
device**).

**D-10. What a `/m` photo grid of 200 photos downloads (estimate from code, iPhone):** 1 page request (server signs
~400–600 paths in one call) → ~350–450 KB RSC payload (inference) → ~200 thumbnail requests, 6 at a time, ~15–40 KB each
(inference) ≈ **3–8 MB**, all again on the next visit; any photo missing its thumbnail costs its 2–5 MB original
instead. Possibly also one RSC **prefetch per visible tile** (each tile is a `<Link>`, `photo-grid.tsx:401`, default
prefetch) — **inference; confirm in the timing half.**

## F — Caching and revalidation

**`staleTimes` is not in `next.config.js`** (confirmed; Next 14.2 defaults apply). **Settled at S121; not
evaluated, not proposed.** Any proposal to disable the router cache is rejected by ruling.

| mechanism | where (this ref) |
| --- | --- |
| `export const dynamic = 'force-dynamic'`, pages | `app/m/notifications/page.tsx:31`, `app/dashboard/notifications/page.tsx:23`, `app/dashboard/settings/page.tsx:58`, `app/dashboard/settings/accounting/page.tsx:31`, `app/resubscribe/page.tsx:19` |
| `force-dynamic`, route handlers | `app/onboarding/complete/route.ts:10`, seven `app/api/quickbooks/*/route.ts` |
| `revalidate`, `fetchCache`, `unstable_cache`, `revalidateTag` | **none** |
| `revalidatePath` | `app/dashboard/team/[id]/actions.ts:88,89,99,194`; `lib/services/profile-self.ts:52,53,76,77` |
| React `cache()` (per-request dedupe) | `lib/supabase-server.ts:25` `createClient`, `:68` `getRequestUser`; `lib/services/projects.ts:63` `getProject`; `lib/i18n/server.ts:12` `getMyLanguage` |

**F-1. Per-request reads repeated between a layout and its page, NOT wrapped in `cache()`** — each costs its round
trips again in the same render:
- _(Caller counts = `page.tsx` files containing the call, `grep -rl` on this ref.)_
- `getMyMember` (`lib/services/members.ts:82` — `profiles` then `company_members`, **two sequential queries**):
  `app/dashboard/layout.tsx:33` **and** 18 dashboard pages / 6 `/m` pages.
- `getCompanyTimeSettings` (`lib/services/company.ts:139` → `:107`): dashboard layout `:34` **and** 17 dashboard /
  13 `/m` pages.
- `getOpenSession` (`lib/services/time-tracking.ts:53`): dashboard layout `:32` **and** 1 dashboard / 4 `/m` pages.
- `getMembers` (`members.ts:24`): `/m` layout `app/m/layout.tsx:90` **and** 7 `/m` / 12 dashboard pages
  (e.g. `app/m/p/[projectId]/page.tsx:130`, `app/m/p/[projectId]/schedule/page.tsx:67`).
- The caller's **`profiles` row** is read by: the `/m` layout inline (`app/m/layout.tsx:96`, already selecting
  `language` and `role`), `getMyLanguage` (`lib/i18n/server.ts:16`, cached — but a *separate* read from the
  layout's), `getMyProfile` (`lib/services/profiles.ts:37`, 23 `/m` pages, not cached), and `getMyMember`'s own read
  (`members.ts:86`).
- Portal: `getUser` twice (`app/portal/layout.tsx:73` and `lib/services/portal.ts:173`) and `profiles` twice
  (`portal/layout.tsx:81`, `portal.ts:176`) per request.

Fix shape: wrap these in React `cache()` the way `getRequestUser`/`getProject` already are (`cache()` is
per-request, so no cross-user risk — the reasoning at `lib/supabase-server.ts:60-67` applies). Small; the risk is
a helper that is called with *different arguments* expecting fresh reads within one render (argument-keyed, so safe)
or after a write in the same request (Server Actions — check each).

**F-2. No cross-request caching exists.** Data that changes rarely — company name and time settings re-read by
every layout on every navigation and `router.refresh()`; the catalog; `/m/capture`'s active-project list
(`app/m/capture/page.tsx:29`) — is fetched fresh each time. `unstable_cache` keyed on company id with
`revalidateTag` on write would remove those reads. ⚠️ Medium-risk: a cache keyed wrongly is a cross-tenant leak, and
RLS does not run inside a cached function the way it does per request — any such cache must be built with the
service role **and** an explicit company filter, or not at all. Josh's decision.

**F-3. The marketing pages are already static.** `/`, `/pricing`, `/privacy`, `/terms`, `/contact` read no
cookies/headers/Supabase and are outside the middleware matcher; the root layout (`app/layout.tsx:99-109`) forces
nothing dynamic. Nothing found.

## G — Blank screens ⚠️ the adoption section

**G-1. There is not one `loading.tsx` in the app.** `find apps/web/app -name loading.tsx` → **0**, against **169**
`page.tsx` and **6** `layout.tsx` (`app/layout.tsx`, `app/dashboard/layout.tsx`,
`app/dashboard/projects/[id]/layout.tsx`, `app/m/layout.tsx`, `app/portal/layout.tsx`,
`app/portal/[projectId]/layout.tsx`).

**G-2. No page streams.** `<Suspense` appears twice: `app/m/mobile-shell.tsx:572-574` (`fallback={null}`, only
because `NavPending` calls `useSearchParams()`; it covers no content) and `app/invite/accept/page.tsx:6-14`
("Loading invitation…" — the only real loading fallback in the app). No skeleton or spinner component exists; several
comments reject spinners deliberately (e.g. `app/m/capture/page.tsx:26`, `app/m/mobile-ui.tsx:100`).

So in Next 14 every soft navigation **keeps the old screen on display, frozen, until the entire new server render
— layout reads plus every sequential page read — has finished.** First loads show nothing until the same point.

**G-3. What signals that a tap registered:**
- **`/m`, `<Link>` taps only:** `NavPending` (`app/m/nav-pending.tsx`) — a 3 px pulsing bar (`:89`) set by a
  document click listener on same-origin `/m` anchors (`:46-71`), cleared on route change (`:42-44`), 15 s give-up
  (`:34`). The persistent shell (`app/m/layout.tsx:131-142` → `MobileShell`) keeps header/tab bar/FAB up; the header
  *title* stays the old page's until the new page renders (`SetMobileHeader`).
- **`/m`, `router.push()` from code: nothing.** Skipped *deliberately* (`nav-pending.tsx:29-31`): *"each of those
  screens already shows its own busy state on the button that caused it."* **That premise is false on the busiest
  screens** — see G-4: the busy state is cleared *before* the push.
- **Dashboard and portal: nothing at all.** `app/dashboard/dashboard-shell.tsx` and `app/portal/portal-shell.tsx`
  have no pending/progress code; project tabs (`app/dashboard/projects/[id]/project-header.tsx:188,244,285`) and
  portal tabs (`app/portal/[projectId]/portal-tabs.tsx:64`) give no feedback. `useTransition` appears in 9 dashboard
  components, several discarding `isPending` (`[, startTransition]`).

**G-4. The crew mutations: none is optimistic except photo capture, and most re-enable the button before the
screen catches up.** No `useOptimistic` anywhere.

| mutation | mechanism (round trips) | after success | the gap |
| --- | --- | --- | --- |
| **Clock in** `app/m/timeclock/timeclock-screen.tsx:231-286` | GPS first, up to 10 s (`lib/gps.ts:40`, awaited `:239`); then supabase-js `clockIn` (`lib/services/time-tracking-client.ts:98-155`): `rpc get_my_role` `:107` → session insert `:118` → segment insert `:137` — **3 sequential** | `router.push('/m/p/{id}')` `:283` + `router.refresh()` `:285` | **`setBusy(false)` at `:270` runs before the push** — button reads "Clock in", enabled, while the hub (layout + 3 sequential page steps) renders, with **no bar**. A second tap is stopped only by the DB unique index `idx_time_clock_sessions_one_open_per_member` (`supabase/migrations/20260710130000_module6_6a_time_tracking.sql:126`) — the user sees a raw error |
| **Clock out** `timeclock-screen.tsx:478-543` | `endSegmentAt` (`time-tracking-client.ts:170+`) then session update — sequential | `router.refresh()` `:542` | `setBusy(false)` `:534` first; the screen still says "on the clock" until the refresh lands |
| **Switch job / break** `app/m/timeclock/switch/switch-screen.tsx:130-157` | `switchSegment` (`time-tracking-client.ts:212-251`): end → read `session_id` `:224` → insert `:242` — **3 sequential** | push `/m/timeclock` + refresh `:155-156`, no bar | `setBusy(false)` `:150` first |
| Offline clock in/out `timeclock-screen.tsx:252-262, 497-519` | local queue | renders queued state | ✅ optimistic |
| **Photo capture** `app/m/capture-store.tsx:189-226` → `capture-screen.tsx:79-145` | held in IndexedDB first; then per photo `uploadFile` (`lib/services/files-client.ts`): `getUser` `:202`, profiles `:205`, cap check `:217`, storage upload `:241`, files insert `:269/:288` — **5 round trips per photo, photos one at a time** (`capture-screen.tsx:160-161`) | no refresh | ✅ **the best path in the app**: thumbnail + per-row held/uploading/failed (`:349-352`), double-fire guard (`:189-196`). Cost: 4 of the 5 round trips per photo are the same identity/profile/cap reads repeated |
| **Punch create** `app/m/p/[projectId]/punch/new/punch-form.tsx:137-254` | API route `/api/punch-items` (`lib/services/punch-client.ts:140`) | "again" mode stays (`:236-251`); "return" mode push + refresh `:252-253`, no bar | `setBusy(false)` `:200` first, title not cleared → **a second tap can create a duplicate item** |
| **Punch complete / verify** `punch/[itemId]/punch-actions.tsx:114-144` | supabase-js: `myMemberId()` then update (`punch-client.ts:237,241` / `:276,283`) | `router.refresh()` `:127`, `:143` | `setBusy(false)` `:122`/`:138` first; old "open" state with an enabled Complete button stays visible |
| **Daily log create** `app/m/logs/new/log-form.tsx:129-232` | `createDailyLog` (`lib/services/daily-logs-client.ts:62,66,73` — insert, crew, subs: sequential) → `setDailyLogMaterialNeeds` `:219` → **per photo, sequential** `uploadDailyLogPhoto` `:224-229` | "submitted" card `:242-286`; "Done" push + refresh `:280-281`, no bar | busy held through the chain ✅, but one "Submitting" label over N uploads with no per-photo progress |
| **Daily log closeout edits** `components/field/daily-log-closeout-view.tsx:41-48` | client service | `router.refresh()` `:47` — **even on failure** | `setBusy(null)` `:45` first |

**Every `router.refresh()` re-runs the whole `/m` layout plus the page**: middleware (`getClaims`, lock cookie), the
layout's `getRequestUser` — an **Auth-server `getUser()` round trip** (`lib/supabase-server.ts:68-74`, deduped per
request by `cache()` but never skipped) — then `profiles` (`app/m/layout.tsx:96`, with `getMembers` and
`getUnreadCount` already started in parallel at `:90-91`), then `companies` (`:112-113`): **a 3-step sequential
chain in the layout.** ⚠️ **UNVERIFIED: whether this chain runs before the page's reads or alongside them.** If Next
starts the page's data work concurrently with the layout's, the cost is the longer of the two chains; if not, it is
their sum. Context7 (Next 14 docs) did not settle it and no session has traced it. **The timing half answers it with a
per-request Supabase call trace (S119 measured "depth" this way).** Either way it is the floor: no `/m` screen can paint
sooner than this chain.

Verified by reading on this ref (not taken on the agent's word): `timeclock-screen.tsx:270/283/285`,
`nav-pending.tsx:29-31`, `supabase-server.ts:25,68-74`, `members.ts:82-90` (no `cache()`), `punch-form.tsx:200/252`.

## H — Route inventory, ranked by field use

_(in progress)_

---

## Deferred, and why

_(filled at the end)_
