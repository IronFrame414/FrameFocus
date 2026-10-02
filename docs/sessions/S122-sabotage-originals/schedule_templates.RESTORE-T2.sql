-- RESTORE for T2: drop the sabotage policy. Then the table must have exactly its three policies:
-- schedule_templates_insert_owner_admin, schedule_templates_select_editors, schedule_templates_update_owner_admin.
DROP POLICY IF EXISTS schedule_templates_insert_sabotage_t2 ON public.schedule_templates;
