# Context — FrameFocus Session 36

**Date:** April 20, 2026
**Scope:** Second polish session of pre-Module-4 cleanup. Close tech debt #43.
**Outcome:** #43 closed via Migration 025. Polish plan reduced from four items to three.

---

## Tech debt closed

### #43 — Profiles UPDATE RLS policies (Admin Role Principle alignment)

**What was wrong:** `profiles_update_owner` was Owner-only with no Admin equivalent. Per CLAUDE.md's Admin Role Principle, Admin should have most update rights too. Separately, `profiles_update_own` allowed any user (including PM/Foreman/Crew) to update their own profile, which Josh decided was undesirable — profile edits should be controlled by Owner/Admin only.

**Final design (locked after multiple clarifications):**

- **Owner**: edits any profile in company. Cannot demote self (must remain Owner).
- **Admin**: edits non-Owner, non-Admin, non-self profiles only. Cannot promote anyone to admin or owner.
- **PM/Foreman/Crew**: cannot update any profile, including own.

**Fix — Migration 025 (`20260420000002_update_profiles_rls_policies_for_admin.sql`):**

1. Dropped `profiles_update_own` entirely.
2. Replaced `profiles_update_owner` — same USING, but WITH CHECK adds `(user_id != auth.uid() OR role = 'owner')` to prevent Owner from demoting self.
3. Added `profiles_update_admin` — USING and WITH CHECK gate on `get_my_role()='admin' AND user_id != auth.uid() AND role NOT IN ('owner', 'admin')`.

**Verified post-apply:** `pg_policy` query confirmed all three policies match design exactly. No functional UI testing — the team edit UI is #14 (not yet built); these policies are the safety net waiting for the UI.

**Commits:** Single commit `[DB] Tech debt #43 — Admin can update non-Owner/non-Admin profiles, drop self-update`.

---

## Side-effect issues encountered

### Migration 024 already applied via SQL Editor (Session 35 leftover)

`npx supabase db push` failed on first run trying to re-apply Migration 024 — `relation "profiles_one_owner_per_company" already exists`. Migration 024 had been applied directly in the Supabase SQL Editor during Session 35 (not via CLI), so the CLI's migration history was out of sync with remote.

**Resolution:** `npx supabase migration repair --status applied 20260420000001` marked 024 as applied without re-running it. Then `npx supabase db push` cleanly applied 025.

**Worth noting for future sessions:** When a migration is applied via the SQL Editor instead of `supabase db push`, the CLI's migration history won't know. The next CLI push will try to re-apply and fail. Either always use `supabase db push`, or immediately follow a SQL Editor application with `supabase migration repair --status applied <timestamp>` so history stays in sync.

---

## Doc updates

- **TECH_DEBT.md:** #43 moved from Lower Priority to Closed section. Polish Session Plan reduced from four items to three (#14/#15/#16/#17 batch and #66 remain).
- **STATE.md:** Header bumped to Session 36. Migration count bumped 25 → 26. `profiles` table row updated to describe new UPDATE policy structure. RLS policies summary line for profiles expanded to list all current policies.
- **CLAUDE.md:** No edits.

---

## Audit trail — files touched

- `supabase/migrations/20260420000002_update_profiles_rls_policies_for_admin.sql` (new)
- `TECH_DEBT.md`
- `STATE.md`
- `docs/sessions/context35.md` (committed at session start — leftover from Session 35)

---

## How to start Session 37

Session 37 is **next in the polish plan: #14/#15/#16/#17** — team member detail page (`/dashboard/team/[id]`) with edit, delete, password reset, and notes field. This is one coherent UI build, not four separate sessions.

1. Open Codespace, `git pull`, run `bash scripts/session-start.sh`.
2. Open new Claude Chat with project knowledge (CLAUDE.md, STATE.md, Quick Reference).
3. Paste session-start snapshot + `context36.md`.
4. State goal: build `/dashboard/team/[id]` covering #14–#17.
5. Plan before touching code:
   - Decide page shape: dedicated edit page vs. modal on team list.
   - List the fields to edit (name, role, notes, etc.) — verify against `profiles` schema in `database.ts`.
   - Decide where the password reset action lives (button on detail page that triggers Supabase admin reset email).
   - Decide delete behavior — soft delete via `is_deleted`, or hard delete? Probably soft (matches everything else in the codebase).
   - The new RLS policies from #43 are the safety net — Admin will only see edit options on non-Owner/non-Admin team members.
   - Notes field (#17) likely needs a migration to add a `notes` column to `profiles`. Confirm column doesn't already exist.
6. After #14–#17, only **#66** (ownership transfer UI) remains before Module 4 build can begin.
