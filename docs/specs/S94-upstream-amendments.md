# S94 — Upstream amendments obliged by the 7D–7H finalization

> **What this is:** the surgical edits the S94 spec revisions oblige in files **other than** the
> 7D–7H specs. These are **edits to make, not decisions to re-open** — each traces to a ruling
> recorded in the spec that obliges it.
>
> **Why a separate file:** `module7-architecture.md` and `money-representation.md` are large and
> mostly correct. Rewriting them would bury the changes and risk collateral drift. Each entry below
> gives the location, the current text, the replacement, and the authority.
>
> **Applies to:** `module7-architecture.md` · `money-representation.md` · `STATE.md` · `TECH_DEBT.md`.
> **Session number `[S94]` is assumed** from the sequence (context93 / money-rep S93) — confirm and
> adjust every tag if the actual number differs.

---

## 1. `docs/specs/money-representation.md`

> **Note on status.** This doc is marked _"FINAL — Session 93, FULLY LOCKED, no carve-outs."_ Both
> edits below are **corrections of drafting errors and of a stale header**, not re-litigation of any
> locked decision. Record them in the doc's existing amendment style (cf. "Amendment A-1") rather than
> editing silently.

### 1.1 — "7G invoicing" → **7D** _(two places)_ — **REQUIRED**

**Authority:** ruled by Josh **[S94]** — drafting error, invoicing is 7D.

Every other document in the repo holds **invoicing = 7D** and **7G = QuickBooks Connector**:
`module7-architecture.md` §7.2/§7.3, `7D-spec.md`, `7E-spec.md` §S #1, `7F-spec.md` §7F.9,
`7H-spec.md` §S, `7G-spec.md`'s own title, and `context91`.

**Location A — the companion-specs list in the header:**

- Current: `docs/specs/7G-spec.md` (invoices — owns the T&M billable-hours definition, §6 note)
- Replace with: `docs/specs/7D-spec.md` (invoices — owns the T&M billable-hours definition, §6 note)

**Location B — §6, the `contract-value.ts` row:**

- Current: _"Earned-revenue derivation for cost-plus (Σ cost × rate-in-force) and T&M (hours × labor
  rate + non-labor cost × `tm_nonlabor_percent`) belongs to **7G invoicing** — including the
  billable-hours definition (which time entries count, rounding, approval gate) — not here."_
- Replace **7G invoicing** with **7D invoicing**.

**Consequence to note in the amendment:** the deferral has now been taken up — `7D-spec.md` §6 and §7
carry the earned-revenue derivations, and §7 settles the billable-hours definition (approved hours,
rounded **up** to the quarter hour, per person per day `[inferred]`).

### 1.2 — Stale build-status header — **VERIFY FIRST**

- Current header: _"Status: FINAL — Session 93, FULLY LOCKED… **Not built. No migration exists.**"_
- But `supabase/migrations/20260730010000_money_representation.sql` **is present in the repo tree**,
  and `instrument-rates-shared.ts`, `money-representation.test.ts` and `contract-section.tsx` all
  exist.
- **CC: confirm whether the migration is applied (and to which database), then correct the header.**
  Do not edit it on the strength of the filename alone — several 7-series migrations are
  rebuild-test-only with prod application owed. **7D §6/§7 depend on `instrument_rates` being live.**

---

## 2. `docs/specs/module7-architecture.md`

### 2.1 — §7.2, the 7D row: contract type is per INSTRUMENT, not per job — **REQUIRED**

**Authority:** `money-representation.md` **P4** (FINAL, S93) — _"Contract type lives on the
INSTRUMENT, not the job… A project may hold instruments of different types simultaneously."_
Recorded as `7D-spec.md` §A.1.

- Current (7D row): _"…stages, percentages, cost-plus, T&M — all coexist, **set per job**."_
- Replace: _"…stages, percentages, cost-plus, T&M — all coexist, **set per instrument** (estimate-
  contract or change order; a project may hold several types at once — money-rep P4)."_

### 2.2 — §7.10, three superseded lines — **REQUIRED**

