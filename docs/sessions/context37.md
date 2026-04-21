# Context — FrameFocus Session 37

**Date:** April 20, 2026
**Scope:** Third polish session of pre-Module-4 cleanup. Started #14–#17 (team member detail page).
**Outcome:** Migration 026 + service layer + server actions + shared admin client extract complete. Page, form, and row-click wiring deferred to Session 38. Stopped at a clean seam mid-build to avoid context fatigue.

---

## What was decided

This session was unusually decision-heavy — capturing all of them so Session 38 doesn't re-litigate.

### Page architecture

- **Page shape: single edit page at `/dashboard/team/[id]`.** Originally chose Option B (separate read-only detail + edit route), reverted to Option A (single edit page) within minutes. Reasoning for the reversal: matches existing contacts/subcontractors convention; tech debt #13 already plans read-only detail views for contacts/subs/team in one consistent pass later. Don't reopen this.
- **Service layer file split: all in `team.ts`, no `team-client.ts`.** This is a deliberate deviation from the CLAUDE.md convention (`{entity}.ts` server / `{entity}-client.ts` client). Reasons: (1) `team.ts` already breaks the convention with `cancelInvitation` and `createInvitation` writes; (2) all team mutations need server-side privilege checks (caller role + same company), so they MUST be server actions, not client component calls; (3) `resetTeamMemberPassword` requires `auth.admin.*` which uses the service role key and absolutely cannot run client-side. Future session should not "fix" this back to the convention without understanding why.
- **File structure for the page:** `page.tsx` (server: fetch + auth gate) + `edit-form.tsx` (client: controlled form) + `actions.ts` (server actions). The `actions.ts` file is already built and committed.

### Editable fields

| Field | Editable | Notes |
|---|---|---|
| `first_name` | ✅ | |
| `last_name` | ✅ | |
| `phone` | ✅ | nullable |
| `role` | ✅ — Owner sees all roles in dropdown; Admin sees only PM/Foreman/Crew | RLS in Migration 025 enforces same |
| `notes` | ✅ | new column, added in Migration 026 |
| `email` | display-only | changing requires Supabase auth flow, out of scope |
| `created_at` | display-only | shown as "Added [date]" footer |
| `avatar_url`, `is_active`, `is_deleted`, `deleted_at`, `created_by`, `updated_by`, `id`, `user_id`, `company_id`, `updated_at` | not surfaced | system fields or deferred |

`is_active` was a dead column — verified zero callers via grep, dropped in Migration 026 alongside the `notes` add. Both ALTERs in one migration because they're the same table and both touch the schema.

### Authorization (locked)

| Caller role | Can view this page for... | Can edit role to... | Can delete? | Can reset password? |
|---|---|---|---|---|
| Owner | anyone (incl. self → see below) | any role | yes (except self) | yes |
| Admin | non-Owner, non-Admin, non-self | PM / Foreman / Crew only | yes | yes |
| PM / Foreman / Crew | nobody | — | — | — |

- **Self-access (caller viewing own profile):** Page renders read-only with the message: *"You can't edit your own profile from this page. Contact your account owner to make changes."* Same copy regardless of role (Owner or Admin). Don't redirect away — show the message so the user understands why.
- **Unauthorized access (PM/Foreman/Crew):** Redirect to `/dashboard`.

### Password reset mechanism

- **Mechanism:** `supabase.auth.resetPasswordForEmail(email, { redirectTo })` — Supabase generates the link AND sends the email. No Resend integration needed today. Email uses Supabase's default template until tech debt #47 is addressed.
- **Redirect target:** `${process.env.NEXT_PUBLIC_APP_URL}/reset-password` — page already exists from Session 23.
- **Considered and rejected:**
  - Option 2 (Owner/Admin types new password directly) — security risk, requires out-of-band sharing.
  - Option 3 (generate magic link to copy/paste manually) — useful as fallback if email broken; not needed now.

### Delete behavior

