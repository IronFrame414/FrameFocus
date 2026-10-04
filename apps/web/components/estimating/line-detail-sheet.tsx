'use client';

/**
 * S128 Part C — THE LINE DETAIL SHEET (docs/specs/estimates-and-change-orders-spec.md C-1..C-3).
 *
 * [Josh, 2026-10-03] "i should be able to click each line item to pop up the full detail on a
 * sheet and edit it."
 *
 * ONE component for every line surface — estimate lines, change-order lines, and (Part H) a
 * division estimate's lines. H-5: "+ Line opens the SAME sheet … The same component, not a
 * second one that looks like it." So it owns NO line shape: the caller passes the fields as data
 * (`LineField[]`) and receives only what changed in `onSave`. What a field MEANS (which columns a
 * save writes, what it clears) stays with the caller's service, below the UI.
 *
 * It ADDS to inline grid editing; it replaces nothing (C-1, reading taken).
 *
 * C-2's list of a section's existing lines lives in the ADD sheet that "Add Items" opens
 * (add-items-sheet.tsx); each entry there opens THIS sheet.
 *
 * Location: `components/`, mounted by `app/dashboard/` today and by any surface that needs it
 * (CLAUDE.md → PARITY: a helper under one surface claims that surface owns it).
 */

import { useEffect, useMemo, useState } from 'react';
import { ModalSheet } from '@/components/sheet/modal-sheet';

export type LineField =
  | {
      key: string;
      label: string;
      kind: 'text' | 'textarea';
      value: string | null;
      required?: boolean;
      maxLength?: number;
      placeholder?: string;
      help?: string;
      disabled?: boolean;
    }
  | {
      key: string;
      label: string;
      kind: 'number';
      value: number | null;
      allowNull?: boolean;
      min?: number;
      placeholder?: string;
      help?: string;
      disabled?: boolean;
    }
  | { key: string; label: string; kind: 'checkbox'; value: boolean; help?: string; disabled?: boolean }
  | {
      key: string;
      label: string;
      kind: 'select';
      value: string | null;
      options: { value: string; label: string }[];
      help?: string;
      disabled?: boolean;
    }
  | { key: string; label: string; kind: 'readonly'; value: string; help?: string };

export type LineFieldValue = string | number | boolean | null;

type Draft = Record<string, string | boolean>;

function toDraft(fields: LineField[]): Draft {
  const d: Draft = {};
  for (const f of fields) {
    if (f.kind === 'checkbox') d[f.key] = f.value;
    else if (f.kind === 'number') d[f.key] = f.value == null ? '' : String(f.value);
    else if (f.kind !== 'readonly') d[f.key] = f.value ?? '';
  }
  return d;
}

/** Parse the draft back, returning ONLY the fields whose value changed, or an error. */
export function diffLineDraft(
  fields: LineField[],
  draft: Draft
): { changes: Record<string, LineFieldValue>; error: string | null } {
  const changes: Record<string, LineFieldValue> = {};
  for (const f of fields) {
    if (f.kind === 'readonly' || f.disabled) continue;
    const raw = draft[f.key];
    if (f.kind === 'checkbox') {
      if (raw !== f.value) changes[f.key] = raw as boolean;
      continue;
    }
    const text = String(raw ?? '');
    if (f.kind === 'number') {
      const t = text.trim();
      if (t === '') {
        if (!f.allowNull) return { changes, error: `${f.label} is required` };
        if (f.value != null) changes[f.key] = null;
        continue;
      }
      const n = Number(t);
      if (Number.isNaN(n)) return { changes, error: `${f.label}: enter a number` };
      if (f.min != null && n < f.min) return { changes, error: `${f.label} must be at least ${f.min}` };
      if (n !== f.value) changes[f.key] = n;
      continue;
    }
    if (f.kind === 'select') {
      const v = text === '' ? null : text;
      if (v !== f.value) changes[f.key] = v;
      continue;
    }
    // text / textarea: trailing whitespace is not content; blank is NULL ("never required"
    // unless the caller says so).
    const v = text.trim() === '' ? null : text.replace(/\s+$/, '');
    if (f.required && v == null) return { changes, error: `${f.label} is required` };
    if (f.maxLength != null && v != null && v.length > f.maxLength) {
      return { changes, error: `${f.label} is limited to ${f.maxLength.toLocaleString()} characters` };
    }
    if (v !== (f.value ?? null)) changes[f.key] = v;
  }
  return { changes, error: null };
}

