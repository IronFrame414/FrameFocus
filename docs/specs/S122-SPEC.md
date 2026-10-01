# S122 — SPEC — Critical Path

**Commit this to `docs/specs/S122-SPEC.md` as the first action of the session.**

Every item ruled by Josh 2026-09-30 against a design canvas.
⚠️ **Verify everything below against git. This spec is a claim like any other.**

## ⚠️ PRECONDITION — S121, AND IT IS SATISFIED

[Josh, 2026-09-30: *"s121 will be finished before this is built."*]

**S121 closed 2026-09-30.** `main` should be `4785835c`; all eight parts merged; production carries
`20262117000000` through `20262121000000`, each verified by object. Part 5 shipped `task_assignees`
with all 18 `assignee_id` readers migrated.

⚠️ **CONFIRM THAT AGAINST GIT IN PHASE 1 — it is a claim like everything else here.** If `main` is not
at or past that state, **stop the session** and say so rather than building around it.

⚠️ **`docs/sessions/S121-report.md` IS ON `main` AND IS REQUIRED READING.** It answers all three TBDs
below, carries the reader list, and records five corrections to this spec's own assumptions. **Where
it disagrees with this document, it wins.**

---

## ⚠️ THREE THINGS THIS SPEC CANNOT KNOW — FILL THEM IN FROM S121

The spec was written **before** S121 ran. These are deliberately blank, not oversights.

| # | what is unknown | where the answer is | what depends on it |
| --- | --- | --- | --- |
| **TBD-1** | **The task-assignees join table's name and shape.** S121's merge names it `task_assignees` (migration `20262120000000`) and says the single `assignee_id` column was **kept and kept in sync automatically**. Read the table, do not trust this line. | `docs/sessions/S121-report.md` §"Part 5", on `main` | §3's line-sheet assignment. ⚠️ **It writes to THAT table, never to `assignee_id`.** |
| **TBD-2** | **Every reader of `tasks.assignee_id`.** S121 Phase 1.5 enumerated **4 in the database and 14 in the app, each with how it moved**, and all 18 migrated in one merge. | `docs/sessions/S121-report.md` §1.5 | Every read in this build. |
| **TBD-3** | **Whether S121 extended `gantt.tsx` or replaced it.** S121 reports it **reused** the existing project-level Gantt rather than building a second. | `docs/sessions/S121-report.md` §"Part 5" | §4 renders into it. |

⚠️ **Resolve all three in Phase 1, quote the report, and state each answer before designing against
it. Where the report disagrees with this spec, the report wins.**

---

## What already exists — verified on `origin/main` 2026-09-30, BEFORE S121. Re-verify.

- **`task_dependencies`** with all four types (`finish_to_start`, `start_to_start`,
  `finish_to_finish`, `start_to_finish`), and a **service-layer cycle guard** — a DFS reachability
  check in `tasks-client.ts` `createDependency`. ⚠️ **DB enforcement is logged as tech debt and does
  NOT exist.** A cycle written by any other path is not stopped.
- **`phases`** + `rollupPhases()`, computed at read, never stored.
- **`tasks`**: `start_date`, `due_date`, `percent_complete`, `status`, `priority`, `phase_id`,
  `is_scheduled`.
- **`gantt.tsx`** already draws dependency arrows.
- **`inspections`**, project-scoped, `scheduled_date`, `result`.
- ⚠️ **Most `company_members` rows have no `profile_id`** — subs and vendors are directory entries
  that cannot sign in. **Load-bearing for §6: email is the only channel that reaches them.**
  ⚠️ **An earlier "34 of 41" figure in this project is STALE — S121 said so. Count it yourself and
  state the number.**

## ⚠️ FIVE CORRECTIONS S121 MADE TO THIS SPEC'S ASSUMPTIONS — the report won, and it wins again

1. **`tasks.is_scheduled` is COMPUTED from the task's dates and cannot be set.** A task reaches the
   calendar by having dates. ⚠️ **Anything here that implies setting that flag is wrong.**
