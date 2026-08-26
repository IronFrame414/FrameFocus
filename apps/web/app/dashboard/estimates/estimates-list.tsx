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

export function EstimatesList() {
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

  const cellStyle: React.CSSProperties = {
    padding: '0.625rem 0.75rem',
    fontSize: '0.875rem',
    borderBottom: '1px solid #f3f4f6',
  };
  const thStyle: React.CSSProperties = {
    ...cellStyle,
    fontWeight: 600,
    color: '#6b7280',
    textAlign: 'left',
    borderBottom: '1px solid #e5e7eb',
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name or number…"
          style={{
            padding: '0.5rem 0.75rem',
            border: '1px solid #d1d5db',
            borderRadius: '0.375rem',
            fontSize: '0.875rem',
            minWidth: '240px',
          }}
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as EstimateStatus | 'all')}
          style={{
            padding: '0.5rem 0.75rem',
            border: '1px solid #d1d5db',
            borderRadius: '0.375rem',
            fontSize: '0.875rem',
          }}
        >
          {STATUS_FILTERS.map((s) => (
            <option key={s} value={s}>
              {s === 'all' ? 'All statuses' : STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <p style={{ color: '#9ca3af', fontSize: '0.875rem' }}>Loading…</p>
      ) : estimates.length === 0 ? (
        <div
          style={{
            padding: '3rem',
            textAlign: 'center',
            color: '#9ca3af',
            border: '1px dashed #d1d5db',
            borderRadius: '0.5rem',
          }}
        >
          No estimates yet.{' '}
          <Link href="/dashboard/estimates/new" style={{ color: '#2563eb' }}>
            Create your first estimate
          </Link>
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: '#fff' }}>
          <thead>
            <tr>
              <th style={thStyle}>Number</th>
              <th style={thStyle}>Name</th>
              <th style={thStyle}>Status</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Total</th>
              <th style={thStyle}>Created</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {estimates.map((e) => (
              <tr key={e.id}>
                <td style={cellStyle}>
                  <Link
                    href={`/dashboard/estimates/${e.id}`}
                    style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 600 }}
                  >
                    {e.estimate_number}
                  </Link>
                </td>
                <td style={cellStyle}>
                  <Link
                    href={`/dashboard/estimates/${e.id}`}
                    style={{ color: 'inherit', textDecoration: 'none' }}
                  >
                    {e.name}
                  </Link>
                </td>
                <td style={cellStyle}>
                  <StatusBadge status={e.status} />
                </td>
                <td style={{ ...cellStyle, textAlign: 'right' }}>{fmtMoney(e.grand_total)}</td>
                <td style={cellStyle}>
                  {e.created_at ? new Date(e.created_at).toLocaleDateString() : '—'}
                </td>
                <td style={{ ...cellStyle, textAlign: 'right' }}>
                  <button
                    type="button"
                    onClick={() => setCloneSource(e)}
                    style={{
                      padding: '0.25rem 0.75rem',
                      fontSize: '0.75rem',
                      backgroundColor: '#f3f4f6',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      cursor: 'pointer',
                    }}
                  >
                    Clone
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
