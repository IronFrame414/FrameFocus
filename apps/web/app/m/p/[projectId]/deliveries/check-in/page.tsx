import { notFound } from 'next/navigation';
import { getProject } from '@/lib/services/projects';
import { getPurchaseOrders } from '@/lib/services/deliveries';
import { getCompanyTimeSettings } from '@/lib/services/company';
import { companyToday } from '@framefocus/shared/utils/dates';
import { CheckInForm, type PoOption } from './check-in-form';

// M6M §4.12.4 — M-22 · Delivery check-in (7d). A PAGE (D-28), and the ONE
// capture action D-6 makes ONLINE-ONLY: it is exempt from autosave and from
// the queue, and offline it fails closed with a message — never a Draft pill,
// which would promise durability the ruling denies (A-19, A-35c).
//
// Reached by deep link and from the delivery flow — M-15 deliberately offers
// no check-in control of its own (A-35c).

export default async function DeliveryCheckInPage({
  params,
}: {
  params: { projectId: string };
}) {
  const [project, pos, timeSettings] = await Promise.all([
    getProject(params.projectId),
    getPurchaseOrders(params.projectId),
    getCompanyTimeSettings(),
  ]);
  if (!project) notFound();

  // Open POs only — a closed PO is done receiving. Orderless stays available
  // regardless (deliveries.purchase_order_id is nullable; project_id is NOT
  // NULL, which is why this route carries the project in its path — the
  // handoff's header drew PO/vendor/truck and no project, and §4.12.4 flags
  // that as the gap M-22 must fill).
  const options: PoOption[] = pos
    .filter((po) => po.status === 'open')
    .map((po) => ({
      id: po.id,
      po_number: po.po_number,
      vendor_name: po.vendor_name,
      items: po.items
        .filter((i) => !i.is_deleted)
        .map((i) => ({
          id: i.id,
          description: i.description,
          qty_ordered: Number(i.qty_ordered),
        })),
    }));

  return (
    <CheckInForm
      projectId={params.projectId}
      projectName={project.name}
      poOptions={options}
      today={companyToday(timeSettings.timezone)}
    />
  );
}
