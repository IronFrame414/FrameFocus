'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ProjectStatus } from '@/lib/services/projects-client';
import {
  allowedStatusTransitions,
  transitionProjectStatus,
  deleteProject,
} from '@/lib/services/projects-client';
import { PROJECT_STATUS_LABELS } from '@/lib/services/projects';

interface StatusControlProps {
  projectId: string;
  currentStatus: ProjectStatus;
  userRole: string;
}

export function StatusControl({ projectId, currentStatus, userRole }: StatusControlProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const targets = allowedStatusTransitions(currentStatus);
  const canDelete = userRole === 'owner' || userRole === 'admin';

  async function handleTransition(to: ProjectStatus) {
    const label = PROJECT_STATUS_LABELS[to];
    if (to === 'cancelled' && !confirm(`Cancel this project? This marks it ${label}.`)) return;
    setBusy(true);
    setError(null);
    const result = await transitionProjectStatus(projectId, currentStatus, to);
    if (result.success) {
      router.refresh();
    } else {
      setError(result.error || 'Status change failed');
    }
    setBusy(false);
  }

  async function handleDelete() {
    if (!confirm('Move this project to trash?')) return;
    setBusy(true);
    const result = await deleteProject(projectId, userRole);
    if (result.success) {
      router.push('/dashboard/projects');
      router.refresh();
    } else {
      setError(result.error || 'Delete failed');
      setBusy(false);
    }
  }

  const buttonStyle: React.CSSProperties = {
    display: 'block',
    width: '100%',
    padding: '0.5rem',
    marginBottom: '0.5rem',
    fontSize: '0.875rem',
    fontWeight: 500,
    backgroundColor: '#fff',
    border: '1px solid #d1d5db',
    borderRadius: '0.375rem',
    cursor: busy ? 'default' : 'pointer',
  };

  return (
    <div>
      {targets.length === 0 && (
        <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>
          No further status changes available.
        </p>
      )}
      {targets.map((t) => (
        <button key={t} onClick={() => handleTransition(t)} disabled={busy} style={buttonStyle}>
          Mark {PROJECT_STATUS_LABELS[t]}
        </button>
      ))}
      {canDelete && (
        <button
          onClick={handleDelete}
          disabled={busy}
          style={{ ...buttonStyle, color: '#991b1b', borderColor: '#fecaca' }}
        >
          Move to Trash
        </button>
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
  );
}
