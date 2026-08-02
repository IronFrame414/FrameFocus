import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  buildSenderAddress,
  logEmail,
  replaceTemplateVariables,
  sendEmail,
} from '@/lib/services/email-service';
import { InvoiceEmail } from '@/lib/email/templates/invoice-email';
import { paymentTermsLabel } from '@/lib/services/invoices-shared';
import { remainingOnInvoice } from '@/lib/services/payments-shared';
import {
  dueReminders,
  effectiveDueDate,
  resolveReminderSettings,
  type RemindableInvoice,
} from '@/lib/services/reminders-shared';
import {
  DEFAULT_INVOICE_REMINDER_BODY,
  DEFAULT_INVOICE_REMINDER_SUBJECT,
} from '@/lib/proposal/proposal-defaults';

// Module 7E1 §6 — daily payment reminders.
//
// FOLLOWS THE SHIPPED CRON, does not invent a second one: same CRON_SECRET
// bearer check, same getSupabaseAdmin, same sendEmail + logEmail pair, same
// reminder_count step machinery as app/api/cron/estimate-reminders. The one
// genuinely new thing is per-client scope (§6 / §S #5).
//
// OVERDUE IS FROM THE DUE DATE (terms ruled S97). Due-on-receipt invoices carry
// a NULL due date and therefore chase from the issue date — unchanged behaviour.
//
// A FAILED SEND IS NEVER SILENT. Every attempt is written to email_logs with
// status sent|failed and the reason, and the Resend webhook later advances the
// row to bounced/complained/failed by resend_message_id — so a bounce surfaces
// on the invoice's delivery history exactly as an invoice email does. The
// response carries per-invoice failures too, so a cron dashboard shows them.
//
// reminder_count is advanced ONLY on a successful send: a bounced or failed
// reminder must be retried tomorrow, not silently consumed.

export const maxDuration = 300;

const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

