# S138 — trial lifecycle: the unlock, the export, the UI

**Branch:** `feature/trial-lifecycle`, continued from `36ffb82`.
**Target DB:** rebuild-test (`nmyphyhmfttxkdoposvf`). Production was READ only, never written.

⚠️ **THE GATE IS UNCHANGED.** TL-24 is still with legal. `/api/cron/trial-deletion` is still
absent from `apps/web/vercel.json`, and `s137-trial-lifecycle.live.ts` still fails if it appears —
re-run after this session's `vercel.json` change: **20/20**.

---

## Phase 0 — the stop-condition. Cleared, but not for the reason the prompt gave.

**1. Is `trial-lock` live on production today? NO.** `origin/main`'s `vercel.json` carries six
crons and no trial entries. Both trial crons exist only on this branch and go live on merge.

**2. Do the S137 tables exist on production? NO** — `to_regclass` returns `null` for all four.
Production is at `20260917000000`. Read-only through the Management API; the CLI was never
relinked.

**3. ⚠️ THE PROMPT'S PREMISE WAS WRONG.** It described "Josh's own company and two other comped
accounts … all `active`". Production holds **five** companies and **two are `trialing` with a
`trial_end` already in the past**:

| company | status | trial_end |
| --- | --- | --- |
| Bishop Contracting | active | — |
| **test const** | **trialing** | **2026-05-05** (98 days ago) |
| **Bis Contracting** | **trialing** | **2026-08-06** (6 days ago) |
| Worth Properties | active | 2026-09-04 |
| H&H Signature Renovations | active | 2026-09-05 |

`runTrialLock()`'s `status === 'active'` skip would **not** have protected those two.

**4. What actually protects them: there is no backfill.** `trial_lifecycle` rows are written in
exactly one place — `handle_new_user()`, owner path. After the migration the table is EMPTY on
production and both loops iterate nothing. Merging cannot ban anyone.

**⚠️ But the safety was accidental, and the obvious next step destroys it.** Backfilling
`trial_lifecycle` from `subscriptions` hands both tenants a past `trial_end` and the next 14:15 UTC
run bans them for a year. **Ruled [Josh]: never backfill.** Written into
`20260919000000_trial_unlock.sql` §3 with the production evidence, so the next person to consider
it reads why first.

---

## Phase 1 — the measured finding

**⚠️ THE BAN DOES NOT KILL A LIVE JWT.** Measured, not reasoned:

```
ACCESS TOKEN LIFETIME:              3600s
fresh sign-in after the ban:        refused — "User is banned"
token refresh after the ban:        refused — "Invalid Refresh Token: User Banned"
ALREADY-ISSUED token after the ban: rows=1, error=none      <-- the hole
```

PostgREST validates a JWT by signature and `exp`; it never consults `banned_until`. So a locked
tenant holding a live token keeps full read and write access, through `/m` and every API route, for
up to an hour. Q3(c)'s premise is two-thirds true. Also measured: **unban is idempotent**.

---

## Rulings taken in Phase 2

| Q | Ruling |
| --- | --- |
| Lock reach | **Server-side guard**, middleware widened to `/m` and `/api`. |
| Backfill | **Never.** The mechanism applies to signups from `20260918000000` onward. |
| Unlock triggers | **All four** — checkout, subscription→active, a DB trigger, an admin override. |
| Export driver | **A sweeper cron**, not the browser. |

