# S121 — SPEC

**Commit this to `docs/specs/S121-SPEC.md` as the first action of the session.**

Every item ruled by Josh 2026-09-29 and 2026-09-30. `main` = `7cf348a0` at writing.
⚠️ **Verify that against git. This spec is a claim like any other.**

⚠️ **Nothing here is deferred.** Every item is built, or it stops with a written reason.

---

## ⚠️ FINDINGS FROM THE SPEC AUTHOR'S OWN READ — verify each before building on it

Measured on `origin/main` via the repo, 2026-09-30. **Each is a claim. Re-verify by object.**

1. **`tasks.assignee_id` is SINGULAR.** `tasks-client.ts` `createTask` takes `assignee_id?: string |
   null`; `schedule.ts` `getCalendarEvents` reads `assignee:company_members(...)`, one row.
   ⚠️ **PART 5's multi-assignee ruling is therefore a SCHEMA CHANGE with a wide ripple.**
2. **`company_members.schedule_color` ALREADY EXISTS** and already feeds `CalendarEvent.color`
   (`schedule.ts`). PART 5's colour work is a picker plus a trade mapping, not a new column.
3. **`tasks.is_scheduled` gates the calendar.** `getCalendarEvents` filters `.eq('is_scheduled',
   true)`. A task created from the schedule must set it or it will not appear.
4. **`schedule_entries`** carries `member_id`, `project_id`, `entry_date`, `end_date`, `notes`, and
   `general_kind` ∈ `project | pto | shop | other` (labels: On Site / PTO / Shop / Other).
5. **`findOverlaps` exists** (`schedule-client.ts`) — a soft, **non-blocking** double-booking warning.
   Its comment records this as a locked decision with no DB constraint. ⚠️ **Do not make it blocking.**
6. **Subcontractors and vendors ARE `company_members`** (`member_type: 'subcontractor'`), with
   `subcontractors.sub_type` ∈ `subcontractor | vendor` and `subcontractors.trade_type` carrying the
   trade. `getMembers()`'s docstring already names schedule rendering as a caller.
7. **34 of 41 member rows have no `profile_id`** (`assignment-notify.ts`). Most subs have no login.
   They are schedulable and cannot see the schedule. ⚠️ **Do not build anything that assumes a sub can
   sign in.**
8. **`task_dependencies` and `phases` already exist** with a `DependencyType`.

---

# PART 0 — HOUSEKEEPING. FIRST.

⚠️ **Nothing else starts until Part 0 is done and its findings are in the report.**

- `git fetch --prune`. State `origin/main`'s SHA and subject, and the SHA you build from.
  ⚠️ **Name the ref on every measurement in this session.** Two greps on 2026-09-29 read a feature
  branch and were reported as facts about `main`.
- Enumerate every local and remote branch with its true merge status (`--merged`, plus `git cherry`
  and a by-file diff for the rest). S120 left **11 branches kept, not merged** — expect them.
  ⚠️ **Delete nothing without proof per branch, and delete none of the 11 kept ones.**
- Worktrees: `git worktree list` must show only the main tree at the end.
- Working tree clean at the end (`git status --short` prints 0 lines).
- Read out: branches before/after, deleted, kept and why.

---

# PART 1 — MOBILE CHROME (two defects, from Josh's screenshot 2026-09-30)

## 1-A. The status-bar strip is white; it must be the header blue

On the PWA the area carrying the clock, signal and battery renders white above the dark header bar.
It should be the **same colour as the header** that carries "New sign-out".

- This is the safe-area inset plus the PWA `theme-color`. **Fix both** — a `theme-color` alone leaves
  the inset white inside the app shell, and an inset background alone leaves the OS chrome wrong.
- ⚠️ **App-wide, not one screen.**
- ⚠️ **Check it does not invert the status-bar text to dark-on-dark.** State what
  `apple-mobile-web-app-status-bar-style` is set to and what you changed it to.
- Prove on a real 402px viewport screenshot, not by reading CSS.

