# Module 7E — Payments & AR — Spec

> **Derives from** `module7-architecture.md` §7.0 (scope), §7.2 (sub-module table), §7.3
> (dependency map), §7.4 (owns-vs-inherits), §7.5 (cross-cutting), §7.11 (7E trace). When this spec
> and the architecture doc conflict, the architecture doc wins until amended — the amendments this
> spec obliges are in §A. When this spec and shipped code conflict, **git is ground truth** — amend
> the spec.
>
> **Status:** WORKFLOW APPROVED + PROVEN (interviews S89–S92, extended and reconciled **[S94]**).
> **Schema layer deliberately absent** — see §S. No table names, columns, or file paths are asserted
> as fact.
>
> **[S94] — what changed.** This revision corrects one contradiction and closes two holes found by
> reconciling the spec against architecture §7.6/§7.11. **§8 let a PM record payments** — which §7.6
> and the §7.11 trace both forbid, the trace marking it a founder correction (§8). **Negative-CO
> credits** (§3a) and **the cost-to-date-vs-revenue pairing** (§6a) are both assigned to 7E by §7.2
> and detailed in §7.11, and neither reached the spec — §7.11 calls the pairing _"why 7E exists."_
> It also fixes a drafting error in acceptance #5, adds the void rules 7D now supplies, and adds the
> **acceptance trace** §2a requires (§9).
>
> **Provenance tags:** `[S94]` = Josh's ruling this session · `[inherited]` = carried from an existing
> doc/decision · `[inferred]` = Claude's inference — **confirm before treating as fixed.**
>
> **Conventions:** follow `CLAUDE.md` — standard columns, per-tenant triggers, RLS naming,
> `get_my_company_id()` / `get_my_member_id()`, soft-delete/trash, server/client service split,
> `author_member_id` precedent.

---

## §1 — Scope

7E owns money **received** and its accounting: electronic and manual payments, application against
invoices, over/under payment, credits, refunds, AR aging + reminders, and retainage release. It
does **not** create invoices (7D) or handle the cost side (7C).

**Governing invariant (inherited from 7D, locked):** all income ties to an invoice. Every payment
applies to one or more invoices — no orphan income. **[S94]** The mirror holds for money out: every
refund or credit ties to a credit document (§5).

**[S94] Also in 7E's scope, per architecture §7.2 and §7.11, and previously absent:**
**negative-CO credits** (§3a) and **the cost-to-date-vs-revenue pairing** (§6a).

---

## §2 — Payment intake

- **Electronic:** the client pays via the invoice pay link; **payment is processed through
  QuickBooks.** QB integration (7G) is **mandatory** for this path — see §A.1. **Partial payment
  is accepted.**
- **Manual (check / cash):** a user enters the payment and applies it across one or more invoices,
  QuickBooks-style. **One payment can split across several invoices; one invoice can be satisfied by
  several payments over time.**
- **Every payment matches a specific invoice**, never a running "total owed" (§7.11 — _"This is the
  backbone: the cost pairing hangs off the invoice match"_). Remaining-owed per invoice is
  **derived**, not stored, consistent with 7C's _"remaining-owed = committed − Σ payments,
  everywhere"_ and money-rep P8's display-remaining rule.
- **Every invoice pushes to QuickBooks** (not only electronically paid ones). On sync, QB tags each
  invoice/payment to the job's QB **sub-customer** (named after the job, nested under the client
  Customer via `ParentRef`). It is **not** a new chart-of-accounts account, and it is **not** the QBO
  "Projects" feature, which is explicitly not used (`7G-spec.md` §7G.2 #2, §7G.6 — its `IsProject`
  flag is read-only on create).
