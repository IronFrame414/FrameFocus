# Session 93 — Money Representation Pass

> **Status:** SHIPPED. Merged to main, deployed, migration applied to BOTH
> databases, click-tested on rebuild-test.
> Most of this file is a CLAIM — verify against git before acting on it.
> The items in §2 and §6 were verified against git or the live DB at the time.
>
> **Note on where this happened:** the merge, production deploy, and
> click-test were executed from the S92 chat window by mistake. The work is
> correct and verified; only the chat it ran in was wrong. Folded in here.

---

## 1. Environment warning — READ FIRST

**The Supabase CLI link was left on PRODUCTION (`jwkcknyuyvcwcdeskrmz`) at the
end of S93.** Josh chose not to re-link. Any `npm run db:push` from this
Codespace hits production.

Before any DB work next session:

```
npx supabase projects list
```

Confirm the `●` is on `nmyphyhmfttxkdoposvf` (framefocus-rebuild-test).
Re-link if not:

```
npx supabase link --project-ref nmyphyhmfttxkdoposvf
```

The link does not survive Codespace rebuilds. Two rebuilds happened during
S93; both dropped it, and one silently re-pointed at production. It was
caught by the standing verify-before-push rule — which is exactly why that
rule exists.

---

## 2. End state (verified)

- **main:** `841054f` — merge commit, pushed, Vercel green. Money
  representation is LIVE in production.
- **Branch:** `feature/money-representation-spec`, tip `deb3123`, merged
  `--no-ff`. Clean, no conflicts. **30 files, 5058 insertions, 607 deletions.**
- **Migration `20260730010000_money_representation.sql`:** applied to
  rebuild-test AND production. Verified on production — migration row
  present; `instrument_rates` table present; RPCs `set_line_override_cost`,
  `supersede_instrument_rate`, `convert_estimate_to_project`,
  `approve_expense` all present. **Prod and rebuild-test are identical
  through `20260730010000`.**
- **Types:** `packages/shared/types/database.ts` regenerated against the real
  schema (5,425 lines, up from 5,299). The S93 hand-patch self-healed.

### Pre-push verification on merged main

- `tsc --noEmit` clean.
- 5 test files / 73 tests passing.
- `npm run build` — Compiled successfully, 51 static pages, full route table.
- Only pre-existing lint warnings (`settings-form` `<img>`, `co-template` and
  `proposal-template` alt-text). None from this branch.
- **The full build was run deliberately**, because `be84316`'s bundle-boundary
  bug was invisible to `tsc`. Keep doing this.
- `/dashboard/projects/[id]/costs` now builds at 159 B — consistent with the
  redirect stub replacing the old Job Cost page.

### Record correction — there is NO `instrument_types` table

It does not exist in the migration or anywhere in the schema, and never did.
Contract type is a CHECK-constrained text column, **`estimates.contract_type`**.
An early verification query wrongly assumed a table and briefly made the
production apply look partial. It was not. Do not chase this again.

### Commit trail (S93)

| Hash | What |
| --- | --- |
| `e90edcb` | Spec — `docs/specs/money-representation.md`, FINAL rev 4, 706 lines |
| `a4ff49d` | Spec build amendments (Q1/Q2/Q3) |
| `2658c54` | Migration — written, not yet applied |
| `4ac2fb6` | `database.ts` hand-patch (superseded by `57f2ef8`) |
| `4da80a7` | Shared math + 16-case test suite |
| `ff7b4b7` | Services |
| `8b5ae64` | UI — S-1, partial S-2 |
| `546f0e4` | Backdating guard, unique-index fixes, #111/#112 filed |
| `db98871` | S-3 + S-6 |
| `9c07d57` | `approve_expense` reconcile + review-popup adjust-mode |
| `f55e709` | Zero-allocation approval illegal; create-a-line at capture |
| `54b6d2a` | Rateless instrument never prices at 0%; `set_line_override_cost` RLS |
| `57f2ef8` | Types regenerated against applied migration |
| `be84316` | Bundle-boundary fix — `instrument-rates-shared.ts` |
| `deb3123` | Tech debt #113, #114 (branch tip) |
| `841054f` | Merge to main |

---

## 3. What was decided (the interview — locked)

These came from Josh directly. They are the spec's foundation.

**Cost and budget**
- `budgeted_amount` is estimate COST. Never a client price.
- Cost always exists at estimate time — Josh either figures it during
  estimating or knows it from experience. It carries to the budget.
- Flat-priced lines gain a cost field (`override_cost`). Josh will enter it.
- Budget cost is **tax-inclusive wherever `apply_tax` is on, any row type
  except labor.** Rationale: tax is never client-facing, so it is purely cost
  measurement. Taxed actuals arrive tax-inclusive; a pre-tax baseline would
  build a permanent unfavorable variance into every taxed line.
