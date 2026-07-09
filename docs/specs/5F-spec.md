# 5F — Project Import — Spec

## 1. Scope & Dependencies

**Status:** Post-launch — design-ready, build deferred (§5.11). Authored now alongside 5A–5E; **not** built in the launch pass.

**Refinement of the architecture 5F row.** `module5-architecture.md` line 58 defines 5F as _"saved phase+task structure stamped onto a new project"_ — a saved template artifact. This spec **deliberately refines** that: there is **no template artifact**. Every existing project is implicitly an import source. A new project can be created by importing the reusable skeleton of any past project the user can read. The _outcome_ the architecture intended (a phase+task structure stamped onto a new project) is preserved; the _source_ changes from a curated template to any live project. [Decision confirmed in the 5F interview session.]

> **Terminology.** This spec uses **import** throughout (UI, RPC, prose). The operation was called "clone" in the architecture row and earlier drafts; the behavior is unchanged — copy a source project's skeleton, reset everything job-specific.

**This spec reads from, but does not modify, launch structures.** 5F introduces exactly one new RPC (`import_project()`) and one UI entry point. It alters no 5A–5E table.

Depends on (all **read-only** for 5F):

- `projects` (5A §2) — the import target is a new `projects` row.
- Phases + tasks + task-dependency model (5B) — the skeleton that gets copied.
- Cost-code / budget-baseline structure (the 5A §8 spec, `5A-section8-spec.md`, and 5E) — code buckets copied, dollars zeroed.
- Contact/client model (5A §6) — the entry flow selects or creates a contact **first** (§4); that contact becomes the new project's client at creation.

> **Build-time schema note (do not skip):** exact table and column names for phases, tasks, dependencies, cost-code rows, and the contact/client link must be confirmed against the **final 5B / 5A specs and the live schema at build time**. This spec is authored at the design level and does **not** assert column names as fact.

**Parallel-session boundary.** Where `import_project()` copies rows out of 5A/5B/5E tables, it only reads their shape — it does not `ALTER` them. Nothing in 5F touches `supabase/migrations/`.

**File structure is Claude Code's call, not this spec's.** This spec intentionally prescribes **no** file paths, component names, or migration filenames. At build, Claude Code reads this spec in plan mode and determines the file structure from its own analysis of the current codebase — the only source that reflects the real repo state after the parallel #79 migration work has landed. (Chat plans, Code executes; CC's Phase 1 is to analyze all files before writing any.)

---

## 2. Import model — carry vs. reset

The import is a **copy-the-skeleton / reset-everything-else** operation.

**Carries — the reusable skeleton:**

| Carried             | Notes                                                                                                |
| ------------------- | ---------------------------------------------------------------------------------------------------- |
| Phases              | names + sort order                                                                                   |
| Tasks               | titles + sequence within each phase                                                                  |
| Task dependencies   | edges + `dependency_type`; **remapped to the new task ids** (§3)                                     |
| Task spans + gaps   | the source's real `start`/`due` dates, **rigid-shifted** to the chosen start (§6) — never recomputed |
| Cost-code structure | the buckets carry; **dollar amounts zeroed**                                                         |

**Resets — everything job-specific:**

| Reset                                           | New value on the import                                                                                  |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Name / number                                   | set fresh at import time; number from the shared sequence (Q-N1 rec)                                     |
| Client / contact                                | comes from the **contact chosen first** in the entry flow (§4) — the source's client is **never** copied |
| Address                                         | blank unless the chosen contact supplies one; the source's address is **never** carried                  |
| Status                                          | not-started                                                                                              |
| All dollars (budget + actuals)                  | budget zeroed; no actuals                                                                                |
| Assignees                                       | none — the import comes out fully unassigned                                                             |
| Files                                           | none                                                                                                     |
| Contracts (client + subcontractor)              | none — **never** copied                                                                                  |
| Change orders / punch lists                     | none                                                                                                     |
| Inspections                                     | none — outcomes are job-specific (5B §7); reset, not imported                                            |
| Completion (`completed_at`, `percent_complete`) | cleared — a fresh job has finished nothing                                                               |

**Why contracts never copy:** a contract is bound to a specific client and scope. Stamping a prior job's contract onto a new client would be incorrect. Contracts are always authored fresh on the new project (5A §6).