Two I flagged as non-blocking and proceeded on stated defaults: the export **includes** the
Owner/Admin-only financial side tables (it is Owner/Admin gated and it is the customer's own data),
and **every** screen carries the copy gap, not only the 4th-attempt one.

---

## What was built

**`b4842dc` — the unlock.** The rule lives in SQL (`unlock_trial_company`) because one of the four
payment paths is a **direct database edit** — every comped company on production is `active` with
`stripe_subscription_id NULL` — and no TypeScript runs when someone edits a row in the dashboard.
The trigger and `unlockCompany()` call the same function. Two guards stop a trial unlock
resurrecting a deactivated member: `is_deleted`, and a 50-year horizon separating the 8760h lock
from `team.ts`'s 876000h deactivation. `EXECUTE` is revoked from `anon` and `authenticated`.
A daily reconcile in the lock cron is the backstop for a missed signal.

**`9684247` — the guard and three screens.** `is_my_company_locked()` returns one bit so every role
can be refused without widening the Owner/Admin floor on `trial_lifecycle`. The guard **fails
open**. The exemption list is the load-bearing half — **a locked company must still be able to
pay**. `/dashboard/trial`, `/locked`, `/trial-limit`; the 4th signup no longer lands on a price
list. `linkKey: 'trial_warning'` registered.

**`ff2a62d` — the export.** Chunked into self-contained `part-NNN.zip` because a zip cannot be
appended to across invocations without O(n²) traffic. Cron-driven, one job per invocation.
Per-category selection, JSON or CSV bundle, broken references keep the filename and omit the file
with `MISSING-FILES.txt` saying so, links expire at 24 h with the objects swept and **the audit row
kept**, and no export once locked. `scripts/measure-export-throughput.mjs` is committed — TL-1 is
reproducible now: **1.87 MB/s**, ~61× margin, ~42 invocations.

**The deletion job, RUN for the first time — and it was lying.** See `#3-trial`. It destroyed every
tenant row, storage object and auth user, then left `companies` standing and returned
`completed: 1`, because the parent delete's error was discarded. Five `SURVIVES` tables hold
RESTRICT FKs to `companies`. The job is now honest — `stopped`, the real error recorded,
`companyRowsRemaining` in the outcome. **Whether the shell should survive is a ruling and was not
made here.**

---

## Verification

| Check | Exit | Corroboration |
| --- | --- | --- |
| `tsc --noEmit` | **0** | 5/5 turbo tasks, 0 `error TS` |
| `next lint` | **0** | 0 Errors, 16 pre-existing warnings |
| `vitest run` (unit) | **0** | 49 files / **702 tests** |
| `next build` | **0** | all new routes emitted |
| live suite | **0** | see below |
| `s138-trial-unlock.live.ts` | **0** | 14/14, real auth users |
| `s138-trial-export.live.ts` | **0** | 6/6, real zip out of the real bucket |
| `s138-trial-deletion-run.live.ts` | **0** | 9/9, the job actually executed |
| `s137-trial-lifecycle.live.ts` | **0** | 20/20, deletion cron still unscheduled |

**Failing-then-passing, pasted in the commits.** Dropping the unlock trigger fails 3 tests at
exit 1 (`expected '2027-08-12…' to be null`, `User is banned`); restoring it returns 11/11 at
exit 0.

Three defects were caught by tooling rather than by reading: `files.file_path` is not
`storage_path` (the first export draft would have shipped an archive with every row and no bytes),
dynamic table names need the untyped-client pattern, and `brand-literals.test.ts` caught the
manifest saying "FrameFocus", the pre-rebrand name.

---

## NOT BUILT — carried, with reasons

- **The ruling in `#3-trial`** — whether a deleted company's shell, carrying its name, may survive.
- **A platform-admin UI.** The override is `POST /api/admin/trial-unlock`; there is **no `/admin`
  route tree in this repo**, so building a dashboard to host one button was out of scope.
- **An `/m` trial surface.** `trial_warning` resolves both surfaces to `/dashboard/trial`.
- **Playwright coverage** for the four new screens. The suite was not run this session.
- **Postponement has no UI.** `postponed_until` / `postponed_by` / `postponed_reason` are honoured
  by both loops and probed, but nothing writes them.

---

## RESUME HERE

**Next action:** Playwright coverage for the four new screens, under `scripts/e2e-preflight.sh` and
in four chunks. Then `#3-trial` when Josh rules on the company shell.
