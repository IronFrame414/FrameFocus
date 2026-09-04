import { getChangeOrders } from '@/lib/services/change-orders';
import { createClient } from '@/lib/supabase-server';
import { companyToday } from '@framefocus/shared/utils/dates';
import {
  listInstrumentRates,
  type InstrumentRate,
  type InstrumentRateType,
} from '@/lib/services/instrument-rates';
import type { ProjectWithContact } from '@/lib/services/projects';
import { cardStyle, color, font, microLabelStyle } from '@/lib/theme';
import { RenegotiateRate } from './renegotiate-rate';
import { CorrectRates, type RateHistoryRow } from './correct-rates';

// Money representation §7.1 S-4 (as amended 2026-07-31) — project rate
// section, stages 2+3 of the S-4 build: per-instrument groups (P4) with
// rate-in-force highlighted, full history below (superseded rows struck
// through with their reason and excluded from rate-in-force), and the
// stage-3 "Renegotiate rate" action per instrument+type (renegotiate-rate.tsx
// — Owner AND Admin per §7.3) and the "Correct rates" EDIT MODE over each
// group's history list (correct-rates.tsx — OWNER only via canSupersede;
// S95 third ruling, replaces the per-row Supersede buttons). Owner/Admin
// only (Financial Visibility Floor): the page mounts this inside its
// isOwnerAdmin gate, so it never renders or fetches for PM/Foreman/Crew.
//
// Groups: "Original Contract" via projects.source_estimate_id (skipped when
// NULL — a no-estimate project has no home for rates, spec S-4 open item),
// then one group per non-fixed CO that HAS rates (every CO is rateless
// until S-5 ships — an empty group per CO would be noise). A non-fixed
// original instrument with no live rate renders an explicit "no rate in
// force" state instead of hiding — that absence blocks pricing and the
// Owner should see it.

// Exported for the Overview rate-in-force summary (rate-summary.tsx) — one
// definition of labels/formatting for every project rate surface.
// cost_plus_percent is the LEGACY pre-A-9 single markup: it renders in
// history (labeled so a reader knows why it no longer prices) but is never
// expected, never offered for entry, and pricing ignores it.
export const RATE_TYPE_META: Record<InstrumentRateType, { label: string; percent: boolean }> = {
  cost_plus_percent: { label: 'Markup rate (legacy single markup)', percent: true },
  cost_plus_labor_hourly: { label: 'Labor rate ($/man-hour)', percent: false },
  cost_plus_material_percent: { label: 'Material markup', percent: true },
  cost_plus_subcontractor_percent: { label: 'Subcontractor markup', percent: true },
  cost_plus_other_percent: { label: 'Other markup', percent: true },
  tm_labor_hourly: { label: 'Labor rate ($/man-hour)', percent: false },
  tm_nonlabor_percent: { label: 'Non-labor markup', percent: true },
};

// A-9: a cost-plus instrument carries four independent rates. Set each on
// its own — commonly all equal, never auto-filled or linked.
export const EXPECTED_TYPES: Record<'cost_plus' | 'time_and_materials', InstrumentRateType[]> = {
  cost_plus: [
    'cost_plus_labor_hourly',
    'cost_plus_material_percent',
    'cost_plus_subcontractor_percent',
    'cost_plus_other_percent',
  ],
  time_and_materials: ['tm_labor_hourly', 'tm_nonlabor_percent'],
};

export const TYPE_CAPTIONS: Record<string, string> = {
  cost_plus: 'Cost plus',
  time_and_materials: 'Time & materials',
};

interface InstrumentGroup {
  key: string;
  label: string;
  caption: string;
  contractType: 'cost_plus' | 'time_and_materials';
  rates: InstrumentRate[];
  /** The instrument the renegotiate action writes against. */
  estimateId?: string;
  changeOrderId?: string;
  /** Set only for DRAFT COs — their totals reprice after a rate write; the
   *  estimate instrument never recomputes here (§7.1 S-4 recompute rules —
   *  ⚠️ whose stated reason was FALSE until S175: the "RLS-match zero rows"
   *  claim held only for a PM. The rule stands; since 20261031000000 the call
   *  raises on a sent estimate instead of silently half-succeeding). */
  draftCoId?: string;
}

