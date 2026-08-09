# Module 8 — Inventory & Tools: Architecture

> Status: architecture only (Session 88). Sub-module specs come later, each behind
> its own interview round. Traces below are founder-approved (S88) and go into
> specs verbatim as acceptance examples.

## 1. Scope

Shop material stock, tool tracking, and consumables. "Shop" is the term everywhere
(never "warehouse").

Out of scope: heavy equipment (none owned; rentals stay in 6B equipment-hours free
text), job-site material (M6/daily logs), purchasing/ordering workflow (notify only).

## 2. Approved traces (acceptance examples)

### 2a. Material — leftover from a job

Intake: Casey clears the Hendricks job, drives 14 sheets of 5/8" drywall to the
shop, Rack B. Creates item on phone: name "5/8 drywall 4x8", qty 14, location
"Rack B" (free text), source job Hendricks, photos (item, item-in-location;
multiple photos allowed, receipts attachable). Price blank — office enters
$18.50/sheet later.
Removal: Pat takes 8, reason Project -> Alvarez (other reasons: Trash, Donate).
Record: who, when, qty, reason/project. Budget write: Alvarez budget gets a line,
8 x $18.50 = $148. Trash/Donate write no budget line.
Unpriced removal: budget line is created and FLAGGED; Owner/Admin must add price,
which backfills the line.
Zero-out: qty hits 0 -> item leaves active inventory; history preserved.

### 2b. Tool

One record per tool, no quantity. Name, price, multiple photos (incl. receipts),
current location, movement history. Price visible to ALL staff (deliberate — crew
sees replacement cost).
Movement: sign-out and transfer are the same action: who, when, from -> to.
Locations: Shop, any Project, Miscellaneous (approved personal borrow), Out for
Repair (selecting it requires a text field: where it's being repaired). Shop is
just another location — no separate check-in flow. Anyone can sign out; anyone
can move a tool job-to-job.
Output: searchable list, current location + last mover, full movement history.

### 2c. Consumable

A material item PLUS: low-stock threshold (per item) and vehicle locations
(consumables live at the shop, on sites, and in trucks). Use is logged (item, qty,
where), signs to a project, and hits the project budget like a material removal.
Qty crossing the threshold fires a notification to Owner, Admin, PM.

## 3. Data model direction (spec-time detail, direction only)

- inventory_items: name, type (material|tool|consumable), qty (null for tools),
  location (free text + reserved values Shop / Out for Repair / Misc), repair_note,
  price, source_project_id, low_stock_threshold (consumables), standard columns.
- inventory_movements: append-only — item, who, when, qty, reason
  (project|trash|donate|transfer|use), from/to, project_id, budget-line ref.
- Photos via M3 storage conventions; multiple per item; receipts are photos.
- All per-tenant, RLS per shared conventions, member_id for people references.

## 4. Locked rules

1. Removal requires a reason: Project, Trash, or Donate (materials/consumables).
2. Priced project removals write a project budget line; unpriced ones write a
   flagged line that Owner/Admin must price (backfill).
3. Tool/material prices are cost basis — visible to all staff; no conflict with
   FINANCIAL_RLS_FLOOR (which hides sell/contract/margin, not cost).
4. Shop is a location, not a mode; no check-in workflow.
5. Zeroed items leave active inventory, history kept.

## 5. Dependencies & hooks

Inbound (already built/specced):

- 6B daily-log material_used / material_needed / notes are free text; any M8
  structuring is an additive migration (6B spec 37, 81-85, 160, 176).
- 6B equipment-hours: structured tool-catalog FK is a deliberate later
  enhancement (6B spec 164).
- 6D delivery discrepancy -> return flag stored now, consumed by M8 (return
  flows to the SHOP, not site inventory).
  Outbound:
- M8 -> M7: budget writes land in project budget mechanism. Decided at spec time
  against built M7; entangled with the open project_budget_items cost/sell/profit
  gap. FLAG: do not spec 8A until that gap's resolution is known.
  Sequencing gates:
- Cross-cutting Notifications system (sidebar item w/ unread count, 30-day
  retention, delete, star-to-save, mobile push) is its OWN build, sequenced
  BEFORE M8 launch. M8 low-stock alert is a consumer, not the owner.
- Nav placement (sidebar item for Inventory, and the Notifications item) is
  deferred to the FFNav reindex owned by the 6B UI work (Session 87). Flagged,
  not decided here.

## 6. Sub-module split (PROPOSED, not decided)

- 8A Materials & Consumables (items, removals, budget writes, low-stock)
- 8B Tools (records, movements, out-for-repair)
  Rationale: 8A carries the M7 budget dependency; 8B has none and could build first
  if M7 timing slips.

## 7. Open questions for spec time

1. Exact M7 budget table/mechanism for M8 writes (see gap above).
2. Vehicle locations: free text or a defined vehicle list?
3. ~~Low-stock notification: fire once per crossing, or repeat?~~ — **ANSWERED [S89, founder-approved; flagged back S123].**
   **Fire on threshold crossing, then repeat WEEKLY while the item stays below threshold; reset when
   restocked above.** Recipients: Owner, Admin, PM (§2c, unchanged).
   Authority: [`notifications-architecture.md`](notifications-architecture.md) §2 R8.
   _(S89 answered this and promised a flag-back to this file, which then lived on another branch;
   the flag-back was never made and this question sat open for 12 sessions. Made S123.)_
   **How M8 consumes it:** call `notify()` — M8 does **not** write notification rows itself. The
   `low_stock` type is **already reserved** in that spec's §4 enum, so M8 lands as a consumer with
   **no schema change** to the notifications tables. Note that the notifications spec **cut the
   low-stock trace from its own v1** (ND-16) purely because M8 has no tables yet to bind a quantity
   or threshold figure to — the decision above is unaffected and is what M8 builds against.
4. Who may edit price after the fact (Owner/Admin only, or office role)?
5. Misc-borrow "approval": recorded approval step, or honor-system label?
