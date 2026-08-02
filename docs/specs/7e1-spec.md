# Module 7E1 — Payments & AR — Spec

> **Derives from** `module7-architecture.md` §7.0 (scope), §7.2 (sub-module table), §7.3
> (dependency map), §7.4 (owns-vs-inherits), §7.5 (cross-cutting), §7.11 (7E trace). When this spec
> and the architecture doc conflict, the architecture doc wins until amended — the amendments this
> spec obliges are in §A. When this spec and shipped code conflict, **git is ground truth** — amend
> the spec.
>
> **Status:** WORKFLOW APPROVED + PROVEN (interviews S89–S92, reconciled **[S96]**, traces completed
> and four rulings corrected against practice **[S97]**).
> **Schema layer deliberately absent** — see §S. No table names, columns, or file paths are asserted
> as fact.
>
> **[S97] — what changed.** Three of six traces are now **founder-sourced** (§9 D, E, F) and the
> other three have founder-confirmed mechanics. Four rulings changed against practice: **client-held
> retainage is real** and the architecture's claim otherwise is false (§A.4); **sub-retainage release
> fires on the earlier of client payment or 30 days after project completion**, not at sub completion
> (§4); **the release is always its own invoice** (§4); and **acceptance #10 was too narrow** — a
> negative-CO credit reduces what is currently owed, it does not only land on the final payment (§10).
>
> **[S97 — R4 ripple, applied after the above.]** 7D §4a and §A.5 were **REVERSED** the same
> session: a signed negative CO becomes a **credit line on a user-chosen 7D invoice** — NO credit
> document, NO QB CreditMemo for it; the **placement prompt survives** (a later same-session
> ruling reinstated it — §3a). 7E's negative-CO role narrows to the **refund case** when no
> balance remains. §1, §3a, §5, §7, §9-D, acceptance #11 and §S amended below. 7E's OWN
> CreditMemo/RefundReceipt cases (overpayment credit on account, money returned) are unaffected.
>
> **[S96] — the prior revision.** Corrected one contradiction and closed two holes found by
> reconciling against architecture §7.6/§7.11. **§8 let a PM record payments** — which §7.6 and the
> §7.11 trace both forbid, the trace marking it a founder correction. **Negative-CO credits** (§3a)
> and **the cost-to-date-vs-revenue pairing** (§6a) are both assigned to 7E by §7.2 and detailed in
> §7.11, and neither reached the spec — §7.11 calls the pairing _"why 7E exists."_ It also fixed a
> drafting error in acceptance #5 and added the void rules 7D supplies.
>
> **Provenance tags:** `[S96]` = ruled in the spec-reconciliation session · `[S97]` = ruled in the
> trace-completion session · `[inherited]` = carried from an existing doc/decision.
>
> **Session-numbering correction [S97]:** this file previously tagged its rulings `[S94]`. That was
> wrong — `context94.md` records S94's commits as `5633b5d` + `79c1ae8` (113c stage 1), while the
> spec commits `0f62380` / `127c504` postdate S95's work and are claimed by `context96`. All former
> `[S94]` tags are now **`[S96]`**. The same correction is owed in `7d1`, `7f1`, `7g1`, `7h1`.
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
applies to one or more invoices — no orphan income. **[S96, amended S97]** The mirror holds for
money out — superseded wording: _"every refund or credit ties to a credit document (§5)."_ Now:
every refund or credit ties to a **document QB can see** — 7E's own credits/refunds to a
CreditMemo / RefundReceipt (§5), and a negative-CO credit to a **7D invoice credit line** —
user-placed, §3a — (7D §4a as amended; no standalone credit document exists).

**[S96] Also in 7E's scope, per architecture §7.2 and §7.11:** **negative-CO credits** (§3a) and
**the cost-to-date-vs-revenue pairing** (§6a).

---

## §2 — Payment intake

- **Electronic:** the client pays via the invoice pay link; **payment is processed through
  QuickBooks.** QB integration (7G) is **mandatory** for this path — see §A.1. **Partial payment
  is accepted.**
- **Manual (check / cash):** a user enters the payment and applies it across one or more invoices,
  QuickBooks-style. **One payment can split across several invoices; one invoice can be satisfied by
  several payments over time.**
  **[S97 — confirmed against practice.]** A single client check covering **more than one invoice** is
  a **regular** occurrence, not an edge case. The payment-to-invoice link is therefore a genuine
  **many-to-many** join and must be built as one — not a foreign key with a special case bolted on.
- **Every payment matches a specific invoice**, never a running "total owed" (§7.11 — _"This is the
  backbone: the cost pairing hangs off the invoice match"_). Remaining-owed per invoice is
  **derived**, not stored, consistent with 7C's _"remaining-owed = committed − Σ payments,
  everywhere"_ and money-rep P8's display-remaining rule.
- **Every invoice pushes to QuickBooks** (not only electronically paid ones). On sync, QB tags each
  invoice/payment to the job's QB **sub-customer** (named after the job, nested under the client
  Customer via `ParentRef`). It is **not** a new chart-of-accounts account, and it is **not** the QBO
  "Projects" feature, which is explicitly not used (`7G-spec.md` §7G.2 #2, §7G.6 — its `IsProject`
  flag is read-only on create).
- **[S96] Payment records follow QuickBooks' own semantics.** Ruling: _"handle it exactly how
  QuickBooks does."_ In QB a Payment can be **corrected or removed** — it is not a frozen record — and
  FrameFocus mirrors that so the two stay reconcilable. **Implement it as 7C shipped money-out**
  (`expense_payments` — record-only, money fields locked by a column-scope trigger, corrections by
  **soft-delete and re-entry**, derivation self-correcting; verified in
  `20260729010000_7c_accounts_payable.sql:192–229`). That is the FrameFocus expression of QB's
  behaviour, and it preserves the audit trail QB also keeps.
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
- **[S96] Mid-job versus final.** §7.11 distinguishes them: an overpayment mid-job is _"CREDITED to the
  next payment"_; on the **final** payment the founder _"SENDS A CHECK BACK."_ The first is a credit
  on account, the second is a refund (§5) — and they are **different objects in QuickBooks**.

---

## §3a — Negative change-order credits — **[S96; narrowed [S97]; REBUILT by the R4 reversal [S97]]**

