# context91.md — Session 91: 7C Built (Schema → Services → UI), Gross/Net Retainage Fix, 7D–7H Reconciled

> **Session:** 91 — July 29, 2026. **Branch:** `feature/7c-payables` (NOT merged to `main`;
> merge is Josh's call). Six S91 commits: `6b9e7bb` 7C schema, `761ed85` debt #102–#104,
> `732dffe` 7C services, `0153d75` 7C UI, `302c4e8` debt #105, `a37b5a2` 7D–7H reconciliation.
> (Note: a later handoff listed five commits and omitted `302c4e8` — git shows six.)
> **Shape:** schema (with an in-flight gross/net retainage correction) → RLS probes → services →
> UI (three-phase protocol, two designated stop-points, one triggered) → debt filings → 7D–7H
> doc reconciliation. Only this wrap file is uncommitted.
> **Ground rule held:** git/migrations over any spec, handoff, or context claim — the
> reconciliation pass ran Phase 1 verification against HEAD before every edit, and the 7C build
> treated the migration as authoritative over the spec's own text.

---

## 1. 7C schema (`6b9e7bb`, migration `20260729010000_7c_accounts_payable.sql`) — REBUILD-TEST ONLY

**Applied to rebuild-test. NOT applied to production.** (Unlike the S90 migrations, which went
to both.) Prod application is owed and gated on click-testing (§10).

Contents: `expenses` 7C columns (`sub_contract_id`, `purchase_order_id`, `stage_label`,
`due_date`, `awaiting_paper`, `is_retainage`, closeout trio + reason CHECK);
`expenses_insert_authorized` re-created (committed/subcontractor writers = Owner/Admin/PM,
uniform pending gate stays pinned; policy-only — no BEFORE INSERT trigger);
`enforce_expenses_column_scope` extended (PM is a PARTIAL tier: same blocks as foreman/crew but
may recategorize their OWN PENDING bill INTO `'subcontractor'`); **`expense_payments`** (new —
record-only, immutable money fields via column-scope trigger, Owner/Admin UPDATE narrowed to
soft-delete, SELECT for Owner/Admin/PM/Foreman via parent-expense visibility, INSERT
Owner/Admin); `subcontractor_contracts.retainage_shape/percent`;
`purchase_orders.total_amount`; **`subcontractor_compliance_documents`** (5I §3a verbatim, 5I
keeps design ownership); `subcontractors.did_not_finish`; three SECURITY INVOKER RPCs —
`setup_payment_schedule`, `record_expense_payment`, `set_po_total_amount`. `database.ts`
regenerated and committed with the migration.

## 2. THE GROSS/NET RETAINAGE CORRECTION (S91, in-schema) — and why it mattered

The spec's own §2.6 said `cash_out_7C = Σ expense_payments.amount`. **That overstates cash out
by exactly the withheld amount:** a $2,000 stage paid with 5% retainage cuts a $1,900 check but
Σ amount says $2,000 left the company — and when the $100 retainage row is later released and
paid, the same dollars count AGAIN. Settled semantics (Josh, S91): a payment's `amount` is the
**GROSS** billed against the stage (it settles remaining); the check actually cut is
`amount − retainage_withheld`; **cash out is the NET**. `retainage_withheld` is stored ON each
payment row; the `is_retainage` accrual row is the bookkeeping MIRROR of Σ withheld (same
dollars, not a second obligation); its release is its own payment with `withheld = 0`, so at
full settlement Σ net across ALL payments = the contract value. Every consumer (rollup, tabs,
panels) derives from this. The spec was amended inline (`a37b5a2`).

## 3. RLS probes — 12/12 PASS, two arms un-runnable

The S90 impersonation harness (`SET LOCAL role authenticated` + jwt claims — never MCP-as-
postgres) ran against the 7C policies on rebuild-test: **12 of 12 probes passed.** Two arms
could NOT run, filed as debt:

- **#103** — no foreman test identity exists in rebuild-test, so the foreman SELECT arm on
  `expense_payments` is NOT RUN (same gap class as #90).
- **#104** — rebuild-test has only one company, so no true cross-company isolation probe is
  possible; a three-identity control substituted.

## 4. 7C services (`732dffe`) — derived-at-read shipped; rollup corrected

- **`payables-shared.ts`** — THE definitions (contract-value.ts ONE-filter precedent), no
  supabase import so server, client, and UI all consume the same helpers: `PAYABLE_OR_FILTER`,
  `isPayableRow`, `countsTowardCommitted`, `grossPaid`, `committedRemaining`
  (= `GREATEST(amount − Σ payments, 0)`), `netCashOut`, compliance status derivation (−30/−7).
- **`payables.ts`** (server): `getBillsAndCommitments` (predicate query + payments-inner query
  merged — the second recovers settled manual bills whose `state` flipped with no linkage),
  `getPayablesSummary`, `getSubSchedule`, `getComplianceStatus`/`getExpiringCompliance` (ready,
  unconsumed — §5).
- **`payables-client.ts`**: `setupPaymentSchedule` (unpacks retainage → two scalar RPC params),
  `createBill`/`createCommittedEntry`, `attachBillDoc` (best-effort awaiting_paper clear —
  partial-success on approved rows for PM), `uploadBillDocument` (category `'invoices'`),
  `setPoTotal`, `recordPayment` (OVER_STAGE prefix-match → confirm → override re-call),
  `softDeletePayment`, `releaseRetainage` (resolves contract → the one `is_retainage` row; RPC
  enforces Owner-only), `closeoutCommitment` (remaining>0 service-enforced; did-not-finish
  best-effort NAME MATCH — #105), `voidContractWithCloseout` (system reason `'contract
  voided'`, NO did-not-finish flag, non-atomic — RPC candidate), `getCommittedRemaining`.
- **`getJobCostRollup` corrected** (`expenses.ts`): actual = approved 7A receipts + Σ NET
  payments on payable rows — the old `state='actual'` filter would have replayed the
  flip-at-full rule S89 killed (a half-paid stage contributed $0, then its full amount).
  Additive `payables` block (committedRemaining / retainageHeld / awaitingPaperCount /
  stillOwed). One consumer (`costs/page.tsx`), updated.

## 5. 7C UI (`0153d75`) + the designated stop that triggered

Built: `/dashboard/expenses` restructured to **Receipts | Bills & Commitments | Review queue**
(bills tab: paid/remaining columns, badges, filters, attach-bill, payment modal with over-stage
confirm, closeout dialog); review popup handles committed rows (allocation section + category
select hidden; `approve_expense(id, [])` — verified state-agnostic, one of two designated
stop-points, CLEARED); contracts panel gains schedule-setup editor (live Σ-vs-contract
warning), stage/payment panel (payments list + soft-delete, "Approve all" for pending stages),
Owner-only retainage release, void → auto-closeout; Job Cost tab Payables section
(Owner/Admin/PM); PO total field on the 6D PO detail (`PoTotalControl` →
`set_po_total_amount`); complete-with-open-bills advisory in status-control.

**The second stop-point TRIGGERED — compliance upload NOT built.** The #96 files policies admit
`project_id IS NULL` rows for **Owner/Admin only** (`20260728000000:89-91`), contradicting
§2.5's Owner/Admin/PM compliance writers — and compliance docs are member-scoped, no project to
attach. Per instruction: no upload function, no sub-record section, no calendar wiring, no
file_id-NULL rows, no arbitrary-project pinning, no RLS change. **Read services are built and
ready.** Two resolution options (7C-spec §6.10, undecided): **(a)** follow-up migration adding
a compliance arm to the files policies, batched with FINANCIAL-RLS-FLOOR; **(b)**
Owner/Admin-only upload v1 (amend §2.5's writer set).

## 6. 7D–7H reconciliation (`a37b5a2`) — eight files, +232/−94

Phase 1 verified every claim against HEAD; Phase 3 applied fixes under the governing rule
**"reconciliation deletes false claims; it does not make design decisions."**

- **7H:** "actual rows carry sell" struck (S89 reversal — no sell column shipped); committed
  rewritten to derived-remaining read via `getJobCostRollup().payables` (`state` is a
  settlement marker); "verified"→"approved" at all nine sites; 7B row → derivation; "none of
  these schemas exist" corrected (7A/7B/7C/M5/projects built; 7D/7E not); "debt #7"
  disambiguated to M7-architecture §7.1 (NOT TECH_DEBT #7).
- **7G:** "CO on approval" + the "approved CO → contract adjustment" map row DELETED (status is
  `'signed'`; contract value is derived — no FF-side write to mirror, no QB entity); GL-mapping
  wording fixed (columns live on `companies`, shipped with 7A, consumed by 7C); Bill/BillPayment
  rows mapped to shipped shapes with a gross/net mapping warning.
- **7E:** QB mechanism rewritten to sub-customer (7G resolved it); §S.2 "7G undefined" → "spec
  exists, build is the gate"; the §4-vs-acceptance-#6 contradiction FLAGGED at both lines, not
  picked.
- **7D:** §S.1 "unmerged branch" caveat replaced with live merge facts. **7F:** #10 and §7F.8
  rationales updated (sub payments now wired; M6 readable) — decisions unchanged, auto-match
  noted as revisit. **7A-spec:** both context90 §5 amendments applied. **Architecture:** §7.2
  7A/7B rows amended inline; §7.3 footnote (7G upstream of 7E's payment path; 7B arrow is
  derivation).
- **7C-spec:** all 16 build divergences amended inline as [S91]; header flipped to BUILT with
  commit hashes; trace re-figured for gross/net.

**THREE OPEN DECISIONS recorded (Josh's calls, nobody else's):**
1. **Signed-CO export to QB** (7G §7G.4/§7G.6): (a) nothing — money reaches QB when invoiced
   via 7D; (b) something else at 7G build.
2. **7E retainage-release trigger actor**: §4 says CLIENT sign-off, acceptance #6 says OWNER —
   flagged at both lines + §O; resolve before 7E builds.
3. **Compliance-upload RLS path** (7C §6.10): migration arm vs Owner/Admin-only v1 (§5 above).

## 7. Debt filed: #102, #103, #104, #105

- **#102** (`761ed85`) — `purchase_orders.total_amount` writable directly around the RPC,
  desyncing the committed row; accepted 7C v1 (RPC is the only UI path); fix shape =
  column-scope trigger; #93 tighten-if-observed posture.
- **#103 / #104** (`761ed85`) — probe-harness gaps (§3): no foreman identity; no second company.
- **#105** (`302c4e8`) — NO identity join between `company_members` and `subcontractors`
  (trigger copies `company_name`→`display_name` only, no FK) → 7C closeout resolves by name
  match; duplicate names silently drop the did-not-finish flag (fails safe with a "flag by
  hand" warning). Josh's intent: prohibit exact duplicate names platform-wide. Recommended fix:
  (a) real FK `subcontractors.member_id`; (b) soft same-name warning at entry, not a hard
  constraint. Cross-ref #13.

## 8. Decisions made (chat-only; recorded here)

- All 23 7C Phase-2 recommendations approved as written except: database.ts regen skipped
  (already committed), compliance upload = STOP-POINT (triggered, §5), approve_expense
  committed-row check = STOP-POINT (cleared), compliance built LAST so the stop cost nothing.
- Derived-at-read CONFIRMED at build (the §2.2 PROPOSED alternative — physical row splitting —
  is dead). No BEFORE INSERT trigger; policy-only gating. Payment corrections =
  soft-delete + re-enter (payments immutable for every role, Owner/Admin included).
- Did-not-finish placement: sub record (settled S90, shipped S91).
- Reconciliation governing rule: delete false claims, never silently pick a design (three open
  decisions above exist because of it).

## 9. Lessons

- **The spec's own retainage math was wrong, and it only surfaced because CC was asked to show
  the arithmetic.** §2.6's Σ-payments formula read plausibly for months; writing the migration
  header's worked example ($2,000 stage / 5%) exposed the double-count on release. Make
  "show the arithmetic on a worked example" a standing schema-review step for money math.
- **Stop-points earn their keep when they're ordered last.** Compliance upload was sequenced
  after everything else, so the triggered stop cost zero rework — the read services and all
  seven other screens shipped.
- **Client/server import discipline:** the shared money-math helpers needed a third file
  (`payables-shared.ts`, no supabase import) — exporting runtime values from a server service
  drags `next/headers` into client bundles. The `expense-ui.tsx` precedent generalizes.
- **A "verified" that never existed:** 7H used a status name 7A never shipped, across nine
  lines. Terminology drift between spec generations is a real class of falsehood — the
  reconciliation Phase 1 (report VERIFIED/FALSE/STALE with file:line before editing) caught
  every instance mechanically.
- **Handoffs miscount; git doesn't.** The S91 handoff itself listed five commits; git shows six.

## 10. OWED / NEXT SESSION

1. **THE HEADLINE: the entire 7C build is committed but has NEVER been click-tested.** Schema,
   services, and UI (`6b9e7bb`/`732dffe`/`0153d75`) are type-check-green only — no human has
   run schedule setup → approve stages → record payment → over-stage override → retainage
   accrual → release → closeout → void → rollup on a live screen. S90's 7A standard
   ("every surface click-verified live") has NOT been met for 7C. **This is S92's first job**,
   and it gates everything downstream: prod application of the migration, the merge to main,
   and every 7D–7H build that consumes 7C numbers.
2. **Apply `20260729010000` to production** — after click-testing, not before. It is on
   rebuild-test only.
3. **Three open decisions for Josh** (§6): signed-CO export, 7E release-trigger actor,
   compliance-upload RLS path. The last unblocks compliance upload + sub-record section +
   calendar wiring + release-time chips in one move.
4. **Probe-harness gaps**: #103 foreman identity, #104 second company — then re-run the two
   missing arms.
5. **7D schema phase (§S) is READY** — all six upstream reads verified live. 7E blocked on 7D
   (+ the actor decision); 7F settings-half buildable, lifecycle blocked on 7D; 7G blocked on
   7D/7E for income (AP half readable but rides untested 7C); 7H headline buildable now, full
   report blocked on 7D+7E.
6. Carried, unchanged: **FINANCIAL-RLS-FLOOR** (batch candidate for the compliance arm, option
   a), **#95** cast cleanup, **RESEND secret / domain cutover / login branding**, **#100 /
   #101** (#101 matters before crew field use), **FFNav reindex**, **#90** crew probe (harness
   ready), **#82** DB transition trigger.

## 11. Flags

- Rebuild-test-only status for `20260729010000` recorded on the founder's word + MCP target;
  prod schema untouched this session.
- The 7C UI's "Attach bill" picker leaves a stale "Attaching…" state if the file dialog is
  cancelled (no cancel event handled) — cosmetic, noted at build.
- `setupPaymentSchedule` returns `stageIds` that the shipped panel no longer consumes (the
  batch-approve offer became a persistent "Approve all" button) — inert surplus, not a bug.
- Retainage shape (b) `final_hold` ships as a stored shape only — no special stage flag; the
  Owner-only schedule-final arm is the sole gate. Amended into §2.3; revisit if a real
  final-hold workflow needs more.
