# 6B — Daily Logs — Spec (DRAFT, for review)

> **Design authority:** `docs/specs/future_module_architecture.md` §7.2. **This spec amends §7.2 in four places** (§3). Amendments are decisions taken in the Module 6 interview, not drift — §7.2 and `CLAUDE_MODULES.md` §6.2 must be rewritten in the same commit that lands this spec.
>
> **Status:** DRAFT — not built. The acceptance trace (§10) is **PROPOSED/UNVERIFIED** — mirrored from settled interview rules, not yet walked against a real Bishop daily log. Verify before build.
>
> **Written against stale project knowledge.** All Module 3 / Module 5 / 6A column references are **design-level** and carry a _confirm against live schema at build_ obligation.
>
> **Depends on:** **6A** (crew-present auto-fill, employee hours), **6D** (material deliveries display), **M3** (photos, PDF storage), **M5** (`projects`), **company_members** foundation.
>
> **Conventions (`CLAUDE.md`):** standard columns; per-tenant triggers; RLS via `get_my_company_id()`; identity via `get_my_member_id()`; server/client service split.

---

> ## ⚠️ AS-BUILT RECONCILIATION vs. 6A (added this pass — verified against the migration, not against what a spec calls it)
>
> Checked against the **as-built** 6A migration `supabase/migrations/20260710130000_module6_6a_time_tracking.sql` on branch `feat/module-6a` (read via `git show`, not merged), its shared derivation `packages/shared/utils/time-tracking.ts`, and the M5 `change_orders` (5D) / projects (5A) migrations. Drifts corrected below are each flagged **[DRIFT]** at the point of use.
>
> 1. **`time_segments` has NO `member_id` and NO date column.** Member identity lives only on the parent session: `time_segments.session_id → time_clock_sessions.member_id`. And a segment has `segment_start` / `segment_end` (`timestamptz`), not a `date`. **Every 6B auto-fill that reads "a member's segment on this project on this date" must (a) join `time_segments → time_clock_sessions` to get `member_id`, and (b) bucket `segment_start` to a calendar day — and 6A stores no timezone, so the day boundary is undefined.** See §5 and Questions Q1/Q2.
> 2. **Domain author ≠ audit column.** In 6A and in `change_orders` (5D), `created_by` / `updated_by` are audit columns defaulting to `auth.uid()` (FK `auth.users`). The *domain* "who did this" is a separate `*_member_id` column defaulting to `get_my_member_id()` (FK `company_members`) — `change_orders.author_member_id` is the reference. **This spec's "`created_by` = the author" / "`created_by = get_my_member_id()`" is a [DRIFT].** See §4 and §8.
> 3. **On-site segment types are CONFIRMED, not "confirm at build."** 6A's CHECK gates `project_id` to exactly `work | material_run | warranty` (constant `PROJECT_BEARING_TYPES`). `travel | shop | break` carry no `project_id` and are structurally excluded. See §5.
> 4. **No per-member-per-day hours helper exists in 6A.** `workedHoursByProject()` groups by **project**, and `getProjectWorkedHours()` selects only `segment_type, project_id, segment_start, segment_end` — it never joins the session, so it cannot attribute to a member. 6B's derived employee hours is **new derivation work that 6B owns**, not a 6A function it can call. See §5 / §6.1 and Questions Q3.
> 5. **Acceptance trace stays PROPOSED.** Not reconciled into fact; see the NEEDS INTERVIEW blocker in §10.

---

## 1. Scope

The end-of-day field record for a project. Mobile-first, offline-ready.

**In scope (v1):** log creation + edit; auto-filled crew present; derived employee hours; manual subcontractor hours/notes; work accomplished; safety hazard flag + notes with escalation to 6C; material used/needed (free text); equipment used (free text); tasks for tomorrow; weather (manual); photos; voice-to-text; end-of-day PDF to Module 3.

**Out of scope:**

- **Formal incident reporting** → **6C**. The log carries a hazard _flag_, never an incident record (§7).
- **Material deliveries** → **6D** owns the record. 6B _displays_ them read-only (§6.3).
- **Inventory** → **Module 8**. Material used/needed is free text in v1 (§6.4).
- **Equipment hours per tool** → later. Free text in v1 (§6.5).
- **Offline sync engine** → v2. v1 is offline-**ready** (client UUIDs, device timestamps).

