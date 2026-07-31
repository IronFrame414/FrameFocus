import { getChangeOrders } from '@/lib/services/change-orders';
import {
  listInstrumentRates,
  type InstrumentRate,
  type InstrumentRateType,
} from '@/lib/services/instrument-rates';
import type { ProjectWithContact } from '@/lib/services/projects';
import { cardStyle, color, font, microLabelStyle } from '@/lib/theme';

// Money representation §7.1 S-4 (as amended 2026-07-31) — READ-ONLY project
// rate section, stage 2 of the S-4 build: per-instrument groups (P4) with
// rate-in-force highlighted and full history below; superseded rows struck
// through with their reason and excluded from rate-in-force. No writes here
// — renegotiate/supersede are S-4 stages 3/4. Owner/Admin only (Financial
// Visibility Floor): the page mounts this inside its isOwnerAdmin gate, so
// it never renders or fetches for PM/Foreman/Crew.
//
// Groups: "Original Contract" via projects.source_estimate_id (skipped when
// NULL — a no-estimate project has no home for rates, spec S-4 open item),
// then one group per non-fixed CO that HAS rates (every CO is rateless
// until S-5 ships — an empty group per CO would be noise). A non-fixed
// original instrument with no live rate renders an explicit "no rate in
// force" state instead of hiding — that absence blocks pricing and the
// Owner should see it.

const RATE_TYPE_META: Record<InstrumentRateType, { label: string; percent: boolean }> = {
  cost_plus_percent: { label: 'Markup rate', percent: true },
  tm_labor_hourly: { label: 'Labor rate ($/man-hour)', percent: false },
  tm_nonlabor_percent: { label: 'Non-labor markup', percent: true },
};

const EXPECTED_TYPES: Record<'cost_plus' | 'time_and_materials', InstrumentRateType[]> = {
  cost_plus: ['cost_plus_percent'],
  time_and_materials: ['tm_labor_hourly', 'tm_nonlabor_percent'],
};

const TYPE_CAPTIONS: Record<string, string> = {
  cost_plus: 'Cost plus',
  time_and_materials: 'Time & materials',
};

interface InstrumentGroup {
  key: string;
  label: string;
  caption: string;
  contractType: 'cost_plus' | 'time_and_materials';
  rates: InstrumentRate[];
}

