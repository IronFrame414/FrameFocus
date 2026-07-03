# `company_members` — Foundation Spec

> **Pre-Module 5 foundation · Session 55**
> **Status:** Spec (build-ready design of a decided model). Not yet built.
> **Design authority:** `future_module_architecture.md` §5.1–5.2 (DECIDED, deferred implementation). This spec turns that decision into a build-ready form — it does not re-decide the model.
> **Why it matters:** hard sequencing constraint — **must land before any 5-series build.** 5A–5E all reference `company_members` and call `get_my_member_id()`; none can build until this ships.

---

## 1. Purpose

`company_members` is the **single assignable identity** for a company — one row per assignable person, covering both **crew** (who have a login) and **subcontractors** (who may not). Every assignment target in Module 5 references a member; **there is no assignment polymorphism anywhere** (§5.2).

This replaces the earlier "polymorphic assignee" idea — one identity table makes polymorphism unnecessary.

---

## 2. Model (from §5.1 — decided)

- **A member is the "assignable person."** Crew and subs are both members.
- **`profiles` is unchanged.** `profiles.id = auth.uid()`; a profile is a real login. A profile **links to** a member.
- **Crew** = member **+** profile, from creation.
- **Subcontractor** = member at contact-creation time with **no profile**. A login is *optional*, provisioned later via the existing invite flow; accepting the invite creates the profile, links it to the existing member, and assigns the new `subcontractor` role.
- **Rejected (do not build):** a dormant auth account per sub — pollutes auth/billing and touches the auth invariant.
- **Conscious principle change:** this relaxes the CLAUDE.md rule that crew and client/login layers "should never be confused." Deliberate, per §5.1.

---

## 3. PK & identity convention (LOCKED this session)

- **`company_members.id` is the primary key** — standard-columns convention, consistent with every other table in the repo (`profiles.id`, etc.).
- **`member_id` is the FK *column name*** used in consuming tables (`project_assignments.member_id`, `tasks.assignee_id`, `punch_list_items.assignee_id`, `schedule_entries.member_id`, `change_orders.created_by`, subcontractor-contract identity) — every one of those targets **`company_members(id)`**.
- **Consuming specs already correct** under this: 5A, 5B, 5C, and `module5-architecture.md` all write `references company_members(id)`.
- **One correction owed (flag, §9):** `5D-spec.md` §3 currently writes `references company_members(member_id)` — should be `company_members(id)`. One-line fix to that spec.

---

## 4. Schema (build-deferred shape)

`[BUILD-VERIFY]` items confirm against actual shipped schema at build time, **not** from this doc.

```
company_members
  id             uuid pk default gen_random_uuid()
  company_id     uuid not null references companies(id)
  profile_id     uuid references profiles(id)   -- NULLABLE — null for a sub with no login yet;
                                                 -- filled when they accept an invite. (LOCKED — F-1, Option 1.)
  member_type    text not null                  -- 'crew' | 'subcontractor'   [confirm enum vs check]
  display_name   text not null                  -- name for assignment UI even before/without a profile
  schedule_color text                           -- ONE color per member (5B requirement — lives HERE, not profiles)
  + standard audit cols (created_at, created_by, updated_at, updated_by, is_deleted, deleted_at)
```

