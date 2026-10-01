# S122 RESUME — Critical Path, Part 1 onward

Fresh context. **The previous session died when the Codespace restarted.** Its work survived; its
memory did not.

**Read `docs/specs/S122-SPEC.md` for the content. This prompt is the running order.**
⚠️ **The spec is a claim like any other. Re-verify anything you build on.**

⚠️ **Phases 1 and 2 are DONE AND APPROVED. You are in PHASE 3 — BUILD.**
Do not re-run the assessment. Do not re-ask the eighteen questions; the answers are below.

---

## ⚠️ FIRST ACTION — BEFORE ANYTHING, INCLUDING READING

**Run `ListAgents`.** If any other Claude Code session is live in this checkout, **STOP AND SAY SO.**
Two sessions in one checkout raced toward a single production migration on 2026-09-30 and only
stopped because one of them checked. This is stop rule 12.

---

## SECOND ACTION — THE ONE UNKNOWN. SETTLE IT BEFORE YOU WRITE ANY CODE.

Verified state, taken from git and `gh` on 2026-10-01 before this prompt was written:

| ref | SHA | state |
| --- | --- | --- |
| `origin/main` | `d84cfe8b` | Parts 0-B, 0-B-4 and 0-C merged |
| `feature/s122-p1-schema` | `9f1c2382` | Part 1 schema, pushed, **CI green** (run `36812550233`, solo re-run) |

Part 1 commit `3d61e202` adds **three Critical Path schema migrations**:
1. task fields + dependency guard
2. calendar + weather
3. settings, finish history, Q12 guard, `needs_recompute`

⚠️ **IT IS NOT KNOWN WHETHER ANY OF THE THREE REACHED PRODUCTION.** The commit messages say
"live 40/40 twice," which is rebuild-test language, not production. **A prior session's commit
message is a claim.**

**So, before anything else:**

1. `git fetch --prune`. State `origin/main`'s SHA and subject and the ref you are on.
2. ⚠️ **Read the report at `origin/feature/s122-critical-path:docs/sessions/S122-report.md`.**
   **It is NOT on `main` and NOT on `feature/s122-p1-schema`** — verified 2026-10-01. It lives only on
   that one unmerged branch, which is why it is named by ref here. It carries Phase 1's findings and
   Josh's eighteen answers, and it is the dead session's own record.
   **Where it disagrees with this prompt, say so explicitly and verify by object.**
   ⚠️ **Then bring it forward onto the branch you are working on, so there is ONE report and it
   reaches `main` with the build.** State which ref you took it from.
3. **List the migrations actually applied on PRODUCTION.** Name each of the three by filename and
   state, for each: applied, or not applied. ⚠️ **Verify by object — query the database. Do not
   infer it from the report, the commit messages, or a local migrations folder.**
4. **Write what you found into the report, commit, push, and state it in plain text before
   proceeding.**

⚠️ **If some of the three are applied and some are not, that is a partial production push. STOP, write
the exact state, and tell Josh.** Do not "finish" the sequence to tidy it up.

Only once that is settled: proceed to merge Part 1, applying the per-part discipline below.

---

## What is left

**Parts 2 → 9.** Order as the spec gives them. Part 1 merges first, once the production question above
is answered.

⚠️ **A part ships whole or not at all.** Merge a part only when it is complete with its proofs run. A
part unfinished when you run out of road **stops, unmerged, with a written state.** Josh's crew use
production.

---

## Josh's approved answers to Phase 2 — carry these forward

**All eighteen questions: A.** Josh agreed with every recommendation the previous session made.

Four of the spec's claims were wrong and the previous session correctly caught all four. Do not
re-derive them:
- There is **no per-line invoice ceiling** in the database as the spec claimed — contract-total only.
  (Part 0-C added one; it is in `d84cfe8b`.)
- `.db-expected.json` is **gitignored and local-only**.
- `lib/safe-next.ts` accepts **any same-origin path**, not a known list.
- `claude/critical-path-rulings.md` is a **project doc you cannot read**. Ignore every citation of it.

**Three additions Josh attached to the answers. Two are already shipped. ONE IS STILL OPEN:**

- ✅ **Q5** — settled in `1c7684b9`. S121 ruled the *week sheet* path; Q5 was the older per-session
  clock correction. No conflict. Authority unchanged.
- ✅ **Q7** — a line already billed over its price is a **finding to report, not a blocker.**
- ⚠️ **NEW RULING [Josh, 2026-10-01] — a pending task edit is VISIBLE, not hidden.** When a foreman or
  a crew assignee writes or edits a task, **it still shows up for everyone**, rendered **grayed with a
  "pending" notice.** It does **not** disappear until approved, and it does **not** move the computed
  dates — the date stays put with the consequence stated beside it (stop rule 9).
  This settles Phase 1's finding that a foreman or crew assignee can write task dates directly,
  bypassing Part 5's approval. ⚠️ **The write is not refused — it is held, shown, and marked.**
- ⚠️ **Q9 IS STILL OPEN AND LANDS IN PART 2.** "Every applied change runs the engine" is right, but it
  must cover changes that are **not task edits**. Adding a company holiday, or marking a weather day,
  **moves every computed date without anyone touching a task.** In the report, **state exactly what
  triggers a recompute, and that list must include the working calendar and the weather days.**

---

## Per part

- Build it. Proofs with **row counts**. Sabotage every negative, restore it, and **read back what you
  actually wrote**.
- Pre-CI check before every CI request. ⚠️ **Sequence runs so a branch run does not race a merge run
  on `main`.** You cannot cancel a run (403). ⚠️ **A red that overlapped a `main` run is a suspected
  fixture collision — say so, re-run alone, and do not count it as the first red.** The previous
  session's first Part 1 red was exactly this; the solo re-run was green.
