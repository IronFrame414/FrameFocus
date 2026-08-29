import { getProjectDeliveries, getOrderlessDeliveries } from '@/lib/services/deliveries';
import { SectionHeader } from '../section-header';
import { EmptyState, ListRow, SectionLabel } from '../../../mobile-ui';
import { MyPoLines } from '@/components/field/my-po-lines';

// M6M §4.11.5 — M-15 · Deliveries.
//
// TWO GROUPS FROM TWO SEPARATE SERVICE CALLS (A-35): "Against a PO" from
// getProjectDeliveries(), "No PO" from getOrderlessDeliveries().
//
// CUT: PURCHASE-ORDER MONEY (A-35). PurchaseOrderSummary carries orderedTotal /
// usableTotal — those are QUANTITY rollups, not currency, and may render — but
// NO PO cost, price or extended value appears on mobile (D-9). This screen
// renders no currency at all.
//
// NO CHECK-IN CONTROL (A-35c). D-6 makes delivery check-in ONLINE-ONLY and
// §4.12.4's M-22 is reached from the delivery record, not from this list.

function DeliveryGroup({
  label,
  rows,
  testId,
}: {
  label: string;
  rows: Awaited<ReturnType<typeof getProjectDeliveries>>;
  testId: string;
}) {
  return (
    <section data-testid={testId}>
      <SectionLabel>{label}</SectionLabel>
      {rows.length === 0 ? (
        <EmptyState>None.</EmptyState>
      ) : (
        <ul className="rounded-[15px] border border-m6m-border bg-m6m-card px-[12px]">
          {rows.map((d) => {
            const damaged = (d.items ?? []).some((i) => Number(i.qty_damaged) > 0);
            return (
              <ListRow key={d.id} testId="m-delivery-row">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[17px] font-bold leading-tight text-m6m-navy">
                    {d.vendor_name}
                  </p>
                  <p className="mt-[2px] flex flex-wrap items-center gap-[6px]">
                    <span className="font-mono text-[11px] text-m6m-muted">{d.delivery_date}</span>
                    <span className="font-mono text-[11px] text-m6m-muted">
                      {(d.items ?? []).length} items
                    </span>
                    {d.receiver?.display_name ? (
                      <span className="text-[13px] text-m6m-muted">{d.receiver.display_name}</span>
                    ) : null}
                  </p>
                  {/* Damage carries the danger treatment AND a text label —
                      never colour alone (A-35b). */}
                  {damaged ? (
                    <p
                      data-testid="m-damaged"
                      className="mt-[2px] font-mono text-[11px] font-semibold text-m6m-danger"
                    >
                      Damage reported
                    </p>
                  ) : null}
                </div>
              </ListRow>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default async function ProjectDeliveriesPage({
  params,
}: {
  params: { projectId: string };
}) {
  const [withPo, orderless] = await Promise.all([
    getProjectDeliveries(params.projectId),
    getOrderlessDeliveries(params.projectId),
  ]);

  return (
    <div className="px-[18px] pb-[18px]">
      <SectionHeader projectId={params.projectId} title="Deliveries" />
      {/* R6 — the member's assigned lines. The shared component renders no
          currency, honouring this screen's A-35/D-9 money cut. */}
      <MyPoLines projectId={params.projectId} />
      <DeliveryGroup label="Against a PO" rows={withPo} testId="m-group-po" />
      <DeliveryGroup label="No PO" rows={orderless} testId="m-group-nopo" />
    </div>
  );
}
