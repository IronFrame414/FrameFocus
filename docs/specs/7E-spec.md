> # ⚠️ SUPERSEDED — DO NOT BUILD FROM THIS FILE
> **Replaced by `docs/specs/7e1-spec.md` [S94].** Retained unchanged for audit only.
> Known-wrong here: §8 and acceptance #3 let a PM record payments received, which
> contradicts architecture §7.6 and the §7.11 trace (marked "Founder, corrected #9");
> negative-CO credits and the cost-to-date/revenue pairing are both absent though
> §7.2 assigns them to 7E; acceptance #5 says "job-named Project" when the QBO
> Projects feature is explicitly not used; §4's retainage gate reads as enforcing.
> Any cross-reference to "7E-spec.md" means **7e1-spec.md**.
# Module 7E — Payments & AR — Spec

> **Derives from** `module7-architecture.md` §7.0 (scope), §7.2 (sub-module table), §7.3
> (dependency map), §7.4 (owns-vs-inherits), §7.5 (cross-cutting), §7.11 (7E trace). When this spec
> and the architecture doc conflict, the architecture doc wins until amended. When this spec and
> shipped code conflict, **git is ground truth** — amend the spec.
>
> **Status:** WORKFLOW APPROVED + PROVEN (interview, this session). **Schema layer deliberately
> absent** — see §S. No table names, columns, or file paths are asserted as fact.
>
> **Two amendments this spec records against the architecture doc** (§A) — read them; they change
> the dependency map and name an external system.
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
applies to one or more invoices — no orphan income.

---

## §2 — Payment intake

- **Electronic:** the client pays via the invoice pay link; **payment is processed through
  QuickBooks.** QB integration (7G) is **mandatory** for this path — see §A.1. **Partial payment
  is accepted.**
- **Manual (check / cash):** a user enters the payment and applies it across one or more invoices,
  QuickBooks-style. **One payment can split across several invoices; one invoice can be satisfied by
  several payments over time.**
- **Every invoice pushes to QuickBooks** (not only electronically paid ones). On sync, QB tags each
  invoice/payment to the job's QB **sub-customer** (named after the job, nested under the client
  Customer via `ParentRef`). It is **not** a new chart-of-accounts account. [S91 — the mechanism
  this spec deferred to 7G is now RESOLVED: sub-customer; the QBO "Projects" feature is
  explicitly not used (`7G-spec.md` §7G.2 #2, §7G.6 — its `IsProject` flag is read-only on
  create). The decision fixed here — tag income to a job-named QB entity — is unchanged.]

---

## §3 — Over / under payment

- **Underpayment** → the invoice **stays open / partial.**
- **Overpayment** → the surplus becomes a **credit on the client's account.** The credit is applied
  **only when the user chooses** — never auto-applied. (Manual application mechanics mirror §2
  manual entry.)

---

## §4 — Retainage release

- Fires on **job completion + client sign-off.** (The trigger is the _client's_ sign-off, not an
  app Owner/Admin action — those are different actors.)
  **[S92 RESOLVED — this line is correct; acceptance §9 #6's "owner sign-off" was the drafting
  error and is fixed. Rationale: the client holds the retainage, so only the client can accept
  the work that triggers release; Owner/Admin retain their gate one step later — the
  auto-generated release invoice still waits on Owner/Admin approval before sending.]**
- **Optional lien-release gate:** collecting the released money may require the contractor to send
  an **outbound lien release** to the client first. This requirement is **toggleable off** by the
  contractor. The toggle is a **global company setting**, and each company **uploads the lien-release
  format it uses.** The lien-release **document lifecycle is owned by 7F** — waiver text is counsel-
  routed and not authored here; 7E only names the gate and honors the toggle. Format handling and
  document mechanics are addressed at **7F** spec time.
- Once the gate (if enabled) is satisfied, release **auto-generates an invoice** for the held
  amount, held for **app Owner/Admin approval before sending.**
- Applies to retainage the **client holds** from the company (the outbound / contractor→client
  direction). The parallel case — retainage the **company holds from subcontractors** (inbound) —
  releases around the **same milestone (job completion), not the same trigger** [S92]: the 7C
  side is **Owner-initiated at sub completion** and does not wait on the client's sign-off of
  the whole job. No client gate is added to 7C; nothing about the shipped 7C flow changes. It
  is a **7C/AP** concern (named, not built here).

---

## §5 — Refunds

- A refund can happen **at any time.**
- **Owner/Admin only**; an **Admin-initiated refund needs Owner approval.**
- A refund is recorded as a **credit memo** (satisfies the income-ties-to-invoice discipline —
  money out is tied to a credit memo, not left standing alone).
