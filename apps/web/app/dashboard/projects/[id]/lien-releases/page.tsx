import { createClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { getReleasesForProject, getTemplates } from '@/lib/services/lien-releases';
import { ReleasesPanel } from './releases-panel';

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

  const [releases, templates] = await Promise.all([
    getReleasesForProject(id),
    getTemplates('client_outbound'),
  ]);

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
  );
}
