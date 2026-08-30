'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { uploadFile } from '@/lib/services/files-client';
import {
  createFileCategory,
  listFileCategories,
  type FileCategoryRow,
} from '@/lib/services/file-categories-client';
import { getStorageStatus, type StorageStatus } from '@/lib/services/storage-status-client';
import { StorageLimitNotice } from '@/components/storage/storage-limit-notice';

// Redesign 6.1 — the picker now reads per-company `file_categories` (labels
// renameable, keys stable). MANUAL_KEYS is unchanged from the old hardcoded
// list and still deliberately excludes the app-written categories (safety,
// deliveries, compliance, lien_releases, selections — see files.ts: a manual
// upload into 'selections' would be hard-removed by the next spec-sheet
// generation). Custom rows are per-job and always offered.
const MANUAL_KEYS = new Set([
  'photos',
  'contracts',
  'plans',
  'permits',
  'invoices',
  'change_orders',
  'daily_logs',
  'receipts',
  'other',
]);

export default function UploadForm({
  projectId,
  canEmptyTrash = false,
}: {
  projectId: string;
  canEmptyTrash?: boolean;
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState<string>('other');
  const [categories, setCategories] = useState<FileCategoryRow[]>([]);
  const [addingCategory, setAddingCategory] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set when the CAP refuses — renders the limit notice, never an error
  // [spec §2: a limit with four ways out].
  const [limited, setLimited] = useState<StorageStatus | null>(null);

  useEffect(() => {
    listFileCategories(projectId).then(setCategories);
  }, [projectId]);

  const offered = categories.filter((c) => !c.is_system || MANUAL_KEYS.has(c.key));

  async function handleAddCategory() {
    const result = await createFileCategory({ label: newLabel, projectId });
    if (!result.success) {
      setError(result.error ?? 'Could not create the category.');
      return;
    }
    setError(null);
    setNewLabel('');
    setAddingCategory(false);
    const rows = await listFileCategories(projectId);
    setCategories(rows);
    if (result.key) setCategory(result.key);
  }

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
      if (result.storageLimited) {
        setLimited(await getStorageStatus());
        setError(null);
        setUploading(false);
        return;
      }
      setError(result.error ?? 'Upload failed.');
      return;
    }

    // Fire-and-forget: auto-tag images via AI
    if (result.id && file.type.startsWith('image/')) {
      fetch('/api/files/auto-tag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId: result.id }),
      }).catch(() => {});
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
          onChange={(e) => setCategory(e.target.value)}
          disabled={uploading}
          style={{ padding: '0.5rem', width: '100%' }}
        >
          {offered.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
        {/* Custom per-job categories (RULED IN). Creation is Owner/Admin by
            RLS — anyone else gets the policy's refusal surfaced as the error. */}
        {!addingCategory ? (
          <button
            type="button"
            onClick={() => setAddingCategory(true)}
            disabled={uploading}
            style={{
              marginTop: '0.375rem',
              border: 'none',
              background: 'none',
              padding: 0,
              fontSize: '0.8125rem',
              color: '#3b4ae0',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            + New category for this job
          </button>
        ) : (
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.375rem' }}>
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Category name"
              style={{ padding: '0.375rem 0.5rem', flexGrow: 1, border: '1px solid #d5dae4', borderRadius: '6px', fontSize: '0.8125rem' }}
            />
            <button type="button" onClick={handleAddCategory} style={{ fontSize: '0.8125rem' }}>
              Add
            </button>
            <button
              type="button"
              onClick={() => {
                setAddingCategory(false);
                setNewLabel('');
              }}
              style={{ fontSize: '0.8125rem' }}
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {limited && (
        <StorageLimitNotice
          status={limited}
          canEmptyTrash={canEmptyTrash}
          projectId={projectId}
          onFreedSpace={() => setLimited(null)}
        />
      )}
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