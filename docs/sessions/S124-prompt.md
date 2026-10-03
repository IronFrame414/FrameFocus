# S124 — Timesheets → QuickBooks (Build B), plus the email pacing fix

Fresh context. **S123 closed 2026-10-02 at `91fa32e1`.** This session is **money code against a live
accounting connection.** Read that sentence again before Phase 3.

⚠️ **Everything below is a CLAIM. Verify it against git and the databases before building on it.**

---

## ⚠️ FIRST ACTION — BEFORE ANYTHING, INCLUDING READING

**Run `ListAgents`.** If any other Claude Code session is live in this checkout, **STOP AND SAY SO.**
Two sessions in one checkout raced toward a single production migration on 2026-09-30 and only
stopped because one of them checked.

---

## ⚠️ THE ONE RULE THAT OVERRIDES EVERYTHING ELSE IN THIS SESSION

**NOTHING THIS SESSION BUILDS MAY WRITE TO WORTH PROPERTIES' REAL QUICKBOOKS BOOKS.**

This is not like a database migration. A wrong row in a database can be corrected. **A wrong time
entry in live accounting is in Josh's books, in front of his accountant, and duplicates cannot be
deleted by a retry — QuickBooks has no PUT, so a second POST creates a SECOND OBJECT.**

The company-settings toggle (Part 2) is what makes this safe, and it is why **it ships DEFAULT OFF for
every existing company.** ⚠️ **Turning it on for a real company is JOSH'S action, never yours.**
All proving happens in a **sandbox** company.

---

# PHASE 1 — ASSESS. BUILD NOTHING.

**1.0 — Read `docs/specs/S124-spec.md`.** ⚠️ **Despite the filename it is the WHOLE open-work index,
not a Build B spec.** Build B is one section of it, headed *"NEXT — BUILD B — Timesheets →
QuickBooks"*. **Read that section; everything else in the file is other sessions' work and is out of
scope here.** ⚠️ **It is a claim like this prompt — verify what it asserts.**

**1.1** `git fetch --prune`. State `origin/main`'s SHA and subject. ⚠️ **Name the ref on every
measurement in this session.**

**1.2 — ⚠️ PROVE `QBO_ENVIRONMENT`. THIS GATES THE WHOLE BUILD.**

It has **never been exercised**. OAuth succeeding does not prove it — only an API call reaches the
sandbox or the live host. ⚠️ **A wrong value means work that looks successful and reaches nothing.**

**Make one read-only API call and state which host answered.** Do not proceed past Phase 1 without
this. If it cannot be determined, say so in plain text and **stop the session** — everything after
this depends on knowing which books you are talking to.

**1.3 — Measure the existing scaffolding by object, not from this prompt.**
- `qb_sync_queue` — its shape, ordering, backoff and the 8-attempt ceiling.
- The worker's drain cycle and `RECORD_TABLE_FOR_ENTITY` — ⚠️ **it reportedly OMITS `time_activity`.**
  Confirm.
- `time_clock_sessions` — `qb_push_status`, `qb_time_activity_id`, `qb_synced_at`. ⚠️ **Reportedly
  always null.** Count them on production and state the number.
- `QbEntityType` and `QbOperation` — confirm `time_activity` and `update` are present.
- The S148 trigger fix that let the service role write those columns.

**1.4 — ⚠️ COUNT WHAT IS STRANDED.** QuickBooks was connected 2026-09-30 and nothing has pushed since.
**On production: how many approved timesheet rows exist that have never been pushed, and over what
date range?** Josh needs the size of the gap to decide what to do about history — and under the
no-backfill rule (Part 2) those hours stay out of QuickBooks unless he asks for them separately.

**1.5 — The two rounding rules, read from the code.**
7G rounds **invoicing** up to the quarter hour. Payroll exports **actual logged time**.
⚠️ **State where each rule lives and prove they cannot reach each other.** One leaking into the other
gives books that disagree with the invoices for a month before anyone notices.

**1.6 — How a sandbox company is obtained and connected**, and what proves you are in it.

**1.7 — Housekeeping.** Branches with true merge status. ⚠️ **Delete nothing in Phase 1.**
⚠️ **`feature/s114-c5-multi-upload` is NOT this session's business — leave it entirely alone.**