---

## 2. Dependencies (all design-level — confirm at build)

| Dependency                                  | Used for                       | Source     |
| ------------------------------------------- | ------------------------------ | ---------- |
| `time_segments`                             | crew present; employee hours   | **6A**     |
| `company_members(id)`, `get_my_member_id()` | authorship, crew, subs         | foundation |
| `projects(id)`                              | the log's project              | M5         |
| `material_deliveries`                       | read-only delivery display     | **6D**     |
| `files` + storage                           | photos, PDF                    | M3         |
| markup component                            | photo markup, reused unchanged | M3 (§7.6)  |

**6A ordering:** 6B cannot build before 6A. Both auto-fills read `time_segments`.

---

## 3. Amendments to §7.2 (four)

1. **"One per project per day" — REMOVED.** Multiple daily logs may exist for the same project on the same date. _(Josh: "there is no harm in having more than 1.")_ Consequence: creator-only-edit survives intact — nobody else is ever in your log — and the "highest ranking person on site writes it" rule stays a **Bishop convention**, not a system constraint. No rank gate is enforced.
2. **Crew present derives from `time_segments`, not clock-ins.** 6A removed `project_id` from `time_clock_sessions`, so a clock-in no longer knows its project. Distinct members with a segment on _this project_ on _this date_. This is strictly better: it excludes someone who clocked in, drove to another job, and never touched this one.
3. **Hours are derived, not typed.** §7.2 lists "hours" as a log field. 6A owns hours. A typed hours field would be a second, conflicting source of truth for the same day. **Employee hours are read-only, computed from `time_segments`.** **Subcontractor hours and notes are manual** — subs run their own systems and are unlikely to clock in.
4. **"Materials delivered" is not a typed field.** 6D owns the delivery record. 6B renders that project-day's deliveries **read-only** (§6.3).

**New fields not in §7.2 or `CLAUDE_MODULES.md` §6.2** (from the interview): _material used_, _material needed_, _equipment used_, _tasks for tomorrow_, _notes_.

> **Also confirmed unchanged:** weather stays a **manual** field. An auto-fetch was considered and rejected — it introduces a weather-API vendor (none exists in this stack), requires the project's address, cannot work offline, and reads a nearby station that may be wrong about the job site.

---

## 4. `daily_logs`

```
daily_logs
  id                UUID PK              -- client-generated (offline-ready)
  company_id        UUID NOT NULL REFERENCES companies(id)
  project_id        UUID NOT NULL REFERENCES projects(id)
  log_date          DATE NOT NULL
  weather           TEXT                 -- manual
  work_performed    TEXT                 -- "what was accomplished"
  material_used     TEXT                 -- free text; Module 8 structures later
  material_needed   TEXT                 -- free text; Module 8 structures later
  equipment_used    TEXT                 -- free text, e.g. "mini-ex, 3 hrs"
  tasks_tomorrow    TEXT
  notes             TEXT                 -- conversations, decisions, "he said/she said"; Module 8 may structure later
  hazards_present   BOOLEAN NOT NULL DEFAULT false
  hazard_notes      TEXT                 -- required when hazards_present (§7)
  pdf_file_id       UUID REFERENCES files(id)   -- M3
  author_member_id  UUID NOT NULL DEFAULT get_my_member_id() REFERENCES company_members(id)  -- domain author (§8)
  -- standard columns (created_by / updated_by are AUDIT = auth.uid(), NOT the author)
```

- **No unique constraint** on `(project_id, log_date)` — multiple logs per project-day are legal (§3.1).
- **Never locks.** Always editable by its creator, per §7.2. The PDF is a point-in-time snapshot.
- **[DRIFT — corrected]** The author is **`author_member_id`** (a `company_members` FK defaulting to `get_my_member_id()`), **not** `created_by`. `created_by`/`updated_by` are audit columns defaulting to `auth.uid()` (FK `auth.users`) per 6A and `change_orders.author_member_id` (5D). Edit rights: creator only, keyed on `author_member_id = get_my_member_id()` (§8).

### 4.1 `daily_log_crew` — who was on site

Auto-filled at log creation from `time_segments`; **editable** thereafter.

