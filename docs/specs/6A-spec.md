# 6A — Time Tracking — Spec (DRAFT, for review)

> **Design authority:** `docs/specs/future_module_architecture.md` §7.1. **This spec amends §7.1 in five places** (§3 below). Amendments are decisions taken in the Module 6 interview session, not drift — §7.1 and `CLAUDE_MODULES.md` §6.1/§6.9 must be rewritten in the same commit that lands this spec.
>
> **Status:** DRAFT — not reviewed, not committed, not built. Interview complete; schema shape settled from the interview. **Acceptance example is PROPOSED** (§10) — invented numbers, never checked against a real Bishop job.
>
> **Written against stale project knowledge.** The repo copies of `STATE.md` and `future_module_architecture.md` available while drafting were provably out of date. Every column reference to Module 5 below is **design-level** and carries a _confirm against live schema at build_ obligation.
>
> **Conventions (`CLAUDE.md`):** standard columns (`id`, `company_id`, `created_at`, `updated_at`, `created_by`, `updated_by`, `is_deleted`, `deleted_at`); per-tenant `updated_at`/`updated_by` triggers; RLS via `get_my_company_id()`; assignment identity via `get_my_member_id()`; `auth.uid()` reserved for audit columns; server/client service split (`time-tracking.ts` / `time-tracking-client.ts`).

---

## 1. Scope

The mobile clock and the attribution of every paid minute to a project, a task, or a non-project activity.

**In scope (v1):**

- Clock in / clock out (mobile-first, ~95% of use)
- Continuous **time segments** covering the whole session — work, material runs, warranty callbacks, travel, shop, breaks
- Project attribution and optional task attribution
- Marking a task complete from a segment (cross-module write into Module 5)
- Approval workflow (hierarchical)
- Overtime **derivation** (never selected by a user)
- Optional GPS capture on clock in/out

**Out of scope:**

- **Mileage** (`mileage_entries`) → v2 (§7.1)
- **Offline sync engine** → v2. v1 is offline-**ready** only: client-generated UUIDs, device timestamps, append-friendly writes.
- **QuickBooks connector** → Module 7. Schema is QB-ready now (`qb_export_status` stub); no half-integration in Module 6.
- **Company Settings UI** — the four settings below land in the batched Company Settings pass (§6 of the architecture doc), not inside 6A.

---

## 2. Verified facts & dependencies

**Verified this session (git, all history, all branches):** no `time_entries` table, type, or SQL was **ever committed** anywhere in this repo. Module 6 has **zero committed code**. Any document claiming a "committed `time_entries` stub" is doc-drift. This spec supersedes a _planning concept_, not shipped code.

**Depends on (all design-level — confirm at build):**

| Dependency                  | Used for                                    | Module     |
| --------------------------- | ------------------------------------------- | ---------- |
| `company_members(id)`       | worker identity; all `member_id` FKs        | foundation |
| `get_my_member_id()`        | RLS + ownership predicates                  | foundation |
| `projects(id)`              | segment project attribution                 | M5         |
| `projects.status`           | picker filtering (see §5.3)                 | M5         |
| `tasks(id)`, `tasks.status` | optional task attribution; completion write | M5         |
| `project_assignments`       | "my active projects" picker                 | M5         |
| company settings (4 new)    | OT threshold, breaks, GPS, admin timeclock  | M1         |

**Cross-module write:** ending a segment with `completion = 'complete'` sets the referenced `tasks.status` → Complete in Module 5. This is the only write 6A makes outside its own tables. Service-layer, not a DB trigger.

---

## 3. Amendments to §7.1 (five)

Each was decided in the interview. Listed so the architecture-doc rewrite is mechanical.

