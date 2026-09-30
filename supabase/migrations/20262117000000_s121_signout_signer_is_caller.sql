-- ============================================================================
-- S121 3-C — THE RELEASE SIGNER IS THE CALLER. NOT EDITABLE.
-- ============================================================================
-- [RULED Josh, ASK-15, 2026-09-30]: the "released by" name on a material
-- sign-out is the signed-in user's own name and cannot be typed over — "a
-- foreman cannot sign for someone else; they sign as themselves." A read-only
-- input is a suggestion; THIS is the rule. Whatever the client sends in
-- `released_signer_name`, the row stores the caller's profile name.
--
-- WHY A TRIGGER: creating a sign-out is a plain client INSERT under
-- `material_signouts_insert_staff` (20262080000000) — there is no function in
-- the write path to put the check in, and there is no UPDATE policy on the
-- table, so INSERT is the only way the column is ever written by a client.
--
-- WHY A SEPARATE SQL SECURITY DEFINER HELPER: CLAUDE.md's gotcha — a
-- row-security change inside a plpgsql trigger is silently ignored; the
-- RLS-protected read goes in its own SQL definer function. `profiles` is keyed
-- on `user_id = auth.uid()` (the same shape get_my_role() reads).
--
-- The name is formed exactly as the form's default is formed
-- (lib/services/material-signouts.ts getSignoutViewer: first + ' ' + last,
-- blanks dropped), so what the screen shows is what is stored.
--
-- A service-role insert (auth.uid() IS NULL — the live tests, a backfill) is
-- left alone: it is not a person signing.
--
-- No constraint over existing rows: a BEFORE INSERT trigger touches only rows
-- inserted after it exists. Production holds 1 row (counted S121 §1.4).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.material_signout_caller_name()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT NULLIF(btrim(concat_ws(' ', NULLIF(btrim(p.first_name), ''), NULLIF(btrim(p.last_name), ''))), '')
    FROM profiles p
   WHERE p.user_id = auth.uid()
     AND p.is_deleted = false
   -- ⚠️ Genuinely one row: profiles.user_id is one live profile per auth user
   -- (the same unordered LIMIT 1 get_my_role() uses); ordered anyway so a
   -- duplicate could never make the stored name depend on heap order.
   ORDER BY p.created_at
   LIMIT 1;
$function$;
REVOKE ALL ON FUNCTION public.material_signout_caller_name() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.enforce_material_signout_released_signer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_name text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW; -- service role: not a person signing
  END IF;
  v_name := public.material_signout_caller_name();
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Your profile has no name, so you cannot sign. Add your name in your profile first.'
      USING ERRCODE = '22023';
  END IF;
  NEW.released_signer_name := v_name;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.enforce_material_signout_released_signer() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER material_signouts_released_signer_is_caller
  BEFORE INSERT ON public.material_signouts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_material_signout_released_signer();

COMMENT ON FUNCTION public.enforce_material_signout_released_signer() IS
  'S121 3-C [RULED Josh ASK-15]: released_signer_name is ALWAYS the caller''s own profile name on a client insert; the typed value is ignored. Service-role inserts are untouched.';
