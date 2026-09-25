# S111 — SPEC (skeleton) — a project-scoped role, plus photo routing and camera-roll upload

**Status: INCOMPLETE. This is a scaffold, not a spec.**

**RULED** = settled by Josh. **FILL-n** = CC measures and fills in place. **ASK-n** = Phase 2.

⚠️ **A FILL you cannot fill must say why, in one line. Never delete a marker.**
⚠️ **If a measurement contradicts a RULED line, STOP and report — do not reconcile it.**
⚠️ **This section touches the Financial Visibility Floor, the most carefully guarded invariant in
this codebase. A gate that controls only RENDERING still ships the data in the payload (`#136`).
Authority belongs in the database.**

⚠️ **This spec has two parts.** Part One is a new role. Part Two is photo routing and camera-roll
upload. They are independent of each other and are built on **separate branches** — see FILL-14.
Do not let Part Two's smaller surface pull effort away from Part One's Floor work.

---

# PART ONE — a project-scoped role with full project access

## The need, in Josh's words

> "I need to be able to customize the access an account can have. The immediate need is for someone
> with complete access to a project, financials and all. But no access to company level things."

## RULED [Josh, 2026-09-24]

1. **A NEW ROLE, not per-user permissions.** Per-user grants were considered and rejected: they
   would rewrite every policy across ~120 tables from "what role is this" to "what is this person
   granted", and would make the Floor unanswerable by reading one policy.
2. The role has **full access to the projects it is on, money included** — the same financial
   visibility an Owner has, scoped to those projects.
3. The role has **no company-level access.**

⚠️ **"Company level" is not yet defined, and defining it is most of this build.** See FILL-2.

---

## FILL-0 — state

`main`'s tip, the branch, a clean tree. Confirm the S110 sections and the company-email work are
all merged and on production.

---

# FILL-1 — what `project_manager` already is, exactly

⚠️ **This may be most of the answer already.** Before proposing a new role, measure the gap.

For `project_manager`, table by table, state what it can SELECT, INSERT, UPDATE and DELETE:
estimates, change orders, invoices, payments, expenses, budgets, purchase orders, the cost
catalog, projects, contacts, subcontractors, team, settings, billing.

Then state, in one list, **exactly where PM falls short of "full access to a project, money
included"** and **exactly what company-level reach PM has today that the new role must not.**

⚠️ **If the gap turns out to be small, say so plainly.** A narrower change to PM plus a scoping
rule may beat a new role, and that is a finding worth surfacing, not burying.

---

# FILL-2 — what "company level" means, enumerated

Every surface that is not a project. Name each, with the policy or route that enforces it:

- company settings, branding, templates, contract and lien-release settings
- team: viewing members, inviting, editing roles, removing
- billing, subscription, plan, payment method
- the cost catalog
- subcontractor directory, contacts
- QuickBooks connection
- company-wide reports and dashboards
- **the existence of other projects** — ⚠️ state whether this role can see that they exist

For each: does the new role get it, and at what level (none, read, write)? Propose, and mark the
contested ones **ASK-2**.

---

# FILL-3 — the Financial Visibility Floor, extended

The Floor is enforced in the database by role lists. Name every policy, trigger and function whose
role list would need this role added, and every one where adding it would be wrong.

⚠️ **`#136`'s rule holds: a renderer omitting a column is not a floor.** If this role is to see
cost, it must see it because the database permits it, not because a screen chose to draw it.

**FILL-3.1** — Every place a role list is written as a literal array. Adding a role means finding
all of them; a missed one is a silent denial or a silent leak. State the count and the command.

**FILL-3.2** — ⚠️ **Which is the safer failure for this role — denied when it should be allowed,
or allowed when it should be denied?** Say which way each policy fails if the role is missed.

---

# FILL-4 — project scoping

How project membership is expressed today (`project_assignments`, `can_view_project()`, whatever
exists). State whether the new role's access follows assignment, and what it sees for a project it
is not assigned to — nothing, or a name in a list.

**FILL-4.1** — What happens when the role is removed from a project. Does history survive? Who
inherits what they authored?

---

# FILL-5 — the acts that blur the line

For each, say whether the role may do it, and why the answer follows from the ruling rather than
from taste. Mark the genuinely contested ones as ASKs.

