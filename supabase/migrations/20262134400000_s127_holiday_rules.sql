-- ============================================================================
-- S127 ITEM 6 — THE WORKING CALENDAR'S STANDARD HOLIDAYS, STORED AS RULES.
-- ============================================================================
--
-- [Josh, 2026-10-01] "these holidays must update each year. that makes setting a
-- date and manually labeling a holiday risky." A stored `2026-05-25 / Memorial
-- Day` is right for one year; in May 2027 every Critical Path finish would be a
-- day early and nothing on screen would say why. So the seven are RULES —
-- resolved per year by the engine's calendar lookup
-- (packages/shared/utils/holiday-rules.ts, called from lib/critical-path/load.ts).
--
-- ⚠️ A SECOND TABLE, NOT RULE COLUMNS ON `company_holidays` [S127 1.5]. The
-- one-offs table is a dated row with `holiday_date NOT NULL` and a unique index
-- on (company_id, holiday_date); a rule has no date. Overloading the date column
-- (a sentinel) is ruled out by name, and a nullable date plus rule columns would
-- put two shapes behind one table's constraints and every reader. One-offs —
-- including holidays already entered by hand — stay EXACTLY where they are: not
-- migrated, not deleted.
--
-- THE SEVEN, AND ONLY THESE [RULED, option A]: New Year's Day, Memorial Day,
-- Independence Day, Labor Day, Thanksgiving, the day after Thanksgiving,
-- Christmas Day. ⚠️ DELIBERATELY EXCLUDED: MLK Day, Presidents' Day, Juneteenth,
-- Columbus Day, Veterans Day — banks close, most GC crews work. A company that
-- closes on one adds it as a one-off.
--
-- ⚠️ DEFAULTS — RULED [Josh, #7]: OFF for every EXISTING company; ON for any
-- company that enables Critical Path after this ships. S127 Q-B reading (stated
-- in the report): the ruling's reason is that defaulting existing companies ON
-- "would re-date every live Critical Path job the moment the feature deploys".
-- So a company that HAS used Critical Path (any project_schedule_settings row
-- ever enabled) is seeded OFF; a company that never has is seeded ON — it has no
-- Critical Path date to move, and its first job starts with the standard set.
-- New companies are seeded ON (trigger below). Each is a checkbox either way.
--
-- ⚠️ UNTICKING IS NOT DELETING: the row stays, `enabled = false`, visibly off.
-- There is no DELETE policy, no INSERT policy for users (the seven are seeded),
-- and a user's UPDATE may change `enabled` and nothing else.
--
-- ⚠️ NO OBSERVANCE SHIFT, BY RULING: a fixed date on a non-working day is not
-- moved. A Saturday-working company adds the Friday or Monday as a one-off.
--
-- ⚠️ TICKING ONE IS A RECOMPUTE TRIGGER: `mark_schedule_dirty_from_row()` gains
-- this table (cause 'holiday'), replaced in place — captured original md5
-- 460edf02566fde6158f6896ce52215b3 (identical on both databases) with RESTORE in
-- docs/sessions/S127-sabotage-originals/mark_schedule_dirty_from_row/. The
-- screen states the consequence BEFORE the change is written.
--
-- The seed runs as the migration (auth.uid() IS NULL), so it marks nothing dirty.
-- ============================================================================

CREATE TABLE public.company_holiday_rules (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES public.companies(id) DEFAULT get_my_company_id(),
  rule_key     text NOT NULL,
  name         text NOT NULL,
  kind         text NOT NULL,
  month        smallint NOT NULL,
  day          smallint,
  weekday      smallint,
  ordinal      smallint,
  offset_days  smallint NOT NULL DEFAULT 0,
  enabled      boolean NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  updated_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  is_deleted   boolean NOT NULL DEFAULT false,
  deleted_at   timestamptz,
  CONSTRAINT company_holiday_rules_key_check CHECK (rule_key IN (
    'new_years_day', 'memorial_day', 'independence_day', 'labor_day',
    'thanksgiving', 'day_after_thanksgiving', 'christmas_day')),
  CONSTRAINT company_holiday_rules_kind_check CHECK (kind IN ('fixed', 'nth_weekday')),
  CONSTRAINT company_holiday_rules_month_check CHECK (month BETWEEN 1 AND 12),
  CONSTRAINT company_holiday_rules_shape_check CHECK (
    (kind = 'fixed' AND day BETWEEN 1 AND 31 AND weekday IS NULL AND ordinal IS NULL)
    OR (kind = 'nth_weekday' AND day IS NULL AND weekday BETWEEN 0 AND 6 AND ordinal IN (-1, 1, 2, 3, 4)))
);
CREATE UNIQUE INDEX company_holiday_rules_live_unique
  ON public.company_holiday_rules (company_id, rule_key) WHERE is_deleted = false;
CREATE INDEX idx_company_holiday_rules_company_id ON public.company_holiday_rules (company_id);

COMMENT ON TABLE public.company_holiday_rules IS
  'S127 item 6. The seven standard holidays as RULES, resolved per year by the Critical Path engine '
  '(packages/shared/utils/holiday-rules.ts). Seeded per company; users toggle `enabled` only. One-off '
  'closures stay in company_holidays.';

CREATE TRIGGER company_holiday_rules_updated_at BEFORE UPDATE ON public.company_holiday_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE OR REPLACE FUNCTION public.set_company_holiday_rules_updated_by()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_by = auth.uid(); RETURN NEW; END; $$ LANGUAGE plpgsql SECURITY DEFINER;
CREATE TRIGGER company_holiday_rules_set_updated_by BEFORE UPDATE ON public.company_holiday_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_company_holiday_rules_updated_by();

-- A user's UPDATE changes `enabled` and nothing else: the rule itself is fixed.
CREATE OR REPLACE FUNCTION public.enforce_company_holiday_rules_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.company_id IS DISTINCT FROM OLD.company_id
     OR NEW.rule_key IS DISTINCT FROM OLD.rule_key
     OR NEW.name IS DISTINCT FROM OLD.name
     OR NEW.kind IS DISTINCT FROM OLD.kind
     OR NEW.month IS DISTINCT FROM OLD.month
     OR NEW.day IS DISTINCT FROM OLD.day
     OR NEW.weekday IS DISTINCT FROM OLD.weekday
     OR NEW.ordinal IS DISTINCT FROM OLD.ordinal
     OR NEW.offset_days IS DISTINCT FROM OLD.offset_days
     OR NEW.is_deleted IS DISTINCT FROM OLD.is_deleted THEN
    RAISE EXCEPTION 'A standard holiday can only be turned on or off.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER company_holiday_rules_scope BEFORE UPDATE ON public.company_holiday_rules
  FOR EACH ROW EXECUTE FUNCTION public.enforce_company_holiday_rules_scope();

ALTER TABLE public.company_holiday_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY company_holiday_rules_select_staff ON public.company_holiday_rules
  FOR SELECT TO authenticated
  USING (company_id = get_my_company_id() AND get_my_role() IS DISTINCT FROM 'client' AND get_my_role() IS DISTINCT FROM 'subcontractor');
CREATE POLICY company_holiday_rules_update_owner_admin ON public.company_holiday_rules
  FOR UPDATE TO authenticated
  USING (company_id = get_my_company_id() AND get_my_role() = ANY (ARRAY['owner', 'admin']))
  WITH CHECK (company_id = get_my_company_id() AND get_my_role() = ANY (ARRAY['owner', 'admin']));

-- ── The seed: the seven, one definition ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.seed_company_holiday_rules(p_company_id uuid, p_enabled boolean)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  INSERT INTO public.company_holiday_rules
    (company_id, rule_key, name, kind, month, day, weekday, ordinal, offset_days, enabled, created_by, updated_by)
  SELECT p_company_id, r.rule_key, r.name, r.kind, r.month, r.day, r.weekday, r.ordinal, r.offset_days, p_enabled, NULL, NULL
    FROM (VALUES
      ('new_years_day',          'New Year''s Day',        'fixed',       1::smallint,  1::smallint,  NULL::smallint, NULL::smallint, 0::smallint),
      ('memorial_day',           'Memorial Day',           'nth_weekday', 5::smallint,  NULL,         1::smallint,    (-1)::smallint, 0::smallint),
      ('independence_day',       'Independence Day',       'fixed',       7::smallint,  4::smallint,  NULL,           NULL,           0::smallint),
      ('labor_day',              'Labor Day',              'nth_weekday', 9::smallint,  NULL,         1::smallint,    1::smallint,    0::smallint),
      ('thanksgiving',           'Thanksgiving',           'nth_weekday', 11::smallint, NULL,         4::smallint,    4::smallint,    0::smallint),
      ('day_after_thanksgiving', 'Day after Thanksgiving', 'nth_weekday', 11::smallint, NULL,         4::smallint,    4::smallint,    1::smallint),
      ('christmas_day',          'Christmas Day',          'fixed',       12::smallint, 25::smallint, NULL,           NULL,           0::smallint)
    ) AS r(rule_key, name, kind, month, day, weekday, ordinal, offset_days)
  ON CONFLICT (company_id, rule_key) WHERE is_deleted = false DO NOTHING;
$$;
REVOKE ALL ON FUNCTION public.seed_company_holiday_rules(uuid, boolean) FROM PUBLIC, anon, authenticated;

-- Existing companies: OFF where Critical Path has ever been enabled, ON otherwise (see the header).
SELECT public.seed_company_holiday_rules(
  c.id,
  NOT EXISTS (SELECT 1 FROM public.project_schedule_settings s
               WHERE s.company_id = c.id AND (s.critical_path_enabled OR s.enabled_at IS NOT NULL)))
  FROM public.companies c;

-- New companies: ON — any company created now enables Critical Path after this ships.
CREATE OR REPLACE FUNCTION public.seed_holiday_rules_for_new_company()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.seed_company_holiday_rules(NEW.id, true);
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.seed_holiday_rules_for_new_company() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER companies_seed_holiday_rules AFTER INSERT ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.seed_holiday_rules_for_new_company();

-- ── A ticked holiday moves live Critical Path dates: mark them dirty ─────────
CREATE OR REPLACE FUNCTION public.mark_schedule_dirty_from_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project uuid;
  v_kind text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NULL;  -- the engine's own write-through
  END IF;
  IF TG_TABLE_NAME = 'tasks' THEN
    PERFORM public.mark_schedule_dirty(COALESCE(NEW.project_id, OLD.project_id), 'task', COALESCE(NEW.id, OLD.id));
    IF TG_OP = 'UPDATE' AND NEW.project_id IS DISTINCT FROM OLD.project_id THEN
      PERFORM public.mark_schedule_dirty(OLD.project_id, 'task', OLD.id);
    END IF;
  ELSIF TG_TABLE_NAME = 'task_dependencies' THEN
    SELECT project_id INTO v_project FROM tasks WHERE id = COALESCE(NEW.successor_id, OLD.successor_id);
    PERFORM public.mark_schedule_dirty(v_project, 'dependency', COALESCE(NEW.successor_id, OLD.successor_id));
  ELSIF TG_TABLE_NAME = 'project_lost_days' THEN
    PERFORM public.mark_schedule_dirty(COALESCE(NEW.project_id, OLD.project_id), 'weather', NULL);
  ELSIF TG_TABLE_NAME = 'inspections' THEN
    PERFORM public.mark_schedule_dirty(COALESCE(NEW.project_id, OLD.project_id), 'inspection', NULL);
  ELSIF TG_TABLE_NAME = 'projects' THEN
    PERFORM public.mark_schedule_dirty(NEW.id, 'project_start', NULL);
  -- [S127 item 6] company_holiday_rules joins the company-wide calendar tables.
  ELSIF TG_TABLE_NAME IN ('company_work_calendars', 'company_holidays', 'company_holiday_rules') THEN
    -- Every Critical Path project in the company moves (2.4 note 2, items 4–5).
    v_kind := CASE TG_TABLE_NAME WHEN 'company_work_calendars' THEN 'calendar' ELSE 'holiday' END;
    UPDATE project_schedule_settings
       SET needs_recompute = true,
           recompute_cause_kind = v_kind,
           recompute_cause_task_id = NULL
     WHERE company_id = COALESCE(NEW.company_id, OLD.company_id)
       AND critical_path_enabled AND is_deleted = false AND needs_recompute = false;
  END IF;
  RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION public.mark_schedule_dirty_from_row() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER company_holiday_rules_mark_schedule_dirty AFTER UPDATE OF enabled ON public.company_holiday_rules
  FOR EACH ROW EXECUTE FUNCTION public.mark_schedule_dirty_from_row();
