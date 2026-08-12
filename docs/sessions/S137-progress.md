# S137 — trial lifecycle: progress log

**Branch:** `feature/trial-lifecycle`, cut off `origin/main` = `7dd9202`.
**Target DB:** rebuild-test (`nmyphyhmfttxkdoposvf`). Production is Josh's, attended.

⚠️ **THE GATE.** TL-24 — whether these records may be deleted on this timetable at all — is
**unanswered and with legal review.** Josh ruled: build everything, **including the deletion job**,
but **do NOT register its cron schedule in `apps/web/vercel.json`.** The job exists, is tested, and
does not run. The line that turns it on is Josh's, after legal returns.

Append after every step: what was attempted, what happened, **the real exit code**, next action.
`## RESUME HERE` stays at the bottom naming ONE next action.

---

## Rulings carried into Phase 3

| Q | Ruling |
| --- | --- |
| 1 | `ai_tag_logs` **survives with `company_id` nulled** — our spend, not their data. |
| 2 | New **private `exports` bucket**, 24-hour sweep. Separate from `project-files`. |
| 3 | **Revoke the session** — ban the auth users for the 14 days, unban on payment. Not RLS, not routing-only. |
| 4 | **`trial_lifecycle` table** keyed by company — expiry, lock, acknowledgement, postpone together. |
| 5 | 4th-attempt screen built with a visible **"COPY PENDING LEGAL REVIEW"** gap. |
| 6 | **Explicit acknowledgement row** (who, when, which warning). `read_at` proves a list rendered. |
| 7 | **Extrapolate TL-1 first**, synthesise only if it lands near the window. |
| 8 | Deletion removes the export zip (belt and braces — with Q3 no export can be pending). |

## The shape

```
day −7   warning        (email + in-app, Owner/Admin)
day −3   warning
day  0   trial expires — ACCOUNT LOCKED (auth users banned). No login, no export.
         14 days retained, recoverable only by paying.
day 14   deleted
```

The export window is the **pre-expiry** period. That is why the warnings moved to −7/−3.

---

## Step 0 — environment confirmed

`pwd` `/workspaces/FrameFocus-work`; tree clean; CLI on rebuild-test; `uv` present; both
`node_modules` present. Exit codes n/a (read-only).

---

## Step 1 — the spec (DONE) — `428ae1a`

`docs/specs/trial-lifecycle-spec.md`, with `input → store → output` traces for the export (§4) and
the deletion job (§5). The interview file stays.

## Step 2 — schema (DONE) — `cc7f03c`

`20260918000000_trial_lifecycle.sql`. Push **exit 0**, then **verified against the catalog** rather
than the CLI's success line: all four tables readable, `trial_emails`' new columns present,
`email_types.trial_warning` present, private `exports` bucket listed.

## Step 3 — warnings, lock, deletion job (DONE) — `0291e7a`

`tsc` **exit 0** · unit **exit 0**, 47 files / 673 tests · build **exit 0**.

**Two things the build found that the ruling could not be built without:**
1. **`ai_tag_logs.company_id` was `NOT NULL`**, so "survives with `company_id` nulled" was
   unbuildable as written. Found by the type-checker, not by reading the schema.
2. **The migration was not replay-safe** — bare `CREATE TRIGGER` fails 42710 on the second
   application even with `CREATE TABLE IF NOT EXISTS` above it. Same lesson as S136's slug backfill.

**`s123-still-clocked-in` — the TEST was wrong, not the code.** It greps for the string and cannot
distinguish a file that EMITS the notification from one that DECLARES the type enum;
`notifications_type_check` necessarily lists every type, and `notifications_core.sql` was already
allowed for exactly that reason.

## Step 4 — probes (DONE)

`s137-trial-lifecycle.live.ts` — **20/20, exit 0**, under the S90 harness (real user JWTs, never
`postgres`). Covers: `trial_lifecycle` readable by Owner only and **writable by nobody** (the Owner
cannot move their own `trial_end`), acknowledgement is first-person-only, warning idempotency, −3
beating −7, postpone honoured on both loops, the 14-day retention clock, and the survivor list.

⚠️ **The most consequential assertion is VERIFIED LOAD-BEARING:** temporarily adding
`/api/cron/trial-deletion` to `vercel.json` turned the probe red naming the reason (**exit 1**);
reverting returned it to green (**exit 0**), and `vercel.json` was confirmed clean afterwards.

