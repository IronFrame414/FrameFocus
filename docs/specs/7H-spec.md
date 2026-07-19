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
budget baseline. **Committed cost is a state on the 7A ledger, fed by 7C — 7H reads it from 7A, not
7C directly.** It writes nothing and enforces nothing — it surfaces numbers other modules own.

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
   budget side, which the budget doesn't store (**debt #7**). So categories show cost-vs-budget only;
   profit is the job number. The 7A actual rows _do_ carry sell, so per-category margin can be added
   when debt #7 is resolved.
4. **Portfolio roll-up in v1.** `[this session]` Besides the per-job report, a company-wide screen
   lists every job with its profit and a company total (§7H.4).
5. **Home.** `[this session]` A **Profitability tab under each job's financials** (active _and_
   completed jobs) plus the company-wide screen.
6. **Access — Owner/Admin only.** `[this session]` **PM does not see the profitability report** —
   margin is owner-level. The cut view-only bookkeeper/accountant role stays deferred to `TECH_DEBT`
   (`[inherited]`, cut at M7 architecture time).
7. **Verified-only.** `[inherited]` (7A gate, P5) The report counts only **verified** actual cost;
   unverified ledger rows are excluded until an owner/admin verifies them.
8. **Cash basis.** `[inherited]` (P1) "Actual" = money that left the account. Committed vs. actual is
   the core cost axis.
9. **Export to PDF.** `[this session]` The per-job and portfolio reports can be exported to PDF
   (Owner/Admin) — so an outside accountant can be handed the numbers while the view-only role stays
   deferred. Reuses the existing PDF tooling (`@react-pdf/renderer` / `pdf-lib`).

---

## §7H.3 — The per-job report

**Job headline (top):**

- **Contract value** — from 7B (original + signed COs, up or down).
- **Actual cost** — verified, cash basis, from the 7A rollup.
- **Profit = Contract − Actual cost** — labeled "so far" until the job is marked complete, then final.
- **Cash pairing** — "collected $X, spent $Y" (the realized-so-far view defined in 7E).

**Cost table (below):** one row per category — **labor / material / subcontractor / other** — plus a
total row. Columns:

- **Budget** — the M5 (5E) forecast cost for that category.
- **Committed** — the 7A ledger's committed rows (open POs + signed-but-unbilled sub quotes,
  originated in 7C); money gone from the job's view before a bill lands.
- **Actual** — verified cash cost to date (7A).
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
- Same definitions and verified-only rule as the per-job report; it is the per-job numbers gathered,
  not a new calculation.

---

## §7H.5 — Definitions & the in-progress honesty problem

- **Profit** = Contract value − verified actual cost. Clean at completion; mid-job it overstates,
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

All UNVERIFIED — none of these schemas exist in the repo yet; wiring is §S.

- **7A** — per-job, per-category cost rollup: verified **actual + committed**, cash basis. (Committed
  originates in 7C but lands on the 7A ledger; 7H reads it here, not from 7C directly.)
- **7B** — contract value (original + CO write-through, bidirectional).
- **7D** — invoiced amounts.
- **7E** — collected amounts + the cash pairing.
- **5E (M5 budget)** — the forecast cost baseline, per category.
- **5A / projects** — job status (active vs. complete) for the "so far" vs. final label.

---

## §S — Data-wiring layer — TODO for Claude Code

**7H asserts no schema and likely owns no tables** — it is read-and-compute over the modules above.
CC wires the reads once 7A–7E + 5E exist and their real field names can be read. This section states
only _what is read and derived_, not table or column names.

- **Read** (by concept): per-job/per-category verified-actual + committed cost (7A); category budget
  (5E); contract value (7B); invoiced (7D); collected (7E); job status (5A).
- **Derive:** Remaining = Budget − Actual − Committed; Profit = Contract − Actual; cash pairing =
  Collected − Spent.
- **Verified-only:** exclude unverified 7A rows from every figure (P5).
- CC decides whether the **portfolio roll-up** computes on read or needs a materialized/cached
  aggregate for performance — do not assume; measure against the live rollup.
- **Export** (per-job + portfolio → PDF) reuses existing PDF tooling; no new storage.

---

## §7H.8 — Open / verify items

- **Debt #7 blocks per-category profit.** Budget rows carry cost only; per-category profit/margin
  waits on the sell/profit addition (batched with the parked sales-tax question). Job-level profit is
  unaffected. When debt #7 lands, per-category margin can be added to §7H.3.
- **Rollup semantics must match 7A.** Confirm the live definitions of verified / committed / actual in
  the 7A ledger before computing — 7H must not re-derive them differently.
- **In-progress label** depends on a readable job-status/completion flag (5A/projects) — confirm.
- **Cash-pairing source** — confirm the "collected" figure and its basis against the live 7E model.
- **Portfolio performance** — compute-on-read vs. materialized aggregate; CC's call at build.

---

## §7H.9 — Provenance

- Decisions §7H.2: interviewed and confirmed by Josh this session (tags per line).
- Report structure §7H.3–§7H.4: Claude-proposed, Josh-approved (PM-exclusion and the company-wide
  roll-up are Josh's explicit calls).
- Upstream schemas and the FrameFocus data layer: **not** verified against the live repo — deferred to
  CC by design (§S).