- **[S94] Payment records follow QuickBooks' own semantics.** Ruling: _"handle it exactly how
  QuickBooks does."_ In QB a Payment can be **corrected or removed** — it is not a frozen record — and
  FrameFocus mirrors that so the two stay reconcilable. **Implement it as 7C shipped money-out**
  (`expense_payments`): money fields locked by a column-scope trigger, corrections by **soft-delete and
  re-entry**, derivation self-correcting. That is the FrameFocus expression of QB's behaviour, and it
  preserves the audit trail QB also keeps.
  > **Reconciling this with architecture §7.2** — _"an invoice can be voided; a received payment
  > cannot"_ — those are **different operations**. _Voiding_ is an invoice action (7D §9) and never
  > applies to a payment. _Correcting_ a mis-entered payment is not voiding it. Both statements hold.
  > **[VERIFY — CC]** confirm QB's exact payment edit/delete semantics in sandbox, since they now
  > drive FrameFocus's model rather than merely coexisting with it.

---

## §3 — Over / under payment

- **Underpayment** → the invoice **stays open / partial**, and continues to age (§6).
- **Overpayment** → the surplus becomes a **credit on the client's account.** The credit is applied
  **only when the user chooses** — never auto-applied. (Manual application mechanics mirror §2.)
- **[S94] Mid-job versus final.** §7.11 distinguishes them: an overpayment mid-job is _"CREDITED to the
  next payment"_; on the **final** payment the founder _"SENDS A CHECK BACK."_ The first is a credit
  on account, the second is a refund (§5) — and they are **different objects in QuickBooks**.

---

## §3a — Negative change-order credits — **[S94, NEW — was absent]**

Architecture §7.2 assigns _"negative-CO credits"_ to 7E and §7.11 details the behavior. Neither this
spec nor 7D carried it. **Ruling [S94]: the work splits between 7D and 7E.**

- **7D issues the credit document** off the signed negative CO (7D §4a) — the client gets paper
  showing the reduction, symmetric with how a positive CO gets its own invoice.
- **7E applies it.** Per §7.11 the credit: _"REDUCES the remaining amount owed"_ and _"comes off the
  FINAL PAYMENT."_ Application reuses §3's credit machinery, including the never-auto-applied rule.
- **Contract value falls via 7B's derivation at read** (`contract-value.ts`, bidirectional). Neither
  7D nor 7E writes contract value.
- **It reaches QuickBooks as a CreditMemo** — see §5 and 7G. Omitting it would leave QB permanently
  overstating income.

**[S94] Where the credit lands is the user's choice.** §7.11 says the credit _"REDUCES the remaining
amount owed"_ **and** _"comes off the FINAL PAYMENT"_ — and both are real behaviours, so **both are
built and the user picks**: apply it against an **existing unpaid invoice**, or **hold it for the final
payment**. This mirrors §3's never-auto-applied rule; a credit is never placed without a decision.

---

## §4 — Retainage release

- Fires on **job completion + client sign-off.** (The trigger is the _client's_ sign-off, not an
  app Owner/Admin action — those are different actors.)
  **[S92 RESOLVED — this line is correct; acceptance §10 #6's "owner sign-off" was the drafting
  error and is fixed. Rationale: the client holds the retainage, so only the client can accept
  the work that triggers release; Owner/Admin retain their gate one step later — the
  auto-generated release invoice still waits on Owner/Admin approval before sending.]**
- **Optional lien-release prompt:** collecting the released money may prompt the contractor to send
  an **outbound lien release** to the client first. The prompt is a **global company setting**, and
  each company **uploads the lien-release format it uses.**
  **[S94 — this is ADVISORY, not a gate.]** Per 7F's F1 ruling it **warns and proceeds; it never
  blocks.** The prior wording (_"may require… this requirement is toggleable off"_) read as
  enforcing, which contradicted 7C's shipped posture (_"warn-never-block"_, advisory compliance
  chips) and architecture **P2** (advisory-not-enforced). **Nothing in the money path is ever
  hard-blocked by a document.** The lien-release **document lifecycle is owned by 7F**; 7E only
  names the prompt and honors the toggle.