function fmtRate(rate: number, percent: boolean): string {
  return percent
    ? `${rate}%`
    : rate.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function fmtDate(value: string): string {
  return new Date(value + 'T00:00:00').toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** IDs of the rows in force: per rate_type, the non-superseded row with the
 *  greatest effective_from ≤ asOf (the rateInForce selection, but yielding
 *  the row so the history list can badge it). */
function inForceRowIds(rates: InstrumentRate[], asOf: string): Set<string> {
  const best = new Map<string, InstrumentRate>();
  for (const r of rates) {
    if (r.superseded_at !== null || r.effective_from > asOf) continue;
    const current = best.get(r.rate_type);
    if (!current || r.effective_from > current.effective_from) best.set(r.rate_type, r);
  }
  return new Set([...best.values()].map((r) => r.id));
}

interface RateSectionProps {
  project: Pick<ProjectWithContact, 'id' | 'project_type' | 'source_estimate_id'>;
}

export async function RateSection({ project }: RateSectionProps) {
  const groups: InstrumentGroup[] = [];

  if (project.project_type !== 'fixed_price' && project.source_estimate_id) {
    groups.push({
      key: 'original',
      label: 'Original Contract',
      caption: TYPE_CAPTIONS[project.project_type] ?? project.project_type,
      contractType: project.project_type,
      rates: await listInstrumentRates({ estimate_id: project.source_estimate_id }),
    });
  }

  const changeOrders = await getChangeOrders(project.id);
  const nonFixedCos = changeOrders.filter((co) => co.co_type !== 'fixed_price');
  const coRates = await Promise.all(
    nonFixedCos.map((co) => listInstrumentRates({ change_order_id: co.id }))
  );
  nonFixedCos.forEach((co, i) => {
    if (coRates[i].length === 0) return;
    groups.push({
      key: co.id,
      label: `${co.co_number}${co.title ? ` — ${co.title}` : ''}`,
      caption: TYPE_CAPTIONS[co.co_type] ?? co.co_type,
      contractType: co.co_type as 'cost_plus' | 'time_and_materials',
      rates: coRates[i],
    });
  });

  if (groups.length === 0) return null;

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div style={{ ...cardStyle, overflow: 'hidden', marginBottom: '18px', maxWidth: '640px' }}>
      <div
        style={{
          padding: '12px 20px',
          backgroundColor: color.tableHeadBg,
          borderBottom: `1px solid ${color.cardBorder}`,
        }}
      >
        <span style={microLabelStyle}>Contract rates</span>
      </div>

      {groups.map((group) => {
        const inForce = inForceRowIds(group.rates, today);
        const missing = EXPECTED_TYPES[group.contractType].filter(
          (t) => !group.rates.some((r) => inForce.has(r.id) && r.rate_type === t)
        );
        return (
          <div key={group.key} style={{ borderBottom: `1px solid ${color.rowDivider}` }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: '10px',
                padding: '12px 20px 4px',
              }}
            >
              <span style={{ fontFamily: font.sans, fontSize: '13px', fontWeight: 700, color: color.navy }}>
                {group.label}
              </span>
              <span style={{ fontSize: '11px', color: color.faint }}>{group.caption}</span>
            </div>

            {missing.length > 0 && (
              <p style={{ fontSize: '12px', color: color.warningDeep, margin: '4px 20px 6px' }}>
                No rate in force: {missing.map((t) => RATE_TYPE_META[t].label).join(', ')} — this
                instrument cannot price until set.
              </p>
            )}

            {group.rates.length > 0 && (
              <div style={{ padding: '4px 20px 12px' }}>
                {group.rates.map((rate) => {
                  const meta = RATE_TYPE_META[rate.rate_type];
                  const superseded = rate.superseded_at !== null;
                  const current = inForce.has(rate.id);
                  return (
                    <div
                      key={rate.id}
                      style={{
                        display: 'flex',
                        alignItems: 'baseline',
                        gap: '10px',
                        padding: '4px 0',
                        fontSize: '13px',
                      }}
                    >
                      <span
                        style={{
                          color: superseded ? color.faint : color.body,
                          textDecoration: superseded ? 'line-through' : 'none',
                          minWidth: '190px',
                        }}
                      >
                        {meta.label}
                      </span>
                      <span
                        style={{
                          fontFamily: font.mono,
                          fontWeight: current ? 700 : 400,
                          color: superseded ? color.faint : current ? color.navy : color.mutedAlt,
                          textDecoration: superseded ? 'line-through' : 'none',
                        }}
                      >
                        {fmtRate(rate.rate, meta.percent)}
                      </span>
                      <span
                        style={{
                          fontSize: '12px',
                          color: color.faint,
                          textDecoration: superseded ? 'line-through' : 'none',
                        }}
                      >
                        effective {fmtDate(rate.effective_from)}
                      </span>
                      {current && (
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            letterSpacing: '0.06em',
                            textTransform: 'uppercase',
                            color: color.success,
                            backgroundColor: '#e4f0e6',
                            borderRadius: '999px',
                            padding: '1px 8px',
                          }}
                        >
                          In force
                        </span>
                      )}
                      {superseded && (
                        <span style={{ fontSize: '12px', color: color.danger }}>
                          superseded{rate.superseded_reason ? `: ${rate.superseded_reason}` : ''}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      <p style={{ fontSize: '11px', color: color.faint, margin: 0, padding: '8px 20px 12px' }}>
        Cost and hours price at the rate in force when incurred. Rate changes (renegotiate,
        supersede) are managed here in a later build stage.
      </p>
    </div>
  );
}
