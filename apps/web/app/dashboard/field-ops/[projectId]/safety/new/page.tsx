import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { getProject } from '@/lib/services/projects';
import { getMembers } from '@/lib/services/members';
import { getCompanyTimeSettings } from '@/lib/services/company';
import { FieldTabs } from '@/components/field/field-tabs';
import { IncidentForm } from '@/components/field/incident-form';

// 6C §3 — the escalation target (locked route): the 6B hazard callout's
// "File an incident report" button lands here with ?date=<log_date>
// pre-filled; the project is locked to the route. Also reachable from the
// project Safety tab.

export default async function NewProjectIncidentPage({
  params,
  searchParams,
}: {
  params: { projectId: string };
  searchParams: { date?: string };
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  const project = await getProject(params.projectId);
  if (!project || project.is_deleted) notFound();

  const [members, { timezone }] = await Promise.all([getMembers(), getCompanyTimeSettings()]);
  const todayYmd = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const prefillDate = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date ?? '')
    ? (searchParams.date as string)
    : todayYmd;

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
        <Link href={`/dashboard/field-ops/${project.id}/safety`} className="hover:text-[#14213d]">
          Field / Safety
        </Link>{' '}
        / <span className="text-[#6b7280]">Report incident</span>
      </div>

      <h2 className="mb-4 text-[24px] font-extrabold tracking-[-0.01em] text-[#14213d]">
        Report an incident — {project.name}
      </h2>

      <FieldTabs projectId={project.id} active="safety" />

      <IncidentForm
        mode="create"
        projects={null}
        fixedProjectId={project.id}
        roster={members.map((m) => ({ id: m.id, display_name: m.display_name }))}
        initialFields={{
          project_id: project.id,
          incident_date: prefillDate,
          incident_type: 'injury',
          description: '',
          prevention_notes: null,
        }}
        initialInjuries={[]}
        initialWitnesses={[]}
      />
    </div>
  );
}
