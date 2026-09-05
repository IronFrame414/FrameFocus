# 7G rulings + paid-invoice void fix — work log

> ⚠️ **This log IS the report.** Eleven restarts, two destroyed reports. Committed after every unit,
> path-scoped. Never `git add -A`. Never push. **UNATTENDED** — take reversible defaults, LOG them, keep going.

Branch `fix/7g-rulings-and-void` from `main` @ 0c4e2b5 (== origin/main; pull was a no-op). Brought
`docs/specs/7g2-spec.md` + `docs/sessions/7g-spec-prep-log.md` over from `spec/7g-quickbooks` (they were
committed there, not to main) so Part A has the spec to edit.

**Two parts:** A — record the eleven S103 rulings into `7g2-spec.md` (docs only, do FIRST). B — fix the
paid-invoice void defect (a real migration on rebuild-test; a LIVE money defect, not QB work).

**Stops (LOG + build around, do not halt):** production · a decision not in this prompt · altering/
destroying existing rows. Migrations: rebuild-test only; MCP `apply_migration` writes no ledger row —
check + repair; check rebuild-test idle first.

## The eleven rulings [Josh, S103] — to record
- Q5 ⚠️ BIGGEST: **NO expense import from QB.** Three flows = invoice OUT · payment BACK · **expenses OUT
  as Bills**. Expenses recorded in EZCB, pushed to QB, never pulled. **Drop migration M-C.**
- Q1 pay-link: scope decision SOUND (accounting `AllowOnline*Payment`); payment scope MUST NOT be added; render confirm-at-build.
- Q2 → Part B; spec records "a paid invoice cannot be voided, full stop."
- Q3 derived credit syncs to QB when **APPLIED**, not when recorded.
- Q4 **STORE** pay-link on `invoices.qb_invoice_link` (prints on a client-held doc). M-A stands.
- Q6 webhook verifier token → **Vault** (same credential class as OAuth tokens). M-B = Vault option.
- Q7 retainage: send QB the FULL amount with retainage as a **LINE ITEM**; held portion sits OPEN until
  released; **releasing retainage = a PAYMENT against the existing open invoice, never a second invoice.**
  Rewrite the $12,500/$1,250/$11,250 trace to foot.
- Q8 portal pay-surface disclosure = FORWARD OBLIGATION, do immediately after M7; record so it can't be lost.
- Q9 expense edited/deleted → `bill:update` / `bill:void`.
- Q10 onboarding: no income Item → tell user to create one in QB, DO NOT auto-create; no QB Payments →
  NON-BLOCKING (invoices still sync, no pay-link).
- Q11 delete empty 0-byte `docs/specs/7g-quickbooks-spec.md` stub.
- Also: record that far more of 7G ships than the specs claim (slices 1-3 = whole DB layer; NOT built:
  OAuth callback route, disconnect route, worker, webhook route+sig-verify, any Intuit call, all UI, disclosure).

## Part B — the defect
`enforce_invoice_void_authority` refuses void only when paid AND QB-synced → an Owner can still void a
PAID invoice that never reached QB. Money moved → voiding strands the payment. **Fix: PAID is the
condition; drop the QB-synced qualifier.** Establish what "paid" means (fully vs any applied), choose,
report. Refusal message must NAME the credit/refund path. Existing rows untouched.

---

## §0 — status: starting. Part A first.
