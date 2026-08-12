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

## RESUME HERE

**Next action:** write `docs/specs/trial-lifecycle-spec.md` — the house rule requires the spec,
with `input → store → output` traces for the export and the deletion job, BEFORE any build.
