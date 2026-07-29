# Module 7D — Invoicing — Spec

> **Derives from** `module7-architecture.md` §7.0 (scope), §7.2 (sub-module table), §7.3
> (dependency map), §7.4 (owns-vs-inherits), §7.5 (cross-cutting), §7.10 (7D trace). When this
> spec and the architecture doc conflict, the architecture doc wins until amended. When this spec
> and shipped code conflict, **git is ground truth** — amend the spec.
>
> **Status:** WORKFLOW APPROVED + PROVEN (interview, this session). **Schema layer deliberately
> absent** — see §S. No table names, columns, or file paths are asserted as fact. CC writes the
> schema layer after reading the live upstream schemas named in §S, then this spec is complete.
>
> **Conventions:** follow `CLAUDE.md` — standard columns, per-tenant triggers, RLS naming,
> `get_my_company_id()` / `get_my_member_id()`, soft-delete/trash, server/client service split,
> `author_member_id` precedent. Deviations called out where they arise.

---

## §1 — Scope

7D owns how a job gets billed to the client: what triggers an invoice, how the amount is derived,
what the client receives, and how the invoice lands in the project. It does **not** own money
received (that is 7E) or the cost side (7C).

**The governing invariant (from interview, locked):** all income ties to an invoice. No invoice,
no tracked income — the QuickBooks discipline. Every income-bearing thing in this module, including
the deposit, is an invoice.

**v1 scope boundary (locked):** invoices stay simple. **The user triggers every invoice** — there
is no automatic draw schedule and no draw-schedule object in v1. Percentage vs. fixed against a
source (§2) is the whole billing mechanic. **Deferred post-launch:** structured draw/milestone
schedules and **AIA / G702–G703 pay applications** (named in M7 architecture scope; not built in
v1). File these to `TECH_DEBT.md` with real numbers at build time — do not invent a number here.

---

## §2 — Invoice creation

An invoice is created by one of:

- **Convert an estimate** into an invoice.
- **Convert one or more change orders** into an invoice.
- **Convert several sources at once** — an invoice may pull from the estimate and multiple COs
  together.
- **Standalone** — built directly, using the same input/detail format as an estimate/CO. A
  standalone invoice's amounts **and categories post into project finances**, because they exist
  nowhere upstream to inherit from.

**Bill method, per source:** percentage of the source, or an edited fixed amount.

**Detail format on the invoice:** mirrors the source's format (the user-chosen estimate/CO
presentation format). Standalone invoices use that same format.

---

## §3 — Deposit

- A deposit is a **fixed-amount invoice** — it obeys every invoice rule, including the income-ties-
  to-invoice invariant.
- **One mechanism (crediting = application):** the deposit is credited against the **budgeted
  amount** and applied at the **first invoice**. These are not two behaviors — they are the same
  single mechanism. If no budget is set when the deposit is taken, the deposit is the first payment
  and is credited to the budgeted amount once the budget is set; the application point is still the
  first invoice.
