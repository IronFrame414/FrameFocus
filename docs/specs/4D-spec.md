# SPEC — Sub-module 4D: Estimate Builder UI (+ 4M Settings, 4K Clone, and additive 4C schema extensions)

> **Covers:** 4M (Company Settings) + 4D (Estimate Builder UI) + 4K (Clone from Existing) + additive migration block extending 4C's schema (added Session 48 after 4C had shipped).
> **Source of truth:** `docs/module4-architecture.md` §4.3–§4.16, with Session 48 interview deltas captured below.
> **Conventions:** `CLAUDE.md` (standard columns, per-tenant column defaults, standard triggers, RLS naming, trash-bin pattern).
> **Templates:** 4A migration + `contacts-client.ts` (service-layer pattern). 4B / 4C (spec format).
> **Depends on:** **4A** (contact_addresses), **4B** (cost_catalog), **4C** (all estimate tables + companies extensions). 4C MUST be merged to main before this build starts — the additive migration cannot apply otherwise.
> **Branch:** dedicated feature branch (suggested `feature/module-4-spec-1`). Do not commit to main.
> **Status:** design locked Session 48 interview. No open blockers. Two build-time questions reserved (see "Open build-time questions").

---

## Goal

Three coherent deliverables on one branch:

1. **4M — Estimating Settings.** New "Estimating" section in `/dashboard/settings` for Owner/Admin to manage estimate-number prefix, default pricing mode, six markup/margin defaults, default tax rate, and the structured terms-and-conditions array seeded into new estimates.
2. **4D — Estimate Builder UI.** Sidebar-tabbed page at `/dashboard/estimates/[id]` for building, editing, reviewing, and sending estimates. Inline-edit autosave throughout, sticky live-totals footer, dual markup/margin pricing model with toggle, sub-bid tracking with winner selection, full status workflow.
3. **4K — Clone from Existing.** "Clone" action on the estimates list AND on every open estimate. Creates a fresh Draft estimate pre-populated from a source, with new estimate number and lineage tracking.

Plus an additive migration block extending 4C's schema: three new columns on `companies`, two on `estimates`, one on `estimate_line_materials`, and a `estimate_number_sequence` DEFAULT change with one-time backfill.

---

## Decisions (locked Session 48 interview)

### Pricing model
- Two modes per estimate: `markup` and `margin`. A single toggle on the estimate switches all three buckets (subcontractor / material / labor) at once.
- **Equations:**
  - Markup, lump-sum: `total = sub_bid × (1 + sub_pct/100)`
  - Markup, detailed: `total = labor × (1 + labor_pct/100) + (material_subtotal + tax) × (1 + material_pct/100)`
  - Margin, lump-sum: `total = sub_bid / (1 − sub_pct/100)`
  - Margin, detailed: `total = labor / (1 − labor_pct/100) + (material_subtotal + tax) / (1 − material_pct/100)`
- **Margin cap:** 99.99% — Zod rejects ≥ 100.
- **Toggle behavior:** if a value (% or total override) has been modified away from the company default, it stays exactly as the user left it. If it's still at the active-mode company default, it swaps to the new-mode company default. Defaults are stored independently per mode — no translation.
- **Platform default mode:** `markup`. Per-company override in 4M settings.

### Numbering
- `companies.estimate_number_sequence` DEFAULT changes from `0` → `99`. One-time backfill of existing rows that are still `0`. Result: first estimate per company is `PREFIX-100`.
- Output format: `{PREFIX}-{sequence}`, sequence zero-padded to **3 digits minimum** (expands naturally at 1000+).
- Prefix validation: 2–25 chars, `A-Z` `0-9` `-`, auto-uppercased server-side, no leading/trailing/double dashes.
- Sequence is system-managed: read-only display in 4M settings. Atomic-increment Postgres function `next_estimate_number(company_id)` already ships in 4C.

### Tax
- Tax rate stored on companies (default) and estimates (override) — both from 4C.
- 2-decimal input precision in 4M (`7.00`).
- **New per-row flag:** `estimate_line_materials.apply_tax BOOLEAN DEFAULT true`. Each material row decides individually whether tax applies. Labor and lump-sum lines never see tax (unchanged from 4C).

