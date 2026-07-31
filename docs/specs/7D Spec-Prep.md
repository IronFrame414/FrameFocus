# 7D Spec-Prep — Draft input→store→output trace + decision record

> **What this is:** Design-prep for Module 7 feature **7D (Invoicing / the client-billing layer)** — the
> draft input→store→output trace, plus the decisions needed to turn it into an approved one. Per the
> Interview-First Mandate (`future_module_architecture.md` §2/§2a): _"if there's no approved
> input→store→output trace for an important part, it isn't ready to spec."_
>
> **What this is NOT:** No code, no migration, no schema. No table/column/file-path is asserted as fact —
> that is CC's job after reading live schemas, per every 7-series `§S`. 7E–7H appear only where 7D must
> decide something on their behalf.
>
> **Status:** **Rev 5** — 2026-07-31. **Twelve decisions ruled by Josh this session** (D0, D1, D2, D3, D3a,
> D5, D5a, D5b, D6, D7, D11, and D-core by consequence). **The trace is not yet approvable:** three items
> (D4, B1, D9) require a §2a walk-through with real numbers, and four require verification against git.

---

## 0. Read this first

### 0.1 Source caveat — how these docs were read

`docs/specs/7D-spec.md` is **fully read** (complete text supplied by Josh this session; it is the authority
for 7D's approved workflow below). The others — `module7-architecture.md` incl. §7.10, the roadmap docs,
`money-representation.md`, `STATE.md`, `CLAUDE.md` — were reachable only as **knowledge-base retrieval
passages, not full sequential file reads.** Coverage of the relevant sections was broad and high-confidence,
but **CC should open those files fully in git before writing spec text.** Nothing here is invented to fill a
gap; every gap is marked **[OPEN]**.

### 0.2 What this prep found

**7D is not greenfield.** `7D-spec.md` is headed _"Status: WORKFLOW APPROVED + PROVEN."_ Its approved half is
real and was not re-litigated: invoice creation (convert estimate / CO(s) / multi-source / standalone), the
deposit as a fixed-amount invoice, percentage-vs-fixed bill method, CO and selection-overage bill-now-vs-next
prompts, client retainage, the PM-create/Owner-approve/send gate, email-or-print delivery, named notification
events, and the governing invariant — _"all income ties to an invoice."_

**But it had a hole exactly where the open work is: cost-plus billing was absent entirely.** Verified against
the full text — cost-plus appears in no section: not §1, not §2's bill mechanic, not §6 (T&M only), not §10,
not §S. Yet architecture §7.2 names 7D's basis as _"stages, percentages, **cost-plus**, T&M — all coexist,"_
and `money-representation.md` shipped the whole cost-plus apparatus (`cost_plus_percent` on `instrument_rates`,
`deriveCostPlusSell()`, unit-tested).

**And §2's mechanic could not absorb it.** §2 offers _"percentage of the source, or an edited fixed amount."_
On a cost-plus instrument the "source" total is `estimates.projected_value` — which **P11 explicitly forbids
from billing math**: _"it must NOT feed variance or over/under-billing math."_ So percentage-of-source billing
on a cost-plus job was not merely unspecified, it was **prohibited by the locked money model**.
**→ Ruled (D1): cost-plus is in v1 and 7D gets a real derivation.**

### 0.3 Conflicts — status after this session

| #   | Conflict                                                                                                                                                             | Status                                                                                                                                                        |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | `money-representation.md` (FINAL/LOCKED) hands billing to **"7G invoicing"** twice; every other doc holds invoicing = 7D, 7G = QuickBooks                            | **RULED (D0): drafting error.** Amend money-rep §6 + companion list to 7D                                                                                     |
| C2  | 7D §6 bills T&M at `companies.default_labor_rate`; money-rep replaced this with per-instrument effective-dated `instrument_rates`                                    | **RULED (D2): S93 model stands.** §6, acceptance #8, §S #4 are the outliers to amend                                                                          |
| C3  | Architecture §7.2 says billing basis is _"set per job"_; money-rep **P4** says _"contract type lives on the INSTRUMENT, not the job"_                                | **RULED (D2): P4 wins.** §6's CO-only scoping also widens — a T&M/cost-plus **estimate-contract** is permitted                                                |
| C4  | §7's lifecycle is _draft → pending approval → sent → paid_ — **no void state** — but 7E, 7F and 7G all depend on one                                                 | **RULED (D5/D5a/D5b).** Void added, blocked once paid, reason required, reissue as linked successor                                                           |
| C5  | Architecture §7.10 lists draw triggers (date / % complete / stage complete); `7D-spec.md` §1 says _"the user triggers every invoice… no draw-schedule object in v1"_ | **CLOSED.** The spec is newer and locked; v1 is manual-trigger-only. AIA/G702–G703 deferred to `TECH_DEBT.md`                                                 |
| C6  | `STATE.md` (S87) lists Module 7 as ⚪ NOT STARTED, but 7C is **BUILT [S91]** with commit hashes and two M7 migrations are in the tree                                | **Stale — CC to refresh.** Also: money-rep's header still reads _"Not built. No migration exists"_ while `20260730010000_money_representation.sql` is present |

---

## 1. Scope restatement (cited)

**7D = the client-billing layer.** It owns _how a job gets billed to the client_: what triggers an invoice,
how the amount is derived, what the client receives, and how the invoice lands in the project
(`7D-spec.md` §1). Governing invariant, locked: _"No invoice, no tracked income — the QuickBooks discipline."_

**In scope, already approved** (`7D-spec.md` §§2–10): invoice creation from estimate / CO(s) / multiple sources
/ standalone; deposit-as-invoice with budget crediting and refundability; CO and selection-overage
bill-now-vs-next prompts; client-held retainage (project default, per-invoice editable, never on deposit or
T&M); Owner/Admin send-without-approval vs PM-requires-approval; email-with-pay-link-and-PDF or print;
standalone amounts + categories posting to project finances; named notification events.

**In scope, designed this session** (was absent or stale — the subject of this prep):

- **Cost-plus billing** — new; derives Σ incurred cost × rate-in-force-at-`expense_date` (D1).
- **T&M billing rebuilt** on the instrument-rate model, replacing the company-settings rate (D2).
- **Derivation with recorded override**, one mechanic across both (D3, D3a).
- **Void / correction / reissue lifecycle** (D5, D5a, D5b, D6).
- **Per-instrument tax-base policy** for the marked-up figure (D7).
- **Per-invoice presentation detail** (D11).

**Explicitly NOT 7D:**

- **Money received** → **7E**: payments, application, over/under, credits/refunds, AR aging, **retainage
  release** (job completion + **client** sign-off; the §4-vs-acceptance-#6 actor conflict was resolved [S92]
  in favour of the client).
- **The cost side** → **7C** (BUILT S91). 7D _reads_ incurred cost; never writes it.
- **Accounting/export** → **7G**. _"Promised value stays in FrameFocus; billed value goes to QB"_ — QB
  receives **invoices only**; neither the contract nor a signed CO ever touches it.
- **Contract value** → **7B**, derived at read (`contract-value.ts`).
- **Estimate-side projection** → money-rep prices estimates at _today's_ rate and stores optional
  user-entered `projected_value` (P11). 7D is the incurred/worked-date counterpart.
- **Lien-release document lifecycle** → **7F** (7D §5 names the outbound-release toggle; does not build it).
- **Notification delivery** → separate cross-cutting build (7D §9 emits events only).

---

## 2. Draft input→store→output trace

Format per §2a: `enters X → stores Y → produces Z`. **No table/column names asserted**; `angle brackets` are
concepts for CC to resolve. Remaining gaps marked **[OPEN]**.

### 2.1 Reused inputs

- **From 7C / the job-cost ledger (BUILT S91):** incurred cost as `expenses` rows + `expense_allocations`
  splits, each carrying an **`expense_date`** (`20260728010000_7a_expenses_job_cost.sql:44`), cost category
  (labor / material / subcontractor / other), approval state (`pending|approved|rejected`), and the
  committed/actual math (`getJobCostRollup()`, `payables-shared.ts` — _"money math never reads state"_).
- **From the rate model (S93):** `instrument_rates` (`cost_plus_percent | tm_labor_hourly |
tm_nonlabor_percent`, `rate`, `effective_from`, supersede stamp); the shared **`rateInForce(rates, type,
asOf)`** selector (`instrument-rates-shared.ts`); `contract_type` per instrument (P4); and the
  **`NoRateInForceError`** guard — a rateless non-fixed instrument must **never** price at 0%.
- **From Module 6 (UNVERIFIED / unmerged — the critical upstream gap):** worked hours (time entries/segments
  - worked date) for T&M labor. 7D §6's own dependency flag names the business risk: _"T&M value is only as
    good as logged-hours data… this feature's value is gated on M6 adoption."_

### 2.2 Action A — Fixed-price invoice (percentage / fixed / standalone) — _approved, unchanged_

- **IN:** user triggers an invoice against source(s) — estimate-contract and/or signed CO(s), or standalone;
  bill method per source = percentage of source or edited fixed amount; detail format mirrors the source.
- **STORE:** `<invoice>` + `<invoice_line>` rows; status per §7 **+ void**; retainage; source links; PDF.
- **OUT:** email (pay link + PDF) or print; saves to the project either way; standalone amounts **and
  categories** post to project finances.

### 2.3 Action B — Cost-plus invoice — **NEW (D1)**

- **IN:** user triggers a bill on a cost-plus instrument over a population of **approved** incurred cost rows
  tied to that instrument, each carrying `expense_date` + amount.
  **[OPEN — B1: what is the cost-selection unit for one invoice?** A date range, "everything unbilled since
  the last invoice," or an explicit pick? **D3a makes this harder than it looks** — "unbilled" can no longer
  mean "cost rows with no invoice link," because held-back shortfalls must carry forward. **Needs the
  walk-through.**]
- **DERIVE:** per cost row, sell = **cost × (1 + `cost_plus_percent` in force at `expense_date`)** — the
  non-superseded row of that type with the greatest `effective_from ≤ expense_date` (money-rep §4.2;
  `deriveCostPlusSell`). No rate in force → `NoRateInForceError`; **never bill at 0%.**
  The **cost** used is tax-inclusive or pre-tax **per the instrument's tax-base setting** (D7).
  **[OPEN — B3: labor burden.** money-rep keeps the 7A burden multiplier cost-side-only for **T&M** but is
  silent for cost-plus. Does the client see burdened or unburdened labor cost × rate?]
- **STORE:** invoice + lines, each line carrying **cost basis, the rate row applied, the derived amount, the
  billed amount, and the override disposition** (D3, D3a, D6 — see 2.6).
- **OUT:** client bill at the detail level chosen for that invoice (D11).

### 2.4 Action C — T&M invoice — **rebuilt on the instrument-rate model (D2, D3)**

- **IN:** for a T&M instrument — **labor** = worked hours from M6 time entries (worked date each);
  **non-labor** = incurred material/sub/other cost rows (`expense_date` each).
  **[OPEN — D4: the billable-hours definition** is explicitly deferred to invoicing by money-rep §6 — _which
  time entries count, rounding, approval gate._ **Now forced by D3**, since the system cannot compute a labor
  total without it. **Needs the walk-through.**]
- **DERIVE:** labor sell = **hours × `tm_labor_hourly` in force at the worked date** — flat rate, **no burden,
  no markup** (`deriveTmLaborSell`; tested 12.5 h × $85 = 1062.50). Non-labor sell = **cost × (1 +
  `tm_nonlabor_percent` in force at `expense_date`)**, tax base per D7. Either rate missing →
  `NoRateInForceError`.
- **STORE / OUT:** as Action B. **No retainage on T&M** (§5, acceptance #8).

### 2.5 Action D — Change-order invoice — _approved shape, plugs into B/C_

- **IN:** signed CO carrying money → prompt **bill now (own invoice) vs roll into next** (§4). A signed
  **material-selection overage** auto-generates a difference invoice with the same prompt.
- **STORE / OUT:** its own invoice, billed separately from the schedule (§7.10). Raises contract value **via
  7B derivation-at-read only** — 7D writes nothing. A CO carries its own `co_type` and its own
  `instrument_rates`, so a cost-plus/T&M CO bills through Action B/C **against the CO instrument**.
  **[OPEN — D9: which incurred cost rows attribute to the CO instrument vs the base contract?** The P6 /
  split-at-capture join. 7D reads the instrument tag on each cost row; confirm it exists and is reliable.
  **Needs the walk-through.**]

### 2.6 Cross-cutting: what a billed line stores (settled)

Per **D-core**, decided by consequence of D3/D3a/D6, each cost-plus/T&M line stores:

| Field (concept)                                         | Why                                                                                                                                                                       |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cost / hours basis                                      | What was billed against                                                                                                                                                   |
| **The rate row applied** (identity, not just the value) | **D6 requires it** — when a rate is superseded, 7D must be able to identify which sent invoices were priced under it. Storing only the numeric rate makes that impossible |
| Derived amount                                          | What the system computed                                                                                                                                                  |
| Billed amount                                           | What the client was actually charged                                                                                                                                      |
| Override disposition (`write_off` / `hold_back`)        | D3a — set only when the override is downward                                                                                                                              |

**Snapshot at approve/send** — a sent bill is immutable; **drafts recompute live**; a post-send rate
correction flows through the D6 flag-and-reissue path, never by mutating a sent invoice.
**[OPEN — two edges: (a) does a draft re-derive when a rate or underlying cost row changes before send, and
(b) does an override survive that re-derivation or reset?]**

---

## 3. Decision record

### 3.1 Settled this session (Josh's rulings, 2026-07-31)

**D0 — "7G invoicing" is a drafting error; invoicing is 7D.** `money-representation.md` §6 and its
companion-specs list must be amended from 7G to `7D-spec.md`. Because that doc is marked **FINAL / FULLY
LOCKED**, record this as a formal amendment in its existing amendment style (cf. "Amendment A-1"), not a
silent edit.

**D1 — Cost-plus billing is IN v1.** 7D gains a cost-plus section deriving Σ incurred cost ×
`cost_plus_percent`-in-force-at-`expense_date`. §2's bill-method text widens — percentage-of-source is no
longer the whole billing mechanic. B1 becomes a required answer.

**D2 — T&M rates live per project and per CO, not in company settings.** Josh's words: _"T&M has separate
setting on each project and CO for hourly rate and material/sub/other markup."_ This matches the shipped S93
model almost exactly — money-rep §4.2 defines T&M as a hybrid where labor bills at a flat per-man-hour rate
(`tm_labor_hourly`) and **material/sub/other** bill cost + a negotiated markup (`tm_nonlabor_percent`), both
effective-dated on `instrument_rates`. **No new rate storage is needed.** Amend 7D §6, acceptance #8 and
§S #4 off `companies.default_labor_rate`; §S #4 becomes moot. P4 beats architecture §7.2's "set per job",
and §6's CO-only scoping widens to include estimate-contracts.

> **[OPEN — D2a, for CC to verify, not Josh]** Josh said _"each **project** and CO."_ The built table anchors
> rates on `estimate_id` **XOR** `change_order_id` (CHECK `instrument_rates_one_instrument`) — there is **no
> `project_id`**. For a project converted from an estimate these coincide. **CC must confirm whether a project
> can exist with no originating estimate** — if it can, such a job has nowhere to hang its rates. Read
> `convert_estimate_to_project()` and the project-creation paths.

**D3 — Derive, with a recorded override.** The system computes the amount from approved hours and costs at
rate-in-force; the total is a **proposal the user may override per invoice**, and the override is **stored as
an override**, not a silent replacement. One mechanic for cost-plus and T&M. §6's _"fixed/edited invoice"_
framing is superseded. **7G and 7H must consume the billed figure, not the derived one**, or QB income and
profitability will disagree with what the client was invoiced.

**D3a — A downward override prompts for disposition.** Every downward override asks: **write off** (hours/costs
marked billed, delta is a permanent margin write-down) or **hold back as still-billable** (shortfall stays
unbilled, may appear later). Both must be built. The override record needs a **disposition field**. **7H must
separate written-off margin from still-billable backlog.** The prompt fires only on downward overrides.

**D5 — Void allowed, blocked once _fully_ paid.** Lifecycle gains **voided**. A void propagates as
`operation=void`, zeroing it and backing income out. A linked **7F conditional release is voided and a new one
prompted** _(amended by 7F's F4 — the original "flagged for review, not auto-voided" is superseded)_.

> **[AMENDED by 7E's E4, same session]** D5 originally blocked voiding once _any_ payment was applied. The
> 7E prep surfaced that 7E §3 accepts **partial** payment, and Josh ruled partial does **not** block. Revised:

| Invoice state                             | Void?                                                               |
| ----------------------------------------- | ------------------------------------------------------------------- |
| Unpaid                                    | **Yes** — Owner/Admin, reason required (D5b)                        |
| Partially paid, payment **not yet in QB** | **Yes** — Owner only, warning, payment becomes a client credit (E4) |
| Partially paid, payment **already in QB** | **No** — credit or refund via 7E _(narrowed by 7G's **G1**)_        |
| Fully paid                                | **No** — correct via credit/refund in 7E                            |

> **[NARROWED by 7G's G1, same session]** QuickBooks generally refuses to void an invoice with a linked
> Payment, so rather than unlinking it or substituting a CreditMemo, FrameFocus **blocks the void** once the
> payment has reached QB. **Practical effect: E4's window is nearly closed** — electronic payments originate
> in QB, and manual ones sync on entry, so "partially paid → voidable" collapses to roughly "unpaid →
> voidable," surviving only while QB is disconnected and the payment sits queued. Deliberate: G1 was chosen
> over the two options that preserved a wider window.

**D5a — Corrections reissue as a linked successor invoice.** The voided invoice **stays frozen**; the
correction is a **new invoice with its own number**, pre-filled from the original and **linked back**.
Consequences: the record needs a **supersedes / superseded-by link** (shape exists in-repo — `7F-spec.md` §S
_"an optional supersedes-link to a reissued release"_; `instrument_rates.superseded_at/by/reason`); **QB stays
clean** (original zeroed, successor is an ordinary create — no un-void path needed in 7G); a **duplicate/
pre-fill function** is required; the linked 7F release is voided and a new one prompted (F4); **invoice
numbering stays strictly sequential and immutable** — no reuse, no suffixes.

> **[AMENDED by 7F's F4, same session]** Reissue is an **offer, not a requirement**. Josh: _"when an invoice
> is voided, it can prompt to edit, but does not have to be. **void completely is an option.**"_ So **plain
> void — terminal, no successor — is a valid path**, and the supersedes-link is **optional**, which now matches
> 7F §S's _"an optional supersedes-link"_ exactly. When an invoice is voided outright, its linked conditional
> release is voided and **nothing is prompted** — there is nothing left to release against.

**D5b — Void requires a reason and is Owner/Admin only.** Matches every comparable corrective action in
FrameFocus: `supersede_instrument_rate` (Owner-only, non-empty reason) and 7C's closeout (reason required,
_"auditable forever"_). Mirrors §7's send gate. Needs `void_reason` / `voided_by` / `voided_at`.

**D6 — Corrections & rebills, fully settled.** Unpaid → void + reissue as linked successor (D5a). Paid →
credit/refund in 7E, never void. **Rate corrected after billing → FrameFocus flags the affected sent invoices
for the user to void and reissue** — nothing is repriced silently and no catch-up invoice is auto-generated.
**This is what forces the billed line to store the rate row's identity** (see 2.6): without it, affected
invoices cannot be found when a rate is superseded.

**D7 — The tax base for markup is a per-instrument contract setting.** Some cost-plus contracts mark up
tax-inclusive cost, some mark up pre-tax and pass tax through; the contract decides, so it is set per
instrument alongside the rate.

> **[OPEN — D7a, consequences to resolve at spec time]**
>
> 1. **It is a net-new field.** `instrument_rates.rate_type` has exactly three values, all of them _rates_;
>    a tax-base policy flag is not a rate and does not belong there. It most likely belongs on the instrument
>    (`estimates` / `change_orders`) beside `contract_type`. **CC decides against live schema.**
> 2. **Effective-dating:** rates are effective-dated (P5); a tax-base term is a contract term fixed at
>    signing. Recommend **not** effective-dated — confirm.
> 3. **[VERIFY — potentially blocking]** P3 stores job cost **tax-inclusive**. The pre-tax option therefore
>    requires recovering the tax component **from each expense row**. CC must confirm the expense/allocation
>    rows carry enough to do that (an `apply_tax` flag + rate, or a stored tax component). **If expenses store
>    only a tax-inclusive total with no recoverable split, the pre-tax option cannot be computed** and D7
>    needs revisiting.

**D11 — Presentation detail is chosen per invoice.** Three levels must all be built: **full detail** (hours
and costs itemized), **by section** (labor / materials / subs subtotals), and **lump sum** (today's draw
style). Chosen at invoice time.

> **[OPEN — D11a]** What does it **default** to? `7D-spec.md` §2 already establishes that _"detail format
> mirrors the source's format (the user-chosen estimate/CO presentation format)"_ — so the natural default is
> the instrument's existing presentation format. Confirm, and heed the M4 lesson _"a setting with no control
> is a bug"_ (`proposal_pricing_level` shipped with no UI): whatever the default, it needs a control.

**D-core — A billed line is a stored snapshot.** Follows from D3/D3a/D6. Shape in §2.6.

### 3.2 Still open — small, chat-answerable

- **D3b — Upward overrides.** The mirror of D3a is unaddressed: derivation says $10,000, billed at $11,000.
  Permitted at all? Reason required? Recommend **allowed, no disposition prompt** (there is no shortfall to
  dispose of) — but state it rather than leave it to the build.
- **D8 — Where the retainage held balance lives.** §5 settles the rules (project default, per-invoice
  editable, never on deposit/T&M, release is 7E's on job completion + client sign-off, outbound lien release
  toggleable, 7F owns the document). Remaining: is the held balance **stored** on the invoice or **derived**,
  and how does it render on the client's bill?
- **The two D-core edges** (§2.6): draft re-derivation, and whether an override survives it.

### 3.3 Needs the §2a walk-through, not a chat answer

- **D4 — The billable-hours definition.** Which M6 time entries count, rounding, approval gate. Forced by D3.
- **B1 — The cost-selection unit per invoice.** Complicated by D3a's carry-forward shortfalls.
- **D9 — CO cost attribution.** Which incurred costs belong to the CO instrument vs the base contract.

### 3.4 External — not interview-closable

- **D10 — Pre-Module 9 Decision Gate.** Per `7D-spec.md` §O and architecture §7.7 #1, the gate (hosted portal
  vs email + magic-link) governs the pay link and the client-facing invoice page. The invoice **record** and
  the email/PDF path can be built now; the **surface** follows the gate. Decide what 7D stubs behind it.

---

## 4. Dependency map

**What 7D consumes:**

- **7C / job-cost ledger (BUILT S91 — caveat):** approved incurred cost rows with `expense_date`, category and
  approval state; the committed/actual math; the instrument tag per cost row (D9); and enough tax detail to
  serve D7. **Per `context91` §10 the entire 7C build has never been click-tested**, and
  `20260729010000` was rebuild-test only with prod batch + merge owed. Confirm before 7D leans on it.
- **The rate model (S93):** `instrument_rates` + `rateInForce()`; `contract_type` per instrument; the
  `effective_from ≤ incurred/worked date` rule; supersede semantics; the no-0%-fallback guard.
- **Module 6 (UNVERIFIED / unmerged — the critical gap):** worked hours + worked dates for T&M labor.
- **7B (BUILT, derivation-at-read):** contract value = original + Σ signed-CO deltas; 7D reads, never writes.
- **Modules 4 / 5 / 1–2 / 3** per `7D-spec.md` §S — CC reads all live: `change_orders` (`20260704215000`,
  status `draft|sent|signed|voided`, `net_delta`) + signed-artifact columns; the estimate line model;
  project / budget / `contract_value` tables; company settings; the project-finances model; Module 3 file
  storage for the PDF. Plus §S's own flag: confirm a material selection _is_ a change-order class.

**What waits on 7D:**

- **7E (Payments & AR)** — _"you cannot record a payment against an invoice that doesn't exist"_ (§7.3). Needs
  7D's **invoice tables + status/void model** (`7E-spec.md` §S #1). **D5/D5a/D5b now supply the void half.**
- **7F (Lien Releases)** — the conditional-release prompt fires at 7D invoice/payment-request time and matches
  on invoice amount + links (§7F.9); a 7D void **voids the linked release and prompts a new one** (F4). Per
  **F3** the release amount is the **billed** amount minus retainage withheld, so 7F reads both off the
  invoice. Settings half buildable now; lifecycle blocked on 7D.
- **7G (QuickBooks)** — blocked for income: client invoice → QB Invoice is the **only** revenue export, and the
  every-invoice push and pay-link ride on the 7D invoice (§7G.4). **D3 obliges it to export the billed figure,
  and D5a keeps its void path simple.** AP half independent. _(Reciprocally 7G is upstream of 7E's
  electronic-payment path — not 7D's.)_
- **7H (Job Profitability)** — consumes 7D "invoiced" alongside 7E "collected" (§S). **D3a splits one number
  into two: written-off margin vs still-billable backlog.** Headline buildable now; full report blocked on
  7D + 7E.

---

## 5. Amendments this prep obliges

Recorded so they are not silent surprises. **These are edits to make, not decisions to re-open.**

1. **`money-representation.md`** — §6 note + companion-specs list: "7G invoicing" → `7D-spec.md` (D0). Record
   as a formal amendment; the doc is marked FINAL/LOCKED. Also refresh the _"Not built. No migration exists"_
   header if `20260730010000` is in fact applied.
2. **`7D-spec.md` §6, acceptance #8, §S #4** — retire `companies.default_labor_rate` as the T&M billing basis;
   rebuild on `instrument_rates` (D2). §S #4 becomes moot.
3. **`7D-spec.md` §6** — replace the _"fixed/edited invoice"_ framing with derive-plus-recorded-override (D3),
   and widen CO-only scoping to include T&M/cost-plus estimate-contracts (C3).
4. **`7D-spec.md` §1/§2** — add cost-plus as a billing basis; widen §2's bill-method text beyond
   percentage-of-source (D1).
   4b. **`7D-spec.md` §4 — add the negative-CO credit document** _(from 7E's **E3**)_. A positive CO gets its own
   invoice; a **deductive** CO must symmetrically produce a client-facing **credit document** at the same
   trigger, so the client has paper showing the reduction. 7E then applies it against what is owed and onto
   the final payment. Architecture §7.11 details the behaviour (_"issues a CREDIT… REDUCES the remaining
   amount owed… comes off the FINAL PAYMENT"_); neither spec currently covers it.
   4c. **`7D-spec.md` §1** — soften _"the user triggers every invoice"_. It is already false twice inside 7D
   itself (§4's selection overage auto-generates one) and once in 7E (§4's retainage release). Architecture
   §7.8.6 shows the intended shape: the system auto-generates a **DRAFT… awaiting owner/admin**. Reword to
   "no automatic _schedule_; system-generated drafts still require user approval."
5. **`7D-spec.md` §7** — add the **voided** state, the paid-invoice guard, reason + Owner/Admin gate, and the
   successor-reissue path (D5, D5a, D5b, D6).
6. **`module7-architecture.md` §7.2** — "set per job" → per instrument (C3); §7.10's draw triggers superseded
   by 7D §1 (C5).
7. **`STATE.md`** — refresh; Module 7 is not "NOT STARTED" (C6).

---

## 6. Recommended next step

Run a **§2a workflow walk-through on one real cost-plus job and one real T&M job** — actual hours, actual cost
rows, actual rates and dates, producing an actual invoice — to close **D4**, **B1** and **D9**. Those become
the acceptance examples and the trace becomes approvable. In parallel, CC verifies **D2a** (project-vs-estimate
rate anchor), **D7a #3** (is the tax component recoverable per expense row — potentially blocking), whether
`20260730010000_money_representation.sql` is applied, and the M6 hours schema.

Per the architecture doc's own warning: _"An approved trace is a design target, not a verified behavior — none
of these is 'passing' until it runs against a real Bishop job."_
