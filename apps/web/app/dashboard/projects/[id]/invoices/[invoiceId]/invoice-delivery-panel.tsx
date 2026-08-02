'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  DELIVERY_LABEL,
  isDeliveryFailure,
  type InvoiceDelivery,
} from '@/lib/services/invoice-delivery-shared';
import { color, secondaryButtonStyle } from '@/lib/theme';

// 7D1 §13 — email the invoice to the client, and show what happened to it.
//
// OWNER/ADMIN ONLY (the route enforces it; this only decides what renders).
// NO PAY LINK — payment is QuickBooks-hosted and 7G is not built.
//
// A FAILED SEND MUST NEVER LOOK LIKE SUCCESS. The route returns 502 on a
// delivery failure and logs the attempt as `failed`, and a bounce arrives later
// via the Resend webhook. Both render in red here with an explicit label; the
// success line is the only green one.

function fmt(value: string | null): string {
  if (!value) return '';
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function InvoiceDeliveryPanel({
  invoiceId,
  canSend,
  recipientEmail,
  deliveries,
}: {
  invoiceId: string;
  canSend: boolean;
  recipientEmail: string | null;
  deliveries: InvoiceDelivery[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; bad: boolean } | null>(null);

  async function send() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/send`, { method: 'POST' });
      const payload = (await res.json().catch(() => null)) as
        | { success?: boolean; error?: string; recipientEmail?: string }
        | null;
      if (!res.ok || !payload?.success) {
        setMessage({ text: payload?.error ?? 'Could not send this invoice.', bad: true });
      } else {
        setMessage({ text: `Sent to ${payload.recipientEmail}.`, bad: false });
        router.refresh();
      }
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : 'Could not send.', bad: true });
    } finally {
      setBusy(false);
    }
  }

  const lastFailure = deliveries.find((d) => isDeliveryFailure(d.status));

  return (
    <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid #e5e7eb' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.625rem', flexWrap: 'wrap' }}>
        <span
          style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}
        >
          Delivery
        </span>
        {recipientEmail ? (
          <span style={{ fontSize: '0.75rem', color: color.faint }}>to {recipientEmail}</span>
        ) : (
          <span style={{ fontSize: '0.75rem', color: color.warningDeep }}>
            no contact email on this project
          </span>
        )}
      </div>

      {canSend && (
        <button
          type="button"
          disabled={busy || !recipientEmail}
          style={{ ...secondaryButtonStyle, marginTop: '0.5rem' }}
          onClick={() => void send()}
        >
          {busy ? 'Sending…' : deliveries.length > 0 ? 'Email again' : 'Email to client'}
        </button>
      )}

      {message && (
        <p
          style={{
            fontSize: '0.8125rem',
            margin: '0.5rem 0 0',
            fontWeight: message.bad ? 600 : 400,
            color: message.bad ? '#b91c1c' : '#065f46',
          }}
        >
          {message.text}
        </p>
      )}

      {lastFailure && (
        <p style={{ fontSize: '0.8125rem', color: '#b91c1c', fontWeight: 600, margin: '0.5rem 0 0' }}>
          The most recent send did not reach {lastFailure.recipientEmail}
          {lastFailure.error ? ` — ${lastFailure.error}` : ''}. The invoice is still filed under the
          project; send it again or reach the client another way.
        </p>
      )}

      {deliveries.length === 0 ? (
        <p style={{ fontSize: '0.75rem', color: color.faint, margin: '0.5rem 0 0' }}>
          Not emailed yet. Print and Download are unaffected, and the PDF is filed under the
          project either way.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: '0.5rem 0 0' }}>
          {deliveries.map((d) => {
            const bad = isDeliveryFailure(d.status);
            return (
              <li
                key={d.id}
                style={{
                  fontSize: '0.75rem',
                  padding: '0.25rem 0',
                  color: bad ? '#b91c1c' : '#374151',
                  fontWeight: bad ? 600 : 400,
                }}
              >
                {DELIVERY_LABEL[d.status]} · {d.recipientEmail}
                {d.openedAt
                  ? ` · opened ${fmt(d.openedAt)}`
                  : d.deliveredAt
                    ? ` · delivered ${fmt(d.deliveredAt)}`
                    : d.bouncedAt
                      ? ` · bounced ${fmt(d.bouncedAt)}`
                      : d.sentAt
                        ? ` · ${fmt(d.sentAt)}`
                        : ''}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
