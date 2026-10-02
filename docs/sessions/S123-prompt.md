# S123 — Critical Path close-out

Fresh context. **S122 closed 2026-10-02 with nine parts on production.** This session builds the four
decisions Josh ruled at its close.

⚠️ **Everything below is a CLAIM. Verify it against git and the database before building on it.**

---

## ⚠️ FIRST ACTION — BEFORE ANYTHING, INCLUDING READING

**Run `ListAgents`.** If any other Claude Code session is live in this checkout, **STOP AND SAY SO.**
Two sessions in one checkout raced toward a single production migration on 2026-09-30 and only
stopped because one of them checked.

---

# PHASE 1 — ASSESS. BUILD NOTHING.

**1.1** `git fetch --prune`. State `origin/main`'s SHA and subject. It should carry S122 Parts 1–9.
⚠️ **Name the ref on every measurement in this session.**

**1.2 — ⚠️ FIND THE S122 CLOSE-OUT DECISIONS FILE AND SAY WHICH REF IT IS ON.**

It is in `docs/sessions/` and Josh calls it "S122 close-out"; a listing showed
`S122-closeout-decisions.md`. ⚠️ **Do not trust that spelling — find it:**

```
git log --all --pretty=format: --name-only -- 'docs/sessions/*lose*ut*' | sort -u
```

It carries the four rulings this session builds. It exists in the working tree; **whether it reached
`main` is unverified.** If it is not on `main`, **bring it forward onto your branch** so it ships
with the work. **State its exact path and which ref you read it from. Do not start without it.**

**1.3 — Read `docs/sessions/S122-report.md` on `main`.** It records what Parts 6–9 actually built and
the twelve decisions made unattended (D7-1..5, D8-1..4, D9-1..3). ⚠️ **Where it disagrees with this
prompt, verify by object and say so.**

**1.4 — Measure the four surfaces before changing them.**
- **The client portal's schedule path(s).** `client_schedule` and `client_critical_path` both exist.
  State what each returns, which page calls which, and what a linked client sees today on a Critical
  Path project versus a non-Critical-Path one.
- **The notification send path** — where it runs relative to the save response, and where the
  "could not be reached" list is produced and displayed.
- **The template stamp** — every write it performs, in order, and what its current cleanup does on a
  partial failure.
- **The disclaimer string(s)** — every place the client-facing wording appears.

**1.5 — ⚠️ DETERMINE WHETHER `EMAIL_SEND_ENABLED` IS ON IN PRODUCTION.** S122 could not. **Say so in
plain text.** If it is on, a schedule save on a Critical Path project sends real mail to real
subcontractors and clients, and **95% of subs are email-only** [Josh].

**1.6 — Housekeeping.** Enumerate local and remote branches with true merge status. ⚠️ **Delete
nothing in Phase 1.** S122 left nine `feature/s122-*` branches; propose deletions with per-branch
proof in Phase 2 and do them in Phase 3.

### ⚠️ END OF PHASE 1 — commit, push, relink the CLI to rebuild-test (`nmyphyhmfttxkdoposvf`), read back.

---

# PHASE 2 — PLAN, ASK, THEN STOP.

⚠️ **PLAIN TEXT ONLY. NEVER AN INTERACTIVE PICKER, NOT ONCE.** Josh is not notified when one appears
and the session sits idle until he happens to look.

Per item: what you will build in a short paragraph, the migrations by name, what could go wrong and
which stop rule covers it, and rough size relative to the others. Put the plan and every question at
the top of `docs/sessions/S123-report.md`. Commit. Push. **Then wait for Josh's approval.**

⚠️ **D-1 must state how the ONE client schedule is assembled** — which function feeds it on a
Critical Path project, what happens on a non-Critical-Path project, and **how float is kept out of
the PAYLOAD, not the render.**

---

# PHASE 3 — BUILD. ONLY AFTER JOSH APPROVES.

**Order: D-4, then D-2, then D-3, then D-1.** Smallest and most independent first, so a restart late
in the session still leaves Josh better off. ⚠️ **D-1 and D-4 are what gate turning Critical Path on
for a real job; D-1 is most of the work.**

⚠️ **A part ships whole or not at all.** Merge an item only when it is complete with its proofs run.
An item unfinished when you run out of road **stops, unmerged, with a written state.** Josh's crew
use production.

---

## D-4 — the template stamp becomes ATOMIC

Stamping is not one transaction today; a failure partway is cleaned up afterwards.

⚠️ **The failure mode poisons its own retry path.** Part 8 refuses to stamp onto a project that
already has tasks, so a partial stamp leaves the project holding some tasks and the retry is then
blocked by the wreckage of the first attempt. Compensating cleanup only helps if the cleanup itself
succeeds — and it runs at exactly the moment things are unreliable.