- **Mechanism:** `is_deleted = true` on `profiles` AND `auth.admin.updateUserById(userId, { ban_duration: '876000h' })` to ban the auth user (~100 years; Supabase has no true permanent-ban API). Restore = un-delete + un-ban (`ban_duration: 'none'`).
- **Why both ops:** Defense in depth. A soft delete on `profiles` alone wouldn't stop login — every page that depends on profile lookup would have to handle "profile not found" cleanly. Banning at the auth layer makes login fail outright.
- **Verified safe to ship:** `apps/web/lib/services/seats.ts` already filters `.eq('is_deleted', false)` on the member count query. Soft-deleting a profile WILL free up a seat. Confirmed before writing the delete action.
- **Considered and rejected:**
  - Option A (soft delete only) — fragile, depends on every page handling missing profile.
  - Option C (hard-delete auth user) — breaks restore flow, would require re-invite.

### Bundling the migration

- `notes` add and `is_active` drop went in a single Migration 026, both `ALTER TABLE profiles`. Decided to fix `is_active` now (vs. logging as debt) because it was a 2-minute, zero-risk change adjacent to other schema work — the cost of context-switching back later exceeded the cost of doing it now.

---

## What was built

### Migration 026 — `20260420000003_add_notes_drop_is_active_on_profiles.sql`

```sql
ALTER TABLE profiles ADD COLUMN notes TEXT;
ALTER TABLE profiles DROP COLUMN is_active;
```

Applied via `npx supabase db push`. Types regenerated via `npm run db:types`. Type-check clean — confirmed nothing in the codebase referenced `is_active`.

Commit: `635fed3` `[DB] Migration 026 — add profiles.notes (#17), drop unused is_active`

### Service layer additions to `apps/web/lib/services/team.ts`

Four new exports, all following the existing `team.ts` pattern (functions take `supabase: SupabaseClient` as first arg):

