# S122 — Report — Critical Path, plus the S121 cleanup

Session prompt: `docs/sessions/S122-prompt-v2.md`. Spec: `docs/specs/S122-SPEC.md` (committed `95555da8`).
Branch: `feature/s122-critical-path`.

## Phase 2: questions and plan (posted 2026-09-30). **APPROVED by Josh 2026-09-30, all A; see 2.4.**

Every fact below is from Phase 1 (further down this file), measured on `origin/main` `4785835c`, on
PRODUCTION `jwkcknyuyvcwcdeskrmz` (read-only), or on rebuild-test, as each line says.

### 2.0: Settled, restated, not re-asked

⚠️ **`claude/critical-path-rulings.md` and `claude/next-builds.md` do not exist.** They are not in the
repo on `4785835c` and not on disk. The rulings below are restated from the prompt and the spec.

**Critical Path (13):**
1. Hybrid per-task anchoring: after X, on a date, or after X but not before a date.
2. The working calendar lives in company settings.
3. Inspections are dependency targets.
4. Lead time is its own task.
5. No baseline; a finish-date history instead.
6. Templates.
7. A foreman's edit needs approval, and a pending edit does not move the date.
8. The client sees phases and task titles with a required disclaimer, and never float.
9. Weather days carry a selectable icon.
10. A task may have both a dependency and a date constraint.
11. Notification is chosen per line and per assignee: in-app for account holders, email for those without an account.
12. A client-notification checkbox at setup.
13. Remaining time is entered, never derived from `percent_complete`.

**Part 0-B:** delete staletimes (reason archived). The photo back link uses a validated `from`.
**Not in this build:** Timesheets → QuickBooks and the re-push; the CI concurrency fix.

### 2.1: The questions

**Q1. [ASK-1] An in-progress task's remaining time is entered, not derived. How is it entered, and what
sits beside it?**
Options:
- A) In the §3 line sheet, when a task is In progress: a whole-number **"Working days left"** field.
  Saving it stamps **"as of <today>"**. Beside it, read-only: **"40% complete: shown for reference,
  not used for dates."** When the status becomes In progress, the sheet asks for days left, **blank,
  never pre-filled** (a pre-fill from percent or from elapsed time would be a derivation). Until one is
  entered, the engine keeps the planned finish and labels it **"Days left not entered: using the
  planned finish."** Engine finish = the later of (as-of date + days left) and today. If that date has
  passed and the task is still open, it shows **"Days left is out of date"**.
- B) The same field without the as-of stamp, so the engine counts from today every time. Simpler, but a
  figure entered last week silently slides forward a day each day it is not updated.
- C) A finish-date picker instead of a day count.
My recommendation: **A**. The as-of stamp is what stops a stale entry lying quietly, and the blank field
is the only way to guarantee nothing is derived from the percentage.

**Q2. [ASK-2] Part 0-B-6, mobile Settings shows "Owner crew". Label both fields, or drop
`member_type`?**
Options:
- A) **Drop `member_type` from Settings.** `e2e/m-destinations.spec.ts:736` (which asserts it renders)
  is inverted in place, with the superseded assertion quoted.
- B) Label both: `Role: Owner` / `On the roster as: Crew`.
My recommendation: **A**. On every row it is either redundant (a sub's role is already "Subcontractor",
a crew member's role is already "Crew member") or misleading (every owner, admin, PM and foreman reads
"crew"). The block exists to answer "am I still me?", and the role answers that. Team keeps it for
filtering.

**Q3. [ASK-3] The member count came back different. No decision needed, but confirm §6 stands.**
On PRODUCTION: **4 of 10** live members have no `profile_id`, not "most". Reachability by
`resolveMemberReachability`'s own logic: **profile 6, email-only 3, unreachable 1**. The "majority"
figure is rebuild-test's (640 of 648, which are fixtures). The other five corrections all came back
**confirmed**.
Options:
- A) §6 stands as ruled: in-app for account holders, email for the rest, and the unreachable one reported to the saver.
- B) Change §6.
My recommendation: **A**. The ruling is right; only its "almost nobody has a login" framing was
rebuild-test's.

**Q4. [ASK-4] Part 0-B-4, the session clock edit, cannot match the week sheet without a migration,
and 0-B is meant to have none. How do we ship it?**
Why it needs one: the week sheet reopens an approved day **inside the same database call** and audits
an Owner/Admin's own edit under a transaction flag that **only a DB function can set**. The old day
page (`timesheets/[sessionId]/day-detail-client.tsx`, direct-URL only) does a plain client UPDATE.
Nothing reopens the day, and an owner's edit to their own session is not audited.
Options:
- A) **Split 0-B-4 into its own section, merged on its own right after 0-B, before 0-C.** One
  migration, `20262122000000_s122_session_clock_edit`:
  - **(i)** A BEFORE UPDATE trigger on `time_clock_sessions`: when `clock_in` or `clock_out` changes on
    an `approved` session, it sets `pending` and clears `approved_by` / `approved_at`. It holds on
    every path that writes, including a direct API call.
  - **(ii)** An RPC, `edit_time_session_clock(session, clock_in, clock_out)`, that sets the audit flag
    and returns `returned_to_pending`.
  - The old page's session edit calls (ii), and its Owner/Admin **segment-time** edit is re-routed
    to the **existing** `edit_time_segment`, which already carries the overlap check, the completion
    gate, the reopen and the audit. **One mechanism, not two.**
  - The hours-changed pop-up with Approve is copied from the week sheet's component, not re-implemented.
  - Negative tests per excluded role, a total map, and sabotages on (i) and (ii).
- B) No migration: send `status: 'pending'` in the same client UPDATE. A direct API call skips it, so
  the rule lives in the UI. It also cannot produce the own-edit audit row.
- C) Retire the old page's edit controls (read-only, pointing to the week sheet).
My recommendation: **A**. B is the divergence written as agreement. C removes a supervisor's only way
to fix a subordinate's clock-out (the week sheet edits segments only, Owner/Admin only), which is an
authority change (Q5).

**Q5. [ASK-5] Part 0-B-4, payroll authority. Today a PM or foreman can correct a subordinate's
clock-in/out** (`can_approve_member`: strictly higher rank, never self), **including on an already
approved day, and it stays approved.** The week sheet is Owner/Admin only. After the fix, what may a
supervisor do?
Options:
- A) **Keep a supervisor's existing clock correction.** The edit now reopens the day and is audited;
  if the supervisor may approve that member, the pop-up's Approve lets them re-approve. No authority is
  added or removed.
- B) Narrow clock correction to Owner/Admin, matching the week sheet.
My recommendation: **A**. It closes the defect (an approved day meaning other hours than it approved)
without changing who may do what. B removes a power the field uses today. **Stop rule 3: I build
neither without your answer.**