**Authority:** `7D-spec.md` §A.1–§A.3.

| Current §7.10 text                                                                                                  | Status                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `billing_method per job (per-job choice, not a company default)`                                                    | **Superseded** — per instrument (money-rep P4). Strike or annotate.                                                                                                                                      |
| `Draw trigger per job: date \| % complete \| stage complete`                                                        | **Superseded** — `7D-spec.md` §1 locks user-triggered invoices with no draw-schedule object in v1. Annotate as deferred with the AIA / pay-application work.                                             |
| `T&M — Two settings, ALREADY IN company settings today: billable hourly rate + material markup rate. 7D READS them` | **Superseded** — S93 replaced this with per-instrument effective-dated `instrument_rates` (`tm_labor_hourly`, `tm_nonlabor_percent`). `companies.default_labor_rate` is **no longer the billing basis**. |

Use the doc's existing strike-and-annotate convention (as with the deleted 7G contract-adjustment row)
rather than deleting — the history is load-bearing.

### 2.3 — §7.2, the "trace TODO" note — **REQUIRED**

**Authority:** `7D-spec.md` §A.4, `7E-spec.md` §A.3.

- Current: _"7D and 7E are partially narrated and marked TODO (§7.10) — **their full traces are the
  next interview target**."_
- Replace with a note that the traces are now carried **in the specs themselves** —
  `7D-spec.md` §15 and `7E-spec.md` §9 — both PROPOSED pending a real Bishop job, per §7.12's standing
  rule.

> **Worth recording in the amendment, because it explains four bugs.** The note was accurate. Both
> specs were written and headed WORKFLOW APPROVED while the traces were still partial, and **four
> items the traces already contained never reached the specs**: cost-plus and allowance true-up (7D),
> negative-CO credits and the cost-to-date-vs-revenue pairing (7E). All four are restored in the S94
> revisions. This is the interview-first mandate's failure mode arriving exactly as predicted, and is
> the strongest available argument for not writing spec text ahead of a completed trace.

### 2.4 — §7.1, debt #7: resolved by derivation — **REQUIRED**

**Authority:** `money-representation.md` **P1/P2** — `budgeted_amount` stays cost; **sell is DERIVED**
at read from cost + instrument pricing context. Recorded as `7H-spec.md` §7H.8.

- Current: debt #7 reads as an open blocker — _"M7 either adds these or derives them defensibly."_
- Amend to **RESOLVED [S93] by derivation** — no sell column was added; sell is computed at read
  (P2). Note the consequence: **per-category margin is computable**, and `7H-spec.md` #3 now ships it.
  Debt #7 must stop being cited as a live blocker.

### 2.5 — §7.3, the dependency map: 7G is upstream of 7E's payment path — **ALREADY FOOTNOTED**

An `[S91]` footnote records this; **the diagram itself is still not redrawn.** Redraw it, or leave the
footnote and note explicitly that the diagram is known-incomplete. No new decision — recorded here only
so it is not lost a fourth time (`7E-spec.md` §A.1, `7G-spec.md` §7G.5).

### 2.6 — §7.6, roles: **NO CHANGE — the architecture was right**

