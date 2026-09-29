import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { loadNewSignout } from '@/lib/services/material-signouts';
import { FieldTabs } from '@/components/field/field-tabs';
import { SignoutNewForm } from '@/components/material-signouts/signout-new-form';

// S118 item 11 — a new sign-out on the desktop. Same form as /m.

export default async function NewSignoutPage({ params }: { params: { projectId: string } }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  const data = await loadNewSignout(params.projectId);
  if (!data) notFound();
  const { project } = data;
  if (!data.viewer.canCreate) redirect(`/dashboard/field-ops/${project.id}/signouts`);

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
        / Field / <span className="text-[#6b7280]">New sign-out</span>
      </div>
      <h2 className="mb-4 text-[24px] font-extrabold tracking-[-0.01em] text-[#14213d]">New sign-out</h2>
      <FieldTabs projectId={project.id} active="signouts" />
      <SignoutNewForm
        projectId={project.id}
        defaultJobName={data.defaultJobName}
        defaultJobAddress={data.defaultJobAddress}
        defaultSignerName={data.viewer.signerName}
        today={data.today}
        hrefBase={`/dashboard/field-ops/${project.id}/signouts`}
      />
    </div>
  );
}
