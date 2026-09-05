# 7G QuickBooks — spec-prep log

> ⚠️ **Analysis only. Build nothing.** No migrations, no `apps/` changes. Deliverable: a build-ready
> 7G spec + this log. Committed after every unit. Never `git add -A`. Never push.
> Eleven restarts, two destroyed reports — this log is the durable record.

Branch `spec/7g-quickbooks` from `main` @ 0c4e2b5. Sandbox realm `9341457813274121`, env=sandbox.
⚠️ READ-ONLY on the sandbox this run. NEVER production QB / production Supabase.

## The ruled design [Josh, S103] — specify to this, do not re-litigate
- Scope: **accounting only** — do NOT specify `com.intuit.quickbooks.payment`. App syncs its invoice
  to QB; **QB returns a pay-link; that link is added to the PLATFORM invoice** (where the client pays).
- Three sync flows: (1) invoice OUT (makes the pay-link), (2) payment BACK, (3) expenses IN.
- QB MUST MATCH THE PLATFORM (not fire-and-forget): amended invoice updates in QB; void here = void in
  QB; **expenses edited/removed here must not leave QB stale**; also spec the REVERSE — a QB-imported
  expense later edited on the platform.
- **A PAID INVOICE CANNOT BE VOIDED** (QB refuses it too) → credit memo or refund. Platform must enforce.
- Customer matching: name conflict → ASK, never auto-create a duplicate. Clients→Customers, jobs→sub-customers.
- Disconnect: ask, offer BOTH (keep QB data / clear it).
- Disclosure (BUILD OBLIGATION, Josh said YES to Intuit): "Payment service provided by Intuit Payments
  Inc." in THREE places — marketing/pricing, invoice pay-link surface, client portal pay surface.

## Registered Intuit routes (must be built at EXACTLY these paths or OAuth breaks)
- callback `/api/quickbooks/callback` · disconnect `/api/quickbooks/disconnect` (Intuit-initiated;
  DOES NOT EXIST) · launch `/dashboard/settings/accounting` (exists) · host `ezcontractorbinder.com`.
- Env contract (de facto): `QBO_CLIENT_ID` · `QBO_CLIENT_SECRET` · `QBO_REALM_ID` · `QBO_ENVIRONMENT`.

---

## §3.4/§3.6 — WHAT ALREADY EXISTS (schema scaffolding — slices 1 & 2, S148/S149). SCHEMA ONLY, inert.
Read from the two migrations (`20260928000000_qb_connection.sql`, `20260929000000_qb_entity_ids_and_queue.sql`):
- **Connection (§3.6)**: on `companies` — `qb_realm_id`, `qb_token_secret_id` (→ `vault.secrets`),
  `qb_payments_enabled`, `qb_income_item_id/name`, `qb_connection_state`
  (disconnected/connected/needs_reauth/revoked + CHECK + shape invariants), `qb_connected_at`,
  `qb_last_refresh_at`, `qb_refresh_rotated_at`, `qb_reauth_required_after` (5-yr ceiling). **Tokens in
  Supabase Vault** (service_role decrypt only; anon/authenticated NOTHING), JSON blob rewritten
  atomically on refresh. **Owner-only** write guard `enforce_companies_qb_scope` (narrower than the
  table policy, per CLAUDE.md owner-only #4). One-realm-per-tenant unique index. ⚠️ Refresh-token
  rotation trap (~24h, invalidates predecessor) documented.
- **Entity ids**: `contacts.qb_customer_id`, `projects.qb_sub_customer_id`, `invoices.qb_void_memo`.
- **Sync-status columns** on invoices/client_payments/client_refunds/expenses/time_clock_sessions:
  `qb_push_status`, `qb_{invoice,payment,refund,bill,time_activity}_id`, `qb_synced_at`;
  `client_refunds.qb_object_type`. All connector-written; per-table write guards
  (`_column_scope` OR `_qb_scope` — TWO conventions, both must be grepped).
- **`qb_sync_queue`**: durable, per-realm (denormalised `realm_id`), dependency-ordered
  (`depends_on_id`), status = queued/in_flight/pushed/failed_transient/failed_terminal, unique
  one-live-per-(entity,op), claim index, SELECT Owner/Admin only, **service-role-write-only** (no
  client INSERT/UPDATE/DELETE). entity_type ∈ customer/sub_customer/invoice/payment/refund/vendor/bill/
  time_activity; operation ∈ create/update/void. ⚠️ `invalid_grant` → rows STAY `queued`, connection →
  needs_reauth, nothing marked failed [S148].
- ⚠️ **NOT built**: OAuth callback route, disconnect route, the WORKER, the webhook listener, any
  Intuit API call, and all UI. `client_refunds` already exists (relevant to paid-invoice → refund).
- ⚠️ **TENSION to resolve**: S148 `qb_payments_enabled` + "no QB Payments → no pay button" vs S103
  "accounting-only, pay-link from invoice sync". Likely reconciled as: `qb_payments_enabled` = the
  QBO *company's* own Payments capability (read via accounting API), NOT an app scope. → §3.1 + Q for Josh.

## §3.1/§3.2/§3.3 — FINDINGS

**§3.1 PAY-LINK — SCOPE DECISION IS SOUND (no live sandbox call needed).** 7g1 §7G.3/§7G.6: the pay-link
is produced by ACCOUNTING-API Invoice fields (`AllowOnlinePayment`/`AllowOnlineCreditCardPayment`/
`AllowOnlineACHPayment = true`) settable on create or sparse-update. **No `com.intuit.quickbooks.payment`
scope required — accounting scope is sufficient.** Confirmed by Intuit docs [7g1, S92/S97]. **RESIDUAL
(live-only):** whether the link RENDERS needs a real QB-Payments-connected company; **sandbox Payments
is limited**, so live rendering is NOT sandbox-verifiable (known, 7g1 §7G.6). ⚠️ The irreversible scope
decision (accounting-only) does NOT rest on the live render — it rests on the scope requirement, which
IS resolved. So S103's accounting-only ruling is safe to specify. [Could not OAuth the sandbox in a
headless env; would need a browser consent flow + a write to create an invoice, both out of this run.]

