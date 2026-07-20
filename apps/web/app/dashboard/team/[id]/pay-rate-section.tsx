'use client';

// Owner/Admin pay-rate manager (S85 decision 7) — minimal: current rate,
// effective-dated history, add form. The page is already Owner/Admin-gated;
// member_pay_rates RLS is the enforcement. Rules surfaced to the user: a rate
// applies from its effective date forward (each day pays at that day's rate —
// a mid-week raise splits the week), and changes reprice only
// unapproved/future time; approved sessions stay frozen at the rate
// snapshotted when they were approved.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  addMemberRate,
  deleteMemberRate,
  type MemberPayRate,
} from '@/lib/services/pay-rates-client';
import { cardStyle, color, h2Style, microLabelStyle, primaryButtonStyle } from '@/lib/theme';
import { monoValue } from '@/components/time/time-ui';

interface PayRateSectionProps {
  memberId: string;
  /** Newest effective_date first (getMemberRates order). */
  rates: MemberPayRate[];
}

function money(rate: number): string {
  return Number(rate).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function todayYmd(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const inputStyle: React.CSSProperties = {
  padding: '9px 12px',
  borderRadius: '9px',
  border: `1px solid ${color.inputBorder}`,
  fontSize: '14px',
  color: color.body,
};

export default function PayRateSection({ memberId, rates }: PayRateSectionProps) {
  const router = useRouter();
  const [rateInput, setRateInput] = useState('');
  const [dateInput, setDateInput] = useState(() => todayYmd());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = todayYmd();
  const current = rates.find((r) => r.effective_date <= today) ?? null;

  async function handleAdd() {
    const parsed = Number(rateInput);
    if (!rateInput.trim() || Number.isNaN(parsed) || parsed < 0) {
      setError('Enter an hourly rate of zero or more.');
      return;
    }
    setBusy(true);
    setError(null);
    const res = await addMemberRate(memberId, parsed, dateInput);
    setBusy(false);
    if (!res.success) {
      setError(res.error ?? 'Failed to add the rate.');
      return;
    }
    setRateInput('');
    router.refresh();
  }

  async function handleDelete(id: string) {
    setBusy(true);
    setError(null);
    const res = await deleteMemberRate(id);
    setBusy(false);
    if (!res.success) {
      setError(res.error ?? 'Failed to remove the rate.');
      return;
    }
    router.refresh();
  }

  return (
    <div style={{ ...cardStyle, padding: '20px 24px', marginTop: '24px' }}>
      <h2 style={{ ...h2Style, fontSize: '18px', marginBottom: '4px' }}>Pay rate</h2>
      <p style={{ fontSize: '12px', color: color.faint, margin: '0 0 14px' }}>
        A rate applies from its effective date forward — each day pays at that day&apos;s rate.
        Changes reprice unapproved and future time only; approved days stay frozen at the rate in
        effect when they were approved.
      </p>

      <p style={{ margin: '0 0 14px', fontSize: '14px', color: color.body }}>
        Current rate:{' '}
        <span style={{ ...monoValue, fontWeight: 600, color: color.navy }}>
          {current ? `${money(current.hourly_rate)}/hr` : '—'}
        </span>
        {current && (
          <span style={{ fontSize: '12px', color: color.faint }}>
            {' '}
            since {current.effective_date}
          </span>
        )}
      </p>

      {rates.length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          <p style={{ ...microLabelStyle, marginBottom: '6px' }}>History</p>
          {rates.map((r) => (
            <div
              key={r.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '6px 0',
                borderBottom: `1px solid ${color.rowDivider}`,
                fontSize: '13px',
              }}
            >
              <span style={{ ...monoValue, width: '110px', color: color.bodyAlt }}>
                {r.effective_date}
              </span>
              <span style={{ ...monoValue, width: '90px', color: color.navy, fontWeight: 600 }}>
                {money(r.hourly_rate)}/hr
              </span>
              <span style={{ flex: 1, fontSize: '11px', color: color.faint }}>
                {r.effective_date > today ? 'upcoming' : ''}
              </span>
              <button
                onClick={() => void handleDelete(r.id)}
                disabled={busy}
                aria-label={`Remove rate effective ${r.effective_date}`}
                style={{
                  border: 'none',
                  background: 'none',
                  color: color.dangerAlt,
                  cursor: 'pointer',
                  fontWeight: 700,
                  padding: '2px 6px',
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="number"
          min="0"
          step="0.25"
          placeholder="Hourly rate"
          value={rateInput}
          onChange={(e) => setRateInput(e.target.value)}
          style={{ ...inputStyle, width: '130px' }}
        />
        <input
          type="date"
          value={dateInput}
          onChange={(e) => setDateInput(e.target.value)}
          style={inputStyle}
        />
        <button
          style={{ ...primaryButtonStyle, opacity: busy ? 0.6 : 1 }}
          disabled={busy}
          onClick={() => void handleAdd()}
        >
          {busy ? 'Saving…' : 'Add rate'}
        </button>
      </div>
      {error && (
        <p style={{ color: color.danger, fontSize: '13px', margin: '10px 0 0' }}>{error}</p>
      )}
    </div>
  );
}
