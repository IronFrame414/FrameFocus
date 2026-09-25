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