2. **A project-level Gantt already existed** and S121 reused it. Do not build a second.
3. **`subcontractors.trade_type` is FREE TEXT with no fixed list of values.** Any trade-keyed map
   must handle an arbitrary string and a null.
4. **Trade and person colours ALREADY SHIPPED in S121** — crew auto-assigned with a picker on desktop
   and mobile, subs and vendors coloured by trade, a missing trade rendering a visible neutral grey,
   and a contrast test over every colour. ⚠️ **Critical Path inherits this. Do not rebuild it.**
5. **The mobile schedule is a ONE-DAY scrollable column**, not a grid — M-12/M-25/D-24 were overturned
   by ruling and the month grid was removed rather than shrunk. §9 must match that shape.

---

# PART 0 — HOUSEKEEPING. FIRST.

Standard: `git fetch --prune`, state `origin/main`'s SHA, enumerate branches with true merge status,
delete nothing without per-branch proof, worktrees down to one, working tree clean.
⚠️ **Name the ref on every measurement in this session.**

⚠️ **Plus: confirm S121 merged and on production.** State its merge SHA and its production migration
list. **If S121 is not fully landed, STOP THE SESSION.**

---

# PART 0-B — CLEANUP AND SMALL FIXES. SHIPS FIRST.

⚠️ **This part is small, independent of Critical Path, and MERGES BEFORE IT.** Critical Path is large
and may run out of road; these must not be hostage to it. **One CI run, one merge, then move on.**

## 0-B-1. Branch deletions — with per-branch proof, every SHA archived

- **The four docs-tail branches**: `s110-site-visit-access`, `s116-report`, `s180-branch-archive`,
  `s180-unattended`. S121 proved their content is on `main`. ⚠️ **Re-prove it per branch before
  deleting. Do not take S121's word or this spec's.**
- **`origin/feature/s112-staletimes-hold`** — ⚠️ **RULED DELETE [Josh, 2026-09-30]**, reversing the
  earlier "keep it parked."
  **Record the reason in the archive so nobody re-proposes it:** it sets
  `experimental.staleTimes.dynamic: 0`, switching off Next's client router cache so every
  back-navigation refetches. Re-measured at S121: **49→301 ms unthrottled, 47→798 ms Fast 3G,
  49→2,308 ms Slow 3G.** Crew are on LTE at jobsites.
  ⚠️ **The symptom it addressed is already solved better** — the app refreshes after mutations
  (`global-clock-button.tsx`, and its comment says so). **Deleting the branch closes the solution, not
  the symptom: if stale data after a back-navigation is ever reported, the fix is a `router.refresh()`
  on that path, never disabling the cache globally.**

## 0-B-2. `app/m/schedule/scroll-to-today.tsx` — delete

Unused since S121's one-day column replaced the month list. ⚠️ **Prove zero importers before deleting.**

## 0-B-3. Regenerate `scripts/.db-expected.json`

⚠️ **NOT A FOOTNOTE.** It predates `20262117`–`20262121`, and it is the **drift detector's baseline** —
the thing that catches production diverging from the repo. A stale baseline means the detector is
either silent or crying wolf. **Regenerate, and state the before and after counts.**

## 0-B-4. The session clock edit must match the week sheet

The older clock-in/out edit path does **not** reopen an approved day. S121's week sheet **does**.

⚠️ **Two paths writing the same payroll data under different rules is the divergence problem.** The
week sheet's behaviour is correct — it is what stops an approval meaning something other than the
hours it approved. **Make the old path match**, including the hours-changed pop-up with its Approve
button, and the `time_edit_logs` audit entry.
⚠️ **This is payroll. Keep the completion gate. Negative tests per excluded role.**

## 0-B-5. Photo markup — the back link returns where the user came from

Today it is hard-coded to Files. The screen is reachable from **both** Files and Photos.

⚠️ **RULED [Josh, 2026-09-30]: "Go back to where you came from."** A `from` parameter, exact in every
case. The alternative — deciding by the file's category — was **rejected**.

