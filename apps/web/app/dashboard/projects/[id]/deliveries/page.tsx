import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { getProject } from '@/lib/services/projects';
import { getOrderlessDeliveries, getPurchaseOrders } from '@/lib/services/deliveries';
import { DeliveriesSections } from '@/components/field/deliveries-sections';

// S90 — Deliveries as a first-class project tab (6D-spec §U amendment).
// Renders under the ProjectHeader tab strip (layout.tsx); the list body is
// shared with the Field Ops → Deliveries tab (dual-entry). PO detail,
// check-in, and edit flows stay on their field-ops routes — this tab is the
// project-side door, not a parallel implementation.

export default async function ProjectDeliveriesPage({ params }: { params: { id: string } }) {
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

  const project = await getProject(params.id);
  if (!project || project.is_deleted) notFound();

  const [pos, orderless] = await Promise.all([
    getPurchaseOrders(project.id),
    getOrderlessDeliveries(project.id),
  ]);

  const canCreatePo = ['owner', 'admin', 'project_manager'].includes(profile.role);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div className="text-[13px] text-[#6b7280]">
          Purchase orders and truck check-ins for this job.
        </div>
        <div className="flex gap-[10px]">
          {canCreatePo ? (
            <Link
              href={`/dashboard/field-ops/${project.id}/deliveries/new`}
              className="rounded-[9px] border border-[#e0e4ea] bg-white px-[15px] py-[9px] text-[13px] font-semibold text-[#374151] transition-colors hover:border-[#c9d2e4]"
            >
              + New PO
            </Link>
          ) : null}
          <Link
            href={`/dashboard/field-ops/${project.id}/deliveries/check-in`}
            className="rounded-[9px] bg-[#2f49d1] px-[15px] py-[9px] text-[13px] font-semibold text-white transition-colors hover:bg-[#2438a8]"
          >
            + Check in delivery
          </Link>
        </div>
      </div>

      <DeliveriesSections
        projectId={project.id}
        pos={pos}
        orderless={orderless}
        canCreatePo={canCreatePo}
      />
    </div>
  );
}
