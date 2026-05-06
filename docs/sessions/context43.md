# Context — FrameFocus Session 43

**Date:** May 6, 2026
**Scope:** Execute Session 42's two priority items (CLAUDE.md backfill + tightening) before resuming 4A.
**Outcome:** Both priorities complete. CLAUDE.md 605 → 466 lines (net -139, including the +38 trigger section). 4A Step 2+ unchanged from S42, ready to resume in S44.

---

## What happened

Session opened cleanly — no surprises in the working tree. Worked through Session 42's two priority items in order, then deferred Module 4 work to Session 44 per stated session goal.

### Priority #1 — Backfill missing "Standard triggers" section in CLAUDE.md

Session 42 bumped the CLAUDE.md header to claim "Standard triggers section added" but the body content never landed. Drafted the section content (BEFORE UPDATE trigger pattern, naming convention, service-layer contract that code MUST NOT set `updated_at`/`updated_by` explicitly, reference implementations, holdover note for `companies` table) and inserted between "Per-tenant table column-defaults checklist" and "Append-only audit log exception."

Single commit: `1add860`. +38 lines.

### Priority #2 — Tighten CLAUDE.md

Aggressive tightening pass across many sections. User pushed for "reduce further" on multiple proposals. Pattern that emerged: any section duplicating STATE.md content gets cut to a one-line pointer. Cuts applied one section at a time with explicit approval before each edit.

**Checkpoint commit `c21488e`:**

- Platform Modules — full module tables removed; replaced with status pointer to STATE.md / CLAUDE_MODULES.md / Quick Reference. Saved ~34 lines.
- Built-In Workflow Automations — full numbered list removed; replaced with one-line pointer to Quick Reference, kept Admin-role-in-workflows note. Saved ~16 lines.
- "What Admin CAN do" non-exhaustive list — dropped entirely. Already implied by the Admin Role Principle. Saved ~16 lines.
- Monorepo Structure tree — full tree dropped; replaced with top-level bullet list. Saved ~38 lines.

**Final tightening commit `89370e2`:**

- User & Role Architecture — Layer 1 one-row table folded into paragraph; Layer 2 table's Owner/Admin rows collapsed to one combined row pointing down; Owner-only list trimmed to rule + minimal parenthetical; redundant intro paragraph above approval table dropped; approval table de-duplicated (rows that mirrored Owner-only list dropped). Saved ~41 lines.
- Generated Types Workflow — two full code examples replaced with one-line pattern descriptions + reference impl pointers. Saved ~42 lines.
- Service Layer Pattern → "Current service files" listing → one-line pointer to STATE.md "Codebase State". Saved ~9 lines.
- AI Reference Implementation — 6 numbered rules trimmed from paragraph-length to one-liners with parenthetical reasoning. Saved ~13 lines.
- Environment Variables + Known Accounts sections — both pure duplication of STATE.md. Deleted, replaced with one-line pointer. Saved ~19 lines.
- Reference Documents — trimmed descriptions, dropped orphaned `Development_Roadmap.docx` and meta-bullet about CLAUDE.md being "this file." Saved ~4 lines.

### What was NOT done

- 4A Steps 2–9 from Session 42 plan. No code changes this session. Session goal was explicitly to clear the documentation backlog before resuming.

---

## Files committed this session

- `1add860` — `[Docs] CLAUDE.md — backfill standard triggers section (Session 42 follow-up)`
- `c21488e` — `[Docs] Tighten CLAUDE.md — Modules, Workflows, Admin role, Monorepo Structure`
- `89370e2` — `[Docs] Further CLAUDE.md tightening — User & Roles, Generated Types, Service Layer, AI Reference, Env/Accounts, Reference Docs`
- (this session-close commit covers STATE.md + context43.md)

---

## Open items for Session 44 (PRIORITY ORDER)

Resume 4A at Session 42's Step 2. The full plan from `docs/sessions/context42.md` is still valid:

1. **Step 2:** `npm run db:types` — regenerate `packages/shared/types/database.ts`. Commit alongside (its own commit, separate from the migration which is already in).
2. **Step 3:** Create `apps/web/lib/services/contact-addresses.ts` (server) with `getPrimaryAddress(contactId)` using `.maybeSingle()`.
3. **Step 3:** Create `apps/web/lib/services/contact-addresses-client.ts` (client) with `createAddress(input)` and `updatePrimaryAddress(contactId, input)`. Follow `contacts-client.ts` as the reference (NOT `company-client.ts` — pre-trigger holdover).
4. **Step 4:** Create `packages/shared/validation/contact-address.ts` with `contactAddressSchema`. Per Session 42 finding: no existing contact Zod schema — clean new file.
5. **Step 5:** Verify `apps/web/lib/services/contacts.ts` and `contacts-client.ts` need no manual edits (the `Omit + intersection` pattern + regenerated `database.ts` should handle it).
6. **Step 6:** Update `apps/web/app/dashboard/contacts/[id]/edit/page.tsx` to additionally call `getPrimaryAddress(id)` (Promise.all with the existing contact fetch) and pass to the form.
7. **Step 7:** Update `apps/web/app/dashboard/contacts/contact-form.tsx` for two-step submit (create) and two-call save (edit). Accept new `existingAddress` prop. Visual layout unchanged. Form sets `is_primary: true` explicitly when calling `createAddress` on new contacts.
8. **Step 8:** `npm run type-check` clean + manual smoke test (create with address, edit with trigger proof, list view).
9. **Step 9:** Single commit `[Estimating] 4A — contact_addresses table + primary-address refactor` for everything from Step 2 onward.

Migration 028 is already on remote — do NOT try to re-apply. `npx supabase migration list` will confirm.

---

## Tech debt status

All Session 42 tech debt items remain pending (numbers assigned at 4A completion per TECH_DEBT.md convention):

- Multi-address UI on contact detail page (4D scope)
- Two-write contact-creation flow not transactional
- `contacts-list.tsx` address column decision (currently moot — list shows no address)
- `companies` table missing `companies_set_updated_by` trigger; `company-client.ts` sets `updated_at` explicitly (pre-trigger holdover)
- `getContact(id)` filters `is_deleted = false` (deviates from CLAUDE.md trash-bin pattern; pre-existing)

Session 42's two CLAUDE.md tech debt items both **resolved this session** — drop from carry-forward list.

---

## Workflow notes

- The propose-approve-edit-confirm loop worked cleanly across ~10 distinct CLAUDE.md cuts. Each cut a discrete step; user manually applied each edit; verified before moving on.
- User pushed back with "reduce further" three or four times — productive pressure that drove the most aggressive cuts.
- Strongest pattern that emerged: **STATE.md is the source of truth for live state** (env vars, accounts, codebase tree, build status). CLAUDE.md should never duplicate STATE.md content — pointer only. Apply this rule on any future CLAUDE.md grow-back.
- CLAUDE.md is now 466 lines. Aspirational target was ~250 (per `Using Claude Code.docx` and Session 42 priority). Did not hit the target but cut nearly half the file without losing any active convention. Diminishing returns past this point — further cuts would risk load-bearing context.

---

## How to start Session 44

1. Open Codespace, `git pull`, `bash scripts/session-start.sh`.
2. New Claude Chat with project knowledge.
3. Paste session-start snapshot + `context43.md`.
4. **First action when resuming 4A: `cd apps/web && npm run db:types`** (Step 2 of the 4A plan from context42.md).
5. The 4A plan from Session 42 is still valid — see `docs/sessions/context42.md` for the full step list.
