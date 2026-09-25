# S111 — SPEC (skeleton) — a project-scoped role with full project access

**Status: INCOMPLETE. This is a scaffold, not a spec.**

**RULED** = settled by Josh. **FILL-n** = CC measures and fills in place. **ASK-n** = Phase 2.

⚠️ **A FILL you cannot fill must say why, in one line. Never delete a marker.**
⚠️ **If a measurement contradicts a RULED line, STOP and report — do not reconcile it.**
⚠️ **This section touches the Financial Visibility Floor, the most carefully guarded invariant in
this codebase. A gate that controls only RENDERING still ships the data in the payload (`#136`).
Authority belongs in the database.**

---

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

# ASK — Phase 2

**ASK-1** — ⚠️ **What is this role called?** It appears in the invite form, the team list, every
label map and the database. Candidates: `project_admin`, `project_lead`, `partner`,
`project_executive`. Josh's word wins; it is his product's language, not ours.

**ASK-2** — On FILL-2: the contested company-level surfaces, each with your recommendation.

**ASK-3** — On FILL-4: all projects, or only assigned ones?

**ASK-4** — On FILL-5: the acts that blur the line.

**ASK-5** — Who may grant this role? Owner only, or Owner and Admin?

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