| act | company or project? |
| --- | --- |
| create a new project | |
| send a proposal to a client | |
| send and void an invoice | |
| approve or send a change order | |
| invite someone to a project | |
| add a subcontractor to the directory | |
| add an item to the cost catalog | |
| see another project manager's draft estimate | |
| read the company's margin target | |

⚠️ **Several of these write to company-level tables in service of a project.** An invoice belongs
to a project and to the company's books. Say how the boundary is drawn.

---

# FILL-6 — migration and existing rows

Every migration this needs, with a **production** row count for any new constraint. ⚠️ Adding a
value to the role CHECK is a widening and governs no existing row — confirm that, and give Josh the
query anyway.

**FILL-6.1** — ⚠️ **Every total `Record<Role, …>` map in TypeScript.** S108 found two for estimate
status that fail to compile until filled, which is the forcing function worth relying on. Find the
role equivalents and list every runtime `role === …` test that will NOT fail to compile.

---

# FILL-7 — tests

**FILL-7.1** — Every live test that enumerates roles and would now be incomplete. Invert in place,
quoting the superseded assertion. Never delete a test.

**FILL-7.2** — ⚠️ **The proof this build stands or falls on:** the new role reads every money
column on its own project, and **zero rows** on a project it is not on — measured against the
database with a real session, with row counts stated, not asserted from the UI.

**FILL-7.3** — A sabotage run for the Floor: widen one policy wrongly and show the test goes red.

---

# PART TWO — photo routing and camera-roll upload

## The need, in Josh's words

> "the photo from site visit and estimate are under files when converted to project. they should be
> under photos so they can be marked up. also, there is no way to add pictures from the camera roll"

## RULED [Josh, 2026-09-24]

4. **Both items are part of S111.** Splitting them into a later session was proposed and rejected.
5. An image captured on a **site visit**, or attached to an **estimate**, must land under
   **Photos** on the project it converts into — not under Files — so that markup is available on it.
6. **Every place a user can attach an image must offer the camera roll**, not the camera alone.

⚠️ **Nothing in Part Two is assumed.** Each FILL below is a measurement. In particular, do not
assume markup exists, do not assume Photos and Files are separate tables, and do not assume the
conversion copies rows. Measure, then say what is true.

---

# FILL-8 — what actually distinguishes a "photo" from a "file" today

State the mechanism, by reading the schema and the code, not the UI:

- Are Photos and Files **separate tables**, one table with a discriminator **column**, separate
  **storage buckets/prefixes**, or a filter on **MIME type**? Name the table(s) and column(s).
- What does the Photos surface query, and what does the Files surface query? Quote both.
- If the split is by MIME type or extension, say so plainly — that would mean an image is already
  "a photo" and the bug is in the conversion or the query, not in a column.

⚠️ **This answer determines whether Part Two is a data fix, a query fix, or a write-path fix.**
Do not propose a fix before this FILL is filled.

---

# FILL-9 — what the site-visit → project conversion does

Name the route or function. State, line by line, what it does with attached images: copies rows,
re-points `project_id`, re-uploads to a new storage path, or writes new rows.

**FILL-9.1** — The same for an **estimate** converted to a project, which may be a different path.
State whether it is the same code or different code. ⚠️ Two separate surfaces were named in the
report; do not assume one fix covers both until you have read both.

**FILL-9.2** — At which exact line does the image acquire the classification that lands it in Files?
Quote it.

---

# FILL-10 — every image upload entry point

⚠️ **Completeness is the point of this search, so do not truncate it.** A `head`-truncated grep for
a route's consumers is what shipped the S110 site-visit photo regression: the eleventh hit was the
one that mattered. **State the command and the full count.**

For every `<input type="file">`, drag-drop target, and upload handler in the app — `/m` and desktop
both — state:

| surface | accepts | `capture` attribute? | camera roll reachable? |
| --- | --- | --- | --- |

⚠️ **`capture="environment"` or `capture="camera"` on a file input forces the camera on iOS and
Android and removes the photo-library option.** If that attribute is the cause, say so and state
every file it appears in, with the count. If it is not the cause, say what is — do not reach for
the expected answer.

**FILL-10.1** — Whether removing `capture` loses anything Josh wants to keep. On iOS, a plain
`accept="image/*"` input offers Photo Library, Take Photo and Choose File in one sheet. Confirm
that against the actual attribute set in this app rather than from general knowledge, and say how
you confirmed it.