**Q6. [ASK-6] Part 0-B-5, the photo markup back link. `lib/safe-next.ts` does not do what the spec
says.** It accepts **any** same-origin path (it rejects only non-`/`, `//` and `/\`). It does not check a
known set of destinations.
Options:
- A) `from` is a **token, not a path**: `?from=photos` or `?from=files`. The page builds the link itself
  from its own project id: Photos → `/dashboard/projects/<id>/photos`; Files, missing or anything else →
  `/dashboard/projects/<id>/files`. The user supplies no path at all, so there is nothing for
  `safeNextPath` to validate and no second validator is written. The page's three `← Back to files`
  links **and** its delete button (hard-coded to Photos today, `delete-photo-button.tsx:36`) follow
  `from`.
- B) `from` is a path, through `safeNextPath` plus a prefix check against this project's two pages.
My recommendation: **A**. A literal known set is what the ruling asks for, and a token cannot be an
open redirect. B needs a second check bolted onto `safeNextPath`, which is the divergence the spec warns
about.

**Q7. [ASK-7] Part 0-C. The database does NOT refuse a per-line over-bill.**
`enforce_contract_billing_ceiling()` compares the **contract total** only (`v_others + NEW.billed_amount
> v_contract`, fixed-price projects only). No DB function reads `source_estimate_line_item_id`. A typed
$50,000 on a $42,763 line is accepted whenever the contract as a whole has headroom. The percentage path
could never exceed a line's remaining; a typed amount can.
Options:
- A) **Add a per-line ceiling in the database**: migration `20262123000000_s122_line_item_billing_ceiling`,
  a BEFORE INSERT/UPDATE trigger that refuses Σ live billed on a line item > its sell
  (`total_price_override`, else `total_price`) and names the line. **Pre-check on production first**:
  0 existing lines over their item's sell, **or it stops** (stop rule 2 shape). Plus the UI cap.
- B) UI cap only.
My recommendation: **A**. The cap is computed under the caller's RLS, so a PM (who sees only invoices
they authored) can be shown a remaining that is too high. The database is what holds when the UI is
wrong. **This makes 0-C a migration-bearing part.**

**Q8. [ASK-8] Stop rule 2 and new columns.** §1-A adds `tasks.duration_days`, nullable. Every existing
row is NULL, so a CHECK like `duration_days IS NULL OR duration_days BETWEEN 1 AND 3650` **cannot reject
any existing row**. It is still, literally, a constraint added to a table with production rows (6).
Options:
- A) **Allow CHECKs on columns added in the same migration**, each with a pre-check stated (0 non-null
  values before, because the column is new). A CHECK on an existing column still stops.
- B) No constraints at all; validation only in the RPC and Zod.
My recommendation: **A**. B puts the rule only in code that a direct API call skips.

**Q9. [ASK-9] Where do computed dates live?** Float and critical flags are computed at read, never
stored (ruled). But S121's calendar, the Gantt, the `/m` day column and `client_schedule()` all read
`tasks.start_date` / `due_date`.
Options:
- A) **Write-through.** On a Critical-Path-enabled project, every **applied** change (an edit, an
  approval, a weather day, a calendar change, a stamp) runs the one TS engine and writes each task's
  computed start/finish into `start_date` / `due_date`, in the same request that logs the finish
  history. Float stays computed at read. A pending edit applies nothing, so it moves nothing.
- B) Compute dates at read everywhere. Every calendar reader would call the engine, and
  `client_schedule()` (SQL) could not.
My recommendation: **A**. One stored answer is what keeps every surface agreeing (PARITY), and it lets
the client's narrowed read stay in SQL.

**Q10. [ASK-10] Inspections as dependency targets.** `task_dependencies` FKs point at `tasks(id)` only.
Options:
- A) **An inspection joins the network as a task row**, with a new `tasks.inspection_id` (unique among
  live rows). The task is its schedule node (1 working day by default, both a predecessor and a
  successor). The `inspections` row keeps the result, the inspector and the permit, and its
  `scheduled_date` is written from the node by the same write-through. The cycle guard and FKs cover it
  with no new code.
- B) A second target column on `task_dependencies` (`predecessor_inspection_id`, exactly one of two).
  Every graph reader, the DFS and the engine would learn two node kinds.
My recommendation: **A**. Ruling 10's own example is an inspection that *waits on* drywall, so an inspection is a
full node, not only a target. Production has **0** inspections and **0** dependencies, so nothing needs
migrating.

**Q11. [ASK-11] Two dependency defects Phase 1 found. Fix them in Part 1?**
- **(a)** Cycle prevention is service-layer only, and **it is not in `TECH_DEBT.md`** as the spec
  claims; `5B-spec.md:81` only says it would be filed "if wanted later".
- **(b)** `task_dependencies_pair_key` is a **non-partial** UNIQUE while deletes are soft, so removing a
  dependency and re-adding it returns "That dependency already exists."
Options:
- A) **Fix both in Part 1's migration**: a cycle-refusing trigger (a bounded recursive CTE) on
  `task_dependencies` INSERT/UPDATE, and the pair key replaced by a partial unique index over live rows.
  Pre-check on production: 0 dependency rows, so 0 cycles.
- B) Leave both: file (a) as tech debt, fix (b) separately.
My recommendation: **A**. The engine still reports a cycle rather than trusting either guard (stop
rule 11).

**Q12. [ASK-12] Who may move dates on a Critical-Path-enabled project?** Today a **foreman** (and S121's
calendar drag) **and any crew assignee** can write `tasks.start_date` / `due_date` directly (the
`is_task_assignee` UPDATE arm). If that stays, a foreman's "submission" can be bypassed with one drag.
Options:
- A) On a CP-enabled project, a DB trigger lets only **Owner/Admin/PM and the project's PE** change
  the schedule columns (dates, duration, days left, anchor). A foreman's change becomes a pending
  submission on every surface (S121's calendar drag included). Crew keep status, percent and
  completion. Projects **without** CP keep S121's rules unchanged.
- B) Guard only the new columns (duration, days left, anchor) and leave date drags as they are.
My recommendation: **A**, with the PE editing freely like the PM (S121 5-F already treats the PE as
schedule authority). B leaves stop rule 9's bypass open.

**Q13. [ASK-13] The per-assignee "notify of changes" default.** A new column
`task_assignees.notify_changes`; production has 3 existing rows.
Options:
- A) **Default off** (existing rows become false). The checkbox sits beside each name in the sheet.
- B) Default on.
My recommendation: **A**. "Chosen per line per assignee" reads as a deliberate act, and default-on
would email subs about schedules they were never told to watch.

**Q14. [ASK-14] Stamping a template onto a project that already has tasks.**
Options:
- A) **Refuse**, and say why: "This project already has N tasks; stamping would mix two plans. Stamp
  onto a project with no tasks."
- B) Append the template as new phases, unlinked from the existing tasks.
My recommendation: **A**. Nothing merges silently, and B produces a network the engine would call
disconnected everywhere.

**Q15. [ASK-15] Existing tasks with typed dates and no duration** (production 4, rebuild-test 6). They
stay null, never backfilled. How does the engine treat them until someone enters a duration?
Options:
- A) **A fixed span on its typed dates**, labelled "Duration not set: using the dates typed on this
  task". Successors can move; it cannot. A task with one or no date is listed under **"Needs a
  duration"** and left out of the network. Its successors are flagged "waits on a task with no
  duration".
- B) Leave every no-duration task out until a duration is entered.
My recommendation: **A**. A task stays where the user put it, with no working-day count invented.
Opening one prompts for its duration (§1-A).

**Q16. [ASK-16] The default working calendar for a company that never set one.**
Options:
- A) **Monday–Friday, no holidays**, with a banner on the Critical Path tab: "Using the default Mon–Fri
  calendar with no holidays. Set yours in Company settings." Owner/Admin edit it (company settings rule).
- B) Monday–Saturday.
- C) Refuse to compute until a calendar is set.
My recommendation: **A**. It is never silently seven days, and the banner says it is a default.

**Q17. [ASK-17] Road.** This plan is ten shippable sections, and each part ships whole or not at all.
Realistically this session lands 0-B, 0-B-4, 0-C and Parts 1–2 (schema and engine, with no screen yet).
Parts 3–5 land if the road holds; 6–9 are likely next session.
Options:
- A) Keep the order (0-B, 0-B-4, 0-C, then 1 → 9) and stop wherever the road ends, with a written state.
- B) Reorder.
My recommendation: **A**. Parts 1 and 2 merge with no visible change, which is safe on production, and
every later part needs them.

**Q18. [ASK-18] Who reads the finish-date history?** The spec says Owner/Admin/PM.
Options:
- A) Owner/Admin on every project; a PM on projects they are assigned to (`can_view_project`); the PE on
  their projects. Nobody writes except the server's service role.
- B) Every PM, company-wide.
My recommendation: **A**. It matches every other project-scoped read.

### 2.2: The build plan, for approval

**CI sequencing (1.7), for every part:**
- Docs commits carry `[skip ci]`.
- Before any commit that starts a run: `gh run list --status in_progress` and `--status queued` both
  **0 rows**, stated.
- After every merge to `main`, **wait for `main`'s run to finish** before the next branch run.
- A red that overlapped a `main` run is logged as a suspected collision and re-run alone.
- Stacks at most two deep, never mixing migration and non-migration work.
- The pre-CI check before every CI request: type-check, lint and unit, each exit code read on its own line.

**Production, for every migration:** one per section. The dry run lists exactly one file. Verified by
object with every expected value stated. Relinked to rebuild-test and read back.

| # | part | what I build | migration(s) | what could go wrong → stop rule | size |
| --- | --- | --- | --- | --- | --- |
| 1 | **0-B** | 0-B-1 deletes the five branches, each re-proved just before (content-on-main by blob and by added line, with a control), tips archived in `docs/branch-archive-2026-09-27.md` with the staletimes reason verbatim. 0-B-2 deletes `scroll-to-today.tsx` (0 importers, re-proved). 0-B-3 regenerates `.db-expected.json` locally with before/after counts (gitignored, nothing to merge). 0-B-5 adds the `from` token (Q6). 0-B-6 drops `member_type` (Q2), inverting `m-destinations:736` in place. One CI run, one merge. | none | a branch whose content is not on `main` → not deleted, reported | S |
| 2 | **0-B-4** (payroll) | Q4-A / Q5-A: the reopen trigger, the `edit_time_session_clock` RPC, and the old page re-routed through it and through `edit_time_segment`; the pop-up reused. Total-map live tests over every role × both writes, judged by the service role, writes without returning rows; a sabotage per negative. The completion gate kept (it is `edit_time_segment`'s). | `20262122000000_s122_session_clock_edit` | an authority change → **3**; a verification mismatch → **1** | M |
| 3 | **0-C** (money) | A per-line dollar input in THIS INVOICE, parsed to **integer cents** (a pure shared parser: `$`, commas and ≤2 decimals accepted, anything else refused with a message, never truncated). The typed value **pins** the line (marked, with Release). The percentage is labelled "applies to unpinned lines", sets only unpinned lines, and **refuses** an out-of-range value instead of coercing it to 100. A typed amount above remaining is refused before submit, naming the remaining. The discount's condition becomes "every line selected AND each at its full remaining"; the discount stays last; writes stay one at a time. The pin logic is a pure reducer with unit tests, **the load-bearing one being bulk-after-pin: pin survives**, sabotaged red. Live: a partial bill leaves the remainder for a second invoice, with dollar totals and row counts on every arm. Q7-A adds the per-line DB ceiling. | `20262123000000_s122_line_item_billing_ceiling` (Q7-A) | a production line already over its sell → **2**; Floor weakened → **4** | M |
| 4 | **Part 1**: schema | `tasks`: `duration_days`, `days_left` + `days_left_as_of`, `start_constraint` (`fixed` \| `not_before`) + `constraint_date`, `inspection_id`, all nullable, no backfill (4 production rows with both dates **stay null**, stated). `task_dependencies`: the cycle trigger and partial pair key (Q11). New tables, each with company_id, RLS, defaults and triggers per CLAUDE.md: `company_work_calendars` (Mon–Fri default), `company_holidays`, `project_lost_days` (a reason NOT NULL; icon ∈ rain, lightning, snow, wind, heat), `project_schedule_settings` (`critical_path_enabled`, `notify_client`), `project_finish_history` (append-only; SELECT per Q18; no insert policy, so only the service role writes). The Q12 guard trigger. Types regenerated. | `…24_s122_cp_task_fields`; `…25_s122_cp_calendar_weather`; `…26_s122_cp_settings_history`, one production section each | a constraint over existing rows → **2**; a backfill → **10** | L |
| 5 | **Part 2**: engine | Pure TS in `packages/shared/utils/critical-path.ts`, one implementation for server reads and the client's slip simulator. **Kahn's topological sort** (iterative, O(V+E), no recursion). Forward pass → ES/EF; backward → LS/LF; total float = LS − ES in working days; critical = 0. Working-day arithmetic with the calendar + holidays + lost days, and **every day-walk bounded** (a calendar with 0 working days is refused before any loop). FS/SS/FF/SF honoured. **The five cases:** (1) **no duration**: Q15-A, a fixed span, or excluded and listed, never zero-length; (2) **cycle**: the nodes Kahn cannot drain are returned as `cycle: [ids in order]`, the headline reads "Schedule cannot be computed: A → B → C → A", and nothing loops; (3) **disconnected**: starts at the project start (else today), labelled "not linked to anything", float against the project finish; (4) **in progress**: ES = its actual start; EF = the later of `days_left_as_of + days_left` and today (Q1-A); `percent_complete` never read, and complete tasks are fixed at their actuals; (5) **fixed date before a predecessor's finish**: the task keeps its fixed date, and the dependency is flagged violated with the gap in working days in the headline's conflict count and on the task. Not silently picked: shown. Unit tests are hand-worked, each task's float stated: a chain; a **diamond** (A→B5→D, A→C3→D: B critical, C float 2); Fri + 3 = Tue; a holiday; a lost day skipping in-progress work; each of the five cases; and a 2-cycle, a 3-cycle and a cycle beside an acyclic part (**must return, not hang**, under a test timeout). No merge of the engine without them. | none | a hang → **11** | M |
| 6 | **Part 3**: line sheet | A sheet from a task line: title, duration, anchor, phase, status, percent, days left (Q1-A), assignees via **`set_task_assignees`** (never `assignee_id`), a notify checkbox per assignee (Q13). Every change previews "this moves the finish to <date>" from the engine before saving. Saves go to a server route that authorises as the user, writes, runs the engine, writes through dates (Q9) and logs history. | `…27_s122_cp_edits_notify` (`task_assignees.notify_changes`, `task_schedule_edits`) | a notify default over rows → **2** | M |
| 7 | **Part 4**: CP tab | Projects → Work → Critical Path, in the spec's order: the headline (finish, how far it moved, cause); history (never "baseline"); the pending strip; the critical chain with owners; the network in the **existing** `gantt.tsx` (critical red, float blue, dashed ghost of the slack); the float table, least first; the slip simulator (nothing saved; says which tasks newly go critical). Drag the bar end to extend: an 8px end handle, the only `touch-action: none` element, the S121 handle pattern; releasing previews and then saves, or submits for a foreman. | none | — | L |
| 8 | **Part 5**: approvals | Foreman edits → `task_schedule_edits` (who, what, when); the approval strip inside the tab; approving applies it through the same route. **Load-bearing test:** a foreman's submission leaves `start_date`, `due_date` and the projected finish byte-identical until approved (row counts, then a sabotage that applies on submit → red). Negatives per excluded role, written without returning rows. | uses `…27` | a pending edit moving the date → **9** | M |
| 9 | **Part 6**: notifications | On an applied change, for each assignee with `notify_changes`: **`resolveMemberReachability`** (reused) → in-app / email (Resend) / **unreachable, returned to the saver and shown**. The client email when `notify_client` is on: "The projected finish for <project> is now <date> (was <date>). The construction industry is fluid and dynamic; these dates are for planning purposes and cannot be guaranteed." It has **no** cause, float, assignee or task detail. | none | — | M |
| 10 | **Part 7**: client portal | **Float is kept out of the PAYLOAD** because the client's only read is a new SECURITY DEFINER SQL function, `client_critical_path(project)`, whose **return type** has only: phase name, phase start, phase finish, task title, sort order, projected finish. There is no float column to leak; the engine never runs on a client request. The portal page passes only those rows to its component. **Proof by payload:** fetch the portal page's RSC payload as a linked client and count 0 float values, 0 assignee names, 0 critical flags, 0 durations, 0 history dates, plus the linked client's raw `tasks` read = 0 rows. **Control:** an unlinked client reads 0 rows from the function. Each has its own sabotage (a float column added → red). | `…28_s122_cp_client_view` | float in the payload → **8** | M |
| 11 | **Part 8**: templates | `schedule_templates` + tasks + dependencies + phases, with no dates, assignees or percent. Owner/Admin create/delete; CP editors stamp. Stamping asks one start date, refuses a non-empty project (Q14), then computes. | `…29_s122_schedule_templates` | — | M |
| 12 | **Part 9**: mobile | A card on `/m` for the project: the running critical task, the next two, "N tasks have room". No Gantt at 402px. Extending opens the §3 sheet, not a drag. | none | — | S |

### 2.3: Stopped. Waiting for Josh's approval before Phase 3.

### 2.4: Josh's answers (2026-09-30): **all A. Plan approved; Phase 3 started.**

| Q | answer | Josh's reason (quoted) |
| --- | --- | --- |
| Q1 | A | "the 'as of' stamp is the part that matters. Without it, an entry from last Tuesday silently means something different today." |
| Q2 | A | "drop the roster type. It either repeats the role or misleads; it's never informative." |
| Q3 | A | "only my framing was wrong, not the design." |
| Q4 | A | "B puts the rule in the screen only. That's the #136 shape, and this project has shipped it before." |
| Q5 | A | see note 1 |
| Q6 | A | "a fixed word can't be turned into an open redirect at all. Better than checking a path." |
| Q7 | A | "a PM only sees invoices they wrote, so the screen's 'remaining' can be wrong upward. That's a correctness problem, not defence in depth." See note 3. |
| Q8 | A | **Clarifies stop rule 2 [Josh]:** "stop rule 2 exists because a constraint can fail against existing production data. A column created in the same migration has none. A check on a pre-existing column still stops." |
| Q9 | A | see note 2 |
| Q10 | A | "B makes every dependency query polymorphic and forces the cycle guard to understand two node types. One graph." |
| Q11 | A | "the delete-then-re-add bug will bite the moment anyone uses dependencies." |
| Q12 | A | "B leaves the approval step trivially bypassable." |
| Q13 | A | "off by default. Your ruling was that the user selects; a default of on isn't a selection." |
| Q14 | A | "merging two networks makes duplicate phases and orphan dependencies." |
| Q15 | A | "keeps your four dated tasks visible and anchored instead of vanishing, and invents nothing." |
| Q16 | A | "never silently seven days, and the banner is honest about it being a default." |
| Q17 | A | "Parts 1 and 2 change nothing visible and everything after needs them." |
| Q18 | A | "matches how every other project-level record is scoped." |

**Note 1, Q5: this does NOT contradict S121.** S121 ruled that the **week sheet**'s segment edits are
Owner/Admin. The older **per-session clock correction** on the day page is a different surface that
S121 never ruled on (S121 Part 4 listed it under "Not changed"). A supervisor keeps the ability to fix
a missed clock-out; removing it would mean every missed punch waits for Josh. **What was broken is that
the edit left the day approved. That, and the missing audit entry, are what 0-B-4 fixes.** No
authority is added or removed.

**Note 2, Q9: what triggers a recompute.** Stored dates go stale silently if anything that moves a
computed date fails to recompute, so the list is explicit, and each item is a place Phase 3 must wire
and test:
1. A task edit that touches the schedule: duration, days left, start constraint or date, status (to or
   from in progress or complete), or deleting or restoring a task.
2. Adding, removing or changing the type of a dependency.
3. **Approving** a foreman's pending edit. A pending edit triggers nothing (stop rule 9).
4. **The company working calendar**: changing the working weekdays **recomputes every CP-enabled
   project in the company**.
5. **Company holidays**: adding, removing or moving one **recomputes every CP-enabled project in the
   company**.
6. **Weather days**: adding, removing or changing one **recomputes that project**.
7. An inspection node's date or result changing.
8. Turning Critical Path on for a project (the first computation), and stamping a template.
9. ⚠️ **The passage of time. This one no user action covers.** An in-progress task's finish is "the
   later of (as-of + days left) and today", so a stale entry's finish moves every working day with
   nobody touching anything. Plan: `project_schedule_settings.computed_on` (company-timezone date)
   records the last computation. **A daily cron recomputes every CP project whose `computed_on` is
   before today**, and every staff read of a CP project's schedule recomputes first if `computed_on` is
   stale, so a missed cron is corrected by the next look. The client's SQL read shows the stored dates,
   which the cron keeps current. The column ships in Part 1; the cron and the read-check ship in Part 3
   with the first write-through, with a test per trigger 1–9. **Flagged for Josh: this adds a cron job.
   It blocks nothing before Part 3.**
Every recompute that changes the projected finish writes one `project_finish_history` row naming its
cause (a task, or `calendar` / `holiday` / `weather` / `time` / `approval` / `template`).

**Note 3, Q7: a line already over its price is a FINDING, not a failure.** If the production
pre-check finds any live line item billed above its sell, **the ceiling migration is NOT applied**. The
lines are reported to Josh (invoice, line, sell, billed, excess), because real invoices exist that the
new ceiling would have refused and he wants to know before it is enforced. 0-C's UI work is not blocked
by this; only the enforcement waits for his ruling.


---

## First action — 2026-09-30

- **Peer check:** `ListAgents` → "No reachable agents — no other Claude session is running on this
  machine right now." Stop rule 12 not triggered.
- **`git fetch --prune`:** exit 0.
  - `origin/main` = `4785835c378c13a68d794b6a93fc075c1c2dbf4d` — "[S121] Merge feature/s121-assess: the
    S121 report and evidence (docs only)."
  - Build base: HEAD = `4785835c` (identical to `origin/main`), branched to `feature/s122-critical-path`.
- **CI trigger (read on `4785835c`, `.github/workflows/ci.yml:70-78`):** `push: branches: ['**']`, so
  every push to this branch starts a run unless the commit says `[skip ci]`. Docs-only commits in this
  session carry `[skip ci]`, so they do not start a run next to a `main` run (1.7).
- Spec committed: `95555da8`, pushed.

---

## Phase 1 — Assess and plan

Method for every database read: `npx supabase db query --linked -f <file>` (Management API),
read-only `select`s only. For production the CLI was linked to `jwkcknyuyvcwcdeskrmz`, queried once,
and relinked straight away, with `LINKED_REF` read back from `supabase/.temp/project-ref` each time.
The Supabase MCP is bound to rebuild-test (`get_project_url` → `https://nmyphyhmfttxkdoposvf.supabase.co`),
so it cannot read production. The query file was run on rebuild-test first, so its errors surfaced
there: a `text || "char"` cast, a nonexistent `company_members.email`, and `trade_type` living on
`subcontractors`.

### 1.1 — S121 landed — refs `origin/main` `4785835c`; PRODUCTION `jwkcknyuyvcwcdeskrmz`

- `origin/main` = `4785835c`, which is S121's final docs merge. **Stop rule 7 not triggered.**
- **Production ledger** (`supabase_migrations.schema_migrations`, version ≥ `20262110000000`, **12 rows**)
  ends `20262117000000` s121_signout_signer_is_caller, `20262118000000` s121_signout_return_evidence,
  `20262119000000` s121_time_segment_edits, `20262120000000` s121_task_assignees,
  `20262121000000` s121_drop_create_safety_incident_6arg. The repo's `supabase/migrations/` has the same
  five files and nothing later.
- **By object, production:** `task_assignees` exists, RLS **on**, 3 policies (`_insert_authorized`,
  `_select_visible`, `_update_authorized`), 3 live rows; `create_safety_incident` has **1** overload,
  `(uuid,date,text,text,text,jsonb,jsonb)`; the 7 triggers on `tasks` + `task_assignees` are all
  enabled (`O`). Relinked afterwards: `LINKED_REF=nmyphyhmfttxkdoposvf`.

### Database counts used below — PRODUCTION and rebuild-test, same query file

| measure | PRODUCTION | rebuild-test |
| --- | --- | --- |
| live `company_members` | **10** | 648 |
| … with no `profile_id` | **4** (all 4 are `subcontractor`) | 640 |
| … by `member_type` | crew 6 (0 without a profile) · subcontractor 4 (4 without) | crew 7 (0) · subcontractor 641 (640) |
| reachability, `resolveMemberReachability`'s own logic (a live profile → `profile`; else a live `subcontractors.email` → `email-only`; else `unreachable`) | profile **6** · email-only **3** · unreachable **1** | profile 8 · email-only 2 · unreachable 638 |
| live `tasks` | **6** (not_started 5, complete 1) | 7 (not_started 6, complete 1) |
| … with both `start_date` and `due_date` | **4** | 6 |
| live `task_assignees` | 3 | 5 |
| live tasks whose `assignee_id` ≠ earliest live assignee | **0** | 0 |
| live `task_dependencies` | **0** | 2 |
| live `phases` | **0** | 4 |
| `tasks` columns matching `%duration%` / `%remaining%` | none | none |

### 1.2 — The three TBDs, from `S121-report.md` on `origin/main` `4785835c`, each re-read by object

**The S121 report and this spec agree on all three TBDs.** Where the report adds detail the spec lacks,
the report is quoted.

**TBD-1: the task-assignees table.** S121 §"Part 5" 5-C: *"Table `task_assignees` … partial UNIQUE
(task_id, member_id) over live rows … `tasks.assignee_id` KEPT (not dropped): trigger
`task_assignees_sync_primary` keeps it = the earliest live assignee. A direct write of `assignee_id` by
an allowed writer … replaces the live set (`tasks_mirror_assignee_write`) … `set_task_assignees(task,
member_ids[])` (INVOKER, one transaction)."*
- **Read by object, the same on PRODUCTION and rebuild-test.** Columns: `id` uuid
  `gen_random_uuid()`, `company_id` uuid NOT NULL default `get_my_company_id()`, `task_id` uuid NOT
  NULL, `member_id` uuid NOT NULL, `created_at`/`updated_at` now(), `created_by`/`updated_by` default
  `auth.uid()`, `is_deleted` default false, `deleted_at`. Indexes: pkey, `idx_task_assignees_{company_id,member_id,task_id}`,
  `task_assignees_live_unique (task_id, member_id) WHERE is_deleted = false`. RLS on, 3 policies, **no
  DELETE policy** (soft delete). Triggers `task_assignees_{set_updated_by,sync_primary,updated_at}`, plus
  on `tasks` `tasks_guard_assignee_change` and `tasks_mirror_assignee_write`, all `O`.
- **`tasks.assignee_id` survives and is kept in sync:** column present on both. Live tasks whose
  `assignee_id` differs from the earliest live assignee (ordered `created_at, id`): **0 on production (of
  6), 0 on rebuild-test (of 7).**
- **Consequence for §3:** the line sheet writes assignees through `set_task_assignees` (one
  transaction; refuses 42501 if RLS drops part). **§3's per-assignee "notify me" flag has no column
  today.** It is a property of a (task, member) pair, so it belongs on `task_assignees`. That is a
  migration on a table with live production rows (3), so it must be a **nullable or defaulted column
  with no constraint over existing rows** (stop rule 2). See Phase 2.

**TBD-2: every reader of `tasks.assignee_id`.** S121 §1.5 enumerated D1–D4 (database) and A1–A14 (app);
§"Part 5" gives where each went. Re-measured:
- **Database** (the same query on both projects; regex `assignee_id`, **control: punch policies
  = 2, which fired**): `tasks` policies reading it **0**; views **0**; functions **3**, exactly S121's
  sync/guard trio (`sync_task_primary_assignee`, `guard_task_assignee_change`,
  `mirror_task_assignee_write`). PRODUCTION = rebuild-test.
- **App** (`git grep -n assignee_id origin/main -- apps packages scripts`, excluding `database.ts` and
  punch, **68 lines**, every one read): no non-test code under `app/`, `lib/`, `components/` or
  `packages/` compares `tasks.assignee_id` any more. The hits are SUPERSEDED comments, `assignee_ids[]`
  (the new shape via `taskOpenToMember()`, `lib/tasks/assignees.ts`), `packages/shared/validation/assignments.ts:24`
  (the **punch/project assignment** route schema, not tasks), and fixtures that seed `assignee_id` (the
  mirror trigger turns that into a join row).
- ⚠️ **A residual, not a live reader:** `test/s114-subcontractor-surfaces.live.ts:245-289` still selects
  and compares `tasks.assignee_id` to the sub's member id. That is now "the sub is the EARLIEST
  assignee", a narrower claim than its title. It is a test, so nothing is misbehaving. Filed as
  a residual here and not changed in S122 (not in scope).

**TBD-3: the Gantt.** S121 5-B: *"The Gantt is the SAME component the project panel uses, now fed by
groups (`ganttGroupsFromRollups` / `ganttGroupsFromEvents`)."* **Extended, not replaced.** One component,
`apps/web/components/schedule/gantt.tsx` (398 lines on `4785835c`). Importers: `schedule-panel.tsx:22`
(project, with dependencies) and `components/schedule/calendar.tsx:7` (company calendar, no
dependencies). It draws **straight** dependency lines (`gantt.tsx:365-367`) that ignore
`dependency_type`, and **has no drag of its own**; S121's drag lives in the calendar and day views.
Critical Path §4 renders into this component.

### 1.3 — The five corrections, re-verified — code ref `origin/main` `4785835c`; DB PRODUCTION + rebuild-test

| # | correction | verdict | evidence |
| --- | --- | --- | --- |
| 1 | `is_scheduled` computed, not settable | **CONFIRMED** | both DBs: `is_generated = ALWAYS`, expression `(start_date IS NOT NULL) OR (due_date IS NOT NULL)` |
| 2 | a project Gantt already exists | **CONFIRMED** | TBD-3 above |
| 3 | `trade_type` free text | **CONFIRMED** | `subcontractors.trade_type` `text`, CHECK constraints mentioning it **0**, both DBs |
| 4 | trade and person colours shipped | **CONFIRMED** | `packages/shared/utils/schedule-colors.ts` and `apps/web/test/s121-schedule-colors.test.ts` present on `4785835c` |
| 5 | mobile schedule is a one-day column | **CONFIRMED** | `app/m/schedule/page.tsx:18-27` quotes M-25 as overturned and says "there is still no month (or week) grid on mobile"; the view is `app/m/schedule/day-view.tsx` |

**The member count, CORRECTED AGAIN.** The spec (§"What already exists", §6) calls members with no
`profile_id` "the MAJORITY case" and email "the only channel that reaches" subs. **On PRODUCTION that
is not true: 4 of 10 live members have no `profile_id`** (all 4 are subcontractors; 0 of 6 crew).
Reachability on production by the resolver's own logic: **profile 6, email-only 3, unreachable 1.**
The "majority" figure is **rebuild-test's (640 of 648)**, and those rows are test fixtures. The design
conclusion is unchanged: subs are reached by email or not at all, and the unreachable case exists
(1 on production), so §6 still needs both paths and the report-back. But the "almost none of the subs" framing
describes rebuild-test, not Josh's company. The stale "34 of 41" comment is still at
`lib/notify/assignment-notify.ts:20`.

**Further findings under the spec's "what already exists":**
- **Cycle guard** (`lib/services/tasks-client.ts:146-206`, `createDependency`): a DFS from the
  successor looking for the predecessor, over edges whose predecessor is a live task of the project,
  **as the caller's RLS sees them**. Confirmed service-layer only. ⚠️ **The spec says DB enforcement "is
  logged as tech debt". It is not in `TECH_DEBT.md`** (grep for cycle / Q-N4 / dependency on
  `4785835c`: 0 entries). `docs/specs/5B-spec.md:81` only says it would be "logged as tech debt if
  DB-level … enforcement is wanted later." The DB does carry `task_dependencies_no_self_link`.
