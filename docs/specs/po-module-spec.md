# The add-items sheet and purchase orders — module spec (`17a`–`17c`, `18a`–`18b`)

> **Status: PHASE 3 — AWAITING JOSH'S APPROVAL. Nothing below is built.**
> Source handoff: `docs/handoffs/EZCB_Estimate_Items_PO_handoff/` (verified committed, README read in
> full). Context: `desktop-redesign-spec.md` §6b.5 (the deferral that created this module).
> Baseline: `main @ 726fca6` (steps 8–10 merged); branch `feature/po-module`.
> Phase 1 analysis: conversation record, 2026-08-29 — every claim below carrying a `path:line` was
> read in that pass, not inherited from the inventory. Prior inventory:
> `docs/specs/items-po-inventory.md` (its four UNKNOWNS are resolved in this spec).

---

## §1 — The basis rule, first, because it is the point of the module

> The estimate carries **cost and sell**. A **purchase order is cost only** — every PO line, subtotal
> and total is de-marked-up. **"Against the estimate" compares ordered cost to budgeted cost, never to
> sell.** Comparing cost to sell produces a percentage that looks fine while the category is actually
> over.

**RULED [Josh], carried verbatim from `desktop-redesign-spec.md` §6b.5.** This is the Financial
Visibility Floor applied correctly: a PO lives in the cost tier, which is broadly visible by ruling
(the same reason `project_budget_items.committed_amount` is readable by every role —
CLAUDE.md, the Floor's "visible to all roles" bullet). Concretely, "de-marked-up" costs nothing to
compute: **the estimate row's `unit_cost`/`amount` IS the cost basis** — markup is applied forward to
produce sell (`total`), never stored into it. A PO line reads the cost basis and never touches sell.
The budget's `budgeted_amount` is the same basis (the convert RPC's expression,
`20261025000000_allowance_row_type.sql:305-326`), which is what makes "Against the estimate" an
apples-to-apples comparison.

---

## §2 — The rulings

All made by Josh; reasoning recorded so a later reader meets the argument.

**R2 — committed cost keeps its meaning.** Committed = an agreed subcontract, and an issued material
PO. The *mechanism* is unchanged: an `expenses` row with `state='committed'` and
`purchase_order_id` set, allocated to budget lines, feeding `recompute_budget_item_committed`
(`20260730010000_money_representation.sql:867`). What changes is only the **writer** (R-Q1 below).
An earlier reading had this module reversing committed's meaning; it does not — see §3.

**R3 — PO lines gain `unit_cost` and `budget_item_id`.** Today `purchase_order_items` is
`description · qty_ordered · unit · sort_order` (verified, `database.ts` Row) — no money, no budget
link — which makes the total unfootable, "Against the estimate" impossible, and the delivery chain a
dead end (`delivery_items.po_item_id → purchase_order_items.id` → nothing).

**R4 — vendor.** From `cost_catalog.default_vendor_id` (a real FK to `subcontractors` where
`sub_type='vendor'` — `20260101000000_baseline_schema.sql:1526,2617`) when the line came from the
catalog; **blank when typed manually — never guess a string**; filled in on the project side at PO
time.

**R5 — PO status: `draft · issued · closed`, partial issue allowed.** Today: `open | closed` only
(`20260711130000_module6_6d_material_deliveries.sql:94-95`).

**R6 — the material-run flow** (issue → tag members to lines → the run → landing → purchased lines
retire → office breakdown at review → close). Field staff enter ONE clumped number; office breaks it
down per line at review — deliberate, the person with the receipt is not the person who cares about
per-line cost.

**R7 — a flagged-missing line** notifies Owner, Admin and PM; the item stays open on the PO.

**R8 — the add-items sheet**: batch-pick, then price the batch in one pass; nothing written until
step 2 confirms; N rows land in ONE insert with ONE recalc (the PO-lines batch pattern,
`deliveries-client.ts:71`).

**Phase-2 rulings [Josh, 2026-08-29]:**