### Terms editor
- `companies.default_terms_sections` (JSONB array of `{name, content}`) is shipped by 4C.
- 4M editor: repeating rows with up/down arrow reorder, name input (≤100 chars), multiline content textarea (no length cap), per-row remove with confirm. Plain text only — no rich formatting.
- Empty array allowed on save.
- Empty `content` allowed; 4E (Spec 2) will omit the section heading entirely when content is empty.
- **Seeded sections on company creation (4):** `Payment Terms`, `Warranty`, `Exclusions`, `Cancellation`.

### Settings UI
- Lives in a new "Estimating" section in `/dashboard/settings`.
- Owner + Admin only (per §4.13).
- Autosave: each field saves on blur, debounced ~1s. Empty input → NULL (server-normalized).
- Partial defaults allowed; 4D/4E will surface "no default set" warnings at estimate-creation time when relevant.

### Builder UI
- Page: `/dashboard/estimates/[id]` with persistent left sidebar:
  - Details / Items / Terms / Scope of Work / Bidding / Files (stub) / Cover Sheet / Notes
- Entry: `/dashboard/estimates/new` collects contact + address + name (+ optional clone source); on save redirects to the builder.
- Inline-edit UX everywhere: click cell → input. Enter or blur saves (autosave). Esc cancels. Pattern applies to all numeric and free-text editing.
- Sticky totals footer (subtotal / tax / discount / grand total) visible across every tab.
- Files tab: sidebar item renders, body is a disabled "File attachments coming soon" placeholder. No writes to `estimate_files` in this build. 4L proper stays out of launch scope.
- Notes tab: binds to new `estimates.internal_notes` column. Internal-only; never rendered on the proposal PDF.

### Status workflow
- Status action buttons live on the Details tab, right-side.
- **PM-created estimate:** PM sees "Submit for Review" while Draft → status `review`. Owner/Admin see "Approve & Send" on a `review` estimate → status `sent`.
- **Owner/Admin-created estimate:** sees "Mark as Sent" directly while Draft → status `sent`. Skips review.
- "Mark as Sent" / "Approve & Send" freezes the estimate (no edits while status ≠ `draft`). Enforced in BOTH the service layer AND the RLS UPDATE policy per 4C decision D3.
- Accepted / Declined / Expired transitions are Spec 2 surface concerns; only the underlying status field is writable by service-layer helpers here as needed.

### Delete
- "Delete estimate" lives in a three-dot menu on the Details tab.
- **Owner + Admin only** (per §4.13 — PM cannot delete).
- Soft delete (`is_deleted = true, deleted_at = now()`). Confirm modal required.

### Clone (4K)
- Entry: "Clone" row action on `/dashboard/estimates` list AND a "Clone this estimate" button on the open estimate's Details tab.
- Available on ALL statuses: Draft / Review / Sent / Accepted / Declined / Revised.
- Role-gated: Owner / Admin / PM (matches "Create estimate" per §4.13).
- Modal: pick new contact + address + new estimate name (default `Copy of [source name]`).
- On submit: new Draft estimate created, redirect to its builder. Source is never modified.
- **Snapshot pricing:** material `unit_cost` and other catalog-derived fields copy as-is from source. No refresh from current catalog. Manual re-pick from the catalog modal available in the builder if user wants updated prices.
- Populates `cloned_from_estimate_id` FK (already in 4C). No UI surface in v1 — for future analytics.
- Clone-of-a-clone works (chain via `cloned_from_estimate_id`).
- New estimate gets a fresh `estimate_number` from the company sequence — source's number is NOT reused.

#### What carries over (clone)
Categories, subcategories, line items, materials (with their `apply_tax` flag, markups, margins, discounts, allowance flag, etc.), line-level discounts, scope_of_work, cover_letter, terms_sections, estimate-level markups/margins/discount/tax_rate, pricing_mode.

#### What does NOT carry over (clone)
Contact, contact_address, status (always Draft), version_number (always v1.1), all timestamps, sub bids, signed proposal file, project_id, internal_notes, estimate_files attachments.

---

## Schema — additive migration block

Single migration file: `{timestamp}_module4_spec1_extensions.sql`. Additive only — no destructive changes. Standard CLAUDE.md conventions for new columns.

### `companies` — ALTER

