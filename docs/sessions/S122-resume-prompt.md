# S122 RESUME — Part 6 onward

Fresh context. **The Codespace restarted on 2026-10-01 at ~17:25 ET, for the second time that day.**
The work survived; the session's memory did not.

**Read `docs/specs/S122-SPEC.md` for the content. This prompt is the running order.**
⚠️ **The spec is a claim like any other, and so is this prompt. Re-verify anything you build on.**

⚠️ **Phases 1 and 2 are DONE AND APPROVED. You are in PHASE 3 — BUILD.**
Do not re-run the assessment. Do not re-ask the questions; the rulings are below.

---

## ⚠️ FIRST ACTION — BEFORE ANYTHING, INCLUDING READING

**Run `ListAgents`.** If any other Claude Code session is live in this checkout, **STOP AND SAY SO.**
Two sessions in one checkout raced toward a single production migration on 2026-09-30 and only
stopped because one of them checked. This is stop rule 12.

---

## SECOND ACTION — THE ONE UNKNOWN. SETTLE IT BEFORE WRITING ANY CODE.

Verified from git at 17:29 ET on 2026-10-01, before this prompt was written:

| ref | SHA | state |
| --- | --- | --- |
| `origin/main` | `a955dac5` | **Parts 1, 2, 3, 4 and 5 merged** |
| `feature/s122-p6-notify` | `cfc4adb6` | Part 6 in progress, pushed |

**Part 6's committed state, from its own commit messages — treat as claims:**
- `3b97459b` — migration 29: `schedule_changed` notification type; `schedule_change` and
  `schedule_change_client` email types; unions in the same commit. Notify assignees who chose it
  (in-app / email / reported), the client with the disclaimer only, **never on time alone.**
- `e342a60b` — unit 4/4 for the wording (client email: finish date + disclaimer only; sabotage p red).
  ⚠️ **"live test for who is told (NOT YET RUN)."**
- `cfc4adb6` — a five-line fix to that live test: count email logs from just before the Owner's
  change rather than from module load, so the first computation's traffic is excluded.
  ⚠️ **ALSO NOT RUN.** It was uncommitted when the Codespace died and was committed to save it.

**So, before anything else:**

1. `git fetch --prune`. State `origin/main`'s SHA and subject and the ref you are on.
2. **Read `docs/sessions/S122-report.md` on the branch.** It is the running record. If it is not
   there, find it (`git log --all --pretty=format: --name-only -- '*S122-report*' | sort -u`) and
   **bring it forward onto this branch** so there is ONE report and it reaches `main`.
3. ⚠️ **Is migration 29 on PRODUCTION?** **Verify by querying the database**, not from the commit
   message, not from the report, not from the local migrations folder. State: applied, or not.
4. **Run Part 6's live test** — it has never run, and the last commit changed it. ⚠️ **Until it runs,
   Part 6's "who is told" behaviour is unproven, however confident the commit messages sound.**
5. **Write what you found into the report, commit, push, and state it in plain text before
   proceeding.**

⚠️ **If migration 29 is on production but the live test fails, say so immediately and stop the item.**
A migration on production whose behaviour is unproven is the worst of the two states.

---

## What is left

**Parts 6 → 9.** Order as the spec gives them.

⚠️ **A part ships whole or not at all.** Merge a part only when it is complete with its proofs run. A
part unfinished when you run out of road **stops, unmerged, with a written state.** Josh's crew use
production.

---

## Rulings already made — carry these forward, do not re-ask

**All eighteen Phase 2 questions: A.** Josh agreed with every recommendation.

**Q19 [Josh, 2026-10-01] — a direct date change by Owner/Admin/PM/PE is a CONSTRAINT, not a pin.**
Moving the start means *"starts after its links, but no earlier than this date."* Moving the end
changes the task's **duration** to the working days from its start to the new end.
⚠️ **A hard pin stops a predecessor slip from pushing its successors, which is the one thing Critical
Path exists to do.** P6 and MS Project schedules die this way.
⚠️ **A constraint created by a drag must be visibly marked on the Gantt AND the sheet — not only in a
detail panel — and releasable in ONE action**, after which the engine recomputes that task freely.
**Same rule as Part 0-C's pinned invoice lines: a deliberate act is visibly marked and always
reversible. Use the same language.** The preview must name **which kind** of edit it is performing
(duration, anchor, link, new task) before showing its effect on the finish.

**A pending task edit is VISIBLE, not hidden [Josh, 2026-10-01].** Shipped in Part 5 — grayed, marked
pending, consequence stated beside it, moving no date, decided by someone who is not the submitter.
⚠️ **Do not revisit it.**

