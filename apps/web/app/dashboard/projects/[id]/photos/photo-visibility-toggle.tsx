'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateFile } from '@/lib/services/files-client';

/**
 * Redesign 6.2 — the FIRST `client_visible` toggle anywhere. The column and
 * both RLS arms (`files_select_client` / staff arm) shipped long ago with no
 * writer UI. Staff-only surface; `files_update_non_client` is the boundary.
 */
export default function PhotoVisibilityToggle({
  fileId,
  initial,
}: {
  fileId: string;
  initial: boolean;
}) {
  const router = useRouter();
  const [visible, setVisible] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    const next = !visible;
    const result = await updateFile(fileId, { client_visible: next });
    setBusy(false);
    if (result.success) {
      setVisible(next);
      router.refresh();
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      title={visible ? 'Visible in the client portal — click to hide' : 'Hidden from the client — click to share'}
      style={{
        position: 'absolute',
        top: '6px',
        right: '6px',
        padding: '2px 8px',
        fontSize: '10.5px',
        fontWeight: 700,
        borderRadius: '9px',
        border: 'none',
        cursor: busy ? 'wait' : 'pointer',
        backgroundColor: visible ? '#e6f0e9' : 'rgba(15, 23, 41, 0.55)',
        color: visible ? '#3d7a4b' : '#ffffff',
      }}
    >
      {visible ? 'Client ✓' : 'Share'}
    </button>
  );
}
