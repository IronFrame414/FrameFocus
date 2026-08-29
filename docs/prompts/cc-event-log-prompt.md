# CC PROMPT — Module: the event log

> **SPEC FIRST, THEN BUILD.** A new subsystem. Every shape decision below is ruled; what remains is
> analysis and design.
>
> **Phases:** 1 read-only analysis → 2 questions in one batch, stop → 3 write the spec, stop for
> approval → 4 build.
>
> Commit often, path-scoped; log every step; push after each. Never `git add -A`. Never commit a state
> that does not type-check. **Cut from `main`.**
>
> Register entries: `outstanding-work-register.md` § C8 (Estimate History) and § C11 (Recent activity).

---

## WHY THIS EXISTS

**Nothing in this app records what happened to a thing over time.** No audit table, no event stream —
confirmed independently in three separate inventory passes (estimates, POs, destinations).

Two designed panels depend on it and **neither can be built without it**:

- **Estimate History** — _"Priced to $123,651 · Aug 22"_, _"Margin dropped 31% → 18.4% · sub bid came in
  high"_, _"Created from Weller template"_.
- **Recent activity** (Dashboard) — the same shape at company level.

⚠️ **`estimates.version_number` is a dead `DEFAULT 'v1.1'` with ZERO writers.** The mockup's `v1.1` is
literally that default. There is no version numbering and no history link. **Do not build on it.**

---

## STANDING TRAPS

- **A constructed identifier is invisible to a literal grep.**
- **Read triggers and constraints, not just RLS policies.**
- **A later migration may supersede an earlier one's comments.**
- **A test that passes on zero rows is a failure.** Eight caught.
- ⚠️ **A new table with a `company_id` joins `COMPANY_CHILDREN`, trial deletion's `COMPANY_TABLES`, and
  the shared purge module (`test-support/company-purge.ts`).** The `file_categories` trigger broke
  company hard-deletion and took out ten suites; days later a **stale duplicate of the purge list** in
  `e2e/trial-fixture.ts` detonated again. ⚠️ **This module writes from triggers on many tables. It is the
  most likely of any item on the register to repeat that incident. Treat it as a first-class
  requirement, not a checklist tick.**

---

# THE RULINGS — made by Josh. Do not re-open them.

## R1 — Build the full log, not an estimates-only one

Three options were considered: a full event log, a narrow estimates-only log serving Estimate History
alone, and cutting both panels. **Full log.**

## R2 — HYBRID: database triggers, plus an optional context field

**Triggers for completeness. An optional context field for _why_.**

Two shapes were weighed:

- **Explicit writes** (`logEvent('estimate.priced', …)` at each call site, the `notify()` precedent) —
  you choose exactly what is recorded and it can say _why_. But **every future write path has to
  remember**, and this codebase has repeatedly found gates that failed because a call site forgot.
- **Triggers** — **nothing can forget**, because it is at the database. But a trigger records
  _column changed from X to Y_, **not** _"margin dropped because a sub bid came in high."_

⚠️ **The mockup's own example is causal**: _"Margin dropped 31% → 18.4% · sub bid came in high."_ **No
trigger knows that.** Hence the hybrid — the trigger guarantees the row exists; an explicit call
attaches the reason when the caller knows it.

**Phase 1 must propose how a caller attaches context to a row a trigger will write** — transaction-local
setting (the `app.po_total` precedent in `set_po_total_amount`), a pre-write staging value, or something
else. ⚠️ **This is the design's hardest mechanic. Do not hand-wave it.**

## R3 — Record CHANGED COLUMNS ONLY, never whole-row snapshots

Storage was the concern; this is the answer to it. **Old-and-new whole-row JSON on every update is the
version that grows without bound** — a wide table's row recorded twice per change. Changed columns only
keeps it small regardless of write volume.

_(For scale: an event row is a few hundred bytes; a busy tenant might write a few thousand a month —
under a megabyte. One uploaded photo is worth thousands of event rows.)_

## R4 — Prune at six months, EXCEPT where the parent object is still open

**Not a flat timer.** A flat six-month prune would blank Estimate History on anything older — and an
estimate's price history is exactly what you want when a client asks late why the number changed.

**What counts as "open":**