- ⚠️ **`task_dependencies_pair_key UNIQUE (predecessor_id, successor_id)` is NOT partial**, while
  `deleteDependency` soft-deletes (`tasks-client.ts:211-223`). So deleting a dependency and re-adding
  the same pair returns 23505, which the UI maps to "That dependency already exists." A latent defect
  that Critical Path editing will hit. See Phase 2.
- `task_dependencies.predecessor_id` / `successor_id` are FKs to **`tasks(id)` only**, so an
  inspection cannot be a predecessor without a model change (§1-B).
- `inspections`: `project_id`, `inspection_type`, `scheduled_date`, `result`, `inspector`,
  `permit_file_id`, `notes`. **No duration, no status.** Live rows: production **0**, rebuild-test 1.
- **No working-calendar, holiday, weather, template, or finish-history tables exist**, and `companies`
  has no work-day or holiday column (both DBs). `tasks` has no duration or remaining column.
- `tasks.status` CHECK: `not_started, in_progress, blocked, complete`. Production: not_started 5,
  complete 1. **Production has 0 dependencies and 0 phases**, so the engine starts from a graph that
  is today all disconnected tasks.
- **§1-A backfill count:** live tasks with both dates: **production 4**, rebuild-test 6. These stay null.

### 1.4 — Branches, true merge status — ref `origin/main` `4785835c` (fetched `--prune`, exit 0). **Nothing deleted.**

`git worktree list` → **one** (`/workspaces/FrameFocus`). Local and remote refs other than `main` /
`origin/main` / `origin/HEAD`: **12** (6 local, 6 remote). **None is an ancestor of `origin/main`.**
S121's `feature/s121-assess` is gone, as its close said.

| branch (local = origin unless noted) | tip | ahead / behind | `git cherry` | files since merge-base | content on `main`? |
| --- | --- | --- | --- | --- | --- |
| `feature/s122-critical-path` | `975c0087` | 4 / 0 | +4 | 2 | this session |
| `feature/s114-c5-multi-upload` | `6409738e` | 1 / 318 | +1 −0 | 17 | **no.** Kept: S121 stop, reference for `#181` (spec: "stays filed") |
| `feature/s116-report` | `ac270b42` | 2 / 236 | +2 −0 | 1 | **yes**: `docs/sessions/S116-report.md` blob identical to main's |
| `feature/s180-branch-archive` | `25fa2001` | 3 / 486 | +3 −0 | 1 | **yes, contained**: `docs/branch-archive-2026-09-27.md` differs as a blob (main grew S121's section) but **all 229 added lines are on main, 0 absent** |
| `feature/s180-unattended` | `8f560601` | 26 / 469 | +25 −1 | 3 | **yes**: `S180-report.md` and `S180-unattended-plan.md` blobs identical; `TECH_DEBT.md` differs as a blob but **all 25 added lines are on main, 0 absent** |
| `origin/feature/s110-site-visit-access` (remote only) | `9df22efe` | 7 / 682 | +7 −0 | 1 | **yes**: `docs/sessions/S110-report.md` blob identical |
| `origin/feature/s112-staletimes-hold` (remote only) | `9b90115a` | 2 / 565 | +1 −1 | 1 | **no, by design**: `apps/web/next.config.js` differs. RULED DELETE [Josh, 2026-09-30] |

**Method for "content on main":** for each file the branch changed since its merge-base, compare the
branch blob with `origin/main`'s. Where they differ, check each line the branch **added** with
`grep -qxF` against main's copy. **Control:** a two-line probe (a sentinel sentence plus a real
`TECH_DEBT.md` line) → absent **1**, as expected, so the check can fire. Deletions happen in Part 0-B-1
(Phase 3), each re-proved immediately before and archived by SHA.

### 1.5 — Part 0-B's targets — code ref `origin/main` `4785835c`; DB rebuild-test (MCP)

- **0-B-1, the five branches:** all present (table above). Four docs-tail branches are content-on-main;
  staletimes by ruling.
- **0-B-2, `app/m/schedule/scroll-to-today.tsx`:** exists. `git grep -n "scroll-to-today\|ScrollToToday"
  origin/main -- apps packages` → **1 line, its own `export function ScrollToToday()`**. **0 importers.**
- **0-B-3, `scripts/.db-expected.json`** — ⚠️ **correction to the spec's framing.** The file is
  **gitignored** (`.gitignore:72`) and **not tracked** (`git ls-files --error-unmatch` fails). It is
  **not in CI**: its only readers are `scripts/db-replay-schema.py:45` (writer) and
  `scripts/db-fingerprint.mjs:100` (reader). It is generated by `npm run db:verify`, which **replays the
  migration files**; it is not a snapshot of any live database. S121's own words: "a local replay
  fingerprint, not in CI". **Stale, confirmed:** the local copy (mtime 2026-09-30 01:56) has
  **139 tables, 2,168 columns, 880 not-null, 1,077 constraints, 29 unique indexes**, and
  `task_assignees` is **absent**. Regenerating it is right, but **there is nothing to commit or merge.**
  The before/after counts go in the report, and the drift check is `db-verify.sql` against a live DB,
  diffed by hand.
- **0-B-4, the two clock-edit paths.** There are more than two write paths:
  - **The week sheet (S121, correct):** `edit_time_segment` / `add_time_segment` / `split_time_segment`,
    gate `s121_time_edit_session` = **Owner/Admin only**; overlap check; completion gate
    (`s121_time_task_check`); `s121_time_reopen` flips `approved → pending` and clears
    `approved_by/at` **inside the same plpgsql call**; audit under the `framefocus.time_edit` flag.
    **It edits segments only. It has no session clock-in/out edit.**
  - **The old day page** `app/dashboard/timeclock/timesheets/[sessionId]/day-detail-client.tsx`
    (670 lines), reachable **only by direct URL or bookmark** (the queue link is SUPERSEDED at
    `timesheets-client.tsx:524`; `/dashboard/timesheets/[id]` redirects to it; no notification links
    to it). Its three writes:
    1. `submitHours` (`:189-211`): Owner/Admin → `updateSession` (allowed columns include `status`,
       `approved_by`, `approved_at`); anyone else → `updateSubordinateSession` (`clock_in`,
       `clock_out`). **A plain client `UPDATE`. Nothing reopens an approved day**:
       `time-tracking-client.ts:505-506` says so: *"An edit does NOT clear approval (the timesheet
       stays approved)."*
    2. `submitSegment` (`:213-255`): Owner/Admin → `updateSegment`, which **writes `segment_start` /
       `segment_end` directly**, with no overlap check, no reopen and no flag. Supervisors →
       attribution only (no times).
  - **Who may do it today (DB, rebuild-test):** `time_clock_sessions_update_authorized` admits Owner/Admin,
    self while open, **or `can_approve_member(member_id)`** (strictly higher rank, not self).
    `enforce_time_clock_sessions_column_scope` lets such a **supervisor change `clock_in`, `clock_out`,
    `status` and `approved_*` on a subordinate's session, approved or not**. Only `gps_out` and
    deletion are refused. So **a PM or foreman can move an approved day's hours today and it stays
    approved.**
  - **Audit today:** `audit_time_clock_session_edit` logs every cross-member session edit. It **skips
    an Owner/Admin editing their own session** unless the flag is set, and **the flag can only be set
    inside a DB function**, so the old path cannot produce the week sheet's own-edit audit row
    without a function.
  - ⚠️ **Consequence: the prompt says 0-B has no migration. 0-B-4 cannot match the week sheet without
    one.** The reopen must be atomic and must hold whatever path writes, and the own-edit audit needs
    the flag. Both need a DB function or trigger. **Phase 2 Q4.** The authority question (supervisors
    keep clock correction) is **Q5**; stop rule 3 applies.
