# context92.md — Session 92: 7C Click-Tested, Three Decisions Resolved, Test Suite, Shipped to Production

> **Session:** 92 — July 29, 2026. **Branch:** `feature/7c-payables` (started at `268c64e`) →
> **MERGED to `main`** (`53df90b`, `--no-ff`, 30 files; pushed `2bbaf83..53df90b`; Vercel green).
> Eight S92 commits: `8d06764` debt #106, `bce741b` #107, `02759da` #108, `fb721fa` #109,
> `869f4f5` #110, `1f55d3c` three spec decisions, `12c7336` payables-shared test suite,
> `53df90b` merge.
> **Shape:** start-of-session verification → 7C click-test (the S91 headline item) → debt
> filings → three decisions written to specs → test suite → prod migration + merge + push.
> **Ground rule held:** git/migrations over any spec, handoff, or context claim — and this
> session corrected the record twice where earlier reads had it wrong (§2).

---

## 1. Verified at start

Branch `feature/7c-payables` at `268c64e`; `main` at `2bbaf83`; migration `20260729010000`
present on **rebuild-test** (one row in `schema_migrations`, two tables —
`expense_payments`, `subcontractor_compliance_documents` — three RPCs —
`setup_payment_schedule`, `record_expense_payment`, `set_po_total_amount`).

## 2. CLICK-TEST (7C, Owner, rebuild-test) — first human contact with the build. PASSED.

The S91 §10.1 headline item cleared. Verified live: bill entry, schedule creation, payment
recording with retainage held, partial payment, over-stage warning, retainage release, Bills
tab, Payables section, PO total, complete-with-open-bills advisory, closeout (Owner/Admin +
reason, drops committed, paid stays actual). **`getJobCostRollup` PASSED** — the redefined 7A
surface and highest-risk item, verified net-of-retainage.

**Two corrections to the record:**

- **Bills & Commitments is a tab on `/dashboard/expenses`, NOT the project nav.** 7C added no
  routes.
- **7C-spec §6.10 EXISTS** — as item 10 of section 6, not a heading. An earlier read this
  session wrongly concluded it was never written.

## 3. Debt filed: #106–#110

- **#106** (`8d06764`) — bill document attachment: ungate attach action, creation-time file
  input, Ctrl+V clipboard paste.
- **#107** (`bce741b`) — no expense↔budget-line link; Budget's `committed_amount` has no
  writer anywhere; merge Budget + Job Cost into one screen.
- **#108** (`02759da`) — `did_not_finish` written but never read; closeout should prompt
  reason + rating; read-only sub profile.
- **#109** (`fb721fa`) — no payment edit or void; no overpayment carry-forward.
- **#110** (`869f4f5`) — PO total not on the material entry form; no PO cancel path.

## 4. THREE DECISIONS (Josh's calls — written to specs, `1f55d3c`)

All three S91 §6 open decisions resolved:

1. **Compliance upload — Owner/Admin-only v1, option (b)** (7C §6.10). Readers stay
   Owner/Admin/PM. Live table policy stays wider than spec (accepted, posture (i), #102
   precedent). 7C↔5I divergence flagged inline — `5I-spec:174` names PM as an uploader;
   5I-spec untouched.
2. **QuickBooks — revenue side is INVOICES ONLY** (7G). Neither the original contract nor a
   signed CO ever touches QB. **Principle: promised value stays in FrameFocus; billed value
   goes to QB.** Payables unchanged (Bill/BillPayment still export). Customer and job
   sub-customer are **LAZY CREATE at first invoice export** — nothing reaches QB until an
   invoice needs it.
3. **7E retainage release — CLIENT sign-off.** §4 was correct; acceptance #6's "owner
   sign-off" was the drafting error, fixed at all three sites. Inbound sub retainage softened
   to "same **milestone**, not same **trigger**"; the 7C side is Owner-initiated at sub
   completion; shipped 7C unchanged.

## 5. Tests: `payables-shared.test.ts` (`12c7336`) — 11 → 53 tests

`apps/web/lib/services/payables-shared.test.ts` added; the file previously had zero tests.
Covers all nine exports: gross/net divergence equals the withheld total, the
$1,500 / $75 / $1,425 click-tested case, full settlement including retainage release equals
contract value, committed-remaining clamp at 0, soft-delete re-derivation, the payable
predicate (all five admitting conditions + the settled-manual-bill case), `PAYABLE_OR_FILTER`
lockstep against the predicate, expiry boundaries at 0/30/31 days.

**Noted, not fixed:** `COMPLIANCE_ALERT_DAYS[1]` (the 7) has no consumer anywhere — it awaits
the unbuilt calendar wiring; dead import of the constant at `payables.ts:30`.

**Coverage gap standing:** zero tests on `payables.ts`, `payables-client.ts`, `expenses.ts`,
`budget.ts`, `contract-value.ts`.

## 6. SHIPPED TO PRODUCTION

- Migration `20260729010000` applied to **production** (`jwkcknyuyvcwcdeskrmz`) and verified
  (one row, two tables, three RPCs) — the S91 §10.2 gate (click-test first) was honored.
- Merged `feature/7c-payables` → `main` `--no-ff`, 30 files. Pushed `2bbaf83..53df90b`.
  Vercel green.

## 7. Environment note for next session

**Two checkouts exist on this machine** — `/workspaces/FrameFocus` (correct) and
`/workspaces/rafterworks-s89` (on `feat/notifications-architecture`, no 7C). The shell moved
into the wrong one mid-session and roughly ten read commands ran against a branch predating
7C. **Verify `pwd` before any spec read.**

## 8. Lessons

- **Verify `pwd` before reading anything.** The wrong-checkout episode (§7) produced false
  reads silently — the commands succeeded, they just answered about a different branch. A
  passing command is not a passing check.
- **Read the section, not just the headings.** The "§6.10 doesn't exist" misread (§2) came
  from scanning for a heading when the content lived as a numbered list item.
- **Don't assert a surface's location without reading it.** The
  Bills & Commitments tab was looked for in the project nav and reported
  missing; the S91 record never claimed it was there. 7C added no routes
  (§3.3) and the tab lives on /dashboard/expenses. The click-test's first
  finding was a wrong assumption, not a defect — one grep of the commit
  would have prevented it.

## 9. OWED / NEXT SESSION

1. **Money-representation pass — gates 7D.** Josh's answers recorded here; spec not yet
   written:
   - Budget line carries: cost, committed, actual, sell, delta.
   - Markup: per line or per job.
   - Sales tax: company users decide (configurable, not hardcoded).
   - Expense↔budget join: **HARD LINK** via budget-line dropdown on expense entry, with a
     Miscellaneous option for unbudgeted costs. Not text matching.
   - Merged screen shows all data from both current screens, no duplicates. Owner/Admin see
     everything; **PM sees actual AND committed — this WIDENS the current financial floor**
     (PM sees actual only today). Not a port.

   Batch #107 with #100 (markup) and the parked sales-tax question.

2. **Probe-harness gaps before verifiable work on gated screens:** #103 foreman test
   identity, #104 second test company — **no cross-company isolation proof exists today.**
3. **Then 7D.** 7E/7F/7G/7H remain blocked on 7D.
