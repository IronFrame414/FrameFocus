'use client';

// Step 8 (Settings › Documents) — the file-category management UI Entry 20
// deferred to this screen: rename, reorder, add, and (custom rows only)
// delete. The KEY is the contract and it is untouchable here by construction:
// renames write `label`, order writes `sort_order`, and the DB trigger
// refuses key changes and system-row deletes independently of anything this
// component does.
//
// Company-wide rows only. Per-job custom categories are created and live on
// that job's Files upload picker; managing them here would detach them from
// the only place they are offered.

import { useEffect, useState } from 'react';
import {
  createFileCategory,
  deleteFileCategory,
  listFileCategories,
  renameFileCategory,
  reorderFileCategories,
  type FileCategoryRow,
} from '@/lib/services/file-categories-client';
import { useConfirm } from '@/components/confirm/confirm-provider';
import { color, cardStyle, font } from '@/lib/theme';

export function FileCategoriesManager() {
  const confirm = useConfirm();
  const [cats, setCats] = useState<FileCategoryRow[] | null>(null);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [newLabel, setNewLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  async function reload() {
    const rows = await listFileCategories();
    setCats(rows);
    setLabels(Object.fromEntries(rows.map((r) => [r.id, r.label])));
  }

  useEffect(() => {
    void reload();
  }, []);

  async function handleRenameBlur(row: FileCategoryRow) {
    const next = (labels[row.id] ?? '').trim();
    if (!next || next === row.label) {
      setLabels((prev) => ({ ...prev, [row.id]: row.label }));
      return;
    }
    setError(null);
    const res = await renameFileCategory(row.id, next);
    if (!res.success) {
      setError(res.error ?? 'Rename failed.');
      setLabels((prev) => ({ ...prev, [row.id]: row.label }));
      return;
    }
    setSavedId(row.id);
    setTimeout(() => setSavedId(null), 2000);
    await reload();
  }

  async function move(index: number, delta: -1 | 1) {
    if (!cats) return;
    const target = index + delta;
    if (target < 0 || target >= cats.length) return;
    const next = [...cats];
    [next[index], next[target]] = [next[target], next[index]];
    setCats(next);
    setBusy(true);
    const res = await reorderFileCategories(next.map((c) => c.id));
    setBusy(false);
    if (!res.success) {
      setError(res.error ?? 'Reorder failed.');
      await reload();
    }
  }

  async function handleAdd() {
    const label = newLabel.trim();
    if (!label) return;
    setBusy(true);
    setError(null);
    const res = await createFileCategory({ label });
    setBusy(false);
    if (!res.success) {
      setError(res.error ?? 'Could not add the category.');
      return;
    }
    setNewLabel('');
    await reload();
  }

  async function handleDelete(row: FileCategoryRow) {
    const ok = await confirm({
      title: 'Delete category',
      message: `Delete "${row.label}"? Files never delete with a category — a category still in use cannot be removed.`,
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    const res = await deleteFileCategory(row);
    setBusy(false);
    if (!res.success) {
      setError(res.error ?? 'Could not delete the category.');
      return;
    }
    await reload();
  }

  const arrowStyle: React.CSSProperties = {
    border: `1px solid ${color.inputBorder}`,
    backgroundColor: '#fff',
    borderRadius: '7px',
    padding: '2px 8px',
    fontSize: '12px',
    color: color.body,
    cursor: 'pointer',
  };

  return (
    <div style={{ ...cardStyle, padding: '18px 20px', maxWidth: '640px' }}>
      <h2 style={{ fontSize: '15.5px', fontWeight: 700, margin: '0 0 0.25rem', color: color.navy }}>
        File categories
      </h2>
      <p style={{ fontSize: '0.8125rem', color: color.muted, marginBottom: '1rem' }}>
        The categories every job&rsquo;s Files tab groups by. Rename freely — files keep their
        category through a rename. Built-in categories are written by the app itself and
        can&rsquo;t be deleted. Per-job categories are added from the job&rsquo;s file upload
        screen and managed there.
      </p>

      {error && (
        <p style={{ color: color.danger, fontSize: '0.8125rem', marginBottom: '0.75rem' }}>{error}</p>
      )}

      {cats === null ? (
        <p style={{ color: color.faint, fontSize: '0.875rem' }}>Loading…</p>
      ) : (
        <div>
          {cats.map((row, i) => (
            <div
              key={row.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.375rem 0',
                borderBottom: `1px solid ${color.rowDivider}`,
              }}
            >
              <div style={{ display: 'flex', gap: '0.25rem' }}>
                <button
                  aria-label={`Move ${row.label} up`}
                  onClick={() => void move(i, -1)}
                  disabled={busy || i === 0}
                  style={{ ...arrowStyle, opacity: i === 0 ? 0.4 : 1 }}
                >
                  ↑
                </button>
                <button
                  aria-label={`Move ${row.label} down`}
                  onClick={() => void move(i, 1)}
                  disabled={busy || i === cats.length - 1}
                  style={{ ...arrowStyle, opacity: i === cats.length - 1 ? 0.4 : 1 }}
                >
                  ↓
                </button>
              </div>
              <input
                value={labels[row.id] ?? ''}
                onChange={(e) => setLabels((prev) => ({ ...prev, [row.id]: e.target.value }))}
                onBlur={() => void handleRenameBlur(row)}
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: '0.375rem 0.625rem',
                  border: `1px solid ${color.inputBorder}`,
                  borderRadius: '7px',
                  fontSize: '0.875rem',
                  color: color.navy,
                }}
              />
              {savedId === row.id && (
                <span style={{ color: color.success, fontSize: '0.75rem' }}>Saved</span>
              )}
              <span
                style={{
                  fontFamily: font.mono,
                  fontSize: '10.5px',
                  color: color.faint,
                  minWidth: '110px',
                }}
              >
                {row.key}
              </span>
              {row.is_system ? (
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    color: color.neutralBadgeText,
                    backgroundColor: color.neutralBadgeBg,
                    borderRadius: '20px',
                    padding: '2px 9px',
                  }}
                >
                  Built-in
                </span>
              ) : (
                <button
                  onClick={() => void handleDelete(row)}
                  disabled={busy}
                  style={{ ...arrowStyle, color: color.danger }}
                >
                  Delete
                </button>
              )}
            </div>
          ))}

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.875rem' }}>
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="New company-wide category"
              style={{
                flex: 1,
                minWidth: 0,
                padding: '0.5rem 0.75rem',
                border: `1px solid ${color.inputBorder}`,
                borderRadius: '8px',
                fontSize: '0.875rem',
                color: color.navy,
              }}
            />
            <button
              onClick={() => void handleAdd()}
              disabled={busy || !newLabel.trim()}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '8px',
                backgroundColor: color.primary,
                color: '#fff',
                fontSize: '13px',
                fontWeight: 600,
                border: 'none',
                cursor: busy || !newLabel.trim() ? 'not-allowed' : 'pointer',
              }}
            >
              Add category
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
