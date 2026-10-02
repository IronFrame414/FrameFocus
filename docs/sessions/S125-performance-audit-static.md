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

_(in progress)_

## G — Blank screens

**There is not one `loading.tsx` in the app.** `find apps/web/app -name loading.tsx` → **0**, against **169**
`page.tsx` and **6** `layout.tsx` (`app/layout.tsx`, `app/dashboard/layout.tsx`,
`app/dashboard/projects/[id]/layout.tsx`, `app/m/layout.tsx`, `app/portal/layout.tsx`,
`app/portal/[projectId]/layout.tsx`). _(Suspense, pending indicators and optimistic updates: in progress.)_

## H — Route inventory, ranked by field use

_(in progress)_

---

## Deferred, and why

_(filled at the end)_
