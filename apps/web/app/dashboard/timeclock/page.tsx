import { createClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { getOpenSession } from '@/lib/services/time-tracking';
import { getProjects } from '@/lib/services/projects';
import { getMyMember } from '@/lib/services/members';
import { getCompanyTimezone } from '@/lib/services/company';
import { TimeclockClient } from './timeclock-client';

/**
 * 6A-1 — Personal timeclock (spec docs/specs/6A-1-spec.md). Desktop build,
 * GPS capture-if-available (§4.2 [S84] — never required, never blocking).
 * The job picker lists ACTIVE projects; RLS scopes them (owner/admin all,
 * everyone else assigned — §2.3 [S85]). Supervisor views live at
 * /dashboard/timesheets (6A-2), not here.
 */
export default async function TimeclockPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  const [session, projects, myMember, timeZone] = await Promise.all([
    getOpenSession(),
    getProjects({ status: 'active' }),
    getMyMember(),
    getCompanyTimezone(),
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
    <TimeclockClient
      initialSession={session}
      activeProjects={projects.map((p) => ({ id: p.id, name: p.name }))}
      myMemberId={myMember?.id ?? null}
      taskTitles={taskTitles}
      timeZone={timeZone}
    />
  );
}