```
daily_log_crew
  id            UUID PK
  company_id    UUID NOT NULL REFERENCES companies(id)
  daily_log_id  UUID NOT NULL REFERENCES daily_logs(id) ON DELETE CASCADE
  member_id     UUID NOT NULL REFERENCES company_members(id)
  -- standard columns
  UNIQUE (daily_log_id, member_id)
```

A junction table, not a `member_id[]` array — the list is editable and must survive a member being removed from the roster.

### 4.2 `daily_log_sub_entries` — subcontractor hours (manual)

```
daily_log_sub_entries
  id            UUID PK
  company_id    UUID NOT NULL REFERENCES companies(id)
  daily_log_id  UUID NOT NULL REFERENCES daily_logs(id) ON DELETE CASCADE
  member_id     UUID NOT NULL REFERENCES company_members(id)  -- the sub
  hours         NUMERIC(5,2) NOT NULL
  note          TEXT
  -- standard columns
```

Subs are `company_members` (login optional). Hours here are **not payroll** and never enter 6A. See open item #4 — a sub who _does_ have a login and clocks in could be double-counted.

---

## 5. Auto-fill rules (both read `time_segments`)

> **[DRIFT — corrected] `time_segments` carries no `member_id` and no date.** "A member's segment" is only reachable by joining `time_segments.session_id → time_clock_sessions.member_id`; "on this date" must be derived by bucketing `segment_start` (`timestamptz`) to a calendar day. 6A stores no timezone, so **the day boundary is undefined** — Q2. Both predicates below are rewritten accordingly.

**Crew present** — distinct `time_clock_sessions.member_id` for sessions whose `time_segments` include one with `project_id = <this project>` and `segment_start` falling on `log_date` (in the company day, Q2). Snapshot at creation, editable.

**Employee hours** — sum of on-site segment durations (`segment_end − segment_start`) per member, same predicate, via the session join. **Read-only, never stored on the log.** Recomputed on read. **[DEPENDENCY — 6A] No 6A function returns hours per member per project per day** — `workedHoursByProject()` groups by project and `getProjectWorkedHours()` never joins the session. This grouping is **new derivation 6B must build** (see the reconciliation banner item 4, Q3).

> **Known staleness.** Both are snapshots. A crew member arriving at 3pm does not appear in a log opened at noon. Employee hours, being recomputed, self-correct; crew present does not, once edited. Accepted — the author can add them. Flagged in §10 as the item most likely to surprise in the field.

