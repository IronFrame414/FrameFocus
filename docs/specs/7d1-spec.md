# Module 7D1 — Invoicing — Spec

> **Derives from** `module7-architecture.md` §7.0 (scope), §7.2 (sub-module table), §7.3
> (dependency map), §7.4 (owns-vs-inherits), §7.5 (cross-cutting), §7.10 (7D trace), and
> `docs/specs/money-representation.md` (FINAL, S93 — the rate and sell model this spec consumes,
> **amended by §A.5/§A.6 below**). When this spec and the architecture doc conflict, the architecture
> doc wins until amended — the amendments this spec obliges are listed in §A. When this spec and
> shipped code conflict, **git is ground truth** — amend the spec.
>
> **Status:** WORKFLOW APPROVED + PROVEN (interviews S89–S92, extended and reconciled **[S96]**,
> traces completed and four rulings corrected against practice **[S97]**).
> **Schema layer deliberately absent** — see §S. No table names, columns, or file paths are asserted
> as fact. CC writes the schema layer after reading the live upstream schemas named in §S.
>
> **[S97] — what changed.** Every calculated variant now carries a **founder-corrected** trace
> (§15 B and C were illustrative; both are now real). Four rulings changed against practice:
> **cost-plus carries four rates, not one** (§6); **T&M is the in-house-only contract type** (§7);
> **hours round up to the HALF hour, not the quarter** (§7); and the **void actor** is narrowed once
> a payment is applied (§9, §12). §11's three presentation levels are confirmed real, and full
> detail is pinned to a layout (§11, §15).
>
> **[S96] — the prior revision.** Closed four holes and one stale model found by reconciling the
> spec against `money-representation.md` and the architecture traces: cost-plus billing was absent
> entirely (§6); allowance true-up was absent (§4b); T&M was written against a company-settings rate
> that S93 replaced (§7); and the invoice lifecycle had no void state (§9). It also added the
> acceptance trace §2a requires (§15).
>
> **[S97 — second batch: the §O owed list is CLOSED.]** Josh answered all five outstanding items
> plus one new question. **R1** discounts replace the downward-override mechanic — write-off /
> hold-back RETIRED, build scope removed (§8); **R2** percentage-of-source is real — priced off the
> ORIGINAL contract value, final draw bills the remainder (§2, trace G); **R3** labor presentation
> ruled (§11); **R4** negative COs produce a credit LINE, not a credit document — §A.5 REVERSED, no
> QB CreditMemo (§4a, trace H); **R5** trace B's line text + incurred dates supplied (§15-B);
> **R6** deposits on cost-plus/T&M draw down as a job credit balance (§3a).
>
> **Provenance tags** (repo convention): `[S96]` = ruled in the spec-reconciliation session ·
> `[S97]` = ruled in the trace-completion session · `[inherited]` = carried from an existing
> doc/decision.
>
> **Session-numbering correction [S97]:** this file previously tagged its rulings `[S94]`. That was
> wrong — `context94.md` records S94's commits as `5633b5d` + `79c1ae8` (113c stage 1), while the
> spec commits `0f62380` / `127c504` postdate S95's work and are claimed by `context96`. All former
> `[S94]` tags are now **`[S96]`**. The same correction is owed in `7e1`, `7f1`, `7g1`, `7h1`.
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
invoice. **[S96 extension, amended S97]** The mirror also holds — superseded wording: _"every client
**credit** ties to a credit document (§4a) — no credit stands loose."_ **[S97]** With §4a's reversal
there is no credit document: every client credit ties to an **invoice credit line** (negative-CO
credit §4a, allowance under-credit §4b, deposit draw-down §3a) or is a **7E refund**. No credit
stands loose.

**Billing bases — all coexist, chosen per instrument, not per job.** **[S96, correcting §7.10]**
Architecture §7.10 stored a `billing_method` **per job**; `money-representation.md` **P4** supersedes
that — _"Contract type lives on the INSTRUMENT, not the job… A project may hold instruments of
different types simultaneously."_ An instrument is an estimate-contract or a change order, and each
is **fixed-price**, **cost-plus**, or **time & materials** with its own negotiated rates. 7D reads
`contract_type` off the instrument and bills accordingly:

| Instrument type  | How 7D bills it                                                                                 | Section |
| ---------------- | ----------------------------------------------------------------------------------------------- | ------- |
| Fixed price      | Percentage of the source, or an edited fixed amount                                             | §2      |
| Cost-plus        | Crew labor at a flat rate per man-hour; material / sub / other at cost × that category's markup | §6      |
| Time & materials | Crew labor at a flat rate per man-hour; all non-labor at cost × one markup                      | §7      |

**[S97] Cost-plus and T&M share the labor mechanic and differ on scope.** Both bill the company's
own crew at a flat sell rate per man-hour. The distinction is **who does the work**: see §7.

**v1 scope boundary (locked):** invoices stay simple. **The user triggers every invoice** — there is
no automatic draw schedule and no draw-schedule object in v1. **[S96 clarification]** "User triggers"
means no _schedule_ fires on its own; the system may still **auto-generate a draft** that waits for
the user, which is what §4 and 7E §4 already do and what architecture §7.8.6 describes
(_"System auto-generates a DRAFT invoice… awaiting owner/admin"_). Nothing reaches a client
unreviewed.

**Deferred post-launch:** structured draw/milestone schedules and **AIA / G702–G703 pay applications**
(named in M7 architecture scope; not built in v1). File these to `TECH_DEBT.md` with real numbers at
build time — do not invent a number here. **[S97 — recorded, deliberately NOT resolved:** Josh's own
contracts carry a milestone percentage schedule **in the agreement itself** (trace G), while v1 keeps
no draw-schedule object — he types each draw by hand. A stored draw schedule is a deferred
enhancement alongside the AIA work, **not a v1 change**.]**

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
- **[S96] Derived from incurred cost or worked hours** — on a cost-plus (§6) or T&M (§7) instrument.

**Bill method, per source:**

- **Fixed-price instruments:** percentage of the source, or an edited fixed amount.
- **[S96] Cost-plus and T&M instruments: percentage-of-source is not available and must not be
  offered.** On these the source total is `estimates.projected_value`, which **P11 forbids from
  billing math** — _"it must NOT feed variance or over/under-billing math."_ Billing derives from
  incurred cost and worked hours instead (§6, §7).

> **[RESOLVED — S97] Percentage-of-source is REAL.** _Superseded OPEN: "Percentage-of-source has no
> worked example… Either supply one real draw billed as a percentage, or rule the method out of v1.
> Until then it is specced but unproven."_ Josh supplied a real milestone schedule (trace G:
> contract $14,413.75 — deposit 10%, permit approval 30%, rough-in 25%, cabinets 25%, substantial
> completion 10%) and TWO RULES:
>
> - **(a) Percentages apply to the ORIGINAL contract value.** A signed CO never re-prices the
>   original contract's draws — a CO bills separately on its own terms (§4; consistent with P4,
>   type and pricing per instrument).
> - **(b) The FINAL draw is the REMAINDER** — whatever is unbilled — **NOT a fresh percentage.**
>   Multiplying and rounding each draw independently sums to $14,413.77, two cents over the
>   contract; the remainder rule makes the draws sum exactly.

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
- **No retainage** is held on a deposit invoice (see §5) — unchanged by the [S97] §3a below.

