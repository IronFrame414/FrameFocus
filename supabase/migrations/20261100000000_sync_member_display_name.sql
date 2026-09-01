-- Keep company_members.display_name IN STEP with the linked profile's name.
--
-- ⚠️ THIS DELIBERATELY OVERTURNS spec F-6's "no sync trigger" — FOR STAFF ONLY —
-- RULED [Josh, register 1.2 / §S6].
--
-- Context. `create_member_for_new_profile()` (20260704210000) sets a crew/staff
-- member's `display_name` ONCE at INSERT, from `first_name || ' ' || last_name`.
-- `20260704210000` line 212-213 states the F-6 default: "set once at creation,
-- editable afterwards, NO sync trigger." That default is why the field DRIFTED:
-- `updateMyName` (lib/services/profile-self.ts) and every other name-edit path
-- rename `profiles.first_name/last_name` and never touch `display_name`, so the
-- app's PRIMARY member-name field (read by 30+ features) goes stale on any rename
-- — exactly how the "Josh Bishop" vs "Dave Whitfield" divergence surfaced.
--
-- Josh's ruling: display_name should MIRROR the profile name. Correcting one row
-- is not the fix; keeping it in step is. So this adds the sync F-6 omitted.
--
-- ⚠️ SUBCONTRACTORS ARE EXEMPT, and that is NOT a softening of the ruling — it is
-- F-6's OTHER half, which stands. A subcontractor member's `display_name` is the
-- COMPANY NAME (`create_member_for_new_subcontractor()`), never a person's name,
-- so mirroring a linked profile's person-name onto it would be wrong. The sync is
-- scoped to `member_type <> 'subcontractor'`; a sub member linked to a profile
-- keeps its company_name.

CREATE OR REPLACE FUNCTION public.sync_member_display_name()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only when the name actually changed — avoids writing company_members (and
  -- firing its updated_at/updated_by triggers) on every unrelated profile UPDATE.
  IF NEW.first_name IS DISTINCT FROM OLD.first_name
     OR NEW.last_name IS DISTINCT FROM OLD.last_name THEN
    UPDATE company_members
    SET display_name = COALESCE(
          NULLIF(TRIM(COALESCE(NEW.first_name, '') || ' ' || COALESCE(NEW.last_name, '')), ''),
          NEW.email
        )
    WHERE profile_id = NEW.id
      AND member_type <> 'subcontractor'
      AND is_deleted = false;
  END IF;
  RETURN NEW;
END;
$$;

-- AFTER UPDATE: the mirror follows the write, it does not gate it. No loop risk —
-- this writes company_members, whose triggers do not write back to profiles.
CREATE TRIGGER profiles_sync_member_display_name
  AFTER UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_member_display_name();

-- Reconcile any staff rows that already drifted (production will have them; on
-- rebuild-test this touches 0 because the stale owner row was already corrected).
-- Same formula and same subcontractor exemption as the trigger above.
UPDATE public.company_members cm
SET display_name = COALESCE(
      NULLIF(TRIM(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')), ''),
      p.email
    )
FROM public.profiles p
WHERE p.id = cm.profile_id
  AND cm.member_type <> 'subcontractor'
  AND cm.is_deleted = false
  AND cm.display_name IS DISTINCT FROM COALESCE(
      NULLIF(TRIM(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')), ''),
      p.email
    );
