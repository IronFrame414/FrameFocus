'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { EstimatePeAccess } from '@/lib/services/estimate-assignments';
import { setEstimatePeAccess } from '@/lib/services/estimate-assignments-client';
import { showPeControls } from '@/lib/estimates/pe-visibility';

// S119 D-2 — Owner/Admin choose which Project Executive this estimate is
// assigned to [Josh, 2026-09-29]: "I also want to be able to add access to a PE
// for an estimate I started." The assigned PE is the ONLY PE who can open it
// (and build on it while it is a draft). One PE per estimate. The database
// decides who may write this (estimate_assignments RLS: Owner/Admin); the page
// only renders it for them.
export function EstimatePeAccessControl({
  estimateId,
  access,
}: {
  estimateId: string;
  access: EstimatePeAccess;
}) {
  const router = useRouter();
  const [value, setValue] = useState(access.assignedMemberId ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // [S121 Part 8] PRESENTATION ONLY — not a security control (see
  // lib/estimates/pe-visibility.ts). No live PE and none assigned → no control.
  if (!showPeControls(access)) return null;

  async function onChange(next: string) {
    const previous = value;
    setValue(next);
    setBusy(true);
    setError(null);
    const result = await setEstimatePeAccess(estimateId, next || null);
    setBusy(false);
    if (!result.success) {
      setValue(previous);
      setError(result.error ?? 'Could not change access.');
      return;
    }
    router.refresh();
  }

  return (
    <div
      data-testid="est-pe-access"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        flexWrap: 'wrap',
        padding: '0.625rem 0.875rem',
        marginBottom: '1rem',
        border: '1px solid #d5dae4',
        borderRadius: '0.375rem',
        backgroundColor: '#f8f9fc',
        fontSize: '0.875rem',
      }}
    >
      <label htmlFor="est-pe-access-select" style={{ fontWeight: 600 }}>
        Project Executive access
      </label>
      <select
        id="est-pe-access-select"
        value={value}
        disabled={busy}
        onChange={(e) => onChange(e.target.value)}
        style={{
          padding: '0.375rem 0.5rem',
          border: '1px solid #d5dae4',
          borderRadius: '0.375rem',
          fontSize: '0.875rem',
          backgroundColor: '#fff',
        }}
      >
        <option value="">No Project Executive</option>
        {access.executives.map((pe) => (
          <option key={pe.memberId} value={pe.memberId}>
            {pe.name}
          </option>
        ))}
      </select>
      <span style={{ color: '#6b7280' }}>
        Only the chosen Project Executive can open this estimate.
      </span>
      {error && (
        <span role="alert" style={{ color: '#c0362c', width: '100%' }}>
          {error}
        </span>
      )}
    </div>
  );
}