### §3a — Deposits on cost-plus and T&M instruments — **[S97, NEW]**

The mechanism above assumes a fixed contract value — _"credited against the **budgeted amount** and
applied at the **first invoice**"_ — which does not carry to derived billing. **Ruling: a deposit MAY
be taken on a cost-plus or T&M instrument.** Fixed-price keeps the mechanism above, unchanged. On a
derived instrument:

- The deposit is still a **fixed-amount invoice** — §1's income-ties-to-invoice invariant holds.
- It is held as a **CREDIT BALANCE on the job** and **draws down across derived invoices until
  exhausted**: each derived invoice is computed normally (§6/§7), then the remaining credit is
  applied against it **as a credit line, up to the invoice total**.
- If the invoice is **smaller than the remaining credit**, it settles to zero and the leftover
  carries forward. Once the credit is exhausted, invoices are payable in cash.
- **Never hidden netting:** the client always sees the derived work **in full**, then the deposit
  applied as its own line.
- §S must make the per-job deposit credit balance **storable, with its remaining amount visible**.

---

## §4 — Change orders & selection overages

- When a signed CO carries money, the user is **prompted per CO: bill now (its own invoice) or roll
  into the next invoice.**
- A signed **material-selection overage** (client picked over their allowance) **auto-generates a
  draft invoice for the difference**, and offers the same choice: **bill immediately or add to the
  next invoice.** Default surfaced to the user; user decides.
- **[S96]** A CO carries its own `contract_type` and its own rates, so a **cost-plus or T&M change
  order bills through §6 / §7 against the CO instrument**, not through percentage-of-source.
- A signed CO **raises contract value via 7B's derivation at read** (`contract-value.ts`,
  bidirectional). **7D never writes contract value.**

### §4a — Negative change orders (client removes scope) — **[S96, REVERSED S97]**

