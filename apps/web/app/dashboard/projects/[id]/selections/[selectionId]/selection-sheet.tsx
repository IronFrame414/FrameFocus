"use client";
import { useCallback, useRef, useState, type ClipboardEvent, type DragEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Selection, SelectionOption, SelectionOptionSource } from '@/lib/services/selections-client';
import {
  createSelectionOption,
  deleteSelectionOption,
  ensureSelectionThread,
  postSelectionMessage,
  saveSelectionNotes,
  saveSelectionOptionAmounts,
  setChosenOptions,
  updateSelection,
  updateSelectionOption,
} from '@/lib/services/selections-client';
import { uploadFile } from '@/lib/services/files-client';
import { setFileClientVisible } from '@/lib/services/daily-logs-client';
import { CatalogPicker } from '@/app/dashboard/estimates/[id]/catalog-picker';
import type { CostCatalogItem } from '@/lib/services/cost-catalog-client';
import { OptionThumb, StatusPill } from '../selections-tab';
import { SelectionLifecycle } from './selection-lifecycle';

// ============================================================================
// §9.1 — the company selection sheet. [S171, stage 3]
//
// MONEY IS ON THE SIDE TABLE AND THIS COMPONENT KNOWS IT. `option.amounts` is
// null for any reader the floor excludes (foreman, crew, sub) — the database
// gave them no row — and the sheet renders a dash. It never computes a sell
// from a null, and it never shows a 0 it did not read. Internal notes are the
// same: `selection.notes === null` means "not yours to see", rendered as
// nothing, not as an empty editor.
//
// FOUR IMAGE PATHS, ALL FOUR (requirement A): upload · paste a LINK that
// renders a thumbnail · drag-and-drop · paste an IMAGE directly. The first
// three funnel to `uploadFile()`; the link path goes through
// /api/selections/link-thumbnail because the browser cannot fetch a third-
// party page. Every path ends in the same `image_file_id` / `link_thumbnail_
// file_id` columns, so the tab and the portal read one shape.
// ============================================================================

const MANAGER = ['owner', 'admin', 'project_manager'];
const NOTES_ROLES = ['owner', 'admin', 'project_manager', 'foreman'];

