# Context — Session 63 (July 9, 2026)

> **Type:** Planning session. Module 6 architecture confirmation + interview-first spec work.
> **Code written:** none. **Migrations:** none. **Commits:** none.
> **Artifacts produced:** `6A-spec.md`, `6B-spec.md` — **drafts, uncommitted, awaiting review.**

---

## Session goal

Begin Module 6 (Team & Field Operations) spec work. Ordered gate: read verified architecture → confirm sub-module breakdown → reconcile 6A seams → interview-first → approved trace → spec file.

---

## 1. Git verification (the actual work of the first half)

### 1a. `time_entries` was NEVER committed — anywhere, ever

Five searches, **all empty**:

```
git grep -l "time_entries" -- supabase/migrations/                      # feat/module-5
git grep -l "time_entries" -- '*.ts'                                    # feat/module-5
git grep -l "time_entries" origin/main -- supabase/migrations/ '*.ts'   # trunk
git log --all --oneline -S "time_entries" -- supabase/migrations/ '*.ts'  # all history, all branches
git log --all --oneline -S "time_entries" -- '*.sql'                    # all history, all .sql
```

The last two use the pickaxe across **all branches and all history**, so they would catch the table even if it had been added and later deleted.

**Conclusion:** Module 6 has **zero committed code**. `future_module_architecture.md` §7.1's claim that the two-table model "supersedes the committed single `time_entries`" is **doc-drift**. It supersedes a _planning concept_, never shipped code. `CLAUDE_MODULES.md` §6.9 is correct to list it under "Data Model Concepts (**Planned**)".

**Consequence:** 6A "seam 1" (two-table vs. committed stub) **dissolved** — nothing to reconcile.

### 1b. Module 5 is NOT merged to `main` — HAZARD

Claimed in-session: _"branch has now been merged to main"_ and _"mod5 is complete."_ Verified after `git fetch origin`:

```
d134d27 (origin/main, origin/HEAD, main) docs(sessions): add context56 — #79 squash baseline closed
```

`main`, `origin/main`, and `origin/HEAD` all sit on the **Session 56** commit. Sessions 57–62 — all of Module 5 — are **not on trunk**.

**The hazard:** M5 migrations were pushed to **production** via CLI from `feat/module-5`. So prod carries schema whose only source lives on an unmerged branch. `git branch -vv` was requested to determine whether that branch is pushed anywhere or exists only in the Codespace — **never run.** If it is local-only, a Codespace rebuild loses the source of live production schema.

**This did not block Module 6 spec work** (specs derive from architecture + interview, not from shipped code). It remains open and unresolved.

### 1c. Project knowledge is stale

The `STATE.md` visible to Claude Chat still shows 4D/4E "NOT merged to main" and Module 5 "in spec-writing phase — no 5-series spec files written yet." Both false. Updating repo files does **not** refresh project knowledge. Both spec drafts carry a header noting they were written against stale inputs, and every M3/M5/6A column reference is marked _design-level — confirm against live schema at build._

---

## 2. Confirmed: sub-module breakdown 6A–6E

Maps 1:1 to `future_module_architecture.md` §7.

| Sub-module | §7 section |                     |
| ---------- | ---------- | ------------------- |
| 6A         | §7.1       | Time Tracking       |
| 6B         | §7.2       | Daily Logs          |
| 6C         | §7.3       | Safety Incidents    |
| 6D         | §7.4       | Material Deliveries |
| 6E         | §7.5       | Crew Briefings      |

- §7.6 photo markup is **not** a sub-module — M3 reuse, no build.
- Mileage + offline sync engine → **v2**. v1 is offline-**ready** only.
- **6D correction (Josh):** delivery check-in is **NOT** gated by project assignment. §7.4's "any assigned member" is wrong.
- 6A is the workflow-heavy sub-module and the first build target. 6B depends on it.

---

## 3. 6A — Time Tracking (interview complete, spec drafted)

### Five amendments to §7.1

