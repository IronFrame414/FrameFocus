'use client';

// 7D §2/§3 — create a draft invoice. Every invoice is user-triggered (§1 v1
// boundary: no draw schedule fires on its own). A deposit is an ordinary
// fixed-amount invoice that takes NO retainage (§3, §5).

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createInvoice, getSuggestedDepositAmount } from '@/lib/services/invoices-client';
import { color, font, primaryButtonStyle, secondaryButtonStyle } from '@/lib/theme';

const fmtUsd = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

interface NewInvoiceButtonProps {
  projectId: string;
  /** §5 — retainage defaults from the project setting, editable per invoice. */
  projectRetainagePercent: number | null;
}

export function NewInvoiceButton({ projectId, projectRetainagePercent }: NewInvoiceButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [isDeposit, setIsDeposit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Estimates redesign — the suggested deposit (deposit_percent x contract value)
  // from the source estimate. Owner/Admin only (contract value is floored);
  // returns null otherwise. A suggestion, never an imposed amount.
  const [suggested, setSuggested] = useState<number | null>(null);

  async function onToggleDeposit(checked: boolean) {
    setIsDeposit(checked);
    if (checked && suggested == null) {
      setSuggested(await getSuggestedDepositAmount(projectId));
    }
  }

  async function create() {
    setBusy(true);
    setError(null);
    const result = await createInvoice({
      projectId,
      title: title.trim() || null,
      invoiceType: isDeposit ? 'deposit' : 'standard',
      // §5 — a deposit never withholds retainage (the DB CHECK enforces it too).
      retainagePercent: isDeposit ? null : projectRetainagePercent,
    });
    setBusy(false);
    if (!result.success || !result.id) {
      setError(result.error ?? 'Could not create the invoice');
      return;
    }
    router.push(`/dashboard/projects/${projectId}/invoices/${result.id}`);
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} style={primaryButtonStyle}>
        New Invoice
      </button>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        gap: '8px',
        alignItems: 'center',
        flexWrap: 'wrap',
        padding: '8px 10px',
        border: `1px solid ${color.cardBorder}`,
        borderRadius: '6px',
      }}
    >
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title (e.g. Draw 2)"
        autoFocus
        style={{
          padding: '5px 8px',
          border: `1px solid ${color.cardBorder}`,
          borderRadius: '4px',
          fontSize: '13px',
        }}
      />
      <label style={{ fontSize: '12px', color: color.body, display: 'inline-flex', gap: '4px' }}>
        <input type="checkbox" checked={isDeposit} onChange={(e) => onToggleDeposit(e.target.checked)} />
        Deposit
      </label>
      {isDeposit && suggested != null && (
        <span style={{ fontSize: '12px', color: color.muted }}>
          Suggested:{' '}
          <strong style={{ fontFamily: font.mono, color: color.navy }}>{fmtUsd(suggested)}</strong>{' '}
          <span style={{ color: color.faint }}>(deposit % × contract)</span>
        </span>
      )}
      <button type="button" onClick={create} disabled={busy} style={primaryButtonStyle}>
        {busy ? 'Creating…' : 'Create draft'}
      </button>
      <button type="button" onClick={() => setOpen(false)} disabled={busy} style={secondaryButtonStyle}>
        Cancel
      </button>
      {error && <span style={{ fontSize: '12px', color: color.danger }}>{error}</span>}
    </div>
  );
}
