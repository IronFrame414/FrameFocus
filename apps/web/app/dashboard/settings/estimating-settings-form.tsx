'use client';

import { useRef, useState } from 'react';
import {
  EstimatingSettings,
  PricingMode,
  TermsSection,
  UpdateEstimatingSettingsInput,
  updateEstimatingSettings,
} from '@/lib/services/company-client';
import {
  estimateNumberPrefixSchema,
  markupPercentSchema,
  marginPercentSchema,
  taxRateSchema,
} from '@framefocus/shared/validation/company-settings';
import { termsSectionSchema } from '@framefocus/shared/validation/estimate';

interface EstimatingSettingsFormProps {
  settings: EstimatingSettings;
}

// Field keys that autosave individually (everything except terms,
// which saves as a whole array).
type FieldKey =
  | 'estimate_number_prefix'
  | 'default_pricing_mode'
  | 'default_subcontractor_markup_percent'
  | 'default_material_markup_percent'
  | 'default_labor_markup_percent'
  | 'default_subcontractor_margin_percent'
  | 'default_material_margin_percent'
  | 'default_labor_margin_percent'
  | 'default_tax_rate'
  | 'default_labor_rate'
  | 'default_terms_sections';

const SAVE_DEBOUNCE_MS = 1000;

export function EstimatingSettingsForm({ settings }: EstimatingSettingsFormProps) {
  const [prefix, setPrefix] = useState(settings.estimate_number_prefix || 'EST');
  const [pricingMode, setPricingMode] = useState<PricingMode>(settings.default_pricing_mode);
  const [percents, setPercents] = useState<Record<string, string>>({
    default_subcontractor_markup_percent: toInputValue(
      settings.default_subcontractor_markup_percent
    ),
    default_material_markup_percent: toInputValue(settings.default_material_markup_percent),
    default_labor_markup_percent: toInputValue(settings.default_labor_markup_percent),
    default_subcontractor_margin_percent: toInputValue(
      settings.default_subcontractor_margin_percent
    ),
    default_material_margin_percent: toInputValue(settings.default_material_margin_percent),
    default_labor_margin_percent: toInputValue(settings.default_labor_margin_percent),
    default_tax_rate: toInputValue(settings.default_tax_rate),
    default_labor_rate: toInputValue(settings.default_labor_rate),
  });
  const [terms, setTerms] = useState<TermsSection[]>(settings.default_terms_sections ?? []);

  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [savedField, setSavedField] = useState<FieldKey | null>(null);

  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function toInputValue(v: number | null): string {
    return v == null ? '' : String(v);
  }

  function setFieldError(field: FieldKey, message: string | null) {
    setErrors((prev) => {
      const next = { ...prev };
      if (message) next[field] = message;
      else delete next[field];
      return next;
    });
  }

  function showSaved(field: FieldKey) {
    setSavedField(field);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => setSavedField(null), 2000);
  }

  // Each field saves on blur, debounced ~1s. An invalid value blocks
  // the save for that field only (4M spec).
  function scheduleSave(field: FieldKey, updates: UpdateEstimatingSettingsInput) {
    if (timersRef.current[field]) clearTimeout(timersRef.current[field]);
    timersRef.current[field] = setTimeout(async () => {
      const result = await updateEstimatingSettings(settings.id, updates);
      if (result.success) {
        showSaved(field);
      } else {
        setFieldError(field, result.error || 'Save failed — try again.');
      }
    }, SAVE_DEBOUNCE_MS);
  }

  // ── Prefix ──

  function handlePrefixBlur() {
    const normalized = prefix.trim().toUpperCase();
    setPrefix(normalized);
    const parsed = estimateNumberPrefixSchema.safeParse(normalized);
    if (!parsed.success) {
      setFieldError('estimate_number_prefix', parsed.error.errors[0].message);
      return;
    }
    setFieldError('estimate_number_prefix', null);
    scheduleSave('estimate_number_prefix', { estimate_number_prefix: normalized });
  }

  // ── Pricing mode ──

  function handlePricingMode(mode: PricingMode) {
    setPricingMode(mode);
    setFieldError('default_pricing_mode', null);
    scheduleSave('default_pricing_mode', { default_pricing_mode: mode });
  }

  // ── Percents (markups / margins / tax) ──

  function handlePercentBlur(field: FieldKey, kind: 'markup' | 'margin' | 'tax') {
    const raw = percents[field].trim();

    // Empty input → NULL (server-normalized per spec)
    if (raw === '') {
      setFieldError(field, null);
      scheduleSave(field, { [field]: null });
      return;
    }

    const num = Number(raw);
    if (Number.isNaN(num)) {
      setFieldError(field, 'Enter a number');
      return;
    }
    const schema =
      kind === 'markup' ? markupPercentSchema : kind === 'margin' ? marginPercentSchema : taxRateSchema;
    const parsed = schema.safeParse(num);
    if (!parsed.success) {
      setFieldError(field, parsed.error.errors[0].message);
      return;
    }
    setFieldError(field, null);
    scheduleSave(field, { [field]: num });
  }

  // ── Labor rate (money, 4D-rev) ──

  function handleLaborRateBlur() {
    const raw = percents.default_labor_rate.trim();
    if (raw === '') {
      setFieldError('default_labor_rate', null);
      scheduleSave('default_labor_rate', { default_labor_rate: null });
      return;
    }
    const num = Number(raw);
    if (Number.isNaN(num)) {
      setFieldError('default_labor_rate', 'Enter a number');
      return;
    }
    if (num < 0) {
      setFieldError('default_labor_rate', 'Cannot be negative');
      return;
    }
    if (num > 100000) {
      setFieldError('default_labor_rate', 'Labor rate looks too high');
      return;
    }
    setFieldError('default_labor_rate', null);
    scheduleSave('default_labor_rate', { default_labor_rate: num });
  }

  // ── Terms sections ──

  function saveTerms(next: TermsSection[]) {
    setTerms(next);
    for (const section of next) {
      const parsed = termsSectionSchema.safeParse(section);
      if (!parsed.success) {
        setFieldError('default_terms_sections', parsed.error.errors[0].message);
        return;
      }
    }
    setFieldError('default_terms_sections', null);
    scheduleSave('default_terms_sections', { default_terms_sections: next });
  }

  function updateSection(index: number, patch: Partial<TermsSection>) {
    const next = terms.map((s, i) => (i === index ? { ...s, ...patch } : s));
    setTerms(next);
  }

  function moveSection(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= terms.length) return;
    const next = [...terms];
    [next[index], next[target]] = [next[target], next[index]];
    saveTerms(next);
  }

  function removeSection(index: number) {
    const name = terms[index].name || 'this section';
    if (!window.confirm(`Remove "${name}" from the default terms?`)) return;
    saveTerms(terms.filter((_, i) => i !== index));
  }

  function addSection() {
    // New sections save once they have a name (Zod requires ≥ 1 char)
    setTerms([...terms, { name: '', content: '' }]);
  }

  // Next number preview: sequence is system-managed, read-only.
  const nextNumber = `${prefix || 'EST'}-${String(
    (settings.estimate_number_sequence ?? 0) + 1
  ).padStart(3, '0')}`;

  // ── Styles (match settings-form.tsx) ──

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.5rem 0.75rem',
    border: '1px solid #d1d5db',
    borderRadius: '0.375rem',
    fontSize: '0.875rem',
  };
  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '0.875rem',
    fontWeight: 500,
    marginBottom: '0.25rem',
    color: '#374151',
  };
  const sectionStyle: React.CSSProperties = { marginBottom: '2rem' };
  const sectionTitleStyle: React.CSSProperties = {
    fontSize: '1.1rem',
    fontWeight: 600,
    marginBottom: '1rem',
    paddingBottom: '0.5rem',
    borderBottom: '1px solid #e5e7eb',
  };
  const errorStyle: React.CSSProperties = {
    color: '#991b1b',
    fontSize: '0.75rem',
    marginTop: '0.25rem',
  };
  const savedStyle: React.CSSProperties = {
    color: '#166534',
    fontSize: '0.75rem',
    marginTop: '0.25rem',
  };
  const gridThreeCol: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    gap: '1rem',
  };
  const iconButtonStyle: React.CSSProperties = {
    padding: '0.25rem 0.5rem',
    fontSize: '0.75rem',
    backgroundColor: '#f3f4f6',
    border: '1px solid #d1d5db',
    borderRadius: '0.25rem',
    cursor: 'pointer',
  };

  function percentField(field: FieldKey, label: string, kind: 'markup' | 'margin' | 'tax') {
    return (
      <div>
        <label style={labelStyle}>{label}</label>
        <input
          inputMode="decimal"
          value={percents[field]}
          onChange={(e) => setPercents((prev) => ({ ...prev, [field]: e.target.value }))}
          onBlur={() => handlePercentBlur(field, kind)}
          style={inputStyle}
          placeholder="—"
        />
        {errors[field] && <div style={errorStyle}>{errors[field]}</div>}
        {savedField === field && <div style={savedStyle}>Saved</div>}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '640px', marginTop: '3rem' }}>
      <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>Estimating</h2>
      <p style={{ color: '#6b7280', marginBottom: '2rem', fontSize: '0.875rem' }}>
        Defaults for new estimates. Changes save automatically.
      </p>

      {/* Estimate number */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Estimate Number</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div>
            <label style={labelStyle}>Prefix</label>
            <input
              value={prefix}
              onChange={(e) => setPrefix(e.target.value.toUpperCase())}
              onBlur={handlePrefixBlur}
              style={{ ...inputStyle, textTransform: 'uppercase' }}
              placeholder="EST"
            />
            {errors.estimate_number_prefix && (
              <div style={errorStyle}>{errors.estimate_number_prefix}</div>
            )}
            {savedField === 'estimate_number_prefix' && <div style={savedStyle}>Saved</div>}
          </div>
          <div>
            <label style={labelStyle}>Next number will be</label>
            <div
              style={{
                ...inputStyle,
                backgroundColor: '#f9fafb',
                color: '#6b7280',
                border: '1px solid #e5e7eb',
              }}
            >
              {nextNumber}
            </div>
          </div>
        </div>
      </div>

      {/* Pricing mode */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Pricing Mode</div>
        <label style={labelStyle}>Default for new estimates</label>
        <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.5rem' }}>
          {(['markup', 'margin'] as const).map((mode) => (
            <label
              key={mode}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}
            >
              <input
                type="radio"
                name="default_pricing_mode"
                checked={pricingMode === mode}
                onChange={() => handlePricingMode(mode)}
              />
              {mode === 'markup' ? 'Markup' : 'Margin'}
            </label>
          ))}
        </div>
        {savedField === 'default_pricing_mode' && <div style={savedStyle}>Saved</div>}
      </div>

      {/* Default markups */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Default Markups (%)</div>
        <div style={gridThreeCol}>
          {percentField('default_subcontractor_markup_percent', 'Subcontractor', 'markup')}
          {percentField('default_material_markup_percent', 'Material', 'markup')}
          {percentField('default_labor_markup_percent', 'Labor', 'markup')}
        </div>
      </div>

      {/* Default margins */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Default Margins (%)</div>
        <div style={gridThreeCol}>
          {percentField('default_subcontractor_margin_percent', 'Subcontractor', 'margin')}
          {percentField('default_material_margin_percent', 'Material', 'margin')}
          {percentField('default_labor_margin_percent', 'Labor', 'margin')}
        </div>
      </div>

      {/* Tax rate */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Default Tax Rate (%)</div>
        <div style={{ maxWidth: '200px' }}>
          {percentField('default_tax_rate', 'Applied to materials', 'tax')}
        </div>
      </div>

      {/* Labor rate (4D-rev) */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Default Labor Rate ($)</div>
        <div style={{ maxWidth: '200px' }}>
          <label style={labelStyle}>Pre-fills new labor rows</label>
          <input
            inputMode="decimal"
            value={percents.default_labor_rate}
            onChange={(e) =>
              setPercents((prev) => ({ ...prev, default_labor_rate: e.target.value }))
            }
            onBlur={handleLaborRateBlur}
            style={inputStyle}
            placeholder="—"
          />
          {errors.default_labor_rate && <div style={errorStyle}>{errors.default_labor_rate}</div>}
          {savedField === 'default_labor_rate' && <div style={savedStyle}>Saved</div>}
        </div>
      </div>

      {/* Terms sections */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Default Terms &amp; Conditions Sections</div>
        {terms.length === 0 && (
          <p style={{ fontSize: '0.875rem', color: '#9ca3af', marginBottom: '1rem' }}>
            No default sections. New estimates will start with no terms.
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
              style={{
                display: 'flex',
                gap: '0.5rem',
                alignItems: 'center',
                marginBottom: '0.5rem',
              }}
            >
              <button
                type="button"
                onClick={() => moveSection(i, -1)}
                disabled={i === 0}
                style={{ ...iconButtonStyle, opacity: i === 0 ? 0.4 : 1 }}
                aria-label="Move section up"
              >
                ▲
              </button>
              <button
                type="button"
                onClick={() => moveSection(i, 1)}
                disabled={i === terms.length - 1}
                style={{ ...iconButtonStyle, opacity: i === terms.length - 1 ? 0.4 : 1 }}
                aria-label="Move section down"
              >
                ▼
              </button>
              <input
                value={section.name}
                onChange={(e) => updateSection(i, { name: e.target.value })}
                onBlur={() => saveTerms(terms)}
                maxLength={100}
                placeholder="Section name (e.g. Payment Terms)"
                style={{ ...inputStyle, flex: 1 }}
              />
              <button
                type="button"
                onClick={() => removeSection(i)}
                style={{ ...iconButtonStyle, color: '#991b1b' }}
                aria-label="Remove section"
              >
                ✕
              </button>
            </div>
            <textarea
              value={section.content}
              onChange={(e) => updateSection(i, { content: e.target.value })}
              onBlur={() => saveTerms(terms)}
              rows={4}
              placeholder="Section content (plain text)"
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
            />
          </div>
        ))}
        <button
          type="button"
          onClick={addSection}
          style={{
            padding: '0.5rem 1rem',
            fontSize: '0.875rem',
            backgroundColor: '#f3f4f6',
            border: '1px solid #d1d5db',
            borderRadius: '0.375rem',
            cursor: 'pointer',
          }}
        >
          + Add Section
        </button>
        {errors.default_terms_sections && (
          <div style={errorStyle}>{errors.default_terms_sections}</div>
        )}
        {savedField === 'default_terms_sections' && <div style={savedStyle}>Saved</div>}
      </div>
    </div>
  );
}
