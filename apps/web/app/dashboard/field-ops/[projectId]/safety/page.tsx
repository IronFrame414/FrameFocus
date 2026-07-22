import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { getProject } from '@/lib/services/projects';
import { getIncidentsForProject } from '@/lib/services/safety';
import { FieldTabs } from '@/components/field/field-tabs';
import { TypeBadge, StatusBadge } from '@/components/field/incident-badges';

// 6C — project Safety tab (Phase 3 Q7, surface 2 of 2): project-scoped
// incident list; rows open the company-level detail. The 6B Field sub-tab
// bar claims this segment (previously the accepted-404 target).

function fmtYmd(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return ymd;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).toLocaleDateString(
    'en-US',
    { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }
  );
}

export default async function ProjectSafetyPage({
  params,
}: {
  params: { projectId: string };
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  const project = await getProject(params.projectId);
  if (!project || project.is_deleted) notFound();

  const incidents = await getIncidentsForProject(project.id);

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
        / Field / <span className="text-[#6b7280]">Safety</span>
      </div>

      <div className="mb-4 flex items-start justify-between">
        <div>
          <h2 className="text-[24px] font-extrabold tracking-[-0.01em] text-[#14213d]">Safety</h2>
          <div className="mt-[2px] text-[13px] text-[#6b7280]">{project.name}</div>
        </div>
        <div className="flex gap-[10px]">
          <Link
            href="/dashboard/field-ops/safety"
            className="rounded-[9px] border border-[#e0e4ea] bg-white px-[15px] py-[9px] text-[13px] font-semibold text-[#374151] transition-colors hover:border-[#c9d2e4]"
          >
            Company-wide log
          </Link>
          <Link
            href={`/dashboard/field-ops/${project.id}/safety/new`}
            className="rounded-[9px] bg-[#c0362c] px-[16px] py-[9px] text-[13px] font-semibold text-white transition-colors hover:bg-[#a52d24]"
          >
            + Report incident
          </Link>
        </div>
      </div>

      <FieldTabs projectId={project.id} active="safety" />

      <div className="flex flex-col gap-2">
        {incidents.length === 0 ? (
          <div className="rounded-[13px] border border-[#e6e9ef] bg-white p-6 text-sm text-[#6b7280]">
            No incidents on this project. That&rsquo;s the goal.
          </div>
        ) : (
          incidents.map((incident) => (
            <Link
              key={incident.id}
              href={`/dashboard/field-ops/safety/${incident.id}`}
              className="flex items-center justify-between rounded-[13px] border border-[#e6e9ef] bg-white px-5 py-[14px] transition-colors hover:border-[#c9d2e4]"
            >
              <div className="flex items-center gap-3">
                <span className="font-mono text-[13px] font-semibold text-[#14213d]">
                  {fmtYmd(incident.incident_date)}
                </span>
                <span className="text-[13px] text-[#374151]">
                  {incident.description.length > 70
                    ? `${incident.description.slice(0, 70)}…`
                    : incident.description}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={incident.status} />
                <TypeBadge type={incident.incident_type} />
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
