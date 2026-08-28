'use client';

// 7A §5.8 — GL account mapping + company fixed burden (Owner/Admin; the page
// gate). Four free-text QB account paths (stored now, consumed by the 7G
// connector) + the company fixed $/hr — the '+' arm of the per-member burden
// toggle (§2.6). gl_account_labor exists for the FUTURE labor export; labor
// is never an expense capture category (Q5).
//
// Step 8 (desktop redesign §8.11.1) — RULED [Josh]: everything autosaves.
// This form moves from a manual Save to the same 1s-debounce per-field
// pattern as the other tabs. Two copy burdens land with it:
//   · QuickBooks is NOT connected — 7G is deferred and no export service
//     exists. The copy must not imply an export happens today.
//   · `gl_account_*` is NOT snapshotted. It is read at export time, so a
//     mapping change is retroactive to all future exports — the opposite of
//     the frozen burden beside it, and the screen says so (the inventory's
//     D3 warning: it sits beside a frozen value and reads like one).

import { useRef, useState } from 'react';
import {
  updateGLMappingSettings,
  type GLMappingSettings,
  type UpdateGLMappingSettingsInput,
} from '@/lib/services/company-client';
import { color } from '@/lib/theme';

interface GLMappingSettingsFormProps {
  settings: GLMappingSettings;
}

type FieldKey =
  | 'gl_account_labor'
  | 'gl_account_material'
  | 'gl_account_subcontractor'
  | 'gl_account_other'
  | 'fixed_burden_per_hour';

const FIELD_DEFS: { key: Exclude<FieldKey, 'fixed_burden_per_hour'>; label: string }[] = [
  { key: 'gl_account_labor', label: 'Labor' },
  { key: 'gl_account_material', label: 'Material' },
  { key: 'gl_account_subcontractor', label: 'Subcontractor' },
  { key: 'gl_account_other', label: 'Other' },
];

const SAVE_DEBOUNCE_MS = 1000;

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.5rem 0.75rem',
  border: `1px solid ${color.inputBorder}`,
  borderRadius: '8px',
  fontSize: '0.875rem',
  minHeight: '42px',
  color: color.navy,
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '12.5px',
  fontWeight: 600,
  marginBottom: '0.25rem',
  color: color.body,
};

export function GLMappingSettingsForm({ settings }: GLMappingSettingsFormProps) {
  const [values, setValues] = useState<Record<string, string>>({
    gl_account_labor: settings.gl_account_labor ?? '',
    gl_account_material: settings.gl_account_material ?? '',
    gl_account_subcontractor: settings.gl_account_subcontractor ?? '',
    gl_account_other: settings.gl_account_other ?? '',
  });
  const [fixedBurden, setFixedBurden] = useState(
    settings.fixed_burden_per_hour === null ? '' : String(settings.fixed_burden_per_hour)
  );
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [savedField, setSavedField] = useState<FieldKey | null>(null);
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function setFieldError(field: FieldKey, msg: string | null) {
    setErrors((prev) => {
      const next = { ...prev };
      if (msg) next[field] = msg;
      else delete next[field];
      return next;
    });
  }

  function showSaved(field: FieldKey) {
    setSavedField(field);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => setSavedField(null), 2000);
  }

  function scheduleSave(field: FieldKey, updates: UpdateGLMappingSettingsInput) {
    if (timersRef.current[field]) clearTimeout(timersRef.current[field]);
    timersRef.current[field] = setTimeout(async () => {
      const result = await updateGLMappingSettings(settings.id, updates);
      if (result.success) {
        showSaved(field);
      } else {
        setFieldError(field, result.error || 'Save failed — try again.');
      }
    }, SAVE_DEBOUNCE_MS);
  }

  function handleGlBlur(field: Exclude<FieldKey, 'fixed_burden_per_hour'>) {
    const trimmed = values[field].trim();
    if (trimmed !== values[field]) setValues((prev) => ({ ...prev, [field]: trimmed }));
    setFieldError(field, null);
    scheduleSave(field, { [field]: trimmed || null });
  }

  function handleBurdenBlur() {
    const raw = fixedBurden.trim();
    const parsed = raw === '' ? null : Number(raw);
    if (parsed !== null && (Number.isNaN(parsed) || parsed < 0)) {
      setFieldError('fixed_burden_per_hour', 'Fixed burden must be zero or more dollars per hour.');
      return;
    }
    setFieldError('fixed_burden_per_hour', null);
    scheduleSave('fixed_burden_per_hour', { fixed_burden_per_hour: parsed });
  }

  function feedback(field: FieldKey) {
    if (errors[field])
      return (
        <div style={{ color: color.danger, fontSize: '0.75rem', marginTop: '0.25rem' }}>
          {errors[field]}
        </div>
      );
    if (savedField === field)
      return (
        <div style={{ color: color.success, fontSize: '0.75rem', marginTop: '0.25rem' }}>Saved</div>
      );
    return null;
  }

  return (
    <div style={{ maxWidth: '640px' }}>
      <h2 style={{ fontSize: '15.5px', fontWeight: 700, marginBottom: '0.25rem', color: color.navy }}>
        QuickBooks GL accounts
      </h2>
      <p style={{ fontSize: '0.8125rem', color: color.muted, marginBottom: '0.5rem' }}>
        Maps your cost categories to QuickBooks accounts for the export that arrives with the
        QuickBooks connection — <strong>not connected yet</strong>. Stored now; nothing exports
        today. Example:{' '}
        <span style={{ fontFamily: 'monospace' }}>Cost of goods sold:Supplies &amp; materials</span>
      </p>
      <p style={{ fontSize: '0.8125rem', color: color.warning, marginBottom: '1rem' }}>
        Unlike the frozen labor burden below, these mappings are read at export time — changing one
        applies to everything exported after the change, including cost recorded before it.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: '0.75rem' }}>
        {FIELD_DEFS.map((f) => (
          <div key={f.key}>
            <label style={labelStyle}>{f.label}</label>
            <input
              type="text"
              value={values[f.key]}
              onChange={(e) => setValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
              onBlur={() => handleGlBlur(f.key)}
              style={inputStyle}
            />
            {feedback(f.key)}
          </div>
        ))}
      </div>

      <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, margin: '1.25rem 0 0.25rem', color: color.navy }}>
        Fixed labor burden per hour
      </h3>
      <p style={{ fontSize: '0.8125rem', color: color.muted, marginBottom: '0.5rem' }}>
        Applies only to members whose burden source is set to &quot;company fixed.&quot; Changes
        affect future time approvals only — already-approved time keeps its frozen burden.
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
        <span style={{ fontSize: '0.875rem', color: color.body }}>$</span>
        <input
          type="number"
          min="0"
          step="0.25"
          value={fixedBurden}
          onChange={(e) => setFixedBurden(e.target.value)}
          onBlur={handleBurdenBlur}
          placeholder="0.00"
          style={{ ...inputStyle, width: '120px' }}
        />
        <span style={{ fontSize: '0.875rem', color: color.muted }}>/ hr</span>
      </div>
      {feedback('fixed_burden_per_hour')}
    </div>
  );
}
