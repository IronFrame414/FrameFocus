-- S109 #160 — A PROFILE AND ITS MEMBER ROW AGREE ON WHETHER THE PERSON IS DELETED.
-- [RULED Josh: "the fix belongs in the DATABASE, not in each delete path."
--  ASK-160.A: the migration cleans existing ghosts. ASK-160.C: subcontractor
--  member rows are excluded.]
--
-- The defect. `softDeleteTeamMember()` (lib/services/team.ts) marks
-- `profiles.is_deleted` and bans the auth user, and never touches
-- `company_members`. The pickers read `company_members` via `getMembers()`,
-- which filters `company_members.is_deleted` only — so a removed person stayed
-- assignable. Hit on PRODUCTION twice: the 2026-09-22 "Juan Cardona" duplicate
-- (cleaned by hand) and, at S109, "Jo B" (`jsbishop14+p3@gmail.com`, member
-- 3305f15b-4b28-48cf-8f88-6f84bbbe8661) — i.e. still producing ghosts.
--
-- WHY A TRIGGER. A second `.update()` in `softDeleteTeamMember()` would work
-- today and fail the moment anything else soft-deletes a profile — a SQL
-- script, an admin tool, trial lifecycle code, a future restore flow. The two
-- tables must agree by construction.
--
-- THE RULES THE TRIGGER FOLLOWS, each measured in S109 Phase 1:
--   1. BOTH DIRECTIONS. Deleting a profile deletes the member row; restoring the
--      profile restores it. Otherwise un-deleting a person leaves them
--      unassignable (the trash-bin pattern breaks the other way).
--   2. ONLY WHEN `is_deleted` CHANGES. `/m/team`'s edit form writes the profile
--      on every save, in the same submit that writes the member row's own
--      `is_deleted` (its Inactive toggle). A trigger that copied `is_deleted` on
--      ANY profile UPDATE would silently undo that deactivation. `UPDATE OF
--      is_deleted` plus `IS DISTINCT FROM` guarantees a profile save that does
--      not change deletion does not touch the member row.
--   3. `profile_id` MATCH ONLY. Member rows with `profile_id IS NULL` (directory
--      subs and vendors never linked to a login — 576 on rebuild-test) are not
--      reached.
--   4. `member_type = 'subcontractor'` IS EXCLUDED (ASK-160.C). `handle_new_user()`
--      links an invited sub user's profile to the sub DIRECTORY's member row.
--      Removing that login must not take the sub company out of every picker
--      while its `subcontractors` row stays live. Production has 7 such rows.
--      Same exemption, same reason, as `sync_member_display_name()`.
--
-- HISTORY IS UNTOUCHED. This is a soft delete of the member row: the 43 FKs to
-- `company_members.id` keep pointing at it, and `company_members_select_visible`
-- has no `is_deleted` term, so past time entries, assignments, chat and invoices
-- keep their names. The readers that filter `m.is_deleted` already filter
-- `p.is_deleted` too (`get_my_member_id()` et al.), so for a deleted profile
-- nothing but the pickers changes.
--
-- NOT COVERED, BY RULING (ASK-160.B): `/m/team`'s member-only Inactive toggle
-- deactivates the member row without touching the profile or banning the login.
-- Filed separately as a defect (TECH_DEBT `#1-s109`).
--
-- SECURITY DEFINER, as `sync_member_display_name()` — the caller (an Owner/Admin
-- via RLS, or the service role) may not hold UPDATE on the member row directly.

CREATE OR REPLACE FUNCTION public.sync_member_deleted_from_profile()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.is_deleted IS DISTINCT FROM OLD.is_deleted THEN
    UPDATE company_members
    SET is_deleted = COALESCE(NEW.is_deleted, false),
        deleted_at = CASE
                       WHEN COALESCE(NEW.is_deleted, false) THEN COALESCE(NEW.deleted_at, now())
                       ELSE NULL
                     END
    WHERE profile_id = NEW.id
      AND member_type <> 'subcontractor'
      AND COALESCE(is_deleted, false) IS DISTINCT FROM COALESCE(NEW.is_deleted, false);
  END IF;
  RETURN NEW;
END;
$$;

-- AFTER UPDATE OF is_deleted: the member row follows the write, it does not gate
-- it. No loop — company_members' triggers do not write back to profiles.
DROP TRIGGER IF EXISTS profiles_sync_member_deleted ON public.profiles;

CREATE TRIGGER profiles_sync_member_deleted
  AFTER UPDATE OF is_deleted ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_member_deleted_from_profile();

-- ASK-160.A — clean the ghosts that already exist. Same scope as the trigger.
-- Production: exactly one (Jo B, above). Rebuild-test: 0 at S109 Phase 1.
-- A soft delete — no row is destroyed.
UPDATE public.company_members cm
SET is_deleted = true,
    deleted_at = COALESCE(p.deleted_at, now())
FROM public.profiles p
WHERE p.id = cm.profile_id
  AND p.is_deleted
  AND NOT COALESCE(cm.is_deleted, false)
  AND cm.member_type <> 'subcontractor';

-- The ruling says the ghost "must be gone after the migration runs". So the
-- migration checks its own result and refuses to commit if it is not.
DO $$
DECLARE
  v_left integer;
BEGIN
  SELECT count(*) INTO v_left
  FROM public.company_members cm
  JOIN public.profiles p ON p.id = cm.profile_id
  WHERE p.is_deleted
    AND NOT COALESCE(cm.is_deleted, false)
    AND cm.member_type <> 'subcontractor';
  IF v_left <> 0 THEN
    RAISE EXCEPTION '#160: % ghost member row(s) remain after the clean-up', v_left;
  END IF;
END;
$$;
