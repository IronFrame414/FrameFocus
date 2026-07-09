# context59 — 5I Subcontractor Portal spec session

> **Date:** 2026-07-05 (approx). **Type:** spec-only. **Branch observed:** `feat/module-5`.
> **Purpose:** reconcile two conflicting session-kickoff prompts for a "subcontractor portal," then spec it. Output: one spec doc (`5I-spec.md`), written to an output dir only — **nothing committed, nothing written into the live tree.**
> **Do-no-harm:** a parallel session held the uncommitted M5 launch build on `feat/module-5` and was reviewing/committing it. This session stayed **read-only** on that tree and wrote nothing into it. Not a single `git add`.

---

## 1. The direction decision (why 5I went the way it did)

Two prompts arrived for the same goal and **conflicted on the load-bearing fact**: whether a subcontractor auth model exists.

- **Prompt 1:** subs are a real-account role; scaffolding already exists; verify + interview.
- **Prompt 2:** the fork is open — pick (A) hosted portal vs (B) email + magic-link before writing anything; "a subcontractor auth model that does not exist yet."

**Resolved against ground truth, not the prompts.** `company_members-spec.md` (§5) already decides subs = a real `subcontractor` role reusing the existing invite infra (accept → provision profile → link to member); §4 makes `profile_id` nullable (login optional/deferred). Git confirmed the build (below). **Conclusion: Prompt 1's premise is correct; Prompt 2's is false.** The A/B (hosted vs magic-link) fork Prompt 2 wanted to re-open is the **client** Pre-M9 external-surface gate (the `client` role), **not** the sub model. Went Prompt 1's way, folding in the three things Prompt 2 flagged that were genuinely valid: the 5H number collision, module placement, and M7 coherence.

---

## 2. Ground truth verified this session

**`git status` on `feat/module-5`** — M5 launch build present and **UNCOMMITTED**. Confirmed in-tree (untracked): migrations `20260704210000` (company_members_foundation) through `..215000` (5d change orders), the projects/tasks/punch/change-orders/budget/contracts/schedule/project-assignments/project-contacts/members service layers, `convert-to-project`, `company-calendar`, the CO-signing surface, **`docs/specs/5F-spec.md` and `5G-spec.md`** (untracked), and **`docs/sessions/context57.md`** (untracked). Modified: `TECH_DEBT.md`, `seats.ts`, `roles.ts`, `database.ts`, contacts/estimates surfaces, `roles`/`form-options` constants.

**Read `company_members_foundation.sql` (grep).** Accept-side sub scaffolding is **real**:

- `company_members` — `member_type` CHECK (`crew`/`subcontractor`), `profile_id` nullable.
- `get_my_member_id()` — RLS keystone (`auth.uid()` → `profiles.user_id` → member id).
- `subcontractor` in **both** role CHECKs (profiles + invitations).
- `invitations.member_id` column **+ FK** → `company_members(id)`.
- `get_invitation_for_signup()` **returns** `member_id`.
- `handle_new_user()` links accepted sub profile to existing member row when `member_id` set; **skips** member creation for `client`/`subcontractor`.
- `create_member_for_new_subcontractor()` + trigger `subcontractors_create_member` (AFTER INSERT on `subcontractors`, `profile_id` NULL, `display_name = company_name`) + backfill for existing subs.

**The gap:** nothing sets `invitations.member_id` **when a sub is invited**. The create-side is app-layer and **unbuilt** → 5I owns it.

**NOT read this session (still claims):** `seats.ts` contents (sub seat exclusion — believed present, confirm don't re-decide), `roles.ts` contents (`DASHBOARD_ROLES` exclusion of `subcontractor`, `INVITABLE_ROLES`, `TEAM_MANAGEMENT_ROLES`). The DASHBOARD_ROLES exclusion is from the handoff + consistent, but was **not** directly verified (it's a TS constant, not in the migration).

---

## 3. Decisions locked

- **Named `5I`** — `5H` stays Activity Log (deferred, unspecced). M5-series. Subs = limited **internal** users, explicitly **not** the client external-surface gate.
- **Invite create-side:** entry on the subcontractor's record, invite carries `member_id`; cold generic invite disallowed (would yield an unassignable sub). **Authority:** owner/admin full; **PM/foreman scoped to `subcontractor`-only** (new guard logic, not just widening a constant). **One login per sub company**; turnover = deactivate + re-invite.
- **Portal surface:** distinct sub route tree (not the dashboard). My Jobs → own tasks/schedule (read-only), shared docs/photos (`visible_to_subs`, **project-wide** not per-sub) + own uploads, upload. RLS keys on `get_my_member_id()`.
- **Compliance:** award = `subcontractor_contracts` → **`signed`** triggers the checklist (COI / license-if-applicable / W9). Docs **per-sub, not per-job**. Expiry alerts **to the company** at −30d / −7d / expired for **COI + license only**; W9 none. Certificate-holder + additional-insured = **requirement copy**, not structured fields (launch). COI = single soonest expiration (no per-coverage split). **Warn-don't-block.** Company can upload on the sub's behalf (login optional).
- **Schedule:** tentative/adjustable dates, read-only to the sub; date-shift **surfaced in-portal only**, active push deferred to M7/external-comms.
- **Acceptance trace:** Volt Electric LLC / "Henderson Kitchen Remodel," stages 1–6 (contract $18,500; COI exp 2026-11-30, license exp 2027-03-31, W9 no date). Marked **PROPOSED** until run against a real Bishop job.

---

## 4. Artifact state

- **`5I-spec.md`** — written to an output dir only. **Not committed. Not in the tree.** Nothing touched `feat/module-5`.
- No commit hashes produced this session (spec-only, nothing committed).

---

## 5. Carries forward

**Actions**

- Download, review, and **file `5I-spec.md` into `docs/specs/` yourself** (path-scoped). Given the parallel M5 work, likely file **after M5 merges** — same handling as 5F/5G.
- The acceptance example stays **PROPOSED** until run against a real Bishop job.

**Confirm-at-build flags (from 5I §9)**

- **TECH_DEBT #79** (subcontractors baseline, uncommitted) — hard dep for the invite email field and the `license_required` flag. Recover DDL via `supabase db dump`; don't reconstruct from `database.ts`.
- **`seats.ts`** — confirm sub seat exclusion (don't re-decide).
- **`roles.ts`** — confirm `DASHBOARD_ROLES` excludes `subcontractor`; confirm `INVITABLE_ROLES`/`TEAM_MANAGEMENT_ROLES` before the authority change; build the PM/foreman subcontractor-only guard.
- **Module 3** — `visible_to_subs` placement + RLS; reconcile with the planned client `file_shares` junction.
- **5B** — tentative/adjustable flag + member-keyed assignment reach.
- **`subcontractor_contracts`** — confirm status enum and that `signed` is the trigger value.
- **member → subcontractor** — confirm compliance docs keying on `member_id` is sufficient, or add a back-pointer (the trigger doesn't store one).
- **Expiry evaluation** — scheduled daily job (CC picks mechanism).

**Coherence to reconcile at M7 spec time**

- Client magic-link mechanism (Pre-M9 gate) and **M7 subcontractor lien-release/waiver external delivery** follow the same external-surface fork. 5I's portal may later _surface_ waivers but builds none of that machinery — reconcile delivery at M7, not as a one-off.
