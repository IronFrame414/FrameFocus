'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  ClientContract,
  SubcontractorContract,
} from '@/lib/services/contracts-client';
import {
  createSubcontractorContract,
  updateClientContract,
  updateSubcontractorContract,
} from '@/lib/services/contracts-client';

interface ContractsPanelProps {
  projectId: string;
  clientContracts: ClientContract[];
  subContracts: SubcontractorContract[];
  subMembers: { id: string; display_name: string }[];
  canManage: boolean;
}

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  draft: { bg: '#f3f4f6', fg: '#374151' },
  sent: { bg: '#fef3c7', fg: '#92400e' },
  signed: { bg: '#dcfce7', fg: '#166534' },
  void: { bg: '#fee2e2', fg: '#991b1b' },
};

function money(value: number | null): string {
  if (value === null || value === undefined) return '—';
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export function ContractsPanel({
  projectId,
  clientContracts,
  subContracts,
  subMembers,
  canManage,
}: ContractsPanelProps) {
  const router = useRouter();
  const [memberId, setMemberId] = useState('');
  const [scope, setScope] = useState('');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAddSubContract() {
    if (!memberId) {
      setError('Select a subcontractor.');
      return;
    }
    setBusy(true);
    setError(null);
    const result = await createSubcontractorContract({
      project_id: projectId,
      member_id: memberId,
      scope_of_work: scope.trim() || null,
      contract_value: value ? Number(value) : null,
    });
    if (result.success) {
      setMemberId('');
      setScope('');
      setValue('');
      router.refresh();
    } else {
      setError(result.error || 'Failed to add contract');
    }
    setBusy(false);
  }

  async function handleVoid(kind: 'client' | 'sub', id: string) {
    if (!confirm('Void this contract?')) return;
    setBusy(true);
    const result =
      kind === 'client'
        ? await updateClientContract(id, { status: 'void' })
        : await updateSubcontractorContract(id, { status: 'void' });
    if (result.success) router.refresh();
    else setError(result.error || 'Void failed');
    setBusy(false);
  }

  const cardStyle: React.CSSProperties = {
    backgroundColor: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: '0.5rem',
    padding: '1.25rem',
    marginBottom: '1rem',
  };
  const titleStyle: React.CSSProperties = {
    fontSize: '0.8125rem',
    fontWeight: 600,
    color: '#6b7280',
    textTransform: 'uppercase',
    marginBottom: '0.75rem',
  };
  const inputStyle: React.CSSProperties = {
    padding: '0.5rem',
    border: '1px solid #d1d5db',
    borderRadius: '0.375rem',
    fontSize: '0.875rem',
  };

  function statusBadge(status: string) {
    const colors = STATUS_COLORS[status] ?? STATUS_COLORS.draft;
    return (
      <span
        style={{
          padding: '0.125rem 0.5rem',
          borderRadius: '9999px',
          fontSize: '0.75rem',
          fontWeight: 500,
          backgroundColor: colors.bg,
          color: colors.fg,
        }}
      >
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  }

  return (
    <div style={{ maxWidth: '840px' }}>
      <div style={cardStyle}>
        <div style={titleStyle}>Client Contract</div>
        <p style={{ fontSize: '0.8125rem', color: '#6b7280', marginBottom: '0.75rem' }}>
          The signed proposal from conversion auto-attaches here. Re-issued or amended contracts
          are new rows — the most recent signed row is the active contract.
        </p>
        {clientContracts.length === 0 ? (
          <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>No client contract on record.</p>
        ) : (
          clientContracts.map((c) => (
            <div
              key={c.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0.5rem 0',
                borderBottom: '1px solid #f3f4f6',
                fontSize: '0.875rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                {statusBadge(c.status)}
                <span style={{ fontWeight: 600 }}>{money(c.contract_value)}</span>
                {c.executed_date && (
                  <span style={{ color: '#6b7280' }}>
                    executed{' '}
                    {new Date(c.executed_date + 'T00:00:00').toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                )}
                {c.notes && <span style={{ color: '#6b7280' }}>· {c.notes}</span>}
              </div>
              {canManage && c.status !== 'void' && (
                <button
                  onClick={() => handleVoid('client', c.id)}
                  disabled={busy}
                  style={{
                    padding: '0.25rem 0.625rem',
                    fontSize: '0.75rem',
                    color: '#991b1b',
                    backgroundColor: '#fff',
                    border: '1px solid #fecaca',
                    borderRadius: '0.375rem',
                    cursor: busy ? 'default' : 'pointer',
                  }}
                >
                  Void
                </button>
              )}
            </div>
          ))
        )}
      </div>

      <div style={cardStyle}>
        <div style={titleStyle}>Subcontractor Contracts ({subContracts.length})</div>
        <p style={{ fontSize: '0.8125rem', color: '#6b7280', marginBottom: '0.75rem' }}>
          Contract records only — draw schedules and payments arrive with Module 7.
        </p>

        {canManage && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '2fr 3fr 1fr auto',
              gap: '0.5rem',
              marginBottom: '1rem',
            }}
          >
            <select
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
              style={inputStyle}
            >
              <option value="">Select a sub…</option>
              {subMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.display_name}
                </option>
              ))}
            </select>
            <input
              placeholder="Scope of work"
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              style={inputStyle}
            />
            <input
              placeholder="Value"
              type="number"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              style={inputStyle}
            />
            <button
              onClick={handleAddSubContract}
              disabled={busy}
              style={{
                padding: '0.5rem 1rem',
                fontSize: '0.875rem',
                fontWeight: 600,
                color: '#fff',
                backgroundColor: busy ? '#93c5fd' : '#2563eb',
                border: 'none',
                borderRadius: '0.375rem',
                cursor: busy ? 'default' : 'pointer',
              }}
            >
              Add
            </button>
          </div>
        )}

        {subContracts.length === 0 ? (
          <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>No subcontractor contracts yet.</p>
        ) : (
          subContracts.map((c) => (
            <div
              key={c.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0.5rem 0',
                borderBottom: '1px solid #f3f4f6',
                fontSize: '0.875rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                {statusBadge(c.status)}
                <span style={{ fontWeight: 500 }}>{c.member?.display_name ?? 'Unknown sub'}</span>
                <span style={{ fontWeight: 600 }}>{money(c.contract_value)}</span>
                {c.scope_of_work && (
                  <span style={{ color: '#6b7280' }}>· {c.scope_of_work}</span>
                )}
              </div>
              {canManage && c.status !== 'void' && (
                <button
                  onClick={() => handleVoid('sub', c.id)}
                  disabled={busy}
                  style={{
                    padding: '0.25rem 0.625rem',
                    fontSize: '0.75rem',
                    color: '#991b1b',
                    backgroundColor: '#fff',
                    border: '1px solid #fecaca',
                    borderRadius: '0.375rem',
                    cursor: busy ? 'default' : 'pointer',
                  }}
                >
                  Void
                </button>
              )}
            </div>
          ))
        )}
        {error && (
          <div
            style={{
              padding: '0.5rem',
              marginTop: '0.5rem',
              backgroundColor: '#fee2e2',
              color: '#991b1b',
              borderRadius: '0.375rem',
              fontSize: '0.8125rem',
            }}
          >
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
