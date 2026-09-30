# S121 — three phases: assess, approve, build

Fresh context.

**Read `docs/specs/S121-SPEC.md` first — it carries the rulings, the findings and the stop rules.
This prompt is the running order; the spec is the content.**
⚠️ **The spec is a claim like any other. Re-verify anything you build on**, including the eight
findings in its own header.

---

## ⚠️ THE THREE PHASES [Josh, 2026-09-30] — READ THIS BEFORE ANYTHING ELSE

| phase | what it is | does it build? |
| --- | --- | --- |
| **1 — ASSESS AND PLAN** | Measure the tree. Audit what is parked. Produce facts. | **No.** |
| **2 — ASK AND PRESENT** | Every question in plain text, **plus the build plan, FOR JOSH'S APPROVAL.** | **No.** |
| **3 — BUILD** | Build, prove, merge, push to production. | **Yes.** |

⚠️ **PHASE 2 ENDS WITH A STOP. You do not start Phase 3 until Josh approves the plan.**
This is not the S120 shape, where questions were posted and defaults were taken without waiting.
**Josh changed it. Post the questions and the plan, then stop and wait.**

⚠️ **Merge to production is authorised for this list — but only from Phase 3, after approval.**

---

## ⚠️ FIRST ACTION, BEFORE ANYTHING ELSE

1. Commit `docs/specs/S121-SPEC.md` (provided alongside this prompt). Push.
2. Create `docs/sessions/S121-report.md`. Commit. Push.

⚠️ **THE REPO RESTARTS AND HAS LOST WORK.** Append to the report and **push** after every finding,
every proof with its counts, every sabotage with its restore and read-back, every production section
with its verification row, and every stop.
⚠️ **A restart must lose at most ONE result. Run ONE section per command** — S120 recorded a slip
where two sections queued together left two results unpushed.

---

# PHASE 1 — ASSESS AND PLAN. BUILD NOTHING.

⚠️ **Phase 1 produces facts and tidies the repo. It writes no feature code, no migrations, and merges
nothing to `main`.** Deleting a proven-merged branch is Phase 1 work; building is not.
⚠️ **Name the ref on every measurement.** Two greps on 2026-09-29 read a feature branch and were
reported as facts about `main`.

**1.1 — Housekeeping (SPEC Part 0), in full.** ⚠️ **S120 left 11 branches deliberately kept.** Prove
merge status per branch before any deletion. Worktrees down to one. Working tree clean.

**1.2 — Verify the spec's eight findings.** `tasks.assignee_id` singular; `company_members.schedule_color`
exists; `tasks.is_scheduled` gates the calendar; `schedule_entries`' shape; `findOverlaps`
non-blocking; subs/vendors are members carrying `sub_type` and `trade_type`; most members have no
`profile_id`; `task_dependencies` and `phases` exist.
⚠️ **State each as confirmed or corrected. A correction wins over the spec.**

**1.3 — The held photos (SPEC Part 2). Reproduce the failure and state the actual error.** Josh still
has 30 that will not land. ⚠️ **State whether the 7-day sweep has already taken them.** He has been
told twice they are recoverable; if they are gone, he needs that plainly, plus what would have to
change so the next 30 are not.

**1.4 — The material sign-out photo control (SPEC 3-D).** Josh found photos can be added **after
signature**. ⚠️ **Establish by object whether that is the S118 "release photo required" control, a
different one on the return step, or whether the S118 requirement was never built. State which.**

**1.5 — Every reader of `tasks.assignee_id`.** ⚠️ **Enumerate them ALL and list them in the report.**
A reader missed here is a silent disappearance from someone's calendar. `getCalendarEvents`'s crew
self-filter is the load-bearing one. **Part 5-C cannot be planned without this list.**

**1.6 — `feature/s114-c5-multi-upload` — AUDIT IT** (SPEC 7-C). 17 files, commit `6409738e`, the
revert of `39d4a493`. State: every file it touches, whether it carries a migration, whether it
conflicts with what `main` has changed since, and ⚠️ **why `39d4a493` was reverted in the first
place.** Josh ruled it in — **but if the original revert reason still applies, say so; that is a stop
for the item, not a reason to merge anyway.**

**1.7 — `origin/feature/s112-staletimes-hold` — AUDIT AND ASSESS** (SPEC 7-C). 1 commit `3b603c07`,
`experimental.staleTimes.dynamic: 0`. The recorded 52ms → 369ms and 51ms → 2,129ms numbers are a
**claim**. ⚠️ **Re-measure, state the method, and report whether the hold still makes sense.**
⚠️ **Assessment only — do not merge it. Josh decides after reading the numbers.**

**1.8 — The catalog importer's two diverged copies** (SPEC Part 6). Local `f9dbfb5c` vs origin
`cbd2c2c1`. **State how they differ.** Do not merge either yet.

**1.9 — The pre-CI check.** Does `scratchpad/lint-job.sh` exist? If not, state the three jobs
`.github/workflows/ci.yml` runs, which you will run directly in Phase 3.