- **R-Q1 — the committed writer.** The committed `expenses` row's amount = **Σ de-marked-up cost of
  ISSUED lines**, with **one allocation per budget line touched** (the multi-allocation shape
  `set_po_total_amount`'s own tail already tolerates — `20260809000000_financial_rls_floor_part3.sql`,
  the `v_alloc_count > 1` branch). The hand-typed header total is **retired as an input** for
  line-bearing POs. Nothing on a draft line commits; partial issue commits exactly what was issued.
- **R-Q2 — the run expense's PO link is a NEW column, `expenses.source_po_id`.** THE SHARPEST EDGE
  OF THE MODULE: `recompute_budget_item_committed/actual`'s **origin predicate**
  (`money_representation.sql:826-834, 884-891`) classifies any expense with `purchase_order_id IS NOT
  NULL` as *being* the commitment — its allocations count committed (gross) and its money reaches
  `actual` **only through `expense_payments`**. Setting `purchase_order_id` on the run's receipt
  expense would double-commit and strand the actual. `source_po_id` is **not** in the predicate, so
  the run expense posts to actual on approval like any field expense.
- **R-Q3 — "any company member" means the five staff roles.** Subcontractors cannot log expenses
  (`expenses_insert` floor, `20260827000000`) — tagging one would create an assignment they cannot
  fulfil.
- **R-Q4 — the notification** is type `po_item_missing`, **Field chip + decision set**. It names a
  specific run's gap, not a stock posture (the `low_stock`-is-Money tiebreak cuts the other way here).
- **R-Q5 — per-line issue states.**
- **R-Q6 — favorites are company-wide.**
- **R-Q7 — v1 sources are catalog + manual only.** "From a sub bid" and "A past estimate" are out.
- **R-Q8 — assemblies are out for v1.**

**Late rulings [Josh, 2026-08-29, after Phase 2]:**

- **R-L1 — old POs are not updated.** New (line-bearing) POs derive their total from lines; existing
  POs keep their typed `total_amount`. **Some POs will therefore have a total that does not foot
  against their lines — accepted and deliberate.** The UI must tolerate a PO whose lines carry no
  cost: render the typed total and em-dashes, never zeros, never an error.
- **R-L2 — the RPC-stays-the-path property is preserved.** `s97ct-floor3.live.ts` §5 asserts a
  direct `purchase_orders.total_amount` UPDATE is blocked (the column-scope trigger,
  `financial_rls_floor_part3.sql:170-192`) and the RPC path works. The trigger **stays**; every new
  writer of `total_amount` runs inside an RPC that takes the same transaction-local
  `app.po_total` exemption. The test keeps passing **for the right reason** — the property, not a
  vacuous green.
- **R-L3 — PO numbers allocate at ISSUE, not draft** (resolves §S3), on the project/CO numbering
  scheme: a `next_po_number(project)` mirroring `next_co_number`
  (`20260704215000_module5_5d_change_orders.sql:275-310` — row-locked per-project sequence,
  `PO-{project digits}-{2-digit seq}`), backed by a new `projects.po_sequence integer DEFAULT 0`.
  A draft has no number; `po_number` stays nullable and legacy hand-entered numbers stand (R-L1).