- **0-B-5, photo markup back link:** `app/dashboard/projects/[id]/files/[fileId]/markup/page.tsx` has
  **three** hard-coded `← Back to files` links (`:27`, `:41`, `:61`). Entries: Files
  (`files/file-row-actions.tsx:89`) and Photos (`photos/page.tsx:147`). Also: the **delete** button
  already goes to **Photos** (`delete-photo-button.tsx:36`) and the editor's save goes to `savedHref`
  (`markup-editor.tsx:291`), so the page disagrees with itself today. ⚠️ **Correction to the spec:**
  `lib/safe-next.ts` `safeNextPath` does **not** validate "against a known set of destinations". It
  accepts **any same-origin absolute path** and rejects only non-`/`, `//` and `/\`. **Phase 2 Q6.**
- **0-B-6, mobile Settings "You" block:** confirmed. `app/m/settings/page.tsx:83-103` renders
  `m-settings-role` and `m-settings-member-type` side by side, both `font-mono text-[11px]
  text-m6m-muted` (the role adds `font-semibold`). `member_type` CHECK is `crew | subcontractor` on
  both DBs. **An existing test pins the member type:** `e2e/m-destinations.spec.ts:736` `expect(...
  'm-settings-member-type').not.toHaveText('—')`. Dropping the field means inverting that assertion
  in place (S157).

### 1.5b — Part 0-C's premise — code ref `origin/main` `4785835c`; DB rebuild-test (MCP)

**The spec's claim holds for the model and the write path, and is WRONG about the ceiling.**

- **The interface as it stands** (`lib/services/invoices-client.ts:332-339`): `EstimateLineSelection
  { lineItemId; description; category; /** The portion of this line's REMAINING that this invoice
  bills. */ amount: number }`. **Confirmed: a per-line dollar amount already exists.**
- **What the grid sends today** (`invoice-builder.tsx` `EstimateLinePanel`, `:907-1083`): one `Bill
  [__] % of each line` input and a checkbox per line. **No per-line input.** On submit, every chosen
  line sends `amount: amountFor(l.remaining)` = `partialClaimAmount(remaining, pct)` (`:1045-1053`).
  The THIS INVOICE cell is display-only (`:1029-1031`). **Confirmed: only the percentage control
  shipped.**
- ⚠️ **The percentage silently coerces bad input to 100%** (`:930-934`: a blank, non-numeric, ≤0 or
  **>100** value becomes `pct = 100`). Typing `150` bills 100% with no message. That is the "silent
  truncation" the spec forbids, and it already exists. 0-C fixes it: an out-of-range percent is
  refused with a message, never coerced.
- ⚠️ **The discount rule reads the percentage, and pins break it.** The whole-estimate discount is sent
  only when `pct >= 100 && selected.size === billing.lines.length` (`:941-943`). With pins, "100% and
  all selected" no longer means "every line bills its full remaining". A $20,000 pin on a $42,763 line
  under a 100% bulk would bring the whole discount across on a partial bill. **0-C must change the test to
  "every line is selected AND every line's amount = its remaining".** The discount stays the **last**
  insert (`invoices-client.ts:396-414`) and is not reordered.
- **`billEstimateLines` still writes one line at a time:** confirmed (`invoices-client.ts:380-394`, a
  `for … of` with an `await` insert per selection; `sel.amount > 0` is skipped, and the first error
  returns). The doc comment (`:352-355`) gives the reason. Not batched.
- **Remaining is derived, never stored:** confirmed (`lib/services/estimate-line-billing.ts:195`:
  `remaining = money(sell − billed)`, with `billed` = Σ `billed_amount` of lines on **live** invoices;
  lines with `remaining ≤ 0` are dropped at `:237`).
- ⚠️ **WHERE THE CONTRACT CEILING LIVES, and what it does NOT do.** `enforce_contract_billing_ceiling()`
  (created `20260821000000_estimate_line_billing.sql:107`, redefined in `20261034000000` and
  `20262000000000`; live md5 `611a90ff…` on rebuild-test), trigger `invoice_lines_z_contract_ceiling`
  BEFORE INSERT OR UPDATE. Live body: `IF v_others + NEW.billed_amount > v_contract`, with `v_others` =
  Σ contract-instrument lines on live invoices. **It is a CONTRACT-TOTAL ceiling, on `fixed_price`
  projects only. It has NO per-line ceiling.** No function in the DB reads
  `source_estimate_line_item_id` (MCP query: **0**; the two `%ceiling%` functions both `false`). So a
  typed amount **above the line's own remaining is accepted by the database** whenever the contract as a
  whole still has headroom. **The spec's "the database will refuse an over-bill" is true only for the
  contract total. For one line, the UI cap is the only guard.** Phase 2 Q7.
- **Per-line remaining is computed under the CALLER's RLS** (`loadEstimateLineBilling` takes the
  session client). A PM sees only invoices they authored (Financial Visibility Floor), so for a PM,
  "billed" can under-count and "remaining" overstate. Phase 3 checks who reaches `EstimateLinePanel`
  before relying on a client-side cap.
- **`partialClaimAmount`** (`packages/shared/utils/invoice-derivation.ts:108-117`): percent of
  **remaining**; ≥100 returns the exact remainder; a sub-cent residue is absorbed. Confirmed.
- **Money parsing:** no cents helper exists in `packages/shared/utils` or `lib/`. The existing code rounds
  floats with `Math.round(n * 100) / 100`.
- **A test suite passing proves nothing here, as the spec says:** `invoice-derivation.test.ts:575-616` tests
  `partialClaimAmount`. Nothing tests the panel, a per-line amount, or the discount condition.

### Extra Phase 1 facts the plan depends on — DB rebuild-test (MCP), code `4785835c`

- **`tasks` UPDATE today** (`tasks_update_authorized` + the PE policy): owner/admin/PM/foreman on a
  viewable project, **OR any assignee of the task** (`is_task_assignee(id)`, so crew), OR the project's PE.
  Only `assignee_id` is guarded (`tasks_guard_assignee_change`). ⚠️ **So a crew assignee or a foreman
  can write `start_date` / `due_date` directly today**, and S121's calendar drag lets a foreman do it
  from the UI (S121 5-F). The approval flow in Part 5 is bypassable unless the DB guards the schedule
  columns. See Q12.
- **`tasks` SELECT**: non-subcontractor with `can_view_project(project_id)` (Owner/Admin, or
  `is_assigned_to_project`) or an assignee; a subcontractor only as an assignee.
- **`client_schedule(uuid)`**: SECURITY DEFINER, returns `(id, project_id, phase_name, title,
  start_date, due_date, status)`. It is the existing narrowed client read, and Part 7 follows its
  pattern.

### 1.6 — The pre-CI check

`scratchpad/lint-job.sh` **does not exist** (neither in the repo nor in this session's scratchpad).
`.github/workflows/ci.yml` runs two jobs: **Lint & Type Check** (`npm ci`; `npm run type-check`;
`npx turbo run lint --filter=@framefocus/web`; `npx turbo run test --filter=@framefocus/web`) and
**E2E (Playwright)** (`npm run build`; `npx playwright test`, `workers: 1`, 75 min). The pre-CI check
runs the first job's three commands directly, each as `cmd > log 2>&1; echo "exit: $?"`, and states
the vitest file/test totals and the Turbo cache-hit count (0 expected with `--force`).

### 1.7 — CI concurrency — `.github/workflows/ci.yml:70-78` on `4785835c`; runs via `gh run list`

- Triggers: `push: branches: ['**']`, `pull_request: [main, dev]`. Concurrency group
  `CI-${head_ref || ref_name}`, `cancel-in-progress: true`. **The group is per branch, so a `main` run
  and a branch run are in different groups and are never cancelled against each other. They run at
  the same time against the one rebuild-test database**, which is S121's collision class.
- `gh run list` at 2026-09-30 ~20:10 UTC: **no run in progress or queued.** The last `main` run
  `36770107771` (on `4785835c`, **a docs-only merge, which still triggered a run**) succeeded.
  This branch has had **no run**: every commit carried `[skip ci]`.
- **The sequencing rule for this session** (it goes in the plan):
  1. Every docs-only commit carries `[skip ci]`.
  2. **Before pushing any commit that starts a run**, `gh run list --status in_progress` and
     `--status queued` must both return **0 rows**, stated with the command.
  3. **After every merge to `main`, wait for `main`'s own run to finish** before pushing the next
     branch's CI commit. The merge run is the one that would collide.
  4. A branch run that goes red while it overlapped a `main` run is logged as a **suspected fixture
     collision**, re-run alone, and not counted as a first red (stop rule 6).
  5. Stacks are at most two deep, never mixing migration and non-migration work; `[skip ci]` goes on
     the lower commit and one run on the head.

### END OF PHASE 1

CLI: `LINKED_REF=nmyphyhmfttxkdoposvf` (rebuild-test), read back after the last production read and
again at this commit.

---

## Phase 3 — build log

### Part 0-B — branch `feature/s122-0b-cleanup` (from `origin/main` `4785835c`), head `1e7586ea`

- **0-B-1, branches** (re-proved on `origin/main` `4785835c` immediately before deleting; method and
  control as in 1.4, control absent **1**): `s110-site-visit-access` +255 / 0 absent; `s116-report`
  +65 / 0; `s180-branch-archive` +229 / 0; `s180-unattended` +516, +52, +25 / 0 each; `s112-staletimes-hold`
  19 absent, deleted **by ruling**. Tips archived, with the staletimes reason verbatim, in
  `docs/branch-archive-2026-09-27.md` §"S122" (in `1e7586ea`, **pushed before deleting**). Deleted on
  origin (`git push --delete`, exit 0) and locally (3 local copies, each equal to origin's tip).
  Read back: `git ls-remote --heads origin <b>` → **0 lines** for all five; `git branch --list` → 0.
- **0-B-2:** `app/m/schedule/scroll-to-today.tsx` deleted. Importers before **0** (the only hit was its own
  export); references after **0**.
- **0-B-3:** `scripts/.db-expected.json` regenerated (`python3 scripts/db-replay-schema.py`, exit 0).
  **Before → after:** tables 139 → **140**, columns 2,168 → **2,181**, not-null 880 → **887**,
  constraints 1,077 → **1,084**, unique indexes 29 → **30**, DO-block files 7 → 9. New: `task_assignees`
  (+10 columns) and `material_signouts.{return_location_note,not_returned_reason}`, plus
  `estimates.also_send_to_email`, so **the old baseline predated part of S120 as well.**
  **Drift check, `scripts/db-verify.sql`:**

  | | tables | columns | not_null | checks | uniques | fks | latest |
  | --- | --- | --- | --- | --- | --- | --- | --- |
  | replay (expected) | 140 | 2181 | 887 | 263 | 46 | 635 | — |
  | rebuild-test | 140 | 2181 | 887 | 263 | 46 | 635 | `20262121000000` |
  | **PRODUCTION** | **140** | **2181** | **887** | **263** | **46** | **635** | `20262121000000` |

  **Exact on every dimension.** (Gitignored, so nothing is committed; relinked,
  `LINKED_REF=nmyphyhmfttxkdoposvf`.)
- **0-B-5:** `lib/markup/return-to.ts`. `from` is a token (`photos` | `files`, else Files) and the
  destination is built from the page's own project id. Files tab → `?from=files`
  (`file-row-actions.tsx`); Photos grid → `?from=photos` (`photos/page.tsx`); the page's three back
  links **and** the delete button follow it. Not `safeNextPath` (Q6-A). Superseded code quoted in place.
  - Unit `test/s122-markup-return-to.test.ts` **17/17**: 9 hostile/unknown values → Files, plus source
    guards. **Sabotage:** one hard-coded `/files` back link put back → **1 ✘**; restored, `cmp` 0, 17/17.
  - e2e `desktop-photo-delete-s115.spec.ts`, **production build** (`next build` exit 0, `next start`,
    sole listener on :3000, rebuild-test): **8 passed, 0 ✘**. The 5 C-11 tests are **inverted in place**
    (the helper now opens `?from=photos`; superseded URL quoted), and 3 new ones: (a) a real Photos-tile
    click → URL `?from=photos`, link "← Back to photos" → lands on Photos; (b) a real Files-row click
    (an `other`-category image) → "← Back to files", **delete lands on Files**, soft delete counted
    with the service role; (c) 4 junk tokens (`https://evil…`, `//evil…`, `/dashboard`, `Photos`) →
    href = this project's Files. A heading check precedes every href assertion.
  - **e2e sabotage:** the Photos link made to carry `files` → rebuilt → **(a) ✘ ×2** (retry), (b) and
    (c) green. Restored, `cmp` 0, `git diff --quiet HEAD` 0, rebuilt → **8 passed**.
- **0-B-6:** `member_type` removed from the `/m` Settings "You" block (Q2-A), with the reason in place.
  `m-destinations.spec.ts` A-48b **inverted in place** (superseded title and assertion quoted): name
  and role render, then `m-settings-member-type` count **0**. M-30 block **6 passed**.
  **Sabotage:** `main`'s page restored → rebuilt → A-48b **✘** "Expected: 0, Received: 1" (with retry);
  restored, `cmp` 0.
- **Pre-CI (head `1e7586ea`):** type-check exit **0** (`--force`, **0/5 cached**; a first run showed 4/5
  cached and was re-run); lint exit **0**; unit exit **0**, **161 files / 2,164 tests**, 0 cached.

### 0-B CI and MERGE

- **CI `36794691928`** on `0f44aa9e` (base `4785835c` = main), requested 00:09 UTC with **0** runs in
  progress or queued: **green**. E2E **677 passed, 24 skipped, 0 flaky, 0 failed** (32.4 m); unit **161 files /
  2,164 tests**. Each changed spec is in the log: `desktop-photo-delete-s115` 8 ✓ (#93–#100) and A-48b ✓
  (#376).
- **The three conditions** (S180): (1) base `4785835c` = `origin/main` re-fetched at merge time; tested head =
  branch head `0f44aa9e`. (2) Every check passed, with the numbers above. (3) Migration files in the diff
  **0**.
- **MERGED → `main` `f04b83d1`** (merge commit; message carries the evidence), pushed. `main`'s own run
  follows. **No branch run starts until it finishes** (1.7).

### Built while 0-B's CI holds rebuild-test (no DB writes; nothing applied)

Per 1.7, **no migration is applied to rebuild-test while a CI run is using it**. 0-B-4 and 0-C are written
and pushed (`[skip ci]`) and wait for the run to finish.

- **0-B-4** `feature/s122-0b4-clock-edit`: migration `20262122000000_s122_session_clock_edit` (the
  reopen triggers on sessions and on segment hours, plus `edit_time_session_clock` INVOKER), the shared
  `components/time/hours-changed-notice.tsx` (the week sheet's notice moved verbatim; both surfaces
  render it), and the day page re-routed. Live test `s122-session-clock-edit.live.ts` written. One
  regression found while writing it and designed out: the segment trigger would have made the
  column-scope trigger refuse a crew member's own clock-out on an open session a supervisor had
  approved, so it skips a self writer who is not Owner/Admin (the session write reopens it instead).
- **0-C** `feature/s122-0c-line-amounts`:
  - `packages/shared/utils/invoice-line-amounts.ts` (cents parser, percent parser, pins, `planBilling`)
    and `EstimateLinePanel` wired to it.
  - Unit **44/44**. **Sabotage of the load-bearing rule** (a non-100 bulk percent overrides a pin) →
    **2 ✘** (bulk-after-pin and release). Restored, `cmp` 0, 44/44. ⚠️ The first restore ran from the
    wrong directory and **did not restore**; caught by the marker count (1), redone with absolute paths,
    marker count 0.
  - Migration `20262123000000_s122_line_item_billing_ceiling`, scoped to **fixed-price projects only**
    (P11, mirroring the contract ceiling: a cost-plus estimate is a projection, not a price) and
    **inclusive** (`>`). Live test `s122-line-item-ceiling.live.ts` written, including the PM case.
  - **Q7 production pre-check** (read-only, relinked after): **3** billed line items / **3** lines;
    **0 over their sell**; **2 exactly at their sell** ($2,838.00 = $2,838.00; $62,500.00 = $62,500.00), which is
    why the ceiling is inclusive. The third: $10,690.75 of $53,453.75. **Note 3 does not trigger: nothing is
    over.** rebuild-test: 0 billed line items, so the production read is the one that counts.
- **Part 2 — the engine** `feature/s122-p2-engine`: `packages/shared/utils/critical-path.ts`, pure, **29/29**
  hand-worked unit tests (`test/s122-critical-path-engine.test.ts`).

  **The five edge cases, as built:**
  1. **No duration.** With both typed dates: a fixed span (`duration_not_set`), and successors move.
     Otherwise `needs_duration`, out of the network, never zero-length; its successor is flagged
     `waits_on_unscheduled`.
  2. **Cycle.** Kahn's sort; the undrained nodes are `in_cycle`, a concrete loop is returned rotated
     to its smallest id (`[A,B,C,A]`), and the projected finish is null. Tested on a 2-cycle, a 3-cycle,
     a cycle beside an acyclic part with a task downstream of it, and a 500-node ring, each under a
     1-second budget.
  3. **Disconnected.** Starts at the project start, flagged, float against the project finish.
  4. **In progress.** ES is the actual start; EF is the later of (as-of + days left) on the **company**
     calendar and today. `percent_complete` is not an engine input at all (asserted). `days_left_missing`
     and `days_left_stale` are flagged.
  5. **Fixed date before a predecessor.** The task keeps its date and a conflict is returned with the
     gap.

  **Hand-worked floats:**
  - **Diamond** A2→B5→D1, A2→C3→D1: A 0, B 0, **C 2**, D 0; chain A→B→D; finish Wed 14 Oct.
  - **Case 5:** A4 → B fixed Tue: B stays Tue, conflict gap **3**, A float **−3** (critical).
  - **Calendar:** Fri + 3 = Tue; a Wed holiday makes a 3-day task Mon–Thu; a Tue lost day makes an
    unstarted 2-day task Mon–Wed while an in-progress task keeps Tue.

  **Two defects the hand examples caught before any sabotage:**
  - Lost days had been taken out of the ordinal calendar, which **shortened in-progress work**. Lost
    days now apply only to an unstarted task's span.
  - An anchored successor (fixed, fixed span, in progress, complete) had given its predecessors float
    it does not have. It now bounds them by its actual dates.

  **Sabotages:**
  - (a) The naive relax-until-stable engine on a 2-cycle **hung** (killed by `timeout 60`, exit **124**).
    That is the stop rule 11 failure mode, proven to be what the real engine avoids.
  - (b) `max` for `min` in the backward pass → **4 ✘** (chain, diamond ×2, case 5).
  - (c) Anchoring disabled → **1 ✘** (case 5).
  - Each restored, `cmp` 0, 29/29. No stray processes after the timeout (`ps`: none).

- **`main`'s run after the 0-B merge, `36797753096`** on `f04b83d1`: **green**, e2e **676 passed, 24 skipped, 1 flaky**
  (`m-photos.spec.ts:539` A-23t, the **mobile** viewer's no-derivative fallback; 0-B touched only the
  desktop markup page and `/m` Settings; it passed on retry), unit 161 / 2,164. `feature/s122-0b-cleanup`
  is an ancestor of main, so it was deleted (0 remote lines).

### Part 0-B-4 — branch `feature/s122-0b4-clock-edit` (rebased onto `f04b83d1`), head `c709e9aa`

- **rebuild-test, after `main`'s run finished** (0 runs in progress or queued): the dry run listed **exactly**
  `20262122000000_s122_session_clock_edit.sql`; applied. Types regenerated: the diff is exactly
  `edit_time_session_clock` (+4 lines).
- **Live `s122-session-clock-edit.live.ts`: 20/20.** **Total map** (crew member's APPROVED day; refusals judged
  by the service role):
  - Allowed: owner, admin, project_executive, project_manager and foreman each → `clock_out` 15:00,
    `pending`, audit **+1**.
  - Refused: crew_member, client and subcontractor each → `P0002`, `clock_out` unchanged 16:00, still
    `approved`, audit **+0**.
  - A crew-rank **peer** (equal rank, not self) is refused.
  - Every path reopens: a direct Owner UPDATE; a foreman direct UPDATE **even re-sending
    `status=approved`**; a direct Owner segment-hours UPDATE.
  - Controls: an attribution-only change stays approved (the write landed); a pending day stays pending
    (`returned_to_pending` false); the pop-up's re-approval lands with the corrected hours; clock-out before
    clock-in → `22023`, nothing changed.
  - S121's `edit_time_segment` still reports `returned_to_pending = true`; a crew member's own segment end
    and clock-out on an approved **open** session both **land**; the Owner's own-session correction is
    audited (delta **+1**, action `clock`); an ordinary own update is not (control, landed).
  - ⚠️ The refused roles get **P0002 "Session not found"**, not 42501: `time_clock_sessions_select_scoped`
    hides another rank's session, so to them it does not exist (existence-hiding, as RLS reads do), not
    a permission failure falling through to "not found".
- **Two fixture faults found and fixed** (not code):
  1. The week-sheet test hit S121's overlap check because this file stacks sessions on one day (proof the
     overlap rule is live); it was given its own day.
  2. The audit count included the fixture's own service-role approval (`v_me` is null, so the existing trigger
     logs it as cross-member); the test now measures the delta.
- **DB sabotages** (rebuild-test; restored from the migration text; md5 `rpc abe081f4…`, `seg 27f18f28…`,
  `clock 79b1f25d…`, triggers `O`/`O` **read back identical** after each):

  | # | sabotage | ✘ |
  | --- | --- | --- |
  | (i) | session reopen trigger disabled | **9**: the 5 allowed map roles, both direct-UPDATE paths, re-approve, SELF |
  | (ii) | the RPC does not set the audit flag | **6**: the 5 allowed roles (`action` missing), and the own-session audit |
  | (iii) | segment trigger's self-skip removed | **1**: SELF → *"Clock-in time and approval state are not editable on your own session."* (the exact clock-out regression the skip prevents) |
  | (iv) | segment trigger's flag-skip removed | **1**: S121 `returned_to_pending` |

  ⚠️ **(iii) first came back GREEN, so the test was vacuous.** The crew member's own segment-end write had
  landed on **0 rows**: `is_my_recent_segment` admits only the member's most recent segment, and the
  crew identity has real time after 2020. The test now places its session after the crew member's latest
  real segment (marked `S122CE-self` for the sweep), **asserts the segment write landed**, and (iii) is red.
  Leftovers after all runs: **0** marked, **0** on the fixture days.
- **UI** `e2e/desktop-day-clock-edit-s122.spec.ts` (production build, rebuild-test), plus
  `desktop-timesheets-s121`: **6 passed.** An approved day's Edit hours → Save → the shared "Hours changed"
  notice, `pending`, `clock_out` 15:00; Approve → `approved`, notice gone. A pending day: lands, **no** notice.
  S121's week-sheet pop-up test passes through the shared component. **Sabotage:** the day page drops the
  notice → the APPROVED test **✘**, the PENDING one green; restored `cmp` 0.

### Part 0-C — branch `feature/s122-0c-line-amounts`, **stacked on 0-B-4** (both migration-bearing), head `1d7c2990`→ new