Architecture §7.2 assigns _"negative-CO credits"_ to 7E and §7.11 details the behavior.
**[S97 — R4]: 7D §4a and §A.5 were REVERSED** on the real case (the −$5,000 tile-repair CO, §9-D),
and this section's split is superseded with them. The superseded [S96] design, quoted:

> _"**7D issues the credit document** off the signed negative CO (7D §4a) — the client gets paper
> showing the reduction… **7E applies it.** … Application reuses §3's credit machinery, including
> the never-auto-applied rule… **It reaches QuickBooks as a CreditMemo** — see §5 and 7G. Omitting
> it would leave QB permanently overstating income."_

**[S97 latest ruling — the apply-prompt SURVIVES, reinstated in a new form.]** The previous pass
had superseded it, writing: _"Also superseded — the same-session [S97] apply-prompt, quoted:
'**The user is asked where to apply it.** … FrameFocus **prompts** rather than applying
automatically — apply against an existing unpaid invoice, or hold it for the final payment.' With
no free-standing credit to place, there is nothing to prompt about."_ **Josh reinstated it:** the
credit does NOT automatically ride the next invoice — it sits **AVAILABLE** and the user **CHOOSES
which invoice carries it**, the same shape as a positive CO's "bill now or roll into the next
invoice" prompt (7D §4). §3's never-auto-applied rule therefore governs **both** credit sources
again — overpayment (§3) and negative CO.

**The rules now in force (7D §4a as amended):**

- A signed negative CO becomes a **CREDIT LINE on a 7D invoice the user chooses** (placement
  prompt above). **No credit document exists** — the reduction reaches the client inside ordinary
  invoicing.
- **No QB CreditMemo for a negative CO.** QuickBooks sees a **smaller invoice**; income is still
  never overstated. _(7E's OWN CreditMemo/RefundReceipt objects — overpayment credit on account,
  money returned — are unaffected, §5.)_
- **7E keeps exactly one negative-CO role: the REFUND case.** When no balance remains to absorb
  the credit, it becomes a **refund** (Josh sends a check) — Owner/Admin per §5, exported as a
  **RefundReceipt**.
- **Contract value falls via 7B's derivation at read** (`contract-value.ts`, bidirectional).
  Neither 7D nor 7E writes contract value. _(Unchanged.)_

**[S97] §7.11's two clauses remain a sequence, not alternatives — mechanism updated.** The real
case (§9-D) reduced what the client **currently owed**, months before the final payment:

> The credit reduces what the client owes — as a credit line on the invoice the user places it on.
> It reaches the **final payment** only when nothing else is left to bill. It becomes a **refund**
> (§5) only when it exceeds everything owed.

---

## §4 — Retainage release

### §4.1 — Client-held retainage (7E owns this)

- **[S97] This is a real, lived workflow.** Confirmed against a **$1,000,000 job on which the client
  held 10% — $100,000 accrued across nine months of draws and was released in full at completion.**
  See §A.4: architecture §7.11 records that the founder _"has not hit it,"_ which is **false** and
  must be corrected. Client-held retainage is v1 scope on its merits, not as a modeled-but-unproven
  courtesy.
- Fires on **job completion + client sign-off.** **[S97] In practice the client's sign-off is the
  final walkthrough** — that is the event, and it is the _client's_ action, not an app Owner/Admin
  action.
  **[S92 RESOLVED — this line is correct; acceptance §10 #6's "owner sign-off" was the drafting
  error and is fixed. The client holds the retainage, so only the client can accept the work that
  triggers release; Owner/Admin retain their gate one step later — the auto-generated release invoice
  still waits on Owner/Admin approval before sending.]**
- **Optional lien-release prompt:** collecting the released money may prompt the contractor to send
  an **outbound lien release** to the client first. The prompt is a **global company setting**, and
  each company **uploads the lien-release format it uses.**
  **[S96 — this is ADVISORY, not a gate.]** Per 7F's F1 ruling it **warns and proceeds; it never
  blocks.** The prior wording (_"may require… this requirement is toggleable off"_) read as
  enforcing, which contradicted 7C's shipped posture (_"warn-never-block"_) and architecture **P2**
  (advisory-not-enforced). **Nothing in the money path is ever hard-blocked by a document.** The
  document lifecycle is owned by **7F**; 7E only names the prompt and honors the toggle.
- **[S97] The release is ALWAYS its own invoice.** It **auto-generates a draft** for the held amount,
  held for **Owner/Admin approval before sending**. (Auto-generating a draft that waits for a user is
  consistent with 7D §1 — no schedule fires on its own.)

  > **[S97] A deliberate divergence from current practice, recorded so it is not "fixed" later.**
  > When the final walkthrough is scheduled quickly, the founder today issues the **final draw and the
  > retainage on a single invoice**. FrameFocus will instead produce **two** invoices in that case —
  > the final draw, and the auto-generated release. **Ruled: keep them separate, because the release
  > is already automatic.** The small divergence is accepted in exchange for the automation.

### §4.2 — Sub-held retainage (7C owns this; stated here because 7E's rule was wrong)

**[S97] The prior text was FALSE.** It stated, as an [S92] resolution, that sub retainage is
_"Owner-initiated at **sub completion**"_. It is not.

> **The real trigger is the EARLIER of: (a) the client pays, or (b) 30 days after project
> completion.**

**[S97] This is explicitly NOT "pay when paid."** If the client does not pay, the subs are **still**
released at the 30-day mark. Recorded because the alternative is a common industry practice and a
future reader given only clause (a) would very reasonably implement pay-when-paid and starve the subs.

