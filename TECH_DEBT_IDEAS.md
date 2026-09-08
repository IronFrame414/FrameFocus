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

### Reclassified from OPEN [S105b — item T, RULED Josh]

Moved here verbatim (by ordinal) from `TECH_DEBT.md`: a deferred DECISION, not
deferred work.

- **#2-estred — Customized proposal templates (saved, user-named format presets).** Seen on a
  reference screenshot Josh supplied; **not in the handoff, no design.** ⚠️ **Deferral is not
  rejection** — it is blocked on one unanswered question that makes it large: **what does a template
  capture?** Format alone is trivial (the eight-format value already covers it); a template carrying
  standard **terms, cover letter and printed sections** is a real feature that needs its own
  interview, not a line in the estimates spec. The reference screenshot's own wording was **rejected**
  by Josh, and its **"Internal (Detailed)"** and **"Field Sheet"** entries are **out of scope** — they
  are not client proposal formats. [Josh, S103, §4]

- **#1-regbacklog — custom composable roles (register A14).** Josh raised **per-person** visibility;
  **ruled toward custom ROLES instead.** Every gate keys on `get_my_role()`; RLS cannot restrict
  columns, so a per-person permission on a *field* multiplies side tables rather than replacing
  them; and testing loses its fixed set — the S121 audit caught a crew member reading 13 change
  orders precisely because "crew" is a knowable state. ⚠️ **The underlying need is real:** a
  bookkeeper who needs invoices but not the schedule fits none of the five roles.

> ⚠️ **RECLASSIFIED OUT OF DEBT → register §D (A15) [S179].** Owed work, not debt — it needs schema,
> but the shape is understood. Tracked on the register.

- **#1-s175 — `softDeleteEstimate()` HAS NO STATUS GUARD: A SENT ESTIMATE REACHES THE TRASH WITH NO
  REASON RECORDED.** Raised S175 (2026-08-25), found while building void-and-reissue.
  **Live today.**

  Void requires a reason in every case and freezes it permanently (`#3-s174`, closed below). The
  trash bin, beside it, asks for nothing: `softDeleteEstimate()` checks the caller is Owner/Admin
  and writes `is_deleted = true` at any status. So the *documented* remedy for withdrawing a
  client-facing document keeps a permanent record, and the *undocumented* one sitting next to it on
  the same screen keeps none.

  **Deliberately NOT fixed at S175 [Josh].** Delete was ruled out of scope for that session and the
  reason is recorded rather than assumed: widening scope mid-queue is how sessions stop finishing.
  This is the filing, not a deferral by neglect.

  **Fix direction.** Not "add a reason to delete" — decide first whether a sent estimate should be
  soft-deletable at all now that void exists. The change-order answer is instructive and does not
  transfer wholesale: S168 allowed DELETE only for UNSIGNED COs, with `void` as the path for
  anything the client had seen. The estimate equivalent of "the client has seen it" is `sent`, and
  the equivalent of "signed" is `accepted`/`converted` — which `#3-s174`'s ruling already refuses to
  void, so a delete path there would be the only way to remove one. Cross-ref `#2-s174` (the freeze)
  and `#3-s174`.

- **#3-m9 — the Financial Visibility Floor gates `project_financials.contract_value` and leaves
  the SAME FIGURE readable on `client_contracts`. A CREW MEMBER reads it today.** Raised S164
  (2026-08-19), while building M9 stage 4.

  ```
  client_contracts_select_visible  SELECT
    company_id = get_my_company_id()
    AND get_my_role() <> ALL (ARRAY['subcontractor','client'])   <- everyone else is in
    AND can_view_project(project_id)
  ```

  `client_contracts.contract_value` is a real column with real values, and the policy admits
  **project_manager, foreman and crew_member** on any project they are assigned to.

  **Confirmed live, with rows.** Signed in as the seeded QA identities against rebuild-test:

  | Identity | `client_contracts.contract_value` | `project_financials.contract_value` |
  | --- | --- | --- |
  | `josh+crew@worthprop.com` | **213854.10, 12345** | `[]` |
  | `josh+qa-foreman@worthprop.com` | **12345** | `[]` |
  | `josh+pm@worthprop.com` | **7860, 12365, 213854.10, 12345** | `[]` |

  `project_financials` is correctly floored for all three — which is the point. **The floor works
  on the table `CLAUDE.md` names and does not exist on the second copy.**

  ⚠️ **`CLAUDE.md`'s enforcement table says "Contract value … DB-enforced, Owner/Admin" and cites
  `20260811000000`.** That is true of `project_financials` and false of the platform: S123 was
  burned by exactly this shape on `change_orders`, where the documented policy and the live one had
  diverged. Here the two policies never diverged — there are simply **two homes for one figure**,
  and only one of them was ever floored.

  **NOT fixed here, deliberately.** The obvious fix — floor `client_contracts` to owner/admin —
  changes who can work with a contract, and 7I's authoring flow admits a PM. It needs a ruling, not
  a policy edit, and it is not M9's: M9 only touched the CLIENT arm on this table, which is
  correctly scoped and is proved by `s164-m9-read-arms.live.ts` ARM 2.

  **The client reading it is NOT part of this finding and is correct** — it is her contract, and
  `CLAUDE.md`'s S164 ruling puts the counterparty outside the Floor. The exposure is to **staff**.

  **Belongs to the M7 pass** (Financial Visibility Floor), with 7I as the affected surface.