**Build:** one database function, all-or-nothing. A failure leaves the project **exactly** as it was.
**Prove it:** force a failure partway and show, by row count, that the project holds **zero** new
tasks, phases, dependencies and history rows afterwards. Then stamp again successfully with no manual
cleanup. ⚠️ **Keep Part 8's refusal rule intact** — a project that already has tasks is still refused
with the count named.

---

## D-2 — the disclaimer says "these dates"

Not "these dates and figures". The client schedule shows dates and nothing else — no money, no
quantities, no percentages. ⚠️ **Keep "and figures" on any client surface that DOES show money.** The
two wordings are deliberate; do not unify them. State every string you changed, by file.

---

## D-3 — notifications send in the BACKGROUND, with a popup naming anyone unreachable

> **[Josh]** *"push in background and add popup of anyone who cant be reached. 95% of subs will be
> email only"*

⚠️ **The 95% figure is what decides this.** Sending inside the save means nearly every assignee gets
an email before the page returns; on a job with fifteen subs the sheet sits there.

⚠️ **This REVERSES the earlier recommendation to keep sending inside the save.** Recorded so it is
not re-applied. The reason that recommendation existed is now a hard requirement:

### ⚠️ D-3a — THE UNREACHABLE LIST MUST SURVIVE NAVIGATION

Sending finishes seconds after the save. **If the user has already clicked into another screen, a
popup has nowhere to appear and the information is lost.** That is the exact failure the synchronous
send was protecting against.

⚠️ **So the list must ALSO land somewhere findable** — a notification, or a banner on the schedule.
**The popup is the fast path, NEVER the only path.** A design where the popup is the only delivery is
not acceptable. **Prove it: save, navigate away immediately, and show the list is still reachable.**

"Unreachable" keeps Part 6's meaning: **no login AND no email.** An email-only sub is reachable.

---

## D-1 — ONE client schedule, engine-fed, with a list/Gantt toggle. THE LARGEST ITEM.

> **[Josh]** *"keep only 1 schedule visible. if I am using critical path, the dates and tasks should
> be added to the same schedule. the client should also be able to switch to gantt chart"*

**The client portal has ONE schedule page.** On a Critical Path project it is fed by the engine's
computed dates — the Critical Path tasks and dates go into the **same** schedule, not a second view
beside it. The client toggles between **list and Gantt**.

⚠️ **The reason the two-view state is unacceptable is NOT a float leak.** There isn't one. **It is
that the old task-level page carries NO disclaimer** — it predates all of this. A client would have
one page that protects Josh and one that does not, showing the same job, and the undisclaimered one
is the one they screenshot when a trade slips.

### ⚠️ D-1a — THE CLIENT GANTT SHOWS BARS ONLY

- ⚠️ **NO dependency arrows.**
- ⚠️ **NO slack ghosts.**
- ⚠️ **NO critical-path colouring.**

**Why.** With arrows a Gantt hands the client float directly: drywall's bar ends the 10th, tile
depends on it, tile starts the 20th — **ten days of slack read straight off the screen.** That is
precisely the ammunition ruling 8 excluded. Without arrows a gap is ambiguous: slack, sequencing, or
a crew on another job. Same picture, no disclosure.

⚠️ **THE CLIENT GANTT IS ITS OWN DRAWING, NOT THE INTERNAL GANTT WITH A `hideFloat` PROP.**
Building it as one component with a flag is the `#136` shape — **the data still reaches the payload
even though nothing renders it, and this project has shipped exactly that bug before.**

**The disclaimer appears on BOTH views**, list and Gantt.

### ⚠️ D-1b — what must stay true

- **Part 7's Critical-Path-OFF regression control must stay green.** A linked client on a non-CP
  project sees exactly today's sorted key set and values; the unlinked client gets 0 rows. ⚠️ **This
  change affects CP projects only.**
- **The payload proof must still hold, and must be re-run against the merged page:** no float, no
  critical flags, no assignee names, no durations, no finish-history dates — **inspected in what the
  page serializes, not what a function returns.** The guard requiring the projected finish and a
  phase name to be present stays, so an empty page cannot pass.
- **The portal's import graph must still be unable to reach the engine — transitively**, not just in
  the route file's own import list. Assert on the built client bundle or walk the graph.

---

## Per item

- Build it. Proofs with **row counts**. Sabotage every negative, restore it, and **read back what you
  actually wrote**.
- ⚠️ **Before dropping or replacing a database object, commit its captured original** — definition,
  comment, permissions, md5 — in its own pushed commit, with a RESTORE script and a README.
  `docs/sessions/S122-sabotage-originals/` is the pattern. A restart mid-sabotage otherwise leaves
  rebuild-test broken with no record of what the original was.
