'use client';

import { useState } from 'react';
import { updateFile } from '@/lib/services/files-client';

const MAX_TAGS = 4;

const pillStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.25rem',
  fontSize: '0.75rem',
  padding: '0.125rem 0.5rem',
  borderRadius: '9999px',
  background: '#EDE9FE',
  color: '#6D28D9',
};

const removeButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: '#6D28D9',
  fontSize: '0.75rem',
  padding: 0,
  lineHeight: 1,
};

const addButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.25rem',
  fontSize: '0.75rem',
  padding: '0.125rem 0.5rem',
  borderRadius: '9999px',
  background: '#F3F4F6',
  color: '#374151',
  border: 'none',
  cursor: 'pointer',
};

const dropdownStyle: React.CSSProperties = {
  position: 'absolute',
  top: '100%',
  left: 0,
  marginTop: '0.25rem',
  background: '#fff',
  border: '1px solid #ddd',
  borderRadius: '6px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
  maxHeight: '150px',
  overflowY: 'auto',
  zIndex: 10,
  minWidth: '8rem',
};

export default function AiTagEditor({
  fileId,
  initialTags,
  activeTags,
}: {
  fileId: string;
  initialTags: string[];
  activeTags: { name: string }[];
}) {
  const [tags, setTags] = useState<string[]>(initialTags);
  const [open, setOpen] = useState(false);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);

  async function handleRemove(e: React.MouseEvent, tag: string) {
    e.stopPropagation();
    const previous = tags;
    const next = tags.filter((t) => t !== tag);
    setTags(next);
    const result = await updateFile(fileId, { ai_tags: next });
    if (!result.success) {
      setTags(previous);
      console.error('Failed to remove tag', result.error);
    }
  }

  async function handleAdd(e: React.MouseEvent, tag: string) {
    e.stopPropagation();
    if (tags.includes(tag) || tags.length >= MAX_TAGS) return;
    const previous = tags;
    const next = [...tags, tag];
    setTags(next);
    setOpen(false);
    const result = await updateFile(fileId, { ai_tags: next });
    if (!result.success) {
      setTags(previous);
      console.error('Failed to add tag', result.error);
    }
  }

  function toggleDropdown(e: React.MouseEvent) {
    e.stopPropagation();
    setOpen((o) => !o);
  }

  const available = activeTags.filter((t) => !tags.includes(t.name));
  const canAdd = tags.length < MAX_TAGS;

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.25rem',
        alignItems: 'center',
      }}
    >
      {tags.map((tag) => (
        <span key={tag} style={pillStyle}>
          ✦ {tag}
          <button
            type="button"
            onClick={(e) => handleRemove(e, tag)}
            aria-label={`Remove ${tag}`}
            style={removeButtonStyle}
          >
            ×
          </button>
        </span>
      ))}

      {canAdd && (
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={toggleDropdown}
            aria-label="Add tag"
            style={addButtonStyle}
          >
            +
          </button>
          {open && available.length > 0 && (
            <div style={dropdownStyle} onClick={(e) => e.stopPropagation()}>
              {available.map((t) => (
                <div
                  key={t.name}
                  onClick={(e) => handleAdd(e, t.name)}
                  onMouseEnter={() => setHoveredItem(t.name)}
                  onMouseLeave={() => setHoveredItem(null)}
                  style={{
                    padding: '0.5rem',
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    background: hoveredItem === t.name ? '#f5f5f5' : 'transparent',
                  }}
                >
                  {t.name}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
