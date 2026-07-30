'use client';

// Money representation §7.1 S-3 — estimate settings: contract type, the
// per-type negotiated rate(s), and the P11 projected value. Type/rate/
// projection are Owner/Admin only (§7.3); PM sees them read-only. Setting a
// rate appends an instrument_rates row effective today — the DB backdating
// guard is the authority (§5.5); the S-4 panel (not yet built) is where
// history and supersede will live.

import { useCallback, useEffect, useState } from 'react';
import {
  CONTRACT_TYPE_LABELS,
  ContractType,
  Estimate,
  updateEstimate,
} from '@/lib/services/estimates-client';
import { recalculateEstimateTotals } from '@/lib/services/estimate-items-client';
import {
  InstrumentRate,
  InstrumentRateType,
  addInstrumentRate,
  listInstrumentRatesClient,
  rateInForce,
} from '@/lib/services/instrument-rates-client';
import { InlineNumber } from '../inline-edit';
import { fmtMoney, fmtPercent } from '../labels';

interface ContractSectionProps {
  estimate: Estimate;
  /** Owner/Admin AND the estimate is editable — gates type/rate/projection. */
  canEditSettings: boolean;
  reload: () => Promise<void>;
}

const RATE_FIELDS: Record<
  Exclude<ContractType, 'fixed_price'>,
  { rateType: InstrumentRateType; label: string; percent: boolean }[]
> = {
  cost_plus: [{ rateType: 'cost_plus_percent', label: 'Markup rate %', percent: true }],
  time_and_materials: [
    { rateType: 'tm_labor_hourly', label: 'Labor rate $/man-hour', percent: false },
    { rateType: 'tm_nonlabor_percent', label: 'Non-labor markup %', percent: true },
  ],
};

function friendlyRateError(message: string): string {
  if (message.includes('instrument_rates_estimate_type_date_key') || message.includes('duplicate key')) {
    return 'A rate of this type is already recorded for today. Correcting a mistyped rate is a supersede (Owner) — not a same-day re-entry.';
  }
  return message;
}

export function ContractSection({ estimate, canEditSettings, reload }: ContractSectionProps) {
  const contractType = estimate.contract_type;
  const [rates, setRates] = useState<InstrumentRate[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refetchRates = useCallback(async () => {
    if (contractType === 'fixed_price') return;
    setRates(await listInstrumentRatesClient({ estimate_id: estimate.id }));
  }, [estimate.id, contractType]);

  useEffect(() => {
    refetchRates();
  }, [refetchRates]);

  const today = new Date().toISOString().slice(0, 10);

  async function handleTypeChange(next: ContractType) {
    if (next === contractType) return;
    const ok = window.confirm(
      `Switch this estimate to ${CONTRACT_TYPE_LABELS[next]}? Sell derivation follows the contract type — totals recalculate. No mixing within one instrument.`
    );
    if (!ok) return;
    setError(null);
    const result = await updateEstimate(estimate.id, { contract_type: next });
    if (!result.success) {
      setError(result.error || 'Could not change the contract type');
      return;
    }
    const r = await recalculateEstimateTotals(estimate.id);
    if (!r.success) setError(r.error || 'Recalculation failed');
    await reload();
  }

  async function handleRateSave(
    rateType: InstrumentRateType,
    value: number | null
  ): Promise<{ success: boolean; error?: string }> {
    if (value == null) return { success: false, error: 'Enter a rate' };
    const result = await addInstrumentRate({ estimate_id: estimate.id }, rateType, value);
    if (!result.success) {
      return { success: false, error: friendlyRateError(result.error || 'Save failed') };
    }
    const r = await recalculateEstimateTotals(estimate.id);
    if (!r.success) return r;
    await refetchRates();
    await reload();
    return { success: true };
  }

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.375rem 0',
    fontSize: '0.875rem',
  };
  const fieldLabel: React.CSSProperties = { color: '#374151', fontWeight: 500 };

  return (
    <div style={{ marginBottom: '2rem', maxWidth: '560px' }}>
      <div
        style={{
          fontSize: '1rem',
          fontWeight: 600,
          marginBottom: '0.75rem',
          paddingBottom: '0.375rem',
          borderBottom: '1px solid #e5e7eb',
        }}
      >
        Contract
      </div>

      {error && (
        <div
          style={{
            padding: '0.5rem 0.75rem',
            borderRadius: '0.375rem',
            marginBottom: '0.5rem',
            backgroundColor: '#fef2f2',
            color: '#991b1b',
            fontSize: '0.8125rem',
          }}
        >
          {error}
        </div>
      )}

      <div style={rowStyle}>
        <span style={fieldLabel}>Contract type</span>
        <select
          value={contractType}
          disabled={!canEditSettings}
          onChange={(e) => handleTypeChange(e.target.value as ContractType)}
          style={{
            padding: '0.25rem 0.5rem',
            border: '1px solid #d1d5db',
            borderRadius: '0.25rem',
            fontSize: '0.875rem',
          }}
        >
          {(Object.keys(CONTRACT_TYPE_LABELS) as ContractType[]).map((t) => (
            <option key={t} value={t}>
              {CONTRACT_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </div>

      {contractType !== 'fixed_price' && (
        <>
          {RATE_FIELDS[contractType].map((field) => (
            <div key={field.rateType} style={rowStyle}>
              <span style={fieldLabel}>{field.label}</span>
              <InlineNumber
                value={rateInForce(rates, field.rateType, today)}
                disabled={!canEditSettings}
                format={field.percent ? fmtPercent : (v) => (v == null ? '—' : fmtMoney(v))}
                validate={(v) => (v != null && v < 0 ? '≥ 0' : null)}
                placeholder="not set"
                onSave={(v) => handleRateSave(field.rateType, v)}
              />
            </div>
          ))}
          <div style={rowStyle}>
            <span style={fieldLabel}>Projected value (non-binding)</span>
            <InlineNumber
              value={estimate.projected_value}
              disabled={!canEditSettings}
              allowNull
              format={(v) => (v == null ? '—' : fmtMoney(v))}
              validate={(v) => (v != null && v < 0 ? '≥ 0' : null)}
              placeholder="blank"
              onSave={async (v) => {
                const result = await updateEstimate(estimate.id, { projected_value: v });
                if (result.success) await reload();
                return result;
              }}
            />
          </div>
          <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: '0.25rem 0 0' }}>
            Rates take effect today and apply forward — cost and hours price at the rate in
            force when incurred. The projection is user-entered, never derived from totals.
          </p>
        </>
      )}
    </div>
  );
}
