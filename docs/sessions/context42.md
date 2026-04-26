# Context — FrameFocus Session 42

**Date:** April 25, 2026
**Scope:** Start Module 4 build with Sub-module 4A (`contact_addresses` table + primary-address refactor).
**Outcome:** SPEC.md authored through 7 audit passes and committed. Migration 028 written, applied to remote Supabase, and committed. Service layer, Zod schema, form refactor, type regen, and smoke test all deferred to Session 43. Module 4 status moved from 📋 DESIGNED → 🚧 IN PROGRESS.

---

## What happened

Session opened cleanly per the Session 41 handoff: start 4A via SPEC-driven Claude Code flow.

Pre-flight ground-truth caught two surprises in the working tree before any 4A work began:

1. `CLAUDE_MODULES.md` showed as deleted-but-uncommitted. `git restore` confirmed it had never actually been deleted in any commit — the working tree state was transient. File restored, working tree clean.
2. `SPEC.md` from a prior session sat untracked at repo root. Confirmed throwaway by user; would be overwritten with the 4A spec.

### SPEC.md authoring (the real session)

Walked through Option A vs Option B for address UI scope (decision: **A** — primary-address-only UI now, multi-address UI deferred to 4D). Wrote SPEC.md and ran **seven audit passes** against it. Findings trajectory: 6 → 4 → 3 → 3 → 2 → 2 → 0.

Issues caught across audits (selected — full list in chat history):

- NOT NULL inconsistencies vs. CLAUDE.md "Standard columns" convention.
- Decisions made silently (nullability, FK delete behavior, label requirements) flagged in a dedicated "Decisions made in this SPEC" section.
- `getAddressesForContact()` and `softDeleteAddress()` removed for YAGNI.
- `.maybeSingle()` mandated over `.single()` on `getPrimaryAddress` — the orphaned-contact edge case from the two-write create flow needs to not throw.
- Pre-migration grep step added to catch raw column references the type-check might miss.
- Validation schema check added (no contact-related Zod schema existed; new `contact-address.ts` will be created).
- Deploy ordering (CLI-only migration, accept brief Vercel/DB mismatch in dev).
- **The big miss:** the trigger pattern. CLAUDE.md's "Standard columns" section doesn't document the BEFORE UPDATE triggers that handle `updated_at` and `updated_by`, but the codebase universally uses them. Three audit passes failed to catch this; only when the SPEC tried to mandate explicit `updated_at` setting in service code did a `grep` against existing client services surface the actual pattern. Triggered the CLAUDE.md edit (see below).

### CLAUDE.md edit (incomplete)

Added a "Standard triggers on every per-tenant table" section to the conventions doc. **Header date was bumped but the section body did not actually land in the file** — Claude Code flagged this during plan-mode exploration. The plan/migration both work because the trigger contract is fully specified in the SPEC and the migration patterns are clear in existing migrations. The actual section content needs to be added in Session 43. Tracked as tech debt below.

### Claude Code execution

Followed the SPEC-driven Claude Code flow per `Using Claude Code.docx`: opened plan mode, Claude Code performed parallel exploration (verified SPEC preconditions, found the trigger reference implementation), produced a detailed plan, paused for review.

Plan was reviewed and approved with one observation worth noting: Claude Code correctly **deviated from the SPEC's trigger naming** (`contact_addresses_set_updated_at`) in favor of the codebase-established pattern (`contact_addresses_updated_at`) confirmed by `grep` across all existing migrations (`tag_options_updated_at`, `companies_updated_at`, `profiles_updated_at`, `files_updated_at`). The right call.

Execution proceeded one bounded step at a time:

- **Step 1 (migration written):** `supabase/migrations/20260425235056_create_contact_addresses.sql` — table + per-tenant defaults + 3 indexes (including the partial unique on `is_primary` filtered by `is_deleted`) + both standard triggers + 4 RLS policies + 5 `ALTER TABLE contacts DROP COLUMN` statements.
- **Step 1.5 (migration applied):** `npx supabase db push` succeeded. `npx supabase migration list` confirmed 30 rows in sync (28 file-based migrations + 2 system entries) on Local and Remote.
- **Migration committed:** `c436798` — `[Estimating] 4A — Migration 028 (contact_addresses table + drop contacts address columns)`.

Stopped here for the day. Per Claude Code's exit summary, Steps 2–9 of the 4A plan are pending Session 43.

---

## Pre-flight findings from Claude Code's exploration (preserved for Session 43)

These resolved several SPEC ambiguities and should be carried into Session 43 without re-discovery:

