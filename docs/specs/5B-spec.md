# 5B — Tasks & Scheduling — Spec

> **Design authority:** `module5-architecture.md` (`7eaaaa3`) §5.4 / §5.5. Cites it by section. Immutable once its build starts; changes are additive blocks.
>
> **Status:** Fully specced. All four 5B decisions closed this session — **Q-N4** (cycle prevention → service-layer), **Q-N5** (dated tasks → task _is_ the calendar entry; `schedule_entries` general-only), **Q-N6** (one color per member), **Q-N12** (inspections → separate calendar source). §5.4c (phases) and §5.5d (inspections) schemas were deferred to this spec and are designed below.
>
> **External dependency — `company_members`:** `tasks.assignee_id`, `schedule_entries.member_id`, and the schedule color (§6) all target `company_members(id)`. Pre-M5 foundation, not built — 5B cannot build until it ships. RLS uses `get_my_member_id()`.
>
> **Build position:** after **5A** (projects must exist); before **5C** (punch) and **5D** (change orders). One forward hook to 5D is flagged in §2.

---

## 1. Scope & Dependencies

**Scope (§5.4, §5.5):** `tasks`, `task_dependencies`, `phases`, `schedule_entries`, `inspections`; the Gantt and calendar views; per-person schedule color; soft double-booking warning; click-to-detail on every event.

**Locked model (from the planning interview):**

- A task's **dates are its schedule** — a dated task appears on its assignee's calendar automatically. `schedule_entries` holds **only** task-less items (on-site-with-no-task, PTO, shop). The calendar is a **union** of (dated tasks) + (general entries) — no task data duplicated, nothing to drift.
- **Completion is independent of the plan** — mark a task complete whenever it's actually done (including before its due date); planned dates are untouched. `completed_at` records the real finish.
- **Phases** organize the Gantt; **Gantt ↔ Calendar is a view toggle** over the same data. Inside a project both views are project-scoped; the **main dashboard** carries a company-wide employee calendar.

**Dependencies:** 5A (`projects` — parent FK for every 5B table); `company_members` (external — assignment + color); Module 3 `files` (inspection permit link, §7); Module 1 `profiles` (roles for schedule permissions, §9). `tasks.change_order_id → change_orders` is a **5D** hook (§2).

**Conventions (CLAUDE.md):** standard columns on every table; per-tenant BEFORE UPDATE trigger; RLS via `get_my_company_id()`; service/client split; soft-delete filtered in the service layer.

---

## 2. `tasks` table (§5.4a)

Standard columns plus:

```sql
tasks
  project_id       UUID NOT NULL REFERENCES projects(id)
  phase_id         UUID REFERENCES phases(id)        -- optional (§4); NULL = no phase
  title            TEXT NOT NULL
  description      TEXT
  status           TEXT NOT NULL DEFAULT 'not_started'
                     CHECK (status IN ('not_started','in_progress','blocked','complete'))
  priority         TEXT CHECK (priority IN ('low','medium','high','urgent'))
  percent_complete INTEGER DEFAULT 0 CHECK (percent_complete BETWEEN 0 AND 100)

  -- Dating: open-ended OR date-assigned (dates ARE the schedule)
  start_date       DATE                              -- NULL = open-ended
  due_date         DATE                              -- NULL = open-ended
  is_scheduled     BOOLEAN GENERATED ALWAYS AS (start_date IS NOT NULL OR due_date IS NOT NULL) STORED

  -- Completion, independent of the plan
  completed_at     TIMESTAMPTZ                       -- set when status → 'complete'; cleared if reopened

  -- Assignment — NOT gated by project membership (any company member)
  assignee_id      UUID REFERENCES company_members(id)

  -- Forward hook (5D): ties a task to a change-order scope bucket
  change_order_id  UUID                              -- see flag below
```

- **`completed_at` mechanics:** set to `now()` when `status` transitions to `complete`; cleared when moved off `complete`. Wired in the service layer (or a trigger). "Scheduled Thursday, finished Monday" → `completed_at` = Monday, `due_date` stays Thursday. Default calendar render: a completed task keeps its planned days, shown **done**; early completion does **not** auto-free the remaining days.
- **Open-ended vs dated:** an undated task is backlog — it lives in the task list + Gantt only, never on the calendar. Add dates later and it surfaces. No task is ever forced to carry a date.
- **Assignment is broad** (locked): `assignee_id` is any `company_members` row, not restricted to `project_assignments`.
- **[HOOK — flag]** `change_order_id` references `change_orders(id)`, created in **5D** (builds after 5B). 5B adds the column as a **bare nullable UUID (no FK)**; the FK is added in 5D — same stubbing pattern as 5A's `estimates.project_id`. Nothing in 5B writes it.

