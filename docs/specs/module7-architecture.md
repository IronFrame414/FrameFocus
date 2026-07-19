# Module 7 — Job Finances — Architecture (Design Authority)

> **Role of this document.** This is the design authority for Module 7, equivalent to
> `module5-architecture.md` and `module4-architecture.md`. Every future 7-series spec (7A–7H)
> will derive from and cite this doc by section. When a spec and this doc conflict, this doc wins
> until explicitly amended. When this doc and shipped code conflict, **git is ground truth** —
> amend the doc.
>
> **Status:** ARCHITECTURE + INTERVIEW TRACES. This is _not_ a set of spec files. It contains no
> table definitions, no column names asserted as fact, no file paths asserted as fact. Where M7
> depends on Module 4, Module 5, Module 6, or the signed-artifact work, the dependency is **named
> and marked UNVERIFIED** — its shape is not asserted, because those schemas are either unmerged
> or unread at the time of writing. Spec files come later, after those schemas can be read.
>
> **Why this shape.** Module 6's spec files needed six amendments and four reversals because the
> interviews came after the specs. The signed-artifact spec asserted three things about the
> codebase; two were false. The durable layer is the _workflow_ — what the business actually does.
> File paths and column names rot; workflow does not. This document captures the durable layer and
> defers the perishable layer until it can be verified.
>
> **Interview provenance.** Every trace below is tagged:
>
> - **REAL** — Bishop does this today; the founder narrated it from lived practice.
> - **INVENTED** — Bishop does _not_ do this today; the trace is constructed forward from stated
>   intent. Marked so no future reader mistakes intent for practice. (Precedent: 6E.)
> - Most of Module 7 is INVENTED, because Bishop does not track job cost today. That is the reason
>   Module 7 exists.
>
> **Conventions:** follows `CLAUDE.md` — standard columns, per-tenant triggers, RLS naming,
> `get_my_company_id()` / `get_my_member_id()` helpers, soft-delete/trash pattern, server/client
> service split. Deviations are called out where they arise.
>
> **Depends on (all UNVERIFIED until their schemas are read):** Module 6 (time entries, material
> deliveries, purchase orders — no Module 6 code exists in repo history at time of writing),
> the signed-artifact / change-order signing work (unmerged branch), Module 5 (projects, budget
> baseline, change orders, contracts), Module 4 (estimates, allowances, line model), Module 3
> (file storage — reused for receipts and signed-artifact PDFs), Modules 1/2 (companies, members,
> contacts, subcontractors).

---

## §7.0 — Module overview & scope

Module 7 is where the money becomes real. Every other module produces _events_ — hours worked,
material delivered, a change order signed, an estimate accepted. Module 7 is the ledger those
events post into, the place where "what did this job cost, what did it earn, what's left" is
finally answerable.

**The founding fact, stated plainly:** Bishop Contracting does not track job cost today. Income
and expenses are lumped together. Labor burden lives in the founder's head. The founder has never
closed out a real profit number on anything larger than a very small job. Module 7 exists to make
that number real — with the founder's oversight and review, but without requiring the founder to
hand-assemble it from receipts in the truck.

### What Module 7 OWNS

- **The job cost ledger** — actual and committed cost, per job, from all sources.
- **Contract value and change-order write-through** — the revenue side, including the fix for the
  standing debt that signed change-order deltas do not currently move contract value.
- **Accounts payable** — sub payment schedules, vendor bills, retainage, lien-release gating,
  the "bill expected but not received" state.
- **Invoicing** — what gets billed to the client and on what basis, including the auto-invoice
  generated from a signed material-selection overage.
- **Payments & AR** — money received, applied against invoices, aging, retainage release.
- **Lien releases & waivers** — deferred from 5G; waiver text routed to counsel.
- **The QuickBooks connector** — the export path for approved financial data.
- **Job profitability** — the read-only rollup: budget vs. actual vs. contract, the "we made $X
  on the Miller job" number.

### What Module 7 INHERITS (does not rebuild)

- **File storage** (Module 3) — receipt images/PDFs and signed-artifact PDFs ride the existing
  storage pipeline.
- **Time entries** (Module 6) — labor hours are a _source_ into the ledger, not owned here.
- **Material deliveries and purchase orders** (Module 6) — a delivery and a PO are sources; M7
  owns the _cost_ they imply, not the delivery/PO records themselves.
- **Change orders and the signing pipeline** (Module 5 + signed-artifact work) — M7 owns the
  _financial consequence_ of a signed CO, not the signing mechanism.
- **Estimates, allowances, the budget baseline** (Module 4 / Module 5) — the forecast cost basis
  a job starts from.
- **Members, subcontractors, contacts** (Modules 1/2) — the parties money flows to and from.

### Explicitly NOT in this document

No `7A-spec.md` or any spec file. No table definitions. No column names asserted as fact. No file
paths asserted as fact. No "mirrors service X" claims. Those are written after Module 6 and the
signed-artifact branch merge and their schemas can be read directly.

---

## §7.1 — Collected inherited debts (verified this session)

> **Provenance note.** A prior planning session (a different Claude chat) produced a list of six
> inherited debts. That list was **one chat's claims, not a verified inventory.** This session
> treated it as a starting point to _extend_, not a finished list to confirm. The items below are
> the working set as of this interview. A grep pass across all specs and `TECH_DEBT.md` for items
> naming Module 7 remains a deliverable to run and reconcile against this list — **UNVERIFIED as a
> complete inventory until that grep is run.**

