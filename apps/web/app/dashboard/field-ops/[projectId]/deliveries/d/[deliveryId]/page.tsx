import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { getProject } from '@/lib/services/projects';
import { getDelivery } from '@/lib/services/deliveries';
import { getMyMember } from '@/lib/services/members';
import { FieldTabs } from '@/components/field/field-tabs';
import { DeleteDeliveryButton } from './delivery-actions';

// 6D — single delivery read view (primarily the orderless check-ins' home;
// PO-linked trucks render inside the 4e PO detail and link here via Edit).

const card = 'rounded-[13px] border border-[#e6e9ef] bg-white';

function fmtYmd(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return ymd;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).toLocaleDateString(
    'en-US',
    { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }
  );
}

export default async function DeliveryDetailPage({
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
        / <span className="text-[#6b7280]">{delivery.vendor_name}</span>
      </div>

      <div className="mb-4 flex items-start justify-between">
        <div className="flex items-center gap-[10px]">
          <h2 className="text-[24px] font-extrabold tracking-[-0.01em] text-[#14213d]">
            Delivery — {delivery.vendor_name}
          </h2>
          {delivery.has_exceptions ? (
            <span className="rounded-full bg-[#fbe4e2] px-[10px] py-[4px] text-[12px] font-semibold text-[#c0362c]">
              Exception
            </span>
          ) : (
            <span className="rounded-full bg-[#e4f0e6] px-[10px] py-[4px] text-[12px] font-semibold text-[#3d7a4b]">
              Clean
            </span>
          )}
        </div>
        <div className="flex gap-[10px]">
          {canEdit ? (
            <Link
              href={`/dashboard/field-ops/${project.id}/deliveries/d/${delivery.id}/edit`}
              className="rounded-[9px] border border-[#e0e4ea] bg-white px-[15px] py-[9px] text-[13px] font-semibold text-[#374151] transition-colors hover:border-[#c9d2e4]"
            >
              Edit
            </Link>
          ) : null}
          {isAdminRole ? (
            <DeleteDeliveryButton deliveryId={delivery.id} projectId={project.id} />
          ) : null}
        </div>
      </div>

      <FieldTabs projectId={project.id} active="deliveries" />

      <div className={`${card} max-w-[760px] p-[20px]`}>
        <div className="mb-3 text-[13px] text-[#6b7280]">
          {fmtYmd(delivery.delivery_date)} · received by{' '}
          {delivery.receiver?.display_name ?? 'Unknown'}
          {delivery.purchase_order ? (
            <>
              {' '}
              · against{' '}
              <Link
                href={`/dashboard/field-ops/${project.id}/deliveries/${delivery.purchase_order.id}`}
                className="font-semibold text-[#2f49d1] hover:underline"
              >
                {delivery.purchase_order.po_number ?? delivery.purchase_order.vendor_name}
              </Link>
            </>
          ) : (
            ' · no PO (orderless check-in)'
          )}
        </div>

        <div className="flex flex-col">
          {delivery.items.map((it) => (
            <div
              key={it.id}
              className="flex items-start justify-between border-b border-[#f4f6f9] py-2 last:border-0"
            >
              <div className="text-[13px] text-[#374151]">
                {it.description}
                {it.issue_note ? (
                  <div className="text-[12px] text-[#b45309]">⚠ &ldquo;{it.issue_note}&rdquo;</div>
                ) : null}
              </div>
              <div className="shrink-0 font-mono text-[13px] font-semibold text-[#14213d]">
                {Number(it.qty_received)} received
                {Number(it.qty_damaged) > 0 ? (
                  <span className="text-[#c0362c]"> · {Number(it.qty_damaged)} damaged</span>
                ) : null}
              </div>
            </div>
          ))}
        </div>

        {delivery.notes ? (
          <div className="mt-3 text-[13px] text-[#374151]">
            <span className="font-semibold text-[#14213d]">Notes:</span> {delivery.notes}
          </div>
        ) : null}
      </div>
    </div>
  );
}