```sql
ALTER TABLE companies
  ALTER COLUMN estimate_number_sequence SET DEFAULT 99;

-- One-time backfill: only companies that have NOT yet issued an estimate.
UPDATE companies
  SET estimate_number_sequence = 99
  WHERE estimate_number_sequence = 0;

ALTER TABLE companies
  ADD COLUMN default_pricing_mode TEXT NOT NULL DEFAULT 'markup'
    CHECK (default_pricing_mode IN ('markup', 'margin')),
  ADD COLUMN default_subcontractor_margin_percent NUMERIC NULL,
  ADD COLUMN default_material_margin_percent      NUMERIC NULL,
  ADD COLUMN default_labor_margin_percent         NUMERIC NULL;
```

### `estimates` — ALTER

```sql
ALTER TABLE estimates
  ADD COLUMN pricing_mode TEXT NOT NULL DEFAULT 'markup'
    CHECK (pricing_mode IN ('markup', 'margin')),
  ADD COLUMN internal_notes TEXT NULL;
```

### `estimate_line_materials` — ALTER

```sql
ALTER TABLE estimate_line_materials
  ADD COLUMN apply_tax BOOLEAN NOT NULL DEFAULT true;
```

### Pre-migration check (MUST run before writing the migration)

```bash
grep -rn "pricing_mode\|internal_notes\|default_pricing_mode\|apply_tax\|default_.*_margin_percent" \
  apps/ packages/ --include="*.ts" --include="*.tsx" \
  | grep -v "database.ts"
```

Expected: zero hits. Any pre-existing references mean Spec 1 was partially done before — pause and investigate before proceeding.

---

## RLS

**No new policies required.** All new columns are on tables (`companies`, `estimates`, `estimate_line_materials`) that already have full RLS coverage from earlier migrations. Existing policies — Owner/Admin-only UPDATE on `companies`, the 4C Draft-status guard on `estimates`, and child-table EXISTS checks — cover the new fields automatically.

Verify after migration:
- 4M settings UPDATE blocked for PM / Foreman / Crew (existing `companies` UPDATE policy already enforces).
- `estimates.pricing_mode` update blocked once status leaves Draft (4C decision D3 RLS policy enforces).

---

## Service layer

Follow the `contacts-client.ts` pattern. Strict `Pick<>`-over-`Insert` input types.

### `apps/web/lib/services/company-client.ts`

Extend the existing settings update path (or add explicit getter/setters) to cover the new fields:

```
estimate_number_prefix,
default_pricing_mode,
default_subcontractor_markup_percent, default_material_markup_percent, default_labor_markup_percent,
default_subcontractor_margin_percent, default_material_margin_percent, default_labor_margin_percent,
default_tax_rate,
default_terms_sections
```

Note: companies pre-trigger holdover (CLAUDE.md / S43) — `company-client.ts` still sets `updated_at` explicitly because the `companies_set_updated_by` trigger is missing. Continue that pattern; do NOT refactor it here (separate concern).

### `apps/web/lib/services/estimates-client.ts` (extending 4C)

New / extended functions:

- **`createEstimate(input)`** — extend to set `pricing_mode = company.default_pricing_mode`; the six %s are already copied per 4C.
- **`cloneEstimate(sourceId, input)`** — NEW. Single transaction:
  1. Fetch source estimate with all children (categories → subcategories → line_items → materials).
  2. Insert new estimate row with: contact/address/name from `input`, carry-over fields from source, fresh `estimate_number` via `next_estimate_number(company_id)`, `cloned_from_estimate_id = sourceId`, status `draft`, version `v1.1`, all timestamps NULL, `internal_notes` NULL.
  3. Recursively insert children with new IDs, re-pointing FKs.
  4. Do NOT copy `estimate_sub_bids`, `estimate_files`, `signed_proposal_file_id`, `internal_notes`.
- **`markAsSent(estimateId)`** — set `status = 'sent'`, `sent_at = now()`, `expires_at = now() + interval '1 day' * expiration_days`. Service-layer Draft-status guard. Role: Owner/Admin only.
- **`submitForReview(estimateId)`** — set `status = 'review'`. Service-layer Draft-only. Role: PM (only on their own estimates).
- **`approveAndSend(estimateId)`** — Owner/Admin reviewing a PM submission. Sets `reviewed_by`, `reviewed_at`, then proceeds with `markAsSent` logic. Service-layer Review-only.
- **`softDeleteEstimate(id)`** — `is_deleted = true, deleted_at = now()`. Owner/Admin only (service-layer role check on top of RLS).
- **`updatePricingMode(estimateId, newMode)`** — atomic. Loads estimate + all line items. For each value (estimate-level %s, line %s, line totals): if the active-mode % equals the active-mode company default, swap to new-mode default; otherwise preserve. Total overrides preserved as-is. Writes the new mode and updated %s in a single transaction. Triggers a full totals recompute at the end.

