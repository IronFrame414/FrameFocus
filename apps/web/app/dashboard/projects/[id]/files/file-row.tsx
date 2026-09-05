'use client';

import { useState } from 'react';
import { useAlert } from '@/components/confirm/confirm-provider';
import type { FileRecord } from '@/lib/services/files';
import { hasMarkup } from '@framefocus/shared/utils/markup';
import FavoriteToggle from './favorite-toggle';
import FileRowActions from './file-row-actions';
import AiTagEditor from './ai-tag-editor';
import type { TagOption } from '@/lib/services/tag-options';

export default function FileRow({
  file,
  projectId,
  activeTags,
  categoryLabel,
}: {
  file: FileRecord;
  projectId: string;
  activeTags: TagOption[];
  /** Redesign 6.1 — the renameable label; `file.category` stays the key. */
  categoryLabel: string;
}) {
  const alert = useAlert();
  const [hover, setHover] = useState(false);
  const [busy, setBusy] = useState(false);

  // #100: an annotated photo opens/downloads as its flattened `.markup.jpg`
  // derivative so the marks are visible outside the editor (the route degrades
  // to the original if the derivative is missing).
  const annotated = hasMarkup(file.markup_data);

  async function handleRowClick() {
    if (busy) return;
    setBusy(true);
    const res = await fetch(
      `/api/files/signed-url?path=${encodeURIComponent(file.file_path)}${annotated ? '&markup=1' : ''}`
    );
    setBusy(false);
    if (!res.ok) {
      void alert('Could not open file.');
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
      <td style={cellStyle}>
        {file.file_name}
        {/* Redesign 6.1 — revisions (RULED IN): version and supersedes_id were
            stored and never rendered. A v1 with no chain renders nothing. */}
        {(file.version ?? 1) > 1 && (
          <span
            style={{
              marginLeft: '6px',
              fontSize: '0.6875rem',
              fontWeight: 700,
              color: '#3b4ae0',
              backgroundColor: '#e8ecfb',
              borderRadius: '9px',
              padding: '1px 7px',
            }}
          >
            v{file.version}
          </span>
        )}
        {file.supersedes_id && (
          <span style={{ marginLeft: '6px', fontSize: '0.6875rem', color: '#8792a8' }}>
            supersedes an earlier revision
          </span>
        )}
        {/* Per-FILE, deliberately — the design badges a category; the column
            is per-file and the badge follows the column (§8.9.1). */}
        {file.client_visible && (
          <span
            style={{
              marginLeft: '6px',
              fontSize: '0.6875rem',
              fontWeight: 700,
              color: '#3d7a4b',
              backgroundColor: '#e6f0e9',
              borderRadius: '9px',
              padding: '1px 7px',
            }}
          >
            Shared with client
          </span>
        )}
      </td>
      <td style={cellStyle}>{categoryLabel}</td>
      <td style={cellStyle} onClick={(e) => e.stopPropagation()}>
        <AiTagEditor
          fileId={file.id}
          initialTags={file.ai_tags ?? []}
          activeTags={activeTags.map((t) => ({ name: t.name }))}
        />
      </td>
      <td style={cellStyle}>{(file.file_size / 1024).toFixed(1)} KB</td>
      <td style={cellStyle} suppressHydrationWarning>
        {file.created_at ? new Date(file.created_at).toLocaleDateString() : '—'}
      </td>
      <td style={cellStyle} onClick={(e) => e.stopPropagation()}>
        <FileRowActions
          fileId={file.id}
          filePath={file.file_path}
          fileName={file.file_name}
          mimeType={file.mime_type}
          annotated={annotated}
          projectId={projectId}
        />
      </td>
    </tr>
  );
}
