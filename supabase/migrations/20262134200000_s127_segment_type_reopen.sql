-- ============================================================================
-- S127 ITEM 7 — A WORK ↔ BREAK CHANGE ON AN APPROVED DAY RETURNS IT TO PENDING.
-- [RULED Josh, S127 #8: build it. #9: existing rows are REPORTED, NOT CORRECTED.]
-- ============================================================================
--
-- ⚠️ THE DEFECT (found S124, enumerated S127 1.4c). S122 0-B-4 made an HOURS
-- change on an approved day return it to pending on every path, because
-- approval is what authorises payroll. A segment-TYPE change does not touch the
-- clock times — so `reopen_session_on_segment_hours()` took it for
-- "attribution only" and returned early — but breaks are paid or unpaid per
-- `companies.breaks_paid` / `paid_break_cap_minutes`, so flipping work ↔ break
-- moves what is PAID without anyone re-approving the number.
--
-- THE PATHS (S127 1.4c), and what each does after this:
--   week sheet / day page (Owner/Admin) → edit_time_segment: ALREADY reopened
--     (s121_time_reopen, unconditional) — unchanged; the flag skip below keeps
--     it the sheet's job.
--   day page, SUPERVISOR (PE/PM/foreman) → plain UPDATE: did NOT reopen → NOW
--     REOPENS (the case-(2) UPDATE below).
--   direct PATCH by Owner/Admin → did NOT reopen → NOW REOPENS.
--   direct PATCH by the segment's OWN member on a CLOSED approved day → did
--     not reopen and was not audited → NOW REFUSED. A self writer may not
--     change hours on a closed day at all (the session column scope already
--     refuses their clock times there); reopening would need their own status
--     write, which that scope forbids. Refusing is 0-B-4's actual treatment of
--     self, applied to type.
--   the live clock flow (self, OPEN session) → never changes type → unchanged.
--
-- ⚠️ WHICH TYPE CHANGES COUNT: to or from 'break' — the only type
-- `paidHours`/`breakMinutes` read (packages/shared/utils/time-tracking.ts).
-- work ↔ travel ↔ shop … moves job cost, not pay, and stays attribution, like a
-- project or task change. The ruling's words are "a work ↔ break change".
--
-- ⚠️ REPLACES `reopen_session_on_segment_hours()` IN PLACE. Captured original
-- (md5 27f18f288f62a006e12d033b5005741e, identical on both databases), ACL and
-- RESTORE: docs/sessions/S127-sabotage-originals/reopen_session_on_segment_hours/.
-- The trigger is untouched. Every S122 line is kept; additions are [S127].
--
-- ⚠️ NO EXISTING ROW IS TOUCHED (#9). Production at S127: 0 `time_edit_logs`
-- rows carry a segment_type change, so 0 approved days are affected.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reopen_session_on_segment_hours()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- [S127] A change that moves PAID time without moving a clock time.
  v_pay_type_change boolean := false;
BEGIN
  -- [S127] Computed only on UPDATE: OLD does not exist on INSERT, and SQL does
  -- not promise to short-circuit an AND.
  IF TG_OP = 'UPDATE' THEN
    v_pay_type_change := NEW.segment_type IS DISTINCT FROM OLD.segment_type
                         AND 'break' IN (OLD.segment_type, NEW.segment_type);
  END IF;
  -- The week sheet's functions reopen (and report it) themselves.
  IF COALESCE(current_setting('framefocus.time_edit', true), '') <> '' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND NEW.segment_start IS NOT DISTINCT FROM OLD.segment_start
     AND NEW.segment_end IS NOT DISTINCT FROM OLD.segment_end
     AND NEW.is_deleted IS NOT DISTINCT FROM OLD.is_deleted
     AND NOT v_pay_type_change THEN  -- [S127]
    RETURN NEW;  -- attribution only (job, task, note, completion, a non-break type): hours unchanged
  END IF;
  -- A member's OWN segment write that is not Owner/Admin is the live clock
  -- flow (switch, clock-out) on an OPEN session — the column scope allows a
  -- self writer nothing else. Its session write (clock_out) is reopened by (1).
  -- Reopening from here would make the column-scope trigger refuse the self
  -- writer's status change and break a clock-out. Owner/Admin editing their
  -- own segment times directly still reopens.
  IF public.time_session_member(NEW.session_id) IS NOT DISTINCT FROM public.get_my_member_id()
     AND NOT COALESCE(public.get_my_role() = ANY (ARRAY['owner', 'admin']), false) THEN
    -- [S127] …except a work ↔ break flip on their own APPROVED day, which the
    -- live flow never makes (it inserts segments; it does not retype them) and
    -- which `is_my_recent_segment` would otherwise admit through the API. Not
    -- reopened (their own status write is refused), not silently kept: refused.
    IF v_pay_type_change AND EXISTS (
         SELECT 1 FROM public.time_clock_sessions s
          WHERE s.id = NEW.session_id AND s.status = 'approved') THEN
      RAISE EXCEPTION 'This day is approved. Ask a supervisor to change a break.'
        USING ERRCODE = '42501';
    END IF;
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
