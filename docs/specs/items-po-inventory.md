# Add-items sheet & PO conversion — feasibility inventory (READ-ONLY)

> Feasibility facts for five **new** screens (`17a`–`17c` add-items sheet; `18a`–`18b` PO
> conversion + record). **Nothing designed, nothing changed.** Every claim carries a path; a line
> number where it is one line.

**Branch:** `main` · **HEAD:** `1718c24 merge: client portal reopen spec, canonical seed spec (S175 items 8)`
Baseline `main`, working tree clean.

## ⚠️ Two headline feasibility facts, up front

1. **PO lines carry no money.** `purchase_order_items` = `description · qty_ordered · unit · sort_order` — **no cost, no sell, no category, no budget-item link** (`database.ts` PO-items Row; `deliveries-client.ts:71-79`). The only money on a PO is a single PO-level `total_amount`, entered by hand, which commits as one lump against **one** budget line via `set_po_total_amount`. The design's per-line, de-marked-up, per-category PO does not exist in any form today.
2. **The estimate carries no vendor on a material line.** `cost_catalog.default_vendor_id` → `subcontractors(id)` exists, but a *material estimate row* (`estimate_line_rows`) has **no vendor column**. `purchase_orders.vendor_name` is **free text, no FK**. So "group POs by vendor" and "draft material lines into POs by vendor" have **no vendor key to group on** at either end.

---

## PART A — the add-items sheet (`17a`–`17c`)

### A1 · `cost_catalog` columns & specifics

**Full column list** (`database.ts` cost_catalog Row): `id, company_id, name, category, unit_of_measure,
unit_cost, default_vendor_id, product_url, last_verified_at, notes, created_at/by, updated_at/by,
is_deleted, deleted_at`. **The catalog is material-only** — its enums are a materials domain, with no
labor/sub/equipment concept.

| # | Question | Finding |
| --- | --- | --- |
| 1 | **Favorites / starred** | **Absent.** No `favorite`/`starred`/`is_favorite` on `cost_catalog` (nor per-user). `is_favorite` exists only on the `files` table — unrelated. |
| 2 | **Cost code** (`06 — CARPENTRY`) | **`cost_catalog` has NO cost_code. PO lines have NO cost_code.** The only `cost_code` column in the schema is on **`project_budget_items.cost_code`** (nullable, `database.ts:5386`), populated at conversion **from the estimate CATEGORY name** (`convert_estimate_to_project`, `20261025000000:305,329` — `c.name AS cost_code`, `c` = `estimate_categories`). So the mockup's cost code on catalog rows and estimate rows is **not stored on either** — it exists only as the category name that becomes a budget-item cost_code post-conversion. |
| 3 | **Type** (Material·Labor·Sub·Equipment·Other·Assemblies) | **`cost_catalog` has no type/kind column at all.** It has `category` = a **materials domain** enum: `lumber, fasteners, electrical, plumbing, finishes, concrete, drywall, roofing, paint, hardware, insulation, other` (`cost-catalog-client.ts:6-18`). **`equipment` is absent** — from both this and the estimate `row_type` enum. The catalog cannot today distinguish Labor/Sub/Equipment/Assembly items. |
| 4 | **Unit of measure** | **Enum (CHECK), not free text:** `each, sq_ft, linear_ft, box, bundle, bag, gallon, pair, set, other` (`cost-catalog-client.ts:20-30`). |

### A2 · Concepts that may not exist