**Q9 — what triggers a recompute.** The working calendar, company holidays and weather days are all
triggers, not only task edits. A project's **start date** was a gap CC found; Part 3's migration added
that trigger. ⚠️ **The report must carry the full trigger list.**

**Q7 — a line already billed over its price is a FINDING to report, not a blocker.**

---

## Per part

- Build it. Proofs with **row counts**. Sabotage every negative, restore it, and **read back what you
  actually wrote**.
- Pre-CI check before every CI request. ⚠️ **Sequence runs so a branch run does not race a merge run
  on `main`.** You cannot cancel a run (403).
- Production: **one migration per section**, a dry run listing **exactly one file**, push, then
  **verification by object with every expected value stated.** A mismatch is a stop.
- Merge, then commit and push the report entry.
- ⚠️ **End every turn with the CLI on rebuild-test**, read back — including a turn that stops.
  ⚠️ **Never `migration repair --status reverted`.**

⚠️ **THE CODESPACE HAS NOW RESTARTED TWICE IN ONE DAY, BOTH TIMES MID-BUILD.** Append to
`docs/sessions/S122-report.md` and **push** after every finding, every proof, every sabotage with its
read-back, every production section, and every stop. **Run ONE section per command. A commit that is
not pushed does not exist, and an uncommitted file is one restart from gone** — the 17:25 restart left
a real five-line test fix uncommitted.

---

## ⚠️ CI — two distinct failure modes, do not conflate them

1. **Fixture collision.** Every run shares one rebuild-test database, and every merge to `main`
   triggers its own run, so a branch run started near a merge collides by default. A red that
   overlapped a `main` run is a suspected collision — say so, **re-run alone**, and do not count it as
   the first red.
2. **Connection exhaustion.** ⚠️ **rebuild-test can run out of database connections and red a run that
   has the database entirely to itself.** This happened to Part 1 on 2026-10-01 at 03:18Z with no
   overlapping run. **Check the timestamps before calling a red a collision.** Stop rule 6 counts a
   second red on the same cause.

⚠️ **A migration cannot be applied to rebuild-test while CI is using it.** Sequence around it; do not
fix it. The CI work is its own session.

---

## ⚠️ What will bite in Parts 7–9

**Float reaching the client — Part 7.** ⚠️ **A render-only gate still ships float in the RSC payload.
That is the `#136` class and this project has shipped it before.** The client's read path returns a
narrowed shape that **never contains float**. **Prove it by inspecting the PAYLOAD, not the screen**,
using the linked-plus-unlinked client pair the repo already has.

**The client sees the finish date and a disclaimer. Nothing else.** No float, no task-level detail,
no crew. Part 6's client email already follows this — keep it identical in Part 7.

**A cycle must be reported, not looped on.** The cycle guard is service-layer only — a DFS in
`tasks-client.ts`, no database enforcement. Stop rule 11.

**Never backfill a duration from existing dates.** They were typed against no working calendar, so
the difference is calendar days, not working days. Leave them null and ask.

---

## ⚠️ NOT in this build

