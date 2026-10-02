# S125 — Performance audit, the STATIC half

> **An audit. It fixes nothing.** Code reading, repo/config inspection and one local `next build`.
> No timing was taken, no database was queried, no Supabase CLI command was run, no CI was triggered.
> Spec: `docs/specs/performance-audit-spec.md` (read from commit `401c4690` on
> `origin/feature/s124-qb-timesheets`; it is not on `main`). Running order: `docs/sessions/S125-prompt.md`.

**Ref every finding was taken on:** branch `feature/s125-perf-audit-static`, cut from `main` @ `91fa32e1`.
The branch adds only `docs/sessions/` files, so **application code = `main` @ `91fa32e1`**.

**Status: COMPLETE (static half).** The ranked findings are at §"FINDINGS RANKED BY FIELD IMPACT"; what was not done is at §"Deferred".
**Josh ruled on ASK-1…4 on 2026-10-02**: see §"RULINGS (2026-10-02) and the assessments they asked for". That
section also adds **finding 16** (the per-page Auth-server call, split out of finding 10 on Josh's word).

---

## ⚠️ AREA A FIRST — the database and the functions are in the SAME region

**Supabase production `us-east-1` (N. Virginia); Vercel functions `iad1` (Washington DC / N. Virginia).
Same region. There is no cross-region toll.** The cost per screen is the **number** of round trips, not
their distance — which is what Areas B and G are about.

## In one screen

1. **Region: fine.** Same region; no cross-region toll (A).
2. **The biggest field problem is feedback, not speed.** No route has a loading state (0 `loading.tsx` / 169 pages),
   and the crew's repeated actions (clock in/out, switch, punch) re-enable their button *before* the screen catches
   up, then freeze the old screen with no signal (G). Small fixes.
3. **Several tier-1 screens read unbounded history**: `/m/logs` (every log ever, 7 deep), the schedule screens (all-time
   events, 4 sequential), the photo viewer (whole gallery per swipe), the photo grid (whole project, re-signed per
   search tap, never browser-cached) (B, C-4, D).
4. **The `/m` shell is 226 KB gz before any screen**; 88 KB of that is the browser Supabase client and a two-language
   catalog (C-1a). Next's own build table under-reports `/m` routes by leaving out layout chunks.
5. **79 dashboard/portal pages make their own Auth-server call** on top of the one their layout already made, and
   the queries behind it wait for it (**finding 16**, B-1a). This is the shape once claimed for the middleware; it
   is real, but in the pages.
6. **The dashboard home runs a full profitability report per project** (B-1b, finding 11).
7. **Nothing here is timed.** Every number is a count from code or a byte size from the build (deferred list at the end).

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
query behind it."* The S115 fix moved the layouts onto `getRequestUser()`; **the pages were not moved.** So each of
those pages (79 of the 98 `page.tsx` files under `app/dashboard` + `app/portal`) pays **one extra Auth-server round
trip that also stalls its own queries**. Portal pages ask the Auth
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

**B-1d. Lists that grow without bound and are only ever shown partly** (✔ = re-verified by me; the rest agent-reported):
- ✔ `getCalendarEvents` (`lib/services/schedule.ts:129-265`) — **no date window, 4 sequential reads**
  (tasks `:149` → entries `:172` → inspections `:205` → compliance `:239`), behind `/m/schedule`, the `/m` project hub,
  `/m/p/[projectId]/schedule`, `/dashboard`, `/dashboard/schedule`, dashboard project overview and schedule. The
  screens show a day / a week / "up next".
- ✔ `getMobileDailyLogs` (`lib/services/daily-logs.ts:260-270`) — **every daily log in the company, all time, no
  limit** behind `/m/logs`; then `files.in('daily_log_id', <every id>)` just to count photos (`:289-293`) — that `IN`
  list grows with the log history; then `companies.timezone` (`:318`) and a count (`:322`) — 4 sequential.
- ✔ `getProjects()` (`lib/services/projects.ts:39-49`) — `select('*', contact)`, no limit; `/m/projects` calls it with
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
| /dashboard/field-ops/** (22 pages) | 2–11 | mostly one independent pair run in sequence each; `daily-logs.ts:185-190` `.limit(1000)` ordered by non-unique `log_date` only |
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

**Tiers are a judgement from role and workflow, not from analytics** (the repo has none; the timing half could add
Vercel Analytics or log sampling to replace this with counts):

| tier | who / how often | routes |
| --- | --- | --- |
| **1** | every crew member, every day (clock in/out twice, photos, the daily log) | `/m`, `/m/timeclock`, `/m/timeclock/switch`, `/m/logs`, `/m/logs/new`, `/m/capture`, `/m/p/[projectId]/photos`, `/m/p/[projectId]` (where clock-in lands), `/m/projects` |
| **2** | field, several times a day or week | the rest of `/m` project work: schedule, overview, punch, photo viewer, log detail, field, notifications, deliveries, signouts, safety, files |
| **3** | office daily, and occasional `/m` directory screens | `/dashboard`, `/dashboard/projects/**`, timesheets, estimates, `/dashboard/schedule`, field-ops; `/m` contacts/subs/team/site-visits/account/settings/changes/selections |
| **4** | clients | `/portal/**` |
| **5** | occasional / one-off | settings, catalog, team admin, billing, trial, contacts/subs admin, auth and public pages |

**All 169 pages, one line each** (ref `918f8654` = app code `main@91fa32e1`). "JS KB gz" is the C-1 union figure.
"Read depth: full" = read with every service it calls (row in B-2/B-3); "light" = the page file only, its own
`await`s counted and services **not** followed — ⚠️ a light read can miss a sequential chain or an unbounded list
inside a service. That residual is stated, not covered.

| tier | route | JS KB gz | page `await`s / `Promise.all` | direct `auth.getUser()` | read depth | finding |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `/m` | 226 | 0 / 0 |  | full (B-2/B-3) | see B-2/B-3 row |
| 1 | `/m/capture` | 231 | 1 / 0 |  | full (B-2/B-3) | see B-2/B-3 row |
| 1 | `/m/logs` | 229 | 3 / 1 |  | full (B-2/B-3) | see B-2/B-3 row |
| 1 | `/m/logs/new` | 234 | 1 / 1 |  | full (B-2/B-3) | see B-2/B-3 row |
| 1 | `/m/p/[projectId]` | 238 | 3 / 2 |  | full (B-2/B-3) | see B-2/B-3 row |
| 1 | `/m/p/[projectId]/photos` | 234 | 4 / 1 |  | full (B-2/B-3) | see B-2/B-3 row |
| 1 | `/m/projects` | 227 | 2 / 1 |  | full (B-2/B-3) | see B-2/B-3 row |
| 1 | `/m/timeclock` | 232 | 2 / 2 |  | full (B-2/B-3) | see B-2/B-3 row |
| 1 | `/m/timeclock/switch` | 234 | 1 / 1 |  | full (B-2/B-3) | see B-2/B-3 row |
| 2 | `/m/field` | 228 | 2 / 2 |  | full (B-2/B-3) | see B-2/B-3 row |
| 2 | `/m/logs/[logId]` | 231 | 2 / 1 |  | full (B-2/B-3) | see B-2/B-3 row |
| 2 | `/m/notifications` | 232 | 2 / 0 |  | full (B-2/B-3) | see B-2/B-3 row |
| 2 | `/m/p/[projectId]/deliveries` | 229 | 2 / 1 |  | full (B-2/B-3) | see B-2/B-3 row |
| 2 | `/m/p/[projectId]/deliveries/check-in` | 231 | 1 / 1 |  | full (B-2/B-3) | see B-2/B-3 row |
| 2 | `/m/p/[projectId]/files` | 227 | 2 / 1 |  | full (B-2/B-3) | see B-2/B-3 row |
| 2 | `/m/p/[projectId]/overview` | 226 | 1 / 1 |  | full (B-2/B-3) | see B-2/B-3 row |
| 2 | `/m/p/[projectId]/photos/[fileId]` | 233 | 3 / 1 |  | full (B-2/B-3) | see B-2/B-3 row |
| 2 | `/m/p/[projectId]/photos/[fileId]/markup` | 232 | 1 / 0 |  | full (B-2/B-3) | see B-2/B-3 row |
| 2 | `/m/p/[projectId]/punch` | 226 | 2 / 1 |  | full (B-2/B-3) | see B-2/B-3 row |
| 2 | `/m/p/[projectId]/punch/[itemId]` | 232 | 2 / 1 |  | full (B-2/B-3) | see B-2/B-3 row |
| 2 | `/m/p/[projectId]/punch/lists/new` | 230 | 1 / 1 |  | full (B-2/B-3) | see B-2/B-3 row |
| 2 | `/m/p/[projectId]/punch/new` | 231 | 1 / 1 |  | full (B-2/B-3) | see B-2/B-3 row |
| 2 | `/m/p/[projectId]/safety` | 226 | 1 / 1 |  | full (B-2/B-3) | see B-2/B-3 row |
| 2 | `/m/p/[projectId]/safety/new` | 231 | 2 / 1 |  | full (B-2/B-3) | see B-2/B-3 row |
| 2 | `/m/p/[projectId]/schedule` | 245 | 3 / 1 |  | full (B-2/B-3) | see B-2/B-3 row |
| 2 | `/m/p/[projectId]/signouts` | 228 | 1 / 1 |  | full (B-2/B-3) | see B-2/B-3 row |
| 2 | `/m/p/[projectId]/signouts/[signoutId]` | 244 | 1 / 1 |  | full (B-2/B-3) | see B-2/B-3 row |
| 2 | `/m/p/[projectId]/signouts/new` | 238 | 1 / 1 |  | full (B-2/B-3) | see B-2/B-3 row |
| 2 | `/m/schedule` | 238 | 2 / 2 |  | full (B-2/B-3) | see B-2/B-3 row |
| 2 | `/m/site-visits/[id]/photos/[fileId]/markup` | 232 | 2 / 0 |  | full (B-2/B-3) | see B-2/B-3 row |
| 3 | `/dashboard` | 248 | 5 / 1 | **yes** | full (B-2/B-3) | see B-2/B-3 row |
| 3 | `/dashboard/estimates` | 261 | 5 / 0 | **yes** | full (B-2/B-3) | see B-2/B-3 row |
| 3 | `/dashboard/estimates/[id]` | 324 | 10 / 0 | **yes** | full (B-2/B-3) | see B-2/B-3 row |
| 3 | `/dashboard/estimates/[id]/proposal` | 245 | 5 / 0 | **yes** | full (B-2/B-3) | see B-2/B-3 row |
| 3 | `/dashboard/estimates/new` | 257 | 3 / 0 | **yes** | full (B-2/B-3) | see B-2/B-3 row |
| 3 | `/dashboard/estimates/site-visits/[id]` | 233 | 0 / 0 |  | full (B-2/B-3) | see B-2/B-3 row |
| 3 | `/dashboard/field-ops` | 233 | 4 / 1 | **yes** | full (B-2/B-3) | see B-2/B-3 row |
| 3 | `/dashboard/field-ops/[projectId]` | 233 | 0 / 0 |  | full (B-2/B-3) | see B-2/B-3 row |
| 3 | `/dashboard/field-ops/[projectId]/daily-logs` | 236 | 4 / 1 | **yes** | full (B-2/B-3) | see B-2/B-3 row |
| 3 | `/dashboard/field-ops/[projectId]/daily-logs/[logId]` | 241 | 7 / 2 | **yes** | full (B-2/B-3) | see B-2/B-3 row |
| 3 | `/dashboard/field-ops/[projectId]/daily-logs/[logId]/edit` | 240 | 4 / 1 | **yes** | full (B-2/B-3) | see B-2/B-3 row |
| 3 | `/dashboard/field-ops/[projectId]/daily-logs/new` | 240 | 5 / 1 | **yes** | full (B-2/B-3) | see B-2/B-3 row |
| 3 | `/dashboard/field-ops/[projectId]/deliveries` | 238 | 5 / 1 | **yes** | full (B-2/B-3) | see B-2/B-3 row |
| 3 | `/dashboard/field-ops/[projectId]/deliveries/[poId]` | 245 | 6 / 2 | **yes** | full (B-2/B-3) | see B-2/B-3 row |
| 3 | `/dashboard/field-ops/[projectId]/deliveries/[poId]/edit` | 236 | 4 / 1 | **yes** | full (B-2/B-3) | see B-2/B-3 row |
| 3 | `/dashboard/field-ops/[projectId]/deliveries/check-in` | 238 | 4 / 1 | **yes** | full (B-2/B-3) | see B-2/B-3 row |
| 3 | `/dashboard/field-ops/[projectId]/deliveries/d/[deliveryId]` | 238 | 7 / 2 | **yes** | full (B-2/B-3) | see B-2/B-3 row |
| 3 | `/dashboard/field-ops/[projectId]/deliveries/d/[deliveryId]/edit` | 236 | 5 / 2 | **yes** | full (B-2/B-3) | see B-2/B-3 row |
| 3 | `/dashboard/field-ops/[projectId]/deliveries/new` | 236 | 4 / 0 | **yes** | full (B-2/B-3) | see B-2/B-3 row |
| 3 | `/dashboard/field-ops/[projectId]/safety` | 233 | 4 / 0 | **yes** | full (B-2/B-3) | see B-2/B-3 row |
| 3 | `/dashboard/field-ops/[projectId]/safety/new` | 252 | 4 / 1 | **yes** | full (B-2/B-3) | see B-2/B-3 row |
| 3 | `/dashboard/field-ops/[projectId]/signouts` | 234 | 4 / 1 | **yes** | full (B-2/B-3) | see B-2/B-3 row |
| 3 | `/dashboard/field-ops/[projectId]/signouts/[signoutId]` | 248 | 3 / 1 | **yes** | full (B-2/B-3) | see B-2/B-3 row |
| 3 | `/dashboard/field-ops/[projectId]/signouts/new` | 244 | 3 / 0 | **yes** | full (B-2/B-3) | see B-2/B-3 row |
| 3 | `/dashboard/field-ops/safety` | 233 | 3 / 0 | **yes** | full (B-2/B-3) | see B-2/B-3 row |
| 3 | `/dashboard/field-ops/safety/[incidentId]` | 252 | 7 / 2 | **yes** | full (B-2/B-3) | see B-2/B-3 row |
| 3 | `/dashboard/field-ops/safety/[incidentId]/edit` | 252 | 4 / 1 | **yes** | full (B-2/B-3) | see B-2/B-3 row |
| 3 | `/dashboard/field-ops/safety/new` | 252 | 3 / 1 | **yes** | full (B-2/B-3) | see B-2/B-3 row |
| 3 | `/dashboard/projects` | 239 | 10 / 3 | **yes** | full (B-2/B-3) | see B-2/B-3 row |
| 3 | `/dashboard/projects/[id]` | 276 | 5 / 5 |  | full (B-2/B-3) | see B-2/B-3 row |
| 3 | `/dashboard/projects/[id]/budget` | 248 | 5 / 3 |  | full (B-2/B-3) | see B-2/B-3 row |
| 3 | `/dashboard/projects/[id]/changes` | 247 | 5 / 1 | **yes** | full (B-2/B-3) | see B-2/B-3 row |
| 3 | `/dashboard/projects/[id]/changes/[coId]` | 267 | 7 / 1 | **yes** | full (B-2/B-3) | see B-2/B-3 row |
| 3 | `/dashboard/projects/[id]/chat` | 242 | 3 / 0 | **yes** | full (B-2/B-3) | see B-2/B-3 row |
| 3 | `/dashboard/projects/[id]/contacts` | 248 | 4 / 1 | **yes** | full (B-2/B-3) | see B-2/B-3 row |
| 3 | `/dashboard/projects/[id]/contracts` | 257 | 4 / 1 | **yes** | full (B-2/B-3) | see B-2/B-3 row |
| 3 | `/dashboard/projects/[id]/costs` | 239 | 0 / 0 |  | full (B-2/B-3) | see B-2/B-3 row |
| 3 | `/dashboard/projects/[id]/critical-path` | 260 | 6 / 1 | **yes** | full (B-2/B-3) | see B-2/B-3 row |
| 3 | `/dashboard/projects/[id]/deliveries` | 243 | 5 / 1 | **yes** | full (B-2/B-3) | see B-2/B-3 row |
| 3 | `/dashboard/projects/[id]/files` | 248 | 5 / 1 | **yes** | full (B-2/B-3) | see B-2/B-3 row |
| 3 | `/dashboard/projects/[id]/files/[fileId]/markup` | 247 | 5 / 0 |  | full (B-2/B-3) | see B-2/B-3 row |
| 3 | `/dashboard/projects/[id]/files/trash` | 242 | 5 / 0 | **yes** | full (B-2/B-3) | see B-2/B-3 row |
| 3 | `/dashboard/projects/[id]/files/upload` | 245 | 4 / 0 | **yes** | full (B-2/B-3) | see B-2/B-3 row |
| 3 | `/dashboard/projects/[id]/invoices` | 248 | 7 / 1 | **yes** | full (B-2/B-3) | see B-2/B-3 row |
| 3 | `/dashboard/projects/[id]/invoices/[invoiceId]` | 260 | 13 / 3 | **yes** | full (B-2/B-3) | see B-2/B-3 row |
| 3 | `/dashboard/projects/[id]/lien-releases` | 245 | 7 / 1 | **yes** | full (B-2/B-3) | see B-2/B-3 row |
| 3 | `/dashboard/projects/[id]/payments` | 255 | 8 / 1 | **yes** | full (B-2/B-3) | see B-2/B-3 row |
| 3 | `/dashboard/projects/[id]/photos` | 244 | 1 / 1 |  | full (B-2/B-3) | see B-2/B-3 row |
| 3 | `/dashboard/projects/[id]/profitability` | 240 | 6 / 1 | **yes** | full (B-2/B-3) | see B-2/B-3 row |
| 3 | `/dashboard/projects/[id]/punch` | 246 | 4 / 1 | **yes** | full (B-2/B-3) | see B-2/B-3 row |
| 3 | `/dashboard/projects/[id]/schedule` | 270 | 9 / 1 | **yes** | full (B-2/B-3) | see B-2/B-3 row |
| 3 | `/dashboard/projects/[id]/selections` | 244 | 4 / 0 | **yes** | full (B-2/B-3) | see B-2/B-3 row |
| 3 | `/dashboard/projects/[id]/selections/[selectionId]` | 267 | 5 / 1 | **yes** | full (B-2/B-3) | see B-2/B-3 row |
| 3 | `/dashboard/projects/[id]/team` | 243 | 4 / 1 | **yes** | full (B-2/B-3) | see B-2/B-3 row |
| 3 | `/dashboard/projects/new` | 236 | 4 / 0 | **yes** | full (B-2/B-3) | see B-2/B-3 row |
| 3 | `/dashboard/schedule` | 257 | 5 / 1 | **yes** | full (B-2/B-3) | see B-2/B-3 row |
| 3 | `/dashboard/timeclock` | 237 | 5 / 1 | **yes** | full (B-2/B-3) | see B-2/B-3 row |
| 3 | `/dashboard/timeclock/timesheets` | 256 | 7 / 3 | **yes** | full (B-2/B-3) | see B-2/B-3 row |
| 3 | `/dashboard/timeclock/timesheets/[sessionId]` | 238 | 7 / 2 | **yes** | full (B-2/B-3) | see B-2/B-3 row |
| 3 | `/dashboard/timesheets` | 233 | 0 / 0 |  | full (B-2/B-3) | see B-2/B-3 row |
| 3 | `/dashboard/timesheets/[sessionId]` | 233 | 0 / 0 |  | full (B-2/B-3) | see B-2/B-3 row |
| 3 | `/m/[...missing]` | 226 | 0 / 0 |  | full (B-2/B-3) | see B-2/B-3 row |
| 3 | `/m/account` | 229 | 1 / 1 |  | full (B-2/B-3) | see B-2/B-3 row |
| 3 | `/m/contacts` | 226 | 1 / 1 |  | full (B-2/B-3) | see B-2/B-3 row |
| 3 | `/m/contacts/[contactId]` | 226 | 3 / 1 |  | full (B-2/B-3) | see B-2/B-3 row |
| 3 | `/m/contacts/[contactId]/edit` | 231 | 2 / 0 |  | full (B-2/B-3) | see B-2/B-3 row |
| 3 | `/m/expenses` | 226 | 4 / 2 |  | full (B-2/B-3) | see B-2/B-3 row |
| 3 | `/m/offline` | 229 | 0 / 0 |  | full (B-2/B-3) | see B-2/B-3 row |
| 3 | `/m/p/[projectId]/changes` | 226 | 2 / 1 |  | full (B-2/B-3) | see B-2/B-3 row |
| 3 | `/m/p/[projectId]/changes/[coId]` | 232 | 3 / 1 |  | full (B-2/B-3) | see B-2/B-3 row |
| 3 | `/m/p/[projectId]/changes/new` | 248 | 3 / 0 |  | full (B-2/B-3) | see B-2/B-3 row |
| 3 | `/m/p/[projectId]/contacts` | 226 | 1 / 1 |  | full (B-2/B-3) | see B-2/B-3 row |
| 3 | `/m/p/[projectId]/selections` | 226 | 3 / 0 |  | full (B-2/B-3) | see B-2/B-3 row |
| 3 | `/m/p/[projectId]/team` | 226 | 1 / 1 |  | full (B-2/B-3) | see B-2/B-3 row |
| 3 | `/m/settings` | 226 | 2 / 1 |  | full (B-2/B-3) | see B-2/B-3 row |
| 3 | `/m/site-visits` | 226 | 3 / 1 |  | full (B-2/B-3) | see B-2/B-3 row |
| 3 | `/m/site-visits/[id]` | 237 | 4 / 1 | **yes** | full (B-2/B-3) | see B-2/B-3 row |
| 3 | `/m/site-visits/new` | 230 | 3 / 0 |  | full (B-2/B-3) | see B-2/B-3 row |
| 3 | `/m/subs` | 226 | 1 / 1 |  | full (B-2/B-3) | see B-2/B-3 row |
| 3 | `/m/subs/[subId]` | 226 | 2 / 1 |  | full (B-2/B-3) | see B-2/B-3 row |
| 3 | `/m/subs/[subId]/edit` | 229 | 2 / 0 |  | full (B-2/B-3) | see B-2/B-3 row |
| 3 | `/m/team` | 226 | 1 / 1 |  | full (B-2/B-3) | see B-2/B-3 row |
| 3 | `/m/team/[memberId]` | 226 | 3 / 1 |  | full (B-2/B-3) | see B-2/B-3 row |
| 3 | `/m/team/[memberId]/edit` | 230 | 3 / 0 |  | full (B-2/B-3) | see B-2/B-3 row |
| 4 | `/portal` | 136 | 4 / 0 |  | full (B-2/B-3) | see B-2/B-3 row |
| 4 | `/portal/[projectId]` | 138 | 5 / 0 |  | full (B-2/B-3) | see B-2/B-3 row |
| 4 | `/portal/[projectId]/files` | 213 | 5 / 1 |  | full (B-2/B-3) | see B-2/B-3 row |
| 4 | `/portal/[projectId]/financials` | 149 | 4 / 1 |  | full (B-2/B-3) | see B-2/B-3 row |
| 4 | `/portal/[projectId]/selections` | 153 | 4 / 0 |  | full (B-2/B-3) | see B-2/B-3 row |
| 5 | `/` | 95 | 0 / 0 |  | light | nothing found in a light read |
| 5 | `/bid/[token]` | 150 | 1 / 0 |  | light | nothing found in a light read |
| 5 | `/contact` | 95 | 0 / 0 |  | light | nothing found in a light read |
| 5 | `/dashboard/account` | 236 | 1 / 1 |  | light | nothing found in a light read |
| 5 | `/dashboard/billing` | 233 | 0 / 0 |  | light | nothing found in a light read |
| 5 | `/dashboard/billing/plans` | 234 | 4 / 0 | **yes** | light | B-1a; nothing else found in a light read |
| 5 | `/dashboard/billing/success` | 233 | 3 / 0 | **yes** | light | B-1a; nothing else found in a light read |
| 5 | `/dashboard/catalog` | 238 | 4 / 1 | **yes** | light | B-1a; nothing else found in a light read |
| 5 | `/dashboard/catalog/[id]/edit` | 248 | 4 / 0 | **yes** | light | B-1a; nothing else found in a light read |
| 5 | `/dashboard/catalog/new` | 248 | 4 / 0 | **yes** | light | B-1a; nothing else found in a light read |
| 5 | `/dashboard/contacts` | 241 | 6 / 2 | **yes** | light | B-1a; nothing else found in a light read |
| 5 | `/dashboard/contacts/[id]/edit` | 250 | 5 / 1 | **yes** | light | B-1a; nothing else found in a light read |
| 5 | `/dashboard/contacts/new` | 250 | 3 / 0 | **yes** | light | B-1a; nothing else found in a light read |
| 5 | `/dashboard/contacts/trash` | 237 | 4 / 0 | **yes** | light | B-1a; nothing else found in a light read |
| 5 | `/dashboard/expenses` | 250 | 6 / 1 | **yes** | light | B-1a; nothing else found in a light read |
| 5 | `/dashboard/expenses/new` | 233 | 4 / 1 | **yes** | light | B-1a; nothing else found in a light read |
| 5 | `/dashboard/expenses/trash` | 235 | 4 / 1 | **yes** | light | B-1a; nothing else found in a light read |
| 5 | `/dashboard/notifications` | 238 | 1 / 0 |  | light | nothing found in a light read |
| 5 | `/dashboard/settings` | 286 | 12 / 5 | **yes** | light | B-1a; nothing else found in a light read |
| 5 | `/dashboard/settings/accounting` | 239 | 4 / 1 | **yes** | light | B-1a; nothing else found in a light read |
| 5 | `/dashboard/settings/tags` | 234 | 4 / 0 | **yes** | light | B-1a; nothing else found in a light read |
| 5 | `/dashboard/site-visits` | 233 | 1 / 0 |  | light | nothing found in a light read |
| 5 | `/dashboard/site-visits/[id]` | 246 | 5 / 0 | **yes** | light | B-1a; nothing else found in a light read |
| 5 | `/dashboard/site-visits/[id]/photos/[fileId]/markup` | 238 | 1 / 0 |  | light | nothing found in a light read |
| 5 | `/dashboard/subcontractors` | 239 | 6 / 2 | **yes** | light | B-1a; nothing else found in a light read |
| 5 | `/dashboard/subcontractors/[id]` | 241 | 6 / 0 | **yes** | light | B-1a; nothing else found in a light read |
| 5 | `/dashboard/subcontractors/[id]/edit` | 237 | 6 / 0 | **yes** | light | B-1a; nothing else found in a light read |
| 5 | `/dashboard/subcontractors/new` | 237 | 3 / 0 | **yes** | light | B-1a; nothing else found in a light read |
| 5 | `/dashboard/subcontractors/trash` | 236 | 4 / 0 | **yes** | light | B-1a; nothing else found in a light read |
| 5 | `/dashboard/team` | 252 | 7 / 1 | **yes** | light | B-1a; nothing else found in a light read |
| 5 | `/dashboard/team/[id]` | 254 | 7 / 1 | **yes** | light | B-1a; nothing else found in a light read |
| 5 | `/dashboard/team/[id]/documents` | 235 | 6 / 0 | **yes** | light | B-1a; nothing else found in a light read |
| 5 | `/dashboard/team/invite` | 249 | 4 / 0 | **yes** | light | B-1a; nothing else found in a light read |
| 5 | `/dashboard/trial` | 233 | 5 / 0 | **yes** | light | B-1a; nothing else found in a light read |
| 5 | `/dashboard/trial/export` | 235 | 4 / 0 | **yes** | light | B-1a; nothing else found in a light read |
| 5 | `/forgot-password` | 156 | 1 / 0 |  | light | nothing found in a light read |
| 5 | `/invite/accept` | 148 | 0 / 0 |  | light | nothing found in a light read |
| 5 | `/locked` | 95 | 3 / 0 | **yes** | light | B-1a; nothing else found in a light read |
| 5 | `/onboarding` | 88 | 5 / 0 | **yes** | light | B-1a; nothing else found in a light read |
| 5 | `/pricing` | 95 | 0 / 0 |  | light | nothing found in a light read |
| 5 | `/privacy` | 95 | 0 / 0 |  | light | nothing found in a light read |
| 5 | `/reset-password` | 88 | 4 / 0 | **yes** | light | B-1a; nothing else found in a light read |
| 5 | `/resubscribe` | 88 | 2 / 0 |  | light | nothing found in a light read |
| 5 | `/resubscribe/success` | 95 | 0 / 0 |  | light | nothing found in a light read |
| 5 | `/sign-co/[token]` | 95 | 6 / 0 |  | light | nothing found in a light read |
| 5 | `/sign-in` | 156 | 0 / 0 |  | light | nothing found in a light read |
| 5 | `/sign-up` | 156 | 1 / 0 |  | light | nothing found in a light read |
| 5 | `/sign/[token]` | 111 | 6 / 0 | **yes** | light | B-1a; nothing else found in a light read |
| 5 | `/terms` | 95 | 0 / 0 |  | light | nothing found in a light read |
| 5 | `/trial-limit` | 95 | 4 / 0 | **yes** | light | B-1a; nothing else found in a light read |

---

## ⚠️ FINDINGS RANKED BY FIELD IMPACT

No number here is a measurement. "Size" is the estimated size of the fix; "could break" is what a fix risks.

| # | finding | tier hit | cause (where) | fix size | what could break |
| --- | --- | --- | --- | --- | --- |
| **1** | **⚠️ RULED A DEFECT (Josh, 2026-10-02) for its two double-tap outcomes; the rest is polish.** **Crews get no feedback, or a re-enabled button, after the actions they repeat all day.** Clock in, clock out, switch job/break, punch create/complete, log closeout: the button turns back on *before* the screen catches up, then the old screen sits frozen while the server re-renders; `router.push` from code shows no bar. A second tap on clock-in hits a raw DB error; on punch create it makes a duplicate | 1, 2 | G-3, G-4: `timeclock-screen.tsx:270→283-285`, `:534→542`; `switch-screen.tsx:150→155`; `punch-form.tsx:200→252`; `punch-actions.tsx:122/138→127/143`; `daily-log-closeout-view.tsx:45→47`; `nav-pending.tsx:29-31` | **small** — keep busy until the navigation/refresh settles (`useTransition` + `isPending` around `router.push`/`refresh`); teach `NavPending` programmatic navigation | double-submit guards relying on busy timing; tests asserting the button label after save |
| **2** | **No route has a loading state.** 0 `loading.tsx`, no streaming Suspense; every navigation shows the old screen frozen (or nothing on first load) until the *whole* server render finishes. Dashboard and portal have no navigation feedback at all | all | G-1, G-2, G-3 | **small–medium** — `loading.tsx` skeletons for tier 1–2 `/m` routes first (the `/m` shell persists around them), then dashboard project tabs and portal | a `loading.tsx` placed at the wrong level flashes on searchParam-only changes (photo search, chips) or replaces the shell; e2e tests that wait on old-screen text. **The router cache (`staleTimes`) is NOT part of this — settled, not reopened** |
| **3** | **The photo viewer re-loads and re-signs the whole gallery on every swipe**, and its filmstrip mounts every thumbnail at once | 2 | C-4a, D-3: `photos/[fileId]/page.tsx:52`, `viewer.tsx:161,636-660` | **medium** — pass the gallery once (client-side navigation between photos within one page) and lazy-load the strip | viewer deep links (`/photos/{id}` must still work cold); markup return path |
| **4** | **Photo grid on iPhone downloads ~the whole project, every visit**: 12-screen look-ahead because Safari reports no connection info; signed URLs change every render so nothing is browser-cached; search/chip taps re-run all 7 queries and re-sign up to 1500 URLs | 1 | D-1, D-8, B-2 photos row: `thumbnail.ts:40-51`, `photos.ts:210-216`, `photo-search.tsx:53-62`, `public/sw.js:135` | **medium** — smaller iOS buffer (trivial); filter/search on the client; stable thumbnail URLs (needs a **security ruling** — see decisions) | URL lifetime vs. leakage of a photo link; a cached thumbnail outliving a delete/markup |
| **5** | **`/m/logs` reads every daily log the company has ever written**, then an `IN` list of all their ids to count photos — 7 deep, and it grows forever | 1 | B-1d: `daily-logs.ts:260-270, 289-293, 318, 322` | **small–medium** — a window or page + an embedded count | the "this week" count (`:58` comment: it counts the unfiltered week); older logs need a "load more" |
| **6** | **The `/m` shell ships 226 KB gz before any screen code**: 53 KB browser Supabase client (incl. Realtime) and 35 KB catalog in both languages | all `/m` | C-1a: `mobile-shell.tsx:24`, `offline-sync.tsx:12-13`, `lib/i18n/messages.ts:2-9,72,127` | catalog per language: **small**; deferring the Supabase client/offline sync: **medium** | a missing Spanish key rendering its id; offline queue replay starting later |
| **7** | **Schedule screens read all-time events in 4 sequential reads**; the project schedule also loads Critical Path data for projects not on Critical Path | 2 | B-1d, B-2: `schedule.ts:129-265`; `lib/critical-path/load.ts:53,62,115` | **small–medium** — date window + `Promise.all` inside `getCalendarEvents`; skip CP load when off | "up next" needing future-dated events beyond the window; compliance expiries |
| **8** | **Clock-in screen: N+1 segment reads and the profile read 3×** | 1 | B-1e, B-2: `timeclock/page.tsx:54`, `time-tracking.ts:45` | **small** | today's-segments list ordering |
| **9** | **Photo upload: full resolution over LTE, 5 round trips per photo (3 repeated identity reads), one at a time; HEIC converted on the phone's main thread** | 1 | G-4, D-9: `files-client.ts:194-288`, `capture-screen.tsx:160-161`, `thumbnail.ts:28` | resolution: **a product decision**; repeated reads: **small** | evidence-grade photos (resolution is a ruling, not a tuning); storage-cap check accuracy |
| **10** | **Repeated per-request reads**: `profiles` read 3–5×, `companies` 2–3×, member/settings/open-session re-read by layout and page. _(The 79 page-level `getUser()` calls were in this row until 2026-10-02 and are now **finding 16**.)_ | 3 (and `/m` layout) | F-1 | **small, mechanical** — `cache()` the helpers | a page that needs a fresh read after a same-request write (Server Actions) |
| **16** | **79 dashboard/portal pages make their own Auth-server `getUser()` call on top of the layout's**, and the page's queries wait behind it; portal project pages make **3** per render. _Numbered 16 so 1–15 keep their numbers; it ranks here, between 10 and 11._ | 3, 4 | B-1a; full write-up: §"Finding 16" below | **small** for the drop-in (`getRequestUser()`); the claims-only variant is a **ruling** | see §"Finding 16" |
| **11** | **Dashboard home and projects list: a full profitability report per project** (~19–33 queries each), plus company-wide `instrument_rates` each time — the only place cost scales with company size | 3 (Owner/Admin) | B-1b | **medium–large** — set-based rollup | Financial-Floor money figures; needs the role-matrix tests |
| **12** | **Company-wide reads with no filter** | 2–4 | B-1c: `selections.ts:124`, `invoices.ts:469-472`, `profitability.ts:209-211`, `payables.ts:238-243` | **small** each | the JS-side filtering that currently compensates |
| **13** | **Portal: 3 Auth-server calls per page, identity and projects re-queried, full-size photos with no limit** | 4 | B-3, D-6 | **small–medium** | the deliberate re-check at `portal/[projectId]/page.tsx:40-44` (keep the check, cache the read) |
| **14** | Middleware on `/dashboard`: 1–2 batches per request, multiplied by prefetches (S115: 19–32 runs per screen load) | 3 | E | report only — the trade is Josh's | — |
| **15** | Low: signature pad loaded on `/portal/[projectId]/files` (C-2a); four useT-only client components (C-3); 4 server modules without `server-only` (C-2) | — | | small | — |

**Rejected without evaluation, by ruling:** any proposal to disable or shorten the client router cache
(`staleTimes`). Nothing in this report proposes it.

---

## RULINGS (2026-10-02) and the assessments they asked for

Josh ruled on ASK-1…4 in the session's follow-up message. This section records the rulings and the additions they
carry, then gives the three assessments Josh asked for: Q2's proxy route, Q3's background upload, and finding 16.
**It is still a static assessment.** Nothing below was timed, run or fixed. Every millisecond figure is quoted from
an earlier session's measurement and is labelled with where and how it was taken.

### R1 — Order of attack: A, then B; 11 separately. Two items in A are DEFECTS.

**Ruling.** Findings 1 and 2 first, then the query fixes (5, 7, 8, 10 and now 16). **Finding 11 goes in its own
change**, because it changes how money figures are calculated and needs the role-matrix tests (the #136 class).

**⚠️ Two outcomes in finding 1 are defects, not slowness.** Josh's ruling: *if the fix build runs out of road, these
two must have landed.*

1. **A second tap on clock-in shows a raw database error.** The first tap re-enables the button
   (`timeclock-screen.tsx:270`) before the navigation (`:283-285`). The second insert is then refused by
   `idx_time_clock_sessions_one_open_per_member`, and its message reaches the crew member unchanged. This is the
   single most-used action in the app.
2. **A second tap on punch create makes a duplicate punch item.** `setBusy(false)` at `punch-form.tsx:200` runs
   before the push at `:252`, and the title is not cleared.

The loading screens and the progress bar on code-triggered moves come **after** these two.

**Fix shape (not fixed here).** These are **notes for the fix build, not verified designs.**
- **Keep the button busy until the navigation settles.** That closes the window.
- **Clock-in:** also map the unique violation to an honest "already clocked in" answer. The index is the true
  guard; it should not surface raw.
- **Punch create:** also needs an idempotency guard, not just a timing one. The offline queue's pattern fits: a
  client-generated id, so N submits land one row (`offline-sync.tsx:69-72`, §5.3).
- **Each fix gets a test:** a double tap produces exactly one session or item, and no raw error text.

**Why the unbounded reads come second and not third.** This is written down so nobody later reads "second" as
"optional". The unbounded history reads are **time bombs**, not current pain: `/m/logs` reads every log ever
written (finding 5), and the schedule reads every event ever scheduled (finding 7). On today's data they are fine;
in a year they make those screens unusable. Their cost grows with company age, not with what the screen shows. They
are in the second batch because they get worse on their own while nobody touches them.

### R2 — Stable thumbnail URLs: A in principle, thumbnails only. FIRST compare the proxy route.

**Ruling.** Option A (a longer-lived signed URL, thumbnails only) is acceptable in principle. Before choosing it,
assess a third option: a stable application route that checks authorisation server-side and streams the bytes with
cache headers, so that **no signed URL reaches the browser at all**. Josh's reason, from `lib/share-image.ts`:
signed URLs are *"time-limited bearer credentials … for the life of the signature."* Lengthening the signature
lengthens that exposure.

**Assessment. Verdict: the proxy route is better, and A is more expensive than it looked.** The details follow.

**(a) Option A, as framed, does not produce a stable URL.**
- Every render calls `createSignedUrls` again (`files.ts:303-325`, via `photos.ts:216`), and each call mints a new
  token.
- **This is inference:** Storage signs a JWT carrying `iat`/`exp`, so a re-sign in a later second yields a
  different string. Confirming it needs one signing call twice, which is deferred to the timing half, because it
  touches Storage.
- A longer TTL alone therefore changes nothing for the browser cache. The cache key would still change on every
  visit.
- To make A work, the minted URL would have to be **kept across requests**, either stored or cached. That is:
  - the cross-request cache that R4 puts after Q1, with R4's tenant-key conditions;
  - **and** a bearer credential stored somewhere longer-lived than one interaction, which is exactly what the S157
    sweep in `lib/services/signed-url-ttl.ts` warns about (*"A signed URL that is EMBEDDED somewhere longer-lived
    than its TTL…"*).
- So A is not "one constant". It is **medium** work, and it creates a stored bearer credential.

**(b) The proxy route is feasible and modest in size.** The pieces already exist on this ref:

| piece | evidence | consequence |
| --- | --- | --- |
| **The authorisation gate already exists in Storage RLS.** | `app/api/files/signed-url/route.ts` signs with the **caller's** RLS-scoped client; the gate is `project_files_select_non_client`. | A route that calls `.download(thumbPath)` with the same user-scoped client is gated identically. **No new auth code**, and the same 403 anti-enumeration contract as that route. |
| **Streaming bytes from a route is an established pattern.** | `app/api/invoices/[id]/pdf/route.ts:89-97` returns a `Uint8Array` with explicit `Cache-Control`. | A thumbnail route copies that shape. |
| **The thumbnail name is already versioned.** | `thumbPathFor()` (`packages/shared/utils/markup.ts:113-117`) puts the markup fingerprint in the name. | A URL built from it changes when the markup changes, so `immutable` caching is safe against stale annotations. |
| **The route would be same-origin.** | `public/sw.js:135` skips only cross-origin requests. | The browser HTTP cache (and the service worker, if wanted) can hold the thumbnail. |
| **Middleware runs on it.** | The matcher includes `/api/:path*` (`middleware.ts:399-418`). | Each cache miss pays `getClaims` (local) plus the lock check (`ff_lock_ok` cookie, 30 s TTL, else one RPC). The session refresh and the trial lock both apply, which is correct. |

**(c) What it costs, per thumbnail. Counts, not times.**
- **Cache miss:** one function invocation, plus one Storage download with the user's JWT (Storage evaluates RLS).
  That is **1 Supabase round trip** if the URL carries the storage path, or **2** if it carries the file id and
  reads the `files` row first.
- **Cache hit:** **zero requests.**
- **Compared with today, on a 200-photo grid:**
  - **First view:** 1 batch-sign call plus ~200 direct Storage fetches today, against ~200 function invocations,
    each 1–2 round trips, through the proxy. The proxy is **more server work on first view**.
  - **Every later view:** ~200 fetches **again** today (D-8), against **0** through the proxy.
- **Byte path:** the thumbnail bytes (15–40 KB each, inference) pass through Vercel instead of going
  Supabase → phone directly, which counts against Vercel function and transfer billing.
- **The batch-sign call shrinks:** thumbnails leave the sign list (`photos.ts:214`).

**(d) The risks the fix build must close.**
1. **`Cache-Control` must be `private`, never `public` or `s-maxage`.**
   - A shared-cache header on this route lets Vercel's CDN serve one user's thumbnail to another user: a
     **cross-tenant leak**.
   - The header must be asserted by a test, with a sabotage (change it to `public`) that must go red.
2. **The authorisation negative test must not return rows or bytes to prove itself.**
   - A thumbnail of another company's file must get **403 and zero bytes**.
   - Its sabotage (swap the user client for the admin client) must go red.
3. **The missing-thumbnail ruling must survive.** `photos.ts:241-247`, RULED: a missing thumbnail falls back to the
   full display file, never an invisible tile.
   - Today the page learns that a thumbnail is missing for free, from the per-row signing error. Through the proxy,
     the route has to do the fallback itself: on a 4xx for the thumbnail, try the display file.
   - **The 403 decision stays on the original**, as `app/api/files/signed-url/route.ts` already does for markup derivatives.
4. **Revocation and delete.**
   - A device that has already shown a thumbnail keeps it in its HTTP cache for `max-age`.
   - That is the same *class* of exposure as a held signed URL, but narrower. It sits only on a device that was
     legitimately shown the thumbnail, and it **cannot be forwarded**, because there is no credential in it.
   - `max-age` is the knob.
5. **Storage concurrency.** Today one sign call serves a page. The proxy makes ~200 Storage downloads per cold
   grid, 6 at a time per phone (`use-lazy-src.ts:34-35`).
   - Storage's 429 "SlowDown" has been seen on rebuild-test (`files.ts:311-318`).
   - **This is the timing half's question**, not a reason to stop.

**(e) ⚠️ This conflicts with an earlier ruling, and that ruling has to be narrowed explicitly.**
`lib/services/signed-url-ttl.ts` (S157, ruled by Josh) says:

> "Explicitly NOT a re-check of authorisation when the URL is used — that would be a round trip on every photo
> thumbnail and every PDF open, a permanent efficiency cost paid to close a narrow risk."

The proxy route **is** a re-check on use.
- The browser cache changes the arithmetic. The re-check becomes a round trip **per cache miss, not per view**, and
  on repeat views it is cheaper than today.
- But it is still the thing that ruling declined. Building it without narrowing that ruling would leave the code
  contradicting its own recorded rule.
- Asked as **ASK-6** below.

**Size.** The proxy is **small–medium**:
- one route of about 100 lines, written to the error-contract conventions;
- the `thumbUrl` change in `photos.ts`;
- three tests: the authorisation negative, the `private` header, and the missing-thumbnail fallback.

That is comparable to A once A's hidden cost (a cross-request URL cache) is counted. **It is not strictly better in
every respect:** it costs more server work on a cold first view. **It is better overall:**
- no bearer credential is lengthened, and none is handed to the browser;
- repeat views cost nothing;
- revocation is honoured on every cache miss.

**Recommendation: the proxy route, thumbnails only, subject to ASK-6.**

### R3 — Upload resolution: KEEP FULL RESOLUTION. Stop the crew WAITING instead.

**Ruling.** Option A. `thumbnail.ts:28` ("Uploads keep full resolution") stands.
- Construction photos are **evidence**: concealed conditions, water intrusion, a sub's defective work,
  change-order justification.
- Detail destroyed at capture cannot be recovered.

The LTE problem is answered by **not making anyone wait on the upload**, not by shrinking the file.

**Assessment: what "thumbnail on the device, full-resolution upload in the background, user moves on" would take.**

**Most of the machinery already exists.** It is the offline path, and the online path does not use it:

| exists today | where |
| --- | --- |
| A persistent upload queue in the `/m` **shell**, which lives across `/m` navigations | `OfflineSyncProvider` mounted at `app/m/mobile-shell.tsx:318-324` |
| Photo entries carrying the full-resolution Blob, sent **through `uploadFile`** (HEIC conversion, cap check, server thumbnail generation included) | `buildPhotoEntry` (`lib/offline/capture.ts:139`); `uploadQueuedPhoto` (`app/m/offline-sync.tsx:51-79`) |
| **Idempotent replay:** a client-generated file id, so N replays land one row | `offline-sync.tsx:69-72` |
| Ordering between entries (`depends_on`), retry with backoff, and a resume-on-open | `log-form.tsx:147-180`; `offline-sync.tsx:195-199` |
| Chromium Background Sync wake-ups | `offline-sync.tsx:157-171` |
| On-device thumbnails, per-photo status, and a persisted held-shot tray in capture | `capture-store.tsx`, `capture-screen.tsx` (G-4: "the best path in the app") |

**Where crews wait today (the online path awaits every upload inline):**

| screen | the wait |
| --- | --- |
| **Daily log submit** | One "Submitting" state over **every photo, one at a time** (`app/m/logs/new/log-form.tsx:221-231`). The worst case: a log with 6 photos is 6 full-resolution uploads before "Submitted". |
| Capture filing run | Serial awaited uploads (`capture-screen.tsx:131`). Rows show progress, but the run is tied to the screen. |
| Punch complete with photo | `punch-actions.tsx:105` |
| Delivery check-in photos | `check-in-form.tsx:143` |
| Safety incident photos | `incident-form.tsx:113` |

**The change, per screen:**
- Save the record online as today. The "Submitted" answer needs the row.
- **Enqueue** the photos with the record's id, the way the offline branch already does, instead of awaiting each
  upload.
- Release the screen.

On top of that:
- a shell-level "N photos uploading" indicator (the queue already counts entries for its offline badge);
- local object-URL thumbnails for the uploader's own pending photos in the project grid and log detail, marked
  "uploading". **This part is new**: the grid is a server-rendered list today, and the queued Blobs would have to be
  merged into it on the client.

**What it cannot do. State this to the crews honestly.**
1. **iOS has no Background Sync.** The code says so at `offline-sync.tsx:163`, and iOS suspends a backgrounded PWA
   (platform behaviour, inference).
   - The upload proceeds **only while FrameFocus is open in the foreground**.
   - "Move on" means move on **inside the app**: the next screen, the next task. It does not mean closing the app.
   - A closed app resumes the queue on next open (`offline-sync.tsx:195-199`).
   - The indicator has to say so ("3 photos still uploading — keep FrameFocus open").
2. **Leaving `/m` for `/dashboard`** unmounts the shell and pauses the queue until `/m` is reopened.
3. **HEIC conversion runs on the main thread** (`heic2any`, serial by ruling, `capture-screen.tsx` header).
   - In the background it will stutter whatever screen the user moved to.
   - Moving it into a Web Worker is the fix. **Whether `heic2any` can run in a worker is unverified.**
4. **Full-resolution Blobs sit in IndexedDB until they land.** That is 2–5 MB each (inference), against the
   held-shot cap of 25 and its TTL sweep.
   - Safari's storage quota and eviction for an installed PWA is platform behaviour to confirm on a device in the
     timing half.
5. **Other users** see the photo only once it has landed and its server thumbnail exists. That is unchanged from
   today.

**Size:**
- **Medium** overall.
- Converting the five online paths to enqueue-and-release is **small–medium**, because the queue and its entry
  types exist.
- The "pending photos" overlay in grids is **medium**.
- The worker move for HEIC is **unknown**.

**Order:** after R1's fixes, because both touch `log-form.tsx`.

**Tests:**
- a log created online with queued photos ends with every photo bound to that log
  (`daily_log_id`, set without `depends_on`);
- the done-state never says "uploaded" while entries remain.

### R4 — Cross-request caching: A, exactly as scoped. Its own reviewed change, after Q1.

**Ruling.** Allowed, using the service role plus an explicit company filter and never relying on RLS inside a
cache. Built as its own reviewed change, after the Q1 work.

**⚠️ NON-NEGOTIABLE when it is built (Josh):**
- **The cache key includes `company_id`.**
- **A negative test proves one company's cached value can never be served to another.** The test:
  - is written **without returning rows**, so it measures the cache rather than a read policy (CLAUDE.md, S181c);
  - has **its own sabotage that must go red**, for example dropping `company_id` from the key.

Josh's reason: *a cross-tenant cache leak is worse than any amount of slow.*

### Finding 16 — 79 pages make their own Auth-server call on top of the layout's

Numbered on Josh's word, so it does not get lost under "office side".

**History.** In September the claim was that the **middleware** called `getUser()` on every request
(`S125-prompt.md:65`). That was wrong: `getClaims()` has been in the middleware since S116 (`middleware.ts:45-68`).
**The shape is real, but in the pages, not the middleware.**

**What happens (verified on this ref):**
- **Every one of the 79 calls is a page-file call.**
  - `grep -rln "supabase.auth.getUser()" app/dashboard app/portal --include=page.tsx` → **79** files.
  - Control: the same grep finds `getRequestUser` in only **2** `page.tsx` files across `app/`.
- **The layouts already ask once per request.** `app/dashboard/layout.tsx:18`,
  `app/dashboard/projects/[id]/layout.tsx:19` and `app/m/layout.tsx:79` call `getRequestUser()`, which is memoised
  with `cache()` (`lib/supabase-server.ts:68-74`). The page's direct call is **not** memoised, so it is a second
  Auth-server round trip in the same render.
- **The portal is worse.**
  - `app/portal/layout.tsx:73` calls `getUser()` directly.
  - So does `getPortalIdentity()` (`lib/services/portal.ts:173`), which `app/portal/[projectId]/layout.tsx:46`
    **and** each project page (`page.tsx:38`, `files:38`, `selections:60`, `financials:64`) call.
  - That is **3 Auth-server calls per portal project render**.
- **The page's queries wait for it, for two separate reasons.**
  1. Every one of the 79 pages awaits `getUser()` before its first query, to get `user.id` or to redirect. The call
     sits **on the page's own critical path**, whatever the answer to the open layout/page overlap question (G-4).
  2. `createClient` is `cache()`d, so the layout and the page share **one** Supabase client, and auth-js
     serialises on that client. Per `lib/supabase-server.ts:55-57` (S115), every PostgREST query waits on the same
     queue while a `getUser()` is in flight. So the page's call also stalls the layout's queries that are queued
     behind it.

**What it costs per page load. A count, and a quoted earlier measurement; no timing was taken here.**
- **Count:**
  - **+1 Auth-server round trip** per dashboard page render (2 instead of 1);
  - **+2** per portal project render (3 instead of 1);
  - a `GET /auth/v1/user` each, plus the queue stall above.
- **Quoted time:** S115 measured `getUser` at **53–74 ms** (medians, n=20; `S115-report.md:130`). Against the same
  setup, `getClaims` measured **1 ms**.
  - **This is NOT a production figure.** It was taken Codespace → rebuild-test, not Vercel `iad1` → production
    `us-east-1`, and the in-region number is probably lower.
  - Read it as "one Auth round trip, tens of milliseconds, serialised". **The timing half replaces it** with an
    in-region trace.
- **Multipliers are not counted here:** prefetches and `router.refresh()` re-renders. Every refresh of a dashboard
  page pays it again.

**What it would take. Two levels. The first needs no ruling.**

**16a. Pages → `getRequestUser()`. No security change. Small. Recommended.**
- **Every one of the 79 pages uses only `user.id` or a null check**, verified by grep on each file: 66 read
  `user.id`, 2 read `user?.id`, and 11 only test `!user`.
  - No page reads `email`, metadata or any field `getRequestUser()` would not also return. It returns the same
    `User`, so it is a drop-in.
- **Per page:** replace the three-line `supabase.auth.getUser()` destructure with
  `const user = await getRequestUser();`.
- **Portal:** `app/portal/layout.tsx:73` and `getPortalIdentity()` (`portal.ts:173`) move to `getRequestUser()`
  too.
- **Result:** exactly **1** Auth-server call per render on every dashboard and portal page. The verdict is the same
  Auth-server answer, so the revocation behaviour is unchanged.
- **Guard against regrowth:** a static test that no `page.tsx` under `app/dashboard`, `app/portal` or `app/m`
  calls `supabase.auth.getUser()` directly. Its control: re-add one call, and the test must go red.
- **Residual, not covered by the count of 79:** 12 `getUser()` call sites in 11 `lib/` files, excluding comments
  and `getRequestUser` itself. They are `seats`, `billing`, `add-ons`, `quickbooks`, `qb-accounts`, `profile-self`
  (2), `ai-tagging`, `site-visits/markup-page`, `change-my-password` and `reset-password`, plus `portal`, which is
  covered above.
  - They reach mostly settings, billing and Server Actions (tiers 4–5). They were not traced to their pages.
  - **Server Actions that genuinely need a fresh verdict after a write** must keep their direct call. Check each
    one; do not sweep them.

**16b. The already-verified claims (`getClaims()`) instead of `getUser()`. Zero Auth-server calls per render.
⚠️ This needs a ruling, because it reopens S116.**
- **How:** a `cache()`d `getRequestClaims()` that calls `getClaims()`, which verifies locally against the cached
  ES256 JWKS, as middleware already does.
  - The middleware's own verification cannot be handed to the render safely without trusting a request header, so
    the render re-verifies, at about 1 ms.
  - Pages use `claims.sub` in place of `user.id`, and everything above shows that is all they need.
- **What it gives up:**
  - A session revoked server-side (signed out on another device, or killed by an admin) keeps rendering page shells
    until its access token expires. That is **≤ 1 h**, per the middleware comment at `middleware.ts:51-57`.
  - S116 accepted that gap for the middleware **because** "every layout still calls getUser()". 16b would remove
    that backstop.
  - The one path that must stay authoritative, the redirect away from `/sign-in` and `/sign-up`, keeps `getUser()`,
    exactly as today.
- **Why the gap is smaller than it sounds:**
  - Supabase's docs (Context7, `guides/auth/server-side/advanced-guide.mdx` and `guides/auth/signout.mdx`): *"an
    unexpired token stays valid even when the session behind it was revoked"*.
  - PostgREST authorises on that same token, so **the data behind these pages is already reachable** by a
    revoked-but-unexpired token today. The page-level `getUser()` protects the page's redirect, not its data.
  - **Before ruling, check one thing:** how removing a company member is enforced. If removal takes effect through
    RLS (membership rows), it bites immediately regardless of the token. If it relies on session revocation, 16b
    widens it. **Not checked here.**
- **Size:** small once 16a has landed (one helper; the 79 call sites change from `getRequestUser` to the claims
  helper).
- **What could break:** the revocation backstop above, and any page that later needs a user field that is not in
  the JWT.

**Recommendation:**
- **16a in the B batch.** It removes the duplicate at no security cost.
- **16b only on an explicit ruling** (ASK-7), after the member-removal check.

---

## Deferred, and why

| deferred | why | what it needs |
| --- | --- | --- |
| **Every timing number** (cold / navigation / mutation, all three throttle levels, real phone at 402 px) | S124 is running production migrations, CI and a 5-minute sync worker right now; any timing taken today measures S124 | a quiet window; the S121 throttle method |
| `EXPLAIN` / `EXPLAIN ANALYZE`, and **index findings** | queries a database | production-shaped data; read-only role |
| **Spec Area C — RLS policy cost** | needs query plans | same |
| **Measured RSC payload sizes** | needs the app running | the `#136` payload tooling |
| **Whether layout and page reads overlap** (G-4 note) | needs a trace | per-request Supabase call trace (S119 "depth") |
| **Production PostgREST pool size / connection headroom** | dashboard setting; not in the repo | Supabase dashboard → Database → Connection pooling |
| **Function region re-confirmation** | a live request; S120's reading (2026-09-30) stands | `x-vercel-id` header, or Vercel → Settings → Functions |
| **Device-side costs**: JS parse/execute on a mid-range phone, HEIC conversion time, upload time over LTE | needs a device | a real phone, throttled |
| **Prefetch fan-out** (one RSC prefetch per photo tile? per Link?) | needs a production server and a trace | `next build && next start` or production |
| **~50 low-traffic pages read "light"** (tier 5 and `/dashboard` catalog/contacts/subs/team/expenses/settings/site-visits/billing/trial) | time; low field impact | a full read if any lands in the top of the timing results |
| **Correctness notes found in passing** (B-2 footer; unordered `.limit()` table) | not performance; not this audit's to fix | tech-debt filing on Josh's word |

**Nothing above was attempted.** No database was contacted (the local build pointed Supabase at `127.0.0.1:1`).

---

## What Josh has to decide

**Decided on 2026-10-02** (full text: §"RULINGS"):

| ask | question | ruling |
| --- | --- | --- |
| ASK-1 | Order of attack | 1 + 2 first, and **the clock-in raw error and the punch-create duplicate are DEFECTS that must land even if nothing else does**; then 5, 7, 8, 10, 16 (unbounded reads are time bombs: second, not optional); 11 alone with the money tests |
| ASK-2 | Thumbnail URL lifetime | A in principle, thumbnails only; **assess the proxy route first** (assessed: proxy recommended, pending ASK-6) |
| ASK-3 | Upload resolution | **Keep full resolution** (evidence); remove the *wait* instead (assessed in R3) |
| ASK-4 | Cross-request caching | Yes, service role + explicit company filter, own reviewed change after Q1; **`company_id` in the key and a no-rows negative test with a sabotage that goes red** |

**Still open:**

5. **(ASK-5)** Whether the stale middleware comment (`middleware.ts:389-390`, "Every API request now runs getUser()";
   it runs `getClaims()` since S116) gets corrected in the first fix build. Docs only.
6. **(ASK-6)** Narrowing the S157 ruling in `lib/services/signed-url-ttl.ts` ("Explicitly NOT a re-check of
   authorisation when the URL is used") for **thumbnails served through the proxy route**, where the re-check runs
   per browser-cache miss, not per view. Needed before the proxy is built.
7. **(ASK-7)** Finding 16b: whether pages and layouts may use verified claims (`getClaims()`) instead of `getUser()`,
   giving up the layout's revoked-session backstop (≤ 1 h) that S116 relied on. 16a needs no ruling.

## What the timing half will need

- A quiet window: S124 finished, no CI, the QB sync cron's 5-minute ticks accounted for (`vercel.json:40-41`).
- **Production** (or `next build && next start` against rebuild-test with the regions noted): never dev mode (S179 ruling).
- The S121 method: unthrottled, Fast 3G, Slow 3G; a real phone at 402 px for `/m`.
- Per-request Supabase call traces for the tier-1 routes, to turn B-2's *counts* into *depth* and to settle the
  layout/page overlap question.
- Cold / navigation / mutation → refresh separately, per tier-1 route, especially **clock in → hub**.
- `EXPLAIN ANALYZE` on: `getMobileDailyLogs`, `getCalendarEvents`, `getProjectPhotos`' `files` read, the
  profitability report, and the RLS policies on `files`, `daily_logs`, `tasks`, `time_clock_sessions`.
- The payload tool on `/m/p/[projectId]/photos` and `/photos/[fileId]` for a 200-photo project (C-4a/b, D-10).
- A count of RSC prefetches fired by the `/m` photo grid and the dashboard project tabs.
- **[added 2026-10-02]** The in-region cost of one `getUser()` (Vercel `iad1` → production), to replace S115's
  Codespace → rebuild-test 53–74 ms in finding 16.
- **[added 2026-10-02]** Sign the same thumbnail path twice: confirm a re-sign yields a different URL (R2(a)).
- **[added 2026-10-02]** Storage under the proxy's load shape: ~200 downloads per cold grid, 6 in flight per phone
  (R2(d)5).
- **[added 2026-10-02]** On a real iPhone: queued-upload behaviour when the PWA is backgrounded, and IndexedDB quota
  for 25 full-resolution Blobs (R3).

---

**STOP.** Nothing merged, nothing fixed, the deferred half not started.
