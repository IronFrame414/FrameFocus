'use client';

// Step 9 (desktop redesign §8.10.4) — the three Details-rail panels that have
// data behind them. What is deliberately NOT here, and why:
//
//   · Estimate History — no audit/event/history table exists anywhere, and
//     `version_number`'s 'v1.1' is a dead DEFAULT with zero writers. Building
//     the panel means building an event log. DEFERRED (ask list).
//   · Coverage check — scope is estimate-level JSONB, categories are rows; no
//     FK, no shared key. Matching free-typed names would produce confident
//     wrong answers. NOT BUILT AS DESIGNED (§8.10.3).
//   · The target-margin bar — no target exists (§6b.2). Health renders margin
//     as a number, never against a target.
//   · View tracking — `viewed_at` and status 'viewed' have zero writers, and
//     the write path is the whole security question (the proposal link is
//     public). P3, its own item. "Opens" therefore say "not tracked yet".
//   · The expiration readiness check — `expiration_days` is NOT NULL with a
//     default, so "expiration set" is always true. DROPPED as near-vacuous.

import type { TabProps } from './estimate-builder';
import { computeEstimateHealth } from '@/lib/estimate-health';
import { fmtMoney } from '../labels';
import { color, font } from '@/lib/theme';

const cardStyle: React.CSSProperties = {
  border: `1px solid ${color.cardBorder}`,
  borderRadius: '13px',
  padding: '1rem',
  marginBottom: '1rem',
  backgroundColor: '#fff',
};

const cardTitleStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  fontFamily: font.mono,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: color.mutedAlt,
  marginBottom: '0.625rem',
};

const statRow: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  padding: '0.2rem 0',
  fontSize: '0.8125rem',
};

const monoValue: React.CSSProperties = {
  fontFamily: font.mono,
  fontWeight: 600,
  color: color.navy,
};

export function EstimateHealthCard({ data }: Pick<TabProps, 'data'>) {
  const { estimate, lineItems, rows } = data;
  const health = computeEstimateHealth({
    grandTotal: estimate.grand_total,
    taxRate: estimate.tax_rate,
    lineItems,
    rows,
  });

  return (
    <div style={cardStyle} data-testid="est-health">
      <div style={cardTitleStyle}>Estimate health</div>
      <div style={statRow}>
        <span style={{ color: color.body }}>Client price</span>
        <span style={monoValue}>{fmtMoney(health.price)}</span>
      </div>
      <div style={statRow}>
        <span style={{ color: color.body }}>Your cost</span>
        <span style={monoValue}>{fmtMoney(health.cost)}</span>
      </div>
      <div style={statRow}>
        <span style={{ color: color.body }}>Profit</span>
        <span style={{ ...monoValue, color: health.profit < 0 ? color.danger : color.navy }}>
          {fmtMoney(health.profit)}
        </span>
      </div>
      <div style={statRow}>
        <span style={{ color: color.body }}>Gross margin</span>
        <span
          style={{
            ...monoValue,
            color:
              health.marginPercent === null
                ? color.faint
                : health.marginPercent < 0
                  ? color.danger
                  : color.navy,
          }}
        >
          {health.marginPercent === null ? '—' : `${health.marginPercent}%`}
        </span>
      </div>
      {(health.unpricedRowCount > 0 || health.flatLinesMissingCost > 0) && (
        <p
          style={{
            marginTop: '0.5rem',
            marginBottom: 0,
            fontSize: '0.75rem',
            color: color.warning,
            backgroundColor: '#fff5e6',
            borderRadius: '7px',
            padding: '0.375rem 0.5rem',
          }}
        >
          {health.unpricedRowCount > 0 &&
            `${health.unpricedRowCount} row${health.unpricedRowCount === 1 ? ' has' : 's have'} no cost entered. `}
          {health.flatLinesMissingCost > 0 &&
            `${health.flatLinesMissingCost} flat-priced line${health.flatLinesMissingCost === 1 ? ' is' : 's are'} missing a cost — conversion will refuse until entered.`}
          {health.unpricedRowCount > 0 &&
            health.flatLinesMissingCost === 0 &&
            'Cost and margin are understated until every row is priced.'}
        </p>
      )}
      <p style={{ marginTop: '0.5rem', marginBottom: 0, fontSize: '0.6875rem', color: color.faint }}>
        Cost is summed the same way conversion builds the project budget.
      </p>
    </div>
  );
}

/** The Items tab's compact strip (the mockup's live cost/price/margin line) —
 *  the SAME derivation as the Details card, never a second implementation. */
