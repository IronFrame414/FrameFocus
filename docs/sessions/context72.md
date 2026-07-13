# Session 72 — Context & Handoff

> **Filename is a guess.** I could not see `docs/sessions/` this session. Session 70 closed and
> Session 71 (Module 6) is in progress on a parallel thread. Verify the next number in
> `docs/sessions/` and rename before committing. Numbering has drifted off-by-one before.
>
> **This is a session record, not STATE.md.** Reconcile against STATE.md and git next session —
> **git wins on any conflict.** No git state was verified this session (see §Git).
>
> **Session type:** Module 7 (Job Finances) **spec-writing** — 7D + 7E. Interview-first. Docs/specs
> only. **No build, no migration, no schema, no repo access from this chat.**

---

## 1. THE ONE THING THAT MATTERS MOST

**Two spec files were produced and are NOT yet in the repo — Josh inputs them manually.**

- `7D-spec.md` (Invoicing) and `7E-spec.md` (Payments & AR).
- Both are **workflow-complete and marked PROVEN** (Josh's explicit call — no worked-number example
  needed). The **schema layer is deliberately absent** in each, captured as a `§S — TODO for Claude
Code` block. This is intentional, per the architecture doc's method: specs do not assert tables,
  columns, or file paths until CC reads the live upstream schemas. (Reason on record: M6 specs
  needed six amendments + four reversals when specs ran ahead of schema.)
- **Land both at `docs/specs/`** alongside `5F/5G/5I-spec.md`. Commit path-scoped. CC never commits.

---

## 2. WHAT THIS SESSION PRODUCED

Interviewed 7D and 7E (the two workflow-heavy sub-modules the architecture doc left as TODO —
§7.10/§7.11). Each ran interview → mirror → approve → file. Both approved and marked proven.

Confirmed with Josh that the other four M7 sub-modules do **not** need interviews (his read was
correct): **7B** (a rule), **7G** (an integration), **7H** (a report) are CC-buildable from the
architecture once schemas are readable. **7F** (lien releases) is _not_ interview-blocked but _is_
externally blocked — waiver text is counsel-routed, notarization needs a vendor, and it waits on
the Pre-Module 9 external-surface gate.

Architecture read from the synced project copy (not live git); **Josh confirmed the copy is
accurate.**

---

## 3. DECISIONS LOCKED THIS SESSION (do not re-litigate — they are in the spec files)

**7D — Invoicing:**

- Invoice created from an estimate, one/more COs, several sources at once, or standalone (standalone
  uses estimate/CO format and posts amounts **and categories** into project finances).
- Bill method per source: percentage or edited fixed amount.
- **Governing invariant:** all income ties to an invoice (QuickBooks discipline).
- **v1 stays simple:** the **user triggers every invoice** — no automatic draw schedule, no
  draw-schedule object. **AIA / G702–G703 pay applications deferred post-launch** (TECH_DEBT at
  build; no number invented here).
- Deposit = fixed-amount invoice. **One mechanism:** credited against the budgeted amount = applied
  at the **first invoice**. Refundable full/part if job dies.
- Retainage: **project-level setting**, default applied, editable per invoice; **never on deposit or
  T&M invoices.**
- **T&M is in v1.** Labor bills at `companies.default_labor_rate` (a **billing basis**, editable per
  invoice — **already exists**, not net-new; CC confirms the field). Materials = cost + markup/margin.
- Signed CO money and material-selection overages each prompt **bill-now vs. next invoice**; an
  overage **auto-generates a difference invoice**.
- Roles: Owner/Admin create+send with **no** approval; PM creates, **needs Owner/Admin approval**.
- Delivery: email (pay link + PDF) **or** print PDF and skip email; **either way saves to project**.

**7E — Payments & AR:**

- Electronic payment **processes through QuickBooks** (confirmed decision). Partial accepted.
- **Every invoice pushes to QB**; QB tags each to a **Project named after the job** (decided; the QB
  Project-vs-sub-customer-vs-Class mechanism is a 7G verify-item, **not** a new account).
- Manual (check/cash): split one payment across invoices; one invoice takes multiple payments. PM
  entry needs Owner/Admin approval.
- Over = **credit on account**, applied **only when the user chooses** (never auto). Under = invoice
  **stays open/partial**.
- Refund = **credit memo**; any time; **Owner/Admin only, Admin needs Owner approval**.
- AR aging 30/60/90; per-client **auto-reminders** with user-set timing + wording (like estimate
  reminders).
- **Retainage release:** fires on **completion + CLIENT sign-off** → auto-generates a release
  invoice held for **app Owner/Admin approval before send**. **Optional outbound lien-release gate:**
  contractor may be required to send a lien release to collect; **toggle is a global company
  setting**, each company **uploads its own lien-release format**, requirement is removable. Document
  lifecycle/format = **7F**.
- Deposit applies to the first invoice.

---

## 4. ARCHITECTURE AMENDMENTS RECORDED (in 7E §A — read before building)

1. **7G is a HARD UPSTREAM dependency of 7E, not just a downstream export.** The dependency map
   (§7.3) draws 7G last; that is wrong for the payment path — payments process _through_ QB.
   Consequence: the **non-QB parts of 7E build now** (manual records, aging, credit/refund
   bookkeeping, reminders, retainage-release invoice generation); the **electronic-payment half is a
   stub until 7G exists.** Amend §7.3.
2. **Notifications are a separate cross-cutting system.** Never designed, touch many modules,
   **mandatory for v1** per Josh. 7D/7E only **name** their events; the delivery engine (in-app vs.
   email, per-event on/off, recipients, wording) is its own build.

---

## 5. STILL OWED / OPEN

- **Notification system** — undesigned, cross-cutting, v1-mandatory. Needs its own design pass.
- **Pre-Module 9 external-surface gate** — governs the client-facing pay surface (where the client
  actually pays). Pay-_link_ concept is fixed; the surface follows the gate.
- **7F ownership** — lien-release document text (counsel-routed), format handling, notarization
  vendor. Addressed at 7F spec time.
- **TECH_DEBT filings** (read live `TECH_DEBT.md` first — do not invent numbers): deferred
  draw/milestone + AIA billing (7D), and any prior M7 items from context68 not yet filed.

---

## 6. HOW TO START THE NEXT SESSION

1. **Verify git — git is ground truth.** `git status`, `git log --oneline -10`. Confirm the M7 line
   vs. the parallel M6 line; reconcile session numbering and this file's name against
   `docs/sessions/`.
2. **Confirm 7D/7E specs landed** in `docs/specs/` (Josh placed them manually) and are committed.
3. **Do NOT spec 7G yet.** 7G (QuickBooks connector) is the natural next target, but it needs CC to
   read live schemas that don't exist yet — the **7D/7E invoice + payment tables** and the **QB API
   surface**. Build 7D/7E schemas first, then open 7G fresh. 7G is an integration, **not** an
   interview section.
4. Same discipline that kept this session clean: no asserting the schema layer until it can be read.

---

## §Git — state at close

**NOT VERIFIED THIS SESSION.** This was a planning/spec-writing thread with no repo access. Every
repo/branch/commit claim must be checked against `git` next session before it is trusted. Last
M7-line context on record (from memory, unverified): **context68 / Session 68 (July 10)**. Parallel
M6 work is at Session 70–71.
