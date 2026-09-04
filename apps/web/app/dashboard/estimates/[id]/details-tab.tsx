'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { computeEstimateHealth } from '@/lib/estimate-health';
import { createClient } from '@/lib/supabase-browser';
import {
  DiscountType,
  PricingMode,
  updateEstimate,
  updatePricingMode,
  markEstimateLost,
  type LostReasonCode,
  type AlsoSendToRecipient,
} from '@/lib/services/estimates-client';
import { recalculateEstimateTotals } from '@/lib/services/estimate-items-client';
import { ProposalFormatPicker } from './proposal-format-picker';
import { AlsoSendToField } from './also-send-to-field';
import { ContactAddressPicker } from '../contact-address-picker';
import { InlineNumber } from '../inline-edit';
import { fmtPercent } from '../labels';
import { STATUS_LABELS } from '../labels';
import type { TabProps } from './estimate-builder';
import { ContractSection } from './contract-section';
import { SigningActivity } from './signing-activity';
import {
  BeforeYouSendCard,
  ClientActivityCard,
  EstimateHealthCard,
} from './estimate-health-panel';
import { useConfirm } from '@/components/confirm/confirm-provider';

interface DetailsTabProps extends TabProps {
  onDelete?: () => void;
  onClone: () => void;
  statusAction: React.ReactNode;
}

const LOST_REASONS: { value: LostReasonCode; label: string }[] = [
  { value: 'lost_to_competitor', label: 'Lost to a competitor' },
  { value: 'no_response', label: 'No response' },
  { value: 'client_postponed', label: 'Client postponed' },
  { value: 'we_declined', label: 'We declined' },
  { value: 'other', label: 'Other' },
];

/** 19b — mark a sent estimate lost (win-rate honesty). Wires markEstimateLost. */
function MarkLostCard({ estimateId, onDone }: { estimateId: string; onDone: () => Promise<void> }) {
  const [reason, setReason] = useState<LostReasonCode>('lost_to_competitor');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setErr(null);
    const result = await markEstimateLost(estimateId, reason);
    setBusy(false);
    if (!result.success) {
      setErr(result.error ?? 'Could not mark this estimate lost.');
      return;
    }
    await onDone();
  }

  return (
    <div style={{ border: '1px solid #efd3d0', borderRadius: '14px', padding: '18px 20px', background: '#fdf6f5' }}>
      <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f1729', marginBottom: '0.25rem' }}>
        Didn&rsquo;t win this one?
      </div>
      <p style={{ fontSize: '0.72rem', color: '#7b8699', margin: '0 0 0.5rem' }}>
        Mark it lost instead of deleting it, so your win rate stays honest.
      </p>
      <select
        value={reason}
        onChange={(e) => setReason(e.target.value as LostReasonCode)}
        style={{ width: '100%', padding: '0.375rem 0.5rem', border: '1px solid #d5dae4', borderRadius: '0.25rem', fontSize: '0.8125rem', marginBottom: '0.5rem' }}
      >
        {LOST_REASONS.map((r) => (
          <option key={r.value} value={r.value}>{r.label}</option>
        ))}
      </select>
      <button
        type="button"
        onClick={submit}
        disabled={busy}
        style={{ width: '100%', padding: '0.45rem', fontSize: '0.8125rem', fontWeight: 600, color: '#fff', background: busy ? '#9aa4b8' : '#c0362c', border: 'none', borderRadius: '0.375rem', cursor: busy ? 'not-allowed' : 'pointer' }}
      >
        {busy ? 'Marking…' : 'Mark as lost'}
      </button>
      {err && <p style={{ color: '#c0362c', fontSize: '0.72rem', marginTop: '0.5rem' }}>{err}</p>}
    </div>
  );
}