### `apps/web/lib/services/estimate-line-materials-client.ts` (extending 4C)

- Service layer continues to compute `tax_amount` on line item save. The sum now only includes material rows where `apply_tax = true`. Allowance rows ignore quantity; tax applies to `unit_cost` only when `apply_tax = true`.
- Material CRUD already in 4C — extend Zod input to accept `apply_tax`.

### Helpers

- **`recomputeEstimateTotals(estimateId)`** — already a 4C concern; ensure it respects `pricing_mode` (selects markup vs margin equation per bucket) and `apply_tax` per material row.
- **`nextEstimateNumber(companyId)`** — already in 4C (Postgres function). No change.

---

## Zod — `packages/shared/validation/`

snake_case throughout; enums mirror every CHECK constraint exactly.

### Extend `company-settings.ts` (or wherever today's company settings schema lives)

```
estimate_number_prefix: regex /^[A-Z0-9](?:[A-Z0-9-]{0,23}[A-Z0-9])?$/ (server normalizes to uppercase first); 2–25 chars; no leading/trailing dash; no consecutive dashes.
default_pricing_mode: enum ['markup', 'margin']
default_subcontractor_markup_percent: number ≥ 0, ≤ 1000, optional (NULL allowed)
default_material_markup_percent: same
default_labor_markup_percent: same
default_subcontractor_margin_percent: number ≥ 0, < 100 (cap 99.99), optional
default_material_margin_percent: same
default_labor_margin_percent: same
default_tax_rate: number ≥ 0, ≤ 100, 2-decimal precision, optional
default_terms_sections: array of { name: string (≤ 100), content: string }, optional, default []
```

### New / extend `estimate.ts` (4C)

Add: `pricing_mode: enum ['markup', 'margin']`, `internal_notes: string optional`.

### Extend `estimate-line-material.ts` (4C)

Add: `apply_tax: boolean default true`.

### New: `clone-estimate.ts`

```
{
  source_estimate_id: uuid,
  contact_id: uuid,
  contact_address_id: uuid,
  name: string (≥ 1, ≤ 200)
}
```

---

## UI

### `/dashboard/settings` — Estimating section (4M)

Single section below existing settings. Owner/Admin only — PM/Foreman/Crew don't see it.

Layout sketch:

```
ESTIMATING
  Estimate number
    Prefix:               [ BISHOP    ]      ← inline validation; auto-uppercase
    Next number will be:  BISHOP-100         ← read-only computed

  Pricing mode
    Default for new estimates:  ( ) Markup   ( ) Margin

  Default markups (%)
    Subcontractor:  [ 20.00 ]
    Material:       [ 15.00 ]
    Labor:          [ 25.00 ]

  Default margins (%)
    Subcontractor:  [ 16.67 ]
    Material:       [ 13.04 ]
    Labor:          [ 20.00 ]

  Default tax rate (%)
    [ 7.00 ]

  Default terms & conditions sections
    [▲▼] [Payment Terms]                  [✕]
        ┌──────────────────────────────┐
        │ ...                          │
        └──────────────────────────────┘
    [▲▼] [Warranty]                       [✕]
        ┌──────────────────────────────┐
        │ ...                          │
        └──────────────────────────────┘
    [+ Add Section]
```

Components (likely):
- `EstimatingSettingsForm.tsx` (server-component shell + client form)
- `PrefixInput.tsx` (auto-uppercase, regex validation, debounced autosave)
- `PercentInput.tsx` (shared between markup, margin, tax rate)
- `TermsSectionsEditor.tsx` (JSONB array, add/remove/reorder, autosave)

Behavior:
- Every input autosaves on blur, debounced ~1s.
- Validation errors surface inline; an invalid value blocks save for that field only.
- Successful save shows a subtle confirmation indicator (match existing patterns in `/dashboard/settings`).

### `/dashboard/estimates/new` (4D entry)

Small form:
- Contact picker (typeahead) — required
- Address picker (filtered by selected contact) — required
- Estimate name — required
- Clone from existing? — optional dropdown of past estimates (when selected, routes through `cloneEstimate` instead of `createEstimate`)
- "Create Estimate" button

