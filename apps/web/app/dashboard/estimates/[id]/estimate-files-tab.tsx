'use client';

import { prepareImageForUpload } from '@/lib/services/files-client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { fmtMoney } from '../labels';
import { useFileSheet } from '@/components/files/file-sheet';
import { rowActivation } from '@/components/list-screen/row-activation';
import type {
  ApiErrorResponse,
  EstimateFileListResponse,
  EstimateFileListItem,
  EstimateFileUrlResponse,
} from '@/lib/api-contracts/estimate-files';

// S106 Part C — the estimate Files tab. Lists + uploads through the service-role route
// (/api/estimates/[id]/files); the ordinary files RLS blocks a PM on these project_id-NULL
// rows, so everything goes through the route, whose session check is the access floor.

// [S110 F] The row shape is the route's CONTRACT, imported — never hand-written
// again. A hand-written copy is what let #161 blank the site-visit photos.
type EstimateFile = EstimateFileListItem;

const ALLOWED = 'application/pdf,image/jpeg,image/png,image/heic,image/heif';
const MAX_MB = 25;

export default function EstimateFilesTab({
  estimateId,
  canEdit,
}: {
  estimateId: string;
  canEdit: boolean;
}) {
  const [files, setFiles] = useState<EstimateFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const openFile = useFileSheet();

  // S109 #161 — open in the SHEET, signed ON CLICK (ruling 161.B). The list no
  // longer carries URLs; before this each one was signed for 300 s at load and
  // died if clicked five minutes later.
  function open(f: EstimateFile) {
    openFile({
      fileName: f.file_name,
      mimeType: f.mime_type,
      resolveUrl: async () => {
        const res = await fetch(`/api/estimates/${estimateId}/files/${f.id}/url`);
        if (!res.ok) return null;
        const body = (await res.json()) as EstimateFileUrlResponse;
        return body.url ?? null;
      },
    });
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/estimates/${estimateId}/files`);
      const body = (await res.json()) as Partial<EstimateFileListResponse & ApiErrorResponse>;
      if (!res.ok) {
        setError(body.error ?? 'Could not load files.');
        return;
      }
      setFiles(body.files ?? []);
    } catch {
      setError('Could not load files.');
    } finally {
      setLoading(false);
    }
  }, [estimateId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(`File too large. Max size is ${MAX_MB} MB.`);
      return;
    }
    setUploading(true);
    setError(null);
    try {
      // [S111] HEIC → JPEG first, the same step every other upload runs.
      const { file: prepared } = await prepareImageForUpload(file);
      const form = new FormData();
      form.append('file', prepared);
      const res = await fetch(`/api/estimates/${estimateId}/files`, { method: 'POST', body: form });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? 'Upload failed.');
        return;
      }
      await load();
    } catch {
      setError('Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  // [S112, RULED Josh] Only a file shared here reaches a sub's bid link.
  async function toggleShared(f: EstimateFile, shared: boolean) {
    setError(null);
    const res = await fetch(`/api/estimates/${estimateId}/files/${f.id}/share`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shared }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? 'Could not update the file.');
      return;
    }
    setFiles((prev) =>
      prev.map((x) => (x.id === f.id ? { ...x, shared_with_bidders: shared } : x))
    );
  }

  const shareable = (f: EstimateFile) =>
    f.mime_type === 'application/pdf' || f.mime_type.startsWith('image/');

  const cell: React.CSSProperties = { padding: '0.5rem 0.75rem', fontSize: '0.875rem' };

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1rem',
        }}
      >
        <div style={{ fontSize: '0.8125rem', color: '#7b8699' }}>
          Attachments carry to the project on conversion. Subs can also upload to their bid link.
          Bidders see only the files you tick under “Bidders”.
        </div>
        {canEdit && (
          <>
            <button
              type="button"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
              style={{
                padding: '0.4rem 0.9rem',
                background: '#2f49d1',
                color: '#fff',
                border: 'none',
                borderRadius: '0.375rem',
                fontSize: '0.8125rem',
                fontWeight: 600,
                cursor: uploading ? 'default' : 'pointer',
                opacity: uploading ? 0.6 : 1,
              }}
            >
              {uploading ? 'Uploading…' : '+ Upload file'}
            </button>
            <input
              ref={inputRef}
              type="file"
              accept={ALLOWED}
              onChange={onPick}
              style={{ display: 'none' }}
            />
          </>
        )}
      </div>

      {error && (
        <div
          style={{
            padding: '0.5rem 0.75rem',
            borderRadius: '0.375rem',
            backgroundColor: '#fdf1f0',
            color: '#c0362c',
            fontSize: '0.8125rem',
            marginBottom: '0.75rem',
          }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <p style={{ color: '#9aa4b8', fontSize: '0.875rem' }}>Loading…</p>
      ) : files.length === 0 ? (
        <p style={{ color: '#9aa4b8', fontSize: '0.875rem' }}>
          No files yet. {canEdit ? 'Upload a PDF or image (max 25 MB).' : ''}
        </p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #e4e8ef', textAlign: 'left' }}>
              <th style={{ ...cell, color: '#7b8699', fontWeight: 600 }}>Name</th>
              <th style={{ ...cell, color: '#7b8699', fontWeight: 600, textAlign: 'right' }}>
                Size
              </th>
              <th style={{ ...cell, color: '#7b8699', fontWeight: 600 }}>Uploaded</th>
              <th style={{ ...cell, color: '#7b8699', fontWeight: 600, textAlign: 'center' }}>
                Bidders
              </th>
            </tr>
          </thead>
          <tbody>
            {files.map((f) => (
              <tr
                key={f.id}
                // #163 — the whole row opens the file; #161 — in the sheet.
                {...rowActivation(() => open(f), `Open ${f.file_name}`)}
                data-testid={`estimate-file-row-${f.id}`}
                style={{ borderBottom: '1px solid #f1f3f7', cursor: 'pointer' }}
              >
                <td style={{ ...cell, color: '#2f49d1' }}>{f.file_name}</td>
                <td
                  style={{ ...cell, textAlign: 'right', fontFamily: 'var(--font-mono, monospace)' }}
                >
                  {fmtMoney(f.file_size / 1024 / 1024).replace('$', '')} MB
                </td>
                <td style={{ ...cell, color: '#7b8699' }}>
                  {f.created_at ? new Date(f.created_at).toLocaleDateString() : '—'}
                </td>
                <td
                  style={{ ...cell, textAlign: 'center' }}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    data-testid={`estimate-file-share-${f.id}`}
                    aria-label={`Share ${f.file_name} with bidders`}
                    title={
                      shareable(f)
                        ? 'Share with bidders'
                        : 'Only PDFs and images can be shared with bidders'
                    }
                    checked={f.shared_with_bidders}
                    disabled={!canEdit || !shareable(f)}
                    onChange={(e) => void toggleShared(f, e.target.checked)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
