# Context — FrameFocus Session 40

**Date:** April 22, 2026
**Scope:** Tech debt #66 — ownership transfer. Last polish item before Module 4 build.
**Outcome:** Shipped end-to-end. Migration 027 + transfer-form + server action + page wire-up. All 10 SPEC acceptance checks pass. Module 4 unblocked.

---

## What shipped

### Migration 027 — `transfer_ownership(p_new_owner_id UUID)`

`SECURITY DEFINER` plpgsql function, `SET search_path = public`, `GRANT EXECUTE TO authenticated`. Performs an atomic Owner→Admin role swap inside one function call:

1. Six validation guards (caller profile exists, caller is Owner, target exists, target in same company, target not deleted, target is Admin) — each `RAISE EXCEPTION` on failure.
2. Demote caller (`role='admin'`).
3. Promote target (`role='owner'`).

Order matters: demote first → 0 owners (transient) → promote second → 1 owner. Both states are valid under Migration 024's partial unique index `profiles_one_owner_per_company`. A reversed order would briefly have 2 owners and the index would reject the second UPDATE.

### `apps/web/app/dashboard/team/[id]/transfer-form.tsx` (new)

Client component, props `{ admins: Array<{ id, email, first_name, last_name }> }`. Two render paths:

- **Empty state** (no Admins): warning banner + "Promote a team member to Admin first" message + link to `/dashboard/team`. No form rendered.
- **Active state**: warning banner + Admin dropdown + password input + Transfer button. `useTransition` for pending state; inline error surface beneath the button. Inline-styles to match `edit-form.tsx`; shadcn migration deferred to #49.

### `apps/web/app/dashboard/team/[id]/actions.ts` — `transferOwnershipAction`

Pure addition; no existing code touched. Returns `{ ok: true } | { ok: false, error: string }`. Sequence:

1. Auth + load caller profile, gate on `role === 'owner'`.
2. Load `companies.stripe_customer_id`, caller email, target profile.
3. **Password re-verification:** instantiate a fresh anon-key client via `createClient` from `@supabase/supabase-js` (NOT the cookie-bound server helper). Call `signInWithPassword({ email, password })`. The plain client has no cookie storage, so the caller's session is untouched. Discard the client after use; do NOT call `signOut()`.
4. RPC `transfer_ownership`. If error, return — state still clean.
5. Stripe `customers.update({ email, name })` in try/catch. **Fail-soft**: role transfer is the source of truth; Stripe failure is logged and swallowed.
6. `revalidatePath('/dashboard/team')` then `redirect('/dashboard')`. The `redirect()` MUST sit outside the Stripe try/catch — it throws `NEXT_REDIRECT` which the catch would swallow.

### `apps/web/lib/services/team.ts` — `getCompanyAdmins`

New server function + `CompanyAdmin` type (Pick pattern). Filters `role='admin'`, `is_deleted=false`, scoped to company, with optional `excludeProfileId` for defense-in-depth (so Owner can never appear in their own dropdown).

### `apps/web/app/dashboard/team/[id]/page.tsx` — branch split

`isSelf` branch now splits by role. Owner-self renders `<TransferForm admins={admins} />`; Admin-self keeps the existing amber notice. Admin fetch is guarded so non-Owner self-views don't run a wasted query.

---

## SPEC acceptance checks — all pass

| # | Check | Result |
|---|---|---|
| 1 | Migration applied + remote in sync | PASS |
| 2 | `pg_get_functiondef` body matches | PASS |
| 3 | `npx tsc --noEmit` clean | PASS |
| 4 | `npm run build` clean | PASS |
| 5 | Happy path end-to-end (role swap + Stripe update + redirect) | PASS |
| 6 | Wrong password rejected, no role change, no Stripe update | PASS |
| 7 | Empty-admins state renders correctly | PASS |
| 8 | One-owner invariant after transfer | PASS (identical `updated_at` confirmed atomicity) |
| 9 | Admin viewing self shows amber notice unchanged | PASS |
| 10 | Direct RPC call from non-Owner rejected | PASS |

Plus access-cliff verification both directions: old Owner blocked from `/dashboard/billing`, new Owner gains access.

---

## Workflow notes

- Used the SPEC-driven Claude Code flow for the first time: chat → SPEC.md → Claude Code plan mode → review plan in chat → approve → execute. Plan was accurate and matched SPEC; only deviation was an unrequested `npm run db:types` step, which was harmless.
- **Codespace state surprise:** Started Session 40 with the assumption that yesterday's Codespace was gone (a fresh one had `nothing to commit`). Reopened the prior Codespace via `github.com/codespaces` — uncommitted work was intact. Lesson for future: stopped Codespaces preserve working tree; check the Codespaces list before recreating work.
- **First time dogfooding the new feature:** transferred ownership back to `jsbishop14` after testing, using the just-shipped UI. Worked.

---

## Tech debt

### Closed

- **#66** Ownership transfer — see one-liner in `TECH_DEBT.md`.

### Opened (Session 40)

- **#71** Payment method handover not enforced — old Owner's card stays attached after transfer.
- **#72** No email notification to new Owner.
- **#73** No append-only audit log for ownership transfer events.
- **#74** Stripe Customer email drift on Owner profile edit (pre-existing, surfaced here).
- **#75** Reusing email alias for invitations fails silently — discovered when re-inviting `josh+crew@worthprop.com` collided with the soft-deleted Session 39 user.

---

## Out of scope (deliberately deferred)

Listed in SPEC and now logged as #71–#75. None blocks Module 4.

---

## How to start Session 41

1. Open Codespace, `git pull`, `bash scripts/session-start.sh`.
2. New Claude Chat with project knowledge.
3. Paste session-start snapshot + `context40.md`.

**Session 41 goal:** Module 4 (Sales & Estimating) architecture planning. **No code until the plan is agreed.** Per CLAUDE.md, this was the original Session 33 plan that got displaced by polish work; now finally unblocked.

Optional alternatives if Module 4 planning is too heavy for one session:
- Investigate **#70** (sign-in page Forgot Password broken) — small pre-beta fix.
- Address **#75** (re-invite collision) — small but user-visible.
- Bump Supabase email rate limit (config-only, not a code change).