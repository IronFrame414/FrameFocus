'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ProjectAssignment } from '@/lib/services/project-assignments-client';
import { reassignMember, unassignMember } from '@/lib/services/project-assignments-client';

interface TeamPanelProps {
  projectId: string;
  assignments: ProjectAssignment[];
  members: { id: string; display_name: string; member_type: string }[];
  canManage: boolean;
}

export function TeamPanel({ projectId, assignments, members, canManage }: TeamPanelProps) {
  const router = useRouter();
  const [memberId, setMemberId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const assignedIds = new Set(assignments.map((a) => a.member_id));
  const available = members.filter((m) => !assignedIds.has(m.id));

  async function handleAssign() {
    if (!memberId) return;
    setBusy(true);
    setError(null);
    const result = await reassignMember(projectId, memberId);
    if (result.success) {
      setMemberId('');
      router.refresh();
    } else {
      setError(result.error || 'Assignment failed');
    }
    setBusy(false);
  }

  async function handleRemove(assignmentId: string, name: string) {
    if (!confirm(`Remove ${name} from this project?`)) return;
    setBusy(true);
    const result = await unassignMember(assignmentId);
    if (result.success) {
      router.refresh();
    } else {
      setError(result.error || 'Removal failed');
    }
    setBusy(false);
  }

  const cardStyle: React.CSSProperties = {
    backgroundColor: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: '0.5rem',
    padding: '1.25rem',
    marginBottom: '1rem',
  };

  return (
    <div style={{ maxWidth: '720px' }}>
      {canManage && (
        <div style={cardStyle}>
          <div
            style={{
              fontSize: '0.8125rem',
              fontWeight: 600,
              color: '#6b7280',
              textTransform: 'uppercase',
              marginBottom: '0.75rem',
            }}
          >
            Assign a Member
          </div>
          <p style={{ fontSize: '0.8125rem', color: '#6b7280', marginBottom: '0.75rem' }}>
            Assignment controls project visibility for PMs, foremen, and crew. It is not required
            for task or punch assignment.
          </p>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <select
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
              style={{
                flex: 1,
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem',
                fontSize: '0.875rem',
              }}
            >
              <option value="">Select a member…</option>
              {available.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.display_name}
                  {m.member_type === 'subcontractor' ? ' (Sub)' : ''}
                </option>
              ))}
            </select>
            <button
              onClick={handleAssign}
              disabled={busy || !memberId}
              style={{
                padding: '0.5rem 1rem',
                fontSize: '0.875rem',
                fontWeight: 600,
                color: '#fff',
                backgroundColor: busy || !memberId ? '#93c5fd' : '#2563eb',
                border: 'none',
                borderRadius: '0.375rem',
                cursor: busy || !memberId ? 'default' : 'pointer',
              }}
            >
              Assign
            </button>
          </div>
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
      )}

      <div style={cardStyle}>
        <div
          style={{
            fontSize: '0.8125rem',
            fontWeight: 600,
            color: '#6b7280',
            textTransform: 'uppercase',
            marginBottom: '0.75rem',
          }}
        >
          Project Team ({assignments.length})
        </div>
        {assignments.length === 0 ? (
          <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>No members assigned yet.</p>
        ) : (
          assignments.map((a) => (
            <div
              key={a.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0.5rem 0',
                borderBottom: '1px solid #f3f4f6',
                fontSize: '0.875rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span
                  style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '9999px',
                    backgroundColor: a.member?.schedule_color || '#9ca3af',
                    display: 'inline-block',
                  }}
                />
                <span style={{ fontWeight: 500 }}>{a.member?.display_name ?? 'Unknown'}</span>
                {a.member?.member_type === 'subcontractor' && (
                  <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>(Sub)</span>
                )}
                {a.role_on_project && (
                  <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                    · {a.role_on_project}
                  </span>
                )}
              </div>
              {canManage && (
                <button
                  onClick={() => handleRemove(a.id, a.member?.display_name ?? 'member')}
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
                  Remove
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
