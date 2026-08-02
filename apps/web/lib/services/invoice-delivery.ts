import { createClient } from '@/lib/supabase-server';
import type { InvoiceDelivery, DeliveryStatus } from '@/lib/services/invoice-delivery-shared';

// 7D1 §13 — an invoice's delivery history (server read).
//
// Reads the SHIPPED email_logs model rather than a parallel one. The Resend
// webhook (app/api/webhooks/resend/route.ts) advances each row's status through
// sent → delivered → opened → bounced / complained / failed and stamps the
// matching timestamp, so a bounce shows up here on its own.
//
// Types and labels live in invoice-delivery-shared.ts — client components must
// import them from THERE, never from here (next/headers would follow).

export type { InvoiceDelivery, DeliveryStatus } from '@/lib/services/invoice-delivery-shared';
export { isDeliveryFailure, DELIVERY_LABEL } from '@/lib/services/invoice-delivery-shared';

export async function getInvoiceDeliveries(invoiceId: string): Promise<InvoiceDelivery[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('email_logs')
    .select('id, recipient_email, subject, status, sent_at, delivered_at, opened_at, bounced_at, metadata')
    .eq('invoice_id', invoiceId)
    .order('created_at', { ascending: false });

  return (data ?? []).map((row) => ({
    id: row.id,
    recipientEmail: row.recipient_email,
    subject: row.subject,
    status: row.status as DeliveryStatus,
    sentAt: row.sent_at,
    deliveredAt: row.delivered_at,
    openedAt: row.opened_at,
    bouncedAt: row.bounced_at,
    error:
      row.metadata && typeof row.metadata === 'object' && 'error' in row.metadata
        ? String((row.metadata as Record<string, unknown>).error)
        : null,
  }));
}
