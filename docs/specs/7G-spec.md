# 7G — QuickBooks Connector — Integration Plan

> **Status:** Research-backed plan. Decisions in §7G.2 are Josh's calls this session **except where
> tagged** `[inherited]` or `[inferred]`.
> QB API facts come from Intuit developer research this session and are marked **verify-in-sandbox**
> where they carry build risk. **No FrameFocus schema is asserted here** — the schema layer is left
> as `§S — TODO for Claude Code` per the M7 method (specs do not assert tables, columns, or file
> paths until CC reads the live upstream schemas). This plan is the input CC uses to build that
> schema.
>
> **Nature of 7G:** an integration, not an interview section. This is a plan, not a workflow trace.

---

## §7G.1 — Scope & role

7G is the QuickBooks Online connector. Governing principle (unchanged, from the QB strategy in
`CLAUDE_MODULES.md`): **FrameFocus runs daily operations; QuickBooks runs the books.** FrameFocus is
the source of truth for project data; QB is the source of truth for accounting. 7G never replaces QB
for accounting (no P&L, tax prep, or bank reconciliation inside FrameFocus).

7G is primarily an **outbound export path** for approved financial data, with **one inbound
exception**: electronic client payments originate in QB and flow back into FrameFocus (see §7G.4,
Model A).

---

## §7G.2 — Decisions

Provenance tags: `[this session]` = Josh's call in this conversation; `[inherited]` = carried from an
existing doc, not decided here; `[inferred]` = Claude's inference, sound but not explicitly stated —
confirm before treating as fixed.

1. **Connect.** `[inherited]` The **Owner** connects QuickBooks via **OAuth 2.0** from Company
   Settings. Admin cannot — connecting QB is billing-adjacent and the Owner is the billing contact of
   record. (From the existing QB strategy; restated so CC does not re-open it.)

2. **Job tie.** `[this session]` A **client = a QB Customer**; a **job = a QB sub-customer** nested under that client
   (via `ParentRef`). Every invoice's `CustomerRef` points at the **job** sub-customer, which ties
   all income to the job. **The QBO "Projects" feature is not used** — a Project is just a
   sub-customer under the hood, and the plain sub-customer path is unambiguously API-accessible while
   the Projects feature's API access is contested. FrameFocus is already the job-costing dashboard,
   so QB's Projects dashboard is not needed.

3. **Electronic payment — Model A.** `[this session]` The client pays via **QuickBooks' own pay-now link** carried on
   the QB invoice. Money and paid-status land in QB; FrameFocus **listens** (webhook) and marks its
   invoice paid + updates AR. FrameFocus never touches card data (QB handles PCI).
   - Before the client is redirected, FrameFocus shows a **clear notice that they are being sent to
     QuickBooks to complete payment**. Always on; not a toggle.
   - Electronic payment requires the company to have **QuickBooks Payments enabled**. If it is not,
     electronic pay is unavailable — `[inferred]` they fall back to **manual entry** (§7E).

4. **Income mapping.** `[this session]` Client invoices post to income via a **single "Construction Income" service
   Item**, **remappable** to whatever income account/Item the company actually uses. Income is income
   — the labor / material / sub / other split is a **cost** distinction and does **not** appear on
   invoices. [S91 wording fix — the recorded 7C-spec §6.3 conflict:] the cost-category →
   cost-account mapping **lives in Company Settings** —
   `companies.gl_account_labor/material/subcontractor/other`, shipped with 7A (migration
   `20260728010000:299-302`) — and 7C's bills **consume** it at export. Either way it is not this
   income path's concern.

5. **Sync timing — per-record.** `[this session]` Each financial record exports to QB the moment it clears **its own
   approval gate** — invoice on send, manual payment on entry, timesheet on approval. *("CO on
   approval" deleted [S91] — whether a signed CO exports anything at all is UNDECIDED; see the
   open item in §7G.4.)* Electronic payments arrive inbound via the webhook. **There is no separate batch "session"
   approval before export.** ("Only approved sessions export" is read as: only records that have
   passed their own approval sync — not a batch object.)

---

## §7G.3 — QB API surface (for CC)

All of the following is Intuit-documented behavior gathered this session, and is buildable as written.
The only thing docs can't close is the **live-only residual** noted in §7G.6 — CC confirms that against
a real QB-Payments-connected company.

**Auth**
- OAuth 2.0 only — no API keys or basic auth.
- Scope needed: `com.intuit.quickbooks.accounting` only (customers, items, invoices,
  payments-as-records, bills, vendors, credit memos).