**§3.2 VOID A PAID INVOICE — NOT a live defect; already DB-enforced.** `canVoidInvoice()`
(`invoices-shared.ts:341-375`) + DB trigger `enforce_invoice_void_authority`
(`20260923000000_invoice_void_authority.sql:69-111`, reads `client_payment_applications`):
- unpaid → Owner/Admin; paid/partial NOT in QB → **Owner only + warning**; **paid AND QB-synced →
  NOBODY (use 7E credit/refund)**; already voided → blocked. Void is irreversible; voided invoices kept
  forever. On void-with-payment, applications soft-delete → payment becomes a derived credit.
- Matches 7g1 §7G.2 #6 ("block once payment reached QB"). ⚠️ NUANCE vs S103: an Owner CAN still void a
  paid invoice that has NOT reached QB. → **Q for Josh:** does S103 tighten that case too, or only govern
  the QB-synced case (already enforced)?

**§3.3 CREDIT MEMO — no stored entity; credits are DERIVED.** No credit-memo table. `client_refunds`
holds explicit refund rows (amount, status pending_approval/approved/issued/cancelled, source
overpayment/negative_co/deposit/other, source_payment_id, `qb_refund_id`, `qb_object_type ∈
{credit_memo, refund_receipt}`). A void-induced credit is DERIVED (unapplied payment surplus,
`payments-shared.ts creditAvailableOnPayment`). QB maps: credit-on-account → CreditMemo, money-back →
RefundReceipt (7E §5; `qb_object_type` already distinguishes). ⚠️ Design point: a derived credit has no
row — the connector must create the QB CreditMemo from derived state (what triggers it?). → Q for Josh.

**Schemas (§3.5, invoice/payment/refund):** invoices — invoice_number, status(draft/pending_approval/
sent/paid/voided), billed_total, derived_total, amount_receivable, retainage_withheld, issue_date,
due_date, sent_at, voided_at/by, void_reason, qb_invoice_id/push_status/synced_at/void_memo.
client_payments — amount, payment_date, method, note, qb_payment_id/push_status/synced_at.
client_refunds — amount, refund_date, status, source, source_payment_id, reason, method,
qb_refund_id/object_type/push_status/synced_at.

## §3.5/§3.7 — EXPENSES + WEBHOOK/BUDGET FINDINGS

