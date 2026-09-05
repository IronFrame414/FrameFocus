# 7G2 — QuickBooks Connector — build-ready spec

> **Status:** Build-ready. Consumes `7g1-spec.md` (the S92/96/97 research-backed PLAN) and the shipped
> DB scaffolding (slices 1–3, S148/S149), and adds the **S103 rulings**. Verification for this prep was
> code + Intuit-doc reading; sandbox was NOT called (see §3.1).
>
> **Which file, and why [prep decision].** `7g1-spec.md` is a 602-line ruled plan — kept, referenced,
> not rewritten. `docs/specs/7g-quickbooks-spec.md` is an **empty 0-byte stub** (recommend Josh delete
> it; not touched here). This `7g2-spec.md` is the active build spec. Where 7g2 and 7g1 conflict, **7g2
> (S103) wins**; 7g2 says so in place.
>
> **Env contract (de facto — matched, not renamed):** `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`,
> `QBO_REALM_ID`, `QBO_ENVIRONMENT=sandbox`. No existing 7G spec named env vars; these come from
> `apps/web/.env.local` and the Intuit portal registration. **Match them.**
>
> **Registered Intuit routes — build at EXACTLY these paths or OAuth breaks:** callback
> `/api/quickbooks/callback`; disconnect `/api/quickbooks/disconnect` (Intuit-initiated; **does not
> exist**); launch `/dashboard/settings/accounting` (exists); host `ezcontractorbinder.com`.

---

## §1 — Headline (the job in ten lines)

1. 7G connects one QuickBooks Online company per FrameFocus company and keeps the **accounting** in sync:
   invoices out, client payments back, expenses out. **FrameFocus runs operations; QB runs the books.**
2. **Scope is accounting-only** [S103]. The app never calls the Payments API. It syncs its invoice to QB;
   QB returns a **shareable pay-link**; that link is surfaced **on the platform invoice**, where the client pays.
3. **What already exists (shipped, inert):** the ENTIRE DB layer — connection + Vault tokens on
   `companies`, entity-id/sync-status columns on contacts/projects/invoices/payments/refunds/expenses,
   `qb_sync_queue`, `qb_webhook_events`, `qb_read_budget`, all write-guards (slices 1–3, S148/S149).
4. **What is new (this build):** the OAuth **callback route**, the Intuit-initiated **disconnect route**,
   the **sync worker**, the **webhook route (+ signature verification)**, every **Intuit API call**, the
   **UI**, and the **disclosure** placements. Nothing calls Intuit today.
5. **Where the risk is:** (a) a half-synced invoice is a money defect — the queue's dependency-ordering
   and one-live-per-entity guarantees are load-bearing; (b) the metered-read pool is **per Workspace**,
   blocking (not throttling) on the free tier; (c) the pay-link's live *rendering* needs a real
   QB-Payments company and is **not sandbox-verifiable** (§3.1).
6. **The irreversible decision (OAuth scopes) is SAFE:** the pay-link is produced by accounting-API
   Invoice fields (`AllowOnline*Payment`); the payment scope is **not required** and must NOT be added.
7. **Void a paid invoice is already DB-enforced** — the platform blocks it and routes to credit/refund,
   matching QB's own refusal. No live defect (§3.2).
8. **Smallest shippable slice:** OAuth connect + token store + the Settings connection UI (read the state
   the schema already models). It calls Intuit once (token exchange), writes no accounting, and unblocks
   everything else. Ships behind the existing `settings/accounting` tab.
9. **Disclosure is first-class build scope** [S103, Josh said YES to Intuit]: "Payment service provided
   by Intuit Payments Inc." on marketing/pricing, the invoice pay-link surface, and the portal pay surface.
10. Everything queues while QB is unreachable and replays on reconnect; nothing is ever silently dropped.

---

## §2 — What exists vs what is new (ground truth)

**SHIPPED (schema only, nothing calls Intuit) — do not re-migrate:**