| Parent        | Terminal state         | Note                                                                                                                                                                                                               |
| ------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Projects**  | ⚠️ **`archived` ONLY** | A **completed** project keeps its history until archived. A completed job with a warranty claim two years out is precisely when you want it. **This puts the decision in the user's hands rather than a timer's.** |
| **Estimates** | `converted` · `voided` | ⚠️ **But a converted estimate's history is arguably the PROJECT's history — Josh ruled it kept.** Propose how: re-parent on conversion, or follow the project's state.                                             |

---

## R5 — Scope: the objects a contractor talks about

**Traced tables:** `estimates` · `projects` · `change_orders` · `invoices` · `payments` ·
`selections` · `punch_list_items` · `client_contracts` · `subcontractor_contracts` ·
`purchase_orders` · **`tasks`** · **`expenses`**

**Excluded, and why:** `time_segments` (a clock-in every few hours per person, and Timeclock already
shows that history) · `notifications` (already an event stream) · `files` (uploads are visible in the
list with dates) · **the log itself.**

**Test:** someone says _"what happened to that change order."_ Nobody says _"what happened to that time
segment."_

## R6 — RECORD INSERTS AS WELL AS UPDATES

⚠️ **This is why `payments` is in scope.** Payments are **immutable by trigger** —
`enforce_client_payments_column_scope` blocks every money and identity field, only `is_deleted` moves,
and there is no DELETE policy — so a correction is soft-delete plus re-enter. **Their audit trail
already exists in the rows.** They earn a place only because **creation** is the event.

**Recent activity's mockup lines are all creations**: _"8 change orders signed"_, _"Jones Lumber
delivery — 2 damaged"_, _"Hazard flagged on daily log"_. A change-only log could not render that card.

⚠️ **DELETES need an explicit answer.** Almost everything here is **soft-deleted**, which is an _UPDATE_
to `is_deleted` — a trigger sees a change, not a removal. **The formatter must say "voided", not
"changed is_deleted from false to true."** Say how, per table.

## R7 — The row carries `project_id`

Nullable — an estimate has no project until conversion, and company-level changes never do.
**Something must populate it at write time inside a trigger that only sees its own row.** Phase 1 must
say how, per traced table.

_Why:_ without it, "everything that happened on Riverwood" means walking every parent type — a join per
table. With it, one indexed lookup.

## R8 — RLS: MIRROR THE PARENT. Do not classify at write time.

**You read an event if you can read the object it is about.** An EXISTS per parent type.

⚠️ **The alternative — stamping a sensitivity at write time and reading that — was rejected.** It is a
**second answer to a question the parent already answers**, and the two drift. This session alone moved
the **invoice** and **client-contract** policies; a stamped sensitivity would have gone stale within a
day. It is also the A-C27 precedent: the Chat tab carries no `roles` entry _precisely because_
`can_view_project()` already decides, and a second list would have to be kept in step forever.

⚠️ **The constraint that makes this non-negotiable: a _"margin changed 31% → 18.4%"_ event IS A MARGIN
FIGURE, and margin is Owner/Admin.** An event log is a well-known way to leak the thing it describes.

## R9 — Conversion BACKFILLS `project_id`; it does not re-parent

When an estimate converts, **set `project_id` on its existing events.** Leave the parent reference
alone.

⚠️ **Two alternatives were considered and rejected:** _re-parenting_ the rows rewrites history in an
append-only log; _leaving them and following `source_estimate_id`_ means every reader has to know about
the link. **Backfilling the column R7 already added does neither.**

## R10 — How it is viewed, and the formatter

Two surfaces, both from the mockups. **Neither shows a diff.**

| Surface              | Shape                                                                                                                      |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Estimate History** | Right-rail card, newest first. A coloured dot, a sentence, an actor, a date: _"Priced to $123,651 · Josh Bishop · Aug 22"_ |
| **Recent activity**  | Dashboard card, same shape at company level: _"8 change orders signed · QA ClientA · Aug 21"_                              |

⚠️ **The trigger produces `margin: 31 → 18.4`. The screen shows a sentence.** So there is a **per-event-
type formatter** between them, and **it is a real piece of the build** — the place where a missing case
renders raw column names to a user.

**Phase 1 must propose the formatter's shape** and say what an **unformatted** event renders as. ⚠️ **It
must degrade to something human, never to a column name.**

---

# PHASE 1 — analysis. Answer everything, then stop.

## The mechanism

1. ⚠️ **How does a caller attach context to a trigger-written row?** Read `set_po_total_amount`'s
   transaction-local `app.po_total` exemption — the closest in-repo precedent. **Propose the shape with
   its failure modes**: what happens when the trigger fires and no context was set, and what happens if
   context is set and no trigger fires.
