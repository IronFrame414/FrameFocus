'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { uploadFile } from '@/lib/services/files-client';
import type { FileCategory } from '@/lib/services/files';

const CATEGORIES: FileCategory[] = [
  'photos',
  'contracts',
  'plans',
  'permits',
  'invoices',
  'change_orders',
  'daily_logs',
  'receipts',
  'other',
];

export default function UploadForm({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState<FileCategory>('other');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError('Please choose a file.');
      return;
    }
    setUploading(true);
    setError(null);

    const result = await uploadFile(file, {
      project_id: projectId,
      category,
    });

    setUploading(false);

    if (!result.success) {
      setError(result.error ?? 'Upload failed.');
      return;
    }

    router.push(`/dashboard/projects/${projectId}/files`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem' }}>
          File
        </label>
        <input
          type="file"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          disabled={uploading}
        />
      </div>

      <div>
        <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem' }}>
          Category
        </label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as FileCategory)}
          disabled={uploading}
          style={{ padding: '0.5rem', width: '100%' }}
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <p style={{ color: 'red', fontSize: '0.875rem', margin: 0 }}>{error}</p>
      )}

      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button
          type="submit"
          disabled={uploading || !file}
          style={{
            padding: '0.5rem 1rem',
            background: '#000',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            cursor: uploading ? 'wait' : 'pointer',
          }}
        >
          {uploading ? 'Uploading...' : 'Upload'}
        </button>
        <button
          type="button"
          onClick={() => router.push(`/dashboard/projects/${projectId}/files`)}
          disabled={uploading}
          style={{
            padding: '0.5rem 1rem',
            background: '#fff',
            border: '1px solid #ddd',
            borderRadius: '6px',
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}