'use client';

/**
 * S128 Part H — DIVISION BUDGETING, the editor (docs/specs/estimates-and-change-orders-spec.md H-1..H-15).
 * ⚠️ PART H IS REBUILD-TEST ONLY. NOT MERGED. It waits for Josh to use it on the dev server.
 *
 * Division → Section (optional) → Line, then the drag-ordered block of charges below.
 *   · `+ Add division` at the top; `+ Line` and `+ Section` on each division; `+ Line` on each
 *     section. There is no top-level "Add line" (H-1).
 *   · `+ Line` and a double-click on a line open the SAME line sheet the line-item estimator uses
 *     (components/estimating/line-detail-sheet.tsx — H-5). A double-click on a FIGURE edits it in
 *     place. Hovering a line shows its description; the sheet shows it too (hover is not on touch).
 *   · The block: every row states its basis IN WORDS, on the row (H-8a). A drag shows every base it
 *     changes BEFORE the drop lands. At 100%+ of mode-2 rates there is no total: the screen says so.
 * All arithmetic is packages/shared/utils/division-budget.ts; nothing here computes money itself.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  LineDetailSheet,
  type LineField,
  type LineFieldValue,
} from '@/components/estimating/line-detail-sheet';
import {
  addBottomLine,
  addDivision,
  addDivisionLine,
  addSection,
  loadDivisionBudget,
  parseCostCodeInput,
  removeBottomLine,
  removeDivision,
  removeDivisionLine,
  removeSection,
  reorderBottomLines,
  updateBottomLine,
  updateDivision,
  updateDivisionLine,
  updateSection,
  type BottomLine,
  type DivisionBudgetData,
  type DivisionLine,
  type DivisionLinePatch,
} from '@/lib/services/division-budget-client';
import {
  divisionLineAmount,
  previewMove,
  solveDivisionBudget,
  type BlockLineInput,
  type MoveConsequence,
} from '@framefocus/shared/utils/division-budget';
import { fmtMoney } from '../labels';
import { useConfirm } from '@/components/confirm/confirm-provider';
import type { TabProps } from './estimate-builder';

type SheetState =
  | { mode: 'new'; divisionId: string; sectionId: string | null }
  | { mode: 'edit'; lineId: string }
  | null;

const cell: React.CSSProperties = { padding: '0.3rem 0.5rem', fontSize: '0.8125rem' };
const num: React.CSSProperties = { ...cell, textAlign: 'right', fontFamily: 'var(--font-mono, monospace)' };
const smallBtn: React.CSSProperties = {
  padding: '0.2rem 0.55rem',
  fontSize: '0.75rem',
  border: '1px solid #d5dae4',
  borderRadius: '0.3rem',
  background: '#f4f6fa',
  cursor: 'pointer',
};

function toBlockInput(b: BottomLine): BlockLineInput {
  return {
    id: b.id,
    name: b.name,
    charge_mode: b.charge_mode,
    rate: b.rate == null ? null : Number(b.rate),
    amount: b.amount == null ? null : Number(b.amount),
    base_division_ids: b.base_division_ids,
    base_excluded_ids: b.base_excluded_ids ?? [],
  };
}

/** H-5: a figure edits in place on DOUBLE-click. */
function DblClickNumber({
  value,
  format,
  disabled,
  onSave,
  testId,
}: {
  value: number | null;
  format: (v: number | null) => string;
  disabled: boolean;
  onSave: (v: number | null) => Promise<void>;
  testId?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  if (editing) {
    return (
      <input
        autoFocus
        data-testid={testId ? `${testId}-input` : undefined}
        inputMode="decimal"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setEditing(false);
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        onBlur={async () => {
          setEditing(false);
          const t = draft.trim();
          if (t === (value == null ? '' : String(value))) return;
          const n = t === '' ? null : Number(t);
          if (n != null && Number.isNaN(n)) return;
          await onSave(n);
        }}
        style={{ width: '6.5rem', fontSize: '0.8125rem', textAlign: 'right' }}
      />
    );
  }
  return (
    <span
      data-testid={testId}
      data-figure="true"
      title={disabled ? undefined : 'Double-click to edit'}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (disabled) return;
        setDraft(value == null ? '' : String(value));
        setEditing(true);
      }}
      style={{ cursor: disabled ? 'default' : 'text', borderBottom: disabled ? 'none' : '1px dotted #c3c9d6' }}
    >
      {format(value)}
    </span>
  );
}