### ⚠️ END OF PHASE 1 — commit, push, relink the CLI to rebuild-test (`nmyphyhmfttxkdoposvf`), read back.

---

# PHASE 2 — PLAN, ASK, THEN STOP.

⚠️ **PLAIN TEXT ONLY. NEVER AN INTERACTIVE PICKER, NOT ONCE.** Josh is not notified when one appears
and the session sits idle until he happens to look.

Per part: what you will build, the migrations by name, what could go wrong and which stop rule covers
it, and rough size. Put the plan and every question at the top of `docs/sessions/S124-report.md`.
Commit. Push. **Then wait for Josh's approval.**

⚠️ **The plan must state, explicitly, every point at which a QuickBooks WRITE could occur, and what
prevents it reaching live books.**

---

# PHASE 3 — BUILD. ONLY AFTER JOSH APPROVES.

**Order: Part 0, then 1, 2, 3.** ⚠️ **A part ships whole or not at all.** A part unfinished when you
run out of road **stops, unmerged, with a written state.** Josh's crew use production.

---

## PART 0 — the email pacing fix. UNRELATED TO QUICKBOOKS. SHIPS FIRST, MERGES ON ITS OWN.

Carried from S123. ⚠️ **It merges before any QuickBooks work so it is not hostage to a money build
running out of road.** One CI run, one merge, move on.

**Schedule-change notification sends are sequential and unpaced. Resend's default limit is 2 requests
per second**, so a job with many email-only assignees can take a 429 and log `failed` — evidence
written, message never delivered.

**Pace the background sends to ≤ 2 per second.** They already run after the response (S123 D-3), so
⚠️ **pacing costs the user nothing: fifteen subs at two per second is eight seconds nobody is waiting
on.** Prove the pacing with a test that would fail if the sends went out unpaced.

---

## PART 1 — push approved timesheets to QuickBooks

**Approved hours become `time_activity` entries through the existing `qb_sync_queue`.**
⚠️ **Do not build a second queue, a second resolver, or a second worker.** The scaffolding exists;
the gap is that `time_activity` was never wired into it.

⚠️ **Payroll hours, not billable hours.** Actual logged time. **The quarter-hour invoicing rule must
not reach this path**, and a test must prove it cannot.

---

## PART 2 — the company-settings toggle. ⚠️ THIS IS THE SAFETY GATE.

> **[Josh, 2026-10-02]** *"add toggle in company settings to turn QB timesheets on/off."*

Three things it must get right. **None is optional and none is obvious at build time:**

1. ⚠️ **DEFAULT OFF, FOR EVERY EXISTING COMPANY.** If it ships on, every company with a QuickBooks
   connection starts pushing payroll hours into live books the moment this merges, without anyone
   choosing it. **Opt-in, never opt-out.** Prove the default by reading it back from production after
   the migration.
2. ⚠️ **TURNING IT ON DOES NOT BACKFILL.** It applies to approvals from that moment forward. **Pushing
   months of historical hours into live books unannounced is the worst thing this feature can do.**
   A backfill, if ever wanted, is an explicit, dated, separate action — **state in the UI what turning
   it on will and will not do.**
3. ⚠️ **TURNING IT OFF DELETES NOTHING.** Entries already in QuickBooks stay there; the switch stops
   future pushes. **It is not an undo, and the UI must not imply it is.**

---

## PART 3 — the re-push, and this is where duplicates come from

⚠️ **QUICKBOOKS HAS NO PUT. `enqueue()` says it in the repo's own words: "a second POST creates a
SECOND OBJECT."** A naive re-push puts **two time entries on the same day against the same person**,
and nothing in QuickBooks will tell you.

**A re-approval issues a SPARSE UPDATE against the stored `qb_time_activity_id`. Never a create.**

**Every case must be answered and proved in sandbox:**
- An **edit** to an approved segment → update.
- A **split** (S121 added it) → one updates, one is created.
- An **add** → a new entry.
- A re-approval where the push **never succeeded** — queued, failed, or terminal after 8 attempts.
- ⚠️ **A re-approval where `qb_time_activity_id` is null but the entry EXISTS in QuickBooks.** State
  what happens; this is the shape that produces a duplicate.

