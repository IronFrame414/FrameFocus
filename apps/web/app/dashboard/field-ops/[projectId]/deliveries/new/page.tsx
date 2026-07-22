import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { getProject } from '@/lib/services/projects';
import { FieldTabs } from '@/components/field/field-tabs';
import { PoForm } from '../po-form';

// 6D §U — PO create (Owner/Admin/PM; page gate mirrors RLS).

export default async function NewPurchaseOrderPage({
  params,
}: {
  params: { projectId: string };
}) {
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
  if (!profile || !['owner', 'admin', 'project_manager'].includes(profile.role)) {
    redirect(`/dashboard/field-ops/${params.projectId}/deliveries`);
  }

  const project = await getProject(params.projectId);
  if (!project || project.is_deleted) notFound();

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
          href={`/dashboard/field-ops/${project.id}/deliveries`}
          className="hover:text-[#14213d]"
        >
          Field / Deliveries
        </Link>{' '}
        / <span className="text-[#6b7280]">New PO</span>
      </div>

      <h2 className="mb-4 text-[24px] font-extrabold tracking-[-0.01em] text-[#14213d]">
        New Purchase Order
      </h2>

      <FieldTabs projectId={project.id} active="deliveries" />

      <PoForm
        mode="create"
        projectId={project.id}
        initialFields={{ vendor_name: '' }}
        initialLines={[]}
      />
    </div>
  );
}
