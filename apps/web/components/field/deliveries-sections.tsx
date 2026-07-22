import Link from 'next/link';
import type { DeliveryWithItems, PurchaseOrderSummary } from '@/lib/services/deliveries';
import { poTitle } from '@/lib/services/deliveries-client';

// 6D — the deliveries list body, shared by BOTH entry points (S90 dual-entry:
// Field Ops → Deliveries tab AND the project-detail Deliveries tab). Server
// component; each page supplies its own chrome (breadcrumb/tab strip) and
// action buttons. Closed POs stay VISIBLE, grouped under their own section —
// the verified S90 posture: nothing in the query or RLS drops them; the
// grouping makes their presence unmistakable.

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

function PoRow({ projectId, po }: { projectId: string; po: PurchaseOrderSummary }) {
  return (
    <Link
      href={`/dashboard/field-ops/${projectId}/deliveries/${po.id}`}
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
  );
}

export function DeliveriesSections({
  projectId,
  pos,
  orderless,
  canCreatePo,
}: {
  projectId: string;
  pos: PurchaseOrderSummary[];
  orderless: DeliveryWithItems[];
  canCreatePo: boolean;
}) {
  const openPos = pos.filter((po) => po.status === 'open');
  const closedPos = pos.filter((po) => po.status === 'closed');

  return (
    <div>
      <div className="mb-2 text-[13px] font-bold uppercase text-[#14213d]">Open purchase orders</div>
      <div className="flex flex-col gap-2">
        {openPos.length === 0 ? (
          <div className="rounded-[13px] border border-[#e6e9ef] bg-white p-6 text-sm text-[#6b7280]">
            {pos.length === 0
              ? `No purchase orders yet.${canCreatePo ? ' Enter one so the crew has something to check the truck against.' : ''}`
              : 'No open purchase orders — every PO is closed (below).'}
          </div>
        ) : (
          openPos.map((po) => <PoRow key={po.id} projectId={projectId} po={po} />)
        )}
      </div>

      {closedPos.length > 0 ? (
        <>
          <div className="mb-2 mt-6 text-[13px] font-bold uppercase text-[#14213d]">
            Closed purchase orders{' '}
            <span className="text-[11px] font-medium normal-case text-[#9aa1ac]">
              · filled or closed by hand — kept here for the record
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {closedPos.map((po) => (
              <PoRow key={po.id} projectId={projectId} po={po} />
            ))}
          </div>
        </>
      ) : null}

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
              href={`/dashboard/field-ops/${projectId}/deliveries/d/${d.id}`}
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
