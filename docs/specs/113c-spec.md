# 113c-spec.md — Award-as-Commitment (Subcontractor Bid → Sub-Contract)

**Status:** SPEC — locked interview decisions (Session 94) on an approved
input→store→output trace. **Not built.**
**Design authority:** `module7-architecture.md` §7.9 (7C), `docs/specs/7C-spec.md`
(sub-contracts, payment schedules, approval gate), `docs/specs/money-representation.md`
§4.5 (origin predicate + recompute), `TECH_DEBT.md` **#113**, **#105**, **#113(b)**.
**Verification:** every claim below was read against the live repo this session
(Session 94) via the synced `main` (tip `46bb643`). `file:line` cited where confirmed;
`[BUILD-VERIFY]` where the exact DDL / line must be confirmed by CC at build against
live schema, **not** from this doc.
**Protocol:** written on branch `feature/113c-award-commitment-spec`, uncommitted.
**No SQL run. Zero migrations authored here — this spec is design only.** Josh commits
path-scoped; CC executes in staged builds with click-test stops (§10). **No change to
the origin predicate** (`payables-shared.ts`) or the budget recomputes — see §9.

---

## 0. The rule (locked, S94)

Awarding a subcontractor bid **is a commitment.** A won bid carries forward from the
estimate to become a **real 7C sub-contract** on the project, and its money reaches the
budget line as **committed**, not only as budgeted cost. The seven locked decisions:

1. A won bid becomes a **real `subcontractor_contract`** (not just a committed budget
   number). It **materializes at conversion** — no budget exists before then.
2. It lands as a **draft**, contributing **$0 committed** until confirmed.
3. **Confirm = set the payment schedule + approve the stage rows.** Approval is what
   makes committed count (reuses shipped 7C machinery). This holds on **both** paths.
4. A **per-draft "needs formal contract" toggle** decides whether a sub-facing signed
   agreement is required.
   - **Off:** on approval, committed is **firm** immediately.
   - **On:** on approval, committed counts but renders **italic + "wait on contract
     signature"** ("not locked in"). The sub's signature flips italic → firm.
5. **Italic = not locked in.** While a formal-contract sub is unsigned (and has no
   payments), the user can **change** it (amount / schedule / terms). Signing locks it;
   later changes go through the normal amend/void path.
6. `budgeted_amount` stays the **plan** (from the estimate baseline); `committed_amount`
   reflects the **sub-contract**. They sit side by side on the merged Budget & Cost
   screen; a renegotiation before confirm shows as variance.
7. **7F grows** to own the sub-contract **agreement** (template + sub-facing
   e-signature) alongside lien waivers — **gated** behind the Pre-Module 9
   external-surface gate, and **not** on 7D's critical path.

---

## 1. Verified ground truth

- **Committed is derived from APPROVED expense rows, not from a sub-contract's
  existence.** `recompute_budget_item_committed`
  (`20260730010000_money_representation.sql`) sums `expense_allocations.amount` JOINed to
  `expenses` WHERE `status='approved'` AND commitment-origin (sub_contract_id / PO /
  is_retainage / state='committed' / has-payments). **A draft sub-contract with no
  payment schedule has no expense rows → $0 committed.** No predicate change is needed;
  the pending→approved gate is the "confirm."
- **`setup_payment_schedule(p_sub_contract_id, p_stages[{label,amount,budget_item_id?}],
p_retainage_shape?, p_retainage_percent?)`** inserts one `state='committed'`,
  `status='pending'` expense row per stage (sub_contract_id set), and — when a stage
  carries `budget_item_id` — an `expense_allocations` row tying it to that budget line.
  One schedule per contract; errors if a non-retainage stage row already exists; errors
  if the contract is `void`. `[BUILD-VERIFY exact signature/line]`
- **`approve_expense(p_expense_id, p_allocations)`** (Owner/Admin) flips
  `pending → approved`, requiring ≥1 allocation summing to the expense amount exactly
  (A-7). Approval is what makes the row count toward committed.
- **`subcontractor_contracts`** (`20260704211000:438-457` `[BUILD-VERIFY exact
columns]`) already carries `project_id`, `member_id → company_members(id)`,
  `contract_value`, `status`, `scope_of_work`, `executed_date`, `notes`,
  `signed_doc_file_id`, `retainage_shape`, `retainage_percent`. Code status enum
  (`contracts.ts`): **`draft | sent | signed | void`.**
