'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useConfirm } from '@/components/confirm/confirm-provider';
import { abandonSiteVisit, promoteSiteVisit } from '@/lib/services/site-visits-client';

// S108 Spec A — the two OFFICE decisions on a visit. Both are RPCs that the
// database refuses for anyone but owner/admin/PM (promote) or the office and
// the recorder pre-promotion (abandon); these buttons only decide what to show.
//
// [S108 follow-up] PROMOTE IS NOT FINISH. On production a visit became a
// numbered draft because this button was the only "done"-shaped control
// anywhere. The recorder's "done" is now Finish, inside the shared record.
// This button says plainly what it does, and its confirm says whether the
// recorder has finished.

const button: React.CSSProperties = {
  padding: '0.55rem 1rem',
  fontSize: '0.875rem',
  fontWeight: 700,
  borderRadius: '8px',
  cursor: 'pointer',
};

export function SiteVisitOfficeActions({
  estimateId,
  promoted,
  abandoned,
  finishedAt,
}: {
  estimateId: string;
  promoted: boolean;
  abandoned: boolean;
  finishedAt: string | null;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (promoted) {
    return (
      <p style={{ marginBottom: '1rem', fontSize: '0.875rem' }}>
        This visit is now a draft estimate.{' '}
        <Link href={`/dashboard/estimates/${estimateId}`} style={{ color: '#3b4ae0', fontWeight: 600 }}>
          Open the estimate →
        </Link>
      </p>
    );
  }
  if (abandoned) return null;

  return (
    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem', alignItems: 'center' }}>
      <span data-testid="sv-office-state" style={{ fontSize: '0.8125rem', color: finishedAt ? '#065f46' : '#7b8699', flexBasis: '100%' }}>
        {finishedAt
          ? `Finished ${new Date(finishedAt).toLocaleString()} — ready to price.`
          : 'Still being recorded — the recorder has not tapped Finish.'}
      </span>
      <button
        type="button"
        data-testid="sv-promote"
        disabled={busy}
        onClick={async () => {
          const msg = finishedAt
            ? 'Create a draft estimate from this visit? It gets its estimate number now, and the recorder can no longer change the visit.'
            : 'The recorder has NOT finished this visit yet. Create a draft estimate from it anyway? It gets its estimate number now, and the recorder can no longer add to the visit.';
          if (!(await confirm(msg))) return;
          setBusy(true);
          setError(null);
          const r = await promoteSiteVisit(estimateId);
          setBusy(false);
          if (!r.success) return setError(r.error ?? 'Could not promote the visit.');
          router.push(`/dashboard/estimates/${estimateId}`);
        }}
        style={{ ...button, color: '#fff', background: '#3b4ae0', border: '1px solid #3b4ae0' }}
      >
        Create estimate from this visit
      </button>
      <button
        type="button"
        data-testid="sv-abandon"
        disabled={busy}
        onClick={async () => {
          if (!(await confirm('Abandon this site visit? It leaves the list; nothing is numbered, and it can be recovered.'))) return;
          setBusy(true);
          setError(null);
          const r = await abandonSiteVisit(estimateId);
          setBusy(false);
          if (!r.success) return setError(r.error ?? 'Could not abandon the visit.');
          router.push('/dashboard/estimates');
        }}
        style={{ ...button, color: '#c0362c', background: '#fff', border: '1px solid #f1c4bf' }}
      >
        Abandon
      </button>
      {error ? <span style={{ color: '#c0362c', fontSize: '0.8125rem' }}>{error}</span> : null}
    </div>
  );
}
