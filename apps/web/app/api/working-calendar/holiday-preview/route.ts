import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { computeCriticalPath } from '@framefocus/shared/utils/critical-path';
import {
  resolveEnabledHolidays,
  type HolidayRuleRow,
} from '@framefocus/shared/utils/holiday-rules';
import { companyToday } from '@framefocus/shared/utils/dates';
import { createClient } from '@/lib/supabase-server';
import { holidayYearSpan, loadCriticalPathData, mergeHolidays } from '@/lib/critical-path/load';
import { holidayPreviewSchema, type HolidayPreview } from '@/lib/critical-path/holiday-preview';

// ============================================================================
// S127 item 6 — WHAT TICKING (OR UNTICKING) A STANDARD HOLIDAY WOULD DO, BEFORE
// IT IS DONE. ⚠️ "A settings screen that silently re-dates every live job is the
// worst version of this feature." The calendar is a recompute trigger: every
// Critical Path project in the company moves at once. This answers, per
// project, the projected finish now and with the change — computed by the SAME
// engine (`computeCriticalPath`) over the SAME loaded input, with only the
// holiday list differing. Nothing is written here.
//
// Owner/Admin only: they are the only roles that may change the rule (RLS
// `company_holiday_rules_update_owner_admin`), so nobody else needs the answer.
// Read through the caller's client, so RLS scopes every read to their company.
// ============================================================================

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id, role')
    .eq('user_id', user.id)
    .eq('is_deleted', false)
    .maybeSingle();
  if (!profile || !['owner', 'admin'].includes(profile.role)) {
    console.error(
      `[holiday-preview] denied: user=${user.id} role=${profile?.role ?? 'none'} — Owner/Admin only`
    );
    return NextResponse.json(
      { error: 'Only an Owner or Admin can change the working calendar.' },
      { status: 403 }
    );
  }

  let parsed;
  try {
    parsed = holidayPreviewSchema.safeParse(await request.json());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  const { ruleId, enabled } = parsed.data;

  const db = supabase as unknown as SupabaseClient<Database>;
  const [rulesRes, oneOffsRes, cpRes, companyRes] = await Promise.all([
    db
      .from('company_holiday_rules')
      .select('id, rule_key, enabled, kind, month, day, weekday, ordinal, offset_days')
      .eq('company_id', profile.company_id)
      .eq('is_deleted', false)
      .order('rule_key', { ascending: true }),
    db
      .from('company_holidays')
      .select('holiday_date')
      .eq('company_id', profile.company_id)
      .eq('is_deleted', false)
      .order('holiday_date', { ascending: true }),
    db
      .from('project_schedule_settings')
      .select('project_id, projects!inner(name)')
      .eq('company_id', profile.company_id)
      .eq('critical_path_enabled', true)
      .eq('is_deleted', false)
      .order('project_id', { ascending: true }),
    db.from('companies').select('timezone').eq('id', profile.company_id).maybeSingle(),
  ]);
  if (rulesRes.error || oneOffsRes.error || cpRes.error) {
    const why = rulesRes.error?.message ?? oneOffsRes.error?.message ?? cpRes.error?.message;
    console.error(`[holiday-preview] read failed: ${why}`);
    return NextResponse.json({ error: 'Could not read the working calendar.' }, { status: 500 });
  }
  const rules = (rulesRes.data ?? []) as (HolidayRuleRow & { id: string })[];
  if (!rules.some((r) => r.id === ruleId)) {
    return NextResponse.json({ error: 'That holiday is not on your calendar.' }, { status: 404 });
  }
  const toggled = rules.map((r) => (r.id === ruleId ? { ...r, enabled } : r));
  const oneOffs = (oneOffsRes.data ?? []).map((h) => h.holiday_date as string);
  const today = companyToday((companyRes.data?.timezone as string | null) ?? 'America/New_York');

  const projects: HolidayPreview['projects'] = [];
  for (const row of (cpRes.data ?? []) as unknown as {
    project_id: string;
    projects: { name: string };
  }[]) {
    const loaded = await loadCriticalPathData(db, row.project_id);
    if (!loaded.ok) {
      console.error(`[holiday-preview] load ${row.project_id}: ${loaded.error}`);
      projects.push({
        projectId: row.project_id,
        name: row.projects.name,
        before: null,
        after: null,
        error: true,
      });
      continue;
    }
    const span = holidayYearSpan(loaded.data.input.projectStart, today);
    const calendarWith = (rows: HolidayRuleRow[]) => ({
      ...loaded.data.input.calendar,
      holidays: mergeHolidays(oneOffs, resolveEnabledHolidays(rows, span.from, span.to)),
    });
    const before = computeCriticalPath({ ...loaded.data.input, calendar: calendarWith(rules) });
    const after = computeCriticalPath({ ...loaded.data.input, calendar: calendarWith(toggled) });
    projects.push({
      projectId: row.project_id,
      name: row.projects.name,
      before: before.projectedFinish,
      after: after.projectedFinish,
      error: !before.ok || !after.ok,
    });
  }

  const body: HolidayPreview = { projects };
  return NextResponse.json(body);
}