| Area | Where | Migration |
| --- | --- | --- |
| Connection state + Vault token pointer + payments flag + income-Item + state machine + 5-yr ceiling, Owner-only guard, one-realm-per-tenant | `companies.qb_*` | `20260928000000_qb_connection.sql` |
| Client→Customer, job→sub-customer, void memo | `contacts.qb_customer_id`, `projects.qb_sub_customer_id`, `invoices.qb_void_memo` | `20260929000000_qb_entity_ids_and_queue.sql` |
| Per-record sync status/id/synced-at on 5 objects | invoices, client_payments, client_refunds, expenses, time_clock_sessions | `20260924/28/29000000` |
| Durable per-realm dependency-ordered sync queue | `qb_sync_queue` | `20260929000000` |
| Webhook idempotency store | `qb_webhook_events` (UNIQUE `intuit_event_id`, append-only) | `20260930000000_qb_webhooks_and_read_budget.sql` |
| CorePlus read counter | `qb_read_budget` (2xx-only, per company/month) | `20260930000000` |

**NOT built (this spec's build surface):** OAuth callback route · disconnect route (Intuit-initiated) ·
the sync **worker** · the **webhook route** + Intuit-Signature verification · every Intuit REST call ·
all UI (connect, customer-conflict, disconnect, pay-link, disclosure) · expense edit/delete → QB
update/void parity · pay-link storage · CDC backstop poll ·
read-budget alert.

**Worker privilege [ruled S143]:** service role + an **explicit `company_id` on every query** (the
`invoice-derivation-server.ts` pattern). It is protected only by its own discipline — take `company_id`
as a parameter, never derive it from a just-read row, never query without it.

---

## §3 — Findings established this run (verified, not assumed)

### §3.1 — Pay-link ⇒ the scope decision is SOUND. (Sandbox NOT called — see below.)
The pay-link is produced by **accounting-API Invoice fields** — `AllowOnlinePayment`,
`AllowOnlineCreditCardPayment`, `AllowOnlineACHPayment = true`, settable on create or sparse-update
(7g1 §7G.3/§7G.6, from Intuit docs). **`com.intuit.quickbooks.payment` is NOT required and must NOT be
added** (scopes are irreversible once saved). **The irreversible decision rests on the scope
*requirement*, which is resolved — not on the live render.**

⚠️ **RESIDUAL, and it is honest:** whether the link actually **renders** depends on the connected QBO
company having **QuickBooks Payments** enabled; **sandbox Payments is limited**, so live rendering is
**not sandbox-verifiable** (7g1 §7G.6 residual #2). I did **not** call the sandbox this run: an OAuth
authorization-code flow needs a browser consent step (unavailable headless) and observing a real
pay-link would require *writing* an invoice (prohibited this run). **This does not reopen the scope
decision** — accounting-only is safe. It DOES mean the render must be confirmed once against a real
QB-Payments company at build (Q1).

`companies.qb_payments_enabled` = the connected **QBO company's own Payments capability** (read via the
accounting API), NOT an app scope. This reconciles S148's "no QB Payments → no pay button" with S103's
accounting-only ruling: same design, no contradiction.

### §3.2 — Voiding a PAID invoice is already blocked, DB-deep. No live defect.
`canVoidInvoice()` (`invoices-shared.ts:341-375`) + trigger `enforce_invoice_void_authority`
(`20260923000000_invoice_void_authority.sql:69-111`, which reads `client_payment_applications`):
- unpaid → Owner/Admin; paid/partial **not in QB** → **Owner only + warning**; **paid AND QB-synced →
  NOBODY** ("use 7E credit/refund"); already voided → blocked. Void is irreversible; voided invoices kept forever.
- This matches 7g1 §7G.2 #6 and QB's own refusal. ⚠️ **RULED [S103, Q2]: a PAID invoice cannot be voided,
  FULL STOP** — the QB-synced qualifier was never the reason (the money moved regardless of whether QB
  knows the invoice exists). _Superseded prep framing, quoted not deleted: "an Owner CAN still void a paid
  invoice that has not reached QB… → Q2."_ **This is a LIVE money defect fixed in Part B** (migration
  tightening `enforce_invoice_void_authority` to key on PAID, not paid-AND-synced). The remedy stays a
  **credit memo** (adjusts the balance, preserves invoice+payment+audit) or a **refund**; the refusal
  message names that path.

