'use client';

import { useState } from 'react';
import type { FileRecord } from '@/lib/services/files';
import { hasMarkup } from '@framefocus/shared/utils/markup';
import FavoriteToggle from './favorite-toggle';
import FileRowActions from './file-row-actions';
import AiTagEditor from './ai-tag-editor';
import type { TagOption } from '@/lib/services/tag-options';
import { rowActivation } from '@/components/list-screen/row-activation';
import { useFileSheet } from '@/components/files/file-sheet';
import { sheetExportFromPath } from '@/lib/markup/export-marked';

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
  const [hover, setHover] = useState(false);

  // #100: an annotated photo opens/downloads as its flattened `.markup.jpg`
  // derivative so the marks are visible outside the editor (the route degrades
  // to the original if the derivative is missing).
  const annotated = hasMarkup(file.markup_data);

  const openFile = useFileSheet();

  // S109 #161 — the row opens the file in the SHEET over this screen (it used
  // to `window.open` a new tab). The sheet signs through the same route when it
  // opens; an annotated photo still opens as its flattened derivative (#100).
  function handleRowClick() {
    openFile({
      fileName: file.file_name,
      mimeType: annotated ? 'image/jpeg' : file.mime_type,
      resolveUrl: async () => {
        const res = await fetch(
          `/api/files/signed-url?path=${encodeURIComponent(file.file_path)}${annotated ? '&markup=1' : ''}`
        );
        if (!res.ok) return null;
        const { url } = (await res.json()) as { url?: string };
        return url ?? null;
      },
      // [S112 R1] The sheet SHOWS the display-size derivative; its Download
      // rebuilds full resolution from the original + markup_data, signing
      // both at click time (never per row at list load).
      exportBlob: annotated
        ? sheetExportFromPath({
            filePath: file.file_path,
            markup: file.markup_data,
            fileName: file.file_name,
          })
        : undefined,
    });
  }

  const cellStyle = { padding: '0.75rem' };

  return (
    <tr
      // S109 #163 — was a bare onClick: mouse-only, unannounced. The per-cell
      // stopPropagation guards below stay; the primitive's own guard is the
      // second layer for any control added later without one.
      {...rowActivation(handleRowClick, `Open ${file.file_name}`)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        borderBottom: '1px solid #eee',
        cursor: 'pointer',
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
          markup={file.markup_data}
          projectId={projectId}
        />
      </td>
    </tr>
  );
}
