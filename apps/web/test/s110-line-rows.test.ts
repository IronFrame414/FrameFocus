import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { planRowMove, rowsInOrder, stepRow } from '@/lib/estimate-line-order';

// S110 D — the rows inside a line: the pure plan, and the grip's focus.

describe('S110 D1 — rowsInOrder', () => {
  it('sorts by sort_order, then id — so a duplicated sort_order has ONE stable order', () => {
    expect(
      rowsInOrder([
        { id: 'c', sort_order: 0 },
        { id: 'a', sort_order: 0 },
        { id: 'b', sort_order: -1 },
      ])
    ).toEqual(['b', 'a', 'c']);
  });
});

describe('S110 D1 — planRowMove', () => {
  const ids = ['r1', 'r2', 'r3'];
  it('moves before a row', () => expect(planRowMove(ids, 'r3', 'r1')).toEqual(['r3', 'r1', 'r2']));
  it('moves to the end (before = null)', () => expect(planRowMove(ids, 'r1', null)).toEqual(['r2', 'r3', 'r1']));
  it('returns null when nothing changes (onto itself, or before its own successor)', () => {
    expect(planRowMove(ids, 'r2', 'r2')).toBeNull();
    expect(planRowMove(ids, 'r2', 'r3')).toBeNull();
    expect(planRowMove(ids, 'r3', null)).toBeNull();
  });
  it('refuses a row from another line', () => {
    expect(() => planRowMove(ids, 'x', 'r1')).toThrow();
    expect(() => planRowMove(ids, 'r1', 'x')).toThrow();
  });
  it('always returns the COMPLETE list (the RPC refuses a partial one)', () => {
    expect([...(planRowMove(ids, 'r1', 'r3') ?? [])].sort()).toEqual([...ids].sort());
  });
});

describe('S110 D1 — stepRow', () => {
  const ids = ['r1', 'r2', 'r3'];
  it('up and down swap with the neighbour', () => {
    expect(stepRow(ids, 'r2', 'up')).toEqual(['r2', 'r1', 'r3']);
    expect(stepRow(ids, 'r2', 'down')).toEqual(['r1', 'r3', 'r2']);
  });
  it('null at either end', () => {
    expect(stepRow(ids, 'r1', 'up')).toBeNull();
    expect(stepRow(ids, 'r3', 'down')).toBeNull();
  });
});

// ⚠️ S110 D2 — WHY THIS IS A SOURCE ASSERTION AS WELL AS AN E2E. S109's T2 proved
// "the handle is focused after a click" in Chromium only, which focuses a button
// on mousedown by itself; Safari and Firefox on macOS do not. The handle did
// nothing to earn the pass. The e2e (desktop-line-rows-s110) now uses a
// SYNTHETIC mousedown, which no browser focuses by default; this pins the
// mechanism so it cannot quietly go.
describe('S110 D2 — the grip focuses itself on mousedown, for lines AND rows', () => {
  const src = readFileSync(
    fileURLToPath(new URL('../app/dashboard/estimates/[id]/items-tab.tsx', import.meta.url)),
    'utf8'
  );
  it('ReorderGrip focuses on mousedown', () => {
    const grip = src.slice(src.indexOf('function ReorderGrip('));
    expect(grip).toMatch(/onMouseDown=\{\(e\) => e\.currentTarget\.focus\(\)\}/);
  });
  it('both handles are the ONE grip — no second draggable button to drift', () => {
    expect(src).toContain('testId={`line-handle-${line.id}`}');
    expect(src).toContain('testId={`row-handle-${row.id}`}');
    expect(src.match(/<button[^>]*\n?[^>]*\bdraggable\b/g)?.length ?? 0).toBe(1);
  });
});
