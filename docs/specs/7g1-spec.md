# 7G — QuickBooks Connector — Integration Plan

> **Status:** Research-backed plan (S92, extended and reconciled **[S96]**). Decisions in §7G.2 are
> Josh's calls **except where tagged** `[inherited]` or `[inferred]`.
> QB API facts come from Intuit developer research and are marked **verify-in-sandbox** where they
> carry build risk. **No FrameFocus schema is asserted here** — the schema layer is left as
> `§S — TODO for Claude Code` per the M7 method. This plan is the input CC uses to build that schema.
>
> **Nature of 7G:** an integration, not an interview section. This is a plan, not a workflow trace —
> architecture §7.2 classes it _"No"_ for the approved-trace requirement.
>
> **[S96] — what changed.** Four rulings (§7G.2 #6–#9) and three consequences of the 7D/7E rulings.
> The **void-with-a-payment** case 7G already flagged is now decided (#6); jobs get a **naming
> convention** (#7); **disconnected operation queues rather than blocks** (#8), which makes the sync
> queue a named build item; and void/reissue pairs are **annotated in the QB memo** (#9). The sync map
> gains the **negative-CO credit document** and is corrected to export the **billed** invoice amount.
>
> **Provenance tags:** `[S96]` = Josh's ruling this session · `[this session]` = Josh's call at S92 ·
> `[inherited]` = carried from an existing doc · `[inferred]` = Claude's inference — **confirm before
> treating as fixed.**

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

1. **Connect.** `[inherited]` The **Owner** connects QuickBooks via **OAuth 2.0** from Company
   Settings. Admin cannot — connecting QB is billing-adjacent and the Owner is the billing contact of
   record.

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
   invoices. [S91 wording fix:] the cost-category → cost-account mapping **lives in Company Settings**
   — `companies.gl_account_labor/material/subcontractor/other`, shipped with 7A (migration
   `20260728010000:299-302`) — and 7C's bills **consume** it at export.

5. **Sync timing — per-record.** `[this session]` Each financial record exports to QB the moment it clears **its own
   approval gate** — invoice on send, manual payment on entry, timesheet on approval. _("CO on
   approval" deleted [S91]; RESOLVED [S92] — a signed CO exports nothing; its dollars reach QB
   on the 7D invoice that bills them. See §7G.4.)_ Electronic payments arrive inbound via the webhook.
   **There is no separate batch "session" approval before export.** ("Only approved sessions export"
   is read as: only records that have passed their own approval sync — not a batch object.)

6. **[S96] Void with a payment attached — BLOCK, don't unlink.** 7E permits voiding an invoice that
   carries a _partial_ payment. QuickBooks generally refuses to void an invoice with a linked Payment,
   wanting the payment removed first. **FrameFocus blocks the void once the payment has reached QB**
   and directs the user to credit or refund through 7E instead — rather than unlinking the QB Payment
   or substituting a CreditMemo. Keeps the books provably aligned and avoids a multi-step API dance
   that can fail partway.

   > **Consequence, stated plainly.** Electronic payments **originate** in QB, and manual payments
   > sync on entry (#5) — so a payment reaches QuickBooks almost immediately. In normal operation
   > **"partially paid → voidable" collapses to roughly "unpaid → voidable"**, and the window survives
   > mainly while QB is disconnected and the payment sits queued (#8). This was chosen over the two
   > options that preserved a wider window. **CC: sandbox-confirm that QB actually refuses** — if it
   > permits the void, this can be revisited toward the wider rule.

7. **[S96] Job naming in QuickBooks — job number + name.** e.g. `1042 — Kitchen Remodel`. Uniqueness
   comes from a number already assigned, it stays readable in QB reports, and it cannot collide with a
   vendor or employee. Satisfies §7G.6's constraint that `DisplayName` be unique across
   Customers/Vendors/Employees and contain no `:`, tab or newline.

   > **[VERIFY — CC, blocking #7]** This assumes **projects carry a human-facing number**. Estimates
   > use `EST-####` and change orders `CO-####-##`, but **a project/job number has not been
   > confirmed to exist.** If it does not, one must be introduced before the connector can name
   > anything. Also confirm the separator survives QB's constraints and the composed name stays inside
   > QB's length limit.

8. **[S96] While disconnected: queue everything, sync on reconnect, warn visibly.** A revoked token, a
   failed refresh, or an Owner disconnecting inside QB must not stop the user working. Records queue
   in order and replay when the Owner reconnects; a **persistent banner** surfaces the disconnection.
   See §7G.7 — this makes the sync queue a first-class build item.

9. **[S96] Annotate void/reissue pairs in the QB memo field.** The voided invoice reads _"replaced by
   INV-####"_; the successor reads _"replaces INV-####"_. Uses a field QB already has, so anyone
   reconciling inside QuickBooks can follow the thread without opening FrameFocus.
   **The void reason is deliberately NOT carried into QB** — 7D §9 makes a reason required, but it
   stays internal and is not exposed to the accountant. Recorded so it is not "helpfully" added.

---

## §7G.3 — QB API surface (for CC)

All of the following is Intuit-documented behavior gathered at S92, buildable as written. The only
thing docs can't close is the **live-only residual** noted in §7G.6.

**Auth**

- OAuth 2.0 only — no API keys or basic auth.
- Scope needed: `com.intuit.quickbooks.accounting` only (customers, items, invoices,
  payments-as-records, bills, vendors, credit memos).
- **RESOLVED — accounting scope is sufficient.** Under Model A the client pays on QB's hosted page,
  so FrameFocus never calls the Charges API, and the `com.intuit.quickbooks.payment` scope is **not
  required**. The pay-link is produced by setting `AllowOnlinePayment`, `AllowOnlineCreditCardPayment`,
  and `AllowOnlineACHPayment` = true on the **Invoice** — accounting-API fields, settable on create or
  via sparse update.
  **Residual (live only):** whether the link renders depends on the company having QB Payments
  connected; sandbox Payments is limited.
- `realmId` identifies the connected company. Access tokens last ~60 min; **refresh tokens rotate on
  every use — store the new one immediately or the connection breaks.** A connection can also break if
  the Owner disconnects the app inside QB (all tokens invalidate) or on a realmId mismatch. CC must
  detect refresh/401 failures, mark the connection **needs-reauth**, pause syncing, and prompt the
  Owner to reconnect — **never silently drop records queued to sync** (§7G.7). Store tokens encrypted,
  per company.

**REST**

- Base: `https://quickbooks.api.intuit.com/v3/company/{realmId}/{resource}` — **sandbox uses a
  separate host** (`sandbox-quickbooks.api.intuit.com`). Include the `minorversion` query param.
- **No PUT/PATCH.** Updates are POST with the full object, or a **sparse update** (`sparse:true`) that
  changes only named fields. Full updates NULL any omitted writable field — CC must use sparse updates
  when touching existing QB records.
- Soft delete (set `active:false`) for list entities (Customer, Item, Vendor); hard delete for
  transaction entities.

**Limits & metering (per company / realmId)**

- Throttling: 500 requests/min per realmId, 10 concurrent, Batch endpoint 120/min, report/heavy
  endpoints 200/min. Over → HTTP 429 (ThrottleExceeded) → exponential backoff with jitter. Sandbox
  shares the same limits.
- Metering (Intuit App Partner Program, live 2025): **writes (Core / data-in) are free**; **reads
  (CorePlus / data-out) are metered** — free to ~500k/month on the Builder tier, then **blocked, not
  throttled**.
  > **[VERIFY — S94, HIGHEST CONSEQUENCE IN 7G] Is that cap per company, or per app?** The
  > distinction is never stated and it decides whether Model A scales. **Per `realmId`** it is
  > generous and the design is fine. **Per app** — across every FrameFocus customer — it is a hard
  > cliff that stops _every_ company's sync at once, with no throttle to soften it. Because webhooks
  > carry only a reference and force a **metered follow-up read on every payment event**, plus CDC
  > backstop polling, read volume scales with customers × payment activity. **Confirm from Intuit's
  > partner documentation before committing to Model A's webhook design** — this is answerable
  > without writing code, and if it is per-app the CDC cadence and possibly the whole inbound
  > approach need rethinking. Confirm the tier numbers too; they date from 2025.
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
- **CreditMemo / RefundReceipt** — **[S96]** two distinct objects for two distinct things: a
  **CreditMemo** is a credit on the client's account; a **RefundReceipt** is money actually sent back.
  7E §5 now distinguishes them, so 7G maps them separately.
- **Vendor / Bill / BillPayment** — sub bills and sub payments. **Owned by 7C**, listed here only so
  the connector surface is complete.

**Inbound / catching QB-side changes**

- Subscribe to **webhooks** for Invoice and Payment events → an HTTPS endpoint (Vercel). This is how
  Model A learns a client paid.
- Use **CDC** (`changedSince`, 30-day window) as a backstop/reconciliation poll so nothing is missed
  if a webhook is dropped.
- Handle events **idempotently** (dedupe by QB entity id + change token).

**Sandbox**

- Intuit provisions a free sandbox company (up to five). The one **live-only residual** — pay-link
  rendering for a QB-Payments-connected company — needs a real Payments-enabled company (§7G.6).

---

## §7G.4 — Sync map (FrameFocus ⇄ QuickBooks)

Direction is FF → QB unless noted. **[S96]** marks this session's changes.

**[S92 — governing principle, revenue side: QB receives INVOICES ONLY.** The invoice is the
device incoming money is tied to. Neither the original contract nor a signed change order ever
touches QB — **promised value stays in FrameFocus; billed value goes to QB.** Consequence,
stated so this doesn't get re-litigated: QB cannot answer "what is this job worth" — that
lives in FrameFocus only. Payables are unchanged: sub bill/commitment → Bill and sub payment →
BillPayment still export — real money out, needed for expense accounting and 1099s.]\*\*

- Client → QB **Customer** _([S92] created lazily at first invoice export, not eagerly at
  client creation — nothing reaches QB until an invoice needs it)_
- Job → QB **sub-customer** under the client _([S92] created lazily at first invoice export.
  **[S96]** named per #7: job number + name)_
- Sub / vendor (with EIN) → QB **Vendor** _(7C — live source: the `subcontractors` table, which carries `ein` [S91])_
- Client invoice → QB **Invoice** (CustomerRef = job sub-customer; single income Item) _(7D)_
  **[S96] Export the BILLED amount, never the derived one.** 7D §8 splits a derived invoice into a
  **derived** figure and a **billed** figure (the recorded override). QuickBooks must receive what the
  client was actually charged, or QB income disagrees with the invoice in the client's hands.
  **7D's disposition figures are QB-neutral** — written-off and held-back amounts were never billed,
  so nothing exports for them. Stated so it is not re-litigated at build.
- **[S96] Negative-CO credit document → QB CreditMemo** _(7D §4a issues it; 7E §3a applies it)_
  > **This does NOT contradict "a signed CO exports nothing."** The CO itself still exports nothing;
  > the **credit document that bills it** exports, because **billed value goes to QB** — and a credit
  > is billed value with a minus sign. Read carelessly, the S92 rule and 7D §4a combine into "negative
  > COs never reach QB," which would leave QuickBooks **permanently overstating income** by every
  > deductive CO ever signed. Written out explicitly for that reason.
- Client payment, **electronic** → **INBOUND** from QB via webhook (Model A) _(7E)_
- Client payment, **manual** (check/cash) → QB **Payment** with `LinkedTxn` → Invoice and
  `ProcessPayment: false` _(7E — **[S96]** recorded by Owner/Admin only, per 7E §8)_
- **[S96] Credit on account → QB CreditMemo; money returned → QB RefundReceipt** — two objects, per
  7E §5. Origin split: negative-CO credits originate in **7D**; overpayment credits and refunds in
  **7E**.
- Sub bill / commitment → QB **Bill**; sub payment → QB **BillPayment** _(7C — [S91] live sources are
  the payable `expenses` rows (bills / schedule stages) and `expense_payments`. Payment `amount` is
  GROSS; cash out is NET of `retainage_withheld` — map accordingly at build.)_
- ~~Approved change order → QB contract adjustment~~ **[S91 — deleted, FALSE on two counts: the
  contributing CO status is `'signed'` (`change_orders_status_check`, migration
  `20260704215000:70`; `contract-value.ts:17-20`), and contract value is DERIVED at read — there is
  no FF-side write to mirror. RESOLVED [S92]: a signed CO exports NOTHING.]**
- Approved timesheet → QB **Time / Payroll** entry _(M6 / payroll)_
  > **[S96] Do not conflate with 7D §7's billable hours.** Payroll hours and **billable** hours are
  > different populations off the same M6 data — 7D bills approved hours **summed per person per
  > day and rounded UP to the HALF hour**; payroll exports actual logged time. One rounding
  > rule must never leak into the other.
- **[S96] 7F lien releases export nothing.** 7F is entirely internal to FrameFocus — no QB surface.
  Recorded so it is not looked for.

**Lifecycle, not just create.** The map above is the create / first-push. Records also change: edits
propagate as **sparse updates**; a **void** propagates as a POST to the invoice with `operation=void`,
which zeroes it in QB and backs the income out. **[S96]** A void carries the #9 memo annotation; a
**successor invoice is an ordinary create** (7D §10), so no un-void or replace path is needed — and
because a **terminal void is valid** (7D §10), the connector must not assume a successor follows.
Per #6, a void is **blocked** where QB holds a payment.

---

## §7G.5 — Architecture amendment to record

`module7-architecture.md` §7.3 draws 7G as an **export-only** path at the bottom of the dependency
map. That is incomplete: for the **electronic-payment path, 7G is also upstream of 7E** — payments
process _through_ QuickBooks and flow back in. This is the Session-72 amendment #1, **confirmed**
against both the committed doc and the QB API research.

Consequence for build order: the **non-QB parts of 7E build first** (manual payment records, aging,
credit/refund bookkeeping, reminders, retainage-release invoice generation, the cost pairing); the
**electronic-payment half is a stub until 7G exists.**

---

## §7G.6 — Verify-in-sandbox & open dependencies

- **RESOLVED [S92] — a signed CO exports nothing.** CO money reaches QB when invoiced via 7D.
  **[S96] But its negative counterpart's credit document DOES export** — see §7G.4.
- **RESOLVED (docs) — pay-link on accounting scope.** Enabling the invoice pay-link is an
  accounting-scope Invoice operation (the `AllowOnline*Payment` flags); no Charges API / payment scope
  needed for Model A. **Live-only residual:** confirm the link renders for a real QB-Payments-enabled
  company (sandbox Payments is limited). This is the _only_ item that a live test — not docs — can close.
- **RESOLVED (docs) — sub-customer income posting.** A job is created as a Customer with `Job: true`
  and `ParentRef` = the client (accounting scope; up to 4 nesting levels). An invoice with `CustomerRef`
  = that job sub-customer posts its income to the job. QBO's `IsProject` flag is **read-only and
  ignored on create**, so the Projects feature genuinely _cannot_ be created via API — confirming #2.

**Verification queue, ordered by consequence [S96]:**

1. **The metered-read cap — per company or per app?** See §7G.3. The only open item that can
   invalidate a decision already made rather than refine one.
2. **Void mechanics with a linked payment** — confirm QB refuses, which is what #6 assumes.
3. **A project/job number exists** — #7 depends on it.
4. **Pay-link rendering** — the live-only residual above.
5. **Metering tier numbers** — figures date from 2025.

**Build notes (for CC):**

- **Job `DisplayName`** must be unique across all Customers/Vendors/Employees and may not contain `:`,
  tab, or newline — #7's convention exists to satisfy this.
- **`BillWithParent`** on the job controls billed-with-parent vs. billed-separately; set for per-job
  billing (confirm exact behavior in sandbox).
- **Pre-Module 9 external-surface gate:** Model A **sidesteps** it for the pay surface — QB hosts the
  pay page, FrameFocus only shows the redirect notice. The gate no longer blocks electronic pay. (It
  still governs any _other_ client-facing surface, e.g. 7F's sub-inbound e-signature link.)
- **QB Payments onboarding:** a company with no QB Payments account gets manual-only pay; surface this
  clearly at connect time.
- **"Each financial action optionally syncs"** (existing QB-strategy rule): per-record sync fires at
  approval, but a per-action/company toggle for _whether_ a given action syncs at all may exist.
  Reconcile against the live Company Settings model at build — do not over-design it here.

---

## §7G.7 — The sync queue — **[S96, NEW — the largest build item in 7G]**

#8 rules that work continues while QuickBooks is unreachable. That makes the queue first-class rather
than incidental. It must:

1. **Replay in dependency order.** Customer → job sub-customer → Invoice → Payment. A payment cannot
   sync before its invoice, and **lazy creation** (§7G.4) means the customer and job must be created
   _by the queue_ before the first invoice lands.
2. **Pace itself.** A reconnect after days replays into 500 req/min per realm with 10 concurrent. Add
   7D §10's bulk void-and-reissue — a single superseded rate can flag many invoices at once — and the
   burst grows. Back off on 429 with jitter.
3. **Be durable.** It must survive restarts and deploys — stored, not in-memory — and be **partitioned
   by `realmId`** per the multi-tenant note.
4. **Never silently drop.** §7G.3's existing rule, now load-bearing.
5. **Surface state.** A **persistent banner** while disconnected (#8), and per-record **sync status**
   (§S) so a stalled record is findable.

**[S96] The queue REPLAYS every operation — it does not collapse them.** If an invoice is sent while QB
is down and then voided before reconnect, the queue pushes **create, then void** rather than collapsing
to nothing. Ruling: _"queue data until connection is re-established"_ — the data is preserved, not
optimized away. QuickBooks is the book of record, and a void it never saw is a gap in the books.

**[S96] A record that fails to sync warns the user and stays queued.** This extends #8 beyond the
disconnected case to any single-record failure while the connection is healthy — a validation
rejection, a duplicate `DisplayName`, a stale token mid-batch. Behaviour is the same in both:
**warn the user, hold the data, retry when the path clears.** Nothing is ever dropped, and nothing
fails silently. §S's per-record **sync status** is the hook; the warning follows the same
notification-event pattern as every other 7-series event.

> **[inferred]** Failures that cannot clear on retry — a rejection that will fail identically every
> time, such as a duplicate `DisplayName` — need a **surfaced, actionable** state rather than an
> infinite retry loop. Confirm the escalation shape at build.

---

## §S — Schema layer — TODO for Claude Code

**Do not take table or column names from this document.** CC reads the **live** schemas — 7D/7E
(invoice, payment), 7C (bill, vendor), and Company Settings — confirms real field names, then builds.
This section states only _what must be storable_, not how.

- **Per company:** `realmId`; encrypted OAuth refresh token + access token/expiry (**rotating —
  overwrite on every refresh**); a **QB-Payments-enabled** flag; the **income-Item mapping** (default
  "Construction Income", remappable); **[S96]** the connection state (**connected / needs-reauth**)
  driving #8's banner.
- **Per client:** the QB **Customer** id.
- **Per job:** the QB **sub-customer** id. **[S96]** plus whatever field #7's naming convention reads
  (see the blocking verification — a project/job number may not exist yet).
- **Per invoice:** the QB **Invoice** id; a **sync status** + last-synced timestamp; **[S96]** the
  **memo text** for void/reissue pairs (#9).
- **Per payment:** the QB **Payment** id — whether pushed (manual) or received via webhook
  (electronic) — linked to the FrameFocus invoice.
- **Per credit / refund:** **[S96]** which QB object it maps to — **CreditMemo** (credit on account,
  incl. negative-CO credits) or **RefundReceipt** (money returned) — per 7E §5.
- **Webhook handling:** an event log / idempotency key store to dedupe QB events.
- **[S96] The sync queue itself:** durable, per-`realmId`, dependency-ordered, with retry/backoff
  state and per-record status (§7G.7).

CC also confirms, against the live schema:

- That the "Construction Income" default Item and its remap target exist / can be created per company.
- That the company's QB Payments connection is live, so the pay-link actually renders.
- **[S96]** That 7D's invoice exposes the **billed** amount distinctly from the derived one, and
  **retainage withheld** separately from the invoice face.

---

## §7G.8 — Provenance

- QB API behavior §7G.3: Intuit developer documentation + research at S92. **Not yet exercised in a
  sandbox against a real FrameFocus flow**, and not independently re-verified since.
- Decisions §7G.2 #1–#5: confirmed by Josh at S92. **#6–#9: Josh's rulings [S96].**
- §7G.4's `[S96]` rows and §7G.7: consequences of the 7D/7E rulings this session.
- Items tagged `[inferred]` are Claude's inference and **must be confirmed**.
- FrameFocus schema: **not** verified against the live repo — deferred to CC by design (§S).
- **Session-numbering correction [S97]:** this file previously tagged its rulings `[S94]`. Per `context96.md` the spec work is S96's (S94's commits are 113c stage 1). All former `[S94]` tags now read `[S96]`, matching `7d1-spec.md`'s correction.