- **rebuild-test:** the dry run listed **exactly** `20262123000000_s122_line_item_billing_ceiling.sql`; applied. Types
  unchanged (a trigger only).
- **Live `s122-line-item-ceiling.live.ts`: 7/7** (contract 100,000, so a refusal cannot be the contract
  ceiling's):
  - $20,000 of the $42,763.00 line → **1 line / $20,000**; the picker's own `loadEstimateLineBilling` →
    remaining **$22,763**.
  - $22,763.01 → **refused**: *"…Its price is 42763.00, 20000.00 is already billed on it, and this adds
    22763.01 … Bill at most 22763.00 on this line."* → still 1 / $20,000.
  - A second invoice bills exactly $22,763 → **2 / $42,763**, and the line drops out of the picker.
  - An UPDATE to $20,000.01 is refused.
  - Void the first → 1 / $22,763; re-bill $20,000 → 2 / $42,763.
  - **THE PM (Q7's reason, measured):** the PM authored the estimate, and the Owner billed $600 of the $1,000
    line. The **PM's picker shows remaining $1,000; the truth is $400.** The PM billing the $1,000 they
    are shown is **refused** ("Bill at most 400.00"), leaving 1 / $600. Control: the PM bills $400 → 2 / $1,000.
  - P11: a cost-plus line billed past its estimate figure is allowed.
- Fixture faults fixed (not code): a line item needs a category of its own estimate; the first counter
  helper used an embedded `!inner` filter and silently read 0 rows; it now does two plain reads that
  **throw** on error. Making the PM the estimate's creator after the fact was refused by
  `estimate_immutability`, so it is set at insert.
- **DB sabotage:** `invoice_lines_z_line_item_ceiling` disabled (`tg D`) → **5 ✘** (every refusal, plus the
  sums and void that follow from them); the 2 that pass either way (the first partial bill, P11) stay
  green. Re-enabled → `O`, md5 `05a90e38…` identical, 7/7.
- **UI** `e2e/desktop-invoice-line-amounts-s122.spec.ts` (production build): **1 passed**:
  - The label reads "% of each unpinned line". Typing `20,000` pins the line. Bulk 50% then 25% → the
    small line 500.00 → 250.00 while **the pin holds `20,000` both times**.
  - `150`% is refused with Bill disabled. `50000` is refused, naming "At most $42,763.00", with Bill disabled.
  - Release → 21381.50. **Nothing is written while editing (0 lines).** Bill → **2 lines: $20,000 (pinned) +
    $500 (50%) = $20,500, 0 discount lines.**
  - **Sabotage:** changing the percentage clears pins → **✘ "the pin survives the bulk change"**; restored, `cmp` 0.
- **Unit** `s122-invoice-line-amounts.test.ts` **44/44** (sabotage recorded above).
- **Pre-CI on the stacked head:** type-check **0** (0/5 cached), lint **0**, unit **162 files / 2,208 tests**,
  0 cached.

### 0-B-4 + 0-C — CI, PRODUCTION, MERGE

- **CI `36803396696`** on the stacked head `713ba19e` (base `f04b83d1` = main), requested with **0** runs in progress or
  queued: **green**. E2E **680 passed, 24 skipped, 0 flaky, 0 failed** (34.1 m); unit **162 / 2,208**. In the log:
  `desktop-day-clock-edit-s122` ✓✓, `desktop-invoice-line-amounts-s122` ✓, `desktop-timesheets-s121` ✓×4.
- **Production pre-check** (read-only, `jwkcknyuyvcwcdeskrmz`): ledger latest `20262121000000`; none of the four
  new functions present; sessions 15 (2 approved), segments 26, audit rows 3; fixed-price billed line items 3,
  **over their price 0**.

| § | migration | dry run | verification on PRODUCTION | expected (rebuild-test, captured before) | verdict |
| --- | --- | --- | --- | --- | --- |
| 1 | `20262122000000_s122_session_clock_edit` | exactly that file (run from the 0-B-4 branch) | ledger `…2120, 2121, 2122`; md5 `edit_time_session_clock` `abe081f4…`, `reopen_session_on_clock_change` `79b1f25d…`, `reopen_session_on_segment_hours` `27f18f28…`; triggers `O`/`O`; EXECUTE `authenticated` `true` on the RPC, `false` on the segment fn, `anon` `false`; 1 overload; **sessions 15, approved 2 (unchanged — no row touched)** | identical; 15 / 2 | **MATCH ×12**, relinked `LINKED_REF=nmyphyhmfttxkdoposvf` |
| 2 | `20262123000000_s122_line_item_billing_ceiling` | exactly that file; **over-sell re-read immediately before: 0** | ledger `…2120–2123`; md5 `enforce_line_item_billing_ceiling` `05a90e38…`; trigger `O`; EXECUTE `authenticated` `false`; contract ceiling md5 `611a90ff…` unchanged; `invoice_lines` triggers = the 6 expected, in order | identical | **MATCH ×6**, relinked |

- **MERGED → `main` `d84cfe8b`**, as two merge commits pushed in **one** push: `1c7684b9` (0-B-4) then
  `d84cfe8b` (0-C). Each part merged on its own, with its own evidence in its message.
  - **Tree identity:** `git rev-parse HEAD^{tree}` = `49a5aa85ea4e21ef480d4a4daec3eb7c69053ef5` = the tested
    `713ba19e^{tree}`; `git diff --name-only 713ba19e d84cfe8b` → **0 paths**.
  - The intermediate `1c7684b9` (0-B-4 alone) was never pushed on its own, so no deploy and no run served an
    untested tree. **This is how a stacked pair was merged without folding 0-C into another part's merge.**
- `main`'s run **`36806479835`** on `d84cfe8b` follows. Both feature branches were ancestors of main and were deleted
  (0 remote lines each).

### Part 1 — the schema — branch `feature/s122-p1-schema` (rebased onto `d84cfe8b`)

- **`main`'s run `36806479835`** on `d84cfe8b` (both merges): **green**, e2e **680 passed**, unit 2,208.
- **rebuild-test** (after that run; 0 in progress or queued): `20262124000000_s122_cp_task_fields`,
  `20262125000000_s122_cp_calendar_weather` and `20262126000000_s122_cp_settings_history` applied. Types
  regenerated (+328 lines). `deletion-census.test.ts` was **red before** the regeneration (the five new tables
  were "phantoms", the guard working) and **5/5 after**.
- **Live `s122-cp-schema.live.ts`: 40/40, and 40/40 again in a second run straight after:**
  - **NULLS:** pre-existing tasks **7**, with any new field set **0** (nothing backfilled, stop rule 10).
  - **CHECKS:** 5 bad shapes refused with `23514`; a valid set lands.
  - **DEPS:** delete-then-re-add **works**; a live duplicate is `23505`; the 2-cycle and 3-cycle are refused by
    the database; cross-project is refused.
  - **Q12 total map** (each role assigned and a live assignee):
    - owner, admin, project_executive, project_manager → due moves 06 → 09.
    - foreman, crew_member, subcontractor → **42501** (the guard's sentence); client → filtered by RLS.
    - Each refused role's date unchanged.
    - **Control:** the same foreman write on a project **without** Critical Path **lands**.
    - Crew keep status. A foreman may add an **undated** task; a dated one is refused (count 0).
  - **HISTORY:** all 8 roles refused (service-role count 0); the service role writes.
  - **SETTINGS:** a user cannot set `computed_on` / `projected_finish`.
  - **DIRTY:** a crew completion marks the project; the service role's write-through does **not**; a company
    holiday marks every CP project; a weather day marks its project.
  - **WEATHER:** no reason / unknown icon / end before start → `23514`.
- ⚠️ **A design defect the live test caught, fixed in the migration before production.** The settings guard
  (a) skipped the "first turned on" stamp for the service role, and (b) **reset `needs_recompute` to its
  old value** whenever a user's transaction touched the row. `mark_schedule_dirty` runs in the user's
  transaction, so **the dirty flag that answers Josh's Q9 note was being cancelled by its own guard.**
  - Rule now: anyone may MARK (forcing a recompute is harmless); only the engine (service role) clears it
    or writes the results; enabling is stamped for any writer.
  - Re-applied to rebuild-test from the file text, so rebuild-test = what production will get.
- **DB sabotages** (restored; `tgenabled` read back `O`; the sabotage index count 0):

  | # | sabotage | ✘ |
  | --- | --- | --- |
  | (a) | cycle/same-project trigger disabled | **3**: 2-cycle, 3-cycle, cross-project |
  | (b) | the Q12 guard disabled | **5**: crew, foreman, sub moved the date; the guard's sentence; foreman's dated insert |
  | (c) | the tasks dirty-trigger disabled | **1**: a crew completion marks the project |
  | (d) | the old NON-partial pair key restored as an index | **3**: delete-then-re-add, and the two loop tests built on it |

  ⚠️ The first (b)–(d) attempt showed **"40 skipped"**: a vacuous run. Under (a) a cross-project link had
  landed, and the afterAll deleted dependencies by **predecessor** only, so a task stayed pinned and every
  later run died in beforeAll. Cleanup now deletes by **either end**, and beforeAll sweeps marker holidays.
  The leftovers were purged and (b)–(d) re-run on a clean database. Final clean run **40/40**.
- **Pre-CI** (head after the fix): type-check **0** (0/5 cached), lint **0**, unit **162 / 2,208**, 0 cached.

#### Part 1 CI, first attempt — `36809908324` on `af513ab5`: **RED (first red; cause infrastructure)**

- E2E **637 passed, 1 failed, 1 flaky, 24 skipped, 41 did not run**. **No `main` run overlapped it** (`main`'s last run
  `36806479835` completed before it started), so this is not the S121 fixture-collision class.
- **Cause, from the log:** `e2e/m-photos.spec.ts:67` A-23f failed in **fixture setup**, all 3 attempts, with
  `fixture upload orphan|annotated|plain: Too many connections issued to the database` (`photo-fixture.ts:84`, a Storage
  upload). **6** such lines. The other failure, `s116-c5-portal-composer.spec.ts:237`, is also a Storage upload (1 of 2
  photos never reached `done`). Part 1 touches **no** files, Storage or upload code; its triggers are on `tasks`,
  `task_dependencies`, `inspections`, the calendar and holiday tables, and lost days.
- rebuild-test read straight after: **37 of 60** connections, 1 active. No local server, vitest or Playwright process
  of this session was running (`ps`: none; :3000 free).
- **Counted as the FIRST red on cause "rebuild-test connection exhaustion during Storage-heavy specs".** Re-run
  alone on a fresh commit (`gh run rerun` is refused, 403). A second red on the same cause is stop rule 6.

#### Part 1 CI, solo re-run — `36812550233` on `9f1c2382`: **GREEN**

- Read on resume with `gh run view` (the dead session never wrote it): `9f1c2382`, created 03:53:10Z, completed
  04:44:57Z, conclusion **success**.

---

## RESUME — 2026-10-01, after the Codespace restart (prompt `docs/sessions/S122-resume-prompt.md`)

**The dead session's memory is gone; its commits are not. Everything below was re-measured on resume.**

### R.1 — First action

- `ListAgents` → *"No reachable agents — no other Claude session is running on this machine right now."*
  **Stop rule 12 not triggered.**
- `git fetch --prune` exit **0**.
  - `origin/main` = `d84cfe8b822ad388fb7c626e558025c30bcbcfc0`, *"[S122] Merge feature/s122-0c-line-amounts:
    Part 0-C (money) …"*. **Stop rule 7 not triggered.**
  - Working ref: `feature/s122-p1-schema` at `a27870da` (the resume prompt commit) on top of `9f1c2382` (the
    CI-green Part 1 head). `origin/feature/s122-critical-path` = `d8571e28`.

### R.2 — This report brought forward

- **Taken from `origin/feature/s122-critical-path` @ `d8571e28`** (`git checkout <ref> -- <path>`), 975 lines,
  ending at Part 1's first red. It was on neither `main` nor `feature/s122-p1-schema`. **From here on, this file on
  `feature/s122-p1-schema` (and the branches after it) is the ONE report**; the copy on `s122-critical-path` is
  superseded and is not to be appended to.
- `docs/specs/S122-SPEC.md` was **also** only on that branch (absent on `origin/main` and on this branch). It is
  brought forward from the same ref so it reaches `main` with the build.
- `docs/sessions/S122-prompt-v2.md` was **untracked** in the checkout (13,397 bytes, mtime 2026-09-30 23:08; on no
  ref). Read in full: it is the original S122 session prompt (Phases 1–3, stop rules 1–12), and this report's line 3
  cites it by path. Session prompts are committed by precedent (`S121-prompt-v3.md`). **Committed.**

### R.3 — Where the report and the resume prompt disagree, verified by object

1. **The first Part 1 red.** The resume prompt says it "was exactly" the `main`-overlap fixture collision. **The
   report says no `main` run overlapped it, and the report is right.** `gh run view`: `main`'s `36806479835`
   ran 02:34:34Z → **03:10:51Z**; the red `36809908324` ran **03:18:33Z** → 03:52:17Z. **No overlap.** So it stays
   counted as the **first red on cause "rebuild-test connection exhaustion"**, and a second red on that cause is
   stop rule 6. It is **not** discounted as a collision.
2. Everything else the resume prompt states that the report also records agrees: `origin/main` `d84cfe8b`; the
   CI-green solo re-run `36812550233`; the four spec corrections; all eighteen answers A.

### R.4 — PRODUCTION state of Part 1's three migrations, by object

Method: one read-only `select` file (`scratchpad/p1-prod-state.sql`), run with `npx supabase db query --linked -f`.
**Run on rebuild-test first as the positive control**, then production, then relinked. All in one command so the
CLI could not be left on production: link prod exit 0 (`LINKED_REF=jwkcknyuyvcwcdeskrmz` read back); query exit 0;
relink exit 0 (`LINKED_REF=nmyphyhmfttxkdoposvf` read back).

| probe | rebuild-test (control) | **PRODUCTION** `jwkcknyuyvcwcdeskrmz` |
| --- | --- | --- |
| ledger ≥ `20262120000000` | `…2120, 2121, 2122, 2123, 2124, 2125, 2126` | **`…2120, 2121, 2122, 2123`**, ending `s122_line_item_billing_ceiling` |
| m24: `tasks` new columns (of 6) | 6 | **0** |
| m24: old `task_dependencies_pair_key` constraint | 0 (dropped) | **1 (still there)** |
| m24: `task_dependencies_live_pair` index | 1 | **0** |
| m24: `task_dependencies_graph_guard` trigger | 1 | **0** |
| m25: calendar / holiday / lost-days tables (of 3) | 3 | **0** |
| m26: settings / finish-history tables (of 2) | 2 | **0** |
| m26: guard + dirty triggers (of 3) | 3 | **0** |
| m26: functions (of 3) | 3 | **0** |
| control: `task_assignees` exists (S121) | 1 | 1 |
| live `tasks` | 7 | **8** |

| migration | on PRODUCTION |
| --- | --- |
| `20262124000000_s122_cp_task_fields.sql` | **NOT applied** (not in ledger; 0 objects) |
| `20262125000000_s122_cp_calendar_weather.sql` | **NOT applied** (not in ledger; 0 objects) |
| `20262126000000_s122_cp_settings_history.sql` | **NOT applied** (not in ledger; 0 objects) |

**None of the three reached production; ledger and objects agree. This is NOT a partial push, so stop rule 13 does
not fire.** Part 1 proceeds to its three production sections.

⚠️ **A drift to carry into Part 1's production verification:** production now has **8** live tasks (Phase 1 measured
**6** on `4785835c`'s day). Someone has added tasks since. Part 1's NULLS check on production must expect **all
live tasks at the time of the push** to have every new field null, with the count re-read immediately before.

### R.5 — Part 1 PRODUCTION, section 1 of 3: `20262124000000_s122_cp_task_fields`

- **Tree identity before any push:** `git diff --name-only 9f1c2382 HEAD` → only `docs/` (the prompt, the report,
  the resume prompt, the spec); `git diff --quiet 9f1c2382 HEAD -- apps packages scripts supabase .github` → **0**.
  The migration files are byte-identical to CI-green `9f1c2382`.
- **One-file workdir** (so the checkout itself stays linked to rebuild-test throughout): `scratchpad/wd1/supabase/migrations`
  = every repo migration with version ≤ `20262124000000` (**287 of 289**; m25 and m26 absent); `cmp` against the repo
  file 0. Workdir linked to production (`WD REF=jwkcknyuyvcwcdeskrmz`), checkout read back `nmyphyhmfttxkdoposvf`.
- **Pre-check, PRODUCTION:** ledger latest `20262123000000`; live tasks **8**, with both dates **5** (these stay
  NULL: stop rule 10); `task_dependencies` rows **0**; `inspections` rows **0**; new columns present **0**; old
  `task_dependencies_pair_key` **1**. Stop rule 2: the CHECKs are on columns created in the same migration (Q8-A),
  and the pair-key swap is strictly narrower over **0** rows.
- **Dry run:** exit 0, *"Would push these migrations: • 20262124000000_s122_cp_task_fields.sql"*. **Exactly one file.**
- **Push:** exit 0, *"Applying migration 20262124000000_s122_cp_task_fields.sql..."*.
- **The function body in the file** hashes (python, the text between `$function$` markers) to `ee79e32a…`,
  the same as rebuild-test's `prosrc`, so the expectation is the file's text, not a drifted copy.

| object | expected (rebuild-test, captured before; counts from the production pre-check) | PRODUCTION after | verdict |
| --- | --- | --- | --- |
| ledger ≥ 2123 | `2123, 2124` | `2123, 2124` | MATCH |
| 6 new `tasks` columns (name:type:nullable) | `constraint_date:date:YES, days_left:integer:YES, days_left_as_of:date:YES, duration_days:integer:YES, inspection_id:uuid:YES, start_constraint:text:YES` | identical | MATCH |
| the 5 new CHECKs, md5 of name=def | `ed683413…` (count 5) | `ed683413…` (5) | MATCH ×2 |
| `inspection_id` FK | `REFERENCES inspections(id) ON DELETE SET NULL` | identical | MATCH |
| 3 indexes, md5 of name=def | `4b4ad6f4…` (count 3) | `4b4ad6f4…` (3) | MATCH ×2 |
| old `task_dependencies_pair_key` | 0 | 0 | MATCH |
| `enforce_task_dependency_graph` md5 / SECURITY DEFINER | `ee79e32a…` / true | `ee79e32a…` / true | MATCH |
| EXECUTE authenticated / anon | false / false | false / false | MATCH |
| `task_dependencies_graph_guard` tgenabled | O | O | MATCH |
| live tasks | 8 (pre-check) | 8 | MATCH |
| live tasks with any new field set | 0 | **0** | MATCH (nothing backfilled) |
| `task_dependencies` rows | 0 (pre-check) | 0 | MATCH |

**Section 1: MATCH ×14.** Checkout CLI never left rebuild-test (`nmyphyhmfttxkdoposvf`).

### R.6 — Part 1 PRODUCTION, section 2 of 3: `20262125000000_s122_cp_calendar_weather`

- **One-file workdir** `scratchpad/wd2`: every migration ≤ `20262125000000` (**288 of 289**); `cmp` 0. Workdir linked to
  production; checkout read back `nmyphyhmfttxkdoposvf`.
- **Pre-check, PRODUCTION:** ledger latest `20262124000000`; the 3 tables **0**; the 3 `set_*_updated_by` functions **0**.
  (A first pre-check with the verify file exited 1, `42P01`, because it reads the tables that do not exist yet. That was
  expected, and the pre-check was re-run without them.) New tables only: no constraint over existing rows.
- **Dry run:** exit 0, *"• 20262125000000_s122_cp_calendar_weather.sql"*. **Exactly one file.**
- **Push:** exit 0, *"Applying migration 20262125000000_s122_cp_calendar_weather.sql..."*.
- **Expected values:** taken from rebuild-test **before** the push (m25 was never re-applied there, so it is the file's text).
  Two expectations differ from rebuild-test **by design**, because m26 is not on production yet: the ledger, and the
  triggers. The 3 `*_mark_schedule_dirty` triggers on these tables are **created by m26**, so production expects **6**,
  not rebuild-test's 9.

| object | expected | PRODUCTION after | verdict |
| --- | --- | --- | --- |
| ledger ≥ 2124 | `2124, 2125` | `2124, 2125` | MATCH |
| tables present | 3 | 3 | MATCH |
| columns md5 (table.col:type:nullable:default) / count | `931d70eb…` / 32 | `931d70eb…` / 32 | MATCH ×2 |
| constraints md5 / count | `6c67687a…` / 18 | `6c67687a…` / 18 | MATCH ×2 |
| indexes md5 / count | `6168654a…` / 9 | `6168654a…` / 9 | MATCH ×2 |
| RLS on | 3 of 3 | 3 of 3 | MATCH |
| policies md5 (name, cmd, roles, USING, WITH CHECK) / count | `a01913c8…` / 9 | `a01913c8…` / 9 | MATCH ×2 |
| triggers | `{company_holidays,company_work_calendars,project_lost_days}_{set_updated_by,updated_at}`, all `O` (6) | identical, all `O` | MATCH |
| `set_*_updated_by` functions md5 (body + secdef) | `180bf8fe…` | `180bf8fe…` | MATCH |
| rows in the 3 tables | 0 | 0 | MATCH |

**Section 2: MATCH ×14.**

### R.7 — Part 1 PRODUCTION, section 3 of 3: `20262126000000_s122_cp_settings_history`

- **rebuild-test is the post-fix file, proven before using it as the expectation.** This migration was re-applied on
  rebuild-test after the guard fix, so each of its 8 function bodies was hashed **from the file text** (python, between
  the dollar-quote markers) and compared with rebuild-test's `md5(prosrc)`. In file order: `set_project_schedule_settings_updated_by`
  `f8eaaeeb…`, `guard_project_schedule_settings` `e4cb04e9…`, `critical_path_enabled` `d6a8b51e…`,
  `critical_path_schedule_editor` `5aed10ac…`, `guard_critical_path_task_schedule` `7333a330…`,
  `guard_critical_path_dependency` `1abe40f8…`, `mark_schedule_dirty` `6cf267bb…`, `mark_schedule_dirty_from_row` `3d5019f8…`.
  **8 of 8 identical.**
- **One-file workdir** `scratchpad/wd3`: all **289** migrations (m26 is the last); `cmp` 0. Checkout read back
  `nmyphyhmfttxkdoposvf`.
- **Pre-check, PRODUCTION:** ledger latest `20262125000000`; m26 tables **0**; m26 functions **0**; `tasks` triggers
  `tasks_guard_assignee_change, tasks_mirror_assignee_write, tasks_set_updated_by, tasks_updated_at` (4, all `O`); live
  tasks **8**. New tables and triggers only: no constraint over existing rows.
- **Dry run:** exit 0, *"• 20262126000000_s122_cp_settings_history.sql"*. **Exactly one file.**
- **Push:** exit 0, *"Applying migration 20262126000000_s122_cp_settings_history.sql..."*.
- **Verification:** the same 24-line read-only file run on both, then `diff` of the two outputs. **The only differing line is `live
  tasks`: rebuild-test 7, PRODUCTION 8, and 8 is production's own pre-check value.**

| object | expected | PRODUCTION after | verdict |
| --- | --- | --- | --- |
| ledger ≥ 2125 | `2125, 2126` | `2125, 2126` | MATCH |
| tables present | 2 | 2 | MATCH |
| columns md5 / count | `3d008a97…` / 25 | identical | MATCH ×2 |
| constraints md5 / count | `f7dca823…` / 13 | identical | MATCH ×2 |
| indexes md5 / count | `ed98f9b5…` / 8 | identical | MATCH ×2 |
| RLS on | 2 of 2 | 2 of 2 | MATCH |
| policies md5 | `f1541f5a…` | identical | MATCH |
| policies | history: SELECT only (**no insert/update/delete for any user role**); settings: SELECT, INSERT, UPDATE | identical | MATCH |
| 8 functions: md5 / SECURITY DEFINER / EXECUTE authenticated / anon | as listed above; `critical_path_enabled` and `critical_path_schedule_editor` auth=true; the guard, dirty and trigger functions auth=false; anon false on all 8 | identical | MATCH ×8 |
| overloads for the 8 names | 8 | 8 | MATCH |
| the 11 m26 triggers | settings guard / set_updated_by / updated_at; `tasks_guard_critical_path_schedule`; `task_dependencies_guard_critical_path`; 6 `*_mark_schedule_dirty` — all `O` | identical | MATCH |
| all `tasks` triggers | the 4 before + `tasks_guard_critical_path_schedule`, `tasks_mark_schedule_dirty` (6, all `O`) | identical | MATCH |
| rows in settings + history | 0 | 0 | MATCH (no project has Critical Path on, so every new guard is inert on production) |
| live tasks | 8 (pre-check) | 8 | MATCH |

**Section 3: MATCH ×24. All three Part 1 migrations are on PRODUCTION, each in its own section with a one-file dry run.**

### R.8 — Part 1 MERGED → `main` `d45a2131`

- Merge commit `d45a2131` (`--no-ff`), pushed. **`HEAD^{tree}` = `65a1d3f6…` = branch head `582cbd3f^{tree}`;
  `git diff --name-only 582cbd3f d45a2131` → 0 paths.**
- S180 conditions, stated in the merge message:
  1. CI `36812550233` green on `9f1c2382` (base `d84cfe8b` = `origin/main`, re-fetched at merge time). Tree-identity
     exemption: `git diff --name-only 9f1c2382 582cbd3f` → `docs/sessions/S122-prompt-v2.md`, `docs/sessions/S122-report.md`,
     `docs/sessions/S122-resume-prompt.md`, `docs/specs/S122-SPEC.md`, and nothing else. The same diff over
     `apps packages scripts supabase .github` returned `--quiet` exit 0.
  2. CI: e2e **678 passed, 24 skipped, 2 flaky, 0 failed** (47.6 m). The flaky ones were `desktop-photos-thumbnails-s111:60`
     and `s116-c5-desktop-incident:228`, both **Storage** specs (the first red's family) and both passed on retry.
     Unit **162 files / 2,208 tests**. Live 40/40 twice, sabotages (a)–(d).
  3. All three migrations on production, by object (R.5–R.7).
- Before the merge: `gh run list` **0** in progress, **0** queued. **`main`'s own run on `d45a2131` follows; no branch run
  is requested until it finishes** (1.7).
- `feature/s122-p2-engine` rebased onto `d45a2131` (`4afd9fd7`). **The report continues on that branch.**

### R.9 — Part 2 (the engine), re-verified on resume — branch `feature/s122-p2-engine` rebased onto `d45a2131`

The dead session's WIP commit (`36f7b80c`, now `4afd9fd7`) is `packages/shared/utils/critical-path.ts` (606 lines) +
`apps/web/test/s122-critical-path-engine.test.ts` (416 lines). **Read in full on resume**, not taken from the commit
message.

- **Unit on the rebased head: 29/29** (`vitest run`, exit 0).
- **Every loop is bounded**, by reading the code: Kahn's queue (each id enqueued once); `CalendarIndex` (fixed
  `HORIZON_DAYS` = 3,653); `addWorkingDays` (guard counter); `skipLost`, `endFrom` and `startBack` (each step calls
  `cal.date()`, which throws `HorizonError` outside the index, caught to `error: 'horizon'`); and `findLoop`
  (≤ |members| + 1 steps). There is no recursion anywhere.
- **Two sabotages re-run on resume** (the dead session's three are recorded in Phase 3 above). Each was restored, `cmp` 0,
  and `git diff --quiet` 0:

  | # | sabotage | ✘ |
  | --- | --- | --- |
  | (e) | backward pass `Math.min(lf, bound)` → `Math.max` (re-run of the dead session's (b) on this head) | **4**: chain, diamond floats, diamond chain, case 5 |
  | (f) | **new**: lost days applied to IN-PROGRESS work (`node.ef = endFrom(...)`) | **1**: §1-D, *Expected "2026-10-06", Received "2026-10-07"* — a lost day pushed work already under way |

  Restored: **29/29**.

#### The five edge cases, as the code behaves (read on `4afd9fd7`)

1. **No duration** (`durationDays === null`, which is every existing row, never backfilled). With both typed dates, the
   task is `fixed_span` + `duration_not_set`: ES/EF are its typed dates, successors move from its typed finish, and it
   does not move. With one date or none, it is `needs_duration`: unresolved, out of the network, no dates, never
   zero-length. Each successor skips that link and is flagged `waits_on_unscheduled`.
2. **Cycle.** Kahn's sort; the nodes left with in-degree > 0 (in a loop **or downstream of one**) are `in_cycle`.
   `findLoop` walks predecessors inside that set and returns one concrete loop rotated to its smallest id
   (`[A, B, C, A]`). Then `ok: false`, `error: 'cycle'`, `projectedFinish: null`, and no backward pass, so every float is
   null. Tested on a 2-cycle, a 3-cycle, a cycle beside an acyclic part with a task downstream of it, and a
   500-node ring. **Reported, never looped on.** The database also refuses a loop now (m24, on production).
3. **Disconnected** (no predecessor, no successor, no constraint). ES = max(project start, today), so with no project
   start it is today. Flagged `disconnected`; its late finish is the project finish, so its float is measured
   against that.
4. **In progress.** ES = its actual `startDate`. EF = `daysLeftAsOf` + `daysLeft` working days on the **company** calendar
   (lost days do **not** apply, which is what (f) proves), and never earlier than today: a passed finish becomes today,
   flagged `days_left_stale`. With no days left entered, it falls back to the planned finish (start + duration, else the
   typed due date), flagged `days_left_missing`. **`percent_complete` is not a field of `CpTask` at all**, so the
   engine cannot read it. A complete task is fixed at its actuals and is never critical.
5. **A fixed date earlier than a predecessor allows.** The task keeps its date (`es = cal.start(constraintDate)`), and
   every predecessor whose bound exceeds it produces a `CpConflict {taskId, predecessorId, gapDays}`. In the backward
   pass a fixed successor is an **anchor**: it bounds its predecessors by its actual dates, which gives them negative
   float (critical). `not_before` is the soft form: the later of the two, and no conflict.

**Hand-worked floats** (each is a unit test): **diamond** A2→B5→D1, A2→C3→D1 gives A 0, B 0, **C 2**, D 0, chain
A→B→D, finish Wed 14 Oct. **Case 5**: A4 → B fixed Tue gives conflict gap **3**, A float **−3**. **Calendar**: Fri + 3 = Tue;
a Wed holiday makes a 3-day task Mon–Thu; a Tue lost day moves an unstarted 2-day task to Mon–Wed while an
in-progress task keeps Tue.

#### Q9 — what triggers a recompute (the full list, with the mechanism for each)

The engine is pure and runs only when called. **What makes it run** is the write-through route (Part 3) for changes made
through the app, plus the m26 `needs_recompute` mark for changes made any other way. Every staff read and the daily cron
recompute when the mark is set **or** `computed_on` is before today (company time zone).

| # | what moves a computed date | how the recompute is guaranteed | where it lives | state |
| --- | --- | --- | --- | --- |
| 1 | a task's schedule fields, status, delete/restore | `tasks_mark_schedule_dirty` (AFTER INSERT OR UPDATE; deletes are soft, so they are UPDATEs) | m26, **on production** | wired |
| 2 | adding, removing or retyping a dependency | `task_dependencies_mark_schedule_dirty` | m26, on production | wired |
| 3 | **approving** a pending foreman edit (a pending edit moves nothing) | the approval applies through the write-through route, as an ordinary task UPDATE (1) | Part 5 | to build |
| 4 | **the company working calendar** (weekdays) | `company_work_calendars_mark_schedule_dirty` marks **every CP project in the company** | m26, on production | wired |
| 5 | **company holidays** added, moved or removed | `company_holidays_mark_schedule_dirty`, **every CP project in the company** | m26, on production | wired |
| 6 | **weather (lost) days** on a project | `project_lost_days_mark_schedule_dirty`, that project | m26, on production | wired |
| 7 | an inspection's date or result | `inspections_mark_schedule_dirty` | m26, on production | wired |
| 8 | turning Critical Path on; stamping a template | the settings guard sets `needs_recompute` when `critical_path_enabled` changes; a template stamp inserts tasks (1) | m26 / Part 8 | wired / to build |
| 9 | **the passage of time** (an open task's finish is never before today; unstarted work never starts before today) | the daily cron plus the read-check on `computed_on < today` | Part 3 | to build |
| **10** | ⚠️ **NEW on resume: the project's start date** (`projects.start_date`). The engine starts unlinked and disconnected work at `projectStart`, so changing it moves dates. | **Nothing marks it today. m26 has no trigger on `projects`.** A change would sit stale until the next day's cron. | **Part 3's migration adds `projects_mark_schedule_dirty`** (only when `start_date` changes), with a live test and a sabotage | **GAP, to fix in Part 3** |

- **Service-role writes are deliberately not marked** (`auth.uid() IS NULL` is the engine's own write-through). Checked
  on resume: of the **102** files under `apps/web/app` + `lib` that use `getSupabaseAdmin`, **0** write `tasks`,
  `task_dependencies`, `inspections`, `project_lost_days`, `company_holidays` or `company_work_calendars` (control:
  **47** of them touch `profiles`, so the grep fires). There is no `supabase/functions` directory. **Residual:** a file
  that hands the admin client to a helper in another file is not caught by a same-file grep.
- The company's time zone defines "today"; a change to it is covered by the `computed_on` check (9), not by a trigger.

**Part 2 adds no migration.**

#### Part 2 pre-CI — head `a0194804`

Type-check exit **0** (`--force`, **0/5 cached**); lint exit **0** (0/1 cached); unit exit **0**, **163 files / 2,237 tests**
(= 162 / 2,208 on `main` + this file's 29), 0 cached. `main`'s run `36858654211` on `d45a2131` is **in progress**, so
Part 2's CI request waits for it (1.7).

### R.10 — The four Phase 1 findings: disposition, each verified by object

| # | finding | disposition | record and evidence |
| --- | --- | --- | --- |
| 1 | A foreman or crew assignee can write task dates directly, bypassing Part 5's approval | **Database half FIXED and on production; the held-submission half is Part 5.** On a Critical Path project, `tasks_guard_critical_path_schedule` (m26, on production, R.7) refuses a foreman's or crew assignee's write to the schedule columns with `42501`; projects without CP keep S121's rules. **RULED [Josh, 2026-10-01]: the write is held, shown grayed and marked "pending", never hidden, and never moves the computed dates.** Part 5 turns today's refusal into that held submission. Until then no production project has CP on (settings rows **0**, R.7), so the refusal reaches nobody. | Live Q12 total map 40/40 and sabotage (b) (Phase 3, Part 1); production object R.7 |
| 2 | The invoice percentage box turned 150 into 100 silently | **FIXED by Part 0-C** (in `d84cfe8b`). | Read on `origin/main`: `parsePercent` (`packages/shared/utils/invoice-line-amounts.ts:73`) returns `ok: false` for `n > 100`, and the builder imports `planBilling`, which calls it and sets `canSubmit: false`. The 0-C e2e showed "`150`% is refused with Bill disabled" (Phase 3, 0-C). |
| 3 | Delete-then-re-add of the same dependency fails "already exists" | **FIXED in Part 1 m24, on production.** | Production R.5: the old `task_dependencies_pair_key` **0**, `task_dependencies_live_pair` (partial, `WHERE is_deleted = false`) **1**. Live DEPS "delete-then-re-add works", and sabotage (d) (the old key restored) → **3 ✘**. |
| 4 | A PM or foreman changing an approved day's hours (it stayed approved) | **FIXED by Part 0-B-4** (`1c7684b9`). **Verified by object on resume, not taken from the merge message.** | PRODUCTION (read-only, a workdir linked to production): `time_clock_sessions_z_reopen_on_clock_change` **O** → `reopen_session_on_clock_change`; `time_segments_z_reopen_on_hours_change` **O** → `reopen_session_on_segment_hours`. `md5(prosrc)`: `edit_time_session_clock` `d21e1dc1`, `reopen_session_on_clock_change` `08f7507b`, `reopen_session_on_segment_hours` `03913379`. **These equal rebuild-test's and the migration file's bodies** (python, between dollar quotes). ⚠️ They differ from the report's `abe081f4 / 79b1f25d / 27f18f28` **only because those are `md5(pg_get_functiondef)`**: re-run on rebuild-test, `pg_get_functiondef` gives exactly `abe081f4, 79b1f25d, 27f18f28`. Behaviour: the 20/20 total map and sabotages (i)–(iv) (Phase 3, 0-B-4). |

The production-linked scratch workdirs (`wd1`–`wd3`) were deleted after this read. The checkout's CLI has stayed on rebuild-test
(`nmyphyhmfttxkdoposvf`) all session.

### R.11 — Open question for Josh (asked 2026-10-01), blocking Part 3's write-through

**Q19. [ASK-19] On a Critical Path project, what does a direct date change by an Owner, Admin, PM or PE do?** The engine
computes each task's dates from its duration, links and anchor, and writes them into `start_date`/`due_date` (Q9-A).
Three existing controls write those dates directly: the S121 calendar/Gantt drag (`moveCalendarEvent` →
`updateTaskDates`), the schedule sheet's dates (`components/schedule/schedule-sheet.tsx:200`), and the task form
(`task-form.tsx`, `updateTask`). Left as they are, a dragged task that has a duration **snaps back** on the next recompute,
silently.
- A) Translate the gesture into the Critical Path model, through the same server route the line sheet uses. Moving the
  start sets "starts after its links, but **no earlier than** <new date>" (`not_before`). Moving the end sets the
  **duration** to the working days from its start to the new end. The finish consequence is previewed before save. A
  foreman's or crew assignee's drag becomes a held, grayed "pending" submission under the same translation (Part 5).
- B) Moving the start pins the task ("starts **on** <date>", `fixed`). It stays there even when a predecessor slips, and a
  slip raises a conflict.
- C) On a CP project those controls become read-only, pointing to the Critical Path sheet.
- **Recommendation: A.** A drag means "not before here", a slipping predecessor still pushes the task (which is the point of
  the feature), and it is one mechanism on every surface (PARITY).

**Also stated, not asked:** `task_schedule_edits` moves from Part 3's migration to **Part 5's**, because its shape now follows the
2026-10-01 ruling (a pending edit is visible and grayed, from a foreman **or a crew assignee**). Part 3's migration carries
`task_assignees.notify_changes` (Q13-A) and the new `projects` start-date dirty trigger (Q9 item 10).

#### Q19 — Josh's answer (2026-10-01): **A**, with a load-bearing addition

Josh's reason, quoted: *"A drag means 'not before here.' … a hard pin stops a predecessor slip from pushing its successors,
which is the one thing Critical Path exists to do. Schedules in P6 and MS Project die this way — they fill up with forgotten
hard constraints until the finish date stops being a prediction and nobody notices."*

**Addition [Josh, RULED]: a constraint a drag creates must be visible and removable in one action.**
1. A task carrying a drag-created constraint is **visibly marked on the Gantt AND on the sheet**, not only in a detail panel.
2. It can be **released in one action**, and releasing it lets the engine recompute that task freely.
3. Same rule, same language and same mental model as Part 0-C's **pinned invoice lines**: a deliberate act is visibly marked
   and always reversible.

**Also ruled: the preview names WHICH edit a drag performs, before saving.** Moving the start **sets a constraint**; moving the
end **changes the task's duration**. "This moves the finish by N days" alone is not enough. The report states which of the
two each drag performed.

`task_schedule_edits` moving from Part 3 to Part 5: **accepted.**

### R.12 — Part 3 (the line sheet), build log — branch `feature/s122-p3-line-sheet`, stacked on Part 2

**Scope split with Part 4, stated:** Part 3 makes the line sheet (the existing `task-form.tsx`, one form) Critical-Path-aware,
and adds the save route, the recompute with write-through and history, the read-check, the cron, and migration `…27`. The
**drag translations of Q19** (calendar drag, schedule-sheet dates → `not_before` / duration) ship in **Part 4**, with the Gantt
drag-end and the **switch that turns Critical Path on**. No user can turn CP on before Part 4, so no production drag can
snap back in between.

- **Migration `20262127000000_s122_cp_notify_cause`** (written; **not yet applied anywhere**, because rebuild-test is held by
  CI, see 1.7):
  - `task_assignees.notify_changes boolean NOT NULL DEFAULT false` (Q13-A; created in the same migration, so Q8-A applies).
  - **The mark carries its cause**: `project_schedule_settings.recompute_cause_kind` + `recompute_cause_task_id`. The guard
    lets a user's transaction write them **only** when it is the one that sets the mark; the engine clears them.
    `mark_schedule_dirty(uuid)` is **dropped** and replaced by `(uuid, text, uuid)`, not overloaded (the S180 trap).
    ⚠️ **First cause wins** while a project stays marked: the history row names the change that **first** moved it since the
    last computation.
  - `projects_mark_schedule_dirty`: AFTER UPDATE OF `start_date`, only when it changes (**Q9 item 10**).
  - `project_finish_history_cause_check` is widened with `project_start` and `inspection` (**0 rows** on production, R.7).
- **Pure**: `packages/shared/utils/critical-path-writes.ts` holds `planWriteThrough` (what is written: scheduled → both
  dates; in progress → due only; fixed span, complete, needs-duration → nothing; **a cycle → nothing at all**),
  `previewEdit` (the engine run before and after), `describeEdit` and `editSentence` (**name the edit**: DURATION, START
  ANCHOR / release, DAYS LEFT, status, LINK, NEW TASK), and `consequenceSentence`.
- **Server**: `lib/critical-path/load.ts` is one loader for the recompute (service role) and the page (the caller); any read
  error refuses the load, because a partial graph gives wrong dates. `lib/critical-path/recompute.ts`
  **clears the mark FIRST**, then reads, computes and writes. A change landing mid-run re-marks the project; on any failure
  the mark is put back. `ensureScheduleFresh` is the read-check.
- **Route** `POST /api/projects/[id]/critical-path/tasks/[taskId]`: Zod (`validation/critical-path.ts`; `days_left_as_of`
  is never accepted from the client, the server stamps the company's today). It writes **as the caller** (RLS + the Q12
  guard decide), and recomputes only after an applied write. 42501 → 403 with the database's sentence; every error logs its
  cause.
- **Cron** `/api/cron/critical-path-recompute`, **hourly** (`20 * * * *`), not daily: "today" turns over at a different UTC
  hour in each company's time zone. A fresh project costs one settings read.
- **Page**: the read-check runs **before** the dates are read, only after the project is confirmed visible **as the caller**.
  The engine input goes to staff only (crew and subs see a subset of tasks under RLS, and a preview on part of the graph would
  state wrong dates).
- **UI** (`components/schedule/critical-path-fields.tsx` + `task-form.tsx`): duration, anchor ("After its links only" /
  "not before…" / "On a fixed date…"), days left with its as-of stamp and the percent **beside it, "shown for reference, not
  used for dates"** (never pre-filled), a per-assignee **"notify of changes"** box (a sibling of the person's label, never
  nested in it), and the preview naming each edit and then the consequence. **A pin is marked in three places, in Part
  0-C's words:** the sheet (`cp-pinned`, with **"Release — let the schedule move it freely"**, one action that saves at once),
  the task list row (`task-pinned-*`), and **the Gantt bar** (`gantt-pinned-*`). `task-form.tsx` is not Prettier-formatted on
  `main`, so it was edited by hand with no formatter.
- **Unit `s122-cp-writes.test.ts`: 18/18.** Sabotages:
  - (g) the write-through also writes an in-progress task's start → ⚠️ **first GREEN, so the test was vacuous**: a weekday
    actual start equals the engine's early start, so the wrong write changed nothing. The test now starts the task on a
    **Saturday** (early start maps to Mon05, asserted, "the trap is armed"). Re-run → **1 ✘**.
  - (h) `describeEdit` drops the anchor part → **3 ✘** (anchor, release, two-edits).
  - Each restored, `cmp` 0, 18/18.

#### Part 2 CI requested; `main` run after Part 1's merge

- **`main`'s run `36858654211`** on `d45a2131` (Part 1's merge): **green**, e2e **679 passed, 24 skipped, 1 flaky**, unit
  **162 / 2,208**.
- Then **0** in progress and **0** queued, so **Part 2 CI `36862938907`** was requested on `e4537e93` (an empty commit; base `d45a2131` =
  `origin/main`). `feature/s122-p3-line-sheet` is rebased onto it. **Migration `…27` is NOT applied to rebuild-test while that run holds
  it** (1.7).

### R.13 — Part 2 MERGED → `main` `6c91b9c1`

- CI **`36862938907`** on `e4537e93`: **green**, e2e **680 passed, 24 skipped, 0 flaky, 0 failed** (37.4 m); unit **163 files / 2,237 tests**,
  with the engine file in the log.
- S180: (1) the tested head **is** the merged head (`e4537e93`), base `d45a2131` = `origin/main` re-fetched; (2) the numbers above,
  29/29, and sabotages (a)–(c), (e) and (f); (3) **no migration**: `git diff --name-only origin/main e4537e93` →
  `apps/web/test/s122-critical-path-engine.test.ts`, `docs/sessions/S122-report.md`, `packages/shared/utils/critical-path.ts`.
- Merge commit `6c91b9c1`; `HEAD^{tree}` `29927c50…` = `e4537e93^{tree}`. Pushed. **Part 2 is on `main` and needs no production
  section** (pure TypeScript, no migration).
- `main`'s merge run follows; `feature/s122-p3-line-sheet` is rebased onto `6c91b9c1`. Migration `…27` waits until that run finishes.

#### Part 3 on rebuild-test — migration `…27`, live proofs, DB sabotages

- `main`'s run **`36867822219`** on `6c91b9c1` (Part 2's merge): **green**, e2e **680 passed**, unit 163 / 2,237. Then **0** in progress or queued.
- **rebuild-test:** the dry run listed **exactly** `20262127000000_s122_cp_notify_cause.sql`; applied. Types regenerated: **+21 / −1**, exactly
  `recompute_cause_kind`/`_task_id` (+FK), `task_assignees.notify_changes`, and `mark_schedule_dirty`'s new 3-argument signature. Type-check
  **0** (0/5 cached).
- **Live `s122-cp-recompute.live.ts`: 21/21**, then 21/21 again after the sabotages:
  - WRITE-THROUGH: A Mon05–Tue06, B Wed07–Fri09, finish Fri09, **2** tasks written, **1** history row (`enabled`). A second run writes **0**
    and logs nothing. The duration-less tasks keep their typed dates and a NULL duration (stop rule 10).
  - CAUSE: task (naming the task), dependency (naming its successor), weather, inspection, **project_start** (control: a rename **landed**
    and marked nothing), holiday, calendar, enabled (control: the notify-client switch marks nothing). **First cause wins.** A user can
    neither overwrite the cause nor clear the mark (the same UPDATE flips `notify_client`, proving it landed). The service role marks
    nothing.
  - HISTORY on Q, every date hand-worked: weather Tue06 → finish 09 → **12** (`weather`); project start → Mon12 → **16** (`project_start`);
    the same day again → `fresh`; read a week later → **23** (`time`); history = `enabled, weather, project_start, time` (**4** rows).
  - NOTIFY: a new assignee row reads **false**; a crew member's write leaves it false (service-role read); the Owner's lands.
- **Part 1's live file re-run after `…27`** (S157: its guard and mark functions were replaced): **40/40**.
- **Fixture faults found and fixed (not code):** the CAUSE control's rename logs a `project_name_history` row, which pins the project, so
  the first run's teardown failed (**after** 21/21). The second run then went **21 skipped**, because a crashed run's dependencies pinned
  its tasks; I'm not counting that run. **One `purge()` now deletes children first, in setup and teardown alike.**
- **DB sabotages** (each restored, read back):

  | # | sabotage | ✘ | read back |
  | --- | --- | --- | --- |
  | (i) | `projects_mark_schedule_dirty` disabled | **4**: item 10, the project_start history step, and the two after it that depend on it | `O` |
  | (ii) | `project_schedule_settings_guard` disabled | **3**: the enabled cause, first-cause-wins (a knock-on: CP left off), cannot-overwrite-or-clear | `O` |
  | (iii) | `notify_changes` DEFAULT `true` | **1**: NOTIFY | `false` |

  Clean re-run after all three: **21/21**.

#### Part 3 — UI proofs (production build, rebuild-test) and pre-CI

- `next build` exit **0** each time; `next start` the sole listener on :3000 (PID read with `ss`, stopped by PID, never `pkill`).
- **e2e `desktop-critical-path-sheet-s122.spec.ts`**, with A(2) → B(3) from Mon 4 Jan 2027:
  1. **Read-check:** the tasks were seeded undated, and the page showed `2027-01-06 → 2027-01-08` for B, as the DB had it.
  2. A **duration** edit is named *"Changes the DURATION: 3 working days → 5 working days."* with *"This moves the projected finish from Fri
     8 Jan to Tue 12 Jan (2 working days later)."* Nothing was written while editing (duration still 3); Save gave due 12 Jan.
  3. A **pin** is named *"Sets a START ANCHOR: pinned: not before Mon 11 Jan."* (12 → 15 Jan, 3 later). Saved, it shows on the list row
     (`Pinned · not before Mon 11 Jan`; A shows none) **and on the Gantt bar** (B yes, A no).
  4. **Release**: one click; B goes back to Jan 6–12 and the list marker is gone.
  5. History = enabled → 8, task → 12, task → 15, task → 12 (**4** rows, each naming B).
- ⚠️ **A real defect the e2e caught, fixed in the product, not the test.** Reopening a task right after a save previewed against the
  **click-time** copy of the task: the preview read *"Tue 12 Jan → Wed 13 Jan (1 working day later)"* for a change that moves it to
  Fri 15 Jan, because B's old 3-day duration was still in the sheet's state. **Fix attempt 1, keying the sheet on `updated_at`, was REJECTED
  by the next run:** the refresh landed mid-edit, the sheet remounted, and the anchor the user had typed was wiped. **Fix kept:** the save's
  refresh runs in a transition, and **the task rows are disabled until it lands**; the sheet always reads the task from the current props.
- A **test race** fixed (not product): the route writes the pin, then recomputes, and the poll on `start_constraint` read before the
  recompute. It now polls the **recomputed date**.
- **Final: 1 passed, 0 retries.** **UI sabotage:** the Gantt pin marker removed → rebuilt → **✘** (`gantt-pinned-<B>` not found, with
  retry); restored, `cmp` 0, rebuilt. **Regression:** this spec + `desktop-schedule-s121` + `m-schedule-s121` → **12 passed**, 0 flaky.
- **S157:** `test/email-warming.test.ts` pins the cron count. It went red at **15 → 16** on the new cron, so it was updated **in place**
  (superseded title and `toHaveLength(15)` quoted), and the new cron gets its own pin (path + `20 * * * *`).
- **Pre-CI:** type-check exit **0** (0/5 cached); lint exit **0** (warnings only, none in Part 3's files); unit exit **0**, **164 files / 2,256
  tests** (2,237 + 18 + 1), 0 cached.

#### Part 3 CI and PRODUCTION section 4: `20262127000000_s122_cp_notify_cause`

- **CI `36876398232`** on `168ce164` (base `6c91b9c1` = `origin/main`; 0 runs in progress or queued at request): **green**, e2e **681 passed,
  24 skipped, 0 flaky, 0 failed** (35.3 m), with `desktop-critical-path-sheet-s122` in the log; unit **164 / 2,256**.
- **Expected values** (rebuild-test, captured before; the three function bodies proven equal to the file's, python between dollar
  quotes: guard `4a1e6e10…`, `mark_schedule_dirty` `65936b7e…`, `_from_row` `5ec45279…`).
- **One-file workdir** `wd4` (all **290**; m27 the last; `cmp` 0), linked to production; checkout read back `nmyphyhmfttxkdoposvf` throughout;
  `wd4` deleted after.
- **Pre-check, PRODUCTION:** ledger `20262126000000`; `notify_changes` **0**; cause columns **0**; `task_assignees` **6** (all live). These
  receive the new column's default; the column is created in this migration (Q8-A). `project_finish_history` **0** rows (the widened
  CHECK); `project_schedule_settings` **0** rows; projects trigger **0**; `mark_schedule_dirty(p_project_id uuid)` (the old signature).
- **Dry run:** *"• 20262127000000_s122_cp_notify_cause.sql"*, **exactly one file**. **Push:** exit 0.
- **Verification:** the same read-only file run on both, then `diff`. **The only differing line is live `task_assignees`: rebuild-test 5,
  PRODUCTION 6, and 6 is production's own pre-check value.**

| object | expected | PRODUCTION | verdict |
| --- | --- | --- | --- |
| ledger ≥ 2126 | `2126, 2127` | identical | MATCH |
| `task_assignees.notify_changes` | `boolean : NOT NULL : default false` | identical | MATCH |
| cause columns | `recompute_cause_kind text`, `recompute_cause_task_id uuid`, nullable | identical | MATCH |
| cause CHECK + FK md5 | `abd986db…` | identical | MATCH |
| history cause CHECK | `… 'enabled', 'project_start', 'inspection'` | identical | MATCH |
| guard / `mark_schedule_dirty(uuid,text,uuid)` / `_from_row` md5, secdef, EXECUTE | `4a1e6e10` f/auth t; `65936b7e` t/auth f; `5ec45279` t/auth f; anon f on all | identical | MATCH ×3 |
| `mark_schedule_dirty` overloads | **1** (the old `(uuid)` is gone) | 1 | MATCH |
| `projects_mark_schedule_dirty` | `O`, def md5 `ca24bc92…` | identical | MATCH |
| notify true among live assignees | 0 (of 6) | 0 of 6 | MATCH |
| settings / history rows | 0 / 0 | 0 / 0 | MATCH |

**Section 4: MATCH ×12.** No production project has Critical Path on, so the sheet's CP mode and the recompute reach nobody until Part 4's
switch exists.

### R.14 — Part 3 MERGED → `main` `a9fba7ac`

- Merge commit `a9fba7ac`; `HEAD^{tree}` `05ff7a38…` = branch head `bc0f0a91^{tree}`. Pushed.
- S180: (1) CI `36876398232` green on `168ce164`, base `6c91b9c1` = `origin/main` re-fetched. Tree-identity exemption: `git diff --name-only
  168ce164 bc0f0a91` → `docs/sessions/S122-report.md` only; the same diff over `apps packages scripts supabase .github` returned `--quiet` exit
  0. (2) The numbers in the merge message and above. (3) `…27` is on production, MATCH ×12, **applied before the merge**.
- `main`'s merge run follows. **Part 4 starts on `feature/s122-p4-cp-tab` from `a9fba7ac`.**

### R.15 — Part 4 (the Critical Path tab), build log — branch `feature/s122-p4-cp-tab` from `a9fba7ac`. **No migration.**

- `main`'s run **`36881733622`** on `a9fba7ac` (Part 3's merge): **green**, e2e **680 passed, 1 flaky**, unit 164 / 2,256.
- **Built:**
  - `/dashboard/projects/[id]/critical-path`, in the spec's order:
    - the headline (finish; how far it moved and **what caused it**, from the history row; a cycle is reported as "A → B → A"; conflicts)
    - the **finish-date history** (never "baseline"; Q18-A — a foreman sees none)
    - the critical chain with each task's people
    - the network: the **same** `gantt.tsx`, critical red / float blue, a dashed slack ghost, **weather days drawn as bands with their icon** (ruling 9), and an **8px end handle** that is the only `touch-action: none` element
    - the float table, least first, with the flags (pinned, needs a duration, duration not set, not linked, days left missing/stale…)
    - the slip simulator (nothing saved)
    - weather days (add/remove; reason required; five icons)
    - when off, the **switch with the client-notification checkbox set at that moment** (ruling 12)
    - the Q16-A default-calendar banner
  - The pending strip is Part 5.
  - **Who sees it:** `lib/critical-path/access.ts` is the one list (Owner, Admin, PE, PM, foreman), read by the tab strip **and** the page's
    server-side gate. **Not crew:** under RLS they see only their tasks, and float from part of the graph would be wrong. **Never a client.**
  - **Placement:** appended to **Work** (Schedule · Selections · Punch List · Deliveries · **Critical Path**). Josh named the tab, not its
    place, and `desktop-selections.spec` encodes the ruled order by adjacency, so inserting it would be a ruling this build cannot make.
  - **Company settings → Working Calendar** (Owner/Admin): working weekdays and holidays (ruling 2). A change marks every CP project.
- **Q19, built:**
  - `translateMove` (pure, shared): a **move** pins "not before" and keeps the length, **even across a weekend**; an **end resize**
    changes the **duration**; a **start resize** pins **and** changes the duration; an in-progress end drag enters **days left** as of
    today; its start cannot move; complete is refused; a duration-less task's typed dates move (stop rule 10).
  - **One save path:** `lib/critical-path/save.ts`, used by the sheet's route and the new **gesture route** (`…/move`: `confirm:false` →
    the preview, nothing written; `confirm:true` → the save). "from" is the **stored** dates, never the client's copy.
  - **Every surface:** `moveCalendarEvent` routes a task on a CP project through it, so the desktop calendar, **`/m`'s day view** and
    the Gantt end handle all name the edit in the shared confirm and save only on accept. A project not on CP answers `{cp:false}` and
    keeps S121's direct write.
  - The schedule sheet writes dates only to an **undated** task (no duration), which is a Q15-A fixed span the engine leaves where it is,
    so nothing there snaps back.
- **Defects found and fixed while building:**
  1. **A dragged span counted weather days**, but the engine skips them on unstarted work, so a bar dropped on Wed came back ending Thu.
     `translateMove` now takes the lost days (unit + sabotage (k)).
  2. The move client treated a `refused` answer as a network failure (`'error' in …` matched the refusal's own `error`). The type-check
     caught it; replaced with an explicit `{ok}` wrapper.
  3. **The `/m` i18n guard** (`s110-m-i18n-guard`) went red: mounting the shared `ConfirmProvider` on `/m` brought its hard-coded
     "Cancel" and "Confirm" into `/m`. Its buttons now go through `t()` (`confirm.*`, en/es), and `/m`'s CP confirm title and label are
     translated (`sched.cp.*`). ⚠️ **The edit sentences themselves stay English** (built in the shared module, invisible to the guard):
     **filed `#1-s122p4`** in `TECH_DEBT.md`, home Part 9.
- **Unit:** `s122-cp-move.test.ts` **12/12**. Sabotages: (j) a move recomputes the duration → **2 ✘** (the one-day move and the
  weekend case); (k) weather days counted in a dragged span → **1 ✘**. Each restored, `cmp` 0.
- **e2e `desktop-critical-path-tab-s122.spec.ts`** (production build, rebuild-test, **after** `main`'s run finished): **2 passed, first
  run**. Turned on with the client box ticked (DB: enabled, `notify_client` true, finish 13 Jan, history `enabled`). Chain A→B→D, C off
  it; float C **2**, B **0**; tones and C's slack ghost. Simulator: C +3 → *"Wed 13 Jan → Thu 14 Jan (1 working day later)"*, C newly
  critical, **C's duration still 3**. Weather Thu 7 Jan ⚡: listed and drawn; finish Thu 14 Jan; *"Moved 1 working day later … caused by a
  weather day"*; history `weather`. **End handle +2 days:** the confirm reads *"Changes the DURATION: 3 working days → 5 working days."*
  and *"The projected finish stays Thu 14 Jan."*, with **duration still 3 before the accept**; after it, 5, due 13 Jan, C critical.
  Holiday Tue 12 Jan via Settings → finish Fri 15 Jan, *"caused by a company holiday"*, history `holiday`. **Foreman:** the tab renders,
  with **0** end handles, no weather form and no history. **Crew:** sent to Schedule, no tab.
  - **UI sabotage:** `moveCalendarEvent` saves without asking → rebuilt → **✘ ×2** (`confirm-dialog` not found); restored, `cmp` 0,
    `git diff --quiet` 0, rebuilt.
  - **Regression** (both CP specs + `desktop-schedule-s121` + `m-schedule-s121` + `desktop-selections` + `m-shell`): **81 passed**,
    0 flaky.
- **Pre-CI:** type-check **0** (0/5 cached); lint **0** (no warning in any Part 4 file); unit **165 files / 2,269 tests**, 0 cached.

#### Part 4 CI requested — and a slip of mine, recorded

- **CI `36889647932`** requested on `bd8005d5` (base `a9fba7ac` = `origin/main`; 0 in progress or queued).
- ⚠️ **While it ran I committed Part 5's migration (`…28`) onto the Part 4 branch and pushed it** (`c49287c7`, `[skip ci]`, so it started no
  run). Part 4 must merge with **no** migration, and its CI tests `bd8005d5`, so I moved the work to **`feature/s122-p5-approvals`** (created
  at `c49287c7`), reset Part 4 to **exactly `bd8005d5`**, and force-pushed it with a lease. ⚠️ **The force-push re-pushed `bd8005d5` as the
  branch head, whose message has no `[skip ci]`, so it started a second run, `36889899852`, on the same SHA.** The workflow's per-branch
  `cancel-in-progress` then cancels the first. Same SHA, same tree; the cost is one restarted run. **Lesson: never force-push a branch while
  its CI runs; branch off and leave it alone.**
- The report continues on **`feature/s122-p5-approvals`**.

### R.16 — Part 4 MERGED → `main` `2ae40542`

- CI **`36889899852`** on `bd8005d5` (the restarted run): **green**, e2e **683 passed, 24 skipped, 0 flaky, 0 failed** (38.7 m), unit **165 / 2,269**;
  the tab spec appears in the log.
- S180: (1) the tested head **is** the merged head (`bd8005d5`), base `a9fba7ac` = `origin/main` re-fetched; (2) the numbers above and R.15's;
  (3) **no migration** (0 files under `supabase/migrations` in the diff, of 24). Merge commit `2ae40542`; `HEAD^{tree}` `b3591c96…` = `bd8005d5^{tree}`.
- **Part 4 needs no production section.** It is visible now: the tab exists. On production no project has CP on, so the tab shows the switch.
- `feature/s122-p5-approvals` rebased onto `2ae40542`; `…28` waits for `main`'s merge run.

### R.17 — Part 5 (held schedule changes), build log — branch `feature/s122-p5-approvals` (rebased onto `2ae40542`)

- `main`'s run **`36895813091`** on `2ae40542` (Part 4's merge): **green**, e2e **683 passed**, 0 flaky.
- **Migration `20262128000000_s122_cp_schedule_edits`**, applied to rebuild-test (dry run: exactly that file) **after** that run:
  - `task_schedule_edits`: who submitted, the held `changes` (schedule columns only), a `summary` naming the edit, and the decision. One live
    pending change per task.
  - The guard: the task decides the project and company; only pending rows change; approve/reject only by
    `critical_path_schedule_editor` and **never the submitter**; withdraw only by the submitter; the decider is stamped by the database.
  - RLS: read by anyone who can see the project's tasks, **not a client**; submit by a foreman on the project or a **crew** assignee.
    (I narrowed the assignee arm from "any assignee" to `crew_member` while writing it: Part 5's table says a subcontractor does not edit.)
  - Types regenerated (+99). The deletion census was **red until `task_schedule_edits` was registered** (`deletion.ts`, `export-categories.ts`):
    the guard working.
- **Code:**
  - `applyCriticalPathSave`: for a caller who is not a schedule editor, the **changed** schedule fields are held (unchanged values are not
    changes, so a status-only save holds nothing), and **no schedule column is written**. Other fields save directly (Q12-A).
  - `decideScheduleEdit` (`lib/critical-path/held.ts`): every check the database would make comes **first**, then the apply through the one
    save path as the approver (cause `approval`; a held `days_left` keeps the submitter's as-of day), then the mark.
  - Routes: `…/edits/[editId]` (approve, reject, withdraw). The save and move routes return `held`, and **the drag confirm says "This
    change will be HELD for approval…" first, with the button reading "Submit for approval"** (translated on `/m`: `sched.cp.submit`).
- **Visible, as ruled:**
  - `lib/critical-path/pending.ts` is one loader and one stated consequence (*"If approved: …"*). A failed load **says so**
    (`pending-load-error` / `cp-pending-error`) and is never shown as "nothing pending".
  - The schedule list row stays at its dates, **grayed**, with *"PENDING Who: <the named edit> If approved: …"*.
  - The **Gantt bar** is grayed with a `pending` tag. The **sheet** opens with the pending note.
  - The **pending strip inside the Critical Path tab** [Josh] has Approve/Reject for a schedule editor who is not the submitter, and
    Withdraw for the submitter.
- **Live `s122-cp-held.live.ts`: 25/25** (rebuild-test; writes return no rows; outcomes by service role):
  - ⚠️ **LOAD-BEARING:** a foreman's duration change → `held: true`; the task row (all 8 schedule/status columns), `projected_finish`
    and the history count are **identical before and after**; exactly **1** held row, `{duration_days: 5}`, summary *"Changes the DURATION:
    3 working days → 5 working days."*.
  - A crew assignee's status **lands** and their duration is **held**. A save that changes nothing holds nothing.
  - **SUBMIT total map:** foreman and crew yes; owner, admin, PE, PM, sub (all assigned and on the task) and client no.
  - **DECIDE total map:** owner, admin, PE, PM yes (decider stamped); foreman, crew, sub, client no.
  - Nobody approves their own. Withdraw is the submitter's only. Visible to owner, PM, foreman and crew; **client 0**.
  - **APPROVE** → T Mon04–**Fri08**, finish 6 → **8 Jan**, history `approval` naming T, decided by the owner; deciding again → **409**.
    **REJECT** → the task unchanged.
- **Sabotages** (each restored and read back):

  | # | sabotage | ✘ |
  | --- | --- | --- |
  | (l) | the hold ALSO writes the change (apply on submit) | **4**, including the load-bearing one |
  | (m) | `task_schedule_edits_guard` disabled | **7**, plus 1 more after a hardening, see below; `O` read back |
  | (n) | a permissive `INSERT … WITH CHECK (true)` policy | **5**: owner, admin, PE, PM and sub could submit; dropped, **3** policies read back |

  ⚠️ **"Nobody approves their own" first stayed GREEN under (m), so it was vacuous:** the decided-CHECK refused the PM's bare `status` update,
  not the guard. Now the PM supplies `decided_at`/`decided_by` themselves, so only the guard can refuse it; re-run under (m) → **✘**. Clean:
  **25/25**.
- **e2e `desktop-critical-path-held-s122.spec.ts`** (production build): **2 passed, first run**.
  - The foreman's sheet save → the row is grayed and pending, with the named edit and *"If approved: This moves the projected finish from Wed 6
    Jan to Fri 8 Jan (2 working days later)."* The **DB dates are unchanged**: 3 days, Jan 4–6. The Gantt bar is marked pending. On the tab:
    Withdraw yes, Approve **0**.
  - The owner approves in the tab → Jan 4–8, finish *Fri 8 Jan 2027*, the strip is gone, status `approved`, history `approval`.
  - **UI sabotage:** the row's pending notice hidden → rebuilt → **✘ ×2**; restored, `cmp` 0, `git diff --quiet` 0, rebuilt.
- **Regression** (the three CP specs + `desktop-schedule-s121` + `m-schedule-s121`):
  - Parallel workers: first **2 ✘**. Part 5's approval and Part 3's pin badge were each asserted on the page right after a refresh, with the
    DB already right. **With one worker (as CI): 16 passed.** Those post-refresh assertions now get the same 20s their DB polls use.
  - Re-run in parallel: ⚠️ one invalid run of mine (Playwright started from the **repo root**, without the app's config: 5 ✘ in 111 ms,
    measuring nothing, not counted); then **16 passed** from `apps/web`.
- **Pre-CI:** type-check **0** (0/5 cached); lint **0**; unit **165 files / 2,269 tests**, 0 cached.

#### Part 5 CI and PRODUCTION section 5: `20262128000000_s122_cp_schedule_edits`

- **CI `36904560184`** on `f8a5a918` (base `2ae40542` = `origin/main`; 0 in progress or queued): **green**, e2e **685 passed, 24 skipped, 0 flaky,
  0 failed** (32.3 m), with the held spec in the log; unit **165 / 2,269**.
- **Expected** (rebuild-test, captured during CI, read-only). Both function bodies equal the file's: guard `b303fd3a…`, `set_…_updated_by` `f8eaaeeb…`.
- Workdir `wd5`: all **291** migrations, `…28` last; linked to production; checkout read back `nmyphyhmfttxkdoposvf`; deleted after.
- **Pre-check, PRODUCTION:** ledger `20262127000000`; table **0**; guard function **0**. A new table only.
- **Dry run:** *"• 20262128000000_s122_cp_schedule_edits.sql"*, exactly one. **Push:** exit 0.
- **Verification:** the same 14-line read-only file on both, then `diff` → **exit 0, every line identical**:
  - ledger `2127, 2128`
  - columns md5 `e1b957aa…` (18); constraints `c53f5dbf…` (12); indexes `ccbaadb2…` (5)
  - RLS on; policies md5 `1358d774…`: insert_submitter, select_visible, update_decider_or_submitter
  - triggers guard / set_updated_by / updated_at, all `O`
  - guard `b303fd3a…` secdef, EXECUTE auth **false**, anon **false**; `set_…_updated_by` `f8eaaeeb…`
  - rows **0**

  **Section 5: MATCH ×14.**
