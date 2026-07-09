# 6B — Daily Logs — Spec (DRAFT, for review)

> **Design authority:** `docs/specs/future_module_architecture.md` §7.2. **This spec amends §7.2 in four places** (§3). Amendments are decisions taken in the Module 6 interview, not drift — §7.2 and `CLAUDE_MODULES.md` §6.2 must be rewritten in the same commit that lands this spec.
>
> **Status:** DRAFT — not reviewed, not committed, not built. **No acceptance trace exists** (§10) — unlike 6A, no worked example was walked through. This spec is **not build-ready** until one is.
>
> **Written against stale project knowledge.** All Module 3 / Module 5 / 6A column references are **design-level** and carry a _confirm against live schema at build_ obligation.
>
> **Depends on:** **6A** (crew-present auto-fill, employee hours), **6D** (material deliveries display), **M3** (photos, PDF storage), **M5** (`projects`), **company_members** foundation.
>
> **Conventions (`CLAUDE.md`):** standard columns; per-tenant triggers; RLS via `get_my_company_id()`; identity via `get_my_member_id()`; server/client service split.

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

**New fields not in §7.2 or `CLAUDE_MODULES.md` §6.2** (from the interview): _material used_, _material needed_, _equipment used_, _tasks for tomorrow_.

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
  hazards_present   BOOLEAN NOT NULL DEFAULT false
  hazard_notes      TEXT                 -- required when hazards_present (§7)
  pdf_file_id       UUID REFERENCES files(id)   -- M3
  -- standard columns (created_by = the author)
```

- **No unique constraint** on `(project_id, log_date)` — multiple logs per project-day are legal (§3.1).
- **Never locks.** Always editable by its creator, per §7.2. The PDF is a point-in-time snapshot.
- `created_by` is the author. Edit rights: creator only (§8).

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

**Crew present** — distinct `member_id` where a segment exists with `project_id = <this project>` and the segment's date = `log_date`. Snapshot at creation, editable.

**Employee hours** — sum of segment durations per member, same predicate. **Read-only, never stored on the log.** Recomputed on read.

> **Known staleness.** Both are snapshots. A crew member arriving at 3pm does not appear in a log opened at noon. Employee hours, being recomputed, self-correct; crew present does not, once edited. Accepted — the author can add them. Flagged in §10 as the item most likely to surprise in the field.

**Which segment types count as "on site"?** Recommendation: `work`, `material_run`, `warranty` (all carry `project_id`). `travel`, `shop`, `break` carry none and are structurally excluded. **Confirm at build.**

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
- **Edit / delete:** **creator only** — `created_by = get_my_member_id()`. Never locks (§7.2).
- **Read:** Owner/Admin/PM/Foreman read all company logs. Crew read logs on projects they are assigned to — **mirrors the M5 §5.2a project-visibility rule; confirm it landed that way at build.**
- Soft-delete per convention.

> A PM who arrives after a Crew member wrote the log **cannot edit it**. Accepted consequence of §3.1 — the PM writes their own log instead.

---

## 9. End-of-day PDF

- One PDF **per log**, filed to the project's **Daily Logs** folder in M3.
- Two logs on the same project, same date → **two PDFs, same date** (Josh, this session). Filename must disambiguate by author. Naming is a build detail.
- The PDF is a **point-in-time snapshot**. Because logs never lock, an edited log's PDF goes stale. **Regenerate-on-edit vs. version-on-edit is undecided** — open item #2.
- Generation reuses React-PDF (per repo tooling).

---

## 10. Acceptance example — **MISSING**

> ⛔ **No `input → store → output` trace has been walked through for 6B.** 6A has one (PROPOSED); 6B has none. Per the interview-first mandate, **this spec is not build-ready.** A real Bishop daily log — real project, real date, real crew, real sub hours, real accomplished text — must be traced and approved, and that trace becomes the acceptance example.
>
> The two things a trace would most likely expose: (a) whether crew-present auto-fill matches who Josh would actually list, and (b) whether the read-only employee-hours block is what he expects to see, given 6A splits a day across projects.

---

## 11. Open items

| #   | Item                                                                                                       | Owner             |
| --- | ---------------------------------------------------------------------------------------------------------- | ----------------- |
| 1   | **No acceptance trace (§10).** Blocks build.                                                               | Josh              |
| 2   | PDF regenerate-on-edit vs. version-on-edit; filename disambiguation for same-project same-date logs        | 6B build          |
| 3   | **Voice-to-text vendor** — new external dependency, no offline path                                        | 6B build          |
| 4   | **Sub double-count** — a subcontractor with a login who clocks in via 6A _and_ is entered manually in §4.2 | 6B build          |
| 5   | "Tasks for tomorrow" overlaps 6E's briefing task list and M5 tasks. Linked, or free text forever?          | 6E spec           |
| 6   | Crew-present snapshot staleness for late arrivals (§5)                                                     | Accepted; revisit |
| 7   | Which `segment_type`s count as "on site" (§5)                                                              | Build             |
| 8   | Photo auto-pull predicate — project + date, or explicit attach?                                            | Build             |
| 9   | Crew read-visibility depends on the M5 §5.2a decision actually shipping as recommended                     | Build             |

---

## 12. Doc corrections owed (same commit as this spec)

- `future_module_architecture.md` §7.2 — apply the four amendments (§3); the "one per project per day" and "crew auto-fills from clock-ins" rules are both dead.
- `CLAUDE_MODULES.md` §6.2 — mark superseded by §7.2 as amended. Its "hours" and "materials delivered" fields are now owned by 6A and 6D respectively.
- Carried from the 6A spec, still owed: §7.1 (five amendments), §7.9 (flat-approval divergence entry), §7.4 (delivery check-in not assignment-gated), `CLAUDE_MODULES.md` §6.1/§6.9, and the correction that **no `time_entries` was ever committed**.