⚠️ **THE PARAMETER IS USER-SUPPLIED. Validate it against a known set of destinations with a safe
fallback; never redirect to whatever it holds.** `lib/safe-next.ts` already solves exactly this shape
for `?next=`. **Use it. Do not write a second one** — a second implementation that "does the same
thing" is the divergence written in a form that looks like agreement.

## 0-B-6. Mobile Settings reads "Owner crew"

`app/m/settings/page.tsx` renders `profiles.role` and `company_members.member_type` **side by side in
identical grey mono text**, with nothing saying they are different kinds of thing.

⚠️ **`member_type` permits exactly two values — `crew` or `subcontractor`** — so **every owner, admin,
PM and foreman reads "crew".**

⚠️ **This is customer-facing on first run.** A new owner's first visit to mobile Settings appears to
demote them. It already produced one support conversation with a live customer.

Fix: **label the two fields** (`Role: Owner` / `On the roster as: Crew`), **or drop `member_type` from
Settings entirely** — it tells a signed-in owner nothing, and the Team screen still uses it for
filtering where it belongs. **State which you chose and why.**

## ⚠️ NOT in this part

`#181` stays filed. The legacy HS256 key is not revoked. `NEXT_PUBLIC_APP_URL`'s capitalisation is
filed, not fixed — lowercasing it is a redeploy that touches every link the app builds.

---

# PART 0-C — INVOICE LINE ITEMS: BILL A DOLLAR AMOUNT [Josh, 2026-09-30]

⚠️ **MONEY CODE. It ships SECOND, after 0-B, and MERGES ON ITS OWN — never folded into 0-B's merge.**
0-B is a fast, no-migration cleanup; this is invoicing and gets its own proofs and its own CI.

**What Josh asked for:** on a project's invoice, click a contract line's THIS INVOICE figure and type
an amount — `$42,763.00` becomes `$20,000`, and that is what bills. Today the only control is
*"Bill N % of each line."*

## ⚠️ IT IS MOSTLY A UI GAP, NOT A MODEL CHANGE — verify this first

`EstimateLineSelection` in `lib/services/invoices-client.ts` **already carries a per-line dollar
amount**, with this comment:

> `/** The portion of this line's REMAINING that this invoice bills. */`
> `amount: number;`

And **Josh already ruled the concept at S97**: *"A lower dollar amount on a line means BILLING LESS OF
THAT COST — the unbilled remainder stays available for a later invoice. It is NOT a discount."*

⚠️ **The model, the ruling and the write path all exist. Only the percentage control shipped.**
This is the same shape as the S97 note about the draw being built while line-item billing was not —
**the gap survived a clean test pass because the tests covered the half that existed.** Expect the
same here: a test suite that passes today proves nothing about this.

## What the existing code already handles — confirm each, do not rebuild it

- `remaining = sell − Σ billed_amount on live invoice_lines` is **derived, never stored**. A partial
  bill leaves the rest available with no bookkeeping, and a void returns it with no cleanup step.
- ⚠️ **A DATABASE CONTRACT CEILING refuses an over-bill**, and `billEstimateLines` writes lines **one
  at a time deliberately** so a refusal names the offending line rather than rejecting the batch.
  **Do not batch these writes.**
- A typed dollar figure is **more precise** than a percentage: 100% of `$53,453.75` yields fractional
  cents; `$20,000` does not.
- `partialClaimAmount(remaining, percent)` takes the percentage of what is **REMAINING**, not of the
  original.

## ⚠️ THE RULED INTERACTION — THE PERCENTAGE STAYS

[Josh, 2026-09-30: *"you decide what happens to the %. dont remove the % option from here"*]