- `TeamMemberDetail` type — `Pick<>` from `ProfileRow` covering all editable + display fields plus `user_id` and `is_deleted` for the actions.
- `getTeamMember(supabase, id)` — fetch one. Returns `TeamMemberDetail`. Does NOT filter `is_deleted` (consistent with `get{Entity}(id)` convention from CLAUDE.md trash-bin pattern — single-row fetch must work for restore flows even though restore-from-trash for team isn't built yet).
- `updateTeamMember(supabase, id, updates)` — partial update of editable fields. RLS enforces who can change what.
- `softDeleteTeamMember(supabase, supabaseAdmin, profileId, userId)` — sets `is_deleted = true` + `deleted_at` AND bans auth user via `876000h`.
- `resetTeamMemberPassword(supabase, email, redirectTo)` — wraps `auth.resetPasswordForEmail`. Caller authorization checked in the server action, not here.

Commit: `2e6b3d9` `[Team] Service layer for member detail page (#14, #15, #16, #17)`

### Shared admin client extract

`getSupabaseAdmin()` was duplicated inline in `apps/web/app/api/stripe/webhook/route.ts`. Extracted to new file `apps/web/lib/supabase-admin.ts`, refactored webhook to import it. Side benefit: cached client is now properly typed as `SupabaseClient | null` instead of `any`.

The webhook is currently the only other consumer; the new server actions are the second.

### Server actions — `apps/web/app/dashboard/team/[id]/actions.ts`

Three server actions plus two helpers:

- `getCallerProfile()` — fetches the calling user's profile (id, role, company_id). Throws if not authenticated or profile missing.
- `assertCanEdit(callerRole, callerProfileId, targetProfileId, targetRole)` — throws on self-edit attempt, on PM/Foreman/Crew callers, on Admin trying to edit Owner/Admin. Owner passes through.
- `updateTeamMemberAction(targetId, updates)` — verifies, blocks Admin from setting role='owner'/'admin' (defense in depth on top of RLS), calls `updateTeamMember`, revalidates `/dashboard/team` and `/dashboard/team/[id]`.
- `deleteTeamMemberAction(targetId)` — verifies, calls `softDeleteTeamMember`, revalidates `/dashboard/team`, redirects to `/dashboard/team`.
- `resetPasswordAction(targetId)` — verifies, calls `resetTeamMemberPassword` with `${APP_URL}/reset-password`.

Commit (extract + actions bundled, tightly coupled): `6e75789` `[Team] Extract getSupabaseAdmin to shared module + add team member server actions (#14, #15, #16)`

---

## Side-effect issues encountered

### Paste-strip on `<` (CLAUDE.md gotcha bit us)

When asked to paste a 13-line `Pick<>` block into the editor, the chat editor stripped the `<` character from `Pick<\nProfileRow,` — producing `Pick\nProfileRow,` and breaking the file with two TS1109 errors. CLAUDE.md explicitly documents this gotcha. Recovered via `node -e` with a `.replace()`. Lesson: **any code containing `<` must go through Claude Code or `node -e` from the start, never chat paste.** Subsequent code in this session went through Claude Code and survived intact.

For Session 38: the form file (`edit-form.tsx`) will have many `<...>` tags. **Default to Claude Code for all of it.**

### Migration was applied via SQL editor in a previous session (no recurrence)

Migration 024 was applied via SQL editor in Session 35; the CLI history was repaired in Session 36. Migration 026 went through `supabase db push` cleanly with no repair needed. Pattern from Session 36 (always use `supabase db push`, or immediately repair history if you don't) is holding.

### Claude Code glob warning on `[id]` directory creation

Claude Code's safety check flagged `mkdir -p .../team/\[id\]` because the brackets look like glob characters. The `\[id\]` shell-escaping is correct. Approved manually.

### Supabase CLI version notice (cosmetic)

`db push` reported v2.88.1 installed, v2.90.0 available. Not blocking.

---

## Tech debt changes

### Updated (in progress, not closed)

- **#14** Team member edit UI — IN PROGRESS Session 37. Migration 026 + service layer + server actions done. Page + form + row-click wiring remaining for Session 38.
- **#15** Team member delete UI — IN PROGRESS Session 37 (server action done; UI button remaining).
- **#16** Team member password reset — IN PROGRESS Session 37 (server action done; UI button remaining).
- **#17** Team member notes field — IN PROGRESS Session 37 (Migration 026 added column; form field remaining).

### Added

- **#68** `getSupabaseAdmin()` was duplicated inline in the Stripe webhook before Session 37. Now extracted to `apps/web/lib/supabase-admin.ts`. CLAUDE.md mentions the lazy-init pattern but does not point to the file path. Add a Service Layer Pattern note in CLAUDE.md pointing to `@/lib/supabase-admin` so future AI features (Module 4 estimating, Module 9 summaries, Module 10 NL queries, Module 11 marketing) don't re-create their own copies. Pre-Module 4.
- **#69** `softDeleteTeamMember` uses `ban_duration: '876000h'` (~100 years) as a stand-in for permanent ban. Supabase has no true permanent-ban API. Verify this duration is honored on auth attempts during Session 38 smoke test. If it's silently ignored or capped, switch to deleting the auth user (with the trade-off documented in Session 37 — restore would require re-invite). Verify and decide before public launch.

### Closed

None. All four items in the polish plan batch (#14–#17) are partial.

---

## Decisions deferred to Session 38 (form-build UX details)

These were not discussed this session and need answers before the form is built:

1. **Delete confirmation pattern** — native `window.confirm()`, custom modal, or two-step button (click Delete → button transforms to "Confirm delete" + Cancel)?
2. **Reset password confirmation** — same question. Less destructive than delete, so maybe just a confirmation toast, not a pre-action confirm.
3. **Success feedback after save** — toast, banner, redirect to `/team`, or stay on page?
4. **Success feedback after reset** — same question. Probably "email sent to {email}" toast or banner, since the action has no visible effect on the page.
5. **Phone input format** — free text or formatted (xxx) xxx-xxxx? Tech debt #5 also flags this for contacts. Probably free text now, address #5 separately later.
6. **Role dropdown UI** — `<select>` or radio group? Probably `<select>` for consistency with existing forms, but worth a 5-second decision.

---

## Things assumed but not verified — Session 38 should test live

1. **Migration 025 RLS WITH CHECK actually blocks Admin from setting role='owner'/'admin'.** Migration 025 closure notes claim this; verify with a live test (Admin user attempts to set role='admin' on a Crew → should fail).
2. **`created_at` populated for all existing profiles.** Legacy users from before Migration 007 may have NULL — display-only logic must handle this gracefully ("Added —" or similar).
3. **`revalidatePath` actually invalidates the cached page.** Standard Next.js 14 App Router pattern; should work but unverified in this codebase.
4. **`876000h` ban duration is honored** (already #69).

---

## Owner-promotes-to-Owner UX gap

`actions.ts` currently allows Owner to set `role='owner'` on another user. Migration 024 added a unique partial index `profiles_one_owner_per_company` — the DB will reject the second-Owner write with a unique violation. The user would see a generic error.

This is the territory of tech debt #66 (ownership transfer). Promoting someone to Owner isn't an "edit role" — it's a transfer that demotes the current Owner.

**Two options for Session 38:**

- **A — Remove 'owner' from the role dropdown entirely.** Forces users down the #66 path (which doesn't exist yet either, so no immediate path to set a new Owner via this UI).
- **B — Catch the unique-violation error in the action and show a friendly "Use ownership transfer instead" message** that points at #66 once it ships.

Recommend A for Session 38 — simpler, and the right behavior. #66 will provide the actual path when it's built (next polish session after #14–#17).

---

## Audit trail — files touched this session

**New files:**
- `supabase/migrations/20260420000003_add_notes_drop_is_active_on_profiles.sql`
- `apps/web/lib/supabase-admin.ts`
- `apps/web/app/dashboard/team/[id]/actions.ts`

**Modified:**
- `apps/web/lib/services/team.ts` (4 functions added, 1 type added)
- `apps/web/app/api/stripe/webhook/route.ts` (extract refactor)
- `packages/shared/types/database.ts` (regenerated from new schema)
- `TECH_DEBT.md` (4 items updated to IN PROGRESS, 2 items added)

**Commits:**
- `635fed3` Migration 026
- `2e6b3d9` Service layer (4 functions)
- `6e75789` getSupabaseAdmin extract + actions

---

## How to start Session 38

1. Open Codespace, `git pull`, run `bash scripts/session-start.sh`.
2. Open new Claude Chat with project knowledge (CLAUDE.md, STATE.md, Quick Reference).
3. Paste session-start snapshot + `context37.md`.
4. State goal: finish #14–#17 by building the page, the form, and the row-click wiring; smoke-test against Bishop Contracting.

**Concrete entry point:** Open `apps/web/app/dashboard/team/[id]/actions.ts` to see the contract the form needs to call.

**Build order for Session 38:**

1. **Make the form-build decisions** listed in "Decisions deferred to Session 38" above (six small UX questions). Lock them before any code.
2. **Decide owner-promotion UX** (Option A — remove from dropdown — recommended).
3. **`page.tsx`** — server component. Fetches caller profile + target profile. Handles three cases: unauthorized (PM/Foreman/Crew → redirect `/dashboard`), self (render read-only with locked message), normal edit (pass data to form). Auth gate happens here, not in the form.
4. **`edit-form.tsx`** — `'use client'`. Controlled inputs for the 5 editable fields. Role dropdown filtered by caller role. Delete and Reset Password buttons with confirmations. Calls server actions from `actions.ts`.
5. **Wire row click on `apps/web/app/dashboard/team/team-page-client.tsx`** to navigate to `/dashboard/team/[id]`. Small change.
6. **Smoke test against Bishop Contracting:**
   - Owner editing a PM (Bishop has `josh+test40@worthprop.com` as Admin; need a PM-role test user OR temporarily change a profile to PM via SQL editor).
   - Admin editing a Crew member.
   - Admin attempting to navigate to Owner's `/team/[id]` — should redirect or 403.
   - Self-access — Owner navigates to own `/team/[id]` — should show locked message.
   - Delete a member, verify they can't log in (open incognito, try the credentials).
   - Reset password, verify email received.
   - Verify seat count drops by 1 after a delete.
7. **Update `STATE.md`** — Migration 026, Module 3 status unchanged, polish plan reduced from three items to one (#66 only).
8. **Close session** — context38.md, commit, push.

**After Session 38, only #66 (ownership transfer UI) remains before Module 4 build can begin.** #66 depends on team detail page existing (this session's work) — they're sequential.

**Reminder for Session 38: any code containing `<` goes through Claude Code, never chat paste.** Especially `edit-form.tsx` (full of JSX). Don't repeat the paste-strip incident.