### §3.3 — No stored credit-memo entity; credits are DERIVED. Refunds are explicit.
No credit-memo table. A void-with-payment produces a **derived** credit (unapplied payment surplus,
`payments-shared.ts creditAvailableOnPayment`). `client_refunds` holds explicit rows and already carries
`qb_object_type ∈ {credit_memo, refund_receipt}` — so QB **CreditMemo** (credit on account) and
**RefundReceipt** (money back) map cleanly (7E §5). ⚠️ A derived credit has **no row**. **RULED [S103,
Q3]: a derived credit syncs to QB when it is APPLIED, not when recorded** — the QB CreditMemo is created
at the point the credit is applied (to a new invoice, or refunded), which is where a concrete transaction
exists to push. Nothing syncs at the moment the void merely created the derived credit.

### §3.4–3.7 — see §2 (schema) and §6 (failure modes). Webhook signature verification is **not built**
and there is **no verifier-token storage** yet (only event-id dedupe exists) → build item + Q6.

---

## §4 — `input → store → output` traces (real numbers)

> Realm `9341457813274121` (sandbox). QB ids below are illustrative. **Money that does not foot is
> flagged, not adjusted.**

### Flow 1 — Invoice OUT (this is what makes the pay-link exist)
**Input:** `INV-1042`, job `PRJ-042 — Kitchen Remodel`, client "Acme Builders", `billed_total = $8,400.00`,
**no retainage**, status → `sent` (Owner/Admin approved).
**Store:** enqueue three `qb_sync_queue` rows in dependency order — `customer:create` → `sub_customer:create`
(depends_on customer) → `invoice:create` (depends_on sub_customer). Worker drains:
1. `contacts.qb_customer_id` null → create QB **Customer** "Acme Builders" → id `58`; write back `58`.
2. `projects.qb_sub_customer_id` null → create QB **sub-customer** "PRJ-042 — Kitchen Remodel",
   `Job=true`, `ParentRef=58` → id `59`; write back `59`.
3. Create QB **Invoice**, `CustomerRef=59`, one `SalesItemLineDetail` `ItemRef=`Construction Income
   (`companies.qb_income_item_id`), `Amount=8400.00`, `AllowOnline*Payment=true` → id `145`,
   `TotalAmt=8400.00`, response carries the shareable **InvoiceLink**. Write back
   `invoices.qb_invoice_id='145'`, `qb_push_status='pushed'`, `qb_synced_at=now`; **STORE the pay-link on
   `invoices.qb_invoice_link`** [RULED S103, Q4 — stored, not read-on-demand: it prints on a client-held document].
**Output:** the platform invoice shows a **"Pay online"** button → the QB pay-link (only when
`qb_payments_enabled`). **Foots:** billed lines `$8,400.00` = QB `TotalAmt $8,400.00`. ✓

**Retainage case — RULED [S103, Q7], and it now FOOTS.** _Superseded prep text, quoted not deleted:
"where it does NOT foot cleanly, flagged not adjusted… How retainage is represented in QB is UNDECIDED."_
**Send QB the FULL invoice amount, with retainage as a LINE ITEM; the held portion sits OPEN until
released; releasing retainage is a PAYMENT against the existing open invoice — never a second invoice.**

`INV-1043`, `billed_total $12,500.00`, `retainage_withheld $1,250.00`, `amount_receivable $11,250.00`:
- **QB Invoice `TotalAmt = $12,500.00`** — the work line(s) at the full amount, plus a visible **retainage
  line item** designating the `$1,250.00` held. One invoice, the whole job.
- **Initial payment** (Flow 2, on client pay) = `$11,250.00` against `INV-1043` → **balance `$1,250.00`
  OPEN** (the retainage). Invoice not yet `paid`.
- **Retainage release** (7E §4.2 timing — earlier of client payment or 30 days after completion,
  Owner-only) = a **second Payment of `$1,250.00` against the SAME open invoice** → **balance `$0.00`,
  invoice `paid`.** NOT a new invoice.
- **Foots:** `$11,250.00 + $1,250.00 = $12,500.00` = QB `TotalAmt` = `billed_total`. ✓ (The exact QB line
  mechanic — a held-retainage line vs a receivable-holdback account — is a build detail; the money model
  above is one invoice at full face, closed by two payments that sum to it.)

