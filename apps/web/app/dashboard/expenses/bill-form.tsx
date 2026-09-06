'use client';

// 7C §4.1 — "New bill / commitment" (decision 2a: manual entries).
// Owner/Admin/PM; PM entries land pending (the 7A uniform gate — the INSERT
// policy pins it). awaiting_paper = decision 6: a known number, bill expected.

import { useEffect, useState } from 'react';
import { createBill } from '@/lib/services/payables-client';
import {
  listPaymentAccounts,
  myDefaultPaymentAccountId,
  type PaymentAccountOption,
} from '@/lib/services/qb-accounts-client';
import type { ExpenseCategory } from '@/lib/services/expenses-client';
import {
  BudgetSplitEditor,
  emptySplit,
  resolveSplit,
  type SplitRowDraft,
} from '@/components/expenses/budget-split-editor';
import { overlayStyle, fieldLabelStyle, inputStyle } from '@/components/time/clock-modal';
import { cardStyle, color, h2Style, primaryButtonStyle, secondaryButtonStyle } from '@/lib/theme';

const BILL_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  subcontractor: 'Subcontractor',
  material: 'Material',
  other: 'Other',
};

interface BillFormModalProps {
  projects: { id: string; name: string }[];
  todayYmd: string;
  /** Split editor floor gate (§7.1): budgeted figures Owner/Admin only. */
  callerRole?: string;
  onClose: () => void;
  onDone: () => void;
}

export function BillFormModal({ projects, todayYmd, callerRole, onClose, onDone }: BillFormModalProps) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '');
  const [supplier, setSupplier] = useState('');
  const [date, setDate] = useState(todayYmd);
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('subcontractor');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [awaitingPaper, setAwaitingPaper] = useState(false);

  // ⚠️ OPTIONAL AT COMMITMENT ENTRY, BY RULING [Josh, S103]. A bill has not
  // been paid yet, so which account will pay it is often genuinely unknown.
  // The one place an empty account blocks is the payment.
  const [paymentAccounts, setPaymentAccounts] = useState<PaymentAccountOption[]>([]);
  const [paymentAccountId, setPaymentAccountId] = useState('');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [list, mine] = await Promise.all([listPaymentAccounts(), myDefaultPaymentAccountId()]);
      if (cancelled) return;
      setPaymentAccounts(list);
      setPaymentAccountId((cur) => (cur ? cur : mine && list.some((a) => a.id === mine) ? mine : ''));
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  // Split at capture (money representation §4.4/P7) — bills are expenses too.
  const [split, setSplit] = useState<SplitRowDraft[]>(emptySplit());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!projectId) {
      setError('Pick a job.');
      return;
    }
    const parsedAmount = Number(amount);
    if (!amount.trim() || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Enter an amount greater than zero.');
      return;
    }
    setBusy(true);
    setError(null);
    const resolved = await resolveSplit(projectId, split, parsedAmount);
    if (!resolved.allocations) {
      setBusy(false);
      setError(resolved.error ?? 'Fix the budget split before saving.');
      return;
    }
    const res = await createBill({
      project_id: projectId,
      supplier,
      expense_date: date,
      amount: parsedAmount,
      cost_category: category,
      description: description.trim() || null,
      due_date: dueDate || null,
      awaiting_paper: awaitingPaper,
      allocations: resolved.allocations,
      payment_account_id: paymentAccountId || null,
    });
    setBusy(false);
    if (!res.success) {
      setError(res.error ?? 'Failed to save.');
      return;
    }
    onDone();
  }

  return (
    <div style={overlayStyle} onClick={() => !busy && onClose()}>
      <div
        style={{ ...cardStyle, width: '480px', maxHeight: '88vh', overflowY: 'auto', padding: '24px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ ...h2Style, fontSize: '18px', marginBottom: '4px' }}>New bill / commitment</h3>
        <p style={{ fontSize: '12px', color: color.muted, margin: '0 0 16px' }}>
          A committed cost on the job — it settles through recorded payments. Nothing counts until
          approved.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={fieldLabelStyle}>Job</label>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={inputStyle}>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={fieldLabelStyle}>Supplier / sub</label>
            <input value={supplier} onChange={(e) => setSupplier(e.target.value)} style={inputStyle} />
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
            <label style={fieldLabelStyle}>Bill date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={fieldLabelStyle}>Due date (vendor terms vary)</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={inputStyle} />
          </div>
          {paymentAccounts.length > 0 && (
            <div>
              <label style={fieldLabelStyle}>Paid from (optional until paid)</label>
              <select
                value={paymentAccountId}
                onChange={(e) => setPaymentAccountId(e.target.value)}
                style={inputStyle}
                data-testid="bill-payment-account"
              >
                <option value="">Decide at payment…</option>
                {paymentAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} — {a.accountType}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label style={fieldLabelStyle}>Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
              style={inputStyle}
            >
              {(Object.keys(BILL_CATEGORY_LABELS) as ExpenseCategory[]).map((c) => (
                <option key={c} value={c}>
                  {BILL_CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div style={{ marginBottom: '12px' }}>
          <label style={fieldLabelStyle}>Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </div>
        <BudgetSplitEditor
          projectId={projectId}
          totalAmount={Number(amount) || 0}
          rows={split}
          onChange={setSplit}
          callerRole={callerRole}
          disabled={busy}
        />

        <label
          style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: color.body, marginBottom: '16px', cursor: 'pointer' }}
        >
          <input
            type="checkbox"
            checked={awaitingPaper}
            onChange={(e) => setAwaitingPaper(e.target.checked)}
          />
          Bill expected — price agreed, no document yet
        </label>

        {error && <p style={{ color: color.danger, fontSize: '13px', margin: '0 0 12px' }}>{error}</p>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button style={secondaryButtonStyle} disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button
            style={{ ...primaryButtonStyle, opacity: busy ? 0.6 : 1 }}
            disabled={busy}
            onClick={() => void handleSave()}
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