### ⚠️ END OF PHASE 1 — commit, push, relink the CLI to rebuild-test (`nmyphyhmfttxkdoposvf`), read back.

---

# PHASE 2 — ASK EVERYTHING, PRESENT THE PLAN, THEN STOP.

⚠️ **NEVER THE INTERACTIVE PICKER. NOT ONCE, NOT FOR ANYTHING.** Josh is **not notified** when a
picker appears, so the session sits idle until he happens to look.

⚠️ **Print BOTH the questions and the plan as PLAIN TEXT in your normal output** so his client
notifies him, and put both at the top of `docs/sessions/S121-report.md`. Commit. Push.

## 2.1 — The questions

**Each gets: the question, the options, your recommendation, and the one-line reason.**

### Already RULED by Josh — restate as settled, do not re-ask

1. **Owner/Admin see all open jobs** in the sign-out picker; other roles see only their assignments.
2. **The auto-filled signer name is NOT editable**, enforced server-side.
3. **Three required photos:** 1 on release, 2 on return (the material, and where they put it).
4. **The 30 held photos must land on a job.** The outcome is the deliverable, not the control.
5. **The catalog import is IN**, at `--markup-percent 5`.
6. **All of S120's leftovers are IN** — the `#1-s180u` DROP, the four photo inputs, the docs-only
   report tails, and `s114-c5-multi-upload` (audited first). ⚠️ **`s112-staletimes-hold` is ASSESSED
   ONLY. The legacy HS256 key is NOT revoked.**
7. **Mobile has NO month grid.** A one-day or two-day scrollable column view.
8. **Timesheets: Owner/Admin edit. Schedule: owner, admin, PM, foreman.** Two different authorities.

### Open — recommend and ask

9. ⚠️ **"only do 1-2 view if it makes sense" has two readings** — a **1–2 day view**, or **only one or
   two of the three views**. The spec takes the day-view reading. **Put both to Josh.**
10. **No week view on mobile?** Seven columns at 402px is ~57px each — the same legibility failure the
    month grid has. Recommend: no.
11. **No Gantt on mobile?** Same problem. Recommend: no; the day view carries "staff can see the
    details".
12. **A new or split timesheet segment must not gap or overlap** an existing one. Recommend: refuse
    it and say why.
13. **Free typing in the schedule's assignee box filters; it does NOT create a member.** Recommend:
    filter only.
14. **No task chosen → a `schedule_entries` row with `general_kind = 'project'`** ("On Site").

### Plus everything Phase 1 turned up

Above all: the held photos' real failure and whether the sweep took Josh's 30; what the existing
sign-out photo control actually is; any of the eight findings that came back **corrected**; why
`39d4a493` was reverted and whether that reason still stands; the re-measured staleTimes numbers; how
the two catalog copies differ.

## 2.2 — The plan, for approval

For **each of SPEC Parts 1 through 8**, state:
- what you will build, in one short paragraph;
- the **migrations** it needs, by name and what each does;
- what could go wrong and which stop rule covers it;
- roughly how big it is relative to the others.

⚠️ **Part 5-C — multi-assignee tasks — must carry the full reader list from 1.5 and say exactly how
each one migrates.** It is the largest risk in the build and the plan has to show it is understood.

⚠️ **Part 5-A must state which mobile view you will build and why**, with the 402px arithmetic.

## 2.3 — ⚠️ THEN STOP AND WAIT.

**Do not start Phase 3.** Post the questions and the plan, commit and push the report, relink the CLI
to rebuild-test and read back, and **wait for Josh to approve.**

⚠️ **If Josh answers a question in a way that changes the plan, revise the plan and re-present it
before building.**

---

# PHASE 3 — BUILD. ONLY AFTER JOSH APPROVES.

Work SPEC Parts 1 → 8 in the spec's order. **One part at a time, each shipped whole.**

**0 Housekeeping (done in Phase 1) → 1 Mobile chrome → 2 Held photos → 3 Material sign-out →
4 Timesheets → 5 Schedule → 6 Catalog import → 7 S120 leftovers → 8 Hide PE features.**

The small, high-value fixes reach production first, so a restart late in the session still leaves
Josh better off than he started.

### Per part

- Build it. Run its proofs with **row counts**. Sabotage every negative and restore it, **reading
  back what you actually wrote**.
- Pre-CI check before every CI request. CI **stacked two at a time** — second branch cut from the
  first, `[skip ci]` on the first, one run on the stacked head. ⚠️ **You cannot cancel a run** (403).
  ⚠️ **Never stack migration-carrying work with work that carries none. Two deep, no more.**
- Production: **one migration per section**, dry run listing **exactly one file**, push, then
  **verification by object with every expected value stated.** ⚠️ **A mismatch is a stop.**
- Merge. Then commit and push the report entry.
- ⚠️ **End every turn with the CLI on rebuild-test**, read back — **including a turn that stops.**
  ⚠️ **Never `migration repair --status reverted`.**

### ⚠️ The five that will bite