| # | Concept | Verdict | Evidence |
| --- | --- | --- | --- |
| 1 | **Assemblies** (saved multi-item group) | **Absent** | No `assembl*` table anywhere. `cost_catalog` items are flat/ungrouped. (Selections bundle options, but that is not a catalog assembly.) |
| 2 | **"Used on this job"** filter | **Derivable, not stored** | Join `estimate_line_rows.catalog_item_id` (FK → `cost_catalog`) filtered to this estimate's rows. No stored flag; a query only. |
| 3 | **Catalog usage counts** | **Absent as code; derivable** | No view/column/RPC. Two FKs feed it: `estimate_line_rows.catalog_item_id` and `selection_options.catalog_item_id`. Shape would be `COUNT` over both keyed on `catalog_item_id`. (A count was reportedly ruled onto the Cost Catalog list screen — the implemented query, if any, lives there, not read here; see UNKNOWNS.) |
| 4 | **"Optional" per line** | **Absent** | No `optional`/`is_optional` on `estimate_line_items` or `estimate_line_rows`. |
| 5 | **Description vs internal note** | **Both exist — at LINE-ITEM level, not row level** | `estimate_line_items.description` (client-facing, **printed** — `items-tab.tsx:654`) and `estimate_line_items.notes` (internal, **never printed** — `items-tab.tsx:712`). **`estimate_line_rows` has only `name`** — no per-row description or note. The mockup's per-row Description/Internal-note maps to the LINE ITEM. |
| 6 | **Lump-sum rows** (amber caution) | **Not a stored state** | No "lump sum" flag. Two real shapes: (a) a `subcontractor`/`other` **row** carries a single `amount` with no qty/unit (`items-tab.tsx:314-345`); (b) a **line** with `total_price_override` and no cost rows — the "flat-priced line" the convert preflight catches (`convert-to-project.tsx:88`, `20261025000000:345-356`). Amber-tinting would key on one of those, not on a stored state. |
| 7 | **"Save this to the cost catalog"** from a manual row | **Absent as a path** | `createCatalogItem` exists (`cost-catalog-client.ts:98`) but nothing calls it from an estimate row. An estimate row can **reference** a catalog item (`catalog_item_id` FK) but creating a row never writes back to `cost_catalog`. |

### A3 · Batch write

| # | Question | Finding |
| --- | --- | --- |
| 1 | **Add-a-row path — one insert or batch?** | Estimate side is **one insert per row**: `createEstimateLineRow` = single `.insert(rowInsertPayload(input))` (`estimate-items-client.ts:399-404`). **No batch RPC for estimate rows.** (Contrast — POs *do* batch: `createPurchaseOrder` inserts all lines in one `.insert([...])`, `deliveries-client.ts:71-79`. That is the reference pattern a batch sheet would want.) |
| 2 | **Recalc per insert?** | **Yes, per row, today.** `items-tab.tsx addRow` calls `mutate(fn, /*recalc*/ true)` (`:238`), which runs `recalculateEstimateTotals(estimate.id)` — an RPC (`estimate-items-client.ts:602`) — then `reload()` after **each** row. **A batch of 12 rows on the current path = 12 inserts + 12 recalc RPCs + 12 full reloads.** A batch sheet must insert N, then recalc **once**. |
| 3 | **RLS / trigger friction for multi-row insert** | `estimate_line_rows` INSERT is gated to Owner/Admin/PM **and** the estimate must be `status='draft'` (immutability). `company_id/created_by/updated_by` have column defaults, so a bare multi-row insert passes RLS. The catch: **`estimate_line_rows_type_columns` CHECK** enforces which columns are legal per `row_type` (e.g. no `catalog_item_id` on an allowance, `items-tab.tsx:278-281`) — a mixed-type batch must shape each row to its type (what `rowInsertPayload` does today). No trigger blocks a multi-row insert. |

---

## PART B — purchase orders (`18a`–`18b`)

### B1 · The vendor problem

1. **`purchase_orders` full columns** (`database.ts` PO Row): `id, company_id, project_id, po_number
   (nullable), vendor_name (NOT NULL), ordered_at (date, nullable), status, total_amount (nullable),
   author_member_id, closed_by, closed_reason, created_at/by, updated_at/by, is_deleted, deleted_at`.
   **No need-by date, no deliver_to, no source_estimate_id.**
2. **`vendor_name` is free text with no FK** (`deliveries-client.ts:62`, `po-form.tsx:106-113`).
   **Grouping POs "by vendor" today keys on the raw string** — `deliveries.vendor_name` likewise.
   "Jones Lumber" and "Jones lumber" are two vendors.
3. **A vendor entity DOES exist — inside `subcontractors`.** `subcontractors.sub_type` CHECK =
   `('subcontractor', 'vendor')` (`20260101000000_baseline_schema.sql:1526`). Suppliers are
   `sub_type='vendor'` rows. `cost_catalog.default_vendor_id` → `subcontractors(id)`
   (`baseline_schema.sql:2617`).
4. **But `purchase_orders` cannot point at it** — there is **no `vendor_id`/`subcontractor_id`
   FK on `purchase_orders`**, only the free-text `vendor_name`. So the entity exists and the catalog
   uses it, yet POs and deliveries do not. Grouping-by-vendor as designed would need a new FK.

