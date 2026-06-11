# SPEC — Sub-module 4B: Cost Catalog

> Source of truth: `docs/module4-architecture.md` §4.3 + §4.14.
> Conventions: `CLAUDE.md` (standard columns, per-tenant column defaults, standard triggers, RLS naming).
> Template: the 4A `create_contact_addresses` migration + `contacts-client.ts`.
> Status: design approved (Session 48). No open blockers — only two minor choices (B1, B2).

---

## Goal

A reusable, per-company library of materials with known unit costs, used when building detailed estimate line items in 4D. Searchable/filterable management UI at `/dashboard/catalog`.

---

## Decisions (locked)

- **Soft delete** (`is_deleted`); never hard delete. "Delete" = `UPDATE is_deleted = true, deleted_at = now()`.
- **RLS:** any authenticated company member can `SELECT`; `INSERT`/`UPDATE` restricted to Owner/Admin/PM (§4.13 "Manage cost catalog"). No hard-`DELETE` policy exposed.
- **`unit_of_measure` excludes `allowance`** — allowance is an estimate-time concept on a material row (4C/4D), not a catalog property.
- Catalog unit cost is **snapshotted** into estimates at add-time (a 4C/4D concern). Catalog edits never retro-change existing estimates.

---

## Schema — `cost_catalog`

Standard columns per CLAUDE.md (`id`, `company_id`, `created_at`, `updated_at`, `created_by`, `updated_by`, `is_deleted`, `deleted_at`), plus:

| Column            | Type                   | Notes                                                                                                                        |
| ----------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| name              | TEXT NOT NULL          |                                                                                                                              |
| category          | TEXT NOT NULL          | CHECK in (lumber, fasteners, electrical, plumbing, finishes, concrete, drywall, roofing, paint, hardware, insulation, other) |
| unit_of_measure   | TEXT NOT NULL          | CHECK in (each, sq_ft, linear_ft, box, bundle, bag, gallon, pair, set, other) — no `allowance`                               |
| unit_cost         | NUMERIC(12,2) NOT NULL |                                                                                                                              |
| default_vendor_id | UUID NULL              | REFERENCES subcontractors(id)                                                                                                |
| product_url       | TEXT NULL              |                                                                                                                              |
| last_verified_at  | TIMESTAMPTZ NULL       |                                                                                                                              |
| notes             | TEXT NULL              |                                                                                                                              |

- **Per-tenant column defaults** (CLAUDE.md checklist): `company_id` → `get_my_company_id()`, `created_by` → `auth.uid()`, `updated_by` → `auth.uid()`.
- **Triggers** (same migration): standard `updated_at` (shared fn from Migration 001) + per-table `updated_by`.
- **Indexes:** `idx_cost_catalog_company_id`, `idx_cost_catalog_category`.

---

## RLS policies — naming `{table}_{action}_{role}`

- `cost_catalog_select_authenticated` — company member, non-deleted rows in own company.
- `cost_catalog_insert_manager` — Owner/Admin/PM, company-scoped.
- `cost_catalog_update_manager` — Owner/Admin/PM, company-scoped (this path also serves soft delete).

Follow the `supabase-rls` skill / existing role-check pattern. No hard-`DELETE` policy.

---

## Service layer — `cost-catalog-client.ts`

Follow the `contacts-client.ts` pattern (NOT `company-client.ts` — pre-trigger holdover). Strict `Pick<>`-over-`Insert` input types (per 4A decision).

- `listCatalog(filters?)` — company-scoped, non-deleted, optional category + text filter, sorted by category then name.
- `getCatalogItem(id)`
- `createCatalogItem(input)`
- `updateCatalogItem(id, input)`
- `softDeleteCatalogItem(id)` — `UPDATE is_deleted = true, deleted_at = now()`

---

## Zod — `packages/shared/validation/cost-catalog.ts`

snake_case fields: `name`, `category` (enum), `unit_of_measure` (enum), `unit_cost` (positive number), `default_vendor_id?` (uuid), `product_url?` (url or empty string), `last_verified_at?`, `notes?`. Don't over-constrain free text.

---

## UI — `/dashboard/catalog`

- Categorized, scrollable list; text search + category filter.
- Add/Edit form; soft-delete with confirm.
- Owner/Admin/PM can manage. Foreman/Crew per decision B2.

---

## Build order (one step at a time)

1. **Migration** — table + per-tenant defaults + triggers + indexes + RLS → `npx supabase db push` (chains type regen + type-check).
2. **Service layer** (`cost-catalog-client.ts`).
3. **Zod schema** (`cost-catalog.ts`).
4. **Catalog UI** (`/dashboard/catalog`).
5. **Type-check → smoke test → scoped commits** (migration / service+schema / UI as separate commits).

---

## Acceptance checks

- Migration applies clean; `db:types` regenerates; `npx tsc --noEmit` passes from `apps/web/`.
- As Owner/Admin/PM: create, edit, soft-delete an item — it leaves the list but the row persists.
- As Crew: create/edit denied by RLS.
- Cross-tenant: company B cannot see company A's catalog.

---

## Open decisions (need Josh)

- **B1 — text search:** simple `ILIKE` on `name` (recommended for v1; catalogs are small) vs add a `pg_trgm` index. Defer trigram until proven slow.
- **B2 — catalog page for Foreman/Crew:** hidden from nav (recommended — they don't build estimates) vs visible read-only.
