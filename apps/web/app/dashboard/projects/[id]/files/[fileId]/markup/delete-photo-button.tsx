'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useConfirm } from '@/components/confirm/confirm-provider';
import { softDeleteFile } from '@/lib/services/files-client';

// C-11 [S115] — "There is a delete button on project photos and clicking it
// does nothing." [Josh, 2026-09-28] Measured: desktop had NO photo delete. The
// button on this page was "Delete selected", which removes a drawn SHAPE and was
// disabled-but-styled-live with nothing selected. Since 831879b4 (photos left
// the Files tab) nothing on desktop could trash a photo at all.
//
// The fix is the feature: the same `softDeleteFile` /m's grid and viewer call —
// one mechanism, two surfaces — which counts the row it changed, so a write the
// database refused (RLS, or a frozen site-visit photo) is reported as a failure,
// never as a delete. Who sees this button: `canDeletePhoto` (lib/photos), the
// same rule /m reads.
export function DeletePhotoButton({ fileId, returnHref }: { fileId: string; returnHref: string }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (!(await confirm('Move this photo to trash?'))) return;
    setBusy(true);
    setError(null);
    const result = await softDeleteFile(fileId);
    if (!result.success) {
      setBusy(false);
      setError(`Could not delete this photo: ${result.error}`);
      return;
    }
    // Back to where the user came from, re-rendered without it [S122 0-B-5]:
    // the page resolves `returnHref` from its `?from=` token.
    // SUPERSEDED: it always pushed the project's Photos grid, even when the
    // user came from Files.
    router.push(returnHref);
    router.refresh();
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
      <button
        type="button"
        onClick={handleDelete}
        disabled={busy}
        data-testid="photo-delete"
        style={{
          padding: '0.4rem 0.8rem',
          fontSize: '0.8rem',
          background: '#fff',
          color: '#c00',
          border: '1px solid #c00',
          borderRadius: '4px',
          cursor: busy ? 'wait' : 'pointer',
        }}
      >
        {busy ? 'Deleting…' : 'Delete photo'}
      </button>
      {error && (
        <span
          role="alert"
          data-testid="photo-delete-error"
          style={{ color: '#a00', fontSize: '0.8rem' }}
        >
          {error}
        </span>
      )}
    </div>
  );
}
