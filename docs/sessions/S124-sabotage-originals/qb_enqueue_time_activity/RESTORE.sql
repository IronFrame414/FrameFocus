CREATE OR REPLACE FUNCTION public.qb_enqueue_time_activity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- ONLY the transition INTO 'approved', on a live, closed session.
  IF NEW.status IS DISTINCT FROM 'approved'
     OR OLD.status IS NOT DISTINCT FROM 'approved'
     OR NEW.is_deleted IS DISTINCT FROM false
     OR NEW.clock_out IS NULL THEN
    RETURN NEW;
  END IF;

  -- ⚠️ THE GATE. Off (the default) → nothing is queued, and nothing remembers
  -- that it could have been: no backfill when it is later turned on.
  IF NOT EXISTS (
    SELECT 1 FROM companies c
     WHERE c.id = NEW.company_id
       AND c.qb_time_export_enabled = true
       AND c.qb_connection_state = 'connected'
  ) THEN
    RETURN NEW;
  END IF;

  PERFORM public.qb_enqueue(
    NEW.company_id,
    'time_activity',
    NEW.id,
    CASE WHEN NEW.qb_time_activity_id IS NULL THEN 'create' ELSE 'update' END,
    NULL
  );
  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  -- Never block an approval on the QuickBooks queue. The day stays approved; it
  -- simply was not queued, which the Accounting screen's flag shows.
  RAISE WARNING '[S124] time_activity enqueue failed for session %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$function$;
