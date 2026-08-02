import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { getProject } from '@/lib/services/projects';
import { getChangeOrders } from '@/lib/services/change-orders';
import { getCompanyTimeSettings } from '@/lib/services/company';
import { getMyMember } from '@/lib/services/members';
import {
  getAvailableCredits,
  getInvoice,
  companyToday,
  getPickableCosts,
  getPickableHours,
  type ContractType,
  type InstrumentRef,
} from '@/lib/services/invoices';
import { InvoiceBuilder } from './invoice-builder';

// Module 7D1 — invoice detail. The server resolves the instrument, its rates,
// and the two pickers; the client component does the ticking and the writes.
//
// INSTRUMENT SCOPE (P4 — type and rates live on the instrument, never the job):
// a derived invoice bills ONE instrument. The default is the project's
// originating estimate-contract; a non-fixed CO can be billed instead by
// picking it in the builder.

export default async function InvoiceDetailPage({
  params,
  searchParams,
}: {
  params: { id: string; invoiceId: string };
  searchParams: { instrument?: string };
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
  if (!['owner', 'admin', 'project_manager'].includes(profile.role)) {
    redirect(`/dashboard/projects/${params.id}`);
  }

  const [member, project, invoice] = await Promise.all([
    getMyMember(),
    getProject(params.id),
    getInvoice(params.invoiceId),
  ]);
  if (!project || !invoice || invoice.project_id !== params.id) notFound();

  const changeOrders = await getChangeOrders(params.id);
  const nonFixedCos = changeOrders.filter(
    (co) => co.co_type !== 'fixed_price' && co.status === 'signed'
  );

  // Which instrument this invoice derives from. ?instrument=co:<id> bills a
  // change order; otherwise the originating estimate-contract.
  const coParam = searchParams.instrument?.startsWith('co:')
    ? searchParams.instrument.slice(3)
    : null;
  const selectedCo = coParam ? nonFixedCos.find((co) => co.id === coParam) ?? null : null;

  const instrument: InstrumentRef | null = selectedCo
    ? { change_order_id: selectedCo.id }
    : project.source_estimate_id
      ? { estimate_id: project.source_estimate_id }
      : null;

  const contractType: ContractType = (selectedCo?.co_type ??
    project.project_type ??
    'fixed_price') as ContractType;

  // Company-tz "today" and the timezone every calendar date on this screen is
  // derived in — read once here and threaded down (daily-logs/new/page.tsx
  // pattern): the hour pickers bucket by it, the age columns count against it,
  // and markInvoiceSent stamps issue_date with it. Deriving any of those from
  // toISOString() would be UTC and would misdate evening work and evening
  // sends; see companyDay / companyToday in invoices-shared.ts [S97].
  const { timezone } = await getCompanyTimeSettings();
  const today = companyToday(timezone);
  const derived = contractType === 'cost_plus' || contractType === 'time_and_materials';

  // RULING A/B [S97]: rate rows are NOT loaded here any more. They used to be
  // fetched under the CALLER's session and handed to invoice-builder props,
  // which put markup percentages in a PM's browser. Pricing now happens in
  // /api/invoices/[id]/derive with the service role and returns no rates.
  const [pickableCosts, pickableHours, credits] = await Promise.all([
    instrument && derived
      ? getPickableCosts(params.id, instrument, today)
      : Promise.resolve([]),
    derived ? getPickableHours(params.id, today, timezone) : Promise.resolve([]),
    getAvailableCredits(params.id),
  ]);

  // §2 (trace G) — a percentage draw prices off the ORIGINAL contract value.
  // projects.contract_value is never mutated (7B derives the revised figure),
  // so this is exactly the right number, and a signed CO cannot re-price the
  // draws (rule a / P4).
  const { data: billedSoFar } = await supabase
    .from('invoices')
    .select('billed_total')
    .eq('project_id', params.id)
    .neq('status', 'voided')
    .eq('is_deleted', false)
    .neq('id', params.invoiceId);
  const alreadyBilled =
    Math.round(
      (billedSoFar ?? []).reduce((sum, i) => sum + Number(i.billed_total ?? 0), 0) * 100
    ) / 100;

  return (
    <InvoiceBuilder
      projectId={params.id}
      invoice={invoice}
      role={profile.role}
      memberId={member?.id ?? null}
      contractType={contractType}
      instrument={instrument}
      instrumentLabel={
        selectedCo
          ? `${selectedCo.co_number}${selectedCo.title ? ` — ${selectedCo.title}` : ''}`
          : 'Original Contract'
      }
      changeOrderOptions={nonFixedCos.map((co) => ({
        id: co.id,
        label: `${co.co_number}${co.title ? ` — ${co.title}` : ''}`,
        coType: co.co_type as ContractType,
      }))}
      pickableCosts={pickableCosts}
      pickableHours={pickableHours}
      availableCredits={credits}
      originalContractValue={project.contract_value ?? null}
      alreadyBilled={alreadyBilled}
      projectRetainagePercent={project.retainage_percent ?? null}
      timeZone={timezone}
    />
  );
}
