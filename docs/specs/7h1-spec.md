# 7H — Job Profitability — Plan

> **Status:** Interview-backed plan (S92, extended and reconciled **[S94]**). Decisions in §7H.2 are
> Josh's calls **except where tagged** `[inherited]` or `[inferred]`. **7H owns no data and asserts no
> schema** — it is a read-only rollup of 7A–7E + the M5 budget. The data-wiring layer is left as
> `§S — TODO for Claude Code`.
>
> **Nature of 7H:** a report. Read-only. "Budget vs. actual vs. contract," and the number Bishop has
> never been able to close — "we made $X on the Miller job." Architecture §7.2 classes it _"No"_ for
> the approved-trace requirement; §7H.10 supplies worked examples anyway, because §2a requires _"a
> worked example per variant"_ for any calculated output and 7H now has three.
>
> **[S94] — what changed.** Four rulings. The **headline formula did not work for cost-plus or T&M**
> jobs and is rebuilt (#1); **per-category margin was deferred against a blocker that no longer
> exists** and now ships (#3); **retainage gets its own row** because the category rows did not sum to
> the job total (§7H.3); and **FINANCIAL-RLS-FLOOR is batched into this build** (#10).
>
> **Provenance tags:** `[S94]` = Josh's ruling this session · `[this session]` = Josh's call at S92 ·
> `[inherited]` = carried from an existing doc/decision · `[inferred]` = Claude's inference —
> **confirm before treating as fixed.**

---

## §7H.1 — Scope & role

7H sits at the bottom of the Module 7 stack and **reads the modules above it** (architecture §7.3):
the 7A cost ledger (actual + committed), 7B contract value, 7D invoices, 7E payments, and the M5 (5E)
budget baseline. ~~Committed cost is a state on the 7A ledger~~ **[S91 — superseded by the 7C build:
committed lives on the expenses ledger as a DERIVED remaining balance — `GREATEST(amount − Σ payments, 0)`,
definitions owned by 7C (`payables-shared.ts`) — and 7H reads it from the 7A rollup surface
(`getJobCostRollup().payables`), never re-deriving. `state` is a settlement marker; money math never
reads it.]** It writes nothing and enforces nothing — it surfaces numbers other modules own.

**[S94]** That never-re-derive discipline now also governs **earned revenue** (owned by 7D §6/§7) and
**the cost pairing** (defined once, shared with 7E §6a). 7H consumes both; it implements neither.

It answers, per job: **what did this cost, what will it earn, are we on budget, and what did we make.**

---

## §7H.2 — Decisions

1. **[S94 — REPLACES "profit = Contract − actual cost"] Profit is EARNED − actual while the job runs,
   BILLED − actual once it completes.** Mid-job the headline is labeled **"so far"**; at completion it
   becomes final.

   _Why this changed:_ the old formula assumed a contract value exists. `money-representation.md`
   **P11** makes `projected_value` on cost-plus/T&M instruments _"a projection, not an obligation — it
   **must NOT** feed variance or over/under-billing math,"_ and `contract-value.ts` excludes it from
   _"any variance/over-under figure this service feeds."_ So for cost-plus and T&M — both in v1 — the
   headline was undefined or built on a forbidden number.

   **The rule generalises across all three contract types, which is why it is stated once:**

   | Instrument type  | "Earned" means                                                    | Source                  |
   | ---------------- | ----------------------------------------------------------------- | ----------------------- |
   | Fixed price      | **Contract value** (original + Σ signed CO deltas, bidirectional) | 7B, `contract-value.ts` |
   | Cost-plus        | Σ cost × rate-in-force-when-incurred                              | **7D §6**               |
   | Time & materials | hours × labor rate-in-force + non-labor cost × its rate           | **7D §7**               |

   **7H consumes 7D's earned-revenue derivation. It must not re-implement it.**

   > **[S94] The completion switch can move the number visibly.** If $1,000 was written off (7D §8),
   > profit **drops** by $1,000 the moment the job is marked complete — earned counted it, billed does
   > not. That is correct and is precisely where a write-off surfaces, but it will read as a bug.
   > **The report must explain the change**, not switch bases silently.

2. **Report structure.** `[this session]` A per-job **cost table** (categories × budget/committed/
   actual/remaining, **[S94]** plus sell and margin, plus a retainage row) under a **job headline**
   (earned-or-billed, actual cost, profit, cash pairing). Full layout in §7H.3.

3. **[S94 — REVERSES the prior deferral] Per-category margin ships in v1.** The prior text deferred it
   because _"per-category profit needs a sell figure on the budget side, which the budget doesn't
   store (M7-architecture debt #7)."_ **money-representation.md answered debt #7 — by derivation, not
   by adding columns:** **P1** keeps `budgeted_amount` as cost, **P2** makes sell _"DERIVED… computed
   from cost + instrument pricing context at read time."_ Per-category margin has been computable
   since S93. **The "blocked" claim is deleted, not deferred.**

   > **[S94 — the main implementation risk] Sell derivation is PER INSTRUMENT, not per category.**
   > **P4** puts contract type on the instrument and **a project may hold fixed-price, cost-plus and
   > T&M instruments simultaneously**; **P6** has signed COs writing their own budget lines, and the
   > budget screen already groups by instrument. So a single "material" row can span instruments
   > priced three different ways. **Margin must be derived per instrument, then aggregated into the
   > category** — never computed as one blanket cost × markup. Getting this wrong produces numbers
   > that look plausible and are wrong, the worst failure mode a profitability report has.
   >
   > **[S94] T&M labor margin needs HOURS, not cost.** T&M labor sell is **hours × `tm_labor_hourly`**
   > — not derived from cost at all. So that row needs **Module 6 hours** and inherits 7D §7's
   > billable-hours definition (approved hours, rounded up to the quarter hour). **This adds M6 to
   > 7H's dependency set**, which §7H.7 previously did not list.

4. **Portfolio roll-up in v1.** `[this session]` Besides the per-job report, a company-wide screen
   lists every job with its profit and a company total (§7H.4).

5. **Home.** `[this session]` A **Profitability tab under each job's financials** (active _and_
   completed jobs) plus the company-wide screen.

6. **Access — Owner/Admin only.** `[this session]` **PM does not see the profitability report** —
   margin is owner-level. Consistent with money-rep **P9**: _"Budgeted, sell, and margin figures remain
   Owner/Admin-only."_ The cut view-only bookkeeper/accountant role stays deferred to `TECH_DEBT`.

7. **Approved-only.** `[inherited]` (7A gate, P5) The report counts only **approved** actual cost;
   pending/rejected ledger rows are excluded until an owner/admin approves them.

8. **Cash basis.** `[inherited]` (P1) "Actual" = money that left the account. Committed vs. actual is
   the core cost axis. **[S91]** Actual is **NET of retainage** per the gross/net correction.

9. **Export to PDF.** `[this session]` The per-job and portfolio reports export to PDF (Owner/Admin) —
   so an outside accountant can be handed the numbers while the view-only role stays deferred. Reuses
   existing PDF tooling (`@react-pdf/renderer` / `pdf-lib`).

10. **[S94] FINANCIAL-RLS-FLOOR is batched into 7H's build.** The financial floor is currently enforced
    **in the UI only** — `can_view_project()` has no role floor, so a gated user can still read the
    figures via a direct API/query (`CLAUDE.md`; ui-01 §10–11). 7H is the platform's most margin-dense
    screen, so the migration ships **with** it rather than remaining a floating pending item.
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

- **Earned** — **[S94]** contract value for fixed-price instruments; 7D's earned-revenue derivation
  for cost-plus and T&M (#1). On a mixed-instrument project, the sum across instruments.
- **Billed** — **[S94]** the **billed** amount from 7D, never the derived one (7D §8). Same rule 7G
  follows.
- **Actual cost** — approved, cash basis, NET of retainage, from the 7A rollup
  (`getJobCostRollup()` = receipts + net bill payments).
- **[S94] Backlog** — **Earned − Billed**: work earned but not yet invoiced, including any shortfall
  held back under 7D §8. Answers _"have I billed everything I've earned?"_ On a fixed-price job this
  is contract-minus-billed; on cost-plus and T&M it is the live unbilled position.
- **Profit** — **[S94]** **Earned − Actual** while active, labeled **"so far"**; **Billed − Actual**
  once complete, labeled final. The switch is explained in-report (#1).
- **Cash pairing** — "collected $X, spent $Y" — **[S94]** the **shared** derivation 7E §6a also
  surfaces at payment time. One definition, two surfaces; 7H does not re-derive it.

**Cost table (below):** one row per category — **labor / material / subcontractor / other** —
**[S94]** plus a **Retainage held** row, plus a total. Columns:

- **Budget** — the M5 (5E) forecast cost for that category.
- **Committed** — derived remaining on the ledger's payable rows [S91: PO commitments, sub
  schedule stages, manual bills, retainage accruals; `GREATEST(amount − Σ payments, 0)`, live-split
  from the first payment]; money gone from the job's view before it is fully paid.
- **Actual** — approved cash cost to date (7A).
- **Remaining** — Budget − Actual − Committed. The honesty check: flags (e.g. red) when a category
  runs over.
- **[S94] Sell** — derived at read from cost + instrument pricing context (P2), **per instrument then
  aggregated** (#3).
- **[S94] Margin** — Sell − Actual for that category.

**[S94] The Retainage held row exists because the categories did not add up.** money-rep §4.5:
retainage accrual rows are **line-less in v1** — _"per-line totals exclude retainage held/released;
job-level payables numbers carry it."_ Without its own row, the four categories silently fail to
reconcile to the job total by exactly the retained amount. No new data is required —
`getJobCostRollup().payables` already surfaces `retainageHeld`.

> **[S94 — label these two unambiguously; they point opposite ways.]**
> **Sub-held retainage** (7C) is **cost withheld** — money you have not yet paid out — and is the row
> in this cost table. **Client-held retainage** (7D §5 / 7E §4) is **revenue withheld** — money you
> have not yet been paid — and belongs in the headline / cash pairing, **never** in the cost table.
> Same word, opposite direction, adjacent on screen.

---

## §7H.4 — The company-wide roll-up

One screen, Owner/Admin only:

- A row per job: job name, **[S94]** earned-or-billed, actual cost, **profit**, and its state.
- **Split into two sections — Active and Completed — each subtotaled separately.** Active-job profit is
  "so far" and overstates until the job is done; completed-job profit is final. Keeping them apart
  stops the company figure from blending an overstated number with a final one.
- The **company total is presented as those two subtotals** (final + so-far), not one merged number.
- Same definitions and approved-only rule as the per-job report; it is the per-job numbers gathered,
  not a new calculation.

> **[S94]** #3 makes each row more expensive to compute (per-instrument derivation, and M6 hours for
> T&M labor). The compute-on-read vs. materialized-aggregate question in §7H.8 therefore matters more
> than it did.

---

## §7H.5 — Definitions & the in-progress honesty problem

- **Profit** — **[S94]** Earned − approved actual cost while active; Billed − actual at completion
  (#1). Clean at completion; mid-job it overstates, because work is booked ahead of all its cost.
  The report therefore:
  - **labels the profit "so far"** until job completion (job status read from 5A/projects),
  - always shows **Committed** and **Remaining** beside it, so an open commitment or an over-budget
    category is visible rather than hidden, and
  - **[S94] explains the earned→billed switch** at completion rather than moving the number silently.
- **Committed vs. actual** — a PO issued or a sub quote signed is committed money before any bill
  arrives; ignoring it makes "remaining" look rosier than it is. Both are shown.
- **Cash pairing** — collected − spent, the realized view (**[S94]** shared with 7E §6a). Distinct
  from the earned/booked view. Both appear; the headline is the profit figure (#1).
- **[S94] Earned ≠ billed ≠ collected.** Three different numbers, deliberately: earned is what the
  work has entitled you to, billed is what you actually charged (after any override, 7D §8), collected
  is what has landed. The gaps between them are where write-offs and unbilled backlog live.

---

## §7H.6 — Access

Owner/Admin only, everywhere 7H appears (per-job tab and company-wide screen). PM has no access.
Confirm the exact role gate against the live role hierarchy at build. The view-only financial role is
**not** in v1 (`TECH_DEBT`, deferred at architecture time).

**[S94]** Enforcement is UI-gated today; **#10 batches FINANCIAL-RLS-FLOOR into this build** so the
floor is enforced at the database, not just the interface.

---

## §7H.7 — Dependencies (what 7H reads)

**[S91 status: 7A, 7B, 7C, the M5 budget, and projects are BUILT and readable; 7D and 7E are not.]**
_(7C is built but per `context91` §10 has **never been click-tested**, and `20260729010000` is
rebuild-test only.)_ Wiring is §S.

- **7A** — per-job, per-category cost rollup: approved **actual + committed**, cash basis.
  [S91: `getJobCostRollup()` ships both sides — actual = receipts + net payments, plus a `payables`
  block (committedRemaining / **retainageHeld** / awaitingPaperCount / stillOwed). Committed rows are
  written by 7C flows; derivation helpers live in `payables-shared.ts`; 7H consumes the rollup, never
  re-derives.]
- **7B** — contract value (original + Σ signed CO deltas, **derived at read**, bidirectional).
  **[S94]** Used as "earned" for **fixed-price instruments only** (#1).
- **7D** — **[S94]** **billed** amounts (never derived); **the earned-revenue derivation** for
  cost-plus and T&M; the write-off / hold-back dispositions (7D §8).
- **7E** — collected amounts + **[S94]** the shared cash-pairing derivation (7E §6a).
- **5E (M5 budget)** — the forecast cost baseline, per category.
- **5A / projects** — job status (active vs. complete) for the "so far" vs. final label — **[S94]** now
  load-bearing, since it drives #1's basis switch.
- **[S94] Module 6 — time entries.** New. Required for T&M labor margin (#3), and inheriting 7D §7's
  billable-hours rule. **UNVERIFIED and unmerged.**

---

## §7H.8 — Open / verify items

- ~~**M7-architecture debt #7 blocks per-category profit.**~~ **[S94 — CLOSED.** money-rep **P2**
  resolved debt #7 by deriving sell at read. Per-category margin ships (#3). **Amend
  `module7-architecture.md` §7.1 to mark debt #7 resolved-by-derivation**, so it stops being cited as
  a live blocker.]
- **Rollup semantics must match 7A.** [S91: the live definitions EXIST — approved / committed /
  actual per `payables-shared.ts` + `getJobCostRollup()`. 7H must consume them, not re-derive.]
- **In-progress label** depends on a readable job-status/completion flag (5A/projects) — confirm; #1
  now depends on it.
- **Cash-pairing source** — confirm the shared derivation and its "collected" basis against 7E §6a.
- **Portfolio performance** — compute-on-read vs. materialized aggregate; CC's call, and weightier now
  (§7H.4).
- **[S94] Earned-revenue derivation must exist and be consumable from 7D** before #1 can be built.
- **[S94] `getJobCostRollup().payables.retainageHeld`** — confirm it is per-job and matches what the
  §7H.3 row should show.
- **[S94] FINANCIAL-RLS-FLOOR scope** — enumerate every table and figure the floor must cover before
  scoping it in (#10).
- **[S94 — RESOLVED] Still-billable backlog is a headline figure.** 7D §8 splits a shortfall into
  **written-off** and **held-back**. #1 handles the write-off side (it surfaces as the earned→billed
  drop at completion). The **held-back backlog** — cost incurred and earned but not yet billed — now
  sits in the headline beside Earned and Billed, answering _"have I billed everything I've earned?"_,
  which is a live question on every cost-plus and T&M job. **Backlog = Earned − Billed.**

---

## §7H.9 — What 7H does NOT do

Recorded so it is not built by accident:

- **No over/under-billing (WIP) schedule** in v1. money-rep P11 references _"over/under-billing math"_
  as something `projected_value` must not feed; no such report exists yet and none is specced here.
- **No per-category profit on a fixed-price job before its estimate markups are readable** — the sell
  derivation needs the instrument's pricing context (#3).
- **No writes, anywhere.** 7H surfaces numbers other modules own. **[S94]** Its only build-time
  artifact is #10's policy migration, which enforces access rather than creating data.

---

## §7H.10 — Worked examples — **[S94, NEW]**

> §2a requires _"a worked example per variant"_ for any calculated output. 7H's profit figure now has
> three bases and a switch. **PROPOSED**; the cash-pairing values are **real** (§7.11). Per §2a step 3,
> Josh corrects until it matches reality.

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
Instrument: cost-plus, 18%. Approved actual cost to date $40,000.
Of that, $34,000 has been billed at 18%; $6,000 sits unbilled.

EARNED   = $40,000 × 1.18 = $47,200   ← 7D's derivation, NOT re-implemented here
BILLED   = $34,000 × 1.18 = $40,120
PROFIT   = $47,200 − $40,000 = $7,200  ← "SO FAR", earned basis (job active)
BACKLOG  = $47,200 − $40,120 = $7,080 still billable   (S94-a, if adopted)

Contract value is NOT used. The instrument's projected_value is a labeled
projection and P11 forbids it feeding this math. (#1)
```

### C — Completion, with a write-off _(illustrative — shows the switch)_

```
Same cost-plus job completes. Final totals:
  actual cost $52,000 · earned $61,360 · billed $60,360 (a $1,000 write-off, 7D §8)

WHILE ACTIVE   profit = $61,360 − $52,000 = $9,360   "so far"
AT COMPLETION  profit = $60,360 − $52,000 = $8,360   final

The number DROPS $1,000 the moment the job is marked complete. That is correct —
it is exactly where the write-off surfaces — and the report EXPLAINS it rather
than switching bases silently. (#1)
```

### D — Mixed-instrument cost table _(illustrative — the #3 risk, made concrete)_

```
One project, three instruments:
  EST-1042  original contract   fixed-price
  CO-1042-01 bathroom addition  cost-plus 18%
  CO-1042-02 punch/repairs      T&M ($85/h labor, 15% non-labor)

The "material" category row spans ALL THREE. Its sell CANNOT be one blanket
markup:
   material on EST-1042   → estimate row markups        (P2 / estimate-totals)
   material on CO-1042-01 → cost × 1.18                 (cost_plus_percent)
   material on CO-1042-02 → cost × 1.15                 (tm_nonlabor_percent)
   → derive per instrument, THEN aggregate into the category row.  (#3)

And the "labor" row on CO-1042-02 is not cost-based at all:
   labor sell = billable hours × $85  — needs MODULE 6 HOURS, not the cost
   rollup, and inherits 7D §7's quarter-hour round-up.  (#3, §7H.7)
```

### E — Retainage reconciliation _(illustrative)_

```
Category rows:  labor $18,000 · material $12,400 · subcontractor $14,900 · other $1,700
                                                          category subtotal = $47,000
Retainage held (from subs, 7C)                                            = $   950
                                                          JOB TOTAL       = $47,950

WITHOUT the retainage row the four categories silently miss the job total by
$950 — retainage accrual rows are LINE-LESS (money-rep §4.5), so they reach no
budget line. The row exists to make the table add up. (§7H.3)

Client-held retainage does NOT appear here — that is revenue withheld and lives
in the headline/pairing. Opposite direction, different number. (§7H.3)
```

---

## §S — Data-wiring layer — TODO for Claude Code

**7H asserts no schema and owns no tables** — it is read-and-compute over the modules above. CC wires
the reads once 7A–7E + 5E exist and their real field names can be read. This section states only
_what is read and derived_, not table or column names.

- **Read** (by concept): per-job/per-category approved-actual + committed cost + **retainage held**
  (7A/7C); category budget (5E); contract value (7B); **billed amounts and the earned-revenue
  derivation** (7D); collected + the shared pairing (7E); job status (5A); **[S94]** time entries (M6,
  for T&M labor margin).
- **Derive:** Remaining = Budget − Actual − Committed. **[S94]** Profit = **Earned − Actual** (active)
  → **Billed − Actual** (complete). **[S94]** Per-category Sell and Margin — **per instrument, then
  aggregated** (#3). Cash pairing = Collected − Spent — **consumed from the shared definition, not
  re-derived** (7E §6a).
- **Approved-only:** exclude non-approved 7A rows from every figure (P5).
- **[S94]** Consume, never re-implement: 7D's earned-revenue derivation, 7C's committed/actual
  definitions, 7E's pairing.
- CC decides whether the **portfolio roll-up** computes on read or needs a materialized/cached
  aggregate — do not assume; measure against the live rollup, now heavier per #3.
- **Export** (per-job + portfolio → PDF) reuses existing PDF tooling; no new storage.
- **[S94] Build artifact:** the **FINANCIAL-RLS-FLOOR** migration (#10) — enumerate its full
  platform-wide scope before writing it.

---

## §7H.11 — Provenance

- Decisions §7H.2 #2, #4–#9: interviewed and confirmed by Josh at S92.
- **#1, #3, #10 and §7H.3's retainage row: Josh's rulings [S94]**, reconciling 7H against
  `money-representation.md` (P1/P2/P4/P6/P9/P11, §4.5) and the 7D/7E rulings this session.
- Report structure §7H.3–§7H.4: Claude-proposed, Josh-approved (PM-exclusion and the company-wide
  roll-up are Josh's explicit calls).
- §7H.10: **PROPOSED**; trace A's pairing values are founder-sourced (§7.11), the rest illustrative and
  awaiting Josh's correction per §2a step 3.
- Items tagged `[inferred]` are Claude's inference and **must be confirmed**.
- Upstream schemas and the FrameFocus data layer: **not** verified against the live repo — deferred to
  CC by design (§S). [S91: §7H.7's statuses and the committed/actual definitions were reconciled
  against shipped 7A/7B/7C code; the reads themselves remain unwired.]
- **Session number `[S94]` is assumed** from the sequence. Confirm and adjust if it differs.
