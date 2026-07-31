# 7G Spec-Prep — Integration reconciliation + decision record

> **What this is:** Design-prep for **7G (QuickBooks Connector)** — what this session's 7D/7E/7F
> rulings change in the connector, plus the decisions needed to close them. Companion to
> `claude/7d-spec-prep`, `claude/7e-spec-prep`, `claude/7f-spec-prep`. **G1 narrows 7E's E4**, so read
> them as a set.
>
> **Nature of 7G:** an integration, not an interview section — architecture §7.2 classes it _"No — an
> integration"_ for the trace requirement. So this doc reconciles the **sync map** rather than
> re-tracing a workflow, and does not pad §2 with a trace the method does not ask for.
>
> **What this is NOT:** No code, no migration, no schema. No table/column/file-path asserted as fact
> (`7G-spec.md` §S).
>
> **Status:** **Rev 1** — 2026-07-31. **Four decisions ruled** (G1–G4). One critical verification could
> change the whole Model A design; see §3.3.

---

## 0. Read this first

### 0.1 Source caveat

`docs/specs/7G-spec.md` is **fully read** (complete text supplied by Josh this session). Supporting
docs — `7C-spec.md`, `context91`, `CLAUDE_MODULES.md`, `money-representation.md`, the architecture —
were read as knowledge-base retrieval passages. **The Intuit API claims in §7G.3 are this document's
own research and were not re-verified by me**; they are marked verify-in-sandbox where they carry
risk, and I have not treated any of them as independently confirmed.

### 0.2 What this prep found

**7G is the most rigorous document in the set.** The API research is specific and cites mechanisms
rather than asserting outcomes; the `[S91]`/`[S92]` corrections show it has been kept honest as
upstream shipped (the deleted contract-adjustment row is a model of removing a false claim); and it
already anticipates the failure modes that matter — rotating refresh tokens, needs-reauth, metered
reads on the webhook path, per-realm throttling. Its core decisions were not re-litigated.

**Three of this session's rulings landed on it, and one outran it.**

**E4 outran the integration.** §7G.4 already flagged the risk — _"a paid invoice generally can't be
voided — reconcile with §7E's void rules so QB income always matches FrameFocus"_ — and E4 then ruled
that a **partially paid** invoice _can_ be voided. That produces a QB Invoice carrying a linked
Payment that FrameFocus wants to void, which QB generally refuses without the payment being removed
first. **→ Ruled G1: block the void once the payment has reached QB.** See the consequence note in
§3.1 — it narrows E4 further than it may appear.

**D3 split the invoice into two numbers and 7G doesn't know.** An invoice now carries a **derived**
amount and a **billed** amount (the recorded override). §7G.4 says only _"Client invoice → QB
Invoice."_ It must export the **billed** figure, or QuickBooks income disagrees with what the client
was actually charged. By contrast **D3a is QB-neutral** — written-off and held-back amounts were never
billed, so nothing exports; stated here so it is not re-litigated at build.

**E3 creates a row that could be misread into permanently overstating income.** S92's principle reads
_"a signed CO exports **NOTHING**."_ E3 then had 7D issue a **credit document** off a signed
**negative** CO. Combined carelessly those become "negative COs don't reach QB" — which would leave
QuickBooks overstating income by every deductive CO ever signed. **The reconciliation:** the CO itself
still exports nothing; the **credit document that bills it does**, as a CreditMemo. _Promised value
stays in FrameFocus; billed value goes to QB_ — and a credit is billed value with a minus sign. This
needs to be written into §7G.4 explicitly, not left to inference.

### 0.3 Conflicts & gaps — status

