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
import { companyToday, paymentTermsLabel } from '@/lib/services/invoices-shared';

// 7D1 §13 — SEND an invoice to the client: issue it and email it, one action.
//
// [S97, Josh] THIS ROUTE IS NO LONGER GATED ON THE INVOICE ALREADY BEING SENT.
// It used to 409 anything still a draft, which meant "Mark sent" and "Email to
// client" were two separate clicks in two separate places and the second one
// was easy to forget — an invoice could sit issued and undelivered. The route
// now performs the whole transition itself, in this order:
//
//   1. PRE-FLIGHT   — auth, role, reachability, status, approval, has lines,
//                     recipient. ALL of it BEFORE anything is allocated.
//   2. ISSUE        — flip draft/pending_approval -> sent. The
//                     `invoices_assign_number` BEFORE trigger stamps the
//                     invoice number INSIDE this same UPDATE, so allocation is
//                     atomic with the status change and is not a step this
//                     route can get wrong or half-do.
//   3. PDF          — render and file it under the project.
//   4. EMAIL        — Resend, with the PDF attached.
//
// WHY THE PRE-FLIGHT ORDER MATTERS (Josh's ruling). Invoice numbers are a
// strictly sequential, gap-free, never-reused series (§10). Every ordinary
// failure — not authenticated, wrong role, wrong status, not approved, no
// lines, no recipient — is therefore checked BEFORE step 2, so it cannot
// consume a number. Only a failure at step 3 or 4 happens after allocation.
//
// A FAILURE AFTER ALLOCATION DOES NOT ROLL BACK [S97, Josh's ruling]. Once an
// invoice is numbered it is ISSUED, and issuing is not undone by a mail server
// having a bad day. Delivery is a separate concern with its own record:
// email_logs already carries failed/bounced/complained and the Resend webhook
// advances it. So a PDF or Resend failure leaves the invoice SENT, logs the
// attempt as `failed`, and returns a non-2xx that names what broke. The caller
// re-sends; it never re-issues. Rolling the status back would either burn a
// number (the series gaps) or reuse one (the series lies) — both worse than an
// invoice that is issued and visibly undelivered.
//
// OWNER/ADMIN ONLY. Narrower than the CO send route (which admits a PM)
// because this puts a bill in front of a client under the company's name, and
// §12 keeps a PM's invoice behind an Owner/Admin approval.
//
// NO PAY LINK. Payment is QuickBooks-hosted and 7G is not built, so there is
// nothing to link to. The mail carries the amount due and the PDF and offers
// no button — omitted rather than faked.

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

  // ── 1. PRE-FLIGHT ─────────────────────────────────────────────────────────
  // Nothing below this block allocates anything. Every check here is a reason
  // NOT to burn an invoice number.

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
      { error: 'Only an Owner or Admin can send an invoice to a client.' },
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
    .select('id, status, approved_at, company_id, project_id')
    .eq('id', params.id)
    .eq('is_deleted', false)
    .maybeSingle();
  if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });

  const isOpen = invoice.status === 'draft' || invoice.status === 'pending_approval';
  const isIssued = invoice.status === 'sent' || invoice.status === 'paid';
  if (!isOpen && !isIssued) {
    return NextResponse.json(
      { error: `An invoice with status ${invoice.status} cannot be sent.` },
      { status: 409 }
    );
  }

  // §12 / §16 #17 — a PM-created invoice cannot go out until Owner/Admin have
  // approved it. Reaching this route as Owner/Admin is NOT itself the approval:
  // the approval is a recorded act with an actor and a timestamp, and sending
  // must not fabricate one.
  if (invoice.status === 'pending_approval' && !invoice.approved_at) {
    return NextResponse.json(
      { error: 'This invoice is awaiting approval. Approve it before sending it to the client.' },
      { status: 409 }
    );
  }

  // Never issue an empty invoice. This is a pre-flight check precisely so the
  // mistake costs nothing — an invoice number spent on a blank bill can never
  // be recovered (§10: no reuse).
  if (isOpen) {
    const { count: lineCount } = await supabase
      .from('invoice_lines')
      .select('id', { count: 'exact', head: true })
      .eq('invoice_id', params.id);
    if (!lineCount) {
      return NextResponse.json(
        { error: 'This invoice has no lines. Add at least one line before sending it.' },
        { status: 422 }
      );
    }
  }

  const admin = getSupabaseAdmin() as SupabaseClient<Database>;

  const { data: company } = await admin
    .from('companies')
    .select('name, slug, logo_url, brand_color, timezone')
    .eq('id', invoice.company_id)
    .single();
  if (!company) {
    console.error('INVOICE SEND — company lookup failed', {
      invoiceId: params.id,
      company_id: invoice.company_id,
      check: 'companies row missing',
    });
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

  // ── 2. ISSUE — the number is allocated inside this UPDATE ──────────────────
  // The UPDATE is scoped to the open statuses so two racing sends cannot both
  // transition the row: the loser matches ZERO rows and says so, rather than
  // re-stamping sent_at over a live invoice.
  //
  // issue_date is the CALENDAR DATE the client reads on the bill, so it is a
  // COMPANY-tz date [S97] — sending at 9pm must not date the invoice tomorrow.
  // sent_at beside it is an INSTANT and correctly stays a UTC timestamptz.
  if (isOpen) {
    const { data: issued, error: issueError } = await supabase
      .from('invoices')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        issue_date: companyToday(company.timezone ?? 'UTC'),
      })
      .eq('id', params.id)
      .in('status', ['draft', 'pending_approval'])
      .select('id');
    if (issueError) {
      console.error('INVOICE SEND — issue failed', {
        invoiceId: params.id,
        check: 'status transition to sent',
        error: issueError.message,
      });
      return NextResponse.json(
        { error: `Could not issue this invoice: ${issueError.message}` },
        { status: 500 }
      );
    }
    if (!issued || issued.length === 0) {
      return NextResponse.json(
        { error: 'This invoice was already sent by someone else.' },
        { status: 409 }
      );
    }
  }

  // Re-read for the figures the client sees: the number now exists, and
  // issue_date has just moved.
  const { data: issuedInvoice } = await supabase
    .from('invoices')
    .select('invoice_number, issue_date, due_date, amount_receivable')
    .eq('id', params.id)
    .single();
  if (!issuedInvoice) {
    console.error('INVOICE SEND — issued invoice vanished', { invoiceId: params.id });
    return NextResponse.json({ error: 'Invoice not found' }, { status: 500 });
  }

  // ── 3. PDF ────────────────────────────────────────────────────────────────
  // The stored PDF is the same artifact Print/Download produce, and storing it
  // files the invoice under the project's Files — so the invoice is saved to
  // the project whether or not the email gets through.
  //
  // PAST ALLOCATION NOW: a failure here leaves the invoice SENT and numbered,
  // by ruling. The invoice is issued; it just has no PDF yet, and re-sending
  // regenerates one.
  const stored = await storeInvoicePdf(supabase, admin, params.id);
  if (stored.error || !stored.buffer) {
    console.error('INVOICE SEND — PDF generation failed', {
      invoiceId: params.id,
      check: 'storeInvoicePdf',
      error: stored.error,
    });
    return NextResponse.json(
      {
        success: false,
        error:
          'The invoice was issued, but its PDF could not be generated so nothing was emailed. Try sending again.',
        issued: true,
        invoiceNumber: issuedInvoice.invoice_number,
      },
      { status: 500 }
    );
  }

  // ── 4. EMAIL ──────────────────────────────────────────────────────────────
  const invoiceNumber = issuedInvoice.invoice_number ?? params.id.slice(0, 8);
  const amountDue = money(Number(issuedInvoice.amount_receivable));
  const variables: Record<string, string> = {
    company_name: company.name,
    contact_name: recipientName ?? 'there',
    invoice_number: invoiceNumber,
    project_name: project?.name ?? '',
    issue_date: fmtDate(issuedInvoice.issue_date),
    amount_due: amountDue,
    // Same helper the PDF uses, so the mail and the attachment can never
    // describe the same invoice's terms differently.
    payment_terms: paymentTermsLabel(issuedInvoice.due_date, fmtDate),
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
      // +REPLY-TO [S97]: a client's reply reaches the COMPANY, not the
      // platform domain. Resolved in sendEmail so senders inherit it.
      replyToCompanyId: invoice.company_id,
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
    // BY RULING, THE INVOICE STAYS SENT. It is numbered, frozen and filed; only
    // DELIVERY failed, and email_logs now carries that as `failed` so the
    // delivery history on the invoice tells the truth. The caller must not read
    // this as a success, and must not re-issue — only re-send.
    console.error('INVOICE SEND — delivery failed', {
      invoiceId: params.id,
      invoiceNumber,
      check: 'resend delivery',
      error: sendError,
    });
    return NextResponse.json(
      {
        success: false,
        error: `Invoice ${invoiceNumber} was issued, but email delivery failed: ${sendError}`,
        issued: true,
        invoiceNumber,
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    success: true,
    issued: true,
    invoiceNumber,
    recipientEmail,
    sentAt: new Date().toISOString(),
  });
}