---

## 3. `task_dependencies` table (§5.4b)

Standard columns plus:

```sql
task_dependencies
  predecessor_id  UUID NOT NULL REFERENCES tasks(id)
  successor_id    UUID NOT NULL REFERENCES tasks(id)
  dependency_type TEXT NOT NULL DEFAULT 'finish_to_start'
                    CHECK (dependency_type IN
                      ('finish_to_start','start_to_start','finish_to_finish','start_to_finish'))
  UNIQUE (predecessor_id, successor_id)
```

- Powers the Gantt dependency lines (§8). `finish_to_start` is the common case; all four types included so the model never needs widening.
- **Cycle prevention (Q-N4 → service layer):** the write path rejects any dependency that would close a loop (A→B→…→A). Enforced in the service layer at launch — the write path is trusted and single-writer. **Logged as tech debt** if DB-level (recursive trigger) enforcement is wanted later. Also reject self-links (`predecessor_id = successor_id`).

---

## 4. `phases` table (§5.4c) — designed here

A phase is a named, ordered grouping of tasks in a project (Demo → Rough-in → Finish). It carries **only a name and a sort order**; its dates and status are **rolled up from its tasks at read** (never hand-entered) — which is what makes it a Gantt band.

```sql
phases
  project_id  UUID NOT NULL REFERENCES projects(id)
  name        TEXT NOT NULL
  sort_order  INTEGER NOT NULL
  -- NO stored dates/status; rolled up (below)
```

- `tasks.phase_id` links a task to a phase; **optional** (a task with no phase is valid).
- **Roll-up (computed at read, not stored):**
  - Phase **start** = `MIN(task.start_date)`, phase **end** = `MAX(task.due_date)` across the phase's tasks that have dates.
  - Phase **status** = `complete` if all its tasks are complete; `blocked` if any task is blocked; `in_progress` if any task is in_progress/complete but not all complete; else `not_started`. (A phase with no tasks reads `not_started`, no dates.)
  - Optional phase **percent** = average of member tasks' `percent_complete` (display convenience; not required at launch).
- Phases **bracket the Gantt** (§8).

---

## 5. `schedule_entries` table (§5.5a, per Q-N5)

Per the locked Q-N5 decision, `schedule_entries` holds **general (task-less) entries only** — the doc's `entry_type` / `task_id` columns are **dropped**. Dated tasks are the calendar's other source (a UNION at read; §8), never copied here.

Standard columns plus:

```sql
schedule_entries
  member_id    UUID NOT NULL REFERENCES company_members(id)   -- who is scheduled
  project_id   UUID REFERENCES projects(id)                   -- NULL for PTO / shop / non-project
  entry_date   DATE NOT NULL                                  -- the scheduled day
  end_date     DATE                                           -- multi-day range; NULL = single day
  general_kind TEXT NOT NULL CHECK (general_kind IN ('project','pto','shop','other'))
  notes        TEXT
```

- Examples: "Bob on Johnson — Thu–Fri" (`general_kind='project'`, `project_id` set); "Bob — PTO Mon" (`general_kind='pto'`, `project_id` NULL); a shop day (`general_kind='shop'`).
- **Soft double-booking warning:** if a member already has an assignment overlapping `entry_date`/`end_date`, the UI shows a **non-blocking** warning — **never a hard block** (locked). The overlap check unions this member's dated **tasks** and `schedule_entries`. Pure UI/service concern — **no DB constraint.**

---

## 6. Schedule color (Q-N6)

One consistent color per member, everywhere (Gantt bars, calendar cells).

- **[REFINES Q-N6 — flag]** The doc's rec said `profiles.schedule_color`. Under the amended identity convention, the schedule keys on **`company_members(id)`**, and subcontractors are `company_members` **without a profile** (login optional) yet still get scheduled — so the color belongs on **`company_members.schedule_color`**, not `profiles`. Your lock ("one color per member") is satisfied; this just puts it on the correct table. **Coordinate with the `company_members` foundation build** — add `schedule_color TEXT` there (or 5B ALTERs it in).
- Company-assigned (Owner/Admin set it). Rendering reads the member's color for every task bar and general entry.

---

## 7. `inspections` table (§5.5d) — designed here

Tracks the inspection **event and outcome** — distinct from the permit PDF Module 3 already stores.