- Release **auto-generates a draft invoice** for the held amount, held for **app Owner/Admin approval
  before sending**. (Auto-generating a draft that waits for a user is consistent with 7D §1's
  user-triggers-every-invoice rule — no schedule fires on its own.)
- Applies to retainage the **client holds** from the company (outbound / contractor→client). The
  parallel case — retainage the **company holds from subcontractors** (inbound) — releases around the
  **same milestone (job completion), not the same trigger** [S92]: the 7C side is **Owner-initiated at
  sub completion** and does not wait on the client's sign-off of the whole job. No client gate is
  added to 7C; nothing about the shipped 7C flow changes. It is a **7C/AP** concern (named, not built
  here).

---

## §5 — Refunds and credits — **[S94, split]**

- A refund can happen **at any time.**
- **Owner/Admin only**; an **Admin-initiated refund needs Owner approval.**
- Deposit refunds (job does not proceed) run through this path; the deposit's refundable status is
  set in 7D §3.

**[S94] Credit on account and money returned are different things, and FrameFocus distinguishes them
the way QuickBooks does:**

| Situation                                                                            | FrameFocus            | QuickBooks        |
| ------------------------------------------------------------------------------------ | --------------------- | ----------------- |
| Overpayment held for later; negative-CO credit (§3a)                                 | **Credit on account** | **CreditMemo**    |
| Money actually sent back to the client (e.g. overpaid final invoice, deposit refund) | **Refund**            | **RefundReceipt** |

The prior text recorded every refund as a credit memo. That would show a check you actually mailed as
a credit rather than as cash leaving — an error your accountant would have to unpick. Both satisfy
the money-out-ties-to-a-document rule; they are simply not the same document.

---

## §6 — AR aging & reminders

- AR aging is tracked per client (**30 / 60 / 90**). _(§7.11 says "30/60-day"; 90 is carried from the
  prior spec text and retained.)_
- **[S94] Retainage does not age.** An invoice's receivable is the amount **net of retainage withheld**
  (7D §5): a $10,000 invoice with $1,000 retained ages **$9,000**. The withheld $1,000 is shown
  separately as **"retainage held"** on the job — visible, but **outside the 30/60/90 buckets**,
  because it is not yet owed. Ageing the full face amount would show money as overdue that the client
  is contractually entitled to hold, making collections look worse than they are.
- **Auto-reminders** are configurable in **company settings**, per client, with **user-set timing
  and wording** — the same pattern as estimate reminders. **[VERIFY — CC]** confirm that
  estimate-reminder pattern exists and is reusable before building against it; §7.11 records only
  that lateness is tracked, not that reminders are configured this way.
