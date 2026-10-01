# S122 — Critical Path, plus the S121 cleanup

Fresh context.

**Read `docs/specs/S122-SPEC.md` first — it carries the rulings, the findings and the stop rules.
This prompt is the running order; the spec is the content.**
⚠️ **The spec is a claim like any other. Re-verify anything you build on**, including its own
"five corrections" list.

---

## ⚠️ THE THREE PHASES [Josh's model]

| phase | what it is | does it build? |
| --- | --- | --- |
| **1 — ASSESS AND PLAN** | Measure the tree. Read S121's report. Produce facts. | **No.** |
| **2 — ASK AND PRESENT** | Every question in plain text, **plus the build plan, FOR JOSH'S APPROVAL.** | **No.** |
| **3 — BUILD** | Build, prove, merge, push to production. | **Yes.** |

⚠️ **PHASE 2 ENDS WITH A STOP. Do not start Phase 3 until Josh approves the plan.**
⚠️ **Merge to production is authorised for this list — but only from Phase 3, after approval.**

---

## ⚠️ FIRST ACTION — BEFORE ANYTHING, INCLUDING READING

**Confirm no other Claude Code session is live in this checkout.** Run `ListAgents`. If a peer session
exists, **stop and say so** — two sessions in one checkout raced toward a single production migration
on 2026-09-30 and only stopped because one of them checked.

Then:
1. `git fetch --prune`. State `origin/main`'s SHA and subject, and the SHA you build from.
   ⚠️ **Name the ref on every measurement in this session.**
2. Commit `docs/specs/S122-SPEC.md` (provided alongside this prompt). Push.
3. Create `docs/sessions/S122-report.md`. Commit. Push.

⚠️ **THE REPO AND THE NETWORK BOTH RESTARTED SEVERAL TIMES ON 2026-09-30.** Append to the report and
**push** after every finding, every proof, every sabotage with its read-back, every production
section, and every stop. **Run ONE section per command.** A commit that is not pushed does not exist.

---

# PHASE 1 — ASSESS AND PLAN. BUILD NOTHING.

**1.1 — Confirm S121 landed.** `main` should be `4785835c` or later, with `20262117000000` through
`20262121000000` on production. ⚠️ **If it has not, STOP THE SESSION.**

**1.2 — ⚠️ READ `docs/sessions/S121-report.md` ON `main`. REQUIRED.** It answers the spec's three TBDs
and records five corrections to the spec's own assumptions. **Where it disagrees with the spec, it
wins — say so explicitly when it does.**

Resolve and state, from it:
- **TBD-1** — the task-assignees table's real name and shape. ⚠️ **Read the table; do not trust the
  merge message.** Whether `tasks.assignee_id` survives, and whether it is kept in sync.
- **TBD-2** — every reader of `tasks.assignee_id` (S121 found 4 in the database, 14 in the app) and
  which shape each ended up in.
- **TBD-3** — whether the project-level Gantt was extended or replaced, and where it lives.

**1.3 — Verify the five corrections.** `is_scheduled` computed not settable; a Gantt already exists;
`trade_type` is free text; the old "34 of 41 members" figure is stale (**count it and state the real
number**); trade and person colours already shipped; the mobile schedule is a one-day column.

**1.4 — Housekeeping.** Enumerate every local and remote branch with its true merge status.
⚠️ **Delete nothing in Phase 1.** Part 0-B does the deletions, with proof, in Phase 3.

**1.5 — Part 0-B's targets.** Confirm each exists and is what the spec says: the five branches,
`scroll-to-today.tsx` and its importers, `.db-expected.json`'s staleness, the two clock-edit paths,
the photo markup back link, and the mobile Settings "You" block.

**1.5b — Part 0-C's premise.** ⚠️ **The spec claims `EstimateLineSelection.amount` already exists and
that only the UI is missing. Verify it.** State: the interface as it stands, what the invoice grid
sends today, where the contract ceiling lives, and whether `billEstimateLines` still writes one line
at a time. ⚠️ **A passing test suite proves nothing here** — S97's line-item gap survived a clean
pass because the tests covered the half that existed.

**1.6 — The pre-CI check.** Does `scratchpad/lint-job.sh` exist? If not, name the jobs
`.github/workflows/ci.yml` runs, which you will run directly.

