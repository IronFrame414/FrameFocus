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
> ~~**Schema layer deliberately absent** — see §S. No table names, columns, or file paths are
> asserted as fact. CC writes the schema layer after reading the live upstream schemas named in
> §S.~~ **[S97] Superseded: §S is FILLED.** CC read all ten upstream areas against the live repo and
> rebuild-test; §S now carries real table/column/FK/RLS/trigger/service/route names, seven recorded
> conflicts, and the NEW-vs-EXISTS split. Outside §S the body text still asserts no schema.
>
> **[S97] — what changed.** Every calculated variant now carries a **founder-corrected** trace
> (§15 B and C were illustrative; both are now real). Four rulings changed against practice:
> **cost-plus carries four rates, not one** (§6); **T&M is the in-house-only contract type** (§7);
> **hours round up to the HALF hour, not the quarter** (§7); and the **void actor** is narrowed once
> a payment is applied (§9, §12). §11's three presentation levels are confirmed real, and full
> detail is pinned to a layout (§11, §15).
>
> **[S97 — third batch: BILLABLE HOURS.]** **D1 — the Owner approves their own hours** (no
> auto-approval, no special case in billing math). **D2 — billable hours are USER-SELECTED**, the
> same picker as §6.2's costs; the task on an hour is context, not a filter, and a task→line-item
> rule floated earlier this session is **WITHDRAWN** (no `tasks` schema). Both are in §7.2; they
> close §S's K3 and K4. **§S itself is no longer a TODO** — it was filled from the live repo.
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
> **[S97 — third batch: BILLABLE HOURS ruled, D1 + D2.]** **D1** — the **Owner approves their own
> hours**; the gate is unchanged for everyone and billing math has no Owner case (§7.2). **D2** —
> **billable hours are USER-SELECTED**, the same picker shape as §6.2's costs: approved unbilled
> hours are listed with their task and date, the user ticks what to bill, unselected hours reappear
> next time. An hour with **no task is still billable**; the task→line-item rule floated earlier in
> S97 is **WITHDRAWN** and no `tasks` schema is to be built (§S S.6a). Half-hour per-person-per-day
> rounding now applies to the **selected** hours. Conflicts **K3 and K4 are CLOSED** (§S).
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
  - **[S97, 2026-08-03 — RULED by Josh; BUILT] Standalone lines are NEW INCOME**, shown on the
    project financial page as their **own independent section**, presented the way CO lines are.
    **Voiding the invoice removes them.**
  - **DERIVED, NEVER STORED.** No `project_budget_items` row is created. That table is
    **insert-only** — SELECT and INSERT (Owner/Admin) are its only policies, `20260818000000`
    documents the absence of UPDATE/DELETE as deliberate and guards it, and
    `expense_allocations.budget_item_id` is `ON DELETE NO ACTION` so a charged line cannot be
    removed by anyone. A stored copy therefore **could never be removed on void** — precisely the
    removal this ruling requires — and would turn the routine §9 correction into permanent
    overstatement of the job's income. The section reads
    `invoice_lines` where `line_type = 'fixed'` **and both source ids are NULL**, on invoices that
    are neither voided nor deleted. Same doctrine as contract value, the §3a deposit balance,
    §4a availability, §10's supersede flag and §6.2a's remaining-unbilled.
  - **A line carrying an INSTRUMENT is not income** — it is a lump-sum billing *of* that
    instrument (a fixed-price CO, or a draw, which carries the estimate). The manual-line form
    asks which, with an explicit **Standalone** option; only standalone posts. This also keeps
    §5's per-line retainage split classifying by the line's own contract rather than by fallback.
  - **Owner/Admin only** — a sell figure *about the job*, so it sits with contract value and
    budgeted amount under the Financial Visibility Floor. §12a's carve-out (a PM may see amounts
    **on an invoice they can reach**) does not extend to a job-level roll-up.
  - Implementation `apps/web/lib/services/project-income.ts`; proof
    `apps/web/test/s97ct-standalone-income.live.ts`.
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
>
> **[S97, 2026-08-03] DOES A DEPOSIT REDUCE THE BASE A PERCENTAGE DRAW PRICES OFF? NO — and the
> answer is in Josh's own schedule.** That schedule *is* `deposit 10% · permit 30% · rough-in 25% ·
> cabinets 25% · substantial completion 10%` — **the deposit IS one of the draws, and the five sum
> to 100%.** If the deposit also reduced the base, every later draw would price off $12,972.38
> instead of $14,413.75 and the schedule would undershoot the contract by roughly $1,441. So the
> base stays the **ORIGINAL contract value, immovable** — exactly what rule (a) already says, now
> for a second reason. A deposit reduces **remaining-to-bill** (§3) and, through it, what the
> **FINAL** draw bills under rule (b); it never re-prices a percentage. `computeDrawAmount` needed
> no change.

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
- **[S97, 2026-08-03 — RULED by Josh; BUILT] A DEPOSIT REDUCES REMAINING TO BILL.** On a
  **fixed-price** job a deposit is money against the contract: a $5,000 deposit on a $50,000
  contract leaves **$45,000** to invoice. **Void or refund it and the figure returns to $50,000**
  with no cleanup step.
  - **Derived at the 7B contract-value layer** (`getContractBilling`, `contract-value.ts`), and
    **nothing is stored** — no write to `project_budget_amounts.budgeted_amount`, none to
    `project_financials`, no flag. That is what makes void and refund self-correcting: nothing was
    copied, so nothing has to be undone. **7D still never writes contract value (§4);** this only
    READS and derives, exactly like the revised-contract derivation beside it.
  - Counts **ISSUED** (sent/paid) invoices only, and only lines carrying the **originating
    estimate** as their instrument. Refunds net out when `source = 'deposit'` and `status =
    'issued'`, scoped through the payment's application to a still-issued invoice so a deposit that
    was **both voided and refunded** is subtracted once, not twice. Net billing is clamped at zero,
    so remaining can never exceed the contract; over-billing stays representable as a negative.
  - Measured against the **ORIGINAL**, not the revised, contract: a signed CO bills separately on
    its own terms (§4, P4) and carries its own remaining — the same reasoning that keeps a
    percentage draw priced off the original (trace G rule (a)).
  - **PERCENTAGE DRAWS ARE UNAFFECTED, deliberately** — see §2 below.
  - Proof: `apps/web/test/s97ct-remaining-to-bill.live.ts`.
- **[S97, superseded by the ruling above] Earlier reading — kept for the reasoning, which still
  holds for why nothing is STORED:**
  - The **visibility** half it does resolve: a deposit invoice's line, if standalone, appears in
    the income section and disappears on void or reissue, with no extra code.
  - The **crediting** half it does not. *"Credited against the budgeted amount"* is a claim about
    a **stored, Owner/Admin figure** — `project_budget_amounts.budgeted_amount` — and writing it
    from an invoice reintroduces the exact permanence problem the income section exists to avoid:
    a deposit can be **voided and refunded**, and the credit would have to be undone.
  - §3a already **superseded** this mechanism for cost-plus and T&M instruments, so what remains is
    only the **fixed-price** case, where the figure that should move is contract-side — and
    **7D never writes contract value** (§4); 7B derives it.
  - **Recommendation for Josh:** resolve it the same way as everything else in this module —
    **derive** the deposit's effect on remaining-to-bill at the contract-value layer (7B), rather
    than writing a budget row. Not built pending that ruling.
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
- **[S97 — D2] The same picker shape governs HOURS.** §7.2 now selects billable hours by the identical
  mechanic (present approved-and-unbilled, user ticks, unselected reappear with their age). Costs and
  hours are two populations in one control, not two different rules — build them as one pattern.

#### §6.2a — PARTIAL BILLING — **[S97, 2026-08-03 — RULED by Josh. Supersedes all-or-nothing.]**

_Superseded model: a ticked cost was billed **WHOLLY** or not at all. The picker was in-or-out —
"a billed cost never reappears" — and the enforcement was a UNIQUE index,
`invoice_cost_claims_one_per_allocation`, i.e. **one live claim per allocation**._

**Now: a cost has a REMAINING amount, and an invoice claims a PORTION of it.**

- **A PERCENTAGE control lives on the INSTRUMENT TAB** (§2 / acceptance #2). It is per instrument
  because it differs per instrument — Josh's case is _"draw #2 of the contract plus 50% of
  CO-106-02"_ on one invoice.
- Within a tab, the percentage applies across that instrument's unbilled approved costs; the user
  ticks which lines go on this invoice; **each ticked line bills that percentage of ITS cost.**
- **The remainder STAYS AVAILABLE** and reappears in the picker with its age. The amended rule:
  a **FULLY** billed cost never reappears; a **PARTIALLY** billed one reappears with its remainder.
- **Per-line DOLLAR amounts stay editable and are equivalent to a custom percentage on that line.**
  A lower amount means **BILLING LESS OF THAT COST — a CLAIM REDUCTION, NOT A DISCOUNT.** The cost
  basis, the derived amount and the claim scale together, and the freed portion returns to the
  picker. **§8's discount line remains the separate and only mechanism for money GIVEN UP** — a
  negative client-visible line, and nothing about it returns to any picker.
- **REMAINING IS DERIVED, NEVER STORED:** `allocation.amount − COALESCE(SUM(live claims), 0)`. No
  column on `expense_allocations`, no `is_billed` flag. This is also what makes **void-restore free**
  — claims already CASCADE from the invoice, so voiding hands the whole remainder back with no
  compensating write.
- **THE LAST CLAIM BILLS THE EXACT REMAINDER**, never a recomputed percentage — the same rule already
  ruled for draws (§2, trace G rule (b)). Partials therefore sum to the whole with no cent stranded:
  33% + 33% + the rest of $1,000 = 330.00 + 221.10 + 448.90.
- **MARKUP FOLLOWS THE BILLED PORTION** at that cost's own rate in force on its **own incurred
  date**. The date does not move, so two partials taken months apart price identically and sum to the
  whole-cost figure to the cent.
- **HOURS ARE NOT PARTIAL.** `invoice_hour_claims_one_per_segment` stays. §7.2 rounds each person-day
  UP to the half hour, so billing part of a day now and the rest later rounds **both** parts up and
  over-bills. Hours remain all-or-nothing per person-day.

**Enforcement.** The unique index is replaced by the invariant `SUM(claimed_amount) <=
expense_allocations.amount`, enforced by a `BEFORE INSERT OR UPDATE` trigger that takes
`SELECT … FOR UPDATE` on the allocation row **before** reading the sibling sum — without the lock two
concurrent claims each read the stale sum and both pass. Both columns are `numeric(12,2)`, so the
comparison is exact. Migration `20260820000000_partial_cost_claims.sql`; proof
`apps/web/test/s97ct-partial-billing.live.ts`.

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

### §7.2 — Billable hours — **[S96; increment corrected [S97]; population and selection RULED [S97 — D1/D2]]**

**[S97 — D2] The user PICKS the hours, exactly as §6.2 picks the costs.** The invoice presents the
instrument's **approved, unbilled** work hours — each showing its **task (where it has one)** and its
**date** — and the user **ticks which to bill**. Selection is the mechanism; there is no derivation
from tasks, line items, or segment type.

> _Superseded [S96] clause:_ **"Population:** every **approved** hour logged against the job.
> Approval is the existing Module 6 timesheet gate; unapproved hours never reach a client bill."
> Approval still gates **eligibility** — unapproved hours never appear in the picker and never reach
> a client bill — but approval alone no longer puts an hour on an invoice. **The user's tick does.**

> **[S97] WITHDRAWN — the task→line-item chain.** An earlier S97 statement held that _"hours are tied
> to tasks, tasks are tied to line items, and the hours on those tasks are the billable hours."_
> **Josh withdrew this and ruled selection instead.** It is recorded here only so the withdrawal is
> not re-litigated: **no `tasks`→line-item link is to be specced or built**, and CC verified the link
> does not exist today (§S S.6a). Had the rule stood it would have required schema on `tasks` plus a
> backfill of every existing task.

**The rules that follow from selection:**

- **Task is CONTEXT, not a filter.** The task on an hour is shown to inform the user's choice. **An
  hour with no task still appears in the picker and is still fully billable.** This matters
  immediately: on rebuild-test **11 of 12** live work segments carry no task (§S S.6a).
- **[S97 — D2, closing K4] Selection replaces classification.** No segment type is billable or
  unbillable by rule. `material_run` and `warranty` segments carry a `project_id` but — by the live
  `time_segments_task_gate_check` — can **never** carry a task, so they appear in the picker with a
  blank task column. **They DO appear**, because the user decides: a material run made for the job is
  often legitimately billable on a T&M job, and hiding it would silently forfeit revenue with no
  visible trace. `travel`, `shop` and `break` segments carry no `project_id` at all and therefore
  never enter an instrument's picker.
- **Unselected hours stay unbilled and reappear**, with their age, on the next invoice's picker —
  identical to §6.2's unselected costs. **Not selecting an hour IS the hold-back.** Nothing silently
  disappears.
- **Instrument attribution is project→instrument, as today.** An hour belongs to the instrument its
  **project** resolves to. **Per-line (line-item-grain) attribution is explicitly out of scope for
  v1** — it was the withdrawn chain's only benefit and it is not worth schema on `tasks`.
- **[S97 — D1] The approval gate is unchanged for everyone, and the OWNER APPROVES THEIR OWN TIME.**
  There is **no auto-approval and no special case anywhere in the billing math** — the Owner's hours
  enter the picker through the same "approved" door as everyone else's. This **closes K3: the
  Owner's field hours DO reach an invoice.** See §S S.6b for the two live app-layer gaps that must
  close for this to function (the Owner's sessions are currently written `status = NULL`, and the
  bulk week-approval RPC refuses self-approval) — **both are Module 6 changes, not 7D ones.**

**Rounding — [S97], now applied to the SELECTED hours:**

- **Sum each person's SELECTED hours for the day, then round that daily total UP to the HALF hour.**
  One rounding per person per day — **not** per time entry, and **not** to the quarter hour.

> _Amended [S97 — D2]:_ the superseded text rounded _"each person's **approved** hours for the day."_
> The arithmetic is unchanged; only its input narrows from *approved* to *approved **and selected***.
> **Consequence to honor at build:** if a person's day is split across two invoices, each invoice
> rounds the part it bills — so two partial days can round up to slightly more than the whole day
> would have. Billing a person's day in one piece is the norm; the picker should keep a day together
> by default.

> **Worked example (founder-sourced, [S97]).** One person, one day, one job: 3h10m in the morning and
> 4h05m in the afternoon = **7h15m actual → 7.5 billable hours.** Rounding once per person per day is
> what makes this 7.5 rather than 8.0 (3h10m→3.5 plus 4h05m→4.5). At half-hour increments that
> difference is real money on every man-day.

> **[S97] Correction notice.** Every prior statement of this rule said _quarter hour_. The wrong
> increment appears in `7g1-spec.md:238` and `7h1-spec.md:89, :349` as well. **All must be corrected
> together** — 7D and 7H otherwise compute different labor totals from the same hours.

**The picker's grain — [S97], CC-verified.** Approval and task attribution live on **different
tables**: `time_clock_sessions.status` carries approval, `time_segments.task_id` carries the task and
`time_segments.project_id` the job. **The picker joins them via `time_segments.session_id`** — it
reads segments for the instrument's project, and takes each segment's approval state from its parent
session. An hour is eligible iff its **session** is approved and its **segment** is on the job.

> _Superseded [S96] bullet:_ **"No billable flag in v1** — the population is 'approved hours on this
> job.' Non-billable time must be kept off the job rather than flagged on it. If that proves
> insufficient, a billable flag on time entries is a Module 6 change, not a 7D one."
> **[S97 — D2]** Selection supersedes this: non-billable time is simply **not ticked**, and no
> Module 6 billable flag is needed. What IS needed is a **billed/unbilled marker on hours** so a
> billed hour stops reappearing in the picker — that is **7D's own schema**, not Module 6's (§S).

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

## §11 — Presentation detail — **[S96; CONFIRMED against practice [S97]; reconciliation FIXED S97 2026-08-03]**

> **[S97, 2026-08-03] TWO DEFECTS FIXED, both caused by the manual-line form never capturing a
> category.**
>
> 1. **The sections did not reconcile.** Section totals skipped every null-category line, so a
>    manual line vanished and a by-section invoice's sections did not sum to what the client was
>    charged — asserted at **$5,450 of a $7,310 invoice shown nowhere**. Now: **adjustments are
>    excluded** from sections (they render in their own block at every level, so counting them
>    there too was double-counting), and **a work line with no category falls to `other`** rather
>    than being dropped — `other` is already one of the four sections and is the honest home for a
>    fixed-price **draw**, which spans the contract and has no single category. The invariant is
>    now **Σ sections + Σ adjustments = total**, asserted in unit and live tests.
> 2. **"Subtotal (cost)" contained charges.** It was `Σ (costBasis ?? amount)` over every non-labor
>    row, so a manual line's **charge** was counted as a **cost** and the client read a cost figure
>    containing money nobody paid. **A cost basis is now what makes a row a cost row:** rows without
>    one are CHARGES and sit **outside** the subtotal/markup block, for the same reason labor does
>    (R3) — the block is an arithmetic claim and a row with no cost cannot honestly join it. They
>    render as "Other charges"; lump sum includes them.

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

### §12a — PM financial visibility on invoices — **AMENDMENT [S97, 2026-08-01 — RULED by Josh]**

**Resolves conflict C1** (raised in `docs/sessions/S97-7D-build.md` §3). The 7D build hit a direct
contradiction between this spec and the platform-wide Financial Visibility Floor, and shipped
following §12 while flagging it for a ruling. This amendment records the ruling.

**What this supersedes.** CLAUDE.md → "Financial Visibility Floor (authoritative — added
2026-07-20)" reads:

> **Only Owner and Admin may see contract/budget/sell/CO dollar figures. Project Manager, Foreman,
> and Crew see ACTUAL COST ONLY.**

and gates, among other figures, "budgeted and sell/price amounts". Read literally and without this
amendment, that floor would forbid a PM from seeing the amounts on the very invoice §12 authorizes
them to create.

**The ruling.** A **PM CAN see the invoice amounts on an invoice they are creating.** This is a
narrow, named carve-out from the floor, not a revision of it.

**Nothing wider.** This does **not** open any other financial surface to a PM. Specifically it does
NOT grant a PM:

- `projects.contract_value` as a reporting figure — including the "Original contract" tile on the
  project invoice list, which is a job-position figure, not an amount on an invoice being created.
  That tile is **Owner/Admin only.**
- `project_budget_items.budgeted_amount` / any sell column, committed amounts, variance, or
  projected margin (7A/7B surfaces).
- `change_orders.net_delta` or any dollar sum derived from it (7B surfaces).

The line the ruling draws: **an amount ON the invoice** (a derived cost or labor line, a draw, a
discount, a credit, the invoice's own totals and retainage) is visible to a PM who can reach that
invoice. **A contract/budget/margin figure ABOUT the job** is not. A draw's contract-value basis is
shown while composing that draw, because the draw amount *is* the invoice amount being created.

**Row scope is unchanged** and continues to ride `can_view_project()`: a PM sees invoices on
projects they are assigned to. Foreman and Crew have no access to client billing at all (§12,
enforced by the `invoices` RLS policies, the page guards, and the nav tab).

**Enforcement note.** 7D's own RLS is role-gated at the DB, so 7D is not the weak point in the
floor. The platform-wide DB-level floor (`FINANCIAL-RLS-FLOOR`, ui-01 §10) remains owed and
unaffected by this amendment.

**Open question, NOT ruled:** whether a PM should see invoices authored by *others* on an assigned
job, or only their own. The build ships the former (whole-project visibility), because a partial
invoice list would make the job-position figures incoherent. Flagged rather than assumed.

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
        Approved labor: 42 hours (all SELECTED in the picker — §7.2 as ruled [S97];
          the trace bills every approved hour because the user ticked every one).
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
        Both segments approved AND selected (D2) — the day is billed whole.
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
2. A single invoice can pull from the estimate **and** ≥2 COs at once. — **BUILT AND PROVEN
   [S97, 2026-08-03].** Was FALSE from the original build (missed, never flagged): the pin was
   always per LINE with a per-ROW XOR, but `DeriveServerInput` took a singular instrument, the
   derive cleared every derived line before writing, and the instrument switch was a page
   navigation that discarded the selection. Now: derive takes one selection PER INSTRUMENT, the
   switch is tabs over one held selection, and hours default to the ORIGINAL CONTRACT and are
   reassignable per person-day. Proof: `apps/web/test/s97ct-multi-instrument.live.ts` — one
   invoice, three instruments, three contract types. **Zero migration.**
3. A standalone invoice built in estimate/CO format posts its amounts **and categories** into
   project finances. — **BUILT AND PROVEN [S97, 2026-08-03].** Was FALSE from the original build:
   there was **no path of any kind** from an invoice to `project_budget_items`, and the manual-line
   form captured neither a category nor an instrument. §S S.7 had flagged it — _"A standalone
   invoice's amount/category has **no landing place**… green-field"_ — but that never reached the
   migration's omissions list, the build report or any acceptance status, so it was **identified
   and then lost in transit** rather than deferred. Now posts as a DERIVED income section (see §2);
   proof `apps/web/test/s97ct-standalone-income.live.ts`.
4. **[amended S97, 2026-08-03 — RULED by Josh]** A deposit invoice is a fixed-amount invoice; it
   **reduces what remains to bill on the contract** (or is held as a job credit balance on a
   derived instrument) and can be refunded in full or part. — **TRUE.** _Superseded phrasing:
   "it **credits to budget** (or is credited once a budget is set)"_ — which assumed the deposit
   moved a **stored budgeted figure**. It does not, and must not: a deposit can be voided and
   refunded, so a written credit would have to be un-written. Both halves are now built and
   derived, and the two paths are **separate by construction**:
   - **fixed-price** → §3's remaining-to-bill derivation (`getContractBilling`)
   - **cost-plus / T&M** → §3a's credit balance drawn down by `credit_deposit` lines
   They cannot double-count: the contract derivation sums only lines carrying the originating
   estimate, and a derived-instrument deposit is billed on a CO. Proofs:
   `s97ct-remaining-to-bill.live.ts` (both directions) and `s97ct-standalone-income.live.ts`.
5. **[amended S97, 2026-08-03 — retainage is PER LINE]** Retainage defaults from the project
   setting, is editable per invoice, and is **never** applied to a deposit or to **T&M money**.
   _Superseded phrasing: "never applied to a deposit or T&M **invoice**"_ — which was expressible
   as one invoice-level boolean only while an invoice carried one instrument. With #2 real, a
   fixed-price draw and a T&M change order share invoices, so the retainage BASE is now the sum of
   positive billed amounts on **retainage-eligible lines only**, decided per line from that line's
   instrument. The deposit half stays invoice-level. Retainage defaults from the project setting,
   is editable per invoice, and is The invoice's receivable is the amount **net of retainage**; the
   withheld amount shows separately and does not age.
6. A signed CO prompts bill-now vs. next-invoice.
7. A material-selection overage auto-generates a **draft** difference invoice and prompts bill-now vs.
   next-invoice.
8. **[S97, replaces the quarter-hour criterion; amended again S97 — D2]** A **T&M** invoice bills
   labor at the labor rate **in force on the worked date**, where billable hours are **approved,
   USER-SELECTED hours summed per person per day and then rounded UP to the half hour** — _superseded
   clause: "approved hours summed per person per day"_, which implied every approved hour billed
   automatically — and non-labor at cost × the non-labor markup in force on the incurred date — with
   **no burden, no markup on labor, and no retainage**.
   - **8a. [S97, NEW — D2]** The hours picker presents **every approved, unbilled** hour for the
     instrument with its **task (blank where none)** and **date**; an hour with **no task is
     billable**; `material_run`/`warranty` hours appear and `travel`/`shop`/`break` never do; an
     **unselected hour stays unbilled and reappears** on the next invoice's picker with its age; and
     a **billed hour never reappears** (§7.2, §6.2). **[S97, 2026-08-03]** This stays ALL-OR-NOTHING
     when partial billing shipped for COSTS (§6.2a): §7.2 rounds each person-day UP to the half hour,
     so billing part of a day now and the rest later rounds both parts up and over-bills. There is no
     partial hour claim, by ruling.
   - **8b. [S97, NEW — D1]** An **Owner's** approved hours bill exactly like anyone else's — the
     billing math contains **no Owner special case and no auto-approval** (§7.2).
9. **[S97, replaces the single-rate criterion]** A **cost-plus** invoice bills each user-selected
   approved cost at **its own category's** rate in force on that cost's incurred date; crew labor
   bills at the flat per-man-hour rate, not as marked-up cost; and an instrument missing any rate it
   needs **refuses to price** rather than billing at 0%.
10. **[S97]** The four cost-plus rates can be set to **different** values for labor, material, sub and
    other, and a job billed at one flat percentage across all categories is a valid special case.
11. **[S97, REPLACES the write-off/hold-back criterion; AMENDED again S97 2026-08-03 for partial
    billing]** _Superseded [S96]: "A downward override **prompts** for write-off vs. hold-back; a
    held-back shortfall reappears in the next invoice's cost picker; a written-off one never does."_
    _Superseded [S97, first form]: "a reduction is an explicit **discount line** … an unselected cost
    reappears in the next invoice's picker until billed"_ — which assumed a cost was billed WHOLLY or
    not at all. Now, per §6.2a: **money GIVEN UP is a discount line** (negative, client-visible,
    never rebilled), while **a lower dollar amount on a derived cost line is a CLAIM REDUCTION** —
    that cost is simply billed less, and the unbilled remainder **returns to the picker**. An
    unselected cost still reappears until billed; a **partially** billed one reappears with its
    **remainder**; a **fully** billed one never does.
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
19. **[S97, extended; grouped by instrument S97 2026-08-03]** All three presentation levels are
    selectable per invoice. **Full detail groups BY INSTRUMENT**, each group carrying its own
    subtotal and markup line — two instruments with different markup rates cannot honestly share
    one markup line. A single-instrument invoice renders exactly as before, with no group heading.
    **By section stays CATEGORY-only** across the invoice (a section total exposes no cost and no
    markup, so it cannot misstate a rate) and **lump sum is unaffected**. Within each group, full
    detail renders as layout A — actual cost per line, then a separate subtotal and markup line covering
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

## §S — Schema layer — **READ FROM THE LIVE REPO [S97]** (was: TODO; now filled)

Read 2026-08-01 [S97] on `feature/113c-award-commitment-spec` (schema at `0f9d91c`; the A-9
app-code pass landed as `c332382` while this section was being written), verified against
**rebuild-test** (`nmyphyhmfttxkdoposvf` — `supabase migration list` shows every migration below
applied there through `20260801000000`; **production has the whole batch from `20260728000000`
onward still pending**). Facts from the A-9/S97 app-code pass (`c332382`) are marked **[A9]**.

### S.1 — Change orders + signed artifacts (item 1)

`change_orders` (`20260704215000`, applied): standard per-tenant columns + soft delete;
`project_id NOT NULL → projects`; `co_number` (CO-####-##, `projects.change_order_sequence`);
`title`, `description`, `reason_category` (**free text, no CHECK** — see conflict K5);
`co_type CHECK fixed_price|time_and_materials|cost_plus` (per-CO, independent of project type);
`author_member_id → company_members`; `status CHECK draft|sent|signed|voided`; `sent_at`,
`signed_at`; pricing context copied at creation (`pricing_mode CHECK markup|margin`, `tax_rate`,
`subcontractor|material|labor_markup_percent`); **`net_delta numeric NOT NULL` — SIGNED**, negative
for net-credit COs (this is §4a's credit source — no other negative-CO artifact exists);
`schedule_impact_days`; `requires_client_signature DEFAULT true`. Triggers
`change_orders_updated_at` / `change_orders_set_updated_by`. RLS: `change_orders_select_visible` /
`insert_authorized` / `update_authorized` (no DELETE policy — soft delete via UPDATE).
Children mirror the estimate line model (D-1): `change_order_line_items` (`total_price`,
`total_price_override`) → `change_order_line_rows` (same `row_type` CHECK + type-column CHECK and
`unit_of_measure` CHECK — incl. `allowance` — as estimate rows). `co_signing_sessions`
(`status CHECK pending|completed|declined|expired|invalidated`, `signature_type draw|type`).

Signed-artifact columns (`20260710120000`): on `change_orders` —
`contractor_signature_mode|ref|name`, `contractor_signed_at`, `contractor_signed_by`
(→ company_members), `reminder_schedule jsonb`, `reminder_count`, `last_reminder_sent_at`; on
`companies` — `contractor_signature_path`; on `files` — `change_order_id` and
`co_signing_session_id` (both `ON DELETE SET NULL`) — the signed CO PDF is a `files` row.

Services/routes: `change-orders.ts` (server reads), `change-orders-client.ts`
(`recalculateChangeOrderTotals` — **[A9]** prices per A-9/S97), `co-signing-service.ts`,
`co-pdf-service.ts`; `/api/change-orders/[id]/send|void`, `/api/sign-co/[token]/complete|decline`,
`/api/cron/co-reminders`; UI `/dashboard/projects/[id]/changes[/coId]`.
7B: `contract-value.ts` derives revised = `projects.contract_value` + Σ `net_delta` over
`CONTRACT_CONTRIBUTING_CO_FILTER = { status:'signed', is_deleted:false }` — 7D must reuse that
exported filter, never restate it. The §4a **available-until-placed credit state is NEW 7D
schema** — nothing stores it today.

### S.2 — Estimate line model (item 2)

Baseline `20260101000000` + `20260730010000`: `estimates` (`status CHECK
draft|review|sent|viewed|accepted|declined|expired|revised`; `proposal_pricing_level CHECK
lump_sum|category_with_price|category_no_price|detail_with_price_qty|detail_no_price` — §11's
detail levels live HERE, per estimate, defaulted by `companies.default_proposal_pricing_level`;
`contract_type CHECK fixed_price|cost_plus|time_and_materials` + `projected_value` added by
money-rep; estimate-level discounts + `tax_rate`). Hierarchy: `estimate_categories` →
`estimate_subcategories` → `estimate_line_items` (`total_price`, `total_price_override`,
`override_cost` — money-rep §4.1 cost basis for flat-priced lines, set via
`set_line_override_cost` RPC — `discount_type|amount`, `notes`, `sort_order`) →
`estimate_line_rows` (`row_type CHECK labor|material|subcontractor|other`; type-column CHECK:
labor = `rate`×`quantity`+`labor_unit hours|days`, `apply_tax` pinned false; material =
`unit_cost`×`quantity`+`unit_of_measure` incl. **`allowance`** (allowance amount = `unit_cost`,
quantity ignored)+`catalog_item_id`; sub = `amount`+`subcontractor_id`; other = `amount`;
shared `markup_percent`, `apply_tax`, `total`). Services: `estimates(-client).ts`,
`estimate-items-client.ts` (`recalculateEstimateTotals`), `proposal-service.ts`,
`/api/proposals/*`; shared math `packages/shared/utils/estimate-totals.ts`.

### S.3 — Project / budget / contract value (item 3)

`projects` (`20260704211000`): `project_type CHECK fixed_price|time_and_materials|cost_plus`;
`status CHECK active|on_hold|complete|archived|cancelled`; `contract_value numeric` (original,
NEVER mutated — 7B); **`retainage_percent numeric` EXISTS and is currently consumed by NOTHING**
(all `retainage_percent` reads in app code are `subcontractor_contracts.retainage_percent`,
7C-side) — §5 gets a live, empty column to consume; `tax_rate`; `source_estimate_id`;
carry-over content columns; `change_order_sequence`. `project_budget_items` (`20260704212000` +
money-rep): `source_line_row_id`/`source_line_item_id` (→ original-estimate rows),
**`source_change_order_id`** (→ CO instrument, P6) and **`is_miscellaneous`** (one per project,
partial unique idx; NO instrument identity), `row_type`, `budgeted_amount`, `committed_amount`,
`actual_amount` (maintained by `recompute_budget_item_actual` + the
`expense_allocations_recompute_actual` / `expenses_recompute_on_change` /
`expense_payments_recompute_budget` triggers). RPCs: `convert_estimate_to_project`,
`apply_change_order_budget`. Service `budget.ts`; page `/dashboard/projects/[id]/budget`.
**No deposit schema exists anywhere** — §3/§3a (deposit row, credit balance, draw-down lines) and
trace G's draw schedule are green-field 7D schema. No client-side retainage-withheld storage
exists either (§5's per-invoice withheld/receivable is NEW).

### S.4 — instrument_rates + shared selector (item 4) — **A-9 SHIPPED**

`instrument_rates` (`20260730010000`; guard amended `20260731010000`, supersede exemption
`20260731020000`, **A-9 `20260801000000` — committed and APPLIED to rebuild-test**): columns
`id, company_id, created_at, created_by, estimate_id, change_order_id, rate_type,
rate numeric(8,2) ≥ 0, effective_from date, superseded_at|by|reason` — deliberately **no**
`updated_at/updated_by/is_deleted` (append-only with a one-way supersede stamp;
`instrument_rates_superseded_shape` CHECK). `instrument_rates_one_instrument` CHECK: `estimate_id`
XOR `change_order_id` — **there is no project_id anchor** (§6.5's open item stands). Partial
unique indexes `instrument_rates_estimate_type_date_key` / `_co_type_date_key` on
(instrument, rate_type, effective_from) WHERE live. BEFORE INSERT trigger
`instrument_rates_backdating_guard` (floor = latest live same instrument+type; transaction-local
`app.superseding` exemption — exactly two setters: `supersede_instrument_rate` RPC and the A-9
expansion INSERT). RLS: `instrument_rates_select_company`, `instrument_rates_insert_authorized`
(Owner/Admin); no UPDATE/DELETE policies — supersede only via the Owner-only SECURITY DEFINER RPC.

**`rate_type` CHECK now holds SEVEN values** (A-9): `cost_plus_percent` (LEGACY, read-only —
kept so history reads; nothing writes it), `cost_plus_labor_hourly`, `cost_plus_material_percent`,
`cost_plus_subcontractor_percent`, `cost_plus_other_percent`, `tm_labor_hourly`,
`tm_nonlabor_percent`. The §S question "own labor type vs tm reuse" was DECIDED: **own type** —
rate rows are audit data (§8 stores the rate row's identity on derived lines); a `tm_`-prefixed
row on a cost-plus contract would mislead every future filter. The A-9 expansion copied each live
legacy row into the three category markups (same rate/date/instrument — the "all equal" case);
**no labor rate was seeded** (no source data; entry surfaces demand it). The money-rep header's
"Not built. No migration exists" is **STALE** — confirmed applied on rebuild-test.

Selector: `instrument-rates-shared.ts` — `rateInForce(rates, rateType, asOf)` (greatest live
`effective_from ≤ asOf`) and `latestLiveEffectiveFrom` are THE definitions; 7D consumes them and
never restates. **[A9]** The §S item-5 consumer list is DONE (`c332382`: four-rate context,
per-category markups, usage-based `NoRateInForceError`, four-field entry surfaces, legacy row
labeled in history). **[A9, S97 corrected labor
ruling]** estimate/CO **projections** bill labor at the ROW's own editable rate (defaulted from
the instrument labor rate at row creation); the instrument labor rate-in-force at the worked date
is **7D's** billing basis (§7) — 7D is its first real consumer.

### S.5 — 7A/7C cost ledger (item 5)

`expenses` (`20260728010000`; 7C adds `20260729010000` — both applied on rebuild-test; 7C
never click-tested per context91 §10): `project_id NOT NULL`, `author_member_id`, `supplier`,
**`expense_date date`** (company-tz calendar day), `amount > 0`,
`cost_category CHECK material|subcontractor|other` (**labor deliberately excluded** — labor cost
derives from time × pay rate × burden, never expense rows), `state CHECK committed|actual`,
`status CHECK pending|approved|rejected` (+ mandatory `rejection_note`), `approved_by|at`,
`source_segment_id → time_segments`, `qb_export_status` stub; 7C: `is_retainage` accrual rows,
`expense_payments` (`amount`, `retainage_withheld ≥ 0`), `subcontractor_contracts` (+ compliance
docs, `approve_expense`, `setup_payment_schedule` — all SUB-side, not client invoicing).
`expense_allocations`: `expense_id` (CASCADE), `budget_item_id → project_budget_items`,
`amount > 0`; triggers keep `actual_amount` true. **There is NO instrument tag on the expense
row and NO billed/unbilled marker** — instrument attribution is TRANSITIVE:
allocation → budget item → (`source_line_*` = original estimate | `source_change_order_id` = CO |
`is_miscellaneous` = **no instrument**). See conflicts K1/K2. Services `expenses(-client).ts`,
`payables(-client|-shared).ts`; pages `/dashboard/expenses`, `/dashboard/projects/[id]/costs`,
`/contracts`.

### S.6 — Module 6 time entries (item 6) — **MERGED. Josh is right; the §S risk note is stale.**

Verified against git, not context files: 6A tables `20260710130000`, 6A UI merge `6e01f19`, M6B
merged + deployed (`8b6972a`, types regen `305ffe4`), tiered RLS + week-approval batch
(`20260721000000`–`20260721050000`) all in tree and applied on rebuild-test. Shape:
**`time_clock_sessions`** (payroll truth; `member_id`, `clock_in`/`clock_out timestamptz`,
**`status` NULLABLE CHECK pending|approved — NULL means "no approval state" and is the OWNER's
permanent state** (`can_approve_member` rejects the Owner; see decision D1), `approved_by|at`,
one-open-per-member partial unique index) and **`time_segments`** (`session_id`,
`segment_type CHECK work|material_run|warranty|travel|shop|break`; `project_id` REQUIRED for
work/material_run/warranty and FORBIDDEN for travel/shop/break; `task_id` only on work;
`segment_start`/`segment_end`). Approval is **session-grain** (per-day 4b UI + atomic
`approve_member_week` RPC). **There is no stored worked-date column and no daily rollup table** —
§7.2's per-person-per-day grouping is DERIVED: person = session `member_id`, day =
`segment_start` in the company timezone (`companies.timezone`, `20260719000000`;
`company_time_settings` `20260721050000`; `weekWindow()` in
`packages/shared/utils/time-tracking.ts`), hours = Σ segment durations on that project → round UP
to the half hour once per person per day. The data supports this exactly. **[S97] D1 and D2 are now
RULED (§7.2)** — _superseded note: "what counts as billable segment types and the Owner's hours need
rulings (D1/D2)."_ Cost-side (never client-facing): `member_pay_rates` (`20260721040000`),
`member_burden_settings` (7A).

#### S.6a — The task→line-item chain does NOT exist (verified [S97]; rule since WITHDRAWN)

Verified before the rule was withdrawn, and retained so it is not re-investigated:

- **Hours→task: EXISTS but is optional and type-gated.** `time_segments.task_id` (uuid, **nullable**,
  FK → `tasks.id`). `time_segments_task_gate_check` permits a task **only on a `'work'` segment** —
  `material_run` and `warranty` carry `project_id` but can never carry a task.
- **Task→line item: DOES NOT EXIST.** `tasks` (`20260704213000`, confirmed against live
  `information_schema` on rebuild-test) ties to `project_id` (NOT NULL), `phase_id` (nullable →
  `phases`, which itself carries **no** estimate reference), `change_order_id` (nullable, the 5D
  hook), and `assignee_id`. There is **no** `estimate_line_item_id` / line-row column anywhere.
- **Live rows on rebuild-test:** 12 work segments, **11 with no task**; 5 `material_run`/`warranty`
  segments (task structurally impossible); 6 tasks — all phase-linked, **0** CO-linked, 0
  line-item-linked. Under the withdrawn rule **zero** hours would have been billable.
- **Instrument resolution** would have worked had the link existed (estimate line → `estimate_id`;
  CO line → `change_order_id`), but it needed an XOR-style pair since estimate lines and CO lines are
  separate tables. **Moot under D2** — attribution is project→instrument (§7.2).

#### S.6b — Owner self-approval: two APP-LAYER gaps, no schema wall — **[S97, correcting K3]**

D1 requires the Owner's hours to become "approved" like anyone else's. CC's earlier K3 claim that
this was structurally impossible was **too strong** — corrected here:

- **The DB permits it today.** `time_clock_sessions_update_authorized` has a blanket Owner/Admin arm
  (`get_my_role() IN ('owner','admin')`, with no self-exclusion), and
  `enforce_time_clock_sessions_column_scope()` **returns early and unrestricted for Owner/Admin**
  (§8.1). An Owner can therefore write `status`/`approved_by`/`approved_at` on their **own** session
  via an ordinary UPDATE. No migration is required for D1.
- **Gap 1 — Owner sessions are written with NO approval state.**
  `apps/web/lib/services/time-tracking-client.ts:81`:
  `const status = role === 'owner' ? null : 'pending'`. Confirmed live: all **4** Owner sessions on
  rebuild-test carry `status = NULL` (crew 5 and PM 2 are `'approved'`). A NULL-status session is
  outside any "approved" population, so today the Owner's hours would never reach the picker.
- **Gap 2 — the bulk week path refuses self-approval.** `approve_member_week()` raises _"You may only
  approve members strictly below your role"_ via `can_approve_member()`, which tests
  `p_target_member_id IS DISTINCT FROM get_my_member_id()` **and** strictly-greater rank — so it
  rejects self for everyone and rejects the Owner as a target for anyone. The **per-session** UPDATE
  path is unaffected; only the week RPC and any UI keyed on `can_approve_member` are.
- **Both gaps are Module 6 changes** (an Owner self-approval affordance + writing a real status for
  Owner sessions), not 7D schema. 7D consumes whatever "approved" means; it must not special-case the
  Owner in billing math (D1). **File as an M6 dependency at build.**

### S.7 — Project finances model (item 7)

**No invoice-side schema exists.** Today's finance surface = `project_budget_items`
(budgeted/committed/actual + misc bucket) + `expenses`/`expense_payments` + the 7B contract-value
derivation + `budget.ts`/`dashboard.ts` reads. A standalone invoice's amount/category has **no
landing place** — §2's standalone posting (incl. deposit-to-budget crediting, §3) is green-field.
QB account mapping exists: `companies.gl_account_labor|material|subcontractor|other` (7A).

### S.8 — File storage for the invoice PDF (item 8)

`files` (baseline): `project_id`, **`category` CHECK already includes `'invoices'`**, `file_path`
in the `project-files` bucket (path convention `{company_id}/{project_id}/…`; storage RLS uses the
inline-subquery pattern, `20260714175906`), `version`/`supersedes_id`, `client_visible`
(`20260721070000`), plus per-feature link columns accreted by migrations (`change_order_id`,
`co_signing_session_id`, `expense_id`, daily-log/incident/delivery links — all
`ON DELETE SET NULL`). The `20260728000000` security pass gates `category='invoices'` to
Owner/Admin/PM. PDF generation precedent: `co-pdf-service.ts` / `daily-log-pdf-service.ts` /
`delivery-pdf-service.ts` + `/api/*/pdf` routes; signed URLs via `/api/files/signed-url`
(`?download=` for attachment disposition). 7D inherits the whole pattern; it needs only a
`files.invoice_id` link column (NEW) in its own migration.

### S.9 — Company settings (item 9)

`companies` carries a full estimating-defaults block (`estimate_number_prefix`/`_sequence`,
per-category markup/margin defaults, `default_tax_rate`, `default_pricing_mode`,
`default_proposal_pricing_level`, `default_terms_sections`, proposal/reminder email defaults,
`default_expiration_days`, `brand_color`, `timezone`, `contractor_signature_path`) — and
**nothing invoice-side**: no invoice number prefix/sequence, no default invoice detail level, no
default payment terms. Which invoice defaults exist at all is decision D4.
**`default_labor_rate`: LIVE; keep.** [S97 corrected ruling] It is the **fixed-price default
CHARGE rate** — pre-fills new labor rows on fixed-price estimates
(`getCompanyDefaultLaborRate`, `estimate-items-client.ts`; settings control in
`estimating-settings-form.tsx`; read/write plumbing `company.ts`). **[A9]** Non-fixed estimates
now default new labor rows from the instrument labor rate instead. It is NOT the T&M/cost-plus
billing basis and must NOT be retired or repurposed.

### S.10 — Material-selection overage source (item 10)

The **class exists; the selection does not.** `change_orders` is fully capable of carrying a
selection-overage CO (per-CO type, signable, signed `net_delta`, budget write-through), and
architecture §7.4's "a selection IS a change order" holds structurally — but nothing in schema or
code implements a selection: no selection entity, no allowance-vs-selection comparison, and
`reason_category` is free text with no `selection` value convention (the only 'selection' string
in the tree is an unrelated `tag_options` seed). Allowance rows DO exist
(`estimate_line_rows.unit_of_measure='allowance'`, amount = `unit_cost`) and carry to budget items
via conversion — §4b's true-up has its baseline. Until the Module-9-gated selection surface
exists, a selection overage reaches 7D only as a **manually authored CO** (conflict K5).

### What must now be storable — annotated (EXISTS vs NEW)

- **Per instrument:** four cost-plus / two T&M effective-dated rates — **EXISTS** (S.4). The
  **tax base for markup** (§6.3, fixed at signing, not effective-dated) — **NEW** (no column).
- **Per invoice:** status incl. voided + void reason/by/at; optional supersedes link; presentation
  detail level; retainage withheld + receivable — **ALL NEW** (no invoice tables exist).
- **Per derived line:** cost/hours basis · category · **rate row identity** (FK into
  `instrument_rates.id` — the row is immutable-by-supersede, so the FK is audit-stable) · derived
  amount · billed amount — **NEW**. Discount = ordinary negative line [R1].
- **Per cost row:** billed/unbilled marker — **NEW**; must cover BOTH `expenses`-side costs and
  labor hours (which are not expense rows — S.5/S.6), and resolve K1/K2 first.
- **[S97 — D2] Per HOUR: a billed/unbilled marker, the same as a cost row** — **NEW**. §7.2's picker
  presents approved-and-**unbilled** hours and unselected ones must reappear next time, so a billed
  hour has to be markable. Two live constraints shape it: `time_segments` is **Module 6's** table
  (7D should not add billing state to it — the 7A/7C precedent is that 7D-side state lives in 7D's
  own tables), and the marker's grain is the **segment** (the task/job tie) while approval is the
  **session** — so an invoice-line→segment claim table is the natural shape. The **rounded** billed
  quantity must also survive, because rounding happens per person per day on the SELECTED set and is
  therefore not recomputable from the segments alone. Design with K2.
- **Per job:** deposit credit balance with visible draw-down (§3a) — **NEW** (S.3: no deposit
  schema at all).
- **Credit lines** (negative-CO §4a incl. available-until-placed state, allowance under-credit
  §4b, deposit draw-down §3a, discounts §8) — **NEW**; source data exists (signed negative
  `net_delta`, allowance rows, deposit-to-be-built).
- **QB memo text** for void/reissue pairs — **NEW**.

### Conflicts found (spec vs. live repo) — **NOT resolved here**

| #  | Conflict |
| -- | -------- |
| K1 | **§6.2 vs S.5 — costs have no direct instrument tag.** Attribution is transitive (allocation → budget item → source estimate/CO), and works ONLY when the budget item has instrument identity. The `is_miscellaneous` bucket has none: a cost-plus job's misc-allocated expense is **unattributable to any instrument**, so §6's "which instrument's rates price this cost" has a hole. Needs a rule or a direct per-cost instrument ref (decision D3). |
| K2 | **§6.2's "cost row" is two populations.** Non-labor costs are `expenses` rows; labor "costs" are derived hours (S.6) with no row to mark billed. The billed/unbilled marker needs a design that covers hours (e.g., billed-through-date per person/instrument or an invoice-lines-claim model) — not just an `expenses` flag. **[S97 — D2] STILL OPEN, and now firmly in scope:** selection makes the hours marker mandatory (storage list above). The two populations stay two populations; one picker presents them. |
| K3 | ~~**§7.2 vs S.6 — the Owner's hours can never be "approved".**~~ **[S97 — D1] CLOSED, and the original claim CORRECTED.** _Superseded text: "`time_clock_sessions.status` is NULL for the Owner by design (`can_approve_member` rejects the Owner; nobody outranks them). §7.2's population 'every approved hour' would silently exclude the founder's own field hours."_ The exclusion was real but the impossibility was **overstated** — the DB's Owner/Admin arms permit Owner self-approval today (S.6b). Ruling: **the Owner approves their own time**; billing math gets no special case. What remains is **two Module 6 app-layer gaps** (S.6b), not a 7D conflict. |
| K4 | ~~**§7.2 does not say which segment types bill.**~~ **[S97 — D2] CLOSED: selection replaces classification.** No type is billable by rule. `material_run`/`warranty` **do** appear in the picker (project-attached, task-impossible → blank task column); `travel`/`shop`/`break` never do, because they carry no `project_id`. The user decides (§7.2). |
| K5 | **§4/S.10 — no structured selection.** A selection-overage CO is indistinguishable from any other CO (`reason_category` free text). If §4's flows need to KNOW a CO is a selection overage (reporting, client copy), v1 needs a convention or column. Decision D5. |
| K6 | **Session-day boundary.** §7.2 groups per person per DAY, but approval is per session and a session may cross midnight (no constraint prevents it). Which day a cross-midnight segment's hours belong to (segment_start's day vs. split at the boundary) is unstated. CC can propose (segment_start's company-tz day — matches 6B's log_date convention) but it changes real invoices; flagged for confirmation. |
| K7 | **Doc staleness recorded:** money-rep's "no migration exists" header is stale (S.4); §S item 7's "M6 unverified/unmerged — largest upstream risk" is stale (S.6); item 6's "7C rebuild-test only, never click-tested" is still TRUE (prod batch owed — everything `20260728000000`+ is pending on production). The A-9 app-code layer is committed (`c332382`). |

### Decisions owed by JOSH before the 7D migration is written

| #  | Decision |
| -- | -------- |
| ~~D1~~ | **[S97] RULED — CLOSED.** _Was: "Do the Owner's own hours bill on T&M/cost-plus? If yes: the billable population must be 'approved OR owner' … or the Owner gets an approval path."_ **The Owner APPROVES THEIR OWN HOURS.** The approval gate stands unchanged for everyone; no auto-approval; no special case in billing math (§7.2). Josh chose the approval-path option, not the "approved OR owner" predicate — so 7D never tests for the Owner. Carries an **M6 dependency** (S.6b). |
| ~~D2~~ | **[S97] RULED — CLOSED.** _Was: "Which segment types are billable hours? work only, or work + material_run (+ warranty?)"_ **Neither — the question is void: hours are USER-SELECTED, not classified** (§7.2). The earlier task→line-item chain is **WITHDRAWN**; no `tasks` schema is to be specced. Task is context; hours with no task are billable; unselected hours reappear. |
| D3 | **Misc-bucket costs on a cost-plus/T&M job:** unbillable by definition, billed at a default instrument (original contract?), or must every billable cost be allocated to an instrument-bearing budget item? (K1). |
| D4 | **Invoice numbering + format defaults** (S.9): prefix/sequence like estimates (`INV-`…)? Which company-level defaults (detail level, payment terms) exist in v1? |
| D5 | **Selection-overage marking** (K5): is a free-text `reason_category` convention enough for v1, or does the CO need a structured origin marker now so 7D/M9 reporting can find them later? |

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
- **Module 6 hours** — ~~§7 cannot be exercised until M6's time entries are readable and merged.~~
  **[S97: CLOSED — M6 is merged and applied (§S S.6, verified against git); D1 and D2 are now ruled
  (§7.2).** One **M6 dependency remains** and is owed by Module 6, not 7D: the Owner needs a
  self-approval affordance and Owner sessions must carry a real approval state rather than
  `status = NULL` (§S S.6b). Until that lands, D1 is correct in spec and inert in practice —
  the Owner's hours cannot become "approved" through the UI.]

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
- **[S97 third batch] rulings (Josh, D1 + D2 — billable hours):** **D1** — the Owner **approves their
  own hours**; the approval gate is unchanged for everyone, there is no auto-approval and no Owner
  special case in billing math (§7.2; closes K3, which CC had overstated — see S.6b). **D2** —
  billable hours are **USER-SELECTED**, not derived: the invoice presents approved unbilled hours with
  task and date and the user ticks them, exactly like §6.2's cost picker (§7.2; closes K4). Josh's
  earlier same-session statement that _"hours tie to tasks tie to line items"_ is **WITHDRAWN by him**
  — CC had verified the chain does not exist (S.6a) and no `tasks` schema is to be built. Rounding now
  applies to the **selected** hours; hours gain a billed/unbilled marker in 7D's own tables.
- **§15 traces A, D, E:** founder-sourced from architecture §7.10 / §7.8.6.
  **§15 traces B, C, C-1: founder-sourced [S97]** — walked through against real jobs, replacing the
  illustrative values the prior revision carried. Trace F is a mechanism illustration.
- All money figures in §15 computed with the shipped `deriveCostPlusSell` / ~~`deriveTmLaborSell`~~
  and `roundMoney` (`estimate-totals.ts:35,159,166`), applied per row. **[S97 citation refresh]**
  `deriveTmLaborSell` was **renamed `deriveFlatLaborSell`** by the A-9/S97 app-code pass (`c332382`)
  — both T&M and cost-plus bill flat labor through it. Current lines:
  `roundMoney:35`, `deriveCostPlusSell:159`, `deriveFlatLaborSell:167`. **The computed figures are
  unaffected** (rename only; the arithmetic `hours × rate` is unchanged).
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
- ~~FrameFocus schema: **not** verified against the live repo beyond the specific file:line citations
  above — the schema layer is deferred to CC by design (§S).~~ **[S97] Superseded: §S is now FILLED**
  from the live repo and rebuild-test (all ten items, `88e4657`), and the D1/D2 findings in S.6a/S.6b
  were verified against live schema **and live row counts**. What remains unverified is only what §S
  names as NEW/green-field.
