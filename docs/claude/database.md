# docs/claude/database.md

> Database patterns and conventions, generated types, and the service layer, in full, with the SQL templates. Verbatim from CLAUDE.md (main `80e15bad`).
> **Nothing here was rewritten.** CLAUDE.md carries the operative statement and links here.


<!-- CLAUDE.md lines 194–206 -->

## Database Patterns

**RLS-bypassing helper functions for triggers.** When a trigger on `auth.users` (or any table) needs to query an RLS-protected table, the trigger runs in a context where `get_my_company_id()` and similar helpers return NULL — meaning RLS filters out every row. The working pattern:

1. Create a `SECURITY DEFINER` **SQL** function (not plpgsql) that does the query
2. Call that function from the trigger

SQL functions with `SECURITY DEFINER` reliably bypass RLS in this context. See `get_invitation_for_signup()` (Migration 015) and `get_invitation_by_token()` (used by the invite acceptance page) for working examples.

**Why SQL and not plpgsql:** plpgsql `SECURITY DEFINER` functions still hit RLS in some trigger contexts. SQL `SECURITY DEFINER` functions bypass reliably. When in doubt, use SQL.

---


<!-- CLAUDE.md lines 380–400 -->

## Generated Types Workflow

`packages/shared/types/database.ts` is auto-generated from the live Supabase schema. All service files import from this — never hand-write database type shapes. After every migration that adds, removes, or renames a column or table, run:

```bash
npm run db:push
```

This chains `supabase db push`, `npm run db:types`, and `npm run type-check`. Commit the updated `database.ts` alongside the migration.

**Two patterns for service types:**

- **`Pick<>`** when the query selects specific columns (`select('col1, col2')`). Reference: `apps/web/lib/services/company.ts`.
- **`Omit<Row> + intersection`** when `select('*')` AND the table has CHECK-constrained columns (e.g., `status`, `contact_type`, `sub_type`, `role`). The intersection re-narrows the loose `string` from the generator back to a string literal union. References: `apps/web/lib/services/contacts.ts`, `subcontractors.ts`.

**Rule:** always preserve string literal unions on CHECK-constrained columns. The Supabase generator can't see CHECK constraints; it emits `string`. Restore the union via intersection rather than using the loose `string`.

**Client files re-export, never redefine.** In `*-client.ts` files, use `import type { Foo } from '@/lib/services/foo'; export type { Foo };`. Never redefine types already in the server service file. Reference: `apps/web/lib/services/company-client.ts`.

---


<!-- CLAUDE.md lines 411–537 -->

## Database Conventions

**Multi-tenancy:** Every table has a `company_id` column. All queries are filtered by company via RLS policies.

**Row-Level Security:** Enabled on ALL tables. No exceptions. Every policy uses a `get_my_company_id()` helper function that reads company_id from the user's profile.

**Storage RLS policies: use inline subqueries, not helper functions.** `get_my_company_id()` works correctly in RLS policies on regular tables in the `public` schema. It does NOT work in `storage.objects` policies — in that context the helper silently returns NULL, which makes the policy match nothing and causes uploads/reads to fail with permission errors that appear unrelated to the policy logic.

Use an inline subquery against `profiles` instead:

```sql
(storage.foldername(name))[1]::uuid = (SELECT company_id FROM profiles WHERE id = auth.uid())
```

`(storage.foldername(name))[1]` extracts the first folder segment of the object path, which by convention is the `company_id` (e.g., `{company_id}/project-id/filename`). Reference implementations: migration 013 (company-logos bucket) and migration 017 (project-files bucket, Session 11) both use this pattern.

**Naming conventions:**

- Tables: `snake_case`, plural (e.g., `contacts`, `estimates`, `line_items`)
- Columns: `snake_case` (e.g., `company_id`, `created_at`, `updated_by`)
- Foreign keys: `{referenced_table_singular}_id` (e.g., `contact_id`, `project_id`)
- Indexes: `idx_{table}_{column}` (e.g., `idx_contacts_company_id`)
- RLS policies: `{table}_{action}_{role}` (e.g., `contacts_select_authenticated`)

**Standard columns on every table:**

```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
company_id      UUID NOT NULL REFERENCES companies(id)
created_at      TIMESTAMPTZ DEFAULT now()
updated_at      TIMESTAMPTZ DEFAULT now()
created_by      UUID REFERENCES auth.users(id)
updated_by      UUID REFERENCES auth.users(id)
is_deleted      BOOLEAN DEFAULT false        -- soft delete, never hard delete
deleted_at      TIMESTAMPTZ
```

**Per-tenant table column-defaults checklist.** Every new per-tenant table migration must include three column defaults so client-side INSERTs pass RLS without the caller manually setting these fields:

```sql
ALTER TABLE {table_name} ALTER COLUMN company_id SET DEFAULT get_my_company_id();
ALTER TABLE {table_name} ALTER COLUMN created_by SET DEFAULT auth.uid();
ALTER TABLE {table_name} ALTER COLUMN updated_by SET DEFAULT auth.uid();
```

Without these, the client INSERT sends `company_id = NULL`, RLS checks `NULL = get_my_company_id()` → false, and the insert fails with a 403 that doesn't obviously point to the missing default. Migration 022 (`tag_options`) was a fix for this exact miss on first attempt; Migration 018 (`files`) caught it during build. Get the defaults in on the first migration that creates the table.

