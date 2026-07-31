# Module 7D — Invoicing — Spec

> **Derives from** `module7-architecture.md` §7.0 (scope), §7.2 (sub-module table), §7.3
> (dependency map), §7.4 (owns-vs-inherits), §7.5 (cross-cutting), §7.10 (7D trace), and
> `docs/specs/money-representation.md` (FINAL, S93 — the rate and sell model this spec consumes).
> When this spec and the architecture doc conflict, the architecture doc wins until amended — the
> amendments this spec obliges are listed in §A. When this spec and shipped code conflict, **git is
> ground truth** — amend the spec.
>
> **Status:** WORKFLOW APPROVED + PROVEN (interviews S89–S92, extended and reconciled **[S94]**).
> **Schema layer deliberately absent** — see §S. No table names, columns, or file paths are asserted
> as fact. CC writes the schema layer after reading the live upstream schemas named in §S.
>
> **[S94] — what changed.** This revision closes four holes and one stale model found by reconciling
> the spec against `money-representation.md` and the architecture traces: **cost-plus billing was
> absent entirely** (§6); **allowance true-up was absent** (§4b) though architecture §7.2 and §7.10
> both assign it here; **T&M was written against a company-settings rate** that S93 replaced (§7);
> and the **invoice lifecycle had no void state** (§9) though 7E, 7F and 7G all depend on one. It
> also adds the **acceptance trace** §2a requires and the spec did not carry (§15).
>
> **Provenance tags** (repo convention): `[S94]` = Josh's ruling this session · `[inherited]` =
> carried from an existing doc/decision · `[inferred]` = Claude's inference, sound but not explicitly
> stated — **confirm before treating as fixed.**
>
> **Conventions:** follow `CLAUDE.md` — standard columns, per-tenant triggers, RLS naming,
> `get_my_company_id()` / `get_my_member_id()`, soft-delete/trash, server/client service split,
> `author_member_id` precedent. Deviations called out where they arise.

---

## §1 — Scope

7D owns how a job gets billed to the client: what triggers an invoice, how the amount is derived,
what the client receives, and how the invoice lands in the project. It does **not** own money
received (that is 7E) or the cost side (7C).

**The governing invariant (locked):** all income ties to an invoice. No invoice, no tracked income —
the QuickBooks discipline. Every income-bearing thing in this module, including the deposit, is an
invoice. **[S94 extension]** The mirror also holds: every client **credit** ties to a credit document
(§4a) — no credit stands loose.

**Billing bases — all coexist, chosen per instrument, not per job.** **[S94, correcting §7.10]**
Architecture §7.10 stored a `billing_method` **per job**; `money-representation.md` **P4** supersedes
that — _"Contract type lives on the INSTRUMENT, not the job… A project may hold instruments of
different types simultaneously."_ An instrument is an estimate-contract or a change order, and each
is **fixed-price**, **cost-plus**, or **time & materials** with its own negotiated rates. 7D reads
`contract_type` off the instrument and bills accordingly:

| Instrument type  | How 7D bills it                                                             | Section |
| ---------------- | --------------------------------------------------------------------------- | ------- |
| Fixed price      | Percentage of the source, or an edited fixed amount                         | §2      |
| Cost-plus        | Incurred cost × the markup rate in force when incurred                      | §6      |
| Time & materials | Hours × the labor rate in force when worked, plus non-labor cost × its rate | §7      |

**v1 scope boundary (locked):** invoices stay simple. **The user triggers every invoice** — there is
no automatic draw schedule and no draw-schedule object in v1. **[S94 clarification]** "User triggers"
means no _schedule_ fires on its own; the system may still **auto-generate a draft** that waits for
the user, which is what §4 and 7E §4 already do and what architecture §7.8.6 describes
(_"System auto-generates a DRAFT invoice… awaiting owner/admin"_). Nothing reaches a client
unreviewed.

**Deferred post-launch:** structured draw/milestone schedules and **AIA / G702–G703 pay applications**
(named in M7 architecture scope; not built in v1). File these to `TECH_DEBT.md` with real numbers at
build time — do not invent a number here.

---

## §2 — Invoice creation

An invoice is created by one of:

- **Convert an estimate** into an invoice.
- **Convert one or more change orders** into an invoice.
- **Convert several sources at once** — an invoice may pull from the estimate and multiple COs
  together.
- **Standalone** — built directly, using the same input/detail format as an estimate/CO. A
  standalone invoice's amounts **and categories post into project finances**, because they exist
  nowhere upstream to inherit from.
- **[S94] Derived from incurred cost or worked hours** — on a cost-plus (§6) or T&M (§7) instrument.

**Bill method, per source:**

- **Fixed-price instruments:** percentage of the source, or an edited fixed amount.
- **[S94] Cost-plus and T&M instruments: percentage-of-source is not available and must not be
  offered.** On these the source total is `estimates.projected_value`, which **P11 forbids from
  billing math** — _"it must NOT feed variance or over/under-billing math."_ Billing derives from
  incurred cost and worked hours instead (§6, §7).

