'use client';

// 7A §5.8 — GL account mapping + company fixed burden (Owner/Admin; the page
// gate). Four free-text QB account paths (stored now, consumed by the 7G
// connector) + the company fixed $/hr — the '+' arm of the per-member burden
// toggle (§2.6). gl_account_labor exists for the FUTURE labor export; labor
// is never an expense capture category (Q5).

import { useState } from 'react';
import {
  updateGLMappingSettings,
  type GLMappingSettings,
} from '@/lib/services/company-client';

interface GLMappingSettingsFormProps {
  settings: GLMappingSettings;
}

const FIELD_DEFS: { key: keyof GLMappingSettings & string; label: string }[] = [
  { key: 'gl_account_labor', label: 'Labor' },
  { key: 'gl_account_material', label: 'Material' },
  { key: 'gl_account_subcontractor', label: 'Subcontractor' },
  { key: 'gl_account_other', label: 'Other' },
];

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.5rem 0.75rem',
  border: '1px solid #d1d5db',
  borderRadius: '0.375rem',
  fontSize: '0.875rem',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.8125rem',
  fontWeight: 600,
  marginBottom: '0.25rem',
  color: '#374151',
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
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    const parsedBurden = fixedBurden.trim() === '' ? null : Number(fixedBurden);
    if (parsedBurden !== null && (Number.isNaN(parsedBurden) || parsedBurden < 0)) {
      setError('Fixed burden must be zero or more dollars per hour.');
      return;
    }
    setBusy(true);
    setError(null);
    setSaved(false);
    const res = await updateGLMappingSettings(settings.id, {
      gl_account_labor: values.gl_account_labor.trim() || null,
      gl_account_material: values.gl_account_material.trim() || null,
      gl_account_subcontractor: values.gl_account_subcontractor.trim() || null,
      gl_account_other: values.gl_account_other.trim() || null,
      fixed_burden_per_hour: parsedBurden,
    });
    setBusy(false);
    if (!res.success) {
      setError(res.error ?? 'Failed to save.');
      return;
    }
    setSaved(true);
  }

  return (
    <div
      style={{
        marginTop: '2rem',
        padding: '1.5rem',
        border: '1px solid #e5e7eb',
        borderRadius: '0.5rem',
        backgroundColor: '#fff',
        maxWidth: '560px',
      }}
    >
      <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '0.25rem' }}>
        QuickBooks GL accounts
      </h2>
      <p style={{ fontSize: '0.8125rem', color: '#6b7280', marginBottom: '1rem' }}>
        Used when exporting to QuickBooks. Leave blank to choose at export. Example:{' '}
        <span style={{ fontFamily: 'monospace' }}>Cost of goods sold:Supplies &amp; materials</span>
      </p>

      {FIELD_DEFS.map((f) => (
        <div key={f.key} style={{ marginBottom: '0.75rem' }}>
          <label style={labelStyle}>{f.label}</label>
          <input
            type="text"
            value={values[f.key]}
            onChange={(e) => setValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
            style={inputStyle}
          />
        </div>
      ))}

      <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, margin: '1.25rem 0 0.25rem' }}>
        Fixed labor burden per hour
      </h3>
      <p style={{ fontSize: '0.8125rem', color: '#6b7280', marginBottom: '0.5rem' }}>
        Applies only to members whose burden source is set to &quot;company fixed.&quot; Changes
        affect future time approvals only — already-approved time keeps its frozen burden.
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
        <span style={{ fontSize: '0.875rem', color: '#374151' }}>$</span>
        <input
          type="number"
          min="0"
          step="0.25"
          value={fixedBurden}
          onChange={(e) => setFixedBurden(e.target.value)}
          placeholder="0.00"
          style={{ ...inputStyle, width: '120px' }}
        />
        <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>/ hr</span>
      </div>

      {error && (
        <p style={{ color: '#dc2626', fontSize: '0.8125rem', marginBottom: '0.75rem' }}>{error}</p>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <button
          onClick={() => void handleSave()}
          disabled={busy}
          style={{
            padding: '0.5rem 1.25rem',
            backgroundColor: '#2f49d1',
            color: '#fff',
            border: 'none',
            borderRadius: '0.375rem',
            fontSize: '0.875rem',
            fontWeight: 600,
            cursor: busy ? 'default' : 'pointer',
            opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
        {saved && <span style={{ fontSize: '0.8125rem', color: '#16a34a' }}>Saved.</span>}
      </div>
    </div>
  );
}
