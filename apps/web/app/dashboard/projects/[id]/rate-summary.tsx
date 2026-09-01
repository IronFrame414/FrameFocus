import {
  listInstrumentRates,
  rateInForce,
} from '@/lib/services/instrument-rates';
import type { ChangeOrderWithAuthor } from '@/lib/services/change-orders';
import type { ProjectWithContact } from '@/lib/services/projects';
import { cardStyle, color, font, microLabelStyle } from '@/lib/theme';
import Link from 'next/link';
import {
  EXPECTED_TYPES,
  RATE_TYPE_META,
  TYPE_CAPTIONS,
  fmtRate,
} from './budget/rate-section';

// Money representation §7.1 S-4 (amended 2026-07-31) — the READ-ONLY
// rate-in-force summary on the project Overview: current rate(s) in force
// today per instrument, nothing else — no history, no editing (both live on
// the Budget & Cost rate section). Owner/Admin only (Financial Visibility
// Floor): the page mounts this inside its canSeeFinancials gate. A
// future-dated rate is dormant (P5) and does not appear here until its
// date arrives. Renders nothing for fixed-price-only projects; a non-fixed
// instrument with nothing in force shows an explicit warning — that
// absence blocks pricing.

interface RateSummaryProps {
  project: Pick<ProjectWithContact, 'id' | 'project_type' | 'source_estimate_id'>;
  /** Already fetched by the Overview page — not re-queried here. */
  changeOrders: Pick<ChangeOrderWithAuthor, 'id' | 'co_number' | 'title' | 'co_type'>[];
}

export async function RateSummary({ project, changeOrders }: RateSummaryProps) {
  const today = new Date().toISOString().slice(0, 10);

  const instruments: {
    key: string;
    label: string;
    caption: string;
    lines: { label: string; value: string | null }[];
  }[] = [];

  if (project.project_type !== 'fixed_price' && project.source_estimate_id) {
    const rates = await listInstrumentRates({ estimate_id: project.source_estimate_id });
    instruments.push({
      key: 'original',
      label: 'Original Contract',
      caption: TYPE_CAPTIONS[project.project_type] ?? project.project_type,
      lines: EXPECTED_TYPES[project.project_type].map((t) => {
        const rate = rateInForce(rates, t, today);
        return {
          label: RATE_TYPE_META[t].label,
          value: rate === null ? null : fmtRate(rate, RATE_TYPE_META[t].percent),
        };
      }),
    });
  }

  const nonFixedCos = changeOrders.filter((co) => co.co_type !== 'fixed_price');
  const coRates = await Promise.all(
    nonFixedCos.map((co) => listInstrumentRates({ change_order_id: co.id }))
  );
  nonFixedCos.forEach((co, i) => {
    if (coRates[i].length === 0) return; // rateless COs stay silent (S-5 owns their first rates)
    instruments.push({
      key: co.id,
      label: `${co.co_number}${co.title ? ` — ${co.title}` : ''}`,
      caption: TYPE_CAPTIONS[co.co_type] ?? co.co_type,
      lines: EXPECTED_TYPES[co.co_type as 'cost_plus' | 'time_and_materials'].map((t) => {
        const rate = rateInForce(coRates[i], t, today);
        return {
          label: RATE_TYPE_META[t].label,
          value: rate === null ? null : fmtRate(rate, RATE_TYPE_META[t].percent),
        };
      }),
    });
  });

  if (instruments.length === 0) return null;

  return (
    <div style={{ ...cardStyle, padding: '14px 16px', marginBottom: '18px', maxWidth: '640px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={microLabelStyle}>Contract rates (in force)</span>
        <Link
          href={`/dashboard/projects/${project.id}/budget`}
          style={{ fontSize: '11px', fontWeight: 600, color: color.primary, textDecoration: 'none' }}
        >
          Manage on Budget &amp; Cost
        </Link>
      </div>
      {instruments.map((inst) => (
        <div key={inst.key} style={{ marginTop: '8px' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: color.navy }}>{inst.label}</span>
          <span style={{ fontSize: '11px', color: color.faint }}> {inst.caption}</span>
          <div style={{ display: 'flex', gap: '22px', flexWrap: 'wrap', marginTop: '2px' }}>
            {inst.lines.map((line) => (
              <span key={line.label} style={{ fontSize: '12px', color: color.body }}>
                {line.label}:{' '}
                {line.value === null ? (
                  <span style={{ color: color.warning, fontWeight: 600 }}>
                    no rate in force
                  </span>
                ) : (
                  <span style={{ fontFamily: font.mono, fontWeight: 600, color: color.navy }}>
                    {line.value}
                  </span>
                )}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