1. **`time_clock_sessions.project_id` — REMOVED.** The clock is pure payroll and independent of any project. This is what lets one paid day span two job sites without a second clock-in. All project attribution moves to segments.
2. **`task_time_segments` → renamed `time_segments`**, and it gains **`segment_type`** and **`project_id`**; `task_id` becomes **nullable**. The table no longer describes only task work — it holds travel, breaks, material runs, and taskless verbal work.
3. **`time_clock_sessions.category` — REMOVED.** Its five values (`regular|overtime|travel|drive|shop`) split: `travel`/`drive`/`shop` became `segment_type` values; `overtime` is **derived** from weekly paid hours and is never user-selected; `regular` alone is not an enum. Resolves the open "category grain" question in §7.1 — grain is _neither_ session nor segment, because OT is a property of **hours**, not of any row.
4. **`break_minutes` / `break_paid` — REMOVED from the session.** A break is a `segment_type`. A session-level break number would float outside the segment chain and break the reconciliation invariant (§7).
5. **Approval is HIERARCHICAL, not flat.** §7.1's "flat approval (any Foreman/Owner/Admin; PM excluded)" is reversed. See §8. This also **moots** §7.1's open self-approval question: nobody approves themselves.

> **Consequence for §7.9.** The "conscious divergence — flat hour-approval replaces the roadmap's two-tier chain" entry no longer holds. The approval model now _substantially returns_ to the committed `CLAUDE_MODULES.md` §6.1 chain, with differences (PM included; strictly-below rule; no self-approval; ~~Owner has no timeclock~~ **Owner _has_ a timeclock but Owner hours carry no approval state — Session 64, §8**). Rewrite, don't patch.

---

## 4. `time_clock_sessions` — payroll truth

Never altered by segment activity. One session = one continuous clocked period (normally one working day).

```
time_clock_sessions
  id              UUID PK              -- client-generated (offline-ready)
  company_id      UUID NOT NULL REFERENCES companies(id)
  member_id       UUID NOT NULL REFERENCES company_members(id)
  clock_in        TIMESTAMPTZ NOT NULL -- device timestamp
  clock_out       TIMESTAMPTZ          -- NULL while open
  gps_in          GEOGRAPHY / JSONB    -- NULL unless company enables GPS
  gps_out         GEOGRAPHY / JSONB    -- NULL unless company enables GPS
  status          TEXT NOT NULL DEFAULT 'pending'   -- pending | approved
  approved_by     UUID REFERENCES company_members(id)
  approved_at     TIMESTAMPTZ
  qb_export_status TEXT                -- stub, Module 7
  -- standard columns
```

- **No `project_id`.** **No `category`.** **No break columns.** (§3)
- One open session per member at a time — enforce in the service layer; consider a partial unique index on `(member_id) WHERE clock_out IS NULL AND is_deleted = false`.
- **Owner has a timeclock (Session 64 reversal).** The Owner clocks in/out and attributes segments to projects like anyone else — **Owner labor is a real job cost.** _Supersedes the original rule "Owner has no timeclock; no session rows exist for an Owner."_ **Admin** has a timeclock only when the company setting is ON (default OFF).
- `gps_in`/`gps_out` column type (PostGIS `geography` vs. `jsonb` lat/lng) is a **build decision** — 6A has no spatial queries, so `jsonb` is likely sufficient and avoids a PostGIS dependency. Flagged, not decided.

---

## 5. `time_segments` — attribution

Every paid minute of a session lies on exactly one segment. Nested in a session; never payroll truth.

```
time_segments
  id              UUID PK              -- client-generated (offline-ready)
  company_id      UUID NOT NULL REFERENCES companies(id)
  session_id      UUID NOT NULL REFERENCES time_clock_sessions(id) ON DELETE CASCADE
  segment_type    TEXT NOT NULL        -- work | material_run | warranty | travel | shop | break
  project_id      UUID REFERENCES projects(id)   -- gated by segment_type (§5.2)
  task_id         UUID REFERENCES tasks(id)      -- gated by segment_type (§5.2)
  segment_start   TIMESTAMPTZ NOT NULL
  segment_end     TIMESTAMPTZ                    -- NULL while open
  completion      TEXT                           -- complete | incomplete; required iff task_id IS NOT NULL
  note            TEXT                           -- mandatory on end for all types except break
  -- standard columns
```

### 5.1 Segment types

| Type           | Meaning                                                                                                                                                                                         |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `work`         | Working on a job. Task optional — verbal direction is common and carries no task.                                                                                                               |
| `material_run` | Leave a job, get material, **return to the same job**. Drive time _and_ store time both attribute to that job. Distinct from `travel` so "time spent getting material" is a query, not a guess. |
| `warranty`     | Callback to a job. Real hours against a real project, **excluded from that project's active budget**.                                                                                           |
| `travel`       | Moving between jobs (Miller → Ortiz). Belongs to no single project.                                                                                                                             |
| `shop`         | Yard/office/shop time. No project.                                                                                                                                                              |
| `break`        | Optional. Staff are not required to take one.                                                                                                                                                   |