---

## Per part

- Build it. Proofs with **row counts**. Sabotage every negative, restore it, and **read back what you
  actually wrote**.
- ⚠️ **Before dropping or replacing a database object, commit its captured original** — definition,
  comment, permissions, md5 — in its own pushed commit, with a RESTORE script and a README.
  `docs/sessions/S122-sabotage-originals/` is the pattern.
- Pre-CI check before every CI request. ⚠️ **Sequence runs so a branch run does not race a merge run
  on `main`.** You cannot cancel a run (403).
- Production: **one migration per section**, a dry run listing **exactly one file**, push, then
  **verification by object with every expected value stated.** A mismatch is a stop.
- ⚠️ **Prove a widened CHECK as a SUPERSET of the old list, read from the live constraint — never by
  counting rows.**
- ⚠️ **End every turn with the CLI on rebuild-test**, read back — including a turn that stops.
  ⚠️ **Never `migration repair --status reverted`.**

⚠️ **The Codespace has timed out or restarted FIVE times in three days, three of them mid-build.**
Commit and push after every finding, every proof, every sabotage with its read-back, every production
section and every stop. **An uncommitted file is one timeout from gone** — that already cost a test
fix on 2026-10-01.

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

**The performance audit** (`docs/specs/performance-audit-spec.md`) — its own session, and it fixes
nothing when it runs.
**`feature/s114-c5-multi-upload`** — its own audit. ⚠️ **Do not touch, do not merge, do not delete.**
**The daily log changes** — the floating `/m` bottom bar and the client-facing photo replacing box C.
**Build C — CI serialization.**
**Build F — the project overview job-details block.** **The working-calendar standard holidays.**
⚠️ **Nothing toward any of them.**

---

## Stop rules

1. A production verification value that does not match its expectation.
2. A migration adding a **constraint over existing production rows**.
3. ⚠️ **ANY write reaching a real company's QuickBooks books.** Sandbox only, and the toggle default
   OFF is what guarantees it.
4. ⚠️ **Payroll authority beyond what Josh has explicitly ruled.** Timesheets are payroll.
5. ⚠️ **A create issued where an update was possible** — the duplicate-entry shape.
6. ⚠️ **The quarter-hour invoicing rule reaching the payroll push, or the reverse.**
7. A dry run listing anything but the single file its section names.
8. CI red twice on the same cause (see the two modes above).
9. ⚠️ **The company toggle defaulting to ON for any existing company.**
10. ⚠️ **Any behaviour that backfills historical hours without an explicit, separate instruction.**
11. `QBO_ENVIRONMENT` undetermined — **stop the session** (1.2).
12. ⚠️ **A second Claude Code session live in this checkout.**

**On any stop except 11 and 12:** relink to rebuild-test, prove it, write the state into the report,
commit, push, **move on. Stop the ITEM, not the session.**

---

## Standing evidence rules

- ⚠️ **Verify by object. A prior report is a claim** — including this prompt and
  `docs/specs/S124-spec.md`.
- ⚠️ **Write off-project negatives WITHOUT returning rows.** Count with the service role. An
  `.insert().select()` makes Postgres check the new row against the SELECT policy, so the test passes
  whether or not the write arm exists.
- ⚠️ **A test that passes on zero rows is a failure. State row counts.**
- ⚠️ **A test that still passes after a deliberate sabotage is vacuous** — S122 found three and S123
  found more. **Every sabotage must go red.**
- ⚠️ **Assert an EXACT value or key set, never `includes`.**
- ⚠️ **An e2e that passes on a page that never rendered is not a pass.**
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

## Final report — `docs/sessions/S124-report.md`

- **Which QuickBooks host answered in 1.2**, and how that was established.
- **How many approved timesheet rows on production have never pushed, and over what range** (1.4).
- Per part: merged with its SHA and on production, or stopped and exactly where.
- **The sandbox proof for every Part 3 case**, including the null-`qb_time_activity_id` case.
- **The proof that the company toggle defaults OFF**, read back from production.
- **The proof that the two rounding rules cannot reach each other.**
- Every production section's verification row against its expectation.
- **What a person still has to click**, and **what Josh has to decide** — including whether he wants
  anything done about the stranded hours from 1.4.