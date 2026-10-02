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
  Vercel dashboard since 2026-09-30 would not show in the repo. If Josh wants it re-confirmed: Vercel → project
  `frame-focus` → **Settings → Functions → Function Region**; Supabase → project → **Settings → General** (region
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

_(Area B per-route detail is being filled from the route-by-route reading.)_

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

_(in progress — `next build` running)_

## D — Images

_(in progress)_

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
