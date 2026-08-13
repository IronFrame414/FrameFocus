# 7G1 — QuickBooks Connector — Integration Plan

> **Status:** Research-backed plan (S92, extended and reconciled **[S96]**, with the metering question
> resolved against Intuit's partner documentation and two inferences confirmed **[S97]**). Decisions in
> §7G.2 are Josh's calls **except where tagged** `[inherited]`.
> QB API facts come from Intuit developer research and are marked **verify-in-sandbox** where they
> carry build risk. **No FrameFocus schema is asserted here** — the schema layer is left as
> `§S — TODO for Claude Code` per the M7 method. This plan is the input CC uses to build that schema.
>
> **Nature of 7G:** an integration, not an interview section. This is a plan, not a workflow trace —
> architecture §7.2 classes it _"No"_ for the approved-trace requirement.
>
> **[S97] — what changed.** The **metered-read cap is resolved, and it is the constraining case**: the
> quota is **per Workspace — aggregated across every connected company — not per `realmId`** (§7G.3a).
> Model A survives, but CDC cadence is now a **customer-count ceiling**, not an implementation detail.
> **#7's blocking dependency is cleared** — `projects.project_number` exists — though its format was
> wrong in the example. Both `[inferred]` items are confirmed, and **#3 gains a ruling**: with no QB
> Payments connection the invoice **carries no payment button at all**.
>
> **[S96] — the prior revision.** Four rulings (#6–#9) and three consequences of the 7D/7E rulings.
> The **void-with-a-payment** case is decided (#6); jobs get a **naming convention** (#7);
> **disconnected operation queues rather than blocks** (#8), making the sync queue a named build item;
> and void/reissue pairs are **annotated in the QB memo** (#9). The sync map gains the **negative-CO
> credit document** and exports the **billed** invoice amount. **[S97 — R4 ripple: the negative-CO
> credit document was later REMOVED (7D §4a reversed); its sync-map row is amended in §7G.4.]**
>
> **Provenance tags:** `[S96]` = ruled in the spec-reconciliation session · `[S97]` = ruled or verified
> in the trace-completion session · `[this session]` = Josh's call at S92 · `[inherited]` = carried
> from an existing doc.
>
> **[S97] The `[inferred]` tag class is retired from this file** — both inferences are resolved. With
> 7F's five also resolved, **the class is now retired across all five 7-series specs.**
>
> **Session-numbering correction:** this file previously tagged its rulings `[S94]`. Per `context96.md`
> the spec work is S96's (S94's commits are 113c stage 1). Former `[S94]` tags read `[S96]`.

---

## §7G.1 — Scope & role

7G is the QuickBooks Online connector. Governing principle (unchanged, from the QB strategy in
`CLAUDE_MODULES.md`): **FrameFocus runs daily operations; QuickBooks runs the books.** FrameFocus is
the source of truth for project data; QB is the source of truth for accounting. 7G never replaces QB
for accounting (no P&L, tax prep, or bank reconciliation inside FrameFocus).

7G is primarily an **outbound export path** for approved financial data, with **one inbound
exception**: electronic client payments originate in QB and flow back into FrameFocus (see §7G.4,
Model A).

> **[S97] That asymmetry is now also the cost model.** Writes are free and unlimited; reads are
> metered against a shared pool. See §7G.3a — it is the single most consequential fact in this
> document.

---

## §7G.2 — Decisions

1. **Connect.** `[inherited]` The **Owner** connects QuickBooks via **OAuth 2.0** from Company
   Settings. Admin cannot — connecting QB is billing-adjacent and the Owner is the billing contact of
   record.

2. **Job tie.** `[this session]` A **client = a QB Customer**; a **job = a QB sub-customer** nested
   under that client (via `ParentRef`). Every invoice's `CustomerRef` points at the **job**
   sub-customer, which ties all income to the job. **The QBO "Projects" feature is not used** — a
   Project is just a sub-customer under the hood, and the plain sub-customer path is unambiguously
   API-accessible while the Projects feature's API access is contested. FrameFocus is already the
   job-costing dashboard, so QB's Projects dashboard is not needed.

3. **Electronic payment — Model A.** `[this session]` The client pays via **QuickBooks' own pay-now
   link** carried on the QB invoice. Money and paid-status land in QB; FrameFocus **listens** (webhook)
   and marks its invoice paid + updates AR. FrameFocus never touches card data (QB handles PCI).
   - Before the client is redirected, FrameFocus shows a **clear notice that they are being sent to
     QuickBooks to complete payment**. Always on; not a toggle.
   - Electronic payment requires the company to have **QuickBooks Payments enabled.**

   **[S97 — CONFIRMED, and ruled] With no QB Payments connection, the invoice carries NO PAYMENT
   BUTTON AT ALL.** It is simply a viewable bill. The company falls back to **manual entry** (7E §2).

   > **Ruling, in Josh's words: _"if not linked, the invoice should remove any payment button. it
   > would simply be a viewable bill."_** Note what this deliberately is **not**: there is no
   > client-facing "you cannot pay online" notice. The pay affordance is **absent**, not explained.
   > That keeps the no-Payments case entirely clear of the Pre-Module 9 external-surface gate, since
   > no new client-facing copy is introduced.
   >
   > **[S97] Ripple into 7D — amendment owed.** 7D §13 and acceptance #17 present _"email with a pay
   > link + attached PDF"_ as unconditional. **It is conditional on QB Payments.** 7D must state the
   > two shapes: with Payments, pay link + PDF; without, PDF only.

4. **Income mapping.** `[this session]` Client invoices post to income via a **single "Construction
   Income" service Item**, **remappable** to whatever income account/Item the company actually uses.
   Income is income — the labor / material / sub / other split is a **cost** distinction and does
   **not** appear on invoices. [S91 wording fix:] the cost-category → cost-account mapping **lives in
   Company Settings** — `companies.gl_account_labor / _material / _subcontractor / _other`, shipped
   with 7A (`20260728010000`) — and 7C's bills **consume** it at export.
   _([S97] All four columns verified present in that migration.)_

5. **Sync timing — per-record.** `[this session]` Each financial record exports to QB the moment it
   clears **its own approval gate** — invoice on send, manual payment on entry, timesheet on approval.
   _("CO on approval" deleted [S91]; RESOLVED [S92] — a signed CO exports nothing; its dollars reach
   QB on the 7D invoice that bills them. See §7G.4.)_ Electronic payments arrive inbound via the
   webhook. **There is no separate batch "session" approval before export.**

6. **[S96] Void with a payment attached — BLOCK, don't unlink.** 7E permits voiding an invoice that
   carries a _partial_ payment. QuickBooks generally refuses to void an invoice with a linked Payment,
   wanting the payment removed first. **FrameFocus blocks the void once the payment has reached QB**
   and directs the user to credit or refund through 7E instead — rather than unlinking the QB Payment
   or substituting a CreditMemo. Keeps the books provably aligned and avoids a multi-step API dance
   that can fail partway.

   > **Consequence, stated plainly.** Electronic payments **originate** in QB, and manual payments
   > sync on entry (#5) — so a payment reaches QuickBooks almost immediately. In normal operation
   > **"partially paid → voidable" collapses to roughly "unpaid → voidable"**, and the window survives
   > mainly while QB is disconnected and the payment sits queued (#8). **CC: sandbox-confirm that QB
   > actually refuses** — if it permits the void, this can be revisited toward the wider rule.

7. **[S96; format corrected S97] Job naming in QuickBooks — project number + job name.**

   > **[S97 — the blocking dependency is CLEARED.]** #7 previously carried a `[VERIFY]` warning that
   > _"a project/job number has not been confirmed to exist."_ **It exists.**
   > `projects.project_number` — `20260704211000_module5_5a_projects.sql:85`, `text NOT NULL DEFAULT
public.next_project_number()`.
   >
   > **The format in the prior example was wrong.** `next_project_number()` returns **`PRJ-###`** — a
   > hardcoded `PRJ-` prefix with a 3-digit minimum that grows past 999 (`:42–68`). So the convention
   > is **`PRJ-042 — Kitchen Remodel`**, not `1042 — Kitchen Remodel`.
   >
   > **Two properties worth carrying into the build:**
   >
   > 1. Project numbers draw from the **same counter as estimates**
   >    (`companies.estimate_number_sequence`), so PRJ and EST numbers never collide.
   > 2. A **converted project copies the originating estimate's digits** rather than drawing a new
   >    one — EST-042 becomes PRJ-042. The number is therefore **stable across conversion**, which is
   >    useful when reconciling QB against FrameFocus.
   >
   > Satisfies §7G.6's constraint that `DisplayName` be unique across Customers/Vendors/Employees and
   > contain no `:`, tab or newline. **CC: confirm the separator character survives QB's constraints
   > and the composed name stays inside QB's length limit.**

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

All of the following is Intuit-documented behavior gathered at S92, buildable as written. The one
**live-only residual** is noted in §7G.6.

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
  connected; sandbox Payments is limited. **[S97] Where it is not connected, no pay button is rendered
  at all (#3).**
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

**Throttling (per company / realmId)**

- 500 requests/min per realmId, 10 concurrent, Batch endpoint 120/min, report/heavy endpoints 200/min.
  Over → HTTP 429 (ThrottleExceeded) → exponential backoff with jitter. Sandbox shares the same limits.
- Multi-tenant: partition storage and the sync job queue **by realmId**, with per-company throttling
  so one large company can't starve others' syncs.

> **Throttling and metering are different systems.** Throttling is **per realmId** and recoverable
> (429 → back off). Metering is **per Workspace** and terminal on the free tier (blocked, not
> throttled). See §7G.3a.

**Entities in play**

- **Customer** — client record; **sub-customer** = same entity with `ParentRef` set to the client.
- **Item** — the "Construction Income" service Item (income account behind it).
- **Invoice** — `CustomerRef` = job sub-customer; `Line[]` of `SalesItemLineDetail` with `ItemRef`.
- **Payment** — records money against one or more invoices (`LinkedTxn`). Supports one payment split
  across multiple invoices and one invoice taking multiple payments — **matches 7E §2 natively**, and
  7E §2 confirms multi-invoice checks are regular practice, not an edge case.
- **CreditMemo / RefundReceipt** — **[S96]** two distinct objects for two distinct things: a
  **CreditMemo** is a credit on the client's account; a **RefundReceipt** is money actually sent back.
  7E §5 distinguishes them, so 7G maps them separately.
- **Vendor / Bill / BillPayment** — sub bills and sub payments. **Owned by 7C**, listed here only so
  the connector surface is complete. _(~~[S97] `subcontractors.ein` verified present,
  `baseline_schema.sql:1520`.~~ **CORRECTED [S143] — see §7G.4's Vendor row and §7G.9.**
  The column MOVED to `subcontractor_financials.ein` at `20260903000000`.)_

**Inbound / catching QB-side changes**

- Subscribe to **webhooks** for Invoice and Payment events → an HTTPS endpoint (Vercel). This is how
  Model A learns a client paid.
- Use **CDC** (`changedSince`, 30-day window) as a backstop/reconciliation poll so nothing is missed
  if a webhook is dropped. **[S97] Its cadence is a cost decision — see §7G.3a.**
- Handle events **idempotently** (dedupe by QB entity id + change token).

**Sandbox**

- Intuit provisions a free sandbox company (up to five). The one **live-only residual** — pay-link
  rendering for a QB-Payments-connected company — needs a real Payments-enabled company (§7G.6).

---

## §7G.3a — Metering — **[S97, RESOLVED. Read this before designing the inbound path.]**

The prior revision flagged this as the **highest-consequence unknown in 7G** — _"is that cap per
company, or per app? … per app it is a hard cliff that stops every company's sync at once."_

**It is per app. Specifically, per Workspace.** Intuit's App Partner Program Guide:

> **"API calls and API Credits are aggregated across all production Apps in a given Workspace."**

Billing scope is the Workspace, not the `realmId`. For FrameFocus that means **every customer's reads
draw from one shared monthly pool.** The constraining case is the real one.

|                                 |                                                                                                                |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **Core (writes / data-in)**     | **Free and unlimited**, every tier                                                                             |
| **CorePlus (reads / data-out)** | Metered: Builder 500,000/mo · Silver 1,000,000 · Gold 10,000,000 · Platinum 75,000,000                         |
| **Builder overage**             | _"Any CorePlus API calls made above the included monthly Credit will be blocked."_ **Blocked, not throttled.** |
| **Paid overage**                | Metered at ~$3.50 → $0.25 per 1,000, depending on tier — not blocked                                           |
| **Tier cost**                   | Builder free · Silver ~$300/mo · Gold ~$1,700/mo · Platinum ~$4,500/mo                                         |

**What this does and does not threaten.**

The **entire outbound export path is free** — invoices, payments, bills, credit memos, vendors,
customers are all writes. Metering falls **only** on the inbound side: the follow-up read every
webhook forces (webhooks carry a reference, not a record), plus CDC backstop polling.

**CDC cadence, not payment volume, is the dominant cost.** Illustrative, on the free Builder tier:

```
Hourly CDC poll      ~720 reads / company / month   -> ~690 companies against 500k
15-minute CDC poll  ~2,880 reads / company / month  -> ~170 companies against 500k
```

Payment-webhook reads add on top but are small by comparison — a company sending 20 invoices a month
contributes on the order of tens of reads, not hundreds.

**Conclusion: Model A stands.** This does not invalidate the design, and the prior revision was right
to demand the answer before committing. But two things change:

1. **CDC cadence is a customer-count ceiling**, and must be chosen as such — not picked for
   responsiveness alone.
2. **The tier is a business decision with a number attached.** ~$300/mo doubles the ceiling; the jump
   to Gold is 10×. Whoever plans pricing should know the free tier has a hard, blocking edge.

---

### ⚠️ THE CADENCE, RULED — **hourly CDC [Josh, S143, 2026-08-13]**

> **This section stated the constraint correctly and then never chose.** The S142 survey's
> finding was exactly that: hourly and 15-minute are presented as *illustrative*, the text
> concludes the cadence "must be chosen as such", and no cadence is named — here or in §S.
> A constraint with no decision attached is not a decision.

**Ruled: hourly.** The reasoning, recorded rather than the bare verdict, because a verdict with
no reasoning is what a later reader overturns by accident:

- **Josh expects 200–400 companies** _(his figure, S143)_.
- Hourly reaches **~694** on the free Builder tier. 400 companies at hourly is ~288,000 reads —
  a little over half the pool.
- 15-minute reaches **~173**, so it is **already past its ceiling at 200 companies** and roughly
  3× over at 400.
- And it fails as a **cliff, not a slowdown**: Builder overage is *blocked*, not throttled, and
  the quota is per Workspace — so **every connected company's sync stops at once**, with no
  per-tenant degradation and no warning unless the read-budget telemetry §S asks for exists.

So 15-minute is unusable at the planned scale and hourly costs nothing to choose now.
**Silver (~$300/mo) becomes a question past ~694 companies, not at 200.**

> ### ⚠️ THE NUMBERS ARE RE-CONFIRMATION-OWED. THE RULING IS NOT.
>
> The ruling is firm. **The arithmetic under it is not yet verified against Intuit.** Every
> figure in this section — the 500,000 Builder quota, the tier prices, and the
> Workspace-aggregation quote itself — comes from this document's own S97 research. **Neither
> the S142 survey nor S143 performed any external lookup**; both read this file. §7G.9 already
> says "tier figures should be re-confirmed at build", and that is unchanged.
>
> If the quota or the aggregation scope turns out to differ, **the ceiling arithmetic moves and
> the ruling may need revisiting** — hourly is chosen because it clears the planned scale with
> room, not because it is the only cadence that could.
>
> Also still open, and it would cut the dominant cost if it went the right way: whether
> webhook-triggered reads can be batched, or whether any payment detail arrives in the
> notification itself.

> **Still open for CC:** confirm the tier figures at build — they are current as of Intuit's 2025
> program launch and this reading. Confirm also whether webhook-triggered reads can be batched or
> whether any payment detail arrives in the notification itself, which would cut the dominant cost.

---

## §7G.4 — Sync map (FrameFocus ⇄ QuickBooks)

Direction is FF → QB unless noted.

**[S92 — governing principle, revenue side: QB receives INVOICES ONLY.** The invoice is the device
incoming money is tied to. Neither the original contract nor a signed change order ever touches QB —
**promised value stays in FrameFocus; billed value goes to QB.** Consequence, stated so this doesn't
get re-litigated: QB cannot answer "what is this job worth" — that lives in FrameFocus only. Payables
are unchanged: sub bill/commitment → Bill and sub payment → BillPayment still export — real money out,
needed for expense accounting and 1099s.]

- Client → QB **Customer** _([S92] created lazily at first invoice export, not eagerly at client
  creation — nothing reaches QB until an invoice needs it)_
- Job → QB **sub-customer** under the client _([S92] created lazily at first invoice export.
  **[S96/S97]** named per #7: **`PRJ-### — Job Name`**)_
- Sub / vendor (with EIN) → QB **Vendor** _(7C)_

  > ## ⚠️ CORRECTED [S143] — THE EIN MOVED, AND THE FAILURE IS SILENT
  >
  > _Superseded text, quoted rather than deleted:_ _"live source: the `subcontractors` table,
  > `ein` verified [S97]"._
  >
  > **`subcontractors.ein` no longer exists.** `20260903000000_subcontractor_financials.sql`
  > (S122, TECH_DEBT #132) moved `ein`, `default_hourly_rate` and
  > `default_markup_percent` onto **`subcontractor_financials`** — a table created
  > precisely because `subcontractors_select_authenticated` has no role arm and was
  > leaking the EIN to every role. Its SELECT, INSERT and UPDATE policies are all
  > **Owner/Admin**.
  >
  > **Why this matters more than a moved column.** Nothing errors when you get it
  > wrong:
  >
  > * a worker doing a plain `subcontractors` select finds **no such column**;
  > * a worker running under a **non-Owner session** gets **NULL from the side
  >   table** — RLS filters the row, and `getSubcontractorFinancials()` deliberately
  >   returns `null` for "refused" and "absent" alike.
  >
  > Either way the Vendor exports **with no tax id**, no error is raised, and the
  > 1099 this row exists for is wrong. Read `subcontractor_financials.ein`, and
  > assert the read succeeded rather than treating NULL as "this sub has no EIN".
- Client invoice → QB **Invoice** (CustomerRef = job sub-customer; single income Item) _(7D)_
  **[S96, reworded S97 per 7D §8 as amended] Export the BILLED amount, never the derived one.**
  _Superseded wording: "a **billed** figure (the recorded override)… **7D's disposition figures are
  QB-neutral** — written-off and held-back amounts were never billed, so nothing exports for
  them."_ 7D §8 now defines billed as **derived lines + discount lines**: a **discount IS a billed
  (negative) line** and exports inside the invoice total, while **unselected costs** (7D §6.2) were
  never billed and export nothing. Either way QuickBooks receives what the client was actually
  charged, or QB income disagrees with the invoice in the client's hands.
  **[S97]** The pay-link flags are set **only where QB Payments is connected**; otherwise the invoice
  exports with no payment affordance (#3).
- **[S97 — REPLACES the credit-document row] Negative CO → a CREDIT LINE on a USER-CHOSEN invoice
  (7D §4a as amended — _"next invoice"_ superseded by the placement ruling); NO CreditMemo.**
  _Superseded [S96] row: "Negative-CO credit document → QB CreditMemo (7D §4a issues
  it; 7E §3a applies it)… the **credit document that bills it** exports, because billed value goes
  to QB — and a credit is billed value with a minus sign."_ 7D §4a was REVERSED (R4): there is no
  credit document. QuickBooks sees the **smaller carrying invoice**, so deductive-CO value still
  reaches QB inside ordinary invoice export — the permanent-income-overstatement concern the
  superseded row guarded against stays satisfied, by a simpler route. "A signed CO exports nothing"
  is now true WITHOUT exception; the only separate export is the no-balance-remaining case: a 7E
  **refund → RefundReceipt** (7E §3a as amended).
- Client payment, **electronic** → **INBOUND** from QB via webhook (Model A) _(7E)_
- Client payment, **manual** (check/cash) → QB **Payment** with `LinkedTxn` → Invoice and
  `ProcessPayment: false` _(7E — **[S96]** recorded by Owner/Admin only, per 7E §8)_
- **[S96] Credit on account → QB CreditMemo; money returned → QB RefundReceipt** — two objects, per
  7E §5. **[S97]** Origin: **7E only** — overpayment credits and refunds. _Superseded split:
  "negative-CO credits originate in **7D**"_ — a negative CO no longer produces a credit object at
  all (see the amended row above).
- Sub bill / commitment → QB **Bill**; sub payment → QB **BillPayment** _(7C — [S91] live sources are
  the payable `expenses` rows (bills / schedule stages) and `expense_payments`. Payment `amount` is
  GROSS; cash out is NET of `retainage_withheld` — map accordingly at build.)_
  > **[S97]** Sub-retainage release is an ordinary BillPayment. Its **timing** rule lives in 7E §4.2 —
  > the earlier of client payment or 30 days after project completion, **Owner-only**, and explicitly
  > **not** pay-when-paid. No QB consequence; recorded so the timing is not mistaken for a sync rule.
- ~~Approved change order → QB contract adjustment~~ **[S91 — deleted, FALSE on two counts: the
  contributing CO status is `'signed'` (`change_orders_status_check`, `20260704215000:70`), and
  contract value is DERIVED at read — there is no FF-side write to mirror. RESOLVED [S92]: a signed CO
  exports NOTHING.]**
- Approved timesheet → QB **Time / Payroll** entry _(M6 / payroll)_
  > **[S96/S97] Do not conflate with 7D §7's billable hours.** Payroll hours and **billable** hours are
  > different populations off the same M6 data — 7D bills approved hours **summed per person per day
  > and rounded UP to the HALF hour**; payroll exports actual logged time. One rounding rule must
  > never leak into the other.
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
  **[S96, superseded S97]** _Superseded exception: "But its negative counterpart's credit document
  DOES export — see §7G.4."_ With R4 there is no credit document — the S92 rule now holds WITHOUT
  exception; a negative CO reaches QB as the smaller user-chosen carrying invoice (§7G.4 as
  amended).
- **RESOLVED (docs) — pay-link on accounting scope.** Enabling the invoice pay-link is an
  accounting-scope Invoice operation (the `AllowOnline*Payment` flags); no Charges API / payment scope
  needed for Model A. **Live-only residual:** confirm the link renders for a real QB-Payments-enabled
  company (sandbox Payments is limited).
- **RESOLVED (docs) — sub-customer income posting.** A job is created as a Customer with `Job: true`
  and `ParentRef` = the client (accounting scope; up to 4 nesting levels). An invoice with `CustomerRef`
  = that job sub-customer posts its income to the job. QBO's `IsProject` flag is **read-only and
  ignored on create**, so the Projects feature genuinely _cannot_ be created via API — confirming #2.
- **[S97] RESOLVED (docs) — the metered-read cap is per Workspace, not per realmId.** See §7G.3a.
  This was #1 in the prior verification queue and the only item that could have invalidated Model A.
  **It does not** — but it makes CDC cadence a customer-count ceiling.
- **[S97] RESOLVED (repo) — a project number exists.** `projects.project_number`, format `PRJ-###`.
  This was #3 in the prior queue and it blocked #7. See #7 for the corrected convention.

**Verification queue, ordered by consequence — as it now stands [S97]:**

1. **Void mechanics with a linked payment** — confirm QB refuses, which is what #6 assumes. If it
   permits the void, #6 can be revisited toward a wider window.
2. **Pay-link rendering** — the live-only residual; needs a real QB-Payments company, not sandbox.
3. **Metering tier figures** — confirm current numbers, and whether webhook-triggered reads can be
   batched or avoided (§7G.3a).
4. **Job `DisplayName` composition** — separator character and length limit against QB's constraints
   (#7).

**Build notes (for CC):**

- **Job `DisplayName`** must be unique across all Customers/Vendors/Employees and may not contain `:`,
  tab, or newline — #7's convention exists to satisfy this.
- **`BillWithParent`** on the job controls billed-with-parent vs. billed-separately; set for per-job
  billing (confirm exact behavior in sandbox).
- **Pre-Module 9 external-surface gate:** Model A **sidesteps** it for the pay surface — QB hosts the
  pay page, FrameFocus only shows the redirect notice. **[S97]** And where QB Payments is absent, no
  client-facing surface is introduced at all (#3). The gate still governs any _other_ client-facing
  surface, e.g. 7F's sub-inbound e-signature link.
- **QB Payments onboarding:** a company with no QB Payments account gets manual-only pay; surface this
  clearly at connect time. **[S97]** And render no pay button on the invoice (#3).
- **"Each financial action optionally syncs"** (existing QB-strategy rule): per-record sync fires at
  approval, but a per-action/company toggle for _whether_ a given action syncs at all may exist.
  Reconcile against the live Company Settings model at build — do not over-design it here.

---

## §7G.7 — The sync queue — **[S96; extended S97 — the largest build item in 7G]**

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

**[S97 — CONFIRMED] Unrecoverable failures escalate; they do not retry forever.** A rejection that
will fail identically on every attempt — a duplicate `DisplayName`, a malformed record QB will never
accept — must reach a **surfaced, actionable state** rather than looping. The distinction is between
_transient_ failure (network, 429, expired token → retry) and _terminal_ failure (QB will never accept
this → stop, warn, require a human fix). **CC defines the retry ceiling and the escalation surface at
build.**

---

## §S — Schema layer — TODO for Claude Code

**Do not take table or column names from this document.** CC reads the **live** schemas — 7D/7E
(invoice, payment), 7C (bill, vendor), and Company Settings — confirms real field names, then builds.
This section states only _what must be storable_, not how.

- **Per company:** `realmId`; encrypted OAuth refresh token + access token/expiry (**rotating —
  overwrite on every refresh**); a **QB-Payments-enabled** flag _(**[S97]** it gates whether the
  invoice renders a payment button at all — #3)_; the **income-Item mapping** (default "Construction
  Income", remappable); **[S96]** the connection state (**connected / needs-reauth**) driving #8's
  banner.
- **Per client:** the QB **Customer** id.
- **Per job:** the QB **sub-customer** id. **[S97]** The naming convention reads
  `projects.project_number` (`PRJ-###`) plus the job name — both already exist; no new field needed.
- **Per invoice:** the QB **Invoice** id; a **sync status** + last-synced timestamp; **[S96]** the
  **memo text** for void/reissue pairs (#9).
- **Per payment:** the QB **Payment** id — whether pushed (manual) or received via webhook
  (electronic) — linked to the FrameFocus invoice.
- **Per credit / refund:** **[S96]** which QB object it maps to — **CreditMemo** (credit on account)
  or **RefundReceipt** (money returned) — per 7E §5. **[S97]** _Superseded inclusion: "incl.
  negative-CO credits"_ — those are now a credit line on a user-chosen invoice, not a QB credit
  object (§7G.4 as amended).
- **Webhook handling:** an event log / idempotency key store to dedupe QB events.
- **[S96] The sync queue itself:** durable, per-`realmId`, dependency-ordered, self-pacing, with
  retry/backoff state, per-record status, and **[S97]** a terminal-failure state distinct from
  transient retry (§7G.7).
- **[S97] Read-budget telemetry.** Because the CorePlus quota is **per Workspace across all customers**
  (§7G.3a), monthly read volume needs to be **countable** — otherwise the first sign of trouble is
  every company's sync stopping at once. Count reads; alert before the ceiling.

> ### **[S143 — RULED] The sync worker's privilege level, decided before it is written**
>
> **Service role, scoped by an EXPLICIT `company_id` on every query** — the
> `invoice-derivation-server.ts` pattern, and the tenant established by the caller before the
> worker runs.
>
> **Why it has to be recorded here rather than discovered at build.** The worker needs
> `subcontractor_financials.ein` for the Vendor export (§7G.4), and that table is Owner/Admin
> by RLS. So the three options were:
>
> | | |
> | --- | --- |
> | An Owner session | No bypass, but a cron has no human session to borrow. Unusable. |
> | Bare service role | Works, and **bypasses RLS entirely** — the same trap `record_client_payment` and `invoice-derivation-server.ts` carry, protected only by the checks it makes itself. Every future edit becomes a potential cross-tenant leak. |
> | **Service role + explicit `company_id`** | **Ruled.** The bypass is real but every query is tenant-scoped by construction, and the scoping is visible in each call rather than assumed from the session. |
>
> **The cost, stated plainly:** the worker is protected only by its own discipline. It must
> take `company_id` as a parameter, never derive it from a row it just read, and never run a
> query without it. `invoice-derivation-server.ts` carries this warning at the top of the file
> and 7G's worker must carry the same one.

CC also confirms, against the live schema:

- That the "Construction Income" default Item and its remap target exist / can be created per company.
- That the company's QB Payments connection is live, so the pay-link actually renders.
- **[S96]** That 7D's invoice exposes the **billed** amount distinctly from the derived one, and
  **retainage withheld** separately from the invoice face.

---

## §7G.8 — Amendments this spec obliges elsewhere

- **[S97] `7d1-spec.md` §13 and its pay-link acceptance** — the pay-link delivery path is
  **conditional on QB Payments**. With it: email carries pay link + PDF. Without it: PDF only,
  **no payment button** (#3). **[S97 — DISCHARGED:** 7d1 §13 now carries the two-shape rule and
  acceptance **#18** tests it; _superseded claim: "Both currently read as unconditional."_]**
- **`module7-architecture.md` §7.3** — redraw the dependency map so 7G feeds 7E's payment path
  (§7G.5). An [S91] footnote records this; the diagram itself is still not redrawn.

---

## §7G.9 — Provenance

- QB API behavior §7G.3: Intuit developer documentation + research at S92. **Not yet exercised in a
  sandbox against a real FrameFocus flow.**
- **§7G.3a metering [S97]:** researched against Intuit's App Partner Program Guide and corroborating
  partner documentation this session. The Workspace-aggregation quote is verbatim. **Tier figures
  should be re-confirmed at build.**
- Decisions §7G.2 #1–#5: confirmed by Josh at S92. **#6–#9: Josh's rulings [S96].** **#3's
  no-payment-button ruling and #7's format correction: [S97].**
- **Repo-verified [S97]:** `projects.project_number` + `next_project_number()`
  (`20260704211000:42–68, :85`) · `companies.gl_account_labor/_material/_subcontractor/_other`
  (`20260728010000`) · ~~`subcontractors.ein` (`baseline_schema.sql:1520`)~~ **STALE — the
  column moved to `subcontractor_financials.ein` at `20260903000000` (S122); corrected
  [S143], see §7G.4** ·
  `change_orders_status_check` (`20260704215000:70`).
- **[S97] Both `[inferred]` items resolved** — the manual-entry fallback (#3) and the terminal-failure
  escalation (§7G.7). The tag class is retired from this file, and with 7F's five also resolved, from
  the 7-series entirely.
- FrameFocus schema otherwise: **not** asserted — deferred to CC by design (§S).
