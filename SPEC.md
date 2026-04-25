# SPEC.md — Sub-module 4A: contact_addresses table + primary-address refactor

> **Module 4 sub-module:** 4A
> **Reference:** docs/module4-architecture.md §4.14 (data model), §4.16 (build order)
> **Decision (Session 42):** Option A — schema migration + primary-address-only UI. Multi-address UI deferred to 4D.
> **Test data note:** Existing contacts have throwaway test data only. No data migration needed; address columns can be dropped without preserving values.

---

## Goal

Move contact addresses from columns on the `contacts` table into a separate `contact_addresses` table. Existing contact UI continues to show and edit a single primary address. Multi-address management UI is NOT in scope for this sub-module.

---

## Scope

### In scope

1. New `contact_addresses` table (migration + RLS + indexes + column defaults + standard triggers per CLAUDE.md "Standard triggers on every per-tenant table").
2. Drop address columns from `contacts` (no data preservation — confirmed test data only).
3. Regenerate `packages/shared/types/database.ts` after migration.
4. New service files for `contact_addresses` CRUD (server + client pair).
5. Update existing `contacts.ts` / `contacts-client.ts` select strings and create/update payloads to remove address column references. (The `Contact` type itself uses `Omit + intersection` over the auto-generated Row, so no manual type edits are needed — the regenerated `database.ts` removes the dropped columns from the Row automatically.)
6. Update `contact-form.tsx` to read/write the primary address via the new service instead of inline columns. UI looks identical to today.
7. Update `contacts-list.tsx` and any other caller currently reading `contact.address_*` to fetch the primary address via a join or follow-up query.
8. Update Zod validation schemas in `packages/shared/validation/` if any contact schema currently includes address fields. See "Validation schemas" section below.
9. Type-check passes (`npm run type-check`) and dev server runs clean.

### Out of scope (do NOT do in 4A)

- Multi-address UI on contact detail page (deferred to 4D).
- `getAddressesForContact()` (multi-address read function) — added in 4D when first needed.
- Any other read functions beyond `getPrimaryAddress` (no `getAddressById(id)`, no `getDeletedAddresses()` / trash list). 4D or a later session adds them when actually needed.
- `softDeleteAddress(id)` — no UI in 4A removes addresses (the primary address is replaced via `updatePrimaryAddress`, not deleted). Added in 4D when the multi-address UI needs it.
- Migration of existing address data (none to migrate).
- Backfilling `is_primary` for any contact-address pairs (none exist).
- Any changes to `subcontractors` or `companies` address columns.
- Wrapping the two-write contact-creation flow (insert contact, then insert primary address) in a transaction or RPC. Accepted as v1 behavior; logged as tech debt below.

---

## Decisions made in this SPEC (not in the design doc)

The design doc (§4.14) lists columns but does not specify nullability, FK delete behavior, or label requirements. Decisions made here:

- **`address_line2` is nullable** (apartment/suite/unit lines are optional). All other address fields (`address_line1`, `city`, `state`, `zip`) are `NOT NULL`.
- **`label` is nullable.** Required only when a contact has more than one address (handled by 4D UI). Primary address may have no label.
- **`is_primary` is `NOT NULL DEFAULT false`.** Caller code is responsible for setting `true` when appropriate (see contact-form behavior below).
- **`contact_id` FK uses `ON DELETE CASCADE`.** Contacts use soft-delete, so this only fires on a hard-delete (which should not happen in normal operation). Defensive: keeps DB consistent if a contact is ever hard-deleted manually.

If any of these decisions need to change before implementation, edit this SPEC before handing to Claude Code.

---

## Schema

Per design doc §4.14, with decisions above applied. Column defaults follow CLAUDE.md "Standard columns" convention exactly (no `NOT NULL` on `created_at`/`updated_at`/`is_deleted`).

```sql
CREATE TABLE contact_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  label TEXT,                          -- e.g., "Main Residence", "Rental on Oak St". Nullable.
  address_line1 TEXT NOT NULL,
  address_line2 TEXT,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  zip TEXT NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  is_deleted BOOLEAN DEFAULT false,
  deleted_at TIMESTAMPTZ
);

-- Per CLAUDE.md per-tenant defaults checklist
ALTER TABLE contact_addresses ALTER COLUMN company_id SET DEFAULT get_my_company_id();
ALTER TABLE contact_addresses ALTER COLUMN created_by SET DEFAULT auth.uid();
ALTER TABLE contact_addresses ALTER COLUMN updated_by SET DEFAULT auth.uid();

-- Enforce at most one primary address per contact (active rows only)
CREATE UNIQUE INDEX idx_contact_addresses_one_primary
  ON contact_addresses (contact_id)
  WHERE is_primary = true AND is_deleted = false;

CREATE INDEX idx_contact_addresses_company_id ON contact_addresses (company_id);
CREATE INDEX idx_contact_addresses_contact_id ON contact_addresses (contact_id);
```

