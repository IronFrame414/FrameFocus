// S121 5-E — drag and resize, as ARITHMETIC. Pure, so the rules are asserted
// without a pointer (test/s121-schedule-drag.test.ts). [RULED Josh, ASK-6]
//   "dragging moves the whole range. clicking the end of the bubble adjusts the
//    end (starting or ending day)."
//
//   move          both ends shift by the same whole days — LENGTH PRESERVED.
//   resize-start  only the start moves; the end stays.
//   resize-end    only the end moves; the start stays.
//   ⚠️ A resize never INVERTS the range: it CLAMPS at one day (start = end),
//   and says so (`clamped: true`) so the UI can tell the user why the bar
//   stopped.

export type DragMode = 'move' | 'resize-start' | 'resize-end';

/** YYYY-MM-DD ± n days, in UTC arithmetic (no timezone drift). */
export function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export function applyDrag(
  range: { start: string; end: string },
  mode: DragMode,
  deltaDays: number
): { start: string; end: string; clamped: boolean } {
  if (mode === 'move') {
    return { start: addDays(range.start, deltaDays), end: addDays(range.end, deltaDays), clamped: false };
  }
  if (mode === 'resize-start') {
    const next = addDays(range.start, deltaDays);
    if (next > range.end) return { start: range.end, end: range.end, clamped: true };
    return { start: next, end: range.end, clamped: false };
  }
  const next = addDays(range.end, deltaDays);
  if (next < range.start) return { start: range.start, end: range.start, clamped: true };
  return { start: range.start, end: next, clamped: false };
}