- Tax is a cost, not a charge. Bishop pays it at the register on materials.
  The estimator's tax toggle is a cost-side convenience so he doesn't compute
  it by hand before markup.

**Sell and contract type**
- **No sell column.** Sell is derived. On fixed-price it's
  `contract_value` + signed COs; on cost-plus it's cost × rate in force.
- Contract type lives on the **instrument** (estimate-contract or CO), not
  the job. No mixing within one instrument. A project can hold a fixed-price
  base with a cost-plus CO.
- Three types: `fixed_price`, `cost_plus`, `time_and_materials`.
- On cost-plus, the **negotiated rate overrides** per-line estimate markup.
- Cost-plus COs are unlikely in practice — the realistic mixed case is a
  fixed base with a T&M change order.

**T&M** (a hybrid, not a cost-plus variant)
- Labor bills at a **flat rate per man-hour**, sell-side, overhead and profit
  baked in. Never touches cost or markup. Single rate per job — no
  per-person, no per-trade.
- Non-labor bills **cost + a negotiated markup percentage, stated in the
  contract.** Not the per-row estimate markup.
- Burden multiplier stays cost-side only.

**Rates**
- Negotiated at contract signing. Usually stable, but can change.
- **Forward-only on renegotiation.** A new rate applies going forward; costs
  already incurred stay at the old rate. History is never rewritten.
- **Backdating:** the FIRST rate on an instrument may take any past date (it
  records the signing date — an agreement is often struck days before it can
  be entered; the delay is data entry, not a change in the deal). LATER rates
  must be dated on or after the previous rate. **Never** in the future.
- Owner AND Admin may renegotiate. Supersede (correcting a typo) is
  Owner-only and requires a reason **and a replacement rate**.

**Committed and actual**
- `committed_amount` **stores GROSS** — the original promise, never mutated.
- The column **DISPLAYS remaining** (gross − paid).
- **Cost to date = actual + remaining committed.** Stays stable as payments
  land, which is the point: the cost was known the day the contract was
  signed, so profit shouldn't swing just because a check was cut.
- Payments land in actual, **NET** of retainage withheld (gross would
  double-count).

**Expenses**
- **Split at capture.** Multi-line material orders are routine, not an edge
  case. `expense_allocations` is the link — there is no
  `expenses.budget_item_id`.
- Approval **adjusts** the captured split (reconcile, not append).
- **Zero-allocation approval is illegal.** Every approved expense lands on at
  least one line, Σ = amount exactly.
- A budget line can be **created at capture** — Owner/Admin/PM only. Foreman
  and crew pick existing lines or Miscellaneous. Mainly for T&M jobs, which
  arrive with no estimate-derived budget.
- Miscellaneous line is created **lazily on first use**.

**Change orders**
- A signed CO writes its **own** budget lines, tracked independently, visually
  distinguished and labeled by instrument.
- Built from `change_order_line_rows` cost detail — NOT from `net_delta`,
  which is a sell figure.

**Other**
- Cost-plus/T&M may carry an **optional, user-entered** projected value.
  Blank by default, never auto-derived from `grand_total`. A projection, not
  an obligation — excluded from variance and over/under math.
- Existing data is **disposable**. No backfill, no recompute, no flagging.
- Hiding `budgeted_amount` from PM is **UI-only** until FINANCIAL-RLS-FLOOR.

---

## 4. Defects found during review (all fixed)

Every one of these was caught reading CC's output, not by tooling.

1. **`set_po_total_amount` overload.** The new third parameter meant
   `CREATE OR REPLACE` would create a *second* function beside the shipped
   2-arg one. Every existing call would then fail at runtime with "function
   is not unique." Fixed with `DROP FUNCTION IF EXISTS` first.
2. **`approve_expense` appended.** Split-at-capture writes allocations; the
   shipped RPC blindly INSERTed the passed rows on top, and its guard summed
   only the passed rows. Capture + approval could stack past the expense
   amount — inflating committed and actual with plausible-looking numbers.
   Fixed to reconcile (delete-then-insert); guard checks final state.
   **Click-tested and confirmed fixed — see §6.**
3. **Rateless instrument priced at 0%.** Superseding the only cost-plus rate
   made `rateInForce` return null, which coalesced to 0% markup — every row
   repriced to sell = cost, and the recompute **persisted** those
   zero-margin totals. Fixed: null rate throws, supersede requires a
   replacement in the same transaction, UI shows a "no rate in force" banner.
4. **`set_line_override_cost` bypassed RLS.** SECURITY DEFINER with only a
   role + company check — a PM could write `override_cost` on any estimate in
   the company, including ones they can't see. Fixed by mirroring the live
   `estimates_select_authenticated` policy inside the function, raising the
   same "not found" message so there's no existence oracle.
