// S122 Part 3 — load one project's Critical Path input. ONE loader for the
// server's recompute (service role) and the staff page's preview data (the
// caller's session), so the engine sees the same shape on both (PARITY).
//
// ⚠️ Any read error REFUSES the load. A schedule computed on a partial graph
// (a dependency that failed to load, a holiday list that came back empty on an
// error) produces wrong dates that look authoritative — the same failure as a
// backfilled duration (stop rule 10). No answer is better than a wrong one.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { calendarDayInZone, companyToday } from '@framefocus/shared/utils/dates';
import type { CpInput, CpTask, DependencyType, TaskStatus } from '@framefocus/shared/utils/critical-path';

/** Q16-A: a company that never set a calendar works MONDAY–FRIDAY, no holidays — never seven days. */
export const DEFAULT_WORK_DAYS: readonly number[] = [1, 2, 3, 4, 5];

type SettingsRow = Database['public']['Tables']['project_schedule_settings']['Row'];
export type CpSettings = Pick<
  SettingsRow,
  | 'id'
  | 'company_id'
  | 'project_id'
  | 'critical_path_enabled'
  | 'notify_client'
  | 'computed_on'
  | 'needs_recompute'
  | 'projected_finish'
  | 'recompute_cause_kind'
  | 'recompute_cause_task_id'
>;
export const CP_SETTINGS_COLUMNS =
  'id, company_id, project_id, critical_path_enabled, notify_client, computed_on, needs_recompute, projected_finish, recompute_cause_kind, recompute_cause_task_id';

export interface CpProjectData {
  input: CpInput;
  /** task id → the inspection it is the schedule node of (Q10-A). */
  inspectionOf: Record<string, string>;
  settings: CpSettings | null;
  companyId: string;
  timeZone: string;
  /** No calendar row: the Mon–Fri default is in use, and the tab says so (Q16-A). */
  usingDefaultCalendar: boolean;
}

export type CpLoad = { ok: true; data: CpProjectData } | { ok: false; error: string };

export async function loadCriticalPathData(
  db: SupabaseClient<Database>,
  projectId: string,
  now: Date = new Date()
): Promise<CpLoad> {
  const project = await db
    .from('projects')
    .select('id, company_id, start_date')
    .eq('id', projectId)
    .maybeSingle();
  if (project.error) return { ok: false, error: `project: ${project.error.message}` };
  if (!project.data) return { ok: false, error: 'project: not found' };
  const companyId = project.data.company_id as string;

  const [company, calendar, holidays, lost, tasks, settings] = await Promise.all([
    db.from('companies').select('timezone').eq('id', companyId).maybeSingle(),
    db
      .from('company_work_calendars')
      .select('work_days')
      .eq('company_id', companyId)
      .eq('is_deleted', false)
      .maybeSingle(),
    db
      .from('company_holidays')
      .select('holiday_date')
      .eq('company_id', companyId)
      .eq('is_deleted', false)
      .order('holiday_date', { ascending: true }),
    db
      .from('project_lost_days')
      .select('start_date, end_date')
      .eq('project_id', projectId)
      .eq('is_deleted', false)
      .order('start_date', { ascending: true }),
    db
      .from('tasks')
      .select(
        'id, title, status, duration_days, start_date, due_date, completed_at, days_left, days_left_as_of, start_constraint, constraint_date, inspection_id'
      )
      .eq('project_id', projectId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true }),
    db
      .from('project_schedule_settings')
      .select(CP_SETTINGS_COLUMNS)
      .eq('project_id', projectId)
      .eq('is_deleted', false)
      .maybeSingle(),
  ]);
  for (const [name, r] of [
    ['company', company],
    ['calendar', calendar],
    ['holidays', holidays],
    ['lost days', lost],
    ['tasks', tasks],
    ['settings', settings],
  ] as const) {
    if (r.error) return { ok: false, error: `${name}: ${r.error.message}` };
  }
  if (!company.data) return { ok: false, error: 'company: not found' };
  const timeZone = company.data.timezone;

  const taskRows = tasks.data ?? [];
  const ids = taskRows.map((t) => t.id);
  let dependencies: CpInput['dependencies'] = [];
  if (ids.length > 0) {
    const deps = await db
      .from('task_dependencies')
      .select('predecessor_id, successor_id, dependency_type')
      .in('successor_id', ids)
      .eq('is_deleted', false);
    if (deps.error) return { ok: false, error: `dependencies: ${deps.error.message}` };
    dependencies = (deps.data ?? []).map((d) => ({
      predecessorId: d.predecessor_id,
      successorId: d.successor_id,
      type: d.dependency_type as DependencyType,
    }));
  }

  const inspectionOf: Record<string, string> = {};
  const cpTasks: CpTask[] = taskRows.map((t) => {
    if (t.inspection_id) inspectionOf[t.id] = t.inspection_id;
    return {
      id: t.id,
      title: t.title,
      status: t.status as TaskStatus,
      durationDays: t.duration_days,
      startDate: t.start_date,
      dueDate: t.due_date,
      completedOn: t.completed_at ? calendarDayInZone(t.completed_at, timeZone) : null,
      daysLeft: t.days_left,
      daysLeftAsOf: t.days_left_as_of,
      startConstraint: (t.start_constraint as CpTask['startConstraint']) ?? null,
      constraintDate: t.constraint_date,
    };
  });

  return {
    ok: true,
    data: {
      input: {
        tasks: cpTasks,
        dependencies,
        calendar: {
          workDays: calendar.data?.work_days ?? DEFAULT_WORK_DAYS,
          holidays: (holidays.data ?? []).map((h) => h.holiday_date),
        },
        lostDays: (lost.data ?? []).map((l) => ({ start: l.start_date, end: l.end_date })),
        projectStart: project.data.start_date,
        today: companyToday(timeZone, now),
      },
      inspectionOf,
      settings: (settings.data as CpSettings | null) ?? null,
      companyId,
      timeZone,
      usingDefaultCalendar: !calendar.data,
    },
  };
}
