# Context — Session 53 (June 30, 2026)

**Goal:** Prep for Module 5 spec-writing — settle the assignment-identity question, lock M5 scope, and get the M5 architecture doc reconciled and committed so the 5-series specs can be written against a trustworthy authority.

**Outcome:** ✅ Identity question resolved (it was a real recorded decision, not drift). M5 launch + post-launch scope locked. The M5 architecture doc was amended (identity + scope) and committed as its **first commit** at `7eaaaa3`. The 5A conversion walk-through was completed and its trace approved as the 5A acceptance example. **No code, no migrations** — planning/spec-prep only. No spec files written yet.

---

## What happened this session

A planning session, not a build session. One file touched in the repo (the M5 architecture doc), one commit. Most of the work was decisions, captured below so the next session can write specs without re-litigating them.

### 1. Assignment identity — investigated, confirmed REAL (not drift)

Two sources disagreed on how assignable people are modeled:

- `docs/specs/module5-architecture.md` modeled every assignment with `profile_id` / `assignee_id` → `profiles(id)`.
- A separate instruction said assignment should use `member_id` → a new `company_members` table (one assignable identity for crew + subs), built as a pre-M5 foundation.

CC ran a read-only git investigation. Verdict:

- The `member_id` / `company_members` direction is a **recorded decision**, living in `docs/Framefocus future module architecture.md` §5.1 ("FOUNDATION — Subcontractor-as-user (`company_members`) — DECIDED, deferred implementation") and §5.2 (M5 assignment targets → `member_id`, RLS via `get_my_member_id()`, backfill one member per profile).
- That same planning doc carries an **unchecked** checklist item: "Amend the M5 architecture doc: assignment targets → `member_id`." The amendment was never applied — which is exactly why the M5 doc still said `profiles(id)`.
- **Nothing was committed and there is no schema:** at investigation time both docs were untracked, there is no `company_members` migration, and `profiles` is still the only person table.

**Conclusion:** real, articulated design decision — not session drift — but ungrounded in committed git/schema until built. Resolved by amending the M5 doc (below). `company_members` itself remains a **pre-M5 foundation that must be built before any 5-series build.**

### 2. Identity edit applied to the M5 doc (via CC)

All seven assignment FKs swapped `profiles(id)` → `company_members(id)`:

- `project_assignments.profile_id` → `member_id` (+ `UNIQUE (project_id, member_id)`)
- `tasks.assignee_id`, `schedule_entries.profile_id` → `member_id`, `punch_list_items.assignee_id` / `verified_by`, `change_orders.approved_by`, `change_order_approvals.approver_id`

A "Identity & assignment convention (amended)" foundation note was inserted near the top, declaring `company_members` the single assignable identity, a pre-M5 external dependency of every 5-series spec, RLS via `get_my_member_id()`, and that it supersedes the inline `profiles(id)` refs in §5.2b/§5.4a/§5.5a/§5.9a/§5.7. The Q-N6 `profiles.schedule_color` note was deliberately left untouched (see open items). Verified: `REFERENCES profiles(id)` → zero hits.

### 3. M5 scope — locked

**Launch (5A–5E):**