| #    | Item                                                                                                                    | Status                                                                                                                                            |
| ---- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| G-C1 | E4 permits voiding a partially paid invoice; QB generally refuses to void an invoice with a linked Payment              | **RULED (G1): block once the payment has reached QB.** Narrows E4 — see §3.1                                                                      |
| G-C2 | §7G.4 maps "Client invoice → QB Invoice" without saying **which** amount, now that D3 produces two                      | **Consequential, no decision needed: export the BILLED amount.** Same rule 7H follows                                                             |
| G-C3 | S92's _"a signed CO exports nothing"_ + E3's negative-CO credit document could be read as "negative COs never reach QB" | **Clarification needed, no decision:** the CO exports nothing; its **credit document exports as a CreditMemo**                                    |
| G-C4 | §7G.4 maps _"Credit / refund → CreditMemo / RefundReceipt (7E)"_, but E3 puts credit-document issuance in **7D**        | **Map row needs updating:** credits originate in 7D (negative CO) and 7E (overpayment/refund)                                                     |
| G-C5 | 7E §5 collapses refunds to _"credit memo"_; 7G maps **two** distinct QB objects                                         | **Blocked on 7E's open E-c.** 7G cannot build the refund path until that is split                                                                 |
| G-C6 | §7G.3's metered-read cap — _"~500k/month… then **blocked**, not throttled"_ — never says **per company or per app**     | **CRITICAL VERIFICATION.** See §3.3 — this decides whether Model A scales                                                                         |
| G-C7 | D6 flags _"the affected sent invoices"_ for void-and-reissue when a rate is superseded                                  | **Volume risk:** a single rate typo can produce a **burst** of void + create pairs against a 500/min per-realm limit. The queue (G3) must pace it |
| G-C8 | §7G.4 maps _"Approved timesheet → QB Time / Payroll"_                                                                   | **Do not conflate with D4.** Payroll hours and **billable** hours (7D's D4) are different populations off the same M6 data                        |

---

## 1. Scope restatement (cited)

**7G is the QuickBooks Online connector.** Governing principle, unchanged: **FrameFocus runs daily
operations; QuickBooks runs the books.** FrameFocus is source of truth for project data; QB is source
of truth for accounting. 7G never replaces QB for accounting — no P&L, tax prep, or bank
reconciliation inside FrameFocus.

Primarily an **outbound export path**, with **one inbound exception**: electronic client payments
originate in QB and flow back (Model A). This is why **§7G.5's amendment stands** — for the payment
path 7G is **upstream** of 7E, not merely downstream, and the architecture §7.3 diagram remains
un-redrawn (an `[S91]` footnote records it).

**Revenue-side governing rule [S92]:** **QB receives invoices only.** Neither the contract nor a
signed CO ever touches QB. Consequence, stated so it is not re-litigated: **QB cannot answer "what is
this job worth"** — that lives in FrameFocus alone. _(Amended by E3: the **credit document** billing a
negative CO does export — see §0.2.)_

**Not 7G:** the cost-category → cost-account mapping (Company Settings, shipped with 7A as
`companies.gl_account_*`, consumed by 7C at export); the client-facing pay **surface** (QB hosts it);
FrameFocus's own approval gates.

---

## 2. What the rulings change in the sync map

Only the deltas. Everything not listed is unchanged from `7G-spec.md` §7G.4.

| Map row                                             | Change                                                                                                                                                                                                                |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Client invoice → QB **Invoice**                     | Export the **billed** amount, never the derived one (D3). Include the **memo note** on void/reissue pairs (G4). Job `CustomerRef` uses the **job-number naming** convention (G2)                                      |
| **Negative-CO credit document** → QB **CreditMemo** | **NEW (E3).** The signed CO still exports nothing; the credit document that bills it exports. Without this QB overstates income permanently                                                                           |
| Client payment, manual → QB **Payment**             | Recorded by **Owner/Admin only** (E1). `ProcessPayment: false` per §7G.6                                                                                                                                              |
| Credit / refund → **CreditMemo / RefundReceipt**    | Origin split: negative-CO credits from **7D**, overpayment credits and refunds from **7E**. **Blocked on E-c** — 7E must first distinguish credit-on-account from money actually returned                             |
| Invoice **void**                                    | Blocked once a payment has reached QB (**G1**). Where permitted, `operation=void` zeroes it; the successor, if any, is an ordinary create (D5a — and per F4 the successor is **optional**, so a void may be terminal) |
| Retainage-release invoice                           | An ordinary invoice export. Note its 7E gate is now **advisory** (F1) — no QB consequence, recorded so the gate is not mistaken for a sync precondition                                                               |
| Timesheet → Time/Payroll                            | Unchanged, but see G-C8: **not** the same population as D4's billable hours                                                                                                                                           |

**Unaffected, confirmed:** lazy Customer/sub-customer creation at first invoice export (S92);
per-record sync at each record's own approval gate; sub bill → Bill and sub payment → BillPayment with
the gross/net retainage mapping; F1/F2/F3 (7F is entirely internal to FrameFocus — **no QB surface**).

---

## 3. Decision record

### 3.1 Settled this session (Josh's rulings, 2026-07-31)

**G1 — Block the void once QuickBooks holds a payment against the invoice.** Rather than unlinking the
QB Payment or substituting a CreditMemo, FrameFocus refuses the void and directs the user to credit or
refund through 7E. Keeps the books provably aligned and avoids a multi-step API dance that can fail
partway.