**[S97] Nothing is automated.** The release remains a **manual Owner action** — exactly as 7C shipped
it (`20260729010000:650–652` hard-gates release to `owner`, matching CLAUDE.md owner-only #5). The
rule above describes **when the release becomes due**, not a trigger that fires on its own. **No
time-based automation enters Module 7.**

**[S97] The two retainages are a PASS-THROUGH, and nothing models that.** The founder's practice is:
the client holds 10% from him, and he holds the same from his subs. But the schema carries **two
unrelated columns** — `projects.retainage_percent` (`20260704211000:100`) and
`subcontractor_contracts.retainage_percent` (`20260729010000:344`) — with no link, so the rate must be
typed on the project and again on every sub contract. **The sub rate should default from the project
rate**, remaining editable per contract. This is a default, not a new mechanism. See §S.

Direction still matters and is unchanged: client-held retainage is revenue withheld from the company;
sub-held retainage is cost withheld by the company. **Nothing about the shipped 7C flow changes.**

---

## §5 — Refunds and credits — **[S96, split]**

- A refund can happen **at any time.**
- **Owner/Admin only**; an **Admin-initiated refund needs Owner approval.**
- Deposit refunds (job does not proceed) run through this path; the deposit's refundable status is
  set in 7D §3.

**[S96] Credit on account and money returned are different things, and FrameFocus distinguishes them
the way QuickBooks does:**

| Situation                                                                            | FrameFocus            | QuickBooks        |
| ------------------------------------------------------------------------------------ | --------------------- | ----------------- |
| Overpayment held for later — **[S97]** _superseded inclusion: "negative-CO credit (§3a)"_, now a user-placed 7D invoice credit line | **Credit on account** | **CreditMemo**    |
| Money actually sent back to the client (e.g. overpaid final invoice, deposit refund) | **Refund**            | **RefundReceipt** |

The prior text recorded every refund as a credit memo. That would show a check you actually mailed as
a credit rather than as cash leaving — an error your accountant would have to unpick. Both satisfy
the money-out-ties-to-a-document rule; they are simply not the same document.

---

## §6 — AR aging & reminders

- AR aging is tracked per client (**30 / 60 / 90**). _(§7.11 says "30/60-day"; 90 is carried from the
  prior spec text and retained.)_
- **[S96] Retainage does not age.** An invoice's receivable is the amount **net of retainage withheld**
  (7D §5): a $10,000 invoice with $1,000 retained ages **$9,000**. The withheld $1,000 is shown
  separately as **"retainage held"** on the job — visible, but **outside the 30/60/90 buckets**,
  because it is not yet owed.
  > **[S97] Why this rule is load-bearing.** On the real $1,000,000 job (§9-E) **$100,000 sat
  > withheld for nine months.** Aging the gross invoices would have shown six figures "overdue" for
  > the entire job, on money the client was contractually entitled to hold.
- **Auto-reminders** are configurable per client, with **user-set timing and wording**.
  > **[S97 — the pattern exists, but not at the scope this spec assumes.]** The estimate-reminder
  > machinery is real and reusable: `companies.default_reminder_schedule` (jsonb, default
  > `[3, 7, 14]`), `companies.default_reminder_email_subject` / `_body`
  > (`baseline_schema.sql:1061–1063`), plus a **per-document override** at
  > `estimates.reminder_schedule` (`:1349`). **But the override is per DOCUMENT, not per CLIENT.**
  > Per-client scoping is **net-new** and needs somewhere on the contact model to live — see §S #5.
  > The mechanism is inherited; the scope is not.
- When a reminder fires, Owner/Admin are notified (event named in §7; delivery is the notification
  system's job).

**[S96] A reissued invoice ages from its OWN date.** 7D §10 corrects an unpaid invoice by voiding it
and issuing a linked successor; the successor **starts a fresh aging clock** rather than inheriting the
voided invoice's date. Rationale: the original was wrong, so the corrected invoice is a new and
legitimate demand — the client cannot be late on a bill that was withdrawn.

> **[S96 — consequence, recorded deliberately]** This means **void-and-reissue resets aging.** A client
> 70 days overdue appears current the moment a correction is issued, and repeated reissues could mask a
> collections problem. Accepted with eyes open; **surface the link to the voided original on the aging
> view** so the history stays visible even though the clock restarts. **[S97] Acceptance #14 now tests
> this** — previously the mitigation was ruled but untested, which is how mitigations quietly do not
> get built.

---

## §6a — The cost-to-date vs revenue pairing — **[S96, NEW — was absent]**

Architecture §7.2 lists _"the cost-to-date-vs-revenue pairing"_ in 7E's scope and §7.11 calls it
**"why 7E exists"**: _"On payment: show COST-TO-DATE against REVENUE-TO-DATE per job. 'Collected $60k,
spent $47k, +$13k so far.' The number never before visible."_

> **This feature is INVENTED by design and cannot be trace-corrected before it is built.** §7.11 marks
> it so — it is _"the number the founder has never been able to see."_ Unlike every other 7E behaviour,
> there is no lived workflow to check it against. That is not a defect in the spec; it is the point of
> the feature. It stays **PROPOSED** until it runs on a real job.

- **When:** surfaced **as a payment lands** — that moment is the point of the feature.
- **What:** collected-to-date against spent-to-date for the job, with the running difference.
- **[S96] One definition, two surfaces.** Defined **once, in a shared module**; **7E surfaces it at the
  payment moment** and **7H reports it** (7H §7H.3). Neither re-implements it. This follows the
  platform's established discipline — 7H _"consumes the rollup, never re-derives"_; money-rep's shared
  `rateInForce` is _"THE definitions"_; 7C's derivation helpers live in `payables-shared.ts`.
- **Inputs — collected (7E) and spent (`getJobCostRollup()`).**
  > **[S97] State "spent" the way the code states it.** The prior wording — _"approved-only, cash
  > basis, NET of retainage"_ — is not what the function does. `expenses.ts:180–185`: **_"Receipts
  > (7A, non-payable rows) contribute their full approved amount. Payable rows (7C bills / stages /
  > retainage) contribute their NET payments — never `amount`, never `state`."_** The net effect is
  > cash-basis, so the pairing is sound — but a CC building to "NET of retainage" would write the
  > wrong filter. **7E consumes this function; it must not re-derive it.**
- **[S96, reworded S97] "Revenue-to-date" here means COLLECTED**, per §7.11's own example — not
  billed, and not earned. 7D's derived-vs-billed figures and discount lines (7D §8 as amended —
  _superseded: "override figures (derived / written-off / held-back)"_) must **not** leak into it.

---

## §7 — Named notification events (delivery deferred)

7E **emits** these; the **notification system** (separate cross-cutting build, §A.2) delivers them.

- Payment received — flags **partial** or **over**
- Payment applied
- Credit created — from overpayment (§3). **[S97]** _Superseded source: "or from a negative CO
  (§3a)"_ — that credit is now a user-placed 7D invoice line (7D §14 carries its availability
  event); 7E's only negative-CO event is the refund case
