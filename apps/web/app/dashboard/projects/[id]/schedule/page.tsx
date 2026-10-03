import { supervisesProjectWork } from '@framefocus/shared/constants/roles';
import { createClient, getRequestUser } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { getTasks, getPhases, getDependencies } from '@/lib/services/tasks';
import { getCalendarEvents, getInspections } from '@/lib/services/schedule';
import { getMembers, getMyMember } from '@/lib/services/members';
import { getProject } from '@/lib/services/projects';
import { SchedulePanel } from './schedule-panel';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { ensureScheduleFresh } from '@/lib/critical-path/recompute';
import { loadCriticalPathData } from '@/lib/critical-path/load';
import { loadPendingEdits, type PendingEdit } from '@/lib/critical-path/pending';
import type { CpInput } from '@framefocus/shared/utils/critical-path';

export default async function ProjectSchedulePage({ params }: { params: { id: string } }) {
  const supabase = await createClient();

  const user = await getRequestUser();
  if (!user) redirect('/sign-in');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .eq('is_deleted', false)
    .single();
  if (!profile) redirect('/dashboard');

  const isCrew = profile.role === 'crew_member' || profile.role === 'subcontractor';
  const myMember = isCrew ? await getMyMember() : null;

  // [S122 Part 3] THE READ-CHECK (Q9 trigger 9 and the net under every other
  // trigger): a Critical Path project that is marked, or was computed before
  // today, is recomputed BEFORE its dates are read. Only for a project this
  // caller can see — checked as the caller, never trusted from the URL.
  const { data: visible } = await supabase.from('projects').select('id').eq('id', params.id).maybeSingle();
  if (visible) {
    const fresh = await ensureScheduleFresh(getSupabaseAdmin() as SupabaseClient<Database>, params.id);
    if (fresh.status === 'failed') console.error(`[schedule page] recompute ${params.id}: ${fresh.error}`);
  }

  const [tasks, phases, dependencies, members, inspections, calendarEvents, project] = await Promise.all([
    getTasks(params.id),
    getPhases(params.id),
    getDependencies(params.id),
    getMembers(),
    getInspections(params.id),
    // Crew sees the in-project CALENDAR own-only (5B §9 interpretation);
    // the task list + Gantt below still show the full work breakdown.
    getCalendarEvents({ projectId: params.id, ownMemberId: myMember?.id }),
    getProject(params.id),
  ]);

  const canManage = supervisesProjectWork(profile.role);

  // [S122 Part 3] The engine input for the line sheet's preview — staff only.
  // Crew and subs see a subset of the tasks under RLS, and a preview computed
  // on part of the graph would state wrong dates; they get no preview.
  // [S122 Part 5] Held schedule changes — shown to EVERYONE who sees the
  // tasks, grayed and marked pending [Josh, 2026-10-01]. A failed read is said.
  let pending: PendingEdit[] = [];
  let pendingError = false;
  if (visible) {
    const p = await loadPendingEdits(supabase as unknown as SupabaseClient<Database>, params.id);
    if (p.ok) pending = p.edits;
    else {
      pendingError = true;
      console.error(`[schedule page] pending ${params.id}: ${p.error}`);
    }
  }
  let criticalPath: { input: CpInput } | null = null;
  if (visible && !isCrew) {
    const cp = await loadCriticalPathData(supabase, params.id);
    if (cp.ok && cp.data.settings?.critical_path_enabled) criticalPath = { input: cp.data.input };
    else if (!cp.ok) console.error(`[schedule page] critical path load ${params.id}: ${cp.error}`);
  }

  return (
    <SchedulePanel
      projectId={params.id}
      projectName={project?.name ?? 'This project'}
      tasks={tasks}
      phases={phases}
      dependencies={dependencies}
      inspections={inspections}
      calendarEvents={calendarEvents}
      members={members.map((m) => ({
        id: m.id,
        display_name: m.display_name,
        member_type: m.member_type,
        sub_type: m.sub_type ?? null, // #89: distinguish subcontractor vs vendor in the label
        schedule_color: m.schedule_color,
      }))}
      canManage={canManage}
      criticalPath={criticalPath}
      pending={pending}
      pendingError={pendingError}
      role={profile.role}
    />
  );
}
