import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { getProject } from '@/lib/services/projects';
import { getOrderlessDeliveries, getPurchaseOrders, poTitle } from '@/lib/services/deliveries';
import { FieldTabs } from '@/components/field/field-tabs';

// 6D — Deliveries tab list (Phase 2 Q3, approved: minimal). PO rows with a
// usable rollup + an orderless check-ins section. + New PO is Owner/Admin/PM
// (RLS-mirrored gate); + Check in delivery is any member.

function fmtYmd(ymd: string | null): string {
  if (!ymd) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return ymd;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).toLocaleDateString(
    'en-US',
    { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }
  );
}

function StatusBadge({ status }: { status: 'open' | 'closed' }) {
  return status === 'open' ? (
    <span className="rounded-full bg-[#fdece0] px-[10px] py-[3px] text-[11px] font-semibold text-[#b45309]">
      Open
    </span>
  ) : (
    <span className="rounded-full bg-[#eef1f6] px-[10px] py-[3px] text-[11px] font-semibold text-[#6b7280]">
      Closed
    </span>
  );
}

function ExceptionBadge({ flagged }: { flagged: boolean }) {
  return flagged ? (
    <span className="rounded-full bg-[#fbe4e2] px-[9px] py-[3px] text-[11px] font-semibold text-[#c0362c]">
      Exception
    </span>
  ) : (
    <span className="rounded-full bg-[#e4f0e6] px-[9px] py-[3px] text-[11px] font-semibold text-[#3d7a4b]">
      Clean
    </span>
  );
}

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

      <div className="mb-2 text-[13px] font-bold uppercase text-[#14213d]">Purchase orders</div>
      <div className="flex flex-col gap-2">
        {pos.length === 0 ? (
          <div className="rounded-[13px] border border-[#e6e9ef] bg-white p-6 text-sm text-[#6b7280]">
            No purchase orders yet.
            {canCreatePo ? ' Enter one so the crew has something to check the truck against.' : ''}
          </div>
        ) : (
          pos.map((po) => (
            <Link
              key={po.id}
              href={`/dashboard/field-ops/${project.id}/deliveries/${po.id}`}
              className="flex items-center justify-between rounded-[13px] border border-[#e6e9ef] bg-white px-5 py-[14px] transition-colors hover:border-[#c9d2e4]"
            >
              <div className="flex items-center gap-3">
                <span className="text-[14px] font-semibold text-[#14213d]">{poTitle(po)}</span>
                <StatusBadge status={po.status} />
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-[13px] font-semibold text-[#14213d]">
                  {po.usableTotal} / {po.orderedTotal} usable
                </span>
                {po.anyDamaged ? (
                  <span className="text-[11px] font-semibold text-[#b45309]">damage recorded</span>
                ) : null}
                <span className="text-[13px] font-semibold text-[#2f49d1]">Open →</span>
              </div>
            </Link>
          ))
        )}
      </div>

      <div className="mb-2 mt-6 text-[13px] font-bold uppercase text-[#14213d]">
        Orderless check-ins{' '}
        <span className="text-[11px] font-medium normal-case text-[#9aa1ac]">
          · no PO attached (§4 escape hatch)
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {orderless.length === 0 ? (
          <div className="rounded-[13px] border border-[#e6e9ef] bg-white p-5 text-sm text-[#6b7280]">
            None — every delivery so far arrived against a PO.
          </div>
        ) : (
          orderless.map((d) => (
            <Link
              key={d.id}
              href={`/dashboard/field-ops/${project.id}/deliveries/d/${d.id}`}
              className="flex items-center justify-between rounded-[13px] border border-[#e6e9ef] bg-white px-5 py-[14px] transition-colors hover:border-[#c9d2e4]"
            >
              <div className="flex items-center gap-3">
                <span className="font-mono text-[13px] font-semibold text-[#14213d]">
                  {fmtYmd(d.delivery_date)}
                </span>
                <span className="text-[13px] text-[#374151]">{d.vendor_name}</span>
                <span className="text-[12px] text-[#9aa1ac]">
                  by {d.receiver?.display_name ?? 'Unknown'}
                </span>
              </div>
              <ExceptionBadge flagged={d.has_exceptions} />
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
