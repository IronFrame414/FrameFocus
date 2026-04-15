'use client';

import { useState } from 'react';
import type { FileRecord } from '@/lib/services/files';
import FavoriteToggle from './favorite-toggle';
import FileRowActions from './file-row-actions';

export default function FileRow({ file, projectId }: { file: FileRecord; projectId: string }) {
  const [hover, setHover] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleRowClick() {
    if (busy) return;
    setBusy(true);
    const res = await fetch(`/api/files/signed-url?path=${encodeURIComponent(file.file_path)}`);
    setBusy(false);
    if (!res.ok) {
      alert('Could not open file.');
      return;
    }
    const { url } = await res.json();
    window.open(url, '_blank');
  }

  const cellStyle = { padding: '0.75rem' };

  return (
    <tr
      onClick={handleRowClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        borderBottom: '1px solid #eee',
        cursor: busy ? 'wait' : 'pointer',
        background: hover ? '#f7f7f7' : 'transparent',
      }}
    >
      <td style={cellStyle} onClick={(e) => e.stopPropagation()}>
        <FavoriteToggle fileId={file.id} initialIsFavorite={file.is_favorite} />
      </td>
      <td style={cellStyle}>{file.file_name}</td>
      <td style={cellStyle}>{file.category}</td>
      <td style={cellStyle}>{(file.file_size / 1024).toFixed(1)} KB</td>
      <td style={cellStyle}>
        {file.created_at ? new Date(file.created_at).toLocaleDateString() : '—'}
      </td>
      <td style={cellStyle} onClick={(e) => e.stopPropagation()}>
        <FileRowActions
          fileId={file.id}
          filePath={file.file_path}
          fileName={file.file_name}
          mimeType={file.mime_type}
          projectId={projectId}
        />
      </td>
    </tr>
  );
}
