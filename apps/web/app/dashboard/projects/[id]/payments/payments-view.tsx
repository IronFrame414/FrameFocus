'use client';

// Module 7E1 — the money-received screen (§2, §3, §4.1, §5, §6, §6a).
//
// RECORDING IS OWNER/ADMIN ONLY (§8). A PM sees everything on this screen and
// can act on none of it — deliberately a different permission shape from
// money-out, where a PM may enter bills. The RPCs enforce the same gate, so
// hiding the controls is convenience, not the security boundary.
//
// RETAINAGE HELD IS RENDERED OUTSIDE THE BUCKETS, always. That is §6's
// load-bearing rule: on the real $1,000,000 job $100,000 sat withheld for nine
// months, and aging it would have shown six figures "overdue" on money the
// client was contractually entitled to hold.

import type { ResolvedReminderSettings } from '@/lib/services/reminders-shared';
import { ReminderSettings } from './reminder-settings';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  applyCredit,
  createRefund,
  recordPayment,
  recordSignOffAndGenerateRelease,
  unapplyPayment,
  voidPayment,
  type RefundSource,
} from '@/lib/services/payments-client';
import {
  AGING_BUCKET_LABEL,
  type AgingBucket,
  type AgingSummary,
  type JobPairing,
} from '@/lib/services/payments-shared';
import {
  cardStyle,
  color,
  font,
  h2Style,
  microLabelStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
} from '@/lib/theme';

interface PaymentRow {
  id: string;
  paymentDate: string;
  amount: number;
  method: string | null;
  note: string | null;
  creditAvailable: number;
  applications: { id: string; invoiceId: string; amount: number }[];
}

interface OpenInvoice {
  id: string;
  invoiceNumber: string | null;
  issueDate: string;
  remaining: number;
}

interface RefundRow {
  id: string;
  refundDate: string;
  amount: number;
  source: string;
  status: string;
  reason: string | null;
}

interface Props {
  projectId: string;
  contactId: string;
  role: string;
  reminderSettings: ResolvedReminderSettings;
  memberId: string | null;
  today: string;
  aging: AgingSummary;
  retainageHeld: number;
  payments: PaymentRow[];
  openInvoices: OpenInvoice[];
  refunds: RefundRow[];
  release: { id: string; signedOffOn: string; amount: number; releaseInvoiceId: string | null } | null;
  pairing: JobPairing;
  projectStatus: string;
}

