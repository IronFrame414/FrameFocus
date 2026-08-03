import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { getInvoiceDeliveries } from '@/lib/services/invoice-delivery';
import { getContractBilling } from '@/lib/services/contract-value';
import { getEstimateLineBilling } from '@/lib/services/estimate-line-billing';
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
  isDerivedContract,
  type ContractType,
  type InstrumentOption,
  type InstrumentTypes,
  type PickableCost,
} from '@/lib/services/invoices';
import { InvoiceBuilder } from './invoice-builder';

// Module 7D1 — invoice detail. The server resolves EVERY instrument this job
// can bill, their contract types and their cost pickers; the client component
// does the ticking and the writes.
//
// INSTRUMENT SCOPE [S97 — §2 / acceptance #2 made real]. P4 says contract type
// and rates live on the INSTRUMENT rather than the job. It never said one
// instrument per invoice — §2 has always required "an invoice may pull from the
// estimate and multiple COs together", and the schema has always allowed it
// (the pin is per LINE and its XOR check is per row). What did not exist was
// the path: this page resolved a single instrument from a `?instrument=` query
// param, so switching reloaded the page and discarded the selection.
//
// Now: every signed instrument is offered at once, each keeps its OWN contract
// type and prices through its OWN rates, and the builder holds one selection
// across all of them.

export default async function InvoiceDetailPage({
  params,
}: {
  params: { id: string; invoiceId: string };
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
  const signedCos = changeOrders.filter((co) => co.status === 'signed');

  // EVERY instrument this invoice may bill (§2). The originating estimate
  // first — it is the default and the fallback everywhere — then each SIGNED
  // change order, whatever its type. A fixed-price CO is included on purpose:
  // it cannot be derived, but it can carry a fixed line, and it must be
  // classifiable for the per-line retainage split (§5).
  const projectType = (project.project_type ?? 'fixed_price') as ContractType;
  const instruments: InstrumentOption[] = [];
  if (project.source_estimate_id) {
    instruments.push({
      key: `est:${project.source_estimate_id}`,
      label: 'Original Contract',
      ref: { estimate_id: project.source_estimate_id },
      contractType: projectType,
    });
  }
  for (const co of signedCos) {
    instruments.push({
      key: `co:${co.id}`,
      label: `${co.co_number}${co.title ? ` — ${co.title}` : ''}`,
      ref: { change_order_id: co.id },
      contractType: co.co_type as ContractType,
    });
  }

  // §5 — the map the per-line retainage split reads. `fallback` is the
  // originating contract's type, which is what an un-attributed line (a manual
  // line, a discount) belongs to.
  const instrumentTypes: InstrumentTypes = {
    byKey: Object.fromEntries(instruments.map((i) => [i.key, i.contractType])),
    fallback: projectType,
  };

  // Company-tz "today" and the timezone every calendar date on this screen is
  // derived in — read once here and threaded down (daily-logs/new/page.tsx
  // pattern): the hour pickers bucket by it, the age columns count against it,
  // and markInvoiceSent stamps issue_date with it. Deriving any of those from
  // toISOString() would be UTC and would misdate evening work and evening
  // sends; see companyDay / companyToday in invoices-shared.ts [S97].
  const { timezone } = await getCompanyTimeSettings();
  const today = companyToday(timezone);

  // Only a DERIVED instrument (cost-plus / T&M) has a cost or hour picker — a
  // fixed-price one bills by draw (§2).
  const derivedInstruments = instruments.filter((i) => isDerivedContract(i.contractType));
  const anyDerived = derivedInstruments.length > 0;

  // RULING A/B [S97]: rate rows are NOT loaded here any more. They used to be
  // fetched under the CALLER's session and handed to invoice-builder props,
  // which put markup percentages in a PM's browser. Pricing now happens in
  // /api/invoices/[id]/derive with the service role and returns no rates.
  //
  // getPickableCosts is already per-instrument (attribution is transitive
  // through project_budget_items), so it is simply called once per derived
  // instrument rather than once for the one that happened to be selected.
  const [costLists, pickableHours, credits] = await Promise.all([
    Promise.all(derivedInstruments.map((i) => getPickableCosts(params.id, i.ref, today))),
    anyDerived ? getPickableHours(params.id, today, timezone) : Promise.resolve([]),
    getAvailableCredits(params.id),
  ]);
  const pickableCostsByInstrument: Record<string, PickableCost[]> = Object.fromEntries(
    derivedInstruments.map((i, n) => [i.key, costLists[n]])
  );

  // §2 (trace G) — a percentage draw prices off the ORIGINAL contract value,
  // which is never mutated (7B derives the revised figure), so a signed CO
  // cannot re-price the draws (rule a / P4). Only the FINAL draw consumes
  // `alreadyBilled`, to bill the exact remainder (rule b).
  //
  // [S97] This used to sum billed_total across EVERY non-voided invoice on the
  // project. That was safe only while an invoice carried one instrument: since
  // §2/#2 shipped, a T&M change order's invoice would inflate the figure and
  // make the contract's FINAL DRAW bill less than the remainder it owes. It is
  // now scoped to lines billed against the CONTRACT instrument, which is also
  // exactly the sum remaining-to-bill needs — one derivation, two consumers.
  //
  // Drafts ARE counted here (unlike the displayed remaining-to-bill figure):
  // two drafts open at once must not each bill the same remainder.
  //
  // RULING 2 [S97]: the contract value lives in project_financials (Owner/Admin
  // RLS). Null means EITHER the job has none OR the caller is below Owner/Admin
  // — DrawPanel refuses to price a percentage draw in both cases rather than
  // falling back to zero.
  const contractBilling = await getContractBilling(params.id, params.invoiceId);

  // §2 [S97] — the estimate's LINE ITEMS, with what is left to bill on each.
  // Fixed-price contract only: a derived instrument bills from incurred cost
  // and worked hours (§6/§7), not from the estimate's agreed prices.
  const estimateLines =
    !isDerivedContract(projectType) && project.source_estimate_id
      ? await getEstimateLineBilling(params.id)
      : { estimateId: project.source_estimate_id ?? null, lines: [], undiscounted: 0 };
  const alreadyBilled =
    Math.round(
      (contractBilling.issuedAgainstContract + contractBilling.draftAgainstContract) * 100
    ) / 100;
  const originalContractValue = contractBilling.original;

  // §13 — delivery history + the send control. Read here (server) and handed
  // down; the panel itself renders only for Owner/Admin, and the route enforces
  // that independently.
  const deliveries = await getInvoiceDeliveries(params.invoiceId);
  const { data: projectContact } = project.contact_id
    ? await supabase.from('contacts').select('email').eq('id', project.contact_id).maybeSingle()
    : { data: null };

  return (
    <InvoiceBuilder
      deliveries={deliveries}
      recipientEmail={projectContact?.email ?? null}
      projectId={params.id}
      invoice={invoice}
      role={profile.role}
      memberId={member?.id ?? null}
      instruments={instruments}
      instrumentTypes={instrumentTypes}
      /** §2 — hours DEFAULT to the original contract and are reassignable to a
       *  CO per person-day (Josh's ruling, S97). */
      defaultInstrumentKey={instruments[0]?.key ?? null}
      sourceEstimateId={project.source_estimate_id ?? null}
      estimateLines={estimateLines}
      pickableCostsByInstrument={pickableCostsByInstrument}
      pickableHours={pickableHours}
      availableCredits={credits}
      originalContractValue={originalContractValue}
      alreadyBilled={alreadyBilled}
      projectRetainagePercent={project.retainage_percent ?? null}
      timeZone={timezone}
    />
  );
}
