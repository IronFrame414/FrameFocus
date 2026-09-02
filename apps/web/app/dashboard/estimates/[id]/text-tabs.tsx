'use client';

import { useEffect, useState } from 'react';
import { TermsSection, updateEstimate } from '@/lib/services/estimates-client';
import { termsSectionSchema } from '@framefocus/shared/validation/estimate';
import { useConfirm } from '@/components/confirm/confirm-provider';
import { createClient } from '@/lib/supabase-browser';
import { listEstimateEvents, type EstimateEvent } from '@/lib/services/estimate-events-client';
import {
  listScopeLibrary,
  createScopeSection,
  type ScopeLibraryItem,
  type ScopeSectionKind,
} from '@/lib/services/scope-library-client';
import { color, font } from '@/lib/theme';
import { fmtMoney } from '../labels';
import type { TabProps } from './estimate-builder';

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.5rem 0.75rem',
  border: '1px solid #d5dae4',
  borderRadius: '0.375rem',
  fontSize: '0.875rem',
};
const buttonStyle: React.CSSProperties = {
  padding: '0.5rem 1rem',
  fontSize: '0.875rem',
  backgroundColor: '#f4f6fa',
  border: '1px solid #d5dae4',
  borderRadius: '0.375rem',
  cursor: 'pointer',
};
const iconButtonStyle: React.CSSProperties = {
  padding: '0.25rem 0.5rem',
  fontSize: '0.75rem',
  backgroundColor: '#f4f6fa',
  border: '1px solid #d5dae4',
  borderRadius: '0.25rem',
  cursor: 'pointer',
};
const errorBoxStyle: React.CSSProperties = {
  padding: '0.75rem 1rem',
  borderRadius: '0.375rem',
  marginBottom: '1rem',
  backgroundColor: '#fdf1f0',
  color: '#c0362c',
  fontSize: '0.875rem',
};
const savedStyle: React.CSSProperties = {
  color: '#1f8f4e',
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

const INVOICE_DUE_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: 'Not set' },
  { value: 0, label: 'On receipt' },
  { value: 15, label: 'Net 15' },
  { value: 30, label: 'Net 30' },
  { value: 45, label: 'Net 45' },
  { value: 60, label: 'Net 60' },
];

const monoNum: React.CSSProperties = { fontFamily: font.mono, fontWeight: 600, color: color.navy };