- **#6** Source CHECK constraint may be too restrictive (real contractors may want yard sign, trade show, Angi, HomeAdvisor, etc.)

- **#115** Expense capture model — field roles write budget-line allocations, and that is under review. DEFERRED-POST-LAUNCH (Josh, S94). S93 shipped split-at-capture (docs/specs/money-representation.md §4.4): createExpense writes the expense plus ≥1 expense_allocations rows in the same flow, Σ(allocation amounts) = expenses.amount exactly, and the expense_allocations INSERT policy was deliberately widened to every role that can capture an expense, field roles included. Rule A-7 (§4.5) hardens this — zero-allocation approval is illegal; approve_expense requires ≥1 allocation summing to the amount exactly. The split editor grants "New budget line" to Owner/Admin/PM only; foreman/crew pick existing lines or Miscellaneous. Josh's position (S94): field staff should not be allocating to budget lines at all — they will not know what is budgeted against what. Field capture should be total, job, location, photo, and similar observable facts; allocation is an office function performed by Owner/Admin at approval. This is a reversal of the capture model, not a toggle: under A-7 an unallocated expense cannot be approved, so removing field allocation requires either relaxing A-7 back toward 7A Option B (zero-allocation legal at capture, allocation at approval) or introducing a capture-time placeholder allocation — both of which move budget numbers and touch the same approval machinery #113(c) stage 4 sits on. Cross-ref the S94 §7.2 decision (sub stages must always target a real budget line — same principle applied to sub schedules) and #113(c) stage 4. Not patched — Josh will evaluate post-launch with real staff usage, then interview before any change. Raised Session 94.

- **#30** Mobile app is a placeholder. Phase 2 work. — **SUPERSEDED IN DIRECTION [S97, 2026-08-03].**
  Josh ruled the mobile experience is a **PWA — the existing Next.js web app installed to the home
  screen — NOT React Native** (reasons: no app store at this time; and iOS requires a home-screen
  install for Web Push regardless, so the PWA is also the precondition for notifications on iPhone).
  `apps/mobile/` is therefore **PARKED, not deleted** — see `apps/mobile/README.md`, which records
  what deletion would involve (workspace glob, the devcontainer's port 8081, four remaining Expo
  references in CLAUDE.md, the "web + mobile" wording on `packages/shared`). **Deletion is Josh's
  call.** This item stays OPEN until he makes it; it is no longer "Phase 2 work" on the RN app,
  because there is no RN app to build. Ruling recorded in CLAUDE.md → Technology Stack.

- **#60** AI photo auto-tagging add-on pricing structure undecided. Placeholder boolean `companies.ai_tagging_enabled` exists (default false). Needs Stripe product/price wiring + per-image quota or MB limit before paid launch. Decide pricing model (flat monthly / per-image / per-MB), then build billing path. Real cost data from Session 31: ~$0.00382 per call (GPT-4o). Anchor pricing against this.

- **#123** `ai-tagging.ts:105` still names FrameFocus in the GPT-4o system prompt (_"You are a construction-photo tagger for FrameFocus, a contractor management platform"_) — the last product-name string left in `apps/web` outside test assertions, the `live-session.ts` test password, and `.claude/` path rules. **DEFERRED pending an eval, not an oversight.** It is prompt text, so editing it changes the token sequence the model conditions on, and GPT-4o is non-deterministic even at low temperature — which is precisely why the AI tests assert structure rather than content (CLAUDE.md → Testing AI features). No test in the repo can confirm the change is behaviorally neutral. Risk is low: the semantic work is done by "a contractor management platform" plus the grouped allowed-tag list, and output is clamped by the validate-against-allowed-set rule. The benefit is also nil — no user ever sees the string. Close it by changing the literal to `${brand.name}` and re-tagging ~20 photos with known-good expected tags, comparing before and after. Observed Session 99.
