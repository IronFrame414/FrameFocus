# 7E Spec-Prep — Draft input→store→output trace + decision record

> **What this is:** Design-prep for Module 7 feature **7E (Payments & AR)** — the draft
> input→store→output trace plus the decisions needed to turn it into an approved one. Companion to
> `claude/7d-spec-prep`; read that first, because four 7D rulings land directly on 7E.
>
> **What this is NOT:** No code, no migration, no schema. No table/column/file-path asserted as fact —
> that is CC's job after reading live schemas (`7E-spec.md` §S).
>
> **Status:** **Rev 1** — 2026-07-31. **Four decisions ruled by Josh this session** (E1–E4), one of
> which **amends a 7D ruling**. The trace is not yet approvable: three items need verification and
> four remain open.

---

## 0. Read this first

### 0.1 Source caveat

`docs/specs/7E-spec.md` is **fully read** (complete text supplied by Josh this session).
`module7-architecture.md` **§7.11 (the approved 7E trace) and §7.6 (roles) are read in full** and are
the authority for the conflicts below. Everything else — `7C-spec.md`, `7G-spec.md`, `7H-spec.md`,
`money-representation.md`, `context91` — was read as knowledge-base retrieval passages, not full
sequential file reads. **CC should open these fully in git before writing spec text.** Nothing here
is invented; gaps are marked **[OPEN]**.

### 0.2 What this prep found

7E's approved half is real and was not re-litigated: payment intake (electronic via QB pay-link,
manual check/cash split across invoices), over/under handling, the credit-on-account rule, refunds,
retainage release with its optional lien-release gate, AR aging and per-client reminders, the named
notification events, and the inherited invariant — _all income ties to an invoice_.

**But the spec contradicted a correction Josh had already made, and dropped two things the
architecture assigns to 7E.**

