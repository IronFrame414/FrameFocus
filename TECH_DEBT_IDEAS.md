# TECH_DEBT_IDEAS.md — FrameFocus — IDEAS (deferred DECISIONS)

**The register is THREE files** — a number lives in exactly one; if it is not here, check the other two:
- [`TECH_DEBT.md`](TECH_DEBT.md) — **OPEN**: owed work with a known fix.
- [`TECH_DEBT_CLOSED.md`](TECH_DEBT_CLOSED.md) — **CLOSED**: done, kept for the audit trail.
- [`TECH_DEBT_IDEAS.md`](TECH_DEBT_IDEAS.md) — **IDEAS**: deferred *decisions* (not deferred work).

> **What this file is, and the framing it supersedes.** IDEAS collects items where the *decision*
> was deferred — not the work (owed work lives in [`TECH_DEBT.md`](TECH_DEBT.md) or
> `docs/specs/outstanding-work-register.md`). S179 filed #155 and #156 as debt and called them —
> quoted, not rewritten — *"the only genuine debt [S179]"* and *"Ruled genuine debt — the only
> two"*. The three-file split [debt-split-and-ux, Josh] **supersedes that framing**: these two are
> not owed work at all, they are **deferred decisions**, which is exactly what IDEAS is for. Numbers
> and text are unchanged — only their home and label move. (The register's numbering authority is
> stated in `TECH_DEBT.md`; #156 remains the highest number allocated across all three files.)

---

### Ruled genuine debt — the only two [S179]

> **Why these two, and only these two.** `TECH_DEBT.md` is for things Josh has DECIDED to live with,
> or decisions deliberately deferred — **not a backlog.** A debt file that lists in-flight or
> schedulable work stops being a debt file. Josh ruled the split at S179: of everything that had
> accumulated under the branch-scoped provisional ids below, exactly two are genuine debt (each a
> **deferred decision**, not deferred work). Everything else — owed work with an obvious fix — moved
> to the register (`docs/specs/outstanding-work-register.md`). The reclassified provisional entries
> are superseded-in-place further down, with pointers, rather than deleted.
>
> **Numbering:** real numbers taken per the header's authority — #154 was the highest allocated and
> #155 was already earmarked "next free" when `feature/register-backlog` filed. #155 and #156 are
> the conversion of the two items that landed on `main` as `#1-regbacklog` and `#1-email`; per the
> S136 rule this is the "convert to a real number when the branch lands" step. ⚠️ Neither number is
> reused. (Provisional ids on *other* unmerged branches remain their own reconciliation at merge.)

- **#155 — CUSTOM COMPOSABLE ROLES. Ruled toward custom ROLES, not per-person grants; parked to
  evaluate later.** Josh raised **per-person** visibility — an owner ticking, per employee, which
  items they can see. Ruled **toward custom ROLES instead**, and parked. It is debt because the
  **decision is deferred**, not the work. Was `#1-regbacklog` (register A14); converted S179.

  **The reasoning, recorded so a future reader can meet it rather than re-derive it:**

  - **Every gate in the platform keys on `get_my_role()`** — the 7H.6 margin rule, S121's
    authored-by CO floor, the roster visibility floor, `budgetColumnsFor(role)`
    (`apps/web/lib/services/invoices-shared.ts`). **Per-person overrides turn each of these from a
    role lookup into a per-user, per-item lookup.**
  - ⚠️ **RLS cannot restrict columns.** So a per-person permission on a *field* **multiplies the 1:1
    side tables** (the pattern already used for `project_financials`, `project_budget_amounts`)
    **rather than replacing them** — the mechanism does not generalise to arbitrary per-person field
    grants.
  - ⚠️ **Testing loses its fixed set.** The S121 audit caught a crew member reading 13 change orders
    *with cost and markup* precisely because "crew" is a **knowable state** you can assert against.
    Arbitrary per-person grants have no equivalent — there is no fixture that says "this is what
    person X sees" to write a regression against.
  - **Support answers stop being *"that is what a foreman sees"*** and become *"check that person's
    checkboxes."*

  ⚠️ **The underlying need is real and is why this is parked, not rejected:** a **bookkeeper who
  needs invoices but not the schedule** fits none of the five roles cleanly. Custom roles serve that
  need without abandoning the role model — which per-person grants would. Evaluate when a real
  customer hits the bookkeeper case.

- **#156 — THE SAFETY-INCIDENT NOTIFICATION FANS OUT TO EVERY SUPERVISOR ABOVE THE SUBMITTER, AND
  WHO SHOULD BE TOLD HAS NOT BEEN RULED.** `app/api/safety-incidents/route.ts:141`
  (`sendIncidentNotifications`) mails one message per recipient returned by
  `computeIncidentRecipients` (`lib/services/incident-notify.ts:93`) — **every profile in
  `owner`/`admin`/`project_manager`/`foreman` ranked above the submitter** (floor: an Owner-submitter
  still notifies Admin, so nothing is silent). That is **three emails per incident in the four-person
  fixture**, and far more on a real twenty-person company — it scales with the org chart, not with the
  incident. Was `#1-email`; converted S179. **⚠️ The prompt that filed it referred to it as
  `#3-email`; the ledger id it actually carried was `#1-email` — reconciled here to #156.**

  **⚠️ RULED [Josh]: deliberately NOT fixed.** Who gets told about a jobsite injury is a **SAFETY
  decision, not an email one.** Two things this entry must carry, because both are the reason it is
  debt rather than a task:

  1. ⚠️ **The send gate now HIDES the symptom** (`email-service.ts`, `a0596db`) — once test mail is
     redirected, the volume stops reaching an inbox but the fan-out is unchanged, so the count looks
     solved while the design question is still open; in production the gate does nothing to it at all.
     This is exactly why it must not be forgotten: it was the single largest contributor to the ~430
     harness sends that damaged sender reputation (`docs/specs/email-loop-diagnosis.md`).
  2. ⚠️ **It is debt because the DECISION is deferred, not the work.** Narrowing it (direct-supervisor
     + owner, or a digest) could mean a real injury reaches fewer people — the opposite failure. **Too
     few people told is a safety problem; too many and everyone ignores them.** That judgement needs
     Josh's knowledge of how a real crew operates, and it is **wrong in a way tests cannot catch.**

---

### Branch-scoped provisional (awaiting a real number at merge — S136 rule)

- **#1-listscr — COST CODES IN THE ADD-ITEMS SHEET: REMOVED for now, pending a decision on HOW they
  should be assigned.** [Josh, S103; `fix/list-screens-and-ui`] The add-items sheet had a free-text
  "Cost code" input on manual rows and displayed each item's cost code on catalog rows and in the
  tray. **All three UI appearances were removed** (`add-items-sheet.tsx` — manual input, catalog-row
  display, tray sub-label now shows the item's row type).

  **It is a deferred DECISION, not lost work:** the underlying data flow is intact — a catalog item
  still carries its own `cost_code` onto the saved line (`:184` read, `:357` write); only the sheet's
  UI stopped showing/editing it. What is undecided is the *mechanism*: a free-text box invites typos
  and drift from the real cost-code set, and the sheet already groups by **category**, so how cost
  code relates to category (same axis? finer grain? a select from a defined list?) is the open
  question. Re-introduce with a chosen mechanism, not the free-text box. Convert to a real number when
  this branch lands.

