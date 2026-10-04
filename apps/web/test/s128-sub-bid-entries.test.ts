import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { subBidEntries, type SubBidRowInput } from '@/lib/estimates/sub-bid-entries';

// S128 1b — Part E-1: a SUB line was missing from the Sub Bids tab.
// The regression guard the spec asks for: ONE SECTION CARRYING TWO SUB LINES.
// The fixture is EST-115 as observed on 2026-10-03.

const sections = [
  { id: 'rough', name: 'Rough Phase' },
  { id: 'finish', name: 'Finish Phase' },
  { id: 'paint', name: 'Painting' }, // no sub line, no bids → not listed
];

const rows: SubBidRowInput[] = [
  {
    id: 'r1',
    line_item_id: 'rough',
    row_type: 'subcontractor',
    name: 'Electric – Rough in',
    amount: 7000,
    sort_order: 0,
  },
  {
    id: 'r2',
    line_item_id: 'rough',
    row_type: 'subcontractor',
    name: 'Plumbing – Rough in',
    amount: 850,
    sort_order: 1,
  },
  {
    id: 'r3',
    line_item_id: 'rough',
    row_type: 'labor',
    name: 'Site labor',
    amount: null,
    sort_order: 2,
  },
  {
    id: 'r4',
    line_item_id: 'finish',
    row_type: 'subcontractor',
    name: 'Electric – Finish',
    amount: 300,
    sort_order: 0,
  },
  {
    id: 'r5',
    line_item_id: 'paint',
    row_type: 'material',
    name: 'Paint',
    amount: null,
    sort_order: 0,
  },
];

describe('S128 E-1 — every SUB line is an entry', () => {
  it('⚠️ the count of SUB lines equals the count of entries (3 = 3), with one section holding two', () => {
    const entries = subBidEntries(sections, rows, []);
    const subLineCount = rows.filter((r) => r.row_type === 'subcontractor').length;
    const entryCount = entries.reduce((n, e) => n + e.subLines.length, 0);
    expect(subLineCount).toBe(3);
    expect(entryCount).toBe(subLineCount);
  });

  it('each entry is the LINE (its own name and amount), grouped under its section', () => {
    const entries = subBidEntries(sections, rows, []);
    expect(entries.map((e) => e.section.name)).toEqual(['Rough Phase', 'Finish Phase']);
    expect(entries[0].subLines).toEqual([
      { rowId: 'r1', name: 'Electric – Rough in', amount: 7000 },
      { rowId: 'r2', name: 'Plumbing – Rough in', amount: 850 },
    ]);
    expect(entries[1].subLines).toEqual([{ rowId: 'r4', name: 'Electric – Finish', amount: 300 }]);
  });

  it('Plumbing – Rough in ($850) is present — the line the tab used to hide', () => {
    const all = subBidEntries(sections, rows, []).flatMap((e) => e.subLines);
    expect(all.find((l) => l.name === 'Plumbing – Rough in')?.amount).toBe(850);
  });

  it('sort order decides the order, not array order', () => {
    const shuffled = [rows[1], rows[0], rows[3]];
    expect(subBidEntries(sections, shuffled, [])[0].subLines.map((l) => l.rowId)).toEqual([
      'r1',
      'r2',
    ]);
  });

  it('a section with bids but no sub line is still listed (as before), with no entries', () => {
    const entries = subBidEntries(sections, rows, ['paint']);
    const paint = entries.find((e) => e.section.id === 'paint');
    expect(paint?.subLines).toEqual([]);
  });

  it('the tab reads through subBidEntries, and no longer finds ONE sub row per section', () => {
    const src = readFileSync(
      join(__dirname, '..', 'app', 'dashboard', 'estimates', '[id]', 'bidding-tab.tsx'),
      'utf8'
    );
    expect(src).toContain('subBidEntries(');
    expect(src).not.toMatch(
      /rows\.find\(\s*\(r\)\s*=>\s*r\.line_item_id === lineItemId && r\.row_type === 'subcontractor'/
    );
    expect(src).toContain('data-testid="sub-line-card"');
  });
});
