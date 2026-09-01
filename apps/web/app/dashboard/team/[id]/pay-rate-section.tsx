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
  setMemberBurden,
  type BurdenSource,
  type MemberBurdenSettings,
  type MemberPayRate,
} from '@/lib/services/pay-rates-client';
import { cardStyle, color, h2Style, microLabelStyle, primaryButtonStyle } from '@/lib/theme';
import { monoValue } from '@/components/time/time-ui';

interface PayRateSectionProps {
  memberId: string;
  /** Newest effective_date first (getMemberRates order). */
  rates: MemberPayRate[];
  /** 7A §5.9 — live burden row (null = no row yet = pass-through ×1.0). */
  burden: MemberBurdenSettings | null;
  /** companies.fixed_burden_per_hour — the '+' arm of the preview (null→0). */
  companyFixedBurden: number | null;
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

export default function PayRateSection({
  memberId,
  rates,
  burden,
  companyFixedBurden,
}: PayRateSectionProps) {
  const router = useRouter();
  const [rateInput, setRateInput] = useState('');
  const [dateInput, setDateInput] = useState(() => todayYmd());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 7A §5.9 — burden controls (multiplier + source toggle).
  const [multiplierInput, setMultiplierInput] = useState(
    String(burden?.burden_multiplier ?? 1.0)
  );
  const [burdenSource, setBurdenSource] = useState<BurdenSource>(
    burden?.burden_source ?? 'member_multiplier'
  );
  const [burdenBusy, setBurdenBusy] = useState(false);
  const [burdenError, setBurdenError] = useState<string | null>(null);
  const [burdenSaved, setBurdenSaved] = useState(false);

  const today = todayYmd();
  const current = rates.find((r) => r.effective_date <= today) ?? null;

  async function handleSaveBurden() {
    const parsed = Number(multiplierInput);
    if (!multiplierInput.trim() || Number.isNaN(parsed) || parsed <= 0) {
      setBurdenError('Enter a burden multiplier greater than zero.');
      return;
    }
    setBurdenBusy(true);
    setBurdenError(null);
    setBurdenSaved(false);
    const res = await setMemberBurden(memberId, {
      burden_multiplier: parsed,
      burden_source: burdenSource,
    });
    setBurdenBusy(false);
    if (!res.success) {
      setBurdenError(res.error ?? 'Failed to save burden settings.');
      return;
    }
    setBurdenSaved(true);
    router.refresh();
  }

  // Founder safeguard (§7.8.3): the preview line IS the formula the next
  // approval will freeze — the operator flips with the toggle.
  const previewMultiplier = Number(multiplierInput) > 0 ? Number(multiplierInput) : 1.0;
  const preview = current
    ? burdenSource === 'member_multiplier'
      ? `${money(current.hourly_rate)} × ${previewMultiplier} / hr`
      : `${money(current.hourly_rate)} + ${money(companyFixedBurden ?? 0)} / hr`
    : null;

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
                  color: color.danger,
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

      {/* ── 7A §5.9 — labor burden ── */}
      <div style={{ borderTop: `1px solid ${color.rowDivider}`, marginTop: '20px', paddingTop: '16px' }}>
        <h3 style={{ ...h2Style, fontSize: '15px', marginBottom: '4px' }}>Labor burden</h3>
        <p style={{ fontSize: '12px', color: color.faint, margin: '0 0 12px' }}>
          Applies to future approvals only — already-approved time keeps its frozen burden.
        </p>

        <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '10px' }}>
          <div style={{ display: 'flex', gap: '12px', fontSize: '13px', color: color.body }}>
            <label style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <input
                type="radio"
                checked={burdenSource === 'member_multiplier'}
                onChange={() => setBurdenSource('member_multiplier')}
              />
              Member multiplier
            </label>
            <label style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <input
                type="radio"
                checked={burdenSource === 'company_fixed'}
                onChange={() => setBurdenSource('company_fixed')}
              />
              Company fixed $/hr
            </label>
          </div>
          {burdenSource === 'member_multiplier' && (
            <input
              type="number"
              min="0.001"
              step="0.01"
              value={multiplierInput}
              onChange={(e) => setMultiplierInput(e.target.value)}
              aria-label="Burden multiplier"
              style={{ ...inputStyle, width: '100px' }}
            />
          )}
        </div>

        {preview && (
          <p style={{ margin: '0 0 12px', fontSize: '14px', color: color.body }}>
            Burdened cost:{' '}
            <span style={{ ...monoValue, fontWeight: 600, color: color.navy }}>{preview}</span>
            {burdenSource === 'company_fixed' && companyFixedBurden === null && (
              <span style={{ fontSize: '12px', color: color.warning }}>
                {' '}
                — no company fixed burden set (Settings); treated as $0.00
              </span>
            )}
          </p>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            style={{ ...primaryButtonStyle, opacity: burdenBusy ? 0.6 : 1 }}
            disabled={burdenBusy}
            onClick={() => void handleSaveBurden()}
          >
            {burdenBusy ? 'Saving…' : 'Save burden'}
          </button>
          {burdenSaved && (
            <span style={{ fontSize: '12px', color: color.success }}>Saved.</span>
          )}
        </div>
        {burdenError && (
          <p style={{ color: color.danger, fontSize: '13px', margin: '10px 0 0' }}>{burdenError}</p>
        )}
      </div>
    </div>
  );
}
