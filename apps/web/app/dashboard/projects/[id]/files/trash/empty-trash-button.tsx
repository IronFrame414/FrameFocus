'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { emptyTrash } from '@/lib/services/files-client';

// Empty Trash, per-project scope [storage-archive-ai-spec §3, Q3]. Rendered
// only for Owner/Admin (the page gates it); RLS enforces the same rule
// underneath, so rendering it wrongly would fail loudly, not delete quietly.
//
// Two-step confirm in place of a modal: the second click is the commitment,
// and the button says exactly what will happen — this is the irreversible
// operation in M3.

export function EmptyTrashButton({ projectId, count }: { projectId: string; count: number }) {
  const router = useRouter();
  const [arming, setArming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (count === 0) return null;

  async function run() {
    setBusy(true);
    setError(null);
    const result = await emptyTrash({ projectId });
    setBusy(false);
    setArming(false);
    if (result.errors.length > 0) {
      // A partial empty is reported, never rounded up.
      setError(
        `Deleted ${result.deleted} of ${result.found}. ${result.errors.length} failed — ` +
          `the first: ${result.errors[0]}`
      );
    }
    router.refresh();
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
      {error && <span style={{ color: '#b91c1c', fontSize: '0.85rem' }}>{error}</span>}
      {arming && !busy && (
        <button
          onClick={() => setArming(false)}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: '6px',
            border: '1px solid #d1d5db',
            background: '#fff',
            cursor: 'pointer',
          }}
        >
          Keep files
        </button>
      )}
      <button
        onClick={() => (arming ? run() : setArming(true))}
        disabled={busy}
        style={{
          padding: '0.5rem 1rem',
          borderRadius: '6px',
          border: 'none',
          background: arming ? '#b91c1c' : '#dc2626',
          color: '#fff',
          fontWeight: 600,
          cursor: busy ? 'default' : 'pointer',
          opacity: busy ? 0.6 : 1,
        }}
      >
        {busy
          ? 'Deleting…'
          : arming
            ? `Permanently delete ${count} file${count === 1 ? '' : 's'} — cannot be undone`
            : 'Empty Trash'}
      </button>
    </div>
  );
}