export function fmtRate(rate: number, percent: boolean): string {
  return percent
    ? `${rate}%`
    : rate.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

/** Latest live (non-superseded) effective_from for a type, or null when the
 *  next rate would be the instrument's first of that type (free backdate —
 *  P5 signing-date rule). The renegotiate date floor derives from this. */
function latestLiveDate(rates: InstrumentRate[], rateType: InstrumentRateType): string | null {
  let latest: string | null = null;
  for (const r of rates) {
    if (r.rate_type !== rateType || r.superseded_at !== null) continue;
    if (!latest || r.effective_from > latest) latest = r.effective_from;
  }
  return latest;
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
  /** OWNER only (§7.3 — deliberately narrower than the section's
   *  Owner/Admin visibility): shows the "Correct rates" edit-mode control.
   *  The RPC re-checks Owner inside — this prop is display, not security. */
  canSupersede: boolean;
}

export async function RateSection({ project, canSupersede }: RateSectionProps) {
  const groups: InstrumentGroup[] = [];

  if (project.project_type !== 'fixed_price' && project.source_estimate_id) {
    groups.push({
      key: 'original',
      label: 'Original Contract',
      caption: TYPE_CAPTIONS[project.project_type] ?? project.project_type,
      contractType: project.project_type,
      rates: await listInstrumentRates({ estimate_id: project.source_estimate_id }),
      estimateId: project.source_estimate_id,
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
      changeOrderId: co.id,
      draftCoId: co.status === 'draft' ? co.id : undefined,
    });
  });

  if (groups.length === 0) return null;

  // #116 [S103]: the COMPANY day for rate-in-force display, not the UTC day.
  const supabase = await createClient();
  const { data: coTz } = await supabase.from('companies').select('timezone').maybeSingle();
  const today = companyToday(coTz?.timezone ?? 'America/New_York');

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
              <p style={{ fontSize: '12px', color: color.warning, margin: '4px 20px 6px' }}>
                No rate in force: {missing.map((t) => RATE_TYPE_META[t].label).join(', ')} — this
                instrument cannot price until set.
              </p>
            )}

            {/* Stage 3 — renegotiate per rate type. Floor = latest live rate
                + 1 day (client mirrors it; the DB guard is the authority). */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '2px 20px 6px' }}>
              {EXPECTED_TYPES[group.contractType].map((rateType) => (
                <div
                  key={rateType}
                  style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px' }}
                >
                  <span style={{ color: color.mutedAlt, minWidth: '190px' }}>
                    {RATE_TYPE_META[rateType].label}
                  </span>
                  <RenegotiateRate
                    estimateId={group.estimateId}
                    changeOrderId={group.changeOrderId}
                    rateType={rateType}
                    label={RATE_TYPE_META[rateType].label}
                    percent={RATE_TYPE_META[rateType].percent}
                    floor={latestLiveDate(group.rates, rateType)}
                    recomputeDraftCoId={group.draftCoId}
                  />
                </div>
              ))}
            </div>

            {group.rates.length > 0 && (
              // History + the Owner-only "Correct rates" edit mode. Rows are
              // computed HERE (server) and passed as serializable props — a
              // client file must never import from this module (S93 bundle
              // rule). P5: a future-dated rate is live but dormant — never
              // in force before its date.
              <CorrectRates
                canSupersede={canSupersede}
                recomputeDraftCoId={group.draftCoId}
                rows={group.rates.map((rate): RateHistoryRow => {
                  const superseded = rate.superseded_at !== null;
                  return {
                    id: rate.id,
                    label: RATE_TYPE_META[rate.rate_type].label,
                    percent: RATE_TYPE_META[rate.rate_type].percent,
                    rate: rate.rate,
                    effectiveFrom: rate.effective_from,
                    superseded,
                    supersededReason: rate.superseded_reason,
                    inForce: inForce.has(rate.id),
                    pending: !superseded && rate.effective_from > today,
                  };
                })}
              />
            )}
          </div>
        );
      })}

      <p style={{ fontSize: '11px', color: color.faint, margin: 0, padding: '8px 20px 12px' }}>
        Cost and hours price at the rate in force when incurred. Renegotiated rates apply
        forward from their effective date and never before the latest existing rate; a
        future-dated rate sits pending until its date arrives. &ldquo;Correct rates&rdquo;
        (Owner only) edits any live rate&rsquo;s amount or date — the original stays listed,
        struck through with its reason.
      </p>
    </div>
  );
}