- **`estimate_sub_bids`** columns (`estimate-items-client.ts`): `estimate_id`,
  `line_item_id`, `subcontractor_id → subcontractors`, `bid_amount`,
  `bid_document_file_id → files`, `notes`, `received_at`, `is_winner`, `is_deleted`.
- **`set_winning_bid(p_line_item_id, p_sub_bid_id)`** clears any prior winner, marks the
  new one (`is_winner`, one-winner-per-line partial unique index), and upserts the line's
  single **subcontractor `estimate_line_row`**. **As amended 2026-07-31 (S95, Josh's
  ruling — reverses the S93 TECH_DEBT #113 NON-ISSUE and this bullet's original "amount
  = bid_amount; totals reflow"):** awarding must NOT overwrite an estimator-entered
  cost — **fill-only-when-empty** (migration `20260731040000`): a sub row with a
  non-zero `amount` gets `subcontractor_id` ONLY (no cost change, no reflow); an empty
  (0/NULL) `amount` is seeded from the bid; a missing sub row is still CREATED with
  `amount = bid_amount` — the row must exist, stage 4 ties the contract to the budget
  line via `source_line_row_id`.
- **Conversion budget baseline** (`convert_estimate_to_project`, now in
  `20260730010000`) inserts one `project_budget_items` row per `estimate_line_rows`; the
  winning subcontractor row becomes a `row_type='subcontractor'` budget line with
  `budgeted_amount =` the sub row's `amount` and `source_line_row_id =` that sub row.
  **This is the budget line the new sub-contract ties to.** (As amended 2026-07-31:
  with fill-only-when-empty, that amount is the ESTIMATOR'S cost when one was entered —
  the bid reaches the project as the draft contract's `contract_value` (§3), and
  bid-vs-plan surfaces as budgeted-vs-committed variance, §0.6.)
- **#105 (identity):** there is **no FK** between `subcontractors` and `company_members`
  — `subcontractors_create_member` copies `company_name → display_name` only; today's
  resolution is a fragile **name-match** (`payables-client.ts`). Adopted here as stage 1
  (§2.1).

---

## 2. Schema changes (design; migrations authored at build)

### 2.1 #105 fix (a) — `subcontractors.member_id` FK _(adopted; stage 1)_

Add a real FK so award-time resolution is reliable, not name-matched.

```
ALTER TABLE public.subcontractors
  ADD COLUMN member_id uuid REFERENCES public.company_members(id);
```

- **Backfill (one-time):** resolve each existing `subcontractors` row to its
  `company_members` row by the existing name-match. **Exactly-one hit → set `member_id`.
  Zero or 2+ hits → leave NULL and emit a build-log line** (never guess). `[BUILD-VERIFY
the backfill covers every sub exactly once; report unresolved]`
- After this, `subcontractors_create_member` should also **set `member_id`** on new subs
  going forward `[BUILD-VERIFY the trigger and extend it]`.
- **Out of scope:** #105 (b) (platform-wide unique-name enforcement) — keep as a
  separate soft warning at entry per the TECH_DEBT recommendation. Not built here.

### 2.2 `subcontractor_contracts.requires_formal_contract` boolean (the toggle)

```
ALTER TABLE public.subcontractor_contracts
  ADD COLUMN requires_formal_contract boolean NOT NULL DEFAULT false;
```

Drives §5's italic rule and gates the (later, 7F) send-for-signature flow. The
signature itself is represented by the existing `status='signed'` + `signed_doc_file_id`

- `executed_date` columns — no new signature schema in this spec.

**No other schema changes.** Everything else reuses shipped columns.

---

## 3. Conversion — create draft sub-contracts from winning bids

Amend `convert_estimate_to_project` (currently in `20260730010000`) so that, **after the
budget baseline INSERT (step 5)**, for each estimate line with a winning bid
(`estimate_sub_bids.is_winner = true`, not deleted):

1. **Resolve identity** via `subcontractors.member_id` (§2.1). If NULL/unresolved →
   **the conversion is blocked with a "complete the sub profile" prompt** naming the
   sub (E11). `[BUILD-VERIFY where the prompt surfaces — pre-conversion UI check vs.
RPC error the UI catches]`
2. **INSERT `subcontractor_contracts`:** `project_id` = new project; `member_id` =
   resolved member; `contract_value` = the winning `bid_amount`; `status='draft'`;
   `requires_formal_contract=false`; `scope_of_work` = the winning line's name/description
   `[BUILD-VERIFY source]`; **`signed_doc_file_id` = the winning bid's
   `bid_document_file_id`** (carries the bid PDF forward — resolves #113(b) at the
   contract end).
3. **Record the budget-line tie** for later schedule allocation: the budget line whose
   `source_line_row_id` = the winning line's subcontractor row (§1). Whether this is
   stored on the contract or re-derived at confirm is a `[BUILD-VERIFY]` — no new column
   if it can be re-derived from `source_line_row_id`.

**No committed dollars are written at conversion** — the draft has no schedule, so
$0 committed (§1). `budgeted_amount` is unchanged. A partial conversion must never leave
a half-built project (existing atomic-RPC posture).

---

## 4. Confirm flow (reuses shipped 7C)

The **Review** action on a draft sub-contract opens a popup with the contract details and
an editable payment-schedule editor (stage label + amount rows; retainage shape/percent;
terms). Retainage %, schedule, and terms are **blank at creation, filled here** (D7).

**Confirm =** `setup_payment_schedule` (passing each stage's `budget_item_id`, defaulting
to the §3 budget-line tie) **then** approve the resulting pending stage rows
(`approve_expense`, one per stage, each allocated to its line). On approval,
`committed_amount` on the line populates via the existing recompute. This is the shipped
7C schedule-setup + review-queue path — #113(c) **wires the draft into it**, it does not
reinvent it.

- **Post-setup batch-approve** (7C Q13 / context93 §7.2) is the approval mechanism;
  its untargeted-stage default is decided separately in §7.2 of context93.
- **Roles:** setup — Owner/Admin/PM (pending); approve — **Owner/Admin only** (existing
  7C floor). PM can prepare a draft's schedule but cannot confirm it to committed.

---

## 5. Commit / display / editable-while-unsigned

- **`committed_amount` counts on approval on both paths** (no state dependency beyond
  `status='approved'`). Identical mechanism regardless of the toggle.
- **Italic rule (display only):** on the merged Budget & Cost screen, a line's committed
  contribution renders **italic + "wait on contract signature"** hover **iff** its
  sub-contract has `requires_formal_contract = true` **AND** `status <> 'signed'`.
  Signing (`status='signed'`) removes the italic. **No money-model change** — this reads
  the contract's columns, not the expense predicate. `[BUILD-VERIFY the merged screen can
join committed contributions back to their sub-contract for this flag]`
- **Editable-while-unsigned (revise path):** while a sub-contract is
  `requires_formal_contract = true` AND `status <> 'signed'` AND **no `expense_payments`
  exist against its rows**, the user may revise amount / schedule / terms. Mechanism
  (new, constrained), given the shipped "one schedule per contract" + approved-row
  immutability: a `revise_sub_contract_schedule` RPC that **soft-deletes the existing
  stage rows** (and their allocations) and re-runs `setup_payment_schedule` in one
  transaction, gated to the above conditions. `[BUILD-VERIFY against the column-scope
immutability trigger + the one-schedule guard]` Once signed, the revise path is closed;
  corrections go through the normal 7C void → re-enter.
- **Renegotiate-before-confirm:** committed reflects the confirmed number; budgeted stays
  the plan (variance shown).
- **Decline/delete a draft** (self-perform / re-bid): allowed; budget doesn't change
  (D9). `[BUILD-VERIFY the void vs. soft-delete posture for a never-confirmed draft]`

---

## 6. Estimate-side award record (#113a) + bid attachment (#113b)

- **#113(a) display:** on the estimate's Bidding tab, surface a durable **award summary**
  per line once a winner is picked — "**{sub} won — {$bid_amount}**" — visible during
  bid review, before any conversion. Read-only; sources from `estimate_sub_bids.is_winner`
  - the line's subcontractor row. An estimate that never converts needs no further record.
- **#113(b) attach at entry:** wire `bid_document_file_id` in the add-bid form (today it
  never sends it) and activate `updateEstimateSubBid` (today dead code,
  `estimate-items-client.ts`) so a bid PDF attaches at entry and can be replaced. This is
  what §3 step 2 then carries onto the draft contract. `[BUILD-VERIFY the 4L attachments
UI path this was deferred to]`

---

## 7. 7F scope growth (gated — NOT this build)

Record in `module7-architecture.md` §7.2 (7F row) that **7F owns the sub-contract
agreement** — a company-level reusable template via the §7F.3 box-map builder, filled per
sub, sent to the sub for **e-signature**. The sub-facing signature is an external surface
→ **Pre-Module 9 external-surface gate** (email + magic-link vs. hosted portal, §7F.8).
The §7F.3 document machinery is already "direction-agnostic and reused as-is"; only the
sub-contract template, external delivery, and the signature→`status='signed'` linkage are
new. **This is later, gated work — the §5 italic never waits on it; 7D stays unblocked.**

---

## 8. Roles / RLS

Inherit the 7C floor: Owner/Admin — everything; **Owner/Admin approve** (commit);
Owner/Admin/PM set up schedules (pending) and prepare drafts; PM cannot confirm/commit.
Conversion is Owner/PM-gated (existing). **The revise RPC (§5) is OWNER/ADMIN ONLY —
as amended 2026-07-31 (S95, Josh's ruling; replaces this section's original
"Owner/Admin/PM while unsigned, mirroring schedule setup", whose `[BUILD-VERIFY]` tag
this resolves).** Rationale: revising tears down APPROVED commitments and re-opens
them for approval — approve-level authority PM explicitly lacks (this section's own
"PM cannot confirm/commit"); and granting PM would force SECURITY DEFINER, since the
`expenses_update_authorized` policy lets PM update only own PENDING rows — breaking
the INVOKER/RLS posture the codebase mandates. Built so in migration
`20260731050000_113c_stage5_revise_schedule.sql`. `[BUILD-VERIFY resolved: the revise
RPC follows SECURITY INVOKER + the existing column-scope/RLS gates, per the 7C
precedent]`

---

## 9. Explicitly NOT touched

- The **origin predicate** (`payables-shared.ts` `isPayableRow` / `PAYABLE_OR_FILTER`)
  and its SQL mirror in the recomputes — unchanged. My S94 trace initially flagged a
  state-aware predicate change; that was **wrong** and is retracted.
- `record_expense_payment` and the settlement flip — untouched.
- The recompute functions' logic — unchanged (a draft simply has no rows to count).

---

## 10. Staged build sequence (click-test stop after each)

1. **#105 (a) FK + backfill** (§2.1). _Test:_ existing subs resolve; unresolved dups
   logged, none silently guessed.
2. **Conversion arm** (§3) + `requires_formal_contract` column (§2.2). _Test:_ convert an
   estimate with a winning bid → a **draft** contract appears, **$0 committed**,
   `budgeted_amount` unchanged; a bid with an unresolved sub blocks with the profile prompt.
3. **Estimate award summary (#113a) + bid attach (#113b)** (§6). _Test:_ award line shows
   on the estimate; a bid PDF attaches at entry and rides to the draft contract.
4. **Confirm flow** (§4) — Review popup → schedule → approve. _Test:_ confirm a
   no-contract draft → committed **firm**; toggle needs-contract → committed **italic +
   hover**.
5. **Editable-while-unsigned revise** (§5). _Test:_ revise an unsigned italic contract's
   amount/schedule; confirm the path closes once `status='signed'` and once a payment exists.
6. **(GATED, later — not this build)** 7F sub-contract template + sub-facing e-signature
   (§7).

Stages 1–5 are #113(c) proper and unblock 7D. Stage 6 is deferred behind the Pre-M9 gate.

---

## 11. Dependencies & open [BUILD-VERIFY] items

- **Prereq:** #105 (a) is stage 1 (§2.1). Its backfill quality gates §3 resolution.
- `subcontractor_contracts` exact DDL (§1), `setup_payment_schedule` signature (§1),
  `subcontractors_create_member` trigger body (§2.1), the merged-screen committed→contract
  join (§5), the profile-completion prompt surface (§3), scope_of_work source (§3), the
  4L attachments path (§6), the revise RPC vs. immutability trigger (§5) — all
  `[BUILD-VERIFY]` at build against live schema, per protocol.
- **Interacts with context93 §7.2** (batch-approve default) — the confirm path (§4) uses
  it; resolve §7.2 before/with stage 4.

---

## 12. Byproducts resolved

- **#113(a)** — award record (estimate summary §6) + identity carried to the project via
  the sub-contract (§3) rather than lost at conversion.
- **#113(b)** — bid PDF gets a home (`signed_doc_file_id` §3; attach-at-entry §6).
- **#105 (a)** — real `subcontractors.member_id` FK (§2.1); (b) left as a separate soft
  warning, not built here.