- **R-L4 — issue offers BOTH vendor email and PDF download** (resolves §S4). Three facts
  established rather than assumed:
  1. **`subcontractors.email` exists** (verified, `database.ts` Row) — no new column is part of
     this module.
  2. **The PO email is a NEW template** (`lib/email/templates/po-email.tsx`). It leaves the
     building, so per the ruled email/PDF boundary (`desktop-redesign-spec.md` §2, build-log Entry
     5) it carries the **contractor's identity — `brandColor` and logo — not the platform's**; the
     `invoice-email.tsx` prop shape is the reference (tenant identity as data, platform grey
     chrome).
  3. **A PO with a typed `vendor_name` and no `vendor_id` has no address: the email option is
     UNAVAILABLE in that state** — disabled with the reason stated ("no vendor on file — assign a
     vendor to email this PO"), never offered-then-failed at send. A `vendor_id` whose row has a
     blank email gets the same treatment.

---

## §3 — What this module does NOT change

Stated plainly, because an earlier reading had it otherwise:

1. **Committed cost keeps its meaning and its mechanism (R2).** The same `expenses` row shape, the
   same origin predicate, the same recompute functions, the same stored-GROSS /
   derived-remaining split (`budget.ts:215` — remaining derived at read via `countsTowardCommitted` +
   `committedRemaining` from `payables-shared`). **Budget & Cost, the dashboard's portfolio rollup and
   `getPayablesSummary` read exactly what they read today.**
2. **`recompute_budget_item_actual/committed` and their origin predicate are untouched.** The module
   works *with* the predicate (that is what `source_po_id` is for), never edits it.
3. **`approve_expense` is untouched.** The office breakdown (R6.6) is UI plus the companion
   `mark_po_lines_purchased` RPC (§4.8); approval itself, the exact-sum guard, and the recompute
   trigger are as shipped (`20261035000000_stage5_expense_selection_shape.sql`).
4. **`convert_estimate_to_project()` is untouched.** PO drafting is a separate, post-conversion,
   optional drafting service (§4.8) — conversion cannot be broken by a PO bug, and "Skip POs" is
   simply not calling it.
5. **Deliveries stay quantity-only.** Check-in reconciles `qty_received/qty_damaged` and never posts
   cost, even now that lines carry `budget_item_id` (§5 trace 1 shows why cost posts exactly once,
   through the expense path). The field-capable check-in policy (no role gate,
   `module6_6d:560`) is unchanged.
6. **`project_budget_items.cost_code` stays the estimate category name** (the convert RPC's
   `c.name AS cost_code`). The new `cost_catalog.cost_code` is catalog display metadata; it does not
   compete for the budget key.
7. **Existing POs' data (R-L1).** No backfill of totals, no line-cost invention, no vendor-string
   dedup. Legacy `vendor_name` strings stay as typed.
8. **The estimate's per-field autosave, immutability (`canEdit = status==='draft'`), and
   `markup_percent` null-inheritance** — the sheet writes rows exactly as `rowInsertPayload` shapes
   them today, in a batch.

---

## §4 — Schema changes, each with its migration shape

One migration per numbered item unless noted. Every new table with `company_id` joins
**`test-support/company-purge.ts`'s `COMPANY_CHILDREN`**, **trial deletion's `COMPANY_TABLES`**
(`lib/trial/deletion.ts:141`) **in the same commit as its migration** — the `file_categories` trap
has now cost two sessions and the shared purge module exists precisely so the list goes stale in one
place.

### 4.1 `cost_catalog` — type, cost code, favorites

```sql
ALTER TABLE cost_catalog
  ADD COLUMN item_type text NOT NULL DEFAULT 'material'
    CHECK (item_type IN ('material','labor','subcontractor','equipment','other')),
  ADD COLUMN cost_code text,          -- display metadata ("06 — CARPENTRY"); no key derives from it
  ADD COLUMN is_favorite boolean NOT NULL DEFAULT false;  -- company-wide (R-Q6)
```

`item_type` powers 17a's left rail. Row-type mapping at add time: `material→material`,
`labor→labor`, `subcontractor→subcontractor`, `equipment/other→other` (the estimate's `row_type`
enum is NOT extended — `equipment` stays a catalog notion; an equipment line lands as an `other`
row, amount = qty × unit_cost). Vendor is only meaningful on material items; the sheet ignores
`default_vendor_id` for other types. Existing rows: all `material` (true today by construction).

### 4.2 `estimate_line_rows.vendor_id`

```sql
ALTER TABLE estimate_line_rows
  ADD COLUMN vendor_id uuid REFERENCES subcontractors(id);
-- estimate_line_rows_type_columns is REPLACED (its 20261025 form read in full):
--   material arm: vendor_id unconstrained (nullable);
--   labor / allowance / subcontractor / other arms: … AND vendor_id IS NULL.
```

Stamped from `cost_catalog.default_vendor_id` at pick time — **a snapshot**, like every frozen
figure in this platform: the catalog default can change later without rewriting history. Editable in
17b's row detail (vendor-type subs only); NULL for manual rows (R4's honest blank).

