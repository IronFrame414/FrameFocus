import { createClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { getTasks, getPhases, getDependencies } from '@/lib/services/tasks';
import { getCalendarEvents, getInspections } from '@/lib/services/schedule';
import { getMembers, getMyMember } from '@/lib/services/members';
import { SchedulePanel } from './schedule-panel';

export default async function ProjectSchedulePage({ params }: { params: { id: string } }) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
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

  const [tasks, phases, dependencies, members, inspections, calendarEvents] = await Promise.all([
    getTasks(params.id),
    getPhases(params.id),
    getDependencies(params.id),
    getMembers(),
    getInspections(params.id),
    // Crew sees the in-project CALENDAR own-only (5B §9 interpretation);
    // the task list + Gantt below still show the full work breakdown.
    getCalendarEvents({ projectId: params.id, ownMemberId: myMember?.id }),
  ]);

  const canManage = ['owner', 'admin', 'project_manager', 'foreman'].includes(profile.role);

  return (
    <SchedulePanel
      projectId={params.id}
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
      role={profile.role}
    />
  );
}