- **The percentage is a BULK SETTER.** Applying it sets every selected line that is **not pinned**.
- **Typing a dollar amount PINS that line.** It holds that figure.
- ⚠️ **CHANGING THE PERCENTAGE AFTERWARDS DOES NOT OVERWRITE PINS. This is the load-bearing rule.**
  A typed amount is a deliberate act; a bulk percentage is a convenience, and the deliberate thing
  wins. The alternative silently destroys a number chosen on purpose, and it would only be noticed
  **after the invoice went out.** **Test this explicitly, with a sabotage.**
- **A pinned line is visibly marked and can be RELEASED** back to the percentage. The state is always
  reversible and always legible.
- **The percentage's label says it applies to unpinned lines**, so it never claims to describe
  something it does not control.

## What this part must still decide and state

- ⚠️ **Cap the entry at the line's remaining, IN THE UI.** The database will refuse an over-bill, but
  a user should not fill a form and receive a constraint error. **Show the remaining as the ceiling,
  and state what happens when they type past it.**
- **Money input handling: integer cents, no silent truncation, no float drift.** State the mechanism.
- ⚠️ **The whole-estimate discount line still goes on LAST**, so the ceiling reports against the line
  that caused an over-bill rather than being masked by a credit inserted earlier. **Do not reorder
  it.**
- ⚠️ **A partial bill is NOT a discount and must never present as one** — S97's ruling, in Josh's
  words. Prove the remainder is still available on a later invoice.

## Proofs

- Type an amount below remaining → that amount bills, the remainder survives to a second invoice.
- Type an amount above remaining → refused **before** submission, with the ceiling stated.
- Pin a line, then change the bulk percentage → **the pin survives.** Sabotage it and prove red.
- Release a pin → the line returns to the percentage.
- ⚠️ **State row counts and dollar totals on every arm.** A billing test that passes on zero lines is
  a failure.

---

# PART 1 — THE SCHEMA

## 1-A. Duration on a task

⚠️ **This is the missing piece that makes everything else possible.** A task today has two typed
dates and no length, so nothing can recompute when a predecessor moves.

- Add a **duration in working days** to `tasks`. **Nullable** — existing rows have none.
  ⚠️ **No constraint over existing production rows** (stop rule 2).
- ⚠️ **Where a task already has `start_date` and `due_date`, do NOT backfill duration by subtracting
  them.** Those dates were typed by hand against no calendar, so the difference is calendar days, not
  working days, and a silent backfill would produce wrong durations that look authoritative.
  **State how many rows have both dates and leave them null**; the UI asks when the user first opens
  the task.

## 1-B. How a task is anchored — the hybrid [ruling 1 + ruling 10]

Each task carries exactly one of:

1. **"Starts after &lt;X&gt;"** — a dependency. `X` is a task **or an inspection** (ruling 3).
2. **"Starts on &lt;date&gt;"** — a fixed date. The task does not move.
3. **"Starts after &lt;X&gt;, but no earlier than &lt;date&gt;"** — both. [Josh, ruling 10]
   Real case: an inspection that waits on drywall and also cannot beat the county's earliest slot.

- ⚠️ **Inspections as dependency targets means the picker spans two tables.** State how you modelled
  it. A `task_dependencies` row points at `predecessor_id` — say whether an inspection becomes a row
  in `tasks`, or the dependency gains a target-type, and **why**.
- ⚠️ **The cycle guard must cover the new shape.** It is service-layer only today. If inspections
  enter the graph, they enter the cycle check too.

## 1-C. The working calendar — COMPANY SETTINGS [ruling 2]

[Josh: *"This will vary by company."*]

- Working days of the week, plus a holiday list. **Company-scoped, not per project.**
- ⚠️ **Every computed date honours it.** A duration of 3 working days starting Friday ends Tuesday.
- ⚠️ **State the default for a company that has never set one**, and make sure an unset calendar does
  not silently mean "7 days a week."

## 1-D. Weather days [ruling 9]

- Mark a **date or range** as lost on a project. Everything **unstarted** shifts.
- ⚠️ **A reason is REQUIRED**, and it carries a **weather icon the user selects** — rain, lightning,
  snow, wind, heat. [Josh]
