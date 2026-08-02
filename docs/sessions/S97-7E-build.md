# S97 — Module 7E1 (Payments & AR) build report

> **Built:** 2026-08-02, three phases in one run, Josh away.
> **Branch:** `feature/113c-award-commitment-spec` — never switched, never `main`.
> **Authority:** `docs/specs/7e1-spec.md` as committed, `money-representation.md` as amended,
> and **7D as SHIPPED** (`S97-7D-build.md`). Where spec and live schema conflicted, git won and
> the conflict is recorded rather than resolved silently.
> **Database:** rebuild-test (`nmyphyhmfttxkdoposvf`) — verified before every write. Production
> untouched.

---

## 0. Verification

| Check | Result |
| --- | --- |
| `npm run type-check` | **PASS** (5/5) |
| `npm run test -w @framefocus/web` | **PASS** — 10 files, **174 tests** (149 pre-existing + **25 new 7E trace tests**) |
| `npm run build` | **PASS**, uncached, no dev server running; `/dashboard/projects/[id]/payments` registered |
| Migrations | `20260804000000`, `20260804010000` applied to rebuild-test and verified with `information_schema` / `pg_get_functiondef` |
| Live RPC guards | **6/6 PASS** against real rows under a genuine Owner session — figures in §5 |

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

## 5. Click-test — verified programmatically vs needs Josh

### Verified programmatically — do not re-test by hand

**25 pure-derivation tests** (`payments-shared.test.ts`) proving the §9 traces compute the spec's
exact figures:

| Trace | Asserted |
| --- | --- |
| §9-A | $18,000 billed / $1,800 retained → receivable **$16,200**; a $10,000 check leaves **$6,200**; the $1,800 appears in **no bucket** and not in the outstanding total; pairing 10,000 − 7,400 = **+2,600** |
| §9-B | one $25,000 check, **two** applications ($6,200 + $18,800), both invoices satisfied; and the mirror — one invoice taking several payments |
| §9-C | $6,200 invoice paid $6,500 → **$300 credit**, never auto-applied; final $4,000 paid $4,300 → $300 with nowhere to go → refund; Admin refunds need Owner approval |
| §9-E | the **real $1,000,000 job**: nine draws at 10% → **$99,999.99** held, and after **nine months** none of it entered a bucket |
| §6 | buckets at exactly 30/60/90; **acceptance #14** — a reissue ages from its own date (current, not 70 days overdue) **and** surfaces the link to the voided original; drafts never age |
| §6a | collected = Σ applications on the job; an unapplied surplus is **not** collected |

**6 live RPC-guard tests** against real rows under a genuine Owner session, with the actual messages:

| Guard | Result |
| --- | --- |
| Partial payment leaves the invoice `sent` | **PASS** |
| Over-application refused | **PASS** — *"9000.00 exceeds the 6200.00 remaining… The surplus stays on the payment as a credit."* |
| One payment → two invoices, both settle to `paid` | **PASS** |
| $1,300 against a $1,000 invoice leaves **$300** unapplied as credit; applying it to a settled invoice refused | **PASS** |
| A recorded payment cannot be edited | **PASS** — *"A recorded payment is immutable — soft-delete and re-enter to correct it."* |
| A payment cannot land on a **draft** invoice | **PASS** |

### Needs Josh's eyes and hands

Roughly 15 minutes, on rebuild-test as Owner, on a project with a **sent** invoice that has
retainage withheld.

1. **Nav.** Open a project → expect a **Payments** tab after Invoices.
2. **The aging view.** Expect four buckets, a **Total outstanding**, and **Retainage held** below a
   dashed rule with the sentence explaining it sits outside the buckets. **Judgement call: is it
   unmistakable that retainage is not overdue?** That is the rule the real $1M job turns on.
3. **The pairing.** Expect *Collected / Spent / Ahead by*. **Judgement call: is this "the number you
   have never been able to see", or does it need more?** §6a is invented by design and has no lived
   workflow to check against — your read is the only correction available.
4. **Record a payment, partial.** Enter less than the invoice's remaining, apply it, Record. Expect
   the invoice to stay open and the aging to drop by that amount.
5. **One check, two invoices.** With two open invoices, enter a figure covering both and click
   **Auto-allocate oldest first**. Expect both filled oldest-first, and both marked paid after
   recording. **Judgement call: does auto-allocate do what you'd do by hand?**
6. **Overpay.** Enter more than is owed and allocate only what is owed. Expect the surplus called
   out as *"…will sit as a credit on account"* before you commit, then a **Credit on account** block.
   Apply it to another invoice. Expect it never to move on its own.
7. **Remove a payment.** Expect a required reason, and the invoice to reopen and re-age afterwards.
   **Judgement call: is "remove and re-enter" clear enough as the correction path?**
8. **Retainage release.** With retainage held, expect the release panel to explain the trigger is the
   client's final walkthrough, take a sign-off date, and generate a **draft** invoice for exactly the
   held amount that still needs approval to send. Open it from Invoices and confirm the figure.
   **Judgement call: two invoices (final draw + release) instead of your current one — still OK?**
9. **Refund.** Issue one. As Owner it should be approved immediately; **sign in as Admin** and expect
   it to wait for Owner approval.
10. **PM check.** As a PM on the job: expect to **see** the aging, payments and pairing, and to have
    **no** record/remove/refund controls, with the read-only note. As Foreman: expect **no Payments
    tab** and a redirect if you navigate to it directly.

---

## 6. What I want Josh to rule on

1. **Payment terms / due dates** — the top one. Aging currently runs from the issue date because
   nothing writes a due date. Do invoices carry terms (Net 15/30, due on receipt)? Per-invoice, a
   company default, or both? Everything else in 7E is settled; this one changes what "overdue" means.
2. **Is auto-marking an invoice `paid` right (P-2)**, or should settlement stay a deliberate action?
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
```

**Modified**
```
docs/specs/7e1-spec.md                               §S filled
apps/web/app/dashboard/projects/[id]/project-header.tsx   Payments tab
packages/shared/types/database.ts                    regenerated
```

**Owed next:** the production migration batch now also carries `20260804000000` and
`20260804010000` — and note C6, the history repair, without which the batch would have failed.