- When a reminder fires, Owner/Admin are notified (event named in §7; delivery is the notification
  system's job).

**[S94] A reissued invoice ages from its OWN date.** 7D §10 corrects an unpaid invoice by voiding it
and issuing a linked successor; the successor **starts a fresh aging clock** rather than inheriting the
voided invoice's date. Rationale: the original was wrong, so the corrected invoice is a new and
legitimate demand — the client cannot be late on a bill that was withdrawn.

> **[S94 — consequence, recorded deliberately]** This means **void-and-reissue resets aging.** A client
> 70 days overdue appears current the moment a correction is issued, and repeated reissues could mask a
> collections problem. Accepted with eyes open; **surface the link to the voided original on the aging
> view** so the history stays visible even though the clock restarts.

---

## §6a — The cost-to-date vs revenue pairing — **[S94, NEW — was absent]**

Architecture §7.2 lists _"the cost-to-date-vs-revenue pairing"_ in 7E's scope and §7.11 calls it
**"why 7E exists"**: _"On payment: show COST-TO-DATE against REVENUE-TO-DATE per job. 'Collected $60k,
spent $47k, +$13k so far.' The number never before visible."_ The spec did not carry it.

- **When:** surfaced **as a payment lands** — that moment is the point of the feature.
- **What:** collected-to-date against spent-to-date for the job, with the running difference.
- **[S94] One definition, two surfaces.** The pairing is defined **once, in a shared module**; **7E
  surfaces it at the payment moment** and **7H reports it** (7H §7H.3). Neither re-implements it.
  This follows the platform's established discipline — 7H _"consumes the rollup, never re-derives"_;
  money-rep's shared `rateInForce` is _"THE definitions"_; 7C's derivation helpers live in
  `payables-shared.ts`.
- **Inputs:** **collected** (7E) and **spent** (7A/7C `getJobCostRollup()` — approved-only, cash
  basis, **NET of retainage** per the S91 gross/net correction).
- **[S94] "Revenue-to-date" here means COLLECTED**, per §7.11's own example — not billed, and not
  earned. 7D's override figures (derived / written-off / held-back, 7D §8) must **not** leak into it.

---

## §7 — Named notification events (delivery deferred)

7E **emits** these; the **notification system** (separate cross-cutting build, §A.2) delivers them.

- Payment received — flags **partial** or **over**
- Payment applied
- Credit created (from overpayment) **[S94]** or from a negative CO (§3a)
- Refund issued
- AR reminder sent
- Retainage release invoice pending approval

Recipients: Owner/Admin (per event). Channel/wording/on-off: owned by the notification system.

---

## §8 — Roles & approval — **[S94, CORRECTED]**

- **Record a payment: Owner/Admin only. A PM cannot record a payment received.**
- **Issue a refund:** Owner/Admin only; **Admin needs Owner approval.**
- **Void an invoice** is 7D's action (7D §9), Owner/Admin with a required reason — and **blocked once
  a payment has reached QuickBooks** (§8a).
- Owner/Admin are notified when money is collected.

> **[S94 — what was wrong and why.]** The prior text read _"Record a payment: PM, Owner, Admin. A
> PM-recorded payment needs Owner/Admin approval,"_ repeated at acceptance #3. Architecture **§7.6**
> says the opposite — _"A PM can create invoices and enter bills, but **cannot record payments
> received**… **Only owner/admin record payments received**"_ — and the **§7.11 trace** says it again,
> marked **"(Founder, corrected #9)"**, adding _"This is deliberately NOT the same shape as the
> expense/invoice doer-acts gate."_ The spec had reintroduced precisely the gate Josh corrected away
> from. Per this spec's own header the architecture wins. **Money-in keeps a deliberately different
> permission shape from money-out.** Consistent with 7C, where PMs enter bills but _"cannot record
> payments, approve, close out."_
>
> Note the asymmetry this preserves and which is **intentional**: a PM **can create an invoice** (7D
> §12, gated on Owner/Admin approval to send) but **cannot record its payment.**

### §8a — Void rules (7D-owned, restated here because 7E reads them)

| Invoice state                                     | Void?                                                                          |
| ------------------------------------------------- | ------------------------------------------------------------------------------ |
| Unpaid                                            | **Yes** — Owner/Admin, reason required                                         |
| Partially paid, payment **not yet in QuickBooks** | **Yes** — **Owner only**, warning; the applied payment becomes a client credit |
| Partially paid, payment **already in QuickBooks** | **No** — correct via credit or refund here                                     |
| Fully paid                                        | **No** — correct via credit or refund here                                     |

**[S94]** The middle row is narrow in practice: electronic payments originate in QB and manual ones
sync on entry, so the window survives mainly while QB is disconnected and the payment sits queued
(7G G3). A **received payment is never voided** — only invoices are.

---

## §9 — Acceptance trace — **[S94, NEW]**

> **Why this section exists.** §2a requires the approved trace to sit in the spec _"verbatim as the
> acceptance example"_; this spec carried acceptance **criteria** (§10) but no **trace**. Per §2a
> step 2 these are mirrored back with real-looking numbers; **step 3 is Josh correcting them until
> they match reality.** Values marked _(real)_ come from §7.11 or §7.8.6; the rest are illustrative
> and await correction. **PROPOSED** on the same footing as every M7 trace — architecture §7.12:
> _"none… is 'passing' until it runs against a real Bishop job."_

### A — Payment arrives and is applied

```
INPUT   INV-0007 sent for $18,000 with $1,800 retained → receivable $16,200. (7D §15-A)
        Client mails a check for $10,000.
WHO     Owner or Admin records it. A PM CANNOT. (§8)
STORE   Payment record: date, amount $10,000, method check, note.
        Applied against INV-0007. Remaining DERIVED = $6,200 — not stored. (§2)
FLOW    Invoice stays OPEN / PARTIAL. It keeps ageing on the $6,200. (§3, §6)
        The $1,800 retainage does NOT age — shown separately as retainage held. (§6)
OUTPUT  Events: "payment received (partial)", "payment applied". (§7)
        THE PAIRING SURFACES: "Collected $10,000, spent $7,400 — +$2,600 so far." (§6a)
        Pushed to QB as a Payment against the job sub-customer. (§2, 7G)
```

### B — One payment across several invoices

```
INPUT   Client sends one $25,000 check covering INV-0007 ($6,200 remaining)
        and INV-0008 ($18,800).
STORE   ONE payment record, TWO applications: $6,200 → INV-0007, $18,800 → INV-0008.
OUTPUT  INV-0007 fully satisfied; INV-0008 fully satisfied. QB records one Payment
        with LinkedTxn to both invoices — the QB model matches this natively. (7G §7G.3)
        (The mirror also holds: one invoice may take several payments over time. §2)
```

### C — Overpayment, mid-job then final

```
MID-JOB   Invoice $6,200; client pays $6,500. Surplus $300 → CREDIT ON ACCOUNT.
          NOT auto-applied. It sits until a user chooses to apply it. (§3)
          QuickBooks: CreditMemo. (§5)
FINAL     Final invoice $4,000; client pays $4,300. Surplus $300, no invoice left
          to credit against → founder SENDS A CHECK BACK. (real, §7.11)
          FrameFocus records a REFUND, Owner/Admin (Admin needs Owner approval).
          QuickBooks: RefundReceipt — cash leaving, not a credit. (§5)
```

### D — Negative change order

```
INPUT   Client removes the tile scope. Signed NEGATIVE change order, −$1,200.
        (mirrors the +$1,200 tile CO in architecture §7.8.6 — real)
7D      Issues the CREDIT DOCUMENT for $1,200 and prompts apply-now vs next. (7D §4a)
7E      Applies it: reduces what the client owes; lands on the final payment. (§3a)
7B      Contract value FALLS $1,200 by derivation at read — nothing is written. (§3a)
QB      CreditMemo. The signed CO itself still exports NOTHING; the credit document
        that bills it does — otherwise QB overstates income forever. (§5, 7G)
```

### E — Retainage release at completion

```
INPUT   Job complete. Accumulated client-held retainage $4,200.
TRIGGER The CLIENT signs off. Not an Owner/Admin action. (§4)
GATE    Company has the outbound lien-release prompt on → FrameFocus WARNS that no
        release has been sent, and PROCEEDS ANYWAY. Advisory, never blocking. (§4, 7F F1)
STORE   Release invoice AUTO-GENERATED as a DRAFT for $4,200, awaiting Owner/Admin.
OUTPUT  Approved → sent → paid → retainage held returns to zero.
        Sub-held retainage is a separate, opposite thing and does not move here. (§4)
```

### F — Final payment, the composite _(illustrative — the convergence four modules share)_

```
The LAST invoice on a job is where four modules meet. §7.11: "FINAL PAYMENT = last
draw + release."

  last draw                              $  4,000   (7D)
  client-held retainage released         $  4,200   (7E §4)
  allowance under-credit, IF asked       ($   800)  (7D §4b — only at the very last
                                                     payment, only on request)
  negative-CO credit, if any             ($ 1,200)  (§3a)
                                         ---------
  final amount due                       $  6,200

  AND: the outbound lien release goes to the client with final payment (7F),
       advisory-prompted, never blocking.

NOTHING in any spec currently models this convergence. It is recorded here as 7E's
acceptance case because 7E is where the money actually lands.
```

---

## §10 — Acceptance criteria (workflow — PROVEN)

1. An electronic payment via the pay link processes through QuickBooks and accepts partial payment.
2. A manual check/cash payment can be split across multiple invoices; one invoice can take multiple
   payments over time.
3. **[S94, CORRECTED]** **A PM cannot record a payment received at all** — money-in is Owner/Admin
   only. _(The prior criterion, "a PM-recorded payment cannot post until Owner/Admin approve,"
   contradicted architecture §7.6 and the §7.11 trace; see §8.)_
4. Underpayment leaves the invoice open/partial; overpayment creates a client credit that applies
   only on user action.
5. **[S94, CORRECTED]** Every invoice — paid electronically or not — pushes to QB and is tagged to the
   job's **sub-customer**. _(The prior wording said "a job-named **Project**"; the QBO Projects
   feature is explicitly **not** used — §2, `7G-spec.md` §7G.2 #2. Drafting error, same class as the
   §4-vs-#6 error S92 caught.)_
6. Retainage release fires on completion + **client** sign-off, generates a **draft** release invoice,
   and holds for Owner/Admin approval before sending.
7. **[S94]** A refund is Owner/Admin-only (Admin needs Owner approval); **a credit on account records
   as a CreditMemo and money actually returned records as a RefundReceipt** — they are not the same
   document.
8. AR aging tracks 30/60/90; per-client reminders send on user-set timing/wording and notify
   Owner/Admin.
9. **[S94]** An invoice's receivable is **net of retainage**; withheld retainage is visible but does
   **not** appear in any aging bucket.
10. **[S94]** A signed negative CO produces a credit that reduces what the client owes and lands on the
    final payment, lowers contract value by derivation, and exports to QB as a CreditMemo.
11. **[S94]** The cost-to-date vs revenue pairing surfaces when a payment lands, using the **shared**
    definition 7H also consumes — not a second implementation.
12. **[S94]** An invoice whose payment has reached QuickBooks cannot be voided; a **received payment is
    never voided.**
13. No payment exists that is not applied to an invoice (or recorded as a credit memo / refund receipt
    for money out).

---

## §A — Architecture amendments this spec records (READ)

**A.1 — 7G is a HARD UPSTREAM dependency of 7E, not just a downstream export.** The architecture
dependency map (§7.3) draws 7G last, as the export everything feeds. That is **wrong for the payment
path**: payments in 7E process _through_ QuickBooks (confirmed decision, not a hedge), so 7E cannot
fully function until 7G exists.
Consequence: the **non-QB parts of 7E can be built now** (manual records, aging, credit/refund
bookkeeping, reminders, retainage-release invoice generation, the §6a pairing); the
**electronic-payment-processing half is a stub until 7G is designed.** Amend §7.3 to show 7G feeding
the 7E payment path. _(An [S91] footnote records this; the diagram itself is still not redrawn.)_

**A.2 — Notifications are a separate cross-cutting system.** They touch multiple modules and have
never been designed. 7E only **names** its events (§7). The engine that delivers them (in-app vs.
email, per-event on/off, recipients, wording) is its own build, not part of 7E.

**A.3 — [S94] §7.2's "trace TODO" note is stale, or the specs ran ahead.** §7.2 still reads _"7D and
7E are partially narrated and marked TODO (§7.10) — their full traces are the next interview target."_
Both specs were subsequently written and headed WORKFLOW APPROVED, yet **four items the traces already
contained never reached them** — cost-plus and allowance true-up (7D), negative-CO credits and the
cost pairing (7E). §9 here and 7D §15 now supply the missing traces. **Amend §7.2.**

---

## §S — Schema layer — TODO for Claude Code (BLOCKS "complete")

Not build-ready until CC reads these live and fills table names, columns, FKs, RLS, triggers,
service files, and routes. Do **not** assert from context — read.

1. **7D invoice tables** — the payment record links to invoices; needs their shape and **status model
   including `voided`**, the optional supersedes link, and **retainage withheld vs. receivable**
   (7D §5, §9). **[S94] Now supplied by 7D** — read it there rather than re-deciding.
2. **QuickBooks connector (7G)** — spec exists (`7G-spec.md`); the mechanism is resolved
   (sub-customer, §7G.2 #2). The electronic-payment path and the every-invoice push still depend on
   the 7G **build** — the electronic half stays a stub until then. **This is the gating dependency.**
3. **Module 5 project / budget / `contract_value` tables** — deposit crediting, retainage held
   balance, and where applied payments post into project finances.
4. **Company settings** — AR reminder configuration (per-client timing + wording). **Confirm the
   estimate-reminder pattern §6 claims to mirror actually exists.**
5. **Client / contact model** (Modules 1/2) — where the account credit balance and aging attach.
6. **Notification event surface** — once the notification system is designed, wire §7 events to it.
7. **[S94] 7A/7C job-cost rollup** — `getJobCostRollup()` for §6a's "spent" side (approved-only, cash
   basis, NET of retainage per the S91 gross/net correction). **7E consumes it; it must not
   re-derive.** _(7C is BUILT [S91] but per `context91` §10 has **never been click-tested**, and
   `20260729010000` is rebuild-test only.)_

**What must now be storable (concepts, not columns):**

- **Per payment:** date, amount, method, note; its **applications** across one or more invoices
  (many-to-many); the QB Payment id and whether it was pushed (manual) or received via webhook
  (electronic).
- **Per client:** the **credit balance** and its provenance — overpayment (§3) or negative CO (§3a) —
  and whether each credit has been applied.
- **Per refund:** that it is a **refund** (money returned) and not a credit on account, so 7G can map
  RefundReceipt rather than CreditMemo (§5).
- **Per job:** **retainage held**, excluded from aging (§6).
- **Shared:** the **pairing derivation** (§6a), defined once and consumed by both 7E and 7H.

---

## §O — Open / external (not interview-closable, not CC-closable)

- **Pre-Module 9 external-surface gate** governs the client-facing pay surface. **[S94 narrowing]**
  Model A **sidesteps it** — the client pays on **QuickBooks' hosted page** and FrameFocus shows only
  a redirect notice (`7G-spec.md` §7G.6), so the gate no longer blocks electronic pay. It still
  governs any other client-facing surface.
- **Notification system** (§A.2) must be designed before §7 events can actually deliver.
- **[S92] Retainage-release trigger actor RESOLVED — the _client's_ sign-off.** §4 was correct;
  acceptance #6's "owner sign-off" was a drafting error, now fixed. Rationale recorded at §4.
- **[S94] Open, listed at their sections:** negative-CO application target (§3a) · reissued-invoice
  aging clock (§6) · payment immutability (§2).

---

## §P — Provenance

- §§1–4, 7, and acceptance 1–2, 4, 6, 8: interviewed S89–S92, confirmed by Josh.
- §§3a, 5, 6a, 8, 8a, and the `[S94]` acceptance criteria: **Josh's rulings this session**,
  reconciling the spec against architecture §7.2/§7.6/§7.11 and the 7D/7F/7G rulings.
- §8's correction restores architecture §7.6 and the §7.11 trace, which recorded the founder's own
  correction (_"Founder, corrected #9"_).
- §9 traces: values marked _(real)_ are founder-sourced from §7.11/§7.8.6; the rest are **illustrative
  and awaiting Josh's correction per §2a step 3.**
- Items tagged `[inferred]` are Claude's inference and **must be confirmed**.
- FrameFocus schema: **not** verified against the live repo — deferred to CC by design (§S).
- **Session number `[S94]` is assumed** from the sequence. Confirm and adjust if it differs.