- Refund issued
- AR reminder sent
- Retainage release invoice pending approval
- **[S97]** Sub retainage due for release — the earlier of client payment or completion + 30 days
  (§4.2). Informational; the release itself stays a manual Owner action in 7C.

Recipients: Owner/Admin (per event). Channel/wording/on-off: owned by the notification system.

---

## §8 — Roles & approval — **[S96, CORRECTED]**

- **Record a payment: Owner/Admin only. A PM cannot record a payment received.**
- **Issue a refund:** Owner/Admin only; **Admin needs Owner approval.**
- **Void an invoice** is 7D's action (7D §9) — **Owner/Admin while unpaid, Owner only once any payment
  has been applied**, reason required, and blocked once a payment reaches QuickBooks (§8a).
- **Release sub retainage:** **Owner only** — already enforced in shipped 7C
  (`20260729010000:650–652`), per CLAUDE.md owner-only #5.
- Owner/Admin are notified when money is collected.

> **[S96 — what was wrong and why.]** The prior text read _"Record a payment: PM, Owner, Admin. A
> PM-recorded payment needs Owner/Admin approval,"_ repeated at acceptance #3. Architecture **§7.6**
> says the opposite — _"A PM can create invoices and enter bills, but **cannot record payments
> received**… **Only owner/admin record payments received**"_ — and the **§7.11 trace** says it again,
> marked **"(Founder, corrected #9)"**, adding _"This is deliberately NOT the same shape as the
> expense/invoice doer-acts gate."_ The spec had reintroduced precisely the gate Josh corrected away
> from. **Money-in keeps a deliberately different permission shape from money-out.**
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

**[S97]** The middle row is **narrower than it looks: all payments sync to QuickBooks automatically**,
so it exists **only** while QB is disconnected and the payment sits queued (7G G3). Build it as the
exception it is. A **received payment is never voided** — only invoices are.

---

## §9 — Acceptance trace — **[S96; D, E, F made REAL [S97]]**

> **Status.** **Traces D, E and F are founder-sourced [S97].** Traces A, B and C have
> **founder-confirmed mechanics** — architecture §7.11 records the money-in mechanics as REAL
> ("Bishop runs this end-to-end in QuickBooks today"), and §2's multi-invoice check was confirmed
> [S97] — but their **dollar figures are representative**. §6a's pairing is INVENTED by design and
> cannot be trace-corrected until built. Per architecture §7.12 nothing is _"passing"_ until it runs
> against a real Bishop job **through this system**.

### A — Payment arrives and is applied _(mechanics real; figures representative)_

```
INPUT   INV-0007 sent for $18,000 with $1,800 retained -> receivable $16,200. (7D §15-A)
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

### B — One check across several invoices _(mechanics REAL [S97]; figures representative)_

```
INPUT   [S97] CONFIRMED REGULAR PRACTICE — clients routinely send one check
        covering more than one invoice.
        One $25,000 check covering INV-0007 ($6,200 remaining) and INV-0008 ($18,800).
STORE   ONE payment record, TWO applications: $6,200 -> INV-0007, $18,800 -> INV-0008.
        This is why the payment-to-invoice link is many-to-many. (§2)
OUTPUT  Both invoices satisfied. QB records one Payment with LinkedTxn to both —
        the QB model matches this natively. (7G §7G.3)
        (The mirror also holds: one invoice may take several payments over time.)
```

### C — Overpayment, mid-job then final _(final-payment branch real, §7.11)_

```
MID-JOB   Invoice $6,200; client pays $6,500. Surplus $300 -> CREDIT ON ACCOUNT.
          NOT auto-applied. It sits until a user chooses to apply it. (§3)
          QuickBooks: CreditMemo. (§5)
FINAL     Final invoice $4,000; client pays $4,300. Surplus $300, no invoice left
          to credit against -> founder SENDS A CHECK BACK. (real, §7.11)
          FrameFocus records a REFUND, Owner/Admin (Admin needs Owner approval).
          QuickBooks: RefundReceipt — cash leaving, not a credit. (§5)
```

### D — Negative change order _(REAL values, [S97]; REBUILT by the R4 reversal)_

_(The superseded version of this trace showed a 7D credit document + a 7E apply prompt + a QB
CreditMemo — all removed per §3a as amended; the superseded design is quoted there.)_

```
INPUT   Client changes her mind about replacing broken tiles — scope removed
        after signing. She had ALREADY PAID a deposit covering that work.
        Change order carries one line: -$5,000. Signed.

7D      NO credit document (7D §4a as amended). The -$5,000 sits AVAILABLE
        and the user CHOOSES which invoice carries it (bill-now-vs-next
        shape) — here, her next one. It lands there as a CREDIT LINE:
        she still owed MORE than $5,000, so that invoice simply billed
        $5,000 lower — the reduction did not wait for the final payment,
        and no money went back to her.

