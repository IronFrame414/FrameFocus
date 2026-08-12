import { describe, it, expect } from 'vitest';
import { toCsv, tablesFor, initialCursor } from './export';
import { EXPORT_CATEGORIES, filesAreIncluded } from './export-categories';

/**
 * S138 — the pure parts of the export, in the CI suite.
 *
 * The CSV serialiser gets the most attention because it is the part that
 * silently corrupts rather than failing: a daily log full of commas and
 * newlines is the NORMAL input here, not the edge case.
 */
describe('toCsv — quoting is the whole job', () => {
  it('quotes a value containing a comma', () => {
    expect(toCsv([{ note: 'framing, drywall' }])).toBe('note\n"framing, drywall"');
  });

  it('⚠️ quotes a value containing a newline — a job-site note is multi-line', () => {
    expect(toCsv([{ note: 'line one\nline two' }])).toBe('note\n"line one\nline two"');
  });

  it('⚠️ doubles embedded quotes rather than escaping with a backslash', () => {
    expect(toCsv([{ note: 'he said "ok"' }])).toBe('note\n"he said ""ok"""');
  });

  it('renders null and undefined as empty, not the strings "null"/"undefined"', () => {
    expect(toCsv([{ a: null, b: undefined }])).toBe('a,b\n,');
  });

  it('serialises an object cell as JSON so jsonb columns survive', () => {
    expect(toCsv([{ meta: { a: 1 } }])).toBe('meta\n"{""a"":1}"');
  });

  it('is empty for no rows — not a stray header', () => {
    expect(toCsv([])).toBe('');
  });

  it('keeps column order stable across rows', () => {
    const csv = toCsv([
      { a: 1, b: 2 },
      { a: 3, b: 4 },
    ]);
    expect(csv).toBe('a,b\n1,2\n3,4');
  });
});

describe('category → table mapping', () => {
  it('de-duplicates a table shared by two categories', () => {
    const tables = tablesFor(EXPORT_CATEGORIES.map((c) => c.key));
    expect(tables.length).toBe(new Set(tables).size);
  });

  it('an unknown category contributes nothing rather than throwing', () => {
    expect(tablesFor(['not-a-category'])).toEqual([]);
  });

  it('⚠️ selecting budget WITHOUT files still exports the budget tables', () => {
    const tables = tablesFor(['budget']);
    expect(tables).toContain('project_budget_items');
    expect(filesAreIncluded(['budget'])).toBe(false);
  });

  it('every category key is unique', () => {
    const keys = EXPORT_CATEGORIES.map((c) => c.key);
    expect(keys.length).toBe(new Set(keys).size);
  });
});

describe('the cursor', () => {
  it('starts at part 1 in the data phase', () => {
    expect(initialCursor()).toEqual({
      phase: 'data',
      tableIndex: 0,
      fileOffset: 0,
      part: 1,
      missing: 0,
    });
  });
});
