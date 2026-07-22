import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { getProject } from '@/lib/services/projects';
import { getDelivery } from '@/lib/services/deliveries';
import { getMyMember } from '@/lib/services/members';
import { FieldTabs } from '@/components/field/field-tabs';
import { DeliveryEditForm } from './delivery-edit-form';

// 6D — delivery edit (receiver or Owner/Admin; page gate mirrors RLS). The
// DB trigger chain recomputes has_exceptions and PO state on every item
// write, so corrections here flow into the 4e bars automatically.

export default async function EditDeliveryPage({
  params,
}: {
  params: { projectId: string; deliveryId: string };
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
  if (!profile) redirect('/dashboard');

  const [project, delivery, myMember] = await Promise.all([
    getProject(params.projectId),
    getDelivery(params.deliveryId),
    getMyMember(),
  ]);
  if (!project || project.is_deleted || !delivery || delivery.is_deleted) notFound();
  if (delivery.project_id !== params.projectId) notFound();

  const isAdminRole = profile.role === 'owner' || profile.role === 'admin';
  const canEdit = isAdminRole || (myMember != null && myMember.id === delivery.received_by);
  if (!canEdit) {
    redirect(`/dashboard/field-ops/${params.projectId}/deliveries/d/${params.deliveryId}`);
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
          href={`/dashboard/field-ops/${project.id}/deliveries/d/${delivery.id}`}
          className="hover:text-[#14213d]"
        >
          Field / Deliveries / {delivery.vendor_name}
        </Link>{' '}
        / <span className="text-[#6b7280]">Edit</span>
      </div>

      <h2 className="mb-4 text-[24px] font-extrabold tracking-[-0.01em] text-[#14213d]">
        Edit delivery — {delivery.vendor_name}
      </h2>

      <FieldTabs projectId={project.id} active="deliveries" />

      <DeliveryEditForm
        projectId={project.id}
        deliveryId={delivery.id}
        isOrderless={delivery.purchase_order_id === null}
        poId={delivery.purchase_order_id}
        initial={{
          vendor_name: delivery.vendor_name,
          delivery_date: delivery.delivery_date,
          notes: delivery.notes,
        }}
        initialItems={delivery.items.map((it) => ({
          id: it.id,
          po_item_id: it.po_item_id,
          description: it.description,
          qty_received: Number(it.qty_received),
          qty_damaged: Number(it.qty_damaged),
          issue_note: it.issue_note,
        }))}
      />
    </div>
  );
}