**Carried from the prior chat's list (to re-verify against source):**

1. **Signed change-order deltas do not write through to `projects.contract_value`.** M5 made change
   orders display-only on the budget side. M7 owns the write-through. (Prior chat cited this as
   TECH*DEBT #80 — the \_number* is UNVERIFIED until `TECH_DEBT.md` is read.)
2. **QuickBooks connector is M7's.** Module 6's time tracking carries a `qb_export_status` stub and
   an "only approved sessions export" rule. The connector that consumes them is here. (Column/stub
   names UNVERIFIED — Module 6 has no code yet.)
3. **Damaged goods returned to a vendor have no record of their own** (Module 6D open item 2). M7
   must handle the money consequence — refund, reship, or store credit.
4. **Purchase orders carry quantities, not payables** (Module 6D). M7 owns the _cost_ a PO implies.
5. **Subcontractor lien releases**, deferred from 5G, with unresolved design constraints. State-
   specific waiver forms are legally operative — **routed to professional legal review; waiver text
   is not hand-authored.**
6. **The Pre-Module 9 Decision Gate blocks any client-facing surface.** Invoicing and any client
   selection surface are affected.

**Added this session (not on the prior chat's list — surfaced during the 7A/7C interview):**

7. **The M5 budget rows carry a cost basis only — no sell, no profit per row.** The founder's
   stated intent is cost, sell, and profit on every row. M7 either adds these or derives them
   defensibly, and updates the estimate→project conversion accordingly. **Batched with the parked
   sales-tax question** — both concern how money is represented on the project.
8. **Committed vs. actual cost is not modeled anywhere.** A PO issued or a sub quote signed is money
   gone from the _job's_ perspective before any bill arrives. If the ledger records actuals only,
   "remaining budget" is wrong for as long as a commitment sits open.
9. **Labor burden is not modeled.** Hours × wage is not labor cost — it omits payroll tax, workers'
   comp, and liability. Where the burden multiplier lives (member, company, or cost row) is an
   architecture decision Module 6 does not make. **Resolved in the 7A interview — see §7.8.**
10. **Allowance reconciliation is not owned by any module.** An M4 estimate carries allowances.
    When a selection comes in over its allowance, that overage is a money event that ends in a
    change order or an absorb. **Resolved in the 7A interview — see §7.8, the allowance→CO→invoice
    trace.**
11. **Forecast cost, committed cost, and actual cost are three different numbers at three different
    stages** and must not be conflated. Forecast is estimate-time (pricing off expected sub/material
    cost). Committed is AP-time (a signed quote or agreed PO). Actual is cash-basis (money left the
    account). Surfaced when the founder distinguished estimate-time pricing from AP-time commitment.

---

## §7.2 — Sub-module breakdown (approved)

> Approved in interview. Supersedes the prior chat's breakdown, which was missing a distinct
> invoicing sub-module and did not separate invoicing from payments.

| Sub    | Name                              | Core content                                                                                                                                                                                                                                                                                                           | Workflow-heavy?                          |
| ------ | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| **7A** | Job Cost Ledger                   | The spine. Cost rows: labor / material / subcontractor / other. Cost + sell per row. Committed vs. actual (cash basis). Burden on labor rows. Verification lifecycle. Receipt attachments. Rolls up to job cost, compared against the M5 budget.                                                                       | **YES** — traced §7.8 (INVENTED)         |
| **7B** | Contract Value & CO Write-Through | Owns debt #1. Original contract value + signed change-order deltas write through to the job's contract value — **bidirectional** (a negative CO lowers the total). Material-selection COs write through on the same path.                                                                                              | No — a rule, not a workflow              |
| **7C** | Accounts Payable                  | Sub onboarding + payment schedules, vendor bills, PO→bill, retainage / final hold, lien-release gating (advisory), "bill expected but not received" state, orphaned-commitment closeout. Owns debts #3, #4.                                                                                                            | **YES** — traced §7.9 (REAL / INVENTED)  |
| **7D** | Invoicing                         | What gets billed to the client and on what basis: stages, percentages, cost-plus, T&M — all coexist, set per job. Draw triggers (date / % complete / stage complete). CO invoices billed separately from the schedule. Allowance true-up (under-credit at final only). Produces the document that leaves the building. | **YES** — traced §7.10 (REAL / INVENTED) |
| **7E** | Payments & AR                     | Money received, matched to a specific invoice, aging, under/over handling, retainage release, negative-CO credits, the cost-to-date-vs-revenue pairing. Distinct lifecycle from 7D — an invoice can be voided; a received payment cannot.                                                                              | **YES** — traced §7.11 (REAL / INVENTED) |
| **7F** | Lien Releases & Waivers           | Deferred from 5G. Waiver text routed to counsel — not hand-authored. Depends on 7C and on Module 6's sub-scheduling model. Owns debt #5.                                                                                                                                                                               | No — a document lifecycle, spec-time     |
| **7G** | QuickBooks Connector              | Owns debt #2. The export path for approved financial data. "Only approved sessions export." Depends on 7A / 7C / 7D.                                                                                                                                                                                                   | No — an integration                      |
| **7H** | Job Profitability                 | Read-only. Budget vs. actual vs. contract. The "we made $X on the Miller job" number. Reads everything below it.                                                                                                                                                                                                       | No — a report                            |

**Workflow-heavy sub-modules, requiring approved interview traces before any spec:** 7A, 7C, 7D, 7E.
7A and 7C are traced in this document (§7.8, §7.9). 7D and 7E are partially narrated and marked
TODO (§7.10) — their full traces are the next interview target.

---

## §7.3 — Dependency map

Build order flows from the spine outward. Nothing that reads the ledger can be specced before the
ledger's shape is fixed.

```
                        Modules 4/5/6 + signed-artifact work (all UNVERIFIED)
                                          |
                          (time entries, deliveries, POs,
                           allowances, budget baseline,
                           signed change orders)
                                          |
                                          v
   +--------------------------------------------------------------+
   |  7A  Job Cost Ledger  — the spine, everything posts here     |
   +--------------------------------------------------------------+
        |              |               |                |
        v              v               v                v
   +---------+   +------------+   +-----------+   +--------------+
   | 7B      |   | 7C         |   | 7D        |   | (7A also     |
   | Contract|   | Accounts   |   | Invoicing |   |  feeds 7H)   |
   | Value / |   | Payable    |   |           |   |              |
   | CO w-t  |   | (cost out) |   | (bill to  |   |              |
   +---------+   +------------+   |  client)  |   +--------------+
        |              |          +-----------+
        |              |               |
        |              |               v
        |              |          +-----------+
        |              |          | 7E        |
        |              |          | Payments  |
        |              |          | & AR      |
        |              |          +-----------+
        |              |               |
        |              v               |
        |         +-----------+        |
        |         | 7F Lien   |        |
        |         | Releases  |        |
        |         +-----------+        |
        |              |               |
        v              v               v
   +--------------------------------------------------------------+
   |  7G  QuickBooks Connector — exports approved financial data  |
   +--------------------------------------------------------------+
                                          |
                                          v
   +--------------------------------------------------------------+
   |  7H  Job Profitability — read-only rollup of everything above|
   +--------------------------------------------------------------+
```

**Reading the map:**

- **7A is the spine.** 7B, 7C, 7D all write cost or contract data that lands on the ledger. Its
  shape must be fixed first.
- **7D → 7E is a hard sequence.** You cannot record a payment against an invoice that doesn't
  exist. Invoicing precedes Payments.
- **7F (lien releases) sits alongside 7C**, because the final-payment hold and the lien-release
  gate are AP concerns, but it also depends on Module 6's sub-scheduling model (UNVERIFIED).
- **7G exports** from 7A/7C/7D — it is downstream of anything that produces exportable data.
- **7H reads everything** and writes nothing. It is last.

---

## §7.4 — What Module 7 owns vs. inherits (contract table)

> Every "inherit" row is a cross-module contract. Per the M4 lesson "name cross-module contracts
> early," these are enumerated now. Every shape is **UNVERIFIED** — the upstream schema is unmerged
> or unread. The _contract_ (what M7 needs to read) is named; the _shape_ (columns, types) is not
> asserted.

| Concern                   | Owner                         | What M7 reads / needs                                     | Verified?                             |
| ------------------------- | ----------------------------- | --------------------------------------------------------- | ------------------------------------- |
| Labor hours               | Module 6 (Time Tracking)      | Hours per member per job, approval state, QB export stub  | UNVERIFIED — no M6 code               |
| Material deliveries       | Module 6 (6D)                 | What was delivered, to which job                          | UNVERIFIED — no M6 code               |
| Purchase orders           | Module 6 (6D)                 | PO quantities → M7 derives cost                           | UNVERIFIED — no M6 code               |
| Damaged returns           | Module 6 (6D open #2)         | The return event → M7 handles the money                   | UNVERIFIED — no M6 code               |
| Signed change orders      | Module 5 + signed-artifact    | The signed CO and its delta → write-through               | UNVERIFIED — unmerged branch          |
| Material selections       | Signed-artifact (specialized) | A material selection _is_ a change order (same class)     | UNVERIFIED — spec not written         |
| Allowances                | Module 4                      | Allowance amounts per line, to compare against selections | UNVERIFIED — allowance shape not read |
| Budget baseline           | Module 5 (5E)                 | Estimate-derived budget rows to compare actuals against   | UNVERIFIED — 5E carries cost only     |
| File storage              | Module 3                      | Store receipt images/PDFs and signed-artifact PDFs        | Inherited pattern (established)       |
| Members / subs / contacts | Modules 1/2                   | Parties money flows to/from; burden fields on members     | Established, but burden fields new    |

---

## §7.5 — Cross-cutting design principles

These hold across every M7 sub-module. They are stated here so no future spec re-decides them
silently or "helpfully" adds behavior the founder did not ask for.

### P1 — Cash basis. "Actual" means money left the account.

Nothing is an actual expense until the payment clears. This is a hard rule (founder, 7C interview).
It cleanly separates two states used everywhere in M7:

- **Committed** — an obligation Bishop has taken on: a signed sub quote, an agreed PO, a material
  selection. Affects what's _left_ on the job, never what's _spent_.
- **Actual** — the payment cleared. Only this hits job cost.

### P2 — The system informs; the human decides. Advisory, not enforced.

No financial gate in M7 hard-blocks a payment or an action. Expired COI → warn, don't block.
Missing lien release → warn, don't block (some companies don't do lien releases at all). This
matches the rest of the platform, where punch-complete and CO gates are service-layer, not
iron-clad DB constraints. **A future spec must not "helpfully" convert an advisory warning into a
hard stop.**

### P3 — Single source of truth for the row-type enum.

The cost-row category (`labor | material | subcontractor | other`) is declared _once_, not copied
across files. Copy-paste of an enum across five files is a known latent drift trap on this project.
One definition, referenced everywhere.

### P4 — Forecast ≠ committed ≠ actual. Three numbers, three stages.

- **Forecast** — estimate-time. The founder prices a job off _expected_ sub and material cost
  before anything is committed. This is the estimate's cost basis (7A / M4), not AP.
- **Committed** — AP-time. A signed quote or an agreed PO. A real obligation, known amount.
- **Actual** — cash-basis. Money left the account.

The ledger must hold all three without conflating them. A "bill expected, not received" state is a
_committed_ figure with a known amount, not a forecast and not yet an actual.

### P5 — Verification is the gate into job cost.

Any member can enter an expense. An expense entered by a PM, foreman, or crew member is
**unverified** until an owner or admin verifies it, and an unverified expense is excluded from the
committed→actual rollup until then. Owner/admin entries are verified on save. This mirrors the
established shape of Module 6's "only approved sessions export" and the punch-complete gate.

---

## §7.6 — Roles

**Module 7 introduces no new roles at launch.** Every actor in the M7 traces — owner, admin, PM,
foreman, crew — is an existing platform role. Permissions are handled by _rules on existing roles_,
not by new role types. The two money gates that matter:

- A PM _can_ create invoices and enter bills, but _cannot_ record payments received. Money-in and
  money-out have deliberately different permission shapes (§7.10, §7.11).
- Only owner/admin record payments received.

**Deferred (see §7.12).** Earlier interview turns raised a _view-only financial role_ — a bookkeeper
or outside accountant who could see financials without writing. This is **cut from launch scope** and
recorded as a deferred item to build later. It is not designed here; when it returns, it needs its
own interview and a real `TECH_DEBT.md` number.

---

## §7.7 — Open design constraints

Carried forward as named constraints, not resolved in this document. Each must be settled before
the relevant sub-module is specced.

1. **Pre-Module 9 Decision Gate.** Any client-facing surface — sending an invoice, a client
   material-selection surface — is blocked until the gate resolves. The gate may pivot the entire
   client experience from a hosted portal to email + magic-link tokenized pages. Invoicing (7D) and
   the material-selection flow cannot be specced against a surface that hasn't been decided. NOTE:
   the signed-artifact work suggests the estimate side already ships a tokenized link to a
   portal-less client — whether that precedent opens the gate for invoicing is a gate decision, not
   a spec detail, and is not resolved here.

2. **Reopening a completed job.** A late bill (a vendor bill arriving weeks after close) has nowhere
   to land unless a completed job can be reopened. The 5A lifecycle permits `complete → archived`
   only. The founder has flagged this twice as a design question. It is now a hard M7 dependency —
   both 7A (late cost) and 7C (late bill, "can't close with open bills, but sometimes there's no
   bill yet") require it. The founder believes a reopen path was addressed in a recently built spec;
   this is **UNVERIFIED** and must be confirmed against the actual spec/migration before 7A or 7C is
   specced.

3. **View-only financial role — deferred, not designed.** Earlier turns raised a bookkeeper /
   outside-accountant read-only view. Cut from launch scope and recorded as a build-later item
   (§7.6, §7.12). When it returns it needs its own interview; its external-surface aspect is tangled
   with constraint #1's Pre-Module 9 gate.

4. **Allowance overage → change order → invoice** — resolved as a workflow (§7.8) but leans on two
   UNVERIFIED upstream shapes: the M4 allowance model and the material-selection spec's fields. Both
   are read when those specs are written, not now.

5. **Lien-release / waiver constraints (7F).** Deferred from 5G with multiple unresolved sub-points:
   depends on Module 6's sub-scheduling model; external delivery must follow the Pre-Module 9 gate;
   waiver forms are state-specific and legally operative (route to counsel — do not hand-author);
   a notarization vendor decision is open; and whether these are payment-linked waivers or a
   separate lifecycle-tracking collection is undecided. All carried to 7F spec time.

6. **Vendor credit as a floating asset — accepted imprecision.** A store credit from a damaged
   return leaves the originating job and becomes a floating company asset spent wherever next
   (founder, 7C). Consequence: the original job's cost is slightly overstated until the credit is
   used elsewhere. This is a **known, accepted imprecision**, recorded so it is not later mistaken
   for a bug to chase.

7. **Orphaned-commitment closeout — RESOLVED: marks the sub's record.** Releasing an orphaned
   commitment (a sub who walked on his final stage) requires a reason and corrects the job's
   "what's left." It **also flags the sub's own profile as "did not finish"** — the record carries
   that history forward, visible next time the sub is considered for hire. (Founder, resolved.)

8. **Phone-push approval depends on mobile infrastructure that may not exist.** The 7D invoice-
   approval flow specifies that the approval notice pings owner/admin on their phone for quick action
   (§7.10). This assumes mobile push-notification infrastructure. The founder notes the mobile piece
   **may not be built** — so this is a dependency, **UNVERIFIED / possibly a prerequisite to build
   first**, not an assumed capability. If mobile push is absent, the invoice-approval flow still works
   (approval can happen in-app); only the phone-ping convenience is blocked until the infrastructure
   lands. Confirm the state of mobile push before 7D is specced.

---

## §7.8 — Approved trace: 7A Job Cost Ledger — **INVENTED**

> **Provenance: INVENTED.** Bishop does not track job cost today. Every part of this trace is
> constructed forward from the founder's stated intent, not narrated from lived practice. The
> founder's answer to "where did 'we made $X' come from" was: _"I've never figured this out on
> anything over a very small job."_ That is the clearest statement of why this module exists.
> Marked INVENTED per the 6E precedent. This becomes the acceptance example when 7A is specced —
> but an INVENTED trace is a design target, not a verified behavior. It is not "passing" until it
> runs against a real Bishop job.

### 7.8.1 — The cost row (the atom)

Everything in the ledger is a cost row. A cost row is **one money event against one job**.

```
INPUT    A cost lands: hours logged (Module 6), a receipt, a sub bill, a permit fee.

STORE    project          — which job it hits
         category         — labor | material | subcontractor | other
                            (SINGLE enum, one definition — P3)
         cost_amount      — what it cost Bishop
         sell_amount      — what the client is charged
                            (the M5 budget-row gap, debt #7: budget carries cost only)
         state            — committed | actual   (cash basis — P1)
         burden applied   — labor rows only (see 7.8.3)
         tax              — folded into cost_amount for material; none for subs
         source_ref       — the timesheet / receipt / sub invoice / PO it came from
         entered_by       — the member who added it (get_my_member_id)
         verification     — verified | unverified (see 7.8.2)
         attachment       — receipt image or PDF, optional (Module 3 storage)

OUTPUT   Rolls up by category → job cost.
         Cost vs. sell vs. budget vs. contract → the "what did we make" number,
         read by 7H.
```

**Design decisions fixed in interview:**

- **Sell lives on the cost row**, not only on the budget. Every row carries cost _and_ sell;
  profit derives. (Founder, confirmed.)
- **Committed vs. actual per source:** material (open PO) and subs (signed, unbilled) can be
  _committed_. Labor is _always actual on entry_ — you don't PO labor ahead. (Founder, agreed.)
- **Tax:** folded into `cost_amount` for material; **no tax on subs.** (Founder, #10.)

### 7.8.2 — The verification lifecycle

```
STORE (adds to the row)
  entered_by         — the member who added it
  verification_state — verified | unverified
                       owner / admin entry  → verified on save
                       PM / foreman / crew  → unverified, awaits review
  attachment         — receipt image or PDF (Module 3), optional

OUTPUT
  Unverified rows are visible but EXCLUDED from the committed→actual rollup
  until an owner or admin verifies. Verification is the gate into job cost (P5).
```

Same shape as Module 6's "only approved sessions export" and the punch-complete gate. Any member
can add an expense; PM/foreman/crew entries need owner/admin verification before they count.
(Founder, confirmed.)

### 7.8.3 — Labor burden

The founder does not yet know Bishop's true burden multiplier. The model is built to hold it once
calculated, defaulting to a pass-through until then.

**Fields on the member profile:**

- **current pay** — the member's pay rate
- **burden multiplier** — a per-member multiplier (dimensionless)
- **source toggle** — _use member multiplier_ | _use company fixed_

**Field in company settings:**

- **company fixed burden** — a flat dollar burden per hour, company-wide

**Precedence — resolved by the toggle.** For any labor row, the member's own toggle decides which
input feeds the row. This is a _stored per-member choice_, not a global rule two files could read
differently — which is what kills the drift trap. (Founder, resolved.)

**The arithmetic, and the on-screen operator:**

```
labor row cost_amount, per the member's toggle:

  member multiplier → pay  ×  multiplier  ×  hours
  company fixed     → (pay  +  fixed_per_hour)  ×  hours
```

The toggle **also flips the mathematical symbol shown to the user** — `×` when the multiplier is
in use, `+` when the company fixed per-hour amount is in use. What the user sees on screen _is_ the
arithmetic the row runs. (Founder, explicit — a safeguard, not polish.)

`hours` combines with Module 6's time-tracking output (UNVERIFIED shape).

### 7.8.4 — Receipts, and who can add

- Cost rows carry an optional **receipt attachment** — image or PDF — stored via Module 3's
  existing file pipeline (inherited, not rebuilt).
- **Any member of the company can add an expense.** Entries by PM/foreman/crew are unverified until
  owner/admin verification (7.8.2).

### 7.8.5 — Late costs and reopen (dependency)

A cost posted to the wrong job, or a bill arriving weeks after a job closed, is handled today by
**manually transferring the data** — which is _why a job must be reopenable_ (founder, #11). This
is a hard dependency on the reopen path (§7.7 constraint #2), UNVERIFIED.

### 7.8.6 — Approved trace: allowance overage → signed material selection → auto-invoice

> **Provenance: mixed.** The founder _notices_ allowance overages at material sign-off today — that
> part is REAL. The _automation_ (auto-generated invoice, approval routing, contract write-through)
> is INVENTED. Wire-crossings to other modules are marked UNVERIFIED inline.

**The instruments — two, at two moments (resolved in interview):**

- **Material selection = the signed agreement to pay.** The client signs once, at selection. This
  is the CO-class artifact — it is what writes the obligation. **A material selection _is_ a change
  order** — same class, same back-end path as a 5D change order. The specialized material-selection
  spec adds images and allowance-aware fields pulled from the original contract, sitting _on top of_
  the CO record, not beside it. Because it is a CO, it writes through to contract value on the same
  path (debt #1), and the specialized spec's PDF freeze rides the existing signed-artifact pipeline
  (Module 3 storage), the only addition being the material images in the layout.
- **Invoice = the bill for what was consented to.** No signature. It goes to the client, who pays
  it. This is 7D/7E. The signature _authorizes_; the invoice _collects_. There is never a second
  signature on the bill, and never a bill for something unsigned.

```
INPUT   Client makes material selections against an M4 allowance (UNVERIFIED shape).
        Tile allowance $5,000. Selection totals $6,200.

STORE   Material selection signed by client — a CHANGE ORDER (same class, same
          back-end path as 5D COs; specialized spec adds images + allowance-aware
          fields pulled from the original contract — UNVERIFIED).
        Signed CO → contract value rises (debt #1 write-through path, ONE write-through).
        Overage computed: $6,200 − $5,000 = $1,200.
        System auto-generates a DRAFT invoice for $1,200 (7D), awaiting owner/admin.

FLOW    Owner / admin reviews the draft invoice:
          approve → invoice sends to client (client-facing — Pre-Module 9 GATE)
          kill    → CO VOIDS: contract value backs out, selection reverts,
                    client notified the selection did not take
        Client pays the approved invoice (7E).

OUTPUT  $1,200 → raises the CONTRACT VALUE (revenue) via 7B write-through, read
                 by 7H on the revenue side. Its own cost/sell also post to the
                 ledger (7A). NOTE: a billed CO is contract revenue, not job cost —
                 corrected terminology, founder 7D interview.
        Payment received → AR (7E).

INVARIANT
        No signed CO ever stands without a live invoice behind it. Killing the
        invoice unwinds the whole thing — because the material selection is a CO,
        and a CO with no bill would inflate contract value with nothing to collect
        against it.
```

**Dependencies this trace leans on (carried, not asserted):** the M4 allowance shape, and the
material-selection spec's own fields. Both are read when their specs are written.

---

## §7.9 — Approved trace: 7C Accounts Payable — **REAL / INVENTED**

> **Provenance: mixed.** The founder has _lived_ the sub-onboarding and payment-schedule mechanics
> — quote, W9/COI/license, deposit, staged payments, final held for lien release — even though
> Bishop does not _track_ the resulting cost against jobs. Onboarding and the payment sequence are
> REAL. The tracking, the committed/actual modeling, the "clear for payment" notification, and the
> "bill expected" state are INVENTED — automation the founder needs but does not do today.
>
> **Organizing axis: cash basis (P1).** "Actual" = money left the account. Committed is an
> obligation that affects what's _left_, never what's _spent_. Every part of AP sorts into those two.

```
SUB LIFECYCLE
  INPUT   Sub onboards: signed quote, W9, COI, license.
  STORE   Docs on the sub profile (inherits Contacts / sub table).
          COI / license expiry dates → flagged in the schedule with advance notice.
          Company can override / skip any onboarding step per sub.
          Signed quote total → COMMITTED against the job the day it's signed.
  OUTPUT  Job shows committed AP before any dollar moves.

PAYMENT SCHEDULE
  INPUT   Stages entered as DOLLAR amounts (not %) off the signed quote.
          $24k sub → e.g. $8k deposit / $8k rough-in / $8k final.
  FLOW    Sub asks for a stage → staff confirm work done → owner/admin release.
          Sub bills over the stage → system FLAGS → company user may override.
  STORE   Each stage paid = money leaving = ACTUAL expense, cash basis.

THE BILL ITSELF
  There is always at least one document. Usually one up-front quote listing the
  payment schedule; the founder then bills all stages off that. A sub billing over
  the stage is FLAGGED; the company user may override.

PO vs BILL (vendors)
  The signed quote is the commitment for SUBS. For MATERIAL VENDORS it's a PO you
  agree to — the PO becomes a bill WHEN THE FOUNDER AGREES. Not all vendors send
  paper; some convert the PO to a bill and send it. Due date VARIES per vendor →
  stored per-bill, not a global rule. Hits job financials identically to a sub
  bill / payment.

RETAINAGE / FINAL HOLD
  Two shapes, both REAL:
    (a) % retained across payments, released at WHOLE JOB complete
    (b) final stage held until that sub's work is done + lien release received
  Lien release arrives → system NOTIFIES "clear for payment." Manual pay.

DAMAGED RETURN (6D open #2)
  Outcome VARIES — refund | reship | store credit. A store credit becomes a
  FLOATING company asset (leaves the originating job, spent wherever next —
  accepted imprecision, §7.7 #6).

VERIFICATION (money out)
  Owner / admin / PM can enter a bill. PM entry → owner/admin must verify.
  Same gate shape as 7A expenses (P5).

"BILL EXPECTED, NOT RECEIVED" state
  A committed obligation whose paper hasn't arrived yet. Entered manually, WITH AN
  EXPECTED AMOUNT — by the time a bill is "expected," it's a committed figure with
  a known number (the founder signed the quote or agreed the PO), not a guess.
  This keeps committed cost accurate while waiting, and is what lets a job block on
  close (below) even when no bill document exists.

LATE BILLS / CLOSE
  Can't close a job with open bills. But a bill may not exist yet → the job reopens
  when it arrives (same reopen dependency as 7A, §7.7 #2).

ORPHANED-COMMITMENT CLOSEOUT
  A sub signs $24k, is paid $16k in stages, then walks — never does the final $8k.
  The remaining $8k committed is MANUALLY CLOSED OUT. Closeout REQUIRES A REASON
  (auditable later). It drops the commitment so the job's "what's left" corrects.
  It ALSO flags the sub's record as "did not finish" (§7.7 #7, resolved).

THE NUMBER
  Not tracked today. 7C exists to make "what do I still owe on this job" real:
  = committed − actual, per job, live.
```

**Design posture fixed in interview — AP is advisory, not enforced (P2):**

- **Expired COI → warn, not block.** The user decides to pay or not. (Founder, #1.)
- **Missing lien release → warn, not block.** Some companies don't do lien releases at all.
  (Founder, #2.) The "not releasing final until lien release" practice is founder discipline
  surfaced as a _warning_, not a system-enforced hard stop.
- **Sub bills over stage → flag, company may override.** (Founder, #6.)
- **"Clear for payment" is a notification, not a gate.** The system surfaces that a sub is clear;
  the founder pays manually. (Founder, #10.)

---

## §7.10 — Approved trace: 7D Invoicing — **REAL / INVENTED**

> **Provenance: mixed.** Bishop invoices clients today — through QuickBooks. The billing
> _mechanics_ (staged draws, lump-sum presentation, deposit-as-first-draw, sending invoices) are
> REAL and lived. What is INVENTED is the **tie between an invoice and per-job cost** — Bishop can
> see income per job in QuickBooks but not expenses, which is the gap 7D + 7A + 7G close together.
> This becomes the acceptance example when 7D is specced — PROPOSED until a real Bishop job is
> billed _through this system_ rather than through QuickBooks.

```
BILLING BASIS  (all four coexist — chosen per job at negotiation, not a global rule)
  INPUT   A job is negotiated: stages | percentages | cost-plus | T&M | a mix.
  STORE   billing_method per job (per-job choice, not a company default).
          Draw trigger per job: date | % complete | stage complete.
          Schedule set at negotiation; varies job to job. (Founder, #1, #2.)

THE DEPOSIT
  Deposit = the FIRST progress payment on the schedule (it starts the work).
  Not a separately held amount — it is draw #1, consumed, never reconciled at
  end. (Founder, #5; confirmed in 7E #7.)

THE DRAW / INVOICE
  INPUT   A draw comes due (by its per-job trigger).
  STORE   Invoice created — presentation USUALLY LUMP SUM ("Draw 2: $18,000");
          sometimes broken by section; virtually never line-item. (Founder, #3.)
  OUTPUT  Sent to client. Billed + tracked through QuickBooks today (7G territory).
          FOUNDER INTENT: bill from HERE, linked to QuickBooks (§7.11, 7G).

CO / OVERAGE INVOICE  (from §7.8.6, confirmed)
  A signed CO (e.g. the $1,200 tile) → ITS OWN INVOICE, billed SEPARATELY from
  the original payment schedule. It RAISES THE CONTRACT VALUE (revenue, via 7B),
  but is not folded into the scheduled draws. (Founder, #6.)

T&M  (company decides the knobs — and the knobs already exist)
  Two settings, ALREADY IN company settings today: billable hourly rate +
  material markup rate. 7D READS them; it does not invent them. Confirm both
  against the live company-settings schema at build (verify, not design).
  (Founder, #7; "a setting with no control is a bug" — here the controls ship
  already, so the risk is absent.)

ALLOWANCE TRUE-UP  (client comes in UNDER the allowance)
  Allowance $5,000, client picks $4,200 → $800 under.
  Tracked as a TOTAL ALLOWANCE BUDGET (spent vs. allotted).
  Founder tries to keep the $800; credits it only if the client asks, and only
  at the VERY LAST PAYMENT — never mid-job. (Founder, #8.)

APPROVAL / WHO  (ONE rule, every invoice)
  A PM can CREATE any invoice. It does NOT reach the client until owner/admin
  APPROVES. Create and send are separate steps; approval is the gate between them.
  The approval notice PINGS OWNER/ADMIN PHONE for quick action — an unapproved
  invoice is a stalled draw. NOTE: phone-push depends on mobile infrastructure that
  may not be built yet (§7.7 #8); the approval flow works in-app regardless.
  Same gate SHAPE as expense (§7.8.2) and bill (§7.9) verification: the doer acts,
  owner/admin gates. (Founder, corrected #9.)

TODAY  (the real starting point)
  All billing runs through QuickBooks. Total income per job is knowable there.
  Expenses are NOT tracked per job. (Founder, #10.)
```

---

## §7.11 — Approved trace: 7E Payments & AR — **REAL / INVENTED**

> **Provenance: mixed.** Bishop runs this end-to-end in QuickBooks today — payments arrive,
> get matched to invoices, aging is tracked. The money-in _mechanics_ are REAL. What is INVENTED is
> the **cost pairing** (below): showing cost-to-date against revenue-to-date per job — the number
> the founder has never been able to see. PROPOSED until a real job runs through this system.

```
PAYMENT ARRIVING
  INPUT   Client pays a draw: check | ACH | card | through QB. (All coexist.)
  MATCH   Paid through QB → auto-marks the invoice paid.
          Paid by check → deposit to bank, record payment in QB against the invoice.
          Not-through-QB payments → matched to invoice BY HAND. (Founder, #1, #10.)
  INTENT  Set billing up HERE, linked to QuickBooks. (Founder, #1 — 7G.)

APPLYING
  Every payment MATCHES TO A SPECIFIC INVOICE — not a running "total owed."
  This is the backbone: the cost pairing hangs off the invoice match. (Founder, #3.)

UNDER / OVER
  Underpaid → the draw STAYS OPEN for the balance; founder CHASES it. (Founder, #2.)
  Overpaid  → CREDITED to the next payment; if it is the FINAL payment, founder
              SENDS A CHECK BACK. (Founder, #2.)

AGING     Sent-but-unpaid draws tracked; 30/60-day lateness tracked. QuickBooks does
          this today. (Founder, #4.)

RETAINAGE RELEASE  (client-held, on the contractor — REAL but rare)
  Client-held retainage is POSSIBLE but the founder has not hit it. If held, it
  releases via an INVOICE SENT at completion. Modeled, not deferred; optional per
  company. (Founder, #4, #5.)

FINAL PAYMENT = last draw + release. This is where:
  - client-held retainage releases (if any),
  - the allowance under-credit applies (§7.10 / #8),
  - final payment goes OUT WITH A LIEN RELEASE from the contractor to the client
    (optional per company — see §7.7 #5, now BIDIRECTIONAL). (Founder, #5, #6.)

DEPOSIT   Consumed as draw #1. Never revisited or reconciled at end. (Founder, #7.)

NEGATIVE CHANGE ORDER  (client REMOVES scope — surfaced this interview, new)
  A CO can be NEGATIVE: client removes work / lessens scope. Behavior:
    - issues a CREDIT to the client,
    - LOWERS THE CONTRACT VALUE (7B write-through — now BIDIRECTIONAL, up and down),
    - REDUCES the remaining amount owed,
    - comes off the FINAL PAYMENT.
  (Founder. This did not previously live anywhere — every prior CO reference
  assumed additive. 7B and 7H must handle downward adjustment.)

THE COST PAIRING — why 7E exists (INVENTED)
  On payment: show COST-TO-DATE against REVENUE-TO-DATE per job.
  "Collected $60k, spent $47k, +$13k so far." The number never before visible.
  (Founder, #8; ties to §7.8's "never figured this out on anything over small.")

WHO  (money-in permission is DIFFERENT from money-out — a distinct rule)
  Owner/admin RECORD payments received.
  PM CANNOT record a payment (though a PM can create invoices — §7.10).
  This is deliberately NOT the same shape as the expense/invoice doer-acts gate.
  (Founder, corrected #9.) A view-only financial role was cut from launch — §7.6, §7.12.
```

**Cross-trace note — the lien release is bidirectional.** 7C collects lien releases _from subs_
before paying them (inbound). 7E issues a lien release _to the client_ with final payment
(outbound). Same document type, opposite direction, both optional per company. Carried to 7F, still
counsel-routed.

---

## §7.12 — Provenance and open verification tasks

**Drafted** this session from interview only. No repo reads were performed for this document — by
design, because the point of the session was to capture the durable workflow layer, not to assert
perishable schema facts. Every dependency shape is marked UNVERIFIED.

**Verification tasks owed before any 7-series spec is written:**

1. **Run the grep pass** across all specs and `TECH_DEBT.md` for items naming Module 7; reconcile
   against the debt list in §7.1. Confirm the list is complete. (This session extended the prior
   chat's list but did not run the grep.)
2. **Confirm the reopen path** (§7.7 #2) against the actual spec/migration the founder believes
   built it. It is a hard dependency of both 7A and 7C.
3. **Read the M4 allowance model** before the §7.8.6 trace is specced.
4. **Read the signed-artifact / change-order schema** (once merged) before 7B or §7.8.6 is specced —
   including whether "material selection = change order" holds at the table level.
5. **Read Module 6's schema** (once code exists) for time entries, deliveries, and POs before 7A/7C
   source integration is specced.
6. **Read Module 5's budget baseline (5E)** to confirm the cost-only gap (debt #7) and design the
   sell/profit addition.
7. **Resolve TECH_DEBT numbering** — the prior chat cited #80 and #81; confirm against the actual
   `TECH_DEBT.md`.
8. **Confirm the T&M settings** (§7.10) — billable hourly rate + material markup rate — exist in the
   live company-settings schema. The founder states they do; verify at build.
9. **File the negative-CO behavior** (§7.11) as a 7B design point — the write-through is bidirectional
   (a CO can lower the contract value). Nothing in the repo currently models a downward adjustment;
   confirm this when 7B is specced.

**Two items surfaced this session that had no prior home** (record so they aren't re-lost):

- **Negative change orders** — a CO that removes scope, lowers the contract value, credits the
  client, reduces remaining owed, and comes off the final payment (§7.11). Every prior CO reference
  in the project assumed additive.
- **Outbound lien release** — the contractor issues a lien release _to the client_ at final payment,
  the mirror of the inbound sub lien release 7C collects. 7F is therefore bidirectional (§7.11 note).

**Deferred to a real `TECH_DEBT.md` entry next session** (not assigned a number here — this document
has no sight of the live `TECH_DEBT.md`, and inventing a number risks colliding with an existing
immutable address):

- **View-only financial role** — a bookkeeper / outside-accountant read-only financial view, cut from
  M7 launch scope (§7.6, §7.7 #3). Build later. Needs its own interview and a filed number. When
  filing, note its external-account aspect is tangled with the Pre-Module 9 gate.

**A note on method, for the next session.** This document exists in the shape it does because
Module 6's specs needed six amendments and four reversals when interviews trailed the specs, and
the signed-artifact spec asserted a codebase it hadn't read. The traces here are the durable
capture. Do not promote any UNVERIFIED dependency to fact without reading it. An approved trace is
a design target, not a verified behavior — **none of §7.8, §7.9, §7.10, or §7.11 is "passing" until
it runs against a real Bishop job**, and each becomes testable only when its upstream sources
(Module 6 hours and deliveries, the merged signed-artifact schema) go live.