### Standard triggers (REQUIRED — per CLAUDE.md "Standard triggers on every per-tenant table")

Two BEFORE UPDATE triggers must be installed on `contact_addresses` in the same migration:

1. `contact_addresses_set_updated_at` — sets `NEW.updated_at = now()` on every UPDATE.
2. `contact_addresses_set_updated_by` — sets `NEW.updated_by = auth.uid()` on every UPDATE.

Reference implementation: copy the trigger function definitions and `CREATE TRIGGER` statements from the migration that installed them on `contacts` (or `subcontractors`, or `files` — any of the three follows the pattern). Rename the trigger names to match `contact_addresses`.

These triggers are required regardless of which UPDATE paths exist in 4A. They are part of the standard table contract; later sub-modules (e.g., 4D) will add more UPDATE callers and they must inherit correct `updated_at` / `updated_by` behavior automatically.

Without these triggers, `updated_at` and `updated_by` will never advance after the original INSERT.

### RLS policies

Standard four policies (SELECT, INSERT, UPDATE, DELETE) all scoped to `company_id = get_my_company_id()`. RLS does NOT filter on `is_deleted` — that's enforced in the service layer per CLAUDE.md trash-bin pattern.

The DELETE policy is intentionally included even though no service function in 4A performs a hard DELETE. Reasons: (a) keeps the table contract complete and consistent with every other per-tenant table in the project, (b) `ON DELETE CASCADE` from `contacts` may invoke it during admin cleanup, (c) avoids a migration revisit when 4D or a later session adds delete paths.

### Drop from `contacts`

In the same migration file, after the `contact_addresses` table and triggers are created:

```sql
ALTER TABLE contacts DROP COLUMN address_line1;
ALTER TABLE contacts DROP COLUMN address_line2;
ALTER TABLE contacts DROP COLUMN city;
ALTER TABLE contacts DROP COLUMN state;
ALTER TABLE contacts DROP COLUMN zip;
```

---

## Pre-migration check (must run before writing migration)

Before generating the migration, run a repo-wide search for any code that references the address columns being dropped. Type-check will catch most of these once `database.ts` is regenerated, but a `select('*').ilike('city', ...)` style filter or a raw string column reference may not surface as a type error.

```bash
grep -rn "address_line1\|address_line2\|\.city\|\.state\|\.zip" apps/ packages/ \
  --include="*.ts" --include="*.tsx" \
  | grep -v "subcontractors\|companies\|database.ts"
```

Review every match. Each must be one of: (a) updating to read from `contact_addresses`, (b) confirmed unrelated to contacts, or (c) added to the list of files to update in this sub-module. Do not proceed to writing the migration until this list is reconciled.

---

## Validation schemas

Per CLAUDE.md, Zod schemas live in `packages/shared/validation/`. Before writing any code, list this directory and inspect any contact-related schema:

```bash
ls packages/shared/validation/
grep -rln "address_line1\|contact" packages/shared/validation/
```

If a contact schema currently includes address fields, restructure it as follows:

- Keep a `contactSchema` that validates only contact fields (no address fields).
- Add a separate `contactAddressSchema` (or extend an existing one) that validates address-only input: `label?`, `address_line1`, `address_line2?`, `city`, `state`, `zip`, `is_primary`.
- The contact form may compose both schemas in a single form-level Zod object for the combined input shape, but each service call validates against the schema for its own table.

If no contact-related Zod schema exists in `packages/shared/validation/`, create `contact-address.ts` there for the new address shape and skip the contact schema split. Note in the commit message which case applied.

---

## Files changed

### Created

- `supabase/migrations/{timestamp}_create_contact_addresses.sql` — single migration file, 14-digit timestamp prefix only (no numeric prefix like `028_`). Contains the table create, per-tenant defaults, indexes, RLS policies, standard triggers, and the column drop on `contacts`. Use `date -u +%Y%m%d%H%M%S` to generate the timestamp.
- `apps/web/lib/services/contact-addresses.ts` — server service. One function: `getPrimaryAddress(contactId)`.
- `apps/web/lib/services/contact-addresses-client.ts` — client service. Two functions: `createAddress(input)`, `updatePrimaryAddress(contactId, input)`.
- `packages/shared/validation/contact-address.ts` — only if no relevant schema exists today; see "Validation schemas" above.

### Modified