**Why inspections reset:** a 5B `inspections` row records a scheduled date, a pass/fail result, an outside inspector, and a permit-file link — all specific to the job that was actually inspected. None of it is meaningful on a new job. Inspections are re-created fresh as that job reaches them.

---

## 3. `import_project()` RPC (§5.11)

Structural cousin to `convert_estimate_to_project()` (defined in `5A-section8-spec.md` — confirm its final signature there at build): both insert a new `projects` row and copy/reset related rows inside **one transaction**.

**Signature (design-level — confirm arg + column names at build):**

```
import_project(source_project_id, contact_id, new_name, new_number?, start_date) -> new_project_id
```

- `contact_id` is the contact selected or created **before** the import choice (§4); it becomes the new project's client. (Confirm the client/contact FK name against 5A §6 at build.)
- `start_date` is the anchor for the rigid shift (§6). The UI pre-fills it to today (Q-5F-3); the RPC receives whatever value the user confirmed.

**Behavior, in one transaction:**

1. Insert a new `projects` row — fresh name/number, client = `contact_id`, address blank (unless the contact supplies one), status not-started, dollars zeroed, contract fields empty.
2. Copy phases from source → new project, preserving `sort_order`.
3. Copy tasks under each phase, preserving sequence; reset per-task status → not_started, assignee → null, `completed_at` → null, `percent_complete` → 0, actuals → null. Shift `start_date`/`due_date` per §6. (Exact column names per the build-time schema note in §1.)
4. Copy task-dependency edges (`predecessor_id`, `successor_id`, `dependency_type`), **remapped to the new task ids**.
5. Copy cost-code rows → new project with **budget amounts set to 0**; no actuals.
6. Do **not** copy: files, change orders, punch-list items, inspections, contracts, assignees, or the source's client (the client comes from `contact_id`).
7. Return `new_project_id`.

**Transaction boundary:** all-or-nothing. A partial import (e.g. phases inserted but their tasks not) must never persist.

**The one silent-failure trap — dependency remap.** Because copied tasks get **new** ids, every copied dependency edge must be rewritten to point at the _new_ task ids, not the source project's. A naive row-copy that keeps the old ids will either error on the FK or, worse, wire the new project's dependencies to the old project's tasks. Call this out explicitly in the build prompt. Cycle-rejection and self-link rejection are already the source's invariant (5B §3) — a valid source holds only valid edges — so the import copies edges as data and does **not** re-run the walk.

---

## 4. Entry point (UI)

Import lives inside the **new-project** flow — there is no separate "Templates" area (consistent with the no-artifact decision in §1). The flow leads with the **contact**, so starting a project is identical whether or not it turns out to be an import:

1. **New Project** → **select or create a contact.** (This is always step one.)
2. Choose **Start blank** or **Import an existing project.**
3. Import path: pick a source project (list scoped by §5 visibility) → enter a new name → confirm a start date (pre-filled to today, editable) → calls `import_project()`.

- On success: land on the new project. It shows the copied phase/task skeleton with the schedule shifted to the chosen start (§6), the chosen contact as client, everything unassigned, all cost codes at $0.

---

## 5. RLS & visibility — eligible import sources

You can import any project you can **read**. Reuse the 5A project-read policy (Q-N2), invent no new policy:

- Internal roles (Owner / Admin / PM / Foreman — confirm against the canonical role hierarchy): see all projects → may import any.
- Crew: sees only assigned projects → may import only those.

The source-project picker is simply filtered by the existing project-read RLS.

---

## 6. Re-dating — rigid shift from the chosen start

5B stores **literal `start_date` / `due_date` values** on each task and **no duration or lag/offset column** anywhere (5B §2, §3). So the only record of how long each task took and how much real gap sat between tasks — cure times, material waits, inspection holds — lives in the source's actual dates. 5F therefore re-dates by **translating** that real schedule, not by recomputing it.

**The model — one constant delta, applied to every dated task:**