On submit: creates the estimate (with all company defaults seeded), redirects to `/dashboard/estimates/[id]`.

### `/dashboard/estimates/[id]` — builder (4D)

Persistent left sidebar (per Session 48 screenshot):

```
< Back
─────────
[•] Details
[ ] Items
[ ] Terms
[ ] Scope of Work
[ ] Bidding
[ ] Files          (disabled — Coming soon)
[ ] Cover Sheet
[ ] Notes
```

Page header: estimate name + estimate number + status badge + status-action button (right side).
Sticky footer: subtotal / tax / discount / grand total — visible across every tab.

#### Details tab
- Editable: name, contact (changeable while Draft), address, expiration_days
- Pricing-mode toggle (markup / margin) with confirm dialog if any line items exist on the estimate
- Estimate-level markup OR margin overrides per bucket (3 fields, interpreted by current `pricing_mode`)
- Whole-estimate discount: type (percent / fixed) + amount
- Status field display + action button (varies by role and current status)
- Three-dot menu: Delete estimate (Owner/Admin only — soft delete, confirm modal)

#### Items tab
The core builder.
- List of categories with optional subcategories underneath.
- Category row: inline-editable name, `+ Add Subcategory`, `+ Add Line`, trash icon (confirm modal — hard delete).
- Subcategory row: inline-editable name, `+ Add Line`, trash icon.
- Line item:
  - `+ Add Line` opens a small dropdown: "Lump Sum" or "Detailed"
  - Lump-sum: name (inline), description, `sub_bid_amount`, sub markup or margin % (per mode), optional sub winner indicator (set via Bidding tab), total (override-editable), optional discount row, notes
  - Detailed: name, description, `labor_cost`, labor %, material rows below (table: name, unit, qty, unit_cost, apply_tax checkbox, allowance flag if `unit_of_measure = 'allowance'`), material %, computed `tax_amount` (read-only), total (override-editable), optional discount row, notes
- "Catalog" button on any material row: opens picker modal (search + category filter). Selecting an item fills name / unit / unit_cost; quantity defaults to 1; user can still edit any field.
- Allowance UX: when material `unit_of_measure = 'allowance'`, quantity field hides; `unit_cost` relabels to "Allowance amount."

Empty state: "No categories yet — + Add your first category"

#### Terms tab
- Editor identical to 4M's terms editor, bound to `estimates.terms_sections`. On first open of a new estimate, populated from the company default; user can edit freely thereafter without affecting the company default.

#### Scope of Work tab
- Bullet list editor bound to `estimates.scope_of_work` (TEXT[]). Add / remove / reorder bullets. Plain text.

#### Bidding tab
- Grouped by lump-sum line item across the entire estimate. Each group shows:
  - Line name + current `sub_bid_amount`
  - List of `estimate_sub_bids` rows for that line: subcontractor, `bid_amount`, optional `bid_document_file_id` (see Open build-time question Q1), `received_at`, notes, `is_winner` radio
  - "+ Add Sub Bid" button
- Selecting a winner is atomic: flips `is_winner` (partial unique index in 4C enforces single winner per line), copies `bid_amount` and `subcontractor_id` onto the parent `estimate_line_items` row.

#### Files tab
- Disabled placeholder body: "File attachments coming soon."
- Sidebar item renders so the navigation skeleton is locked in for future 4L work.

#### Cover Sheet tab
- Multiline textarea bound to `estimates.cover_letter`.

#### Notes tab
- Multiline textarea bound to `estimates.internal_notes`. Internal-only.
- Warning text above the textarea: "Internal notes. Never shown on the proposal."

### `/dashboard/estimates` (list page — 4K entry point)

Existing list page (from 4C or built here): add a "Clone" action per row (overflow menu or button). Triggers the clone modal.

### Clone modal (4K)

```
Clone "Bishop Kitchen Reno"
────────────────────────────
Source estimate:   Bishop Kitchen Reno (BISHOP-101)

New contact:       [ contact picker, required ]
New address:       [ address picker (filtered by contact), required ]
New estimate name: [ "Copy of Bishop Kitchen Reno" ]

[ Cancel ]   [ Create Clone ]
```

On Create: calls `cloneEstimate()`, navigates to the new estimate's builder.

---

## Build order (one step at a time)

Multi-session build. Branch off `main` AFTER 4C lands.

