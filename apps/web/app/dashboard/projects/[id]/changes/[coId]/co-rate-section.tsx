'use client';

// Money representation §7.1 S-5 — CO instrument rates on the CO builder.
// A non-fixed CO carries its OWN negotiated rate(s) (P4 — no mixing, never
// inherited from the estimate instrument): cost-plus → four independent
// rates (labor $/man-hour + material/sub/other markup %, A-9), T&M →
// labor $/man-hour + non-labor markup %. Rate rows land on
// instrument_rates.change_order_id via the shipped addInstrumentRate; the
// effective-date rules are the project renegotiate control's (floor =
// latest live rate + 1 day, no floor for a first rate, NO future cap — P5
// as amended 2026-07-31), reused via RenegotiateRate rather than restated.
// Roles per §7.3/S-5 as AMENDED by RULING A [S97, 2026-08-02]: Owner/Admin set
// rates and a PM sees NO rate values at all — this section is not mounted below
// Owner/Admin. A PM still builds CO lines. A draft CO reprices after every rate write
// (RenegotiateRate chains recalculateChangeOrderTotals via
// recomputeDraftCoId); onSaved refetches local state so the banner and
// values never sit stale (#114 posture). co_type itself is chosen at CO
// creation — no type switching here.

import { useCallback, useEffect, useState } from 'react';
import {
  InstrumentRate,
  InstrumentRateType,
  latestLiveEffectiveFrom,
  listInstrumentRatesClient,
  rateInForce,
} from '@/lib/services/instrument-rates-client';
import { RenegotiateRate } from '../../budget/renegotiate-rate';
import { color, font } from '@/lib/theme';

// Mirrors contract-section.tsx's RATE_FIELDS (S-3) — the two surfaces are
// deliberately independent, so the small map is restated here.
// A-9: cost-plus carries four independent rates — set each on its own; they
// are commonly all equal, but never auto-filled or linked. The legacy
// cost_plus_percent is read-only history and is not offered for entry.
const RATE_FIELDS: Record<
  'cost_plus' | 'time_and_materials',
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

const TYPE_CAPTIONS: Record<string, string> = {
  cost_plus: 'Cost plus',
  time_and_materials: 'Time & materials',
};

function fmtRate(rate: number, percent: boolean): string {
  return percent
    ? `${rate}%`
    : rate.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

// RULING A [S97, 2026-08-02]: a PM sees NO rate values anywhere — a cost-plus
// markup IS margin. The old `canEditRates` prop and its "read-only" branch are
// GONE rather than disabled: this component is now mounted only for Owner and
// Admin (co-builder.tsx), so a PM gets no rate panel at all instead of an empty
// or read-only one. §7.3 S-5 amended — see docs/specs/7d1-spec.md §S-5.
interface CoRateSectionProps {
  changeOrderId: string;
  coType: 'cost_plus' | 'time_and_materials';
  /** Draft COs reprice after a rate write; sent/signed COs do not. */
  isDraft: boolean;
  /** projects.source_estimate_id — a first rate of each type prefills from
   *  the source estimate's rate in force (S97 ruling: new COs default to
   *  the negotiated project rates). The CO still writes its OWN rate rows
   *  (P4 anchoring unchanged) and the prefill is editable. Null (project
   *  without an estimate) disables the prefill. */
  sourceEstimateId: string | null;
}

export function CoRateSection({
  changeOrderId,
  coType,
  isDraft,
  sourceEstimateId,
}: CoRateSectionProps) {
  const [rates, setRates] = useState<InstrumentRate[]>([]);
  const [estimateRates, setEstimateRates] = useState<InstrumentRate[]>([]);

  const refetch = useCallback(async () => {
    setRates(await listInstrumentRatesClient({ change_order_id: changeOrderId }));
  }, [changeOrderId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  useEffect(() => {
    if (!sourceEstimateId) return;
    listInstrumentRatesClient({ estimate_id: sourceEstimateId }).then(setEstimateRates);
  }, [sourceEstimateId]);

  const today = new Date().toISOString().slice(0, 10);
  const fields = RATE_FIELDS[coType];
  const missing = fields.filter((f) => rateInForce(rates, f.rateType, today) == null);

  // The source estimate's rate in force for a CO rate type. The labor rate
  // maps ACROSS contract types (both bill flat $/man-hour and the labor rate
  // is per job — 7d1 §6.1/§7), so a cost-plus CO on a T&M project still
  // defaults its labor rate; the percent markups prefill only from the same
  // rate type (T&M's single non-labor markup has no faithful mapping onto
  // cost-plus's three categories, and vice versa).
  function estimateDefaultFor(rateType: InstrumentRateType): number | null {
    if (estimateRates.length === 0) return null;
    const direct = rateInForce(estimateRates, rateType, today);
    if (direct != null) return direct;
    if (rateType === 'cost_plus_labor_hourly') {
      return rateInForce(estimateRates, 'tm_labor_hourly', today);
    }
    if (rateType === 'tm_labor_hourly') {
      return rateInForce(estimateRates, 'cost_plus_labor_hourly', today);
    }
    return null;
  }

  return (
    <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #e5e7eb' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.625rem', marginBottom: '0.375rem' }}>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>
          Contract rates
        </span>
        <span style={{ fontSize: '0.75rem', color: color.faint }}>
          {TYPE_CAPTIONS[coType]} — this change order&rsquo;s own rate{fields.length > 1 ? 's' : ''} (P4)
        </span>
      </div>

      {missing.length > 0 && (
        <p style={{ fontSize: '0.8125rem', color: color.warning, margin: '0 0 0.375rem' }}>
          No rate in force ({missing.map((f) => f.label).join(', ')}) — set{' '}
          {missing.length === 1 ? 'it' : 'them'} here; missing markup rates block this change
          order from pricing.
        </p>
      )}

      {fields.map((field) => {
        const current = rateInForce(rates, field.rateType, today);
        const floor = latestLiveEffectiveFrom(rates, field.rateType);
        // Prefill only a FIRST rate of the type (no live rows) — a
        // renegotiation starts from a blank field as before.
        const prefill = floor === null && current === null ? estimateDefaultFor(field.rateType) : null;
        return (
          <div
            key={field.rateType}
            style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.25rem 0', fontSize: '0.8125rem', flexWrap: 'wrap' }}
          >
            <span style={{ color: '#374151', fontWeight: 500, minWidth: '190px' }}>{field.label}</span>
            <span
              style={{
                fontFamily: font.mono,
                fontWeight: current != null ? 700 : 400,
                color: current != null ? color.navy : color.faint,
              }}
            >
              {current != null ? fmtRate(current, field.percent) : 'not set'}
            </span>
            <RenegotiateRate
              changeOrderId={changeOrderId}
              rateType={field.rateType}
              label={field.label}
              percent={field.percent}
              floor={floor}
              defaultRate={prefill}
              recomputeDraftCoId={isDraft ? changeOrderId : undefined}
              onSaved={() => void refetch()}
            />
            {prefill != null && (
              <span style={{ fontSize: '0.6875rem', color: color.faint }}>
                estimate rate {fmtRate(prefill, field.percent)} prefills
              </span>
            )}
          </div>
        );
      })}

      <p style={{ fontSize: '0.6875rem', color: color.faint, margin: '0.25rem 0 0' }}>
        Rates apply forward from their effective date; history and corrections live on the
        project&rsquo;s Budget &amp; Cost rate section.
      </p>
    </div>
  );
}