export function DetailsTab({
  data,
  role,
  canEdit,
  reload,
  companyTimeZone,
  estimatorName,
  onDelete,
  onClone,
  statusAction,
}: DetailsTabProps) {
  const { estimate, lineItems } = data;
  const [menuOpen, setMenuOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 19b/R10 — estimator is READ-ONLY, resolved SERVER-SIDE (page.tsx →
  // getUploaderNames) and passed as a prop. It was formerly fetched here, but
  // getUploaderNames imports next/headers via supabase-server and cannot be
  // imported into a client component — the module-boundary break this fixes.
  const [target, setTarget] = useState<number | null>(null);
  // 19b "Also send to" (§1.4) — { contact_id, name, email } snapshots.
  const [alsoSendTo, setAlsoSendTo] = useState<AlsoSendToRecipient[]>(
    () => (estimate.also_send_to as AlsoSendToRecipient[] | null) ?? []
  );
  const confirm = useConfirm();

  useEffect(() => {
    createClient()
      .from('companies')
      .select('margin_target_percent')
      .maybeSingle()
      .then(({ data: co }) => setTarget(co?.margin_target_percent ?? null));
  }, []);

  const health = computeEstimateHealth({
    grandTotal: estimate.grand_total,
    taxRate: estimate.tax_rate,
    lineItems,
    rows: data.rows,
  });
  const gapPts = target != null && health.marginPercent != null ? health.marginPercent - target : null;

  async function saveAlsoSendTo(next: AlsoSendToRecipient[]) {
    setAlsoSendTo(next);
    const result = await saveField({ also_send_to: next });
    if (!result.success) setError(result.error || 'Could not save recipients');
  }

  const mode = estimate.pricing_mode;
  const modeNoun = mode === 'markup' ? 'markup' : 'margin';

  async function saveField(
    updates: Parameters<typeof updateEstimate>[1],
    recalc = false
  ): Promise<{ success: boolean; error?: string }> {
    const result = await updateEstimate(estimate.id, updates);
    if (!result.success) return result;
    if (recalc) {
      const r = await recalculateEstimateTotals(estimate.id);
      if (!r.success) return r;
    }
    await reload();
    return { success: true };
  }

  function percentValidator(value: number | null): string | null {
    if (value == null) return null;
    if (value < 0) return 'Cannot be negative';
    if (mode === 'margin' && value >= 100) return 'Margin must be below 100%';
    if (mode === 'markup' && value > 1000) return 'Markup cannot exceed 1000%';
    return null;
  }

  async function handleModeToggle(newMode: PricingMode) {
    if (newMode === mode) return;
    if (lineItems.length > 0) {
      const ok = await confirm(
        `Switch this estimate to ${newMode} pricing? Percentages still at your company default swap to the ${newMode} default; anything you have edited stays as-is. Totals recalculate with the ${newMode} equations.`
      );
      if (!ok) return;
    }
    setError(null);
    const result = await updatePricingMode(estimate.id, newMode);
    if (!result.success) {
      setError(result.error || 'Could not switch pricing mode');
      return;
    }
    await reload();
  }

  async function handleContactChange(contactId: string | null, addressId: string | null) {
    // Save once both are picked; picking a new contact resets address.
    if (!contactId || !addressId) return;
    if (contactId === estimate.contact_id && addressId === estimate.contact_address_id) return;
    const result = await saveField({ contact_id: contactId, contact_address_id: addressId });
    if (!result.success) setError(result.error || 'Could not update client');
  }

  // ── 19b card anatomy. Fields are RELOCATED into cards; every handler above is
  // unchanged (per-field autosave via saveField on blur). The dark totals footer
  // is the SHELL's (estimate-builder), rendered once — this tab adds none. ──
  const card: React.CSSProperties = {
    background: '#fff',
    border: '1px solid #e4e8ef',
    borderRadius: '14px',
    padding: '18px 20px',
  };
  const cardAmber: React.CSSProperties = {
    ...card,
    border: '1.5px solid #f5cf8f',
    boxShadow: '0 0 0 4px rgba(245,165,36,.09)',
  };
  // Mono uppercase section label — "THE JOB", "CLIENT" (handoff 19b).
  const monoTitle: React.CSSProperties = {
    fontFamily: 'var(--font-mono, monospace)',
    fontSize: '0.6875rem',
    fontWeight: 700,
    letterSpacing: '0.09em',
    textTransform: 'uppercase',
    color: '#5c6784',
    marginBottom: '0.9rem',
  };
  const cardHeadRow: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '0.6rem',
    marginBottom: '0.4rem',
  };
  const cardHeadTitle: React.CSSProperties = { fontSize: '0.97rem', fontWeight: 700, color: '#1a2437' };
  const newBadge: React.CSSProperties = {
    fontFamily: 'var(--font-mono, monospace)',
    fontSize: '0.6rem',
    fontWeight: 800,
    letterSpacing: '0.1em',
    background: '#f5a524',
    color: '#0f1729',
    padding: '3px 7px',
    borderRadius: '5px',
  };
  const rowStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.375rem 0',
    fontSize: '0.875rem',
  };
  const fieldLabel: React.CSSProperties = { color: '#3f4a60', fontWeight: 500 };
  const railCardHead: React.CSSProperties = { fontSize: '0.75rem', color: '#7b8699', marginBottom: '0.25rem' };

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0,1fr) 320px',
        gap: '16px',
        alignItems: 'start',
      }}
    >
      {/* LEFT — the decision cards */}
      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {error && (
          <div
            style={{
              padding: '0.75rem 1rem',
              borderRadius: '0.375rem',
              backgroundColor: '#fdf1f0',
              color: '#c0362c',
              fontSize: '0.875rem',
            }}
          >
            {error}
          </div>
        )}

        {/* CLIENT */}
        <div style={card}>
          <div style={monoTitle}>CLIENT</div>
          {canEdit ? (
            <ContactAddressPicker
              contactId={estimate.contact_id}
              addressId={estimate.contact_address_id}
              onChange={handleContactChange}
            />
          ) : (
            <p style={{ fontSize: '0.875rem', color: '#7b8699', margin: 0 }}>
              Client and address are locked while the estimate is{' '}
              {STATUS_LABELS[estimate.status].toLowerCase()}.
            </p>
          )}

          {/* Also send to — extra proposal recipients (spouse, architect, lender).
              Per-job; frozen on send (the also_send_to freeze migration). §1.4:
              pick an existing contact or add one inline; stores contact_id +
              name/email snapshot. */}
          <AlsoSendToField value={alsoSendTo} canEdit={canEdit} onChange={saveAlsoSendTo} />
        </div>

        {/* THE JOB — estimator (read-only) + timing. Estimate name/number live in
            the shell header; contract type + rates are in ContractSection below;
            lead source lives on the contact (not duplicated here). */}
        <div style={card}>
          <div style={monoTitle}>THE JOB</div>
          <div style={rowStyle}>
            <span style={fieldLabel}>Estimator</span>
            <span style={{ color: '#7b8699' }}>{estimatorName ?? '—'}</span>
          </div>
          <div style={rowStyle}>
            <span style={fieldLabel}>Days until expiration</span>
            <InlineNumber
              value={estimate.expiration_days}
              disabled={!canEdit}
              validate={(v) =>
                v == null || !Number.isInteger(v) || v < 1
                  ? 'Enter a whole number of days (≥ 1)'
                  : null
              }
              onSave={(v) => saveField({ expiration_days: v ?? undefined })}
            />
          </div>
        </div>

        {/* Contract type + negotiated rates + P11 projection (S-3).
            Owner/Admin edit; PM sees read-only (§7.3). Its own card component. */}
        <ContractSection
          estimate={estimate}
          canEditSettings={canEdit && (role === 'owner' || role === 'admin')}
          canReadRates={role === 'owner' || role === 'admin'}
          companyTimeZone={companyTimeZone}
          reload={reload}
        />

        {/* Proposal format — the one control (same as 9d/19a); writes proposal_pricing_level. */}
        <div style={cardAmber}>
          <div style={cardHeadRow}>
            <span style={cardHeadTitle}>Proposal format</span>
            <span style={newBadge}>NEW</span>
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: '0.72rem', color: '#7b8699' }}>Override at send time</span>
          </div>
          <p style={{ fontSize: '0.78rem', color: '#7b8699', margin: '0 0 0.75rem' }}>
            How much of the breakdown the client sees on the printed estimate and the contract.
          </p>
          <ProposalFormatPicker
            value={estimate.proposal_pricing_level}
            contractType={estimate.contract_type}
            canEdit={canEdit}
            onSelect={async (code) => {
              const result = await saveField({ proposal_pricing_level: code });
              if (!result.success) setError(result.error || 'Save failed');
            }}
          />
        </div>

        {/* Pricing basis */}
        <div style={cardAmber}>
          <div style={cardHeadRow}>
            <span style={cardHeadTitle}>Pricing basis</span>
            <span style={newBadge}>NEW</span>
          </div>
          <div style={rowStyle}>
            <span style={fieldLabel}>Pricing mode</span>
            <span style={{ display: 'flex', gap: '1rem' }}>
              {(['markup', 'margin'] as const).map((m) => (
                <label key={m} style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                  <input
                    type="radio"
                    name="pricing_mode"
                    checked={mode === m}
                    disabled={!canEdit}
                    onChange={() => handleModeToggle(m)}
                  />
                  {m === 'markup' ? 'Markup' : 'Margin'}
                </label>
              ))}
            </span>
          </div>
          {/* Markup vs margin — the correction the pricing card exists to make. */}
          <p style={{ fontSize: '0.75rem', color: '#7b8699', margin: '0.25rem 0 0.5rem' }}>
            Markup and margin are not the same number: a 20% markup is a 16.7% margin, and hitting a
            30% margin target takes a 43% markup.
          </p>
          <div style={rowStyle}>
            <span style={fieldLabel}>Subcontractor {modeNoun} %</span>
            <InlineNumber
              value={estimate.subcontractor_markup_percent}
              disabled={!canEdit}
              allowNull
              format={fmtPercent}
              validate={percentValidator}
              onSave={(v) => saveField({ subcontractor_markup_percent: v }, true)}
            />
          </div>
          <div style={rowStyle}>
            <span style={fieldLabel}>Material {modeNoun} %</span>
            <InlineNumber
              value={estimate.material_markup_percent}
              disabled={!canEdit}
              allowNull
              format={fmtPercent}
              validate={percentValidator}
              onSave={(v) => saveField({ material_markup_percent: v }, true)}
            />
          </div>
          <div style={rowStyle}>
            <span style={fieldLabel}>Labor {modeNoun} %</span>
            <InlineNumber
              value={estimate.labor_markup_percent}
              disabled={!canEdit}
              allowNull
              format={fmtPercent}
              validate={percentValidator}
              onSave={(v) => saveField({ labor_markup_percent: v }, true)}
            />
          </div>
          <div style={rowStyle}>
            <span style={fieldLabel}>Tax rate % (materials)</span>
            <InlineNumber
              value={estimate.tax_rate}
              disabled={!canEdit}
              allowNull
              format={fmtPercent}
              validate={(v) => (v != null && (v < 0 || v > 100) ? '0–100' : null)}
              onSave={(v) => saveField({ tax_rate: v }, true)}
            />
          </div>
        </div>

        {/* Whole-estimate discount */}
        <div style={card}>
          <div style={monoTitle}>WHOLE-ESTIMATE DISCOUNT</div>
          <div style={rowStyle}>
            <span style={fieldLabel}>Type</span>
            <select
              value={estimate.discount_type ?? ''}
              disabled={!canEdit}
              onChange={async (e) => {
                const value = (e.target.value || null) as DiscountType | null;
                const result = await saveField(
                  {
                    discount_type: value,
                    discount_amount: value === null ? null : estimate.discount_amount ?? 0,
                  },
                  true
                );
                if (!result.success) setError(result.error || 'Save failed');
              }}
              style={{
                padding: '0.25rem 0.5rem',
                border: '1px solid #d5dae4',
                borderRadius: '0.25rem',
                fontSize: '0.875rem',
              }}
            >
              <option value="">No discount</option>
              <option value="percent">Percent</option>
              <option value="fixed">Fixed amount</option>
            </select>
          </div>
          {estimate.discount_type && (
            <div style={rowStyle}>
              <span style={fieldLabel}>
                Amount {estimate.discount_type === 'percent' ? '(%)' : '($)'}
              </span>
              <InlineNumber
                value={estimate.discount_amount}
                disabled={!canEdit}
                validate={(v) => {
                  if (v == null || v < 0) return 'Enter a non-negative number';
                  if (estimate.discount_type === 'percent' && v > 100) return 'Max 100%';
                  return null;
                }}
                onSave={(v) => saveField({ discount_amount: v }, true)}
              />
            </div>
          )}
        </div>

        {/* Spec 2: signing activity / resend / signed PDF (Owner/Admin) */}
        {(role === 'owner' || role === 'admin') && (
          <SigningActivity data={data} reload={reload} />
        )}
      </div>

      {/* RIGHT RAIL (320px) — status, health, activity, delete. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={card}>
          <div style={railCardHead}>Status</div>
          <div style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.75rem' }}>
            {STATUS_LABELS[estimate.status]}
          </div>
          {statusAction}
        </div>

        <Link
          href={`/dashboard/estimates/${estimate.id}/proposal`}
          style={{
            display: 'block',
            textAlign: 'center',
            padding: '0.5rem 1rem',
            fontSize: '0.875rem',
            fontWeight: 600,
            color: '#3b4ae0',
            backgroundColor: '#f2f4ff',
            border: '1px solid #dbe0fb',
            borderRadius: '0.375rem',
            textDecoration: 'none',
          }}
        >
          Preview Proposal
        </Link>

        {/* §8.10.4 — the three panels with data behind them. Health derives
            from rows the caller already reads (RLS gates builder entry);
            History and Coverage are NOT built — see estimate-health-panel.tsx
            for the reasons, recorded once there. */}
        <EstimateHealthCard data={data} />

        {/* 19b — margin-vs-target bar. Renders ONLY when a company target is set
            (nullable; unset = no comparison, per the ruling). */}
        {target != null && health.marginPercent != null && (
          <div style={card}>
            <div style={{ fontSize: '0.75rem', color: '#7b8699', marginBottom: '0.4rem' }}>
              Margin vs target
            </div>
            <div style={{ position: 'relative', height: '8px', background: '#eef1f6', borderRadius: '999px', overflow: 'hidden' }}>
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: `${Math.max(0, Math.min(100, health.marginPercent))}%`,
                  background: gapPts != null && gapPts < 0 ? '#c0362c' : '#1f8f4e',
                }}
              />
              {/* target marker */}
              <div style={{ position: 'absolute', left: `${Math.max(0, Math.min(100, target))}%`, top: '-2px', bottom: '-2px', width: '2px', background: '#0f1729' }} />
            </div>
            <div style={{ fontSize: '0.72rem', color: gapPts != null && gapPts < 0 ? '#c0362c' : '#1f8f4e', marginTop: '0.4rem', fontFamily: 'var(--font-mono, monospace)' }}>
              {health.marginPercent}% vs {target}% target
              {gapPts != null && ` · ${Math.abs(gapPts).toFixed(1)} pts ${gapPts < 0 ? 'under' : 'over'}`}
            </div>
          </div>
        )}

        <BeforeYouSendCard data={data} />
        <ClientActivityCard data={data} />

        {/* 19b — a SENT estimate that didn't win is marked lost (not deleted), so
            win rate stays honest. Reuses the declined status with a DISTINCT
            reason set via the mark_estimate_lost RPC [R12/Q6]. */}
        {(estimate.status === 'sent' || estimate.status === 'expired') && (
          <MarkLostCard estimateId={estimate.id} onDone={reload} />
        )}

        <div style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            style={{
              width: '100%',
              padding: '0.5rem 1rem',
              fontSize: '0.875rem',
              backgroundColor: '#f4f6fa',
              border: '1px solid #d5dae4',
              borderRadius: '0.375rem',
              cursor: 'pointer',
            }}
          >
            ⋯ More actions
          </button>
          {menuOpen && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                marginTop: '0.25rem',
                backgroundColor: '#fff',
                border: '1px solid #d5dae4',
                borderRadius: '0.375rem',
                boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                zIndex: 10,
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onClone();
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '0.5rem 0.75rem',
                  fontSize: '0.875rem',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Clone this estimate
              </button>
              {onDelete && (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onDelete();
                  }}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '0.5rem 0.75rem',
                    fontSize: '0.875rem',
                    color: '#c0362c',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  Delete estimate
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
