import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { getProject } from '@/lib/services/projects';
import { getPurchaseOrderDetail, poTitle } from '@/lib/services/deliveries';
import { FieldTabs } from '@/components/field/field-tabs';
import { PoForm } from '../../po-form';

// 6D §U — PO edit (Owner/Admin/PM; page gate mirrors RLS). Removing a line
// that already has delivered quantity is legal — the DB trigger re-derives
// PO status on the next item write.

export default async function EditPurchaseOrderPage({
  params,
}: {
  params: { projectId: string; poId: string };
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
    redirect(`/dashboard/field-ops/${params.projectId}/deliveries/${params.poId}`);
  }

  const [project, po] = await Promise.all([
    getProject(params.projectId),
    getPurchaseOrderDetail(params.poId),
  ]);
  if (!project || project.is_deleted || !po || po.is_deleted) notFound();
  if (po.project_id !== params.projectId) notFound();
  // R-B2 corollary: a line-bearing PO never reaches the legacy editor — its
  // lines are lifecycle-managed (issue/flag/purchase) and this form's
  // reconciler would hard-delete them without re-syncing the commitment.
  if (po.lines.some((l) => !l.item.is_deleted && l.item.unit_cost !== null)) {
    redirect(`/dashboard/field-ops/${params.projectId}/deliveries/${params.poId}`);
  }

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
          href={`/dashboard/field-ops/${project.id}/deliveries/${po.id}`}
          className="hover:text-[#14213d]"
        >
          Field / Deliveries / {po.po_number ?? po.vendor_name}
        </Link>{' '}
        / <span className="text-[#6b7280]">Edit</span>
      </div>

      <h2 className="mb-4 text-[24px] font-extrabold tracking-[-0.01em] text-[#14213d]">
        Edit {poTitle(po)}
      </h2>

      <FieldTabs projectId={project.id} active="deliveries" />

      <PoForm
        mode="edit"
        projectId={project.id}
        poId={po.id}
        initialFields={{
          vendor_name: po.vendor_name,
          po_number: po.po_number,
          ordered_at: po.ordered_at,
        }}
        initialLines={po.lines.map((l) => ({
          id: l.item.id,
          description: l.item.description,
          qty_ordered: Number(l.item.qty_ordered),
          unit: l.item.unit,
        }))}
      />
    </div>
  );
}