**Detail format on the invoice:** mirrors the source's format (the user-chosen estimate/CO
presentation format). Standalone invoices use that same format. See §11 for the per-invoice
detail-level choice.

---

## §3 — Deposit

- A deposit is a **fixed-amount invoice** — it obeys every invoice rule, including the income-ties-
  to-invoice invariant.
- **One mechanism (crediting = application):** the deposit is credited against the **budgeted
  amount** and applied at the **first invoice**. These are not two behaviors — they are the same
  single mechanism. If no budget is set when the deposit is taken, the deposit is the first payment
  and is credited to the budgeted amount once the budget is set; the application point is still the
  first invoice.
- **Refundable** in full or part if the project does not proceed (refund mechanics are 7E; the
  deposit's refundable status is set here).
- **No retainage** is held on a deposit invoice (see §5).

---

## §4 — Change orders & selection overages

- When a signed CO carries money, the user is **prompted per CO: bill now (its own invoice) or roll
  into the next invoice.**
- A signed **material-selection overage** (client picked over their allowance) **auto-generates a
  draft invoice for the difference**, and offers the same choice: **bill immediately or add to the
  next invoice.** Default surfaced to the user; user decides.
- **[S94]** A CO carries its own `contract_type` and its own rates, so a **cost-plus or T&M change
  order bills through §6 / §7 against the CO instrument**, not through percentage-of-source.
- A signed CO **raises contract value via 7B's derivation at read** (`contract-value.ts`,
  bidirectional). **7D never writes contract value.**

### §4a — Negative change orders (client removes scope) — **[S94, NEW]**

Architecture §7.11 defines the behavior and architecture §7.2 assigns _"negative-CO credits"_ to 7E,
but neither spec carried it. **Ruling [S94]: the work splits.**

- **7D issues the credit document.** A signed **negative** CO produces its own client-facing **credit
  document** at the same trigger and with the same bill-now-vs-next prompt as a positive CO (§4). The
  client gets paper showing the reduction; the symmetry with positive COs is deliberate.
- **7E applies it** — the credit reduces what the client owes and lands on the final payment (7E §3a).
- **Contract value falls via 7B derivation** (bidirectional, `contract-value.ts`). 7D writes nothing.
- **It exports to QuickBooks as a CreditMemo** (7G). This does **not** contradict _"a signed CO
  exports nothing"_ — the CO itself still exports nothing; the **credit document that bills it**
  exports, because billed value goes to QB. Without this QB overstates income permanently.

### §4b — Allowance true-up — **[S94, NEW — was absent]**

Architecture §7.2 assigns 7D _"Allowance true-up (under-credit at final only)"_ and §7.10 traces it in
full. The spec did not carry it.

- The allowance is tracked as a **total allowance budget** (spent vs. allotted), not per selection.
- **Client comes in OVER** → the material-selection overage path (§4) — a difference invoice.
- **Client comes in UNDER** → an **under-credit**, which is **not automatic**. Per §7.10: the founder
  _"tries to keep the [difference]; credits it only if the client asks, and only at the VERY LAST
  PAYMENT — never mid-job."_
  - The under-credit is therefore **user-initiated**, **Owner/Admin**, and **only available on the
    final invoice**. The system surfaces the under-allowance figure so it can be credited if asked;
    it never applies it on its own and never offers it mid-job.
- **[S94]** Applied as a **credit line on the final invoice**, not a separate credit document — it is a
  price adjustment within the contract, not a scope reduction. _(Contrast §4a, where a negative CO
  **does** get its own credit document because it removes scope.)_

---

## §5 — Retainage (client-held)

- Retainage is a **project-level setting** established at project setup (`project overview`), amount
  varies per project.
- On an invoice it is **held back by default**, **editable per invoice**.
- **Never applied to deposit invoices or T&M invoices.**
- **[S94] What the client owes now.** A $10,000 invoice withholding 10% asks the client for
  **$9,000**. The **$9,000 is the receivable** and the only figure that ages in 7E's 30/60/90; the
  withheld **$1,000 is shown separately as "retainage held"** on the job, visible but **outside the
  aging buckets** — it is not overdue, because it is not yet owed. This keeps collections from looking
  worse than they are.
- Retainage accrues as a held balance. **Release is a 7E concern** — it fires on job completion +
  **client** sign-off and auto-generates a release invoice (7E §4).
- Collecting the released money may prompt the contractor to send an **outbound lien release** first.
  **[S94, per 7F F1] That prompt is ADVISORY — it warns, it never blocks.** This aligns with 7C's
  shipped posture (_"warn-never-block"_) and architecture P2 (advisory-not-enforced). The document
  lifecycle is **7F's**.
- Retainage the company holds back **from subcontractors** is a different thing pointing the opposite
  way — cost withheld, not revenue withheld — and lives in **7C/AP**. Named here so it is not lost or
  conflated; not built here.

