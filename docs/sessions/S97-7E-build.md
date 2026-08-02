# S97 — Module 7E1 (Payments & AR) build report

> **Built:** 2026-08-02, three phases in one run, Josh away.
> **Branch:** `feature/113c-award-commitment-spec` — never switched, never `main`.
> **Authority:** `docs/specs/7e1-spec.md` as committed, `money-representation.md` as amended,
> and **7D as SHIPPED** (`S97-7D-build.md`). Where spec and live schema conflicted, git won and
> the conflict is recorded rather than resolved silently.
> **Database:** rebuild-test (`nmyphyhmfttxkdoposvf`) — verified before every write. Production
> untouched.
>
> **CLICK-TEST AUTOMATED 2026-08-02 [S97]:** §5's script was executed end-to-end against real
> rows on rebuild-test through the real service functions, under genuine Owner / **Admin** /
> PM / **Foreman** sessions — **29/30 PASS, 1 FAIL**. The failure is a **real defect in the
> correction path**, not a bad expectation: see **§7a**. Figures and per-assertion verdicts in
> **§4a**; §5 is now the trimmed eyes-only script.

---

## 0. Verification

| Check | Result |
| --- | --- |
| `npm run type-check` | **PASS** (5/5) |
| `npm run test -w @framefocus/web` | **PASS** — 10 files, **174 tests** (149 pre-existing + **25 new 7E trace tests**) |
| `npm run build` | **PASS**, uncached, no dev server running; `/dashboard/projects/[id]/payments` registered |
| Migrations | `20260804000000`, `20260804010000` applied to rebuild-test and verified with `information_schema` / `pg_get_functiondef` |
| Live RPC guards | **6/6 PASS** against real rows under a genuine Owner session — superseded by §4a |
| **Automated click-test** | **29/30 PASS, 1 FAIL** — 30 assertions through the shipped services under 4 real role sessions (§4a). The FAIL is §7a |

**Re-verified 2026-08-02 after a Codespace restart, uncached:** `type-check` 5/5 (`--force`,
28.6s), `test -w @framefocus/web` 10 files / 174 tests, `build` cold after `rm -rf .next`
(2m14s) with `/dashboard/projects/[id]/payments` at 6.59 kB. Migrations `20260804000000` and
`20260804010000` confirmed applied, local and remote in sync, no desync rows.

**Test data:** all 7E fixtures deleted; `client_payments`, `client_payment_applications`,
`client_refunds`, `retainage_releases` all read **0 rows**. Two invoices on a project named
"test" were left alone — they carry `INV-0001` and a hand-typed title and are **Josh's own 7D
click-testing**, not my residue.

---

## 1. What was built

| Phase | Commit | Contents |
| --- | --- | --- |
| 1 — Schema layer | `dfb9bfe` | `7e1-spec.md` §S filled from the live repo; 5 conflicts, 4 decisions |
| 2a — Migration | `57a546f` | `20260804000000_7e_payments.sql` — 4 tables, 2 RPCs, 5 triggers, 12 policies |
| 2b — Services | `90cd365` | `payments-shared.ts` / `payments.ts` / `payments-client.ts` + 25 trace tests |
| 3 — UI + fix + report | *(this commit)* | Payments screen, `20260804010000` deletion-reason fix, this report |

### Schema (`20260804000000`)

- **`client_payments`** — the payment record, hung off the **contact**, because aging and the
  credit balance are per client and one check may cover invoices across several of that client's
  jobs.
