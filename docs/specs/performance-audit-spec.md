# Performance — the directed audit

[Josh, 2026-10-02] ⚠️ **AN AUDIT. IT FIXES NOTHING.** It measures, enumerates and reports. Josh rules
what gets fixed; the fixes are a separate build.

## Why this exists, in Josh's words

> *"near instant is important. we don't have time or patience to wait for software to load while in
> the field or office. that will cause this to fail as something people want to work with before they
> even give it a real shot."*

⚠️ **This is an ADOPTION problem, not a tuning problem.** A crew member who waits on a phone in a
driveway decides the software is bad before anyone has shown them what it does. That framing decides
what counts as a win: **how long until the screen is usable on a phone on LTE**, not a benchmark
number.

## ⚠️ The history that makes this a directed audit rather than an open one

On 2026-09-29 Josh asked the same question and was given a diagnosis that was **wrong**: that
middleware called `supabase.auth.getUser()` on every request and that moving to asymmetric JWT keys
would save ~150 ms. **`getClaims()` had been in middleware since S116 (`160a57d5`) and production was
already on ES256.** The thread was then overtaken by S120 and never closed.

⚠️ **So: measure before claiming. No fix is proposed in this audit without a number beside it taken on
a named ref.** The failure to avoid is the project's recurring one — *the thing inspected was not the
thing being judged.*

---

# ⚠️ THE METHOD — this is what stops areas being missed

**1. Enumerate the surface FIRST, then report on every item in it.**
⚠️ **The report must list every route it measured AND every route it found fast.** An audit that
reports only what was slow cannot be distinguished from an audit that stopped early.

**2. Measure on the conditions the users are actually in.**
⚠️ **Throttled, not desktop.** The precedent is S121's own measurement of `staleTimes`:
**49 → 301 ms unthrottled, 47 → 798 ms Fast 3G, 49 → 2,308 ms Slow 3G.** The unthrottled number
hid a 2.3-second regression. **Report all three for anything user-facing.**
⚠️ **A real phone at 402 px for the `/m` screens, not only device mode.**

**3. Separate the three kinds of slow.** They have different causes and different fixes:
- **Cold load** — first arrival on a route, nothing cached.
- **Navigation** — moving between screens inside the app.
- **Mutation → refresh** — save, then the screen catching up.

**4. State the ref every measurement was taken on.**

**5. ⚠️ Do not fix anything.** A fix changes the thing being measured. Findings only, each with its
number, its cause if known, and an estimated size.

---

# THE AREAS. Report on every one, including the ones that are fine.

## A — Where the data physically is ⚠️ CHECK THIS FIRST

**Supabase's region versus Vercel's function region.** If they differ, **every single query on every
page pays cross-region round-trip latency**, and a page making six queries pays it six times.

⚠️ **This is invisible in local development and in any single-query benchmark**, which is why it is
first. It is also potentially the largest single win in the whole audit and costs nothing to check.

Also: the connection pooling mode in use (session vs transaction), and whether serverless functions
are exhausting or re-establishing connections. ⚠️ **rebuild-test has run out of database connections
under CI load — confirm production's configuration rather than assuming it differs.**

## B — Database round trips per screen

- **Count the queries each route makes.** Sequential `await`s that could run together are the common
  shape; `Promise.all` is already used in places (`/m/p/[projectId]/overview`), so the question is
  **where it is NOT**.
- **N+1 reads** — a list that fetches per row.
- ⚠️ **Unbounded `select('*')`** — the repo already names this shape (M1-03 / M2-06 / M3-05), and
  `.limit()` without `ORDER BY` as the other half of the same trap.
- **Missing indexes on the columns that RLS policies and filters actually use.** Measure with
  `EXPLAIN ANALYZE` on production-shaped data, not on an empty table.

## C — RLS policy cost

Policies are evaluated per row. A policy containing a subquery or a function call that is not
`STABLE` can turn a cheap read expensive as data grows. ⚠️ **Measure; do not weaken.** Anything that
would narrow a policy's protection is out of scope for this audit and for its follow-up build —
stop rule territory (`#136`).

## D — What reaches the browser

- **RSC payload size per route.** Large payloads are slow on LTE regardless of server speed, and this
  project already inspects payloads for the `#136` discipline — the same tooling answers this.
- **JavaScript bundle size per route**, and what is in it that need not be.
- **Client components that could be server components.**
- ⚠️ **Heavy libraries loaded on routes that do not use them** — `pdf-lib`, `@react-pdf/renderer`,
  the Gantt and chart code. Dynamic import is the fix; the finding is *where*.

## E — Images

The field screens are photo-heavy. Measure what a `/m` photo grid actually downloads: thumbnail
dimensions versus displayed size, format, lazy loading, and what HEIC conversion costs on the device.

## F — Middleware

`apps/web/middleware.ts` matches `/api/:path*` and its own comment calls that
*"A REAL COST AND A DELIBERATE TRADE."* ⚠️ **Measure the cost rather than reopening the trade.**
Report what it adds per request; the decision is Josh's.

## G — Caching and revalidation

What is rendered dynamically that could be cached or revalidated, and what each would save.

⚠️ **`staleTimes` IS SETTLED AND DOES NOT REOPEN.** Disabling the client router cache was measured at
S121 as **49 → 301 ms unthrottled and 49 → 2,308 ms on Slow 3G**, the branch was deleted by ruling,
and the stale-data symptom it targeted is solved better by `router.refresh()` after mutations. ⚠️ **A
proposal to disable the router cache is a finding to reject, not to evaluate.**

## H — Perceived speed ⚠️ DO NOT TREAT THIS AS COSMETIC

Josh's requirement is "near instant", which is a **feeling**, and a screen that shows structure in
200 ms feels faster than one that shows nothing for 600 ms and then everything.

- **Loading states and skeletons** — which routes show nothing while they wait.
- **Optimistic updates** on the mutations people repeat all day: the time clock, photo capture, punch
  items, daily log fields.
- ⚠️ **Report where a user currently stares at a blank screen.** That list may matter more to
  adoption than any millisecond total in this document.

## I — The routes that actually matter

Measure everything, but ⚠️ **rank findings by how often the route is used in the field**, not by how
slow it is in isolation. A 300 ms saving on the time clock, opened twice a day by every crew member,
beats two seconds on a screen Josh opens monthly.

**Name the inventory in the report.** At minimum: `/m` field screens (time clock, daily log, photos,
schedule, project overview), the dashboard project pages, estimates, and the client portal.

---

# The report

`docs/sessions/<session>-performance-audit.md`.

- **The route inventory**, with every route's cold / navigation / mutation numbers at all three
  throttle levels, and the ref they were taken on.
- **Every area A–I**, with what was found — ⚠️ **including the areas that turned out to be fine.**
- **Findings ranked by field impact**, each with: the number, the cause if established, the estimated
  size of the fix, and what could break.
- ⚠️ **Anything that could not be measured, and why.** A gap stated is a gap; a gap unstated is a
  false clean bill.
- **What Josh has to decide.**

⚠️ **No fixes. No migrations. No merges beyond the report itself.**