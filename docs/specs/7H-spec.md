> # ⚠️ SUPERSEDED — DO NOT BUILD FROM THIS FILE
>
> **Replaced by `docs/specs/7h1-spec.md` [S94].** Retained unchanged for audit only.
> Known-wrong here: profit = Contract − actual is undefined for cost-plus and T&M,
> where P11 forbids using projected_value; §7H.2 #3 defers per-category margin
> against a blocker money-rep P2 had already resolved; the category rows do not sum
> to the job total because line-less retainage has no row; and it ships on UI-only
> gating with no migration batched. Any cross-reference to "7H-spec.md" means
> **7h1-spec.md**.

# 7H — Job Profitability — Plan

> **Status:** Interview-backed plan, this session. Decisions in §7H.2 are Josh's calls **except where
> tagged** `[inherited]` (carried from an existing doc/decision) or `[inferred]`. **7H owns no data
> and asserts no schema** — it is a read-only rollup of 7A–7E + the M5 budget. The data-wiring layer
> is left as `§S — TODO for Claude Code`; none of those upstream schemas exist in the repo yet, so the
> plan defines the _report_, not the reads.
>
> **Nature of 7H:** a report. Read-only. "Budget vs. actual vs. contract," and the number Bishop has
> never been able to close — "we made $X on the Miller job."

---

## §7H.1 — Scope & role

7H sits at the bottom of the Module 7 stack and **reads the modules above it** (architecture §7.3): the
7A cost ledger (actual + committed), 7B contract value, 7D invoices, 7E payments, and the M5 (5E)
budget baseline. ~~Committed cost is a state on the 7A ledger~~ **[S91 — superseded by the 7C build:
committed lives on the expenses ledger as a DERIVED remaining balance — `GREATEST(amount − Σ payments, 0)`,
definitions owned by 7C (`payables-shared.ts`) — and 7H reads it from the 7A rollup surface
(`getJobCostRollup().payables`, `expenses.ts`), never re-deriving. `state` is a settlement marker;
money math never reads it.]** It writes nothing and enforces nothing — it surfaces numbers other
modules own.

It answers, per job: **what did this cost, what will it earn, are we on budget, and what did we make.**

---

## §7H.2 — Decisions

Provenance tags: `[this session]` = Josh's call this conversation; `[inherited]` = carried from an
existing doc/decision; `[inferred]` = Claude's inference, confirm before treating as fixed.

1. **Headline profit = Contract − actual cost.** `[this session]` At completion this is the final "we
   made $X." Mid-job it's a live figure **labeled "so far,"** because not all cost is in yet (§7H.5).
2. **Report structure.** `[this session]` A per-job **cost table** (categories × budget/committed/
   actual/remaining) under a **job headline** (contract, actual cost, profit, cash pairing). Full
   layout in §7H.3.
3. **Profit is job-level in v1.** `[this session]` Per-_category_ profit needs a sell figure on the
   budget side, which the budget doesn't store (**M7-architecture debt #7, §7.1** — not
   `TECH_DEBT.md` #7). So categories show cost-vs-budget only; profit is the job number.
   ~~The 7A actual rows do carry sell, so per-category margin can be added when debt #7 is
   resolved.~~ **[S91 — FALSE; S89 reversal (already applied in `module7-architecture.md:420-424`,
   never mirrored here): cost rows carry actual cost ONLY — no sell column shipped (migration
   `20260728010000`). Per-category margin waits on wherever sell eventually lives (M7-architecture
   debt #7).]**
4. **Portfolio roll-up in v1.** `[this session]` Besides the per-job report, a company-wide screen
   lists every job with its profit and a company total (§7H.4).
5. **Home.** `[this session]` A **Profitability tab under each job's financials** (active _and_
   completed jobs) plus the company-wide screen.
6. **Access — Owner/Admin only.** `[this session]` **PM does not see the profitability report** —
   margin is owner-level. The cut view-only bookkeeper/accountant role stays deferred to `TECH_DEBT`
   (`[inherited]`, cut at M7 architecture time).
7. **Approved-only.** `[inherited]` (7A gate, P5) The report counts only **approved** actual cost;
   pending/rejected ledger rows are excluded until an owner/admin approves them. _(P5's
   "verified" concept shipped as the 7A `approved` status — `pending|approved|rejected`,
   migration `20260728010000:74-75`; terminology renamed throughout this spec [S91].)_
8. **Cash basis.** `[inherited]` (P1) "Actual" = money that left the account. Committed vs. actual is
   the core cost axis.
9. **Export to PDF.** `[this session]` The per-job and portfolio reports can be exported to PDF
   (Owner/Admin) — so an outside accountant can be handed the numbers while the view-only role stays
   deferred. Reuses the existing PDF tooling (`@react-pdf/renderer` / `pdf-lib`).

---

## §7H.3 — The per-job report

**Job headline (top):**

- **Contract value** — from 7B (original + signed COs, up or down).
- **Actual cost** — approved, cash basis, from the 7A rollup [S91: = receipts + net bill
  payments, `getJobCostRollup()`].
- **Profit = Contract − Actual cost** — labeled "so far" until the job is marked complete, then final.
- **Cash pairing** — "collected $X, spent $Y" (the realized-so-far view defined in 7E).

**Cost table (below):** one row per category — **labor / material / subcontractor / other** — plus a
total row. Columns:

- **Budget** — the M5 (5E) forecast cost for that category.
- **Committed** — derived remaining on the ledger's payable rows [S91: PO commitments, sub
  schedule stages, manual bills, retainage accruals — written by 7C flows;
  `GREATEST(amount − Σ payments, 0)`, live-split from the first payment]; money gone from the
  job's view before it is fully paid.
