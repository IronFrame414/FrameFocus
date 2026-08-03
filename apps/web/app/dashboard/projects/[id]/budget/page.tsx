import Link from 'next/link';
import { createClient } from '@/lib/supabase-server';
import { notFound, redirect } from 'next/navigation';
import { getProject } from '@/lib/services/projects';
import { getBudgetRollup, type InstrumentGroup } from '@/lib/services/budget';
import { getProjectIncome } from '@/lib/services/project-income';
import { getDepositCredits } from '@/lib/services/deposit-credit';
import { getChangeOrderBilling, getContractBilling, getRevisedContract } from '@/lib/services/contract-value';
import { budgetColumnsFor } from '@/lib/services/invoices-shared';
import { getExpenses, getJobCostRollup } from '@/lib/services/expenses';
import { getPayablesSummary } from '@/lib/services/payables';
import { getMembers } from '@/lib/services/members';
import {
  EXPENSE_CATEGORY_LABELS,
  ExpenseStatusChip,
  fmtMoney,
} from '@/components/expenses/expense-ui';
import { ApplyCoBudgetButton } from './apply-co-budget-button';
import { RateSection } from './rate-section';
import { cardStyle, color, font, h2Style, microLabelStyle, primaryButtonStyle } from '@/lib/theme';

/**
 * Money representation §7.1 S-1 — the merged "Budget & Cost" screen
 * (replaces the separate Budget and Job Cost tabs, spec A-5). Budget table
 * grouped by INSTRUMENT (Original Contract / one group per signed CO,
 * visually distinct / Ad-hoc & Miscellaneous), then cost_code. The committed
 * column DISPLAYS remaining (gross − paid, derived); Cost to Date = actual +
 * remaining committed. Per-line totals EXCLUDE retainage (line-less in v1 —
 * S93 Q3); job-level payables carry it.
 *
 * Roles (floor per §5.4 — UI-gated until FINANCIAL-RLS-FLOOR): Owner/Admin
 * everything; PM committed (remaining) + actual + cost to date, no
 * budgeted/variance; Foreman actual only; Crew no entry (redirect).
 * Cost-plus/T&M projects: the contract card reads "Projected value
 * (non-binding)", NULL renders —, and no margin/variance-vs-contract figure
 * is computed from it anywhere (P11).
 */