**1.7 — ⚠️ CI CONCURRENCY — read this before planning any CI.** S121 proved that **two runs against
the shared rebuild-test database corrupt each other's fixtures.** Three reds on 2026-09-30 each
overlapped a `main` run; the only two runs that had rebuild-test to themselves were green, one with
**zero flaky**. ⚠️ **Every merge to `main` triggers its own run automatically.** Plan CI so a branch
run does not start next to a merge run, and **say in the plan how you sequenced it.** Do not attempt
to fix the underlying problem — that is its own session.

### ⚠️ END OF PHASE 1 — commit, push, relink the CLI to rebuild-test (`nmyphyhmfttxkdoposvf`), read back.

---

# PHASE 2 — ASK EVERYTHING, PRESENT THE PLAN, THEN STOP.

⚠️ **NEVER THE INTERACTIVE PICKER. NOT ONCE.** Josh is not notified when one appears; the session
sits idle until he happens to look.

⚠️ **Print BOTH the questions and the plan as PLAIN TEXT** in your normal output, and put both at the
top of `docs/sessions/S122-report.md`. Commit. Push.

## 2.1 — The questions

Each gets: the question, the options, your recommendation, and the one-line reason.

### Settled by Josh — restate, do not re-ask

The thirteen Critical Path rulings are in the spec and in `claude/critical-path-rulings.md`. In
particular: hybrid per-task anchoring; the calendar in company settings; inspections as dependency
targets; lead time as its own task; **no baseline, a finish-date history instead**; templates; foreman
edits need approval and **a pending edit does not move the date**; the client sees phases and task
titles with a required disclaimer and **never float**; weather days with a selectable icon; a task may
carry both a dependency and a date constraint; **notification chosen per line per assignee**, in-app
for accounts and **email for the majority who have none**; a client-notification checkbox at setup;
and **remaining time is entered, never derived from `percent_complete`.**

Part 0-B's rulings are likewise settled: delete staletimes; the photo back link uses a **validated**
`from` parameter.

### Open — recommend and ask

1. **An in-progress task's remaining duration** is entered, not derived. **How is it entered, and what
   does the UI show beside it?** The percentage exists; it must be visible without being the source.
2. **Part 0-B-6** — label both fields, or drop `member_type` from mobile Settings entirely?
3. **Everything Phase 1 turned up** — above all any of the five corrections that came back different,
   and anything in the task-assignees shape that changes §3's line sheet.

## 2.2 — The plan, for approval

Per part: what you will build in a short paragraph, the migrations by name, what could go wrong and
which stop rule covers it, and rough size relative to the others.

⚠️ **Part 2 — the engine — must show its hand.** State how the forward and backward pass handle a
task with no duration, a cycle, a disconnected task, an in-progress task, and a fixed date earlier
than its predecessor's finish. **An engine that hangs on a cycle is the failure mode.**

⚠️ **Part 7 — the client portal — must state how float is kept out of the PAYLOAD, not the render.**

## 2.3 — ⚠️ THEN STOP AND WAIT.

Post the questions and the plan, commit and push, relink to rebuild-test and read back, and **wait
for Josh's approval.** If an answer changes the plan, revise and re-present before building.

---

# PHASE 3 — BUILD. ONLY AFTER JOSH APPROVES.

**Order: 0-B, then 0-C, then 1 → 9.**

⚠️ **Part 0-B ships first and merges on its own.** Small, independent, no migration, and it must not
be hostage to Critical Path running out of road. One CI run, one merge, then move on.

⚠️ **Part 0-C ships second and ALSO merges on its own — never folded into 0-B's merge.** It is
invoicing money code and gets its own proofs and its own CI. ⚠️ **Its load-bearing test is that
changing the bulk percentage does NOT overwrite a pinned line.** Sabotage it and prove red.

### Per part

- Build it. Proofs with **row counts**. Sabotage every negative, restore it, and **read back what you
  actually wrote**.
- Pre-CI check before every CI request. ⚠️ **Sequence runs so a branch run does not race a merge run
  on `main`** (1.7). You cannot cancel a run (403).
- Production: **one migration per section**, a dry run listing **exactly one file**, push, then
  **verification by object with every expected value stated.** A mismatch is a stop.
