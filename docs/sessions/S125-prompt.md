# S125 — Performance audit, the STATIC half

Fresh context.

⚠️ **THIS SESSION RUNS ALONGSIDE S124 (timesheets → QuickBooks), WHICH IS DOING PRODUCTION
MIGRATIONS RIGHT NOW.** Everything below is shaped by that. **Read the four hard rules before
anything else.**

⚠️ **THIS IS AN AUDIT. IT FIXES NOTHING.** No code changes, no migrations, no merges. It measures what
can be measured safely, reports, and stops. Josh rules what gets fixed; the fixes are a separate
build, later.

**The full audit spec is `docs/specs/performance-audit-spec.md`. Read it.** ⚠️ **This session covers
only the half that is safe to run while S124 holds the shared resources. §"WHAT IS DEFERRED" below
says exactly what you must NOT do.**

---

# ⚠️ THE FOUR HARD RULES

## 1 — NEVER TOUCH THE SUPABASE CLI LINK

⚠️ **Do not run `supabase link`. Do not run `supabase db push`, `supabase migration`, or any
command that writes. Do not relink anything, ever, including "back to rebuild-test".**

S124 is running production migrations and its own discipline depends on the CLI link staying where it
put it. **A relink from this session while S124 runs a migration push is how a migration lands on the
wrong database.** That is the single worst outcome available to you today.

## 2 — NEVER CONNECT TO rebuild-test, AND NEVER TRIGGER CI

⚠️ **`[skip ci]` ON EVERY COMMIT, WITHOUT EXCEPTION.** A CI run seizes the shared rebuild-test
database and would collide with S124's migration work.
⚠️ **Do not merge anything to `main`** — a merge triggers its own CI run. Your report stays on your
own branch until Josh says otherwise.

## 3 — NO TIMING MEASUREMENTS AT ALL

⚠️ **S124 is actively disturbing the system** — CI runs, migrations locking tables, the sync worker
draining every five minutes. **Any timing number taken now measures S124, not the application.**
A wrong number recorded confidently is worse than a gap stated plainly; the September performance
diagnosis this audit exists to replace was exactly that.

## 4 — `ListAgents`: ONE PEER IS EXPECTED

**Run `ListAgents` first.** ⚠️ **A peer session working on S124 is SANCTIONED — Josh started it
deliberately, in a separate Codespace. Do not stop for it.**
⚠️ **Any OTHER peer, or any peer in THIS checkout, stops you. Say so and stop.**

⚠️ **You should be in a SEPARATE CODESPACE from S124.** If `git log` shows S124's commits in your
working tree, you are in the same checkout — **stop and tell Josh.**

---

# WHY THIS AUDIT IS DIRECTED RATHER THAN OPEN

> **[Josh, 2026-10-02]** *"near instant is important. we don't have time or patience to wait for
> software to load while in the field or office. that will cause this to fail as something people
> want to work with before they even give it a real shot."*

⚠️ **This is an ADOPTION problem, not a tuning problem.** A crew member waiting on a phone in a
driveway decides the software is bad before anyone shows them what it does.

⚠️ **On 2026-09-29 this same question got a confident diagnosis that was WRONG** — that middleware
called `supabase.auth.getUser()` on every request and that asymmetric JWT keys would save ~150 ms.
**`getClaims()` had been in middleware since S116 (`160a57d5`) and production was already on ES256.**

**So: no claim without evidence, and every finding names the file and line it came from.**

---

# ⚠️ THE METHOD — this is what stops areas being missed

**Enumerate the surface first, then report on every item in it — INCLUDING the ones that are fine.**
⚠️ **An audit that reports only problems cannot be told apart from an audit that stopped early.**
Every route in the inventory gets a line in the report even if that line says "nothing found."

**Name the ref every measurement was taken on.**

---

# WHAT YOU DO THIS SESSION

## A — Where the data physically is ⚠️ DO THIS FIRST. IT MAY BE THE WHOLE ANSWER.

**Supabase's region versus Vercel's function region.** If they differ, **every query on every page
pays cross-region latency, and a page making six queries pays it six times.** It is invisible locally
and in any single-query benchmark, and it would make everything feel slow at once rather than one
screen — which matches what Josh describes.

**Determine what you can from the repo and the environment: `vercel.json`, the Next config, env var
names, any region setting in either project's configuration.**

⚠️ **If you cannot determine it without touching a database or a dashboard, SAY SO and tell Josh
exactly where to look** — the Supabase project's settings page shows its region, and Vercel's project
settings show the function region. **A clear instruction for Josh beats a guess from you.**

Also report, from config only: the connection pooling mode in use (session vs transaction) and
whether serverless functions are configured to pool or to connect per invocation.

## B — Database work per screen, by READING THE CODE

- **Count the queries each route makes.** ⚠️ **Sequential `await`s that could run concurrently are
  the common shape.** `Promise.all` is already used in `/m/p/[projectId]/overview` — the finding is
  **where it is NOT**.