- Production: **one migration per section**, a dry run listing **exactly one file**, push, then
  **verification by object with every expected value stated.** A mismatch is a stop.
  ⚠️ **Part 1 carries THREE migrations, so that is three sections and three separate dry runs, each
  listing one file.** Never one dry run listing three.
- Merge, then commit and push the report entry.
- ⚠️ **End every turn with the CLI on rebuild-test**, read back — including a turn that stops.
  ⚠️ **Never `migration repair --status reverted`.**

⚠️ **THE REPO AND THE NETWORK HAVE NOW RESTARTED SEVERAL TIMES, INCLUDING ONCE MID-SESSION ON
2026-10-01.** Append to `docs/sessions/S122-report.md` and **push** after every finding, every proof,
every sabotage with its read-back, every production section, and every stop. **Run ONE section per
command. A commit that is not pushed does not exist.**

There is an untracked file `docs/sessions/S122-prompt-v2.md` in the checkout, written by the dead
session. Read it, then decide whether it belongs in the repo. Do not assume it does.

---

## ⚠️ The five that will bite — Parts 2 onward

**The engine hanging on a cycle.** The cycle guard is **service-layer only** — a DFS in
`tasks-client.ts`. There is no database enforcement. A cycle that reaches the forward pass must be
**reported, not looped on**. Stop rule 11.
⚠️ **Part 2 must show its hand:** state how the forward and backward pass handle a task with no
duration, a cycle, a disconnected task, an in-progress task, and a fixed date earlier than its
predecessor's finish.

**Float reaching the client.** ⚠️ **A render-only gate still ships float in the RSC payload — that is
the `#136` class, and this project has shipped it before.** The client's read path returns a narrowed
shape that never contains float. **Prove it by inspecting the payload, not the screen**, and use the
linked-plus-unlinked client pair the repo already has. Part 7.

**Duration backfill.** ⚠️ **Do NOT derive duration by subtracting existing dates.** Those were typed
by hand against no working calendar, so the difference is calendar days, not working days, and a
silent backfill produces wrong durations that look authoritative. **Leave them null and ask.**

**A pending foreman edit moving the date.** It must not. The date stays put with the consequence
stated beside it. Prove it.

**Part 0-B-4 is payroll.** Already merged. Do not revisit its authority.

---

## ⚠️ NOT in this build

**Timesheets → QuickBooks, and the re-push.** [Josh, 2026-09-30: *"save the QB re-push for next
session"*] ⚠️ **Nothing toward it.** Timesheets do not sync to QuickBooks today; separate session.
**The CI concurrency fix** is also its own session. Sequence around it; do not fix it.

---

## Stop rules

1. A production verification value that does not match its expectation.
2. A migration adding a **constraint over existing production rows**.
3. Refund, contract or **payroll** authority beyond §0-B-4's explicit ruling.
4. Anything weakening the Financial Visibility Floor (`#136`).
5. A dry run listing anything but the single file its section names.
6. CI red twice on the same cause (see the fixture-collision note above).
7. `main` not at or past `d84cfe8b` — **stop the session.**
8. ⚠️ **Float reaching the client's payload.**
9. ⚠️ **A pending foreman edit moving the projected finish.**
10. ⚠️ **A duration backfilled from existing dates.**
11. ⚠️ **A cycle hanging the engine rather than being reported.**
12. ⚠️ **A second Claude Code session live in this checkout.**
13. ⚠️ **A partial production push of Part 1's three migrations** (the second action above).

**On any stop except 7, 12 and 13:** relink to rebuild-test, prove it, write the state into the
report, commit, push, **move on. Stop the ITEM, not the session.**

---

## Standing evidence rules

- ⚠️ **Verify by object. A prior report is a claim** — including the dead session's and this spec's.
- ⚠️ **Write off-project negatives WITHOUT returning rows.** Count with the service role.
  An `.insert().select()` makes Postgres check the new row against the SELECT policy, so the test
  passes whether or not the write arm exists.
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

## Questions for Josh

⚠️ **Every question in PLAIN TEXT in the chat. NEVER an interactive picker** — Josh is not notified
when a picker appears, and the session sits idle until he happens to look.

---

## ⚠️ Four Phase 1 findings whose disposition must be stated

The dead session found these. **Say, for each, whether it is fixed, filed to `TECH_DEBT.md`, or
deferred — and where the record is.** A finding that exists only in a chat message is lost.

1. **A foreman or crew assignee can write task dates directly, bypassing Part 5's approval.**
   ⚠️ **RULED above — held, shown grayed, marked "pending".**
2. **The invoice percentage box turns 150 into 100 silently.** State whether Part 0-C fixed this.
3. **Delete-then-re-add of the same dependency fails with "already exists."** Lands in Part 1's
   territory — the soft-delete and the uniqueness guard disagree.
4. **A PM or foreman changing an approved day's hours.** Believed closed by Part 0-B-4 (`1c7684b9`).
   ⚠️ **Verify by object; do not take the merge message as proof.**

---

## Final report — `docs/sessions/S122-report.md`

⚠️ **Continue the EXISTING file from `origin/feature/s122-critical-path` — do not start a new one, and
do not leave two.**

- The production state of Part 1's three migrations as you found it on resume.
- Per part: merged with its SHA and on production, or stopped and exactly where.
- **Part 2:** the engine's five edge cases and how each behaves, the hand-worked float examples, and
  **the full list of what triggers a recompute, including the calendar and weather days (Q9).**
- **Part 7:** the payload proof that float never leaves the server.
- Every production section's verification row against its expectation.
- **What a person still has to click**, and **what Josh has to decide.**