### 4.3 `purchase_orders` — vendor FK, provenance, status

```sql
ALTER TABLE purchase_orders
  ADD COLUMN vendor_id uuid REFERENCES subcontractors(id),  -- nullable; vendor_name kept for display + legacy
  ADD COLUMN source_estimate_id uuid REFERENCES estimates(id),
  ADD COLUMN need_by date,
  ADD COLUMN deliver_to text;
-- status: CHECK swapped to ('draft','issued','closed');
UPDATE purchase_orders SET status = 'issued' WHERE status = 'open';
```

⚠️ The `open → issued` rewrite is a **status relabel only** — no money column moves (R-L1 governs
money; an existing open PO with a committed total is semantically issued, and relabelling keeps the
auto-close trigger's target state meaningful). The auto-close reason-string mechanics
(`module6_6d:16-25`) are preserved; the trigger's close condition is reworked in §4.5's terms
(**§S1**).

### 4.4 `purchase_order_items` — cost, budget link, per-line lifecycle

```sql
ALTER TABLE purchase_order_items
  ADD COLUMN unit_cost numeric,                                   -- COST basis, per §1. Nullable: legacy lines have none (R-L1)
  ADD COLUMN budget_item_id uuid REFERENCES project_budget_items(id),
  ADD COLUMN source_line_row_id uuid REFERENCES estimate_line_rows(id),  -- provenance + "pull more" dedup
  ADD COLUMN line_status text NOT NULL DEFAULT 'draft'
    CHECK (line_status IN ('draft','issued','purchased','flagged')),
  ADD COLUMN flag_note text,
  ADD COLUMN flagged_at timestamptz,
  ADD COLUMN flagged_by uuid REFERENCES company_members(id);
UPDATE purchase_order_items SET line_status = 'issued'
  WHERE purchase_order_id IN (SELECT id FROM purchase_orders WHERE status = 'issued');
```

Line cost = `qty_ordered × unit_cost`. Category/subcategory on the PO render are **derived, not
stored**: `budget_item_id → project_budget_items.cost_code` for the category;
`source_line_row_id → line_item → subcategory` for the subcategory when estimate-born. `flagged` is
an OPEN state (R7 — the item stays on the PO); `purchased` retires the line from the open list.

### 4.5 Status semantics and the close condition

A PO is `draft` until its first line issues; `issued` while any line is `issued` or `flagged`;
eligible to close when **no line is outstanding** (every line `purchased`, or the remainder
explicitly cancelled via the existing manual close — Owner/Admin + reason, unchanged). The 6D
auto-close trigger (fills-by-usable-qty) is **reworked** to this condition for line-bearing POs and
left as-is for legacy POs (**§S1** — the trigger body must be read in full at build time before
editing; only its header was read in Phase 1).

### 4.6 `purchase_order_item_assignments` — NEW TABLE

```sql
CREATE TABLE purchase_order_item_assignments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id) DEFAULT get_my_company_id(),
  po_item_id  uuid NOT NULL REFERENCES purchase_order_items(id),
  member_id   uuid NOT NULL REFERENCES company_members(id),
  -- standard audit + soft-delete columns per the CLAUDE.md checklist,
  -- created_by/updated_by defaults, both update triggers
  UNIQUE (po_item_id, member_id)
);
```

The `project_assignments` shape (the closest shipped pattern), scoped to a line. Many-to-many by
construction; overlapping assignments are just multiple rows per item (R6.2). Staff roles only
(R-Q3) — enforced in the INSERT policy (`member_id`'s role ∉ subcontractor/client). RLS: SELECT for
project-viewers; INSERT/DELETE Owner/Admin/PM. **Joins the three purge lists in the same commit.**

### 4.7 `expenses.source_po_id` (R-Q2)

```sql
ALTER TABLE expenses ADD COLUMN source_po_id uuid REFERENCES purchase_orders(id);
```

**Deliberately absent from the origin predicate** — that is its entire point. A run expense carries
`source_po_id` (+ the existing `source_segment_id` when born from a material-run prompt), posts to
**actual** on approval, and never touches committed. A comment on the column says exactly this, and
§6's review UI uses it to find the PO whose lines are being reconciled.

### 4.8 RPCs

All `SECURITY DEFINER`-style in the `set_po_total_amount` family, each taking the `app.po_total`
exemption before writing `purchase_orders.total_amount` (R-L2):

- **`issue_po_lines(p_po_id, p_item_ids uuid[])`** — Owner/Admin/PM. Lines `draft → issued`
  (requires `unit_cost` and `budget_item_id` non-null on each); PO `draft → issued` on first issue,
  **allocating `po_number` via `next_po_number(project)` when null** (R-L3 — `projects` gains
  `po_sequence integer NOT NULL DEFAULT 0` in migration 4.3); `total_amount` := Σ non-draft line
  costs; then **`sync_po_commitment`**.
- **`sync_po_commitment(p_po_id)`** (internal) — maintains the committed `expenses` row per R-Q1:
  amount = Σ cost of `issued`+`flagged` lines; allocations grouped by `budget_item_id` (the
  multi-allocation shape); row created on first issue (`state='committed'`, `purchase_order_id`,
  `supplier = vendor name` — following today's row verbatim,
  `financial_rls_floor_part3.sql:213`). **The row follows the normal pending → approved review**, as
  today — only the 7C retainage row is system-approved inline (`7c_accounts_payable.sql:705-719`),
  and this spec does not extend that exception. When the open sum reaches zero the row is
  **closed out** (`closeout_reason 'All lines purchased'`) — `countsTowardCommitted` then removes it
  from every displayed committed figure (verified: `budget.ts` line-level derivation and the
  payables screens both gate on it).
- **`flag_po_item_missing(p_item_id, p_note)`** — callable by a member **assigned to that line**
  (the RLS on `purchase_order_items` UPDATE is O/A/PM, so field flagging needs this definer path);
  sets `flagged` + note + who/when; raises `po_item_missing` (§4.10); re-syncs.
- **`mark_po_lines_purchased(p_po_id, p_item_ids uuid[])`** — Owner/Admin (it is a review-time
  act); lines → `purchased`; re-syncs; closes the PO if nothing is outstanding.
- **`set_po_total_amount` is KEPT, for legacy POs only** — refuses a PO with any costed line
  (one guard added). `s97ct-floor3` §5 keeps passing on the real property: the trigger still blocks
  direct writes, and the RPC family is still the only path.

**And one plain client service, not an RPC** — `draftPosFromEstimate(projectId, groupBy)`: reads the
project's budget items (`source_line_row_id → estimate_line_rows.vendor_id` for the vendor key),
groups material-born lines by vendor / category / one-PO, batch-inserts `purchase_orders` (status
`draft`, `vendor_id`, `source_estimate_id`) + `purchase_order_items` (the `createPurchaseOrder`
batch shape, `deliveries-client.ts:71`). No definer powers needed: the caller is O/A/PM (the PO
INSERT policy set) and **drafts never write `total_amount`** — a draft PO's displayed total is
derived from its lines; the column is first written at issue, inside the RPC, under the trigger
exemption (R-L2). Idempotence: a line whose `source_line_row_id` already appears on a live PO of
this project is offered as already-drafted, not duplicated ("Pull more from the estimate" uses the
same dedup).

### 4.9 Batch add (R8)

`addEstimateLineRows(lineItemId, rows[])` in `estimate-items-client.ts`: shape each row via the
existing `rowInsertPayload` (the type-columns CHECK demands per-type shaping), **one
`.insert([...])`**, then `recalculateEstimateTotals` **once**, `reload()` **once**. Twelve rows:
1 insert + 1 recalc, versus today's 12 + 12 (verified: `items-tab.tsx:238` recalcs per row).

### 4.10 Notification type `po_item_missing`

Three registries move together (`notify.ts:92`'s own rule): the `notifications.type` CHECK
(successor migration to `20261027000000`), the `NotificationType` union, and
`lib/notify/categories.ts` — **Field chip + `DECISION_TYPES`** (R-Q4). Recipients: Owner, Admin, PM
(R7), via the `daily-log-missing` cron's recipient pattern; raised inline by
`flag_po_item_missing`, not by a cron.

---

## §5 — The workflow traces, with real numbers

### Trace 1 — catalog → estimate → PO → run → job cost

Catalog row: **2×4×8 SPF Stud**, `item_type material`, `unit_cost $4.25`/each, `cost_code
06 — CARPENTRY`, `default_vendor_id →` **Jones Lumber** (`subcontractors`, `sub_type='vendor'`).

| Hop | Money | Where it lands |
| --- | --- | --- |
| 17a pick | — | Tray only. **Nothing written** (R8). |
| 17b price: qty 120, markup 15%, tax off | cost **$510.00** · sell **$586.50** | Still nothing written. Footer: Cost $510.00 · Markup $76.50 · Adds to estimate $586.50. |
| Confirm | — | ONE insert: row `{unit_cost 4.25, quantity 120, markup_percent 15, vendor_id Jones, catalog_item_id …}`; ONE recalc. Estimate line `total` $586.50 (sell). |
| Convert | budgeted **$510.00** | `project_budget_items` (cost_code = the category name, "06 — Carpentry") + `project_budget_amounts.budgeted_amount 510.00` — the RPC's cost expression. **Markup is stripped here for the budget…** |
| Draft PO (18a, by vendor) | line 120 × $4.25 = **$510.00** | **…and here for the PO, by construction: the line reads `unit_cost`, and sell never appears on a PO** (§1). PO → Jones Lumber, `budget_item_id` set, `line_status draft`. Committed: **$0** — drafts commit nothing. |
| Issue (PM clicks) | commitment expense **$510.00**, pending | `issue_po_lines`: line `issued`, PO `issued`, `total_amount 510.00` (RPC-written under the trigger exemption). `sync_po_commitment` writes the committed row + one allocation ($510 → the Carpentry line). |
| Owner approves the commitment (review queue) | committed **$510.00** | `approve_expense` → recompute → `committed_amount 510` (stored, gross); displayed committed-remaining $510. "Against the estimate": ordered $510.00 of budgeted $510.00. |
| The run: Dave (crew) assigned to the line; buys at $524.30; logs ONE expense, receipt photo | actual expense **$524.30**, pending | `source_po_id` set (**never `purchase_order_id`** — R-Q2), `source_segment_id` from the material-run segment, allocation $524.30 → the Carpentry line. Flags nothing. |
| Review: office confirms, marks the line purchased, approves | actual **$524.30** · committed-remaining **$0** | `approve_expense` (unchanged) posts actual; `mark_po_lines_purchased` retires the line; `sync_po_commitment` drops the commitment to $0 and **closes it out** — `countsTowardCommitted` removes it from every committed display. **No double-count: the $510 promise left committed as the $524.30 actual landed.** |
| Close | — | No line outstanding → PO `closed`. Final: budgeted $510.00, actual $524.30, committed-remaining $0 — $14.30 over, visible as exactly that. |

QB: the approved run expense carries the `qb_*` stubs like every expense; 7G exports it when 7G
exists. Nothing new (R6.4's "as normal").

### Trace 2 — a partial run: three lines, two bought, one flagged

PO to Jones Lumber, issued lines: A $180.00 · B $95.00 · C $60.00 → commitment $335.00 (three
allocations if three budget lines; one if one).

- Dave is assigned to A, B, C. He buys A and B, is told C is on backorder.
- He logs **one clumped expense: $291.40** (receipt total; prices moved), `source_po_id` set, and
  **flags C**: `flag_po_item_missing(C, "on backorder at Jones until Tue")`.
- **The PO shows**: A, B still `issued` (purchase is a review-time determination), C `flagged` with
  the note, ordered $335.00, committed-remaining $335.00 (nothing approved yet).
- **The notification**: type `po_item_missing`, to Owner + Admin + PM — *"2×6×10 PT (C) flagged
  missing on PO-1902-01 — 'on backorder at Jones until Tue'"* — Field chip, decision set.
- **Review**: office opens the expense, sees the PO's lines via `source_po_id`, breaks $291.40 down
  — A $186.90, B $104.50 — adjusting allocations if A and B sit on different budget lines; marks A
  and B `purchased`; approves.
- **Landing**: actual +$291.40; `sync_po_commitment` → commitment amount $60.00 (C only) —
  committed-remaining $60.00. **C stays open on the PO** (R7); the PO stays `issued`; nothing
  auto-closes.

### Trace 3 — a manually-typed material line: no vendor until PO time

- 17c: "Custom iron railing, powder-coated", material, qty 1 × $850.00, markup 20%, **Save to
  catalog** unticked. `vendor_id NULL` — **the honest blank; no string is guessed** (R4).
- Estimate: cost $850.00, sell $1,020.00. Convert: budgeted $850.00.
- 18a: the line lands on the amber **"1 line has no vendor yet"** card — called out, not dropped.
  The office assigns **Smith Metalworks** (an existing vendor-type `subcontractors` row, or one
  created inline) → the line joins Smith's draft PO (or its own).
- Issue → commitment $850.00 pending → approved → committed. The run and landing proceed as trace 1.

---

## §6 — UI

**Screens and entry points:**

- **17a/17b/17c — the add-items sheet.** Entry: the estimate builder's Items tab — a "+ Add items"
  primary action replacing the per-row catalog fill (`catalog-picker.tsx` is superseded; the manual
  `addRow` dropdown remains for single quick rows). Sheet per the handoff's anatomy (1052px, pinned
  right, fixed action strip + totals footer, tray persistence, cascade selection). Left rail: the
  five `item_type` sources with counts + Type-it-manually (R-Q7 — no sub-bid / past-estimate
  sources; no Assemblies rail entry, R-Q8). Filter chips: All · Favorites (company-wide) · Used on
  this job (derived via `catalog_item_id` over this estimate's rows). **Roles: Owner/Admin/PM** —
  the builder route already redirects everyone else, and `cost_catalog` SELECT is floored to
  O/A/PM (`20261024000000:28-33`). Sheet is draft-only (`canEdit`), like every write on the builder.
- **18a — draft the POs.** A post-conversion screen offered from the convert success path (and
  reachable later from the project's Deliveries tab: "Draft POs from the estimate"), calling the
  §4.8 drafting service — **conversion itself is untouched** (§3.4). Group-by control: Vendor
  (default) · Category · One PO. Unassigned-vendor lines get the amber card. "Skip POs" = don't
  call it. Roles: Owner/Admin/PM (the PO INSERT policy set).
- **18b — the PO record** (existing route, `field-ops/[projectId]/deliveries/[poId]`). Gains: the
  line table with category headers and per-category cost subtotals; per-line status chips
  (draft/issued/purchased/flagged + note); provenance strip when `source_estimate_id` is set; the
  Issue action (O/A/PM) with "What happens on issue" copy — on success it offers **Email to
  vendor** (R-L4: enabled only when `vendor_id` resolves to a row with an email; otherwise disabled
  with the reason stated) and **Download PDF**; the assignment control (O/A/PM; staff members
  only); Need-by / Deliver-to fields. **Legacy POs (R-L1): lines without `unit_cost` render
  em-dashes, the typed `total_amount` stays the headline figure, and no footing row renders** — a
  total that doesn't foot against costless lines is stated as-is, never a zero, never an error.
- **"Against the estimate"** (18b right rail): per-category ordered-cost vs `budgeted_amount`.
  ⚠️ `project_budget_amounts` is **Owner/Admin-gated** at the DB (the Floor's side table), so the
  panel renders for **Owner/Admin only** and simply doesn't render for PM/foreman/crew — less, not
  nothing; ordered cost itself (the cost tier) stays visible to every project-viewer, exactly as
  today's committed total already is (`po-actions.tsx` display branch, verified).
- **The run, on `/m`.** No new tile — the ruled nine-tile set does not move. Two touch points:
  the project Deliveries surface lists **"your assigned lines"** for the signed-in member (open
  POs, lines they're tagged on, with a flag-missing control calling the §4.8 RPC), and the
  material-run expense capture gains an optional **"against PO …"** step when the member has
  assigned lines on that project — pre-fills supplier from the PO vendor, sets `source_po_id`, and
  asks R6.3's question: *"Did you get everything? Flag anything missing."* Capture stays ONE
  clumped amount (R6.6).
- **Review** (desktop expenses review popup): when the pending expense carries `source_po_id`, the
  popup shows the PO's issued lines with tick-to-mark-purchased and per-line amounts that must sum
  to the receipt total; approving runs `approve_expense` (unchanged) then `mark_po_lines_purchased`.
  Reviewers: Owner/Admin (the existing reviewer set).

**Nav placement:** no new nav items. Everything hangs off existing surfaces: the estimate builder,
the convert flow, project Deliveries, `/m` capture, the expenses review queue.

**Role summary:** sheet O/A/PM · draft/issue/assign O/A/PM · close/delete O/A (unchanged policy) ·
flag = assigned member (definer RPC) · run expense = the five staff roles (existing capture) ·
breakdown+purchase-marking O/A · PO cost figures readable by any project-viewer (the cost tier,
§1) · budgeted comparisons O/A only.

---

## §7 — Open `§S` items

- **§S1 — the 6D auto-close/reopen trigger body.** Only its header comments were read
  (`module6_6d:16-25, 287`). Before §4.5 reworks the close condition, the full body must be read —
  including the reopen-on-exact-string mechanic and its SECURITY DEFINER recompute path.
- **§S2 — the expenses review popup's exact integration point.** The per-line breakdown UI (§6)
  assumes the popup can host a PO-lines panel; the popup component was not read in Phase 1. Its
  allocation editor exists (capture-split reconciliation is referenced in `approve_expense`'s
  header); the wiring is design-time work, not a schema risk.
- ~~**§S3 — `po_number` allocation.**~~ **RESOLVED → R-L3** (allocate at issue,
  `next_po_number` on the CO scheme, `projects.po_sequence`).
- ~~**§S4 — vendor emailing on issue.**~~ **RESOLVED → R-L4** (both email and PDF at issue;
  `subcontractors.email` verified present; new contractor-identity template; email unavailable —
  never failing — without an addressable vendor).

---

## §8 — Explicitly out of scope

Assemblies (R-Q8) · per-user favorites (R-Q6 chose company-wide) · sub-bid / past-estimate sheet
sources (R-Q7) · 7G/QuickBooks (the run expense rides the stubs; §6b.7 owns the connector) ·
delivery-side cost posting (§3.5) · legacy `vendor_name` string dedup / migration (R-L1) ·
`equipment` as an estimate `row_type` (maps to `other`) · a company margin target, stored sell, and
everything else in `desktop-redesign-spec.md` §6b.

---

## §9 — Tests that move, and the ones that must not

- **`s97ct-floor3.live.ts` §5 — must keep passing non-vacuously (R-L2).** The column-scope trigger
  stays; `set_po_total_amount` stays callable (legacy arm). If the build changes its signature or
  guards, the test is re-pointed at the property (direct UPDATE blocked; RPC path works), never
  deleted.
- **`m-capture.spec.ts`** material-run assertions (segment types, project-required) — extended by
  the optional PO step, not inverted; the added step must be skippable so existing flows and
  assertions hold.
- **Deliveries/PO suites** (`s121-assignment-grant`, `s133-subcontractor-read-floor`,
  `desktop-payload`) touch `purchase_orders` fixtures — swept per S157 at build time; none asserts
  the open/closed status pair by name in what was read, but the sweep greps for `'open'` on PO
  fixtures before the status migration lands.
- **New tests owed by the build:** batch-add (N rows, one recalc — non-vacuous row count);
  issue/partial-issue committed sums; the R-Q2 predicate guard (a `source_po_id` expense must NOT
  move `committed_amount` — the exact regression this module's design exists to prevent); flag →
  notification; purchase → close-out; legacy-PO tolerance (typed total + costless lines renders).