const card: React.CSSProperties = { backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '0.5rem', padding: '1rem', marginBottom: '1rem' };
const label: React.CSSProperties = { display: 'block', fontSize: '0.6875rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: '0.25rem' };
const input: React.CSSProperties = { padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', fontSize: '0.875rem', width: '100%', boxSizing: 'border-box' };
const btn: React.CSSProperties = { padding: '0.4rem 0.75rem', borderRadius: '0.375rem', border: '1px solid #d1d5db', backgroundColor: '#fff', fontSize: '0.8125rem', cursor: 'pointer' };
const btnPrimary: React.CSSProperties = { ...btn, border: '1px solid #1f2937', backgroundColor: '#1f2937', color: '#fff', fontWeight: 600 };
const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export interface SheetSession {
  id: string;
  status: string;
  signed_at: string | null;
  superseded_at: string | null;
  signer_name: string | null;
  declined_at: string | null;
  decline_notes: string | null;
}

interface Props {
  projectId: string;
  role: string;
  myProfileId: string;
  selection: Selection;
  areas: { id: string; name: string }[];
  allowances: { id: string; description: string; source_change_order_id: string | null }[];
  thread: { threadId: string | null; messages: { id: string; body: string; link_url: string | null; created_at: string; author_name: string; photo_file_ids: string[] }[] };
  sessions: SheetSession[];
}

export function SelectionSheet({ projectId, role, myProfileId, selection, areas, allowances, thread, sessions }: Props) {
  const router = useRouter();
  const canManage = MANAGER.includes(role);
  const canNotes = NOTES_ROLES.includes(role) && selection.notes !== null;
  const editable = canManage && (selection.status === 'draft' || selection.status === 'in_discussion');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const reload = useCallback(() => router.refresh(), [router]);

  async function run(fn: () => Promise<{ success: boolean; error?: string }>) {
    setBusy(true);
    setError(null);
    const r = await fn();
    setBusy(false);
    if (!r.success) setError(r.error ?? 'Save failed');
    else reload();
    return r;
  }

  // ── Offered figures, derived for display on the COMPANY side only (§5.3).
  // Stage 4 stamps them at offer; until then this is a live preview.
  const chosen = selection.options.filter((o) => o.is_chosen);
  const priced = chosen.every((o) => o.amounts !== null);
  const sellOf = (o: SelectionOption) =>
    o.amounts ? Number(o.amounts.quantity) * Number(o.amounts.unit_cost) * (1 + Number(o.amounts.markup_percent ?? 0) / 100) : 0;
  const sellTotal = priced ? chosen.reduce((n, o) => n + sellOf(o), 0) : null;

  return (
    <div data-testid="selection-sheet">
      <div style={{ marginBottom: '0.75rem' }}>
        <Link href={`/dashboard/projects/${projectId}/selections`} style={{ fontSize: '0.8125rem', color: '#2563eb' }}>← Selections</Link>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>{selection.name}</h2>
        <StatusPill status={selection.status} />
      </div>
      {error && <p data-testid="selection-error" style={{ color: '#b91c1c', fontSize: '0.8125rem' }}>{error}</p>}

      {/* ── Details ───────────────────────────────────────────────────── */}
      <section style={card}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
          <Field label="Name">
            <input style={input} defaultValue={selection.name} disabled={!editable} data-testid="sel-name"
              onBlur={(e) => e.target.value.trim() !== selection.name && run(() => updateSelection(selection.id, { name: e.target.value }))} />
          </Field>
          <Field label="Area">
            <select style={input} value={selection.area_id ?? ''} disabled={!editable} data-testid="sel-area"
              onChange={(e) => run(() => updateSelection(selection.id, { area_id: e.target.value || null }))}>
              <option value="">— none —</option>
              {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
          <Field label="Allowance (from the budget)">
            <select style={input} value={selection.allowance_budget_item_id ?? ''} disabled={!editable} data-testid="sel-allowance"
              onChange={(e) => run(() => updateSelection(selection.id, { allowance_budget_item_id: e.target.value || null }))}>
              <option value="">— no allowance (pure add) —</option>
              {allowances.map((a) => (
                <option key={a.id} value={a.id}>{a.description}{a.source_change_order_id ? ' (CO)' : ''}</option>
              ))}
            </select>
          </Field>
          <Field label="Due date">
            <input type="date" style={input} defaultValue={selection.due_date ?? ''} disabled={!editable} data-testid="sel-due"
              onBlur={(e) => (e.target.value || null) !== selection.due_date && run(() => updateSelection(selection.id, { due_date: e.target.value || null }))} />
          </Field>
          <Field label="Mode">
            <select style={input} value={selection.mode} disabled={!editable} data-testid="sel-mode"
              onChange={async (e) => {
                const mode = e.target.value as 'options' | 'discussion';
                const r = await run(() => updateSelection(selection.id, { mode }));
                if (r.success && mode === 'discussion') await ensureSelectionThread(selection.id);
                reload();
              }}>
              <option value="options">With options — client picks one</option>
              <option value="discussion">Without options — discuss with the client</option>
            </select>
          </Field>
        </div>
        <Field label="Description" style={{ marginTop: '0.75rem' }}>
          <textarea style={{ ...input, minHeight: 64 }} defaultValue={selection.description ?? ''} disabled={!editable} data-testid="sel-description"
            onBlur={(e) => (e.target.value || null) !== (selection.description ?? null) && run(() => updateSelection(selection.id, { description: e.target.value || null }))} />
        </Field>
        <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', marginTop: '0.75rem', fontSize: '0.8125rem' }}>
          <Toggle label="Allow multiple selections" checked={selection.allow_multiple} disabled={!editable} testId="sel-allow-multiple"
            onChange={(v) => run(() => updateSelection(selection.id, { allow_multiple: v }))} />
          <Toggle label="Show amount differences to the client" checked={selection.show_differences} disabled={!editable} testId="sel-show-differences"
            onChange={(v) => run(() => updateSelection(selection.id, { show_differences: v }))} />
          <Toggle label="Client supplies this item (no cost, no charge)" checked={selection.client_supplied} disabled={!editable} testId="sel-client-supplied"
            onChange={(v) => run(() => updateSelection(selection.id, { client_supplied: v }))} />
        </div>
        {selection.client_supplied && (
          <p style={{ fontSize: '0.75rem', color: '#92400e', marginTop: '0.5rem' }}>
            Client-supplied: no price is recorded and the budget is untouched. If an allowance is linked it stays whole and unconsumed (Q6).
          </p>
        )}
      </section>

      {/* ── Options ───────────────────────────────────────────────────── */}
      {selection.mode === 'options' && (
        <section style={card} data-testid="sel-options">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <h3 style={{ ...label, margin: 0 }}>Options {selection.allow_multiple ? '(client may pick several)' : '(client picks one)'}</h3>
          </div>
          {selection.options.length === 0 && <p style={{ fontSize: '0.8125rem', color: '#6b7280' }}>No options yet.</p>}
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {selection.options.map((o) => (
              <OptionCard key={o.id} option={o} selection={selection} projectId={projectId} role={role} editable={editable} canManage={canManage} busy={busy} run={run} />
            ))}
          </div>
          {editable && <AddOption selection={selection} projectId={projectId} run={run} />}
          {canManage && chosen.length > 0 && (
            <div style={{ marginTop: '0.75rem', fontSize: '0.8125rem', color: '#374151' }} data-testid="sel-preview-total">
              {selection.client_supplied ? 'Client-supplied — no price.' : sellTotal !== null ? `Chosen options total (with markup): ${money(sellTotal)}` : 'Chosen options are not all priced yet.'}
            </div>
          )}
        </section>
      )}

      {/* ── Lifecycle (stage 4) ───────────────────────────────────────── */}
      <SelectionLifecycle selection={selection} role={role} sessions={sessions} onDone={reload} />

      {/* ── Internal notes — owner/admin/PM/foreman; null = not yours ─── */}
      {canNotes && (
        <section style={card} data-testid="sel-notes">
          <h3 style={label}>Internal notes <span style={{ fontWeight: 400, textTransform: 'none' }}>— team only; never shown to the client or subs</span></h3>
          <textarea style={{ ...input, minHeight: 72 }} defaultValue={selection.notes ?? ''} data-testid="sel-notes-text"
            onBlur={(e) => e.target.value !== (selection.notes ?? '') && run(() => saveSelectionNotes(selection.id, e.target.value))} />
        </section>
      )}

      {/* ── Thread ────────────────────────────────────────────────────── */}
      <Thread selection={selection} projectId={projectId} myProfileId={myProfileId} thread={thread} canPost={role !== 'client'} run={run} />
    </div>
  );
}

function Field({ label: l, children, style }: { label: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={style}>
      <span style={label}>{l}</span>
      {children}
    </div>
  );
}
function Toggle({ label: l, checked, disabled, onChange, testId }: { label: string; checked: boolean; disabled: boolean; onChange: (v: boolean) => void; testId: string }) {
  return (
    <label style={{ display: 'inline-flex', gap: '0.375rem', alignItems: 'center', opacity: disabled ? 0.6 : 1 }}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} data-testid={testId} />
      {l}
    </label>
  );
}

// ── Image intake: the four paths ─────────────────────────────────────────────
async function intakeImage(file: File, projectId: string, role: string): Promise<{ fileId: string | null; error?: string }> {
  const r = await uploadFile(file, { project_id: projectId, category: 'photos', tags: ['selection-option'] });
  if (!r.success || !r.id) return { fileId: null, error: r.error };
  // files_insert_non_client lets only owner/admin set client_visible; a PM's
  // upload stays staff-only here and stage 7 has to handle it (flagged in the
  // stage 3 report). Owner/admin flip it so the portal can show the picture.
  if (role === 'owner' || role === 'admin') await setFileClientVisible(r.id, true);
  return { fileId: r.id };
}

function useImagePaths(onFile: (f: File) => void) {
  const inputRef = useRef<HTMLInputElement>(null);
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f && f.type.startsWith('image/')) onFile(f);
  };
  const onPaste = (e: ClipboardEvent) => {
    const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith('image/'));
    const f = item?.getAsFile();
    if (f) {
      e.preventDefault();
      onFile(f);
    }
  };
  return { inputRef, onDrop, onPaste, onDragOver: (e: DragEvent) => e.preventDefault() };
}

