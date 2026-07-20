import { createClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { getOpenSession } from '@/lib/services/time-tracking';
import { getProjects } from '@/lib/services/projects';
import { getMyMember } from '@/lib/services/members';
import { getCompanyTimeSettings } from '@/lib/services/company';
import { TimeclockTabs } from '@/components/time/timeclock-tabs';
import { TimeclockClient } from './timeclock-client';

/**
 * 6A-1 — Personal timeclock (spec docs/specs/6A-1-spec.md). Desktop build,
 * GPS capture-if-available (§4.2 [S84] — never required, never blocking).
 * The job picker lists ACTIVE projects; RLS scopes them (owner/admin all,
 * everyone else assigned — §2.3 [S85]). Supervisor views live at the
 * Timesheets SUBPAGE (/dashboard/timeclock/timesheets, 6A-2) — surfaced via
 * the tab strip for supervisor roles only.
 */
export default async function TimeclockPage() {
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
  const isSupervisor = ['owner', 'admin', 'project_manager', 'foreman'].includes(
    profile?.role ?? ''
  );

  const [session, projects, myMember, timeSettings] = await Promise.all([
    getOpenSession(),
    getProjects({ status: 'active' }),
    getMyMember(),
    getCompanyTimeSettings(),
  ]);

  // Task titles for the open session's segments (the picker fetches its own
  // list client-side at interaction time).
  const taskIds = (session?.segments ?? [])
    .map((s) => s.task_id)
    .filter((id): id is string => id != null);
  let taskTitles: Record<string, string> = {};
  if (taskIds.length > 0) {
    const { data } = await supabase.from('tasks').select('id, title').in('id', taskIds);
    taskTitles = Object.fromEntries((data ?? []).map((t) => [t.id, t.title]));
  }

  return (
    <div>
      {isSupervisor && <TimeclockTabs active="personal" />}
      <TimeclockClient
        initialSession={session}
        activeProjects={projects.map((p) => ({ id: p.id, name: p.name }))}
        myMemberId={myMember?.id ?? null}
        taskTitles={taskTitles}
        timeZone={timeSettings.timezone}
        gpsMode={timeSettings.gpsClockMode}
      />
    </div>
  );
}