## 1-B. The camera button is cut off by content when scrolling

The orange camera control in the bottom bar is overlapped by form boxes as the page scrolls. **It must
be the top layer.**

- Find the stacking context that traps it. ⚠️ **State the cause before fixing it** — a z-index that
  loses, a parent with `overflow: hidden`, or a transform creating a new stacking context are three
  different defects with three different fixes.
- ⚠️ **Do not fix it by raising z-index until you have shown that z-index is the cause.**
- Prove with a scrolled screenshot at 402px on the sign-out form, which is where Josh saw it.

---

# PART 2 — THE HELD PHOTOS

⚠️ **Josh still has 30 photos that will not land in a project**, after S120 shipped the list.
[Josh, 2026-09-30: *"I still 30 photos that wont land in a project."*]

- ⚠️ **Diagnose before building.** S120's report says the list works. The photos still do not land.
  **Reproduce the failure and state the actual error** — queued-but-failing, queued-with-no-project,
  or never queued at all are three different problems.
- **RULED [Josh, ASK-16, 2026-09-30]:** *"yes, these 30 photos need to be added to a job."*
  ⚠️ **The deliverable is not a control — it is Josh's 30 photos landing on a job.** Build the
  control, and then **state explicitly whether his 30 can still be recovered by it.**
- **Build it:** from the held-photos list, select held photos, **assign them to a project**, and retry
  the upload.
- ⚠️ **The photos live on Josh's phone and you cannot reach them from here.** S120's report says so.
  You build the path; he walks it. **Write the exact steps he takes, on his phone, in the report.**
- ⚠️ **A photo held with no project is the likely case, and the 7-day sweep may already have taken
  them.** S120's report says anything held without a project for more than 7 days is swept by design.
  **State whether the sweep has taken Josh's 30. If it has, say so plainly** — he has been told twice
  they are recoverable, and a third list that is empty for him is worse than a straight answer.
  ⚠️ **If they are gone, say what would have to change so the next 30 are not.**
- The retry must report success or failure per photo. ⚠️ **Never report success for a photo that did
  not upload.**

---

# PART 3 — MATERIAL SIGN-OUT [Josh, 2026-09-30]

## 3-A. Section 1, Job → a dropdown of open jobs

Today it is not a constrained picker.

- A dropdown of **open jobs assigned to the user**.
- ⚠️ **Owner and Admin are assigned to nothing and can see every project** (`can_view_project()`).
  **Default taken [ASK-14]: Owner/Admin see all open jobs; every other role sees only their
  assignments.** Alternative not built: Owner/Admin also restricted to assignments.
- **"Open" = any project not archived and not completed.** State the exact status set you used.

## 3-B. Section 4, Receiving party → remove "Vehicle / unit #"

Delete the field. ⚠️ **State whether the column is dropped or merely hidden, and whether any existing
row holds a value** — a populated column that disappears from the form is data that silently stops
being visible. If rows hold values, **keep the column and hide the input**, and say so.

## 3-C. Section 5, Sign-out → remove "Your title", auto-fill the name

- Delete the **"Your title"** field.
- **Auto-fill the signer name** with the signed-in user's name.
- ⚠️ **RULED [Josh, ASK-15, 2026-09-30]: NOT EDITABLE.** The name is the signed-in user's and cannot
  be typed over. ⚠️ **This reverses the spec author's earlier default of "editable" — the ruling
  wins.** A foreman cannot sign for someone else; they sign as themselves.
- ⚠️ **Enforce it server-side**, not by a `readonly` attribute alone. A disabled input is a
  suggestion; the write path is the rule.

## 3-D. Photos — ⚠️ THE FORM ALREADY HAS THEM, IN THE WRONG PLACE

[Josh, 2026-09-30: *"found it. photos can be added after signature."*]

**RULED [Josh, ASK-13, 2026-09-30]: THREE required photos across the two steps.**