> **[NARROWS 7E's E4 — read this]** E4 permitted voiding a **partially paid** invoice (Owner-only,
> with a warning, the payment becoming a client credit). G1 makes that conditional on the payment not
> having reached QB. **In normal operation that window is nearly closed**, because:
>
> - **Electronic payments originate in QB** (Model A) — they are in QuickBooks by definition, so those
>   invoices are never voidable.
> - **Manual payments sync on entry** (§7G.2 #5, per-record at its own gate) — so they are in QB
>   moments after being recorded.
>
> The practical effect: **"partially paid → voidable" collapses to roughly "unpaid → voidable"**, and
> E4's escape hatch survives only while QB is disconnected and the payment sits queued (G3). That may
> be exactly what you want — it is the safest of the three options and you chose it over the two that
> preserved a wider window. **Recorded as a consequence, not a challenge.** If you want a real
> escape hatch for a badly wrong partially-paid invoice, it needs the unlink-then-void path or the
> credit-memo substitution instead.

Resulting rule, consolidating D5/D5b/E4/G1:

| Invoice state                             | Void?                                                               |
| ----------------------------------------- | ------------------------------------------------------------------- |
| Unpaid                                    | **Yes** — Owner/Admin, reason required (D5b)                        |
| Partially paid, payment **not yet in QB** | **Yes** — Owner only, warning, payment becomes a client credit (E4) |
| Partially paid, payment **already in QB** | **No** — credit or refund via 7E (G1)                               |
| Fully paid                                | **No** (D5)                                                         |

**G2 — Jobs are named in QuickBooks as job number + name** (e.g. `1042 — Kitchen Remodel`).
Uniqueness comes from a number already assigned, it stays readable in QB reports, and it cannot
collide with a vendor or employee. Satisfies §7G.6's constraint that `DisplayName` be unique across
Customers/Vendors/Employees and contain no `:`, tab or newline.

> **[VERIFY — G2a]** This assumes **projects carry a human-facing number**. Estimates use `EST-####`
> and change orders `CO-####-##`, but I have **not** confirmed a project/job number exists. If it does
> not, G2 requires one to be introduced before the connector can name anything. **CC must confirm
> against the live project model.** Also confirm the separator character survives QB's constraints and
> that the composed name stays inside QB's length limit.

**G3 — Queue everything while QB is disconnected; sync on reconnect; warn visibly.** Work continues
uninterrupted; records queue in order; a persistent banner surfaces the disconnection; the Owner
reconnects and the queue replays. Consequences — **this makes the sync queue the largest unspecced
build item in 7G**:

1. **Dependency-ordered replay.** Customer → job sub-customer → Invoice → Payment. A payment cannot
   sync before its invoice, and lazy creation (S92) means the customer and job must be created _by the
   queue_ before the first invoice lands.
2. **Burst pacing.** Reconnect after days replays into a 500-req/min per-realm limit with 10
   concurrent; add D6's potential bulk void-and-reissue (G-C7) and the burst grows. The queue must
   pace itself and back off on 429.
3. **Durability.** It must survive restarts and deploys — stored, not in-memory — and be partitioned
   by `realmId` per §7G.3's multi-tenant note.
4. **Never silently drop** — §7G.3's existing rule, now load-bearing.
5. **[OPEN — G3a] Should the queue collapse superseded operations?** If an invoice is sent while QB is
   down and then voided before reconnect, does the queue push create-then-void, or collapse to
   nothing? Collapsing is cleaner and cheaper; replaying both leaves a truer audit trail in QB.
   Recommend **replay both** — QB is the book of record and a void it never saw is a gap — but it is a
   real choice.

**G4 — Note the void/reissue relationship in the QB memo field on both records.** The voided invoice
reads _"replaced by INV-0008"_, the successor _"replaces INV-0007"_. Uses a field QB already has, and
anyone reconciling inside QuickBooks can follow the thread without opening FrameFocus.

> Note what this deliberately excludes: Josh chose **not** to carry the **void reason** into QB. D5b
> makes that reason required, but it stays internal — it is not exposed to the accountant or anyone
> else reading the books. Recorded so it is not "helpfully" added at build.

### 3.2 Still open

- **G3a** — queue collapse vs full replay (above). Recommend full replay.
- **E-c (blocking, from 7E)** — credit memo vs refund receipt. 7G maps two QB objects; 7E collapses
  them into one. **7G's refund path cannot be built until this is split.**
- **[OPEN — G-b] Sync-failure visibility.** §7G.3 says never silently drop, and G3 covers the
  _disconnected_ case. Not covered: a single record that fails to sync while the connection is
  healthy — a validation rejection, a duplicate `DisplayName`, a stale token mid-batch. Who is told,
  where is it surfaced, and is it retried automatically or manually? §S names a per-invoice **sync
  status**, which is the hook; the behaviour around it is unspecified.
- **[OPEN — G-c] Passed-through sales tax on the QB invoice.** P3 makes tax cost-side and _"never
  client-facing"_ — but **D7's pre-tax option passes tax through to the client**, which puts it on the
  invoice. Does it map as an ordinary line amount or as QB's `TxnTaxDetail`? They have different
  tax-reporting consequences. **Likely needs your accountant, not you** — and it is downstream of
  D7a #3 (whether the tax component is even recoverable per expense row).

### 3.3 Verification — ordered by consequence

1. **THE METERED-READ CAP: per company, or per app?** §7G.3 states reads are _"free to ~500k/month on
   the Builder tier, then **blocked**, not throttled."_ It never says which. **Per `realmId`** it is
   generous and Model A is fine. **Per app** — across every FrameFocus customer — it is a hard
   scaling cliff that stops _every_ company's sync at once, with no throttle to soften it. Because
   webhooks carry only a reference and force a **metered follow-up read on every payment event**, plus
   CDC backstop polling, read volume scales with customers × payment activity. **Confirm this before
   committing to Model A's webhook design**; if it is per-app, the CDC polling cadence and possibly
   the whole inbound approach need rethinking.
2. **Void mechanics with a linked payment** — sandbox-confirm that QB refuses, which is what G1
   assumes. If it turns out QB _permits_ it, G1 can be revisited toward E4's wider window.
3. **G2a** — does a project/job number exist? G2 depends on it.
4. **Pay-link rendering** — §7G.6's acknowledged **live-only residual**; needs a real QB-Payments
   company, not sandbox.
5. **Metering tier numbers** — §7G.3 already says confirm at build; the figures date from 2025.

### 3.4 External

- **Pre-Module 9 gate** — Model A **sidesteps** it for the pay surface (QB hosts the page; FrameFocus
  shows only the redirect notice). It still governs 7F's sub-inbound e-signature link.
- **Notification system** — needed before any sync-failure event (G-b) can actually reach a user.

---

## 4. Dependency map

**7G consumes:** 7D's invoice records (**billed** amount per D3, void/successor model per D5a/F4, the
G4 memo text) and the negative-CO credit document (E3) · 7E's payments, credits and refunds (blocked
on E-c) · 7C's shipped bills/vendors with the gross/net retainage mapping · Company Settings for
`realmId`, encrypted rotating tokens, the QB-Payments flag and the income-Item mapping · the project
model for G2's job number.