- **`client_payment_applications`** — payment↔invoice, a **genuine many-to-many join** (§2,
  acceptance #2). Rows are added over time, which is how a credit gets placed later.
- **`client_refunds`** — money **returned**, with the approval state §5 needs.
- **`retainage_releases`** — the recorded client sign-off and its release invoice, one per project.

**Mirrors 7C's shipped money-out posture exactly**, as §2 directs: the immutability trigger is
`enforce_expense_payments_column_scope`'s shape, including the `auth.uid() IS NULL` early return,
raising *"A recorded payment is immutable — soft-delete and re-enter to correct it."*

**Everything else is DERIVED**: remaining owed, the client credit balance, retainage held, and the
aging buckets. No stored balance anywhere — 7C's discipline and 7D's. A soft-deleted payment
therefore withdraws its own credit and reopens its invoices with no repair step.

### Services

`payments-shared.ts` (pure, no supabase — the client-bundle boundary guard), `payments.ts` (server
reads), `payments-client.ts` (client writes). Money paths go through the SECURITY DEFINER RPCs,
never table writes: the Owner/Admin gate, the derived-remaining check, the over-application refusal
and the invoice settlement all live there, and a direct insert would skip all four.

### UI — `/dashboard/projects/[id]/payments`

Owner/Admin/PM tab (Foreman/Crew redirected). Carries: the §6a pairing strip; the aging view with
**retainage rendered outside the buckets**; a record-payment panel that splits one check across many
invoices with an oldest-first auto-allocate and a live "this much will sit as credit" readout; the
credit-on-account block with per-payment apply; the payment list with unapply and remove; the
retainage-release panel; and the refunds panel. **Recording is hidden for a PM**, though the RPC is
the actual boundary.

---

## 2. PROVISIONAL decisions — and how to reverse each

Josh has ruled none of these. Each was taken as the safest reversible option and is marked
PROVISIONAL in the migration header or the code.

**P-1 — Aging runs from `issue_date`.** `invoices.due_date` exists but **nothing writes it**: 7D
shipped no control and payment terms are unruled (7D open item #3). §6 specifies 30/60/90 but never
names day zero, so the only populated date is used.
*Reverse:* one line in `agingBucketFor` to take a `dueDate` and prefer it. **No schema change** —
the aging is derived entirely at read — plus a decision about invoices already sent.
**This is the top decision 7E owes.**

**P-2 — An invoice auto-marks `paid`** when applications settle its receivable. 7D leaves `'paid'`
in the CHECK for 7E to set and `status` is not in its immutability trigger's frozen set, so this is
legal.
*Reverse:* drop the status arm from `record_client_payment` / `apply_client_credit`.

**P-3 — A PM may READ payments, not write them.** §8 restricts *recording* only; 7D §12a already
shows a PM invoice amounts, and a PM who cannot see whether their invoice was paid cannot do the
job. Refunds stay Owner/Admin.
*Reverse:* drop `project_manager` from the two SELECT policies.

**P-4 — An application may never exceed an invoice's remaining.** §3 says a surplus becomes a credit
on account, so the surplus stays **unapplied** rather than over-applying the invoice. Deliberately
unlike 7C's `over_stage` override, which exists because a sub stage genuinely can be overpaid.
*Reverse:* relax the guard and add an override flag.

**P-5 — The retainage-release trigger is a *recorded* sign-off.** §4.1's trigger is the client's
final walkthrough; there is no client-facing surface (Pre-M9) and no sign-off object in the schema,
so an Owner/Admin records that it happened.
*Reverse:* wire to a real client action once a portal exists — the `signed_off_on` column already
holds the right date either way.

**P-6 — The credit balance is derived, not stored** (§S.12 D2), matching 7D's derived deposit
balances and negative-CO availability.
*Reverse:* would require a stored column and a reconciliation job; not recommended.

---

## 3. Conflicts between spec and live schema

**C1 — `invoices.due_date` is never written.** §6's aging has no due date to age from. Handled by
P-1. *(Recorded in `7e1-spec.md` §S.12 C1.)*

**C2 — the electronic-payment path cannot be built.** §2 makes 7G **mandatory** for it and §A.1
calls 7G a hard upstream dependency. 7G is not built and the pay link is Pre-M9 gated. **Acceptance
#1 and #5 are unbuildable this run.** 7E v1 is manual intake only; the `qb_payment_id` /
`qb_push_status` columns ship **inert** so 7G has somewhere to write.

**C3 — §4.1's trigger is a client action with no client surface.** Handled by P-5.

**C4 — §5's "Admin refund needs Owner approval" needed an approval state** that no existing
money-out object has — 7C's Owner arms are hard gates, not workflows. Built as
`status` + `approved_by` + `approved_at` on `client_refunds`, shape-checked both ways.

**C5 — §2's `[VERIFY — CC]` on QuickBooks payment semantics is not closable here.** It asks for
sandbox confirmation of QB's edit/delete behaviour; no QB connection exists. The spec's own fallback
— implement as 7C shipped money-out — is what this build follows. **The verification stays open.**

**C6 — migration-history desync, found and repaired.** `20260803000000` (7D numbering-at-send)
existed **locally but not remotely**, while a phantom `20260801223550` existed **remotely with no
local file** — the same DDL, recorded under the timestamp the MCP `apply_migration` path generates
rather than the repo filename. `supabase db push` would have tried to re-apply `20260803000000` and
**failed**. Both records repaired so local and remote agree; the schema itself never changed.
**Anyone applying the owed production batch would have hit this.**

---

## 4. What is NOT built, and why

| Not built | Why |
| --- | --- |
| **Electronic payments / pay link** | §2 makes 7G mandatory; 7G not built + Pre-M9 gate (C2) |
| **QuickBooks export of any kind** | 7G. The `qb_*` columns exist and stay inert |
| **Per-client reminder config (§6)** | §S.6 confirms **no notification surface exists** and RESEND is gated. Config that cannot fire is worse than none — the schedule/wording columns were deliberately not added |
| **Reminder sending (§6)** | Same — no delivery mechanism |
| **§7's seven notification events** | Named in the spec, delivered by nothing (§S.12 D4) |
| **Sub-retainage pass-through default (§S.8)** | Confirmed absent (`subcontractor_contracts.retainage_percent` has no default), but that is **7C's shipped table** and out of 7E's lane. Left for Josh to authorise |
| **Sub-retainage release** | 7C owns it and already ships it, Owner-only. §4.2 only corrects 7E's description of *when it becomes due* |
| **A standalone credit document** | Ruled away — a negative CO is a 7D credit line (7D §4a). 7E's only negative-CO role is the refund case, and that is built |

---

## 4a. Automated click-test run [S97, 2026-08-02]

§5's script was executed against **rebuild-test** (`nmyphyhmfttxkdoposvf`, gated on the linked
project ref before a single row was written — the harness refuses to start otherwise).
Everything checkable without a browser was driven through the **real shipped service
functions** — `recordPayment`, `applyCredit`, `voidPayment`, `createRefund`, `approveRefund`,
`recordSignOffAndGenerateRelease`, `getClientPayments`, `getProjectPayments`,
`getClientCreditBalance`, `getInvoiceRemaining`, `getOpenInvoices`, `getProjectAging`,
`getProjectRetainageHeld`, `getRetainageRelease`, plus 7D's `createInvoice`, `addFixedLine`,
`recalculateInvoiceTotals` and `markInvoiceSent` to build the invoices being paid — against
**real rows**, under **four genuine sessions** minted with `generateLink` + `verifyOtp`
(**Owner, Admin, PM, Foreman**). RLS, the `get_my_company_id()` / `auth.uid()` column defaults,
the invoice numbering trigger and every immutability trigger were live. Not a mock, and not
hand-written SQL standing in for the service layer.

The only thing stubbed is the Supabase client **factory** (`@/lib/supabase-browser`,
`@/lib/supabase-server`), which wraps `next/headers` and the browser cookie store and cannot
run in node. The client handed back is a real `supabase-js` client on the **anon key** carrying
a real user JWT, so RLS applies exactly as it does in the app.

**30 assertions, 29 PASS, 1 FAIL.** No app code was changed — the FAIL is recorded in §7a and
left unfixed, pending Josh's call.

**Identities.** rebuild-test had only Owner, PM and Crew — **no Admin and no Foreman**, which is
`GATED.md` Gate 2 (#103) and is exactly why the refund-approval and Foreman gates had never been
exercised. The harness **mints an Admin and a Foreman** (auth user + profile; `profiles_create_member`
auto-creates the `company_members` row), uses them, and deletes them. Standing them up costs
about 20 lines — **Gate 2 can be closed permanently whenever Josh wants**, and it is the single
highest-value fixture on rebuild-test.

### Results — every assertion

| # | Assertion | Verdict | Actual |
| --- | --- | --- | --- |
| 1 | §9-A totals | **PASS** | $18,000 line at 10% → billed **18000**, withheld **1800**, receivable **16200**, status `sent`, numbered at send |
| 2 | §6 — retainage sits in NO bucket | **PASS** | Held **1800**; bucket sum **24200** = total outstanding **24200** (16200+4000+1000+2500+500). The 1800 is in neither |
| 3 | §9-A partial payment | **PASS** | $10,000 → invoice stays **`sent`**, remaining **6200** |
| 4 | P-4 over-application refused | **PASS** | *"9000.00 exceeds the 6200.00 remaining… The surplus stays on the payment as a credit."* Payment count unchanged (RPC rolled back), remaining still **6200** |
| 5 | §9-B one check, two invoices | **PASS** | $10,200 → **2** applications (6200 + 4000); **both** invoices `paid`, both remaining **0** |
| 6 | §9-C overpayment → credit | **PASS** | $1,300 against a $1,000 invoice → invoice `paid`, **$300** credit available, client credit balance **300** |
| 7 | §3 credit never auto-applies | **PASS** | The other invoice still owes **2500** |
| 8 | §3 credit applied later | **PASS** | Applied 300 → invoice remaining **2200**, credit balance **0** |
| 9 | §3 spent credit cannot re-apply | **PASS** | *"Only 0.00 remains as credit on this payment."* |
| 10 | Settled invoice takes no more | **PASS** | Refused — 0.00 remaining |
| 11 | §2 removal requires a reason | **PASS** | Blank rejected: *"A reason is required to remove a recorded payment."* |
| 12 | §2 removal stores `deletion_reason`, reopens the invoice | **PASS** | `is_deleted` true, `deleted_at` set, `deletion_reason` stored, **`note` still NULL** (the S97 defect stays fixed), applications soft-deleted, invoice owes **500** again, credit balance **0** |
| 13 | §2 the reopened invoice is offered again | **FAIL** | **See §7a.** `status` stays `paid`, derived remaining **500**, but `getOpenInvoices` → **not offered** |
| 14 | §2 a recorded payment is immutable | **PASS** | *"A recorded payment is immutable — soft-delete and re-enter to correct it."* |
| 15 | §2 no payment on a DRAFT invoice | **PASS** | *"Only a sent invoice can take a payment — a draft has not been issued and a voided one billed nothing."* |
| 16 | §4.1 sign-off generates the release invoice | **PASS** | Held **1800** → a **`draft`**, `invoice_number` **NULL** (numbered only at send), billed **1800**, withholds **0** itself, receivable **1800**, `is_final` true |
| 17 | §4.1 the release is recorded | **PASS** | `signed_off_on` 2026-08-02, amount **1800**, `release_invoice_id` → the draft, `lien_release_warned` true |
| 18 | §4.1 one release per job | **PASS** | *"A retainage release has already been recorded for this job."* |
| 19 | §5 **Admin** refund waits for Owner | **PASS** | Under a real Admin session: `pending_approval`, `approved_by` NULL, `approved_at` NULL |
| 20 | §5 Admin cannot approve their own | **PASS** | *"Only the Owner can approve a refund."* — and the row is **still** `pending_approval` afterwards |
| 21 | §5 Owner approves | **PASS** | `approved`, `approved_by` = Owner's member id, `approved_at` stamped |
| 22 | §5 Owner-initiated is approved on creation | **PASS** | `approved` immediately, `approved_by` set |
| 23 | P-3 a **PM** can READ payments | **PASS** | `getProjectPayments` returns the job's payments under a real PM session |
| 24 | §8 a PM cannot RECORD | **PASS** | *"Only an Owner or Admin can record a payment received."* (raised by the RPC, not the UI) |
| 25 | §3 a PM cannot apply a credit | **PASS** | *"Only an Owner or Admin can apply a client credit."* |
| 26 | §5 refunds invisible to a PM; cannot issue | **PASS** | Direct select returns **0 rows** (RLS); *"Only an Owner or Admin can issue a refund."* |
| 27 | §8 a PM cannot remove a payment | **PASS** | RLS matches zero rows; re-read as service role, the payment is **untouched** (`is_deleted` false, `deletion_reason` NULL) |
| 28 | §8 a **Foreman** sees no payments | **PASS** | **0 rows** |
| 29 | §8 a Foreman sees no applications, no releases | **PASS** | **0 rows** and **0 rows** |
| 30 | §8 a Foreman cannot record | **PASS** | *"Only an Owner or Admin can record a payment received."* |

> One assertion (#15) failed on the first run against my own literal — the RPC raises the
> message lowercase and `friendlyPaymentError()` rewrites it capitalised for the UI. The
> **behaviour** was right; the harness string was wrong, and was made case-insensitive. That is a
> harness typo, not an expectation tuned to the code. #13 was **not** touched.

### Test data and teardown

Fixtures carried an `S97CT7E` marker: 1 contact, 1 project (fixed-price, 10% retainage,
$100,000 contract), 1 PM project assignment, **6 invoices** (five sent + one deliberate draft),
their lines, and the Admin + Foreman identities. **All of it is deleted.** rebuild-test reads
0 payments / 0 applications / 0 refunds / 0 retainage releases / **0 `S97CT7E` rows**, and back
to its starting **2 invoices, 1 invoice line, 7 projects, 4 contacts, 3 profiles, 3 auth users,
6 company members, 0 orphan assignments**. Josh's own two 7D click-test invoices (`INV-0001` and
the untitled draft) were never touched. `invoice_number_sequence` was rewound to its pre-run
value of **1** — guarded so it only rewinds when exactly Josh's 2 invoices remain, so no live
invoice can ever be renumbered. Production was never touched.

> **The FK teardown trap — and a correction to 7D's note.** 7D's harness accumulated five runs'
> fixtures (95 invoices) because it never checked its delete errors. Chasing the same trap here
> turned up something more precise, and **7E has made it worse**:
>
> - **The real trap is DELETE ORDER, not the triggers.** `invoices_immutability` fires on
>   **UPDATE only** and never blocks a delete. `invoice_lines_parent_open` *does* fire on DELETE,
>   but it early-returns when the parent invoice is already gone — with the explicit comment
>   *"blocking here would make an invoice undeletable"*. So deleting the **invoice** and letting
>   `invoice_lines_invoice_id_fkey ON DELETE CASCADE` take the lines **just works**. What fails is
>   deleting the **lines first**, while the sent parent is still there. My first pass stood both
>   triggers down through a temporary SECURITY DEFINER function; that was **unnecessary**, and it
>   has been removed — the function is dropped and all seven triggers on `invoices` /
>   `invoice_lines` verified back at `tgenabled = 'O'`. The committed harness touches no trigger
>   and needs no elevated privilege.
> - **Three FKs reference `invoices` with no `ON DELETE` action**, and each blocks the delete until
>   its own rows go first — `invoice_lines.source_deposit_invoice_id` (7D, the one that bit 7D),
>   and **two that 7E added**: `client_payment_applications.invoice_id` and
>   `retainage_releases.release_invoice_id`. **Anyone writing a data-reset script must now delete
>   7E rows before invoices**, which was not true before this module.
>
> **Every delete's error is checked**, and the run prints a full count dump plus an explicit error
> list, so the failure mode that bit 7D cannot recur silently here.

**The harness itself** is `apps/web/test/s97ct-7e-clicktest.live.ts` with its own runner config
`apps/web/test/s97ct-7e.vitest.config.ts`. The `.live.ts` suffix does **not** match the
`**/*.{test,spec}.{ts,tsx}` include in `vitest.config.ts`, so **CI never runs it** and the
committed 174-test suite is unaffected. Run it deliberately:

```
cd apps/web && npx vitest run --config test/s97ct-7e.vitest.config.ts
```

It is committed (7D's was thrown away) so this is repeatable rather than a one-off claim.

---

## 5. TRIMMED manual script — what still needs eyes and hands

**Every figure, guard and role gate above is already proven** (§4a). What is left is layout,
wording, and the two judgement calls where §6a and the release flow are inventions with no lived
workflow to check against. Roughly **8 minutes**, down from 15.

**Setup.** rebuild-test, signed in as **Owner**, on a project with a **sent** invoice that has
retainage withheld. The automated run left no data behind, so you are starting from empty.

1. **Nav placement.** Open a project. *Expect:* a **Payments** tab after Invoices. **Judgement
   call: does the empty state read like a deliberate sentence or a blank table?**
2. **The aging view — the most important read.** *Expect:* four buckets, a **Total outstanding**,
   and **Retainage held** below a dashed rule with the sentence explaining it sits outside the
   buckets. The arithmetic is proven; what is not is legibility. **Judgement call: is it
   unmistakable that retainage is not overdue?** That is the rule the real $1M job turns on.
3. **The pairing strip.** *Expect:* Collected / Spent / Ahead by. **Judgement call: is this "the
   number you have never been able to see", or does it need more?** §6a is invented by design and
   has no lived workflow to check against — your read is the only correction available.
4. **Auto-allocate.** With two open invoices, enter a figure covering both and click
   **Auto-allocate oldest first**. The split arithmetic is proven; **judgement call: does
   oldest-first do what you'd do by hand?**
5. **The overpayment warning.** Enter more than is owed, allocate only what is owed. *Expect:*
   the surplus called out as *"…will sit as a credit on account"* **before** you commit.
   **Judgement call: is that warning clear enough to stop a mis-keyed amount?**
6. **The release panel.** With retainage held, *expect* the panel to explain the trigger is the
   client's final walkthrough and to take a sign-off date. The generated draft is proven correct
   to the cent. **Judgement call: two invoices (final draw + release) instead of your current
   one — still OK?**
7. **Removal wording.** Remove a payment. The mechanics are proven. **Judgement call: is "remove
   and re-enter" clear enough as the correction path?** — and note **§7a**, which says that path
   is currently broken in the picker, so read this with that in mind.
8. **PM and Foreman, visually.** The gates are proven at the RLS and RPC layer for both roles
   (#23–#30). What is unproven is the *screen*: as a PM, **expect the read-only note and no
   record/remove/refund controls**; as a Foreman, **expect no Payments tab** and a redirect if you
   navigate to it directly. This is UI mounting, not permission — the permission itself is done.
---

## 6. What I want Josh to rule on

0. **§7a — the broken correction path.** Now the top item, ahead of due dates: removing a payment
   reopens the debt but the invoice vanishes from the record-payment picker, so the corrected
   payment cannot be entered. Two candidate fixes below; both are small, and the choice is bound
   up with item 2. **This is a live defect, not a decision that can wait.**
1. **Payment terms / due dates.** Aging currently runs from the issue date because
   nothing writes a due date. Do invoices carry terms (Net 15/30, due on receipt)? Per-invoice, a
   company default, or both? Everything else in 7E is settled; this one changes what "overdue" means.
2. **Is auto-marking an invoice `paid` right (P-2)**, or should settlement stay a deliberate action?
   **§7a raises the stakes on this one** — the stale `paid` status is what breaks the correction path.
3. **Should a PM see payments at all (P-3)?** I allowed read because the alternative makes their
   invoice view half-blind, but money-in is deliberately a different shape and you may want it
   tighter.
4. **§6a's pairing is invented and PROPOSED.** It cannot be corrected against a lived workflow until
   it runs on a real job. Tell me what's missing once you've seen it.
5. **The sub-retainage pass-through default** (`subcontractor_contracts.retainage_percent` has no
   default, so the rate is typed twice). One-line migration, but it touches shipped 7C — authorise it
   as its own change and I'll do it.
6. **§2's QuickBooks `[VERIFY — CC]`** stays open until there's a sandbox connection.

---

## 7a. DEFECT FOUND AND LEFT UNFIXED — the correction path is broken [S97, 2026-08-02]

**Assertion #13 failed.** It is not fixed, and no expectation was adjusted to make it pass.

**What happens.** Record a payment that settles an invoice, then remove it — the documented and
**only** correction path (§2, P-2, and §5 item 7). The debt correctly comes back: derived
remaining returns to the full amount and the invoice re-ages. But the invoice is **no longer
offered for payment**, so the corrected payment cannot be entered.

Measured on a real $500 invoice, immediately after its only payment was removed:

```
status:                   "paid"      ← stale; nothing reverts it
amount_receivable:        500
derivedRemaining:         500         ← correct, the money is owed again
offeredByGetOpenInvoices: false       ← the bug
```

**Root cause.** `record_client_payment` sets `status = 'paid'` when applications settle the
receivable (P-2), and **nothing sets it back** when the settling application is soft-deleted —
`voidPayment()` only soft-deletes rows. Everything else in 7E is derived and self-corrects;
`status` is the one stored field, and it goes stale. `getOpenInvoices()` then filters
`.eq('status', 'sent')` (`payments.ts:345`), so the reopened invoice is filtered out — even
though `record_client_payment` itself happily accepts `'sent'` **or** `'paid'`.

**Blast radius — worse than it first looks.** `getOpenInvoices` feeds the whole Payments page
(`payments/page.tsx:57`), and in the UI:

- the **record-payment panel is hidden entirely** when the list is empty
  (`payments-view.tsx:272` — `canRecord && openInvoices.length > 0`), so on a job whose only
  invoice was just corrected, the panel **disappears**;
- the **credit-apply panel** early-returns on the same empty list (`payments-view.tsx:619`), so a
  credit on account cannot be placed on that invoice either.

The aging view still shows the money as outstanding — so the screen says you are owed $500 and
offers no way to record being paid it.

**`unapplyPayment()` has the same shape** and was **not** exercised by the harness: unapplying an
application from a settled invoice leaves `status = 'paid'` by the identical route. Treat it as
carrying the same defect until proven otherwise.

**Two candidate fixes — Josh's call, deliberately not applied:**

- **(a) Widen the read.** `getOpenInvoices` filters `.in('status', ['sent','paid'])` and leans on
  its existing `remaining > 0` filter. One line, matches what the RPC already accepts and what
  `ageReceivables` already does. Leaves the stale `paid` status visible on screen.
- **(b) Revert the status.** Set `status` back to `'sent'` when a settling application is
  soft-deleted (in `voidPayment` / `unapplyPayment`, or a trigger). Keeps `status` honest, but
  adds a second writer to a 7D-owned column and needs the same care 7D's immutability trigger
  took.

(a) is smaller and safer; (b) is more correct. They are not exclusive. **If P-2 is reversed
(ruling item 2), the whole class disappears** — which is the real reason these two are linked.

**Why nothing caught this before.** Same lesson as §7, one layer up: `tsc`, the 25 pure-derivation
tests and the build were all green, and so were the six original live RPC guards — because none of
them ran the *sequence* record → settle → remove → re-record. Only driving the real service
functions in order surfaced it.

---

## 7. One defect I introduced and fixed

The live RPC test caught it, and it is worth recording because type-check, the unit tests and the
build were all green while it was broken.

`voidPayment()` appended the removal reason to `note` — and `note` **is** in the immutability
trigger's frozen set, mirroring 7C, so the trigger correctly rejected the whole soft delete. **The
correction path did not work at all.** My Phase-2b commit message asserted the opposite ("`note`…
is not a money column"); that claim was wrong.

The trigger was right, so the fix was a column that is *not* part of the frozen record:
`client_payments.deletion_reason` (`20260804010000`), written only at soft-delete and deliberately
left out of the frozen list.

**The lesson worth keeping:** the guards that matter here live in triggers and RPCs, and nothing in
`tsc`, the pure-function tests or the build exercises them. Only running them against real rows
does.

---

## 8. Files

**New**
```
supabase/migrations/20260804000000_7e_payments.sql
supabase/migrations/20260804010000_7e_payment_deletion_reason.sql
apps/web/lib/services/payments-shared.ts
apps/web/lib/services/payments-shared.test.ts        (25 tests)
apps/web/lib/services/payments.ts
apps/web/lib/services/payments-client.ts
apps/web/app/dashboard/projects/[id]/payments/page.tsx
apps/web/app/dashboard/projects/[id]/payments/payments-view.tsx
apps/web/test/s97ct-7e-clicktest.live.ts       (30-assertion live click-test, §4a)
apps/web/test/s97ct-7e.vitest.config.ts        (its runner — NOT in the CI suite)
```

**Modified**
```
docs/specs/7e1-spec.md                               §S filled
apps/web/app/dashboard/projects/[id]/project-header.tsx   Payments tab
packages/shared/types/database.ts                    regenerated
```

**Owed next:** the production migration batch now also carries `20260804000000` and
`20260804010000` — and note C6, the history repair, without which the batch would have failed.