Recorded so nobody "fixes" it. §7.6's _"A PM… **cannot record payments received**… Only owner/admin
record payments received"_ is **correct and stands**. `7E-spec.md` §8 had contradicted it; **the spec
was amended, not the architecture** (`7E-spec.md` §8, acceptance #3). §7.11's _"(Founder, corrected
#9)"_ marks this as Josh's own interview correction — it must not be reversed by drift again.

---

## 3. `STATE.md`

**Authority:** verified against the repo — `7C-spec.md` is headed **BUILT [S91]** with commit hashes
(`6b9e7bb` schema, `732dffe` services, `0153d75` UI); `context91` documents the build; two M7
migrations are in the tree.

- Current: Module 7 row reads **⚪ NOT STARTED**, last updated **Session 87**.
- **Amend to reflect reality**, at minimum:
  - **7A** — built (`20260728010000_7a_expenses_job_cost.sql`).
  - **7B** — shipped as **derivation at read** (`contract-value.ts`); `projects.contract_value` is
    never mutated.
  - **7C** — **BUILT [S91]** on `feature/7c-payables`, **never click-tested**, migration
    `20260729010000` on **rebuild-test only** — prod application and merge **owed**.
  - **Money representation** — spec FINAL (S93); migration `20260730010000` present in tree,
    **application status to confirm** (§1.2).
  - **7D–7H** — specs revised **[S94]**; **schema layers deliberately absent** (each spec's §S);
    not built.
- Note the one-line caveat this whole exercise turned on: _"Context files drift; git is ground truth."_

---

## 4. `TECH_DEBT.md`

**Read the live file first — do not invent numbers.** Items to file or amend:

| Item                                  | Action                                                                                                               | Authority                                |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Structured draw / milestone schedules | **File** — deferred from 7D v1                                                                                       | `7D-spec.md` §1                          |
| **AIA / G702–G703 pay applications**  | **File** — named in M7 architecture scope, not built in v1                                                           | `7D-spec.md` §1                          |
| Progress-vs-final lien-release forms  | **DO NOT FILE — closed.** `7F-spec.md` #4's unlimited tagged templates serve the four-form statutory states directly | `7F-spec.md` §7F.10                      |
| View-only financial (bookkeeper) role | Already deferred at architecture time; **confirm it carries a real number**                                          | architecture §7.6/§7.12, `7H-spec.md` #6 |
| Billable flag on M6 time entries      | **File only if** 7D §7's "approved hours on this job" proves insufficient in practice                                | `7D-spec.md` §7                          |
| **FINANCIAL-RLS-FLOOR**               | **Remove from floating-pending** — now batched into 7H's build                                                       | `7H-spec.md` #10                         |

---

## 5. Cross-file consistency — verified

These four statements must read identically wherever they appear. Confirmed consistent across the S94
specs; re-check after any edit.

**1. The invoice void rule** _(7D §9, 7E §8a, 7G #6)_

| Invoice state                             | Void?                                                          |
| ----------------------------------------- | -------------------------------------------------------------- |
| Unpaid                                    | Yes — Owner/Admin, reason required                             |
| Partially paid, payment **not yet in QB** | Yes — **Owner only**, warning; payment becomes a client credit |
| Partially paid, payment **already in QB** | **No** — credit/refund via 7E                                  |
| Fully paid                                | **No** — credit/refund via 7E                                  |

Plus: **reissue is optional** — a terminal void is valid (7D §10, 7F §7F.9, 7G §7G.4).

**2. Billed vs. derived** — an invoice carries both (7D §8). **7G exports billed** (§7G.4); **7H
reports billed** (§7H.3). The derived figure never leaves 7D. Written-off and held-back amounts are
**QB-neutral** — they were never billed.

**3. Credit origin and mapping** — negative-CO credit documents originate in **7D** (§4a); overpayment
credits and refunds in **7E** (§3, §5). **Credit on account → CreditMemo; money returned →
RefundReceipt** (7E §5, 7G §7G.4). A signed CO exports nothing; **its credit document does.**

**4. Lien-release gates are ADVISORY everywhere** — 7F #11, 7E §4, 7C as shipped, architecture P2.
Nothing in the money path is hard-blocked by a document.

**5. The rate model** — per-instrument, effective-dated `instrument_rates`; rate-in-force selected at
the **incurred/worked date**; a rateless non-fixed instrument **refuses to price** rather than billing
at 0% (7D §6/§7, money-rep §4.2/§6). `companies.default_labor_rate` is **no longer** the T&M basis.

---

## 6. What remains genuinely open after S94

Neither invented nor silently closed. Grouped by who can close it.

**Josh — one-line rulings** _(each listed at its section)_
7D: draft re-derivation and override survival (§8) · upward overrides (§8) · presentation default
(§11) · allowance under-credit as a line vs. document (§4b) · cost-picker age display (§6) ·
cost-plus burden (§6).
7E: negative-CO application target (§3a) · reissued-invoice aging clock (§6) · payment immutability
(§2).
7F: template selection (S94-a) · jurisdiction tagging (S94-b) · unconditional amount on partial
payment (S94-c) · electronic cleared-prompt (S94-d) · client notification on release void (S94-e) ·
retaining both notary files (§7F.6).
7G: queue collapse vs. replay (S94-a) · sync-failure visibility (S94-b).
7H: still-billable backlog as a headline figure (S94-a).

**CC — verification against git** _(ordered by consequence)_

1. **The QB metered-read cap: per company or per app?** (7G §7G.3) — the only open item that can
   invalidate a design decision rather than refine one.
2. **Tax-component recoverability per expense row** (7D §6) — may collapse the per-instrument tax-base
   setting to tax-inclusive only.
3. **A project/job number exists** (7G #7) — blocks the QB naming convention.
4. **County and legal description have a source** (7F §7F.4) — the value catalog's likeliest practical
   failure.
5. **`20260730010000` applied?** (§1.2 above) — 7D §6/§7 depend on it.
6. **QB void mechanics with a linked payment** (7G #6) — confirms or widens the block rule.
7. **The estimate-reminder pattern exists** (7E §6).
8. **FINANCIAL-RLS-FLOOR's full scope** (7H #10).
9. **Module 6 hours schema** — blocks 7D §7 and 7H #3's T&M labor margin.

**Structural — needs upstream work, not a decision**

- **Module 6 must merge** before T&M billing can be exercised at all.
- **7C must be click-tested** and its migration applied to prod — every 7D–7H number rides on it.
- **The notification system** must exist before any 7-series event can deliver.
- **Pre-Module 9 gate** — narrowed, not closed: Model A sidesteps it for the pay surface (7G §7G.6),
  but it still governs 7F's sub-inbound signing link.

---

## 7. Trace values awaiting Josh's correction (§2a step 3)

Per §2a the traces are mirrored back _"with real-looking numbers"_ and **the founder corrects them
until they match reality.** Values marked **(real)** are already founder-sourced and need no change.

| Trace                           | Values                                                                    | Status                                                  |
| ------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------- |
| 7D §15-A fixed-price draw       | Draw 2 $18,000, retainage 10% → $16,200                                   | **(real)** draw amount, §7.10; retainage % illustrative |
| 7D §15-B cost-plus              | 18%; lumber $1,000 / plumber $2,400 / fixtures $600 → $4,720              | **Illustrative — needs a real cost-plus job**           |
| 7D §15-C T&M                    | $85/h, 15% non-labor, 12.6 h → 12.75 h, $800 material, override to $1,900 | **Illustrative — needs a real T&M job**                 |
| 7D §15-D CO invoice             | Tile allowance $5,000, selection $6,200, overage $1,200                   | **(real)** §7.8.6                                       |
| 7D §15-E allowance true-up      | Allowance $5,000, picks $4,200, $800 under                                | **(real)** §7.10                                        |
| 7E §9-A/B/C payments            | $10,000 check; $25,000 split; $300 over                                   | **Illustrative**                                        |
| 7E §9-D negative CO             | −$1,200                                                                   | Mirrors the real +$1,200 tile CO                        |
| 7E §9-E retainage release       | $4,200                                                                    | **Illustrative**                                        |
| 7E §9-F final payment composite | $4,000 + $4,200 − $800 − $1,200 = $6,200                                  | **Illustrative — the four-module convergence**          |
| 7F §7F.12                       | Tracks 7D §15-A ($18,000 / $1,800 / $16,200)                              | Follows 7D                                              |
| 7H §7H.10-A                     | Collected $60,000, spent $47,000, +$13,000                                | **(real)** §7.11                                        |
| 7H §7H.10-B/C/D/E               | Cost-plus, completion switch, mixed instrument, retainage                 | **Illustrative**                                        |

**The two that most want real numbers: one cost-plus job and one T&M job.** Those are the variants
§2a demands worked examples for, and the only two with no founder-sourced values anywhere in the repo.