### B2 · PO structure

| # | Question | Finding |
| --- | --- | --- |
| 1 | **PO line items** | Table **`purchase_order_items`**: `id, company_id, purchase_order_id, description, qty_ordered, unit (nullable text), sort_order, audit, soft-delete`. Quantity-only. |
| 2 | **Category/subcategory on PO lines; link to budget item** | **None.** PO lines carry **no category, no cost_code, no `budget_item_id`, no FK to `project_budget_items`.** **Nothing links a PO line to a budget item today.** The only PO→budget link is at the **PO level**, via `set_po_total_amount`'s single `p_budget_item_id` (below) — one allocation for the whole PO, not per line, not per category. |
| 3 | **Need-by / deliver-to / source estimate** | **None of the three** on `purchase_orders`. Only `ordered_at` (order date). Delivery dates live on `deliveries.delivery_date`. No estimate linkage on a PO at all. |
| 4 | **PO status — draft vs issued?** | **No.** Status CHECK = **`open` \| `closed`** only (`20260711130000_module6_6d_material_deliveries.sql`; `deliveries.ts:15`). There is **no draft/issued** state and no "issue" action. Auto-close when every line is filled by usable qty; manual close is Owner/Admin + required reason (`po-actions.tsx:161-231`). |
| 5 | **"Committed on issue" mechanism** | Not tied to issuing. **Entering the PO total IS the commitment** (`po-actions.tsx:14-17`): `set_po_total_amount(po, amount, budget_item_id)` (auth Owner/Admin/PM, `20260809000000_...part3.sql:213`) sets `purchase_orders.total_amount` **and upserts an `expenses` row `state='committed'`** (`cost_category='material'`, `purchase_order_id`, `supplier=vendor_name`) allocated to the chosen budget line (or a Miscellaneous line). `recompute_budget_item_committed` then sums approved/committed expense allocations into **`project_budget_items.committed_amount`** (`20260730010000_money_representation.sql:867-902`), fired by a trigger on `expense_allocations`. |

### B3 · The basis rule (estimate = cost+sell; PO = cost, de-marked-up)

| # | Question | Finding |
| --- | --- | --- |
| 1 | **Do PO lines store cost / sell / both?** | **Neither.** PO lines are `qty_ordered`/`unit`/`description` only. The single money figure is PO-level `total_amount` (the committed lump). There is no per-line cost and no per-line sell anywhere on a PO. |
| 2 | **De-markup helper (sell → cost)?** | **None.** Markup is forward-only: `allowance_effective_markup_percent` resolves a %, applied as `sell = round(qty*cost*(1+m/100),2)` (`20261030000000_selection_markup_snapshot.sql`). No inverse RPC. The estimate→budget path never de-markups — it computes **cost directly** from rows (`rate*qty`, `unit_cost*qty`, `amount`; `20261025000000:305-326`), so a de-marked-up cost basis already lands in `project_budget_amounts.budgeted_amount` at conversion, without a reusable helper. |
| 3 | **Per-category budgeted cost available?** | **Yes — `project_budget_amounts.budgeted_amount` (cost basis) exists** (confirmed present in `database.ts`; Owner/Admin-gated 1:1 side table off `project_budget_items`). ⚠️ It was **not** dropped — the *old* `project_budget_items.budgeted_amount` was **moved** here (CLAUDE.md Financial Floor status table; `20260817000000`). Budget items carry `cost_code` (= estimate category name) and `source_line_row_id`. **Roll-up by category** = `GROUP BY project_budget_items.cost_code, SUM(project_budget_amounts.budgeted_amount)` — **no existing view/RPC does this**; it would be new. |

### B4 · The conversion step