function money(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return Number(value).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

const inputStyle: React.CSSProperties = {
  padding: '5px 8px',
  border: `1px solid ${color.cardBorder}`,
  borderRadius: '4px',
  fontSize: '13px',
};

const thStyle: React.CSSProperties = {
  ...microLabelStyle,
  textAlign: 'left',
  padding: '10px 14px',
  backgroundColor: color.tableHeadBg,
  borderBottom: `1px solid ${color.cardBorder}`,
};

const tdStyle: React.CSSProperties = {
  padding: '10px 14px',
  fontSize: '13px',
  borderBottom: `1px solid ${color.rowDivider}`,
};

const BUCKET_ORDER: AgingBucket[] = ['current', 'd31_60', 'd61_90', 'd90_plus'];

export function PaymentsView(props: Props) {
  const {
    projectId,
    contactId,
    role,
    reminderSettings,
    memberId,
    today,
    aging,
    retainageHeld,
    payments,
    openInvoices,
    refunds,
    release,
    pairing,
    projectStatus,
  } = props;

  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // §8 — money in is Owner/Admin only.
  const canRecord = role === 'owner' || role === 'admin';
  const invoiceBase = `/dashboard/projects/${projectId}/invoices`;

  const creditBalance = useMemo(
    () => Math.round(payments.reduce((sum, p) => sum + p.creditAvailable, 0) * 100) / 100,
    [payments]
  );

  async function run(fn: () => Promise<{ success: boolean; error?: string }>, msg?: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await fn();
    setBusy(false);
    if (!result.success) {
      setError(result.error ?? 'Something went wrong');
      return false;
    }
    if (msg) setNotice(msg);
    router.refresh();
    return true;
  }

  return (
    <div style={{ padding: '20px 0', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '10px' }}>
        <h2 style={h2Style}>Payments</h2>
        {!canRecord && (
          <span style={{ fontSize: '12px', color: color.faint }}>
            Read-only — recording a payment is Owner/Admin (§8).
          </span>
        )}
      </div>

      {error && <div style={{ ...cardStyle, padding: '10px 14px', color: color.danger, fontSize: '13px' }}>{error}</div>}
      {notice && <div style={{ ...cardStyle, padding: '10px 14px', color: color.primary, fontSize: '13px' }}>{notice}</div>}

      {/* §6a — the pairing. Surfaced here because this is where a payment
          lands; 7H reports the same shared definition. */}
      <div style={{ ...cardStyle, padding: '14px 16px', display: 'flex', gap: '28px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Figure label="Collected to date" value={pairing.collected} />
        <Figure label="Spent to date" value={pairing.spent} muted />
        <Figure
          label={pairing.difference >= 0 ? 'Ahead by' : 'Behind by'}
          value={Math.abs(pairing.difference)}
          bold
          warn={pairing.difference < 0}
        />
        {!pairing.spentComplete && (
          <span style={{ fontSize: '11px', color: color.warningDeep, maxWidth: '260px' }}>
            Labor cost is hidden from your role, so &ldquo;spent&rdquo; covers expenses only.
          </span>
        )}
      </div>

      {/* §6 — aging. Retainage sits OUTSIDE the buckets, deliberately. */}
      <div style={{ ...cardStyle, padding: '14px 16px' }}>
        <span style={microLabelStyle}>Accounts receivable aging</span>
        <div style={{ display: 'flex', gap: '28px', flexWrap: 'wrap', marginTop: '10px' }}>
          {BUCKET_ORDER.map((bucket) => (
            <Figure
              key={bucket}
              label={AGING_BUCKET_LABEL[bucket]}
              value={aging.buckets[bucket]}
              warn={bucket === 'd61_90' || bucket === 'd90_plus'}
            />
          ))}
          <Figure label="Total outstanding" value={aging.totalOutstanding} bold />
        </div>

        <div
          style={{
            marginTop: '12px',
            paddingTop: '10px',
            borderTop: `1px dashed ${color.cardBorder}`,
            display: 'flex',
            gap: '10px',
            alignItems: 'baseline',
            flexWrap: 'wrap',
          }}
        >
          <Figure label="Retainage held" value={retainageHeld} warn />
          <span style={{ fontSize: '11px', color: color.faint, maxWidth: '460px' }}>
            Shown separately and deliberately <strong>outside</strong> every bucket — retainage is not
            overdue, because it is not yet owed. It is released on completion as its own invoice (§5, §6).
          </span>
        </div>

        {aging.invoices.length > 0 && (
          <div style={{ marginTop: '12px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>Invoice</th>
                  <th style={thStyle}>Issued</th>
                  <th style={thStyle}>Age</th>
                  <th style={thStyle}>Bucket</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Remaining</th>
                </tr>
              </thead>
              <tbody>
                {aging.invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td style={tdStyle}>
                      <Link href={`${invoiceBase}/${inv.id}`} style={{ color: color.primary, fontWeight: 600, textDecoration: 'none' }}>
                        {inv.invoiceNumber ?? 'Draft'}
                      </Link>
                      {/* acceptance #14 — the clock restarts on a reissue, so
                          the link to the withdrawn original stays visible. */}
                      {inv.supersedesInvoiceId && (
                        <Link
                          href={`${invoiceBase}/${inv.supersedesInvoiceId}`}
                          style={{ fontSize: '11px', color: color.warningDeep, marginLeft: '6px', textDecoration: 'none' }}
                        >
                          · replaces a voided invoice
                        </Link>
                      )}
                    </td>
                    <td style={{ ...tdStyle, color: color.mutedAlt }}>{inv.issueDate}</td>
                    <td style={{ ...tdStyle, color: color.mutedAlt }}>{inv.ageDays} d</td>
                    <td style={tdStyle}>{AGING_BUCKET_LABEL[inv.bucket]}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontFamily: font.mono, fontWeight: 700 }}>
                      {money(inv.remaining)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p style={{ fontSize: '11px', color: color.faint, margin: '8px 0 0' }}>
          PROVISIONAL: aging runs from the invoice&rsquo;s <strong>issue date</strong>. Payment terms are
          not yet ruled, so no due date exists to age from (7D open item #3).
        </p>
      </div>

      {/* §6 — per-client reminder configuration. Owner/Admin only; RLS on
          client_reminder_settings is the real boundary. */}
      <ReminderSettings
        contactId={contactId}
        canEdit={canRecord}
        inherited={reminderSettings.inherited}
        enabled={reminderSettings.enabled}
        schedule={reminderSettings.schedule}
      />

      {canRecord && openInvoices.length > 0 && (
        <RecordPaymentPanel
          contactId={contactId}
          openInvoices={openInvoices}
          today={today}
          busy={busy}
          run={run}
        />
      )}

      {/* §3 — the credit on account: unapplied surplus, never auto-applied. */}
      {creditBalance > 0 && (
        <div style={{ ...cardStyle, padding: '14px 16px' }}>
          <span style={microLabelStyle}>Credit on account</span>
          <div style={{ fontFamily: font.mono, fontSize: '18px', fontWeight: 700, color: color.navy, marginTop: '2px' }}>
            {money(creditBalance)}
          </div>
          <p style={{ fontSize: '11px', color: color.faint, margin: '4px 0 8px' }}>
            An overpayment surplus. It is <strong>never</strong> applied automatically — choose the invoice
            it should reduce (§3).
          </p>
          {canRecord &&
            payments
              .filter((p) => p.creditAvailable > 0)
              .map((p) => (
                <ApplyCreditRow
                  key={p.id}
                  payment={p}
                  openInvoices={openInvoices}
                  busy={busy}
                  run={run}
                />
              ))}
        </div>
      )}

      {/* §2 — the payment records themselves. */}
      <div style={{ ...cardStyle, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${color.cardBorder}` }}>
          <span style={microLabelStyle}>Payments received</span>
        </div>
        {payments.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: color.faint, fontSize: '13px' }}>
            No payments recorded on this job yet.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>Method</th>
                <th style={thStyle}>Applied to</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Amount</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Unapplied</th>
                {canRecord && <th style={thStyle} />}
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td style={tdStyle}>{p.paymentDate}</td>
                  <td style={{ ...tdStyle, color: color.mutedAlt }}>{p.method || '—'}</td>
                  <td style={{ ...tdStyle, fontSize: '12px' }}>
                    {p.applications.length === 0 ? (
                      <span style={{ color: color.faint }}>held as credit</span>
                    ) : (
                      p.applications.map((a) => (
                        <span key={a.id} style={{ display: 'block' }}>
                          <Link href={`${invoiceBase}/${a.invoiceId}`} style={{ color: color.primary, textDecoration: 'none' }}>
                            {money(a.amount)}
                          </Link>
                          {canRecord && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => run(() => unapplyPayment(a.id), 'Unapplied — the money is back on account.')}
                              style={{ marginLeft: '6px', fontSize: '10px', border: 'none', background: 'none', color: color.faint, cursor: 'pointer' }}
                            >
                              unapply
                            </button>
                          )}
                        </span>
                      ))
                    )}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontFamily: font.mono, fontWeight: 700 }}>{money(p.amount)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontFamily: font.mono, color: p.creditAvailable > 0 ? color.warningDeep : color.faint }}>
                    {p.creditAvailable > 0 ? money(p.creditAvailable) : '—'}
                  </td>
                  {canRecord && (
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      <RemovePaymentButton paymentId={p.id} busy={busy} run={run} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p style={{ fontSize: '11px', color: color.faint, padding: '8px 16px', margin: 0 }}>
          A recorded payment is immutable — correcting one removes it and re-enters it, so the audit trail
          survives (§2, the same posture as money-out).
        </p>
      </div>

      {/* §4.1 — retainage release. */}
      {retainageHeld > 0 && canRecord && !release && (
        <RetainageReleasePanel
          projectId={projectId}
          amount={retainageHeld}
          memberId={memberId}
          today={today}
          projectStatus={projectStatus}
          busy={busy}
          run={run}
        />
      )}
      {release && (
        <div style={{ ...cardStyle, padding: '14px 16px' }}>
          <span style={microLabelStyle}>Retainage release</span>
          <div style={{ fontSize: '13px', color: color.body, marginTop: '4px' }}>
            Client signed off {release.signedOffOn} · {money(release.amount)} released as its own invoice
            {release.releaseInvoiceId && (
              <>
                {' — '}
                <Link href={`${invoiceBase}/${release.releaseInvoiceId}`} style={{ color: color.primary, textDecoration: 'none', fontWeight: 600 }}>
                  open the release invoice
                </Link>
              </>
            )}
          </div>
        </div>
      )}

      {/* §5 — refunds: money RETURNED, not a credit on account. */}
      {canRecord && (
        <RefundPanel
          contactId={contactId}
          projectId={projectId}
          role={role}
          memberId={memberId}
          today={today}
          refunds={refunds}
          creditBalance={creditBalance}
          busy={busy}
          run={run}
        />
      )}
    </div>
  );
}

function Figure({
  label,
  value,
  bold,
  muted,
  warn,
}: {
  label: string;
  value: number;
  bold?: boolean;
  muted?: boolean;
  warn?: boolean;
}) {
  return (
    <div>
      <span style={microLabelStyle}>{label}</span>
      <div
        style={{
          fontFamily: font.mono,
          fontSize: bold ? '18px' : '15px',
          fontWeight: bold ? 700 : 600,
          color: muted ? color.faint : warn ? color.warningDeep : color.navy,
          marginTop: '2px',
        }}
      >
        {money(value)}
      </div>
    </div>
  );
}

// ── §2 — record a payment, split across one or MANY invoices ────────────────

function RecordPaymentPanel({
  contactId,
  openInvoices,
  today,
  busy,
  run,
}: {
  contactId: string;
  openInvoices: OpenInvoice[];
  today: string;
  busy: boolean;
  run: (fn: () => Promise<{ success: boolean; error?: string }>, msg?: string) => Promise<boolean>;
}) {
  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(today);
  const [method, setMethod] = useState('check');
  const [note, setNote] = useState('');
  const [allocations, setAllocations] = useState<Record<string, string>>({});

  const allocated = useMemo(
    () =>
      Math.round(
        Object.values(allocations).reduce((sum, v) => sum + (Number(v) || 0), 0) * 100
      ) / 100,
    [allocations]
  );
  const entered = Number(amount) || 0;
  const surplus = Math.round((entered - allocated) * 100) / 100;

  /** Fill each open invoice oldest-first until the payment runs out — the
   *  ordinary case, and it keeps a multi-invoice check to two clicks. */
  function autoAllocate() {
    let left = entered;
    const next: Record<string, string> = {};
    for (const inv of openInvoices) {
      if (left <= 0) break;
      const take = Math.min(left, inv.remaining);
      next[inv.id] = take.toFixed(2);
      left = Math.round((left - take) * 100) / 100;
    }
    setAllocations(next);
  }

  return (
    <div style={{ ...cardStyle, padding: '14px 16px' }}>
      <span style={microLabelStyle}>Record a payment</span>
      <p style={{ fontSize: '11px', color: color.faint, margin: '4px 0 10px' }}>
        One check can cover several invoices — that is regular practice, not an edge case (§2). Anything
        you do not allocate stays on account as a credit (§3).
      </p>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '10px' }}>
        <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount $" inputMode="decimal" style={{ ...inputStyle, width: '120px' }} />
        <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} style={inputStyle} />
        <select value={method} onChange={(e) => setMethod(e.target.value)} style={inputStyle}>
          <option value="check">Check</option>
          <option value="cash">Cash</option>
          <option value="ach">ACH / transfer</option>
          <option value="card">Card</option>
          <option value="other">Other</option>
        </select>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (check #, etc.)" style={inputStyle} />
        <button type="button" disabled={busy || !(entered > 0)} onClick={autoAllocate} style={secondaryButtonStyle}>
          Auto-allocate oldest first
        </button>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={thStyle}>Open invoice</th>
            <th style={thStyle}>Issued</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Remaining</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Apply</th>
          </tr>
        </thead>
        <tbody>
          {openInvoices.map((inv) => (
            <tr key={inv.id}>
              <td style={tdStyle}>{inv.invoiceNumber ?? 'Draft'}</td>
              <td style={{ ...tdStyle, color: color.mutedAlt }}>{inv.issueDate}</td>
              <td style={{ ...tdStyle, textAlign: 'right', fontFamily: font.mono }}>{money(inv.remaining)}</td>
              <td style={{ ...tdStyle, textAlign: 'right' }}>
                <input
                  value={allocations[inv.id] ?? ''}
                  onChange={(e) => setAllocations({ ...allocations, [inv.id]: e.target.value })}
                  placeholder="0.00"
                  inputMode="decimal"
                  style={{ ...inputStyle, width: '100px', textAlign: 'right' }}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ display: 'flex', gap: '14px', alignItems: 'center', flexWrap: 'wrap', marginTop: '10px' }}>
        <span style={{ fontSize: '12px', color: color.body }}>
          Allocated <strong style={{ fontFamily: font.mono }}>{money(allocated)}</strong>
          {entered > 0 && (
            <>
              {' · '}
              {surplus > 0 ? (
                <span style={{ color: color.warningDeep }}>
                  {money(surplus)} will sit as a credit on account
                </span>
              ) : surplus < 0 ? (
                <span style={{ color: color.danger }}>over-allocated by {money(-surplus)}</span>
              ) : (
                <span style={{ color: color.faint }}>fully applied</span>
              )}
            </>
          )}
        </span>
        <button
          type="button"
          disabled={busy || !(entered > 0) || surplus < 0}
          style={primaryButtonStyle}
          onClick={async () => {
            const applications = Object.entries(allocations)
              .map(([invoiceId, v]) => ({ invoiceId, amount: Number(v) || 0 }))
              .filter((a) => a.amount > 0);
            const ok = await run(
              () =>
                recordPayment({
                  contactId,
                  amount: entered,
                  applications,
                  paymentDate,
                  method,
                  note: note.trim() || null,
                }),
              'Payment recorded.'
            );
            if (ok) {
              setAmount('');
              setNote('');
              setAllocations({});
            }
          }}
        >
          Record payment
        </button>
      </div>
    </div>
  );
}

function ApplyCreditRow({
  payment,
  openInvoices,
  busy,
  run,
}: {
  payment: PaymentRow;
  openInvoices: OpenInvoice[];
  busy: boolean;
  run: (fn: () => Promise<{ success: boolean; error?: string }>, msg?: string) => Promise<boolean>;
}) {
  const [invoiceId, setInvoiceId] = useState(openInvoices[0]?.id ?? '');
  const [amount, setAmount] = useState(String(payment.creditAvailable));

  if (openInvoices.length === 0) {
    return (
      <p style={{ fontSize: '12px', color: color.faint, margin: '4px 0' }}>
        {money(payment.creditAvailable)} from {payment.paymentDate} — no open invoice to apply it to. If
        nothing is left to bill, refund it below (§5).
      </p>
    );
  }

  return (
    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginTop: '6px' }}>
      <span style={{ fontSize: '12px', color: color.body }}>
        {money(payment.creditAvailable)} from {payment.paymentDate}
      </span>
      <select value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)} style={inputStyle}>
        {openInvoices.map((inv) => (
          <option key={inv.id} value={inv.id}>
            {inv.invoiceNumber ?? 'Draft'} — {money(inv.remaining)} left
          </option>
        ))}
      </select>
      <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" style={{ ...inputStyle, width: '100px' }} />
      <button
        type="button"
        disabled={busy || !invoiceId}
        style={secondaryButtonStyle}
        onClick={() => run(() => applyCredit(payment.id, invoiceId, Number(amount) || 0), 'Credit applied.')}
      >
        Apply credit
      </button>
    </div>
  );
}

function RemovePaymentButton({
  paymentId,
  busy,
  run,
}: {
  paymentId: string;
  busy: boolean;
  run: (fn: () => Promise<{ success: boolean; error?: string }>, msg?: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');

  if (!open) {
    return (
      <button type="button" disabled={busy} onClick={() => setOpen(true)} style={{ ...secondaryButtonStyle, color: color.danger }}>
        Remove
      </button>
    );
  }

  return (
    <span style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required)" autoFocus style={inputStyle} />
      <button
        type="button"
        disabled={busy || !reason.trim()}
        style={{ ...primaryButtonStyle, backgroundColor: color.danger }}
        onClick={async () => {
          const ok = await run(() => voidPayment(paymentId, reason), 'Payment removed. Re-enter it to correct it.');
          if (ok) setOpen(false);
        }}
      >
        Confirm
      </button>
      <button type="button" style={secondaryButtonStyle} onClick={() => setOpen(false)}>
        Cancel
      </button>
    </span>
  );
}

// ── §4.1 — retainage release ────────────────────────────────────────────────

function RetainageReleasePanel({
  projectId,
  amount,
  memberId,
  today,
  projectStatus,
  busy,
  run,
}: {
  projectId: string;
  amount: number;
  memberId: string | null;
  today: string;
  projectStatus: string;
  busy: boolean;
  run: (fn: () => Promise<{ success: boolean; error?: string }>, msg?: string) => Promise<boolean>;
}) {
  const [signedOffOn, setSignedOffOn] = useState(today);
  const [warned, setWarned] = useState(false);

  return (
    <div style={{ ...cardStyle, padding: '14px 16px' }}>
      <span style={microLabelStyle}>Release retainage</span>
      <p style={{ fontSize: '12px', color: color.body, margin: '4px 0 8px' }}>
        {money(amount)} is held on this job. The trigger is the client&rsquo;s <strong>final
        walkthrough</strong> sign-off (§4.1) — record the date it happened and FrameFocus generates the
        release as its <strong>own draft invoice</strong>, which still waits for Owner/Admin approval
        before sending.
      </p>
      {projectStatus !== 'complete' && (
        <p style={{ fontSize: '11px', color: color.warningDeep, margin: '0 0 8px' }}>
          This project is not marked complete. Releasing anyway is allowed — this warns, it does not block.
        </p>
      )}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ fontSize: '12px', color: color.body, display: 'inline-flex', gap: '4px', alignItems: 'center' }}>
          Signed off
          <input type="date" value={signedOffOn} onChange={(e) => setSignedOffOn(e.target.value)} style={inputStyle} />
        </label>
        <label style={{ fontSize: '12px', color: color.body, display: 'inline-flex', gap: '4px', alignItems: 'center' }}>
          <input type="checkbox" checked={warned} onChange={(e) => setWarned(e.target.checked)} />
          Lien release sent
        </label>
        <button
          type="button"
          disabled={busy || !memberId}
          style={primaryButtonStyle}
          onClick={() =>
            run(
              () =>
                recordSignOffAndGenerateRelease({
                  projectId,
                  signedOffOn,
                  memberId: memberId as string,
                  amount,
                  lienReleaseWarned: warned,
                }),
              'Release invoice drafted — approve and send it from Invoices.'
            )
          }
        >
          Record sign-off &amp; draft release
        </button>
      </div>
      <p style={{ fontSize: '11px', color: color.faint, margin: '6px 0 0' }}>
        The lien-release prompt is advisory — it warns and proceeds, and never blocks the money (7F F1).
        Sub-held retainage does not move here; it releases on its own rule in 7C (§4.2).
      </p>
    </div>
  );
}

// ── §5 — refunds ────────────────────────────────────────────────────────────

function RefundPanel({
  contactId,
  projectId,
  role,
  memberId,
  today,
  refunds,
  creditBalance,
  busy,
  run,
}: {
  contactId: string;
  projectId: string;
  role: string;
  memberId: string | null;
  today: string;
  refunds: RefundRow[];
  creditBalance: number;
  busy: boolean;
  run: (fn: () => Promise<{ success: boolean; error?: string }>, msg?: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [source, setSource] = useState<RefundSource>('overpayment');
  const [reason, setReason] = useState('');

  return (
    <div style={{ ...cardStyle, padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap' }}>
        <span style={microLabelStyle}>Refunds</span>
        {!open && (
          <button type="button" style={secondaryButtonStyle} onClick={() => setOpen(true)}>
            Issue a refund
          </button>
        )}
      </div>
      <p style={{ fontSize: '11px', color: color.faint, margin: '4px 0 0' }}>
        A refund is money <strong>returned</strong> — a different thing from a credit on account, and a
        different document in QuickBooks (§5). Use it when nothing is left to bill.
        {role === 'admin' && ' An Admin-issued refund waits for Owner approval.'}
      </p>

      {open && (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginTop: '10px' }}>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount $" inputMode="decimal" style={{ ...inputStyle, width: '110px' }} />
          <select value={source} onChange={(e) => setSource(e.target.value as RefundSource)} style={inputStyle}>
            <option value="overpayment">Overpayment</option>
            <option value="negative_co">Negative change order</option>
            <option value="deposit">Deposit refund</option>
            <option value="other">Other</option>
          </select>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" style={inputStyle} />
          <button
            type="button"
            disabled={busy || !(Number(amount) > 0)}
            style={primaryButtonStyle}
            onClick={async () => {
              const ok = await run(
                () =>
                  createRefund({
                    contactId,
                    projectId,
                    amount: Number(amount),
                    refundDate: today,
                    source,
                    reason: reason.trim() || null,
                    role,
                    memberId,
                  }),
                role === 'admin' ? 'Refund recorded — it needs Owner approval.' : 'Refund recorded.'
              );
              if (ok) {
                setOpen(false);
                setAmount('');
                setReason('');
              }
            }}
          >
            Record refund
          </button>
          <button type="button" style={secondaryButtonStyle} onClick={() => setOpen(false)}>
            Cancel
          </button>
          {creditBalance > 0 && (
            <span style={{ fontSize: '11px', color: color.faint }}>
              {money(creditBalance)} sits as credit — refund it only if there is nothing left to bill.
            </span>
          )}
        </div>
      )}

      {refunds.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '10px' }}>
          <thead>
            <tr>
              <th style={thStyle}>Date</th>
              <th style={thStyle}>Source</th>
              <th style={thStyle}>Status</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {refunds.map((r) => (
              <tr key={r.id}>
                <td style={tdStyle}>{r.refundDate}</td>
                <td style={{ ...tdStyle, color: color.mutedAlt }}>{r.source.replace(/_/g, ' ')}</td>
                <td style={tdStyle}>{r.status.replace(/_/g, ' ')}</td>
                <td style={{ ...tdStyle, textAlign: 'right', fontFamily: font.mono, fontWeight: 700 }}>{money(r.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
