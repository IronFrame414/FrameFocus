# 7C-spec.md — Accounts Payable

**Status:** BUILT [S91] — schema `6b9e7bb` (migration `20260729010000_7c_accounts_payable.sql`),
services `732dffe`, UI `0153d75`, all on `feature/7c-payables`. **The migration and those commits
are authoritative over this spec's text** — every known divergence is amended inline below as
`[S91]`. ONE piece did NOT ship: **compliance upload** (+ the sub-record compliance section and
calendar expiry wiring) — stopped on an RLS conflict, see §6.10.
**Design authority:** `docs/specs/module7-architecture.md` §7.9 (REAL/INVENTED trace, `:552-626`),
§7.7 #6/#7, P1 (cash basis), P2 (advisory-not-enforced), as amended S89. Boundary with 7A per the
S89 gap decisions (this spec's §0); the matching 7A-spec amendments applied [S91].
**Phase 1 verification:** claims cited file:line against the live repo (S89); re-verified against
the shipped build S91.
**Protocol:** written S89 on `feature/7a-spec`; built + committed S91 on `feature/7c-payables`.

---

## 0. Boundary & scope (locked, S89)

**7A = point-of-purchase receipts ONLY. Anything invoiced/billed enters through 7C.**

- The `subcontractor` cost category is **removed from 7A capture surfaces** but **retained in the
  DB CHECK** — only 7C writers set it (Q1). Sub bills, vendor invoices, commitments: all 7C.
- **Commitments are `expenses` rows** (Q2) — `state='committed'`, written by the 7C flows below.
  No parallel commitments table. This is what `7H-spec.md:18,69` already assumes ("committed cost
  is a state on the 7A ledger, fed by 7C — open POs + signed-but-unbilled sub quotes").
- **Record-only money-out** (decision 4): 7C records payments (date, amount, method). No payment
  processing. Money-in is 7E's, also record-only.
- **Sub compliance docs**: 5I-spec owns the design (`5I-spec.md` §3a/§5); 7C ships the table
  verbatim (Q6) and **reads** its state — warn-never-block, surfaced at payment release. 7C does
  not redesign 5I.
- **Out:** lien-release document lifecycle (7F), client-held retainage (7D/7E), QB export (7G —
  Vendor/Bill/BillPayment, `7G-spec.md:120,143,148`), notification delivery mechanics (future
  notifications module — named in §6, not invented).

---

## 1. Acceptance trace — the bathroom job's plumber and shower glass

> The two costs the 7A trace explicitly deferred ("no receipt exists; their money is a bill that
> will arrive later" — `7A-spec.md` §1). PROPOSED until run against a real Bishop job.

**Onboard — no login required.** The plumber (Reyes Plumbing) already exists as a Module 2
subcontractor, so a `company_members` row exists (`member_type='subcontractor'`,
`profile_id=NULL` — the live `subcontractors_create_member` trigger, TECH_DEBT #81 "do not
touch" list). Josh records the signed quote: a `subcontractor_contracts` row, scope "bath
rough-in + finish", **`contract_value` $6,800**, `status='signed'`
(`20260704211000_module5_5a_projects.sql:438-457`). W9 and COI PDFs arrive by email (5I Path A);
the office uploads them — two `subcontractor_compliance_documents` rows, COI
`expiration_date` set, W9 `expiration_date NULL` (no expiry, no alerts — 5I §3a). Reyes never
logs in. Nothing requires it.

**Auto-commit at schedule setup.** Josh opens the sub contract panel and sets the payment
schedule: **$2,000 rough-in / $3,800 finish / $1,000 final**, retainage shape **(a)
percent-across, 5%**. Setup writes **three `expenses` rows** — `state='committed'`,
`cost_category='subcontractor'`, `sub_contract_id` set, `stage_label` per stage, `status`
pending → approved on Josh's confirm (the 7A uniform gate). The job now shows **$6,800
committed** before any dollar moves (§7.9: "Job shows committed AP before any dollar moves").
The Σ of stages is checked against `contract_value` — mismatch warns, never blocks (P2).

**A stage with a partial payment (S89 close-out correction — payments convert IMMEDIATELY).**
Rough-in passes inspection. Reyes asks for the stage; Josh releases **$1,500 now, $500 next
week** — two `expense_payments` rows against the $2,000 stage row. After the first payment the
job reads ~~$1,500 actual + $500 committed~~ **[S91 gross/net: the $1,500 payment `amount` is
GROSS — it settles the stage to $500 remaining; the check cut is $1,425 and cash-out (actual)
is the NET $1,425, with the $75 withheld accruing in the retainage committed row. $1,425 actual
+ $500 stage committed + $75 retainage committed = the same $2,000.]** — each payment converts
**at payment time**; committed holds only the remaining balance. There is no committed-until-full
state: the stage is live-split from the first dollar. Retainage shape (a) withholds 5% of each
payment ($75, then $25) into the auto-maintained "Retainage held — Reyes Plumbing" committed
row. After the second payment the remaining balance is $0 and the row reads fully settled.
**Remaining-owed = committed − Σ payments, everywhere** (Q3).

**Over-stage flag.** Had Reyes billed $2,400 against the $2,000 stage, the payment form flags
over-stage; Josh may override (§7.9 `:576,582`). Flag, never block.

**Awaiting paper — the shower glass.** The glass sub's quote is verbal-then-email: price agreed
at **$1,850**, no invoice document yet. Josh enters a committed row with
**`awaiting_paper = true`** (decision 6 — "a committed figure with a known number, not a
guess", §7.9 `:606-611`). The job's Payables section shows it badged "bill expected." When the
invoice PDF arrives, it's attached (`files.expense_id`, category `'invoices'`) and the flag
clears. `due_date` is entered per-bill — vendor terms vary (§7.9 `:587-588`).

**Retainage release.** Job completes (punch gate passes). The accumulated **$340 retainage
held** row (5% of $6,800) surfaces for release. The release screen shows Reyes' compliance
state read from 5I's table — COI current ✓ — **advisory only** (5I `:126`; a lien-release
requirement is 7F's future lifecycle, named not built). The **final release click is
Owner-only** (CLAUDE.md owner-only #5 — Admin can review and adjust; Owner releases money out
the door).

**Closeout variant (decision 8).** Had Reyes walked after rough-in: $2,000 paid, $4,800 still
committed across two stages. Owner/Admin runs **closeout** on the open rows — **reason
required** ("abandoned after rough-in; hired replacement"), rows drop out of committed Σ so
"what's left" corrects, and Reyes' sub record is flagged **"did not finish"** (§7.7 #7,
§7.9 `:617-621`). Auditable forever.

**Job close with open bills.** Completing the project while the shower-glass row is open
**warns** — "$1,850 still committed on this job" — but never blocks (Q7iii, P2). The late bill
arrives after close → 7A's reopen (`complete → active`, Owner/Admin) → record → re-complete.

---

## 2. Schema (one 7C migration)

All new tables/columns follow CLAUDE.md standards (standard columns, three column defaults,
both BEFORE UPDATE triggers, soft delete). Additions are additive — no destructive steps.

### 2.1 `expenses` — 7C columns (extends 7A's table)

```sql
ALTER TABLE public.expenses
  ADD COLUMN sub_contract_id    uuid REFERENCES subcontractor_contracts(id), -- sub stage/retainage rows
  ADD COLUMN purchase_order_id  uuid REFERENCES purchase_orders(id),         -- PO commitment row
  ADD COLUMN stage_label        text,                                        -- "Rough-in", "Final"
  ADD COLUMN due_date           date,                                        -- per-bill (§7.9 — vendor terms vary)
  ADD COLUMN awaiting_paper     boolean NOT NULL DEFAULT false,              -- decision 6
  ADD COLUMN is_retainage       boolean NOT NULL DEFAULT false,              -- shape (a) accrual row
  ADD COLUMN closed_out_at      timestamptz,                                 -- orphaned-commitment closeout
  ADD COLUMN closed_out_by     uuid REFERENCES company_members(id),
  ADD COLUMN closeout_reason    text,
  ADD CONSTRAINT expenses_closeout_reason_check
    CHECK (closed_out_at IS NULL OR closeout_reason IS NOT NULL);
```

- A **closed-out row exits every committed Σ** (service + rollup filter `closed_out_at IS NULL`).
  Closeout is legal only on rows with **remaining-owed > 0** (service-enforced; ~~PROPOSED CHECK
  at build~~ **[S91 RESOLVED: no CHECK — it would need to sum a child table, which a CHECK
  cannot (migration §1 note); enforced in `closeoutCommitment`, `payables-client.ts`]**). It
  drops the remaining balance only — dollars already paid stay actual (S89 close-out: live
  split accounting, §2.2).
- `awaiting_paper` **clears when a bill document is attached** (`files.expense_id` — the 7A
  receipt-link column, reused; bill PDFs use `files.category='invoices'`, receipts stay
  `'receipts'`).
- **Writer gating:** the 7A column-scope trigger (`enforce_expenses_column_scope`) is extended.
  ~~and a BEFORE INSERT twin added~~ **[S91 as shipped: NO BEFORE INSERT trigger — INSERT
  gating is policy-only (the WITH CHECK sees the full NEW row; migration §2). And PM is a
  PARTIAL tier on UPDATE, not a flat block: PM passes the same blocked-column checks as
  foreman/crew but may recategorize their OWN PENDING bill INTO `'subcontractor'` (PM enters
  sub bills — decision 3; migration §3).]** Non-Owner/Admin/PM can never set
  `state='committed'`, `cost_category='subcontractor'`, or any 7C column above. PM writes land
  `status='pending'` per the 7A uniform gate (decision 3: owner/admin/PM enter bills;
  foreman/crew never).

### 2.2 `expense_payments` (new — record-only, Q3: partials are v1)

```sql
CREATE TABLE public.expense_payments (
    -- standard columns
    expense_id  uuid NOT NULL REFERENCES expenses(id),
    paid_date   date NOT NULL,
    amount      numeric(12,2) NOT NULL CHECK (amount > 0),
    method      text,            -- free text v1 (RESOLVED [S91]; 7G may force an enum)
    note        text
);
```

**[S91 — shipped adds two columns this sketch lacks** (migration §4):
`retainage_withheld numeric(12,2) NOT NULL DEFAULT 0` — the shape-(a) withhold stored ON the
payment; `amount` is GROSS (settles the stage) and the check actually cut is
`amount − retainage_withheld` — and `over_stage boolean NOT NULL DEFAULT false` (see the
over-stage bullet below).**]**

- **Multiple rows per expense are legal (partial payments).**
  **Live split accounting (S89 close-out — replaces the flip-at-Σ≥amount rule):** each payment
  converts its amount to **actual at payment time**; the committed side holds only
  **remaining-owed = amount − Σ payments**, from the first dollar. A $2,000 stage with $1,500
  paid reads $1,500 actual + $500 committed — never committed-until-full.
  **Representation (PROPOSED — the simpler of the two, recommended): derived at read.** The
  expense row is one record; the actual/committed portions are derived from its payments
  (§2.6 formulas), never materialized. The `state` column becomes a **settlement marker**, not
  a money classifier: it stays `'committed'` while remaining > 0 and flips to `'actual'` when
  remaining hits 0 — the dollars never read from `state`. The alternative — physically
  splitting the row on each payment into an actual row + a reduced committed row — keeps
  `state` a true money classifier but multiplies rows, breaks the one-row-per-stage schedule
  shape, complicates retainage accrual and closeout targeting, and is rejected as the
  non-parking-lot option. ~~PROPOSED; confirm at build~~ **[S91 CONFIRMED AT BUILD — derived
  at read shipped exactly as recommended].**
- Over-stage: a payment pushing Σ above `amount` **flags** (~~stored on the payment note~~
  **[S91: stored as the dedicated `over_stage` boolean column, not on the note]** + surfaced),
  override allowed (§7.9 `:576`). Never blocks.
- RLS: SELECT via parent-expense visibility for owner/admin/PM/foreman (the
  `expense_allocations` pattern, `7A-spec.md` §2.8); INSERT **Owner/Admin only** (release is
  money out). **The final payment of a sub's schedule and any retainage release are
  Owner-only** — CLAUDE.md owner-only #5 (Admin reviews/adjusts; Owner releases). Enforced in
  the release RPC; flagged as the one place 7C is stricter than owner/admin parity.
- ~~No UPDATE/DELETE policies~~ **[S91 resolved the other way: an Owner/Admin UPDATE policy
  EXISTS, narrowed to the soft-delete columns by the `enforce_expense_payments_column_scope`
  immutability trigger (every money/identity field immutable for every role). The table carries
  full standard columns + the trash-bin pattern — NOT the append-only shape.]** A recorded
  payment is a record; corrections are Owner/Admin soft-delete + re-entry (as intended —
  derivation self-corrects).

### 2.3 `subcontractor_contracts` — retainage shape (decision 5)

```sql
ALTER TABLE public.subcontractor_contracts
  ADD COLUMN retainage_shape   text CHECK (retainage_shape IS NULL
                                           OR retainage_shape IN ('percent_across','final_hold')),
  ADD COLUMN retainage_percent numeric(5,2) CHECK (retainage_percent IS NULL
                                                   OR retainage_percent >= 0);
```

Chosen **per sub, per job, at payment-schedule setup**. Shape (a) `percent_across`: each
payment withholds the %, accruing into one auto-maintained `is_retainage=true` committed row
per contract — **withheld stays committed** (Q4) until released at job complete. Shape (b)
`final_hold`: the final stage row is ~~flagged (PROPOSED: `stage_label` convention + service
flag)~~ **[S91 as shipped: no special stage flag — the shape is stored on the contract only;
the Owner-only schedule-final-payment arm in `record_expense_payment` is the sole gate]** held
until work done + lien release received — release surfaces the 5I compliance state, advisory.

### 2.4 `purchase_orders.total_amount` (locked decision 2b + Q8)

```sql
ALTER TABLE public.purchase_orders
  ADD COLUMN total_amount numeric(12,2);   -- nullable; NO line-item pricing (locked)
```

**Entering `total_amount` IS the commitment** (Q8): the write creates (or adjusts) the PO's
committed expense row (`purchase_order_id` set, `cost_category='material'`, amount =
total_amount). Editing the total adjusts the open committed row; no separate commit button.
[S91: the shipped `set_po_total_amount` RPC rejects amounts ≤ 0 — a PO total can be adjusted
but never cleared. Direct-write drift around the RPC is TECH_DEBT #102.]
Verified: zero interaction with the 6D auto-close/reopen trigger — `recompute_po_status`
(`20260711130000:299-351`) is purely quantity-based.

### 2.5 `subcontractor_compliance_documents` (Q6 — shipped verbatim from 5I §3a)

Built exactly as `5I-spec.md:50-60` designs it: `member_id → company_members`, `doc_type`
CHECK `('coi','license','w9','other')`, `file_id → files`, `issued_date`,
**`expiration_date` nullable (W9 = NULL, never alerted)**, `notes`, standard columns.
Compliance status **derived, never stored** (`current / expiring_soon / expired` from
`expiration_date` vs today — 5I `:64`); COI = single soonest expiration (`:65`).
**Alert thresholds: −30 and −7 days** (Q5 — matches 5I `:123`; S89's earlier "30/14" is
superseded; no 5I amendment owed). RLS: owner/admin/PM read+write (5I Path A — office uploads);
sub self-service upload is 5I's portal (Path B), not built here.
**Flag to 5I:** the portal build must NOT re-create this table — 7C ships it; 5I keeps design
ownership (§6 open items).

### 2.6 Rollup math (extends 7A §4 — the definitions used everywhere)

```
-- Live split accounting (S89 close-out): every dollar of a 7C row is either
-- paid (actual, at payment time) or remaining (committed). Derived at read.
committed_remaining(job) = Σ over 7C expense rows WHERE status='approved'
                             AND closed_out_at IS NULL AND is_deleted=false
                           of GREATEST(amount − Σ its expense_payments, 0)
cash_out_7C(job)         = Σ (amount − retainage_withheld) across payments on the job's
                           7C rows — NET, not Σ amount  [S91 gross/net amendment: a
                           payment's amount is GROSS and settles the stage; the withheld
                           dollars accrue in the is_retainage committed row and leave as
                           cash only at release. At full settlement Σ net across ALL
                           payments = the contract value.]
                           (cash basis, P1 — actual AT PAYMENT TIME)
actual(job)              = 7A approved receipts (amount)  +  cash_out_7C
still_owed(job)          = committed_remaining                (§7.9 "THE NUMBER")
```

The `state` column is a settlement marker only (`'actual'` once remaining hits 0 — §2.2);
**money math always derives from payments** for 7C rows and never reads `state`. Pending rows
count nowhere (the 7A gate). `project_budget_items.committed_amount`:
NOT populated in 7C v1 — per-line committed allocation is an open item (§6); committed is
job-level, matching 7H's per-job read.

---

## 3. Services & routes

### 3.1 `apps/web/lib/services/payables.ts` (server)

- `getBillsAndCommitments(projectId?)` — 7C rows (state/flags/remaining, payments joined).
- `getPayablesSummary(projectId)` — committed_remaining, awaiting-paper count, retainage held,
  still-owed; feeds the Job Cost Payables section.
- `getSubSchedule(subContractId)` — stage rows + payments + retainage accrual.
- `getComplianceStatus(memberId)` / `getExpiringCompliance()` — derived 5I state; the −30/−7
  windows for the calendar and advisory surfaces.

### 3.2 `apps/web/lib/services/payables-client.ts` (client)

- `setupPaymentSchedule(subContractId, stages[], retainage)` → RPC `setup_payment_schedule`
  (atomic: stage rows + contract retainage columns; Σ-vs-contract_value mismatch returns a
  warning, not an error; NULL `contract_value` → warn + manual stages, Q7ii).
  [S91: the RPC takes two scalar params — `p_retainage_shape` / `p_retainage_percent` — and the
  client wrapper unpacks the retainage object; returns `{stage_count, stage_total, warning}`.
  Hard errors the wrapper maps: duplicate schedule (one per contract v1), void contract,
  invalid stages.]
- `createBill(input)` / `createCommittedEntry(input)` — manual entries (decision 2a);
  owner/admin/PM; PM lands pending.
- `attachBillDoc(expenseId, fileId)` — clears `awaiting_paper`.
- `setPoTotal(purchaseOrderId, amount)` → RPC `set_po_total_amount` (upsert committed row, Q8).
- `recordPayment(expenseId, {paid_date, amount, method, note, overrideOverStage?})` → RPC
  `record_expense_payment` (atomic: payment row + over-stage flag check + retainage withhold
  (shape a) + settlement-marker update when remaining hits 0 — the paid dollars are actual
  immediately regardless, §2.2/§2.6; Owner-only when the payment is a schedule-final or
  retainage release).
  [S91: `p_amount` is GROSS (settles remaining; cash out = amount − retainage_withheld);
  returns `{over_stage, remaining, retainage_withheld}`; the no-override refusal surfaces as an
  `OVER_STAGE`-prefixed RAISE — the wrapper prefix-matches and re-calls with the override after
  a confirm.]
- `closeoutCommitment(expenseId, reason)` — Owner/Admin, reason required; flags the sub
  "did not finish" (decision 8; ~~placement PROPOSED~~ **[S91 RESOLVED:
  `subcontractors.did_not_finish` — migration §8, settled S90. The member→sub resolution is a
  best-effort NAME MATCH requiring exactly one hit (no FK exists) — closeout still succeeds
  with a "flag by hand" warning on ambiguity; defect filed as TECH_DEBT #105]**).
- `releaseRetainage(subContractId, payment)` — Owner-only. [S91: no dedicated RPC — the client
  resolves contract → the single `is_retainage` row and pays it via `record_expense_payment`,
  whose Owner arm enforces; partial release legal, amount defaults to remaining.]
- ~~Compliance doc CRUD — reuses `uploadFile` (`files-client.ts:30-100`) + a compliance row.~~
  **[S91 NOT BUILT — STOPPED.** `uploadFile` (now at `files-client.ts:59` — the `:30-100` cite
  drifted) requires `project_id`, and the #96 files policies admit `project_id IS NULL` rows
  for **Owner/Admin only** (`20260728000000:89-91`), contradicting §2.5's Owner/Admin/PM
  writers. Read services shipped and ready (`getComplianceStatus` / `getExpiringCompliance` +
  `deriveComplianceStatus` with the −30/−7 constants, `payables.ts`). See §6.10.]
- Contract `void` after commitment → **auto-closeout** of its open committed rows with system
  reason `'contract voided'` (Q7i — no manual reason prompt; distinct from decision-8 closeout).

### 3.3 Routes

No new API routes; no new page routes. Existing surfaces grow (Q9):

| Route (existing) | 7C addition |
| --- | --- |
| `/dashboard/expenses` | tabs: **Receipts \| Bills & Commitments \| Review queue** — BUILT [S91] |
| `/dashboard/projects/[id]/costs` | **Payables** section (7A Job Cost tab) — BUILT [S91] |
| `/dashboard/projects/[id]/contracts` | payment-schedule setup + stage/payment panel on the sub contract (`contracts-panel.tsx`) — BUILT [S91] |
| `/dashboard/subcontractors/[id]` (sub record) | compliance docs list + upload + expiry chips — **[S91 NOT BUILT (§6.10); and the route does not exist — only `/dashboard/subcontractors/[id]/edit` (cross-ref TECH_DEBT #13); the section lands on the edit page when unblocked]** |
| `/dashboard/schedule` | compliance expiry trigger points as calendar entries — **[S91 NOT BUILT — stopped with the compliance surface (§6.10); `getExpiringCompliance` is ready to feed `getCalendarEvents` as derived-at-read entries]** |
| `/dashboard/field-ops/[projectId]/deliveries/[poId]` (6D PO detail) | **[S91 ADDED at build — this table originally named no PO surface]** PO total field (`PoTotalControl`, `po-actions.tsx`) → `set_po_total_amount`; Owner/Admin/PM |

---

## 4. UI (screens, roles, entry points, nav placement)

**[S91 build status: screens 1–5, 7, 8 BUILT (`0153d75`), committed but not yet click-tested.
Screen 6 (compliance on the sub record) NOT BUILT — stopped with the compliance upload, §6.10.]**

**Nav: no new item** (Q9). Entry points are the Expenses nav item (`dashboard-shell.tsx` —
7A's proposed item), the project Job Cost tab, the project sub-contract panel, and the sub
record under Subs & Vendors (`dashboard-shell.tsx:58`).

**Roles throughout (decision 3 + 7A floor):** Owner/Admin — everything; **Owner alone** —
final sub payment + retainage release (CLAUDE.md owner-only #5). PM — enter bills/commitments
(pending), set up schedules (pending), view payables on visible projects; **cannot** record
payments, approve, close out. Foreman — sees expense/bill rows per the 7A visibility arm; no
entry, no payments, no Payables money summary beyond expenses. Crew — nothing in 7C (own 7A
receipts only).

1. **Bills & Commitments tab** (`/dashboard/expenses`): list — supplier/sub, project,
   stage_label, amount, **paid-to-date (actual)**, **remaining (committed)**, due date, badges
   (`awaiting paper`, `over-stage`, `retainage`, `closed out`), settlement chip (open /
   settled — the §2.2 marker). "New bill / commitment" button
   (owner/admin/PM). Filters: project, sub, awaiting-paper, due soon.
2. **Review queue** (shared with 7A): PM-entered bills/commitments appear beside receipts;
   same popup (allocation section works unchanged — allocations still write `actual_amount`
   only for actual-state rows).
3. **Payment-schedule setup** (sub contract panel): stage editor (label + $ rows; running Σ vs
   `contract_value` with mismatch warning), retainage shape selector — "(a) X% across
   payments" / "(b) hold final stage" — per sub per job. Save = committed rows created.
4. **Stage & payment panel** (same panel): per stage — amount, payments list, remaining;
   **Record payment** (date/amount/method/note) with over-stage flag + override confirm;
   partial payments accumulate; final/retainage release button rendered Owner-only, showing
   the 5I compliance chips (advisory — "COI expired 12 days ago" never blocks, 5I `:126`).
5. **Payables section** (Job Cost tab): committed remaining, awaiting-paper list, retainage
   held, **still-owed** headline (= committed − paid, §7.9 "THE NUMBER"). Owner/Admin + PM.
6. **Compliance on the sub record:** doc rows (type, dates, derived status chip), upload
   (Path A), expiry countdown. Calendar shows −30/−7 trigger points.
7. **Complete-with-open-bills warning** (project status flow): completing with
   `committed_remaining > 0` interposes an advisory — "$X still committed" — proceed allowed
   (Q7iii); pairs with 7A's reopen for the late bill.
8. **Closeout dialog:** Owner/Admin, reason textarea (required), consequence text ("drops $X
   committed; flags {sub} as did-not-finish").

---

## 5. Hooks & ties (verified this session)

| Hook | Where | 7C relationship |
| --- | --- | --- |
| Expense table + gate | `7A-spec.md` §2.1/§2.8 (committed as `ed92aae..02d09d7`) | rows, status gate, column-scope trigger extended; state writers land (7A §6 open item resolved) |
| Sub contracts | `20260704211000:438-457` (`contract_value`, status incl. `void`) | auto-commit source; void → auto-closeout (Q7i) |
| Sub identity, no login | `subcontractors_create_member` (live, #81 "do not touch"); `company_members.profile_id NULL` | onboarding needs no portal/invite |
| PO shape + auto-close | `20260711130000:74-98`, trigger `:299-351` (quantity-only) | `total_amount` additive, zero trigger interaction |
| Compliance design | `5I-spec.md:50-65` (§3a), `:120-126` (§5 — −30/−7, warn-never-block), `:81-83` (award = signed) | table shipped verbatim; state read at release |
| Calendar surface | `app/dashboard/schedule/page.tsx:2-28`; `components/schedule/calendar.tsx` | REAL; expiry entries wired at build |
| Reopen for late bills | `7A-spec.md` §3.4; architecture §7.7 #2 CLOSED (S89) | the §7.9 late-bill path exists |
| Owner-only release | CLAUDE.md owner-only #5 | final payment + retainage release gate |
| Files pipeline | `files-client.ts:59` (`uploadFile` — cite updated [S91]); `files.expense_id` (7A §2.4) | bill PDFs (`'invoices'`) shipped; compliance PDFs BLOCKED (§6.10); awaiting-paper clears on attach (best-effort — Owner/Admin on approved rows) |
| 7H reads | `7H-spec.md:18,69,72` | committed-on-the-ledger model matches; Remaining = Budget − Actual − Committed consumes §2.6 definitions |
| QB export (future) | `7G-spec.md:120,143,148` | Vendor/Bill/BillPayment map onto expenses + expense_payments; `qb_export_status` stub pattern |

---

## 6. Open items / flagged conflicts

1. **TECH_DEBT #81 (dormant sub-invite):** 7C v1 needs no sub login — schedules/compliance key
   on `company_members` rows. 5I's portal upload (Path B) and any sub-facing payment surface
   wait on #81 reactivation + the 5I build. Also note 5I-spec §2 (`:24-32`) describes the
   pre-decision-B state (role in CHECKs) — stale vs #81; reconcile when 5I builds.
2. **Notifications tie-in point (named, not designed):** the −30/−7 compliance evaluations,
   "clear for payment" (§7.9 `:595`), due-date reminders, and the over-stage flag are **named
   event emitters** for the future notifications module (parallel S89 session; shape
   UNVERIFIED). v1 surfaces are in-app lists + calendar entries only. Do not invent delivery
   mechanics here.
3. **7G GL-mapping ownership** (`7G-spec.md:56`): standing conflict — the `gl_account_*`
   columns shipped with 7A; 7C's bills consume `gl_account_subcontractor`/`_material`/`_other`
   at export. 7G wording fix owed.
4. **`project_budget_items.committed_amount`** stays unpopulated in v1 — committed is
   job-level. Per-line committed allocation (and whether the review-popup allocation UI
   extends to committed rows) is a deliberate deferral; revisit with 7H's per-category table.
5. **Floating vendor credit** (§7.7 #6, accepted imprecision): a damaged-return store credit
   leaves the job and floats. v1 records it as a note on the PO/bill row; a first-class credit
   record is post-v1 (aligns with 6D Q2 "won't build returns for v1").
6. **"Did not finish" flag placement** — ~~sub record vs member row; confirm at build~~
   **[S91 RESOLVED: the sub record — `subcontractors.did_not_finish` (migration §8, settled
   S90). Residual defect: member→sub resolution is a name match, no FK — TECH_DEBT #105.]**
7. **Threshold decision recorded:** −30/−7 (Q5) — S89's interview "30/14" is superseded;
   5I needs **no** amendment. If the founder ever wants 14, it's one constant in the derived
   evaluation, not a schema change.
8. **Payment method enum vs free text** — PROPOSED free text v1; QB BillPayment mapping at 7G
   may force an enum. Decide at 7G.
9. **FINANCIAL-RLS-FLOOR:** payables dollars ride expenses/payments RLS (self-contained), but
   the standing budget-items and companies-row gaps are unchanged; batch with the named
   migration.
10. **[S91 — OPEN] Compliance upload RLS conflict — blocks §2.5's PM writers, §4 screen 6, the
    §3.3 calendar row, and §4.4's release-time compliance chips (no doc rows can exist, so the
    chips shipped nowhere — they land with the same unblock).** The #96 files policies (`20260728000000:89-91`) admit
    `project_id IS NULL` rows for **Owner/Admin only**; §2.5 names Owner/Admin/PM as compliance
    writers, and compliance docs are member-scoped (no project to attach). The S91 build
    STOPPED here per instruction: no upload function, no sub-record section, no calendar
    wiring; no file_id-NULL rows, no arbitrary-project pinning, no RLS change. §2.5 stands as
    design intent. **Options:** (a) a follow-up migration adding a compliance arm to the files
    policies — e.g. Owner/Admin/PM for a dedicated NULL-project compliance path — batched with
    FINANCIAL-RLS-FLOOR; (b) Owner/Admin-only compliance upload v1 (amend §2.5's writer set).
    Undecided — Josh's call.

---

*Written Session 89 on `feature/7a-spec` after Phase 1 verification and Phase 2 approval
(Q3 changed: partial payments are v1; Q5 changed: −30/−7 supersedes "30/14"; S89 close-out
correction: payments convert to actual immediately — live split accounting replaces the
flip-at-full rule). BUILT and committed Session 91 on `feature/7c-payables` (`6b9e7bb` schema,
`732dffe` services, `0153d75` UI); divergences from the build amended inline as [S91] — the
migration and those commits win over any remaining spec text. Every former PROPOSED is now
resolved inline except §6.10 (compliance upload), which is an open decision.*
