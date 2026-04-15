'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { FileRecord } from '@/lib/services/files';
import { restoreFile, permanentDeleteFile } from '@/lib/services/files-client';

export default function TrashRow({
  file,
  canPermanentDelete,
}: {
  file: FileRecord;
  canPermanentDelete: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleRestore() {
    setBusy(true);
    const result = await restoreFile(file.id);
    setBusy(false);
    if (!result.success) {
      alert(`Restore failed: ${result.error}`);
      return;
    }
    router.refresh();
  }

  async function handlePermanentDelete() {
    if (
      !confirm(
        `Permanently delete "${file.file_name}"? This cannot be undone and will remove the file from storage.`
      )
    ) {
      return;
    }
    setBusy(true);
    const result = await permanentDeleteFile(file.id);
    setBusy(false);
    if (!result.success) {
      alert(`Permanent delete failed: ${result.error}`);
      return;
    }
    router.refresh();
  }

  const btnStyle = {
    padding: '0.25rem 0.5rem',
    fontSize: '0.8rem',
    background: '#fff',
    border: '1px solid #ddd',
    borderRadius: '4px',
    cursor: busy ? ('wait' as const) : ('pointer' as const),
  };

  const cellStyle = { padding: '0.75rem' };

  return (
    <tr style={{ borderBottom: '1px solid #eee' }}>
      <td style={cellStyle}>{file.file_name}</td>
      <td style={cellStyle}>{file.category}</td>
      <td style={cellStyle}>{(file.file_size / 1024).toFixed(1)} KB</td>
      <td style={cellStyle}>
        {file.deleted_at ? new Date(file.deleted_at).toLocaleDateString() : '—'}
      </td>
      <td style={cellStyle}>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={handleRestore} disabled={busy} style={btnStyle}>
            Restore
          </button>
          {canPermanentDelete && (
            <button
              onClick={handlePermanentDelete}
              disabled={busy}
              style={{ ...btnStyle, color: '#c00' }}
            >
              Delete forever
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}