1. **`time_clock_sessions.project_id` REMOVED.** The clock is pure payroll, independent of any project. This is what lets one paid day span two job sites without a second clock-in.
2. **`task_time_segments` → `time_segments`.** Gains `segment_type` and `project_id`; `task_id` becomes nullable. It no longer describes only task work.
3. **`time_clock_sessions.category` REMOVED.** Its five values split: `travel`/`drive`/`shop` became `segment_type` values; `overtime` is **derived**; `regular` alone is not an enum. This also resolves §7.1's open "category grain" question — the grain is _neither_, because OT is a property of **hours**, not of any row.
4. **`break_minutes` / `break_paid` REMOVED from the session.** A break is a `segment_type`. A session-level break number floats outside the segment chain and breaks the reconciliation invariant.
5. **Approval is HIERARCHICAL, not flat.** Reverses §7.1's "flat approval (any Foreman/Owner/Admin; PM excluded)" and largely **reverts** §7.9's "conscious divergence" entry back toward the committed `CLAUDE_MODULES.md` §6.1 chain. Moots §7.1's open self-approval question.

### Segment types (6) and field gating

| `segment_type` | `project_id` | `task_id` | note on end  | `completion`           |
| -------------- | ------------ | --------- | ------------ | ---------------------- |
| `work`         | required     | optional  | mandatory    | required iff `task_id` |
| `material_run` | required     | NULL      | mandatory    | NULL                   |
| `warranty`     | required     | NULL      | mandatory    | NULL                   |
| `travel`       | NULL         | NULL      | mandatory    | NULL                   |
| `shop`         | NULL         | NULL      | mandatory    | NULL                   |
| `break`        | NULL         | NULL      | **optional** | NULL                   |

- `material_run` = leave a job, get material, **return to the same job**; drive + store time both attribute to that job. Distinct from `travel` so "time getting material" is a query.
- `warranty` = callback to **any project, any status** (incl. `complete`/`archived`). Excluded from the active-budget rollup by **type**, not by project status.
- `completion` gates on **`task_id IS NOT NULL`**, not on `segment_type` — a `work` segment under verbal direction has no task.

### Workflow & invariants

- Clock-in **opens the first segment**; there is no clocked-in-with-no-segment state. Clock-out ends the open segment.
- Site change requires **no clock action** — new segment, same session.
- Segments are contiguous, non-overlapping, and **Σ segment durations = session duration**.
- **Paid hours = session duration − unpaid `break` segments.**
- Segment activity never alters paid hours.

### Approval

Hierarchy `Owner > Admin > PM > Foreman > Crew`. **Approve strictly below you. No self-approval. No peer approval.**

- Foreman→Crew · PM→Foreman,Crew · Admin→PM,Foreman,Crew · Owner→anyone
- **Owner has no timeclock** (closes the otherwise-unapprovable-Owner deadlock with no carve-out).
- Admin has a timeclock only when the company setting is ON; Admin's hours → **Owner only**, which falls out of the strictly-below rule.
- Approval is on the **session**, not the segment.

### Overtime — derived, never selected

Sum weekly **paid hours**; hours above the company threshold (default 40) are OT. `travel`, `shop`, and paid `break` hours **count toward** the threshold. Worked example Josh confirmed: 38.0 h on jobs + 2.5 h travel = 40.5 h → **0.5 h OT, triggered by drive time.** Never stored on a row; derived at read time.

### Trace status

**PROPOSED, UNVERIFIED.** Names ("Dave"), times (7:00–15:30), and jobs (Miller/Ortiz) are **invented**. Josh confirmed the _shape_ of the day, not the numbers. Break assumed **unpaid**. Must be traced against a real Bishop job before it is an acceptance example.

---

## 4. 6B — Daily Logs (interview mostly complete, spec drafted, **NOT build-ready**)

### Four amendments to §7.2