**Third scaffolding migration found: `20260930000000_qb_webhooks_and_read_budget.sql` (slice 3, S149):**
- `qb_webhook_events` — idempotency store, UNIQUE `intuit_event_id`, append-only, company_id nullable
  (orphaned realms), records entity_name/id/operation/entity_last_updated. Service-role-write-only.
- `qb_read_budget` — CorePlus counter, increments ONLY on 2xx, one row per company/period_month,
  Owner/Admin SELECT, no client write. (Counter ships; alert deferred.)
- ⚠️ **NO webhook SIGNATURE VERIFICATION** exists — no verifier-token storage, no HMAC check, no webhook
  ROUTE. Dedupe (by event id) is scaffolded; authentication is NOT. → BUILD ITEM + Q (where the Intuit
  verifier token is stored — likely Vault or a company column).

**Expenses (§3.5):** amount, cost_category(material/subcontractor/other), status(pending/approved/
rejected), state(committed/actual), supplier, expense_date, description, project_id, purchase_order_id,
sub_contract_id, source_po_id, source_segment_id, qb_bill_id, qb_push_status(not_pushed/queued/pushed/
failed), qb_synced_at, is_deleted. Lifecycle: create→pending→approved/rejected; soft-delete/restore.
Edit = `updateExpense` (author-while-pending or Owner/Admin; QB cols frozen by `enforce_expenses_column_scope`).
⚠️ **S103 parity GAPS (not built):** (1) no queue-a-delete when an expense is soft-deleted → QB Bill goes
stale; (2) no queue-an-update when an already-pushed expense is re-edited; (3) NO reverse import (QB→
platform) and **no `source` marker** for a QB-imported expense. cost_category='subcontractor' is the 7C
Bill path; material/other are the S103 "expenses IN" path.

**Scaffolding status overall:** slices 1-3 (S148/S149) shipped the ENTIRE DB layer — connection+tokens
(Vault), entity ids, sync-status cols, `qb_sync_queue`, `qb_webhook_events`, `qb_read_budget`, all
write-guards. NOT built: OAuth callback route, disconnect route, the WORKER, the webhook ROUTE (+ sig
verify), any Intuit API call, all UI, disclosure. Worker privilege ruled [S143]: service role + explicit
company_id per query.

## Open questions accumulating (for §5.8 batch)
1. Pay-link LIVE render unverifiable in sandbox (Payments limited) — proceed on docs? (scope is safe regardless).
2. Void: does S103 tighten the "paid but NOT in QB → Owner may void" case, or only govern QB-synced (already enforced)?
3. Void-induced credit is DERIVED (no row) — what triggers its QB CreditMemo? Or record in QB only?
4. Expenses: does 7G IMPORT bills from QB (reverse)? If yes, need a `source`/`qb_bill_id`-origin marker + platform-edit rules. If no, the "QB-imported expense edited" case is moot until import ships.
5. Expense edit/delete → QB update/void: queue it (not built). Confirm expense `void`/`update` ops belong in `qb_sync_queue` (entity_type has `bill`, operation has update/void).
6. Webhook verifier token storage location (Vault vs companies column).
7. Disclosure: portal pay surface is Module 9 (unbuilt). Marketing/pricing + invoice pay-link now; portal disclosure deferred to M9 or specified now?
8. Tier figures / webhook-read batching re-confirmation (7g1 §7G.9) — build-time.

## ✅ DONE — spec written: `docs/specs/7g2-spec.md` (342 lines).
Chose 7g2 (new file), NOT amend: 7g1 is a 602-line ruled plan (referenced, not rewritten);
`7g-quickbooks-spec.md` is an empty 0-byte stub (recommend delete — Q11). 7g2 has: headline, §2
exists-vs-new, §3 findings, §4 five traces with real numbers (retainage case FLAGGED as not-footing,
not adjusted), §5 UI (connection/conflict/disconnect/pay-link/3 disclosures + roles/entry points), §6
failure modes, §7 migrations (M-A pay-link store, M-B verifier token, M-C conditional expense source),
§8 integration, §9 build order, §10 eleven questions. Build-verify N/A (analysis only). Nothing in
`apps/`, no migrations written.

## §0 — status: starting. Log committed first.