**Timesheets → QuickBooks, and the re-push.** [Josh, 2026-09-30: *"save the QB re-push for next
session"*] ⚠️ **Nothing toward it.**
**The CI fix** is its own session.
**Build F — the project overview job-details block** (address, contract type, permit, building
department) is **a separate build.** ⚠️ **Nothing toward it**, and note that Critical Path now computes
`start_date` and `target_end_date`, so that build must not become a second write path to them.

---

## Stop rules

1. A production verification value that does not match its expectation.
2. A migration adding a **constraint over existing production rows**.
3. Refund, contract or **payroll** authority beyond §0-B-4's explicit ruling.
4. Anything weakening the Financial Visibility Floor (`#136`).
5. A dry run listing anything but the single file its section names.
6. CI red twice on the same cause (see the two modes above).
7. `main` not at or past `a955dac5` — **stop the session.**
8. ⚠️ **Float reaching the client's payload.**
9. ⚠️ **A pending edit moving the projected finish.**
10. ⚠️ **A duration backfilled from existing dates.**
11. ⚠️ **A cycle hanging the engine rather than being reported.**
12. ⚠️ **A second Claude Code session live in this checkout.**
13. ⚠️ **Migration 29 on production with Part 6's live test unrun or failing.**

**On any stop except 7, 12 and 13:** relink to rebuild-test, prove it, write the state into the
report, commit, push, **move on. Stop the ITEM, not the session.**

---

## Standing evidence rules

- ⚠️ **Verify by object. A prior report is a claim** — including this prompt and the spec.
- ⚠️ **Write off-project negatives WITHOUT returning rows.** Count with the service role. An
  `.insert().select()` makes Postgres check the new row against the SELECT policy, so the test passes
  whether or not the write arm exists.
- ⚠️ **A test that passes on zero rows is a failure. State row counts.**
- ⚠️ **A test that passes after a deliberate sabotage is a vacuous test** — Part 5 found one and
  hardened it. **Every sabotage must go red.**
- ⚠️ **An e2e that passes on a page that never rendered is not a pass.**
- ⚠️ **Judge a deleted storage object by LISTING its folder, never `download()`.**
- ⚠️ **Never truncate an inspection with `head`.**
- ⚠️ **Name the ref every measurement was taken on.**
- Every sabotage restored and read back identical. No test deleted; superseded assertions quoted in
  place. Never reformat a file the repo does not already format.
- Commit path-scoped. ⚠️ **Never `git add -A`.** Push after every commit.
- `next build` must pass and the printed exit line read.
- ⚠️ **This does not amend CLAUDE.md.**

---

## Questions for Josh

⚠️ **Every question in PLAIN TEXT in the chat. NEVER an interactive picker** — Josh is not notified
when a picker appears, and the session sits idle until he happens to look.

---

## Final report — `docs/sessions/S122-report.md`

⚠️ **Continue the EXISTING file. Do not start a new one, and do not leave two.**

- Whether migration 29 was on production when you resumed, and the result of Part 6's first live run.
- Per part: merged with its SHA and on production, or stopped and exactly where.
- **Part 7:** the payload proof that float never leaves the server.
- The full recompute-trigger list (Q9), including the calendar, holidays, weather days and the
  project start date.
- Every production section's verification row against its expectation.
- **What a person still has to click**, and **what Josh has to decide.**
---

## UNATTENDED FROM 2026-10-01 20:21 ET

From this point the session is UNATTENDED. I will not be reading chat, and no question will be answered. Build S122 to completion — Parts 7, 8 and 9.

FIRST: append this entire message to docs/sessions/S122-resume-prompt.md under a heading "UNATTENDED FROM 2026-10-01 20:21 ET", commit it path-scoped and push, before anything else. The Codespace has restarted twice today and a rule that exists only in chat does not survive one.

HOW TO HANDLE A DECISION
Do not post a question and wait. Take the narrower, safer, more reversible option; record it in the report under a DECIDED UNATTENDED heading with the alternative you rejected and why; proceed. A decision recorded and reversible is worth more than a session idling overnight.

The one exception: a decision that cannot be undone and could reasonably go either way. Do the preparatory work, write the decision out, stop that ITEM, move to the next part.

STOP RULES
Rules 1-6, 8-11 and 13 stop the ITEM, not the session. Write the state, commit, push, move to the next part. Rules 7 and 12 still stop the session: main behind a955dac5, or a second Claude Code session in this checkout.

MIGRATIONS, now that nobody is here to be told
Production merge authorisation stands for Parts 7, 8 and 9 and the migrations the spec names. A migration that only widens a CHECK or adds lookup rows may proceed, recorded. A migration that creates or alters a table, column, policy or function the spec does NOT name: stop that ITEM, do not push it to production, write it up.

PART 8 — RULED NOW so it does not block you
Stamping a template onto a project that already has tasks REFUSES. It does not merge, append or replace. The UI says the project already has tasks and names how many. Merging is the destructive option and there is nobody here to undo it.

WHEN PARTS 7, 8 AND 9 ARE DONE
Stop. Do not start Build B (timesheets to QuickBooks), Build C (CI), Build F (project overview job details), or the working-calendar holidays work. Each is its own session.

THE FINAL REPORT IS THE DELIVERABLE
I am reading the report, not this chat. It must carry, in plain language: every part merged with its SHA and whether its migration is on production; every item stopped and exactly where; everything DECIDED UNATTENDED with its alternative; what is on production that I have not clicked; and what I have to decide before anything else is built.

Commit and push after every finding, every proof, every sabotage with its read-back, every production section and every stop. An uncommitted file is one restart from gone.

**Standing rules from this session, also carried here** (each also in the report): the CP-off regression control for `client_schedule` comes first, with its sabotage
(R2.10); the Part 7 PAYLOAD proof is separate from the function proof; the unlinked client on a CP-ON project → 0 rows; the import check is TRANSITIVE
(graph walk from the portal route); before any sabotage that drops or replaces a DB object, commit + push its captured original and RESTORE script
first (`docs/sessions/S122-sabotage-originals/`); a widened CHECK is proven a strict superset from LIVE constraints; a migration a plan did not
list is said plainly when added (unattended: in the report, at once).