- ⚠️ **That icon renders on the schedule** as the visual explanation of why the day was lost. It is
  not a hidden audit field; Josh asked for it to be seen.
- ⚠️ **A lost day does NOT move a task already in progress or complete.** State how you decided what
  "unstarted" means against `status`.

## 1-E. The finish-date history [ruling 5 — this REPLACES a baseline]

⚠️ **Josh ruled NO BASELINE.** *"there are too many moving parts and other people thing rely on."*

Instead: **a log row each time the projected finish changes**, carrying the new date, the previous
date, the **task that caused the change**, and when.

- ⚠️ **Written by the engine, not by a user.** Its own RLS: Owner/Admin/PM read, nobody writes but
  the function.
- ⚠️ **This is what answers "when did this move and why."** Without it, a client watching the portal
  sees a date silently rewrite itself and there is no record. **Do not skip it because it is not a
  screen.**

---

# PART 2 — THE ENGINE

## 2-A. Forward pass, backward pass, float, critical path

- **Forward pass** → earliest start and earliest finish for every task.
- **Backward pass** → latest start and latest finish.
- **Total float** = latest start − earliest start. **Critical = zero float.**
- ⚠️ **Computed at read, never stored** — the same rule `rollupPhases()` already follows. A stored
  float goes stale the moment anything moves, and a stale float shown as fact is worse than none.
- ⚠️ **Honour the working calendar and weather days throughout.**
- ⚠️ **A task with a fixed date (§1-B option 2) is an anchor**, not a computed node. State how it
  participates.

## 2-B. ⚠️ The cases that will break it — handle each and say how

1. **A task with no duration** (every existing row). It must not crash the pass or silently become
   zero-length.
2. **A cycle.** The guard is service-layer only. A cycle reaching the engine must be **reported, not
   hung** — an infinite loop in a page render is the failure mode.
3. **A disconnected task** with no dependency and no fixed date.
4. **An in-progress task.** [ruling 13] ⚠️ **Remaining time is ENTERED, never derived from
   `percent_complete`.** Trim work is not linear; a derived figure would quietly lie. **Show the
   percentage beside it; never compute from it.**
5. **A task whose fixed date is earlier than its predecessor's finish.** A real conflict — surface it,
   do not silently pick one.

## 2-C. Prove the engine before any UI

⚠️ **Unit tests against hand-worked examples, with the expected float stated per task.** Include a
diamond (two parallel branches rejoining) — that is where a naive implementation reports the wrong
critical path. **State the row counts.**

---

# PART 3 — THE LINE SHEET [ruling 11 + ruling 13]

Click a task line → a sheet with its detail.

- Title, duration in working days, the §1-B anchor, phase, status, percent complete.
- **Assign it to someone.** ⚠️ **TBD-1: this writes to S121's task-assignees join table, NOT
  `tasks.assignee_id`.**
- **Per assignee, a control: notify this person of changes?** [Josh] ⚠️ **Per line, per assignee. Not
  a blanket rule, not a company setting.**
- **Change the number of days needed** — this is ruling 13's first path for extending a task.
- ⚠️ **Every change shows its consequence before it is saved:** "this moves the finish to &lt;date&gt;."

---

# PART 4 — THE CRITICAL PATH TAB

**Projects → Work → Critical Path**, a new sub-tab. [Josh, 2026-09-30]

The design canvas is the reference for layout. In order down the page:

1. **The headline answer** — projected finish, how much it moved, and **what caused it.** Not a chart
   first. This is what the tab is opened for.
2. **The finish-date history** (§1-E) beside it — how the date has moved, with a link to the full log.
   ⚠️ **NOT labelled "baseline."** Josh ruled that out.
3. **The pending-approval strip** (§5) when one exists.
4. **The critical chain** — the zero-float tasks left to right, each with its owner.
5. **The network chart** — critical in red, float in blue, a dashed ghost showing how far a task can
   slide. ⚠️ **TBD-3: extend `gantt.tsx` as S121 left it.**