---

## §6 — Cost-plus billing — **[S94, NEW — was absent entirely]**

Architecture §7.2 names cost-plus as a 7D billing basis and §7.10 lists it; `money-representation.md`
shipped the rate apparatus. The spec carried none of it.

**The rate.** Each cost-plus instrument carries `cost_plus_percent` rows on `instrument_rates`
(money-rep §4.2), effective-dated. The **rate in force** for a cost item is the non-superseded row
with the greatest `effective_from` **≤ that cost's incurred date** (`expenses.expense_date`).

**The derivation.** Per approved incurred cost row tied to the instrument:

> **sell = cost × (1 + cost_plus_percent-in-force-at-expense_date)**

using money-rep §6's `deriveCostPlusSell(cost, ratePercent)`. **A rateless instrument must never price
at 0%** — the `NoRateInForceError` guard applies exactly as it does at estimate time.

**Which costs go on this invoice.** **[S94] The user picks the cost rows.** The invoice presents
unbilled approved costs for the instrument and the user ticks what to include. This is deliberate
control over what any given invoice contains, and it accommodates deliberately holding something back.

- The picker must show **every** unbilled approved cost, including **shortfalls held back** from an
  earlier downward override (§8), so nothing silently disappears.
- **[S94]** The picker **shows how long each cost has sat unbilled**, so age is visible and costs are
  not accidentally left behind — which matters precisely because the user selects rows by hand.

**The tax base is a per-instrument contract setting.** **[S94]** Some cost-plus contracts mark up
tax-inclusive cost; some mark up pre-tax and pass the tax through. The contract decides, so the choice
is stored **on the instrument** alongside the rate. See §S — it is a new field, and it is **not** a
`rate_type` (a policy flag is not a rate).

> **[OPEN — blocking the pre-tax option]** `money-representation.md` **P3** stores job cost
> **tax-inclusive**. The pre-tax option therefore requires recovering the tax component **per expense
> row**. CC must confirm the expense/allocation rows carry enough to do so (an `apply_tax` flag plus
> rate, or a stored tax component). **If they hold only a tax-inclusive total with no recoverable
> split, the pre-tax option cannot be computed** and this setting collapses to tax-inclusive only.

**Burden — the client never sees it. [S94]** Cost-plus marks up **unburdened** labor cost. The 7A
burden multiplier (`member_burden_settings`) stays **cost-side only**, exactly as it already does for
T&M (money-rep §4.2). This makes one rule for both contract types rather than two: **burden is a cost
measurement and never reaches a client bill.**

**When the rate is set. [S94]** The `cost_plus_percent` rate is established **at project creation or
on the estimate** — i.e. at contract formation, not later and not per invoice. Renegotiation
afterwards is an ordinary new effective-dated row subject to money-rep P5's backdating guard.

> **[VERIFY — CC, follows from the above]** `instrument_rates` anchors on `estimate_id` **XOR**
> `change_order_id` (CHECK `instrument_rates_one_instrument`) — **there is no `project_id`**. For a job
> converted from an estimate these coincide. **Confirm whether a project can be created with no
> originating estimate**; if it can, the "at project creation" path above has nowhere to hang its rate
> and needs one. Read `convert_estimate_to_project()` and the project-creation paths.

**No retainage restriction** — unlike T&M, a cost-plus invoice may carry retainage per §5.

---

## §7 — Time & materials billing — **[S94, rebuilt]**

**This section replaces the company-settings-rate model.** The prior text billed labor at
`companies.default_labor_rate`, a single company-wide value. `money-representation.md` (S93, later and
locked) replaced it: **[S94 ruling, Josh]** _"T&M has separate setting on each project and CO for
hourly rate and material/sub/other markup."_ That is exactly money-rep §4.2's model — no new rate
storage is required, it already exists.

**The rates.** Each T&M instrument carries **both** rate types on `instrument_rates`, effective-dated:

- `tm_labor_hourly` — a flat sell rate **per man-hour**. Overhead and profit are baked in; it **never
  touches cost or markup**, and the 7A burden multiplier **never appears in T&M billing**.
- `tm_nonlabor_percent` — the negotiated markup on **material, subcontractor and other** rows.

**The derivations** (money-rep §6):

> **labor sell = billable hours × tm_labor_hourly-in-force-at-the-worked-date**
> **non-labor sell = cost × (1 + tm_nonlabor_percent-in-force-at-expense_date)**

Missing either rate → `NoRateInForceError`. Never price at 0%.

**Billable hours — the definition money-rep deferred here.** **[S94]**

- **Population:** every **approved** hour logged against the job. Approval is the existing Module 6
  timesheet gate; unapproved hours never reach a client bill.
- **Rounding: rounded UP to the quarter hour.**
- **[S94] Rounding is applied per person per day, not per time entry.** A worker logging three
  segments in a day rounds **once** (up to 15 minutes added), not three times (up to 45).
