import { createClient } from '@/lib/supabase-server';
import { redirect, notFound } from 'next/navigation';
import { getProfitabilityReport } from '@/lib/services/profitability';
import { getProject } from '@/lib/services/projects';
import { getRevisedContract } from '@/lib/services/contract-value';
import type { ProfitCategoryRow } from '@framefocus/shared/utils/profitability';
import { attentionCardStyle, cardStyle, color, font, microLabelStyle } from '@/lib/theme';

// Module 7H — the per-job profitability report (7h1-spec §7H.3).
//
// OWNER/ADMIN ONLY (§7H.6). The tab is hidden from everyone else in
// project-header.tsx, and this gate is what actually enforces it — a hidden
// tab is a hidden link, not a closed door, and M6M D-54 settled that both are
// required.
//
// 7H WRITES NOTHING. No mutation on this page, no client component with a
// write path, no migration in this slice.

const money = (n: number) =>
  `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** An em dash, never $0.00. A null here means "not derivable" and rendering it
 *  as zero would state a number the data does not support (§7H.3). */
const orDash = (n: number | null) => (n === null ? '—' : money(n));

export default async function ProfitabilityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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
  if (!profile || !['owner', 'admin'].includes(profile.role)) {
    redirect(`/dashboard/projects/${id}`);
  }

  const report = await getProfitabilityReport(id);
  if (!report) notFound();

  const { headline, categories } = report;
  const basisLabel = headline.basis === 'billed' ? 'Profit' : 'Profit so far';

  const totals = categories.reduce(
    (acc, row) => ({
      budget: row.budget === null ? acc.budget : (acc.budget ?? 0) + row.budget,
      committed: acc.committed + row.committed,
      actual: acc.actual + row.actual,
      sell: row.sell === null ? acc.sell : (acc.sell ?? 0) + row.sell,
    }),
    { budget: null as number | null, committed: 0, actual: 0, sell: null as number | null }
  );

  // §8.8.5 "Projected at completion" — NEW, page-level, FIXED-PRICE ONLY
  // (P11: a cost-plus/T&M contract figure is a projection already; projecting
  // from it would stack forecast on forecast). The cost forecast is the
  // budget FLOORED by money already incurred — a job over budget projects at
  // its overrun, never back down to plan:
  //     projected profit = revised − max(budget, committed + actual)
  // Null (em-dash) when there is no budget total or no revised contract.
  const [project, revisedContract] = await Promise.all([getProject(id), getRevisedContract(id)]);
  const incurred = totals.committed + totals.actual + report.unattributed.actual;
  const projectedAtCompletion =
    project?.project_type === 'fixed_price' &&
    revisedContract.revised !== null &&
    totals.budget !== null
      ? Math.round((Number(revisedContract.revised) - Math.max(totals.budget, incurred)) * 100) /
        100
      : null;

  return (
    <div>
      <p style={{ ...microLabelStyle, marginBottom: '10px' }}>Profitability</p>

      {/* §8.8.5 — the no-cost-landed banner. `actualCost === 0` is a real and
          misleading state: every figure below is billing and budget only, and
          margin reads artificially clean. Not one of the six report caveats —
          those describe derivation assumptions; this describes an absence. */}
      {headline.actualCost === 0 && (
        <div
          style={{
            ...cardStyle,
            ...attentionCardStyle,
            padding: '11px 16px',
            marginBottom: '14px',
            fontSize: '13px',
            color: color.body,
          }}
        >
          <strong>No cost has landed on this job yet.</strong> The figures below reflect billing
          and budget only — profit and margin will move as soon as real cost arrives.
        </div>
      )}

      {/* ── Headline ────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '18px' }}>
        <Tile label="Earned" value={orDash(headline.earned)} />
        <Tile label="Billed" value={money(headline.billed)} />
        <Tile label="Actual cost" value={money(headline.actualCost)} />
        <Tile
          label="Backlog"
          value={orDash(headline.backlog)}
          hint="Earned, not yet invoiced"
        />
        <Tile
          label={basisLabel}
          value={orDash(headline.profit)}
          inverted
          hint={
            headline.basis === 'billed'
              ? 'Billed − actual cost. Final.'
              : 'Earned − actual cost. Overstates until the job is done.'
          }
        />
        {/* §8.8.5 — fixed-price only; em-dash renders nothing false. */}
        {projectedAtCompletion !== null && (
          <Tile
            label="Projected at completion"
            value={money(projectedAtCompletion)}
            hint="Revised − max(budget, committed + actual). A forecast, not a promise."
          />
        )}
      </div>

      <div style={{ ...cardStyle, padding: '14px 18px', marginBottom: '18px', maxWidth: '560px' }}>
        <p style={{ ...microLabelStyle, marginBottom: '8px' }}>Cash</p>
        <div style={{ display: 'flex', gap: '26px', flexWrap: 'wrap' }}>
          <Figure label="Collected" value={money(headline.cash.collected)} />
          <Figure label="Spent" value={money(headline.cash.spent)} />
          <Figure label="Net" value={money(headline.cash.net)} />
        </div>
        <p style={{ fontSize: '11.5px', color: color.faint, margin: '8px 0 0' }}>
          What has actually landed and actually left — distinct from earned and billed above.
        </p>
      </div>

      {/* ── Cost table ──────────────────────────────────────────────────── */}
      <div style={{ ...cardStyle, overflow: 'hidden', marginBottom: '18px' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: color.tableHeadBg }}>
                <Th align="left">Category</Th>
                <Th>Budget</Th>
                <Th>Committed</Th>
                <Th>Actual</Th>
                <Th>Remaining</Th>
                <Th>Revenue</Th>
                <Th>Margin</Th>
              </tr>
            </thead>
            <tbody>
              {categories.map((row) => (
                <CategoryRow key={row.category} row={row} />
              ))}

              {/* [Ruling B2, S140] Real cost, no instrument, so no revenue and
                  no margin. Its own row rather than folded into a category —
                  folding it would show a category with cost and no revenue
                  behind it and read as a margin collapse that never happened. */}
              {report.unattributed.count > 0 && (
                <tr style={{ borderTop: `1px solid ${color.rowDivider}` }}>
                  <Td align="left">
                    Not tied to a contract line
                    <span style={{ color: color.faint, fontSize: '11px', marginLeft: '6px' }}>
                      ({report.unattributed.count})
                    </span>
                  </Td>
                  <Td>—</Td>
                  <Td>—</Td>
                  <Td>{money(report.unattributed.actual)}</Td>
                  <Td>—</Td>
                  <Td>—</Td>
                  <Td>—</Td>
                </tr>
              )}

              {/* §7H.3 — without this row the four categories fail to
                  reconcile to the job total by exactly the retained amount.
                  SUB-held: cost withheld, money not yet paid OUT. Not the
                  client-held retainage in the headline. */}
              <tr style={{ borderTop: `1px solid ${color.rowDivider}` }}>
                <Td align="left">
                  Retainage held from subs
                  <span style={{ color: color.faint, fontSize: '11px', marginLeft: '6px' }}>
                    remaining unpaid
                  </span>
                </Td>
                <Td>—</Td>
                <Td>{money(report.retainageHeld)}</Td>
                <Td>—</Td>
                <Td>—</Td>
                <Td>—</Td>
                <Td>—</Td>
              </tr>

              <tr style={{ background: color.tableHeadBg, fontWeight: 600 }}>
                <Td align="left">Total</Td>
                <Td>{orDash(totals.budget)}</Td>
                <Td>{money(totals.committed)}</Td>
                <Td>{money(totals.actual + report.unattributed.actual)}</Td>
                <Td>—</Td>
                <Td>{orDash(totals.sell)}</Td>
                <Td>
                  {totals.sell === null
                    ? '—'
                    : money(totals.sell - totals.actual - report.unattributed.actual)}
                </Td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Caveats ─────────────────────────────────────────────────────── */}
      {report.caveats.length > 0 && (
        <div style={{ ...cardStyle, padding: '14px 18px', maxWidth: '720px' }}>
          <p style={{ ...microLabelStyle, marginBottom: '8px' }}>What these numbers assume</p>
          <ul style={{ margin: 0, paddingLeft: '18px' }}>
            {report.caveats.map((c) => (
              <li
                key={c.code}
                style={{ fontSize: '12.5px', color: color.bodyAlt, marginBottom: '6px' }}
              >
                {c.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function CategoryRow({ row }: { row: ProfitCategoryRow }) {
  const label = row.category.charAt(0).toUpperCase() + row.category.slice(1);
  const over = row.remaining !== null && row.remaining < 0;
  return (
    <tr style={{ borderTop: `1px solid ${color.rowDivider}` }}>
      <Td align="left">{label}</Td>
      <Td>{orDash(row.budget)}</Td>
      <Td>{money(row.committed)}</Td>
      <Td>{money(row.actual)}</Td>
      <Td color={over ? color.danger : undefined}>{orDash(row.remaining)}</Td>
      <Td>{orDash(row.sell)}</Td>
      <Td color={row.margin !== null && row.margin < 0 ? color.danger : undefined}>
        {orDash(row.margin)}
      </Td>
    </tr>
  );
}

function Th({ children, align = 'right' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th
      style={{
        textAlign: align,
        padding: '9px 12px',
        fontSize: '11px',
        fontWeight: 600,
        color: color.muted,
        textTransform: 'uppercase',
        letterSpacing: '0.03em',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = 'right',
  color: textColor,
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
  color?: string;
}) {
  return (
    <td
      style={{
        textAlign: align,
        padding: '9px 12px',
        fontFamily: align === 'right' ? font.mono : font.sans,
        color: textColor ?? color.navy,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </td>
  );
}

function Tile({
  label,
  value,
  hint,
  inverted,
}: {
  label: string;
  value: string;
  hint?: string;
  inverted?: boolean;
}) {
  return (
    <div
      style={{
        ...cardStyle,
        padding: '12px 16px',
        minWidth: '150px',
        background: inverted ? color.navy : color.cardBg,
      }}
    >
      <div
        style={{
          fontSize: '11px',
          color: inverted ? color.navySecondary : color.faint,
          textTransform: 'uppercase',
          letterSpacing: '0.03em',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: font.mono,
          fontSize: '20px',
          fontWeight: 600,
          color: inverted ? '#ffffff' : color.navy,
          marginTop: '4px',
        }}
      >
        {value}
      </div>
      {hint && (
        <div
          style={{
            fontSize: '10.5px',
            color: inverted ? color.navySecondary : color.faint,
            marginTop: '3px',
          }}
        >
          {hint}
        </div>
      )}
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p style={{ fontSize: '11px', color: color.faint, margin: 0 }}>{label}</p>
      <p
        style={{
          fontFamily: font.mono,
          fontSize: '20px',
          fontWeight: 600,
          color: color.navy,
          margin: '2px 0 0',
        }}
      >
        {value}
      </p>
    </div>
  );
}
