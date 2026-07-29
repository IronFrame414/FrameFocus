'use client';

// 7C §4.4 — the Record Payment modal, shared by the Bills & Commitments tab
// and the sub-contract stage panel. Owner/Admin per RLS (the Owner-ONLY arms —
// retainage release, schedule-final — are enforced by the RPC; an Admin
// hitting one sees its message). Over-stage is a two-phase confirm (Q5):
// first call without override; on the RPC's OVER_STAGE refusal, show the
// confirm and re-call with the override set. Flag, never block (§7.9).

import { useState } from 'react';
import { recordPayment } from '@/lib/services/payables-client';
import { fmtMoney } from '@/components/expenses/expense-ui';
import { overlayStyle, fieldLabelStyle, inputStyle } from '@/components/time/clock-modal';
import { cardStyle, color, h2Style, primaryButtonStyle, secondaryButtonStyle } from '@/lib/theme';

/** Free text v1 (7G may force an enum) — datalist suggestions only. */
const METHOD_SUGGESTIONS = ['check', 'ach', 'card', 'cash'];

interface PaymentModalProps {
  expense: {
    id: string;
    supplier: string;
    stage_label: string | null;
    amount: number;
    paidToDate: number;
    is_retainage: boolean;
  };
  onClose: () => void;
  onDone: () => void;
}

export function PaymentModal({ expense, onClose, onDone }: PaymentModalProps) {
  const remaining = Math.max(expense.amount - expense.paidToDate, 0);

  const [date, setDate] = useState(new Date().toLocaleDateString('en-CA'));
  const [amount, setAmount] = useState(remaining > 0 ? remaining.toFixed(2) : '');
  const [method, setMethod] = useState('');
  const [note, setNote] = useState('');
  const [overStageConfirm, setOverStageConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(override: boolean) {
    const parsed = Number(amount);
    if (Number.isNaN(parsed) || parsed <= 0) {
      setError('Amount must be greater than zero.');
      return;
    }
    setBusy(true);
    setError(null);
    const res = await recordPayment(expense.id, {
      paid_date: date,
      amount: parsed,
      method: method || null,
      note: note || null,
      overrideOverStage: override,
    });
    setBusy(false);
    if (res.success) {
      onDone();
      return;
    }
    if (res.overStage && !override) {
      setOverStageConfirm(true);
      return;
    }
    setOverStageConfirm(false);
    setError(res.error ?? 'Failed to record the payment.');
  }

  return (
    <div style={overlayStyle} onClick={() => !busy && onClose()}>
      <div
        style={{ ...cardStyle, width: '420px', maxHeight: '88vh', overflowY: 'auto', padding: '24px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ ...h2Style, fontSize: '18px', marginBottom: '4px' }}>
          {expense.is_retainage ? 'Release retainage' : 'Record payment'}
        </h3>
        <p style={{ fontSize: '12px', color: color.muted, margin: '0 0 16px' }}>
          {expense.supplier}
          {expense.stage_label && ` · ${expense.stage_label}`} · {fmtMoney(expense.paidToDate)} paid
          of {fmtMoney(expense.amount)} · {fmtMoney(remaining)} remaining
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
          <div>
            <label style={fieldLabelStyle}>Date paid</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={fieldLabelStyle}>Amount</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={fieldLabelStyle}>Method</label>
            <input
              list="payment-method-suggestions"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              placeholder="check, ach, card…"
              style={inputStyle}
            />
            <datalist id="payment-method-suggestions">
              {METHOD_SUGGESTIONS.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </div>
          <div>
            <label style={fieldLabelStyle}>Note</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} style={inputStyle} />
          </div>
        </div>

        {error && <p style={{ color: color.danger, fontSize: '13px', margin: '0 0 12px' }}>{error}</p>}

        {overStageConfirm ? (
          <div>
            <p style={{ fontSize: '13px', color: color.warningDeep, margin: '0 0 12px' }}>
              This payment exceeds the remaining balance on this{' '}
              {expense.stage_label ? 'stage' : 'bill'}. Record it anyway? It will be flagged
              over-stage.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button style={secondaryButtonStyle} disabled={busy} onClick={() => setOverStageConfirm(false)}>
                Back
              </button>
              <button
                style={{ ...primaryButtonStyle, backgroundColor: color.warning, opacity: busy ? 0.6 : 1 }}
                disabled={busy}
                onClick={() => void handleSubmit(true)}
              >
                {busy ? 'Saving…' : 'Record anyway'}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button style={secondaryButtonStyle} disabled={busy} onClick={onClose}>
              Cancel
            </button>
            <button
              style={{ ...primaryButtonStyle, opacity: busy ? 0.6 : 1 }}
              disabled={busy}
              onClick={() => void handleSubmit(false)}
            >
              {busy ? 'Saving…' : expense.is_retainage ? 'Release' : 'Record payment'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
