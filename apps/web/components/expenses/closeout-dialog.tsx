'use client';

// 7C §4.8 — the closeout dialog (decision 8). Owner/Admin; reason required;
// consequence text spells out what happens: the remaining balance drops out
// of committed Σ (paid dollars stay actual), and a sub-linked closeout flags
// the sub "did not finish" (best-effort — no FK links members to sub records,
// so the service may return a flag-by-hand warning).

import { useState } from 'react';
import { closeoutCommitment } from '@/lib/services/payables-client';
import { fmtMoney } from '@/components/expenses/expense-ui';
import { overlayStyle, fieldLabelStyle, inputStyle } from '@/components/time/clock-modal';
import { cardStyle, color, h2Style, primaryButtonStyle, secondaryButtonStyle } from '@/lib/theme';

interface CloseoutDialogProps {
  expense: {
    id: string;
    supplier: string;
    stage_label: string | null;
    remaining: number;
    isSubCommitment: boolean;
  };
  onClose: () => void;
  /** Receives the service's best-effort warning, if any. */
  onDone: (warning?: string) => void;
}

export function CloseoutDialog({ expense, onClose, onDone }: CloseoutDialogProps) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCloseout() {
    if (!reason.trim()) {
      setError('A reason is required — closeouts are auditable forever.');
      return;
    }
    setBusy(true);
    setError(null);
    const res = await closeoutCommitment(expense.id, reason);
    setBusy(false);
    if (!res.success) {
      setError(res.error ?? 'Closeout failed.');
      return;
    }
    onDone(res.warning);
  }

  return (
    <div style={overlayStyle} onClick={() => !busy && onClose()}>
      <div
        style={{ ...cardStyle, width: '440px', padding: '24px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ ...h2Style, fontSize: '18px', marginBottom: '4px' }}>Close out commitment</h3>
        <p style={{ fontSize: '13px', color: color.muted, margin: '0 0 12px' }}>
          {expense.supplier}
          {expense.stage_label && ` · ${expense.stage_label}`}
        </p>
        <p style={{ fontSize: '13px', color: color.warning, margin: '0 0 14px' }}>
          This drops {fmtMoney(expense.remaining)} committed from the job. Dollars already paid
          stay in actual.
          {expense.isSubCommitment && ' The sub will be flagged "did not finish" on their record.'}
        </p>

        <label style={fieldLabelStyle}>Reason (required)</label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder={'e.g. "abandoned after rough-in; hired replacement"'}
          style={{ ...inputStyle, resize: 'vertical', marginBottom: '12px' }}
        />

        {error && <p style={{ color: color.danger, fontSize: '13px', margin: '0 0 12px' }}>{error}</p>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button style={secondaryButtonStyle} disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button
            style={{
              ...primaryButtonStyle,
              backgroundColor: color.danger,
              opacity: busy || !reason.trim() ? 0.6 : 1,
            }}
            disabled={busy || !reason.trim()}
            onClick={() => void handleCloseout()}
          >
            {busy ? 'Saving…' : 'Close out'}
          </button>
        </div>
      </div>
    </div>
  );
}
