import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { createClient } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { storeInvoicePdf } from '@/lib/services/invoice-pdf-service';
import {
  buildSenderAddress,
  DEFAULT_INVOICE_BODY,
  DEFAULT_INVOICE_SUBJECT,
  logEmail,
  replaceTemplateVariables,
  sendEmail,
} from '@/lib/services/email-service';
import { InvoiceEmail } from '@/lib/email/templates/invoice-email';

// 7D1 §13 — email a SENT invoice to the client with its PDF attached.
//
// Follows the change-order send route exactly (app/api/change-orders/[id]/send):
// same auth shape, same sender, same sendEmail + logEmail pair, same
// "email failure is a warning, never a silent success" posture. Nothing about
// the sender is reinvented.
//
// OWNER/ADMIN ONLY. Narrower than the CO route (which admits a PM) because this
// puts a bill in front of a client under the company's name.
//
// NO PAY LINK. Payment is QuickBooks-hosted and 7G is not built, so there is
// nothing to link to. The mail carries the amount due and the PDF and offers no
// button — omitted rather than faked.
//
// SENT INVOICES ONLY. A draft has no number and is watermarked "not a bill"
// (§9/§10); mailing one to a client is the mistake the watermark exists to
// prevent.
//
// DELIVERY HISTORY is email_logs, the shipped model — not a parallel one. The
// Resend webhook already advances each row sent → delivered → opened →
// bounced / complained / failed by resend_message_id, so a bounce surfaces on
// the invoice without anything further being built.

function fmtDate(value: string): string {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1)).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('user_id', user.id)
    .eq('is_deleted', false)
    .single();
  if (!profile || !['owner', 'admin'].includes(profile.role)) {
    return NextResponse.json(
      { error: 'Only an Owner or Admin can email an invoice to a client.' },
      { status: 403 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    recipient_email?: string;
    recipient_name?: string;
    subject?: string;
    body?: string;
  };

  // RLS-scoped — a cross-tenant or unreachable id 404s here.
  const { data: invoice } = await supabase
    .from('invoices')
    .select('id, status, invoice_number, issue_date, amount_receivable, company_id, project_id, is_deleted')
    .eq('id', params.id)
    .eq('is_deleted', false)
    .maybeSingle();
  if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });

  if (invoice.status !== 'sent' && invoice.status !== 'paid') {
    return NextResponse.json(
      {
        error:
          invoice.status === 'draft' || invoice.status === 'pending_approval'
            ? 'This invoice is still a draft — mark it sent before emailing it to the client.'
            : `An invoice with status ${invoice.status} cannot be emailed.`,
      },
      { status: 409 }
    );
  }

  const admin = getSupabaseAdmin() as SupabaseClient<Database>;

  const { data: company } = await admin
    .from('companies')
    .select('name, slug, logo_url, brand_color')
    .eq('id', invoice.company_id)
    .single();
  if (!company) {
    console.error('INVOICE SEND — company lookup failed', { company_id: invoice.company_id });
    return NextResponse.json({ error: 'Company not found' }, { status: 500 });
  }

  const { data: project } = await admin
    .from('projects')
    .select('name, contact_id')
    .eq('id', invoice.project_id)
    .maybeSingle();

  // Recipient: explicit override wins, else the project's contact.
  let recipientEmail = body.recipient_email ?? null;
  let recipientName = body.recipient_name ?? null;
  if (!recipientEmail && project?.contact_id) {
    const { data: contact } = await admin
      .from('contacts')
      .select('first_name, last_name, email')
      .eq('id', project.contact_id)
      .maybeSingle();
    if (contact?.email) {
      recipientEmail = contact.email;
      recipientName = recipientName ?? `${contact.first_name} ${contact.last_name}`.trim();
    }
  }
  if (!recipientEmail) {
    return NextResponse.json(
      { error: 'No recipient email. Set a primary contact on the project, or pass recipient_email.' },
      { status: 422 }
    );
  }

  // The stored PDF is the same artifact Print/Download produce, and storing it
  // files the invoice under the project's Files — so the invoice is saved to
  // the project whether or not the email gets through.
  const stored = await storeInvoicePdf(supabase, admin, params.id);
  if (stored.error || !stored.buffer) {
    console.error('INVOICE SEND — PDF generation failed', { invoiceId: params.id, error: stored.error });
    return NextResponse.json({ error: 'Could not generate the invoice PDF' }, { status: 500 });
  }

  const invoiceNumber = invoice.invoice_number ?? params.id.slice(0, 8);
  const amountDue = money(Number(invoice.amount_receivable));
  const variables: Record<string, string> = {
    company_name: company.name,
    contact_name: recipientName ?? 'there',
    invoice_number: invoiceNumber,
    project_name: project?.name ?? '',
    issue_date: fmtDate(invoice.issue_date),
    amount_due: amountDue,
  };
  const subject = replaceTemplateVariables(body.subject ?? DEFAULT_INVOICE_SUBJECT, variables);
  const bodyText = replaceTemplateVariables(body.body ?? DEFAULT_INVOICE_BODY, variables);
  const sender = buildSenderAddress(company);

  // sendEmail can THROW (getResend() with no RESEND_API_KEY), so a thrown error
  // is folded into the same shape as a returned one — a failed send must be
  // logged and reported, never swallowed into a success.
  let messageId: string | null = null;
  let sendError: string | null = null;
  try {
    const sent = await sendEmail({
      from: sender,
      to: recipientEmail,
      subject,
      react: InvoiceEmail({
        companyName: company.name,
        logoUrl: company.logo_url,
        brandColor: company.brand_color || '#1a56db',
        bodyText,
        invoiceNumber,
        amountDue,
      }),
      attachments: [{ filename: `invoice-${invoiceNumber}.pdf`, content: stored.buffer }],
    });
    messageId = sent.messageId;
    sendError = sent.error;
  } catch (err) {
    sendError = err instanceof Error ? err.message : 'Email send failed';
  }

  await logEmail(admin, {
    company_id: invoice.company_id,
    estimate_id: null,
    signing_session_id: null,
    change_order_id: null,
    co_signing_session_id: null,
    invoice_id: invoice.id,
    resend_message_id: messageId,
    email_type: 'invoice',
    recipient_email: recipientEmail,
    sender_email: sender,
    subject,
    status: sendError ? 'failed' : 'sent',
    metadata: sendError ? { error: sendError, body: bodyText } : { body: bodyText },
  });

  if (sendError) {
    // The PDF is filed and the attempt is logged `failed`, so the delivery
    // history tells the truth. The caller must not read this as a success.
    console.error('INVOICE SEND — delivery failed', { invoiceId: params.id, error: sendError });
    return NextResponse.json(
      { success: false, error: `Email delivery failed: ${sendError}` },
      { status: 502 }
    );
  }

  return NextResponse.json({ success: true, recipientEmail, sentAt: new Date().toISOString() });
}
