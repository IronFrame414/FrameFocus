# SPEC — Sub-module 4C: Estimates Schema & Data Layer

> Source of truth: `docs/module4-architecture.md` §4.4–§4.14.
> Conventions: `CLAUDE.md`. Template: 4A migration + `contacts-client.ts`.
> Depends on: **4A** (`contact_addresses` FK) and **4B** (`cost_catalog` FK).
> Scope: all estimate tables + RLS + `companies` extensions + service/validation layer. **No UI** — that is 4D.
> Status: design drawn from architecture doc; **six decisions (D1–D6) need confirmation before build.**

---

## Tables (per §4.14)

All per-tenant tables get standard columns where noted, per-tenant column defaults, standard `updated_at`/`updated_by` triggers, a `company_id` index + FK indexes, and RLS — same as 4A/4B.

### `estimates` — soft delete

Standard columns + `is_deleted`/`deleted_at`, plus:

- `estimate_number` TEXT NOT NULL (generated, company-scoped — see **D5**)
- `name` TEXT NOT NULL
- `contact_id` FK contacts, `contact_address_id` FK contact_addresses
- `project_id` FK projects, nullable — **see D1 (projects table does not exist yet)**
- `parent_estimate_id` FK estimates nullable; `cloned_from_estimate_id` FK estimates nullable
- `status` CHECK (draft, review, sent, viewed, accepted, declined, expired, revised)
- `version_number` TEXT
- `tax_rate` NUMERIC; `subcontractor_markup_percent`, `material_markup_percent`, `labor_markup_percent` NUMERIC (copied from company defaults on create)
- `discount_type` CHECK (percent, fixed) nullable; `discount_amount` NUMERIC nullable
- `subtotal`, `tax_total`, `discount_total`, `grand_total` NUMERIC — **app-maintained (see "Totals")**
- `proposal_pricing_level` CHECK (total_only, category_totals, line_items)
- `cover_letter` TEXT nullable; `scope_of_work` TEXT[] nullable; `terms_sections` JSONB
- `expiration_days` INTEGER DEFAULT 30; `expires_at` TIMESTAMPTZ; `sent_at`, `viewed_at` (reserved/unused v1), `accepted_at`, `declined_at` TIMESTAMPTZ nullable
- `decline_reason_code` CHECK (too_expensive, chose_competitor, project_canceled, timing, scope_changed, other) nullable; `decline_reason_notes` TEXT nullable
- `signed_proposal_file_id` FK files nullable
- `created_by_role` TEXT (role captured at creation — drives review requirement); `reviewed_by` FK profiles nullable; `reviewed_at` TIMESTAMPTZ nullable

### `estimate_categories` — hard delete (no `is_deleted`)

id, company_id, estimate_id FK, name NOT NULL, sort_order NOT NULL + base audit columns.

### `estimate_subcategories` — hard delete

- category_id FK. Optional layer.

### `estimate_line_items` — hard delete

estimate_id, category_id, subcategory_id (nullable) FKs; name NOT NULL; description nullable; `line_type` CHECK (detailed, lump_sum); lump-sum: `sub_bid_amount`, `subcontractor_id` (winner, nullable); detailed: `labor_cost`, `material_cost_subtotal`, `tax_amount`; three nullable markup columns; `discount_type`/`discount_amount`; `total_price` (app-maintained); `notes`; `sort_order`.

### `estimate_line_materials` — hard delete

line_item_id FK; `catalog_item_id` FK cost_catalog nullable; name NOT NULL; `unit_of_measure` CHECK (…, allowance, other); `unit_cost`; `quantity` (ignored when allowance); `total_cost` (app-maintained).

### `estimate_sub_bids` — soft delete

estimate_id, line_item_id, subcontractor_id FKs; `bid_amount`; `bid_document_file_id` FK files nullable; `notes`; `is_winner` BOOLEAN DEFAULT false (**partial unique index: one `is_winner = true` per line_item**); `received_at`.

### `estimate_files` — hard-delete junction (no `is_deleted`)

estimate_id, file_id FKs; `attachment_type` CHECK (site_photo, plan, sub_bid, other); `notes` nullable; `sort_order`.

### `companies` — ALTER (add columns)