| step | required photos | of what |
| --- | --- | --- |
| **Release** (sign-out, page 1) | **1** | the material going out |
| **Return** | **2** | (a) the material itself, (b) **where they put it** |

- ⚠️ **This supersedes the spec author's conditional default.** A photo is required on **every**
  sign-out and **every** return, not only on damaged condition.
- ⚠️ **The return's second photo pairs with the required text box in 3-F** — the employee both
  photographs the location and writes it. **Build them as one step, not two unrelated fields.**
- ⚠️ **Verify by object what the existing post-signature photo control is** before moving anything.
  The S118 ruling was *"release photo required"* — establish whether that is this control, a
  different one on the return step, or was never built, and **state which**.
- The release photo gates page 1. The two return photos gate completing the return. **State the error
  the user sees for each missing photo**, and make the two return photos distinguishable — "add a
  photo" twice is not a usable instruction.
- ⚠️ **Enforce all three in the function, not only in the UI.** A UI-only requirement is not a
  requirement.
- ⚠️ **These are new requirements over a live table.** Existing rows have no photos. **Enforce in the
  write path for new records; do NOT add a constraint over existing production rows** (stop rule 2).

## 3-E. The external party signs on page 1

**Ruled: the external person signs on the first page, directly under the employee signature.**

- Move it. ⚠️ **State where it was.**
- ⚠️ **Both signature name fields are 16px** (S120 Part 5, ruled). Do not regress either.

## 3-F. Return page → a required "where did you put it" box

**Ruled: on the "return material" page, a REQUIRED free-text box for the employee to record where they
placed the item on return.**

⚠️ **Pairs with 3-D's second return photo.** The employee photographs the location **and** writes it.
**One step in the UI, two stored facts.** Build them together.

- Required to complete the return. ⚠️ **Enforced in the function, not only the UI.**
- ⚠️ **It is a new NOT NULL-ish requirement over a live table.** Add the column **nullable**, enforce
  the requirement in the write path, and **do not add a constraint over existing rows** (stop rule 2).

---

# PART 4 — TIMESHEETS [Josh, 2026-09-30]

⚠️ **THIS IS PAYROLL. Read the stop rules before starting.** Stop rule 3 covers payroll authority.
The rulings below are Josh's explicit authorisation for the edits this part builds; **they do not
authorise anything beyond them.**

## 4-A. The whole row opens the day breakdown

Today only the strip between the left edge and the "PAID HRS" column is clickable. ⚠️ **Keep the
existing checkbox and the "Approve week" button clickable as themselves** — a row-wide handler that
swallows them breaks approval.

## 4-B. "Details" opens a SHEET carrying the whole week

Today it opens a **page** showing only the clicked sub-row.

- A **sheet**, not a page.
- It carries **all** of that member's detail for the week: every day, hours, and daily tasks.
- **Review and approve everything from inside the sheet.**
- **Owner/Admin fully edit everything on it.**

## 4-C. Editing — the rulings

| ruling | source |
| --- | --- |
| **Approved segments ARE editable, and that stays** | [Josh, ASK-8] |
| **BOTH adding a new segment AND splitting one** | [Josh, ASK-9] — *"adding a new one makes it easy to fully edit. splitting one makes it easy when the staff member forgot to change tasks."* |
| **Every edit is audited** — who, when, old value | [Josh, ASK-10] |
| **Editing an approved segment returns it to pending, with a pop-up warning that the hours changed, and an Approve button inside that pop-up** | [Josh, ASK-11] |

- **Split** takes one segment and produces two contiguous segments at a chosen time, each able to
  carry its own task. ⚠️ **The split must not change total time.** Prove the two halves sum to the
  original, to the second.
- **Add** creates a new segment on the same day. **Default taken [ASK-9 follow-on]: no gap and no
  overlap with an existing segment — the sheet refuses it and says why.** Alternative not built:
  allowing gaps.
- ⚠️ **The completion gate still applies.** `time_segments_completion_gate_check` requires
  `completion` on any closed segment carrying a `task_id`. A new or split segment bound to a task and
  closed **must** carry it. **This is what trapped Josh on 2026-09-29 — do not reintroduce it.**