| # | Question | Finding |
| --- | --- | --- |
| 1 | **Does `convert_estimate_to_project()` create POs? Where would a 3rd step hook?** | **Creates no POs — confirmed** (`20261025000000:151-416`; carries budget items, winning sub bids → `subcontractor_contracts`, `client_contracts`, `contract_documents`, assignments; **no `purchase_orders` insert**). The RPC is one plpgsql `SECURITY DEFINER` function = **one transaction**; a PO-drafting step would slot after the budget-item loop (`:369`) and, for atomicity, would have to run **inside** that transaction. ⚠️ **But there is no vendor to group by** — material rows have no vendor column (B1), so "draft by vendor" has no source key at conversion. |
| 2 | **Post-conversion "pull from the estimate" into a PO?** | **No such path.** POs are built by hand in `PoForm` (typed description/qty/unit; `po-form.tsx`). Estimate line rows are never linked to POs; there is no importer, and no `source_line_row_id`/estimate reference on `purchase_order_items`. |
| 3 | **Delivery check-in posts cost back to the budget line?** | **No.** Deliveries are **quantity reconciliation only** (`qty_received`, `qty_damaged`; `deliveries.ts:65-91`) — no money on delivery lines, no delivery→budget trigger. FK chain that **exists**: `delivery_items.po_item_id` → `purchase_order_items.id` → `purchase_orders.id`. But `purchase_order_items` has **no `budget_item_id`**, so the chain **dead-ends before the budget item**. Budget commitment is expense-driven at the **PO level** (`set_po_total_amount`), never delivery-driven. |

---

## PART C — cross-cutting

### C1 · N+1 already present

- **PO list:** `getPurchaseOrders` = one query for POs+items, one for deliveries, rollup in memory — **no N+1** (`deliveries.ts:94-120`).
- **Latent fan-out:** the estimate add-row path is **N inserts + N recalc RPCs + N reloads** for N rows (A3.2) — the exact cost a batch sheet exists to remove.
- `BudgetLineSelect` fetches budget lines once per `PoTotalControl` mount — minor.

### C2 · Money reaching a non-Owner/Admin role

- **`cost_catalog` is floored to Owner/Admin/PM** (`cost_catalog_select_manager`, `20261024000000:28-33`) — **foreman/crew cannot read the catalog** (so the add-items sheet is inaccessible to them; no `unit_cost` leak there).
- **POs/deliveries are NOT role-floored** — `purchase_orders_select_visible` / `deliveries_select_visible` = `company_id = get_my_company_id() AND can_view_project(project_id)` (`20260711130000_...:478,553`). **The PO detail page renders the committed `total_amount`** (`fmtUsd` + "committed") **to any project-viewer, including foreman/crew** — the page gate is only `if (!profile)` (`[poId]/page.tsx:44`), and `PoTotalControl`'s `hideAmounts` gates **only the budget-line picker in edit mode** (`po-actions.tsx:40-41,100-114`), not the displayed total. `project_budget_items.committed_amount` is likewise foreman/crew-readable (`20260912000000_subcontractor_project_read_floor.sql`). This matches the DB Floor (committed = readable by all roles) but **sits oddly against `budgetColumnsFor()` gating foreman to actual-only** on the budget screen — flagged, not judged. Ordered-vs-usable bars are **quantity only** (no $).

### C3 · What a batch-add sheet would replace / bypass

- **`catalog-picker.tsx`** — supersedes it. Today it fills **one existing material row** (name/unit/unit_cost); a batch sheet multi-selects and adds many.
- **`items-tab.tsx` `addRow`/`addRowDropdown`** — bypasses the one-insert-one-recalc-per-row loop (`items-tab.tsx:193-240, 722-741`).
- **Does NOT touch** `PoForm`/PO creation — `18a` (estimate lines → POs) has **no code today**; it is net-new, not a restyle of an existing flow.

---

## UNKNOWNS (and what was tried)

| # | Unknown | What was tried |
| --- | --- | --- |
| 1 | Whether a PO total can be **split across multiple** budget lines, or is always one. `set_po_total_amount` takes a single `p_budget_item_id` and its comment says it "keeps the single allocation in step" — reads as **one allocation per PO total**. A sub-agent speculated a multi-split `po_budget_allocation` table; I found no such table (allocations are `expense_allocations`). Did not read the full RPC tail to rule out a second allocation path. |
| 2 | The **implemented catalog usage-count query** (reportedly ruled onto the Cost Catalog list screen). Confirmed the FKs and the derivable shape; did not open the list screen to see if a query/RPC is already wired. |
| 3 | Whether a given **foreman/crew actually reaches a specific PO** — depends on `can_view_project` (project assignment), whose membership logic I did not enumerate. The RLS *permits* it for any project-viewer; the render definitely shows the total if they load the page. |
| 4 | Exact **`expenses` / `expense_allocations` column lists** — inferred from `set_po_total_amount` and `recompute_budget_item_committed` bodies, not dumped from `database.ts` in full. |