### Flow 2 — Payment received BACK (Model A, electronic)
**Input:** client pays `$8,400.00` via the pay-link. QB creates **Payment** `201`, `LinkedTxn` → Invoice
`145`, fires an Invoice/Payment **webhook** to `/api/quickbooks/webhook`.
**Store:** verify Intuit-Signature (HMAC-SHA256, verifier token) → **dedupe** by inserting
`qb_webhook_events(intuit_event_id='e-77…')`; on UNIQUE-conflict, drop (already processed). Enqueue the
required **CorePlus read** of Payment `201` → **increment `qb_read_budget`** (this is the metered call;
the write side is free). Read returns `TotalAmt $8,400.00`, `LinkedTxn Invoice 145`. Match via
`invoices.qb_invoice_id='145'`. Insert `client_payments`: `amount $8,400.00`, `method='quickbooks'`,
`qb_payment_id='201'`, `qb_push_status='pushed'`, `qb_synced_at=now`; apply to invoice → status `paid`; update AR.
**Output:** invoice shows **Paid**; AR updated (Owner/Admin). **Foots:** client `$8,400.00` = QB Payment
`$8,400.00` = FrameFocus `client_payments.amount $8,400.00`. ✓

### Flow 3 — Expenses IN (expense → QB Bill)
**Input:** `EXP-556`, `PRJ-042`, `cost_category='material'`, supplier "Home Depot", `amount $2,340.50`,
status → `approved`.
**Store:** enqueue `vendor:create` (if `qb` vendor id absent) → `bill:create` (depends_on vendor). Worker:
create QB **Vendor** "Home Depot" → id `77`; create QB **Bill**, `VendorRef=77`, one
`AccountBasedExpenseLineDetail` `AccountRef=companies.gl_account_material`, `Amount $2,340.50` → id `312`;
write back `expenses.qb_bill_id='312'`, `qb_push_status='pushed'`, `qb_synced_at=now`.
**Output:** QB carries a `$2,340.50` payable Bill. **Foots:** `$2,340.50` = QB Bill `$2,340.50`. ✓
- **`cost_category='subcontractor'`** is the **7C** path (Vendor/Bill with EIN from
  `subcontractor_financials.ein` — Owner/Admin RLS; read must ASSERT success, never treat NULL as
  "no EIN", 7g1 §7G.4). material/other post to `gl_account_material`/`gl_account_other`.
- **Edit / delete → QB parity [RULED S103, Q9]:** amount edited → enqueue `bill:update` (sparse update to
  Bill 312); soft-deleted → enqueue `bill:void` (transaction delete in QB). **Neither is wired today** — a
  build item, so an edit/delete here never leaves QB stale.
- **No reverse import [RULED S103, Q5].** _Superseded prep text, quoted not deleted: "a Bill created **in
  QB** and edited on the platform… → Q4-expenses decides whether 7G imports at all."_ **Sync is two-way,
  not three: expenses are recorded in EZCB and pushed OUT to QB as Bills; they are never entered in QB and
  pulled here.** There is therefore no QB-imported-expense case and no `source` marker is needed (M-C dropped, §7).