- Merge, then commit and push the report entry.
- ⚠️ **End every turn with the CLI on rebuild-test**, read back — including a turn that stops.
  ⚠️ **Never `migration repair --status reverted`.**

### ⚠️ The five that will bite

**The engine hanging on a cycle.** The cycle guard is **service-layer only** — a DFS in
`tasks-client.ts`. There is no database enforcement. A cycle that reaches the forward pass must be
**reported, not looped on**. Stop rule 11.

**Float reaching the client.** ⚠️ **A render-only gate still ships float in the RSC payload — that is
the `#136` class, and this project has shipped it before.** The client's read path returns a narrowed
shape that never contains float. **Prove it by inspecting the payload, not the screen**, and use the
linked-plus-unlinked client pair the repo already has.

**Duration backfill.** ⚠️ **Do NOT derive duration by subtracting existing dates.** Those were typed
by hand against no working calendar, so the difference is calendar days, not working days, and a
silent backfill produces wrong durations that look authoritative. **Leave them null and ask.**

**A pending foreman edit moving the date.** It must not. The date stays put with the consequence
stated beside it. Prove it.

**Part 0-B-4 is payroll.** Keep the completion gate. Negative tests per excluded role.

### ⚠️ NOT in this build

**Timesheets → QuickBooks, and the re-push.** [Josh, 2026-09-30: *"save the QB re-push for next
session"*] ⚠️ **Nothing toward it.** Timesheets do not sync to QuickBooks today and that is a separate
session's work — see `claude/next-builds.md` Build B.
**The CI concurrency fix** is also its own session. Sequence around it; do not fix it.

### ⚠️ A part ships whole or not at all

Merge a part only when it is complete with its proofs run. A part unfinished when you run out of road
**stops, unmerged, with a written state.** Josh's crew use production.

---

## Stop rules

1. A production verification value that does not match its expectation.
2. A migration adding a **constraint over existing production rows** — §1-A is this shape.
3. Refund, contract or **payroll** authority beyond §0-B-4's explicit ruling.
4. Anything weakening the Financial Visibility Floor (`#136`).
5. A dry run listing anything but the single file its section names.
6. CI red twice on the same cause. ⚠️ **A red that overlapped a `main` run is a suspected fixture
   collision — say so, re-run alone, and do not count it as the first red.**
7. `main` not at or past S121's final state — **stop the session.**
8. ⚠️ **Float reaching the client's payload.**
9. ⚠️ **A pending foreman edit moving the projected finish.**
10. ⚠️ **A duration backfilled from existing dates.**
11. ⚠️ **A cycle hanging the engine rather than being reported.**
12. ⚠️ **A second Claude Code session live in this checkout.**

**On any stop except 7 and 12:** relink to rebuild-test, prove it, write the state into the report,
commit, push, **move on. Stop the ITEM, not the session.**

---

## Standing evidence rules

- ⚠️ **Verify by object. A prior report is a claim** — including S121's and this spec's.
- ⚠️ **Write off-project negatives WITHOUT returning rows.** Count with the service role.
- ⚠️ **A test that passes on zero rows is a failure. State row counts.**
- ⚠️ **An e2e that passes on a page that never rendered is not a pass.**
- ⚠️ **Judge a deleted storage object by LISTING its folder, never `download()`** — the CDN serves a
  removed object.
- ⚠️ **Never truncate an inspection with `head`.**
- ⚠️ **Name the ref every measurement was taken on.**
- Every sabotage restored and read back identical. No test deleted; superseded assertions quoted in
  place. Never reformat a file the repo does not already format.
- Commit path-scoped. ⚠️ **Never `git add -A`.** Push after every commit.
- `next build` must pass and the printed exit line read.
- ⚠️ **This does not amend CLAUDE.md.**

---

## Final report — `docs/sessions/S122-report.md`

- The Phase 2 questions and plan at the top, with Josh's answers against each.
- Phase 1's findings with their refs: the three TBDs resolved, the five corrections confirmed or
  corrected again, the real member count, the branch audit.
- Per part: merged with its SHA and on production, or stopped and exactly where.
- **Part 2:** the engine's five edge cases and how each behaves, with the hand-worked float examples.
- **Part 7:** the payload proof that float never leaves the server.
- Every production section's verification row against its expectation.
- **What a person still has to click**, and **what Josh has to decide.**