- `packages/shared/types/database.ts` — auto-regenerated via `npm run db:types`. Do not hand-edit.
- `apps/web/lib/services/contacts.ts` — remove address column names from any select strings. The `Contact` type does not need editing (it's derived from the regenerated Row).
- `apps/web/lib/services/contacts-client.ts` — remove address fields from create/update payload shapes. Re-export updated `Contact` type if applicable.
- `apps/web/app/dashboard/contacts/contact-form.tsx` — see "Contact form behavior" section below.
- `apps/web/app/dashboard/contacts/contacts-list.tsx` — if it currently shows any address fields in the list, decide during plan-mode review whether to (a) drop the address column from the list view, or (b) fetch primary address via a separate query/join. **Default: drop from list view if visible.** Confirm during plan-mode review.
- `apps/web/app/dashboard/contacts/[id]/edit/page.tsx` — additionally fetches primary address via `getPrimaryAddress(contactId)` and passes it to `contact-form.tsx` as a prop.
- `apps/web/app/dashboard/contacts/new/page.tsx` — no signature change expected; verify in plan mode.
- An existing contact-related Zod schema in `packages/shared/validation/`, if one exists per the Validation schemas check.
- Any other caller surfaced by the pre-migration grep above or by `npm run type-check` after the regenerate.

---

## Contact form behavior (explicit)

The current form has address fields inline on the contact record. After 4A:

**On create (new contact):**

1. Form submits → call `createContact({ ...non-address fields })`.
2. After contact insert returns the new `contact_id`, call `createAddress({ contact_id, is_primary: true, address_line1, address_line2, city, state, zip })`. **The form is responsible for setting `is_primary: true` here** — `createAddress` does not infer this. `label` is optional and may be omitted.
3. If step 2 fails after step 1 succeeded, the contact exists with no address. Surface a non-blocking error and direct the user to retry. Logged as tech debt for v1 (see below).

**On edit (existing contact):**

1. Page-load makes its existing contact fetch AND additionally calls `getPrimaryAddress(contactId)`. Both results are passed to the form. If `getPrimaryAddress` returns `null` (e.g., the orphaned-contact case from the create flow's edge case), the form renders the address fields empty so the user can fill them in.
2. On save, call `updateContact({...})` AND `updatePrimaryAddress(contactId, { address_line1, ... })`. The latter handles both update-existing-primary and create-if-none-exists internally.

**Visual layout:** unchanged from today. Same address field group, same labels, same validation.

---

## Service layer behavior

Per CLAUDE.md service layer pattern:

- **Server file (`contact-addresses.ts`)** — read operations only. Imports from `@/lib/supabase-server`.
  - `getPrimaryAddress(contactId)`: returns the single active primary address for a contact, or `null`. Filters `is_deleted = false` and `is_primary = true`. **Use `.maybeSingle()`, not `.single()`** — a contact may have no primary address yet (orphaned-contact edge case from the two-write create flow) and the page must handle that without throwing.

- **Client file (`contact-addresses-client.ts`)** — write operations only. Imports from `@/lib/supabase-browser`.
  - `createAddress(input)`: inserts a new address. Caller sets `is_primary` explicitly. Insert payload does not need to set `company_id`, `created_by`, `updated_by`, `created_at`, or `updated_at` (DB defaults handle all five). `label` is optional.
  - `updatePrimaryAddress(contactId, input)`: upsert-like — if a primary exists, update it; if not, insert with `is_primary = true`. Encapsulates the "one primary per contact" intent so callers don't have to think about it. The internal "exists?" check should also use `.maybeSingle()`.

- **`updated_at` and `updated_by` are handled by BEFORE UPDATE triggers (see Schema → Standard triggers).** Per CLAUDE.md "Standard triggers on every per-tenant table," service-layer code MUST NOT explicitly set `updated_at` or `updated_by` in update payloads. Mirror the comment style used in `contacts-client.ts`:

```typescript
// BEFORE UPDATE trigger `contact_addresses_set_updated_by` handles updated_by.
// updated_at is handled by the existing updated_at trigger.
const { error } = await supabase.from('contact_addresses').update(updates).eq('id', id);
```

- **Type derivation:** Use `Pick<>` pattern from `Database['public']['Tables']['contact_addresses']['Row']` per CLAUDE.md generated types workflow. No CHECK constraints on this table, so `Omit + intersection` is not needed. Re-export types from client file via `export type {}` (no redefinition).

---

## Acceptance check

In order:

1. Pre-migration grep returned and was reconciled — every match accounted for.
2. Validation schema check (`ls packages/shared/validation/`) was run; the SPEC's "Validation schemas" guidance applied to whatever exists.
3. Migration file written under `supabase/migrations/` with 14-digit timestamp filename. Includes table create, per-tenant defaults, indexes, RLS policies, both standard triggers, and the `contacts` column drops — all in one file.
4. Migration applied to remote Supabase using **`npx supabase db push`** (CLI only — see "Codespaces / project-specific gotchas" below for why SQL Editor is forbidden for this migration).
5. `npx supabase migration list` shows the new migration in sync (Local + Remote).
6. `npm run db:types` produces an updated `database.ts` with `contact_addresses` present and `contacts` address columns absent. Commit alongside the migration.
7. `npm run type-check` passes with zero errors. Any breakages must be fixed in this session, not deferred.
8. Dev server starts clean (`npm run dev` in `apps/web`, no runtime errors on `/dashboard/contacts`).
9. Manual smoke test on the live dev server. (Note: after the migration, no existing contacts have address rows — the smoke test creates a fresh contact and edits that one.)
   - **9a:** Create a new contact with an address. Verify the contact and a row in `contact_addresses` (with `is_primary = true`) both exist.
   - **9b:** Edit the contact created in 9a — change the address. Verify in Supabase Table Editor (or a SQL query against `contact_addresses`) that the existing row was UPDATEd (not duplicated), `updated_at` advanced past `created_at`, and `updated_by` is set to the editing user's `auth.users.id`. This proves both standard triggers are wired correctly.
   - **9c:** View the contacts list. Verify it loads without runtime errors. If the list view kept an address column, verify the address still displays. If the address column was dropped, verify layout still renders cleanly.
10. Commit message format: `[Estimating] 4A — contact_addresses table + primary-address refactor`.

---

## Codespaces / project-specific gotchas

Reminders from CLAUDE.md and user memory that apply here:

- Migration file uses 14-digit timestamp prefix only. Use `date -u +%Y%m%d%H%M%S` to generate.
- Use Node.js `fs.writeFileSync()` or the Codespace editor for the migration file. Do not use shell heredocs (Session 12 silently mangled SQL via heredoc).
- Per-tenant defaults are part of the migration, not added later (Migration 022 was a fix for missing this).
- Standard triggers (`set_updated_at` and `set_updated_by`) are part of the migration, not added later.
- After regenerating `database.ts`, do not hand-edit. Let the type-check error list drive caller updates.
- **Apply this migration via `npx supabase db push` only. Do NOT use the Supabase SQL Editor.** Per user memory and STATE.md, CLI-tracked and SQL-Editor-applied histories diverge and must be managed carefully. Mixing the two has caused real problems on this project. Keeping this migration on the CLI track keeps `migration list` honest.
- **Deploy ordering.** Migration is applied to remote Supabase via the CLI (above). Code is deployed to Vercel via `git push`. Order to follow: (a) commit migration + code changes together locally, (b) `npx supabase db push` to remote Supabase, (c) push to GitHub (Vercel auto-deploys). There is a brief window where remote DB is on the new schema while Vercel is still building — acceptable in dev with test data only.

---

## Tech debt to log on completion

- **TD#XX (open):** Multi-address UI on contact detail page. Required by Sub-module 4D (estimate creation needs to pick a job-site address from a contact's address list). Not built in 4A. Owner: 4D session.
- **TD#XX (open):** Two-write contact-creation flow is not transactional. If the address insert fails after the contact insert succeeds, the contact exists without an address. Acceptable for v1; revisit if observed in practice. Possible fix: wrap both writes in a Supabase RPC/edge function.
- **TD#XX (open, optional):** If `contacts-list.tsx` had an address column dropped, decide whether to add it back showing primary address (joined query) once 4D's multi-address support exists.
- **TD#XX (open):** `companies` table is missing a `companies_set_updated_by` trigger and `company-client.ts` sets `updated_at` explicitly — pre-trigger-pattern holdover. Migrate to the standard pattern (add triggers, drop the explicit `updated_at` from client code) so all per-tenant tables behave the same way. Not required for 4A; logging here so it's not forgotten.

Tech debt items get real numbers when added to TECH_DEBT.md at session close.

---

## Out of scope reminders (do not chase)

- Do not touch `subcontractors` or `companies` address columns.
- Do not build the multi-address management UI (deferred to 4D).
- Do not add `address_type` (e.g., "billing" vs "site") column. Not in design doc; would be scope creep.
- Do not add `getAddressesForContact()`, `getAddressById(id)`, or `getDeletedAddresses()` to the server service in this sub-module. 4D or a later session adds them when first needed.
- Do not add `softDeleteAddress(id)` to the client service. Nothing in 4A's UI deletes addresses; 4D adds it when the multi-address UI needs it.
- Do not set `updated_at` or `updated_by` explicitly in service-layer update payloads. The standard triggers own those fields.
- Do not retrofit the `companies` table to the new trigger pattern in this sub-module. Logged as separate tech debt.
- Do not apply the migration through the Supabase SQL Editor. CLI only.
