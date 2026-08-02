// 7D1 §13 — delivery types + classification. PURE: no supabase import.
//
// The payments-shared.ts precedent. invoice-delivery.ts imports supabase-server
// (next/headers), so a client component importing a label from it drags
// next/headers into the client bundle and the BUILD fails — which is exactly
// what happened first time. Anything the panel needs lives here.

export type DeliveryStatus =
  | 'sent'
  | 'delivered'
  | 'opened'
  | 'bounced'
  | 'complained'
  | 'failed';

export interface InvoiceDelivery {
  id: string;
  recipientEmail: string;
  subject: string;
  status: DeliveryStatus;
  sentAt: string | null;
  deliveredAt: string | null;
  openedAt: string | null;
  bouncedAt: string | null;
  /** Present when the send itself failed — the reason, for the UI to show. */
  error: string | null;
}

/** A status the user must not read as success. */
export function isDeliveryFailure(status: DeliveryStatus): boolean {
  return status === 'bounced' || status === 'complained' || status === 'failed';
}

export const DELIVERY_LABEL: Record<DeliveryStatus, string> = {
  sent: 'Sent',
  delivered: 'Delivered',
  opened: 'Opened',
  bounced: 'BOUNCED — not delivered',
  complained: 'Marked as spam',
  failed: 'FAILED — not sent',
};
