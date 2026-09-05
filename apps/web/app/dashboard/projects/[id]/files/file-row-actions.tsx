'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useConfirm, useAlert } from '@/components/confirm/confirm-provider';
import { softDeleteFile } from '@/lib/services/files-client';

export default function FileRowActions({
  fileId,
  filePath,
  fileName,
  mimeType,
  annotated = false,
  projectId,
}: {
  fileId: string;
  filePath: string;
  fileName: string;
  mimeType: string | null;
  /** #100: file has markup — download the flattened `.markup.jpg` derivative. */
  annotated?: boolean;
  projectId: string;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const alert = useAlert();
  const [busy, setBusy] = useState(false);
  const isImage = mimeType?.startsWith('image/') ?? false;

  async function getSignedUrl(): Promise<string | null> {
    const res = await fetch(
      `/api/files/signed-url?path=${encodeURIComponent(filePath)}${annotated ? '&markup=1' : ''}`
    );
    if (!res.ok) return null;
    const { url } = await res.json();
    return url;
  }

  async function handleDownload() {
    setBusy(true);
    const url = await getSignedUrl();
    setBusy(false);
    if (!url) {
      void alert('Could not generate download link.');
      return;
    }
    // Append ?download=<filename> to force browser to download with original name.
    const separator = url.includes('?') ? '&' : '?';
    window.open(`${url}${separator}download=${encodeURIComponent(fileName)}`, '_blank');
  }

  async function handleDelete() {
    if (!(await confirm('Move this file to trash?'))) return;
    setBusy(true);
    const result = await softDeleteFile(fileId);
    setBusy(false);
    if (!result.success) {
      void alert(`Delete failed: ${result.error}`);
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

  return (
    <div style={{ display: 'flex', gap: '0.5rem' }}>
      {isImage && (
        <Link
          href={`/dashboard/projects/${projectId}/files/${fileId}/markup`}
          style={{
            ...btnStyle,
            textDecoration: 'none',
            color: '#000',
          }}
        >
          Markup
        </Link>
      )}
      <button onClick={handleDownload} disabled={busy} style={btnStyle}>
        Download
      </button>
      <button onClick={handleDelete} disabled={busy} style={{ ...btnStyle, color: '#c00' }}>
        Delete
      </button>
    </div>
  );
}
