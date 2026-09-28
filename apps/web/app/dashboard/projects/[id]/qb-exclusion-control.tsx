'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useConfirm } from '@/components/confirm/confirm-provider';
import { excludeProjectFromQb, includeProjectInQb } from '@/lib/services/qb-exclusions-client';

// [S114 PART B, RULED Josh R3 + Q16–Q18] "Exclude from QuickBooks" — in the
// project overview's STATUS card, beside Mark On Hold / Complete / Cancelled /
// Move to Trash.
//
//   Owner  ('set') — the control, and the state line.
//   Admin  ('see') — the state line only, read-only.
//   everyone else  — never rendered (the page does not mount this), and RLS
//                    would return nothing to them anyway.
//
// Shown ALWAYS, connected to QuickBooks or not (Q18, reversed): the exclusion
// matters most BEFORE a connection exists — the moment QuickBooks is connected
// it starts syncing, and the projects must already be marked by then.
//
// It stops FUTURE syncing only (R3). Records already in QuickBooks are left
// alone — and therefore stop being updated there — which the confirm states
// with the count, so it is a choice and not a surprise (Q17 c).

export function QbExclusionControl({
  projectId,
  access,
  exclusion,
  linkedRecords,
}: {
  projectId: string;
  access: 'set' | 'see';
  exclusion: { excludedAt: string; excludedByName: string | null } | null;
  linkedRecords: number;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const since = exclusion ? new Date(exclusion.excludedAt).toLocaleDateString() : null;

  async function run(fn: () => Promise<{ success: boolean; error?: string }>) {
    setBusy(true);
    setError(null);
    const r = await fn();
    setBusy(false);
    if (!r.success) setError(r.error ?? 'That did not save.');
    else router.refresh();
  }

  async function exclude() {
    const already =
      linkedRecords > 0
        ? ` ${linkedRecords} record${linkedRecords === 1 ? ' is' : 's are'} already in QuickBooks — ${
            linkedRecords === 1 ? 'it stays' : 'they stay'
          } there and will no longer be updated from here.`
        : '';
    if (
      !(await confirm(
        `Stop sending this project to QuickBooks? New invoices, payments, bills and refunds on it will not be synced.${already} Nothing already in QuickBooks is changed or deleted.`
      ))
    )
      return;
    await run(() => excludeProjectFromQb(projectId));
  }

  async function include() {
    if (
      !(await confirm(
        'Sync this project to QuickBooks again? Records created while it was excluded are NOT sent — only new activity from now on.'
      ))
    )
      return;
    await run(() => includeProjectInQb(projectId));
  }

  const buttonStyle: React.CSSProperties = {
    display: 'block',
    width: '100%',
    marginBottom: '0.5rem',
    padding: '0.5rem 0.75rem',
    fontSize: '0.875rem',
    fontWeight: 500,
    backgroundColor: '#fff',
    border: '1px solid #d1d5db',
    borderRadius: '0.375rem',
    cursor: busy ? 'default' : 'pointer',
  };

  return (
    <div
      data-testid="qb-exclusion"
      style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #e5e7eb' }}
    >
      {exclusion ? (
        <p
          data-testid="qb-exclusion-state"
          style={{ fontSize: '0.8125rem', color: '#92400e', margin: '0 0 0.5rem' }}
        >
          Not syncing to QuickBooks since {since}
          {exclusion.excludedByName ? ` (${exclusion.excludedByName})` : ''}.
          {access === 'see' ? ' Only the Owner can change this.' : ''}
        </p>
      ) : access === 'see' ? null : (
        <p style={{ fontSize: '0.8125rem', color: '#6b7280', margin: '0 0 0.5rem' }}>
          This project syncs to QuickBooks when QuickBooks is connected.
        </p>
      )}
      {access === 'set' &&
        (exclusion ? (
          <button
            data-testid="qb-include"
            onClick={() => void include()}
            disabled={busy}
            style={buttonStyle}
          >
            Include in QuickBooks again
          </button>
        ) : (
          <button
            data-testid="qb-exclude"
            onClick={() => void exclude()}
            disabled={busy}
            style={buttonStyle}
          >
            Exclude from QuickBooks
          </button>
        ))}
      {error && <p style={{ fontSize: '0.8125rem', color: '#991b1b', margin: 0 }}>{error}</p>}
    </div>
  );
}