function money(value: number): string {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function moneyOrDash(value: number | null | undefined): string {
  if (!value) return '—';
  return money(value);
}

const thStyle: React.CSSProperties = {
  ...microLabelStyle,
  textAlign: 'left',
  padding: '10px 14px',
  backgroundColor: color.tableHeadBg,
  borderBottom: `1px solid ${color.cardBorder}`,
};

const tdStyle: React.CSSProperties = {
  padding: '10px 14px',
  fontSize: '13px',
  color: color.body,
  borderBottom: `1px solid ${color.rowDivider}`,
};

const moneyTd: React.CSSProperties = {
  ...tdStyle,
  fontFamily: font.mono,
  textAlign: 'right',
  whiteSpace: 'nowrap',
};

function instrumentLabel(group: InstrumentGroup): string {
  if (group.kind === 'original') return 'Original Contract';
  if (group.kind === 'adhoc') return 'Ad-hoc & Miscellaneous';
  return `${group.changeOrder?.co_number ?? 'CO'}${group.changeOrder?.title ? ` — ${group.changeOrder.title}` : ''}`;
}

export default async function BudgetAndCostPage({ params }: { params: { id: string } }) {
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
  const role = profile?.role ?? '';

  // Crew has no money screen (7A Q3) — own expense rows live on /dashboard/expenses.
  if (!['owner', 'admin', 'project_manager', 'foreman'].includes(role)) {
    redirect(`/dashboard/projects/${params.id}`);
  }
  const isOwnerAdmin = role === 'owner' || role === 'admin';
  const seesCommitted = isOwnerAdmin || role === 'project_manager'; // A-3 widened floor
  const seesPayables = seesCommitted;

  const project = await getProject(params.id);
  if (!project) notFound();

  // P11: fixed-price contract value is binding; cost-plus/T&M carry an
  // OPTIONAL user-entered projection — display-only, never margin/variance.
  const isFixed = project.project_type === 'fixed_price';

  const [rollup, contract, jobCost, expenses, payables] = await Promise.all([
    getBudgetRollup(params.id),
    isOwnerAdmin ? getRevisedContract(params.id) : Promise.resolve(null),
    getJobCostRollup(params.id),
    getExpenses({ project_id: params.id }),
    seesPayables ? getPayablesSummary(params.id) : Promise.resolve(null),
  ]);

  // §2 [S97] — standalone invoice lines as INCOME. Owner/Admin only: this is a
  // SELL figure ABOUT THE JOB, so it sits with contract value and budget under
  // the Financial Visibility Floor. §12a's carve-out lets a PM see amounts ON
  // an invoice they can reach; it does not extend to a job-level roll-up.
  const income = isOwnerAdmin ? await getProjectIncome(params.id) : null;

  // §3 / acceptance #4 [S97] — what is left to invoice on the ORIGINAL
  // contract, with a sent deposit already deducted. Fully DERIVED (see
  // getContractBilling): void or refund the deposit and this figure returns on
  // its own, because nothing was ever copied. Fixed-price only — a cost-plus or
  // T&M deposit is §3a's credit balance and is deliberately not shown here.
  const contractBilling = isOwnerAdmin && isFixed ? await getContractBilling(params.id) : null;

  // §3a [S97] — the DEPOSIT CREDIT BALANCE, so a cost-plus/T&M job reads as
  // consistently as a fixed-price one: fixed-price shows what is left to bill,
  // a derived instrument shows the undrawn credit that will settle its
  // invoices. Same derivation the invoice builder uses (loadDepositCredits) —
  // there is one definition of what a deposit credit is worth.
  //
  // NOT gated on project_type: §3a's balance belongs to the JOB, and a
  // fixed-price project may carry a cost-plus CO (P4). The derivation itself
  // excludes any deposit billed against the ORIGINATING ESTIMATE, because that
  // one is §3's mechanism and already reduces remaining-to-bill — so the two
  // tiles can never describe the same money.
  // §4 [S97] — what is left to bill on the CHANGE ORDERS. The screen showed
  // what the COs are worth and what remains on the contract, and omitted the
  // figure connecting them. Only FIXED-PRICE POSITIVE COs have a remaining;
  // derived COs are billed as incurred and negative COs are credits, so
  // neither gets a number. NOT gated on the project's own type — a fixed-price
  // job can carry a cost-plus CO and vice versa (P4).
  const coBilling = isOwnerAdmin ? await getChangeOrderBilling(params.id) : null;

  const depositCredits = isOwnerAdmin ? await getDepositCredits(params.id) : [];
  const undrawnDeposit = Math.round(
    depositCredits.reduce((sum, d) => sum + d.remaining, 0) * 100
  ) / 100;
  const members = isOwnerAdmin ? await getMembers() : [];
  const memberNames: Record<string, string> = Object.fromEntries(
    members.map((m) => [m.id, m.display_name])
  );

  const showLabor = isOwnerAdmin && jobCost.labor.available;
  const laborCost = showLabor ? jobCost.labor.totalCost : 0;
  // Cost to Date (§4.5) = per-line actual + remaining committed, plus derived
  // labor for Owner/Admin. Retainage rides the payables numbers only (Q3).
  const costToDate = rollup.costToDate + laborCost;

  const revised = contract?.revised ?? null;
  const projectedMargin = isFixed && revised !== null ? revised - costToDate : null;

  // Columns per role (§7.1): Owner/Admin 7, PM 5, Foreman 3. The RULE lives in
  // budgetColumnsFor() (invoices-shared) so it can be asserted — it sat
  // "verified by reading the mount" until S97 precisely because it was inline
  // in a server component, which no harness can render.
  const columnPlan = budgetColumnsFor(role);
  void columnPlan;
  const gridTemplate = isOwnerAdmin
    ? '0.6fr 1.9fr 1fr 1fr 1fr 1fr 1fr'
    : seesCommitted
      ? '0.6fr 2.4fr 1fr 1fr 1fr'
      : '0.7fr 3fr 1.1fr';

  const moneyCell: React.CSSProperties = {
    fontFamily: font.mono,
    fontSize: '13px',
    fontWeight: 500,
    color: color.navy,
    textAlign: 'right',
  };
  const dashCell: React.CSSProperties = { ...moneyCell, color: color.faint };

  const summaryCards: { label: string; value: string; valueColor: string; inverted?: boolean; caption?: string }[] =
    isOwnerAdmin
      ? [
          {
            label: isFixed ? 'Original' : 'Projected value (non-binding)',
            value: contract?.original != null ? money(contract.original) : '—',
            valueColor: contract?.original != null ? color.navy : color.faint,
            caption: isFixed ? undefined : 'a projection, not an obligation',
          },
          {
            label: 'Signed COs',
            value:
              contract && contract.signedDelta !== 0
                ? `${contract.signedDelta > 0 ? '+' : ''}${money(contract.signedDelta)}`
                : '—',
            valueColor: contract && contract.signedDelta !== 0 ? color.warning : color.faint,
          },
          ...(isFixed
            ? [
                {
                  label: 'Revised',
                  value: revised !== null ? money(revised) : '—',
                  valueColor: '#fff',
                  inverted: true,
                },
              ]
            : []),
          ...(contractBilling && contractBilling.remainingToBill !== null
            ? [
                {
                  // [S97] SCOPED. It read as the JOB's remaining while showing
                  // only the ORIGINAL CONTRACT's — on a job with $298,897.26 of
                  // signed COs that understated by exactly the CO book.
                  label: 'Remaining on original contract',
                  value: money(contractBilling.remainingToBill),
                  valueColor:
                    contractBilling.remainingToBill < 0 ? color.warningDeep : color.navy,
                  caption:
                    contractBilling.depositRefunded > 0
                      ? `original less ${money(contractBilling.issuedAgainstContract)} billed, plus ${money(contractBilling.depositRefunded)} refunded`
                      : contractBilling.issuedAgainstContract > 0
                        ? `original less ${money(contractBilling.issuedAgainstContract)} already invoiced`
                        : 'nothing invoiced against the contract yet',
                },
              ]
            : []),
          // §4 [S97] — the CO figure that was missing beside "Remaining on
          // original contract". The VALUE covers fixed-price positive COs only,
          // and the caption names every kind NOT in it, so the reader never has
          // to guess the scope. An em-dash rather than $0 when there is nothing
          // countable but COs exist — a zero would read as "all billed".
          ...(coBilling && coBilling.orders.length > 0
            ? [
                {
                  label: 'Remaining on change orders',
                  value: coBilling.fixedCount > 0 ? money(coBilling.fixedRemaining) : '—',
                  valueColor:
                    coBilling.fixedCount === 0
                      ? color.faint
                      : coBilling.fixedRemaining < 0
                        ? color.warningDeep
                        : color.navy,
                  caption: [
                    coBilling.fixedCount > 0
                      ? `${coBilling.fixedCount} fixed-price CO${coBilling.fixedCount === 1 ? '' : 's'}`
                      : 'no fixed-price COs',
                    coBilling.asIncurredCount > 0
                      ? `${coBilling.asIncurredCount} billed as incurred (no fixed amount)`
                      : null,
                    coBilling.creditCount > 0
                      ? `${coBilling.creditCount} credit CO${coBilling.creditCount === 1 ? '' : 's'} excluded`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · '),
                },
              ]
            : []),
          ...(undrawnDeposit > 0
            ? [
                {
                  label: 'Deposit credit (undrawn)',
                  value: money(undrawnDeposit),
                  valueColor: color.navy,
                  caption:
                    depositCredits.length === 1
                      ? 'held on the job; applied to invoices until exhausted (§3a)'
                      : `${depositCredits.filter((d) => d.remaining > 0).length} deposits, applied to invoices until exhausted (§3a)`,
                },
              ]
            : []),
          {
            label: 'Cost to Date',
            value: costToDate ? money(costToDate) : '—',
            valueColor: costToDate ? color.navy : color.faint,
            caption: showLabor ? 'actual + remaining committed + labor' : 'actual + remaining committed',
          },
          // P11: no margin figure on cost-plus/T&M — the projection must not
          // feed variance or over/under.
          ...(isFixed
            ? [
                {
                  label: 'Projected Margin',
                  value: projectedMargin !== null ? money(projectedMargin) : '—',
                  valueColor:
                    projectedMargin === null
                      ? color.faint
                      : projectedMargin >= 0
                        ? color.success
                        : color.danger,
                },
              ]
            : []),
        ]
      : seesCommitted
        ? [
            {
              label: 'Cost to Date',
              value: rollup.costToDate ? money(rollup.costToDate) : '—',
              valueColor: rollup.costToDate ? color.navy : color.faint,
              caption: 'actual + remaining committed',
            },
          ]
        : [
            {
              label: 'Cost to Date',
              value: rollup.totalActual ? money(rollup.totalActual) : '—',
              valueColor: rollup.totalActual ? color.navy : color.faint,
            },
          ];

  const lineCost = (actual: number | null, remaining: number) => (actual ?? 0) + remaining;

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '16px',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h2 style={{ ...h2Style, fontSize: '19px' }}>Budget &amp; cost</h2>
          <p style={{ color: color.muted, fontSize: '13px', margin: '4px 0 0' }}>
            {isOwnerAdmin
              ? 'Cost baseline by instrument (estimate + signed change orders), committed remaining, and actuals — one screen.'
              : seesCommitted
                ? 'Committed (remaining) and actual cost on this job.'
                : 'Approved expenses to date on this job.'}
          </p>
        </div>
        <Link href={`/dashboard/expenses/new?project=${project.id}`} style={primaryButtonStyle}>
          + Log expense
        </Link>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '18px', flexWrap: 'wrap' }}>
        {summaryCards.map((card) => (
          <div
            key={card.label}
            style={{
              ...cardStyle,
              padding: '14px 15px',
              minWidth: '170px',
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
            {card.caption && (
              <div style={{ fontSize: '10.5px', color: card.inverted ? color.navySecondary : color.faint, marginTop: '3px' }}>
                {card.caption}
              </div>
            )}
          </div>
        ))}
        {showLabor && (
          <div style={{ ...cardStyle, padding: '14px 15px', minWidth: '170px' }}>
            <div style={{ ...microLabelStyle, fontSize: '10.5px', color: color.mutedAlt }}>Labor to date</div>
            <div style={{ fontFamily: font.mono, fontSize: '20px', fontWeight: 600, color: color.navy, marginTop: '4px' }}>
              {fmtMoney(jobCost.labor.totalCost)}
            </div>
            <div style={{ fontSize: '10.5px', color: color.faint, marginTop: '3px' }}>
              {jobCost.labor.totalHours.toFixed(1)} hrs · frozen burdened rates · never on budget lines
            </div>
          </div>
        )}
      </div>

      {/* §7.1 S-4 (amended 2026-07-31) — contract rates + history, with
          renegotiate (Owner/Admin) and supersede (Owner only, §7.3).
          Owner/Admin ONLY (Financial Visibility Floor): inside this gate the
          component never renders or fetches for PM/Foreman. */}
      {isOwnerAdmin && <RateSection project={project} canSupersede={role === 'owner'} />}

      {isOwnerAdmin && (
        <p style={{ fontSize: '13px', color: color.muted, margin: '0 0 6px' }}>
          Cost baseline from each instrument (pre-markup; tax included on taxed rows) — the budget
          total sits below the contract by the margin, by design.
        </p>
      )}
      {seesCommitted && (
        <p style={{ fontSize: '12px', color: color.faint, margin: '0 0 14px' }}>
          Committed shows the REMAINING balance (gross promise − payments). Per-line totals exclude
          retainage held/released — retainage rides the Payables numbers below.
        </p>
      )}

      {/* §5.2 retry surface — signed COs missing their budget lines. */}
      {isOwnerAdmin &&
        rollup.signedCosWithoutBudget.map((co) => (
          <div
            key={co.id}
            style={{
              ...cardStyle,
              padding: '12px 16px',
              marginBottom: '12px',
              borderLeft: `3px solid ${color.warning}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '12px',
              flexWrap: 'wrap',
            }}
          >
            <span style={{ fontSize: '13px', color: color.body }}>
              <strong>{co.co_number}</strong>
              {co.title ? ` — ${co.title}` : ''} is signed but has no budget lines yet.
            </span>
            <ApplyCoBudgetButton changeOrderId={co.id} />
          </div>
        ))}

      {/* Budget table, grouped by instrument */}
      {rollup.instruments.length === 0 ? (
        <div style={{ ...cardStyle, padding: '48px', textAlign: 'center', color: color.muted, marginBottom: '18px' }}>
          No budget lines yet. The baseline is created when an estimate is converted, a change
          order is signed, or the first expense lands on Miscellaneous.
        </div>
      ) : (
        <div style={{ ...cardStyle, overflow: 'hidden', marginBottom: '18px' }}>
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
            {isOwnerAdmin && <span style={{ ...microLabelStyle, textAlign: 'right' }}>Budget</span>}
            {seesCommitted && (
              <span style={{ ...microLabelStyle, textAlign: 'right' }}>Committed (rem.)</span>
            )}
            <span style={{ ...microLabelStyle, textAlign: 'right' }}>Actual</span>
            {seesCommitted && (
              <span style={{ ...microLabelStyle, textAlign: 'right' }}>Cost to date</span>
            )}
            {isOwnerAdmin && <span style={{ ...microLabelStyle, textAlign: 'right' }}>Variance</span>}
          </div>

          {rollup.instruments.map((instrument) => {
            const isCo = instrument.kind === 'change_order';
            return (
              <div
                key={instrument.changeOrder?.id ?? instrument.kind}
                style={isCo ? { borderLeft: `3px solid ${color.warning}` } : undefined}
              >
                {/* Instrument header (P6 — every dollar traceable to its instrument) */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '10px 20px',
                    backgroundColor: isCo ? color.blueTint : color.tableHeadBg,
                    borderBottom: `1px solid ${color.rowDivider}`,
                  }}
                >
                  <span style={{ fontFamily: font.sans, fontSize: '13px', fontWeight: 700, color: color.navy }}>
                    {instrumentLabel(instrument)}
                  </span>
                  {isCo && (
                    <span
                      style={{
                        fontSize: '10px',
                        fontWeight: 700,
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        color: color.warningDeep,
                        backgroundColor: color.cardBg,
                        border: `1px solid ${color.warning}`,
                        borderRadius: '999px',
                        padding: '1px 8px',
                      }}
                    >
                      Change order
                    </span>
                  )}
                </div>

                {instrument.groups.map((group) =>
                  group.items.map((item) => {
                    const cost = lineCost(item.actual_amount, item.committed_remaining);
                    // RULING [S97]: budgeted_amount is NULL when the reader is
                    // not permitted. `?? 0` here produced a variance of MINUS
                    // THE COST — a plausible, wrong, confident number on a
                    // screen that is meant to show nothing. Null propagates.
                    const variance =
                      item.budgeted_amount !== null && cost !== 0
                        ? item.budgeted_amount - cost
                        : null;
                    // Likewise: an absent figure must not classify the row as
                    // non-credit. Unknown is unknown (D-2 negative CO rows).
                    const credit = item.budgeted_amount !== null && item.budgeted_amount < 0;
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
                          {item.is_miscellaneous && (
                            <span style={{ color: color.faint, fontWeight: 400, fontSize: '12px' }}>
                              {' '}
                              · catch-all
                            </span>
                          )}
                        </span>
                        {isOwnerAdmin && (
                          <span
                            style={{ ...moneyCell, color: credit ? color.danger : moneyCell.color }}
                            title={`Gross committed: ${money(item.committed_amount ?? 0)}`}
                          >
                            {item.budgeted_amount === null ? '—' : money(item.budgeted_amount)}
                          </span>
                        )}
                        {seesCommitted && (
                          // 113c §5: italic = not locked in — a contributing
                          // sub-contract is formal-and-unsigned. Signing
                          // flips it firm. Display only; the money counts
                          // identically either way.
                          <span
                            style={{
                              ...(item.committed_remaining ? moneyCell : dashCell),
                              fontStyle: item.committed_awaiting_signature ? 'italic' : 'normal',
                            }}
                            title={
                              item.committed_awaiting_signature
                                ? `Wait on contract signature — committed counts but is not locked in until the sub signs. Gross committed ${money(item.committed_amount ?? 0)} − paid = remaining`
                                : `Gross committed ${money(item.committed_amount ?? 0)} − paid = remaining`
                            }
                          >
                            {moneyOrDash(item.committed_remaining)}
                          </span>
                        )}
                        <span style={item.actual_amount ? moneyCell : dashCell}>
                          {moneyOrDash(item.actual_amount)}
                        </span>
                        {seesCommitted && (
                          <span style={cost ? moneyCell : dashCell}>{moneyOrDash(cost)}</span>
                        )}
                        {isOwnerAdmin && (
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
                  })
                )}

                {/* Instrument subtotal */}
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
                    {instrumentLabel(instrument)} subtotal
                  </span>
                  {isOwnerAdmin && (
                    <span style={{ ...moneyCell, fontWeight: 600, color: color.body }}>
                      {instrument.budgeted === null ? '—' : money(instrument.budgeted)}
                    </span>
                  )}
                  {seesCommitted && (
                    <span style={instrument.committedRemaining ? { ...moneyCell, fontWeight: 600 } : dashCell}>
                      {moneyOrDash(instrument.committedRemaining)}
                    </span>
                  )}
                  <span style={instrument.actual ? { ...moneyCell, fontWeight: 600 } : dashCell}>
                    {moneyOrDash(instrument.actual)}
                  </span>
                  {seesCommitted && (
                    <span style={dashCell}>
                      {moneyOrDash(lineCost(instrument.actual, instrument.committedRemaining))}
                    </span>
                  )}
                  {isOwnerAdmin && (
                    <span style={dashCell}>
                      {instrument.budgeted !== null &&
                      lineCost(instrument.actual, instrument.committedRemaining)
                        ? money(
                            instrument.budgeted -
                              lineCost(instrument.actual, instrument.committedRemaining)
                          )
                        : '—'}
                    </span>
                  )}
                </div>
              </div>
            );
          })}

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
            <span style={{ gridColumn: '1 / span 2', fontFamily: font.sans, fontSize: '14px', fontWeight: 700, color: color.navy }}>
              Total
            </span>
            {isOwnerAdmin && (
              <span style={{ ...moneyCell, fontSize: '14px', fontWeight: 700 }}>
                {rollup.totalBudgeted === null ? '—' : money(rollup.totalBudgeted)}
              </span>
            )}
            {seesCommitted && (
              <span style={{ ...(rollup.totalCommittedRemaining ? moneyCell : dashCell), fontSize: '14px', fontWeight: 700 }}>
                {moneyOrDash(rollup.totalCommittedRemaining)}
              </span>
            )}
            <span style={{ ...(rollup.totalActual ? moneyCell : dashCell), fontSize: '14px', fontWeight: 700 }}>
              {moneyOrDash(rollup.totalActual)}
            </span>
            {seesCommitted && (
              <span style={{ ...(rollup.costToDate ? moneyCell : dashCell), fontSize: '14px', fontWeight: 700 }}>
                {moneyOrDash(rollup.costToDate)}
              </span>
            )}
            {isOwnerAdmin && (
              <span style={{ ...dashCell, fontSize: '14px', fontWeight: 700 }}>
                {rollup.totalBudgeted !== null && rollup.costToDate
                  ? money(rollup.totalBudgeted - rollup.costToDate)
                  : '—'}
              </span>
            )}
          </div>
        </div>
      )}

      {/* §2 [S97] — STANDALONE INVOICE INCOME, its OWN INDEPENDENT SECTION.
          Josh's ruling: manual invoice items are NEW INCOME LINES, presented
          the way CO lines are.

          IT IS A SEPARATE CARD, NOT A ROW IN THE BUDGET TABLE, and that is
          deliberate: the table above is COST (Budget / Committed / Actual /
          Cost to date / Variance). Income is a different quantity — a
          standalone line has no cost, no commitment and no variance — so
          putting it in those columns would state figures that do not exist.
          The section grammar is the same as an instrument section (labelled
          header with a pill, grouped rows, a subtotal), which is what "the way
          CO lines are" means.

          DERIVED FROM NON-VOIDED INVOICES. Voiding removes these with no
          cleanup step — see project-income.ts for why storing them could not
          have been undone. */}
      {income && income.groups.length > 0 && (
        <div style={{ ...cardStyle, marginBottom: '18px', overflow: 'hidden' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '10px 20px',
              backgroundColor: color.tableHeadBg,
              borderBottom: `1px solid ${color.rowDivider}`,
            }}
          >
            <span style={{ fontFamily: font.sans, fontSize: '13px', fontWeight: 700, color: color.navy }}>
              Standalone invoice income
            </span>
            <span
              style={{
                fontSize: '10px',
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: color.navy,
                backgroundColor: color.cardBg,
                border: `1px solid ${color.cardBorder}`,
                borderRadius: '999px',
                padding: '1px 8px',
              }}
            >
              Income
            </span>
            <span style={{ fontSize: '11px', color: color.faint }}>
              billed directly on an invoice, with nothing upstream to inherit from (§2)
            </span>
          </div>

          {income.groups.map((group) => (
            <div key={group.category}>
              <div
                style={{
                  padding: '6px 20px',
                  backgroundColor: color.cardBg,
                  borderBottom: `1px solid ${color.rowDivider}`,
                }}
              >
                <span style={microLabelStyle}>{group.label}</span>
              </div>
              {group.lines.map((line) => (
                <div
                  key={line.invoiceLineId}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '2.4fr 1.2fr 1fr',
                    gap: '12px',
                    alignItems: 'center',
                    padding: '8px 20px',
                    borderBottom: `1px solid ${color.rowDivider}`,
                  }}
                >
                  <span style={{ fontSize: '13px', color: color.body }}>{line.description}</span>
                  <span style={{ fontSize: '12px', color: color.faint }}>
                    {line.invoiceNumber ?? 'Draft'}
                    {line.invoiceStatus === 'draft' || line.invoiceStatus === 'pending_approval'
                      ? ' · not yet sent'
                      : ''}
                  </span>
                  <span style={moneyCell}>{money(line.amount)}</span>
                </div>
              ))}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '2.4fr 1.2fr 1fr',
                  gap: '12px',
                  alignItems: 'center',
                  padding: '8px 20px',
                  borderBottom: `1px solid ${color.rowDivider}`,
                }}
              >
                <span style={{ gridColumn: '1 / span 2', fontSize: '13px', fontWeight: 600, color: color.body }}>
                  {group.label} subtotal
                </span>
                <span style={{ ...moneyCell, fontWeight: 600 }}>{money(group.amount)}</span>
              </div>
            </div>
          ))}

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '2.4fr 1.2fr 1fr',
              gap: '12px',
              alignItems: 'center',
              padding: '14px 20px',
              backgroundColor: color.tableHeadBg,
            }}
          >
            <span style={{ gridColumn: '1 / span 2', fontFamily: font.sans, fontSize: '14px', fontWeight: 700, color: color.navy }}>
              Total standalone income
              {income.draftTotal > 0 && (
                <span style={{ fontSize: '11px', fontWeight: 400, color: color.faint, marginLeft: '8px' }}>
                  incl. {money(income.draftTotal)} not yet sent
                </span>
              )}
            </span>
            <span style={{ ...moneyCell, fontSize: '14px', fontWeight: 700 }}>
              {money(income.total)}
            </span>
          </div>
        </div>
      )}

      {/* 7C §4.5 — Payables (Owner/Admin + PM): retainage + awaiting-paper
          live HERE, not on budget lines (Q3). */}
      {payables && (
        <div style={{ ...cardStyle, padding: '16px 20px', marginBottom: '18px', maxWidth: '560px' }}>
          <p style={{ ...microLabelStyle, marginBottom: '10px' }}>Payables</p>
          <div style={{ display: 'flex', gap: '26px', flexWrap: 'wrap', marginBottom: '10px' }}>
            <div>
              <p style={{ fontSize: '11px', color: color.faint, margin: 0 }}>Still owed</p>
              <p style={{ fontFamily: font.mono, fontSize: '20px', fontWeight: 600, color: color.navy, margin: '2px 0 0' }}>
                {fmtMoney(payables.stillOwed)}
              </p>
            </div>
            <div>
              <p style={{ fontSize: '11px', color: color.faint, margin: 0 }}>Retainage held</p>
              <p style={{ fontFamily: font.mono, fontSize: '20px', fontWeight: 600, color: color.navy, margin: '2px 0 0' }}>
                {fmtMoney(payables.retainageHeld)}
              </p>
            </div>
          </div>
          {payables.awaitingPaper.length > 0 && (
            <div style={{ borderTop: `1px solid ${color.rowDivider}`, paddingTop: '8px' }}>
              <p style={{ fontSize: '11px', color: color.faint, margin: '0 0 4px' }}>
                Bill expected — committed with no document yet
              </p>
              {payables.awaitingPaper.map((a) => (
                <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '2px 0' }}>
                  <span style={{ color: color.body }}>{a.supplier}</span>
                  <span style={{ fontFamily: font.mono, color: color.navy }}>{fmtMoney(a.amount)}</span>
                </div>
              ))}
            </div>
          )}
          <p style={{ fontSize: '11px', color: color.faint, margin: '8px 0 0' }}>
            Still owed = committed − paid. Retainage is job-level only — it never appears on budget
            lines. Manage rows on the{' '}
            <Link href="/dashboard/expenses" style={{ color: color.primary }}>
              Bills &amp; Commitments
            </Link>{' '}
            tab.
          </p>
        </div>
      )}

      {/* Expenses by category (all audiences). */}
      <div style={{ ...cardStyle, padding: '16px 20px', marginBottom: '18px', maxWidth: '420px' }}>
        <p style={{ ...microLabelStyle, marginBottom: '8px' }}>Approved expenses by category</p>
        {(Object.entries(jobCost.expenses.byCategory) as [string, number][]).map(([cat, total]) => (
          <div key={cat} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '13px' }}>
            <span style={{ color: color.body }}>{EXPENSE_CATEGORY_LABELS[cat] ?? cat}</span>
            <span style={{ fontFamily: font.mono, color: color.navy }}>{fmtMoney(total)}</span>
          </div>
        ))}
        {isOwnerAdmin && (
          <div style={{ borderTop: `1px solid ${color.rowDivider}`, marginTop: '6px', paddingTop: '6px', fontSize: '12px', color: color.muted }}>
            Allocated to budget lines: {fmtMoney(jobCost.expenses.allocated)} · unallocated:{' '}
            {fmtMoney(jobCost.expenses.unallocated)}
          </div>
        )}
      </div>

      {/* Owner/Admin — labor by member (derived, never persisted). */}
      {showLabor && jobCost.labor.byMember.length > 0 && (
        <div style={{ ...cardStyle, overflow: 'hidden', marginBottom: '18px', maxWidth: '560px' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>Labor by member</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Hours</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Cost</th>
                </tr>
              </thead>
              <tbody>
                {jobCost.labor.byMember.map((m) => (
                  <tr key={m.member_id}>
                    <td style={tdStyle}>{memberNames[m.member_id] ?? 'Member'}</td>
                    <td style={moneyTd}>{m.hours.toFixed(1)}</td>
                    <td style={moneyTd}>{fmtMoney(m.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Expense list (role-scoped audiences; RLS scopes rows). */}
      <div style={{ ...cardStyle, overflow: 'hidden' }}>
        {expenses.length === 0 ? (
          <p style={{ padding: '22px 20px', fontSize: '14px', color: color.muted, margin: 0 }}>
            No expenses logged on this job yet.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>Date</th>
                  <th style={thStyle}>Supplier</th>
                  <th style={thStyle}>Category</th>
                  <th style={thStyle}>Logged by</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Amount</th>
                  <th style={thStyle}>Status</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((e) => (
                  <tr key={e.id}>
                    <td style={{ ...tdStyle, fontFamily: font.mono, whiteSpace: 'nowrap' }}>
                      {e.expense_date}
                    </td>
                    <td style={tdStyle}>
                      {e.supplier}
                      {e.description && (
                        <div style={{ fontSize: '12px', color: color.muted }}>{e.description}</div>
                      )}
                    </td>
                    <td style={tdStyle}>{EXPENSE_CATEGORY_LABELS[e.cost_category] ?? e.cost_category}</td>
                    <td style={tdStyle}>{e.author?.display_name ?? '—'}</td>
                    <td style={moneyTd}>{fmtMoney(e.amount)}</td>
                    <td style={tdStyle}>
                      <ExpenseStatusChip status={e.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
