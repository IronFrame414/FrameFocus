# 7H Spec-Prep — Report reconciliation + decision record

> **What this is:** Design-prep for **7H (Job Profitability)** — what this session's 7D/7E/7F/7G
> rulings change in the report, plus the decisions needed to close them. Final doc in the set;
> companion to `claude/7d-spec-prep`, `7e-`, `7f-`, `7g-`.
>
> **Nature of 7H:** a report. Read-only, owns no data, enforces nothing — architecture §7.2 classes it
> _"No — a report."_ So this doc reconciles the **report definition** rather than tracing a workflow.
>
> **Status:** **Rev 1** — 2026-07-31. **Four decisions ruled** (H1–H4). H1 repairs a formula that did
> not work for cost-plus or T&M; H2 reverses a blocker that money-rep had already resolved.

---

## 0. Read this first

### 0.1 Source caveat

`docs/specs/7H-spec.md` is **fully read** (complete text supplied by Josh this session). Supporting
docs were read as knowledge-base retrieval passages. **CC should open them fully in git before writing
spec text.** Gaps marked **[OPEN]**.

### 0.2 What this prep found

7H is well-constructed and unusually self-aware: it consumes upstream definitions rather than
re-deriving them (_"7H consumes the rollup, never re-derives"_), its `[S91]` corrections deleted two
false claims rather than papering over them, and §7H.4's Active/Completed split already solves the
in-progress honesty problem that most profitability reports get wrong. None of that was re-litigated.

**But its headline formula did not work for the jobs D1 just put into v1.**

**Profit = Contract − Actual assumes a contract value exists.** money-rep **P11** makes
`projected_value` on cost-plus/T&M instruments _"a projection, not an obligation — it **must NOT** feed
variance or over/under-billing math"_, and `contract-value.ts` is specified to exclude it from _"any
variance/over-under figure this service feeds."_ So for cost-plus and T&M jobs 7H's headline was
either undefined or built on a forbidden number. **→ Ruled H1.**

**§7H.2 #3's blocker was stale, in Josh's favour.** It defers per-category profit because budget rows
carry no sell, citing M7-architecture debt #7. money-rep **answered** debt #7 — not by adding columns
but by **derivation**: **P1** keeps `budgeted_amount` as cost, **P2** makes sell _"DERIVED… computed
from cost + instrument pricing context at read time."_ Per-category margin has been computable since
S93. **→ Ruled H2: add it.**

**The category rows did not sum to the job total.** money-rep §4.5: retainage accrual rows are
**line-less in v1** — _"per-line totals exclude retainage held/released; job-level payables numbers
carry it."_ 7H shows a per-category table beneath a job-level headline, so wherever sub retainage
exists the two disagree by exactly that amount. Filed as tech debt for the budget screen; 7H inherited
it unknowingly. **→ Ruled H3.**

### 0.3 Conflicts & gaps — status

| #    | Item                                                                                                                                                             | Status                                                                                                                         |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| H-C1 | Profit = Contract − Actual is undefined for cost-plus/T&M; P11 forbids using `projected_value`                                                                   | **RULED (H1): earned "so far", billed final**                                                                                  |
| H-C2 | §7H.2 #3 defers per-category profit as blocked on debt #7                                                                                                        | **STALE — RULED (H2).** money-rep P2 resolved debt #7 by deriving sell at read; the blocked claim must be deleted, not carried |
| H-C3 | Category rows exclude line-less sub retainage; job total includes it                                                                                             | **RULED (H3): retainage gets its own row**                                                                                     |
| H-C4 | 7H is the platform's most margin-dense screen, gated at the **UI only** — `can_view_project()` has no role floor, so a gated user can query the figures directly | **RULED (H4): batch FINANCIAL-RLS-FLOOR into 7H's build**                                                                      |
| H-C5 | §7H.7 reads _"7D — invoiced amounts"_, but D3 now produces a **derived** and a **billed** figure                                                                 | **Consequential, no decision: read BILLED.** Same rule 7G follows                                                              |
| H-C6 | D3a splits margin into **written-off** vs **still-billable backlog**; §7H.3 has neither                                                                          | **Partly answered by H1** — the earned→billed switch is exactly where write-offs surface. Backlog display remains open         |
| H-C7 | §7H.3's cash pairing duplicates 7E's                                                                                                                             | **Governed by E2:** one shared derivation, 7E surfaces it at payment, 7H reports it, neither re-implements                     |
| H-C8 | Client-held retainage (revenue withheld) and sub-held retainage (cost withheld) are different things pointing opposite ways                                      | **Presentation risk introduced by H3** — see §3.1                                                                              |

---

## 1. Scope restatement (cited)