- **5A — Projects & Conversion** — projects table, numbering, status lifecycle (incl. punch-close gate, Amendment #2), `convert_estimate_to_project()` RPC, team assignment, Files-tab wiring, budget baseline, **+ client contract record, + subcontractor contract record, + project contacts**
- **5B — Tasks & Scheduling** — tasks, dependencies, schedule, Gantt, calendar, **+ phases/stages, + inspections (calendar-surfaced)**
- **5C — Punch Lists**
- **5D — Change Orders**
- **5E — Project Budget View**

**Post-launch — specced now, built later (5F–5H):**

- **5F — Project Templates** — saved phase+task structure stamped onto a new project
- **5G — Closeout & Warranty** — closeout checklist + warranty start/period at completion (final payment / lien release = M7)
- **5H — Activity Log** — chronological project history feed

**Moved to Module 7:** expense tracking and the **subcontractor draw schedule**. The draw schedule is **net-new M7 design** (it isn't in any doc yet). Pattern: client side and sub side are structured identically — **contract record in M5/5A, money (draws/payments) in M7.** Both contract records and the draw schedule are **consumers of `company_members`.**

### 4. Scope amendment applied to the M5 doc (via CC)

Added §5.0 in-scope bullets (contracts, project contacts, phases/stages, inspections); appended 5A/5B cells and added 5F/5G/5H rows (tagged _post-launch — design-ready, build deferred_) to the sub-module table; inserted described subsections **§5.2d Contracts**, **§5.2e Project contacts**, **§5.4c Phases/stages**, **§5.5d Inspections** (descriptions only — full schemas deferred to each sub-module spec, consistent with how §5.2c/§5.8 are written); added a §5.11 post-launch build-order note; logged **Q-N9–Q-N12** in §5.12.

### 5. 5A conversion walk-through — completed, trace approved (the 5A acceptance example)

Real job. Estimate `EST-0001` signed at **$17,636**, fixed price. Client signed but requested a change → user chose **Update Estimate** (the post-signature prompt offers **Update Estimate** / **Convert to Project**) → removed a **$1,000** item, added a **$600** item → re-totaled to **$17,236** → resent → clean re-sign → **Convert to Project**.

Conversion writes (single `convert_estimate_to_project()` txn):

- `projects`: `project_number` **PRJ-0001** (copied from EST-0001), `project_internal_seq` 1, `name`, `contact_id`, `contact_address_id`, `source_estimate_id` → EST-0001, `project_type` `fixed_price`, `status` `active`, `contract_value` **17236.00**, tax/markups/scope/terms/notes carried
- `estimates.project_id` → new project (the FK 4C reserved); `estimates.status` → `converted`
- `project_budget_items`: **one row per FINAL line item**, `budgeted_amount` from estimate, `committed_amount`/`actual_amount` = 0 (M7 fills), `source_line_item_id` → its estimate line
- Module 3 project folders auto-created; `project_assignments` keyed on `member_id`

**Note for the spec:** the added $600 line has **no** `source_line_item_id` — the budget baseline mirrors the **final** (post-revise) estimate, not the originally-signed one. Correct behavior; state it explicitly in 5A.

---

## Commits this session

- `7eaaaa3` — `Module 5 architecture: company_members identity + launch/post-launch scope amendments` — `docs/specs/module5-architecture.md`, **1 file changed, 592 insertions**, `create mode 100644` (the file's first commit; it had never been tracked before).

---

## Process lesson (recorded honestly so it doesn't recur)

**"HEAD is correct" ≠ "the file is committed."** Two sequential CC doc edits (identity, then scope) both rode on an **untracked** working-tree file. After the first edit, "HEAD is correct" was mistaken for "the identity edit is committed," and the second edit was stacked on top of uncommitted changes. CC's `git status` on the second pass caught it (`??` untracked). No harm — both edits were additive and clean, and one combined commit (`7eaaaa3`) captured everything. But the gate ("commit edit A before edit B touches the same file") only works if the commit is actually verified.

**Going forward:** after any CC edit that is meant to be committed, confirm with `git log --oneline -1` (and `git status --short`) — and paste it — _before_ stacking another edit on the same file. A clean tree and a moved HEAD are the proof; an assertion that "HEAD is correct" is not.

---

## Open build-time questions (resolve in the relevant sub-module spec — recs are accept-or-override defaults)

**5A:**

- **Q-N1** — project public number: shared estimate sequence vs. parallel. _Rec: shared._
- **Q-N2** — project RLS PM visibility: all projects vs. own/assigned. _Rec: all internal roles see all; Crew sees assigned only._
- **Q-N3** — estimate status after conversion: keep `accepted` vs. add `converted`. _Rec: add `converted`._
- **Q-N9** — client contract: fields on `projects` vs. own table. _Rec: own table (allows re-issue/versioning)._
- **Q-N10** — subcontractor contract ↔ M7 draw schedule: which FKs which; confirm keys on `company_members`. _Rec: contract record in 5A, draw schedule FKs to it in M7._
- **Q-N11** — project contacts: add a `type`/`category` to Module 2 `contacts` so external parties don't surface as leads. _Rec: yes; confirm against live contacts schema._

**5B:**

- **Q-N4** — task dependency cycle prevention: DB vs. service layer. _Rec: service layer at launch._
- **Q-N5** — dated tasks on calendar: duplicate into `schedule_entries` vs. UNION (entries holds only `general`). _Rec: UNION — biggest 5B modeling call._
- **Q-N6** — per-person schedule color: doc currently recommends `profiles.schedule_color`. **Now that identity is `company_members`, this likely belongs on `company_members`, not `profiles` — settle at 5B.**
- **Q-N12** — dated inspections on calendar: fold into the Q-N5 UNION vs. separate source. _Rec: fold into the UNION._

**5C:** Q-N8 — punch verification authority. _Rec: Foreman/PM/Owner/Admin._
**5D:** Q-N7 — approved CO budget impact at launch: apply to `contract_value` now vs. display-only until M7. _Rec: display-only._

---

## Must verify against LIVE git when CC is available (do not assume — the in-chat snapshot is stale)

- **M4 amendments triggered by 5A (§5.13):** `estimates.project_id` gains FK → `projects(id)`; `next_estimate_number()` widens 3-digit → 4-digit `lpad`; estimate status enum gains `converted`. Confirm current shipped 4C state before specifying these.
- **Revise mechanic** — "Update Estimate" on an `accepted`/frozen estimate. M4 estimate **versioning was deferred (4G)**, so confirm how editing a signed estimate actually works in shipped 4C/4F **before the 5A spec relies on it.** This is the fuzziest piece of the conversion flow.
- **`company_members` PK name** (`id` vs `member_id`) when that foundation is designed — the doc's FKs target `company_members(id)` but the planning doc described the key as `member_id`; the foundation note already hedges "reconcile at build."
- **Live contacts schema** for Q-N11 (project-contacts `type`/`category`).

---

## Hard dependency (blocks all 5-series builds, not the specs)

`company_members` is a **pre-Module-5 foundation**: not yet built, **no migration exists**, `profiles` is still the only person table. Every 5-series spec must note `company_members(member_id/id)` as an external dependency. The foundation must be built **before any 5-series build** (its own separate job — do not build it during spec-writing).

---

## Still pending (not done this session)

- **STATE.md closeout** — STATE.md still shows Module 5 ⚪ NOT STARTED and was **not** updated this session. It should be updated to reflect: Module 5 = spec-writing in progress; `module5-architecture.md` committed (`7eaaaa3`); identity + scope locked.

---

## How to start Session 54

1. Open the Codespace, `git pull`, `bash scripts/session-start.sh`.
2. Open a **fresh** Claude Chat (FrameFocus project; CLAUDE.md / STATE.md / CLAUDE_MODULES.md / Quick Reference loaded). Paste this `context53.md`.
3. **Goal: write the 5A spec first** (`docs/specs/5A-spec.md`, kebab-case, no nested path; `ls` to verify after creating). Specs only — no code/migrations.
4. **Read first (git is ground truth):** `docs/specs/module5-architecture.md` at `7eaaaa3` — it already reflects the `company_members(id)` identity convention and the full launch + post-launch scope. Every 5-series spec derives from and cites it by section.
5. Use the **5A conversion trace above** as the acceptance example. Resolve the 5A open questions (Q-N1, Q-N2, Q-N3, Q-N9, Q-N10, Q-N11) using the recs as accept-or-override defaults before finalizing.
6. **Before the 5A spec relies on them,** have CC verify the M4 amendments and the revise mechanic against live git (see "Must verify" above).
7. Write specs to the **amended** design: assignment = `member_id` → `company_members(id)`; note `company_members` as an external dependency in each affected spec; do **not** build it.
8. Process: one sub-module at a time, sequential approval gates, no bundling, interview-first for important parts, flag any spec↔schema conflict for explicit decision. Suggested spec order after 5A: 5E, 5B, 5C, 5D, then post-launch 5F/5G/5H.
9. Consider folding the **STATE.md closeout** (above) into this session.

— End of context53 —