export function TermsTab({ data, canEdit, reload }: TabProps) {
  const est = data.estimate;
  const initial = (est.terms_sections as unknown as TermsSection[] | null) ?? [];
  const [terms, setTerms] = useState<TermsSection[]>(initial);
  const [deposit, setDeposit] = useState(est.deposit_percent != null ? String(est.deposit_percent) : '');
  const [retainage, setRetainage] = useState(est.retainage_percent != null ? String(est.retainage_percent) : '');
  const [invoiceDue, setInvoiceDue] = useState<number | null>(est.invoice_due_days ?? null);
  const [defaults, setDefaults] = useState<{ deposit: number | null; retainage: number | null } | null>(null);
  // undefined = still loading; null = no default agreement set.
  const [agreement, setAgreement] = useState<{ name: string } | null | undefined>(undefined);
  const { error, saved, run } = useSaveState();
  const confirm = useConfirm();
  const grandTotal = Number(est.grand_total ?? 0);
  const depositAmount = deposit === '' ? null : (Number(deposit) / 100) * grandTotal;

  // 16c "changed from default" — company baselines, self-fetched (companies RLS
  // returns only the caller's row). Matches the ClientActivityCard self-fetch
  // pattern rather than plumbing the shell loader. [Phase 2 default.]
  useEffect(() => {
    createClient()
      .from('companies')
      .select('default_deposit_percent, default_retainage_percent')
      .maybeSingle()
      .then(({ data: co }) =>
        setDefaults(
          co ? { deposit: co.default_deposit_percent, retainage: co.default_retainage_percent } : null
        )
      );
  }, []);

  // 16c right rail — the agreement that prints behind the proposal and is signed
  // with it. It lives in Company Settings (contract_templates, is_default); the
  // estimate only chooses whether to attach it (include_client_contract). We show
  // the name, never a fabricated page count.
  useEffect(() => {
    createClient()
      .from('contract_templates')
      .select('name')
      .eq('is_default', true)
      .eq('is_deleted', false)
      .order('created_at', { ascending: true })
      .limit(1) // one default agreement per company; any is fine (existence + name)
      .maybeSingle()
      .then(({ data: tpl }) => setAgreement(tpl ? { name: tpl.name } : null));
  }, []);

  // Structured payment-terms writes (migration #2 columns). Autosave, same
  // updateEstimate → reload contract; draft-gated by the service + RLS + trigger.
  async function saveTerm(patch: Parameters<typeof updateEstimate>[1]) {
    await run(async () => {
      const result = await updateEstimate(est.id, patch);
      if (result.success) await reload();
      return result;
    });
  }

  const changed: string[] = [];
  if (defaults) {
    const dep = deposit === '' ? null : Number(deposit);
    const ret = retainage === '' ? null : Number(retainage);
    if (dep != null && defaults.deposit != null && dep !== defaults.deposit) {
      const cash = ((defaults.deposit - dep) / 100) * grandTotal;
      changed.push(
        `Deposit is ${dep}% here; your company default is ${defaults.deposit}%.` +
          (cash > 0
            ? ` Taking ${dep}% instead of ${defaults.deposit}% means ${fmtMoney(cash)} less cash before you start buying material.`
            : '')
      );
    }
    if (ret != null && defaults.retainage != null && ret !== defaults.retainage) {
      changed.push(`Retainage is ${ret}% here; your default holds ${defaults.retainage}%.`);
    }
  }

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

  async function remove(index: number) {
    const name = terms[index].name || 'this section';
    if (!(await confirm(`Remove "${name}" from this estimate's terms?`))) return;
    persist(terms.filter((_, i) => i !== index));
  }

  return (
    <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <div style={{ flex: '1 1 480px', maxWidth: '640px', minWidth: 0 }}>
      <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>
        Terms &amp; Conditions
      </h2>
      {error && <div style={errorBoxStyle}>{error}</div>}

      {/* 16c — structured payment terms (migration #2). These drive the invoices. */}
      <div
        style={{
          border: `1.5px solid ${color.warning}`,
          borderRadius: '14px',
          padding: '16px 18px',
          marginBottom: '1rem',
          background: color.cardBg,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <span style={{ fontWeight: 700, fontSize: '0.95rem', color: color.navy }}>Payment terms</span>
          <span style={{ fontSize: '0.7rem', color: color.muted }}>
            Structured, not prose — these drive the invoices
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
          <label style={{ fontSize: '0.75rem', color: color.body }}>
            Deposit %
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
              <input
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={deposit}
                disabled={!canEdit}
                onChange={(e) => setDeposit(e.target.value)}
                onBlur={() => saveTerm({ deposit_percent: deposit === '' ? null : Number(deposit) })}
                style={{ ...inputStyle, ...monoNum, width: '5rem' }}
              />
              <span style={{ fontSize: '0.75rem', color: color.muted, fontFamily: font.mono }}>
                {depositAmount != null ? fmtMoney(depositAmount) : '—'}
              </span>
            </div>
          </label>
          <label style={{ fontSize: '0.75rem', color: color.body }}>
            Retainage %
            <input
              type="number"
              min="0"
              max="100"
              step="0.5"
              value={retainage}
              disabled={!canEdit}
              onChange={(e) => setRetainage(e.target.value)}
              onBlur={() => saveTerm({ retainage_percent: retainage === '' ? null : Number(retainage) })}
              style={{ ...inputStyle, ...monoNum, width: '5rem', marginTop: '0.25rem' }}
            />
          </label>
          <label style={{ fontSize: '0.75rem', color: color.body }}>
            Invoice due
            <select
              value={invoiceDue === null ? '' : String(invoiceDue)}
              disabled={!canEdit}
              onChange={(e) => {
                const v = e.target.value === '' ? null : Number(e.target.value);
                setInvoiceDue(v);
                saveTerm({ invoice_due_days: v });
              }}
              style={{ ...inputStyle, marginTop: '0.25rem' }}
            >
              {INVOICE_DUE_OPTIONS.map((o) => (
                <option key={String(o.value)} value={o.value === null ? '' : String(o.value)}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p style={{ fontSize: '0.7rem', color: color.muted, margin: '0.75rem 0 0' }}>
          As fields they populate the deposit invoice, the retainage held on every draw, and the due
          date — no re-typing, and the printed terms stay in sync.
        </p>
      </div>

      {/* Changed from default — a one-off edit is never invisible. */}
      {changed.length > 0 && (
        <div
          style={{
            border: `1.5px solid ${color.warning}`,
            borderRadius: '14px',
            padding: '14px 16px',
            marginBottom: '1rem',
            background: '#fffdf7',
          }}
        >
          <div style={{ fontWeight: 700, fontSize: '0.85rem', color: color.navy, marginBottom: '0.5rem' }}>
            Changed from default
          </div>
          {changed.map((c, i) => (
            <div key={i} style={{ fontSize: '0.78rem', color: color.body, marginTop: '0.4rem' }}>
              • {c}
            </div>
          ))}
        </div>
      )}

      {terms.length === 0 && (
        <p style={{ fontSize: '0.875rem', color: '#9aa4b8', marginBottom: '1rem' }}>
          No terms sections on this estimate.
        </p>
      )}
      {terms.map((section, i) => (
        <div
          key={i}
          style={{
            border: '1px solid #e4e8ef',
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
              style={{ ...iconButtonStyle, color: '#c0362c', opacity: canEdit ? 1 : 0.4 }}
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

      {/* 16c right rail — the attached agreement (handoff §; from Company Settings). */}
      <aside style={{ flex: '0 0 260px', maxWidth: '300px' }}>
        <div
          style={{
            background: '#fff',
            border: `1px solid ${color.cardBorder}`,
            borderRadius: '14px',
            padding: '18px 20px',
          }}
        >
          <div
            style={{
              fontFamily: font.mono,
              fontSize: '0.66rem',
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: color.muted,
              marginBottom: '0.75rem',
            }}
          >
            Attached agreement
          </div>
          {agreement === undefined ? (
            <p style={{ fontSize: '0.8rem', color: color.faint, margin: 0 }}>Loading…</p>
          ) : !est.include_client_contract ? (
            <p style={{ fontSize: '0.8rem', color: color.muted, margin: 0 }}>
              No agreement is attached to this proposal. Turn this on in the Details tab; the form is
              chosen in Settings › Documents.
            </p>
          ) : agreement === null ? (
            <p style={{ fontSize: '0.8rem', color: color.muted, margin: 0 }}>
              No default agreement is set. Choose one in Settings › Documents so it prints behind the
              proposal and is signed with it.
            </p>
          ) : (
            <div style={{ display: 'flex', gap: '0.625rem', alignItems: 'flex-start' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color.primary} strokeWidth="1.7" style={{ flexShrink: 0, marginTop: '1px' }}>
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                <path d="M14 2v6h6" />
              </svg>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: color.navy }}>
                  {agreement.name}
                </div>
                <div style={{ fontSize: '0.72rem', color: color.muted, marginTop: '2px' }}>
                  from Company Settings
                </div>
                <p style={{ fontSize: '0.72rem', color: color.muted, margin: '0.5rem 0 0' }}>
                  Prints behind the proposal and is signed with it. Swap the form in Settings ›
                  Documents.
                </p>
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

// ── Scope of Work tab ──
// 4D-rev: a free-text summary at the top, then one level of nesting —
// named sub-category sections, each with its own bullets.
//
// Estimates redesign 16b [Josh, S103]:
//  · every section is Included or Excluded (JSONB shape change, NO migration —
//    section_kind is optional and defaults to 'included' for rows written before
//    this, so older estimates read back unchanged);
//  · Build from line items generates one section per category from the priced
//    work — presentation only, it never touches costs or totals;
//  · the saved scope library (scope_library table, migration #7). ⚠️ Insert
//    COPIES a row's {title, bullets, kind} into scope_sections; it never links
//    back, so editing the estimate's copy leaves the library entry unchanged (Q8).
// ⛔ NO Coverage check — scope sections and categories share no key, so a string
//    match would confidently report scope missing that is not missing (spec §3.8).

type ScopeSection = { title: string; bullets: string[]; section_kind?: ScopeSectionKind };

function sectionKind(s: ScopeSection): ScopeSectionKind {
  return s.section_kind === 'excluded' ? 'excluded' : 'included';
}

export function ScopeTab({ data, canEdit, reload }: TabProps) {
  const initialSections =
    (data.estimate.scope_sections as unknown as ScopeSection[] | null) ?? [];
  const [summary, setSummary] = useState(data.estimate.scope_summary ?? '');
  const [sections, setSections] = useState<ScopeSection[]>(initialSections);
  const [library, setLibrary] = useState<ScopeLibraryItem[]>([]);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const { error, saved, run } = useSaveState();
  const confirm = useConfirm();

  // The saved scope library (migration #7). Read-only listing here; Insert copies
  // into this estimate. Self-fetched, like the other builder side-panels.
  useEffect(() => {
    listScopeLibrary().then(setLibrary);
  }, []);

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

  // Build from line items — one section per category, bullets from the line
  // item names under it. Appends only categories not already present by title;
  // never reads or writes costs/totals (this presents the priced work as scope).
  function buildFromLineItems() {
    const existing = new Set(sections.map((s) => s.title.trim().toLowerCase()));
    const generated: ScopeSection[] = [];
    for (const cat of [...data.categories].sort((a, b) => a.sort_order - b.sort_order)) {
      if (existing.has(cat.name.trim().toLowerCase())) continue;
      const bullets = data.lineItems
        .filter((li) => li.category_id === cat.id)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((li) => li.name)
        .filter((n) => !!n && n.trim().length > 0);
      if (bullets.length === 0) continue;
      generated.push({ title: cat.name, bullets, section_kind: 'included' });
    }
    if (generated.length === 0) return;
    persist(summary, [...sections, ...generated]);
  }

  // Insert = COPY (Q8). A fresh object with a fresh bullets array so no later
  // edit to the estimate's copy can reach back to the library row.
  async function insertFromLibrary(item: ScopeLibraryItem) {
    const copy: ScopeSection = {
      title: item.title,
      bullets: [...((item.bullets as unknown as string[]) ?? [])],
      section_kind: item.section_kind,
    };
    await persist(summary, [...sections, copy]);
  }

  async function saveToLibrary(section: ScopeSection) {
    if (!section.title.trim()) return;
    const result = await createScopeSection({
      title: section.title,
      bullets: section.bullets,
      section_kind: sectionKind(section),
    });
    if (result.success) setLibrary(await listScopeLibrary());
  }

  function setKind(si: number, kind: ScopeSectionKind) {
    persist(summary, sections.map((s, i) => (i === si ? { ...s, section_kind: kind } : s)));
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

  const kindPill = (active: boolean, tone: 'inc' | 'exc'): React.CSSProperties => ({
    padding: '2px 8px',
    fontSize: '0.68rem',
    fontWeight: 700,
    borderRadius: '999px',
    cursor: canEdit ? 'pointer' : 'default',
    border: `1px solid ${active ? (tone === 'inc' ? '#1f8f4e' : '#c0362c') : '#d5dae4'}`,
    color: active ? '#fff' : color.muted,
    background: active ? (tone === 'inc' ? '#1f8f4e' : '#c0362c') : '#fff',
  });

  return (
    <div style={{ maxWidth: '640px' }}>
      <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>Scope of Work</h2>
      {error && <div style={errorBoxStyle}>{error}</div>}

      {/* Summary — rendered at the top of the proposal scope block */}
      <label style={{ display: 'block', fontSize: '0.8125rem', color: '#7b8699', marginBottom: '0.25rem' }}>
        Summary (shown at the top of the scope on the proposal)
      </label>
      <textarea
        value={summary}
        disabled={!canEdit}
        onChange={(e) => setSummary(e.target.value)}
        onBlur={() => persist(summary, sections)}
        rows={3}
        placeholder="A short high-level overview of the work…"
        style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', marginBottom: '1rem' }}
      />

      {/* Build tools — generate from the priced work, or pull a saved section. */}
      {canEdit && (
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <button type="button" onClick={buildFromLineItems} style={buttonStyle}>
            Build from line items
          </button>
          <button
            type="button"
            onClick={() => setLibraryOpen((o) => !o)}
            style={buttonStyle}
          >
            {libraryOpen ? 'Hide library' : `Insert from library${library.length ? ` (${library.length})` : ''}`}
          </button>
        </div>
      )}

      {/* Saved scope library (migration #7). Insert copies into this estimate. */}
      {canEdit && libraryOpen && (
        <div
          style={{
            border: `1px solid ${color.cardBorder}`,
            borderRadius: '0.5rem',
            padding: '0.75rem',
            marginBottom: '1rem',
            background: color.cardBg,
          }}
        >
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: color.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
            Saved scope library
          </div>
          {library.length === 0 ? (
            <p style={{ fontSize: '0.8rem', color: color.faint, margin: 0 }}>
              Nothing saved yet. Use “Save to library” on a section to reuse it later.
            </p>
          ) : (
            library.map((item) => (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.375rem 0',
                  borderTop: `1px solid ${color.cardBorder}`,
                }}
              >
                <span style={{ fontSize: '0.8rem', color: color.body, minWidth: 0 }}>
                  <strong>{item.title}</strong>
                  <span style={{ color: color.muted }}>
                    {' '}· {(item.bullets as unknown as string[] | null)?.length ?? 0} items
                    {item.section_kind === 'excluded' ? ' · excluded' : ''}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => insertFromLibrary(item)}
                  style={{ ...iconButtonStyle, flexShrink: 0 }}
                >
                  Insert
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {sections.length === 0 && (
        <p style={{ fontSize: '0.875rem', color: '#9aa4b8', marginBottom: '1rem' }}>
          No scope sections yet.
        </p>
      )}

      {sections.map((section, si) => (
        <div
          key={si}
          style={{
            border: `1px solid ${sectionKind(section) === 'excluded' ? '#efd3d0' : '#e4e8ef'}`,
            borderRadius: '0.375rem',
            padding: '0.75rem',
            marginBottom: '0.75rem',
            background: sectionKind(section) === 'excluded' ? '#fdf6f5' : '#fff',
          }}
        >
          {/* Included / Excluded + Save-to-library */}
          <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'center', marginBottom: '0.5rem' }}>
            <button
              type="button"
              disabled={!canEdit}
              onClick={() => canEdit && setKind(si, 'included')}
              style={kindPill(sectionKind(section) === 'included', 'inc')}
            >
              Included
            </button>
            <button
              type="button"
              disabled={!canEdit}
              onClick={() => canEdit && setKind(si, 'excluded')}
              style={kindPill(sectionKind(section) === 'excluded', 'exc')}
            >
              Excluded
            </button>
            <span style={{ flex: 1 }} />
            {canEdit && (
              <button
                type="button"
                onClick={() => saveToLibrary(section)}
                disabled={!section.title.trim()}
                title="Save this section to your scope library to reuse on other estimates"
                style={{ ...iconButtonStyle, opacity: section.title.trim() ? 1 : 0.4 }}
              >
                Save to library
              </button>
            )}
          </div>

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
              onClick={async () => {
                if (!(await confirm(`Remove section "${section.title || 'Untitled'}"?`))) return;
                persist(summary, sections.filter((_, i) => i !== si));
              }}
              disabled={!canEdit}
              style={{ ...iconButtonStyle, color: '#c0362c', opacity: canEdit ? 1 : 0.4 }}
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
              <span style={{ color: '#9aa4b8' }}>•</span>
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
                style={{ ...iconButtonStyle, color: '#c0362c', opacity: canEdit ? 1 : 0.4 }}
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
//
// Step 9 (§8.10.5) — the mockup's visibility table grants Foreman read-write.
// THE MOCKUP IS WRONG AND THE CODE IS RIGHT: a foreman cannot reach estimates
// at all (route redirect + RLS admits owner/admin/PM, PM scoped to own). The
// banner states the real audience. The mockup's per-note "carry to the
// project" tick-boxes have nothing to tick — internal_notes is ONE blob and
// the convert RPC copies the whole of it; the banner says that instead.

function eventLabel(e: EstimateEvent): string {
  switch (e.kind) {
    case 'reprice': {
      const to = e.payload?.to;
      return typeof to === 'number' ? `Repriced to ${fmtMoney(to)}` : 'Repriced';
    }
    case 'send':
      return 'Sent to client';
    case 'award':
      return 'Sub bid awarded';
    case 'convert':
      return 'Converted to project';
    default:
      return e.kind;
  }
}

export function NotesTab({ data, canEdit, reload }: TabProps) {
  const [text, setText] = useState(data.estimate.internal_notes ?? '');
  const [events, setEvents] = useState<EstimateEvent[]>([]);
  const { error, saved, run } = useSaveState();

  // 16d history rail — from the estimate_events log (migration #3). Newest first.
  useEffect(() => {
    listEstimateEvents(data.estimate.id).then(setEvents);
  }, [data.estimate.id]);

  return (
    <div style={{ maxWidth: '640px' }}>
      <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>Internal Notes</h2>
      <p
        style={{
          fontSize: '0.8125rem',
          color: '#b45309',
          backgroundColor: '#fff5e6',
          padding: '0.5rem 0.75rem',
          borderRadius: '0.375rem',
          marginBottom: '1rem',
        }}
      >
        Internal notes — never shown on the proposal. Visible to the Owner, Admins, and the
        estimate&rsquo;s author; the field team and clients can&rsquo;t reach estimates at all.
        When this estimate converts, these notes carry to the project as one block.
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

      {/* 16d — estimate history rail, from the estimate_events log (migration #3). */}
      <div style={{ marginTop: '1.5rem' }}>
        <div
          style={{
            fontFamily: font.mono,
            fontSize: '0.7rem',
            fontWeight: 600,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: color.muted,
            marginBottom: '0.5rem',
          }}
        >
          Estimate history
        </div>
        {events.length === 0 ? (
          <p style={{ fontSize: '0.8rem', color: color.faint }}>No activity recorded yet.</p>
        ) : (
          events.map((e) => (
            <div
              key={e.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                padding: '0.375rem 0',
                borderTop: `1px solid ${color.cardBorder}`,
                fontSize: '0.8rem',
              }}
            >
              <span style={{ color: color.body }}>{eventLabel(e)}</span>
              <span style={{ fontFamily: font.mono, fontSize: '0.72rem', color: color.muted }}>
                {new Date(e.created_at).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </span>
            </div>
          ))
        )}
      </div>
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
        color: '#9aa4b8',
        border: '1px dashed #d5dae4',
        borderRadius: '0.5rem',
        fontSize: '0.875rem',
      }}
    >
      File attachments coming soon.
    </div>
  );
}