**[S97 — Josh's ruling, from a real case, REVERSES this section and §A.5.]** The real case: mid-job,
the client had paid a deposit, then removed tile repair from scope; Josh issued a **−$5,000 CO** and
it simply reduced what she still owed. The superseded [S96] design, quoted:

> _"**7D issues the credit document.** A signed **negative** CO produces its own client-facing
> **credit document** at the same trigger and with the same bill-now-vs-next prompt as a positive CO
> (§4)… **7E applies it** — the credit reduces what the client owes and lands on the final payment
> (7E §3a)… **It exports to QuickBooks as a CreditMemo** (7G)."_

**The rules now in force (build scope REMOVED — do not restore):**

- A signed negative CO becomes a **CREDIT LINE on an invoice** — the same shape as §4b's allowance
  under-credit. **No standalone client-facing credit document.** **[S97 later ruling — placement is
  USER-DIRECTED, not automatic:** the credit does NOT automatically ride the next invoice; it sits
  **AVAILABLE** and the user **chooses which invoice carries it** — the same shape as a positive
  CO's "bill now or roll into the next invoice" prompt (§4). _Superseded same-session clause: "No
  separate bill-now-vs-next prompt (a credit has nothing to 'bill now')."_]**
- **NO QuickBooks CreditMemo export.** QB simply sees a **smaller next invoice**; income is not
  overstated. _(7E's CreditMemo/RefundReceipt objects survive for 7E's own credit-on-account and
  money-returned cases — this ruling removes only the negative-CO document.)_
- **If no balance remains** to absorb the credit, it becomes a **REFUND handled in 7E** — Josh
  sends a check.
- **Contract value falls via 7B derivation** (bidirectional, `contract-value.ts`); 7D writes
  nothing. _(Unchanged.)_

Worked case: trace **H** (§15) — which also closes the prior _"[OPEN — JOSH] §4a has no worked
example… needs one real deductive CO."_

### §4b — Allowance true-up — **[S96]**

Architecture §7.2 assigns 7D _"Allowance true-up (under-credit at final only)"_ and §7.10 traces it in
full.

- The allowance is tracked as a **total allowance budget** (spent vs. allotted), not per selection.
- **Client comes in OVER** → the material-selection overage path (§4) — a difference invoice.
- **Client comes in UNDER** → an **under-credit**, which is **not automatic**. Per §7.10: the founder
  _"tries to keep the [difference]; credits it only if the client asks, and only at the VERY LAST
  PAYMENT — never mid-job."_
  - The under-credit is therefore **user-initiated**, **Owner/Admin**, and **only available on the
    final invoice**. The system surfaces the under-allowance figure so it can be credited if asked;
    it never applies it on its own and never offers it mid-job.
- **[S96]** Applied as a **credit line on the final invoice**, not a separate credit document — it is a
  price adjustment within the contract, not a scope reduction. **[S97]** _Superseded contrast:
  "(Contrast §4a, where a negative CO **does** get its own credit document because it removes
  scope.)"_ — §4a as amended uses the **same credit-line shape as this section**; no credit
  document exists anywhere in 7D. The remaining difference is placement: §4a lands on a
  **user-chosen** invoice (§4a as amended), §4b is offered **only on the final** one.

---

## §5 — Retainage (client-held)

- Retainage is a **project-level setting** established at project setup (`project overview`), amount
  varies per project.
- On an invoice it is **held back by default**, **editable per invoice**.
- **Never applied to deposit invoices or T&M invoices.** A **cost-plus** invoice **may** carry
  retainage per this section.
- **[S96] What the client owes now.** A $10,000 invoice withholding 10% asks the client for
  **$9,000**. The **$9,000 is the receivable** and the only figure that ages in 7E's 30/60/90; the
  withheld **$1,000 is shown separately as "retainage held"** on the job, visible but **outside the
  aging buckets** — it is not overdue, because it is not yet owed. This keeps collections from looking
  worse than they are.
- Retainage accrues as a held balance. **Release is a 7E concern** — it fires on job completion +
  **client** sign-off and auto-generates a release invoice (7E §4).
- Collecting the released money may prompt the contractor to send an **outbound lien release** first.
  **[S96, per 7F F1] That prompt is ADVISORY — it warns, it never blocks.** This aligns with 7C's
  shipped posture (_"warn-never-block"_) and architecture P2 (advisory-not-enforced). The document
  lifecycle is **7F's**.
- Retainage the company holds back **from subcontractors** is a different thing pointing the opposite
  way — cost withheld, not revenue withheld — and lives in **7C/AP**. Named here so it is not lost or
  conflated; not built here.

---

## §6 — Cost-plus billing — **[S96, rebuilt [S97]]**

Architecture §7.2 names cost-plus as a 7D billing basis and §7.10 lists it; `money-representation.md`
shipped a rate apparatus. **[S97] That apparatus was one rate, and one rate does not match practice.**

### §6.1 — The rates: FOUR, not one — **[S97]**

A cost-plus instrument carries **four** effective-dated rates, one per cost category:

| Category             | Rate shape                                           |
| -------------------- | ---------------------------------------------------- |
| **Labor** (own crew) | **flat dollar rate per man-hour** — not a percentage |
| **Material**         | markup %                                             |
| **Subcontractor**    | markup %                                             |
| **Other**            | markup %                                             |

Two consequences, both deliberate:

1. **Labor on a cost-plus job is not marked-up cost.** The company's own crew bills at a flat sell
   rate per man-hour, exactly as under T&M (§7). Overhead and profit are baked into that rate. It
   never touches cost or markup, and the 7A burden multiplier never reaches it.
2. **The three non-labor categories carry independent markups.** They may all be equal — the trace in
   §15-B is a real job billed at a flat 20% across the board — but the system must permit them to
   differ.

> **This supersedes `money-representation.md` §4.2's single `cost_plus_percent`.** See **§A.6** — it
> requires a migration, not a doc edit, and it reaches the estimate side as well as invoicing.
> Precedent: Module 4 already stores per-category markup defaults, and these four categories are 7A's
> existing cost categories.

**Rate in force.** For a cost item, the rate that applies is the non-superseded row **of that item's
category** with the greatest `effective_from` **≤ that cost's incurred date** (`expenses.expense_date`).
For labor, the applicable date is the worked date.

**The derivation.** Per approved incurred cost row tied to the instrument:

> **non-labor sell = cost × (1 + that category's markup-in-force-at-expense_date)**
> **labor sell = billable hours × labor-rate-in-force-at-the-worked-date** (billable hours per §7.2)

**A rateless instrument must never price at 0%** — the `NoRateInForceError` guard applies exactly as
at estimate time, and **[S97]** must now fire when **any** of the four rates a job actually uses is
missing, not merely when a single rate is absent.

### §6.2 — Which costs go on this invoice

**[S96] The user picks the cost rows.** The invoice presents unbilled approved costs for the
instrument and the user ticks what to include. This is deliberate control over what any given invoice
contains, and it accommodates deliberately holding something back.

- The picker must show **every** unbilled approved cost, so nothing silently disappears.
  **[S97, with §8's amendment]** — superseded clause: _"including **shortfalls held back** from an
  earlier downward override (§8)."_ There is no hold-back mechanism anymore: **not selecting a cost
  IS the hold-back** — it stays unbilled and keeps appearing here (with its age) until billed.
- **[S96]** The picker **shows how long each cost has sat unbilled**, so age is visible and costs are
  not accidentally left behind — which matters precisely because the user selects rows by hand.

### §6.3 — Tax base

**The tax base for markup is a per-instrument contract setting.** **[S96]** Some cost-plus contracts
mark up tax-inclusive cost; some mark up pre-tax and pass the tax through. The contract decides, so
the choice is stored **on the instrument** alongside the rates. See §S — it is a new field, and it is
**not** a rate (a policy flag is not a rate).

> **[OPEN — CC, blocking the pre-tax option]** `money-representation.md` **P3** stores job cost
> **tax-inclusive**. The pre-tax option therefore requires recovering the tax component **per expense
> row**. CC must confirm the expense/allocation rows carry enough to do so (an `apply_tax` flag plus
> rate, or a stored tax component). **If they hold only a tax-inclusive total with no recoverable
> split, the pre-tax option cannot be computed** and this setting collapses to tax-inclusive only.

### §6.4 — Burden

**Burden — the client never sees it. [S96]** The 7A burden multiplier (`member_burden_settings`) stays
**cost-side only**. **[S97] This rule is load-bearing, not cosmetic:** §11's full-detail presentation
shows the client the **actual cost** of each row, so a burdened figure would present the client an
inflated basis for the markup. **Burden is a cost measurement and never reaches a client bill.**

### §6.5 — When the rates are set

**[S96]** Rates are established **at project creation or on the estimate** — i.e. at contract
formation, not later and not per invoice. Renegotiation afterwards is an ordinary new effective-dated
row subject to money-rep P5's backdating guard.

> **[VERIFY — CC]** `instrument_rates` anchors on `estimate_id` **XOR** `change_order_id` (CHECK
> `instrument_rates_one_instrument`) — **there is no `project_id`**. For a job converted from an
> estimate these coincide. **Confirm whether a project can be created with no originating estimate**;
> if it can, the "at project creation" path has nowhere to hang its rates and needs one. Read
> `convert_estimate_to_project()` and the project-creation paths.

---

## §7 — Time & materials billing — **[S96, rebuilt; scope and rounding corrected [S97]]**

**This section replaced the company-settings-rate model.** The original text billed labor at
`companies.default_labor_rate`, a single company-wide value. `money-representation.md` (S93, later and
locked) replaced it with per-instrument effective-dated rates.

### §7.1 — What makes a job T&M — **[S97]**

> **T&M requires the work to be done completely in-house.** Where subcontractors are involved, the
> job is **cost-plus** (§6).

This is the real distinction between the two types and it explains their rate shapes: T&M needs only
**one** non-labor markup because its non-labor is essentially materials, while cost-plus needs subs
and materials treated separately.

> **[S97, correcting the upstream model]** `money-representation.md:269–278` describes T&M as _"a full
> third type (not mapped onto cost-plus)"_ and defines cost-plus as one markup on **every** row
> including labor. The _separation_ is right; the _stated reason_ and the cost-plus definition are
> wrong. Amend per §A.6.

**The rates.** Each T&M instrument carries **both** rates, effective-dated:

- A flat sell rate **per man-hour** for labor. Overhead and profit are baked in; it **never touches
  cost or markup**, and the 7A burden multiplier **never appears in T&M billing**.
- One negotiated markup on **all non-labor** (material, subcontractor, other).

**[S97] The labor rate is set per job**, and **every crew member on a job bills at the same rate** —
there is no per-person sell rate. (The system carries per-person **cost** rates — `member_pay_rates`,
Owner/Admin-only — which are cost-side and never client-facing.) The rate varies job to job with who
is needed and how far the job is; it does not vary within a job.

**The derivations:**

> **labor sell = billable hours × labor-rate-in-force-at-the-worked-date**
> **non-labor sell = cost × (1 + non-labor-markup-in-force-at-expense_date)**

Missing either rate → `NoRateInForceError`. Never price at 0%.

### §7.2 — Billable hours — **[S96, increment corrected [S97]]**

- **Population:** every **approved** hour logged against the job. Approval is the existing Module 6
  timesheet gate; unapproved hours never reach a client bill.
- **[S97] Rounding: sum each person's approved hours for the day, then round that daily total UP to
  the HALF hour.** One rounding per person per day — **not** per time entry, and **not** to the
  quarter hour.

> **Worked example (founder-sourced, [S97]).** One person, one day, one job: 3h10m in the morning and
> 4h05m in the afternoon = **7h15m actual → 7.5 billable hours.** Rounding once per person per day is
> what makes this 7.5 rather than 8.0 (3h10m→3.5 plus 4h05m→4.5). At half-hour increments that
> difference is real money on every man-day.

> **[S97] Correction notice.** Every prior statement of this rule said _quarter hour_. The wrong
> increment appears in `7g1-spec.md:238` and `7h1-spec.md:89, :349` as well. **All must be corrected
> together** — 7D and 7H otherwise compute different labor totals from the same hours.

- **No billable flag in v1** — the population is "approved hours on this job." Non-billable time must
  be kept off the job rather than flagged on it. If that proves insufficient, a billable flag on time
  entries is a Module 6 change, not a 7D one; file to `TECH_DEBT.md` at build.

**Instrument scope.** **[S96]** Both a T&M **change order** and a T&M **estimate-contract** are in
scope (P4 permits both).

**No retainage** on T&M invoices (§5).

> **Dependency flag:** T&M billing consumes **logged hours** from Module 6. The billing _rule_ is
> fixed here; the _source read_ is a §S task. **Business risk (named, not a spec error):** T&M value
> is only as good as logged-hours data. Bishop's hours tracking is poor today **because no mechanism
> exists** — Module 6 is that mechanism, so this feature's value is gated on M6 adoption.

---

## §8 — Derivation, discounts, and overrides — **[S96, REBUILT S97 — R1]**

Applies to every derived invoice (§6 cost-plus and §7 T&M). One mechanic for both.

**The system derives; the derived total STANDS. [S97]** FrameFocus computes the amount from approved
costs and hours at the rates in force. **A reduction is a LINE ITEM, not an override:** Josh never
silently bills under the derived figure — he adds an explicit **DISCOUNT LINE** with a **negative
amount, visible to the client**. Derived lines + discount lines = billed total, so derived-vs-billed
visibility survives as line arithmetic the client can read.

**[S97 — BUILD SCOPE REMOVED. Do not restore:** the write-off / hold-back disposition pair, the
downward-override prompt, and the per-line disposition field are RETIRED. The superseded [S96]
mechanic, quoted: _"**A downward override prompts for disposition.** Whenever the billed amount is
below the derived amount, the invoice asks what happens to the shortfall: **Write off** — the
underlying costs/hours are marked billed… It never returns. **Hold back** — the shortfall stays
unbilled and remains available on a later invoice. §6.2's cost picker must surface it… Both must be
built — this is the superset, not a shortcut."_ The [OPEN — JOSH] that questioned it — _"confirm
that downward overrides happen in practice… or the write-off / hold-back pair should be
reconsidered for v1"_ — is closed by removal: they don't happen; Josh discounts.]**

What replaces the pair:

- **A DISCOUNT is forgiveness.** The amount is gone and **never rebilled**. The underlying costs
  stay marked billed at their derived value; the discount line carries the reduction.
- **"Holding a cost back" needs no mechanism:** not selecting it in §6.2's picker leaves it
  unbilled, visible (with its age) in the next invoice's picker.

**Upward overrides.** Permitted, unchanged, with no prompt. The derived and billed figures both
persist, so an upward difference stays visible.

**What a derived line stores.** Snapshot at approve/send; drafts recompute live.

| Field (concept)                                             | Why                                                                                                                                                  |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cost / hours basis                                          | What was billed against                                                                                                                              |
| **Category**                                                | **[S97]** Determines which of §6.1's four rates applied                                                                                              |
| **The rate row applied — its identity, not just its value** | **§10 requires it.** When a rate is superseded, 7D must find which sent invoices were priced under it. Storing only the number makes that impossible |
| Derived amount                                              | What the system computed                                                                                                                             |
| Billed amount                                               | What the client was actually charged                                                                                                                 |

**[S97]** The `Disposition` row is **removed** with the write-off / hold-back pair. A **discount
line** is an ordinary invoice line with a **negative amount** — client-visible, stored like any
other line.

**A sent invoice is immutable.** Its billed amounts are frozen at send; a later rate correction flows
through §10, never by re-deriving a sent invoice.

**Drafts re-derive; overrides and discounts survive.** A draft **re-derives** when a rate or an
underlying cost row changes before send, and any override or discount line **is preserved** — but
the user is **notified that the underlying figure moved**, so an adjustment entered against one
derivation is never silently carried onto a different one. Once sent, nothing re-derives.

**Downstream consequence, stated so it is not re-litigated:** **7G exports the billed amount and 7H
reports it.** Neither may use the derived figure, or QuickBooks income and job profitability will
disagree with what the client was actually invoiced.

> **[VERIFY — CC] Rounding granularity.** Derivation rounds money with `roundMoney`
> (`Math.round(value*100)/100`) applied **per row**. §15-B's real figures land identically whether
> rounded per row or per invoice, so that trace cannot settle it. **Pick one deliberately** — with
> different cents they diverge.

---

## §9 — Invoice lifecycle — **[S96, void added; actor narrowed [S97]]**

`draft → pending approval (PM path) → sent → paid`, **plus `voided`.** Names indicative; final states
set at schema time per `CLAUDE.md` status conventions.

Architecture §7.2 states _"an invoice can be voided; a received payment cannot."_ 7D owns the invoice
status model (7E §S #1 reads it from here).

**Who and how.** Voiding requires a **reason**. **[S97]** The actor depends on whether money has been
applied:

| Invoice state                                     | Void?                                                                                     |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Unpaid                                            | **Yes** — **Owner/Admin**, reason required                                                |
| Partially paid, payment **not yet in QuickBooks** | **Yes** — **Owner only**, with a warning that the applied payment becomes a client credit |
| Partially paid, payment **already in QuickBooks** | **No** — correct via credit or refund in 7E                                               |
| Fully paid                                        | **No** — correct via credit or refund in 7E                                               |

> **[S97] The partial-paid window is vanishingly narrow, by design.** **All payments sync to
> QuickBooks automatically.** Electronic payments originate in QB (7G Model A) and manual payments
> sync on entry (7G §7G.2 #5), so **the "not yet in QuickBooks" row exists only while QB is
> disconnected and the payment sits queued** (7G G3). **This is the only case.** Build it as the
> exception it is, not as a general capability. **CC: sandbox-confirm that QB actually refuses; if it
> permits the void, this rule can be widened.**

**What a void does:**

- The invoice is **frozen** and retained forever — never deleted.
- It propagates to QuickBooks as `operation=void`, zeroing it and backing the income out (7G).
- Its linked **7F conditional release is voided and a new one prompted** (7F F4).
- **Reissue is offered, not required.** A void may be **terminal** — _"void completely is an option."_
  See §10.

---

## §10 — Corrections & rebills — **[S96]**

**An unpaid invoice** is corrected by **void + reissue as a linked successor** (§9). The voided
invoice stays frozen; the correction is a **new invoice with its own number**, pre-filled from the
original so nothing is retyped, and **linked back** by an **optional** supersedes link. Invoice
numbering stays strictly sequential and immutable — **no reuse, no suffixes**. A duplicate/pre-fill
function is required.

**A paid invoice** is corrected by **credit or refund in 7E** — never voided.

**A rate corrected after billing.** `supersede_instrument_rate` (Owner-only, non-empty reason —
verified in `20260730010000_money_representation.sql`) exists so a mistyped rate can be fixed, and
money-rep's intent is that _"derived sell computed under the typo is retroactively corrected."_ But a
**sent invoice keeps the amount it was sent at** (§8). So when a rate is superseded and invoices have
already gone out priced under the typo, **FrameFocus flags the affected sent invoices for the user to
void and reissue.** Nothing is repriced silently; no catch-up invoice is auto-generated. **This is what
makes §8's rate-row identity mandatory** — without it the affected invoices cannot be found.

> **[S96 build note]** A single rate correction can flag **many** invoices at once, producing a burst
> of void + create pairs against QuickBooks' 500-requests-per-minute per-company limit. 7G's sync
> queue must pace it (7G G3).

**In QuickBooks**, the void/reissue pair is annotated in the **memo field on both records** — the
voided invoice reads _"replaced by INV-####"_, the successor _"replaces INV-####"_. **The void reason
is deliberately NOT carried into QB** — it stays internal (7G G4).

---

## §11 — Presentation detail — **[S96; CONFIRMED against practice [S97]]**

**Chosen per invoice**, from three levels — all three must be built. **[S97] Confirmed real:** invoices
are issued at all three levels depending on the job and the client.

- **Full detail** — itemised, in **layout A** below. Standard for cost-plus, where the client is
  entitled to see what they are paying a percentage on.
- **By section** — labor / materials / subs subtotals, without every underlying row.
- **Lump sum** — one number, matching today's draw style (_"Draw 2: $18,000"_).

**[S97] Full detail is layout A — the client sees actual cost and the markup as a separate line:**

```
FULL DETAIL (layout A)      BY SECTION                 LUMP SUM
sub #1           1,200.00   Subcontractors  3,930.00   Billing to date  5,830.42
sub #2           1,800.00   Materials       1,900.42
sub #3             275.00   TOTAL           5,830.42
lumber             958.48
plumbing fixtures  625.20
Subtotal         4,858.68
Markup @ 20%       971.74
TOTAL            5,830.42
```

**This is why §6.4's burden rule matters** — the cost column is shown to the client, so it must be
unburdened.

**[S96] Default:** the instrument's existing presentation format, since §2 already establishes that
_"detail format mirrors the source's format."_ The per-invoice choice overrides it.

> **Heed the M4 lesson — _"a setting with no control is a bug."_** `proposal_pricing_level` shipped
> with no UI and every proposal rendered lump-sum. Whatever the default, **it needs a control.**

> **[RESOLVED — S97] Labor presentation.** _Superseded OPEN: "How does labor render in layout A?
> Labor bills at hours × flat rate, not cost + markup, so it does not fit the Subtotal / Markup /
> Total shape… Needs one cost-plus or T&M invoice with crew hours on it to pin the layout."_ Ruled
> directly:
>
> - **Fixed-price:** labor shows as a **single total** — no markup shown.
> - **Cost-plus and T&M:** show the math — labor gets **its own line as hours @ rate**, **OUTSIDE**
>   the subtotal/markup block; **Subtotal and Markup cover non-labor only**; **TOTAL sums both**:
>
> ```
> Labor — 42 hrs @ $100/hr    4,200.00     (own line, outside the block)
> sub #1                      1,200.00
> …                                  …
> Subtotal (non-labor)        4,858.68
> Markup @ 20%                  971.74
> TOTAL                      10,030.42     (labor + non-labor + markup)
> ```

---

## §12 — Roles & approval

- **Owner / Admin:** create and send an invoice **without approval.**
- **PM:** creates an invoice; **requires Owner/Admin approval** before it can send.
- **[S97] Void:** **Owner/Admin** while the invoice is unpaid; **Owner only** once any payment has
  been applied (§9). Reason required in both cases.
- **[S96] Allowance under-credit:** Owner/Admin only, final invoice only (§4b).
- **[S96] Money-in is different.** A PM **can create an invoice** but **cannot record its payment**
  (7E §8, architecture §7.6). That asymmetry is deliberate, not an inconsistency.

The approval notice pings Owner/Admin for quick action — an unapproved invoice is a stalled draw.
Phone-push depends on mobile infrastructure that may not be built (architecture §7.7 #8); the approval
flow works in-app regardless.

---

## §13 — Delivery & landing

- **Email** the invoice, **or** **print the PDF and skip email** — user's choice.
- **[S97] Whether the emailed invoice carries a pay link depends on QuickBooks Payments.**
  - **QB Payments connected** → email carries a **pay link + attached PDF**. The pay link is
    QuickBooks-hosted (7G Model A); FrameFocus shows a clear notice before redirecting the
    client.
  - **QB Payments NOT connected** → the invoice carries **no payment button at all**
    (7G §7G.2 #3). It is simply a viewable bill: **PDF only**. Payment is recorded manually
    (7E §2). **There is no client-facing "you cannot pay online" notice** — the affordance is
    absent, not explained, so no new client-facing surface is introduced.
- **Either way, the invoice saves to the project.**
- Standalone invoice amounts + categories post into **project finances** (§2).
- **[S96]** The QB-hosted pay link is why the Pre-Module 9 gate no longer blocks electronic
  pay — see §O.

---

## §14 — Named notification events (delivery deferred)

7D **emits** these; the **notification system** (separate cross-cutting build) delivers them. 7D does
not build delivery, wording, or channel routing.

- Invoice pending PM approval (→ Owner/Admin)
- Invoice sent (→ Owner/Admin)
- **[S96]** Invoice voided (→ Owner/Admin)
- **[S96]** Invoices affected by a superseded rate, flagged for reissue (→ Owner/Admin) (§10)
- **[S96]** Under-allowance available to credit at final invoice (→ Owner/Admin) (§4b)
- **[S97]** Signed negative-CO credit AVAILABLE, awaiting the user's choice of carrying invoice —
  or, with no balance left, handed to 7E as a refund (→ Owner/Admin) (§4a as amended; no
  credit-document event exists)
- (Payment-received events belong to 7E)

---

## §15 — Acceptance trace — **[S96; B and C made REAL [S97]]**

> **Why this section exists.** §2a requires _"the approved trace goes into the spec verbatim as the
> acceptance example"_ and _"a worked example per variant before any code."_
>
> **Status.** Traces **A, B, C, D, E are founder-sourced.** **[S97] B and C were illustrative and are
> now real** — walked through against actual jobs, §2a step 3 complete. Per architecture §7.12 no
> trace is _"passing"_ until it runs against a real Bishop job **through this system**.

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

### B — Cost-plus invoice _(REAL values, [S97])_

```
INPUT   Cost-plus ESTIMATE-CONTRACT — the original contract, not a CO.
        Rates: 20% on materials, subs and other. Crew labor bills at a flat
        rate per man-hour (no crew hours fell on this invoice).
        User opens the cost picker and selects five approved costs (§6.2),
        each with its incurred date [S97]:
          subcontractor #1    $1,200.00   2026-05-28
          subcontractor #2    $1,800.00   2026-06-01
          subcontractor #3      $275.00   2026-06-01
          lumber                $958.48   2026-05-20
          plumbing fixtures     $625.20   2026-05-19

DERIVE  Each row priced at the rate in force FOR ITS CATEGORY on that cost's
        own incurred date (§6.1). One 20% rate ran the whole job, so:
          subs       $3,275.00  ->  $3,930.00
          materials  $1,583.68  ->  $1,900.42
        Cost $4,858.68 + markup $971.74 = $5,830.42

STORE   Invoice lines carry cost basis, CATEGORY, THE RATE ROW APPLIED, derived
        $5,830.42, billed $5,830.42; no discount lines. (§8 as amended [S97] —
        the disposition field no longer exists)

OUTPUT  Presentation chosen per invoice (§11); this one FULL DETAIL (layout A) —
        each cost at actual cost, then Subtotal $4,858.68, Markup @ 20% $971.74,
        TOTAL $5,830.42. Cost shown to the client is UNBURDENED (§6.4).
```

> Computed with the shipped functions — `deriveCostPlusSell` and `roundMoney`
> (`Math.round(value*100)/100`), applied per row.
> **[RESOLVED — S97]** _Superseded OPEN: "the client-facing description for each line (what replaces
> 'subcontractor #1'), and the five incurred dates."_ **Line text:** the client sees **the title
> Josh puts on the line item** — there is no separate description model. **Incurred dates:** now in
> the INPUT above. One 20% rate ran the whole job, so the math is unchanged — but the trace now
> **demonstrates rate-in-force selection**: each row prices at its category's rate in force on its
> own cost date.

### C — T&M invoice _(REAL values, [S97])_

```
INPUT   T&M ESTIMATE-CONTRACT — all in-house, per §7.1.
        Rates: labor $100 per man-hour; non-labor markup 20%.
        Approved labor: 42 hours.
        Materials: $175.20 and $168.20.

DERIVE  Labor     42 h x $100        = $4,200.00   (no burden, no markup)
        Material  $175.20 x 1.20     =   $210.24
        Material  $168.20 x 1.20     =   $201.84
        TOTAL                        = $4,612.08

STORE   Lines carry hours/cost basis, CATEGORY, THE RATE ROW APPLIED, derived
        $4,612.08, billed $4,612.08; no discount lines. (§8 as amended [S97] —
        the disposition field no longer exists)

OUTPUT  Client bill $4,612.08. NO RETAINAGE on T&M (§5, §7).
        Markup earned on material: $68.68.
```

### C-1 — Billable-hours rounding _(real, [S97] — see §7.2)_

```
INPUT   One person, one day, one job. Morning 3h10m; afternoon 4h05m.
DERIVE  Sum the person's day FIRST: 7h15m actual.
        Round the daily total UP to the half hour: 7.5 billable hours.
        (Rounding each session separately would give 3.5 + 4.5 = 8.0 — WRONG.)
OUTPUT  7.5 h x the labor rate in force on that worked date.
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
FLOW    Owner/Admin voids with a REQUIRED REASON (§9). INV-0007 frozen forever.
        QB: operation=void, income backed out, memo "replaced by INV-0008".
        Linked 7F conditional release: VOIDED, new one prompted (7F F4).
        Reissue OFFERED, not required — a terminal void is valid (§10).
OUTPUT  User reissues → INV-0008, pre-filled, linked back, memo "replaces INV-0007".
        Had a $500 payment already reached QuickBooks, the void would have been
        BLOCKED and the correction would run through 7E credit/refund instead. (§9)
```

### G — Percentage-of-source draw schedule _(REAL values, [S97])_

```
INPUT   Fixed-price contract $14,413.75. Milestone schedule in the agreement:
        deposit 10% - permit approval 30% - rough-in 25% - cabinets 25% -
        substantial completion 10%. No draw-schedule object in v1 (§1) —
        the user triggers and types each draw.
DERIVE  Each draw = its percentage of the ORIGINAL contract value (rule a):
          deposit          10%   $1,441.38
          permit approval  30%   $4,324.13
          rough-in         25%   $3,603.44
          cabinets         25%   $3,603.44    (billed so far: $12,972.39)
        FINAL draw = the REMAINDER, not a fresh percentage (rule b):
          $14,413.75 - $12,972.39 = $1,441.36
        (A fresh 10% would give $1,441.38 → schedule total $14,413.77 —
        two cents OVER the contract. The remainder rule sums exactly.)
OUTPUT  Σ draws = $14,413.75 exactly. A CO signed mid-schedule bills on its
        OWN terms (§4) and never re-prices these draws (rule a; P4).
```

### H — Negative change order → credit line _(real case, [S97])_

```
INPUT   Mid-job; the client has paid a deposit. She removes tile repair
        from scope. Signed CO: -$5,000.
FLOW    NO credit document, NO QB CreditMemo (§4a as amended). The -$5,000
        sits AVAILABLE and the user CHOOSES which invoice carries it
        (bill-now-vs-next shape) — here, the next one. It lands as a
        CREDIT LINE — the client sees the invoice amount in full, then
        the credit.
OUTPUT  The next invoice nets $5,000 lower; QB sees the smaller invoice,
        so income is never overstated. Contract value falls via 7B
        derivation. Had NO balance remained, the $5,000 would be a 7E
        REFUND (Josh sends a check) — never a credit line.
```

### Traces still owed — **[S97: NONE — table CLOSED]**

| Was missing                                        | Resolution                                                                                         |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **Percentage-of-source draw**                      | Supplied — trace G (R2)                                                                            |
| **Negative-CO credit document**                    | Mechanism REMOVED (§4a reversed); the credit-line case is trace H (R4)                             |
| **A derived invoice with an override**             | Mechanism RETIRED — discounts replace the disposition pair (§8, R1)                                |
| **A cost-plus or T&M invoice carrying crew labor** | Layout ruled directly (§11, R3); a labor-bearing trace remains welcome but no longer blocks        |

---

## §16 — Acceptance criteria (workflow — PROVEN)

1. **[S97, extends the original]** An estimate can be converted to an invoice by percentage **and**
   by edited fixed amount — where each percentage draw prices off the **ORIGINAL contract value**
   (a signed CO never re-prices the draws) and the **final draw bills the remainder**, never a
   fresh percentage (§2, trace G).
2. A single invoice can pull from the estimate **and** ≥2 COs at once.
3. A standalone invoice built in estimate/CO format posts its amounts **and categories** into
   project finances.
4. A deposit invoice is a fixed-amount invoice; it credits to budget (or is credited once a budget
   is set) and can be refunded in full or part.
5. Retainage defaults from the project setting, is editable per invoice, and is **never** applied to
   a deposit or T&M invoice. The invoice's receivable is the amount **net of retainage**; the
   withheld amount shows separately and does not age.
6. A signed CO prompts bill-now vs. next-invoice.
7. A material-selection overage auto-generates a **draft** difference invoice and prompts bill-now vs.
   next-invoice.
8. **[S97, replaces the quarter-hour criterion]** A **T&M** invoice bills labor at the labor rate
   **in force on the worked date**, where billable hours are **approved hours summed per person per
   day and then rounded UP to the half hour**, and non-labor at cost × the non-labor markup in force
   on the incurred date — with **no burden, no markup on labor, and no retainage**.
9. **[S97, replaces the single-rate criterion]** A **cost-plus** invoice bills each user-selected
   approved cost at **its own category's** rate in force on that cost's incurred date; crew labor
   bills at the flat per-man-hour rate, not as marked-up cost; and an instrument missing any rate it
   needs **refuses to price** rather than billing at 0%.
10. **[S97]** The four cost-plus rates can be set to **different** values for labor, material, sub and
    other, and a job billed at one flat percentage across all categories is a valid special case.
11. **[S97, REPLACES the write-off/hold-back criterion]** _Superseded: "A downward override
    **prompts** for write-off vs. hold-back; a held-back shortfall reappears in the next invoice's
    cost picker; a written-off one never does."_ Now: a reduction is an explicit **discount line**
    (negative amount, client-visible); a discounted amount is **never rebilled**; an unselected cost
    reappears in the next invoice's picker until billed (§8).
12. **[S96, amended S97]** Both the **derived** and the **billed** amount survive — derived lines +
    discount lines = billed total — and 7G/7H consume **billed**.
13. **[S97]** An **unpaid** invoice can be voided by **Owner/Admin** with a reason and reissued as a
    linked successor — or voided terminally with no successor.
14. **[S97]** An invoice carrying a partial payment **not yet synced to QuickBooks** can be voided by
    **Owner only**, with a warning. An invoice whose payment **has** reached QuickBooks **cannot** be
    voided at all.
15. **[S96]** Superseding a rate **flags** the sent invoices priced under it; it never reprices them
    silently and never auto-generates a catch-up invoice.
16. **[S96]** An under-allowance is offered **only** on the final invoice and **only** on user action.
17. Owner/Admin send without approval; a PM-created invoice cannot send until Owner/Admin approve.
18. **[S97]** An invoice can be delivered by email or printed (skip email); both save it to the
    project. The emailed invoice carries a **pay link + PDF where QuickBooks Payments is
    connected**, and **PDF only, with no payment button, where it is not** (7G §7G.2 #3).
19. **[S97, extended]** All three presentation levels are selectable per invoice, and **full detail
    renders as layout A** — actual cost per line, then a separate subtotal and markup line covering
    **non-labor only**, with **unburdened** cost. Crew labor renders as its **own hours @ rate line
    OUTSIDE** the subtotal/markup block (cost-plus/T&M) and as a **single total, no markup shown**,
    on fixed-price (§11).
20. **[amended S97]** No income exists in the system that is not tied to an invoice, and no client
    credit exists that is not tied to an **invoice credit line** (negative-CO §4a, allowance §4b,
    deposit draw-down §3a) **or a 7E refund** — _superseded [S96] clause: "not tied to a credit
    document."_
21. **[S97, NEW]** A deposit on a cost-plus or T&M instrument is a fixed-amount invoice held as a
    **job credit balance**: each derived invoice shows the work in full, then the deposit applied as
    a credit line up to the invoice total; a smaller invoice settles to zero with the leftover
    carried forward; once exhausted, invoices are payable in cash; the remaining balance stays
    visible (§3a).

---

## §A — Architecture amendments this spec records (READ)

> Recorded so they are not silent surprises at build. Flagged for CC and for a future edit to
> `module7-architecture.md` and `money-representation.md`.

**A.1 — Contract type lives on the INSTRUMENT, not the job.** §7.2's 7D row and §7.10 both describe a
per-**job** billing method (`billing_method per job`). `money-representation.md` **P4** supersedes
this. Amend §7.2 and §7.10.

**A.2 — §7.10's draw triggers are superseded.** §7.10 lists _"draw trigger per job: date / % complete
/ stage complete."_ §1's v1 boundary — user-triggered invoices, no draw-schedule object — is newer and
locked. Amend §7.10, or mark those triggers deferred with the AIA/pay-application work.

**A.3 — §7.10's T&M knobs are superseded.** §7.10 says the two T&M settings _"already exist in company
settings"_ and 7D merely reads them. S93 replaced that with per-instrument effective-dated rates. The
company-settings values are no longer the billing basis.

**A.4 — §7.2's "trace TODO" note is stale.** §7.2 still reads _"7D and 7E are partially narrated and
marked TODO (§7.10) — their full traces are the next interview target."_ §15 now supplies 7D's trace,
founder-corrected. **Amend §7.2 once 7E's lands too.**

**A.5 — Negative-CO credits — [S97, previously unrecorded; REVERSED by the S97 second batch].**
Architecture §7.2 assigns _"negative-CO credits"_ to **7E** and §7.11 traces the behaviour there.
_Superseded ruling: "§4a rules that **7D issues the credit document** and **7E applies it**."_
Josh's later S97 ruling (§4a as amended, R4) **removes the credit document entirely**: a signed
negative CO lands as a **credit line on a user-chosen 7D invoice** (placement prompt per §4a);
**7E keeps only the no-balance-remaining REFUND case**; **no QB CreditMemo** is exported for a
negative CO. Amend §7.2/§7.11 to that split instead.

**A.6 — Cost-plus carries FOUR rates — [S97]. REQUIRES A MIGRATION.** `money-representation.md` §4.2
defines cost-plus as a single markup applied to every row including labor, and
`20260730010000_money_representation.sql` constrains `rate_type` to exactly three values. §6.1
supersedes this: cost-plus carries a flat per-man-hour labor rate plus **three independent** non-labor
markups. `money-representation.md:269–278`'s account of why T&M is separate from cost-plus is also
wrong — see §7.1. **money-rep is FINAL/LOCKED; record this as a formal amendment in its existing
"Amendment A-1" style, not a silent edit.** This reaches the **estimate side as well as invoicing** —
cost-plus estimates price through the same rate — so both must change together (M4 Lesson 3).

---

## §S — Schema layer — TODO for Claude Code (BLOCKS "complete")

This spec is **not** build-ready until CC reads the following live schemas and fills in table
names, columns, FKs, RLS, triggers, service files, and route paths. Do **not** assert any of these
from context — read them.

**CC must read and reconcile:**

1. **Signed-artifact / change-order tables** — 7D converts signed COs into invoices and, per §4a
   as amended **[S97, R4]**, lands a signed negative CO as a **credit line on the next invoice**
   (the credit document is REMOVED — do not build one). _(Merged and live: `change_orders` —
   migration `20260704215000`, status `draft|sent|signed|voided`, `net_delta` — plus the
   signed-artifact columns (`20260710120000`); 7B reads them via `contract-value.ts`.)_
2. **Estimate line model** (Module 4) — invoice detail format mirrors the source.
3. **Module 5 project / budget / `contract_value` tables** — deposit-to-budget crediting,
   standalone-amount posting, and the project-level retainage setting.
4. **`instrument_rates` + the shared rate logic** — `money-representation.md` §4.2/§6 and
   `instrument-rates-shared.ts`. **7D consumes the rate-in-force selector; it must not restate it.**
   **Confirm `20260730010000_money_representation.sql` is actually applied** — money-rep's own header
   still says _"Not built. No migration exists"_ while the migration file is in the tree.
   **[S97] The `rate_type` CHECK must widen for §6.1's four cost-plus rates** (currently exactly
   `cost_plus_percent`, `tm_labor_hourly`, `tm_nonlabor_percent`). **CC decides** whether cost-plus
   reuses the existing T&M labor-hourly rate type or gets its own — both contract types now share a
   flat per-man-hour labor mechanic.
5. **[S97] Every consumer of the single cost-plus rate must change with it:**
   `packages/shared/utils/estimate-totals.ts:238` (applies one percent to every row regardless of
   category), `:214` (`NoRateInForceError` checks one rate),
   `apps/web/app/dashboard/estimates/[id]/contract-section.tsx:42`,
   `apps/web/app/dashboard/projects/[id]/changes/[coId]/co-rate-section.tsx:35`,
   `apps/web/app/dashboard/projects/[id]/budget/rate-section.tsx:40`,
   `apps/web/lib/services/instrument-rates-shared.ts:19`.
6. **The 7A/7C cost ledger** — approved `expenses` + `expense_allocations`, `expense_date`, cost
   category, approval state, and **the instrument tag per cost row** (money-rep P6/P7) so §6 can
   attribute costs to the right instrument. _(7C is BUILT but per `context91` §10 has **never been
   click-tested**, and `20260729010000` is rebuild-test only — prod batch and merge owed.)_
7. **Module 6 time entries** — worked date, approved state, and **per-person-per-day grouping** for
   §7.2's rounding. **UNVERIFIED and unmerged; this is 7D's largest upstream risk.**
8. **Project finances model** — where standalone invoice amounts + categories post.
9. **File storage (Module 3)** — where the invoice PDF is stored (inherited pattern).
10. **Company settings** — invoice-format defaults. **[S97] `companies.default_labor_rate` question is
    ANSWERED: it exists (`baseline_schema.sql:1066`) and is LIVE**, with three consumers —
    `estimate-items-client.ts:82`, `company.ts:171,192`, and a working control in
    `estimating-settings-form.tsx`. It is **no longer** the T&M billing basis, but **retiring or
    repurposing it breaks Module 4 estimating settings.** Leave it alone.

**What must now be storable (concepts, not columns):**

- **Per instrument:** **[S97]** four cost-plus rates (one flat labor $/man-hour + three category
  markups) or two T&M rates; and the **tax base for markup** — tax-inclusive or pre-tax-with-
  passthrough (§6.3). The tax base is a policy flag, **not** a rate. **Fixed at signing — NOT
  effective-dated.** The rates **are** effective-dated.
- **Per invoice:** status incl. **voided**; **void reason**, voided-by, voided-at; an **optional
  supersedes link** to a successor; the chosen **presentation detail level** (§11); retainage withheld
  and the resulting receivable (§5).
- **Per derived line:** cost/hours basis · **category** · **the rate row's identity** · derived amount
  · billed amount. **[S97, R1]** The disposition field is **REMOVED** with §8's write-off/hold-back
  pair; a **discount line** is an ordinary invoice line with a negative amount.
- **Per cost row:** a billed/unbilled marker (§6.2). **[S97, R1]** The held-back-shortfall amount is
  **REMOVED** with the hold-back mechanism — an unbilled cost is simply an unselected one.
- **[S97, R6] Per job: the deposit CREDIT BALANCE** for cost-plus/T&M deposits (§3a), with its
  **remaining amount visible** as it draws down across invoices.
- **[S97] Credit lines on invoices** (negative amounts, client-visible): negative-CO credit (§4a),
  allowance under-credit (§4b), deposit draw-down (§3a), and R1 discount lines (§8).
  **[S97 later ruling]** A signed negative CO's credit additionally needs an **AVAILABLE state
  before placement** — it sits available until the user chooses its carrying invoice (§4a); its
  available/placed status must be storable and visible.
- **QB memo text** for void/reissue pairs (§10, 7G G4).

**Also confirm before building:** the material-selection-overage source (§4) — a selection _is_ a
change order (architecture §7.4); verify that class exists and read its shape.

---

## §O — Open / external (not interview-closable, not CC-closable)

- **Pre-Module 9 external-surface gate** governs client-facing surfaces. **[S96 narrowing]** The
  **pay surface is no longer blocked** — 7G Model A has the client pay on **QuickBooks' hosted page**,
  so FrameFocus renders only a redirect notice (7G §7G.6). The invoice **record**, the email/PDF path
  and the pay link can all be built now. The gate still governs any _other_ client-facing surface.**[S97]** And where QB Payments is absent, no client-facing surface is introduced at all —
  the payment button is simply not rendered, so there is nothing for the gate to govern.
- **Notification system** must be designed before §14's events can deliver.
- **Tax-component recoverability** (§6.3) — may collapse the per-instrument tax-base setting to
  tax-inclusive only. CC verification, not a Josh decision.
- **Module 6 hours** — §7 cannot be exercised until M6's time entries are readable and merged.

### Outstanding items owed by JOSH — **[S97: table EMPTY — all five closed]**

| #   | Was owed                                                                        | Closed by                                                  |
| --- | ------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 1   | A real draw billed as a **percentage of source** — or rule the method out of v1 | R2 — real milestone schedule, trace G (§2)                 |
| 2   | A real **negative CO** to trace the credit document                             | R4 — document REMOVED; credit-line case is trace H (§4a)   |
| 3   | Confirmation that **downward overrides** happen, with one real instance         | R1 — they don't; mechanic RETIRED for discount lines (§8)  |
| 4   | One invoice **carrying crew labor**, to pin layout A's labor treatment          | R3 — layout ruled directly (§11)                           |
| 5   | Client-facing **line descriptions** and **incurred dates** for trace B          | R5 — supplied (§15-B)                                      |

---

## §P — Provenance

- §§1–5, 12–14, 16 (1–7, 17–18): interviewed S89–S92, confirmed by Josh; unchanged in substance
  except where tagged.
- §§4a, 4b, 6, 7, 8, 9, 10, 11 and the `[S96]` acceptance criteria: ruled in the spec-reconciliation
  session, reconciling the spec against `money-representation.md` (FINAL S93) and architecture
  §7.2/§7.10/§7.11.
- **[S97] rulings:** cost-plus carries four rates (§6.1); T&M is the in-house-only type (§7.1); hours
  round up to the **half** hour, summed per person per day (§7.2); void actor narrows to Owner once a
  payment is applied and all payments auto-sync to QB (§9, §12); §11's three levels confirmed real and
  full detail pinned to layout A; §A.5 and §A.6 recorded.
- **§15 traces A, D, E:** founder-sourced from architecture §7.10 / §7.8.6.
  **§15 traces B, C, C-1: founder-sourced [S97]** — walked through against real jobs, replacing the
  illustrative values the prior revision carried. Trace F is a mechanism illustration.
- All money figures in §15 computed with the shipped `deriveCostPlusSell` / `deriveTmLaborSell` and
  `roundMoney` (`estimate-totals.ts:35,159,166`), applied per row.
- **[S97 second batch] rulings (Josh, closing §O's owed list):** discounts replace the
  write-off/hold-back override mechanic — build scope removed (§8, R1); percentage-of-source proven
  real, priced off the ORIGINAL contract value with a remainder final draw (§2 / trace G, R2); labor
  presentation ruled — own hours @ rate line outside the subtotal/markup block on cost-plus/T&M,
  single total on fixed-price (§11, R3); negative-CO credit document REMOVED — credit line on the
  next invoice, no QB CreditMemo, §A.5 reversed (§4a / trace H, R4); trace B line text + incurred
  dates supplied — line text is the line-item title, no separate description model (§15-B, R5);
  deposits on cost-plus/T&M held as a job credit balance drawing down across derived invoices
  (§3a, R6). The §1 milestone-schedule note is recorded as deferred, not built.
- The `[inferred]` provenance tag class was **removed [S97]** — it was declared in the legend and
  promised in provenance but never applied to any claim in this file. It remains live and meaningful
  in `7f1-spec.md` and `7g1-spec.md`, which carry real `[inferred]` body tags awaiting confirmation.
- FrameFocus schema: **not** verified against the live repo beyond the specific file:line citations
  above — the schema layer is deferred to CC by design (§S).
