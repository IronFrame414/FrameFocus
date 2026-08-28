import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { getProject } from '@/lib/services/projects';
import { getMyMember } from '@/lib/services/members';
import { getCompanyTimeSettings } from '@/lib/services/company';
import { companyToday } from '@/lib/services/invoices';
import {
  getClientRefunds,
  getJobPairing,
  getOpenInvoices,
  getProjectAging,
  getProjectPayments,
  getProjectRetainageHeld,
  getRetainageRelease,
} from '@/lib/services/payments';
import { PaymentsView } from './payments-view';
import { getReminderSettings } from '@/lib/services/reminders';

// Module 7E1 — the project's money-received screen (docs/specs/7e1-spec.md
// §2, §3, §4.1, §5, §6, §6a).
//
// Owner/Admin ONLY, matching the client_payments RLS policies. [Fix 4] This
// supersedes 7E P-3 ("a PM reads it ... a PM who cannot see whether their
// invoice was paid cannot do the job"): every figure on this screen is an
// AGGREGATE — collected/spent/ahead, the AR aging table, retainage held, total
// outstanding, payments received — which IS the client's whole financial
// position, and cannot be authorship-scoped. A PM keeps the Invoices tab
// (authorship-scoped) and submits for approval; the job's cash position is the
// Owner's. Foreman/Crew/PM are redirected rather than shown an empty screen.

export default async function PaymentsPage({ params }: { params: { id: string } }) {
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

  if (!['owner', 'admin'].includes(profile.role)) {
    redirect(`/dashboard/projects/${params.id}`);
  }

  const project = await getProject(params.id);
  if (!project || project.is_deleted) notFound();

  // Every calendar date on this screen is a COMPANY-timezone date, read once
  // here and threaded down — never derived from toISOString() (S97 ruling).
  const { timezone } = await getCompanyTimeSettings();
  const today = companyToday(timezone);

  const [member, aging, retainage, payments, openInvoices, release, pairing] = await Promise.all([
    getMyMember(),
    getProjectAging(params.id, today),
    getProjectRetainageHeld(params.id),
    getProjectPayments(params.id),
    getOpenInvoices(params.id),
    getRetainageRelease(params.id),
    getJobPairing(params.id),
  ]);

  // Refunds are Owner/Admin only at the RLS layer, so a PM simply gets none.
  const refunds = project.contact_id ? await getClientRefunds(project.contact_id) : [];

  // §6 — the per-client reminder configuration. RLS returns the inherited
  // company defaults below Owner/Admin, so this is safe to read for anyone who
  // can reach the page; the CONTROL is Owner/Admin only.
  const reminderSettings = await getReminderSettings(project.contact_id);

  return (
    <PaymentsView
      reminderSettings={reminderSettings}
      projectId={params.id}
      contactId={project.contact_id}
      role={profile.role}
      memberId={member?.id ?? null}
      today={today}
      aging={aging}
      retainageHeld={retainage}
      payments={payments.map((p) => ({
        id: p.id,
        paymentDate: p.payment_date,
        amount: Number(p.amount),
        method: p.method,
        note: p.note,
        creditAvailable: p.creditAvailable,
        applications: p.applications.map((a) => ({
          id: a.id,
          invoiceId: a.invoice_id,
          amount: Number(a.amount),
        })),
      }))}
      openInvoices={openInvoices}
      refunds={refunds.map((r) => ({
        id: r.id,
        refundDate: r.refund_date,
        amount: Number(r.amount),
        source: r.source,
        status: r.status,
        reason: r.reason,
      }))}
      release={
        release
          ? {
              id: release.id,
              signedOffOn: release.signed_off_on,
              amount: Number(release.amount),
              releaseInvoiceId: release.release_invoice_id,
            }
          : null
      }
      pairing={pairing}
      projectStatus={project.status}
    />
  );
}