export function LineDetailSheet({
  open,
  onClose,
  title,
  subtitle,
  fields,
  onSave,
  readOnly,
  testId = 'line-detail-sheet',
  aboveSheet,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  fields: LineField[];
  /** Receives only the changed fields. Resolve success to close. */
  onSave: (changes: Record<string, LineFieldValue>) => Promise<{ success: boolean; error?: string }>;
  readOnly?: boolean;
  testId?: string;
  /** Opened from inside another fixed sheet (the add-items sheet, z 70): draw above it. */
  aboveSheet?: boolean;
}) {
  const initial = useMemo(() => toDraft(fields), [fields]);
  const [draft, setDraft] = useState<Draft>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(initial);
    setError(null);
  }, [initial, open]);

  async function save() {
    const { changes, error: e } = diffLineDraft(fields, draft);
    if (e) {
      setError(e);
      return;
    }
    if (Object.keys(changes).length === 0) {
      onClose();
      return;
    }
    setSaving(true);
    const r = await onSave(changes);
    setSaving(false);
    if (r.success) onClose();
    else setError(r.error || 'Save failed');
  }

  const inputClass =
    'mt-1 block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm disabled:bg-gray-50 disabled:text-gray-500';

  return (
    <ModalSheet
      open={open}
      onClose={onClose}
      title={title}
      testId={testId}
      zIndex={aboveSheet ? 80 : undefined}
    >
      <div className="mx-auto max-w-xl space-y-4 bg-white p-4 sm:my-4 sm:rounded-lg sm:p-6">
        {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
        {fields.map((f) => {
          const id = `${testId}-${f.key}`;
          if (f.kind === 'readonly') {
            return (
              <div key={f.key}>
                <div className="text-xs font-medium text-gray-600">{f.label}</div>
                <div className="mt-1 text-sm text-gray-900" data-testid={id}>
                  {f.value}
                </div>
                {f.help && <p className="mt-1 text-xs text-gray-500">{f.help}</p>}
              </div>
            );
          }
          const disabled = readOnly || f.disabled;
          if (f.kind === 'checkbox') {
            return (
              <label key={f.key} className="flex items-center gap-2 text-sm text-gray-800">
                <input
                  id={id}
                  data-testid={id}
                  type="checkbox"
                  checked={draft[f.key] as boolean}
                  disabled={disabled}
                  onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.checked }))}
                />
                {f.label}
                {f.help && <span className="text-xs text-gray-500">— {f.help}</span>}
              </label>
            );
          }
          return (
            <div key={f.key}>
              <label htmlFor={id} className="text-xs font-medium text-gray-600">
                {f.label}
              </label>
              {f.kind === 'textarea' ? (
                <textarea
                  id={id}
                  data-testid={id}
                  rows={5}
                  className={inputClass}
                  value={draft[f.key] as string}
                  placeholder={f.placeholder}
                  maxLength={f.maxLength}
                  disabled={disabled}
                  onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                />
              ) : f.kind === 'select' ? (
                <select
                  id={id}
                  data-testid={id}
                  className={inputClass}
                  value={draft[f.key] as string}
                  disabled={disabled}
                  onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                >
                  {f.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id={id}
                  data-testid={id}
                  className={inputClass}
                  inputMode={f.kind === 'number' ? 'decimal' : undefined}
                  value={draft[f.key] as string}
                  placeholder={f.placeholder}
                  maxLength={f.kind === 'text' ? f.maxLength : undefined}
                  disabled={disabled}
                  onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                />
              )}
              {f.kind === 'textarea' && f.maxLength != null && (
                <p className="mt-1 text-right text-xs text-gray-400">
                  {String(draft[f.key] ?? '').length.toLocaleString()} / {f.maxLength.toLocaleString()}
                </p>
              )}
              {f.help && <p className="mt-1 text-xs text-gray-500">{f.help}</p>}
            </div>
          );
        })}

        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}

        {!readOnly && (
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700"
            >
              Cancel
            </button>
            <button
              type="button"
              data-testid={`${testId}-save`}
              onClick={() => void save()}
              disabled={saving}
              className="rounded-md bg-blue-700 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}

      </div>
    </ModalSheet>
  );
}
