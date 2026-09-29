import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { getProject } from '@/lib/services/projects';
import { loadSignoutRecord } from '@/lib/services/material-signouts';
import { FieldTabs } from '@/components/field/field-tabs';
import { SignoutDetailView } from '@/components/material-signouts/signout-detail';

// S118 item 11 — one sign-out on the desktop, with its PDF. Same component as
// the /m record: what it lets the viewer do follows the state and the role.

export default async function SignoutRecordPage({
  params,
}: {
  params: { projectId: string; signoutId: string };
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  const [project, data] = await Promise.all([getProject(params.projectId), loadSignoutRecord(params.signoutId)]);
  if (!project || project.is_deleted || !data || data.record.project_id !== project.id) notFound();

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
      <h2 className="mb-4 text-[24px] font-extrabold tracking-[-0.01em] text-[#14213d]">
        {data.record.material_type} · {data.record.quantity}
      </h2>
      <FieldTabs projectId={project.id} active="signouts" />
      <SignoutDetailView
        record={data.record}
        photos={data.photos}
        today={data.today}
        timeZone={data.timeZone}
        canClose={data.viewer.canClose}
        pdfUrl={data.pdfUrl}
        defaultSignerName={data.viewer.signerName}
      />
    </div>
  );
}
