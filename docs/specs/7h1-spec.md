# 7H1 — Job Profitability — Plan

> **Status:** Interview-backed plan (S92, extended and reconciled **[S96]**, verified against the repo
> with the financial floor resolved **[S97]**). Decisions in §7H.2 are Josh's calls **except where
> tagged** `[inherited]`. **7H owns no data and asserts no schema** — it is a read-only rollup of
> 7A–7E + the M5 budget. The data-wiring layer is left as `§S — TODO for Claude Code`.
>
> **Nature of 7H:** a report. Read-only. "Budget vs. actual vs. contract," and the number Bishop has
> never been able to close — "we made $X on the Miller job." Architecture §7.2:154 classes it
> _"No — a report"_ for the approved-trace requirement; §7H.10 supplies worked examples anyway,
> because §2a requires _"a worked example per variant"_ for any calculated output.
>
> **[S97] — what changed.** The **financial floor is defined** and its two source documents were in
> conflict — #10 now names exactly who sees what, and records the `CLAUDE.md` correction that ruling
> obliges (§7H.12). The **M6 dependency widened**: since cost-plus labor now bills at a flat
> per-man-hour rate (7D §6.1), labor margin needs hours on **every non-fixed instrument**, not just
> T&M. Two verification items are **closed against the repo**, and one stale conditional is removed.
>
> **[S96] — the prior revision.** Four rulings. The **headline formula did not work for cost-plus or
> T&M** jobs and is rebuilt (#1); **per-category margin was deferred against a blocker that no longer
> exists** and now ships (#3); **retainage gets its own row** because the category rows did not sum to
> the job total (§7H.3); and **FINANCIAL-RLS-FLOOR is batched into this build** (#10).
>
> **Provenance tags:** `[S96]` = ruled in the spec-reconciliation session · `[S97]` = ruled or verified
> in the trace-completion session · `[this session]` = Josh's call at S92 · `[inherited]` = carried
> from an existing doc/decision.
>
> **The `[inferred]` tag class was removed [S97]** — declared in the legend but never applied to any
> claim in this file. With 7F's and 7G's resolved, **the class is now retired across the 7-series.**
>
> **Session-numbering correction:** this file previously tagged its rulings `[S94]`. Per `context96.md`
> the spec work is S96's (S94's commits are 113c stage 1). Former `[S94]` tags read `[S96]`.

---

## §7H.1 — Scope & role

7H sits at the bottom of the Module 7 stack and **reads the modules above it** (architecture §7.3):
the 7A cost ledger (actual + committed), 7B contract value, 7D invoices, 7E payments, and the M5 (5E)
budget baseline. ~~Committed cost is a state on the 7A ledger~~ **[S91 — superseded by the 7C build:
committed lives on the expenses ledger as a DERIVED remaining balance — `GREATEST(amount − Σ payments, 0)`,
definitions owned by 7C (`payables-shared.ts`) — and 7H reads it from the 7A rollup surface
(`getJobCostRollup().payables`), never re-deriving. `state` is a settlement marker; money math never
reads it.]** It writes nothing and enforces nothing — it surfaces numbers other modules own.

**[S96]** That never-re-derive discipline now also governs **earned revenue** (owned by 7D §6/§7) and
**the cost pairing** (defined once, shared with 7E §6a). 7H consumes both; it implements neither.

It answers, per job: **what did this cost, what will it earn, are we on budget, and what did we make.**

> **[S97] One exception to "enforces nothing."** #10 batches the FINANCIAL-RLS-FLOOR migration into
> this build. 7H still owns no data and computes no figure it does not read — but it now **ships an
> access-control policy**, and that policy is platform-wide. See #10 and §7H.12.

---

## §7H.2 — Decisions

1.  **[S96 — REPLACES "profit = Contract − actual cost"] Profit is EARNED − actual while the job runs,
    BILLED − actual once it completes.** Mid-job the headline is labeled **"so far"**; at completion it
    becomes final.

    _Why this changed:_ the old formula assumed a contract value exists. `money-representation.md`
    **P11** makes `projected_value` on cost-plus/T&M instruments _"a projection, not an obligation — it
    **must NOT** feed variance or over/under-billing math,"_ and `contract-value.ts` excludes it from
    _"any variance/over-under figure this service feeds."_ So for cost-plus and T&M — both in v1 — the
    headline was undefined or built on a forbidden number.

    **The rule generalises across all three contract types, which is why it is stated once:**

    | Instrument type  | "Earned" means                                                                     | Source                  |
    | ---------------- | ---------------------------------------------------------------------------------- | ----------------------- |
    | Fixed price      | **Contract value** (original + Σ signed CO deltas, bidirectional)                  | 7B, `contract-value.ts` |
    | Cost-plus        | **[S97]** labor hours × flat rate + material/sub/other cost × each category's rate | **7D §6**               |
    | Time & materials | hours × labor rate-in-force + non-labor cost × its rate                            | **7D §7**               |

    > **[S97] The cost-plus row changed.** It previously read _"Σ cost × rate-in-force-when-incurred"_ —
    > a single blanket markup. 7D §6.1 now carries **four** rates: a flat per-man-hour labor rate plus
    > independent material, subcontractor and other markups. The consequence for 7H is in #3.

    **7H consumes 7D's earned-revenue derivation. It must not re-implement it.**

    > **[S96, reworded S97 per 7D §8 as amended] The completion switch can move the number
    > visibly.** _Superseded wording: "If $1,000 was written off (7D §8)… precisely where a
    > write-off surfaces."_ The write-off mechanic is retired; the analogue is a **discount line**.
    > If a $1,000 DISCOUNT was given (7D §8), profit **drops** by $1,000 the moment the job is
    > marked complete — earned counted the derived value, billed does not include the forgiven
    > amount. That is correct and is precisely where a discount surfaces, but it will read as a
    > bug. **The report must explain the change**, not switch bases silently.

2.  **Report structure.** `[this session]` A per-job **cost table** (categories × budget/committed/
    actual/remaining, **[S96]** plus sell and margin, plus a retainage row) under a **job headline**
    (earned-or-billed, actual cost, profit, cash pairing). Full layout in §7H.3.

3.  **[S96 — REVERSES the prior deferral] Per-category margin ships in v1.** The prior text deferred it
    because _"per-category profit needs a sell figure on the budget side, which the budget doesn't
    store (M7-architecture debt #7)."_ **money-representation.md answered debt #7 — by derivation, not
    by adding columns:** **P1** keeps `budgeted_amount` as cost, **P2** makes sell _"DERIVED… computed
    from cost + instrument pricing context at read time."_ Per-category margin has been computable
    since S93. **The "blocked" claim is deleted, not deferred.**

    > **[S96 — the main implementation risk] Sell derivation is PER INSTRUMENT, not per category.**
    > **P4** puts contract type on the instrument and **a project may hold fixed-price, cost-plus and
    > T&M instruments simultaneously**; **P6** has signed COs writing their own budget lines, and the
    > budget screen already groups by instrument. So a single "material" row can span instruments
    > priced three different ways. **Margin must be derived per instrument, then aggregated into the
    > category** — never computed as one blanket cost × markup. Getting this wrong produces numbers
    > that look plausible and are wrong, the worst failure mode a profitability report has.
    >
    > **[S97 — the M6 dependency is WIDER than previously stated.] Labor margin needs HOURS on every
    > non-fixed instrument, not just T&M.** The prior text said only _"T&M labor sell is hours ×
    > `tm_labor_hourly` — not derived from cost at all."_ That is now also true of **cost-plus**: 7D
    > §6.1 bills the company's own crew at a **flat per-man-hour rate** on cost-plus jobs too. So:
    >
    > | Instrument    | Labor margin basis                    |
    > | ------------- | ------------------------------------- |
    > | Fixed price   | cost + the estimate's pricing context |
    > | **Cost-plus** | **hours × flat rate — needs M6**      |
    > | **T&M**       | **hours × flat rate — needs M6**      |
    >
    > Both inherit 7D §7.2's billable-hours definition: **approved hours, summed per person per day,
    > rounded UP to the HALF hour.** **This makes M6 a dependency of every non-fixed job's labor row**,
    > which materially raises §7H.7's exposure to an unmerged module.

4.  **Portfolio roll-up in v1.** `[this session]` Besides the per-job report, a company-wide screen
    lists every job with its profit and a company total (§7H.4).

5.  **Home.** `[this session]` A **Profitability tab under each job's financials** (active _and_
    completed jobs) plus the company-wide screen.

6.  **Access — Owner/Admin only.** `[this session]` **PM does not see the profitability report** —
    margin is owner-level. Consistent with money-rep **P9**: _"Budgeted, sell, and margin figures remain
    Owner/Admin-only."_ The cut view-only bookkeeper/accountant role stays deferred to `TECH_DEBT`.

7.  **Approved-only.** `[inherited]` (7A gate, P5) The report counts only **approved** actual cost;
    pending/rejected ledger rows are excluded until an owner/admin approves them.

8.  **Cash basis.** `[inherited]` (P1) "Actual" = money that left the account. Committed vs. actual is
    the core cost axis. **[S91]** Actual is **NET of retainage** per the gross/net correction.

9.  **Export to PDF.** `[this session]` The per-job and portfolio reports export to PDF (Owner/Admin) —
    so an outside accountant can be handed the numbers while the view-only role stays deferred. Reuses
    existing PDF tooling (`@react-pdf/renderer` / `pdf-lib`).

10. **[S96; SCOPE DEFINED S97] FINANCIAL-RLS-FLOOR is batched into 7H's build.**

        The floor is enforced **in the UI only** today. **[S97 — verified]** `can_view_project()`
        (`20260704211000:248`) is a pure **visibility** predicate — `owner/admin OR

    is*assigned_to_project()` — with **no financial dimension whatsoever**. An assigned PM passes it
    and can then read every column on any child table gated by it, budget figures included. money-rep
    **P9** states the gap outright: *"Budgeted, sell, and margin figures remain Owner/Admin-only —
    **UI-gated only** until the `FINANCIAL-RLS-FLOOR` migration lands."\_ 7H is the platform's most
    margin-dense screen, so the migration ships **with** it.

        **[S97] What the floor enforces — RULED, because its two source documents disagreed.**

        | Role                | Sees                        |
        | ------------------- | --------------------------- |
        | **Owner / Admin**   | Everything                  |
        | **Project Manager** | **Actual + committed** cost |
        | **Foreman**         | **Actual + committed** cost |
        | **Crew**            | **Actual** cost only        |

        **Budgeted, sell, margin, contract value and CO dollar amounts remain Owner/Admin-only** for
        everyone below.

        > **[S97] The conflict this resolves — and the correction it obliges.** `CLAUDE.md`'s Financial
        > Visibility Floor says _"Project Manager, Foreman, and Crew see **ACTUAL COST ONLY**"_ and
        > explicitly lists **committed amounts** among the figures gated from PM. money-rep **P9** says the
        > opposite — _"PM sees **actual AND committed** (widens today's actual-only floor)"_ — and knows it
        > is a revision. Neither document acknowledges the other, and `CLAUDE.md` was never updated.
        >
        > **Ruled [S97]: P9's widening stands, and extends to foreman.** Crew stays at actual-only.
        > **`CLAUDE.md` must be corrected in the same pass** — see §7H.12. A migration written from the
        > un-corrected `CLAUDE.md` would gate committed cost from the two roles that are supposed to see
        > it, and nothing in the specs would catch it.

        > **What this scopes in.** The migration is **not 7H-shaped** — the fix touches budget, job-cost
        > and estimate figures **platform-wide**. Landing it here closes the gap everywhere at once, which
        > is the point, but 7H's build carries a broad policy migration. Note it had also lost its former
        > batch partner: `context91` paired it with 7C's compliance arm, but S92 resolved that the other
        > way (Owner/Admin-only upload, _"No RLS change required"_), leaving the floor homeless until now.
        > **§S's "7H asserts no schema and owns no tables" stays true — it still owns none — but its
        > BUILD is no longer migration-free.**

---

## §7H.3 — The per-job report

**Job headline (top):**

- **Earned** — **[S96]** contract value for fixed-price instruments; 7D's earned-revenue derivation
  for cost-plus and T&M (#1). On a mixed-instrument project, the sum across instruments.
- **Billed** — **[S96]** the **billed** amount from 7D, never the derived one (7D §8). Same rule 7G
  follows.
- **Actual cost** — approved, cash basis, NET of retainage, from the 7A rollup
  (`getJobCostRollup()` = receipts + net bill payments).
- **[S96, REDEFINED S97 — Josh-authorized] Backlog** — **Earned − Billed − discounts**: work earned
  but not yet invoiced. _Superseded definition: "**Earned − Billed**… including any shortfall held
  back under 7D §8."_ 7D §8's hold-back is retired: the unbilled position is the derived value of
  **approved costs not yet selected for billing** (7D §6.2), and a **discount is forgiveness** — it
  must never sit in backlog as billable, so it is subtracted. Answers _"have I billed everything
  I've earned?"_ On a fixed-price job this is contract − billed − discounts; on cost-plus and T&M
  it is the live unbilled position.
  **[S97 — R6 note]** A deposit on a cost-plus/T&M instrument (7D §3a) **bills ahead of earning by
  design**, so Backlog may run **negative** early on such jobs — the deposit invoice is billed
  before any work is earned, and the gap unwinds as the credit balance draws down.
- **Profit** — **[S96]** **Earned − Actual** while active, labeled **"so far"**; **Billed − Actual**
  once complete, labeled final. The switch is explained in-report (#1).
- **Cash pairing** — "collected $X, spent $Y" — **[S96]** the **shared** derivation 7E §6a also
  surfaces at payment time. One definition, two surfaces; 7H does not re-derive it.

**Cost table (below):** one row per category — **labor / material / subcontractor / other** —
**[S96]** plus a **Retainage held** row, plus a total. Columns:

- **Budget** — the M5 (5E) forecast cost for that category.
- **Committed** — derived remaining on the ledger's payable rows [S91: PO commitments, sub
  schedule stages, manual bills, retainage accruals; `GREATEST(amount − Σ payments, 0)`, live-split
  from the first payment]; money gone from the job's view before it is fully paid.
- **Actual** — approved cash cost to date (7A).
- **Remaining** — Budget − Actual − Committed. The honesty check: flags (e.g. red) when a category
  runs over.
- **[S96] Sell** — derived at read from cost + instrument pricing context (P2), **per instrument then
  aggregated** (#3). **[S97]** On a cost-plus or T&M instrument the **labor** row's sell is hours ×
  flat rate, not cost-derived (#3).
- **[S96] Margin** — Sell − Actual for that category.

**[S96] The Retainage held row exists because the categories did not add up.** money-rep §4.5:
retainage accrual rows are **line-less in v1** — _"per-line totals exclude retainage held/released;
job-level payables numbers carry it"_ (`money-representation.md:447–450`, verified [S97]). Without its
own row, the four categories silently fail to reconcile to the job total by exactly the retained
amount. No new data is required — `getJobCostRollup().payables` already surfaces `retainageHeld`.

> **[S97 — state the figure precisely.]** `retainageHeld` (`expenses.ts:148`, computed `:268/:274`) is
> the **remaining unpaid** retainage — the sum of `committedRemaining` across rows flagged
> `is_retainage` — not gross accrued to date. That is the correct number for the reconciliation row,
> because the table reconciles what is still owed against the job total. Label it so nobody reads it
> as lifetime retainage.

> **[S96 — label these two unambiguously; they point opposite ways.]**
> **Sub-held retainage** (7C) is **cost withheld** — money you have not yet paid out — and is the row
> in this cost table. **Client-held retainage** (7D §5 / 7E §4) is **revenue withheld** — money you
> have not yet been paid — and belongs in the headline / cash pairing, **never** in the cost table.
> Same word, opposite direction, adjacent on screen.

---

## §7H.4 — The company-wide roll-up

One screen, Owner/Admin only:

- A row per job: job name, **[S96]** earned-or-billed, actual cost, **profit**, and its state.
- **Split into two sections — Active and Completed — each subtotaled separately.** Active-job profit is
  "so far" and overstates until the job is done; completed-job profit is final. Keeping them apart
  stops the company figure from blending an overstated number with a final one.
- The **company total is presented as those two subtotals** (final + so-far), not one merged number.
- Same definitions and approved-only rule as the per-job report; it is the per-job numbers gathered,
  not a new calculation.

> **[S96; sharpened S97]** #3 makes each row more expensive to compute — per-instrument derivation,
> **plus M6 hours for the labor row on every non-fixed instrument**. The compute-on-read vs.
> materialized-aggregate question in §7H.8 therefore matters more than it did, and a portfolio of
> mostly cost-plus/T&M jobs is the expensive case.

---

## §7H.5 — Definitions & the in-progress honesty problem

- **Profit** — **[S96]** Earned − approved actual cost while active; Billed − actual at completion
  (#1). Clean at completion; mid-job it overstates, because work is booked ahead of all its cost.
  The report therefore:
  - **labels the profit "so far"** until job completion (job status read from 5A/projects),
  - always shows **Committed** and **Remaining** beside it, so an open commitment or an over-budget
    category is visible rather than hidden, and
  - **[S96] explains the earned→billed switch** at completion rather than moving the number silently.
- **Committed vs. actual** — a PO issued or a sub quote signed is committed money before any bill
  arrives; ignoring it makes "remaining" look rosier than it is. Both are shown.
- **Cash pairing** — collected − spent, the realized view (**[S96]** shared with 7E §6a). Distinct
  from the earned/booked view. Both appear; the headline is the profit figure (#1).
- **[S96, reworded S97] Earned ≠ billed ≠ collected.** Three different numbers, deliberately: earned
  is what the work has entitled you to, billed is what you actually charged (after any discount
  lines or upward override, 7D §8 as amended — _superseded: "after any override"_), collected is
  what has landed. The gaps between them are where **discounts** (_superseded: "write-offs"_) and
  unbilled backlog live.

---

## §7H.6 — Access

Owner/Admin only, everywhere 7H appears (per-job tab and company-wide screen). PM has no access.
Confirm the exact role gate against the live role hierarchy at build. The view-only financial role is
**not** in v1 (`TECH_DEBT`, deferred at architecture time).

**[S96]** Enforcement is UI-gated today; **#10 batches FINANCIAL-RLS-FLOOR into this build** so the
floor is enforced at the database, not just the interface.

> **[S97] Do not confuse the two gates.** **7H's own screens are Owner/Admin only** — that is this
> section. **The FINANCIAL-RLS-FLOOR migration 7H ships** governs figures _elsewhere in the platform_,
> where PM and foreman legitimately see actual and committed cost (#10). One is a screen gate; the
> other is a platform-wide column-level floor. 7H happens to carry both.

---

## §7H.7 — Dependencies (what 7H reads)

**[S91 status: 7A, 7B, 7C, the M5 budget, and projects are BUILT and readable; 7D and 7E are not.]**
_(7C is built but per `context91` §10 has **never been click-tested**, and `20260729010000` is
rebuild-test only.)_ Wiring is §S.

- **7A** — per-job, per-category cost rollup: approved **actual + committed**, cash basis.
  [S91: `getJobCostRollup()` ships both sides — actual = receipts + net payments, plus a `payables`
  block (committedRemaining / **retainageHeld** / awaitingPaperCount / stillOwed). Committed rows are
  written by 7C flows; derivation helpers live in `payables-shared.ts`; 7H consumes the rollup, never
  re-derives.] **[S97] The `payables` block is verified present** — `expenses.ts:143–150`.
- **7B** — contract value (original + Σ signed CO deltas, **derived at read**, bidirectional).
  **[S96]** Used as "earned" for **fixed-price instruments only** (#1).
- **7D** — **[S96]** **billed** amounts (never derived); **the earned-revenue derivation** for
  cost-plus and T&M; **discount lines** (7D §8 as amended — _superseded: "the write-off /
  hold-back dispositions"_). **[S97]** And the **four cost-plus rates** plus the flat labor rate
  that #3's margin derivation depends on (7D §6.1).
- **7E** — collected amounts + **[S96]** the shared cash-pairing derivation (7E §6a).
- **5E (M5 budget)** — the forecast cost baseline, per category.
- **5A / projects** — job status (active vs. complete) for the "so far" vs. final label — **[S96]** now
  load-bearing, since it drives #1's basis switch.
- **[S96; widened S97] Module 6 — time entries.** Required for the **labor margin on every non-fixed
  instrument** — cost-plus and T&M both bill labor at a flat per-man-hour rate (#3) — inheriting 7D
  §7.2's billable-hours rule (approved hours, summed per person per day, rounded up to the half hour).
  **UNVERIFIED and unmerged. [S97] This is now 7H's largest upstream risk**, because it is no longer
  confined to T&M jobs.

---

## §7H.8 — Open / verify items

- ~~**M7-architecture debt #7 blocks per-category profit.**~~ **[S96 — CLOSED.** money-rep **P2**
  resolved debt #7 by deriving sell at read. Per-category margin ships (#3). **Amend
  `module7-architecture.md` §7.1 to mark debt #7 resolved-by-derivation** — see §7H.12.]
- **Rollup semantics must match 7A.** [S91: the live definitions EXIST — approved / committed /
  actual per `payables-shared.ts` + `getJobCostRollup()`. 7H must consume them, not re-derive.]
- **In-progress label** depends on a readable job-status/completion flag (5A/projects) — confirm; #1
  now depends on it.
- **Cash-pairing source** — confirm the shared derivation and its "collected" basis against 7E §6a.
  **[S97]** Note 7E §6a restates `getJobCostRollup()`'s "spent" side precisely: receipts contribute
  their full approved amount, payable rows contribute **net payments**. 7H must use the same reading.
- **Portfolio performance** — compute-on-read vs. materialized aggregate; CC's call, and weightier now
  (§7H.4).
- **[S96] Earned-revenue derivation must exist and be consumable from 7D** before #1 can be built.
- ~~**`getJobCostRollup().payables.retainageHeld` — confirm it is per-job.**~~ **[S97 — CLOSED.**
  Verified: declared `expenses.ts:148`, computed `:268/:274` as Σ `committedRemaining` over
  `is_retainage` rows, and the function is per-`projectId`. Semantic recorded in §7H.3.]
- **[S96; narrowed S97] FINANCIAL-RLS-FLOOR scope** — the **role scope is now ruled** (#10). What
  remains for CC is enumerating **every table and column** the floor must cover platform-wide before
  writing the migration.
- **[S96 — RESOLVED; reworked S97 per 7D §8 as amended] Still-billable backlog is a headline
  figure.** _Superseded framing: "7D §8 splits a shortfall into **written-off** and **held-back**…
  The **held-back backlog**… **Backlog = Earned − Billed.**"_ The disposition pair is retired: a
  **discount** is forgiveness (#1 handles it — it surfaces as the earned→billed drop at completion
  and is never billable), and the still-billable backlog is the derived value of **approved costs
  not yet selected for billing** (7D §6.2), sitting in the headline beside Earned and Billed.
  **Backlog = Earned − Billed − discounts** (Josh-authorized redefinition, §7H.3).

---

## §7H.9 — What 7H does NOT do

Recorded so it is not built by accident:

- **No over/under-billing (WIP) schedule** in v1. money-rep P11 references _"over/under-billing math"_
  as something `projected_value` must not feed; no such report exists yet and none is specced here.
- **No per-category profit on a fixed-price job before its estimate markups are readable** — the sell
  derivation needs the instrument's pricing context (#3).
- **No writes, anywhere.** 7H surfaces numbers other modules own. **[S96]** Its only build-time
  artifact is #10's policy migration, which enforces access rather than creating data.

---

## §7H.10 — Worked examples — **[S96; corrected S97]**

> §2a requires _"a worked example per variant"_ for any calculated output. 7H's profit figure has
> three bases and a switch. **PROPOSED**; trace A's cash-pairing values are **real** (architecture
> §7.11). Per §2a step 3, Josh corrects until it matches reality.

### A — Fixed-price job, mid-flight _(cash pairing real, §7.11)_

```
Instrument: fixed-price. Contract value $73,000 (7B, incl. signed COs).
Approved actual cost to date $47,000. Collected $60,000.

EARNED   = $73,000  (contract value — fixed-price)
PROFIT   = $73,000 − $47,000 = $26,000  ← labeled "SO FAR" (job active)
PAIRING  = "Collected $60,000, spent $47,000 — +$13,000 so far."   (real, §7.11)

Both appear. The pairing is the REALIZED view; profit is the EARNED view. They
answer different questions and neither replaces the other. (§7H.5)
```

### B — Cost-plus job, mid-flight _(illustrative)_

```
Instrument: cost-plus. Approved actual cost to date $40,000 (materials/subs only —
no crew labor on this job, so the flat labor rate does not engage). Category
markups all 20%. Of that cost, $34,000 has been billed; $6,000 sits unbilled.

EARNED   = $40,000 × 1.20 = $48,000   ← 7D's derivation, NOT re-implemented here
BILLED   = $34,000 × 1.20 = $40,800
PROFIT   = $48,000 − $40,000 = $8,000  ← "SO FAR", earned basis (job active)
BACKLOG  = $48,000 − $40,800 = $7,200 still billable

Contract value is NOT used. The instrument's projected_value is a labeled
projection and P11 forbids it feeding this math. (#1)
```

### C — Completion, with a discount _(illustrative — shows the switch; [S97] reworded from "write-off" per 7D §8 as amended)_

```
Same cost-plus job completes. Final totals:
  actual cost $52,000 · earned $62,400 · billed $61,400
  (a $1,000 DISCOUNT LINE on the final invoice, 7D §8 — forgiveness, never
  rebilled; the client saw it as a negative line)

WHILE ACTIVE   profit = $62,400 − $52,000 = $10,400   "so far"
AT COMPLETION  profit = $61,400 − $52,000 =  $9,400   final

The number DROPS $1,000 the moment the job is marked complete. That is correct —
it is exactly where the discount surfaces — and the report EXPLAINS it rather
than switching bases silently. (#1)
```

### D — Mixed-instrument cost table _(illustrative — the #3 risk, made concrete)_

```
One project, three instruments:
  PRJ-042    original contract    fixed-price
  CO-042-01  bathroom addition    cost-plus (labor $100/h flat; material 20%,
                                  sub 20%, other 20%)
  CO-042-02  punch/repairs        T&M ($100/h labor, 20% non-labor)

The "material" category row spans ALL THREE. Its sell CANNOT be one blanket
markup:
   material on PRJ-042    → estimate row markups            (P2 / estimate-totals)
   material on CO-042-01  → cost × 1.20  (cost-plus MATERIAL rate — one of four)
   material on CO-042-02  → cost × 1.20  (tm_nonlabor_percent)
   → derive per instrument, THEN aggregate into the category row.  (#3)

[S97] And the "labor" row is not cost-based on EITHER non-fixed instrument:
   labor on CO-042-01  → billable hours × $100   (cost-plus flat labor rate)
   labor on CO-042-02  → billable hours × $100   (tm_labor_hourly)
   Both need MODULE 6 HOURS, not the cost rollup, and both inherit 7D §7.2's
   HALF-hour round-up, summed per person per day.  (#3, §7H.7)

   Only the fixed-price instrument's labor row derives from cost.
```

### E — Retainage reconciliation _(illustrative)_

```
Category rows:  labor $18,000 · material $12,400 · subcontractor $14,900 · other $1,700
                                                          category subtotal = $47,000
Retainage held (from subs, 7C — remaining unpaid)                         = $   950
                                                          JOB TOTAL       = $47,950

WITHOUT the retainage row the four categories silently miss the job total by
$950 — retainage accrual rows are LINE-LESS (money-rep §4.5), so they reach no
budget line. The row exists to make the table add up. (§7H.3)

Client-held retainage does NOT appear here — that is revenue withheld and lives
in the headline/pairing. Opposite direction, different number. (§7H.3)
```

---

## §7H.11 — Provenance

- Decisions §7H.2 #2, #4–#9: interviewed and confirmed by Josh at S92.
- **#1, #3, #10 and §7H.3's retainage row: Josh's rulings [S96]**, reconciling 7H against
  `money-representation.md` (P1/P2/P4/P6/P9/P11, §4.5) and the 7D/7E rulings.
- **[S97] rulings:** the **financial floor's role scope** — PM and foreman see actual + committed,
  crew actual only, everything else Owner/Admin (#10) — resolving a direct conflict between
  `CLAUDE.md` and money-rep P9.
- **[S97] corrections:** the cost-plus earned row and #3's M6 dependency widened to cover labor on
  **every** non-fixed instrument (7D §6.1's four rates); trace D rebuilt accordingly; §7H.10-B's
  stale _"(S94-a, if adopted)"_ conditional removed — backlog was ruled in.
- Report structure §7H.3–§7H.4: Claude-proposed, Josh-approved (PM-exclusion and the company-wide
  roll-up are Josh's explicit calls).
- §7H.10: **PROPOSED**; trace A's pairing values are founder-sourced (architecture §7.11), the rest
  illustrative and awaiting correction per §2a step 3.
- **Repo-verified [S97]:** `getJobCostRollup().payables.retainageHeld` (`expenses.ts:143–150,
268, 274`) · `can_view_project()` has no financial dimension (`20260704211000:248–262`) ·
  money-rep P9 (`:102–105`) and §4.5 line-less retainage (`:447–450`) · architecture §7.2:154
  classes 7H _"No — a report."_
- Upstream schemas and the FrameFocus data layer: **not** otherwise verified — deferred to CC by
  design (§S).

---

## §7H.12 — Amendments this spec obliges — **[S97, NEW]**

> 7H is a leaf and normally obliges nothing. #10 changes that: it ships a platform-wide policy, and
> two documents must agree with it before the migration is written.

**A.1 — `CLAUDE.md`, Financial Visibility Floor — REQUIRED before the migration.** It currently reads
_"Project Manager, Foreman, and Crew see **ACTUAL COST ONLY**"_ and lists **committed amounts** among
the figures gated from PM/foreman/crew. **Per #10 that is superseded:** PM and foreman see actual
**and** committed; crew stays actual-only. Budgeted, sell, margin, contract value and CO dollar
amounts remain Owner/Admin-only. Amend the floor section and its "Gated from PM/foreman/crew" list.

> This is the single most important amendment in the 7-series, because it is the one a builder would
> follow into a wrong RLS policy. `CLAUDE.md` is described as _"the single source of truth for all
> development conversations"_ — a migration written from it as it stands would gate committed cost
> from the two roles that are supposed to see it.

**A.2 — `module7-architecture.md` §7.1, debt #7 — mark RESOLVED by derivation.** money-rep **P2**
resolved it by deriving sell at read; no sell column was added. Per-category margin ships in #3. Debt
#7 must stop being cited as a live blocker.

**A.3 — `module7-architecture.md` §7.3, the dependency map.** Unchanged for 7H itself, but noted here
because 7H sits at the bottom of the diagram that 7G §7G.5 and 7E §A.1 both ask to have redrawn.

---

## §S — Data-wiring layer — TODO for Claude Code

**7H asserts no schema and owns no tables** — it is read-and-compute over the modules above. CC wires
the reads once 7A–7E + 5E exist and their real field names can be read. This section states only
_what is read and derived_, not table or column names.

- **Read** (by concept): per-job/per-category approved-actual + committed cost + **retainage held**
  (7A/7C); category budget (5E); contract value (7B); **billed amounts and the earned-revenue
  derivation** (7D); collected + the shared pairing (7E); job status (5A); **[S96; widened S97]** time
  entries (M6) — for the **labor row on every non-fixed instrument**, not only T&M.
- **Derive:** Remaining = Budget − Actual − Committed. **[S96]** Profit = **Earned − Actual** (active)
  → **Billed − Actual** (complete). **[S96]** Per-category Sell and Margin — **per instrument, then
  aggregated** (#3), with **[S97]** the labor row on cost-plus and T&M instruments derived from
  **hours × flat rate**, never from cost. Cash pairing = Collected − Spent — **consumed from the
  shared definition, not re-derived** (7E §6a).
- **Approved-only:** exclude non-approved 7A rows from every figure (P5).
- **[S96]** Consume, never re-implement: 7D's earned-revenue derivation, 7C's committed/actual
  definitions, 7E's pairing.
- CC decides whether the **portfolio roll-up** computes on read or needs a materialized/cached
  aggregate — do not assume; measure against the live rollup, now heavier per #3.
- **Export** (per-job + portfolio → PDF) reuses existing PDF tooling; no new storage.
- **[S96; scoped S97] Build artifact:** the **FINANCIAL-RLS-FLOOR** migration (#10). Its **role scope
  is ruled** — PM + foreman see actual and committed; crew actual only; budgeted/sell/margin/contract
  Owner/Admin only. What CC must still do is **enumerate every table and column** the floor covers
  platform-wide, and **land `CLAUDE.md`'s correction (§7H.12 A.1) in the same commit**, so the
  authoritative doc and the policy agree.
