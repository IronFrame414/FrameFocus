import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { getProject } from '@/lib/services/projects';
import { getPurchaseOrderDetail, poTitle } from '@/lib/services/deliveries';
import { getMyMember } from '@/lib/services/members';
import { FieldTabs } from '@/components/field/field-tabs';
import { ClosePoButton, DeletePoButton, PoTotalControl } from './po-actions';

// 6D — handoff 4e: PO detail. Ordered-vs-usable bars (usable = received −
// damaged, DB-derived quantities aggregated per line), split-delivery truck
// cards with Exception/Clean badges, the can't-auto-close amber note, and
// the blue notification strip.

const card = 'rounded-[13px] border border-[#e6e9ef] bg-white';

function fmtYmd(ymd: string | null): string {
  if (!ymd) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return ymd;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).toLocaleDateString(
    'en-US',
    { month: 'short', day: 'numeric', timeZone: 'UTC' }
  );
}

export default async function PurchaseOrderDetailPage({
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
  if (!profile) redirect('/dashboard');

  const [project, po, myMember] = await Promise.all([
    getProject(params.projectId),
    getPurchaseOrderDetail(params.poId),
    getMyMember(),
  ]);
  if (!project || project.is_deleted || !po || po.is_deleted) notFound();
  if (po.project_id !== params.projectId) notFound();

  const isAdminRole = profile.role === 'owner' || profile.role === 'admin';
  const canEditPo = isAdminRole || profile.role === 'project_manager';
  const autoClosed = po.status === 'closed' && po.closed_by === null;
  const shortWithDamage =
    po.status === 'open' && po.lines.some((l) => !l.filled && l.damagedTotal > 0);

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
        / <span className="text-[#6b7280]">{po.po_number ?? po.vendor_name}</span>
      </div>

      <div className="mb-4 flex items-start justify-between">
        <div className="flex items-center gap-[10px]">
          <h2 className="text-[24px] font-extrabold tracking-[-0.01em] text-[#14213d]">
            {poTitle(po)}
          </h2>
          {po.status === 'open' ? (
            <span className="rounded-full bg-[#fdece0] px-[10px] py-[4px] text-[12px] font-semibold text-[#b45309]">
              Open
            </span>
          ) : (
            <span className="rounded-full bg-[#eef1f6] px-[10px] py-[4px] text-[12px] font-semibold text-[#6b7280]">
              Closed
            </span>
          )}
        </div>
        <div className="flex gap-[10px]">
          {canEditPo ? (
            <Link
              href={`/dashboard/field-ops/${project.id}/deliveries/${po.id}/edit`}
              className="rounded-[9px] border border-[#e0e4ea] bg-white px-[15px] py-[9px] text-[13px] font-semibold text-[#374151] transition-colors hover:border-[#c9d2e4]"
            >
              Edit
            </Link>
          ) : null}
          {isAdminRole && po.status === 'open' ? <ClosePoButton poId={po.id} /> : null}
          {isAdminRole ? <DeletePoButton poId={po.id} projectId={project.id} /> : null}
          {po.status === 'open' ? (
            <Link
              href={`/dashboard/field-ops/${project.id}/deliveries/check-in?po=${po.id}`}
              className="rounded-[9px] bg-[#2f49d1] px-[16px] py-[9px] text-[13px] font-semibold text-white transition-colors hover:bg-[#2438a8]"
            >
              + Check in delivery
            </Link>
          ) : null}
        </div>
      </div>

      <FieldTabs projectId={project.id} active="deliveries" />

      {/* 7C §2.4 — the PO total IS the commitment (Owner/Admin/PM). */}
      <PoTotalControl
        poId={po.id}
        projectId={params.projectId}
        totalAmount={po.total_amount}
        canEdit={canEditPo}
        hideAmounts={!isAdminRole}
      />

      <div className="grid grid-cols-[1fr_320px] items-start gap-[18px]">
        {/* Left — ordered vs usable */}
        <div className={`${card} p-[20px]`}>
          <div className="mb-[14px] text-[13px] font-bold uppercase text-[#14213d]">
            Ordered vs. usable{' '}
            <span className="text-[11px] font-medium normal-case tracking-normal text-[#9aa1ac]">
              — usable = received − damaged
            </span>
          </div>
          <div className="flex flex-col gap-4">
            {po.lines.length === 0 ? (
              <p className="text-[13px] text-[#9aa1ac]">No line items on this PO.</p>
            ) : (
              po.lines.map((line) => {
                const ordered = Number(line.item.qty_ordered);
                const usablePct = Math.min(100, Math.max(0, (line.usableTotal / ordered) * 100));
                const damagedPct = Math.min(
                  100 - usablePct,
                  Math.max(0, (line.damagedTotal / ordered) * 100)
                );
                return (
                  <div key={line.item.id}>
                    <div className="mb-[6px] flex justify-between">
                      <span className="text-[13px] font-semibold text-[#14213d]">
                        {line.item.description}
                        {line.item.unit ? (
                          <span className="ml-1 font-normal text-[#9aa1ac]">({line.item.unit})</span>
                        ) : null}
                      </span>
                      <span
                        className={
                          line.filled
                            ? 'font-mono text-[13px] font-semibold text-[#16a34a]'
                            : 'font-mono text-[13px] font-semibold text-[#b45309]'
                        }
                      >
                        {line.usableTotal} / {ordered} usable
                        {line.damagedTotal > 0 ? ` · ${line.damagedTotal} damaged` : ''}
                      </span>
                    </div>
                    <div className="flex h-2 overflow-hidden rounded-full bg-[#eef1f6]">
                      <div className="h-full bg-[#16a34a]" style={{ width: `${usablePct}%` }} />
                      {damagedPct > 0 ? (
                        <div className="h-full bg-[#e88a52]" style={{ width: `${damagedPct}%` }} />
                      ) : null}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {shortWithDamage ? (
            <div className="mt-4 rounded-[9px] border border-[#f3e2c4] bg-[#fdf6ec] p-[12px] text-[12px] leading-snug text-[#8a5a12]">
              A line is short on usable quantity. If the vendor credits instead of replacing,
              auto-close can&rsquo;t fire — an Owner or Admin closes this PO by hand with a
              required reason.
            </div>
          ) : null}
          {po.status === 'closed' ? (
            <div className="mt-4 rounded-[9px] border border-[#e6e9ef] bg-[#f4f6f9] p-[12px] text-[12px] leading-snug text-[#6b7280]">
              {autoClosed ? 'Auto-closed' : `Closed by ${po.closer?.display_name ?? 'Owner/Admin'}`}
              {po.closed_reason ? ` — "${po.closed_reason}"` : ''}
            </div>
          ) : null}
        </div>

        {/* Right rail — trucks */}
        <div className="flex flex-col gap-[14px]">
          <div className="text-[13px] font-bold uppercase text-[#14213d]">
            Deliveries{' '}
            <span className="text-[11px] font-medium normal-case tracking-normal text-[#9aa1ac]">
              {po.deliveries.length === 0
                ? '· none yet'
                : `· ${po.deliveries.length === 1 ? '1 truck' : `split · ${po.deliveries.length} trucks`}`}
            </span>
          </div>
          {po.deliveries.map((d, i) => {
            const items = d.items.filter((it) => !it.is_deleted);
            const canEditDelivery =
              isAdminRole || (myMember != null && myMember.id === d.received_by);
            return (
              <div key={d.id} className={`${card} p-[16px]`}>
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-[14px] font-bold text-[#14213d]">
                    Truck {i + 1} · {fmtYmd(d.delivery_date)}
                  </div>
                  {d.has_exceptions ? (
                    <span className="rounded-full bg-[#fbe4e2] px-[9px] py-[3px] text-[11px] font-semibold text-[#c0362c]">
                      Exception
                    </span>
                  ) : (
                    <span className="rounded-full bg-[#e4f0e6] px-[9px] py-[3px] text-[11px] font-semibold text-[#3d7a4b]">
                      Clean
                    </span>
                  )}
                </div>
                <div className="text-[13px] leading-relaxed text-[#374151]">
                  {items.map((it) => (
                    <div key={it.id}>
                      {it.description}: {Number(it.qty_received)} received
                      {Number(it.qty_damaged) > 0 ? (
                        <strong className="text-[#c0362c]"> · {Number(it.qty_damaged)} damaged</strong>
                      ) : null}
                      {it.issue_note ? (
                        <span className="text-[#9aa1ac]"> — &ldquo;{it.issue_note}&rdquo;</span>
                      ) : null}
                    </div>
                  ))}
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-[12px] text-[#9aa1ac]">
                    by {d.receiver?.display_name ?? 'Unknown'}
                    {d.notes ? ` · "${d.notes}"` : ''}
                  </span>
                  <span className="flex gap-2">
                    {/* Photos + record PDF live on the detail view (S90). */}
                    <Link
                      href={`/dashboard/field-ops/${project.id}/deliveries/d/${d.id}`}
                      className="text-[12px] font-semibold text-[#2f49d1] hover:underline"
                    >
                      Details
                    </Link>
                    {canEditDelivery ? (
                      <Link
                        href={`/dashboard/field-ops/${project.id}/deliveries/d/${d.id}/edit`}
                        className="text-[12px] font-semibold text-[#2f49d1] hover:underline"
                      >
                        Edit
                      </Link>
                    ) : null}
                  </span>
                </div>
              </div>
            );
          })}
          <div className="flex items-center gap-2 rounded-[9px] border border-[#dfe4f5] bg-[#f5f7ff] p-[11px] text-[12px] text-[#3a4db0]">
            ✉ Every check-in emails Owner, Admin, and assigned PMs — clean or flagged.
          </div>
        </div>
      </div>
    </div>
  );
}
