'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  CO_STATUS_LABELS,
  createChangeOrder,
  softDeleteChangeOrder,
  type ChangeOrderStatus,
  type ChangeOrderType,
  type ChangeOrderWithAuthor,
} from '@/lib/services/change-orders-client';

// 5D — CO list + create. A new CO starts as a Draft shell and opens in
// the builder; net deltas are signed (credits negative, D-2) and
// display-only (D-6 — contract_value is never mutated).

const STATUS_COLORS: Record<ChangeOrderStatus, { bg: string; fg: string }> = {
  draft: { bg: '#f3f4f6', fg: '#374151' },
  sent: { bg: '#fef3c7', fg: '#92400e' },
  signed: { bg: '#dcfce7', fg: '#166534' },
  voided: { bg: '#fee2e2', fg: '#991b1b' },
};

const CO_TYPE_OPTIONS: Array<{ value: ChangeOrderType; label: string }> = [
  { value: 'fixed_price', label: 'Fixed Price' },
  { value: 'time_and_materials', label: 'Time & Materials' },
  { value: 'cost_plus', label: 'Cost Plus' },
];

function money(value: number): string {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

interface ChangesPanelProps {
  projectId: string;
  projectType: string;
  changeOrders: ChangeOrderWithAuthor[];
  canManage: boolean;
  canDelete: boolean;
}

export function ChangesPanel({
  projectId,
  projectType,
  changeOrders,
  canManage,
  canDelete,
}: ChangesPanelProps) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [coType, setCoType] = useState<ChangeOrderType>(
    (CO_TYPE_OPTIONS.some((o) => o.value === projectType)
      ? projectType
      : 'fixed_price') as ChangeOrderType
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputStyle: React.CSSProperties = {
    padding: '0.5rem 0.75rem',
    border: '1px solid #d1d5db',
    borderRadius: '0.375rem',
    fontSize: '0.875rem',
    boxSizing: 'border-box',
  };

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    setError(null);

    const result = await createChangeOrder({
      project_id: projectId,
      title: title.trim(),
      co_type: coType,
    });

    setBusy(false);
    if (!result.success || !result.id) {
      setError(result.error ?? 'Could not create the change order');
      return;
    }
    router.push(`/dashboard/projects/${projectId}/changes/${result.id}`);
  }

  async function handleDelete(co: ChangeOrderWithAuthor) {
    if (!window.confirm(`Move ${co.co_number} to trash?`)) return;
    const result = await softDeleteChangeOrder(co.id);
    if (!result.success) {
      setError(result.error ?? 'Delete failed');
      return;
    }
    router.refresh();
  }

  const signedTotal = changeOrders
    .filter((co) => co.status === 'signed')
    .reduce((sum, co) => sum + co.net_delta, 0);

  return (
    <div style={{ maxWidth: '900px' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1rem',
        }}
      >
        <p style={{ fontSize: '0.8125rem', color: '#6b7280', margin: 0 }}>
          Signed change orders total {money(signedTotal)} (display-only — the headline contract
          value is unchanged until Module 7).
        </p>
        {canManage && !formOpen && (
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            style={{
              padding: '0.5rem 1rem',
              fontSize: '0.875rem',
              fontWeight: 600,
              color: '#fff',
              backgroundColor: '#1a56db',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            New Change Order
          </button>
        )}
      </div>

      {error && (
        <div
          style={{
            padding: '0.75rem 1rem',
            borderRadius: '0.375rem',
            marginBottom: '1rem',
            backgroundColor: '#fef2f2',
            color: '#991b1b',
            fontSize: '0.875rem',
          }}
        >
          {error}
        </div>
      )}

      {formOpen && (
        <form
          onSubmit={handleCreate}
          style={{
            backgroundColor: '#fff',
            borderRadius: '0.5rem',
            border: '1px solid #e5e7eb',
            padding: '1rem',
            marginBottom: '1rem',
            display: 'flex',
            gap: '0.75rem',
            flexWrap: 'wrap',
            alignItems: 'flex-end',
          }}
        >
          <div style={{ flex: '1 1 240px' }}>
            <label
              style={{
                display: 'block',
                fontSize: '0.75rem',
                fontWeight: 600,
                color: '#6b7280',
                marginBottom: '0.25rem',
              }}
            >
              Title
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Kitchen cabinet upgrade"
              style={{ ...inputStyle, width: '100%' }}
              autoFocus
            />
          </div>
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.75rem',
                fontWeight: 600,
                color: '#6b7280',
                marginBottom: '0.25rem',
              }}
            >
              CO type
            </label>
            <select
              value={coType}
              onChange={(e) => setCoType(e.target.value as ChangeOrderType)}
              style={inputStyle}
            >
              {CO_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={busy || !title.trim()}
            style={{
              padding: '0.5rem 1rem',
              fontSize: '0.875rem',
              fontWeight: 600,
              color: '#fff',
              backgroundColor: busy || !title.trim() ? '#9ca3af' : '#1a56db',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: busy || !title.trim() ? 'not-allowed' : 'pointer',
            }}
          >
            {busy ? 'Creating…' : 'Create Draft'}
          </button>
          <button
            type="button"
            onClick={() => setFormOpen(false)}
            style={{
              padding: '0.5rem 1rem',
              fontSize: '0.875rem',
              backgroundColor: '#f3f4f6',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </form>
      )}

      {changeOrders.length === 0 ? (
        <div
          style={{
            padding: '3rem',
            textAlign: 'center',
            color: '#6b7280',
            backgroundColor: '#fff',
            borderRadius: '0.5rem',
            border: '1px solid #e5e7eb',
          }}
        >
          No change orders yet.
          {canManage && ' Create one to record added or removed scope.'}
        </div>
      ) : (
        <div
          style={{
            backgroundColor: '#fff',
            borderRadius: '0.5rem',
            border: '1px solid #e5e7eb',
            overflowX: 'auto',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                {['CO #', 'Title', 'Status', 'Net Delta', 'Author', 'Signed', ''].map(
                  (label, i) => (
                    <th
                      key={label || 'actions'}
                      style={{
                        padding: '0.5rem',
                        textAlign: i === 3 ? 'right' : 'left',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        color: '#6b7280',
                        textTransform: 'uppercase',
                      }}
                    >
                      {label}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {changeOrders.map((co) => {
                const colors = STATUS_COLORS[co.status];
                return (
                  <tr key={co.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '0.5rem', fontSize: '0.875rem', whiteSpace: 'nowrap' }}>
                      <Link
                        href={`/dashboard/projects/${projectId}/changes/${co.id}`}
                        style={{ color: '#1a56db', textDecoration: 'none', fontWeight: 600 }}
                      >
                        {co.co_number}
                      </Link>
                    </td>
                    <td style={{ padding: '0.5rem', fontSize: '0.875rem' }}>{co.title}</td>
                    <td style={{ padding: '0.5rem' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '0.125rem 0.5rem',
                          borderRadius: '9999px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          backgroundColor: colors.bg,
                          color: colors.fg,
                        }}
                      >
                        {CO_STATUS_LABELS[co.status]}
                      </span>
                    </td>
                    <td
                      style={{
                        padding: '0.5rem',
                        fontSize: '0.875rem',
                        textAlign: 'right',
                        color: co.net_delta < 0 ? '#166534' : undefined,
                      }}
                    >
                      {money(co.net_delta)}
                    </td>
                    <td style={{ padding: '0.5rem', fontSize: '0.875rem', color: '#6b7280' }}>
                      {co.author?.display_name ?? '—'}
                    </td>
                    <td style={{ padding: '0.5rem', fontSize: '0.875rem', color: '#6b7280' }}>
                      {co.signed_at ? new Date(co.signed_at).toLocaleDateString() : '—'}
                    </td>
                    <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                      {canDelete && co.status !== 'signed' && (
                        <button
                          type="button"
                          onClick={() => handleDelete(co)}
                          style={{
                            padding: '0.25rem 0.625rem',
                            fontSize: '0.75rem',
                            color: '#991b1b',
                            backgroundColor: '#fff',
                            border: '1px solid #fecaca',
                            borderRadius: '0.375rem',
                            cursor: 'pointer',
                          }}
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
