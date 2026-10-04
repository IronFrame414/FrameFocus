import { describe, expect, it } from 'vitest';
import { diffLineDraft, type LineField } from '@/components/estimating/line-detail-sheet';

// S128 Part C — the shared line detail sheet hands its caller ONLY what changed, and refuses
// a draft it cannot parse. The caller's service decides what a change means (Part B's
// total-vs-markup rule lives in items-tab's saveRowDetail, not here).

const fields: LineField[] = [
  { key: 'name', label: 'Name', kind: 'text', value: 'Drywall', required: true, maxLength: 200 },
  { key: 'type', label: 'Type', kind: 'readonly', value: 'Labor' },
  { key: 'rate', label: 'Rate', kind: 'number', value: 60, min: 0 },
  { key: 'markup_percent', label: 'Markup %', kind: 'number', value: null, allowNull: true },
  { key: 'apply_tax', label: 'Taxable', kind: 'checkbox', value: false },
  {
    key: 'unit',
    label: 'Unit',
    kind: 'select',
    value: 'each',
    options: [
      { value: 'each', label: 'Each' },
      { value: 'sf', label: 'SF' },
    ],
  },
  { key: 'description', label: 'Description', kind: 'textarea', value: null, maxLength: 2000 },
];

const untouched = {
  name: 'Drywall',
  rate: '60',
  markup_percent: '',
  apply_tax: false,
  unit: 'each',
  description: '',
};

describe('S128 C — diffLineDraft', () => {
  it('an untouched draft changes nothing (Save writes nothing)', () => {
    expect(diffLineDraft(fields, untouched)).toEqual({ changes: {}, error: null });
  });

  it('only the edited fields come back, typed', () => {
    const r = diffLineDraft(fields, { ...untouched, rate: '65.5', apply_tax: true, unit: 'sf' });
    expect(r).toEqual({ changes: { rate: 65.5, apply_tax: true, unit: 'sf' }, error: null });
  });

  it('A-1: a blank description is NULL, and blank-to-blank is no change', () => {
    expect(diffLineDraft(fields, { ...untouched, description: '   ' }).changes).toEqual({});
    const withText = fields.map((f) => (f.key === 'description' ? { ...f, value: 'old' } : f)) as LineField[];
    expect(diffLineDraft(withText, { ...untouched, description: '' }).changes).toEqual({
      description: null,
    });
  });

  it('trailing whitespace is not content; inner line breaks are kept', () => {
    const r = diffLineDraft(fields, { ...untouched, description: 'Patch\nand skim  \n' });
    expect(r.changes).toEqual({ description: 'Patch\nand skim' });
  });

  it('A-4: the 2,000-character cap is refused before it reaches the database', () => {
    const r = diffLineDraft(fields, { ...untouched, description: 'x'.repeat(2001) });
    expect(r.error).toMatch(/limited to 2,000 characters/);
    expect(diffLineDraft(fields, { ...untouched, description: 'x'.repeat(2000) }).error).toBeNull();
  });

  it('a required text field cannot be blanked; a number must parse and respect its minimum', () => {
    expect(diffLineDraft(fields, { ...untouched, name: ' ' }).error).toMatch(/Name is required/);
    expect(diffLineDraft(fields, { ...untouched, rate: 'abc' }).error).toMatch(/enter a number/);
    expect(diffLineDraft(fields, { ...untouched, rate: '-1' }).error).toMatch(/at least 0/);
    expect(diffLineDraft(fields, { ...untouched, rate: '' }).error).toMatch(/Rate is required/);
  });

  it('an allowNull number clears to NULL, and readonly fields never come back', () => {
    const withMarkup = fields.map((f) =>
      f.key === 'markup_percent' ? { ...f, value: 20 } : f
    ) as LineField[];
    expect(diffLineDraft(withMarkup, { ...untouched, markup_percent: '' }).changes).toEqual({
      markup_percent: null,
    });
    expect('type' in diffLineDraft(fields, { ...untouched, type: 'Material' }).changes).toBe(false);
  });
});