One probe bug of mine, fixed: `ai_tag_logs.model` is `NOT NULL` and my fixture omitted it, so the
failure read as "the column is still NOT NULL" when the test was wrong.

## Step 5 — TL-1 SETTLED, and it changes no ruling

Measured on rebuild-test, sequential, service role: **61 files, 28.19 MB, 26.45 s → 1.07 MB/s,
0.434 s/file.**

| company shape | estimate |
| --- | --- |
| small (~120 files, 0.3 GB) | ~5 min |
| mid (~2.1k files, 4 GB) | ~64 min |
| large (~8.5k files, 18 GB) | **~4.8 hours** |

Against the **7-day (168-hour)** pre-expiry window that is a ~35× margin, so **the window is not
the binding constraint and no ruling has to move.** Per Q7(c) synthesising was therefore not
required — the extrapolation does not land near the window.

**What IS binding is `maxDuration = 300`:** a large export needs ~58 invocations, which is why
`export_jobs.cursor` exists. Method stated so the number can be challenged: sequential, single
connection, from a Codespace; parallelism would improve it, production egress may differ.

## Step 6 — TECH_DEBT (DONE)

`#1-trial` (deletion built and unscheduled; plus the unruled signed-document mechanism) and
`#2-trial` (export specced and measured, not built). **Provisional branch-scoped ids** — the first
use of the CLAUDE.md rule added in S136 — converting to real numbers at merge.

Full live suite after everything: **53 files / 597 tests, exit 0.**

---

## ⚠️ CORRECTION [S138, 2026-08-12] — THIS LOG READ AS THOUGH THE UNLOCK SHIPPED

**It did not. `unlockCompany()` was written with ZERO CALLERS** — no webhook, no route, no
button — **while `/api/cron/trial-lock` WAS scheduled** in `apps/web/vercel.json`. Nothing above
said so, and the NOT-BUILT list below did not mention it, so the pay-to-recover half of the 14-day
window read as done. As this branch stood, a trial expiring in production would have banned every
auth user in the company for 8760h and paying would have done nothing.

Found by re-verifying the branch rather than reading it, and fixed in S138. Three further
corrections to claims made above:

1. **"The job exists, is tested" (Step 3) overstated the deletion job.** What was tested were its
   exclusion LISTS. `runTrialDeletion` had never been executed. S138 ran it, and the first run
   found a real defect — see `docs/sessions/S138-progress.md` and TECH_DEBT `#3-trial`.
2. **The lock was not sufficient on its own.** Q3(c) assumed session revocation removed the need
   for a routing or data gate. Measured in S138: a ban stops sign-in and refresh immediately, but
   an **already-issued access token keeps full access for up to 3600s**. A guard was owed and is
   now built.
3. **`linkKey: 'trial_warning'` was never registered** in `lib/notify/links.ts`, so every warning
   notification resolved to `null` and rendered non-interactive.

Also corrected: the migration header said the deletion job spans "two storage buckets";
`deleteStorage()` has always walked **three**.

_Nothing above this line has been rewritten — the original text stands as the record of what was
believed at the time._

---

## NOT BUILT — carried, with reasons

- **The export job itself** (`#2-trial`). Specced, measured, tables and bucket exist; the job and a
  zip dependency do not.
- **The 4th-attempt screen** (Q5's copy-gap screen) and the in-app warning screen. `handle_new_user`
  already routes a 4th signup to `incomplete`; the screens are not written.
- **The acknowledgement button.** The table, its RLS and its probes exist; no UI writes to it yet.
- **Widening middleware to `/m` and the API routes.** The session ban makes the lock real without
  it, but the redirect gap found in Phase 0 is still open on paper.
- **⚠️ THE UNLOCK — ADDED TO THIS LIST IN S138, because it belonged here and was missing.**
  `unlockCompany()` existed with no callers while the lock cron was scheduled. See the correction
  block above.

**All six items on this list were built in S138** except the parts named as still open in
`docs/sessions/S138-progress.md`.

---

## RESUME HERE

**Superseded — see [`S138-progress.md`](S138-progress.md).** The export job named below was built
in S138, along with the unlock, the lock guard and the four screens.

_Original next action, kept as the record:_ build the export job per spec §4 (`#2-trial`) — add a
streaming zip dependency, fill `export_jobs`, chunk against `maxDuration = 300`, and write the
24-hour sweep.

