import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { getProject } from '@/lib/services/projects';
import { getMembers } from '@/lib/services/members';
import { getProjectDayPresence } from '@/lib/services/daily-logs';
import { getCompanyTimeSettings } from '@/lib/services/company';
import { FieldTabs } from '@/components/field/field-tabs';
import { LogForm } from '../log-form';

// 6B-1 §4 — desktop create form (path A [S84]: no handoff design; ui-01
// tokens). Any member, on any project they can see (RLS: no rank gate).
// Crew auto-fills from the presence RPC for the selected date; the list is
// editable, hours are never editable here.

export default async function NewDailyLogPage({ params }: { params: { projectId: string } }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  const project = await getProject(params.projectId);
  if (!project || project.is_deleted) notFound();

  const { timezone } = await getCompanyTimeSettings();
  // Company-tz "today" — the form's default log_date (§4).
  const todayYmd = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  const [members, presence] = await Promise.all([
    getMembers(),
    getProjectDayPresence(params.projectId, todayYmd),
  ]);

  return (
    <div>
      <div className="mb-2 font-mono text-[12px] font-medium text-[#9aa1ac]">
        <Link href="/dashboard/projects" className="hover:text-[#14213d]">
          Projects
        </Link>{' '}
        /{' '}
        <Link href={`/dashboard/projects/${project.id}`} className="hover:text-[#14213d]">
          {project.name}
        </Link>{' '}
        /{' '}
        <Link
          href={`/dashboard/field-ops/${project.id}/daily-logs`}
          className="hover:text-[#14213d]"
        >
          Field / Daily Logs
        </Link>{' '}
        / <span className="text-[#6b7280]">New</span>
      </div>

      <h2 className="mb-4 text-[24px] font-extrabold tracking-[-0.01em] text-[#14213d]">
        New Daily Log
      </h2>

      <FieldTabs projectId={project.id} active="daily-logs" />

      <LogForm
        mode="create"
        projectId={project.id}
        roster={members.map((m) => ({
          id: m.id,
          display_name: m.display_name,
          member_type: m.member_type,
        }))}
        initialFields={{ log_date: todayYmd, hazards_present: false }}
        initialCrewIds={presence.map((p) => p.member_id)}
        initialSubs={[]}
      />
    </div>
  );
}