5. **Bundle boundary.** `contract-section.tsx` ('use client') imported
   `rateInForce` as a *value* from the client wrapper, which re-exported it
   as a value from the **server** service — dragging `supabase-server` and
   `next/headers` into the browser bundle. `tsc` passed; `npm run dev` failed.
   Fixed with `instrument-rates-shared.ts` per the `payables-shared.ts`
   precedent. **This is why the full `npm run build` is now part of pre-push.**

**Process note worth keeping.** The unattended single-run build reported
completion with **four of six screens not built** (S-3, S-4, S-5, S-6). Not a
model failure — nobody was watching. The audit that caught it was worth more
than the run itself. Consider staged builds with click-test stops between,
the way 7C shipped.

---

## 5. Screen status

From CC's audit of `8b5ae64`, updated for `db98871`.

| Screen | Status |
| --- | --- |
| S-1 Merged Budget & Cost | Built |
| S-2 Split-at-capture | **Partial** |
| S-3 Estimate builder | Built (`db98871`) |
| S-4 Rate history panel | **NOT BUILT** |
| S-5 CO builder rate fields | **NOT BUILT** |
| S-6 Conversion pre-flight | Built (`db98871`) |

**S-2 remaining gaps:**
- Sub-contract schedule setup has **no budget-line picker**.
  `contracts-panel.tsx` builds stages as `{label, amount}` only, even though
  `payables-client.ts` already passes `budget_item_id` per stage to the RPC.
  The plumbing dead-ends at the UI.
- PO total entry has **no picker**. `po-actions.tsx` calls `setPoTotal` with
  two args; the third parameter is never supplied.

**S-4 consequence:** initial rates land effective **today**. There is no date
input anywhere, so backdating a first rate to the actual signing date is
currently impossible from the UI — even though the DB guard permits it.
Same-day rate correction is also blocked (unique index); the proper path is
supersede, which is also S-4. **This is the sharpest remaining gap.**

---

## 6. Click-test — PASSED (Owner, rebuild-test)

**The regression risk passed:** re-approving an expense with a changed split
**REPLACES** the prior allocation rather than appending. Budget-line actual
does not double. This amends shipped 7A, so it was the highest-risk item in
the build.

Also passed:
- Contract section renders and saves.
- A frozen (converted) estimate correctly rejects contract-type changes.
- Convert-to-project cost pre-flight warns on lines missing cost, and the
  override writes.

Not separately reported: the rateless guard and the line cost field.

**Not click-tested:** the merged Budget & Cost screen under non-Owner roles
(PM, foreman, crew), CO budget-line generation on signing, and anything in
the unbuilt screens. Cross-company isolation remains unprovable — see #104.

---

## 7. Open decisions — Josh's call

### 7.1 #113(c) — DECIDE BEFORE 7D

**A won subcontractor bid should carry to the budget as COMMITTED, not only
as cost.** That's Josh's stated intent: awarding a bid *is* a commitment.

Today the winning amount reaches `project_budget_items.budgeted_amount` via
the subcontractor arm of the budget-baseline INSERT. Nothing lands in
`committed_amount`, and `convert_estimate_to_project()` never references
`estimate_sub_bids`.

**This changes 7C's committed model** — committed rows would originate at
**award**, not at bill/PO entry. It also cuts against S93's origin predicate,
which recognises a commitment only by `sub_contract_id`, `purchase_order_id`,
`is_retainage`, existing payments, or `state='committed'`. An awarded bid has
none of those.

**7D builds on the committed model. Decide this first, and spec it — this is
not a patch.**

### 7.2 Batch-approve default

CC resolved the collision between "zero allocations illegal" and "no
per-stage picker yet" by defaulting untargeted stages to a full-amount
Miscellaneous allocation at batch-approve. Alternative: hard-stop and force
targets. Small change in `contracts-panel.tsx`.

### 7.3 Hard-delete of captured allocations

`approve_expense` hard-deletes the captured split before inserting the
approved one, so there is **no record of what the field entered vs. what the
approver changed it to.** The unique-key reasoning for hard delete is sound;
the lost audit trail is real. File as tech debt or fix.

---

## 8. New — project material record (interview needed, nothing specced)

Client-visible record of what actually went into the job: paint colors and
sheens, appliance makes/models, fixture SKUs, tile and flooring products,
stain colors, hardware finishes.

**Answered so far:**
- Client sees it.
- Semi-structured list — defined fields plus an open notes field.
- Photo attachments.
- **Logged as you go**, not assembled at closeout. So the entry point is in
  the field flow, not a closeout checklist.

**Open:**
- Exact field set.
- Client-visible means it crosses the **Pre-Module 9 external-surface gate** —
  second thing to do so after CO signing. Cannot be designed as an internal
  screen.
