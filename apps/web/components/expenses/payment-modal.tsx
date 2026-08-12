'use client';

// 7C §4.4 — the Record Payment modal, shared by the Bills & Commitments tab
// and the sub-contract stage panel. Owner/Admin per RLS (the Owner-ONLY arms —
// retainage release, schedule-final — are enforced by the RPC; an Admin
// hitting one sees its message). Over-stage is a two-phase confirm (Q5):
// first call without override; on the RPC's OVER_STAGE refusal, show the
// confirm and re-call with the override set. Flag, never block (§7.9).
// S95 ruling: paying a stage whose sub-contract is formal-and-unsigned
// (requires_formal_contract, status <> 'signed') warns HERE, at the moment
// of payment — inline banner + explicit confirm before the RPC runs.
// Advisory only; same role gate as the payment itself. The 7F "contract
// isn't signed" surface is separate — this is only the formal flag.

import { useEffect, useState } from 'react';
import {
  getComplianceWarnings,
  getFormalContractWarning,
  recordPayment,
  type ComplianceWarning,
} from '@/lib/services/payables-client';
import { fmtMoney } from '@/components/expenses/expense-ui';
import { overlayStyle, fieldLabelStyle, inputStyle } from '@/components/time/clock-modal';
import { cardStyle, color, h2Style, primaryButtonStyle, secondaryButtonStyle } from '@/lib/theme';

/** Free text v1 (7G may force an enum) — datalist suggestions only. */
const METHOD_SUGGESTIONS = ['check', 'ach', 'card', 'cash'];

/** Short forms — the sub record spells these out. */
const COMPLIANCE_LABEL: Record<ComplianceWarning['docType'], string> = {
  coi: 'Certificate of insurance',
  license: 'License',
  w9: 'W-9',
  other: 'Compliance document',
};

interface PaymentModalProps {
  expense: {
    id: string;
    supplier: string;
    stage_label: string | null;
    amount: number;
    paidToDate: number;
    is_retainage: boolean;
  };
  /** The stage's parent sub-contract, when there is one — drives the S95
   *  formal-and-unsigned payment warning. */
  subContractId?: string | null;
  onClose: () => void;
  onDone: () => void;
}

export function PaymentModal({ expense, subContractId, onClose, onDone }: PaymentModalProps) {
  const remaining = Math.max(expense.amount - expense.paidToDate, 0);

  const [date, setDate] = useState(new Date().toLocaleDateString('en-CA'));
  const [amount, setAmount] = useState(remaining > 0 ? remaining.toFixed(2) : '');
  const [method, setMethod] = useState('');
  const [note, setNote] = useState('');
  const [overStageConfirm, setOverStageConfirm] = useState(false);
  const [formalWarn, setFormalWarn] = useState<{ subName: string } | null>(null);
  /** 7C §4.4 [S140] — release-time compliance chips. ADVISORY ONLY: nothing
   *  below reads this to decide whether the payment may proceed, and there is
   *  no acknowledge step. 5I §5 / architecture P2 — warn, never block. */
  const [complianceWarn, setComplianceWarn] = useState<ComplianceWarning[]>([]);
  const [formalConfirm, setFormalConfirm] = useState(false);
  const [formalAck, setFormalAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!subContractId) return;
    let cancelled = false;
    void getFormalContractWarning(subContractId).then((warn) => {
      if (!cancelled) setFormalWarn(warn);
    });
    void getComplianceWarnings(subContractId).then((warns) => {
      if (!cancelled) setComplianceWarn(warns);
    });
    return () => {
      cancelled = true;
    };
  }, [subContractId]);

  async function handleSubmit(override: boolean, ackFormal = false) {
    const parsed = Number(amount);
    if (Number.isNaN(parsed) || parsed <= 0) {
      setError('Amount must be greater than zero.');
      return;
    }
    // S95: formal-and-unsigned → explicit confirm BEFORE the RPC. Advisory,
    // never a block — acknowledged once per modal.
    if (formalWarn && !formalAck && !ackFormal) {
      setFormalConfirm(true);
      return;
    }
    if (ackFormal) setFormalAck(true);
    setFormalConfirm(false);
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

        {formalWarn && (
          <div
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              marginBottom: '12px',
              backgroundColor: '#fffbeb',
              border: '1px solid #fde68a',
              color: color.warningDeep,
              fontSize: '12px',
            }}
          >
            This contract with {formalWarn.subName} requires a formal contract and it is not
            signed yet — this payment sends money out before the contract is in place.
          </div>
        )}

        {complianceWarn.length > 0 && (
          <div
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              marginBottom: '12px',
              backgroundColor: '#fffbeb',
              border: '1px solid #fde68a',
              color: color.warningDeep,
              fontSize: '12px',
            }}
          >
            {complianceWarn.map((w) => (
              <div key={w.docType}>
                {COMPLIANCE_LABEL[w.docType]}{' '}
                {w.status === 'expired'
                  ? `expired${w.days !== null ? ` ${Math.abs(w.days)} days ago` : ''}`
                  : `expires${w.days !== null ? ` in ${w.days} days` : ' soon'}`}
                .
              </div>
            ))}
            <div style={{ marginTop: '4px', color: color.muted }}>
              Advisory only — this never blocks a payment.
            </div>
          </div>
        )}

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

        {formalConfirm ? (
          <div>
            <p style={{ fontSize: '13px', color: color.warningDeep, margin: '0 0 12px' }}>
              The formal contract with {formalWarn?.subName} is not signed — you are about to
              send money out before the contract is in place. Record the payment anyway?
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button style={secondaryButtonStyle} disabled={busy} onClick={() => setFormalConfirm(false)}>
                Back
              </button>
              <button
                style={{ ...primaryButtonStyle, backgroundColor: color.warning, opacity: busy ? 0.6 : 1 }}
                disabled={busy}
                onClick={() => void handleSubmit(false, true)}
              >
                {busy ? 'Saving…' : 'Pay before signature'}
              </button>
            </div>
          </div>
        ) : overStageConfirm ? (
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
