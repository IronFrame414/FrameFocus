CREATE OR REPLACE FUNCTION public.enforce_companies_qb_time_export()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF NEW.qb_time_export_enabled IS DISTINCT FROM OLD.qb_time_export_enabled
       AND public.get_my_role() IS DISTINCT FROM 'owner' THEN
      RAISE EXCEPTION 'Turning QuickBooks time export on or off is Owner-only.'
        USING ERRCODE = '42501';
    END IF;
    NEW.qb_time_export_enabled_at := OLD.qb_time_export_enabled_at;
    NEW.qb_time_export_enabled_by := OLD.qb_time_export_enabled_by;
  END IF;

  IF NEW.qb_time_export_enabled AND NOT OLD.qb_time_export_enabled THEN
    IF NEW.qb_connection_state IS DISTINCT FROM 'connected' THEN
      RAISE EXCEPTION 'Connect QuickBooks before turning on time export.'
        USING ERRCODE = '22023';
    END IF;
    NEW.qb_time_export_enabled_at := now();
    NEW.qb_time_export_enabled_by := auth.uid();
  END IF;

  IF NEW.qb_connection_state IN ('disconnected', 'revoked')
     AND OLD.qb_connection_state IS DISTINCT FROM NEW.qb_connection_state THEN
    NEW.qb_time_export_enabled := false;
  END IF;

  RETURN NEW;
END;
$function$;