- **`schedule_color` belongs here** (locked in 5B): the schedule keys on the member, and subs are members *without* a profile yet still get scheduled — so the color cannot live on `profiles`. Add it in this foundation build (5B's [REFINES Q-N6] flag resolves here).
- **`display_name`** exists so a sub with no profile is still nameable in assignment surfaces. Source/derivation from the `subcontractors`/`contacts` record is `[BUILD-VERIFY]`.

---

## 5. Roles — new `subcontractor` role (touches built M1)

From §5.1:

- Add a **`subcontractor`** role, limited: **self clock-in, view own assignments, photo upload** only.
- **Seat/billing:** a sub-user gets **no paid seat by default.** `[BUILD-VERIFY]` against the current seat/billing counting logic so subs are excluded from paid-seat counts.
- **Reuse existing invite infrastructure** — no new invite flow. Accepting the invite provisions the profile, links it to the member, and assigns `subcontractor`.

---

## 6. M2 auto-create hook (touches built M2)

From §5.1: contact / `subcontractors` creation **auto-creates a linked `company_members` row**, plus an optional "send invite."

- Implemented as a trigger (or service-layer create) on the `subcontractors` / relevant `contacts` path that inserts a `member_type='subcontractor'` member with `profile_id = null`.
- **HARD DEPENDENCY — TECH_DEBT #79:** `subcontractors` / `contacts` have **no committed `CREATE TABLE` baseline** (their migrations are placeholders). Any trigger/migration touching these tables has no schema baseline to build against. **#79 must be resolved first** — recover true DDL via `supabase db dump` and add as a baseline migration (do **not** reconstruct from `database.ts` — it omits constraints, RLS, indexes). See flag F-2.
- The `subcontractors` table is **untouched structurally** — subs remain their own table and *also* get a member row (per 5A note: subs are not folded into a `contact_type`).

---

## 7. Migration work (from §5.1)

Ordered:

1. **(Prereq)** Resolve #79 — commit real `CREATE TABLE` baselines for `subcontractors` / `contacts` (F-2).
2. Create `company_members` (§4).
3. **Backfill:** insert **one member per existing profile** (`member_type='crew'`, `profile_id` = that profile). `[BUILD-VERIFY]` the backfill covers every current profile exactly once.
4. Add the **`get_my_member_id()`** helper — returns the caller's `company_members.id` (via their `profiles.id = auth.uid()` → member link). This is what all 5-series assignment RLS calls.
5. Add the M2 auto-create hook (§6) — after #79 is resolved.
6. Add the `subcontractor` role + seat/billing exclusion (§5).

Each step is its own scoped concern; sequence matters (backfill before anything reads members; #79 before the M2 hook).

---

## 8. `get_my_member_id()` — the RLS keystone

- Returns the current caller's `company_members.id`.
- Resolution path: `auth.uid()` → `profiles.id` → the member that profile links to → that member's `id`.
- **Every 5-series assignment RLS policy depends on this function existing.** It is the single reason 5A–5E are build-blocked until this foundation ships.
- **Lookup (settled per F-1, Option 1):** `auth.uid()` = `profiles.id` → find the `company_members` row WHERE `profile_id` = that `profiles.id` → return its `id`. (A member with a null `profile_id` — a sub who hasn't accepted an invite — simply has no `auth.uid()`, so never calls this.)

---

## 9. REVIEW-BEFORE-BUILD flags / OPEN items

- **F-1 — Profile↔member link direction. LOCKED (Session 55): Option 1 — `company_members.profile_id` (nullable).** The member row holds a nullable pointer to its login. A member exists first (from contact-creation); the profile is the optional later addition, filled when a sub accepts an invite. Chosen over `profiles.member_id` because it does **not** add a column to the already-built `profiles` table and matches the member-first creation order. Reflected in §4 (schema) and §8 (lookup).
- **F-2 — #79 is a hard prerequisite for §6.** The M2 auto-create hook (and any migration touching `subcontractors`/`contacts`) cannot be built until #79 is closed (committed `CREATE TABLE` baselines). The `company_members` table itself (§4) and the crew backfill (§7 steps 2–4) do **not** depend on #79 and can proceed first; only the M2 hook (§6, step 5) is blocked.
- **F-3 — 5D FK correction.** `5D-spec.md` §3 writes `references company_members(member_id)`; correct to `company_members(id)` per §3 of this spec. One-line edit to that spec, do it when convenient.
- **F-4 — `member_type` representation.** `enum` vs. `text + CHECK` — follow whatever the repo standard is for small closed sets `[BUILD-VERIFY]`.
- **F-5 — seat/billing exclusion is a `[BUILD-VERIFY]`.** Confirm the current seat-counting logic and where to exclude `subcontractor` members so they don't consume paid seats.
- **F-6 — `display_name` source.** How the member's display name is sourced/kept in sync with the underlying `subcontractors`/`contacts` record `[BUILD-VERIFY]`.

---

## 10. Consumers (what unblocks when this ships)

Every one of these is build-blocked until `company_members` + `get_my_member_id()` exist:

- **5A** — `project_assignments.member_id`; subcontractor-contract identity.
- **5B** — `tasks.assignee_id`, `schedule_entries.member_id`, `schedule_color` (which lives here).
- **5C** — `punch_list_items.assignee_id`, `completed_by`, `verified_by`.
- **5D** — `change_orders.created_by`; all CO RLS via `get_my_member_id()`.
- **5E** — budget roll-up of assigned work by member.
- **M6 (later)** — worker identity = `company_members` (`subcontractor` role's clock-in/photo permissions originate here).

---

## 11. Dependencies (summary)

- **Built M1 (`profiles`, roles):** profile link (F-1); new `subcontractor` role.
- **Built M2 (`subcontractors`/`contacts`):** auto-create hook (§6) — **blocked by #79** (F-2).
- **Built `companies`:** `company_id` FK.
- **TECH_DEBT #79:** hard prerequisite for the M2 hook — resolve first.