2. What generic trigger pattern already exists (`updated_at` triggers, `snapshot_session_rate`,
   `enforce_*_column_scope`)? **Which is the model to follow?**
3. How are "changed columns only" computed in a Postgres trigger — and what does that cost on a wide
   table under a bulk update?

## Scope — now RULED (R5). Analysis only:

4. For **each traced table in R5**, confirm it exists, has `company_id`, and report its write volume
   shape. ⚠️ **Flag any that a trigger would fire on far more often than expected.**
5. What identifies the actor? `auth.uid()` inside a trigger — confirm it resolves, including under
   SECURITY DEFINER and service-role writes. ⚠️ **A cron or a service-role write has no `auth.uid()`.
   What does the row record then, and what does the formatter show?**
6. **R7's `project_id`, per table** — how is it reached from each traced row inside a trigger? Some are
   direct; `invoices` and `change_orders` carry it; an estimate does not until R9's backfill. **Name the
   path for each, and where there is none.**

## Reading it — the SHAPE is ruled (R8, R10). Analysis only:

7. **Write the mirror-the-parent policy per traced table.** ⚠️ **An EXISTS against a parent whose own
   policy is complex — `invoices` is now authorship-scoped for a PM — must inherit that, not
   approximate it.** Report any parent whose policy makes the EXISTS expensive.
8. **The formatter (R10).** Propose its shape, and enumerate the event types the two panels need. ⚠️
   **Report the gap between what a trigger produces and what the mockup shows**, and say what an
   unformatted event renders as. **It must degrade to something human, never a column name.**
   ⚠️ **Include the soft-delete case from R6** — "voided", not "is_deleted false → true".

## Retention

9. How would the prune run — a cron, a scheduled function, something else? What exists already
   (`lib/notify/crons/*` is the precedent)?
10. R4's "still open" test — write the predicate for both parents. ⚠️ **What happens to an event whose
    parent was hard-deleted?**
11. ⚠️ **R9's backfill** — where in `convert_estimate_to_project` does it go, and is the RPC still
    transactional with it? _(Authoritative def: `20261025000000:151-416`.)_

## Risk

12. ⚠️ **Every place a new table with a `company_id` must be registered.** Name the files. This has
    detonated twice — and **this module writes triggers on twelve tables**, so it is the likeliest of
    anything on the register to repeat it.
13. Every test that would go red or false-green. ⚠️ **A trigger on a widely-written table breaks
    fixtures that assume a row count** — and R6 means **inserts fire it too**, so every fixture that
    creates one of the twelve is affected.

---

# PHASE 2 — one batch, then stop

What you found, what needs ruling, every test that would go red or false-green, and any premise you
could not confirm. **Finish the analysis before asking.**

---

# PHASE 3 — write the spec, then stop

**`docs/specs/event-log-spec.md`.** Commit it; do not build until Josh approves.

Required:

- ⚠️ **An `input → store → output` trace with REAL NUMBERS.** Trace at least:
  1. **An estimate repriced $100,900 → $123,651** — the trigger fires, the row records the changed
     columns, an explicit caller attaches _"sub bid came in high"_, and **Estimate History renders the
     mockup's line.** ⚠️ **Show what renders when NO context was attached** — that is the common case.
  2. **A trigger firing with no `auth.uid()`** — a cron or service-role write. What the row says.
  3. **An event surviving the six-month prune because its project is complete-but-not-archived**, and
     the same event being pruned once archived.
- ⚠️ **A UI section** — both panels, their roles, and what each row renders.
- ⚠️ **An RLS section** stating plainly how an event cannot leak what its parent hides. **Include the
  margin case.**
- **A retention section** with the prune's schedule, predicate and failure behaviour.
- **Assert no table names, columns or paths you have not read.** Leave `§S` blocks.

**Then stop.**

---

# PHASE 4 — build, after approval

Order: **the table and its triggers first**, then the context mechanism, then Estimate History, then
Recent activity, then the prune. Separate commits. Migrations **attended, one at a time**, DB before
git, CLI re-linked to rebuild-test after.

Full battery — type-check, lint, cold build, unit, the live RLS suites, **Playwright in four chunks**.
Report counts per suite.

⚠️ **Watch the fixture suites especially.** A trigger on a widely-written table is exactly the shape that
breaks fixtures far from the change.
