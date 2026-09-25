# S111 — Part Two report (photos, camera roll, subscriptions fix) — appended after every step

> Kept apart from `S111-report.md` (Part One's branch) so the two branches do not conflict on one
> append-only file. Rulings: `docs/specs/S111-SPEC-project-scoped-role.md` → "RULED — Phase 2".

## Step P0 — branch [2026-09-25]

- `feature/s111-photos` cut from `feature/s111-project-role` at its spec/rulings commit — that
  branch carries **no code**, only the spec, rulings and report, so Part Two does not depend on
  Part One. Merging Part Two first (Q20) brings the spec to `main`.
- CI run 36083667540 (`feature/s111-project-role`) was **in progress** when this branch was cut.
  Held until it completes: pushing this branch, `supabase db push` to rebuild-test, and local e2e.

## Step P1 — Q19 (`subscriptions_select_owner_admin`) — ⛔ STOPPED, measurement contradicts the ruling's premise

The ruling was "fix it" on the premise that the missing role check is a leak. **The code depends on
every role reading this row**, so a plain owner/admin floor would break billing enforcement:

- `apps/web/middleware.ts:233-240` — subscription enforcement runs for **every** dashboard user
  (`enforceBilling && profile`), reading `status, trial_end, trial_start, stripe_subscription_id`
  under the user's session. Floored, crew/foreman/PM would read `null`; the block is
  `if (subscription) {…}`, so the expired-trial and trial-limit redirects would **silently stop
  applying to every non-owner/admin** — fail-open on a lapsed company.
- `apps/web/lib/services/storage-status-client.ts:8-11,31` — explicit: *"its SELECT policy is
  company-scoped with no role arm, so crew and foremen read it too — the cap must not silently
  not-apply to non-admins"* (`plan_tier`).
- `app/trial-limit/page.tsx:45` — any signed-in user.
- Owner/admin-only or service-role readers (unaffected): `billing.ts:33`, `seats.ts:43`,
  onboarding, Stripe webhook/checkout, `lib/trial/lifecycle.ts` (admin client).

**What the row exposes** (columns, live): `id, company_id, stripe_subscription_id, plan_tier,
status, seat_limit, trial_start, trial_end, current_period_start, current_period_end,
cancel_at_period_end, created_at, updated_at`. **No price, no card, no amount** — billing *state*.
The only arguably sensitive value is `stripe_subscription_id`, an opaque id unusable without the
Stripe secret key.

**Not built. No migration written.** Options for Josh, stated in the final report:
(A) floor the table to owner/admin **and** give every role a SECURITY DEFINER SQL function returning
only `status, trial_start, trial_end, plan_tier, seat_limit` for its own company, switching the three
readers to it — a real change, with tests; (B) leave the policy, correct its misleading name in a
comment/migration, and record that every role reading billing state is intended.

## Step P2 — ⚠️ FINDING: conversion likely ABORTS for any sent/accepted estimate with pre-send site-visit photos (unproven — test owed)

Found while reading the two BEFORE-UPDATE triggers on `files` before changing the write path:

- `enforce_site_visit_file_freeze` (`20261730000000_site_visit_access_widen.sql:228-262`) raises on a
  frozen captured file if **`estimate_id`** (or `markup_data`, `file_path`, …) changes. It does
  **not** check `auth.uid()` for that branch and has **no conversion exemption**.
- `stamp_site_visit_frozen_at` sets `frozen_at` at SEND and moves it to `now()` at any outcome
  **including `accepted`** — so after acceptance every captured photo is frozen.
- `convert_estimate_to_project` (`20261550000000…:184-187`) does `UPDATE files SET project_id = …,
  estimate_id = NULL WHERE estimate_id = …` — which changes `estimate_id` on those frozen rows.
- Conversion is offered at **any status** (`convert-to-project.tsx:26-28`), and the normal flow is
  visit → send → accepted → convert.

**Inference:** since S110 A reached production, converting a sent or accepted estimate that carries
site-visit photos taken before the send raises *"This site-visit photo is frozen…"* and the whole
conversion rolls back. A draft converted without sending is unaffected (`frozen_at` NULL). Josh's
report ("photos under Files when converted") describes a conversion that SUCCEEDED, so it predates
S110 A or was a never-sent draft. **To be proven on rebuild-test with a real session before and
after the fix** (held while CI run 36083667540 uses rebuild-test).

After conversion `estimate_id` is NULL, the trigger finds no visit, and the freeze no longer
applies — so **markup on a converted photo is not blocked by the freeze**, and there is no conflict
with S110's freeze ruling on that point.

Production count Josh can run to size exposure (read-only):
```sql
SELECT e.status, count(DISTINCT e.id) AS estimates, count(f.id) AS frozen_captures
FROM files f
JOIN estimates e ON e.id = f.estimate_id
JOIN site_visits sv ON sv.estimate_id = e.id
WHERE f.site_visit_capture AND sv.frozen_at IS NOT NULL AND f.created_at <= sv.frozen_at
  AND e.project_id IS NULL
GROUP BY e.status;
```