- **No billable flag in v1** — the population is "approved hours on this job." Non-billable time must
  be kept off the job rather than flagged on it. If that proves insufficient, a billable flag on time
  entries is a Module 6 change, not a 7D one; file to `TECH_DEBT.md` at build.

**Instrument scope.** **[S94, widening the prior text]** The prior spec said a T&M invoice is _"built
from a T&M change order."_ **P4 also permits a T&M estimate-contract**, and the ruling confirms it
("each project and CO"). Both are in scope.

**No retainage** on T&M invoices (§5).

> **Dependency flag, unchanged in substance:** T&M billing consumes **logged hours** from Module 6.
> The billing _rule_ is fixed here; the _source read_ is a §S task. **Business risk (named, not a spec
> error):** T&M value is only as good as logged-hours data. Bishop's hours tracking is poor today
> **because no mechanism exists** — Module 6 is that mechanism, so this feature's value is gated on M6
> adoption.

---

## §8 — Derivation, override, and disposition — **[S94, NEW]**

Applies to every derived invoice (§6 cost-plus and §7 T&M). One mechanic for both.

**The system derives; the user may override.** **[S94]** FrameFocus computes the amount from approved
costs and hours at the rates in force, and presents it as a **proposal**. The user may change it per
invoice, and **the override is stored as an override** — not as a silent replacement of the
derivation. Both numbers survive on the line.

**A downward override prompts for disposition.** **[S94]** Whenever the billed amount is _below_ the
derived amount, the invoice asks what happens to the shortfall:

| Disposition   | Meaning                                                                                                          |
| ------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Write off** | The underlying costs/hours are marked billed. The difference is a permanent margin write-down. It never returns. |
| **Hold back** | The shortfall stays **unbilled** and remains available on a later invoice. §6's cost picker must surface it.     |

Both must be built — this is the superset, not a shortcut. The prompt fires **only** on a downward
override, never on every send.

**Upward overrides. [S94]** Permitted, with **no disposition prompt** — there is no shortfall to
dispose of. The derived and billed figures still both persist, so the difference stays visible.

**What a derived line stores.** Snapshot at approve/send; drafts recompute live.

| Field (concept)                                             | Why                                                                                                                                                  |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cost / hours basis                                          | What was billed against                                                                                                                              |
| **The rate row applied — its identity, not just its value** | **§10 requires it.** When a rate is superseded, 7D must find which sent invoices were priced under it. Storing only the number makes that impossible |
| Derived amount                                              | What the system computed                                                                                                                             |
| Billed amount                                               | What the client was actually charged                                                                                                                 |
| Disposition (`write_off` / `hold_back`)                     | Set only on a downward override                                                                                                                      |

**A sent invoice is immutable.** Its billed amounts are frozen at send; a later rate correction flows
through §10, never by re-deriving a sent invoice.

**[S94] Drafts re-derive; overrides survive.** A draft **re-derives** when a rate or an underlying cost
row changes before send, and any override **is preserved** — but the user is **notified that the
underlying figure moved**, so an override entered against one derivation is never silently carried onto
a different one. Once sent, nothing re-derives (above).

**Downstream consequence, stated so it is not re-litigated:** **7G exports the billed amount and 7H
reports it.** Neither may use the derived figure, or QuickBooks income and job profitability will
disagree with what the client was actually invoiced.

---

## §9 — Invoice lifecycle — **[S94, void added]**

`draft → pending approval (PM path) → sent → paid`, **plus `voided`.** Names indicative; final states
set at schema time per `CLAUDE.md` status conventions.