1. **Pre-flight: verify 4C is on main.** `git log --oneline main` and confirm 4C's migration + service files are present. Do not start otherwise.
2. **Pre-migration grep** (see "Pre-migration check" above) — expect zero hits.
3. **Migration:** write `{timestamp}_module4_spec1_extensions.sql` containing every ALTER + the backfill UPDATE. Apply via `npx supabase db push` (chains type regen + type-check).
4. **Type regen verified;** `npx tsc --noEmit` clean from `apps/web/`.
5. **Companies service / Zod extensions** — backend for 4M.
6. **`/dashboard/settings` Estimating section** — 4M UI. Smoke test: save and reload all defaults; verify Owner/Admin-only access; verify partial-defaults save as NULL.
7. **Estimates service / Zod extensions** — `pricing_mode`, `internal_notes`, `markAsSent`, `submitForReview`, `approveAndSend`, `softDeleteEstimate`, `updatePricingMode`.
8. **Materials Zod / service extension** — `apply_tax` field; tax recompute respects it.
9. **`/dashboard/estimates/new`** — entry form + create flow.
10. **`/dashboard/estimates/[id]` shell** — sidebar nav, Details tab, sticky totals footer, status-action button wiring.
11. **Items tab (core builder)** — categories + subcategories + line items + materials; inline-edit autosave; catalog picker; allowance UX; pricing-mode toggle with sticky-value behavior; per-line and whole-estimate discounts.
12. **Terms / Scope of Work / Cover Sheet / Notes tabs** — straightforward bound editors.
13. **Bidding tab** — sub-bid CRUD; winner selection atomic flip + line-item field copy.
14. **Files tab** — placeholder body only.
15. **Status workflow** — Owner/Admin direct send; PM submit → Owner approve & send; frozen-when-Sent verified in service layer AND RLS.
16. **Delete estimate** — Owner/Admin only, three-dot menu, confirm modal.
17. **Clone (4K)** — modal + service function; entry from list page AND builder Details tab.
18. **Final type-check + acceptance run + scoped commits.**

### Commits (proposed scope — one logical concern per commit)

Josh handles `git commit` and `git push`.

1. Migration + types regen
2. 4M settings service / Zod / UI
3. Estimates service / Zod extensions (pricing_mode, internal_notes, status transitions, soft delete)
4. Materials service / Zod (apply_tax)
5. Estimates `/new` entry form
6. Builder shell + Details tab
7. Items tab (core builder)
8. Terms / Scope / Cover Sheet / Notes tabs
9. Bidding tab
10. Files tab placeholder
11. Status workflow + delete
12. Clone (4K) modal + service

---

## Acceptance checks

Run from `apps/web/` before merge. Order matters — schema, then 4M, then 4D, then 4K.

### Schema
- 1. Migration applies clean.
- 2. `db:types` regenerates; `npx tsc --noEmit` passes.
- 3. `companies.estimate_number_sequence = 99` on the Bishop row.
- 4. All new columns present and queryable; pre-migration grep still clean.

### 4M
- 5. Owner: save all eight new defaults — values persist across reload.
- 6. Owner: save with three markup %s NULL — NULLs persist.
- 7. Owner: edit prefix to lowercase `bishop` — saved value is `BISHOP`.
- 8. Owner: try prefix `B` (1 char) — rejected.
- 9. Owner: try prefix `BISHOP--CO` — rejected.
- 10. Owner: switch default pricing mode markup → margin — value persists.
- 11. Owner: add a terms section, reorder via arrows, remove one — array updates correctly in DB.
- 12. PM: navigate to settings — Estimating section is not editable / not present.
- 13. Cross-tenant: company B Owner cannot see company A's defaults.