**SPEC 5-C — multi-assignee tasks is a SCHEMA CHANGE and the biggest risk here.** `assignee_id` is
singular today. ⚠️ **Keep the column; migrate readers; do not drop it this build.** The **crew
self-filter** in `getCalendarEvents` is load-bearing: get it wrong and a crew member either loses
their own tasks or sees everyone's. **Stop rule 8.**

**SPEC 5-A — mobile scheduling.** ⚠️ **No month grid.** A one-day or two-day scrollable column.
Quote each superseded M6M ruling in the report; delete none. **Prove it at 402px with a screenshot.**

**SPEC 4 — timesheets are PAYROLL.** Josh's rulings authorise these edits and nothing beyond them.
⚠️ **The completion gate is what trapped him on 2026-09-29** — a task-bound segment that closes must
carry `completion`. **Do not reintroduce it.** Split must not change total time; prove it to the
second. Every edit audited.

**SPEC 3-D and 3-F — new required fields over live tables.** ⚠️ **Columns NULLABLE, enforced in the
write path. A constraint over existing production rows is stop rule 2.** Enforce in the function, not
only the UI.

**SPEC 8 — hiding PE features is PRESENTATION ONLY.** ⚠️ **It is not a security control and the code
must say so** — the `#136` class is exactly this shape. **Change no policy and no function.**

### ⚠️ NOT IN THIS BUILD

**Critical Path.** Ruled explicitly **after** this spec. **Build nothing toward it.**
**The legacy HS256 key stays.** **`s112-staletimes-hold` is assessed, never merged.**

### ⚠️ A part ships whole or not at all

**Merge a part only when it is complete with its proofs run.** A part unfinished when you run out of
road **stops, unmerged, with a written state.** ⚠️ **Do not merge a partial feature because the list
says finish everything.** Josh's crew use production.

---

## Stop rules

1. A production verification value that does not match its expectation.
2. A migration adding a **constraint over existing production rows** (SPEC 3-D and 3-F are this shape).
3. Refund, contract or **payroll** authority beyond SPEC Part 4's explicit rulings.
4. Anything weakening the Financial Visibility Floor (`#136`).
5. A dry run listing anything but the single file its section names.
6. CI red twice on the same cause.
7. Any change that narrows either PE read path.
8. Any reader of `tasks.assignee_id` left unmigrated after the join table lands.
9. `findOverlaps` becoming a hard block.
10. A DROP with any surviving reference.
11. ⚠️ **`s114-c5-multi-upload` whose original revert reason still applies.**

**On any stop:** relink to rebuild-test, prove it, write the state into the report, commit, push, and
**move on. Stop the ITEM, not the session.**

---

## Standing evidence rules

- ⚠️ **Verify by object. A prior report is a claim.** S118's report said `selection_option_images` was
  fixed; production still held the original body and a linked **client** could sign **another
  tenant's storage object.** Found only because the prompt said to check.
- ⚠️ **Write off-project negatives WITHOUT returning rows.** `.insert().select()` makes Postgres check
  the new row against the SELECT policy, which refuses it off-project — so the test passes whether or
  not the write arm exists. Count with the service role.
- ⚠️ **A test that passes on zero rows is a failure. State row counts.**
- ⚠️ **An e2e that passes on a page that never rendered is not a pass.**
- ⚠️ **Judge a deleted storage object by LISTING its folder, never `download()`** — the CDN serves a
  removed object, and S120's first probe reported every deletion as a survival, including its own
  positive control.
- ⚠️ **Never truncate an inspection with `head`.**
- ⚠️ **Name the ref every measurement was taken on.**
- Every sabotage restored and read back identical. No test deleted; superseded assertions quoted in
  place. Never reformat a file the repo does not already format.
- Commit path-scoped. ⚠️ **Never `git add -A`.** Push after every commit.
- `next build` must pass and the printed exit line read.
- ⚠️ **This does not amend CLAUDE.md.**

---

## Final report — `docs/sessions/S121-report.md`

- **The Phase 2 questions and the plan at the top, in plain text**, with Josh's answers recorded
  against each.
- **Phase 1's findings**, each with its ref: the branch audit; the eight findings confirmed or
  corrected; the held-photos failure and whether the sweep took Josh's 30; what the sign-out photo
  control actually is; **every reader of `tasks.assignee_id`**; the `c5-multi-upload` audit including
  why `39d4a493` was reverted; the re-measured staleTimes numbers with their method; how the two
  catalog copies differ.
- **Per part:** merged with its SHA and on production, or stopped and exactly where.
- **Part 5-A:** the mobile view built, the 402px arithmetic, the screenshot, and every overturned M6M
  ruling quoted.
- **Part 5-C:** the join table, every reader migrated, and the crew self-filter proof.
- **Part 6:** dry-run counts and sample prices **before** the write; five rows spot-checked after.
- **Part 8:** every PE surface hidden, proven both directions (0 PEs → hidden, 1 PE → shown).
- **Every production section's verification row against its expectation.**
- **What a person still has to click**, and **what Josh has to decide.**