- Pre-CI check before every CI request. ⚠️ **Sequence runs so a branch run does not race a merge run
  on `main`.** You cannot cancel a run (403).
- Production: **one migration per section**, a dry run listing **exactly one file**, push, then
  **verification by object with every expected value stated.** A mismatch is a stop.
- ⚠️ **Prove a widened CHECK as a SUPERSET of the old list, read from the live constraint — never by
  counting rows.** A row count proves today's data passes; it does not prove an old value was not
  silently dropped.
- Merge, then commit and push the report entry.
- ⚠️ **End every turn with the CLI on rebuild-test**, read back — including a turn that stops.
  ⚠️ **Never `migration repair --status reverted`.**

⚠️ **The Codespace restarted three times during S122, twice mid-build.** Commit and push after every
finding, every proof, every sabotage with its read-back, every production section and every stop.
**An uncommitted file is one restart from gone.**

---

## ⚠️ CI — two distinct failure modes, do not conflate them

1. **Fixture collision.** Every run shares one rebuild-test database and every merge to `main`
   triggers its own run. A red that overlapped a `main` run is a suspected collision — say so,
   **re-run alone**, and do not count it as the first red.
2. **Connection exhaustion.** ⚠️ **rebuild-test can run out of database connections and red a run
   that has the database entirely to itself** — this happened at 03:18Z on 2026-10-01 with no
   overlapping run. **Check timestamps before calling a red a collision.**

⚠️ **A migration cannot be applied to rebuild-test while CI is using it.** Sequence around it; do not
fix it. The CI work is its own session.

---

## ⚠️ NOT in this build

**Build B — timesheets → QuickBooks**, with the re-push and the new company-settings on/off toggle.
⚠️ **Nothing toward it.** It is next and it is its own session.
**Build C — CI serialization.** **Build F — the project overview job-details block.**
**The working-calendar standard holidays.** ⚠️ **Nothing toward any of them.**

---

## Stop rules

1. A production verification value that does not match its expectation.
2. A migration adding a **constraint over existing production rows**.
3. Refund, contract or **payroll** authority beyond what is already ruled.
4. Anything weakening the Financial Visibility Floor (`#136`).
5. A dry run listing anything but the single file its section names.
6. CI red twice on the same cause (see the two modes above).
7. `main` not carrying S122 Parts 1–9 — **stop the session.**
8. ⚠️ **Float reaching the client's payload.**
9. ⚠️ **Part 7's Critical-Path-off regression control going red.**
10. ⚠️ **A client Gantt built as the internal Gantt with a flag.**
11. ⚠️ **A design where the popup is the only delivery of the unreachable list.**
12. ⚠️ **A second Claude Code session live in this checkout.**

**On any stop except 7 and 12:** relink to rebuild-test, prove it, write the state into the report,
commit, push, **move on. Stop the ITEM, not the session.**

---

## Standing evidence rules

- ⚠️ **Verify by object. A prior report is a claim** — including S122's and this prompt.
- ⚠️ **Write off-project negatives WITHOUT returning rows.** Count with the service role. An
  `.insert().select()` makes Postgres check the new row against the SELECT policy, so the test passes
  whether or not the write arm exists.
- ⚠️ **A test that passes on zero rows is a failure. State row counts.**
- ⚠️ **A test that still passes after a deliberate sabotage is vacuous** — S122 found three. **Every
  sabotage must go red.**
- ⚠️ **An e2e that passes on a page that never rendered is not a pass.**
- ⚠️ **Assert an EXACT sorted key set, never `includes`** — `includes` passes when a column is added,
  which is the one thing the control exists to catch.
- ⚠️ **Never truncate an inspection with `head`.**
- ⚠️ **Name the ref every measurement was taken on.**
- Every sabotage restored and read back identical. No test deleted; superseded assertions quoted in
  place. Never reformat a file the repo does not already format.
- Commit path-scoped. ⚠️ **Never `git add -A`.** Push after every commit.
- `next build` must pass and the printed exit line read.
- ⚠️ **This does not amend CLAUDE.md.**

---

## Final report — `docs/sessions/S123-report.md`

- Phase 1's findings with their refs, including **whether `EMAIL_SEND_ENABLED` is on in production.**
- Per item: merged with its SHA and on production, or stopped and exactly where.
- **D-1:** the payload proof, the import-graph proof, and confirmation Part 7's CP-off control is
  still green.
- **D-4:** the forced-failure proof with row counts showing nothing was written.
- **D-3:** the proof that the unreachable list survives navigating away.
- Every production section's verification row against its expectation.
- **What a person still has to click**, and **what Josh has to decide.**