### Void trace (unpaid invoice)
**Input:** `INV-1042` ($8,400, `qb_invoice_id=145`, **unpaid**) voided by Owner; `void_reason` required
(7D §9, internal); reissued as `INV-1044`.
**Store:** status → `voided`, `voided_at/by`, `void_reason`; `qb_void_memo="replaced by INV-1044"` (7g1 #9;
successor gets "replaces INV-1042"). Enqueue `invoice:void`. Worker POSTs Invoice `145` `operation=void`
→ QB zeroes it (income backed out); set `qb_synced_at`. **The void reason is NOT sent to QB** (7g1 #9).
**Output:** QB `145` voided; FrameFocus voided. **Foots:** `$8,400.00` income backed out both sides. ✓

### Paid-invoice-refusal trace (the rule QB shares)
**Input:** `INV-1043` **paid**, Payment `201` synced to QB. User attempts void.
**Store:** `enforce_invoice_void_authority` reads `client_payment_applications` (`$8,400.00` applied) →
**RAISES / blocks**; `canVoidInvoice()` returns "paid+synced → NOBODY." **No queue row is created** (QB
would refuse anyway). The correction is a `client_refunds` row → syncs as QB **CreditMemo** (credit on
account) or **RefundReceipt** (money back), preserving invoice + payment + audit trail.
**Output:** void disabled with "This invoice has a payment — issue a credit or refund instead." **Foots:**
nothing voided; adjustment carried by the credit/refund. ✓

---

## §5 — UI (screens, roles, entry points)

**5.1 Settings → Accounting (exists) — the connection surface.** Entry: `/dashboard/settings/accounting`.
Role: **Owner-only** to connect/disconnect (CLAUDE.md owner-only #4; DB already Owner-guards the columns).
Admin sees the state read-only. Shows: **Connect to QuickBooks** button (OAuth) when `disconnected`;
connection card (realm, connected-since, last-rotated, reauth-by) when `connected`; a **needs_reauth**
amber banner (§6) with **Reconnect**; the **income-Item** name + **remap**; a **QuickBooks Payments
status** line.

**Onboarding copy [RULED S103, Q10]:**
- **No income Item found:** tell the user QuickBooks needs a **product or service** to bill against and to
  **create one there**. ⚠️ **DO NOT auto-create it** — that writes to their chart of accounts on a guess.
  The first invoice push waits (`queued`) until an Item is chosen/remapped.
- **No QuickBooks Payments:** **NON-BLOCKING.** Invoices **still sync**; there is simply **no pay-link**
  (a viewable bill, manual entry per 7E; no client-facing "cannot pay" copy, 7g1 #3).

**5.2 Customer-conflict prompt.** Trigger: worker about to lazy-create a Customer whose `DisplayName`
collides with an existing QB Customer. **ASK — never auto-create a duplicate** [S103]. A modal (Owner/Admin):
"A QuickBooks customer named 'Acme Builders' already exists — **link to it** or **create a new one**?"
Linking writes `contacts.qb_customer_id`; the queued invoice waits (stays `queued`) until resolved.

**5.3 Disconnect prompt.** Entry: the connection card (**Owner-only**). **Offer BOTH** [S103]: **Keep the
QuickBooks data** (leave `qb_*_id`s in place; state → `disconnected`; queue pauses) or **Clear it** (null
the entity-id links; the connection secret is revoked + Vault row cleared). Both revoke the token with
Intuit. The **Intuit-initiated** `/api/quickbooks/disconnect` does the "keep data" variant by default
(Intuit gives no user choice) and sets `revoked`.

**5.4 Pay-link on the invoice** [S103 — added to the PLATFORM invoice]. Surface: the invoice view/PDF and
the send-email path (7D §13, already two-shape). When `qb_payments_enabled` and the invoice is synced,
show **"Pay online"** → the QB pay-link. When not, **no pay affordance** (viewable bill, 7g1 #3) — no
explanatory copy (keeps clear of the Pre-M9 gate). Roles: whoever can view the invoice.

**5.5 Disclosure — three placements** [S103, build obligation]. Exact text: **"Payment service provided
by Intuit Payments Inc."**
- **Marketing / pricing** — `app/pricing/page.tsx` and the public marketing pages (a footer line near payment claims). Public.
- **Invoice pay-link surface** — beside the "Pay online" button (5.4). Owner/Admin + client (via portal/email).
- **Client portal pay surface** — the portal pay page. The portal is **Module 9 (unbuilt)**.
  **[RULED S103, Q8]: a FORWARD OBLIGATION** — ship marketing + invoice disclosure with 7G now, and add
  the portal disclosure **immediately after M7 completes** (the portal pay surface arrives with M9). Josh
  committed to it on the Intuit questionnaire, so it **must not be lost** — carried into `GATED.md` as a
  named obligation.

---

## §6 — Failure modes (a half-synced invoice is a money defect)

- **QB down / 5xx / 429 mid-sync:** queue row → `failed_transient`, `attempts++`, `next_attempt_at` backoff
  with jitter (500 req/min per realm, 10 concurrent). Nothing lost.
- **Access token expired:** refresh. **Refresh token rotates every use — overwrite the Vault blob in FULL,
  never merge** (else `invalid_grant` a day later; documented in the connection migration).
- **`invalid_grant` (refresh fails) / Owner disconnected inside QB:** connection → `needs_reauth`; **queue
  rows STAY `queued`, nothing marked failed** [S148]; persistent banner (§5.1). Reconnect replays.
- **Webhook arrives twice:** UNIQUE `qb_webhook_events.intuit_event_id` drops the duplicate — protecting a
  **paid CorePlus read** (dedupe is cost control, not tidiness).
- **Webhook unauthenticated / forged:** reject before any read — **Intuit-Signature HMAC verification is a
  build item** (not scaffolded); verifier-token storage TBD (Q6).
- **User disconnects with records in flight:** the queue is **partitioned by `realm_id`** (denormalised);
  reconnect to the **same** realm replays; reconnect to a **different** realm does not retarget old work.
- **Terminal rejection** (duplicate `DisplayName`, malformed record QB will never accept): → `failed_terminal`,
  surfaced/actionable, does **not** retry forever (7g1 §7G.7). CC sets the retry ceiling at build.
- **Half-synced create** (QB accepted but the write-back of `qb_*_id` failed): the record re-queues; the
  **one-live-per-(entity,op)** unique index + idempotent match (by `qb_invoice_id`/CDC) prevent a second
  QB object. This is the single most dangerous path — the queue's guarantees exist for it.
- **Read pool exhausted (per Workspace, blocking on free tier):** `qb_read_budget` counts 2xx reads;
  **alert before the ceiling** (telemetry ships; alert deferred). Hourly CDC cadence is ruled (S143) to
  keep the pool clear at Josh's 200–400-company scale.

---

## §7 — Migrations implied (most schema is DONE; each new one ships independently)

Slices 1–3 are shipped — **no re-migration.** New, small, sequenced for attended one-at-a-time pushes:

1. **M-A — pay-link storage [RULED store, Q4].** Add `invoices.qb_invoice_link text`, written on push —
   **not** read-on-demand, because it prints on a document the client holds. One additive migration,
   connector-written (extend `enforce_invoices_column_scope` to freeze it below Owner/Admin). Ships independently.
2. **M-B — webhook verifier token [RULED Vault, Q6].** Store the Intuit webhook verifier token in **Vault**,
   alongside the OAuth tokens (same credential class, one store, one access pattern) — e.g. a
   `companies.qb_webhook_verifier_secret_id uuid` → `vault.secrets`. One migration; enables signature
   verification. Ships before the webhook route.
3. ~~**M-C — expense `source` marker.**~~ **DROPPED [RULED S103, Q5].** _Superseded: "add `expenses.source`
   / a `qb`-origin flag so a QB-imported bill is distinguishable."_ There is **no expense import from QB**
   (Q5), so no origin marker is needed. Not built.

No migration is needed for the worker, routes, UI, or disclosure — those are `apps/` code over shipped schema.

**§S — schema blocks: the connection/queue/webhook/budget schema is ALREADY LIVE** (cited in §2); this
spec references it rather than re-asserting it. The only genuinely-new schema is M-A/M-B/M-C above — CC
confirms exact column names against live schema at build.

---

## §8 — Integration (what the sync touches; what breaks if it changes)

- **7D invoices** — the sync reads `billed_total` (not derived), status, void fields; writes `qb_*`. If 7D's
  billed-vs-derived split or the void-authority trigger changes, the invoice-out + void flows change. The
  two-shape pay-link delivery (7d1 §13) is already discharged.
- **7E payments/refunds** — Model A makes 7G **upstream** of 7E's electronic path (7g1 §7G.5); the manual
  path and credit/refund bookkeeping are 7E's. `client_refunds.qb_object_type` is the credit-vs-refund hook.
- **7C bills/vendors** — subcontractor expenses export as Vendor/Bill via 7C, using `subcontractor_financials.ein`.
- **7A company settings** — `gl_account_*` (cost accounts) and the income-Item mapping drive Bill/Invoice posting.
- **Financial Visibility Floor / #136:** the connection surface and pay figures are **Owner/Admin** by DB
  (column guards + queue/webhook/budget SELECT policies). **Add no render-only gate; widen no one's
  visibility.** The pay-link on the invoice is visible to whoever can already see the invoice.

---

## §9 — Build order (with the forcing dependency)

1. **OAuth connect** — `/api/quickbooks/callback` + token exchange → Vault + Settings connection UI
   (Owner-only). *Forcing dep: nothing can call Intuit without tokens.* (Smallest slice, §1.8.)
2. **Disconnect** — `/api/quickbooks/disconnect` (Intuit-initiated) + the disconnect prompt (keep/clear).
   *Dep: a connection to disconnect; Intuit requires the registered route to exist.*
3. **The worker** — service-role + explicit `company_id`, dependency-ordered drain, backoff, terminal
   escalation. *Dep: tokens (1); it drains the shipped `qb_sync_queue`.*
4. **Invoice OUT** — customer/sub-customer lazy-create, invoice create with `AllowOnline*`, pay-link store
   + surface, customer-conflict prompt. *Dep: worker (3). This creates the pay-link (§1.2).*
5. **Webhook + payment BACK** — `/api/quickbooks/webhook` + signature verify (M-B) + dedupe + metered read
   + `client_payments`. *Dep: invoices exist in QB (4) to receive payments against.*
6. **Expense OUT + edit/delete parity** — vendor/bill create; `bill:update`/`bill:void` on edit/delete
   (S103). *Dep: worker (3).*
7. **Credit/refund → CreditMemo/RefundReceipt**; confirm paid-invoice void refusal end-to-end. *Dep: invoices (4).*
8. **Disclosure** — marketing/pricing + invoice now; portal on M9 (Q8). *Dep: pay-link surface (4).*
9. **CDC backstop (hourly) + read-budget alert.** *Dep: webhook path (5) as the primary; CDC is the safety net.*

---

## §S — TODO for CC at build
Confirm against live schema: exact `qb_*` column names (cited migrations are authoritative), the
`Construction Income` Item existence/remap, `subcontractor_financials.ein` read-with-assert, the
`gl_account_*` columns, and 7D's billed-vs-derived exposure. Re-confirm Intuit tier figures and whether
webhook-triggered reads can be batched (7g1 §7G.9). Fill M-A/M-B/M-C column shapes from live reads.

---

## §10 — Rulings [Josh, S103]

> These eleven were a question batch in the prep run; **all are now ruled.** Recorded here and applied in
> the spec body above. Where a ruling reverses earlier prose, the old text is **superseded-and-quoted**,
> never deleted.

1. **Pay-link live render — RULED.** The scope decision (accounting-only) is **SOUND and does not rest on
   a live call**; the link comes from accounting-API `Invoice` fields (`AllowOnline*Payment`).
   `com.intuit.quickbooks.payment` **must NOT be added — irreversible.** Whether the link *renders* needs
   a real QB-Payments company: **confirm at build.**
2. **Void of a paid invoice — RULED: a PAID invoice cannot be voided, full stop.** The QB-synced qualifier
   was never the reason — the money moved. See §3.2 (superseded) and **Part B** (the migration that fixes it).
3. **Void-induced credit → QB — RULED: it syncs when APPLIED, not when recorded.** A derived credit becomes
   a QB **CreditMemo** at the point it is applied (to a new invoice, or refunded), not the moment the void created it.
4. **Pay-link storage — RULED: STORE it on `invoices.qb_invoice_link`** (not read-on-demand) — it prints on
   a document the client holds. **Migration M-A stands.**
5. **Expenses — RULED: NO import from QuickBooks. Sync is TWO-WAY, not three.** The flows are **invoice OUT ·
   payment BACK · expenses OUT as Bills.** Expenses are recorded in EZCB and pushed to QB; **never entered in
   QB and pulled here.** **Migration M-C is DROPPED** (§7). The "reverse-import" question is closed as *not a
   flow*.
6. **Webhook verifier token — RULED: VAULT**, alongside the OAuth tokens (same credential class, one store,
   one access pattern). **Migration M-B = the Vault option.**
7. **Retainage — RULED: send QB the FULL invoice amount with retainage as a LINE ITEM;** the held portion
   sits OPEN until released. **Releasing retainage is a PAYMENT against the existing open invoice — never a
   second invoice.** §4's retainage trace is rewritten under this and **now foots.**
8. **Portal disclosure — RULED: a FORWARD OBLIGATION**, done **immediately after M7 completes** (the portal
   pay surface is Module 9, unbuilt). Josh committed to it on the Intuit questionnaire — recorded in §5.5
   and to be carried into `GATED.md` so it cannot be lost.
9. **Expense edit/delete → QB — RULED: `bill:update` / `bill:void`.** An expense edited or deleted here maps
   to a sparse update / a transaction delete on its QB Bill (§4 Flow 3).
10. **Onboarding copy — RULED.** *No income Item:* tell the user QuickBooks needs a product/service to bill
    against and to **create one there — DO NOT auto-create it** (writing to their chart of accounts on a
    guess). *No QuickBooks Payments:* **NON-BLOCKING** — invoices still sync; there is simply no pay-link.
11. **Empty stub — RULED: delete `docs/specs/7g-quickbooks-spec.md`** (done this run).
