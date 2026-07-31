'use client';

// Money representation §7.1 S-5 — CO instrument rates on the CO builder.
// A non-fixed CO carries its OWN negotiated rate(s) (P4 — no mixing, never
// inherited from the estimate instrument): cost-plus → markup %, T&M →
// labor $/man-hour + non-labor markup %. Rate rows land on
// instrument_rates.change_order_id via the shipped addInstrumentRate; the
// effective-date rules are the project renegotiate control's (floor =
// latest live rate + 1 day, no floor for a first rate, NO future cap — P5
// as amended 2026-07-31), reused via RenegotiateRate rather than restated.
// Roles per §7.3/S-5: Owner/Admin set rates; PM sees them read-only while
// still building CO lines. A draft CO reprices after every rate write
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

// Mirrors contract-section.tsx's RATE_FIELDS (S-3) — the estimate side is
// deliberately untouched, so the small map is restated here.
const RATE_FIELDS: Record<
  'cost_plus' | 'time_and_materials',
  { rateType: InstrumentRateType; label: string; percent: boolean }[]
> = {
  cost_plus: [{ rateType: 'cost_plus_percent', label: 'Markup rate %', percent: true }],
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

interface CoRateSectionProps {
  changeOrderId: string;
  coType: 'cost_plus' | 'time_and_materials';
  /** Owner/Admin only (§7.3 S-5); PM renders read-only. */
  canEditRates: boolean;
  /** Draft COs reprice after a rate write; sent/signed COs do not. */
  isDraft: boolean;
}

export function CoRateSection({ changeOrderId, coType, canEditRates, isDraft }: CoRateSectionProps) {
  const [rates, setRates] = useState<InstrumentRate[]>([]);

  const refetch = useCallback(async () => {
    setRates(await listInstrumentRatesClient({ change_order_id: changeOrderId }));
  }, [changeOrderId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const today = new Date().toISOString().slice(0, 10);
  const fields = RATE_FIELDS[coType];
  const missing = fields.filter((f) => rateInForce(rates, f.rateType, today) == null);

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
        <p style={{ fontSize: '0.8125rem', color: color.warningDeep, margin: '0 0 0.375rem' }}>
          No rate in force ({missing.map((f) => f.label).join(', ')}) — this change order cannot
          price until {missing.length === 1 ? 'it is' : 'they are'} set.
        </p>
      )}

      {fields.map((field) => {
        const current = rateInForce(rates, field.rateType, today);
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
            {canEditRates ? (
              <RenegotiateRate
                changeOrderId={changeOrderId}
                rateType={field.rateType}
                label={field.label}
                percent={field.percent}
                floor={latestLiveEffectiveFrom(rates, field.rateType)}
                recomputeDraftCoId={isDraft ? changeOrderId : undefined}
                onSaved={() => void refetch()}
              />
            ) : (
              <span style={{ fontSize: '0.75rem', color: color.faint }}>read-only</span>
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