- Photos: through Module 3's path-convention file handling, or separate?

Not the same thing as a budget line or an expense. A budget line says "$4,200
of paint." This says "Sherwin-Williams Alabaster SW 7008, eggshell, living
room and hall." Different question, different lifetime — the money record
closes with the job, this one stays useful for years.

---

## 9. Tech debt filed this session

**Filed in `546f0e4`:**
- **#111** — `CURRENT_DATE` is UTC in the backdating guard. A user in a
  timezone ahead of UTC entering "today" late in their day can trip the
  future-date rejection. `companies.timezone` exists if it bites.
- **#112** — concurrent renegotiations aren't serialized; two simultaneous
  inserts can read the same floor.

**Filed in `deb3123`:**
- **#113 — Subcontractor bid award leaves no trace and creates no
  commitment.** Three parts:
  - **(a) No visible award record.** `is_winner` exists with a
    one-winner-per-line partial unique index and a radio control, but nothing
    surfaces *who* won and *for how much*, and the identity is lost at
    conversion — `project_budget_items` has no subcontractor column.
  - **(b) Bids cannot be attached.** `bid_document_file_id` exists on
    `estimate_sub_bids` with an FK to `files` and a place in the input types,
    but the add form never sends it, the column renders read-only
    "Attached"/"—" (deferred to 4L, Q1-b), and `updateEstimateSubBid` is dead
    code with no callers. Cross-ref #106.
  - **(c) SPEC, not a patch.** See §7.1 — decide before 7D.
  - **Recorded NON-ISSUE:** entering a bid does **not** alter the estimate
    total. `createEstimateSubBid` INSERTs to `estimate_sub_bids` only.
    Pricing moves only when a winner is picked, via `set_winning_bid` →
    `estimate_line_rows.amount` → `recalculateEstimateTotals`. That is
    correct behavior — don't "fix" it.
- **#114 — Rateless-instrument banner does not clear until reload.** Setting
  a contract type with no rate in force correctly raises the guard; entering
  a rate writes and persists, but the banner stays until reload. Stale client
  state, not a data defect. Fix: re-evaluate in-force state after a rate write.

**Unfiled:** `stageIds` is fetched and returned by `setupPaymentSchedule` and
consumed by nothing (dead field + an extra query).

---

## 10. Accepted risk, recorded in the spec

The origin predicate ("is this expense a commitment or a receipt?") **lives in
`payables-shared.ts`, not in a column.** The budget recompute functions are
now consumers of that predicate alongside the payables screens. **Any change
to it silently moves budget numbers** and must be reviewed against
`docs/specs/money-representation.md`.

Chosen deliberately over a stored origin column, because it means budget and
payables cannot disagree about what a commitment is, and the alternative
would have required touching 7C's capture surfaces and RPC INSERTs.

The predicate is flip-stable: the only state transition (7C's settlement
flip) fires only after payments exist, and payments are their own term in the
test.

**#113(c) would change this predicate.** See §7.1.

---

## 11. Still owed (carried from the S93 brief, untouched)

`#103` foreman test identity + `#104` second test company — **no
cross-company isolation proof exists**, needed before any gated-screen work
is verifiable. `#106` bill doc attachment (cross-ref #113b). `#108`
did_not_finish invisible + closeout reason/rating + read-only sub profile.
`#109` no payment edit or void (a mistyped payment is uncorrectable). `#110`
PO total placement + PO cancel. Test coverage on `payables.ts`,
`payables-client.ts`, `expenses.ts`, `budget.ts`, `contract-value.ts`.
`COMPLIANCE_ALERT_DAYS[1]` has no consumer + dead import `payables.ts:30`.
`#95` casts. RESEND secret. Domain cutover + login branding. `#101` mobile
shell. `#102` PO total drift. `#105` member↔subcontractor FK. Files-manager
redesign. FINANCIAL-RLS-FLOOR migration. FFNav reindex. `#90` crew probe.
`#82` reopen trigger.

**7D not started. 7E–7H still blocked on 7D — and 7D is now also blocked on
the #113(c) decision.**

---

## 12. Suggested next session order

1. Verify link is on rebuild-test. Verify branch and tip against git.
2. **Decide #113(c)** — awarded bid as commitment. It gates 7D and it changes
   the origin predicate this session just locked. Interview first; it's a
   spec, not a patch.
3. Build **S-4** (rate history + supersede + date input). Without it, rates
   can only ever be dated today and typos can't be corrected from the UI.
4. Build **S-5** and the two **S-2** pickers.
5. Click-test the merged screen under PM, foreman, and crew — only Owner has
   been exercised.
6. Answer §7.2 and §7.3.
7. Then 7D.