import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { getProject } from '@/lib/services/projects';
import { getOrderlessDeliveries, getPurchaseOrders } from '@/lib/services/deliveries';
import { FieldTabs } from '@/components/field/field-tabs';
import { DeliveriesSections } from '@/components/field/deliveries-sections';
import { DraftPosModal } from './draft-pos-modal';

// 6D — Deliveries tab list (Phase 2 Q3, approved: minimal). The list body is
// shared with the project-detail Deliveries tab (S90 dual-entry) via
// DeliveriesSections: open POs, closed POs (kept visible for the record),
// and orderless check-ins. + New PO is Owner/Admin/PM (RLS-mirrored gate);
// + Check in delivery is any member.

export default async function DeliveriesListPage({
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
  if (!profile) redirect('/dashboard');

  const project = await getProject(params.projectId);
  if (!project || project.is_deleted) notFound();

  const [pos, orderless] = await Promise.all([
    getPurchaseOrders(project.id),
    getOrderlessDeliveries(project.id),
  ]);

  const canCreatePo = ['owner', 'admin', 'project_manager'].includes(profile.role);

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
        / Field / <span className="text-[#6b7280]">Deliveries</span>
      </div>

      <div className="mb-4 flex items-start justify-between">
        <div>
          <h2 className="text-[24px] font-extrabold tracking-[-0.01em] text-[#14213d]">
            Deliveries
          </h2>
          <div className="mt-[2px] text-[13px] text-[#6b7280]">{project.name}</div>
        </div>
        <div className="flex gap-[10px]">
          {/* 18a — drafting from the estimate, when the project came from one.
              Its chosen home (spec §6): reachable any time post-conversion,
              which subsumes the convert-flow entry. */}
          {canCreatePo && project.source_estimate_id ? (
            <DraftPosModal projectId={project.id} sourceEstimateId={project.source_estimate_id} />
          ) : null}
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

      <FieldTabs projectId={project.id} active="deliveries" />

      <DeliveriesSections
        projectId={project.id}
        pos={pos}
        orderless={orderless}
        canCreatePo={canCreatePo}
      />
    </div>
  );
}