7H **reads the modules above it and writes nothing** (architecture §7.3): the 7A cost ledger (actual +
committed), 7B contract value, 7D invoices, 7E payments, the 5E budget baseline, and 5A job status.
It answers, per job: **what did this cost, what will it earn, are we on budget, and what did we make.**

**Unchanged and confirmed:** approved-only (the 7A gate — `pending|approved|rejected`); cash basis
(P1); Owner/Admin only with **no PM access** — consistent with money-rep **P9**, which keeps
_"budgeted, sell, and margin figures… Owner/Admin-only"_; the Active/Completed portfolio split with
separate subtotals rather than one blended figure; PDF export as the substitute for the deferred
view-only accountant role.

**Changed this session:** the profit basis for cost-plus/T&M (H1), per-category margin (H2), the
retainage row (H3), and the enforcement layer (H4).

---

## 2. The report after these rulings

Only the deltas. Everything else is unchanged from `7H-spec.md` §7H.3–§7H.4.

**Job headline:**

| Figure         | After this session                                                                                                                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contract value | Unchanged for **fixed-price** (7B, original + Σ signed CO deltas, bidirectional — a negative CO lowers it per E3). **Not shown as a profit basis** for cost-plus/T&M, where it is a labelled projection (P11) |
| Actual cost    | Unchanged — approved, cash basis, `getJobCostRollup()`                                                                                                                                                        |
| **Profit**     | **H1:** mid-job = **earned − actual**, labelled _"so far"_; at completion = **billed − actual**, final                                                                                                        |
| Cash pairing   | Unchanged, but per **E2** it consumes the shared derivation rather than re-deriving                                                                                                                           |
| Invoiced       | Read the **billed** figure, never the derived one (D3 / H-C5)                                                                                                                                                 |

**Cost table:** one row per category — labor / material / subcontractor / other — **plus a Retainage
held row (H3)** and a total. Columns gain **derived sell and margin per category (H2)** alongside
budget / committed / actual / remaining.

---

## 3. Decision record

### 3.1 Settled this session (Josh's rulings, 2026-07-31)

**H1 — Profit is earned − actual while the job runs, billed − actual once it completes.** Mid-job the
headline stays labelled _"so far"_, consistent with how fixed-price already behaves; at completion it
becomes what was actually charged minus what was actually spent.

> **This generalises to all three contract types, and should.** For **fixed-price**, contract value
> _is_ the earned figure — so the single rule "**earned − actual** while active, **billed − actual**
> at completion" covers fixed-price, cost-plus and T&M without a special case. Recommend restating
> §7H.2 #1 that way rather than keeping one formula for fixed-price and another for the rest.
>
> **Where earned comes from:** money-rep §6's earned-revenue derivation — cost-plus = Σ cost ×
> rate-in-force; T&M = hours × labor rate + non-labor cost × `tm_nonlabor_percent` — which **D0
> confirmed belongs to 7D**, not 7G. **7H consumes it; 7H must not re-implement it**, per its own
> never-re-derive discipline and E2's precedent.
>
> **[OPEN — H1a] The completion switch can move the number visibly.** If $1,000 was written off
> (D3a), profit _drops_ by $1,000 the moment the job is marked complete, because earned counted it and
> billed does not. That is the correct and honest behaviour — it is precisely where a write-off shows
> up — but it will look like a bug to whoever sees it. Recommend the report **explain the change**
> rather than silently switching bases.

**H2 — Per-category margin ships in v1.** Each category row gains derived sell and margin beside
budget / committed / actual / remaining, and **§7H.2 #3's "blocked on debt #7" claim is deleted, not
deferred** — money-rep P2 answered it.

> **[OPEN — H2a] Sell derivation is per-instrument, not per-category.** money-rep **P4** puts contract
> type on the **instrument**, and **a project may hold fixed-price, cost-plus and T&M instruments at
> once**; **P6** has signed COs writing their own budget lines, and the budget screen already groups by
> instrument. So a single "material" row can span instruments priced three different ways. Margin must
> be **derived per instrument, then aggregated into the category** — not computed as one blanket
> cost × markup. This is the main implementation risk H2 introduces.
>
> **[OPEN — H2b] T&M labor margin needs hours, not cost.** T&M labor sell is **hours ×
> `tm_labor_hourly`** — it is not derived from cost at all. So per-category margin on a T&M labor row
> needs the **M6 hours** data, not just the cost rollup, and inherits D4's unresolved billable-hours
> definition. **H2 therefore pulls M6 into 7H's dependency set**, which §7H.7 does not currently list.

**H3 — Retainage held gets its own row in the cost table**, so the categories plus retainage visibly
reconcile to the job total. No new data is required — `getJobCostRollup().payables` already surfaces
`retainageHeld`.