**The roles contradiction.** Architecture §7.6: _"A PM can create invoices and enter bills, but
**cannot record payments received.** Money-in and money-out have deliberately different permission
shapes… **Only owner/admin record payments received.**"_ The §7.11 trace says the same and marks it
**"(Founder, corrected #9)"** — Josh changed this during the interview — adding _"This is
deliberately NOT the same shape as the expense/invoice doer-acts gate."_ Yet `7E-spec.md` §8 read
_"Record a payment: PM, Owner, Admin. A PM-recorded payment needs Owner/Admin approval"_ (repeated at
acceptance #3) — precisely the doer-acts gate that was corrected away from. Per 7E's own header the
architecture wins until amended. **→ Ruled E1: Owner/Admin only. §8 and #3 are the error.**

**Two architecture-assigned features absent from the spec.** §7.2's 7E row scopes 7E as _"Money
received, matched to a specific invoice, aging, under/over handling, retainage release,
**negative-CO credits**, **the cost-to-date-vs-revenue pairing**."_ §7.11 details both — and calls
the cost pairing **"why 7E exists"** (_"On payment: show COST-TO-DATE against REVENUE-TO-DATE per
job. 'Collected $60k, spent $47k, +$13k so far.' The number never before visible."_). **Neither
appears anywhere in `7E-spec.md`** — not in §1 scope, not in any section, not in acceptance. Same
class of hole as cost-plus missing from 7D. **→ Ruled E2 and E3.**

### 0.3 Conflicts — status

| #    | Conflict                                                                                                                                                                                        | Status                                                                                                                                                                                                                                                                                      |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E-C1 | §8 / acceptance #3 let a PM record payments; architecture §7.6 **and** the §7.11 trace both forbid it, the trace marking it a founder correction                                                | **RULED (E1): architecture stands.** Rewrite §8 and #3 to Owner/Admin only                                                                                                                                                                                                                  |
| E-C2 | **Acceptance #5** says invoices are _"tagged to a job-named **Project**"_ — but §2 [S91] states the QBO **Projects** feature _"is explicitly not used"_ and the mechanism is a **sub-customer** | **DRAFTING ERROR — no decision needed.** #5 must read _sub-customer_. Identical class to the §4-vs-#6 error S92 caught                                                                                                                                                                      |
| E-C3 | The cost-to-date-vs-revenue pairing is in §7.2's 7E row and is called _"why 7E exists"_ in §7.11, but is absent from the spec                                                                   | **RULED (E2): one shared derivation, surfaced in 7E and 7H**                                                                                                                                                                                                                                |
| E-C4 | Negative-CO credits are in §7.2's 7E row and detailed in §7.11, but absent from **both** 7D and 7E specs                                                                                        | **RULED (E3): split — 7D issues the credit document, 7E applies it**                                                                                                                                                                                                                        |
| E-C5 | 7D's **D5** blocked voiding _"once any payment has been applied"_, but 7E §3 accepts **partial** payment                                                                                        | **RULED (E4): partial payment does not block.** Amends D5 — see §3.1                                                                                                                                                                                                                        |
| E-C6 | §4 says retainage release **auto-generates an invoice**, but `7D-spec.md` §1 says _"the user triggers every invoice — no automatic draw schedule"_                                              | **Wording, not substance.** Architecture §7.8.6 shows the parallel selection-overage case auto-generating a **DRAFT… awaiting owner/admin**, and 7D §4 already auto-generates one. Amend 7D §1's absolute to "no automatic _schedule_; system-generated drafts still require user approval" |
| E-C7 | §6 claims AR reminders follow _"the same pattern as estimate reminders"_                                                                                                                        | **UNVERIFIED claim.** CC must confirm the estimate-reminder pattern exists and is reusable before the spec leans on it                                                                                                                                                                      |

---

## 1. Scope restatement (cited)

**7E owns money received and its accounting** (`7E-spec.md` §1): electronic and manual payments,
application against invoices, over/under payment, credits, refunds, AR aging + reminders, and
retainage release. **Governing invariant, inherited from 7D:** _every payment applies to one or more
invoices — no orphan income._

**In scope, already approved** (§§2–9): electronic payment through QB with partial accepted; manual
entry split across invoices (one payment → many invoices, one invoice ← many payments); every invoice
pushes to QB tagged to the job **sub-customer**; underpayment leaves the invoice open/partial;
overpayment becomes a client credit applied **only on user action**; refunds any time, Owner/Admin
with Owner approval for Admin-initiated, recorded as a credit memo; retainage release on job
completion + **client** sign-off with an optional, company-toggleable outbound lien-release gate;
AR aging 30/60/90 with per-client configurable reminders; six named notification events.

**In scope, designed this session** (was absent, wrong, or newly forced):

- **The cost-to-date-vs-revenue pairing** — absent; now E2.
- **Negative-CO credits** — absent from both 7D and 7E; now E3.
- **Payment roles** — corrected back to Owner/Admin only (E1).
- **Void with a partial payment applied** — newly forced by 7D's D5 (E4).

**Explicitly NOT 7E:**

- **Creating invoices** → **7D** (including, per E3, the negative-CO credit document).
- **The cost side** → **7C** (BUILT S91), including **sub-held retainage**, which per §4 releases
  around the same milestone but on a **different trigger** — Owner-initiated at sub completion, _not_
  waiting on the client's sign-off. **Nothing about the shipped 7C flow changes.**
- **The lien-release document lifecycle** → **7F**; 7E only names the gate and honours the toggle.
- **QuickBooks mechanics** → **7G**, which is a **hard upstream dependency** of the electronic path
  (§A.1), not merely a downstream export.
- **Notification delivery** → the separate cross-cutting build (§A.2); 7E only names events.

---

## 2. Draft input→store→output trace

**No table/column names asserted.** Gaps marked **[OPEN]**.

### Action A — Payment arrives

- **IN, electronic:** client pays via the invoice pay link → **money and paid-status land in
  QuickBooks first**; FrameFocus listens on a webhook (7G Model A) and marks its invoice paid.
  **Partial accepted.**
- **IN, manual:** an Owner/Admin (E1) enters a check/cash payment: date, amount, method, note, and
  the invoice(s) it applies to.
- **STORE:** a `<payment>` record + `<payment_application>` rows — the split across invoices is the
  many-to-many join (_"one payment can split across several invoices; one invoice can be satisfied by
  several payments over time"_). QB Payment id per 7G §S.
- **OUT:** invoice status moves (partial / paid); notification events fire; **the cost pairing
  surfaces (Action H)**.
- _Precedent worth reusing:_ 7C's shipped `expense_payments` solved the mirror problem for money-out
  — immutable money fields via a column-scope trigger, soft-delete + re-entry for corrections,
  derived-at-read remaining. **[OPEN — E-a: should the payment record be append-only/immutable on the
  same pattern?** The architecture says _"an invoice can be voided; a received payment cannot"_
  (§7.2), which points that way. Recommend mirroring 7C rather than inventing a second shape.]

### Action B — Application against invoices

- Every payment matches **a specific invoice**, never a running "total owed" (§7.11: _"This is the
  backbone: the cost pairing hangs off the invoice match"_).
- **STORE:** application rows; remaining-owed per invoice **derived**, not stored — consistent with
  7C's _"remaining-owed = committed − Σ payments, everywhere"_ and money-rep P8's display-remaining
  rule.

### Action C — Over / under

- **Under** → invoice stays **open/partial**; it keeps ageing (Action G).
- **Over** → surplus becomes a **credit on the client's account**, applied **only when the user
  chooses** — never auto-applied.
- **[OPEN — E-b: where the credit balance lives.]** §S #5 already flags this: the client/contact
  model (Modules 1/2). Note §7.11's distinction — an overpayment mid-job is _"CREDITED to the next
  payment"_, but on the **final** payment the founder _"SENDS A CHECK BACK"_. That second case is a
  refund (Action E), and it is the one that makes E-c below matter.

### Action D — Negative-CO credit — **NEW (E3)**

- **IN:** a signed **negative** change order (client removes scope). Per §7.11 it _"issues a CREDIT
  to the client, LOWERS THE CONTRACT VALUE, REDUCES the remaining amount owed, comes off the FINAL
  PAYMENT."_
- **SPLIT per E3:** **7D** issues the client-facing **credit document** off the signed negative CO —
  symmetric with 7D §4's positive-CO prompt. **7E** applies it: it reduces what the client owes and
  lands on the final payment, using the same credit machinery as §3.
- **Contract value is 7B's** and moves by **derivation at read** — bidirectional, downward included
  (`contract-value.ts`). **7E writes nothing to contract value.**
- **[OPEN — E-d: does a negative CO reduce an _existing unpaid_ invoice, or only future/final
  billing?** §7.11 says it _"REDUCES the remaining amount owed"_ **and** _"comes off the FINAL
  PAYMENT"_ — those can be the same thing or two different behaviours. Needs the walk-through.]

### Action E — Refunds

- **IN:** Owner/Admin; **Admin-initiated requires Owner approval**. Any time. Deposit refunds ride
  this path (refundable status set in 7D §3).
- **STORE/OUT:** recorded as a **credit memo**, satisfying the money-out-ties-to-a-document rule.
- **[OPEN — E-c: credit memo vs refund receipt.]** 7G maps _"Credit / refund → QB **CreditMemo /
  RefundReceipt**"_ — **two different objects**. A CreditMemo reduces what the client owes; a
  RefundReceipt is cash actually going back. §7.11's final-payment case (_"SENDS A CHECK BACK"_) is
  the second. §5 collapses both into "credit memo", which will mis-map at 7G build. Recommend
  distinguishing: **credit-on-account → CreditMemo; money actually returned → RefundReceipt.**

### Action F — Retainage release

- **TRIGGER:** job completion + **the client's** sign-off (not an Owner/Admin action — S92 resolved
  this; acceptance #6's "owner sign-off" was the drafting error).
- **GATE (optional):** an outbound lien release to the client may be required first — a **global
  company setting**, format uploaded per company; **document lifecycle is 7F's**.
- **THEN:** auto-generates a **release invoice** for the held amount → **held for Owner/Admin
  approval before sending** (this is the Owner/Admin gate, one step later than the trigger).
- **Direction:** client-held retainage only. **Sub-held retainage is 7C's**, releases at the same
  milestone on a different trigger, and does not change.
- **[OPEN — E-e: does held retainage age as AR?]** If a $10,000 invoice withholds 10%, does the
  client owe $9,000 now with $1,000 due at completion — and does the $1,000 sit in the 30/60/90
  buckets meanwhile? It should not, but the spec does not say. **This is 7D's open D8** (is the held
  balance stored or derived) landing on 7E's aging. Answer them together.

### Action G — AR aging & reminders

- Aging per **client**, 30/60/90. Reminders configurable in company settings **per client**, with
  user-set timing and wording; Owner/Admin notified when one fires.
- **[OPEN — E-f: what does 7D's D5a reissue do to the aging clock?]** 7D now voids and reissues as a
  **new successor invoice**. Does the successor inherit the original's age — the client has owed
  since the original date — or start fresh? This changes 30/60/90 buckets and when reminders fire.
  Recommend **inherit the original date** (the debt is not new; a corrected invoice should not reset
  the clock in the client's favour), but it is a judgement call.

### Action H — The cost pairing — **NEW (E2)**

- **ON payment:** surface **cost-to-date vs revenue-to-date** for the job — _"Collected $60k, spent
  $47k, +$13k so far."_
- **E2's shape:** **one shared derivation, two surfaces.** `7H-spec.md` §S already defines
  _"cash pairing = Collected − Spent"_, and FrameFocus's established convention is one definition
  consumed everywhere — 7H _"consumes the rollup, never re-derives"_; money-rep's shared
  `rateInForce` is _"THE definitions"_; 7C's derivation helpers live in `payables-shared.ts`. So the
  pairing is defined **once** (shared module), **7E surfaces it at the payment moment**, **7H reports
  it**, and neither re-implements it.
- **Inputs:** collected (7E) + spent (7A/7C `getJobCostRollup()`, approved-only, cash-basis NET of
  retainage per the S91 gross/net correction).
- **[OPEN — E-g: "revenue-to-date" = collected, or billed?]** §7.11's example (_"Collected $60k"_)
  says collected. But 7D's D3a now distinguishes **derived / billed / written-off / held-back**, and
  7H must already _"separate written-off margin from still-billable backlog."_ Confirm the pairing
  uses **collected**, and that the 7D override figures do not silently leak into it.

---

## 3. Decision record

### 3.1 Settled this session (Josh's rulings, 2026-07-31)

**E1 — A PM cannot record a payment received. Owner/Admin only.** The architecture stands; §8 and
acceptance #3 are the error and get rewritten. Money-in keeps a **deliberately different permission
shape** from money-out — the doer-acts gate that governs expenses, bills and invoice _creation_ does
**not** apply here. Consistent with 7C, where PMs enter bills but _"cannot record payments, approve,
close out."_ No architecture amendment needed.

> Note the asymmetry this preserves: a PM **can create an invoice** (7D §7, gated on Owner/Admin
> approval to send) but **cannot record its payment.** That is intentional, not an inconsistency.

**E2 — The cost pairing: one shared derivation, surfaced in both 7E and 7H.** 7E-spec gains it (the
hole is real), but it is **not** re-implemented there. Defined once in a shared module; 7E displays
it when a payment lands — the moment §7.11 calls _"why 7E exists"_ — and 7H reports it. Follows the
codebase's own anti-duplication convention. Architecture §7.2's 7E row needs no amendment.

**E3 — Negative-CO credits: split. 7D issues the credit document; 7E applies it.** A positive CO
gets its own invoice in 7D §4; a deductive CO symmetrically produces a client-facing **credit
document** at the same trigger, so the client has paper showing the reduction. 7E then applies it
against what is owed and onto the final payment, reusing §3's credit machinery. Contract value moves
by 7B derivation only. **Consequence: `7D-spec.md` needs a credit-document concept it does not
have** — recorded in the 7D prep doc's amendment list.

**E4 — An invoice with a _partial_ payment CAN be voided: Owner-only, with a warning.** The confirm
must state that a payment has already been applied and **will become a credit on the client's
account**. **This amends 7D's D5**, which blocked voiding once _any_ payment landed. Revised rule:

| Invoice state                             | Void?                                                               |
| ----------------------------------------- | ------------------------------------------------------------------- |
| Unpaid                                    | **Yes** — Owner/Admin, reason required (D5b)                        |
| Partially paid, payment **not yet in QB** | **Yes** — Owner only, warning, payment becomes a client credit (E4) |
| Partially paid, payment **already in QB** | **No** — credit or refund via 7E _(narrowed by 7G's **G1**)_        |
| Fully paid                                | **No** — correct via credit/refund in 7E (D5 stands)                |

> **[E4a RESOLVED by 7G's G1, same session]** QuickBooks generally refuses to void an invoice carrying
> a linked Payment. Rather than unlinking it or substituting a CreditMemo, FrameFocus **blocks the
> void** once the payment has reached QB. **Practical effect: E4's window is nearly closed** —
> electronic payments originate in QB (Model A), and manual payments sync on entry (§7G.2 #5), so
> "partially paid → voidable" collapses to roughly "unpaid → voidable," surviving only while QB is
> disconnected and the payment sits queued (G3). Deliberate — G1 was chosen over the two options that
> preserved a wider window. Sandbox should still confirm QB actually refuses; if it permits the void,
> G1 can be revisited toward E4's original width.

### 3.2 Still open — chat-answerable

- **E-c — Credit memo vs refund receipt** (Action E). Recommend splitting them; 7G maps two objects.
- **E-e — Does held retainage age as AR?** Answer together with 7D's **D8** (held balance stored or
  derived).
- **E-f — Does a reissued invoice inherit the original's aging date?** Recommend yes.
- **E-g — Is "revenue-to-date" collected or billed?** Recommend collected, per §7.11's example.
- **E-a — Is a payment record immutable** on 7C's `expense_payments` pattern? Recommend yes; the
  architecture already says a received payment cannot be voided.

### 3.3 Needs the §2a walk-through

- **E-d — Negative-CO application:** does it reduce an existing unpaid invoice, or only the final
  payment? §7.11 says both; they may be different behaviours.
- **Final payment as a composite.** §7.11 defines it as _"last draw + release"_, and it is where
  client-held retainage releases, the allowance under-credit applies (7D), the negative-CO credit
  lands (E3), and the outbound lien release goes out (7F). **No spec models this convergence**, and
  four modules meet at it. Walk one real final payment end to end.

### 3.4 External / verification

- **Pre-Module 9 gate** — governs the client-facing pay surface. The pay-_link_ concept is fixed; the
  surface follows the gate (§O).
- **Notification system** (§A.2) must exist before §7's events can deliver.
- **7G build is the gating dependency** (§S #2) — the electronic-payment half stays a stub until it
  ships. The non-QB half builds now.
- **E-C7** — confirm the estimate-reminder pattern §6 claims to mirror actually exists.
- **Partial payment on the QB pay-link** — §2 asserts it; 7G flags the pay-link path as the one
  **live-only residual** needing a real Payments-enabled company. Confirm partial is supported.

---

## 4. Dependency map

**7E consumes:**

- **7D (blocking):** invoice records + **status/void model** (§S #1). Now supplied — D5/D5a/D5b/E4
  give the full void, reason, successor-reissue and partial-payment rules. Plus, per E3, the
  negative-CO credit document.
- **7G (blocking for the electronic half only):** OAuth/realm, webhooks, the sub-customer mapping,
  QB Payment/CreditMemo/RefundReceipt ids. **§A.1's amendment stands: 7G is upstream of 7E's payment
  path**, not just downstream — build the manual half first.
- **7A/7C (BUILT S91, click-test owed):** `getJobCostRollup()` for the "spent" side of the pairing —
  approved-only, cash-basis, **NET of retainage** per the S91 gross/net correction.
- **7B:** contract value, derived at read, bidirectional — read for the negative-CO case.
- **Modules 1/2/5 + company settings** (§S): client/contact model for the credit balance and aging;
  project/budget/`contract_value` for retainage held balance and where applied payments post;
  reminder configuration.

**Waiting on 7E:**

- **7F** — the unconditional release fires at final payment; a voided invoice **voids its linked
  conditional release and prompts a new one** (7F's **F4**, which supersedes the old flag-for-review
  behaviour and makes 7D's successor invoice **optional** — plain void is a valid terminal path).
  Per **F1**, §4's retainage lien-release gate is **advisory, not enforcing** — see §5.
- **7G** — manual payments, credits and refunds export; E4 obliges a partial-payment void path.
- **7H** — consumes **collected** plus the shared pairing derivation (E2). Full report blocked on
  7D + 7E.

---

## 5. Amendments this prep obliges

1. **`7E-spec.md` §8 + acceptance #3** — remove PM from recording payments; Owner/Admin only (E1).
2. **`7E-spec.md` acceptance #5** — _"job-named Project"_ → **sub-customer** (E-C2, drafting error).
3. **`7E-spec.md`** — add the **cost pairing** section (E2) and the **negative-CO credit
   application** (E3).
4. **`7E-spec.md` §5** — distinguish credit-on-account (CreditMemo) from money returned
   (RefundReceipt), pending E-c.
   4b. **`7E-spec.md` §4** — soften the retainage lien-release gate _(from 7F's **F1**)_. §4 reads
   _"collecting the released money **may require**… this requirement is **toggleable off**"_ — enforcing
   language for the same mechanism 7F #11 used. F1 ruled it **advisory: warn, never block**, consistent with
   7C's shipped _"warn-never-block"_ posture and architecture P2. Reword as a warn toggle.
5. **`7D-spec.md`** — add the **negative-CO credit document** (E3); amend §1's _"the user triggers
   every invoice"_ to permit system-generated **drafts** that still require approval (E-C6).
6. **The 7D prep doc's D5** — amended by E4; partial payment no longer blocks a void.

---

## 6. Recommended next step

Two walk-throughs, both cheap and both covering more than 7E: **one real final payment** end to end
(last draw + retainage release + allowance under-credit + negative-CO credit + outbound lien release
— four modules converge there and nothing models it), and **one negative change order** through
signature → credit document → application. Then close E-c, E-e, E-f, E-g and E-a, which are all
one-line rulings.

Per the architecture's own warning: _"An approved trace is a design target, not a verified behavior —
none of these is 'passing' until it runs against a real Bishop job."_
