import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { getProject } from '@/lib/services/projects';
import { getMaterialSignouts, getSignoutViewer, signoutToday } from '@/lib/services/material-signouts';
import { FieldTabs } from '@/components/field/field-tabs';
import { SignoutList } from '@/components/material-signouts/signout-list';

// S118 item 11 — the project's material sign-outs on the desktop Field tab
// (FILL-11.2: /m is primary; the desktop needs the list and the PDF). The list
// and the record are the SAME components /m renders (PARITY).

export default async function ProjectSignoutsPage({ params }: { params: { projectId: string } }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  const project = await getProject(params.projectId);
  if (!project || project.is_deleted) notFound();

  const [items, viewer, today] = await Promise.all([
    getMaterialSignouts(project.id),
    getSignoutViewer(),
    signoutToday(),
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
        / Field / <span className="text-[#6b7280]">Sign-outs</span>
      </div>

      <div className="mb-4 flex items-start justify-between">
        <div>
          <h2 className="text-[24px] font-extrabold tracking-[-0.01em] text-[#14213d]">Material sign-outs</h2>
          <div className="mt-[2px] text-[13px] text-[#6b7280]">{project.name}</div>
        </div>
        {viewer.canCreate ? (
          <Link
            href={`/dashboard/field-ops/${project.id}/signouts/new`}
            data-testid="signout-new"
            className="rounded-[9px] bg-[#2f49d1] px-[15px] py-[9px] text-[13px] font-semibold text-white transition-colors hover:bg-[#2438a8]"
          >
            + New sign-out
          </Link>
        ) : null}
      </div>

      <FieldTabs projectId={project.id} active="signouts" />

      <SignoutList items={items} today={today} hrefBase={`/dashboard/field-ops/${project.id}/signouts`} />
    </div>
  );
}