1. **"One per project per day" REMOVED.** Multiple logs per project-day. _(Josh: "there is no harm in having more than 1.")_ Consequence: creator-only-edit survives intact, and "highest ranking person on site writes it" reverts to a **Bishop convention**, not a system constraint — no rank gate.
2. **Crew present derives from `time_segments`, not clock-ins** (6A removed session `project_id`). Strictly better: excludes someone who clocked in and never touched this project.
3. **Hours derived, not typed.** Employee hours read-only from 6A. **Subcontractor hours + notes are manual** — subs run their own systems and won't clock in.
4. **"Materials delivered" is not a typed field** — 6D owns it; 6B renders it read-only.

### Content (from the interview, verbatim intent)

Safety concern/incident · what was accomplished · who was on site · material delivered · material used · material needed · equipment used + duration · tasks for tomorrow. Plus weather.

- **Weather is MANUAL.** Josh first said "input by the system," then reversed. Manual kills a new weather-API vendor, a job-site-address lookup, and an offline problem.
- **Equipment:** Josh first said "skip hours on a tool," then revised to keep a **free-text** field ("mini-ex, 3 hrs"). Structured hours + M8 tool FK is a deliberate later enhancement. Not parsed, not in job cost.
- **Material used/needed:** free text. Not M8 inventory.

### Safety split (locked, per recommendation)

Hazard checkbox + notes stay in the log. Anything that **actually happened** (injury, damage, near miss) escalates to a separate **6C** incident report — OSHA fields, auto-PDF, notification to Owner/Admin/PM/Foreman, company incident log. When `hazards_present` is ticked, the log surfaces a "File an incident report" action pre-filled with project + date.

**Failure mode this prevents:** _"Dave cut his hand"_ typed into daily-log free text notifies nobody and creates no OSHA record.

### Tables

`daily_logs` (no unique constraint on `project_id, log_date`) · `daily_log_crew` (junction, auto-filled, editable) · `daily_log_sub_entries` (manual sub hours).

### PDF

**One PDF per log.** Two logs, same project, same date → **two PDFs, same date** (Josh). Filename must disambiguate by author.

### ⛔ 6B has NO acceptance trace

Fields and rules were walked; **a real day's log was never traced end-to-end.** Per the interview-first mandate 6B is **not build-ready**. This is the same shape as the two Module 4 failures. Closing it was recommended and deferred.

---

## 5. Reversals of locked decisions this session

Recorded because each requires a doc rewrite, not a patch.

| Was locked                                     | Now                                        | Where      |
| ---------------------------------------------- | ------------------------------------------ | ---------- |
| Approval is **flat**; PM excluded              | Hierarchical, strictly-below, no self/peer | §7.1, §7.9 |
| Session carries `project_id`                   | Removed; attribution on segments           | §7.1       |
| `category` on session                          | Deleted; OT derived                        | §7.1       |
| `break_minutes`/`break_paid` on session        | Deleted; `break` is a segment type         | §7.1       |
| Daily log: **one per project per day**         | Multiple allowed                           | §7.2       |
| Crew present from **clock-ins**                | From `time_segments`                       | §7.2       |
| Delivery check-in by "any **assigned** member" | Any member; not assignment-gated           | §7.4       |
| "Supersedes the **committed** `time_entries`"  | Never committed — planning concept only    | §7.1       |

---

## 6. Company Settings — additions from Module 6

Land in the **batched** settings pass, not inside 6A/6B.

