import { createClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import {
  getReleasesForProject,
  getSubReleasesForProject,
  getTemplates,
} from '@/lib/services/lien-releases';
import { ReleasesPanel } from './releases-panel';
import { SubReleasesSection } from './sub-releases-section';

// 7F §8.1 — the Lien Releases list under a job's financials.
//
// OWNER/ADMIN ONLY (§8.2). The tab is hidden from everyone else, and this
// gate is what enforces it.
//
// ⚠️ The role gate here is NOT the Financial Visibility Floor, and must not be
// re-justified on it — that rationale was STRUCK at S98. The Floor's S97
// carve-out already lets a PM see invoice totals and retainage, which IS the
// release amount, and 7E's payment read policies include project_manager. The
// reason is narrower and sufficient: a release WAIVES LEGAL RIGHTS and voiding
// does not retrieve it.

export default async function LienReleasesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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
  if (!profile || !['owner', 'admin'].includes(profile.role)) {
    redirect(`/dashboard/projects/${id}`);
  }

  // Redesign 6.4 — the sub-inbound direction surfaces (UI over shipped
  // schema; the S145 rulings and the generate route's sub arm already exist).
  const [releases, templates, subReleases, subTemplates, subContractsRes] = await Promise.all([
    getReleasesForProject(id),
    getTemplates('client_outbound'),
    getSubReleasesForProject(id),
    getTemplates('sub_inbound'),
    supabase
      .from('subcontractor_contracts')
      .select('id, completed_at, subcontractor:subcontractors(company_name)')
      .eq('project_id', id)
      .eq('is_deleted', false),
  ]);
  const subContracts = (subContractsRes.data ?? []).map((row) => {
    const s = row.subcontractor as { company_name: string } | { company_name: string }[] | null;
    return {
      id: row.id,
      completed: row.completed_at !== null,
      subName: (Array.isArray(s) ? s[0]?.company_name : s?.company_name) ?? 'Subcontractor',
    };
  });

  // §8.1 — each release shows its linked invoice.
  const invoiceIds = releases.map((r) => r.invoice_id).filter(Boolean) as string[];
  const { data: invoices } = invoiceIds.length
    ? await supabase
        .from('invoices')
        .select('id, invoice_number, issue_date, amount_receivable, is_final, status')
        .in('id', invoiceIds)
    : { data: [] };

  // Invoices with no release yet — where an unconditional can be initiated.
  // §5.1: there is NO system trigger for an unconditional, ever. The user
  // judges that funds cleared. This list is how they reach the action.
  const { data: sentInvoices } = await supabase
    .from('invoices')
    .select('id, invoice_number, issue_date, amount_receivable, is_final, status')
    .eq('project_id', id)
    .eq('is_deleted', false)
    .in('status', ['sent', 'paid'])
    .order('issue_date', { ascending: false });

  return (
    <div>
      <ReleasesPanel
        projectId={id}
        releases={releases}
      templates={templates.map((t) => ({
        id: t.id,
        name: t.name,
        type: t.type,
        is_final: t.is_final,
        direction: t.direction,
        jurisdiction_state: t.jurisdiction_state,
        hasPdf: t.pdf_file_id !== null,
      }))}
      invoices={(invoices ?? []).concat(
        (sentInvoices ?? []).filter((s) => !(invoices ?? []).some((i) => i.id === s.id))
      )}
      sentInvoiceIds={(sentInvoices ?? []).map((i) => i.id)}
      />
      <SubReleasesSection
        projectId={id}
        releases={subReleases.map((r) => ({
          id: r.id,
          type: r.type,
          is_final: r.is_final,
          status: r.status,
          sub_contract_id: r.sub_contract_id,
          expense_id: r.expense_id,
          created_at: r.created_at,
        }))}
        templates={subTemplates.map((t) => ({
          id: t.id,
          name: t.name,
          type: t.type,
          is_final: t.is_final,
          hasPdf: t.pdf_file_id !== null,
        }))}
        subContracts={subContracts}
      />
    </div>
  );
}