> **[OPEN — H3a] Two retainages point opposite ways; do not let the report blur them.**
> **Sub-held retainage** (7C) is _cost withheld_ — money you have not yet paid out — and belongs in
> this cost-table row. **Client-held retainage** (7D/7E) is _revenue withheld_ — money you have not
> yet been paid — and belongs in the headline/cash pairing, never in the cost table. Same word,
> opposite direction, adjacent on screen. Label both explicitly.

**H4 — Ship 7H with the FINANCIAL-RLS-FLOOR migration batched into its build.** The floor stops being
a floating pending item and becomes part of this module.

> **Worth knowing what this scopes in.** The migration is **not 7H-shaped** — `can_view_project()` has
> no role floor today, so the fix touches budget, job-cost and estimate figures platform-wide, not just
> the profitability screen. Landing it here closes the gap **everywhere at once**, which is a good
> outcome, but it means 7H's build carries a broad policy migration.
> Note also that it is now **unbatched from its former partner**: `context91` listed it as a batch
> candidate with 7C's compliance arm, but S92 resolved that the other way (option b, Owner/Admin-only
> upload, _"No RLS change required"_), leaving the floor without a home until now.
> And a wording consequence: §S's _"7H asserts no schema and likely owns no tables"_ stays true — it
> still owns none — but its **build** is no longer migration-free.

### 3.2 Still open

- **H1a** — explain the earned→billed switch at completion.
- **H2a** — per-instrument derivation then aggregation (the main H2 risk).
- **H2b** — M6 hours as a new 7H dependency for T&M labor margin.
- **H3a** — label the two retainages unambiguously.
- **[OPEN — H-d] Still-billable backlog.** D3a requires 7H to separate **written-off margin** from
  **still-billable backlog**. H1 handles the write-off side. The backlog — cost incurred but not yet
  billed, including held-back shortfalls — has no home in §7H.3 and is genuinely useful on cost-plus
  jobs, where "have I billed everything I've earned" is a real question. Recommend a headline figure;
  it is the natural companion to the earned-vs-billed pair H1 introduces.
- **Portfolio performance** — compute-on-read vs materialized aggregate; unchanged, still CC's call.
  Note H2 makes each row more expensive to compute, so this matters more than it did.

### 3.3 Verification

- **Earned-revenue derivation exists and is consumable** from 7D before 7H depends on it (H1).
- **Job status flag** readable from 5A/projects for the active/complete switch — already flagged in
  §7H.8, now load-bearing for H1.
- **`getJobCostRollup().payables.retainageHeld`** is per-job and matches what H3's row should show.
- **FINANCIAL-RLS-FLOOR scope** — enumerate every table and figure the floor must cover before
  scoping it into 7H (H4).

---

## 4. Dependency map

**7H reads:** 7A rollup (approved actual + committed remaining, cash basis, definitions owned by 7C's
`payables-shared.ts`) · 7B contract value (fixed-price only as a profit basis) · **7D** — billed
amounts **and the earned-revenue derivation** (H1), the D3a dispositions · 7E collected + the shared
cash pairing (E2) · 5E budget baseline · 5A job status · **M6 hours** (new, via H2b).

**Nothing waits on 7H.** It is the terminal read — which is why it can be built last and why H4's
migration is the only thing in it that affects anything else.

---

## 5. Amendments this prep obliges

1. **`7H-spec.md` §7H.2 #1 + §7H.3 + §7H.5** — restate profit as **earned − actual (so far) → billed −
   actual (final)**, unified across all three contract types (H1); name 7D as the earned-revenue
   source; explain the completion switch (H1a).
2. **`7H-spec.md` §7H.2 #3 + §7H.8** — **delete** the "blocked on debt #7" claim; add per-category
   margin with per-instrument derivation (H2, H2a); add M6 to §7H.7's dependency list (H2b).
3. **`7H-spec.md` §7H.3** — add the **Retainage held** row and disambiguate it from client-held
   retainage (H3, H3a).
4. **`7H-spec.md` §S + §7H.8** — record FINANCIAL-RLS-FLOOR as part of 7H's build, with its true
   platform-wide scope (H4).
5. **`7H-spec.md` §7H.7** — read the **billed** invoice figure, not the derived one (H-C5).
6. **`module7-architecture.md` §7.1 debt #7** — mark **resolved by derivation** (money-rep P2), so it
   stops being cited as a live blocker.

---

## 6. Recommended next step

7H needs no walk-through — it computes rather than captures, and Josh has ruled on every structural
question. Its build is gated on **7D and 7E existing**, so it stays last regardless.

The one thing to settle before building is **H2a**: per-category margin across a project holding
instruments of different contract types is the only genuinely hard computation in this module, and
getting the aggregation wrong produces numbers that look plausible and are wrong — the worst failure
mode for a profitability report. Worth a worked example on a real mixed-instrument job.