- **N+1 reads** — a list that fetches per row.
- ⚠️ **Unbounded `select('*')`.** The repo already names this shape (M1-03 / M2-06 / M3-05), and
  `.limit()` without `ORDER BY` as the other half of the same trap. **Find the current instances.**
- **Note where an index would obviously be needed** — but ⚠️ **do NOT run `EXPLAIN`. Deferred.**

## C — What reaches the browser

- **`next build` and report First Load JS per route.** ⚠️ **A local build is safe — it touches no
  shared resource.** Read the printed exit line.
- **Client components that could be server components.**
- ⚠️ **Heavy libraries loaded on routes that do not use them** — `pdf-lib`, `@react-pdf/renderer`,
  the Gantt and chart code. Dynamic import is the fix; **the finding is WHERE.**
- **What server components pass down** — large objects serialized into the payload. ⚠️ **Analyse the
  code; the measured payload size is deferred.**

## D — Images

The field screens are photo-heavy. From the code: thumbnail dimensions versus displayed size, format
and conversion, lazy loading, and what a `/m` photo grid would download for a project with many
photos.

## E — Middleware

`apps/web/middleware.ts` matches `/api/:path*` and its own comment calls that
*"A REAL COST AND A DELIBERATE TRADE."* **State exactly what it does per request and what it
matches.** ⚠️ **Measuring its cost is deferred. Do not reopen the trade — report it.**

## F — Caching and revalidation, from the code

What is rendered dynamically that could be cached or revalidated.

⚠️ **`staleTimes` IS SETTLED AND DOES NOT REOPEN.** Disabling the client router cache was measured at
S121 as **49 → 301 ms unthrottled and 49 → 2,308 ms on Slow 3G**, the branch was deleted by ruling,
and the stale-data symptom is solved better by `router.refresh()` after mutations. ⚠️ **A proposal to
disable the router cache is a finding to REJECT, not to evaluate.**

## G — Blank screens ⚠️ NOT COSMETIC. POSSIBLY THE MOST IMPORTANT SECTION.

Josh's requirement is "near instant", which is a **feeling**. A screen showing structure in 200 ms
feels faster than one showing nothing for 600 ms and then everything.

- **Which routes have no `loading.tsx`, no Suspense boundary and no skeleton** — those are the ones
  where a user stares at nothing.
- **Which repeated mutations have no optimistic update**: the time clock, photo capture, punch items,
  daily log fields. ⚠️ **These are the actions crew perform all day.**

⚠️ **This list may matter more to adoption than any millisecond total in the audit.**

## H — The route inventory, ranked by field use

⚠️ **Rank findings by how often a route is used in the field, not by how bad it looks in isolation.**
A saving on the time clock — opened twice a day by every crew member — beats a larger saving on a
screen Josh opens monthly.

At minimum: the `/m` field screens (time clock, daily log, photos, schedule, project overview), the
dashboard project pages, estimates, and the client portal.

---

# ⚠️ WHAT IS DEFERRED — DO NOT DO ANY OF THIS

- ⚠️ **Every timing measurement**, throttled or not, local or remote.
- ⚠️ **`EXPLAIN` / `EXPLAIN ANALYZE`**, and anything else that queries a database.
- ⚠️ **Area C of the full spec — RLS policy cost.** It needs query plans. Not now.
- ⚠️ **Measured RSC payload sizes** (the code analysis is in scope; running the app to capture
  payloads is not).
- ⚠️ **Anything touching rebuild-test, production, or the Supabase CLI.**
- ⚠️ **Any fix, any migration, any merge to `main`.**

**State in the report that these are deferred and why, so the gap is visible rather than implied.**

---

# Working rules

- Your own branch, cut from `main`. ⚠️ **Every commit `[skip ci]`. Push after every commit.**
- ⚠️ **Commit path-scoped. Never `git add -A`.**
- ⚠️ **Never truncate an inspection with `head`.**
- ⚠️ **Name the ref every measurement was taken on.**
- ⚠️ **Change no file outside your report and its own directory.** If you find yourself editing
  application code, you have left the audit.
- ⚠️ **The Codespace has timed out five times in three days.** Commit and push after every section.
  **An uncommitted file is one timeout from gone.**

## Questions for Josh

⚠️ **Plain text in the chat. NEVER an interactive picker** — Josh is not notified when one appears and
the session sits idle until he happens to look.

---

# The report — `docs/sessions/S125-performance-audit-static.md`

- **The route inventory**, with a line for every route — ⚠️ **including the ones where nothing was
  found.**
- **Each area A–H**, with what was found, each finding naming its file and line.
- **Area A's answer, or the exact instruction Josh needs to get it himself.** ⚠️ **If the database
  and the functions are in different regions, say so at the very top of the report** — everything
  else is downstream of it.
- **Findings ranked by field impact**, each with its cause, an estimated fix size, and what could
  break.
- ⚠️ **Everything deferred, and why.** A gap stated is a gap; a gap unstated is a false clean bill.
- **What Josh has to decide**, and **what the timing half will need when it runs.**

⚠️ **Then STOP. Do not merge. Do not fix. Do not start the deferred half.**