### 5.2 Type → field gating

| `segment_type` | `project_id` | `task_id` | `note` on end | `completion`                   |
| -------------- | ------------ | --------- | ------------- | ------------------------------ |
| `work`         | **required** | optional  | **mandatory** | required iff `task_id` present |
| `material_run` | **required** | NULL      | **mandatory** | NULL                           |
| `warranty`     | **required** | NULL      | **mandatory** | NULL                           |
| `travel`       | NULL         | NULL      | **mandatory** | NULL                           |
| `shop`         | NULL         | NULL      | **mandatory** | NULL                           |
| `break`        | NULL         | NULL      | optional      | NULL                           |

Enforce with `CHECK` constraints, not service-layer only. `completion` is gated on **`task_id IS NOT NULL`** — _not_ on `segment_type` — because a `work` segment under verbal direction has no task and therefore nothing to complete.

### 5.3 Project picker

- `work`, `material_run` → the member's **active** projects (via `project_assignments`).
- `warranty` → **any project, any status** (including `complete` and `archived`). The _type_, not the project's status, is what keeps warranty hours out of the active-budget rollup.
- `travel`, `shop`, `break` → no picker.

### 5.4 Task picker

Per §7.1: a task must be assigned to the member **or** unassigned. Confirm against 5B at build.

---

## 6. Workflow rules

- **Clock-in opens the first segment.** The member must say what it is for. There is no clocked-in-with-no-segment state.
- **Switching activity** ends the current segment (note; completion if a task was attached) and opens the next.
- **Clock-out** ends the open segment and closes the session.
- **Site change requires no clock action** — it is a new segment inside the same session.
- **Paid hours are never altered by segment activity.** Segment edits reallocate cost; they never change the clock.

---

## 7. Invariants

1. Segments of a session are **contiguous, non-overlapping**, and span exactly `clock_in → clock_out`.
2. **Σ segment durations = session duration.** No gaps. (This is why §3.4 removes the session break columns.)
3. **Paid hours = session duration − unpaid `break` segments.** Whether breaks are **paid** is a company setting; when **paid breaks** are ON, break duration up to the **paid-break-minutes-per-day** cap counts toward paid hours (Session 64, §13). Paid or not, a `break` segment carries no `project_id`, so it never lands on a job's cost.
4. `warranty` hours are excluded from the active-budget rollup (M5 §5.6 / 5E).
5. **Paid hours ≠ worked hours (Session 64).** **Paid hours** (session duration less unpaid breaks) drive **payroll and OT**. **Worked hours** — the duration of segments carrying a `project_id` (`work`, `material_run`, `warranty`) — drive **job cost**. With **paid breaks ON** the two diverge: a paid lunch adds to paid hours but to no job's worked hours. This split is the heart of the model.

---

## 8. Approval

**Hierarchy:** `Owner > Admin > PM > Foreman > Crew`. **You may approve strictly below you.** No self-approval. No peer approval.

| Approver | May approve              |
| -------- | ------------------------ |
| Owner    | Admin, PM, Foreman, Crew |
| Admin    | PM, Foreman, Crew        |
| PM       | Foreman, Crew            |
| Foreman  | Crew                     |
| Crew     | nobody                   |

- **Owner hours have no approval state (Session 64).** Approval is strictly-below and nobody outranks the Owner, so an Owner's session is **never pending and never approved — it simply exists. Do not auto-approve it.** _Supersedes "Owner has no timeclock → no one approves an Owner (no rows exist)"; the Owner now clocks in (§4)._ **Schema flag:** the session `status` column is currently `NOT NULL DEFAULT 'pending'`; an Owner session must be able to carry no approval state (nullable, or an `n/a` value) — resolve at build.
- Admin's hours (setting ON) → approvable by **Owner only**, which falls out of the strictly-below rule.
- Only `approved` sessions are eligible for QuickBooks export (Module 7).
- Approval is on the **session** (payroll), not the segment.

### 8.1 Editing hours (Session 64)

