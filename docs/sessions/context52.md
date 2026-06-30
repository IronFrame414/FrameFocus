# Session Closeout — Future-Module Architecture (M6) + Audit

> **Date:** June 28, 2026
> **Type:** Planning session — deliberately kept OUT of the repo (no code, no commits). Deliverable is the planning doc.
> **Artifact produced:** `FrameFocus_Future_Module_Architecture.md` (the design-authority planning doc).
> **Companion:** `CLAUDE_CODE_HANDOFF.md` (paste-ready prompt to propagate these decisions into the repo).

---

## What this session did

1. Located where M4 left off (4D/4E built on `feature/4d-revision`, unpushed).
2. Established a stronger planning method (interview-first + a required workflow walk-through) driven by two real M4 failures.
3. Ran an interview-first architecture pass on **Module 6 (Team & Field Operations)** and reconciled it against the committed design.
4. Surfaced a foundation-level decision (subcontractors as users) that reaches back into Modules 1 & 2.
5. Started a consolidated **Company Settings** additions list.
6. Audited every decision against the authoritative roadmap and repo docs; fixed one numbering error.

---

## Decisions made (status)

- **Interview-first mandate + §2a workflow walk-through** — adopted as process. No spec is written until the module interview is done and (for important parts) an approved `input → store → output` trace exists.
- **Module 6 time tracking — two-table model** (LOCKED): `time_clock_sessions` (paid hours, payroll truth) + `task_time_segments` (cost allocation; ends with complete/incomplete + mandatory note; completion writes task status to M5). Flat approval (any Foreman/Owner/Admin; PM excluded). Categories, configurable OT, optional GPS, simple breaks — all build-now. QuickBooks: schema-ready now, connector in M7. Mileage and the offline sync engine → v2 (v1 is offline-*ready*).
- **Module 6 other areas** (LOCKED): daily logs (1/project/day, any author, crew auto-fills from clock-ins, only-creator-edits, never locks), safety incident reporting, material deliveries, crew briefing, photo markup (reuse M3).
- **FOUNDATION — `company_members` (subs as users)** (DECIDED, deferred build): a subcontractor is an assignable identity from creation; login optional via existing invite flow. All assignment references `member_id` (no polymorphism). **Must be implemented before Module 5/5A builds.**
- **M5 amendment**: assignment targets change from `profile_id` to `member_id`; the punch-close-before-complete gate folds into M5's project-complete logic.
- **Punch lists** belong to **Module 5** (the M5 architecture doc is the authority); the M6 punch-list entries in the roadmap and `CLAUDE_MODULES.md` are stale.

## Process lessons adopted (from M4)

1. A setting with no control is a bug. 2. Conditional output needs a worked trace. 3. Name cross-module contracts early. 4. Spec-file hygiene enforced. 5. No silent design decisions. 6. "Correct to spec" ≠ "correct" — important parts need the §2a walk-through.

## Audit results

- **Fixed:** module numbering — **M10 = Reporting & Analytics, M11 = AI Marketing & Social** (11 modules). M7 = Job Finances confirmed.
- **Surfaced:** Pre-Module 9 Decision Gate is a live product fork (hosted portal vs. magic-link + webhook; potential M12). Design alongside the sub-invite mechanism.
- **Flagged:** four conscious divergences from the roadmap (flat approval, offline→v2, mileage→v2, punch→M5) recorded so they aren't mistaken for drift.
- **Caveat:** verified against design docs (roadmap, CLAUDE.md, CLAUDE_MODULES.md, STATE.md, M5 doc) — NOT against live migrations. Live-schema specifics (exact column names, full M4 settings list) still need a migration-level check.

---

## Carryover / open items

**Before Module 5 builds:** implement the `company_members` foundation + `subcontractor` role (M1/M2) + `get_my_member_id()`; M5 assignment → `member_id`.

**Module 4 finish-out (from prior sessions):** confirm the lump-sum vs. detailed output on test; push `feature/4d-revision`; set Vercel env vars; configure Resend webhook; verify the `proposal_pricing_level` control; spec-file path cleanup; re-run M5 "Group B" greps vs. the new line model.

**Doc propagation:** run `CLAUDE_CODE_HANDOFF.md` to update CLAUDE_MODULES.md, the M5 architecture doc, CLAUDE.md, STATE.md, and create the new docs (M6 architecture, company_members foundation, company-settings list, lessons).

---

## How to start the next session

1. Open a new Claude Chat in the FrameFocus project; attach the planning doc as context.
2. First, run the **doc-propagation handoff** (`CLAUDE_CODE_HANDOFF.md`) so the repo reflects this session's decisions, then commit (separately from code).
3. **Next architecture target: Module 7 (Job Finances)** — interview-first, same method as M6. It consumes M6 time entries + M8 material costs and owns the QuickBooks connector.
4. Keep using the planning doc's §10 checklist as the running to-do.