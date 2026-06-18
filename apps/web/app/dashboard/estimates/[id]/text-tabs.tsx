'use client';

import { useState } from 'react';
import { TermsSection, updateEstimate } from '@/lib/services/estimates-client';
import { termsSectionSchema } from '@framefocus/shared/validation/estimate';
import type { TabProps } from './estimate-builder';

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.5rem 0.75rem',
  border: '1px solid #d1d5db',
  borderRadius: '0.375rem',
  fontSize: '0.875rem',
};
const buttonStyle: React.CSSProperties = {
  padding: '0.5rem 1rem',
  fontSize: '0.875rem',
  backgroundColor: '#f3f4f6',
  border: '1px solid #d1d5db',
  borderRadius: '0.375rem',
  cursor: 'pointer',
};
const iconButtonStyle: React.CSSProperties = {
  padding: '0.25rem 0.5rem',
  fontSize: '0.75rem',
  backgroundColor: '#f3f4f6',
  border: '1px solid #d1d5db',
  borderRadius: '0.25rem',
  cursor: 'pointer',
};
const errorBoxStyle: React.CSSProperties = {
  padding: '0.75rem 1rem',
  borderRadius: '0.375rem',
  marginBottom: '1rem',
  backgroundColor: '#fef2f2',
  color: '#991b1b',
  fontSize: '0.875rem',
};
const savedStyle: React.CSSProperties = {
  color: '#166534',
  fontSize: '0.75rem',
  marginTop: '0.5rem',
};

function useSaveState() {
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function run(fn: () => Promise<{ success: boolean; error?: string }>) {
    setError(null);
    const result = await fn();
    if (result.success) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } else {
      setError(result.error || 'Save failed');
    }
    return result;
  }

  return { error, saved, run };
}

// ── Terms tab ──
// Same editor shape as 4M, bound to estimates.terms_sections. The
// estimate's copy was seeded from the company default at creation;
// edits here never touch the company default.

export function TermsTab({ data, canEdit, reload }: TabProps) {
  const initial = (data.estimate.terms_sections as unknown as TermsSection[] | null) ?? [];
  const [terms, setTerms] = useState<TermsSection[]>(initial);
  const { error, saved, run } = useSaveState();

  async function persist(next: TermsSection[]) {
    setTerms(next);
    for (const section of next) {
      const parsed = termsSectionSchema.safeParse(section);
      if (!parsed.success) return; // incomplete row — save on next valid blur
    }
    await run(async () => {
      const result = await updateEstimate(data.estimate.id, {
        terms_sections: next,
      });
      if (result.success) await reload();
      return result;
    });
  }

  function update(index: number, patch: Partial<TermsSection>) {
    setTerms(terms.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= terms.length) return;
    const next = [...terms];
    [next[index], next[target]] = [next[target], next[index]];
    persist(next);
  }

  function remove(index: number) {
    const name = terms[index].name || 'this section';
    if (!window.confirm(`Remove "${name}" from this estimate's terms?`)) return;
    persist(terms.filter((_, i) => i !== index));
  }

  return (
    <div style={{ maxWidth: '640px' }}>
      <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>
        Terms &amp; Conditions
      </h2>
      {error && <div style={errorBoxStyle}>{error}</div>}
      {terms.length === 0 && (
        <p style={{ fontSize: '0.875rem', color: '#9ca3af', marginBottom: '1rem' }}>
          No terms sections on this estimate.
        </p>
      )}
      {terms.map((section, i) => (
        <div
          key={i}
          style={{
            border: '1px solid #e5e7eb',
            borderRadius: '0.375rem',
            padding: '0.75rem',
            marginBottom: '0.75rem',
          }}
        >
          <div
            style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}
          >
            <button
              type="button"
              onClick={() => move(i, -1)}
              disabled={!canEdit || i === 0}
              style={{ ...iconButtonStyle, opacity: !canEdit || i === 0 ? 0.4 : 1 }}
            >
              ▲
            </button>
            <button
              type="button"
              onClick={() => move(i, 1)}
              disabled={!canEdit || i === terms.length - 1}
              style={{ ...iconButtonStyle, opacity: !canEdit || i === terms.length - 1 ? 0.4 : 1 }}
            >
              ▼
            </button>
            <input
              value={section.name}
              disabled={!canEdit}
              onChange={(e) => update(i, { name: e.target.value })}
              onBlur={() => persist(terms)}
              maxLength={100}
              placeholder="Section name"
              style={{ ...inputStyle, flex: 1 }}
            />
            <button
              type="button"
              onClick={() => remove(i)}
              disabled={!canEdit}
              style={{ ...iconButtonStyle, color: '#991b1b', opacity: canEdit ? 1 : 0.4 }}
            >
              ✕
            </button>
          </div>
          <textarea
            value={section.content}
            disabled={!canEdit}
            onChange={(e) => update(i, { content: e.target.value })}
            onBlur={() => persist(terms)}
            rows={4}
            placeholder="Section content (plain text)"
            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
          />
        </div>
      ))}
      {canEdit && (
        <button
          type="button"
          onClick={() => setTerms([...terms, { name: '', content: '' }])}
          style={buttonStyle}
        >
          + Add Section
        </button>
      )}
      {saved && <div style={savedStyle}>Saved</div>}
    </div>
  );
}

