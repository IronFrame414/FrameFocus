'use client';
import { useState } from 'react';
import { useFileSheet } from '@/components/files/file-sheet';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useConfirm, useAlert } from '@/components/confirm/confirm-provider';
import { softDeleteFile } from '@/lib/services/files-client';
import { sheetExportFromPath } from '@/lib/markup/export-marked';

export default function FileRowActions({
  fileId,
  filePath,
  fileName,
  mimeType,
  annotated = false,
  markup = null,
  projectId,
}: {
  fileId: string;
  filePath: string;
  fileName: string;
  mimeType: string | null;
  /** #100: file has markup — download the flattened `.markup.jpg` derivative. */
  annotated?: boolean;
  /**
   * [S112 R1] `files.markup_data` — the sheet's Download rebuilds the marked
   * image at full resolution from it (the derivative is display-size).
   */
  markup?: unknown;
  projectId: string;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const alert = useAlert();
  const [busy, setBusy] = useState(false);
  const openFile = useFileSheet();
  const isImage = mimeType?.startsWith('image/') ?? false;

  async function getSignedUrl(): Promise<string | null> {
    const res = await fetch(
      `/api/files/signed-url?path=${encodeURIComponent(filePath)}${annotated ? '&markup=1' : ''}`
    );
    if (!res.ok) return null;
    const { url } = await res.json();
    return url;
  }

  // S110 E3 [RULED Josh, Q10 → A] — the last forced download on this row now
  // opens the SHEET, like the row itself (S109) and the three S109 buttons.
  // _Superseded, quoted:_ `window.open(url + '?download=' + fileName, '_blank')`.
  // The sheet's own Download action still saves under the original name.
  function handleDownload() {
    openFile({
      fileName,
      mimeType,
      resolveUrl: getSignedUrl,
      exportBlob: annotated ? sheetExportFromPath({ filePath, markup, fileName }) : undefined,
    });
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
      <button onClick={handleDownload} disabled={busy} style={btnStyle} data-testid={`file-view-${fileId}`}>
        View
      </button>
      <button onClick={handleDelete} disabled={busy} style={{ ...btnStyle, color: '#c00' }}>
        Delete
      </button>
    </div>
  );
}