6. **The float table** — least float first.
7. **The slip simulator** — "if X slips N days, finish becomes Y", **nothing saved until applied.**
   It must also say **which tasks would newly become critical.**

## 4-A. Extending a bar by dragging its end [ruling 13, second path]

⚠️ **Clicking the END of a bar and dragging extends it.** Same effect as changing the days in the
sheet. **Both paths required.**
- ⚠️ **Must not fight page scroll on touch.** State how you separated them.
- ⚠️ **A drag by a foreman is a submission, not an edit** (§5).

---

# PART 5 — EDITING AND THE FOREMAN APPROVAL FLOW [ruling 7]

| role | may do |
| --- | --- |
| Owner, Admin, PM | edit freely |
| **Foreman** | **submit an edit — it requires approval** |
| crew, subcontractor, client | no edit |

- ⚠️ **A pending edit does NOT move the projected finish.** [Josh] The date **stays put**, with a
  visible note that a change is pending, **and the consequence stated beside it** — "if approved,
  finish becomes &lt;date&gt;."
- ⚠️ **The approval lives INSIDE the Critical Path window and is visible in the UI.** [Josh]
  Not a notifications list, not a separate screen.
- The pending edit records who submitted it, what they changed, and when.
- Negative test per excluded role, **written without returning rows**, each with its own sabotage.
- ⚠️ **Prove a foreman's submission cannot move the date before approval.** That is the load-bearing
  test of this part — it is what stands between the field and a date a client can see.

---

# PART 6 — NOTIFICATIONS [ruling 11, revised]

⚠️ **THE EARLIER TWO-WEEK-WINDOW RULE IS WITHDRAWN.** Recorded rather than deleted so nobody
re-applies it. _Superseded, quoted: "only people with assigned tasks in the next 2 weeks are
notified; the approver is told that nobody assigned more than 2 weeks out will be notified."_

**The rule now:** notification is chosen **per line, per assignee**, in the §3 sheet.