// ── Scope of Work tab ──

export function ScopeTab({ data, canEdit, reload }: TabProps) {
  const [bullets, setBullets] = useState<string[]>(data.estimate.scope_of_work ?? []);
  const { error, saved, run } = useSaveState();

  async function persist(next: string[]) {
    setBullets(next);
    await run(async () => {
      const result = await updateEstimate(data.estimate.id, { scope_of_work: next });
      if (result.success) await reload();
      return result;
    });
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= bullets.length) return;
    const next = [...bullets];
    [next[index], next[target]] = [next[target], next[index]];
    persist(next);
  }

  return (
    <div style={{ maxWidth: '640px' }}>
      <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>Scope of Work</h2>
      {error && <div style={errorBoxStyle}>{error}</div>}
      {bullets.length === 0 && (
        <p style={{ fontSize: '0.875rem', color: '#9ca3af', marginBottom: '1rem' }}>
          No scope bullets yet.
        </p>
      )}
      {bullets.map((bullet, i) => (
        <div
          key={i}
          style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}
        >
          <span style={{ color: '#9ca3af' }}>•</span>
          <input
            value={bullet}
            disabled={!canEdit}
            onChange={(e) =>
              setBullets(bullets.map((b, j) => (j === i ? e.target.value : b)))
            }
            onBlur={() => persist(bullets)}
            style={{ ...inputStyle, flex: 1 }}
            placeholder="Scope item"
          />
          <button
            type="button"
            onClick={() => move(i, -1)}
            disabled={!canEdit || i === 0}
            style={{ ...iconButtonStyle, opacity: !canEdit || i === 0 ? 0.4 : 1 }}
          >
            ▲
          </button>
          <button
            type="button"
            onClick={() => move(i, 1)}
            disabled={!canEdit || i === bullets.length - 1}
            style={{
              ...iconButtonStyle,
              opacity: !canEdit || i === bullets.length - 1 ? 0.4 : 1,
            }}
          >
            ▼
          </button>
          <button
            type="button"
            onClick={() => persist(bullets.filter((_, j) => j !== i))}
            disabled={!canEdit}
            style={{ ...iconButtonStyle, color: '#991b1b', opacity: canEdit ? 1 : 0.4 }}
          >
            ✕
          </button>
        </div>
      ))}
      {canEdit && (
        <button type="button" onClick={() => setBullets([...bullets, ''])} style={buttonStyle}>
          + Add Bullet
        </button>
      )}
      {saved && <div style={savedStyle}>Saved</div>}
    </div>
  );
}

// ── Cover Sheet tab ──

export function CoverTab({ data, canEdit, reload }: TabProps) {
  const [text, setText] = useState(data.estimate.cover_letter ?? '');
  const { error, saved, run } = useSaveState();

  return (
    <div style={{ maxWidth: '640px' }}>
      <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>Cover Letter</h2>
      {error && <div style={errorBoxStyle}>{error}</div>}
      <textarea
        value={text}
        disabled={!canEdit}
        onChange={(e) => setText(e.target.value)}
        onBlur={() =>
          run(async () => {
            const result = await updateEstimate(data.estimate.id, {
              cover_letter: text.trim() || null,
            });
            if (result.success) await reload();
            return result;
          })
        }
        rows={12}
        placeholder="A short introduction shown on the first page of the proposal…"
        style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
      />
      {saved && <div style={savedStyle}>Saved</div>}
    </div>
  );
}

// ── Notes tab (internal_notes — never on the proposal) ──

export function NotesTab({ data, canEdit, reload }: TabProps) {
  const [text, setText] = useState(data.estimate.internal_notes ?? '');
  const { error, saved, run } = useSaveState();

  return (
    <div style={{ maxWidth: '640px' }}>
      <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>Internal Notes</h2>
      <p
        style={{
          fontSize: '0.8125rem',
          color: '#92400e',
          backgroundColor: '#fffbeb',
          padding: '0.5rem 0.75rem',
          borderRadius: '0.375rem',
          marginBottom: '1rem',
        }}
      >
        Internal notes. Never shown on the proposal.
      </p>
      {error && <div style={errorBoxStyle}>{error}</div>}
      <textarea
        value={text}
        disabled={!canEdit}
        onChange={(e) => setText(e.target.value)}
        onBlur={() =>
          run(async () => {
            const result = await updateEstimate(data.estimate.id, {
              internal_notes: text.trim() || null,
            });
            if (result.success) await reload();
            return result;
          })
        }
        rows={12}
        placeholder="Notes for your team…"
        style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
      />
      {saved && <div style={savedStyle}>Saved</div>}
    </div>
  );
}

// ── Files tab (4L placeholder — sidebar renders, body disabled) ──

export function FilesTab() {
  return (
    <div
      style={{
        padding: '3rem',
        textAlign: 'center',
        color: '#9ca3af',
        border: '1px dashed #d1d5db',
        borderRadius: '0.5rem',
        fontSize: '0.875rem',
      }}
    >
      File attachments coming soon.
    </div>
  );
}