export function DivisionsTab({ data: tabData, canEdit }: Pick<TabProps, 'data' | 'canEdit'>) {
  const estimateId = tabData.estimate.id;
  const confirm = useConfirm();
  const [data, setData] = useState<DivisionBudgetData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [preview, setPreview] = useState<{ to: number; consequences: MoveConsequence[] } | null>(null);
  const [baseEditorFor, setBaseEditorFor] = useState<string | null>(null);
  const [newDivision, setNewDivision] = useState('');

  const reload = useCallback(async () => {
    const r = await loadDivisionBudget(estimateId);
    if (r.success) setData(r.data ?? null);
    else setError(r.error);
  }, [estimateId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function run(p: Promise<{ success: boolean; error?: string }>) {
    setError(null);
    const r = await p;
    if (!r.success) setError(r.error ?? 'Save failed');
    await reload();
    return r.success;
  }

  const block = useMemo(() => (data?.bottom ?? []).map(toBlockInput), [data]);
  const solved = useMemo(() => {
    if (!data) return null;
    return solveDivisionBudget(
      data.divisions.map((d) => ({
        id: d.id,
        code: d.code,
        name: d.name,
        lines: data.lines
          .filter((l) => l.division_id === d.id)
          .map((l) => ({
            id: l.id,
            quantity: Number(l.quantity),
            cost: Number(l.cost),
            alternate_kind: l.alternate_kind as 'alternate' | 'add_deduct' | null,
          })),
      })),
      block
    );
  }, [data, block]);

  if (!data || !solved) {
    return <div style={{ padding: '1rem', color: '#7b8699' }}>{error ?? 'Loading divisions…'}</div>;
  }

  const codeTitle = (code: string | null) =>
    code ? (data.codes.find((c) => c.code === code)?.title ?? 'not in your code list') : null;

  // ── the line sheet (H-4/H-5) — the SAME component as the line-item estimator ──
  function lineFields(line: DivisionLine | null): LineField[] {
    return [
      { key: 'name', label: 'Name', kind: 'text', value: line?.name ?? null, required: true, maxLength: 200 },
      { key: 'quantity', label: 'Quantity', kind: 'number', value: line ? Number(line.quantity) : 1 },
      { key: 'cost', label: 'Cost', kind: 'number', value: line ? Number(line.cost) : null },
      {
        key: 'cost_code',
        label: 'Cost code',
        kind: 'text',
        value: line?.cost_code ?? null,
        maxLength: 5,
        placeholder: 'e.g. 02110',
        help: 'Five digits, MasterFormat 1995. A 4-digit code from a spreadsheet (1000) is read as 01000.',
      },
      {
        key: 'description',
        label: 'Description',
        kind: 'textarea',
        value: line?.description ?? null,
        maxLength: 2000,
        placeholder: 'Optional',
        help: 'Scope language. Which proposal formats show it to a client is not built yet (H-10).',
      },
      {
        key: 'internal_notes',
        label: 'Internal notes',
        kind: 'textarea',
        value: line?.internal_notes ?? null,
        placeholder: 'Optional',
        help: 'Never reaches the client, on any format.',
      },
      { key: 'out_to_bid', label: 'Out to bid', kind: 'checkbox', value: line?.out_to_bid ?? false, help: 'Marked only — bidding comes with the sub-bids build.' },
      {
        key: 'alternate_kind',
        label: 'Alternate',
        kind: 'select',
        value: line?.alternate_kind ?? '',
        options: [
          { value: '', label: 'No — part of the base bid' },
          { value: 'alternate', label: 'Alternate (not in the total)' },
          { value: 'add_deduct', label: 'Add / deduct (not in the total)' },
        ],
      },
    ];
  }

  async function saveLine(changes: Record<string, LineFieldValue>): Promise<{ success: boolean; error?: string }> {
    const patch: DivisionLinePatch = {};
    if ('name' in changes) patch.name = String(changes.name);
    if ('quantity' in changes) patch.quantity = changes.quantity as number;
    if ('cost' in changes) patch.cost = (changes.cost as number | null) ?? 0;
    if ('description' in changes) patch.description = changes.description as string | null;
    if ('internal_notes' in changes) patch.internal_notes = changes.internal_notes as string | null;
    if ('out_to_bid' in changes) patch.out_to_bid = Boolean(changes.out_to_bid);
    if ('alternate_kind' in changes) patch.alternate_kind = (changes.alternate_kind as string | null) || null;
    if ('cost_code' in changes) {
      const c = parseCostCodeInput(changes.cost_code as string | null);
      if (!c.ok) return { success: false, error: c.error };
      patch.cost_code = c.code;
    }
    if (!sheet) return { success: false, error: 'No line open' };
    const r =
      sheet.mode === 'new'
        ? await addDivisionLine(estimateId, sheet.divisionId, sheet.sectionId, {
            ...patch,
            name: patch.name ?? 'New line',
            sort_order: data!.lines.filter((l) => l.division_id === sheet.divisionId).length,
          })
        : await updateDivisionLine(sheet.lineId, patch);
    if (r.success) await reload();
    return r.success ? { success: true } : { success: false, error: r.error };
  }

  function lineRow(line: DivisionLine) {
    const amount = divisionLineAmount({ id: line.id, quantity: Number(line.quantity), cost: Number(line.cost) });
    return (
      <tr
        key={line.id}
        data-testid="division-line"
        data-line-id={line.id}
        title={line.description ?? undefined}
        onDoubleClick={(e) => {
          if ((e.target as HTMLElement).closest('[data-figure],input,button,select')) return;
          setSheet({ mode: 'edit', lineId: line.id });
        }}
        style={{ borderBottom: '1px solid #f1f3f7', cursor: 'default', opacity: line.alternate_kind ? 0.65 : 1 }}
      >
        <td style={cell}>
          {line.name}
          {line.alternate_kind && (
            <span style={{ marginLeft: '0.4rem', fontSize: '0.6875rem', color: '#b45309' }}>
              {line.alternate_kind === 'alternate' ? 'alternate — not in total' : 'add/deduct — not in total'}
            </span>
          )}
          {line.out_to_bid && (
            <span style={{ marginLeft: '0.4rem', fontSize: '0.6875rem', color: '#3b4ae0' }}>out to bid</span>
          )}
        </td>
        <td style={{ ...cell, fontFamily: 'var(--font-mono, monospace)' }} title={codeTitle(line.cost_code) ?? undefined}>
          {line.cost_code ?? '—'}
        </td>
        <td style={num}>
          <DblClickNumber
            testId="line-qty"
            value={Number(line.quantity)}
            format={(v) => String(v ?? 1)}
            disabled={!canEdit}
            onSave={async (v) => {
              await run(updateDivisionLine(line.id, { quantity: v ?? 1 }));
            }}
          />
        </td>
        <td style={num}>
          <DblClickNumber
            testId="line-cost"
            value={Number(line.cost)}
            format={(v) => fmtMoney(v)}
            disabled={!canEdit}
            onSave={async (v) => {
              await run(updateDivisionLine(line.id, { cost: v ?? 0 }));
            }}
          />
        </td>
        <td style={num} data-testid="line-amount">
          {fmtMoney(amount)}
        </td>
        <td style={{ ...cell, textAlign: 'right' }}>
          {canEdit && (
            <button
              type="button"
              aria-label={`Remove ${line.name}`}
              style={{ ...smallBtn, color: '#c0362c' }}
              onClick={async () => {
                if (await confirm(`Remove line "${line.name}"?`)) await run(removeDivisionLine(line.id));
              }}
            >
              ✕
            </button>
          )}
        </td>
      </tr>
    );
  }

  function linesTable(lines: DivisionLine[]) {
    if (lines.length === 0) return null;
    return (
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '0.5rem' }}>
        <thead>
          <tr style={{ fontSize: '0.6875rem', color: '#7b8699', textAlign: 'left' }}>
            <th style={cell}>Line</th>
            <th style={cell}>Code</th>
            <th style={{ ...cell, textAlign: 'right' }}>Qty</th>
            <th style={{ ...cell, textAlign: 'right' }}>Cost</th>
            <th style={{ ...cell, textAlign: 'right' }}>Amount</th>
            <th style={cell} />
          </tr>
        </thead>
        <tbody>{lines.map(lineRow)}</tbody>
      </table>
    );
  }

  // ── the block: drag with the consequence shown BEFORE the drop (H-8a) ──
  async function commitMove(from: number, to: number) {
    const { reordered } = previewMove(block, from, to);
    await run(reorderBottomLines(reordered.map((l) => l.id)));
  }

  async function moveByButton(from: number, to: number) {
    const { consequences } = previewMove(block, from, to);
    if (consequences.length) {
      const ok = await confirm({
        title: 'Moving this line changes what is charged',
        message: consequences.map(describeConsequence).join('\n'),
        confirmLabel: 'Move it',
        cancelLabel: 'Cancel',
      });
      if (!ok) return;
    }
    await commitMove(from, to);
  }

  const solvedLines = solved.lines;
  const divisionTotal = (id: string) => solved.divisions.find((d) => d.id === id);

  const presentCodes = new Set(data.divisions.map((d) => d.code));
  const addable = data.companyDivisions.filter((d) => !presentCodes.has(d.code));

  return (
    <div data-testid="divisions-tab">
      {error && (
        <div role="alert" style={{ marginBottom: '0.75rem', color: '#c0362c', fontSize: '0.875rem' }}>
          {error}
        </div>
      )}

      {canEdit && (
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '1rem' }}>
          <select
            data-testid="add-division-select"
            value={newDivision}
            onChange={(e) => setNewDivision(e.target.value)}
            style={{ fontSize: '0.8125rem', padding: '0.3rem' }}
          >
            <option value="">Choose a division…</option>
            {addable.map((d) => (
              <option key={d.code} value={d.code}>
                {d.code} · {d.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            data-testid="add-division"
            style={smallBtn}
            disabled={!newDivision}
            onClick={async () => {
              const d = data.companyDivisions.find((x) => x.code === newDivision);
              if (!d) return;
              await run(addDivision(estimateId, d.code, d.name, d.sort_order));
              setNewDivision('');
            }}
          >
            + Add division
          </button>
        </div>
      )}

      {data.divisions.map((d) => {
        const t = divisionTotal(d.id);
        const direct = data.lines.filter((l) => l.division_id === d.id && l.section_id == null);
        const sections = data.sections.filter((s) => s.division_id === d.id);
        return (
          <section
            key={d.id}
            data-testid="division"
            data-division-code={d.code}
            style={{ border: '1px solid #e4e8ef', borderRadius: '0.5rem', padding: '0.75rem', marginBottom: '0.75rem' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 700 }}>Div {d.code}</span>
              {canEdit ? (
                <input
                  defaultValue={d.name}
                  aria-label={`Division ${d.code} name`}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && v !== d.name) void run(updateDivision(d.id, { name: v }));
                  }}
                  style={{ fontWeight: 600, fontSize: '0.9375rem', border: '1px solid transparent', padding: '0.1rem 0.25rem' }}
                />
              ) : (
                <span style={{ fontWeight: 600 }}>{d.name}</span>
              )}
              <span style={{ marginLeft: 'auto', fontWeight: 700 }} data-testid="division-total">
                {fmtMoney(t?.total ?? 0)}
              </span>
              <span style={{ fontSize: '0.75rem', color: '#7b8699', minWidth: '4.5rem', textAlign: 'right' }} data-testid="division-percent">
                {t?.percentOfJob != null ? `${t.percentOfJob.toFixed(1)}% of job` : '—'}
              </span>
              {canEdit && (
                <>
                  <button type="button" style={smallBtn} data-testid="division-add-line" onClick={() => setSheet({ mode: 'new', divisionId: d.id, sectionId: null })}>
                    + Line
                  </button>
                  <button
                    type="button"
                    style={smallBtn}
                    data-testid="division-add-section"
                    onClick={() => void run(addSection(estimateId, d.id, 'New section', sections.length))}
                  >
                    + Section
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove division ${d.code}`}
                    style={{ ...smallBtn, color: '#c0362c' }}
                    onClick={async () => {
                      if (await confirm(`Remove Division ${d.code} ${d.name} and its lines from this estimate?`))
                        await run(removeDivision(d.id));
                    }}
                  >
                    ✕
                  </button>
                </>
              )}
            </div>
            {linesTable(direct)}
            {sections.map((s) => {
              const sLines = data.lines.filter((l) => l.section_id === s.id);
              const sTotal = sLines
                .filter((l) => !l.alternate_kind)
                .reduce((sum, l) => sum + Math.round(divisionLineAmount({ id: l.id, quantity: Number(l.quantity), cost: Number(l.cost) }) * 100), 0) / 100;
              return (
                <div key={s.id} data-testid="division-section" style={{ marginLeft: '1rem', borderLeft: '2px solid #eef1f6', paddingLeft: '0.75rem', marginBottom: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                    {canEdit ? (
                      <input
                        defaultValue={s.name}
                        aria-label="Section name"
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v && v !== s.name) void run(updateSection(s.id, { name: v }));
                        }}
                        style={{ fontWeight: 600, fontSize: '0.8125rem', border: '1px solid transparent' }}
                      />
                    ) : (
                      <span style={{ fontWeight: 600, fontSize: '0.8125rem' }}>{s.name}</span>
                    )}
                    {canEdit ? (
                      <input
                        defaultValue={s.cost_code ?? ''}
                        aria-label="Section cost code"
                        placeholder="code"
                        list="division-cost-codes"
                        onBlur={(e) => {
                          const c = parseCostCodeInput(e.target.value);
                          if (!c.ok) {
                            setError(c.error);
                            return;
                          }
                          if (c.code !== s.cost_code) void run(updateSection(s.id, { cost_code: c.code }));
                        }}
                        style={{ width: '5rem', fontFamily: 'var(--font-mono, monospace)', fontSize: '0.75rem' }}
                      />
                    ) : (
                      <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.75rem' }}>{s.cost_code ?? ''}</span>
                    )}
                    <span style={{ marginLeft: 'auto', fontSize: '0.8125rem', fontWeight: 600 }} data-testid="section-total">
                      {fmtMoney(sTotal)}
                    </span>
                    {canEdit && (
                      <>
                        <button type="button" style={smallBtn} data-testid="section-add-line" onClick={() => setSheet({ mode: 'new', divisionId: d.id, sectionId: s.id })}>
                          + Line
                        </button>
                        <button
                          type="button"
                          aria-label={`Remove section ${s.name}`}
                          style={{ ...smallBtn, color: '#c0362c' }}
                          onClick={async () => {
                            if (await confirm(`Remove section "${s.name}" and its lines?`)) await run(removeSection(s.id));
                          }}
                        >
                          ✕
                        </button>
                      </>
                    )}
                  </div>
                  {linesTable(sLines)}
                </div>
              );
            })}
          </section>
        );
      })}

      <datalist id="division-cost-codes">
        {data.codes.map((c) => (
          <option key={c.code} value={c.code}>
            {c.title}
          </option>
        ))}
      </datalist>

      {/* ── Below the divisions: the block (H-7, H-8, H-8a) ── */}
      <section data-testid="bottom-block" style={{ marginTop: '1.25rem', borderTop: '2px solid #e4e8ef', paddingTop: '0.75rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, marginBottom: '0.5rem' }}>
          <span>Sub Total (all divisions)</span>
          <span data-testid="division-subtotal">{fmtMoney(solved.subtotal)}</span>
        </div>

        {preview && preview.consequences.length > 0 && (
          <div
            data-testid="drag-consequences"
            role="status"
            style={{ background: '#fff7e6', border: '1px solid #f3d9a4', borderRadius: '0.375rem', padding: '0.5rem 0.75rem', fontSize: '0.8125rem', marginBottom: '0.5rem' }}
          >
            <strong>Dropping here changes what is charged:</strong>
            <ul style={{ margin: '0.25rem 0 0', paddingLeft: '1.1rem' }}>
              {preview.consequences.map((c) => (
                <li key={c.id}>{describeConsequence(c)}</li>
              ))}
            </ul>
          </div>
        )}

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            {(data.bottom ?? []).map((b, i) => {
              const r = solvedLines[i];
              const isGross = b.charge_mode === 'total';
              return (
                <tr
                  key={b.id}
                  data-testid="bottom-line"
                  data-line-id={b.id}
                  draggable={canEdit}
                  onDragStart={() => setDragFrom(i)}
                  onDragOver={(e) => {
                    if (dragFrom == null) return;
                    e.preventDefault();
                    if (preview?.to !== i) setPreview({ to: i, consequences: previewMove(block, dragFrom, i).consequences });
                  }}
                  onDragEnd={() => {
                    setDragFrom(null);
                    setPreview(null);
                  }}
                  onDrop={async (e) => {
                    e.preventDefault();
                    const from = dragFrom;
                    setDragFrom(null);
                    setPreview(null);
                    if (from != null && from !== i) await commitMove(from, i);
                  }}
                  style={{
                    borderBottom: '1px solid #f1f3f7',
                    background: isGross ? '#f5f7ff' : undefined,
                    outline: preview?.to === i ? '2px dashed #3b4ae0' : undefined,
                  }}
                >
                  <td style={{ ...cell, width: '1.5rem', cursor: canEdit ? 'grab' : 'default', color: '#9aa4b8' }} aria-hidden>
                    {canEdit ? '⋮⋮' : ''}
                  </td>
                  <td style={cell}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                      {canEdit ? (
                        <input
                          defaultValue={b.name}
                          aria-label="Charge name"
                          onBlur={(e) => {
                            const v = e.target.value.trim();
                            if (v && v !== b.name) void run(updateBottomLine(b.id, { name: v }));
                          }}
                          style={{ fontWeight: 600, fontSize: '0.8125rem', border: '1px solid transparent', width: '10rem' }}
                        />
                      ) : (
                        <strong>{b.name}</strong>
                      )}
                      {canEdit ? (
                        <select
                          aria-label="How it is charged"
                          data-testid="bottom-mode"
                          value={b.charge_mode}
                          onChange={(e) => void run(updateBottomLine(b.id, { charge_mode: e.target.value as BottomLine['charge_mode'] }))}
                          style={{ fontSize: '0.75rem' }}
                        >
                          <option value="amount">Flat amount</option>
                          <option value="base">% of what is above it</option>
                          <option value="total">% of the final total (gross-up)</option>
                        </select>
                      ) : null}
                      {b.charge_mode === 'amount' ? (
                        <DblClickNumber
                          testId="bottom-amount"
                          value={b.amount == null ? null : Number(b.amount)}
                          format={(v) => fmtMoney(v)}
                          disabled={!canEdit}
                          onSave={async (v) => {
                            await run(updateBottomLine(b.id, { amount: v }));
                          }}
                        />
                      ) : (
                        <DblClickNumber
                          testId="bottom-rate"
                          value={b.rate == null ? null : Number(b.rate)}
                          format={(v) => (v == null ? 'set a rate' : `${v}%`)}
                          disabled={!canEdit}
                          onSave={async (v) => {
                            await run(updateBottomLine(b.id, { rate: v }));
                          }}
                        />
                      )}
                      {canEdit && b.charge_mode === 'base' && (
                        <button type="button" style={smallBtn} onClick={() => setBaseEditorFor(baseEditorFor === b.id ? null : b.id)}>
                          Base…
                        </button>
                      )}
                    </div>
                    {/* H-8a ⚠️ THE BASIS IN WORDS, ON THE ROW, ALWAYS. */}
                    <div data-testid="bottom-basis" style={{ fontSize: '0.75rem', color: r?.error ? '#c0362c' : '#5b6472', marginTop: '0.15rem' }}>
                      {r?.error ? `${r.basis} — ${r.error}` : r?.basis}
                    </div>
                    {baseEditorFor === b.id && b.charge_mode === 'base' && (
                      <BaseEditor
                        line={b}
                        above={(data.bottom ?? []).slice(0, i)}
                        divisions={data.divisions.map((x) => ({ id: x.id, code: x.code, name: x.name }))}
                        onSave={(patch) => void run(updateBottomLine(b.id, patch))}
                      />
                    )}
                  </td>
                  <td style={num} data-testid="bottom-value">
                    {r?.value == null ? '—' : fmtMoney(r.value)}
                  </td>
                  <td style={{ ...cell, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {canEdit && (
                      <>
                        <button type="button" aria-label={`Move ${b.name} up`} style={smallBtn} disabled={i === 0} onClick={() => void moveByButton(i, i - 1)}>
                          ↑
                        </button>{' '}
                        <button
                          type="button"
                          aria-label={`Move ${b.name} down`}
                          style={smallBtn}
                          disabled={i === data.bottom.length - 1}
                          onClick={() => void moveByButton(i, i + 1)}
                        >
                          ↓
                        </button>{' '}
                        <button
                          type="button"
                          aria-label={`Remove ${b.name}`}
                          style={{ ...smallBtn, color: '#c0362c' }}
                          onClick={async () => {
                            if (await confirm(`Remove "${b.name}" from this estimate?`)) await run(removeBottomLine(b.id));
                          }}
                        >
                          ✕
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {canEdit && (
          <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
            {(
              [
                ['percent', 'base', '% charge'],
                ['flat', 'amount', 'Flat amount'],
                ['contingency', 'amount', 'Contingency'],
                ['allowance', 'amount', 'Allowance'],
                ['bond', 'total', 'Bond'],
              ] as const
            ).map(([kind, mode, label]) => (
              <button
                key={kind}
                type="button"
                style={smallBtn}
                data-testid={`add-bottom-${kind}`}
                onClick={() =>
                  void run(
                    addBottomLine(estimateId, {
                      name: label === '% charge' ? 'New charge' : label,
                      kind,
                      charge_mode: mode,
                      sort_order: data.bottom.length,
                    })
                  )
                }
              >
                + {label}
              </button>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '1.05rem', marginTop: '0.75rem', borderTop: '2px solid #111827', paddingTop: '0.5rem' }}>
          <span>Total Construction</span>
          {solved.ok ? (
            <span data-testid="division-grand-total">{fmtMoney(solved.total)}</span>
          ) : (
            // H-8 ⚠️ NEVER A NUMBER when there is no solution.
            <span data-testid="division-total-refused" role="alert" style={{ color: '#c0362c', fontSize: '0.875rem', maxWidth: '32rem', textAlign: 'right' }}>
              No total — {solved.error}
            </span>
          )}
        </div>
      </section>

      {sheet && (
        <LineDetailSheet
          open
          onClose={() => setSheet(null)}
          title={sheet.mode === 'new' ? 'New line' : (data.lines.find((l) => l.id === sheet.lineId)?.name ?? 'Line')}
          subtitle={(() => {
            const divId = sheet.mode === 'new' ? sheet.divisionId : data.lines.find((l) => l.id === sheet.lineId)?.division_id;
            const dv = data.divisions.find((x) => x.id === divId);
            return dv ? `Div ${dv.code} · ${dv.name}` : undefined;
          })()}
          fields={lineFields(sheet.mode === 'edit' ? (data.lines.find((l) => l.id === sheet.lineId) ?? null) : null)}
          readOnly={!canEdit}
          onSave={saveLine}
        />
      )}
    </div>
  );
}

function describeConsequence(c: MoveConsequence): string {
  const parts: string[] = [];
  if (c.gains.length) parts.push(`will now also charge on ${c.gains.join(', ')}`);
  if (c.loses.length) parts.push(`will no longer charge on ${c.loses.join(', ')}`);
  return `${c.name} ${parts.join(' and ')}`;
}

/** H-8 / H-8a: the exception editor. Sub Total OR individual divisions (never both), and the
 *  lines above it, all ticked by default — unticking makes the exception. Mode-2 lines are not
 *  offered: they are on the final total and never in a mode-1 base. */
function BaseEditor({
  line,
  above,
  divisions,
  onSave,
}: {
  line: BottomLine;
  above: BottomLine[];
  divisions: { id: string; code: string; name: string }[];
  onSave: (patch: { base_division_ids?: string[] | null; base_excluded_ids?: string[] }) => void;
}) {
  const usesSubtotal = line.base_division_ids == null;
  const excluded = new Set(line.base_excluded_ids ?? []);
  return (
    <div data-testid="base-editor" style={{ marginTop: '0.4rem', padding: '0.5rem', background: '#f8f9fb', borderRadius: '0.375rem', fontSize: '0.75rem' }}>
      <label style={{ display: 'block' }}>
        <input type="checkbox" checked={usesSubtotal} onChange={(e) => onSave({ base_division_ids: e.target.checked ? null : [] })} /> Sub Total (all divisions)
      </label>
      {!usesSubtotal && (
        <div style={{ marginLeft: '1rem' }}>
          {divisions.map((d) => {
            const on = line.base_division_ids?.includes(d.id) ?? false;
            return (
              <label key={d.id} style={{ display: 'block' }}>
                <input
                  type="checkbox"
                  checked={on}
                  onChange={(e) => {
                    const cur = new Set(line.base_division_ids ?? []);
                    if (e.target.checked) cur.add(d.id);
                    else cur.delete(d.id);
                    onSave({ base_division_ids: [...cur] });
                  }}
                />{' '}
                Div {d.code} {d.name}
              </label>
            );
          })}
        </div>
      )}
      {above
        .filter((a) => a.charge_mode !== 'total')
        .map((a) => (
          <label key={a.id} style={{ display: 'block' }}>
            <input
              type="checkbox"
              checked={!excluded.has(a.id)}
              onChange={(e) => {
                const next = new Set(excluded);
                if (e.target.checked) next.delete(a.id);
                else next.add(a.id);
                onSave({ base_excluded_ids: [...next] });
              }}
            />{' '}
            {a.name}
          </label>
        ))}
    </div>
  );
}