`estimate_number_prefix` TEXT DEFAULT 'EST'; `estimate_number_sequence` INTEGER DEFAULT 0; `default_subcontractor_markup_percent`, `default_material_markup_percent`, `default_labor_markup_percent` NUMERIC; `default_terms_sections` JSONB; `default_tax_rate` NUMERIC.

---

## Totals are application-maintained

`subtotal`/`tax_total`/`discount_total`/`grand_total` (estimates), `total_price` (line_items), `total_cost`/`tax_amount` (materials) are plain NUMERIC written by the service/UI layer and recomputed on every edit — **not** DB-generated columns, because the estimate totals aggregate across child rows, which generated columns can't reference. Formulas per §4.4a/§4.4b.

---

## RLS (summary — see D2/D4)

- **estimates SELECT:** Owner/Admin company-wide; PM only own (`created_by = auth.uid()`) — **D2**.
- **estimates INSERT:** Owner/Admin/PM. **UPDATE:** Owner/Admin/PM, Draft only (frozen once Sent — **D3**). **Soft delete:** Owner/Admin.
- **child tables:** company-scoped + `EXISTS` check that the parent estimate is visible to the caller — **D4**. Hard-delete tables get real `DELETE` policies (Owner/Admin/PM, draft only).

---

## Estimate numbering (see D5)

`next_estimate_number(company_id)` — atomic increment of `companies.estimate_number_sequence`, formatted with `estimate_number_prefix` → e.g. `BISHOP-001`. Recommended as a row-locking Postgres function called inside `createEstimate` for concurrency safety.

---

## Service layer — `estimates-client.ts` (+ children)

Follow `contacts-client.ts`. Key functions:

- `createEstimate(input)` — calls numbering fn; copies company default markups/tax/terms onto the estimate; sets `created_by_role`.
- `getEstimate(id)` (with children), `listEstimates(filters?)` (role-scoped), `updateEstimate(id, input)` (Draft-guard).
- category / subcategory / line-item / material / sub-bid CRUD.
- `setWinningBid(lineItemId, subBidId)` — transaction: flip `is_winner`, copy bid amount + subcontractor onto the line item.
- `softDeleteEstimate(id)`.
- Frozen-when-Sent guard enforced in service **and** RLS.

---

## Zod — `packages/shared/validation/estimate*.ts`

snake_case; enums mirror every CHECK constraint exactly.

---

## Build order (~2–3 sessions; one step at a time)

1. **Migration** — all tables + `companies` ALTER + numbering fn + RLS + triggers + indexes → `npx supabase db push`. **See D6 (single migration vs split).**
2. **Service layer** (estimates first, then children).
3. **Zod schemas.**
4. **Type-check → smoke test → scoped commits.** (No UI — 4D.)

---

## Acceptance checks

- Migration clean; types regen; `npx tsc --noEmit` passes.
- `createEstimate` yields `PREFIX-001`, increments per company, no collisions on repeated creates.
- PM sees only own estimates; Owner sees all; Crew none.
- Sent estimate rejects edits (service + RLS).
- Winning-bid flip works; partial unique index blocks two winners on one line.
- Cross-tenant isolation verified on every table.

---

## Open implementation decisions — need Josh before 4C build

- **D1 — `project_id` FK (IMPORTANT).** The `projects` table doesn't exist until Module 5, so the FK can't be created now. **Recommend:** add `estimates.project_id` as a nullable UUID with **no** FK constraint in 4C; add the FK constraint in the Module 5 migration. (Declaring the FK now would make the migration fail.)
- **D2 — PM visibility.** §4.13 says "own/assigned," but Module 4 has no assignment field. **Recommend** v1 = estimates the PM created (`created_by = auth.uid()`); add assignment later if needed.
- **D3 — frozen-when-Sent.** Enforce in both the service guard and the RLS UPDATE policy (`status = 'draft'`)? **Recommend both** (defense in depth).
- **D4 — child-table RLS.** Company-scope only, or company-scope **plus** an `EXISTS(parent estimate visible)` check? **Recommend** the EXISTS check for true isolation (more policies, but correct).
- **D5 — numbering mechanism.** Postgres function (recommended, concurrency-safe) vs service-layer transaction.
- **D6 — migration shape.** One migration for all of 4C (atomic — recommended) vs split (`companies` ALTER separate from the new tables).