- **Pre-migration grep impact:** Only `apps/web/app/dashboard/contacts/contact-form.tsx` actually touches contacts addresses (30 matches). `company.ts` and `settings-form.tsx` matches are companies-table — out of scope.
- **No existing contact-related Zod schema** in `packages/shared/validation/index.ts`. Per SPEC: create `contact-address.ts`, no contact-schema split needed.
- **`contacts-list.tsx` shows no addresses** — list shows name/company/type/status/email/phone only. The SPEC's "drop column vs. add join" question resolves to **neither — no change needed**.
- **No other contacts pages** (e.g., a `[id]/page.tsx` detail view) reference addresses. Only the list page, new page, edit page, plus form/list components.
- **Trigger pattern split confirmed:** `update_updated_at()` is shared (Migration 001). Per-table `set_{table}_updated_by()` functions live in Migration 018 (files), Migration 019 (contacts/subs), and the `tag_options` migration. The new migration creates `set_contact_addresses_updated_by()` and reuses the shared `update_updated_at()`.

---

## Files committed this session

- `f7b0a5a` — `[Estimating] 4A SPEC + CLAUDE.md standard triggers section` (SPEC.md created, CLAUDE.md header bumped — body section MISSING, see open items)
- `c436798` — `[Estimating] 4A — Migration 028 (contact_addresses table + drop contacts address columns)`

---

## Migration 028 details (for Session 43 reference)

File: `supabase/migrations/20260425235056_create_contact_addresses.sql` (146 lines)

Contents in order:

1. `CREATE TABLE contact_addresses` with standard columns + per-SPEC nullability decisions (label/address_line2 nullable, others NOT NULL, is_primary NOT NULL DEFAULT false).
2. Per-tenant defaults: `company_id` ← `get_my_company_id()`, `created_by` ← `auth.uid()`, `updated_by` ← `auth.uid()`.
3. Indexes: `idx_contact_addresses_company_id`, `idx_contact_addresses_contact_id`, partial unique `idx_contact_addresses_one_primary` (one primary per contact, active rows only).
4. Triggers: `contact_addresses_updated_at` (reuses shared `update_updated_at()`); `contact_addresses_set_updated_by` (new per-table `set_contact_addresses_updated_by()` function).
5. RLS enabled + 4 policies (SELECT/INSERT/UPDATE/DELETE) all scoped `company_id = get_my_company_id()`. DELETE policy intentionally included even though no 4A code path calls it.
6. Five `ALTER TABLE contacts DROP COLUMN` statements (address_line1, address_line2, city, state, zip).