**Which segment types count as "on site"? — CONFIRMED against 6A (was "confirm at build").** Exactly `work`, `material_run`, `warranty` (6A's CHECK gates `project_id` to these three; constant `PROJECT_BEARING_TYPES`). `travel`, `shop`, `break` carry no `project_id` and are structurally excluded. **Open sub-question (Q4):** a `warranty` callback carries a `project_id` and would count someone as "crew present," yet warranty hours are budget-excluded (6A §7.4) — is a warranty-only visit "on site" for the daily log? (Physically yes; flagging because it is a presence-vs-cost distinction the author may not expect.)

---

## 6. Field-by-field behavior

### 6.1 Employee hours — derived, read-only

Rendered from `time_segments`. Not editable in 6B. Corrections happen in 6A.

### 6.2 Subcontractor hours — manual

Sub + hours + note, typed. Any number of rows.

### 6.3 Material delivered — read-only from 6D

Renders the deliveries checked in against this project on this date. **No typed field, no column.** Prevents two sources of truth for one delivery. If 6D has not built, this section renders empty.

### 6.4 Material used / needed — free text

Not inventory. Module 8 may structure these later; the columns are text so that migration is additive.

### 6.5 Equipment used — free text

e.g. `"mini-ex, 3 hrs"`. **Structured hours-per-tool with an FK to the Module 8 tool catalog is a deliberate later enhancement** — the field exists now so the data is captured; it is not parsed. Equipment hours do **not** roll into job cost in v1.

### 6.6 Weather — manual

Free text. See §3.

### 6.7 Tasks for tomorrow — free text

Overlaps 6E (crew briefing task list) and M5 tasks. **Not linked to either in v1.** Open item #5.

### 6.7a Notes — free text

Conversations, decisions, and "he said / she said" records not covered by the structured fields — e.g. a countertop/stone-selection discussion with the owner's rep. Dated by the log's `log_date`. Text so a Module 8 structuring migration is additive. Satisfies the legal/insurance record need (§10 interview).

### 6.8 Photos

Auto-pulled from that day's captures for that project (M3). Markup reuses the M3 component unchanged (§7.6) — no new build.

### 6.9 Voice-to-text

Foreman speaks, app transcribes (§7.2). **New external dependency** — no transcription service exists in the current stack. Vendor undecided (browser Web Speech API vs. a hosted model). Cannot work offline. Open item #3.

---

## 7. Safety: hazard flag vs. incident report

**Locked split.** `CLAUDE_MODULES.md` §6.3 and §7.3 make these distinct workflows, and the split is the whole point:

- **Hazard (6B)** — `hazards_present` checkbox + `hazard_notes`. Quick, in-the-moment. No notification. No OSHA record.
- **Incident (6C)** — something actually happened (injury, property damage, near miss). OSHA fields, auto-PDF, immediate notification to Owner/Admin/PM/Foreman, company-wide incident log.

**Escalation:** when `hazards_present` is ticked, the log surfaces a **"File an incident report"** action opening 6C, pre-filled with `project_id` and date. Concerns stay in the log; incidents escalate.

> **Failure mode this prevents:** typing _"Dave cut his hand"_ into daily-log free text notifies nobody, creates no OSHA record, and never reaches the incident log.

`hazard_notes` is required when `hazards_present = true` (CHECK constraint).

---

## 8. Permissions & RLS

- Company-scoped: `company_id = get_my_company_id()`.
- **Create:** any member, on any project they can see. No rank gate (§3.1).
- **Edit / delete:** **creator only** — **[DRIFT — corrected]** keyed on **`author_member_id = get_my_member_id()`**, not `created_by` (which is the audit `auth.uid()` column, §4). Never locks (§7.2).
- **Read:** **[RESOLVED — assigned-only via `can_view_project()`]** read visibility follows M5 content-visibility: `can_view_project()` = "owner/admin see all **OR** the caller is assigned" — restricting **PM/Foreman to assigned projects**, not company-wide. 6A's *session* reads granted PM/Foreman company-wide (for approval/costing), but daily logs are project-scoped content, not payroll, so they do not diverge. Crew read is assigned-only likewise (use `can_view_project(project_id)`). This is the module-wide decision (Q5).
- Soft-delete per convention (Owner/Admin only for delete, mirroring 6A/M5 — Q5).

> A PM who arrives after a Crew member wrote the log **cannot edit it**. Accepted consequence of §3.1 — the PM writes their own log instead.

---

## 9. End-of-day PDF

- One PDF **per log**, filed to the project's **Daily Logs** folder in M3.
- Two logs on the same project, same date → **two PDFs, same date** (Josh, this session). Filename must disambiguate by author. Naming is a build detail.
- The PDF is a **point-in-time snapshot**. Because logs never lock, an edited log's PDF goes stale. **Regenerate-on-edit vs. version-on-edit is undecided** — open item #2.
- Generation reuses React-PDF (per repo tooling).

---

## 10. Acceptance example — VERIFIED against a real Bishop day

> Walked against a real Bishop townhouse-remodel day (finishing phase) in the Module 6B interview. This trace is authoritative. Open item #1 CLOSED.

**INPUT** — Townhouse remodel, finishing phase, `log_date` = the work day. Author: the on-site owner.
- weather: `"Hot and sunny"` (manual)
- work_performed: `"Laid flooring, set tile, grouted, and cleaned — hallway, secondary bath, primary bath. Flooring only partially completed; required tools were not on site."`
- material_used: `"Flooring, tile, grout"`
- tasks_tomorrow: `"Finish flooring"`
- notes: `"Discussed countertop and stone selection with owner's rep."`
- hazards_present: unchecked. No subcontractors, no delivery, no inspection.

**STORE** — one `daily_logs` row; `hazards_present = false`, `hazard_notes` NULL, `notes` set.
`daily_log_crew`: auto-filled — the members holding a `work` segment on this project on this local day, resolved via `time_segments.session_id → time_clock_sessions.member_id`. The owner clocked a partial (~3 hr) day; if that segment is on this project, the owner appears too.
`daily_log_sub_entries`: none.
Employee hours: **not stored** — derived on read.

**OUTPUT** — Crew present: the on-site members. Employee hours: read-only, recomputed from `time_segments` (the owner's partial day; each employee's clocked full day). Sub hours: none. Deliveries: empty (6D unbuilt). Notes render the countertop conversation, dated by `log_date`. One PDF filed to the project's Daily Logs folder.

> **Interview note.** An earlier walk of a real day surfaced zero employee hours because no one had clocked in — an artifact of testing before the system was live, not a defect. Confirmed with Josh: crew clock in daily via 6A, so auto-fill and derived hours behave as designed. The hours model is unchanged; no typed-hours field was added.

---

## 11. Open items

| #   | Item                                                                                                       | Owner             |
| --- | ---------------------------------------------------------------------------------------------------------- | ----------------- |
| 1   | **CLOSED** — acceptance trace (§10) verified against a real Bishop day.                                     | Closed            |
| 2   | PDF regenerate-on-edit vs. version-on-edit; filename disambiguation for same-project same-date logs        | 6B build          |
| 3   | **Voice-to-text vendor** — new external dependency, no offline path                                        | 6B build          |
| 4   | **Sub double-count** — a subcontractor with a login who clocks in via 6A _and_ is entered manually in §4.2 | 6B build          |
| 5   | "Tasks for tomorrow" ↔ 6E briefing: **resolved** — 6E displays this field read-only and stores nothing (no FK, no link), per 6E-spec §5. (M5 tasks overlap still open.) | Closed            |
| 6   | Crew-present snapshot staleness for late arrivals (§5)                                                     | Accepted; revisit |
| 7   | Which `segment_type`s count as "on site" (§5)                                                              | Build             |
| 8   | Photo auto-pull predicate — project + date, or explicit attach?                                            | Build             |
| 9   | Crew read-visibility depends on the M5 §5.2a decision actually shipping as recommended                     | Build             |

---

## 11a. Questions for Josh (raised by the 6A as-built reconciliation — resolve nothing silently)

- **Q1 — Employee-hours member join.** Confirmed: `time_segments` has no `member_id`; hours-per-member requires joining through `time_clock_sessions`. This is a build fact, not a decision — flagged so it is not missed when 6B's derivation is written.
- **Q2 — Day boundary / timezone. RESOLVED — the company's local calendar day.** Build dependency: a company-level timezone must exist (company settings) as the source; without it the day boundary is undefined. This governs both crew-present and employee-hours auto-fill.
- **Q3 — Who owns the per-member-per-day hours derivation?** 6A exposes only project-grouped hours. Does 6B build its own member-grouped read, or should 6A grow a shared helper (e.g. `hoursByMemberForProjectDay`) so 6B and any future consumer share one source of truth? Recommend the latter to avoid a second derivation drifting from 6A's.
- **Q4 — Does a `warranty`-only visit count as "crew present"? RESOLVED — yes, include in crew-present, but label.** Warranty carries a `project_id` (person was physically on the job) so they count as present; label to preserve the presence-vs-cost distinction, since warranty hours are budget-excluded.
- **Q5 — Daily-log read visibility for PM/Foreman. RESOLVED — assigned-only, matching M5.** Daily-log read visibility uses `can_view_project()`; PM/Foreman read logs only for projects they are assigned to. No divergent RLS rule. This is the module-wide answer (also governs 6C/6D). Delete is Owner/Admin-only.
- **Q6 — Sub double-count (existing open item #4).** A subcontractor with a login who clocks in via 6A *and* is entered manually in §4.2 is counted twice. Surfaced here because 6A makes sub clock-in real (subs are `company_members` and rank with crew for approval).

---

## 12. Doc corrections owed (same commit as this spec)

- `future_module_architecture.md` §7.2 — apply the four amendments (§3); the "one per project per day" and "crew auto-fills from clock-ins" rules are both dead.
- `CLAUDE_MODULES.md` §6.2 — mark superseded by §7.2 as amended. Its "hours" and "materials delivered" fields are now owned by 6A and 6D respectively.
- Carried from the 6A spec, still owed: §7.1 (five amendments), §7.9 (flat-approval divergence entry), §7.4 (delivery check-in not assignment-gated), `CLAUDE_MODULES.md` §6.1/§6.9, and the correction that **no `time_entries` was ever committed**.