- Deposit refunds (job does not proceed) run through this path; the deposit's refundable status is
  set in 7D §3.

---

## §6 — AR aging & reminders

- AR aging is tracked per client (**30 / 60 / 90**).
- **Auto-reminders** are configurable in **company settings**, per client, with **user-set timing
  and wording** — the same pattern as estimate reminders.
- When a reminder fires, Owner/Admin are notified (event named in §7; delivery is the notification
  system's job).

---

## §7 — Named notification events (delivery deferred)

7E **emits** these; the **notification system** (separate cross-cutting build, §A.2) delivers them.

- Payment received — flags **partial** or **over**
- Payment applied
- Credit created (from overpayment)
- Refund issued
- AR reminder sent
- Retainage release invoice pending approval

Recipients: Owner/Admin (per event). Channel/wording/on-off: owned by the notification system.

---

## §8 — Roles & approval

- **Record a payment:** PM, Owner, Admin. A **PM-recorded payment needs Owner/Admin approval.**
- **Issue a refund:** Owner/Admin only; **Admin needs Owner approval.**
- Owner/Admin are notified when money is collected.

---

## §9 — Acceptance criteria (workflow — PROVEN)

1. An electronic payment via the pay link processes through QuickBooks and accepts partial payment.
2. A manual check/cash payment can be split across multiple invoices; one invoice can take multiple
   payments over time.
3. A PM-recorded payment cannot post until Owner/Admin approve.
4. Underpayment leaves the invoice open/partial; overpayment creates a client credit that applies
   only on user action.
5. Every invoice — paid electronically or not — pushes to QB and is tagged to a job-named Project.
6. Retainage release fires on completion + **client** sign-off, generates a release invoice, and
   holds for Owner/Admin approval before sending.
   **[S92 — "owner sign-off" was a drafting error, corrected; §4 is the governing line and
   carries the rationale.]**
7. A refund is Owner/Admin-only (Admin needs Owner approval) and records as a credit memo.
8. AR aging tracks 30/60/90; per-client reminders send on user-set timing/wording and notify
   Owner/Admin.
9. No payment exists that is not applied to an invoice (or recorded as a credit memo for money out).

---

## §A — Architecture amendments this spec records (READ)

> Recorded here so they are not silent surprises at build. Not re-litigated — flagged for CC and for
> a future edit to `module7-architecture.md`.

**A.1 — 7G is a HARD UPSTREAM dependency of 7E, not just a downstream export.** The architecture
dependency map (§7.3) draws 7G last, as the export everything feeds. That is **wrong for the payment
path**: payments in 7E process _through_ QuickBooks (confirmed decision, not a hedge), so 7E cannot
fully function until 7G exists.
Consequence: the **non-QB parts of 7E can be built now** (manual records, aging, credit/refund
bookkeeping, reminders, retainage-release invoice generation); the **electronic-payment-processing
half is a stub until 7G is designed.** Amend §7.3 to show 7G feeding the 7E payment path.

**A.2 — Notifications are a separate cross-cutting system.** They touch multiple modules and have
never been designed. 7E only **names** its events (§7). The engine that delivers them (in-app vs.
email, per-event on/off, recipients, wording) is its own build, not part of 7E.

---

## §S — Schema layer — TODO for Claude Code (BLOCKS "complete")

Not build-ready until CC reads these live and fills table names, columns, FKs, RLS, triggers,
service files, and routes. Do **not** assert from context — read.

1. **7D invoice tables** — the payment record links to invoices; needs their shape and status model.
2. **QuickBooks connector (7G)** — [S91] spec now EXISTS (`7G-spec.md`); the mechanism is
   resolved (sub-customer, §7G.2 #2). The electronic-payment path and the every-invoice push
   still depend on the 7G **build** — the electronic half stays a stub until then. **This is
   the gating dependency.**
3. **Module 5 project / budget / `contract_value` tables** — deposit crediting, retainage held
   balance, and where applied payments post into project finances.
4. **Company settings** — AR reminder configuration (per-client timing + wording).
5. **Client / contact model** (Modules 1/2) — where the account credit balance and aging attach.
6. **Notification event surface** — once the notification system is designed, wire §7 events to it.

---

## §O — Open / external (not interview-closable, not CC-closable)

- **Pre-Module 9 external-surface gate** governs the client-facing pay surface (where the client
  actually pays). The pay-_link_ concept is fixed; the surface follows the gate.
- **Notification system** (§A.2) must be designed before §7 events can actually deliver.
- **[S92] Retainage-release trigger actor RESOLVED — the _client's_ sign-off.** §4 was
  correct; acceptance §9 #6's "owner sign-off" was a drafting error, now fixed. Rationale
  recorded at §4.
