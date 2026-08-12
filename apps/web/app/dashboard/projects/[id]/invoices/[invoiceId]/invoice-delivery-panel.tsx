'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  DELIVERY_LABEL,
  isDeliveryFailure,
  type InvoiceDelivery,
} from '@/lib/services/invoice-delivery-shared';
import { color, secondaryButtonStyle } from '@/lib/theme';

// 7D1 §13 — send the invoice to the client, and show what happened to it.
//
// OWNER/ADMIN ONLY (the route enforces it; this only decides what renders).
// NO PAY LINK — payment is QuickBooks-hosted and 7G is not built.
//
// [S97] THIS PANEL NOW RENDERS ON A DRAFT TOO. Sending is ONE action: the route
// issues the invoice (allocating its number) and emails it. Previously this
// only appeared once the invoice was already marked sent, which made delivery a
// second click in a second place and let an invoice sit issued and undelivered.
//
// A FAILED SEND MUST NEVER LOOK LIKE SUCCESS — and after issuing, it must not
// look like nothing happened either. The route returns 502/500 with
// `issued: true` when the invoice was numbered but delivery or the PDF failed;
// that case is reported in red AND refreshes the page, because the invoice
// really did change state. A bounce arrives later via the Resend webhook. Every
// failure renders in red with an explicit label; the success line is the only
// green one.

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
  status,
  hasLines,
  lienReleasePrompt,
}: {
  invoiceId: string;
  canSend: boolean;
  recipientEmail: string | null;
  deliveries: InvoiceDelivery[];
  /** Drives the label and the confirm — an unissued invoice is about to be
   *  numbered and frozen, an issued one is only being re-delivered. */
  status: string;
  hasLines: boolean;
  /**
   * 7F §5.1 — the CONDITIONAL release is prompted at invoice SEND, not at
   * invoice create.
   *
   * Why send: 7D allocates invoice_number AT SEND, and the immutability
   * trigger freezes amount_receivable / billed_total / retainage_withheld only
   * at send. A release generated against a draft would carry a figure that can
   * still move — exactly the failure §6.3's amount rule exists to prevent.
   *
   * ⚠️ ADVISORY, NEVER BLOCKING (§8.3). Architecture P2: "the system informs;
   * the human decides." This link never gates the send and never gates a
   * payment. Null when the caller is not Owner/Admin, or a live conditional
   * release already exists for this invoice.
   */
  lienReleasePrompt?: { projectId: string } | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; bad: boolean } | null>(null);

  const willIssue = status === 'draft' || status === 'pending_approval';

  async function send() {
    // Issuing is the irreversible half: it allocates the invoice number and
    // freezes the invoice (§8/§10). Re-delivering an already-issued invoice
    // changes nothing and needs no confirm.
    if (
      willIssue &&
      !window.confirm(
        'Send this invoice to the client? It will be numbered and emailed, and a sent invoice is immutable — corrections go through void and reissue.'
      )
    ) {
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/send`, { method: 'POST' });
      const payload = (await res.json().catch(() => null)) as
        | {
            success?: boolean;
            error?: string;
            recipientEmail?: string;
            issued?: boolean;
            invoiceNumber?: string | null;
          }
        | null;
      if (!res.ok || !payload?.success) {
        setMessage({ text: payload?.error ?? 'Could not send this invoice.', bad: true });
        // The invoice may have been ISSUED and only delivery failed — the row
        // really did change, so the screen must catch up even on the error path
        // or it will keep offering to "send" an invoice that is already sent.
        if (payload?.issued) router.refresh();
      } else {
        setMessage({
          text: payload.invoiceNumber
            ? `Invoice ${payload.invoiceNumber} sent to ${payload.recipientEmail}.`
            : `Sent to ${payload.recipientEmail}.`,
          bad: false,
        });
        router.refresh();
      }
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : 'Could not send.', bad: true });
    } finally {
      setBusy(false);
    }
  }

  const blockedReason = !recipientEmail
    ? 'no contact email on this project'
    : willIssue && !hasLines
      ? 'this invoice has no lines yet'
      : null;

  const lastFailure = deliveries.find((d) => isDeliveryFailure(d.status));

  return (
    <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid #e5e7eb' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.625rem', flexWrap: 'wrap' }}>
        <span
          style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}
        >
          Delivery
        </span>
        {recipientEmail && (
          <span style={{ fontSize: '0.75rem', color: color.faint }}>to {recipientEmail}</span>
        )}
        {blockedReason && (
          <span style={{ fontSize: '0.75rem', color: color.warningDeep }}>{blockedReason}</span>
        )}
      </div>

      {canSend && (
        <button
          type="button"
          disabled={busy || !!blockedReason}
          style={{ ...secondaryButtonStyle, marginTop: '0.5rem' }}
          onClick={() => void send()}
        >
          {busy
            ? 'Sending…'
            : willIssue
              ? 'Send to client'
              : deliveries.length > 0
                ? 'Email again'
                : 'Email to client'}
        </button>
      )}

      {/* 7F §5.1 — offered AFTER the invoice is issued, because only then is
          the receivable frozen and the invoice numbered. Advisory: it is a
          link, not a gate, and nothing here can stop the send. */}
      {lienReleasePrompt && !willIssue && (
        <p style={{ fontSize: '12px', color: color.muted, marginTop: '10px' }}>
          No conditional lien release has been issued for this invoice.{' '}
          <a
            href={`/dashboard/projects/${lienReleasePrompt.projectId}/lien-releases`}
            style={{ color: color.primary }}
          >
            Issue one
          </a>{' '}
          — optional, and it never holds up the money.
        </p>
      )}

      {canSend && willIssue && !blockedReason && (
        <p style={{ fontSize: '0.75rem', color: color.faint, margin: '0.375rem 0 0' }}>
          Sending numbers the invoice, files its PDF under the project and emails it — one action.
        </p>
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
          {willIssue
            ? // A DRAFT's PDF is a preview and is deliberately never stored — a
              // watermarked draft sitting in Files beside real invoices is the
              // confusion the watermark exists to prevent.
              'Not sent yet. Preview PDF and Download work now; the PDF is filed under the project once the invoice is issued.'
            : 'Not emailed yet. Print and Download are unaffected, and the PDF is filed under the project either way.'}
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