function OptionCard({ option, selection, projectId, role, editable, canManage, busy, run }: {
  option: SelectionOption; selection: Selection; projectId: string; role: string; editable: boolean; canManage: boolean; busy: boolean;
  run: (fn: () => Promise<{ success: boolean; error?: string }>) => Promise<{ success: boolean; error?: string }>;
}) {
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkMsg, setLinkMsg] = useState<string | null>(null);
  const paths = useImagePaths(async (f) => {
    const r = await intakeImage(f, projectId, role);
    if (!r.fileId) return run(async () => ({ success: false, error: r.error ?? 'Upload failed' }));
    return run(() => updateSelectionOption(option.id, { image_file_id: r.fileId }));
  });
  const a = option.amounts;

  async function fetchThumb(url: string) {
    setLinkBusy(true);
    setLinkMsg(null);
    const res = await fetch('/api/selections/link-thumbnail', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url, projectId }) });
    const body = (await res.json().catch(() => ({}))) as { fileId?: string; error?: string; noImage?: boolean };
    setLinkBusy(false);
    if (body.fileId) await run(() => updateSelectionOption(option.id, { link_url: url, link_thumbnail_file_id: body.fileId }));
    else {
      await run(() => updateSelectionOption(option.id, { link_url: url }));
      setLinkMsg(body.error ?? 'Link saved; no preview image was found.');
    }
  }

  return (
    <div data-testid={`option-${option.id}`} onDrop={editable ? paths.onDrop : undefined} onDragOver={editable ? paths.onDragOver : undefined} onPaste={editable ? paths.onPaste : undefined}
      style={{ display: 'grid', gridTemplateColumns: '72px 1fr', gap: '0.75rem', padding: '0.75rem', border: option.is_chosen ? '2px solid #16a34a' : '1px solid #e5e7eb', borderRadius: '0.5rem' }}>
      <div>
        <OptionThumb fileId={option.image_file_id ?? option.link_thumbnail_file_id ?? null} size={72} />
        {editable && (
          <div style={{ marginTop: '0.375rem', display: 'grid', gap: '0.25rem' }}>
            <button type="button" style={{ ...btn, padding: '0.2rem 0.4rem', fontSize: '0.6875rem' }} onClick={() => paths.inputRef.current?.click()} data-testid="opt-upload">Upload</button>
            <input ref={paths.inputRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void (async () => { const r = await intakeImage(f, projectId, role); if (r.fileId) await run(() => updateSelectionOption(option.id, { image_file_id: r.fileId })); else await run(async () => ({ success: false, error: r.error })); })(); e.target.value = ''; }} />
            <span style={{ fontSize: '0.625rem', color: '#9ca3af' }}>or drop / paste an image here</span>
          </div>
        )}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <input style={{ ...input, width: 'auto', flex: 1, minWidth: 160 }} defaultValue={option.name} disabled={!editable} data-testid="opt-name"
            onBlur={(e) => e.target.value.trim() !== option.name && run(() => updateSelectionOption(option.id, { name: e.target.value }))} />
          <span style={{ fontSize: '0.6875rem', color: '#6b7280' }}>{option.source === 'catalog' ? 'from catalog' : option.source === 'budget' ? 'from budget' : 'new'}</span>
          {canManage && (
            <label style={{ fontSize: '0.8125rem', display: 'inline-flex', gap: '0.25rem', alignItems: 'center' }}>
              <input type="checkbox" checked={option.is_chosen} disabled={busy || !(selection.status === 'draft' || selection.status === 'in_discussion')} data-testid="opt-chosen"
                onChange={(e) => {
                  const current = selection.options.filter((x) => x.is_chosen).map((x) => x.id);
                  const next = e.target.checked ? [...current, option.id] : current.filter((id) => id !== option.id);
                  void run(() => setChosenOptions(selection.id, next, selection.allow_multiple));
                }} />
              chosen
            </label>
          )}
          {editable && <button type="button" style={{ ...btn, color: '#b91c1c' }} onClick={() => window.confirm(`Remove option "${option.name}"?`) && run(() => deleteSelectionOption(option.id))} data-testid="opt-delete">Remove</button>}
        </div>
        <input style={{ ...input, marginTop: '0.375rem' }} placeholder="Spec detail (model, finish, size…)" defaultValue={option.spec_detail ?? ''} disabled={!editable} data-testid="opt-spec"
          onBlur={(e) => (e.target.value || null) !== (option.spec_detail ?? null) && run(() => updateSelectionOption(option.id, { spec_detail: e.target.value || null }))} />
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.375rem' }}>
          <input style={{ ...input }} placeholder="Paste a product link — a thumbnail is fetched" defaultValue={option.link_url ?? ''} disabled={!editable || linkBusy} data-testid="opt-link"
            onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== (option.link_url ?? '')) void fetchThumb(v); else if (!v && option.link_url) void run(() => updateSelectionOption(option.id, { link_url: null, link_thumbnail_file_id: null })); }} />
          {option.link_url && <a href={option.link_url} target="_blank" rel="noreferrer" style={{ fontSize: '0.75rem', color: '#2563eb', whiteSpace: 'nowrap' }}>open ↗</a>}
        </div>
        {linkMsg && <p style={{ fontSize: '0.6875rem', color: '#92400e', margin: '0.25rem 0 0' }}>{linkMsg}</p>}

        {/* Money — side table; null means the floor hid it from THIS reader. */}
        {!selection.client_supplied && (
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.5rem', fontSize: '0.8125rem' }} data-testid="opt-amounts">
            {a === null ? (
              <span style={{ color: '#9ca3af' }} title="Pricing is visible to owners, admins and project managers">price —</span>
            ) : (
              <AmountsEditor option={option} editable={editable} run={run} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function AmountsEditor({ option, editable, run }: { option: SelectionOption; editable: boolean; run: (fn: () => Promise<{ success: boolean; error?: string }>) => Promise<unknown> }) {
  const a = option.amounts!;
  const [qty, setQty] = useState(String(a.quantity));
  const [cost, setCost] = useState(String(a.unit_cost));
  const [markup, setMarkup] = useState(a.markup_percent == null ? '' : String(a.markup_percent));
  const sell = Number(qty || 0) * Number(cost || 0) * (1 + Number(markup || 0) / 100);
  const save = () => run(() => saveSelectionOptionAmounts(option.id, { quantity: Number(qty || 0), unit_cost: Number(cost || 0), markup_percent: markup === '' ? null : Number(markup) }));
  const small: React.CSSProperties = { ...input, width: 90 };
  return (
    <>
      <span style={{ color: '#6b7280' }}>qty</span><input style={small} value={qty} disabled={!editable} onChange={(e) => setQty(e.target.value)} onBlur={save} data-testid="opt-qty" />
      <span style={{ color: '#6b7280' }}>× cost</span><input style={small} value={cost} disabled={!editable} onChange={(e) => setCost(e.target.value)} onBlur={save} data-testid="opt-cost" />
      <span style={{ color: '#6b7280' }}>+ markup %</span><input style={small} value={markup} disabled={!editable} onChange={(e) => setMarkup(e.target.value)} onBlur={save} placeholder="inherit" data-testid="opt-markup" />
      <span style={{ fontWeight: 600 }} data-testid="opt-sell">= {money(sell)}</span>
    </>
  );
}

function AddOption({ selection, projectId, run }: { selection: Selection; projectId: string; run: (fn: () => Promise<{ success: boolean; error?: string }>) => Promise<unknown> }) {
  const [open, setOpen] = useState<SelectionOptionSource | null>(null);
  const [name, setName] = useState('');
  const [cost, setCost] = useState('');
  const [qty, setQty] = useState('1');
  const [markup, setMarkup] = useState('');
  const [catalog, setCatalog] = useState<CostCatalogItem | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [budgetLines, setBudgetLines] = useState<{ id: string; description: string }[] | null>(null);
  const [budgetId, setBudgetId] = useState('');

  async function loadBudget() {
    const { createClient } = await import('@/lib/supabase-browser');
    const { data } = await createClient().from('project_budget_items').select('id, description').eq('project_id', projectId).eq('is_deleted', false).order('description');
    setBudgetLines(data ?? []);
  }

  async function add() {
    if (!name.trim()) return;
    const amounts = selection.client_supplied ? null : { quantity: Number(qty || 1), unit_cost: Number(cost || 0), markup_percent: markup === '' ? null : Number(markup) };
    const r = await createSelectionOption({
      selection_id: selection.id,
      name,
      source: open ?? 'scratch',
      catalog_item_id: open === 'catalog' ? catalog?.id ?? null : null,
      source_budget_item_id: open === 'budget' ? budgetId || null : null,
      sort_order: selection.options.length,
      amounts,
    });
    await run(async () => r);
    if (r.success) {
      setOpen(null); setName(''); setCost(''); setQty('1'); setMarkup(''); setCatalog(null); setBudgetId('');
    }
  }

  if (!open) {
    return (
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
        <button type="button" style={btn} onClick={() => setOpen('scratch')} data-testid="opt-add-scratch">+ New option</button>
        <button type="button" style={btn} onClick={() => { setOpen('catalog'); setShowPicker(true); }} data-testid="opt-add-catalog">+ From catalog</button>
        <button type="button" style={btn} onClick={() => { setOpen('budget'); void loadBudget(); }} data-testid="opt-add-budget">+ From job budget</button>
      </div>
    );
  }
  return (
    <div style={{ marginTop: '0.75rem', padding: '0.75rem', border: '1px dashed #d1d5db', borderRadius: '0.5rem' }} data-testid="opt-add-form">
      {showPicker && (
        <CatalogPicker
          onSelect={(item) => { setCatalog(item); setName(item.name); setCost(String(item.unit_cost)); setShowPicker(false); }}
          onClose={() => { setShowPicker(false); if (!catalog) setOpen(null); }}
        />
      )}
      {open === 'budget' && (
        <select style={{ ...input, marginBottom: '0.5rem' }} value={budgetId} data-testid="opt-budget-line"
          onChange={(e) => { setBudgetId(e.target.value); const l = budgetLines?.find((b) => b.id === e.target.value); if (l && !name) setName(l.description); }}>
          <option value="">— budget line —</option>
          {(budgetLines ?? []).map((b) => <option key={b.id} value={b.id}>{b.description}</option>)}
        </select>
      )}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <input style={{ ...input, width: 'auto', flex: 1, minWidth: 160 }} placeholder="Option name" value={name} onChange={(e) => setName(e.target.value)} data-testid="opt-new-name" />
        {!selection.client_supplied && (
          <>
            <input style={{ ...input, width: 80 }} placeholder="qty" value={qty} onChange={(e) => setQty(e.target.value)} data-testid="opt-new-qty" />
            <input style={{ ...input, width: 100 }} placeholder="unit cost" value={cost} onChange={(e) => setCost(e.target.value)} data-testid="opt-new-cost" />
            <input style={{ ...input, width: 100 }} placeholder="markup % (inherit)" value={markup} onChange={(e) => setMarkup(e.target.value)} data-testid="opt-new-markup" />
          </>
        )}
        <button type="button" style={btnPrimary} onClick={add} disabled={!name.trim() || (open === 'budget' && !budgetId)} data-testid="opt-new-save">Add</button>
        <button type="button" style={btn} onClick={() => setOpen(null)}>Cancel</button>
      </div>
      {open === 'catalog' && !catalog && !showPicker && <button type="button" style={{ ...btn, marginTop: '0.5rem' }} onClick={() => setShowPicker(true)}>Pick from catalog…</button>}
    </div>
  );
}

function Thread({ selection, projectId, myProfileId, thread, canPost, run }: { selection: Selection; projectId: string; myProfileId: string; thread: Props['thread']; canPost: boolean; run: (fn: () => Promise<{ success: boolean; error?: string }>) => Promise<unknown> }) {
  const [body, setBody] = useState('');
  const [link, setLink] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const paths = useImagePaths((f) => setFiles((p) => [...p, f]));
  async function post() {
    if (!body.trim() && files.length === 0) return;
    let threadId = thread.threadId;
    if (!threadId) {
      const t = await ensureSelectionThread(selection.id);
      if (!t.success || !t.id) return run(async () => ({ success: false, error: t.error ?? 'Could not open the thread' }));
      threadId = t.id;
    }
    const ids: string[] = [];
    for (const f of files) {
      const r = await uploadFile(f, { project_id: projectId, category: 'photos', tags: ['selection-thread'] });
      if (r.success && r.id) ids.push(r.id);
    }
    const r = await run(() => postSelectionMessage({ thread_id: threadId!, author_profile_id: myProfileId, body: body.trim() || '(photo)', link_url: link.trim() || null, photo_file_ids: ids }));
    if ((r as { success: boolean }).success) { setBody(''); setLink(''); setFiles([]); }
  }
  return (
    <section style={card} data-testid="sel-thread">
      <h3 style={label}>Discussion {selection.mode === 'discussion' ? '— the client describes what she wants here' : ''}</h3>
      {thread.messages.length === 0 && <p style={{ fontSize: '0.8125rem', color: '#6b7280' }}>No messages yet.</p>}
      <div style={{ display: 'grid', gap: '0.5rem', marginBottom: '0.75rem' }}>
        {thread.messages.map((m) => (
          <div key={m.id} style={{ fontSize: '0.875rem', padding: '0.5rem', backgroundColor: '#f9fafb', borderRadius: '0.375rem' }} data-testid="sel-msg">
            <div style={{ fontSize: '0.6875rem', color: '#6b7280' }}>{m.author_name} · {new Date(m.created_at).toLocaleString()}</div>
            <div>{m.body}</div>
            {m.link_url && <a href={m.link_url} target="_blank" rel="noreferrer" style={{ fontSize: '0.75rem', color: '#2563eb' }}>{m.link_url}</a>}
            {m.photo_file_ids.length > 0 && <div style={{ display: 'flex', gap: '0.375rem', marginTop: '0.375rem' }}>{m.photo_file_ids.map((id) => <OptionThumb key={id} fileId={id} size={64} />)}</div>}
          </div>
        ))}
      </div>
      {canPost && (
        <div onDrop={paths.onDrop} onDragOver={paths.onDragOver} onPaste={paths.onPaste} style={{ display: 'grid', gap: '0.375rem' }}>
          <textarea style={{ ...input, minHeight: 56 }} placeholder="Write a message… (drop or paste photos here)" value={body} onChange={(e) => setBody(e.target.value)} data-testid="sel-msg-body" />
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <input style={{ ...input, width: 'auto', flex: 1, minWidth: 160 }} placeholder="Link (optional)" value={link} onChange={(e) => setLink(e.target.value)} data-testid="sel-msg-link" />
            <button type="button" style={btn} onClick={() => paths.inputRef.current?.click()}>Attach photo</button>
            <input ref={paths.inputRef} type="file" accept="image/*" multiple hidden onChange={(e) => { setFiles((p) => [...p, ...Array.from(e.target.files ?? [])]); e.target.value = ''; }} />
            {files.length > 0 && <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>{files.length} photo{files.length === 1 ? '' : 's'} attached</span>}
            <button type="button" style={btnPrimary} onClick={post} data-testid="sel-msg-send">Send</button>
          </div>
        </div>
      )}
    </section>
  );
}