- **Overtime rules** — weekly threshold (default 40 h/wk); optional **daily** threshold (undecided)
- **GPS clock-in** — capture/enforce toggle, default **OFF**
- **Breaks paid/unpaid** — default **unpaid** (Bishop's real value never supplied)
- **Admin timeclock** — enable/disable, default **OFF** _(new this session)_

> **Legal flag, not a 6A decision.** Under FLSA, short rest breaks (<20 min) are generally **paid**; bona fide meal periods (30 min+, relieved of duty) are **unpaid**. A single company toggle may permit an unlawful setting. Consider splitting `break` into `rest`/`meal`. **Route to professional review** — do not settle this inside a spec.

---

## 7. Doc corrections owed (land with the specs)

- `future_module_architecture.md` §7.1 — five amendments; drop "committed `time_entries`"
- `future_module_architecture.md` §7.2 — four amendments
- `future_module_architecture.md` §7.4 — check-in not assignment-gated
- `future_module_architecture.md` §7.9 — rewrite the flat-approval divergence entry
- `CLAUDE_MODULES.md` §6.1, §6.2, §6.9 — mark superseded by §7 (same treatment §6.4 got for punch lists). §6.1's "when clocking in, crew picks which task" is contradicted by the real workflow.
- `STATE.md` — Module 6 row: NOT STARTED → spec-writing

---

## 8. Carry-forward from Session 62 (untouched this session)

- **Punch-gate latent defect** — `checkPunchGate` fails **open** on query error; `updateProject` is an ungated status-write path. Josh chose **Option 3** (fail-closed + neutralize `updateProject` + DB trigger). **Not implemented.** Note: the DB-trigger part reverses CLAUDE.md's "service-layer only by design" and needs a migration.
- **CO send 500** on throwaway env — deferred; retest against an env with the full key set before assuming a code bug.
- **No way to reverse a project out of `complete`** — flagged twice; design question.
- Punch item saved with `description = NULL`; punch items should be editable by their creator.

---

## 9. How to start Session 64

1. **First, resolve the branch hazard.** Run `git branch -vv` from repo root. Determine whether `feat/module-5` is pushed to a remote or exists only in the Codespace. Prod schema's only source is on that branch.
2. **Refresh project knowledge** — upload current `STATE.md`, `CLAUDE.md`, and `docs/specs/future_module_architecture.md` from the repo into the Claude project. The copies in project knowledge are provably stale.
3. **Review the two spec drafts** (`6A-spec.md`, `6B-spec.md`, in `/mnt/user-data/outputs/`). Read 6A §3 (amendments) and §5.2 (gating matrix) — Josh confirmed both. Read 6B §10 (missing trace).
4. **Close 6B's trace gap** — narrate one real Bishop daily log; Claude mirrors `input → store → output`; approve; it becomes the acceptance example.
5. **Verify 6A's trace** against a real Bishop day; replace the invented Dave/Miller/Ortiz numbers.
6. Then continue: **6C** (Safety Incidents) → **6D** (Material Deliveries, check-in **not** assignment-gated) → **6E** (Crew Briefings).
7. Commit specs + doc corrections in **path-scoped batches**, never `git add -A`.

**Do not build any Module 6 code until:** both traces are approved, `company_members` foundation is live, and the M5 merge situation is resolved.

---

## 10. Lessons

1. **The pickaxe is the right tool for "was this ever committed?"** `git grep` on a branch answers only that branch. `git log --all -S` answers the whole repo's history, including deleted code. Four narrower searches preceded the one that actually settled it.
2. **"Merged" is a claim.** `origin/main` is a **local cache ref** — it only moves on `git fetch`. A merge on GitHub is invisible locally until then. Here, even after fetching, the merge had not landed.
3. **Architecture docs drift exactly like context files.** §7.1 asserted a committed stub that never existed; §7.2's crew auto-fill silently depended on a column 6A deletes. Design authority ≠ ground truth.
4. **Interview-first caught four real design errors** that a guessed spec would have shipped: session-level `project_id` (can't span two job sites), `category` conflating activity with pay rate, session-level break columns (breaks the sum invariant), and a `project_id NOT NULL` on segments (can't hold travel).
5. **A "simpler" answer can reverse a locked decision.** "Just let everyone make a daily log" quietly killed one-per-project-per-day. Cheap to accept, but it must be _recorded_ as a reversal, not absorbed silently.
6. **Not every field belongs to the module you're specifying.** Hours → 6A. Deliveries → 6D. Inventory → M8. The daily log wanted all three; each would have been a second source of truth.

---

**End of context63.md.**