7E      Nothing to do in this case — no refund owed. (The placement choice
        is 7D's prompt above.)

7B      Contract value FALLS $5,000 by derivation at read. Nothing written.

QB      Sees the SMALLER next invoice. NO CreditMemo (§3a as amended); the
        signed CO itself still exports nothing. Income is never overstated.

EDGE    Had she owed LESS than $5,000, the remainder would have become a 7E
        REFUND (RefundReceipt, §5) — Josh sends a check. That branch has not
        occurred and is untested. [S97: this is 7E's ONLY negative-CO role.]
```

### E — Retainage release at completion _(REAL values, [S97])_

```
INPUT   Fixed-price job, contract ~$1,000,000. Project retainage 10%.
        Across NINE MONTHS of draws the client withheld $100,000 in total.
        Each invoice's receivable was net of its 10%; the withheld amount
        accrued as "retainage held" and never entered 30/60/90. (§6)

TRIGGER Project complete; the client's FINAL WALKTHROUGH is the sign-off.
        Not an Owner/Admin action. (§4.1)

GATE    If the outbound lien-release prompt is on, FrameFocus WARNS that no
        release has been sent and PROCEEDS ANYWAY — advisory, never blocking.
        (§4.1, 7F F1)

STORE   Release invoice AUTO-GENERATED as a DRAFT for $100,000, awaiting
        Owner/Admin approval before sending.

OUTPUT  Approved -> sent -> client PAID IN FULL. Retainage held -> zero.
        Sub-held retainage does NOT move here. It releases on its own rule —
        the earlier of client payment or 30 days after completion — and stays
        a manual Owner action in 7C. (§4.2)
```

### F — Final payment _(REAL, [S97])_

```
The $1,000,000 job's final payment was a RELEASE ONLY: the final draw had
already been billed and paid before the walkthrough, so the walkthrough
triggered the $100,000 release as its own invoice.

RULED [S97]: the release is ALWAYS its own invoice. Where the walkthrough is
scheduled quickly enough that the founder would today combine the final draw
and the retainage on ONE invoice, FrameFocus instead issues TWO — the final
draw, and the auto-generated release. Accepted divergence (§4.1).

NOT YET OBSERVED: the four-way convergence the prior revision showed as this
trace — last draw + retainage + allowance under-credit + negative-CO credit on
a single final payment. Each element is individually real; they have never
converged on one job. That composite has been REMOVED rather than presented as
an acceptance example, per §2a step 3.
```

---

## §10 — Acceptance criteria (workflow — PROVEN)

1. An electronic payment via the pay link processes through QuickBooks and accepts partial payment.
2. **[S97]** A manual check/cash payment can be split across multiple invoices — a **regular**
   occurrence, built as a true many-to-many link — and one invoice can take multiple payments over
   time.
3. **[S96, CORRECTED]** **A PM cannot record a payment received at all** — money-in is Owner/Admin
   only. _(The prior criterion contradicted architecture §7.6 and the §7.11 trace; see §8.)_
4. Underpayment leaves the invoice open/partial; overpayment creates a client credit that applies
   only on user action.
5. **[S96, CORRECTED]** Every invoice — paid electronically or not — pushes to QB and is tagged to the
   job's **sub-customer**. _(The prior wording said "a job-named **Project**"; the QBO Projects
   feature is explicitly **not** used.)_
6. Retainage release fires on completion + **client** sign-off, generates a **draft** release invoice,
   and holds for Owner/Admin approval before sending.
7. **[S97]** The retainage release is **always its own invoice** — never merged into the final draw.
8. **[S96]** A refund is Owner/Admin-only (Admin needs Owner approval); **a credit on account records
   as a CreditMemo and money actually returned records as a RefundReceipt** — they are not the same
   document.
9. AR aging tracks 30/60/90; per-client reminders send on user-set timing/wording and notify
   Owner/Admin.
10. **[S96]** An invoice's receivable is **net of retainage**; withheld retainage is visible but does
    **not** appear in any aging bucket.
11. **[S97, RE-CORRECTED by the R4 reversal; placement prompt REINSTATED]** A signed negative CO
    **reduces what the client currently owes** as a **credit line on a 7D invoice the user
    chooses** — the credit sits available and **the user is asked which invoice carries it**
    (bill-now-vs-next shape); it reaches the final payment only when nothing else is left to bill,
    and becomes a 7E **refund** (RefundReceipt) only when it exceeds everything owed. It lowers
    contract value by derivation. **Still no credit document and no CreditMemo** — _superseded
    clause: "exports to QB as a CreditMemo"_; the interim removal of the apply prompt is itself
    superseded (§3a as amended).
12. **[S97]** Sub retainage becomes due for release on the **earlier of client payment or 30 days
    after project completion** — **never contingent on the client having paid**. Release remains a
    manual **Owner** action.
13. **[S96]** The cost-to-date vs revenue pairing surfaces when a payment lands, using the **shared**
    definition 7H also consumes — not a second implementation.
14. **[S97]** A void-and-reissue **resets** the aging clock, **and** the aging view **surfaces the link
    to the voided original** so the history stays visible. _(New — the mitigation in §6 was ruled but
    untested.)_
15. **[S96]** An invoice whose payment has reached QuickBooks cannot be voided; a **received payment is
    never voided.**
16. No payment exists that is not applied to an invoice (or recorded as a credit memo / refund receipt
    for money out).

---

## §A — Architecture amendments this spec records (READ)

**A.1 — 7G is a HARD UPSTREAM dependency of 7E, not just a downstream export.** The dependency map
(§7.3) draws 7G last, as the export everything feeds. That is **wrong for the payment path**: payments
process _through_ QuickBooks, so 7E cannot fully function until 7G exists. The **non-QB parts build
now** (manual records, aging, credit/refund bookkeeping, reminders, retainage-release generation, the
§6a pairing); the **electronic half is a stub until 7G ships.** Amend §7.3. _(An [S91] footnote records
this; the diagram itself is still not redrawn.)_

**A.2 — Notifications are a separate cross-cutting system.** 7E only **names** its events (§7). The
delivery engine is its own build.

**A.3 — §7.2's "trace TODO" note is stale.** §7.2 still reads _"7D and 7E are partially narrated and
marked TODO (§7.10) — their full traces are the next interview target."_ §9 here and 7D §15 now supply
founder-corrected traces. **Amend §7.2.**

**A.4 — [S97] §7.11's "the founder has not hit it" is FALSE.** The trace records _"Client-held
retainage is POSSIBLE but the founder has not hit it"_ (`module7-architecture.md:735–736`). He has —
**10% on a $1,000,000 job, $100,000 held across nine months and released at completion** (§9-E). The
line must be corrected, and with it the "modeled, not deferred" hedge: client-held retainage is a real
workflow, and §4.1's flow is its acceptance case.

**A.5 — [S97] The two retainages are a pass-through and the schema does not know it.**
`projects.retainage_percent` and `subcontractor_contracts.retainage_percent` are unrelated columns.
The founder's practice mirrors the client's rate down to his subs. **The sub rate should default from
the project rate**, editable per contract. Also correct any doc text implying sub retainage releases at
**sub completion** — the real rule is §4.2's.

---

## §S — Schema layer — **READ FROM THE LIVE REPO [S97]** (was: TODO)

**Filled 2026-08-02 by CC**, the same way 7D's §S was filled: every table, column, FK, RLS policy,
trigger, service file and route below was **read out of the live repo or queried against
rebuild-test**, not asserted from context. The eight items originally listed are kept verbatim as
the ASK; **§S.1–§S.11 below answer them**, and **§S.12 records the conflicts and the decisions that
need Josh**.

### The original ask (kept for provenance)

1. **7D invoice tables** — the payment record links to invoices; needs their shape and **status model
   including `voided`**, the optional supersedes link, and **retainage withheld vs. receivable**
   (7D §5, §9). **Supplied by 7D** — read it there rather than re-deciding.
2. **QuickBooks connector (7G)** — spec exists; mechanism resolved (sub-customer). The
   electronic-payment path and the every-invoice push depend on the 7G **build**. **This is the gating
   dependency.**
3. **Module 5 project / budget / `contract_value` tables** — deposit crediting, retainage held
   balance, and where applied payments post into project finances.
4. **Company settings — reminders.** **[S97] The pattern EXISTS and is reusable:**
   `companies.default_reminder_schedule` (jsonb `[3, 7, 14]`), `default_reminder_email_subject` /
   `_body` (`baseline_schema.sql:1061–1063`), with a per-document override at
   `estimates.reminder_schedule` (`:1349`). **The per-CLIENT scope §6 requires does not exist** — it is
   net-new and needs a home on the contact model (#5).
5. **Client / contact model** (Modules 1/2) — where the account **credit balance**, **aging**, and the
   **[S97] per-client reminder configuration** attach.
6. **Notification event surface** — wire §7's events once the notification system is designed.
7. **7A/7C job-cost rollup** — `getJobCostRollup()` for §6a's "spent" side. **[S97] Read
   `expenses.ts:177–195` for its actual two-branch rule** (receipts at full approved amount; payable
   rows at net payments) rather than the shorthand. **7E consumes it; it must not re-derive.** _(7C is
   BUILT but per `context91` §10 has **never been click-tested**, and `20260729010000` is
   rebuild-test only.)_
8. **[S97] The retainage pass-through default** — `subcontractor_contracts.retainage_percent` should
   default from `projects.retainage_percent` (§4.2, §A.5). A default, not a new mechanism.

**What must now be storable (concepts, not columns):**

- **Per payment:** date, amount, method, note; its **applications** across one or more invoices
  (**many-to-many — regular practice, not an edge case**); the QB Payment id and whether it was pushed
  (manual) or received via webhook (electronic).
- **Per client:** the **credit balance** and its provenance — overpayment (§3) only; **[S97]**
  _superseded provenance: "or negative CO (§3a)"_ — that credit lives as a user-placed 7D invoice
  line, though its **available/placed state must be visible somewhere** (7D §S) —
  whether each credit has been applied, and **[S97] the per-client reminder schedule and wording**.
- **Per refund:** that it is a **refund** (money returned) and not a credit on account, so 7G maps
  RefundReceipt rather than CreditMemo (§5).
- **Per job:** **retainage held**, excluded from aging (§6); and **[S97]** the sub-retainage
  **due-for-release date** — the earlier of client payment or completion + 30 days (§4.2),
  informational only.
- **Per invoice (aging):** **[S97]** the link to a voided predecessor, so a reset clock still shows its
  history (§6, acceptance #14).
- **Shared:** the **pairing derivation** (§6a), defined once and consumed by both 7E and 7H.

---

### §S.1 — 7D invoice tables (item 1) — **SHIPPED, read as built**

`20260802000000_7d_invoicing.sql` + `20260803000000_7d_invoice_number_at_send.sql`, both applied to
rebuild-test. `public.invoices` columns, in order, as they exist:

```
id, company_id, created_at, updated_at, created_by, updated_by, is_deleted, deleted_at,
project_id, invoice_number, author_member_id, title, status, invoice_type, is_final,
presentation_level, issue_date, due_date, retainage_percent, retainage_withheld,
derived_total, billed_total, amount_receivable, approved_by, approved_at, sent_at,
voided_at, voided_by, void_reason, supersedes_invoice_id, notes
```

- **Status model:** `CHECK (status IN ('draft','pending_approval','sent','paid','voided'))`.
  **7D never sets `'paid'` — that value exists for 7E to set.** This is the hand-off point.
- **Receivable vs retainage (what 7E's aging must consume):** `billed_total` is what the client was
  charged; `retainage_withheld` is held back; **`amount_receivable = billed_total −
  retainage_withheld`** and is the ONLY figure that ages (7D §5, computed in
  `computeInvoiceTotals`, `packages/shared/utils/invoice-derivation.ts`). 7E must age
  `amount_receivable`, never `billed_total`.
- **`supersedes_invoice_id`** — nullable self-FK, the void→reissue link §6/acceptance #14 needs to
  surface on the aging view. Indexed partially (`WHERE supersedes_invoice_id IS NOT NULL`).
- **Immutability already enforced in the DB:** `invoices_immutability` (BEFORE UPDATE) freezes
  `derived_total`, `billed_total`, `amount_receivable`, `retainage_withheld`, `retainage_percent`,
  `invoice_number`, `invoice_type`, `project_id`, `issue_date` once status is sent/paid/voided, and
  a voided invoice can never change status again. **Consequence for 7E: 7E cannot write any money
  column on an invoice.** Marking an invoice paid is a `status` change only — permitted, because
  `status` is not in the frozen set. Verified by reading the trigger body.
- **`invoice_lines`** carries the negative credit lines (`credit_negative_co`, `credit_deposit`,
  `credit_allowance`, `discount`), sign-checked by
  `invoice_lines_credit_sign_check (billed_amount <= 0)`. 7E reads these; it never writes them.
- **RLS:** Owner/Admin/PM, riding `can_view_project(project_id)`. No DELETE policy on `invoices`.

> **`due_date` EXISTS on the column list but NOTHING WRITES IT.** 7D shipped with no due-date
> control anywhere (`S97-7D-build.md` §6 item 3, unruled). Every invoice therefore carries
> `due_date = NULL`. **This is the single biggest live-schema fact for 7E**, because §6's aging has
> no due date to age from. See §S.12 C1.

### §S.2 — 7C `expense_payments` (the money-out precedent §2 says to mirror) — **SHIPPED**

`20260729010000_7c_accounts_payable.sql`. This is the posture 7E's payment table must copy.

```sql
CREATE TABLE public.expense_payments (
  id, company_id DEFAULT get_my_company_id(), created_at, updated_at,
  created_by DEFAULT auth.uid(), updated_by DEFAULT auth.uid(),
  is_deleted DEFAULT false, deleted_at,
  expense_id uuid NOT NULL, paid_date date NOT NULL,
  amount numeric(12,2) NOT NULL, retainage_withheld numeric(12,2) NOT NULL DEFAULT 0,
  method text, note text, over_stage boolean NOT NULL DEFAULT false,
  CHECK (amount > 0), CHECK (retainage_withheld >= 0), CHECK (retainage_withheld <= amount)
);
```

- **The immutability mechanism to copy**, `enforce_expense_payments_column_scope()` (BEFORE UPDATE):
  every money/identity column compared with `IS DISTINCT FROM`, raising
  **`'A recorded payment is immutable — soft-delete and re-enter to correct it.'`** It opens with
  `IF auth.uid() IS NULL THEN RETURN NEW; END IF;` so service-role/system paths are not blocked.
  **The only legal UPDATE is the soft-delete correction path.** This is exactly what §2's
  "QuickBooks semantics" ruling resolves to, and exactly what this build's brief requires
  ("immutable once recorded — enforce it in triggers, not just app code").
- **Derivation, not storage:** `payables-shared.ts` (109 lines, no supabase import) exports
  `grossPaid`, `committedRemaining`, `netCashOut`, `isPayableRow`, `countsTowardCommitted`.
  Remaining-owed is derived everywhere; nothing caches a balance. 7E follows this.
- **The RPC precedent:** `record_expense_payment(...)` does the over-payment check
  (`RAISE EXCEPTION 'OVER_STAGE: …'` unless an override flag is passed) and hard-gates the
  Owner-only arms (`IF v_expense.is_retainage AND get_my_role() <> 'owner' THEN RAISE`).
- **RLS:** `expense_payments_select_scoped` — Owner/Admin/PM/Foreman via the parent expense's
  project. **7E's money-IN table must be narrower: Owner/Admin only (§8).**

### §S.3 — Module 5 project / contract value (item 3) — **EXISTS**

`public.projects` carries `contract_value numeric`, `retainage_percent numeric`, `status`
(`CHECK (status IN ('active','on_hold','complete','archived','cancelled'))`), `actual_end_date`,
`contact_id NOT NULL`, `source_estimate_id`. Contract value is **never written by 7D or 7E** — 7B
derives the revised figure at read (`contract-value.ts`). `status = 'complete'` is the completion
marker §4.1 keys off; `actual_end_date` is the date §4.2's "completion + 30 days" counts from.

### §S.4 — Company reminder settings (item 4) — **EXISTS, at company scope only**

`companies.default_reminder_schedule` (jsonb), `default_reminder_email_subject`,
`default_reminder_email_body` — confirmed present by query. The per-document override
`estimates.reminder_schedule` also exists. **The per-CLIENT scope §6 requires does not exist.**

### §S.5 — Client / contact model (item 5) — **NO home for credit or reminders**

`public.contacts` full column list, queried live:

```
id, company_id, contact_type, status, first_name, last_name, company_name, email, phone,
mobile, source, notes, tags, created_by, updated_by, created_at, updated_at, is_deleted, deleted_at
```

**There is no credit-balance column and no reminder column.** Both are net-new. Note the credit
balance should be **derived, not stored**, to match 7C's discipline and 7D's derived-credit posture
(7D derives negative-CO availability and deposit balance rather than storing them) — see §S.11.

### §S.6 — Notification surface (item 6) — **DOES NOT EXIST**

No notification tables, no event bus. `incident-notify.ts` is a bespoke 6C emailer, not a general
surface. §7's events cannot be delivered; they can only be named. **7E emits nothing in v1.**

### §S.7 — `getJobCostRollup()` for §6a (item 7) — **EXISTS, consume verbatim**

`apps/web/lib/services/expenses.ts:177`. Returns `JobCostRollup { labor: { available, totalHours,
totalCost, byMember[] }, expenses: {...} }`. The two-branch rule, quoted from the code comment at
`:180–185`: *"Receipts (7A, non-payable rows) contribute their full approved amount. Payable rows
(7C bills/stages/retainage) contribute their NET payments — never `amount`, never `state`."* The
labor side sets `available: false` when rate snapshots are RLS-hidden (Owner/Admin floor). **7E
consumes this and must not re-derive it**, exactly as §6a requires.

### §S.8 — Sub-contract retainage pass-through default (item 8) — **CONFIRMED ABSENT**

Queried live: `subcontractor_contracts.retainage_percent` has **`column_default = NULL`**. §S #8's
claim is correct — the rate must be typed on the project and again on every sub contract. **This is
a 7C table, not a 7E one.** See §S.12 D3.

### §S.9 — Helpers and conventions available

`get_my_company_id()`, `get_my_role()`, `get_my_member_id()`, `can_view_project()` all exist and are
the predicates 7D/7C already use. `update_updated_at()` is the shared trigger function. Per-tenant
column defaults, the `{table}_updated_at` + `set_{table}_updated_by` trigger pair, soft-delete and
the append-only-log exception are all per CLAUDE.md.

### §S.10 — Service-file and route pattern to follow

7C: `payables.ts` (server reads, 233), `payables-client.ts` (client writes, 704),
`payables-shared.ts` (pure + types, no supabase, 109) + `payables-shared.test.ts` (250).
7D shipped the same triple — `invoices.ts` / `invoices-client.ts` / `invoices-shared.ts` — where the
**shared file exists specifically to guard the client-bundle boundary** (a value import from the
server file pulls `next/headers` into the client bundle; `tsc` does not catch it). **7E follows the
triple.** No API route is needed for payments; 7D's only route is the PDF one.

### §S.11 — What 7E must create (net-new)

Derived from the "what must be storable" list above, against what exists:

| Concept | Verdict |
| --- | --- |
| Payment record (date, amount, method, note) | **NEW table** — mirror `expense_payments`' posture, Owner/Admin RLS |
| Payment → invoice **applications** | **NEW table** — genuine many-to-many (§2, acceptance #2) |
| Remaining owed per invoice | **DERIVED**, never stored (§2, 7C precedent) |
| Client credit balance | **DERIVED** from overpayment rows less applications — no stored balance |
| Refund (money returned) vs credit (on account) | **NEW** — distinct record types (§5, acceptance #8) |
| Retainage held per job | **DERIVED** — Σ `invoices.retainage_withheld` on live invoices |
| Aging buckets | **DERIVED** at read from `amount_receivable` less applied payments |
| Per-client reminder schedule/wording | **NEW columns on `contacts`** (§S.5) |
| Invoice → voided predecessor | **EXISTS** — `invoices.supersedes_invoice_id` |
| §6a pairing | **NEW shared module**, consuming `getJobCostRollup()` |
| QB Payment id / push state | **NEW columns**, inert until 7G |

### §S.12 — CONFLICTS and DECISIONS

**C1 — `invoices.due_date` is never written, so §6's aging has no due date.** The column exists;
7D shipped no control for it and Josh has not ruled payment terms (7D open item #3). §6 specifies
30/60/90 buckets but never says what day zero is. **PROVISIONAL (this build):** age from
**`issue_date`**, which is always populated and is set at send in the company timezone. Reversal is
a one-line change in the shared aging helper once terms are ruled, plus a backfill decision for
invoices already sent. **This is the top decision Josh owes 7E.**

**C2 — the electronic-payment path CANNOT be built.** §2 makes 7G *mandatory* for it and §A.1 calls
7G a hard upstream dependency; 7G is not built, and the pay link is Pre-M9 gated. **Acceptance #1
is unbuildable in this run** and acceptance #5 (every invoice pushes to QB) with it. 7E v1 is
**manual payment intake only**. QB id/push columns ship inert so 7G has somewhere to write.

**C3 — §4.1's trigger is a CLIENT action with no client-facing surface.** Retainage release fires on
"job completion + the client's final walkthrough sign-off". There is no client portal (Pre-M9) and
no sign-off object anywhere in the schema. **PROVISIONAL:** an Owner/Admin **records** that the
walkthrough happened; that recorded event is the trigger. This preserves the ruling that the
client's sign-off is the trigger while keeping the actor inside the app.

**C4 — §5's "Admin-initiated refund needs Owner approval" needs an approval state**, which no
existing money-out object has (7C's Owner-only arms are hard gates, not approval workflows). Needs
a two-state field on the refund record.

**C5 — §2's `[VERIFY — CC]` on QuickBooks payment semantics is NOT closable here.** It asks for
sandbox confirmation of QB's edit/delete behaviour. No QB connection exists. The spec's own fallback
— implement as 7C shipped money-out — is what this build follows; the verification stays open.

**D1 — the reissued-invoice aging clock.** §6 rules the successor ages from its own date. With C1's
provisional (age from `issue_date`) this falls out for free: a reissue is created fresh and gets its
own `issue_date` at send. **No extra mechanism needed** — recorded so nobody builds one.

**D2 — where the per-client credit balance lives.** Recommended **derived**, not stored, consistent
with 7D deriving deposit balances and negative-CO availability rather than storing them. Flagged
because §S's "what must be storable" phrasing could be read as requiring a column.

**D3 — the sub-retainage pass-through default (§S.8) is 7C's table.** Adding a default to
`subcontractor_contracts.retainage_percent` is a one-line migration, but it changes a **shipped 7C**
surface. **NOT done in this build** — out of 7E's lane, and this build's brief forbids touching
shipped code. Left for Josh to authorise as its own change.

**D4 — no notification delivery (§S.6).** §7's seven events are named in the spec and will be
emitted by nothing. Recorded so the gap is not mistaken for an oversight.

---

## §O — Open / external (not interview-closable, not CC-closable)

- **Pre-Module 9 external-surface gate** governs the client-facing pay surface. **[S96 narrowing]**
  Model A **sidesteps it** — the client pays on **QuickBooks' hosted page** and FrameFocus shows only
  a redirect notice (`7G-spec.md` §7G.6). It still governs any other client-facing surface.
- **Notification system** (§A.2) must be designed before §7 events can deliver.
- **§6a's pairing is INVENTED by design** and stays PROPOSED until it runs on a real job. There is no
  lived workflow to correct it against — that is the point of the feature, not a gap.

### Outstanding items owed by JOSH before this spec is complete

| #   | Item                                                                                        | Section   |
| --- | ------------------------------------------------------------------------------------------- | --------- |
| 1   | Real figures for traces A, B, C — mechanics are confirmed, dollars are representative       | §9 A/B/C  |
| 2   | Has a negative-CO credit ever **exceeded** what was owed, forcing a refund? Untested branch — **[S97]** now 7E's ONLY negative-CO role (§3a as amended) | §9-D edge |
| 3   | Confirm the sub-retainage **due-for-release** notification (§7) is wanted, or drop it       | §7, §4.2  |

---

## §P — Provenance

- §§1–4, 7, and acceptance 1–2, 4, 6, 9: interviewed S89–S92, confirmed by Josh.
- §§3a, 5, 6a, 8, 8a and the `[S96]` acceptance criteria: ruled in the spec-reconciliation session,
  reconciling against architecture §7.2/§7.6/§7.11 and the 7D/7F/7G rulings.
- §8's correction restores architecture §7.6 and the §7.11 trace, which recorded the founder's own
  correction (_"Founder, corrected #9"_).
- **[S97] rulings:** client-held retainage is real, on a $1M job at 10% (§4.1, §A.4) · sub retainage
  releases on the earlier of client payment or completion + 30 days, explicitly **not** pay-when-paid,
  and stays a manual Owner action (§4.2) · the release is always its own invoice, accepting a
  divergence from current practice (§4.1) · the negative-CO credit reduces what is **currently** owed
  (§3a, acceptance #11 — the same session's later **R4 reversal** removed the credit document and
  the CreditMemo; the apply prompt was briefly removed with them and then **REINSTATED** as the
  user-directed placement choice; see §3a as amended) · multi-invoice checks are regular, so
  the join is genuinely many-to-many (§2) · the client's sign-off is the **final walkthrough** (§4.1).
- **§9 traces D, E, F: founder-sourced [S97].** Traces A, B, C: **mechanics founder-confirmed**
  (architecture §7.11 records the money-in mechanics as REAL), **figures representative**. The prior
  revision's four-way composite has been removed — it had never occurred.
- The `[inferred]` provenance tag class was **removed [S97]** — declared in the legend and promised in
  provenance, but never applied to any claim in this file. It remains live and meaningful in
  `7f1-spec.md` and `7g1-spec.md`, which carry real `[inferred]` body tags awaiting confirmation.
- FrameFocus schema: **not** verified against the live repo beyond the specific file:line citations
  above — the schema layer is deferred to CC by design (§S).
