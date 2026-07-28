import { createClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { getBudgetRollup } from '@/lib/services/budget';
import { getRevisedContract } from '@/lib/services/contract-value';
import { cardStyle, color, font, microLabelStyle } from '@/lib/theme';

/**
 * ui-05 — 1a Budget tab. Grouped by cost_code with a section-subtotal row per
 * group + a grand-total row (locked round 2; row_type is a cost-category tag,
 * NOT the grouping key). Committed/Actual/Variance render em-dash until the
 * Module 7A ledger populates them — a raw 0 must not render as $0.
 *
 * Financial floor (ui-01 §11): Owner/Admin see the 5-card summary and the
 * 6-column table; PM/Foreman/Crew see actual cost only — the Cost to Date
 * card and a 3-column Code · Description · Actual table (REFLOW rule).
 */

function money(value: number): string {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

/** Em-dash for the unpopulated-until-7A columns (0 reads as unpopulated). */
function moneyOrDash(value: number | null | undefined): string {
  if (!value) return '—';
  return money(value);
}

export default async function ProjectBudgetPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .eq('is_deleted', false)
    .single();
  if (!profile) redirect('/dashboard');

  const canSeeFinancials = profile.role === 'owner' || profile.role === 'admin';

  const [rollup, contract] = await Promise.all([
    getBudgetRollup(params.id),
    getRevisedContract(params.id),
  ]);

  // 7B: the single legal derivation (contract-value.ts). Null original =>
  // null revised => em-dash (Q2 — the old signedCoTotal fallback is gone).
  const contractValue = contract.original;
  const signedCoTotal = contract.signedDelta;
  const revised = contract.revised;

  // Summary cards — financial floor reflow: gated roles get Cost to Date only.
  const summaryCards: {
    label: string;
    value: string;
    valueColor: string;
    inverted?: boolean;
  }[] = canSeeFinancials
    ? [
        {
          label: 'Original',
          value: contractValue !== null ? money(contractValue) : '—',
          valueColor: contractValue !== null ? color.navy : color.faint,
        },
        {
          label: 'Signed COs',
          value:
            signedCoTotal !== 0 ? `${signedCoTotal > 0 ? '+' : ''}${money(signedCoTotal)}` : '—',
          valueColor: signedCoTotal !== 0 ? color.warning : color.faint,
        },
        {
          label: 'Revised',
          value: revised !== null ? money(revised) : '—',
          valueColor: '#fff',
          inverted: true,
        },
        { label: 'Cost to Date', value: '—', valueColor: color.faint },
        { label: 'Projected Margin', value: '—', valueColor: color.faint },
      ]
    : [{ label: 'Cost to Date', value: '—', valueColor: color.faint }];

  // Table grid — 6 columns for Owner/Admin, 3 for gated roles (reflow).
  const gridTemplate = canSeeFinancials
    ? '0.7fr 2fr 1.1fr 1.1fr 1.1fr 1.1fr'
    : '0.7fr 3fr 1.1fr';

  const moneyCell: React.CSSProperties = {
    fontFamily: font.mono,
    fontSize: '13px',
    fontWeight: 500,
    color: color.navy,
    textAlign: 'right',
  };
  const dashCell: React.CSSProperties = { ...moneyCell, color: color.faint };

  return (
    <div>
      {/* Summary row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${summaryCards.length}, 1fr)`,
          gap: '12px',
          marginBottom: '18px',
          maxWidth: canSeeFinancials ? undefined : '260px',
        }}
      >
        {summaryCards.map((card) => (
          <div
            key={card.label}
            style={{
              ...cardStyle,
              padding: '14px 15px',
              backgroundColor: card.inverted ? color.navy : color.cardBg,
              border: card.inverted ? `1px solid ${color.navy}` : cardStyle.border,
            }}
          >
            <div
              style={{
                ...microLabelStyle,
                fontSize: '10.5px',
                color: card.inverted ? color.navySecondary : color.mutedAlt,
              }}
            >
              {card.label}
            </div>
            <div
              style={{
                fontFamily: font.mono,
                fontSize: '20px',
                fontWeight: 600,
                color: card.valueColor,
                marginTop: '4px',
              }}
            >
              {card.value}
            </div>
          </div>
        ))}
      </div>

      {canSeeFinancials && (
        <p style={{ fontSize: '13px', color: color.muted, margin: '0 0 14px' }}>
          Cost baseline from the estimate (pre-markup, pre-tax) — the budget total sits below the
          revised contract by the markup. Committed and Actual fill in with Module 7.
        </p>
      )}

      {/* Budget table */}
      {rollup.groups.length === 0 ? (
        <div style={{ ...cardStyle, padding: '48px', textAlign: 'center', color: color.muted }}>
          No budget items. The baseline is created when an estimate is converted to this project.
        </div>
      ) : (
        <div style={{ ...cardStyle, overflow: 'hidden' }}>
          {/* Header */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: gridTemplate,
              gap: '12px',
              padding: '12px 20px',
              backgroundColor: color.tableHeadBg,
              borderBottom: `1px solid ${color.neutralBadgeBg}`,
            }}
          >
            <span style={microLabelStyle}>Code</span>
            <span style={microLabelStyle}>Description</span>
            {canSeeFinancials && (
              <span style={{ ...microLabelStyle, textAlign: 'right' }}>Budget</span>
            )}
            {canSeeFinancials && (
              <span style={{ ...microLabelStyle, textAlign: 'right' }}>Committed</span>
            )}
            <span style={{ ...microLabelStyle, textAlign: 'right' }}>Actual</span>
            {canSeeFinancials && (
              <span style={{ ...microLabelStyle, textAlign: 'right' }}>Variance</span>
            )}
          </div>

          {rollup.groups.map((group) => (
            <div key={group.cost_code}>
              {group.items.map((item) => {
                const variance =
                  item.actual_amount && item.actual_amount !== 0
                    ? (item.budgeted_amount ?? 0) - item.actual_amount
                    : null;
                return (
                  <div
                    key={item.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: gridTemplate,
                      gap: '12px',
                      alignItems: 'center',
                      padding: '13px 20px',
                      borderBottom: `1px solid ${color.rowDivider}`,
                    }}
                  >
                    <span style={{ fontFamily: font.mono, fontSize: '13px', color: color.faint }}>
                      {item.cost_code ?? '—'}
                    </span>
                    <span style={{ fontFamily: font.sans, fontSize: '13px', fontWeight: 600, color: color.navy }}>
                      {item.description}
                      {item.row_type && (
                        <span style={{ color: color.faint, fontWeight: 400, fontSize: '12px' }}>
                          {' '}
                          · {item.row_type}
                        </span>
                      )}
                    </span>
                    {canSeeFinancials && (
                      <span style={moneyCell}>{money(item.budgeted_amount ?? 0)}</span>
                    )}
                    {canSeeFinancials && (
                      <span style={dashCell}>{moneyOrDash(item.committed_amount)}</span>
                    )}
                    <span style={item.actual_amount ? moneyCell : dashCell}>
                      {moneyOrDash(item.actual_amount)}
                    </span>
                    {canSeeFinancials && (
                      <span
                        style={{
                          ...moneyCell,
                          color:
                            variance === null
                              ? color.faint
                              : variance >= 0
                                ? color.success
                                : color.danger,
                        }}
                      >
                        {variance === null
                          ? '—'
                          : `${variance >= 0 ? '+' : '−'}${money(Math.abs(variance))}`}
                      </span>
                    )}
                  </div>
                );
              })}

              {/* Section subtotal (one per cost_code group, ui-05 §S4) */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: gridTemplate,
                  gap: '12px',
                  alignItems: 'center',
                  padding: '12px 20px',
                  backgroundColor: color.tableHeadBg,
                  borderBottom: `1px solid ${color.rowDivider}`,
                }}
              >
                <span
                  style={{
                    gridColumn: '1 / span 2',
                    fontFamily: font.sans,
                    fontSize: '13px',
                    fontWeight: 600,
                    color: color.body,
                  }}
                >
                  {group.cost_code}
                </span>
                {canSeeFinancials && (
                  <span style={{ ...moneyCell, fontWeight: 600, color: color.body }}>
                    {money(group.budgeted)}
                  </span>
                )}
                {canSeeFinancials && (
                  <span style={dashCell}>{moneyOrDash(group.committed)}</span>
                )}
                <span style={group.actual ? { ...moneyCell, fontWeight: 600 } : dashCell}>
                  {moneyOrDash(group.actual)}
                </span>
                {canSeeFinancials && (
                  <span style={dashCell}>
                    {group.actual ? money(group.budgeted - group.actual) : '—'}
                  </span>
                )}
              </div>
            </div>
          ))}

          {/* Grand total */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: gridTemplate,
              gap: '12px',
              alignItems: 'center',
              padding: '14px 20px',
              backgroundColor: color.tableHeadBg,
            }}
          >
            <span
              style={{
                gridColumn: '1 / span 2',
                fontFamily: font.sans,
                fontSize: '14px',
                fontWeight: 700,
                color: color.navy,
              }}
            >
              Total
            </span>
            {canSeeFinancials && (
              <span style={{ ...moneyCell, fontSize: '14px', fontWeight: 700 }}>
                {money(rollup.totalBudgeted)}
              </span>
            )}
            {canSeeFinancials && (
              <span style={{ ...dashCell, fontSize: '14px', fontWeight: 700 }}>
                {moneyOrDash(rollup.totalCommitted)}
              </span>
            )}
            <span
              style={
                rollup.totalActual
                  ? { ...moneyCell, fontSize: '14px', fontWeight: 700 }
                  : { ...dashCell, fontSize: '14px', fontWeight: 700 }
              }
            >
              {moneyOrDash(rollup.totalActual)}
            </span>
            {canSeeFinancials && (
              <span style={{ ...dashCell, fontSize: '14px', fontWeight: 700 }}>
                {rollup.totalActual ? money(rollup.totalBudgeted - rollup.totalActual) : '—'}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
