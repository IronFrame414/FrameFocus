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
// 4D-rev: a free-text summary at the top, then one level of nesting —
// named sub-category sections, each with its own bullets.

type ScopeSection = { title: string; bullets: string[] };

export function ScopeTab({ data, canEdit, reload }: TabProps) {
  const initialSections =
    (data.estimate.scope_sections as unknown as ScopeSection[] | null) ?? [];
  const [summary, setSummary] = useState(data.estimate.scope_summary ?? '');
  const [sections, setSections] = useState<ScopeSection[]>(initialSections);
  const { error, saved, run } = useSaveState();

  async function persist(nextSummary: string, nextSections: ScopeSection[]) {
    setSummary(nextSummary);
    setSections(nextSections);
    await run(async () => {
      const result = await updateEstimate(data.estimate.id, {
        scope_summary: nextSummary.trim() || null,
        scope_sections: nextSections,
      });
      if (result.success) await reload();
      return result;
    });
  }

  function moveSection(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= sections.length) return;
    const next = [...sections];
    [next[index], next[target]] = [next[target], next[index]];
    persist(summary, next);
  }

  function moveBullet(si: number, bi: number, direction: -1 | 1) {
    const bullets = sections[si].bullets;
    const target = bi + direction;
    if (target < 0 || target >= bullets.length) return;
    const nextBullets = [...bullets];
    [nextBullets[bi], nextBullets[target]] = [nextBullets[target], nextBullets[bi]];
    persist(summary, sections.map((s, i) => (i === si ? { ...s, bullets: nextBullets } : s)));
  }

  return (
    <div style={{ maxWidth: '640px' }}>
      <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>Scope of Work</h2>
      {error && <div style={errorBoxStyle}>{error}</div>}

      {/* Summary — rendered at the top of the proposal scope block */}
      <label style={{ display: 'block', fontSize: '0.8125rem', color: '#6b7280', marginBottom: '0.25rem' }}>
        Summary (shown at the top of the scope on the proposal)
      </label>
      <textarea
        value={summary}
        disabled={!canEdit}
        onChange={(e) => setSummary(e.target.value)}
        onBlur={() => persist(summary, sections)}
        rows={3}
        placeholder="A short high-level overview of the work…"
        style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', marginBottom: '1.25rem' }}
      />

      {sections.length === 0 && (
        <p style={{ fontSize: '0.875rem', color: '#9ca3af', marginBottom: '1rem' }}>
          No scope sections yet.
        </p>
      )}

      {sections.map((section, si) => (
        <div
          key={si}
          style={{
            border: '1px solid #e5e7eb',
            borderRadius: '0.375rem',
            padding: '0.75rem',
            marginBottom: '0.75rem',
          }}
        >
          {/* Section title + reorder/delete */}
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
            <button
              type="button"
              onClick={() => moveSection(si, -1)}
              disabled={!canEdit || si === 0}
              style={{ ...iconButtonStyle, opacity: !canEdit || si === 0 ? 0.4 : 1 }}
            >
              ▲
            </button>
            <button
              type="button"
              onClick={() => moveSection(si, 1)}
              disabled={!canEdit || si === sections.length - 1}
              style={{ ...iconButtonStyle, opacity: !canEdit || si === sections.length - 1 ? 0.4 : 1 }}
            >
              ▼
            </button>
            <input
              value={section.title}
              disabled={!canEdit}
              onChange={(e) =>
                setSections(sections.map((s, i) => (i === si ? { ...s, title: e.target.value } : s)))
              }
              onBlur={() => persist(summary, sections)}
              maxLength={200}
              placeholder="Section title (e.g. Demolition)"
              style={{ ...inputStyle, flex: 1, fontWeight: 600 }}
            />
            <button
              type="button"
              onClick={() => {
                if (!window.confirm(`Remove section "${section.title || 'Untitled'}"?`)) return;
                persist(summary, sections.filter((_, i) => i !== si));
              }}
              disabled={!canEdit}
              style={{ ...iconButtonStyle, color: '#991b1b', opacity: canEdit ? 1 : 0.4 }}
            >
              ✕
            </button>
          </div>

          {/* Bullets */}
          {section.bullets.map((bullet, bi) => (
            <div
              key={bi}
              style={{
                display: 'flex',
                gap: '0.5rem',
                alignItems: 'center',
                marginBottom: '0.375rem',
                marginLeft: '1rem',
              }}
            >
              <span style={{ color: '#9ca3af' }}>•</span>
              <input
                value={bullet}
                disabled={!canEdit}
                onChange={(e) =>
                  setSections(
                    sections.map((s, i) =>
                      i === si
                        ? { ...s, bullets: s.bullets.map((b, j) => (j === bi ? e.target.value : b)) }
                        : s
                    )
                  )
                }
                onBlur={() => persist(summary, sections)}
                style={{ ...inputStyle, flex: 1 }}
                placeholder="Scope item"
              />
              <button
                type="button"
                onClick={() => moveBullet(si, bi, -1)}
                disabled={!canEdit || bi === 0}
                style={{ ...iconButtonStyle, opacity: !canEdit || bi === 0 ? 0.4 : 1 }}
              >
                ▲
              </button>
              <button
                type="button"
                onClick={() => moveBullet(si, bi, 1)}
                disabled={!canEdit || bi === section.bullets.length - 1}
                style={{ ...iconButtonStyle, opacity: !canEdit || bi === section.bullets.length - 1 ? 0.4 : 1 }}
              >
                ▼
              </button>
              <button
                type="button"
                onClick={() =>
                  persist(
                    summary,
                    sections.map((s, i) =>
                      i === si ? { ...s, bullets: s.bullets.filter((_, j) => j !== bi) } : s
                    )
                  )
                }
                disabled={!canEdit}
                style={{ ...iconButtonStyle, color: '#991b1b', opacity: canEdit ? 1 : 0.4 }}
              >
                ✕
              </button>
            </div>
          ))}

          {canEdit && (
            <button
              type="button"
              onClick={() =>
                setSections(
                  sections.map((s, i) => (i === si ? { ...s, bullets: [...s.bullets, ''] } : s))
                )
              }
              style={{ ...iconButtonStyle, marginLeft: '1rem' }}
            >
              + Add Bullet
            </button>
          )}
        </div>
      ))}

      {canEdit && (
        <button
          type="button"
          onClick={() => setSections([...sections, { title: '', bullets: [] }])}
          style={buttonStyle}
        >
          + Add Section
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
