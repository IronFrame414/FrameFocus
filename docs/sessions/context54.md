# Session 54 — FrameFocus — context

## Goal

Module 5 spec-writing, continuing from Session 53. Target order: 5A → 5E → 5B → 5C → 5D. (5D reached but not finished.)

---

## What got done

- **STATE.md** — Module 5 tracker row updated to _spec-writing in progress_ (`module5-architecture.md` @ `7eaaaa3`, identity + scope locked). Applied + committed.
- **CLAUDE.md** — removed the "success/failure indicators" line (conflicted with concise-responses). Diff shown; commit status **verify next session**.
- **5A spec** (`5A-spec.md`, §1–7 + §9). Six decisions locked:
  - **N1** project number = shared estimate sequence · **N2** RLS: Owner/Admin all projects, PM/Foreman/Crew assigned-only, soft-delete Owner/Admin · **N3** add `converted` status · **N9** client contract = own table · **N10** sub contract recorded in 5A, M7 draw FKs to it · **N11** `contact_type` extension (`vendor`/`architect`/`inspector`/`building_dept`/`other_external`).
  - **Created manually by Josh** (confirmed).
- **5E spec** (`5E-spec.md`) — Project Budget View. Read-only, **no new table** (reads `project_budget_items`), build-blocked on §8. Flagged the `budgeted_amount` cost-vs-price question (resolved later in §8).
- **§8 spec** (`5A-section8-spec.md`) — written after M4 merge was **verified** (see lessons). Contents: `convert_estimate_to_project()` RPC; **per-row budget baseline** (`project_budget_items.source_line_row_id → estimate_line_rows`, `row_type` carried); cost-basis `budgeted_amount`; M4 amendments (`converted` status + `estimates.project_id` FK; **numbering left alone** — already shipped). Decisions: **per-row upgrade**; **cost basis, pre-tax**.
- **5B spec** (`5B-spec.md`) — full interview. Locked model: **task dates ARE the schedule**; `schedule_entries` holds general-only; calendar = dated tasks ∪ general entries; `completed_at` (completion independent of plan); **phases** = named/ordered groups, dates/status rolled up; **in-project Gantt↔Calendar toggle** (project-scoped) + **main-dashboard company-wide employee calendar**; `company_members.schedule_color`; dependency cycles blocked service-layer; **inspections = separate calendar source**; **every calendar/Gantt event clickable to detail**. Decisions N4/N5/N6/N12 all closed.
- **5C spec** (`5C-spec.md`) — interview. Multiple lists per project; **reference photo** (optional) + **completion photo** (required by default, Foreman+ to toggle off) + **`requires_verification`** (default on, Foreman+ toggle); `completed_by`/`completed_at` added; **`verified_by` ≠ `completed_by`**; project-complete gate wired (closed = verified, or complete if verification unchecked); **crew can create lists + add items + edit any item fields** but **not** toggles; verify/delete = Foreman+. Q-N8 closed.
- **5D** — interview **STARTED, not finished** (session ended here). §5.7 verified; schema flag raised; first CO-writing question posed, **unanswered**.

---

## Key schema facts verified on `main` (M4 typed-row model)

- `estimate_line_items` **survived** the 4D revision — cost columns dropped; line-item cost = roll-up of `estimate_line_rows`.
- `estimate_line_rows` = typed rows (`labor`/`material`/`subcontractor`/`other`). Cost: labor `rate×quantity`, material `unit_cost×quantity`, sub/other `amount`. `total` = marked-up price. `estimate_line_materials` dropped.
- `next_estimate_number()` = conditional `lpad` (3-digit until #1000, then 4). Already shipped; do not re-touch.
- `converted` estimate status **not shipped** — §8 owns adding it.

---

## Spec files produced — VERIFY on disk/committed next session

`5A-spec.md` (**confirmed** created manually), `5E-spec.md`, `5A-section8-spec.md`, `5B-spec.md`, `5C-spec.md` (**last four presented; creation/commit NOT confirmed in-session**). First action Session 55: `ls docs/specs/ && git status --short && git log --oneline -8`.

---

## Open review-before-build flags (carried in the spec files; for build, not now)

- **5A:** §6 contract schemas net-new; §7b `project_contacts` net-new; §7a `contact_type` CHECK to verify against prod (contacts `CREATE TABLE` not in git — tech debt).
- **§8:** required **5A §2 amendment** — `projects` adopts `scope_summary` + `scope_sections`; override-only-line budget basis **needs Josh's decision**; pre-tax basis flippable; `[BUILD-VERIFY]` exact estimate columns + signed-PDF source.
- **5B:** `schedule_color` on `company_members`; inspections separate calendar source (divergence from Q-N12); crew calendar-visibility read; `tasks.change_order_id` stubbed bare (FK at 5D).
- **5C:** photo split + `requires_*` toggles + `completed_by`/`completed_at`; column/cross-field rules service-layer.

---

## Process lessons (recorded so they don't recur)

- **The M4-merge false start (×3).** "M4 is merged to main" was asserted, then corrected twice before confirmation. Causes: (1) ran `git ls-tree … supabase/migrations/` from the `apps/web/` **subfolder** — paths are relative, the folder doesn't exist there, empty output was misread as "not on main"; (2) confused **local `main`** vs **`origin/main`**. What worked: `cd` to repo root, then `git fetch origin -q && git ls-tree -r --name-only origin/main -- supabase/migrations/`. **Lesson:** verify merges by checking the actual migration files on `origin/main` from the **repo root**; empty output = debug the command, don't conclude.
- **CLAUDE.md concise edit** removed the success/failure-indicators line. Josh's user-preferences block still carries it — divergence flagged; concise wins.
- **Interview-first paid off** on 5B (the "task dates ARE the schedule" model wasn't derivable from the doc) and 5C (photo/verification toggles went well beyond the doc's single-photo model). Both would have mis-specced from the doc alone.

---

## Tech debt

- **contacts/subcontractors base tables have no committed `CREATE TABLE`** — migration `20260101000009` is a 2-line placeholder; tables exist in prod but migration history can't rebuild them. Recover via `supabase db dump` → baseline migration (not from `database.ts` — omits constraints/RLS/indexes). CC prompt to log this was **given**; confirm it landed in `TECH_DEBT.md`.

---

## STATE.md updates to apply (queued for Session 55)

- **Last updated** → Session 54.
- **Module 4 row** → **COMPLETE** (4D-rev + 4E + presentation-levels merged to `main`; migrations `20260612…`–`20260629…`).
- **Module 5 row** → spec-writing in progress; **5A (+§8) / 5E / 5B / 5C specced; 5D in progress; 5F/5G/5H pending.**
- Add the five spec files to the `docs/specs/` listing.
- Note `converted` status still pending (lands at §8 build); estimate numbering already shipped (conditional `lpad`).
- Reconcile remaining rows — STATE was Session-48-based; verify against git.

---

## How to start Session 55

Paste `session55-kickoff.md`. **First action:** verify the Session-54 spec files are on disk + committed, report what's there, then resume the **5D interview** with the pending CO-writing question (itemized vs. lump-cost; whether it references the original estimate line).