export function EstimateHealthStrip({ data }: Pick<TabProps, 'data'>) {
  const { estimate, lineItems, rows } = data;
  const health = computeEstimateHealth({
    grandTotal: estimate.grand_total,
    taxRate: estimate.tax_rate,
    lineItems,
    rows,
  });

  const cell: React.CSSProperties = { display: 'flex', gap: '0.375rem', alignItems: 'baseline' };
  const label: React.CSSProperties = { fontSize: '0.6875rem', color: color.mutedAlt };

  return (
    <div
      data-testid="est-health-strip"
      style={{
        display: 'flex',
        gap: '1.5rem',
        alignItems: 'baseline',
        flexWrap: 'wrap',
        border: `1px solid ${color.cardBorder}`,
        borderRadius: '9px',
        padding: '0.5rem 0.875rem',
        marginBottom: '1rem',
        backgroundColor: color.tableHeadBg,
      }}
    >
      <span style={cell}>
        <span style={label}>Your cost</span>
        <span style={monoValue}>{fmtMoney(health.cost)}</span>
      </span>
      <span style={cell}>
        <span style={label}>Client price</span>
        <span style={monoValue}>{fmtMoney(health.price)}</span>
      </span>
      <span style={cell}>
        <span style={label}>Margin</span>
        <span
          style={{
            ...monoValue,
            color:
              health.marginPercent === null
                ? color.faint
                : health.marginPercent < 0
                  ? color.danger
                  : color.navy,
          }}
        >
          {health.marginPercent === null ? '—' : `${health.marginPercent}%`}
        </span>
      </span>
      {health.unpricedRowCount + health.flatLinesMissingCost > 0 && (
        <span style={{ fontSize: '0.75rem', color: color.warning }}>
          {health.unpricedRowCount + health.flatLinesMissingCost} unpriced — cost is understated
        </span>
      )}
    </div>
  );
}

interface Check {
  label: string;
  ok: boolean;
  detail?: string;
}

export function BeforeYouSendCard({ data }: Pick<TabProps, 'data'>) {
  const { estimate, lineItems, rows } = data;
  // Only meaningful before the freeze — a sent estimate can't act on it.
  if (estimate.status !== 'draft' && estimate.status !== 'review') return null;

  const health = computeEstimateHealth({
    grandTotal: estimate.grand_total,
    taxRate: estimate.tax_rate,
    lineItems,
    rows,
  });
  const scopeSections = Array.isArray(estimate.scope_sections) ? estimate.scope_sections : [];
  const termsSections = Array.isArray(estimate.terms_sections) ? estimate.terms_sections : [];

  const checks: Check[] = [
    {
      label: 'Client and job site set',
      ok: Boolean(estimate.contact_id && estimate.contact_address_id),
    },
    {
      label: 'Priced line items',
      ok: lineItems.length > 0 && (estimate.grand_total ?? 0) > 0,
      detail: lineItems.length === 0 ? 'No line items yet' : undefined,
    },
    {
      label: 'Every row carries a cost',
      ok: health.unpricedRowCount === 0 && health.flatLinesMissingCost === 0,
      detail:
        health.unpricedRowCount + health.flatLinesMissingCost > 0
          ? `${health.unpricedRowCount + health.flatLinesMissingCost} unpriced`
          : undefined,
    },
    { label: 'Scope of work written', ok: scopeSections.length > 0 },
    { label: 'Terms included', ok: termsSections.length > 0 },
  ];

  return (
    <div style={cardStyle} data-testid="est-before-send">
      <div style={cardTitleStyle}>Before you send</div>
      {checks.map((c) => (
        <div key={c.label} style={{ ...statRow, gap: '0.5rem' }}>
          <span style={{ color: c.ok ? color.body : color.warning, minWidth: 0 }}>
            <span style={{ marginRight: '0.375rem' }}>{c.ok ? '✓' : '○'}</span>
            {c.label}
          </span>
          {c.detail && !c.ok && (
            <span style={{ fontSize: '0.6875rem', color: color.warning, flexShrink: 0 }}>
              {c.detail}
            </span>
          )}
        </div>
      ))}
      <p style={{ marginTop: '0.5rem', marginBottom: 0, fontSize: '0.6875rem', color: color.faint }}>
        Advisory only — sending is never blocked.
      </p>
    </div>
  );
}

export function ClientActivityCard({ data }: Pick<TabProps, 'data'>) {
  const { estimate } = data;
  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div style={cardStyle} data-testid="est-client-activity">
      <div style={cardTitleStyle}>Client activity</div>
      <div style={statRow}>
        <span style={{ color: color.body }}>Sent</span>
        <span style={monoValue}>{estimate.sent_at ? fmtDate(estimate.sent_at) : 'not sent'}</span>
      </div>
      <div style={statRow}>
        <span style={{ color: color.body }}>Reminders</span>
        <span style={monoValue}>
          {estimate.reminder_count > 0
            ? `${estimate.reminder_count}${estimate.last_reminder_sent_at ? ` · last ${fmtDate(estimate.last_reminder_sent_at)}` : ''}`
            : 'none'}
        </span>
      </div>
      {estimate.accepted_at && (
        <div style={statRow}>
          <span style={{ color: color.body }}>Accepted</span>
          <span style={{ ...monoValue, color: color.success }}>{fmtDate(estimate.accepted_at)}</span>
        </div>
      )}
      {estimate.expires_at && !estimate.accepted_at && (
        <div style={statRow}>
          <span style={{ color: color.body }}>Expires</span>
          <span style={monoValue}>{fmtDate(estimate.expires_at)}</span>
        </div>
      )}
      <p style={{ marginTop: '0.5rem', marginBottom: 0, fontSize: '0.6875rem', color: color.faint }}>
        Opens aren&rsquo;t tracked yet.
      </p>
    </div>
  );
}