- `delta = chosen_start − MIN(start_date)` across the source's dated tasks. If no source task carries a `start_date` but some carry a `due_date`, anchor on `MIN(due_date)` instead.
- Every non-null `start_date` and `due_date` shifts by `delta`. Spans (`due − start`), gaps between tasks, and parallel/overlapping work are all preserved exactly, because every dated row moves by the same amount.
- **Backlog tasks** (both `start_date` and `due_date` NULL — 5B's undated case, e.g. "Order cabinets") import as backlog, untouched by the shift. They land on the new project in the task list + Gantt, off the calendar, exactly as on the source.
- This is a **literal calendar-day translation** — weekends and holidays are not re-flowed (5B itself stores literal dates with no working-day model). **[Verify against built 5B]** whether any working-day adjustment is wanted; at the design level there is none.

**Why not walk the dependency graph.** Chaining successors back-to-back from derived durations would **drop** every real gap the source had (5B stores no lag to reconstruct), producing a too-tight schedule the job never actually ran. Rigid shift keeps the source's proven rhythm. Dependency edges are still copied (§3 step 4) — they drive the Gantt lines (5B §8) — but they are **not** walked to generate dates.

- Dated tasks surface on the calendar via the 5B UNION (Q-N5), exactly like any other 5B task. 5F introduces no separate calendar source and no new scheduling table.

---

## 7. Resolved build-time decisions

All four questions resolved this session (per "finalize = resolve, don't defer"). Recorded so the build session inherits them:

- **Q-5F-1 — Address on import → BLANK.** The entry flow selects a contact first (§4), so the new project's address comes from that contact (or is blank); the source's address is never carried. Resolves the original "stale-address" risk at the root.
- **Q-5F-2 — Source project state → ANY readable project, regardless of status.** The reset logic (§2) strips status, dates, dollars, assignees, and completion, so the source's own status never reaches the output. Matches "every past project is implicitly a source." Visibility still gated by §5.
- **Q-5F-3 — Start-date default → TODAY, editable.** The picker pre-fills today; the user can change it before confirming. `import_project()` receives the confirmed value and anchors the shift (§6) on it.
- **Q-5F-4 — Milestones / zero-duration tasks → no special case (dissolved by §6).** A milestone (`start == due`, span 0) shifts by the same `delta` as every other row, so it lands on its shifted day. There is no offset walk to break. **[Verify against built 5B]** — confirm 5B has no separate milestone/zero-duration type; if it does, it still only needs the same shift.

---

## 8. Acceptance example — **[PROPOSED, pending your approval]**

**Given** Bishop Contracting's completed project **"1042 Maple — Kitchen Remodel"**: 5 phases (Demo, Rough-in, Inspection, Cabinets, Finish), ~22 tasks across them with a dependency chain and real gaps (a 3-day cabinet-delivery wait, a framing-inspection hold), one undated backlog task ("Order fixtures"), cost codes in every phase, client = the Maple homeowner, a signed client contract, recorded actuals, 3 uploaded files, 2 change orders, and a passed framing inspection.

**When** the user starts a new project, **selects the contact "88 Oak homeowner" first**, chooses **Import → "1042 Maple…"**, names it **"88 Oak — Kitchen Remodel"**, and leaves the start date at its default of **today** (say **Mon Jan 6, 2026**).

**Then** the new project **"88 Oak"** has:

- Client = **88 Oak homeowner** (the contact chosen first); address blank unless that contact carries one. **No** Maple client or contract.
- The same 5 phases in the same `sort_order`, all ~22 tasks beneath them, all status **not_started**, all **unassigned**, `percent_complete` 0.
- The schedule **rigid-shifted** so the earliest task starts **Jan 6**: every task's span preserved, the 3-day cabinet wait and the inspection hold **still present** (not collapsed), parallel tasks still parallel. **No date from 1042 Maple appears.**
- "Order fixtures" imported as **backlog** — no dates, task list + Gantt only.
- Every cost code present with **$0** budgeted and **no** actuals.
- **No** files, **no** change orders, **no** punch items, **no** inspections (the passed framing inspection did not carry over).

The import saved re-entering 5 phases, 22 tasks, and the full dependency chain; the estimator then fills in budgets, assigns people, and attaches the new contract fresh.

> This example is proposed, not yet approved — the interview settled the model, not this specific 22-task trace. Correct the phase/task counts, the gap examples, or the start-date value if they don't match a real Bishop job, and I'll finalize it.
