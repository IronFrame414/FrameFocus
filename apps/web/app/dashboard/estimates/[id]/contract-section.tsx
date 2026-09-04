'use client';
import { companyToday } from '@framefocus/shared/utils/dates';

// Money representation §7.1 S-3 (as amended 2026-07-31) — estimate
// settings: contract type, the per-type negotiated rate AMOUNT (date-free
// by ruling — the initial row lands effective today as a placeholder;
// conversion restamps it to the contract start, §5.1 item 4, not yet
// built), and the P11 projected value. Type/rate/projection are Owner/Admin
// only (§7.3); PM sees them read-only. The DB backdating guard is the
// authority (§5.5 — future-dating permitted since 20260731010000, but this
// screen never sends a date). Rate history, renegotiation, and supersede
// live on the PROJECT rate section (S-4), not here.

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
import { useConfirm } from '@/components/confirm/confirm-provider';

interface ContractSectionProps {
  estimate: Estimate;
  /** Owner/Admin AND the estimate is editable — gates type/rate/projection. */
  canEditSettings: boolean;
  /** Owner/Admin. Step 9.5 PROBE FINDING [live, rebuild-test]: the S97 floor
   *  (`instrument_rates_select_owner_admin`) applies to ESTIMATE-scoped rates
   *  too — a PM's read returns 0 rows (owner: 22, same instant). An empty
   *  read is indistinguishable from "no rates set", so without this flag the
   *  PM saw the FALSE "No rate in force … blocks totals" banner on every
   *  non-fixed estimate. Gated callers skip the fetch entirely and get an
   *  honest caption instead. */
  canReadRates: boolean;
  reload: () => Promise<void>;
}

// A-9: cost-plus carries four independent rates — set each on its own; they
// are commonly all equal, but never auto-filled or linked. The legacy
// cost_plus_percent is read-only history and is not offered for entry.
const RATE_FIELDS: Record<
  Exclude<ContractType, 'fixed_price'>,
  { rateType: InstrumentRateType; label: string; percent: boolean }[]
> = {
  cost_plus: [
    { rateType: 'cost_plus_labor_hourly', label: 'Labor rate $/man-hour', percent: false },
    { rateType: 'cost_plus_material_percent', label: 'Material markup %', percent: true },
    { rateType: 'cost_plus_subcontractor_percent', label: 'Subcontractor markup %', percent: true },
    { rateType: 'cost_plus_other_percent', label: 'Other markup %', percent: true },
  ],
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

export function ContractSection({
  estimate,
  canEditSettings,
  canReadRates,
  reload,
}: ContractSectionProps) {
  const contractType = estimate.contract_type;
  const [rates, setRates] = useState<InstrumentRate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const confirm = useConfirm();

  const refetchRates = useCallback(async () => {
    // Zero calls for a role the floor filters to nothing (see canReadRates).
    if (contractType === 'fixed_price' || !canReadRates) return;
    setRates(await listInstrumentRatesClient({ estimate_id: estimate.id }));
  }, [estimate.id, contractType, canReadRates]);

  useEffect(() => {
    refetchRates();
  }, [refetchRates]);

  // #116 [S103]: NOT the UTC day (tomorrow after ~20:00 EDT). Client component
  // deep in the estimate tree; falls back to the company-tz default here. The
  // per-company timezone can be threaded from the estimate page later.
  const today = companyToday('America/New_York');

  // Rateless surface: rate types the contract type carries but which have
  // nothing in force (never set, or the only rate was superseded). A missing
  // MARKUP rate blocks the recompute for rows of its category (A-9
  // usage-based — 0% would silently price at cost). The LABOR rate never
  // blocks estimate pricing (S97: labor bills at the row's own rate) — it
  // defaults new labor rows and drives 7D invoicing, so its absence still
  // deserves the banner.
  const missingRates =
    contractType === 'fixed_price'
      ? []
      : RATE_FIELDS[contractType].filter((f) => rateInForce(rates, f.rateType, today) == null);

  async function handleTypeChange(next: ContractType) {
    if (next === contractType) return;
    const ok = await confirm(
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
  const fieldLabel: React.CSSProperties = { color: '#3f4a60', fontWeight: 500 };

  return (
    <div style={{ marginBottom: '2rem', maxWidth: '560px' }}>
      <div
        style={{
          fontSize: '1rem',
          fontWeight: 600,
          marginBottom: '0.75rem',
          paddingBottom: '0.375rem',
          borderBottom: '1px solid #e4e8ef',
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
            backgroundColor: '#fdf1f0',
            color: '#c0362c',
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
            border: '1px solid #d5dae4',
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

      {contractType !== 'fixed_price' && !canReadRates && (
        <p style={{ fontSize: '0.8125rem', color: '#7b8699', margin: '0.25rem 0 0' }}>
          Negotiated rates on this estimate are visible to the Owner and Admins only.
        </p>
      )}

      {contractType !== 'fixed_price' && canReadRates && (
        <>
          {missingRates.length > 0 && (
            <div
              style={{
                padding: '0.5rem 0.75rem',
                borderRadius: '0.375rem',
                marginBottom: '0.5rem',
                backgroundColor: '#fff5e6',
                border: '1px solid #f5cf8f',
                color: '#b45309',
                fontSize: '0.8125rem',
              }}
            >
              No rate in force ({missingRates.map((f) => f.label).join(', ')}) — set{' '}
              {missingRates.length === 1 ? 'it' : 'them'} here; missing markup rates block totals
              from recalculating.
            </div>
          )}
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
          <p style={{ fontSize: '0.75rem', color: '#7b8699', margin: '0.25rem 0 0' }}>
            Rates take effect today and apply forward — cost and hours price at the rate in
            force when incurred. The projection is user-entered, never derived from totals.
          </p>
        </>
      )}
    </div>
  );
}
