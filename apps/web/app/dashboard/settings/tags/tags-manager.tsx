'use client';

import { useState } from 'react';
import {
  createTag,
  deactivateTag,
  reactivateTag,
  type TagOption,
  type TagCategory,
} from '@/lib/services/tag-options-client';

const CATEGORIES: TagCategory[] = ['trade', 'stage', 'area', 'condition', 'documentation'];

const CATEGORY_LABELS: Record<TagCategory, string> = {
  trade: 'Trade',
  stage: 'Stage',
  area: 'Area',
  condition: 'Condition',
  documentation: 'Documentation',
};

export function TagsManager({ initialTags }: { initialTags: TagOption[] }) {
  const [tags, setTags] = useState<TagOption[]>(initialTags);
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState<TagCategory>('trade');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const name = newName.trim().toLowerCase();
    if (!name) return;
    if (tags.some((t) => t.name === name)) {
      setError(`"${name}" already exists.`);
      return;
    }
    setBusy(true);
    const created = await createTag({ name, category: newCategory });
    setBusy(false);
    if (!created) {
      setError('Could not create tag. Check permissions and try again.');
      return;
    }
    setTags([...tags, created]);
    setNewName('');
  }

  async function handleToggle(tag: TagOption) {
    setBusy(true);
    const ok = tag.is_active ? await deactivateTag(tag.id) : await reactivateTag(tag.id);
    setBusy(false);
    if (!ok) {
      setError(`Could not update "${tag.name}".`);
      return;
    }
    setTags(tags.map((t) => (t.id === tag.id ? { ...t, is_active: !t.is_active } : t)));
  }

  return (
    <div>
      <form
        onSubmit={handleAdd}
        style={{
          display: 'flex',
          gap: '0.5rem',
          marginBottom: '2rem',
          padding: '1rem',
          background: '#f9fafb',
          borderRadius: '0.5rem',
        }}
      >
        <input
          type="text"
          placeholder="new tag name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          disabled={busy}
          style={{
            flex: 1,
            padding: '0.5rem',
            border: '1px solid #d1d5db',
            borderRadius: '0.25rem',
          }}
        />
        <select
          value={newCategory}
          onChange={(e) => setNewCategory(e.target.value as TagCategory)}
          disabled={busy}
          style={{ padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.25rem' }}
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={busy || !newName.trim()}
          style={{
            padding: '0.5rem 1rem',
            background: '#2563eb',
            color: 'white',
            border: 'none',
            borderRadius: '0.25rem',
            cursor: busy ? 'not-allowed' : 'pointer',
          }}
        >
          Add tag
        </button>
      </form>

      {error && (
        <div style={{ color: '#dc2626', marginBottom: '1rem', fontSize: '0.875rem' }}>{error}</div>
      )}

      {CATEGORIES.map((category) => {
        const categoryTags = tags.filter((t) => t.category === category);
        return (
          <div key={category} style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.75rem' }}>
              {CATEGORY_LABELS[category]} ({categoryTags.length})
            </h2>
            {categoryTags.length === 0 ? (
              <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>No tags in this category.</p>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {categoryTags.map((tag) => (
                  <div
                    key={tag.id}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.25rem 0.5rem 0.25rem 0.75rem',
                      background: tag.is_active ? '#dbeafe' : '#f3f4f6',
                      color: tag.is_active ? '#1e40af' : '#6b7280',
                      borderRadius: '9999px',
                      fontSize: '0.875rem',
                      textDecoration: tag.is_active ? 'none' : 'line-through',
                    }}
                  >
                    <span>{tag.name.charAt(0).toUpperCase() + tag.name.slice(1)}</span>
                    <button
                      onClick={() => handleToggle(tag)}
                      disabled={busy}
                      title={tag.is_active ? 'Deactivate' : 'Reactivate'}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: busy ? 'not-allowed' : 'pointer',
                        color: 'inherit',
                        fontSize: '0.875rem',
                        padding: '0 0.25rem',
                      }}
                    >
                      {tag.is_active ? '×' : '↺'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