People forget to clock in and out, so hours need an edit path — the spec previously had **none**.

- **Only Owner and Admin may edit hours** (sessions and segments). **Crew and Foreman cannot edit hours — including their own.**
- **Consequence, stated explicitly:** a **Foreman may approve hours he cannot correct.** Approval and correction are distinct powers held by different roles.
- **An edit does not clear approval.** When an Owner or Admin edits already-approved hours, the timesheet **stays approved** — editing does not re-open the approval. Tradeoff recorded as an open item (§12).

---

## 9. Overtime

**Nobody selects overtime.** It is derived.

- Sum a member's **paid hours** for the week.
- Hours above the company's weekly threshold (default **40**) are overtime.
- `travel`, `shop`, and **paid** `break` hours **count toward** the threshold — they are paid hours.
- Worked example: 38.0 h on jobs + 2.5 h travel = 40.5 h paid → **0.5 h overtime**, triggered by drive time.
- Never stored on a session or a segment. Derived at read time. A day that straddles the threshold splits correctly, which no per-row label can do.

---

## 10. Acceptance example — **PROPOSED**

> **Reconstructed against a real Bishop day (Session 64).** A real day's shape and values; the employee names are reconstructed. Labelled **PROPOSED** until finally traced. Exercises the Session-64 reversals: an Owner with a timeclock, paid breaks, and the paid-hours ≠ worked-hours split.

**INPUT** — Project _Willow Ridge_, `2026-07-08`. Four `time_clock_sessions`, all `clock_in 08:00`, `clock_out 16:00`: three employees and **Josh (Owner)**.

- **Employee A** and **Employee B**, each: `work` on Willow Ridge 08:00–12:00 · `break` 12:00–12:30 · `work` on Willow Ridge 12:30–16:00.
- **Employee C**: `work` on Willow Ridge 08:00–16:00, no break.
- **Josh (Owner)**: `work` on Willow Ridge 08:00–15:00 · `travel` 15:00–16:00, driving to an estimate.

**Company setting:** paid breaks **ON**, **30 minutes per day**.

**STORE** — Four sessions. Nine `time_segments`:

| Session | #   | type       | project      | start–end   | hrs |
| ------- | --- | ---------- | ------------ | ----------- | --- |
| A       | 1   | `work`     | Willow Ridge | 08:00–12:00 | 4.0 |
| A       | 2   | `break`    | —            | 12:00–12:30 | 0.5 |
| A       | 3   | `work`     | Willow Ridge | 12:30–16:00 | 3.5 |
| B       | 4   | `work`     | Willow Ridge | 08:00–12:00 | 4.0 |
| B       | 5   | `break`    | —            | 12:00–12:30 | 0.5 |
| B       | 6   | `work`     | Willow Ridge | 12:30–16:00 | 3.5 |
| C       | 7   | `work`     | Willow Ridge | 08:00–16:00 | 8.0 |
| Josh    | 8   | `work`     | Willow Ridge | 08:00–15:00 | 7.0 |
| Josh    | 9   | `travel`   | —            | 15:00–16:00 | 1.0 |

- `break` segments carry **no `project_id`**.
- Josh's `travel` segment carries **no `project_id`** — he is driving to an estimate and **no project exists yet**.

**OUTPUT**

- **Paid hours = 8.0 for all four people** (paid breaks ON, ≤ 30 min/day → A's and B's half-hour lunch is paid; C and Josh took no break).
- **Worked hours on Willow Ridge** (segments carrying a `project_id`): A **7.5**, B **7.5**, C **8.0**, Josh **7.0** → **30.0 hours** of labor cost to the job.
- Josh's **travel hour is paid but lands on no job** (no `project_id`).
- **No overtime:** 32 paid hours across the week to date, under the **40** threshold.
- Employee A/B/C hours are **pending approval** by Josh or the Foreman. **Josh's (Owner) hours have no approval state** (§8).

---

## 11. RLS