- **Refundable** in full or part if the project does not proceed (refund mechanics are 7E; the
  deposit's refundable status is set here).
- **No retainage** is held on a deposit invoice (see §5).

---

## §4 — Change orders & selection overages

- When a signed CO carries money, the user is **prompted per CO: bill now (its own invoice) or roll
  into the next invoice.**
- A signed **material-selection overage** (client picked over their allowance) **auto-generates an
  invoice for the difference**, and offers the same choice: **bill immediately or add to the next
  invoice.** Default surfaced to the user; user decides.

---

## §5 — Retainage (client-held)

- Retainage is a **project-level setting** established at project setup (`project overview`),
  amount varies per project.
- On an invoice it is **held back by default**, **editable per invoice**.
- **Never applied to deposit invoices or T&M invoices.**
- Retainage accrues as a held balance. **Release is a 7E concern** — it fires on job completion +
  **client** sign-off and auto-generates a release invoice (see 7E spec §4). Collecting the released
  money may require the contractor to send an **outbound lien release** to the client first; that
  requirement is **toggleable off** by the contractor, and the lien-release document lifecycle is
  owned by **7F** (see 7E §4). This same release logic also governs retainage the company holds back
  from subcontractors, which lives in **7C/AP** — named here so it is not lost, not built here.

---

## §6 — Time & Materials billing

T&M is a real Bishop workflow and is **in v1**. A T&M invoice is a fixed/edited invoice built from
a T&M change order.

- **Labor billed** at the **company-settings default labor rate**, which is a **billing basis**
  (client-facing), editable per invoice. This rate **already exists** (`companies.default_labor_rate`
  from the Module 4 work) — 7D **pulls from it**, it is not net-new. CC must read that field to
  confirm it is the billing-basis value before wiring it.
- **Materials billed** at cost + markup/margin.
- **No retainage** on T&M invoices (§5).

> **Dependency flag:** true T&M billing consumes logged hours and material costs. Those are Module 6
> sources (time entries, deliveries/POs) and are **UNVERIFIED** until read. The billing *rule* is
> fixed here; the *source read* is a §S task. **Business risk (named, not a spec error):** T&M value
> is only as good as logged-hours data. Bishop's hours tracking is poor today **because no mechanism
> exists** — Module 6 is that mechanism, so this feature's value is gated on M6 adoption.

---

## §7 — Roles & approval

- **Owner / Admin:** create and send an invoice **without approval.**
- **PM:** creates an invoice; **requires Owner/Admin approval** before it can send.

Invoice lifecycle states (names indicative; final states set at schema time): draft → pending
approval (PM path) → sent → paid. Follow `CLAUDE.md` status conventions.

---

## §8 — Delivery & landing

- **Email** with a **pay link + attached PDF**, **or** **print the PDF and skip email** — user's
  choice.
- **Either way, the invoice saves to the project.**
- Standalone invoice amounts + categories post into **project finances** (§2).

---

## §9 — Named notification events (delivery deferred)

7D **emits** these events; the **notification system** (separate cross-cutting build) delivers
them. 7D does not build delivery, wording, or channel routing.

- Invoice pending PM approval (→ Owner/Admin)
- Invoice sent (→ Owner/Admin)
- (Payment-received events belong to 7E)

---

## §10 — Acceptance criteria (workflow — PROVEN)

1. An estimate can be converted to an invoice by percentage **and** by edited fixed amount.
2. A single invoice can pull from the estimate **and** ≥2 COs at once.
3. A standalone invoice built in estimate/CO format posts its amounts **and categories** into
   project finances.
4. A deposit invoice is a fixed-amount invoice; it credits to budget (or is credited once a budget
   is set) and can be refunded in full or part.
5. Retainage defaults from the project setting, is editable per invoice, and is **never** applied to
   a deposit or T&M invoice.
6. A signed CO prompts bill-now vs. next-invoice.
7. A material-selection overage auto-generates a difference invoice and prompts bill-now vs.
   next-invoice.
8. A T&M invoice bills labor at the company-settings rate (editable per invoice) and materials at
   cost + markup/margin, with no retainage.
9. Owner/Admin send without approval; a PM-created invoice cannot send until Owner/Admin approve.
10. An invoice can be delivered by email (pay link + PDF) or printed (skip email); both save it to
    the project.
11. No income exists in the system that is not tied to an invoice.

---

## §S — Schema layer — TODO for Claude Code (BLOCKS "complete")

This spec is **not** build-ready until CC reads the following live schemas and fills in table
names, columns, FKs, RLS, triggers, service files, and route paths. Do **not** assert any of these
from context — read them. (Reason: M6 specs needed six amendments and four reversals when specs ran
ahead of schema.)

CC must read and reconcile:

1. **Signed-artifact / change-order tables** — 7D converts signed COs into invoices; needs the CO
   record shape and its money delta. *([S91] Merged and live: `change_orders` — migration
   `20260704215000`, status `draft|sent|signed|voided`, `net_delta` — plus the signed-artifact
   columns (`20260710120000`); 7B reads them via `contract-value.ts`. The old "unmerged branch"
   caveat is dead.)*
2. **Estimate line model** (Module 4) — invoice detail format mirrors the source; standalone uses
   the same format.
3. **Module 5 project / budget / `contract_value` tables** — deposit-to-budget crediting,
   standalone-amount posting into project finances, and the project-level retainage setting all
   live against these.
4. **Company settings** — confirm `companies.default_labor_rate` is the **billing-basis** value 7D
   pulls for T&M labor (§6), plus any invoice-format defaults.
5. **Project finances model** — where standalone invoice amounts + categories post.
6. **File storage (Module 3)** — where the invoice PDF is stored (inherited pattern).

**Also confirm before building:** the material-selection-overage source (§4) — a selection *is* a
change order (same class per architecture §7.4); verify that class exists and read its shape.

---

## §O — Open / external (not interview-closable, not CC-closable)

- **Pre-Module 9 external-surface gate** governs any client-facing surface, including the pay link
  and the client-facing invoice page. The gate (hosted portal vs. email + magic-link) is an unmade
  product decision. The invoice-*record* and email/PDF path can be built now; the client-facing
  *surface* follows the gate.