`contact_id` FK uses `ON DELETE CASCADE`. Decision made in SPEC, defensive — only fires on hard-delete (which shouldn't happen since contacts use soft-delete).

---

## Open items for Session 43 (PRIORITY ORDER)

### Do FIRST in Session 43

1. **Backfill the missing CLAUDE.md "Standard triggers on every per-tenant table" section.** Header at line 3 claims "Session 42 — Standard triggers section added" but no section by that name exists in the file body. SPEC and Migration 028 both work without it (the contract is specified elsewhere), but every future per-tenant table SPEC needs this anchor. Section content was drafted in Session 42 chat and approved — just needs to actually land in the file.

2. **Tighten CLAUDE.md before it grows further.** File is well past the ~100-line target from `Using Claude Code.docx`. Per Boris Cherny / HumanLayer research: longer CLAUDE.md files measurably hurt instruction-following. Each session has been adding sections and the pattern will compound. Candidate cleanups:
   - The "Standard columns on every table" example block is reproduced verbatim — could point to a reference migration instead.
   - Some Codespaces-gotchas may have been fixed and are no longer relevant.
   - The "Reference Implementation" section under AI Integration Rules is detailed enough to live in a sibling doc.
     Aim: get CLAUDE.md back under ~250 lines without losing any active conventions.

### Continue 4A build after the above

3. **Step 2:** `npm run db:types` — regenerate `packages/shared/types/database.ts`. Commit alongside the migration (which is already committed — types regen is its own commit).
4. **Step 3:** Create `apps/web/lib/services/contact-addresses.ts` (server) with `getPrimaryAddress(contactId)` using `.maybeSingle()`.
5. **Step 3:** Create `apps/web/lib/services/contact-addresses-client.ts` (client) with `createAddress(input)` and `updatePrimaryAddress(contactId, input)`. Follow `contacts-client.ts` as the reference (NOT `company-client.ts` — that's the pre-trigger holdover anti-pattern).
6. **Step 4:** Create `packages/shared/validation/contact-address.ts` with `contactAddressSchema`. Per Session 42 finding: no existing contact Zod schema — this is a clean new file, no schema split needed. Schema exists for 4D's eventual use; not wired into 4A's UI.
7. **Step 5:** Verify `apps/web/lib/services/contacts.ts` and `contacts-client.ts` need no manual edits (the `Omit + intersection` pattern + regenerated `database.ts` should handle the type changes automatically).
8. **Step 6:** Update `apps/web/app/dashboard/contacts/[id]/edit/page.tsx` to additionally call `getPrimaryAddress(id)` (in `Promise.all` with the existing contact fetch) and pass result to the form.
9. **Step 7:** Update `apps/web/app/dashboard/contacts/contact-form.tsx` for two-step submit (create) and two-call save (edit). Accept new `existingAddress` prop. Visual layout unchanged. Form sets `is_primary: true` explicitly when calling `createAddress` on new contacts.
10. **Step 8:** `npm run type-check` clean + manual smoke test (create with address, edit with trigger proof, list view).
11. **Step 9:** Single commit `[Estimating] 4A — contact_addresses table + primary-address refactor` for everything from Step 2 onward. Log tech debt at session close per the list below.

---

## Tech debt to log at end of Session 43 (numbers assigned then per TECH_DEBT.md convention)

Several items were identified across Session 42 but not added to TECH_DEBT.md yet because TD numbers are immutable and the work isn't complete:

- **(open)** Multi-address UI on contact detail page — required by Sub-module 4D (estimate creation needs to pick a job-site address). Owner: 4D session.
- **(open)** Two-write contact-creation flow (create contact, then create primary address) is not transactional. If the address insert fails after the contact insert succeeds, the contact exists without an address. Acceptable for v1; revisit if observed in practice. Possible fix: wrap both writes in a Supabase RPC.
- **(open, optional)** If `contacts-list.tsx` ever adds an address column back, decide whether to fetch primary address via a join. Currently moot — list shows no address.
- **(open)** `companies` table is missing a `companies_set_updated_by` trigger and `company-client.ts` sets `updated_at` explicitly — pre-trigger-pattern holdover. Migrate to the standard pattern (add triggers, drop the explicit `updated_at` from client code) so all per-tenant tables behave the same way.
- **(open, surfaced by Claude Code exploration)** `getContact(id)` in `apps/web/lib/services/contacts.ts` filters `is_deleted = false`, deviating from the CLAUDE.md trash-bin pattern (single-row fetch must not filter, so a restore-from-trash flow can read deleted rows by id). Pre-existing — does not block 4A. Should be fixed when contacts get a trash UI.
- **(open)** CLAUDE.md "Standard triggers on every per-tenant table" section is missing despite the header claim. Session 43 priority #1 above.
- **(open)** CLAUDE.md is too long. Session 43 priority #2 above.

---

## Workflow notes

- **The audit-revise-audit loop worked.** Seven passes drove findings from 6 to 0. Most-valuable single round was the third — when the SPEC was clean enough that a `grep` against existing service files surfaced the trigger pattern that three audits hadn't caught from documents alone.
- **The SPEC ended up at ~280 lines.** Long for a single sub-module spec, but every line earned its place via the audit history. Trade-off accepted.
- **Claude Code's exploration was substantive** and surfaced things the SPEC didn't have (e.g., the trigger function split, the contacts-list resolution, no existing Zod schema). Plan-mode review caught the trigger-naming deviation as a flag-for-user item — exactly the right behavior.
- **Bounded execution worked.** Stopping Claude Code after the migration write, again after migration apply, kept human approval gates at the highest-risk transitions. No "while I'm at it" drift.
- **CLAUDE.md drift bit us.** Header bump without body content is the same class of error as the lost Module 4 design doc in Session 41. Lesson for future: when adding to CLAUDE.md, save the file mid-conversation and verify before bumping the header date.
- **One Codespace UX surprise:** Claude Code's "Save file to continue" approval prompt looked like an unexpected mid-session edit. It was actually the standard write-to-disk approval for the file we'd just reviewed. Worth not over-reading the prompt language next time.

---

## How to start Session 43

1. Open Codespace, `git pull`, `bash scripts/session-start.sh`.
2. New Claude Chat with project knowledge.
3. Paste session-start snapshot + `context42.md`.
4. **Open Session 43 with the two priority items above (CLAUDE.md backfill + tighten), THEN return to 4A Step 2.**
5. The 4A plan from Session 42 is still valid — Claude Code's exit summary preserves the step list. Next concrete action when 4A resumes: `npm run db:types`.
6. Migration 028 is already on remote — do not try to re-apply. `npx supabase migration list` will confirm.