function fmtDate(value: string): string {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1)).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/** Company-timezone calendar date — the same rule 7D/7E use for every date. */
function companyToday(timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = getSupabaseAdmin() as SupabaseClient<Database>;

  const { data: companies, error: companyError } = await admin
    .from('companies')
    .select(
      'id, name, slug, logo_url, brand_color, timezone, default_reminder_schedule, default_reminder_email_subject, default_reminder_email_body'
    );
  if (companyError) {
    return NextResponse.json({ error: companyError.message }, { status: 500 });
  }

  let sent = 0;
  let failed = 0;
  const failures: Array<{ invoiceId: string; error: string }> = [];

  for (const company of companies ?? []) {
    const today = companyToday(company.timezone ?? 'America/New_York');

    // Live, issued invoices for this company. Settled ones are filtered by the
    // derived remaining below, never by status alone.
    const { data: invoices } = await admin
      .from('invoices')
      .select('id, project_id, status, is_deleted, issue_date, due_date, invoice_number, amount_receivable, reminder_count')
      .eq('company_id', company.id)
      .eq('is_deleted', false)
      .in('status', ['sent', 'paid']);
    if (!invoices || invoices.length === 0) continue;

    const { data: applications } = await admin
      .from('client_payment_applications')
      .select('invoice_id, amount, is_deleted')
      .in('invoice_id', invoices.map((i) => i.id))
      .eq('is_deleted', false);

    const paidByInvoice = new Map<string, { amount: number }[]>();
    for (const a of applications ?? []) {
      const list = paidByInvoice.get(a.invoice_id) ?? [];
      list.push({ amount: Number(a.amount) });
      paidByInvoice.set(a.invoice_id, list);
    }

    // Each invoice's client, via its project.
    const { data: projects } = await admin
      .from('projects')
      .select('id, name, contact_id')
      .in('id', [...new Set(invoices.map((i) => i.project_id))]);
    const projectById = new Map((projects ?? []).map((p) => [p.id, p]));

    const contactIds = [...new Set((projects ?? []).map((p) => p.contact_id).filter(Boolean))];
    if (contactIds.length === 0) continue;

    const { data: contacts } = await admin
      .from('contacts')
      .select('id, first_name, last_name, email')
      .in('id', contactIds as string[]);
    const contactById = new Map((contacts ?? []).map((c) => [c.id, c]));

    const { data: overrides } = await admin
      .from('client_reminder_settings')
      .select('contact_id, enabled, schedule, subject, body')
      .in('contact_id', contactIds as string[]);
    const overrideByContact = new Map((overrides ?? []).map((o) => [o.contact_id, o]));

    // Group the company's invoices by client, because the schedule is per client.
    const byContact = new Map<string, RemindableInvoice[]>();
    const rowById = new Map(invoices.map((i) => [i.id, i]));
    for (const invoice of invoices) {
      const project = projectById.get(invoice.project_id);
      if (!project?.contact_id) continue;
      const remaining = remainingOnInvoice(
        invoice.amount_receivable,
        paidByInvoice.get(invoice.id) ?? []
      );
      const list = byContact.get(project.contact_id) ?? [];
      list.push({
        id: invoice.id,
        status: invoice.status,
        is_deleted: invoice.is_deleted,
        issue_date: invoice.issue_date,
        due_date: invoice.due_date,
        reminder_count: invoice.reminder_count ?? 0,
        remaining,
      });
      byContact.set(project.contact_id, list);
    }

    for (const [contactId, clientInvoices] of byContact) {
      const contact = contactById.get(contactId);
      if (!contact?.email) continue;

      const settings = resolveReminderSettings(
        overrideByContact.get(contactId) ?? null,
        {
          schedule: company.default_reminder_schedule,
          subject: company.default_reminder_email_subject,
          body: company.default_reminder_email_body,
        },
        {
          subject: DEFAULT_INVOICE_REMINDER_SUBJECT,
          body: DEFAULT_INVOICE_REMINDER_BODY,
        }
      );

      for (const due of dueReminders(clientInvoices, settings, today)) {
        const row = rowById.get(due.invoiceId)!;
        const project = projectById.get(row.project_id);
        const remaining =
          clientInvoices.find((i) => i.id === due.invoiceId)?.remaining ?? 0;

        const variables: Record<string, string> = {
          company_name: company.name,
          contact_name: `${contact.first_name} ${contact.last_name}`.trim() || 'there',
          invoice_number: row.invoice_number ?? row.id.slice(0, 8),
          project_name: project?.name ?? '',
          issue_date: fmtDate(row.issue_date),
          due_date: fmtDate(effectiveDueDate(row)),
          payment_terms: paymentTermsLabel(row.due_date, fmtDate),
          amount_due: money(remaining),
          days_overdue: String(due.daysOverdue),
        };
        const subject = replaceTemplateVariables(settings.subject, variables);
        const bodyText = replaceTemplateVariables(settings.body, variables);
        const sender = buildSenderAddress(company);

        let messageId: string | null = null;
        let sendError: string | null = null;
        try {
          const result = await sendEmail({
            from: sender,
            // +REPLY-TO [S97]: a client's reply reaches the COMPANY, not the
            // platform domain. Resolved in sendEmail so senders inherit it.
            replyToCompanyId: company.id,
            to: contact.email,
            subject,
            react: InvoiceEmail({
              companyName: company.name,
              logoUrl: company.logo_url,
              brandColor: company.brand_color || '#1a56db',
              bodyText,
              invoiceNumber: variables.invoice_number,
              amountDue: variables.amount_due,
            }),
          });
          messageId = result.messageId;
          sendError = result.error;
        } catch (err) {
          sendError = err instanceof Error ? err.message : 'Email send failed';
        }

        await logEmail(admin, {
          company_id: company.id,
          estimate_id: null,
          signing_session_id: null,
          change_order_id: null,
          co_signing_session_id: null,
          invoice_id: row.id,
          resend_message_id: messageId,
          email_type: 'invoice_reminder',
          recipient_email: contact.email,
          sender_email: sender,
          subject,
          status: sendError ? 'failed' : 'sent',
          metadata: sendError
            ? { error: sendError, step: due.step, days_overdue: due.daysOverdue }
            : { step: due.step, days_overdue: due.daysOverdue },
        });

        if (sendError) {
          // Do NOT advance reminder_count: a failed reminder is retried
          // tomorrow rather than silently consumed.
          failed += 1;
          failures.push({ invoiceId: row.id, error: sendError });
          console.error('INVOICE REMINDER FAILED', { invoiceId: row.id, error: sendError });
          continue;
        }

        await admin
          .from('invoices')
          .update({
            reminder_count: due.step,
            last_reminder_sent_at: new Date().toISOString(),
          })
          .eq('id', row.id);
        sent += 1;
      }
    }
  }

  // Failures are reported, never folded into a success count.
  return NextResponse.json({ success: true, sent, failed, failures });
}
