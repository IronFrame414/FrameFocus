'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getUploaderNames } from '@/lib/services/photos';
import { computeEstimateHealth } from '@/lib/estimate-health';
import { createClient } from '@/lib/supabase-browser';
import {
  DiscountType,
  PricingMode,
  updateEstimate,
  updatePricingMode,
  markEstimateLost,
  type LostReasonCode,
} from '@/lib/services/estimates-client';
import { recalculateEstimateTotals } from '@/lib/services/estimate-items-client';
import { ProposalFormatPicker } from './proposal-format-picker';
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
    <div style={{ border: '1px solid #efd3d0', borderRadius: '0.5rem', padding: '1rem', marginBottom: '1rem', background: '#fdf6f5' }}>
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
  onDelete,
  onClone,
  statusAction,
}: DetailsTabProps) {
  const { estimate, lineItems } = data;
  const [menuOpen, setMenuOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 19b — estimator is READ-ONLY, resolved via getUploaderNames from created_by
  // (an RLS floor). No second resolver; users cannot edit it [R10].
  const [estimatorName, setEstimatorName] = useState<string | null>(null);
  const [target, setTarget] = useState<number | null>(null);
  const [alsoSendTo, setAlsoSendTo] = useState<string>(() =>
    ((estimate.also_send_to as string[] | null) ?? []).join('\n')
  );
  const confirm = useConfirm();

  useEffect(() => {
    if (estimate.created_by) {
      getUploaderNames([estimate.created_by]).then((m) =>
        setEstimatorName(m.get(estimate.created_by as string) ?? null)
      );
    }
    createClient()
      .from('companies')
      .select('margin_target_percent')
      .maybeSingle()
      .then(({ data: co }) => setTarget(co?.margin_target_percent ?? null));
  }, [estimate.created_by]);

  const health = computeEstimateHealth({
    grandTotal: estimate.grand_total,
    taxRate: estimate.tax_rate,
    lineItems,
    rows: data.rows,
  });
  const gapPts = target != null && health.marginPercent != null ? health.marginPercent - target : null;

  async function saveAlsoSendTo() {
    const list = alsoSendTo
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    const result = await saveField({ also_send_to: list });
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

  const sectionStyle: React.CSSProperties = { marginBottom: '2rem', maxWidth: '560px' };
  const sectionTitleStyle: React.CSSProperties = {
    fontSize: '1rem',
    fontWeight: 600,
    marginBottom: '0.75rem',
    paddingBottom: '0.375rem',
    borderBottom: '1px solid #e4e8ef',
  };
  const rowStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.375rem 0',
    fontSize: '0.875rem',
  };
  const fieldLabel: React.CSSProperties = { color: '#3f4a60', fontWeight: 500 };

  return (
    <div style={{ display: 'flex', gap: '2rem', alignItems: 'flex-start' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        {error && (
          <div
            style={{
              padding: '0.75rem 1rem',
              borderRadius: '0.375rem',
              marginBottom: '1rem',
              backgroundColor: '#fdf1f0',
              color: '#c0362c',
              fontSize: '0.875rem',
            }}
          >
            {error}
          </div>
        )}

        {/* Client */}
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>Client &amp; Job Site</div>
          {canEdit ? (
            <ContactAddressPicker
              contactId={estimate.contact_id}
              addressId={estimate.contact_address_id}
              onChange={handleContactChange}
            />
          ) : (
            <p style={{ fontSize: '0.875rem', color: '#7b8699' }}>
              Client and address are locked while the estimate is{' '}
              {STATUS_LABELS[estimate.status].toLowerCase()}.
            </p>
          )}

          {/* Estimator — read-only, from created_by (no lead source; it lives on
              the contact). */}
          <div style={{ ...rowStyle, marginTop: '0.5rem' }}>
            <span style={fieldLabel}>Estimator</span>
            <span style={{ color: '#7b8699' }}>{estimatorName ?? '—'}</span>
          </div>

          {/* Also send to — extra proposal recipients (spouse, architect, lender).
              Per-job; frozen on send (the also_send_to freeze migration). */}
          <div style={{ marginTop: '0.75rem' }}>
            <label style={{ ...fieldLabel, display: 'block', marginBottom: '0.25rem' }}>
              Also send to <span style={{ color: '#9aa4b8', fontWeight: 400 }}>(one email per line)</span>
            </label>
            <textarea
              value={alsoSendTo}
              disabled={!canEdit}
              onChange={(e) => setAlsoSendTo(e.target.value)}
              onBlur={saveAlsoSendTo}
              rows={2}
              placeholder="spouse@example.com&#10;architect@example.com"
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                border: '1px solid #d5dae4',
                borderRadius: '0.375rem',
                fontSize: '0.8125rem',
                fontFamily: 'inherit',
                resize: 'vertical',
              }}
            />
          </div>
        </div>

        {/* Expiration */}
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>Expiration</div>
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
            Owner/Admin edit; PM sees read-only (§7.3). */}
        <ContractSection
          estimate={estimate}
          canEditSettings={canEdit && (role === 'owner' || role === 'admin')}
          canReadRates={role === 'owner' || role === 'admin'}
          companyTimeZone={companyTimeZone}
          reload={reload}
        />

        {/* Pricing */}
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>Pricing</div>
          <div style={rowStyle}>
            <span style={fieldLabel}>Pricing mode</span>
            <span style={{ display: 'flex', gap: '1rem' }}>
              {(['markup', 'margin'] as const).map((m) => (
                <label
                  key={m}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}
                >
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
          <p style={{ fontSize: '0.75rem', color: '#7b8699', margin: '0.25rem 0 0.75rem' }}>
            Markup and margin are not the same number: a 20% markup is a 16.7% margin, and hitting a
            30% margin target takes a 43% markup.
          </p>
          {/* Proposal format — the one control (same as 9d/19a); writes proposal_pricing_level. */}
          <div style={{ padding: '0.5rem 0' }}>
            <span style={{ ...fieldLabel, display: 'block', marginBottom: '0.5rem' }}>Proposal format</span>
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
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>Whole-Estimate Discount</div>
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

      {/* Right column: status + actions + the §8.10.4 panels */}
      <div style={{ width: '260px', flexShrink: 0 }}>
        <div
          style={{
            border: '1px solid #e4e8ef',
            borderRadius: '0.5rem',
            padding: '1rem',
            marginBottom: '1rem',
          }}
        >
          <div style={{ fontSize: '0.75rem', color: '#7b8699', marginBottom: '0.25rem' }}>
            Status
          </div>
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
            marginBottom: '1rem',
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
          <div style={{ border: '1px solid #e4e8ef', borderRadius: '0.5rem', padding: '0.875rem 1rem', marginBottom: '1rem' }}>
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
