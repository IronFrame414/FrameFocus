'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useConfirm } from '@/components/confirm/confirm-provider';
import type { ProjectStatus } from '@/lib/services/projects-client';
import {
  allowedStatusTransitions,
  transitionProjectStatus,
  deleteProject,
} from '@/lib/services/projects-client';
import { PROJECT_STATUS_LABELS } from '@/lib/services/projects-client';
import { getCommittedRemaining } from '@/lib/services/payables-client';
import { fmtMoney } from '@/components/expenses/expense-ui';

interface StatusControlProps {
  projectId: string;
  currentStatus: ProjectStatus;
  userRole: string;
  /** 7A §5.7 — a non-null value on an active→complete transition means this
   *  is a RE-complete (the project was completed before and reopened): the
   *  end-date choice modal fires (locked decision 8, Q11). */
  actualEndDate: string | null;
}

export function StatusControl({
  projectId,
  currentStatus,
  userRole,
  actualEndDate,
}: StatusControlProps) {
  const router = useRouter();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Re-complete end-date prompt (§5.7) — open while the user decides.
  const [endDatePrompt, setEndDatePrompt] = useState(false);

  const targets = allowedStatusTransitions(currentStatus);
  const canDelete = userRole === 'owner' || userRole === 'admin';
  const isOwnerAdmin = canDelete;
  const isReopen = (to: ProjectStatus) => currentStatus === 'complete' && to === 'active';

  async function runTransition(to: ProjectStatus, endDateChoice?: 'keep' | 'today') {
    setBusy(true);
    setError(null);
    const result = await transitionProjectStatus(projectId, currentStatus, to, {
      userRole,
      endDateChoice,
    });
    if (result.success) {
      setEndDatePrompt(false);
      router.refresh();
    } else {
      setError(result.error || 'Status change failed');
    }
    setBusy(false);
  }

  async function handleTransition(to: ProjectStatus) {
    const label = PROJECT_STATUS_LABELS[to];
    if (to === 'cancelled' && !(await confirm(`Cancel this project? This marks it ${label}.`))) return;
    // Reopen (7A Q1, Owner/Admin only — service enforces too): confirm with
    // the §5.7 consequences spelled out.
    if (isReopen(to)) {
      if (
        !(await confirm(
          'Reopen this completed project?\n\n' +
            'The punch gate will re-run when it is completed again, and you will be ' +
            'asked whether to keep the original completion date. The completion date ' +
            'and any warranty record persist — nothing is cleared.'
        ))
      ) {
        return;
      }
    }
    // 7C §4.7 (Q7iii) — complete-with-open-bills advisory: warn on committed
    // dollars still open, never block (P2). Pairs with 7A's reopen for the
    // late bill.
    if (to === 'complete') {
      const stillCommitted = await getCommittedRemaining(projectId);
      if (
        stillCommitted > 0 &&
        !(await confirm(
          `${fmtMoney(stillCommitted)} is still committed on this job (open bills or ` +
            'sub stages). You can complete anyway — a late bill can be recorded by ' +
            'reopening the project.\n\nComplete this project?'
        ))
      ) {
        return;
      }
    }
    // Re-complete (an actual_end_date already exists): the end-date choice is
    // required — prompt instead of transitioning (Q11: only on re-complete).
    if (to === 'complete' && actualEndDate !== null) {
      setEndDatePrompt(true);
      return;
    }
    await runTransition(to);
  }

  async function handleDelete() {
    if (!(await confirm('Move this project to trash?'))) return;
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
      {targets
        // Reopen is Owner/Admin only (7A Q1) — hide the button below that.
        .filter((t) => !isReopen(t) || isOwnerAdmin)
        .map((t) => (
          <button key={t} onClick={() => handleTransition(t)} disabled={busy} style={buttonStyle}>
            {isReopen(t) ? 'Reopen project' : `Mark ${PROJECT_STATUS_LABELS[t]}`}
          </button>
        ))}

      {/* 7A §5.7 — re-complete end-date choice (locked decision 8, per-case). */}
      {endDatePrompt && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(20, 33, 61, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
          }}
          onClick={() => !busy && setEndDatePrompt(false)}
        >
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: '0.5rem',
              padding: '1.5rem',
              width: '380px',
              maxWidth: '90vw',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <p style={{ fontWeight: 600, fontSize: '0.9375rem', margin: '0 0 0.25rem' }}>
              This project was completed before.
            </p>
            <p style={{ fontSize: '0.8125rem', color: '#6b7280', margin: '0 0 1rem' }}>
              Keep the original end date if the job really ended then and this cost was just late —
              or update it to today.
            </p>
            <button
              style={buttonStyle}
              disabled={busy}
              onClick={() => void runTransition('complete', 'keep')}
            >
              Keep original end date ({actualEndDate})
            </button>
            <button
              style={buttonStyle}
              disabled={busy}
              onClick={() => void runTransition('complete', 'today')}
            >
              Update to today
            </button>
            <button
              style={{ ...buttonStyle, color: '#6b7280', marginBottom: 0 }}
              disabled={busy}
              onClick={() => setEndDatePrompt(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
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