---

# FILL-11 — markup

State whether image markup exists today, where, and what it writes:

- Does it overwrite the original, write a derived image, or store an annotation layer separately?
- Is markup available on **every** image under Photos, or only on images that arrived by one path?
- If markup does **not** exist, say so in one line and stop — ⚠️ **that changes Part Two from a
  routing fix into a feature build, and it becomes ASK-7 rather than something you build.**

---

# FILL-12 — existing rows on production

Site visits and estimates already converted have images sitting under Files on production **right
now**. State the count, per company, with the query.

⚠️ **Moving them is a production data change and is a hard stop (Phase 3 rule 1 and 3).** Do not
write a backfill that runs anywhere but rebuild-test. Give Josh the count and the proposed
statement; he decides. This is **ASK-8**.

---

# FILL-13 — tests for Part Two

**FILL-13.1** — A test that converts a site visit carrying an image and asserts the image is
readable through the **Photos** query and not only the Files query. ⚠️ **State the row count.** A
conversion test that passes with zero attached images is a failure, and S110 shipped exactly that
mistake in reverse — a test that asserted the broken behaviour and locked it in.

**FILL-13.2** — The same for an estimate, unless FILL-9.1 proves it is literally the same code
path, in which case say so and cite the line.

**FILL-13.3** — A guard that fails if a `capture` attribute is reintroduced on an image input,
in the same spirit as the `/m` hardcoded-string guard. Propose it; mark it ASK if you think the
cost outweighs it.

---

# FILL-14 — branches

Part One and Part Two touch different files and carry different risk. Propose **two branches**, one
per part, each with its own CI run. ⚠️ **One branch's CI at a time** — concurrent suites against
rebuild-test produced two false reds in S110.

State the build order you recommend and why. If Part Two turns out to be small and Part One large,
say so; shipping the photo fix first is acceptable and may be preferable.

---

# ASK — Phase 2

**ASK-1** — ⚠️ **What is this role called?** It appears in the invite form, the team list, every
label map and the database. Candidates: `project_admin`, `project_lead`, `partner`,
`project_executive`. Josh's word wins; it is his product's language, not ours.

**ASK-2** — On FILL-2: the contested company-level surfaces, each with your recommendation.

**ASK-3** — On FILL-4: all projects, or only assigned ones?

**ASK-4** — On FILL-5: the acts that blur the line.

**ASK-5** — Who may grant this role? Owner only, or Owner and Admin?

**ASK-6** — On FILL-8/FILL-9: if images can be classified as photos at more than one point
(on upload, on conversion, or by query), which does Josh want changed? State the trade-off in one
line each.

**ASK-7** — Only if FILL-11 finds markup does not exist: what does Josh expect "marked up" to mean
— draw on it, add arrows and text, or something narrower?

**ASK-8** — On FILL-12: does Josh want the images already sitting under Files on production moved
to Photos, or only new ones routed correctly from here forward? Give him the row count with the
question.

**ASK-9** — May these branches be merged, and in what order?

---

## Standing constraints

Branch from `main`, commit path-scoped, never `git add -A`, push after every commit. Migrations
rebuild-test only; verify the CLI link first; never MCP `apply_migration`. `next build` must pass —
type-check alone is not enough. Read the printed exit line. A test that passes on zero rows is a
failure. Nothing touches production. One branch's CI at a time.

---

# AUDIT — before the build

1. Every FILL filled or one line why not; every ASK ruled with the alternative it beat.
2. ⚠️ **FILL-1's gap analysis is stated plainly**, including the case for narrowing PM instead.
3. ⚠️ **Every literal role array is accounted for** — the count matches FILL-3.1.
4. ⚠️ **FILL-7.2 is proven with row counts**: every money column on its own project, zero rows off it.
5. ⚠️ **The Floor is proven by sabotage.**
6. Every migration named, with its production row count.
7. No test deleted; every superseded assertion quoted in place.
8. ⚠️ **FILL-8 is answered before any Part Two fix is proposed** — the mechanism, quoted from the
   schema and both queries.
9. ⚠️ **FILL-10's search is complete and its full count is stated**, not truncated.
10. ⚠️ **FILL-13.1 states the row count** of images in the converted fixture. Zero is a failure.
11. Production rows under Files are counted, not moved.