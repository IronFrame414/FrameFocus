-- S127: restore reopen_session_on_segment_hours() to its pre-S127 definition.
-- Captured from rebuild-test nmyphyhmfttxkdoposvf and production jwkcknyuyvcwcdeskrmz (identical, md5
-- 27f18f288f62a006e12d033b5005741e of pg_get_functiondef). ACL unchanged by CREATE OR REPLACE:
-- {postgres=X/postgres,service_role=X/postgres,supabase_auth_admin=X/postgres}. Comment: NULL.

CREATE OR REPLACE FUNCTION public.reopen_session_on_segment_hours()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- The week sheet's functions reopen (and report it) themselves.
  IF COALESCE(current_setting('framefocus.time_edit', true), '') <> '' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.segment_start IS NOT DISTINCT FROM OLD.segment_start
     AND NEW.segment_end IS NOT DISTINCT FROM OLD.segment_end
     AND NEW.is_deleted IS NOT DISTINCT FROM OLD.is_deleted THEN
    RETURN NEW;  -- attribution only (job, task, note, completion): hours unchanged
  END IF;

  -- A member's OWN segment write that is not Owner/Admin is the live clock
  -- flow (switch, clock-out) on an OPEN session — the column scope allows a
  -- self writer nothing else. Its session write (clock_out) is reopened by (1).
  -- Reopening from here would make the column-scope trigger refuse the self
  -- writer's status change and break a clock-out. Owner/Admin editing their
  -- own segment times directly still reopens.
  IF public.time_session_member(NEW.session_id) IS NOT DISTINCT FROM public.get_my_member_id()
     AND NOT COALESCE(public.get_my_role() = ANY (ARRAY['owner', 'admin']), false) THEN
    RETURN NEW;
  END IF;

  -- SECURITY DEFINER: the writer was already authorised for the SEGMENT by RLS
  -- and time_segments_column_scope; reopening the parent session is the
  -- consequence of that write, not a second permission.
  UPDATE public.time_clock_sessions
     SET status = 'pending', approved_by = NULL, approved_at = NULL
   WHERE id = NEW.session_id AND status = 'approved';
  RETURN NEW;
END;
$function$;
