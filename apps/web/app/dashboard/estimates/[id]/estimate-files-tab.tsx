'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fmtMoney } from '../labels';

// S106 Part C — the estimate Files tab. Lists + uploads through the service-role route
// (/api/estimates/[id]/files); the ordinary files RLS blocks a PM on these project_id-NULL
// rows, so everything goes through the route, whose session check is the access floor.

interface EstimateFile {
  id: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  created_at: string | null;
  url: string | null;
}

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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/estimates/${estimateId}/files`);
      const body = await res.json();
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
      const form = new FormData();
      form.append('file', file);
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

  const cell: React.CSSProperties = { padding: '0.5rem 0.75rem', fontSize: '0.875rem' };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div style={{ fontSize: '0.8125rem', color: '#7b8699' }}>
          Attachments carry to the project on conversion. Subs can also upload to their bid link.
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
        <div style={{ padding: '0.5rem 0.75rem', borderRadius: '0.375rem', backgroundColor: '#fdf1f0', color: '#c0362c', fontSize: '0.8125rem', marginBottom: '0.75rem' }}>
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
              <th style={{ ...cell, color: '#7b8699', fontWeight: 600, textAlign: 'right' }}>Size</th>
              <th style={{ ...cell, color: '#7b8699', fontWeight: 600 }}>Uploaded</th>
            </tr>
          </thead>
          <tbody>
            {files.map((f) => (
              <tr key={f.id} style={{ borderBottom: '1px solid #f1f3f7' }}>
                <td style={cell}>
                  {f.url ? (
                    <a href={f.url} target="_blank" rel="noopener noreferrer" style={{ color: '#2f49d1', textDecoration: 'none' }}>
                      {f.file_name}
                    </a>
                  ) : (
                    f.file_name
                  )}
                </td>
                <td style={{ ...cell, textAlign: 'right', fontFamily: 'var(--font-mono, monospace)' }}>
                  {fmtMoney(f.file_size / 1024 / 1024).replace('$', '')} MB
                </td>
                <td style={{ ...cell, color: '#7b8699' }}>
                  {f.created_at ? new Date(f.created_at).toLocaleDateString() : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
