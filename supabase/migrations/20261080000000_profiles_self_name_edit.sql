-- Self-service NAME edit [Josh, S177]. A user may correct their OWN first/last
-- name. Until now the only UPDATE policies on `profiles` were `_owner` and
-- `_admin`, so a foreman (or anyone) had no path to fix their own name, and even
-- the Owner's own name could only be changed in the database (the desktop Team
-- edit blocks self-edit). See public-site-build-log.md.
--
-- ⚠️ THE TWO OBJECTS BELOW ARE INSEPARABLE. The policy alone is a BLANKET
-- self-update — RLS WITH CHECK cannot see OLD, so it would happily admit a user
-- flipping their own `role` to 'owner', which is the entire authority model. The
-- column-scope TRIGGER is the actual guard: it refuses any self-update that
-- changes anything but the name. Never ship one without the other.

-- 1. The missing self arm. Admits a user editing their OWN row (any columns —
--    the trigger below is what narrows it to the name).
CREATE POLICY profiles_update_self ON public.profiles
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 2. The column scope. Same mechanism as enforce_client_contracts_column_scope
--    and the payments trigger: a BEFORE-UPDATE trigger comparing NEW to OLD,
--    because RLS cannot. DEFAULT-DENY: rebuild the row the user is ALLOWED to
--    produce (OLD with only name + audit columns overridden) and refuse any other
--    difference — so a column added to `profiles` in future is protected
--    automatically rather than silently editable.
CREATE OR REPLACE FUNCTION public.enforce_profiles_self_column_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  expected public.profiles%ROWTYPE;
BEGIN
  -- Service role / no auth context (the seed, the admin client): not a self-serve
  -- edit. RLS already governs those paths; do not constrain them, or the seed
  -- could no longer set a role.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Only constrain a user editing their OWN row. Owner/Admin edits of OTHER
  -- members go through profiles_update_{owner,admin} + Team management and must be
  -- untouched here.
  IF auth.uid() IS DISTINCT FROM OLD.user_id THEN
    RETURN NEW;
  END IF;

  -- Self-serve is NAME ONLY. `updated_at` is set by the profiles_updated_at
  -- trigger; `updated_by` is an audit column — both are allowed to move. Anything
  -- else changing on a self-update — role, company_id, is_deleted, email,
  -- contact_id, client_access_state, avatar_url, phone, notes, user_id, id,
  -- created_* … — is refused.
  expected := OLD;
  expected.first_name := NEW.first_name;
  expected.last_name  := NEW.last_name;
  expected.updated_at := NEW.updated_at;
  expected.updated_by := NEW.updated_by;

  IF NEW IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'You can change your own first and last name only.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_self_column_scope
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_profiles_self_column_scope();