- **The audit is a new table**, not a column. It records member, segment, actor, timestamp, field, old
  value, new value. ⚠️ **Its own RLS: Owner/Admin read; nobody writes but the function.**
- ⚠️ **An edit that fails must not partially apply.** One transaction.

## 4-D. Who may edit

**Ruled: Owner and Admin** [Josh, 2026-09-30 — *"owner admin should be able to fully edit everything
on this sheet"*].

⚠️ **Note the divergence from Part 5:** the SCHEDULE is editable by owner, admin, PM **and foreman**
[ASK-5]. **Timesheets are not.** Do not carry one ruling to the other. Negative tests per excluded
role, **written without returning rows**, each with its own sabotage.

---

# PART 5 — THE SCHEDULE. The largest part. [Josh, 2026-09-29 + 2026-09-30]

## 5-A. ⚠️ DESKTOP **AND** MOBILE — three standing rulings are OVERTURNED

[Josh, 2026-09-30]: *"desktop and mobile. it is important that i can schedule staff while i am on
mobile. it is also important that they can see the details."*

⚠️ **This overturns M6M M-12, M-25 and D-24**, which ruled the mobile schedule a **list, not a grid**
("a month grid at 402px cannot carry a legible event label") and explicitly cut create/edit/assign
from mobile ("schedule-client.ts's writes are desktop flows").

- ⚠️ **Record the overturn in the report, quoting each superseded ruling.** Do not delete them.
### ⚠️ RULED [Josh, 2026-09-30]: NO MONTH GRID ON MOBILE

*"for mobile scheduling, remove full month view. only do 1-2 view if it makes sense. the calendar can
be scrollable if needed."*

- ⚠️ **The full month view does NOT exist on mobile.** This is what keeps M-12 and M-25's measurement
  honest — the 402px objection was that a month grid cannot hold a legible label, and the ruling
  removes the month grid rather than arguing with it.
- **Build a ONE-DAY or TWO-DAY column view, vertically scrollable.** At 402px a one-day column has
  the full width for a label; two days have ~190px each. **State which you built and why.**
- ⚠️ **"only do 1-2 view if it makes sense" carries a second reading — "offer only one or two of the
  views" rather than "a 1–2 day view".** The spec takes the **day-view** reading, because it is the
  only one "the calendar can be scrollable" makes sense alongside. ⚠️ **Raise it in Phase 2 with both
  readings, and do not build past it if Josh corrects you.**
- **Week on mobile:** at 402px seven columns are ~57px each, which is the same legibility failure as
  the month grid. ⚠️ **Default: no week view on mobile either.** State it in Phase 2.
- **Gantt on mobile:** ⚠️ **Default: not on mobile.** A task-bar timeline at 402px has the same
  problem. Josh ruled that staff must *see the details* — the day view carries that. State it.
- **Prove the mobile view at 402px with a screenshot.** ⚠️ **Do not ship a squeezed desktop grid.**
- **Scheduling staff from mobile must work.** That is the ruling's point.
- **Staff must be able to see the details** of what they are scheduled for.
  ⚠️ **RLS is unchanged: `schedule_entries_select_scoped` limits crew and subcontractors to their OWN
  general entries, while tasks and inspections stay project-scoped.** Do not work around it, and do
  not add a UI filter that disagrees with it.

## 5-B. Views: week / month / Gantt

Week and month **already exist** in `components/schedule/calendar.tsx`. **Gantt is new.**

**Ruled [ASK-2]: a Gantt row is ONE BAR PER TASK.** People, subs and vendors are assigned to that
task.

**Ruled [ASK-3]: dependencies are wanted but NOT required.** *"id like to be able to but it isn't
detrimental if it isn't built."* ⚠️ **Build the Gantt without dependency arrows first and merge it.
Add arrows only if the part is otherwise complete with road left.** `task_dependencies` and
`DependencyType` already exist.

## 5-C. ⚠️ MULTI-ASSIGNEE TASKS — a schema change, and the biggest risk in this spec

`tasks.assignee_id` is **singular** today. The ruling requires many.

- A **task-assignees join table** with its own RLS. ⚠️ **State the table you built.**
- ⚠️ **`assignee_id` stays until every reader moves.** Migrate readers, then decide about the column
  in a later session. **Do not drop it in this build.**
- ⚠️ **Every reader of `assignee_id` must be found and stated.** At minimum: `getCalendarEvents`
  (the task branch, including the `ownMemberId` crew self-filter), `findOverlaps`,
  `tasks-client.ts`, and the punch-list paths that speak in member ids. **A reader missed here is a
  silent disappearance from someone's calendar.**
- ⚠️ **The crew self-filter is the load-bearing one.** Today
  `if (options.ownMemberId && assignee?.id !== options.ownMemberId) continue` — with many assignees
  it becomes "is `ownMemberId` among them". **Get this wrong and a crew member either loses their own
  tasks or sees everyone's.** Negative test per arm, with sabotage.
- ⚠️ **`tasks.is_scheduled` must be set** on any task created from the schedule, or it will not appear
  on the calendar at all.

## 5-D. Click a day → the scheduling sheet

[Josh, 2026-09-30, verbatim — **build this order**]:

1. **Project**
2. **Team, or sub/vendor**
3. **A dropdown of who is assigned to the project**, with
   - **a button beside it to assign someone who is not assigned**, and
   - **free typing into the box**
4. **Assign or create a task — NOT mandatory**
5. **Dates.** The **start date auto-fills with the day clicked and is editable**, so picking the wrong
   day does not mean starting over.

- ⚠️ **"Free typing into the box" needs a ruling it has not had.** **Default taken: free text
  filters the existing list; it does NOT create a new member.** Creating a person from a schedule box
  makes untracked member rows. The "assign someone not assigned" button is the path for a real person
  who is simply not on the project. **Alternative not built: free text creates a member.**
- **Assigning someone to the project from this sheet writes a real `project_assignments` row.**
  ⚠️ **It must respect the same authority as assigning from the project page. State what that is.**
- A task chosen or created here is written with `is_scheduled = true`.
- ⚠️ **`findOverlaps` stays a warning, never a block** (its comment records this as locked).
- **Default taken: no task → a `schedule_entries` row with `general_kind = 'project'`.** That is the
  existing "On Site" shape.
- ⚠️ **Picking a task does NOT move the task's own dates** unless the user is editing the task itself.

## 5-E. Drag and resize

**Ruled [ASK-6]:** *"dragging moves the whole range. clicking the end of the bubble adjusts the end
(starting or ending day)."*

- Drag a bar → the whole range moves, **length preserved**. Prove the length is unchanged.
- Drag an **end** → that end moves; the other stays. **Both ends resizable.**
- ⚠️ **A resize must never invert the range** (end before start). State what happens when the user
  tries.
- ⚠️ **On mobile, drag must not fight page scroll.** State how you separated them.

## 5-F. Who may schedule, drag and resize

**Ruled [ASK-5]: owner, admin, PM and foreman.** ⚠️ **Not crew, not subcontractor.**

- Negative test per excluded role, **written without returning rows**, each with its own sabotage.
- ⚠️ **This differs from Part 4's timesheet authority (Owner/Admin only). Do not merge the two.**

## 5-G. Colours

**Ruled [ASK-7]:**
- **Crew auto-assign, with a colour picker on the team profile. Editable.**
- **Subs and vendors take their colour from their TRADE, not per person.** All electricians share a
  colour; all plumbers share a colour. **Not editable.**

- `company_members.schedule_color` **already exists** and already feeds `CalendarEvent.color`.
- Crew: auto-assigned, **stable per person across loads**, overridable by the picker.
- Subs/vendors: colour derives from `subcontractors.trade_type`. ⚠️ **State where the trade→colour map
  lives and what happens to a sub with no `trade_type` set.** A null trade must not render an
  invisible bar.
- ⚠️ **Contrast:** a bar's label must stay legible on every colour in the set. State how you checked.

## 5-H. Multi-day bars connect

Already supported by the data — events carry `start_date` and `end_date`, and `eventsFor()` matches
`start_date <= day && end_date >= day`. **This is a rendering change.**

- Consecutive days render as **one connected bar**, not separate bubbles.
- ⚠️ **Across a week boundary in month view** a bar must read as continuous — state how you handled
  the row break.

## 5-I. The schedule on the project overview page

- The project's schedule renders on the **project overview page**, interactive, with the same
  week/month/Gantt toggle.
- The page **already loads the data** (`getCalendarEvents({ projectId })`); it renders "Up next".
  ⚠️ **State whether "Up next" is kept, replaced, or both.**

---

# PART 6 — COST CATALOG IMPORT, +5% [ASK-17 default, taken]

[Josh, 2026-09-29]: *"import now. however, i want to add 5% to the current cost."*

⚠️ **The importer exists and is NOT on `main`.** `scripts/import-cost-catalog.mjs` (235 lines, with
`--markup-percent` and `--sql-out`) lives on `feature/s118-catalog-import`, whose **local `f9dbfb5c`
and origin `cbd2c2c1` have DIVERGED**.

- ⚠️ **Reconcile the two copies FIRST and state which won and why.** Do not merge either blindly.
- Land the script on `main`.
- **Run the import with `--markup-percent 5`.** ⚠️ **Integer cents, round half up**, as the script's
  own commit message states. **Print the worked examples** the script produces.
- ⚠️ **DRY RUN FIRST.** State the row count and a sample of before/after prices **before** writing
  anything to production.
- ⚠️ **This writes business data to production, not schema.** State the count written and spot-check
  five rows by object afterwards.

---

# PART 7 — S120 LEFTOVERS [ASK-18 default, taken]

## 7-A. `#1-s180u` — drop the dead `create_safety_incident` 6-arg overload

S120 **revoked its EXECUTE** so it is unreachable. The DROP is the remaining half.

- ⚠️ **Prove it has no caller** before dropping: grep `apps/web`, the tests and `scripts/`, and state
  the count. S120 already found 0.
- ⚠️ **A DROP is irreversible.** If anything at all references it, **stop this item** and say so.

## 7-B. The four library-only photo inputs

Four `accept="image/*"` inputs open the file library rather than the camera.

- Add `capture="environment"` where the primary intent is a fresh photo.
- ⚠️ **State each of the four by file and line, and what it captures**, before changing any.
- ⚠️ **Where a library choice is genuinely useful, keep a secondary library control** — the delivery
  damage-photo strip already does exactly this (`check-in-form.tsx`) and is the pattern to copy.
  **Do not remove library selection outright.**

## 7-C. The 11 parked branches — land the docs-only tails

⚠️ **RULED [Josh, ASK-18, 2026-09-30]: "all of s120 included."**

- **Land the docs-only report tails:** `feature/s116-report` (2 commits, 65 lines into
  `docs/sessions/S116-report.md`), `origin/feature/s110-site-visit-access` (7 commits, 255 lines into
  `S110-report.md`), `feature/s180-branch-archive` (`docs/branch-archive-2026-09-27.md`, 229 lines),
  `feature/s180-unattended` (`S180-report.md`, 516 lines). ⚠️ **`feature/s180-unattended`'s
  `TECH_DEBT.md` delta is STALE — main has moved on. Take the report files only; do NOT take its
  `TECH_DEBT.md`.**
- **`feature/s114-c5-multi-upload` — RULED [Josh, 2026-09-30]: AUDIT IT AND ADD IT.**
  17 files of real feature code (1 commit `6409738e`, the revert of `39d4a493`), parked and never
  reviewed for merge.
  ⚠️ **AUDIT FIRST, IN PHASE 1, AND REPORT WHAT IT DOES before merging a line of it.** State: every
  file it touches, whether it carries a migration, whether it conflicts with anything `main` has
  changed since it was parked, and **why it was reverted in the first place** (`39d4a493` — find the
  reason; a revert usually has one).
  ⚠️ **If the original revert reason still applies, that is a STOP for this item, not a reason to
  merge anyway.** Say so and move on.
  Otherwise: rebase onto current `main`, run its tests, CI, and merge.

- **`origin/feature/s112-staletimes-hold` — RULED [Josh, 2026-09-30]: AUDIT AND ASSESS IN PHASE 1,
  REPORT IN PHASE 2. DO NOT MERGE IT IN THIS BUILD.**
  1 commit `3b603c07`, setting `experimental.staleTimes.dynamic: 0`.
  ⚠️ **The recorded measurement says it makes revisits SLOWER** — 52ms → 369ms unthrottled, 51ms →
  2,129ms on slow 3G — which is why it was held. ⚠️ **That measurement is a CLAIM. Re-measure it.**
  Report: what the setting actually does on the current tree, the before and after numbers **measured
  the same way with the method stated**, and whether the hold still makes sense.
  ⚠️ **Assessment only. Merging it is Josh's call after he reads the numbers.**
- The superseded ones — `s112-bid-token-status`, `s112-catalog-importer`, `s112-m-loading`,
  `s112-cdn-investigation`, `s112-default-acl-guard` — ⚠️ **state whether each is now fully
  superseded on `main`, and delete only those that are, with proof per branch.**

## 7-D. NOT in this build

⚠️ **Do NOT revoke the legacy HS256 signing key.** It is `previously_used`: it verifies old tokens
and signs nothing new. **Revoking is IRREVERSIBLE** for anything still using the legacy JWT secret,
nothing in this build needs it, and the spec author recommended against it. ⚠️ **"All of S120
included" is not read as authorising an irreversible production key change.** It needs Josh's
explicit word and does not have it.

`force-dynamic` stays on all 13 routes — the S120 audit judged every one a keeper and proposed
nothing.

---

# PART 8 — HIDE PROJECT-EXECUTIVE FEATURES WHEN NO PE USER EXISTS

[Josh, 2026-09-30]: *"also want to hide all project executive features when there is no PE user."*

- When the company has **no member with the `project_executive` role**, PE-specific controls do not
  render: PE assignment pickers, the per-estimate PE assignment surface, and any PE-only column or
  filter. ⚠️ **Enumerate every surface you hid, in the report.**
- ⚠️ **THIS IS PRESENTATION ONLY AND MUST BE SAID SO IN THE CODE.** It is **not** a security control.
  The `#136` class is exactly this shape: *a gate controlling only rendering still ships the data in
  the payload.* **Do not describe this as a permission change, and do not let it be mistaken for
  one.**
- ⚠️ **CHANGE NO POLICY AND NO FUNCTION.** S120 stop rule 9 stands: **any change that narrows either
  PE read path is a stop.** Both paths — `estimates_select_project_executive` (project-assigned) and
  the S119 per-estimate assignment table — stay exactly as they are.
- **The moment a PE is created, the features appear again** with no further action. Prove both
  directions: 0 PEs → hidden; 1 PE → shown.
- ⚠️ **Count live members only.** A soft-deleted PE is not a PE.

---

# ⚠️ NOT IN THIS BUILD — Critical Path

Josh has asked for a **Critical Path** sub-tab under a project's **Work** section. ⚠️ **It is
explicitly AFTER this spec** [Josh, 2026-09-30: *"after this spec and prompt are sent to CC"*], and
the design is being worked through with him separately. **Build nothing toward it.** Recorded so it is
not mistaken for an omission.

---

# STANDING CONSTRAINTS

## Production

⚠️ **Merge to production is AUTHORISED for this list** [Josh, 2026-09-30].
Per migration: **one migration per section**, a dry run that must list **exactly one file**, push,
then **verification by object with every expected value stated.** ⚠️ A value that does not match is a
**stop**. ⚠️ **End every turn with the CLI on rebuild-test** (`nmyphyhmfttxkdoposvf`), read back —
**including a turn that stops.** ⚠️ **Never `migration repair --status reverted`.**
⚠️ **This spec does not amend CLAUDE.md.**

## CI — stack two at a time

Cut the second branch **from the first**, `[skip ci]` on the first, one run on the stacked head.
⚠️ **You cannot cancel a run** (403). ⚠️ **Never stack migration-carrying work with work that carries
none.** ⚠️ **Two deep, no more.** ⚠️ **Run the pre-CI lint and unit check before every CI request** —
`scratchpad/lint-job.sh` if it exists, otherwise the three jobs `.github/workflows/ci.yml` runs,
directly. **Never skip it.**

## Evidence

- ⚠️ **Verify by object. A prior report is a claim.** S118's report said `selection_option_images`
  was fixed; production still held the original body and a linked **client** could sign **another
  tenant's storage object.** Found only because the prompt said to check.
- ⚠️ **Write off-project negatives WITHOUT returning rows.** `.insert().select()` makes Postgres check
  the new row against the SELECT policy, which refuses it off-project — so the test passes whether or
  not the write arm exists. Count with the service role. Watch unique keys.
- ⚠️ **A test that passes on zero rows is a failure. State row counts.**
- ⚠️ **An e2e that passes on a page that never rendered is not a pass.** Assert on the rendered
  control.
- ⚠️ **Judge a deleted storage object by LISTING its folder, never by `download()`** — the CDN serves
  a removed object and S120's first probe reported every deletion as a survival, including its
  positive control.
- ⚠️ **Never truncate an inspection with `head`.**
- ⚠️ **Name the ref every measurement was taken on.**
- ⚠️ **Every sabotage restored and read back identical** — read back what you actually wrote; a
  sabotage whose anchor was reflowed never applied, and its green means nothing.
- No test deleted; every superseded assertion quoted in place.
- ⚠️ **Never reformat a file the repo does not already format.**
- `next build` must pass and the printed exit line read.

## Commits — ⚠️ THE REPO RESTARTS AND HAS LOST WORK

- ⚠️ **Commit and push after EVERY proof, every sabotage, every production section, every stop.**
  **A commit that is not pushed does not exist.**
- ⚠️ **A restart mid-part must lose at most ONE proof.** S120 recorded a slip where two results were
  held unpushed because two sections were queued in one command. **Run one section per command.**
- Commit path-scoped. ⚠️ **Never `git add -A`.**

## Stop rules

1. Any production verification value that does not match its expectation.
2. A migration adding a **constraint over existing production rows** — count on production first,
   then stop. ⚠️ **PART 3-F is exactly this shape.**
3. Anything touching refund, contract or **payroll** authority beyond PART 4's explicit rulings.
4. ⚠️ Anything weakening the Financial Visibility Floor (`#136`).
5. A dry run listing anything but the single file its section names.
6. CI red twice on the same cause.
7. ⚠️ **Any change that narrows either PE read path** (PART 8).
8. ⚠️ **Any reader of `tasks.assignee_id` left unmigrated after the join table lands** (PART 5-C) —
   a half-migrated reader is a silent disappearance from a person's calendar.
9. ⚠️ **`findOverlaps` becoming a hard block.**
10. A DROP with any surviving reference (PART 7-A).

**On any stop:** relink to rebuild-test, prove it, write the state into the report, commit, push, and
**move on to the next item. Stop the ITEM, not the session.**

## A part ships whole or not at all

⚠️ **Merge a part only when it is complete with its proofs run.** A part unfinished when you run out
of road **stops, unmerged, with a written state.** ⚠️ **Do not merge a partial feature because the
list says finish everything.** Josh's crew use production.

⚠️ **"Done" means merged and on production, or it says exactly where it stopped.**