- All reads/writes company-scoped: `company_id = get_my_company_id()`.
- A member reads and writes **their own** sessions and segments: `member_id = get_my_member_id()`.
- Owner/Admin/PM/Foreman read all sessions in the company (needed for approval queues and job costing).
- **Approval UPDATE** is gated by the §8 matrix — the approver's role vs. the _subject's_ role. This is a role-comparison predicate, not a simple ownership check; it likely needs a SQL helper (e.g. `can_approve_member(target_member_id)`).
- ~~Segments are **immutable after the session is approved**~~ **[SUPERSEDED — Session 64, §8.1: Owner and Admin may edit hours even after approval, and the edit does not clear approval.]** Reallocating cost after payroll has run remains a Module 7 concern, not a 6A edit.
- Soft-delete per convention.

---

## 12. Open items

| #   | Item                                                                                                                                                                                                                                                           | Owner                 |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| 1   | Acceptance trace unverified against a real Bishop job (§10)                                                                                                                                                                                                    | Josh                  |
| 2   | Breaks paid or unpaid at Bishop — **defaulting to unpaid**                                                                                                                                                                                                     | Settings pass         |
| 3   | Legal: short rest breaks (<20 min) are generally paid; bona fide meal periods (30 min+) unpaid. A single company toggle may permit an unlawful setting. Consider splitting `break` into `rest` / `meal`. **Not a 6A decision — route to professional review.** | Settings pass         |
| 4   | Optional **daily** OT threshold (e.g. >8 h/day) — §7.1 offers it; undecided                                                                                                                                                                                    | Settings pass         |
| 5   | GPS: capture vs. enforce; column type (`jsonb` vs. PostGIS)                                                                                                                                                                                                    | Settings pass / build |
| 6   | Can a member edit a segment after clock-out but before approval?                                                                                                                                                                                               | 6A build              |
| 7   | Editing/splitting a segment (mis-tapped type) — allowed, and by whom?                                                                                                                                                                                          | 6A build              |
| 8   | What happens to an open session at midnight / a forgotten clock-out?                                                                                                                                                                                           | 6A build              |
| 9   | `time_segments` FK to `tasks` — confirm 5B task table shape                                                                                                                                                                                                    | Build                 |
| 10  | Warranty exclusion from budget rollup — coordinate with 5E                                                                                                                                                                                                     | 5E                    |
| 11  | **An edit does not clear approval (§8.1).** An approved timesheet no longer guarantees the approver saw those exact numbers. Accepted; reversible later.                                                                                                        | Josh / 6A build       |
| 12  | **Estimate travel** carries no `project_id` and lands on no job. A future `estimate_id` on `time_segments` would let estimate travel be costed per bid. Deferred — Josh chose this (Session 64).                                                                 | Deferred              |

---

## 13. Company Settings added by 6A

Land in the **batched** Company Settings pass, not in 6A.

- **Overtime rules** — weekly threshold (default 40 h/wk); optional daily threshold (open, #4)
- **GPS clock-in** — capture/enforce toggle, default **OFF**
- **Breaks paid/unpaid** — default **unpaid** (open, #2/#3). **(Session 64 — Bishop pays for lunch.)** Two settings: **(a) breaks paid** on/off; **(b) paid break minutes per day** (a daily cap, e.g. 30 min). When ON, break-segment duration up to the cap counts toward paid hours — and thus toward the weekly OT threshold (§9). Break segments still carry no `project_id`, so paid-break time never lands on a job's cost. Batched settings pass, **not a 6A migration.**
- **Admin timeclock** — enable/disable, default **OFF**

---

## 14. Doc corrections owed (same commit as this spec)

- `future_module_architecture.md` §7.1 — apply the five amendments (§3); drop "supersedes the committed single `time_entries`" → _planned_ concept, never committed.
- `future_module_architecture.md` §7.9 — rewrite the flat-approval divergence entry.
- `future_module_architecture.md` §7.4 — delivery check-in is **not** gated by project assignment (Josh, this session).
- `CLAUDE_MODULES.md` §6.1 and §6.9 — mark superseded by §7 (same treatment §6.4 received for punch lists). §6.1's "when clocking in, crew picks which task" is contradicted by the real workflow.
- **(Session 64)** `future_module_architecture.md` §7.1 **and** `CLAUDE_MODULES.md` §6.1 — apply the Session-64 reversals: **Owner has a timeclock** (Owner labor is job cost; Owner hours carry no approval state) and **breaks may be paid** per company setting (add paid-break-minutes-per-day). Both docs still carry the superseded "Owner has no timeclock" and unpaid-break assumptions.