```sql
inspections
  project_id      UUID NOT NULL REFERENCES projects(id)
  inspection_type TEXT NOT NULL       -- framing, electrical, plumbing, final, etc. (free text — varies by jurisdiction)
  scheduled_date  DATE
  result          TEXT NOT NULL DEFAULT 'pending' CHECK (result IN ('pass','fail','pending'))
  inspector       TEXT                -- outside official; free text at launch
  permit_file_id  UUID REFERENCES files(id)   -- Module 3 permit PDF (reuse, not re-store)
  notes           TEXT
```

- **Calendar (Q-N12 → separate source, flagged divergence):** a scheduled inspection surfaces on the project calendar **and** the main employee calendar as a **job-level day event** — **not** in a person's color/row. Reason: the calendar UNION is per-`member_id`, and an inspection has **no assigned member** (the inspector is an outside official). Folding it into the task/general UNION doesn't sit cleanly, so inspections are a **third, separate calendar source**. **This diverges from the doc's Q-N12 rec (fold into the UNION)** — flagged, resolved this way deliberately.

---

## 8. Views (§5.5c)

**In-project — Schedule tab, Gantt ↔ Calendar toggle (project-scoped):**

- **Gantt** — this project's tasks plotted on a timeline, **grouped under their phase brackets** (§4), with dependency lines (§3). Task bars in the assignee's color (§6).
- **Calendar** — month/week grid of this project's dated tasks ∪ general entries, each member in their color; inspection events shown job-level (§7).
- Both views read the same `tasks` / `schedule_entries` / `inspections` — no new schema for the toggle.

**Main dashboard — company-wide employee calendar (cross-project):**

- Every dated task + every general entry + every inspection across all jobs, each member in their color; the "who's free / who's slammed" view. Scoped by §9 (Crew sees own only).

**Click-to-detail (your cross-cutting rule):** **every event on every calendar, and every Gantt bar, is clickable to open its detail** (task detail, general-entry detail, or inspection detail).

---

## 9. RLS & permissions

**Tasks / phases / dependencies / inspections** — company-scoped, and **visible per project** (inherit **5A §3**: Owner/Admin all projects; PM/Foreman/Crew their assigned projects). A row is visible when its `project_id` resolves to a visible project (`EXISTS (visible project)`). Soft-delete Owner/Admin only.

**Schedule / calendar surfaces (§5.5b):**

| Role    | View         | Assign / edit            |
| ------- | ------------ | ------------------------ |
| Owner   | everyone     | everyone (incl. foremen) |
| Admin   | everyone     | everyone                 |
| PM      | everyone     | everyone (incl. foremen) |
| Foreman | everyone     | everyone                 |
| Crew    | **own only** | none                     |

- **[INTERPRETATION — flag]** I read §5.5b as governing the **calendar surfaces**: on the main (cross-project) calendar, Crew sees only their own assignments. Within an **assigned project**, Crew still sees the project's **task list + Gantt** (work breakdown), per 5A §3. If you'd rather Crew be strictly own-only on the in-project calendar too, that's a one-line change — flagging the boundary.
- **Assignment writes** (setting a task's assignee / dates, creating general entries): Owner/Admin/PM/Foreman for any member; Crew none.
- **Inspections** are project-level events (no member); they render on calendars per project visibility.

---

## 10. Acceptance example (from the planning interview)

**Johnson kitchen (PRJ-0001).** You enter:

- Task "Demo kitchen" — Mon–Tue, Bob
- Task "Rough-in plumbing" — Wed, Mike (sub)
- Task "Order cabinets" — no dates, you
- Schedule "Bob on Johnson — Thu–Fri" (on-site, no task)
- Schedule "Bob — PTO next Mon"

Stored:

- `tasks`: Demo (Mon–Tue, Bob, `is_scheduled`=true) · Rough-in (Wed, Mike, true) · Order cabinets (dates NULL, `is_scheduled`=false)
- `schedule_entries`: {Bob, Johnson, Thu–Fri, `general_kind`=project} · {Bob, no project, next Mon, `general_kind`=pto}

Bob's calendar (his color): **Mon–Tue** Demo · **Thu–Fri** Johnson · **next Mon** PTO. **Wed** belongs to Mike. "Order cabinets" never hits the calendar — no dates; task list + Gantt only.

**Complete-ahead-of-schedule:** Bob finishes Demo on **Monday** → status `complete`, `completed_at` = Monday; the planned Mon–Tue bar stays and renders **done**. The plan is unchanged; completion is recorded separately.

**Phase/Gantt:** if Demo and Rough-in sit in phase "Rough" (sort_order 1), the phase brackets Mon→Wed (min start → max end), status `in_progress` once Demo completes and Rough-in is pending.

— End of 5B spec —
