'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Estimate,
  EstimateStatus,
  listEstimates,
} from '@/lib/services/estimates-client';
import { STATUS_COLORS, STATUS_LABELS, fmtMoney } from './labels';
import { CloneModal } from './clone-modal';
import {
  AlertStrip,
  FilterChips,
  ListPageHeader,
  ListSearchInput,
  MetricStrip,
} from '@/components/list-screen/list-screen';
import type { Metric } from '@/components/list-screen/list-screen';
import { cardStyle, color, font, microLabelStyle, primaryButtonStyle } from '@/lib/theme';

const STATUS_FILTERS: Array<EstimateStatus | 'all'> = [
  'all',
  'draft',
  'review',
  'sent',
  'accepted',
  'declined',
  'expired',
  // [S175 #2] 'revised' retired (never written); 'voided' is the real one.
  'voided',
];

export function StatusBadge({ status }: { status: EstimateStatus }) {
  const [bg, fg] = STATUS_COLORS[status];
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '0.125rem 0.625rem',
        borderRadius: '9999px',
        fontSize: '0.75rem',
        fontWeight: 600,
        backgroundColor: bg,
        color: fg,
      }}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

// §8.2 Client activity — UNTIL VIEW TRACKING LANDS (P3, not built, not built
// here), this renders from what exists and upgrades without a layout change.
function clientActivity(e: Estimate): string {
  if (!e.sent_at) return 'not sent';
  return `sent ${new Date(e.sent_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })}`;
}

export function EstimatesList({
  metrics,
}: {
  /** §8.2 — server-computed over the caller-visible set. winRate is the RULED
   *  12-month window (null = nothing sent in the window; the card renders an
   *  em-dash, not a fake 0%). */
  metrics: { winRate: number | null; cohortSize: number; expiringSoon: number };
}) {
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<EstimateStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [cloneSource, setCloneSource] = useState<Estimate | null>(null);

  useEffect(() => {
    setLoading(true);
    listEstimates({
      status: status === 'all' ? undefined : status,
      search: search.trim() || undefined,
    }).then((rows) => {
      setEstimates(rows);
      setLoading(false);
    });
  }, [status, search]);

  const stripMetrics: Metric[] = [
    {
      label: 'Win rate',
      value: metrics.winRate === null ? '—' : `${metrics.winRate}%`,
      sub: `12 months · ${metrics.cohortSize} sent`,
    },
    { label: 'Expiring soon', value: metrics.expiringSoon, sub: 'next 7 days' },
  ];

  const th: React.CSSProperties = { ...microLabelStyle, padding: '10px 12px', textAlign: 'left' };
  const td: React.CSSProperties = {
    padding: '11px 12px',
    fontSize: '13px',
    color: color.bodyAlt,
    borderBottom: `1px solid ${color.rowDivider}`,
  };

  return (
    <div>
      <ListPageHeader title="Estimates" subtitle="Build, send, and track estimates">
        <ListSearchInput value={search} onChange={setSearch} placeholder="Search name or number…" />
        <Link href="/dashboard/estimates/new" style={primaryButtonStyle}>
          + New Estimate
        </Link>
      </ListPageHeader>

      <MetricStrip metrics={stripMetrics} />

      {metrics.expiringSoon > 0 && (
        <AlertStrip>
          <strong>{metrics.expiringSoon}</strong> sent estimate
          {metrics.expiringSoon === 1 ? '' : 's'} expire{metrics.expiringSoon === 1 ? 's' : ''}{' '}
          within 7 days.{' '}
          <button
            onClick={() => setStatus('sent')}
            style={{
              border: 'none',
              background: 'none',
              padding: 0,
              color: color.primary,
              fontWeight: 600,
              fontSize: '13px',
              fontFamily: font.sans,
              cursor: 'pointer',
            }}
          >
            Review sent estimates
          </button>
        </AlertStrip>
      )}

      <FilterChips
        options={STATUS_FILTERS.map((s) => ({
          value: s,
          label: s === 'all' ? 'All' : STATUS_LABELS[s],
        }))}
        selected={status}
        onSelect={(value) => setStatus(value as EstimateStatus | 'all')}
      />

      {loading ? (
        <p style={{ color: color.faint, fontSize: '13px' }}>Loading…</p>
      ) : estimates.length === 0 ? (
        <div style={{ ...cardStyle, padding: '48px', textAlign: 'center', color: color.muted }}>
          No estimates yet.{' '}
          <Link href="/dashboard/estimates/new" style={{ color: color.primary }}>
            Create your first estimate
          </Link>
        </div>
      ) : (
        <div style={{ ...cardStyle, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr
                style={{
                  backgroundColor: color.tableHeadBg,
                  borderBottom: `1px solid ${color.neutralBadgeBg}`,
                }}
              >
                <th style={{ ...th, paddingLeft: '20px' }}>Estimate</th>
                <th style={th}>Status</th>
                <th style={{ ...th, textAlign: 'right' }}>Total</th>
                <th style={th}>Client activity</th>
                <th style={th}>Created</th>
                <th style={{ ...th, paddingRight: '20px' }}></th>
              </tr>
            </thead>
            <tbody>
              {estimates.map((e, i) => {
                const last = i === estimates.length - 1;
                const cell = last ? { ...td, borderBottom: 'none' } : td;
                return (
                  <tr key={e.id}>
                    {/* Number folds under the name — the 14a pattern. */}
                    <td style={{ ...cell, paddingLeft: '20px' }}>
                      <Link
                        href={`/dashboard/estimates/${e.id}`}
                        style={{ textDecoration: 'none' }}
                      >
                        <span
                          style={{
                            display: 'block',
                            fontWeight: 700,
                            color: color.navy,
                            fontSize: '14px',
                          }}
                        >
                          {e.name}
                        </span>
                        <span
                          style={{
                            fontFamily: font.mono,
                            fontSize: '11.5px',
                            fontWeight: 500,
                            color: color.faint,
                          }}
                        >
                          {e.estimate_number}
                        </span>
                      </Link>
                    </td>
                    <td style={cell}>
                      <StatusBadge status={e.status} />
                    </td>
                    <td
                      style={{
                        ...cell,
                        textAlign: 'right',
                        fontFamily: font.mono,
                        fontWeight: 600,
                        color: color.navy,
                      }}
                    >
                      {fmtMoney(e.grand_total)}
                    </td>
                    <td style={{ ...cell, fontFamily: font.mono, fontSize: '12.5px' }}>
                      {clientActivity(e)}
                    </td>
                    <td style={{ ...cell, fontFamily: font.mono, fontSize: '12.5px' }}>
                      {e.created_at ? new Date(e.created_at).toLocaleDateString() : '—'}
                    </td>
                    <td style={{ ...cell, textAlign: 'right', paddingRight: '20px' }}>
                      <button
                        type="button"
                        onClick={() => setCloneSource(e)}
                        style={{
                          padding: '4px 12px',
                          fontSize: '12px',
                          fontFamily: font.sans,
                          fontWeight: 600,
                          color: color.bodyAlt,
                          backgroundColor: color.neutralBadgeBg,
                          border: `1px solid ${color.cardBorder}`,
                          borderRadius: '7px',
                          cursor: 'pointer',
                        }}
                      >
                        Clone
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {cloneSource && (
        <CloneModal
          sourceId={cloneSource.id}
          sourceName={cloneSource.name}
          sourceNumber={cloneSource.estimate_number}
          onClose={() => setCloneSource(null)}
        />
      )}
    </div>
  );
}