**Standard triggers on every per-tenant table.** Every per-tenant table needs two BEFORE UPDATE triggers so `updated_at` and `updated_by` advance correctly on every UPDATE. Both must be installed in the same migration that creates the table, not added later.

```sql
-- 1. updated_at — reuses the shared function from Migration 001. Do NOT redefine it.
CREATE TRIGGER {table_name}_updated_at
  BEFORE UPDATE ON {table_name}
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 2. updated_by — per-table function, created in the same migration as the table.
CREATE OR REPLACE FUNCTION set_{table_name}_updated_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER {table_name}_set_updated_by
  BEFORE UPDATE ON {table_name}
  FOR EACH ROW EXECUTE FUNCTION set_{table_name}_updated_by();
```

**Naming convention:** trigger names are `{table_name}_updated_at` and `{table_name}_set_updated_by`. The per-table function is `set_{table_name}_updated_by()`. Confirmed across `tag_options`, `companies`, `profiles`, `files`, `contacts`, `subcontractors`, `contact_addresses`.

**Service-layer contract:** because these triggers exist, service code MUST NOT set `updated_at` or `updated_by` explicitly in update payloads. Mirror the comment style used in `contacts-client.ts`:

```typescript
// BEFORE UPDATE trigger `{table}_set_updated_by` handles updated_by.
// updated_at is handled by the existing updated_at trigger.
const { error } = await supabase.from('{table}').update(updates).eq('id', id);
```

Without the triggers, `updated_at` and `updated_by` never advance after the original INSERT — a silent data-quality bug that won't surface until an audit needs the timestamps.

**Reference implementations:** Migration 018 (`files`), Migration 023 (`tag_options`), Migration 028 (`contact_addresses`).

**Known holdover:** `companies` table is missing `companies_set_updated_by` and `company-client.ts` sets `updated_at` explicitly. Pre-trigger pattern. Tracked in TECH_DEBT.md — do not copy this file's pattern when building new tables.

**Append-only audit log exception.** A narrow category of tables are pure append-only logs — rows are written once and never updated or deleted. These tables intentionally OMIT the following standard columns: `updated_at`, `created_by`, `updated_by`, `is_deleted`, `deleted_at`. They also have NO UPDATE or DELETE RLS policies — only SELECT (scoped appropriately) and INSERT.

Columns present on an append-only log: `id`, `company_id` (where per-tenant), `created_at`, plus whatever domain-specific fields the log captures.

Current examples:

- `ai_tag_logs` — per-call cost tracking for GPT-4o vision auto-tagging (Module 3H, Session 30).
- `trial_emails` — one row per email address that has used a free trial.

Use this pattern for any future table that is a pure event log or audit trail. If the table ever needs to be edited or soft-deleted after insert, it is NOT an append-only log — use the standard columns above instead.
**Cost-column precision and audit-log FK behavior.** Two conventions for any table that stores money or references rows that may be deleted later:

- **Cost columns use `NUMERIC(10,6)`.** Six decimal places preserves sub-cent values like a $0.00382 GPT-4o call. `NUMERIC(10,2)` rounds to zero and silently destroys cost-tracking data. Reference: `ai_tag_logs.estimated_cost` (Migration 023).
- **Audit-log FKs to deletable rows use `ON DELETE SET NULL`, not `ON DELETE CASCADE`.** When an audit log references a row that can be permanently deleted (e.g., `ai_tag_logs.file_id` references `files.id`, and files have a permanent-delete path for owner/admin), `CASCADE` would erase the cost record along with the file. `SET NULL` preserves the cost row with the FK nulled out, keeping the financial trail intact. Default to `SET NULL` for any append-only log FK; only use `CASCADE` when the log row genuinely makes no sense without the parent.

**Trash-bin pattern.** Soft deletes only. Never hard delete records.

- RLS policies do not filter on `is_deleted`. Filtering is enforced in the service layer, not in RLS. This is deliberate: a restore-from-trash flow must be able to read soft-deleted rows without requiring a separate RLS policy to expose them.
- `get{Entity}s()` (the list function) filters `is_deleted = false` by default so deleted rows never appear in normal listings.
- `get{Entity}(id)` (single-row fetch by id) does **not** filter `is_deleted`. It must return soft-deleted rows so a restore flow can fetch a deleted record by id before un-deleting it.
- A separate `getTrash()` (or `listDeleted()`) function filters `is_deleted = true` to power the trash UI.

Reference implementation: `apps/web/lib/services/files.ts` (Module 3, Session 13) is the canonical example of all three functions.

---

## Service Layer Pattern

Server and client Supabase clients must be in separate files to avoid Next.js build errors (`next/headers` cannot be imported in client components).

**Pattern for each data entity:**

- `lib/services/{entity}.ts` — Server-side functions (imports from `@/lib/supabase-server`). Used in server components and page.tsx files. Contains read operations (getAll, getById).
- `lib/services/{entity}-client.ts` — Client-side functions (imports from `@/lib/supabase-browser`). Used in `'use client'` form components. Contains write operations (create, update, delete).
- Client components must use `import type { ... }` when importing interfaces from server service files.

**Current service files:** see [STATE.md](STATE.md) → "Codebase State" for the annotated active list. Convention: future add-on flags (e.g., `ai_marketing_enabled`) belong in `add-ons.ts`, not `company.ts`.

**Lazy initialization:** Stripe client (`getStripe()`) and Supabase admin client (`getSupabaseAdmin()`) use lazy init to prevent build-time crashes. All API routes must use these.

---
