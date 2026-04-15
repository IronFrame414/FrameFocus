'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { softDeleteFile } from '@/lib/services/files-client';

export default function FileRowActions({
  fileId,
  filePath,
  mimeType,
  projectId,
}: {
  fileId: string;
  filePath: string;
  mimeType: string | null;
  projectId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const isImage = mimeType?.startsWith('image/') ?? false;

  async function handleDownload() {
    setBusy(true);
    const res = await fetch(`/api/files/signed-url?path=${encodeURIComponent(filePath)}`);
    setBusy(false);

    if (!res.ok) {
      alert('Could not generate download link.');
      return;
    }
    const { url } = await res.json();
    window.open(url, '_blank');
  }

  async function handleDelete() {
    if (!confirm('Move this file to trash?')) return;
    setBusy(true);
    const result = await softDeleteFile(fileId);
    setBusy(false);

    if (!result.success) {
      alert(`Delete failed: ${result.error}`);
      return;
    }
    router.refresh();
  }

  return (
    <div style={{ display: 'flex', gap: '0.5rem' }}>
      {isImage && (
        <Link
          href={`/dashboard/projects/${projectId}/files/${fileId}/markup`}
          style={{
            padding: '0.25rem 0.5rem',
            fontSize: '0.8rem',
            background: '#fff',
            border: '1px solid #ddd',
            borderRadius: '4px',
            textDecoration: 'none',
            color: '#000',
          }}
        >
          Markup
        </Link>
      )}
      <button
        onClick={handleDownload}
        disabled={busy}
        style={{
          padding: '0.25rem 0.5rem',
          fontSize: '0.8rem',
          background: '#fff',
          border: '1px solid #ddd',
          borderRadius: '4px',
          cursor: busy ? 'wait' : 'pointer',
        }}
      >
        Download
      </button>
      <button
        onClick={handleDelete}
        disabled={busy}
        style={{
          padding: '0.25rem 0.5rem',
          fontSize: '0.8rem',
          background: '#fff',
          border: '1px solid #ddd',
          color: '#c00',
          borderRadius: '4px',
          cursor: busy ? 'wait' : 'pointer',
        }}
      >
        Delete
      </button>
    </div>
  );
}