### 4D builder
- 14. Owner: create new estimate at `/dashboard/estimates/new` — redirects to `/[id]`; `estimate_number = PREFIX-100`; `pricing_mode = company default`; six %s + tax rate + terms_sections all seeded from company.
- 15. Add a category, subcategory, detailed line item with two materials — line totals compute correctly per markup equations.
- 16. Edit one material's `unit_cost` inline — autosaves; line total recomputes; estimate totals recompute.
- 17. Pricing-mode toggle with no lines yet — switches without confirm.
- 18. Pricing-mode toggle with one line at default sub markup AND another line whose material % has been edited — first swaps to default margin, second preserves its % (recalculation now uses margin equation on that value).
- 19. Pricing-mode toggle with a total-override on a line — total stays exactly the same after toggle.
- 20. Set a material's unit to `allowance` — quantity field hides; label changes to "Allowance amount."
- 21. Toggle `apply_tax` off on one taxable material — parent line's `tax_amount` drops to exclude that material's contribution.
- 22. Add a per-line discount (5% on a $1000 line) — line total drops by $50.
- 23. Add a whole-estimate fixed discount $100 — grand_total drops by $100.
- 24. Add a sub bid to a lump-sum line in Bidding tab; mark it as winner — `line_item.sub_bid_amount` and `subcontractor_id` update.
- 25. Add a second sub bid to the same line; mark it as winner — first row's `is_winner` flips false (partial unique index enforces); line_item updates to the new winner's bid.
- 26. Owner: click "Mark as Sent" — status moves to `sent`, `sent_at` set, `expires_at` computed.
- 27. After Sent: try to edit a field — RLS rejects and/or UI gates it; an error surfaces.
- 28. PM: create new estimate, click "Submit for Review" — status moves to `review`.
- 29. Owner: open the PM's review estimate, click "Approve & Send" — `reviewed_by` / `reviewed_at` set, status moves to `sent`.
- 30. Owner: three-dot menu → Delete estimate → confirm — soft-deleted, removed from list.
- 31. PM: three-dot menu on a Draft estimate they created — no Delete option visible (and direct call denied if attempted).
- 32. Sticky totals footer visible on every tab; updates as fields change.
- 33. Files tab shows "Coming soon"; clicking does not error.
- 34. Notes tab textarea persists `internal_notes`; warning text present.
- 35. Cross-tenant: company B PM cannot fetch or open company A's estimate by direct URL.

### 4K (clone)
- 36. From the list: Clone an Owner-created Sent estimate → modal opens with default name `Copy of [source]`.
- 37. Submit clone with new contact / address → new estimate at `PREFIX-101`, status `draft`, version `v1.1`, all timestamps NULL, `cloned_from_estimate_id` set to the source.
- 38. Open the clone — categories / subcategories / lines / materials all carry over.
- 39. Verify `internal_notes` is empty in the clone (not copied).
- 40. Verify Bidding tab is empty in the clone (no sub bids carried).
- 41. Change a material's `unit_cost` in the cost catalog AFTER step 37; re-open the clone — material's `unit_cost` still shows the snapshotted value (proof of snapshot semantics, not refresh).
- 42. Source estimate is unchanged: status, timestamps, line items all untouched.
- 43. Clone the clone — works; `cloned_from_estimate_id` points to the clone, not the original.

---

## Open build-time questions

Deferred to build time — not blocking spec approval.

- **Q1 — Sub-bid PDF upload in Bidding tab.** The Files tab is stubbed, but the Bidding tab's sub-bid rows include `bid_document_file_id` per 4C. Two options at build:
  - (a) Allow upload via a standalone file picker on the sub-bid row (writes to Module 3 `files`, attaches via `estimate_sub_bids.bid_document_file_id`). 4L stays stubbed elsewhere.
  - (b) Defer the upload UX entirely until 4L lands; render the field as read-only / disabled.

  **Recommendation: (b)** — clean line with the Files-tab-is-stubbed decision. Sub-bid documents come online when 4L does.

- **Q2 — Inline-edit autosave error UX.** When an autosave fails (network blip, validation reject), do we (a) toast + revert silently, (b) toast + leave the dirty state with a retry, or (c) something else? Decide at the inline-edit component build.

  **Recommendation: (b)** — never silently lose user input.

---

## Cross-module dependency map (for the record)

- **4M outputs feed 4D:** prefix, pricing_mode, six markup/margin %s, tax_rate, terms_sections seeded into every new estimate.
- **4D writes feed Spec 2 (4E):** cover_letter, scope_of_work, terms_sections, line items + materials + sub bid winners, totals, discount fields → all consumed by proposal rendering.
- **4D status workflow feeds Spec 2 (4F):** `sent` is the precondition for e-signature send.
- **4D status workflow feeds Spec 2 (4J):** in-app 3-day reminder fires on `sent_at` not followed by `accepted_at` / `declined_at`.
- **4K depends on 4D:** clone uses every CRUD path 4D establishes.
- **Module 5 (Projects) will read accepted estimates:** the data model (especially `estimate_line_items.total_price` aggregates) is what becomes project budgets at conversion.

— End of spec —