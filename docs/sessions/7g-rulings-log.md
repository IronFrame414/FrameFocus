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

## PART A — DONE (commit). All eleven rulings recorded in `7g2-spec.md` (342 → 380 lines).
- §10 converted "Questions" → "Rulings [S103]", all 11 answered. RULED markers added in the body where a
  ruling changes the design (superseded-and-quoted, never deleted):
  - Q1 §3.1/§10 — scope sound, confirm-render-at-build.
  - Q2 §3.2/§10 — paid invoice cannot be voided FULL STOP (Part B implements). Superseded the "one nuance".
  - Q3 §3.3/§10 — derived credit syncs when APPLIED.
  - Q4 §4 Flow 1/§7 M-A/§10 — STORE pay-link on `invoices.qb_invoice_link`.
  - Q5 §2/§4 Flow 3/§7 M-C/§10 — NO import; two-way; M-C DROPPED; removed the §2 "reverse-import" line.
  - Q6 §7 M-B/§10 — verifier token in Vault (`companies.qb_webhook_verifier_secret_id`).
  - Q7 §4 retainage — REWRITTEN and now FOOTS: full $12,500 invoice + retainage line; $11,250 + $1,250
    release-payment against the SAME open invoice = $12,500. ✓
  - Q8 §5.5/§10 — portal disclosure = forward obligation, immediately after M7; → GATED.md.
  - Q9 §4 Flow 3/§10 — expense edit/delete → bill:update/void.
  - Q10 §5.1/§10 — no income Item: tell user, don't auto-create; no Payments: non-blocking.
  - Q11 — deleted empty 0-byte `docs/specs/7g-quickbooks-spec.md` (git rm).
- "Far more of 7G ships than the specs claim" already recorded in §1.3/§1.4 and §2 (whole DB layer shipped;
  NOT built: OAuth callback route, disconnect route, worker, webhook route+sig-verify, any Intuit call, UI, disclosure).

## PART B — code done (commit); rebuild-test proof next.
- ⚠️ **Premise correction found by reading the code:** the DB trigger `enforce_invoice_void_authority`
  NEVER checked QB-sync. It refused a paid-invoice void for non-owners and **ALLOWED the OWNER** (`v_applied
  > 0 → RETURN NEW`). The "paid AND synced → nobody" qualifier lived only in service-layer `canVoidInvoice()`.
  So the live defect: an Owner could void ANY paid invoice (synced or not), via UI or direct PostgREST.
- **What "paid" means — CHOSEN: ANY payment applied (partial or full).** Both the trigger (`SUM(live
  client_payment_applications.amount) > 0`) and `canVoidInvoice`'s `hasPayment` already key on it; a
  partial payment has also moved money (prompt's own reasoning). So no new definition, just tighten who.
- **Migration `20261340000000_paid_invoice_void_refusal.sql`:** CREATE OR REPLACE the trigger — `v_applied
  > 0` now RAISES for EVERYONE (owner included), message NAMES the credit-memo/refund path. Unpaid arm
  unchanged. Service-role escape kept. AFTER trigger `retire_applications_on_invoice_void` untouched.
  Existing rows untouched (CREATE OR REPLACE only).
- **Service `canVoidInvoice()`:** collapsed the two paid arms into one — `hasPayment` → refuse for all,
  same named path. `paymentSyncedToQuickBooks` no longer consulted (kept on the context for callers).
- **Tests inverted (not deleted), per CLAUDE.md:**
  - `invoice-lifecycle.test.ts` — "PARTIALLY PAID… Owner ONLY, warns" → "PAID (any), not in QB: NOBODY may
    void." Unit run: **25/25 PASS.**
  - `s143-void-authority.live.ts` — V2 "OWNER ONLY" → "NOBODY may void" (PM/Admin/**Owner** all refused,
    message names credit path); V3 credit-effect now voids via the service-role escape (`admin`) since no
    user can. (Live run pending rebuild-test.)
- type-check PASS.

## PART B — PROVEN on rebuild-test. ✅
- Confirmed target is **rebuild-test** (seeded QA identities josh+test50/josh+pm present; 11 users, 6
  companies — the fixture set, not prod). Idle (0 other active queries) before applying.
- Migration `20261340000000_paid_invoice_void_refusal` applied via MCP `apply_migration` → `{success:true}`.
  Ledger repaired: MCP writes no `schema_migrations` row, so inserted version `20261340000000` +
  name (confirmed present). Prior ledger tip was `20261330000000`.
- **A second old-behaviour test surfaced on the live run** (I'd missed it): S143-V3 "the voided invoice is
  NOT flipped back to sent" voided a paid invoice via `ownerC` → went RED with EXACTLY the fix's message
  ("This invoice has a payment applied and cannot be voided. Issue a credit memo or a refund…"). Inverted
  it (void via the service-role `admin`, since no user may void a paid invoice) — NOT softened the guard.
- **The four proofs — ALL PASS (live, real sessions), 12/12:**
  1. Paid AND QB-synced → refused (unchanged): V2 "…IS in QuickBooks too — trigger is QB-agnostic". ✓
  2. Paid, NOT synced → **NOW REFUSED (the fix)**: V2 "OWNER is ALSO refused when… NOT in QuickBooks". ✓
  3. Unpaid → still voidable: V1 Owner/Admin void succeed. ✓
  4. Refusal message NAMES the credit path: `/credit memo or a refund/i` asserted. ✓
- Unit `invoice-lifecycle.test.ts`: 25/25. type-check PASS.
- **Test data:** the live harness creates invoices (title 'S143 harness fixture'), payments ($100/$300/
  $400/$1000) and applications, and HARD-DELETES them all in `afterAll`. Verified: **0 leftover harness
  invoices, 0 leftover synced fixtures.** Two `client_payments` matched a broad filter but are
  **pre-existing seed data (34 days old, live applications, $3000, other contacts)** — NOT mine; left untouched.

## §0 — status: Part A + Part B DONE. Final commit + tree-clean check.
