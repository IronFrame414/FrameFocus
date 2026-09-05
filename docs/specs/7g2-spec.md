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
update/void parity · expense reverse-import (if in scope) · pay-link storage/read · CDC backstop poll ·
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
- This matches 7g1 §7G.2 #6 and QB's own refusal. ⚠️ **The one nuance vs S103** ("a paid invoice cannot
  be voided"): an Owner CAN still void a paid invoice that has **not reached QB** (payment → derived
  credit). → **Q2**.

### §3.3 — No stored credit-memo entity; credits are DERIVED. Refunds are explicit.
No credit-memo table. A void-with-payment produces a **derived** credit (unapplied payment surplus,
`payments-shared.ts creditAvailableOnPayment`). `client_refunds` holds explicit rows and already carries
`qb_object_type ∈ {credit_memo, refund_receipt}` — so QB **CreditMemo** (credit on account) and
**RefundReceipt** (money back) map cleanly (7E §5). ⚠️ A derived credit has **no row** to hang a queue
entry on → what triggers its QB CreditMemo? (Q3).

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
   `invoices.qb_invoice_id='145'`, `qb_push_status='pushed'`, `qb_synced_at=now`; **store the pay-link** (Q4).
**Output:** the platform invoice shows a **"Pay online"** button → the QB pay-link (only when
`qb_payments_enabled`). **Foots:** billed lines `$8,400.00` = QB `TotalAmt $8,400.00`. ✓

**⚠️ Retainage case — where it does NOT foot cleanly, flagged not adjusted.** `INV-1043`,
`billed_total $12,500.00`, `retainage_withheld $1,250.00`, `amount_receivable $11,250.00`. 7g1 §7G.4/§S
rule "export the **billed** amount; retainage withheld separately from the invoice face." So QB
`TotalAmt = $12,500.00` (billed), and the client owes `$11,250.00` now. **How retainage is represented
in QB is UNDECIDED** — a negative retainage line, a separate holdback item, or left off the QB face
entirely. Until decided, QB face ($12,500) − payment ($11,250) = $1,250 "open" in QB, which reads as
retainage-still-due only under one interpretation. → **Q7** (retainage representation in QB).

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
- **Edit (S103 parity, NOT built):** amount edited → enqueue `bill:update` (sparse update to Bill 312).
  Soft-deleted → enqueue `bill:void` (hard-delete transaction in QB). **Neither is wired today** → Q5.
- **Reverse (S103 asks):** a Bill created **in QB** and edited on the platform. There is **no import
  today** and **no `source` marker** on `expenses`. → **Q4-expenses** decides whether 7G imports at all.

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
status** line (enabled → pay-links render; not enabled → invoices are viewable bills, manual entry only —
surfaced at connect time, 7g1 §7G.6).

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
- **Client portal pay surface** — the portal pay page. ⚠️ **The portal is Module 9 (unbuilt).** → **Q8**:
  ship marketing + invoice disclosure now, and make the portal disclosure a **named obligation on M9**
  (record it in `GATED.md`), or hold 7G's client-facing pay surface until M9.

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

1. **M-A — pay-link storage.** Either `invoices.qb_invoice_link text` (store on push) OR read the
   `InvoiceLink` on demand (no column). **Decide first (Q4)**; if a column, one additive migration,
   connector-written (extend `enforce_invoices_column_scope`). Ships independently.
2. **M-B — webhook verifier token.** Store the Intuit webhook verifier token — **Vault** (preferred, matches
   the token pattern) or a `companies` column. One migration; enables signature verification. Ships before the webhook route.
3. **M-C (conditional) — expense `source` marker.** Only if reverse-import is in scope (Q4-expenses): add
   `expenses.source` / a `qb`-origin flag so a QB-imported bill is distinguishable and platform edits are ruled.
   Ships independently, and only if Josh rules import IN.

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

## §10 — Questions for Josh (one batch)

1. **Pay-link live render.** The scope decision (accounting-only) is safe on docs, but the link's
   *rendering* can't be sandbox-verified (Payments limited). OK to proceed and confirm once against a real
   QB-Payments company at build?
2. **Void of a paid-but-not-yet-in-QB invoice.** The platform lets an **Owner** void it (payment → derived
   credit). Does S103's "a paid invoice cannot be voided" tighten this too, or only govern the QB-synced
   case (already blocked)?
3. **Void-induced credit → QB.** A void's credit is *derived* (no stored row). Should the connector create
   a QB **CreditMemo** from that derived credit, or is the credit recorded **in QB only** (leave FrameFocus's derived view)?
4. **Pay-link storage.** Store `invoices.qb_invoice_link` on push, or read `InvoiceLink` on demand each time?
5. **Expenses reverse-import.** Does 7G **import** bills entered directly in QB (QB → platform), or is
   FrameFocus the sole source of its own expenses (export-only)? (Decides whether M-C `source` marker and
   the "QB-imported expense edited on platform" rules are in scope at all.)
6. **Webhook verifier token** — store in **Vault** (matches the OAuth-token pattern) or a `companies` column?
7. **Retainage in QB.** Export the **billed** face ($12,500) with retainage tracked only in FrameFocus, or
   represent the $1,250 holdback in QB (a retainage line / holdback item)? (§4 retainage case does not foot until decided.)
8. **Portal disclosure.** The client-portal pay surface is Module 9 (unbuilt). Ship marketing + invoice
   disclosure now and record the portal disclosure as a named M9 obligation (in `GATED.md`), or hold 7G's
   client-facing pay surface until M9?
9. **Expense edit/delete → QB.** Confirm an edited/deleted **pushed** expense enqueues `bill:update` /
   `bill:void` (the parity S103 requires; not built today).
10. **Income-Item + QB-Payments onboarding copy.** Confirm the default "Construction Income" Item name and
    the connect-time message when the QBO company has no QB Payments (invoices become viewable bills).
11. **Empty stub file.** OK to delete the empty `docs/specs/7g-quickbooks-spec.md`?