- **Assignees WITH accounts → notified in-system.**
- ⚠️ **Assignees WITHOUT accounts → notified BY EMAIL.** [Josh]
  ⚠️ **This is the MAJORITY case — most member rows have no `profile_id`** (count it; the old "34 of
  41" figure is stale). A notification design
  that only writes in-app rows reaches almost none of the subs. **`assignment-notify.ts` already
  resolves member → profile and already reports the three reachability states** (`profile`,
  `email-only`, `unreachable`). **Use it. Do not build a second resolver.**
- ⚠️ **An `unreachable` assignee — no login and no email — must be reported to whoever saved the
  change**, not silently dropped.

## 6-A. Client notification — a checkbox at setup [ruling 12]

[Josh: *"When starting to build the critical path, give user a check box to decide is the Client will
be notified."*]

- Set when Critical Path is **first turned on for a project**. Changeable afterwards.
- ⚠️ **This supersedes the earlier default of "the client is never notified."**
- ⚠️ **State what the client's notification says.** It must carry §7's disclaimer; a bare "your
  finish date changed" email is the thing that generates the call Josh does not want.

---

# PART 7 — THE CLIENT PORTAL VIEW [ruling 8]

⚠️ **Only when Critical Path is turned on for that project.**

**What the client sees:**
- **Phase names with their dates**, and **task titles only** underneath. [Josh]
- **A projected finish date.**
- ⚠️ **A REQUIRED DISCLAIMER, in Josh's own framing:** the construction industry is fluid and
  dynamic; these dates and figures are for planning purposes and cannot be guaranteed.

**What the client must NEVER see:**
- ⚠️ **FLOAT. Ruled explicitly.** It tells a client exactly how much slack exists, which is ammunition
  in any conversation about acceleration or credit.
- Which tasks are critical. Assignees. Descriptions. Notes. Durations. The finish-date history.

⚠️ **THIS IS THE `#136` FAILURE CLASS AND IT MUST BE ENFORCED IN THE DATA, NOT THE RENDER.**
A gate that only controls rendering still ships float in the RSC payload. **The client's read path
returns a narrowed shape that never contains float.** Prove it by inspecting the payload, not the
screen.
- Negative test: a linked client reads the portal and gets **zero** float values, **zero** assignee
  names, **zero** critical flags. Written without returning rows, with its own sabotage.
- ⚠️ **An unlinked client (the control) reads nothing.** Both halves, per the S164 pattern already in
  the repo — the control is the fragile one.

---

# PART 8 — TEMPLATES [ruling 6]

Save a finished network as a template; stamp it onto a new job.

- A template carries **tasks, durations, dependencies and phases** — the shape of the work.
- ⚠️ **It carries NO dates, NO assignees, NO percent complete.** Those belong to a job, not a pattern.
- Stamping asks for **one start date** and computes the rest.
- Company-scoped, with its own RLS. **Owner/Admin create and delete; anyone who may edit a network
  may stamp one.**
- ⚠️ **Stamping onto a project that already has tasks must not silently merge.** State what happens.

---

# PART 9 — MOBILE

The canvas's phone board is the reference. **One question: what is holding up the job right now.**
- The running critical task, the next two behind it, and how many tasks have room.
- ⚠️ **No Gantt at 402px** — the same measurement that removed the month grid in S121 applies.
- Extending a task from the phone follows ruling 13's sheet path, not the drag path.

---

# STANDING CONSTRAINTS

## Production

⚠️ **Merge to production authorised for this list** [Josh, 2026-09-30].
**One migration per section**, a dry run listing **exactly one file**, push, then **verification by
object with every expected value stated.** A mismatch is a **stop**. ⚠️ **End every turn with the CLI
on rebuild-test** (`nmyphyhmfttxkdoposvf`), read back. ⚠️ **Never `migration repair --status
reverted`.** ⚠️ **This does not amend CLAUDE.md.**

## CI

Stack two at a time — second branch cut from the first, `[skip ci]` on the first, one run on the
stacked head. ⚠️ **You cannot cancel a run** (403). **Never stack migration work with non-migration
work. Two deep, no more.** Run the pre-CI lint and unit check before every CI request.

## Evidence

- ⚠️ **Verify by object. A prior report is a claim.**
- ⚠️ **Write off-project negatives WITHOUT returning rows.** Count with the service role.
- ⚠️ **A test that passes on zero rows is a failure. State row counts.**
- ⚠️ **An e2e that passes on a page that never rendered is not a pass.**
- ⚠️ **Judge a deleted storage object by LISTING its folder, never `download()`.**
- ⚠️ **Never truncate an inspection with `head`.**
- ⚠️ **Name the ref every measurement was taken on.**
- Every sabotage restored and read back identical. No test deleted; superseded assertions quoted in
  place. Never reformat a file the repo does not already format.
- Commit path-scoped. ⚠️ **Never `git add -A`.** Push after every commit.

## Stop rules

1. A production verification value that does not match its expectation.
2. A migration adding a **constraint over existing production rows** — §1-A is this shape.
3. Refund, contract or payroll authority.
4. Anything weakening the Financial Visibility Floor (`#136`).
5. A dry run listing anything but the single file its section names.
6. CI red twice on the same cause.
7. ⚠️ **S121 not fully merged and on production — stop the SESSION, not the item.**
8. ⚠️ **Float reaching the client's payload** (§7). Not a rendering bug; a disclosure.
9. ⚠️ **A foreman's pending edit moving the projected finish** (§5).
10. ⚠️ **A backfilled duration derived from existing dates** (§1-A).
11. ⚠️ **A cycle hanging the engine rather than being reported** (§2-B).

**On any stop except 7:** relink to rebuild-test, prove it, write the state into the report, commit,
push, **move on. Stop the ITEM, not the session.**

## A part ships whole or not at all

⚠️ **Merge a part only when it is complete with its proofs run.** A part unfinished when you run out
of road **stops, unmerged, with a written state.**

⚠️ **"Done" means merged and on production, or it says exactly where it stopped.**