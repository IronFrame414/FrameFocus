-- S127 item 1: restore enforce_companies_qb_time_export() to its 20262134100000 definition after a sabotage.
-- md5 of pg_get_functiondef: c18819c27c3bb8d2be7219082119d241. ACL: {postgres=X/postgres,service_role=X/postgres,supabase_auth_admin=X/postgres}. Comment is re-applied below.

CREATE OR REPLACE FUNCTION public.enforce_companies_qb_time_export()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_reason text;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF NEW.qb_time_export_enabled IS DISTINCT FROM OLD.qb_time_export_enabled
       AND public.get_my_role() IS DISTINCT FROM 'owner' THEN
      RAISE EXCEPTION 'Turning QuickBooks time export on or off is Owner-only.'
        USING ERRCODE = '42501';
    END IF;
    NEW.qb_time_export_enabled_at := OLD.qb_time_export_enabled_at;
    NEW.qb_time_export_enabled_by := OLD.qb_time_export_enabled_by;
    -- [S127] The auto-off record is the trigger's alone, like the stamps above.
    NEW.qb_time_export_auto_off_at := OLD.qb_time_export_auto_off_at;
    NEW.qb_time_export_auto_off_reason := OLD.qb_time_export_auto_off_reason;
    NEW.qb_time_export_auto_off_from_state := OLD.qb_time_export_auto_off_from_state;
  END IF;

  IF NEW.qb_time_export_enabled AND NOT OLD.qb_time_export_enabled THEN
    IF NEW.qb_connection_state IS DISTINCT FROM 'connected' THEN
      RAISE EXCEPTION 'Connect QuickBooks before turning on time export.'
        USING ERRCODE = '22023';
    END IF;
    NEW.qb_time_export_enabled_at := now();
    NEW.qb_time_export_enabled_by := auth.uid();
    -- [S127] A human turned it back on: the "turned itself off" notice is answered.
    NEW.qb_time_export_auto_off_at := NULL;
    NEW.qb_time_export_auto_off_reason := NULL;
    NEW.qb_time_export_auto_off_from_state := NULL;
  END IF;

  -- [S127 Q-E] needs_reauth joins disconnected and revoked.
  IF NEW.qb_connection_state IN ('disconnected', 'revoked', 'needs_reauth')
     AND OLD.qb_connection_state IS DISTINCT FROM NEW.qb_connection_state THEN
    -- [S127] Record and tell ONLY on an actual on -> off change. OLD is the
    -- truth about "was it on": NEW may already carry a client's false.
    IF OLD.qb_time_export_enabled THEN
      v_reason := CASE NEW.qb_connection_state
                    WHEN 'revoked' THEN 'connection_revoked'
                    WHEN 'needs_reauth' THEN 'connection_needs_reauth'
                    ELSE 'connection_disconnected'
                  END;
      NEW.qb_time_export_auto_off_at := now();
      NEW.qb_time_export_auto_off_reason := v_reason;
      NEW.qb_time_export_auto_off_from_state := OLD.qb_connection_state;

      -- [S127] The OWNER, and nobody else. One row per live Owner profile.
      INSERT INTO public.notifications
        (company_id, recipient_profile_id, type, title, body, link_key, link_params,
         source_table, source_id)
      SELECT NEW.id, p.id, 'qb_time_export_auto_off',
             'QuickBooks time export turned itself off',
             CASE v_reason
               WHEN 'connection_needs_reauth' THEN
                 'Sending approved timesheets to QuickBooks was turned off because QuickBooks stopped '
                 || 'accepting the connection — it needs to be reconnected. No hours are being sent. '
                 || 'After reconnecting, turn it on again on Settings → Accounting.'
               WHEN 'connection_revoked' THEN
                 'Sending approved timesheets to QuickBooks was turned off because FrameFocus was '
                 || 'disconnected from inside QuickBooks. No hours are being sent. After reconnecting, '
                 || 'turn it on again on Settings → Accounting.'
               ELSE
                 'Sending approved timesheets to QuickBooks was turned off because QuickBooks was '
                 || 'disconnected. No hours are being sent. After reconnecting, turn it on again on '
                 || 'Settings → Accounting.'
             END,
             'qb', '{}'::jsonb, 'companies', NEW.id
        FROM public.profiles p
       WHERE p.company_id = NEW.id
         AND p.role = 'owner'
         AND p.is_deleted = false;
    END IF;
    NEW.qb_time_export_enabled := false;
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.enforce_companies_qb_time_export() IS 'S124 Part 2 + S127 item 1. Owner-only switch; refuses ON while not connected; stamps ON; a disconnect, revoke or dead grant (needs_reauth) turns it OFF and, on an actual on -> off change only, records when and why (qb_time_export_auto_off_*) and notifies the Owner only. Never turns it on; never backfills.';