- **RESOLVED — accounting scope is sufficient.** Under Model A the client pays on QB's hosted page,
  so FrameFocus never calls the Charges API, and the `com.intuit.quickbooks.payment` scope is **not
  required**. The pay-link is produced by setting `AllowOnlinePayment`, `AllowOnlineCreditCardPayment`,
  and `AllowOnlineACHPayment` = true on the **Invoice** — accounting-API fields, settable on create or
  via sparse update (Intuit's Receive Payments tutorial does exactly this on the accounting API).
  **Residual (live only):** whether the link renders and works depends on the company having QB
  Payments connected; sandbox Payments is limited, so final confirmation wants a real Payments-enabled
  company. The API mechanism itself is documented and solid.
- `realmId` identifies the connected company. Access tokens last ~60 min; **refresh tokens rotate on
  every use — store the new one immediately or the connection breaks.** A connection can also break if
  the Owner disconnects the app inside QB (all tokens invalidate) or on a realmId mismatch. CC must
  detect refresh/401 failures, mark the connection **needs-reauth**, pause syncing, and prompt the
  Owner to reconnect — never silently drop records queued to sync. Store tokens encrypted, per company.

**REST**
- Base: `https://quickbooks.api.intuit.com/v3/company/{realmId}/{resource}` — **sandbox uses a
  separate host** (`sandbox-quickbooks.api.intuit.com`). Include the `minorversion` query param.
- **No PUT/PATCH.** Updates are POST with the full object, or a **sparse update** (`sparse:true`) that
  changes only named fields and leaves the rest intact. Full updates NULL any omitted writable field —
  CC must use sparse updates when touching existing QB records.
- Soft delete (set `active:false`) for list entities (Customer, Item, Vendor); hard delete for
  transaction entities.

**Limits & metering (per company / realmId)**
- Throttling: 500 requests/min per realmId, 10 concurrent, Batch endpoint 120/min, report/heavy
  endpoints 200/min. Over → HTTP 429 (ThrottleExceeded) → exponential backoff with jitter. Sandbox
  shares the same limits.
- Metering (Intuit App Partner Program, live 2025): **writes (Core / data-in) are free**; **reads
  (CorePlus / data-out) are metered** — free to ~500k/month on the Builder tier, then **blocked, not
  throttled**. Confirm the current tier + numbers at build.
- **Webhooks carry only a reference** (entity, id, operation) — FrameFocus must make a follow-up
  **read** to fetch the actual record, and that read is a metered CorePlus call. This sits directly on
  Model A's payment path, so budget for it.
- Multi-tenant: partition storage and the sync job queue **by realmId**, with per-company throttling
  so one large company can't starve others' syncs.

**Entities in play**
- **Customer** — client record; **sub-customer** = same entity with `ParentRef` set to the client.
- **Item** — the "Construction Income" service Item (income account behind it).
- **Invoice** — `CustomerRef` = job sub-customer; `Line[]` of `SalesItemLineDetail` with `ItemRef`.
- **Payment** — records money against one or more invoices (`LinkedTxn`). Supports one payment split
  across multiple invoices and one invoice taking multiple payments — matches §7E natively.
- **CreditMemo / RefundReceipt** — credits and refunds (§7E credit-memo decision).
- **Vendor / Bill / BillPayment** — sub bills and sub payments. **Owned by 7C**, listed here only so
  the connector surface is complete.

**Inbound / catching QB-side changes**
- Subscribe to **webhooks** for Invoice and Payment events → an HTTPS endpoint (Vercel). This is how
  Model A learns a client paid.
- Use **CDC** (`changedSince`, 30-day window) as a backstop/reconciliation poll so nothing is missed
  if a webhook is dropped.
- Handle events **idempotently** (dedupe by QB entity id + change token).

**Sandbox**
- Intuit provisions a free sandbox company (up to five) for building and confirming the flows. The one
  **live-only residual** — the pay-link rendering for a QB-Payments-connected company — needs a real
  Payments-enabled company, since sandbox Payments is limited (§7G.6).

---

## §7G.4 — Sync map (FrameFocus ⇄ QuickBooks)

Direction is FF → QB unless noted. Refinements this session are marked **(new)**.

- Client → QB **Customer**
- Job → QB **sub-customer** under the client **(new)**
- Sub / vendor (with EIN) → QB **Vendor** *(7C — live source: the `subcontractors` table, which carries `ein` [S91])*
- Client invoice → QB **Invoice** (CustomerRef = job sub-customer; single income Item) *(7D)*
- Client payment, **electronic** → **INBOUND** from QB via webhook (Model A) *(7E)* **(new direction)**
- Client payment, **manual** (check/cash) → QB **Payment** *(7E)*
- Credit / refund → QB **CreditMemo / RefundReceipt** *(7E)*
- Sub bill / commitment → QB **Bill**; sub payment → QB **BillPayment** *(7C — [S91] "pay
  application" is not a shipped concept; live sources are the payable `expenses` rows
  (bills / schedule stages) and `expense_payments`. Payment `amount` is GROSS; cash out is
  NET of `retainage_withheld` — map accordingly at 7G build.)*
- ~~Approved change order → QB **contract adjustment** (raises or lowers contract value; bidirectional) *(7B)*~~
  **[S91 — deleted, FALSE on two counts: the contributing CO status is `'signed'`
  (`change_orders_status_check`, migration `20260704215000:70`; `contract-value.ts:17-20`), and
  contract value is DERIVED at read (`contract-value.ts`) — there is no FF-side write to mirror.
  §7G.3 lists no contract-adjustment entity. OPEN ITEM: What, if anything, does a signed CO
  export to QB? Under derivation there is no FF-side write to mirror and §7G.3 lists no
  contract-adjustment entity. Options: (a) nothing — money reaches QB when invoiced via 7D;
  (b) something else at 7G build. Undecided [S91].]**
- Approved timesheet → QB **Time / Payroll** entry *(M6 / payroll)*

**Lifecycle, not just create.** The map above is the create / first-push. Records also change: edits
propagate as **sparse updates**; a **void** (§7E allows voiding an invoice) propagates as a POST to
the invoice with `operation=void`, which zeroes it in QB and backs the income out. A paid invoice
generally can't be voided — reconcile with §7E's void rules so QB income always matches FrameFocus.
(Confirm the exact void mechanics in sandbox.)

---

## §7G.5 — Architecture amendment to record

`module7-architecture.md` §7.3 draws 7G as an **export-only** path at the bottom of the dependency
map. That is incomplete: for the **electronic-payment path, 7G is also upstream of 7E** — payments
process *through* QuickBooks and flow back in. This is the Session-72 amendment #1, now **confirmed**
against both the committed doc and the QB API research.

Consequence for build order: the **non-QB parts of 7E build first** (manual payment records, aging,
credit/refund bookkeeping, reminders, retainage-release invoice generation); the **electronic-payment
half is a stub until 7G exists.**

---

## §S — Schema layer — TODO for Claude Code

**Do not take table or column names from this document.** CC reads the **live** schemas — 7D/7E
(invoice, payment), 7C (bill, vendor), and Company Settings — confirms real field names, then builds.
This section states only *what must be storable*, not how.

Storage the connector needs (CC to place in the right live tables):

- **Per company:** `realmId`; encrypted OAuth refresh token + access token/expiry; a
  **QB-Payments-enabled** flag; the **income-Item mapping** (default "Construction Income",
  remappable to the company's chosen income account/Item).
- **Per client:** the QB **Customer** id.
- **Per job:** the QB **sub-customer** id.
- **Per invoice:** the QB **Invoice** id; a **sync status** + last-synced timestamp.
- **Per payment:** the QB **Payment** id — whether pushed (manual) or received via webhook
  (electronic) — linked to the FrameFocus invoice.
- **Webhook handling:** an event log / idempotency key store to dedupe QB events.

CC also confirms, against the live schema:
- That the "Construction Income" default Item and its remap target exist / can be created per company.
- That the company's QB Payments connection is live, so the pay-link actually renders — the
  `AllowOnline*Payment` fields themselves are accounting-scope and already resolved (§7G.6).

---

## §7G.6 — Verify-in-sandbox & open dependencies

- **OPEN [S91] — signed-CO export undecided.** See the deleted map row in §7G.4: options are
  (a) nothing — CO money reaches QB when invoiced via 7D; (b) something else at 7G build.
- **RESOLVED (docs) — pay-link on accounting scope.** Enabling the invoice pay-link is an
  accounting-scope Invoice operation (the `AllowOnline*Payment` flags); no Charges API / payment scope
  needed for Model A. **Live-only residual:** confirm the link renders for a real QB-Payments-enabled
  company (sandbox Payments is limited). This is the *only* item that a live test — not docs — can close.
- **RESOLVED (docs) — sub-customer income posting.** A job is created as a Customer with `Job: true`
  and `ParentRef` = the client (accounting scope; up to 4 nesting levels). An invoice with `CustomerRef`
  = that job sub-customer posts its income to the job — Intuit's Customer docs state sales transactions
  attribute to whichever customer/sub-customer/job the `CustomerRef` names. Note: QBO's `IsProject` flag
  is **read-only and ignored on create**, so the Projects feature genuinely *cannot* be created via API,
  which confirms the sub-customer decision (§7G.2 #2) was the only viable path.

**Build notes surfaced while resolving these (for CC):**
- **Job `DisplayName` must be unique** across all Customers/Vendors/Employees and may not contain `:`,
  tab, or newline — CC needs a naming convention that guarantees per-job uniqueness.
- **`BillWithParent`** on the job controls billed-with-parent vs. billed-separately; set for per-job
  billing (confirm exact behavior in sandbox).
- **Manual payment records** use the Payment entity with `LinkedTxn` → Invoice and
  `ProcessPayment: false` (record only, do not attempt to charge).
- **Pre-Module 9 external-surface gate:** Model A **sidesteps** it for the pay surface — QB hosts the
  pay page, FrameFocus only shows the redirect notice. The gate no longer blocks electronic pay. (It
  still governs any *other* client-facing surface, e.g. the 7F e-signature link.)
- **QB Payments onboarding:** a company with no QB Payments account gets manual-only pay; surface this
  clearly at connect time.
- **"Each financial action optionally syncs"** (existing QB-strategy rule): per-record sync fires at
  approval, but a per-action/company toggle for *whether* a given action syncs at all may exist.
  Reconcile against the live Company Settings model at build — do not over-design it here.

---

## §7G.7 — Provenance

- QB API behavior: Intuit developer documentation + research, this session. Not yet exercised in a
  sandbox against a real FrameFocus flow.
- Decisions §7G.2: confirmed by Josh this session.
- FrameFocus schema: **not** verified against the live repo — deferred to CC by design (§S).