- **Actual** — approved cash cost to date (7A).
- **Remaining** — Budget − Actual − Committed. This is the honesty check: it flags (e.g. red) when a
  category runs over.

---

## §7H.4 — The company-wide roll-up

One screen, Owner/Admin only:

- A row per job: job name, contract value, actual cost, **profit (Contract − Actual)**, and its state.
- **Split into two sections — Active and Completed — each subtotaled separately.** Active-job profit is
  "so far" and overstates until the job is done; completed-job profit is final. Keeping them apart
  stops the company figure from blending an overstated number with a final one.
- The **company total is presented as those two subtotals** (final + so-far), not one merged number.
- Same definitions and approved-only rule as the per-job report; it is the per-job numbers gathered,
  not a new calculation.

---

## §7H.5 — Definitions & the in-progress honesty problem

- **Profit** = Contract value − approved actual cost. Clean at completion; mid-job it overstates,
  because the full contract is booked but not all cost is spent. The report therefore:
  - **labels the profit "so far"** until job completion (job status read from 5A/projects), and
  - always shows **Committed** and **Remaining** beside it, so an open commitment or an over-budget
    category is visible rather than hidden.
- **Committed vs. actual** — a PO issued or a sub quote signed is committed money before any bill
  arrives; ignoring it makes "remaining" look rosier than it is. Both are shown.
- **Cash pairing** — collected − spent, the realized view (7E). Distinct from Contract − Actual, which
  is the earned/booked view. Both appear; the headline is Contract − Actual (§7H.2 #1).

---

## §7H.6 — Access

Owner/Admin only, everywhere 7H appears (per-job tab and company-wide screen). PM has no access.
Confirm the exact role gate against the live role hierarchy at build. The view-only financial role is
**not** in v1 (`TECH_DEBT`, deferred at architecture time).

---

## §7H.7 — Dependencies (what 7H reads)

~~All UNVERIFIED — none of these schemas exist in the repo yet~~ **[S91 status: 7A, 7B, 7C, the
M5 budget, and projects are BUILT and readable; 7D and 7E are not.]** Wiring is §S.

- **7A** — per-job, per-category cost rollup: approved **actual + committed**, cash basis.
  [S91: `getJobCostRollup()` (`expenses.ts`) ships both sides — actual = receipts + net payments,
  plus a `payables` block (committedRemaining / retainageHeld / awaitingPaperCount / stillOwed).
  Committed rows are written by 7C flows; the derivation helpers live in 7C's
  `payables-shared.ts`; 7H consumes the rollup, never re-derives.]
- **7B** — contract value (original + Σ signed CO deltas, **derived at read** —
  `contract-value.ts`, never written through [S91]; bidirectional).
- **7D** — invoiced amounts.
- **7E** — collected amounts + the cash pairing.
- **5E (M5 budget)** — the forecast cost baseline, per category.
- **5A / projects** — job status (active vs. complete) for the "so far" vs. final label.

---

## §S — Data-wiring layer — TODO for Claude Code

**7H asserts no schema and likely owns no tables** — it is read-and-compute over the modules above.
CC wires the reads once 7A–7E + 5E exist and their real field names can be read. This section states
only _what is read and derived_, not table or column names.

- **Read** (by concept): per-job/per-category approved-actual + committed cost (7A); category budget
  (5E); contract value (7B); invoiced (7D); collected (7E); job status (5A).
- **Derive:** Remaining = Budget − Actual − Committed; Profit = Contract − Actual; cash pairing =
  Collected − Spent.
- **Approved-only:** exclude non-approved 7A rows from every figure (P5).
- CC decides whether the **portfolio roll-up** computes on read or needs a materialized/cached
  aggregate for performance — do not assume; measure against the live rollup.
- **Export** (per-job + portfolio → PDF) reuses existing PDF tooling; no new storage.

---

## §7H.8 — Open / verify items

- **M7-architecture debt #7 (§7.1) blocks per-category profit.** Budget rows carry cost only;
  per-category profit/margin waits on the sell/profit addition (batched with the parked sales-tax
  question). Job-level profit is unaffected. When that debt lands, per-category margin can be
  added to §7H.3.
- **Rollup semantics must match 7A.** [S91: the live definitions now EXIST — approved / committed /
  actual per `payables-shared.ts` + `getJobCostRollup()`. 7H must consume them, not re-derive.]
- **In-progress label** depends on a readable job-status/completion flag (5A/projects) — confirm.
- **Cash-pairing source** — confirm the "collected" figure and its basis against the live 7E model.
- **Portfolio performance** — compute-on-read vs. materialized aggregate; CC's call at build.

---

## §7H.9 — Provenance

- Decisions §7H.2: interviewed and confirmed by Josh this session (tags per line).
- Report structure §7H.3–§7H.4: Claude-proposed, Josh-approved (PM-exclusion and the company-wide
  roll-up are Josh's explicit calls).
- Upstream schemas and the FrameFocus data layer: **not** verified against the live repo at
  writing time — deferred to CC by design (§S). [S91: §7H.7's statuses and the committed/actual
  definitions have since been reconciled against the shipped 7A/7B/7C code; the reads
  themselves remain unwired.]
