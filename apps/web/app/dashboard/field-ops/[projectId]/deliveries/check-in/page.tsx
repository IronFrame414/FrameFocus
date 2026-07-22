import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { getProject } from '@/lib/services/projects';
import { getPurchaseOrders, poTitle } from '@/lib/services/deliveries';
import { getCompanyTimeSettings } from '@/lib/services/company';
import { FieldTabs } from '@/components/field/field-tabs';
import { CheckInForm } from './check-in-form';

// 6D §U — delivery check-in form (path A; mobile foundation). Any member on
// a visible project (§3 amendment) — no role gate. ?po= preselects a PO;
// orderless is a first-class choice (§4 escape hatch).

export default async function CheckInPage({
  params,
  searchParams,
}: {
  params: { projectId: string };
  searchParams: { po?: string };
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  const project = await getProject(params.projectId);
  if (!project || project.is_deleted) notFound();

  const [pos, { timezone }] = await Promise.all([
    getPurchaseOrders(project.id),
    getCompanyTimeSettings(),
  ]);
  const openPos = pos.filter((po) => po.status === 'open');

  const todayYmd = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

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
        / <span className="text-[#6b7280]">Check in</span>
      </div>

      <h2 className="mb-4 text-[24px] font-extrabold tracking-[-0.01em] text-[#14213d]">
        Check in a delivery
      </h2>

      <FieldTabs projectId={project.id} active="deliveries" />

      <CheckInForm
        projectId={project.id}
        todayYmd={todayYmd}
        preselectedPoId={searchParams.po ?? null}
        openPos={openPos.map((po) => ({
          id: po.id,
          title: poTitle(po),
          vendor_name: po.vendor_name,
          lines: po.lines.map((l) => ({
            po_item_id: l.item.id,
            description: l.item.description,
            unit: l.item.unit,
            remaining: Math.max(0, Number(l.item.qty_ordered) - l.usableTotal),
          })),
        }))}
      />
    </div>
  );
}