**Void was absent from this spec** though `7E-spec.md`, `7F-spec.md` and `7G-spec.md` all depend on it,
and architecture §7.2 states _"an invoice can be voided; a received payment cannot."_ 7D owns the
invoice status model (7E §S #1 reads it from here), so the gap was 7D's to close.

**Who and how. [S94]** Voiding requires a **reason** and is **Owner/Admin only** — matching every
comparable corrective action in the platform (`supersede_instrument_rate` is Owner-only with a
required reason; 7C's closeout requires one and is _"auditable forever"_), and mirroring §12's send
gate.

**When a void is permitted:**

| Invoice state                                     | Void?                                                                                     |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Unpaid                                            | **Yes** — Owner/Admin, reason required                                                    |
| Partially paid, payment **not yet in QuickBooks** | **Yes** — **Owner only**, with a warning that the applied payment becomes a client credit |
| Partially paid, payment **already in QuickBooks** | **No** — correct via credit or refund in 7E                                               |
| Fully paid                                        | **No** — correct via credit or refund in 7E                                               |

> **[S94 note — the practical width of the partial-paid case.]** Electronic payments originate in QB
> (7G Model A) and manual payments sync on entry (7G §7G.2 #5), so a payment is in QuickBooks almost
> immediately. **In normal operation "partially paid → voidable" is close to "unpaid → voidable"**;
> the window survives mainly while QB is disconnected and the payment sits queued (7G G3). This is the
> deliberate consequence of blocking rather than unlinking the QB payment — chosen for provable
> book alignment. **CC: sandbox-confirm that QB actually refuses; if it permits the void, this rule
> can be widened.**

**What a void does:**

- The invoice is **frozen** and retained forever — never deleted.
- It propagates to QuickBooks as `operation=void`, zeroing it and backing the income out (7G).
- Its linked **7F conditional release is voided and a new one prompted** (7F F4).
- **Reissue is offered, not required.** **[S94]** A void may be **terminal** — _"void completely is an
  option."_ See §10.

---

## §10 — Corrections & rebills — **[S94, NEW]**

**An unpaid invoice** is corrected by **void + reissue as a linked successor** (§9). The voided
invoice stays frozen; the correction is a **new invoice with its own number**, pre-filled from the
original so nothing is retyped, and **linked back** by an **optional** supersedes link. Invoice
numbering stays strictly sequential and immutable — **no reuse, no suffixes**. A duplicate/pre-fill
function is required.

**A paid invoice** is corrected by **credit or refund in 7E** — never voided.

**A rate corrected after billing.** `supersede_instrument_rate` exists so a mistyped rate can be
fixed, and money-rep's intent is that _"derived sell computed under the typo is retroactively
corrected."_ But a **sent invoice keeps the amount it was sent at** (§8). So when a rate is superseded
and invoices have already gone out priced under the typo, **FrameFocus flags the affected sent
invoices for the user to void and reissue.** Nothing is repriced silently; no catch-up invoice is
auto-generated. **This is what makes §8's rate-row identity mandatory** — without it the affected
invoices cannot be found.

> **[S94 build note]** A single rate correction can flag **many** invoices at once, producing a burst
> of void + create pairs against QuickBooks' 500-requests-per-minute per-company limit. 7G's sync
> queue must pace it (7G G3).

**In QuickBooks**, the void/reissue pair is annotated in the **memo field on both records** — the
voided invoice reads _"replaced by INV-####"_, the successor _"replaces INV-####"_. **The void reason
is deliberately NOT carried into QB** — it stays internal (7G G4).

---

## §11 — Presentation detail — **[S94]**

**Chosen per invoice**, from three levels — all three must be built:

- **Full detail** — hours and costs itemized. Standard for cost-plus, where the client is entitled to
  see what they are paying a percentage on.
- **By section** — labor / materials / subs subtotals, without every underlying row.
- **Lump sum** — one number, matching today's draw style (_"Draw 2: $18,000"_).

**[S94] Default:** the instrument's existing presentation format, since §2 already establishes that
_"detail format mirrors the source's format."_ The per-invoice choice overrides it.

> **Heed the M4 lesson — _"a setting with no control is a bug."_** `proposal_pricing_level` shipped
> with no UI and every proposal rendered lump-sum. Whatever the default, **it needs a control.**

---

## §12 — Roles & approval

- **Owner / Admin:** create and send an invoice **without approval.**
- **PM:** creates an invoice; **requires Owner/Admin approval** before it can send.
- **[S94] Void:** Owner/Admin only, reason required (§9).
- **[S94] Allowance under-credit:** Owner/Admin only, final invoice only (§4b).
- **[S94] Money-in is different.** A PM **can create an invoice** but **cannot record its payment**
  (7E §8, architecture §7.6). That asymmetry is deliberate, not an inconsistency.

The approval notice pings Owner/Admin for quick action — an unapproved invoice is a stalled draw.
Phone-push depends on mobile infrastructure that may not be built (architecture §7.7 #8); the approval
flow works in-app regardless.

---

## §13 — Delivery & landing

- **Email** with a **pay link + attached PDF**, **or** **print the PDF and skip email** — user's
  choice.
- **Either way, the invoice saves to the project.**
- Standalone invoice amounts + categories post into **project finances** (§2).
- The **pay link** is QuickBooks-hosted (7G Model A); FrameFocus shows a clear notice before
  redirecting the client. **[S94]** This is why the Pre-Module 9 gate no longer blocks electronic pay
  — see §O.

---

## §14 — Named notification events (delivery deferred)

7D **emits** these; the **notification system** (separate cross-cutting build) delivers them. 7D does
not build delivery, wording, or channel routing.

- Invoice pending PM approval (→ Owner/Admin)
- Invoice sent (→ Owner/Admin)
- **[S94]** Invoice voided (→ Owner/Admin)
- **[S94]** Invoices affected by a superseded rate, flagged for reissue (→ Owner/Admin) (§10)
- **[S94]** Under-allowance available to credit at final invoice (→ Owner/Admin) (§4b)
- (Payment-received events belong to 7E)

---

## §15 — Acceptance trace — **[S94, NEW]**

> **Why this section exists.** §2a requires _"the approved trace goes into the spec verbatim as the
> acceptance example"_ and _"a worked example per variant before any code."_ The spec previously
> carried acceptance **criteria** (§16) but no acceptance **trace** — the gap M4 Lesson 2 names
> exactly: _"built to spec, but the spec didn't pin down what each view produces."_ 7D now has three
> calculated variants, so it needs three worked examples.
>
> **Status: PROPOSED**, on the same footing as every other trace in Module 7 — architecture §7.12:
> _"none of §7.8, §7.9, §7.10 or §7.11 is 'passing' until it runs against a real Bishop job."_
> Variants **A, D and E use real founder-sourced values** from §7.10/§7.8.6. Variants **B and C use
> illustrative values** — **swap in one real cost-plus job and one real T&M job before build.**

### A — Fixed-price draw _(real values, §7.10)_

```
INPUT   Bathroom job, fixed-price estimate-contract. Draw 2 comes due; user triggers it.
        Bill method: edited fixed amount, $18,000. Project retainage setting: 10%.
DERIVE  Retainage withheld = $1,800.  Payable now = $16,200.
STORE   Invoice, status draft → (Owner/Admin) sent. Presentation: LUMP SUM
        ("Draw 2: $18,000"). Retainage held $1,800 recorded against the job.
OUTPUT  Client receives one line, $18,000, less $1,800 retained = $16,200 due.
        AR ages the $16,200 ONLY. The $1,800 shows as "retainage held", not overdue. (§5)
```

### B — Cost-plus invoice _(illustrative — swap for a real job)_

```
INPUT   Cost-plus instrument, cost_plus_percent = 18% effective 2026-03-01.
        User opens the cost picker and selects three approved costs (§6):
          lumber      $1,000  expense_date 2026-04-02
          plumber     $2,400  expense_date 2026-04-11
          fixtures      $600  expense_date 2026-04-20
DERIVE  Each priced at the rate in force ON ITS OWN DATE — all three fall under the
        18% row, so:  $4,000 cost × 1.18 = $4,720.
        (Had a 22% rate taken effect 2026-04-15, the fixtures row alone would price
         at 22% — the rate is selected per cost, not per invoice.)
STORE   Invoice lines carry cost basis, THE RATE ROW APPLIED, derived $4,720,
        billed $4,720, disposition null. (§8)
OUTPUT  Client bill at the chosen detail level (§11). Selected costs are now billed;
        anything left unticked stays available on the next invoice.
```

### C — T&M invoice with a downward override _(illustrative — swap for a real job)_

```
INPUT   T&M instrument. tm_labor_hourly $85 (eff. 2026-02-01);
        tm_nonlabor_percent 15% (eff. 2026-02-01).
        Approved hours, week of 2026-04-06: 12.6 h logged across two crew.
        Material: $800 (expense_date 2026-04-08).
DERIVE  Hours round UP to the quarter hour, per person per day (§7, ruled):
          crew A 7.1 h → 7.25 h ; crew B 5.5 h → 5.5 h  = 12.75 billable hours.
        Labor  = 12.75 × $85              = $1,083.75   (no burden, no markup)
        Material = $800 × 1.15            =   $920.00
        DERIVED TOTAL                     = $2,003.75
OVERRIDE  User bills $1,900.00 — client pushed back.
          System PROMPTS for disposition on the $103.75 shortfall (§8):
            → user picks WRITE OFF. Hours/material marked billed; $103.75 is a
              permanent margin write-down and never returns.
            (Had they picked HOLD BACK, $103.75 would stay unbilled and reappear
             in the next invoice's picker.)
STORE   Line keeps derived $2,003.75, billed $1,900.00, disposition write_off.
OUTPUT  Client bill $1,900.00. NO RETAINAGE on T&M (§5, §7).
        7G exports $1,900 — the BILLED figure, never $2,003.75. (§8)
```

### D — Change-order invoice _(real values, §7.8.6 / §7.10)_

```
INPUT   Client's tile selection exceeds the $5,000 allowance; selection totals $6,200.
        The selection IS a change order (architecture §7.4). Signed.
STORE   Overage $1,200 → system AUTO-GENERATES A DRAFT invoice, awaiting Owner/Admin.
        Prompt: bill now (own invoice) or roll into the next invoice. (§4)
OUTPUT  Approved → sent. Contract value rises $1,200 via 7B DERIVATION at read —
        7D writes nothing. Billed separately from the scheduled draws.
INVARIANT  Kill the invoice and the CO unwinds — no signed CO stands without a live
        invoice behind it, or contract value inflates with nothing to collect against.
```

### E — Allowance true-up, client UNDER _(real values, §7.10)_

```
INPUT   Tile allowance $5,000. Client selects $4,200. Under by $800.
STORE   Tracked as a TOTAL ALLOWANCE BUDGET (spent vs. allotted) — not per selection.
FLOW    NOTHING happens automatically and nothing is offered mid-job.
        The $800 surfaces as available-to-credit ONLY on the final invoice, and ONLY
        if the client asks. Owner/Admin applies it as a credit line. (§4b)
OUTPUT  Either the final invoice carries an $800 credit line, or it does not and the
        $800 is retained. Both are correct outcomes.
```

### F — Void and reissue _(mechanism)_

```
INPUT   INV-0007 sent for $16,200. Unpaid. Wrong scope on a line.
FLOW    Owner voids with a REQUIRED REASON (§9). INV-0007 frozen forever.
        QB: operation=void, income backed out, memo "replaced by INV-0008".
        Linked 7F conditional release: VOIDED, new one prompted (7F F4).
        Reissue OFFERED, not required — a terminal void is valid (§10).
OUTPUT  User reissues → INV-0008, pre-filled, linked back, memo "replaces INV-0007".
        Had a $500 payment already reached QuickBooks, the void would have been
        BLOCKED and the correction would run through 7E credit/refund instead. (§9)
```

---

## §16 — Acceptance criteria (workflow — PROVEN)

1. An estimate can be converted to an invoice by percentage **and** by edited fixed amount.
2. A single invoice can pull from the estimate **and** ≥2 COs at once.
3. A standalone invoice built in estimate/CO format posts its amounts **and categories** into
   project finances.
4. A deposit invoice is a fixed-amount invoice; it credits to budget (or is credited once a budget
   is set) and can be refunded in full or part.
5. Retainage defaults from the project setting, is editable per invoice, and is **never** applied to
   a deposit or T&M invoice. **[S94]** The invoice's receivable is the amount **net of retainage**;
   the withheld amount shows separately and does not age.
6. A signed CO prompts bill-now vs. next-invoice.
7. A material-selection overage auto-generates a **draft** difference invoice and prompts bill-now vs.
   next-invoice.
8. **[S94, replaces the company-settings-rate criterion]** A **T&M** invoice bills labor at
   `tm_labor_hourly` **in force on the worked date** (approved hours, rounded **up** to the quarter
   hour), and non-labor at cost × `tm_nonlabor_percent` in force on the incurred date, with **no
   burden, no markup on labor, and no retainage**.
9. **[S94]** A **cost-plus** invoice bills each user-selected approved cost at `cost_plus_percent`
   **in force on that cost's own incurred date**; a rateless instrument **refuses to price** rather
   than billing at 0%.
10. **[S94]** A downward override **prompts** for write-off vs. hold-back; a held-back shortfall
    reappears in the next invoice's cost picker; a written-off one never does.
11. **[S94]** Both the **derived** and the **billed** amount survive on the line, and 7G/7H consume
    **billed**.
12. **[S94]** An unpaid invoice can be voided (Owner/Admin, reason required) and reissued as a linked
    successor — or voided terminally with no successor.
13. **[S94]** An invoice whose payment has reached QuickBooks **cannot** be voided.
14. **[S94]** Superseding a rate **flags** the sent invoices priced under it; it never reprices them
    silently and never auto-generates a catch-up invoice.
15. **[S94]** An under-allowance is offered **only** on the final invoice and **only** on user action.
16. Owner/Admin send without approval; a PM-created invoice cannot send until Owner/Admin approve.
17. An invoice can be delivered by email (pay link + PDF) or printed (skip email); both save it to
    the project.
18. No income exists in the system that is not tied to an invoice, **[S94]** and no client credit
    exists that is not tied to a credit document.

---

## §A — Architecture amendments this spec records (READ)

> Recorded so they are not silent surprises at build. Flagged for CC and for a future edit to
> `module7-architecture.md`.

**A.1 — Contract type lives on the INSTRUMENT, not the job.** §7.2's 7D row and §7.10 both describe a
per-**job** billing method (`billing_method per job`). `money-representation.md` **P4** supersedes
this: the type is per instrument, and one project may hold fixed-price, cost-plus and T&M instruments
simultaneously. Amend §7.2 and §7.10.

**A.2 — §7.10's draw triggers are superseded.** §7.10 lists _"draw trigger per job: date / % complete
/ stage complete."_ §1's v1 boundary — user-triggered invoices, no draw-schedule object — is newer and
locked. Amend §7.10, or mark those triggers deferred with the AIA/pay-application work.

**A.3 — §7.10's T&M knobs are superseded.** §7.10 says the two T&M settings _"already exist in company
settings"_ and 7D merely reads them. S93 replaced that with per-instrument effective-dated rates
(§7). The company-settings values are no longer the billing basis.

**A.4 — §7.2's "trace TODO" note is stale or the specs ran ahead.** §7.2 still reads _"7D and 7E are
partially narrated and marked TODO (§7.10) — their full traces are the next interview target."_ Both
specs have since been written and headed WORKFLOW APPROVED. Four items the traces already contained —
cost-plus, allowance true-up, negative-CO credits, the cost pairing — did **not** reach the specs,
which suggests the note was accurate. §15 now supplies 7D's missing trace. **Amend §7.2 once 7E's
lands too.**

---

## §S — Schema layer — TODO for Claude Code (BLOCKS "complete")

This spec is **not** build-ready until CC reads the following live schemas and fills in table
names, columns, FKs, RLS, triggers, service files, and route paths. Do **not** assert any of these
from context — read them. (Reason: M6 specs needed six amendments and four reversals when specs ran
ahead of schema.)

**CC must read and reconcile:**

1. **Signed-artifact / change-order tables** — 7D converts signed COs into invoices and, per §4a,
   issues a **credit document** off a signed negative CO. _([S91] Merged and live: `change_orders` —
   migration `20260704215000`, status `draft|sent|signed|voided`, `net_delta` — plus the
   signed-artifact columns (`20260710120000`); 7B reads them via `contract-value.ts`.)_
2. **Estimate line model** (Module 4) — invoice detail format mirrors the source.
3. **Module 5 project / budget / `contract_value` tables** — deposit-to-budget crediting,
   standalone-amount posting, and the project-level retainage setting.
4. **`instrument_rates` + the shared rate logic** — `money-representation.md` §4.2/§6 and
   `instrument-rates-shared.ts`. **7D consumes `rateInForce()`; it must not restate it.**
   **Confirm `20260730010000_money_representation.sql` is actually applied** — money-rep's own header
   still says _"Not built. No migration exists"_ while the migration file is in the tree.
5. **The 7A/7C cost ledger** — approved `expenses` + `expense_allocations`, `expense_date`, cost
   category, approval state, and **the instrument tag per cost row** (money-rep P6/P7) so §6 can
   attribute costs to the right instrument. _(7C is BUILT [S91] but per `context91` §10 has **never
   been click-tested**, and `20260729010000` is rebuild-test only — prod batch and merge owed.)_
6. **Module 6 time entries** — worked date, approved state, and per-person-per-day grouping for §7's
   rounding. **UNVERIFIED and unmerged; this is 7D's largest upstream risk.**
7. **Project finances model** — where standalone invoice amounts + categories post.
8. **File storage (Module 3)** — where the invoice PDF is stored (inherited pattern).
9. **Company settings** — invoice-format defaults. _([S94] `companies.default_labor_rate` is **no
   longer** the T&M billing basis — §7. Confirm nothing else depends on it before repurposing.)_

**What must now be storable (concepts, not columns):**

- **Per instrument:** the **tax base for markup** — tax-inclusive or pre-tax-with-passthrough (§6).
  A policy flag, **not** a `rate_type`; `instrument_rates.rate_type` holds exactly three rate values.
  **[S94] Fixed at signing — NOT effective-dated.** Unlike a rate, the tax base is a contract term
  agreed once; it does not change mid-job.
- **Per invoice:** status incl. **voided**; **void reason**, voided-by, voided-at; an **optional
  supersedes link** to a successor; the chosen **presentation detail level** (§11); retainage withheld
  and the resulting receivable (§5).
- **Per derived line:** cost/hours basis · **the rate row's identity** · derived amount · billed
  amount · disposition (§8). The rate-row identity is what makes §10's flagging possible.
- **Per cost row:** a billed/unbilled marker and, for held-back shortfalls, the amount still available
  to bill (§6, §8).
- **QB memo text** for void/reissue pairs (§10, 7G G4).

**Also confirm before building:** the material-selection-overage source (§4) — a selection _is_ a
change order (architecture §7.4); verify that class exists and read its shape.

---

## §O — Open / external (not interview-closable, not CC-closable)

- **Pre-Module 9 external-surface gate** governs client-facing surfaces. **[S94 narrowing]** The
  **pay surface is no longer blocked** — 7G Model A has the client pay on **QuickBooks' hosted page**,
  so FrameFocus renders only a redirect notice (7G §7G.6). The invoice **record**, the email/PDF path
  and the pay link can all be built now. The gate still governs any _other_ client-facing surface.
- **Notification system** must be designed before §14's events can deliver.
- **Tax-component recoverability** (§6) — may collapse the per-instrument tax-base setting to
  tax-inclusive only. CC verification, not a Josh decision.
- **Module 6 hours** — §7 cannot be exercised until M6's time entries are readable and merged.

---

## §P — Provenance

- §§1–5, 12–14, 16 (1–7, 16–17): interviewed S89–S92, confirmed by Josh; unchanged in substance except
  where tagged `[S94]`.
- §§4a, 4b, 6, 7, 8, 9, 10, 11 and the `[S94]` acceptance criteria: **Josh's rulings this session**,
  reconciling the spec against `money-representation.md` (FINAL S93) and architecture §7.2/§7.10/§7.11.
- §15 traces A, D, E: **real founder-sourced values** from architecture §7.10 / §7.8.6. Traces B, C, F:
  **illustrative, PROPOSED** — swap in real job values before build.
- Items tagged `[inferred]` are Claude's inference and **must be confirmed** before being treated as
  fixed.
- FrameFocus schema: **not** verified against the live repo — deferred to CC by design (§S).
- **Session number `[S94]` is assumed** from the sequence (context93 / money-rep S93). Confirm and
  adjust the tag if the actual number differs.