**Waiting on 7G:** **7E's electronic-payment half** — §7G.5's amendment stands, the non-QB half builds
first and the electronic half stubs until 7G ships. Nothing else in the 7-series blocks on it; 7H
reads FrameFocus data, not QB.

---

## 5. Amendments this prep obliges

1. **`7G-spec.md` §7G.4** — state that the invoice exports the **billed** amount (D3); add the
   **negative-CO credit document → CreditMemo** row and the explicit note that it does _not_ contradict
   _"a signed CO exports nothing"_ (E3); split the credit/refund row by origin (7D vs 7E).
2. **`7G-spec.md` §7G.4 / §7G.6** — record **G1**: void blocked once a payment has reached QB.
3. **`7G-spec.md` §7G.6** — record **G2**'s naming convention, and the G2a dependency on a job number.
4. **`7G-spec.md` §S** — the **sync queue** becomes a named build item: durable, per-`realmId`,
   dependency-ordered, self-pacing (G3). Add the **memo field** to what must be storable (G4).
5. **`7E-spec.md`** — E4's void rule is narrowed by G1; the consolidated table in §3.1 is the
   authority. _(Prep docs updated.)_
6. **The 7D and 7E prep docs' void tables** — amended for G1. _(Applied.)_

---

## 6. Recommended next step

**Answer the metered-read question before anything else is built.** It is the only open item that can
invalidate a design decision already made rather than merely refine one — and it is answerable from
Intuit's partner documentation without writing code.

After that, 7G's build order is already well-formed and unusually low-risk for an integration: the
sandbox closes almost everything, and §7G.6 is honest that exactly one item — pay-link rendering on a
real QB-Payments company — cannot be closed there.
