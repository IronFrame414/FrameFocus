import { describe, expect, it } from 'vitest';
import { addDays, applyDrag, daysBetween } from '@/lib/schedule/drag';

// S121 5-E [RULED Josh, ASK-6] — drag moves the whole range (length kept);
// an end moves only that end; a resize never inverts the range.

const R = { start: '2026-10-05', end: '2026-10-08' }; // 4 days

describe('move — the whole range, length preserved', () => {
  for (const d of [-9, -1, 1, 3, 30]) {
    it(`by ${d} day(s): both ends shift ${d}, length stays ${daysBetween(R.start, R.end)}`, () => {
      const r = applyDrag(R, 'move', d);
      expect(r.start).toBe(addDays(R.start, d));
      expect(r.end).toBe(addDays(R.end, d));
      expect(daysBetween(r.start, r.end)).toBe(daysBetween(R.start, R.end));
      expect(r.clamped).toBe(false);
    });
  }
  it('across a month end and a year end', () => {
    expect(applyDrag({ start: '2026-12-30', end: '2027-01-02' }, 'move', 3)).toEqual({
      start: '2027-01-02',
      end: '2027-01-05',
      clamped: false,
    });
  });
});

describe('resize — one end moves, the other stays', () => {
  it('start earlier / later; end unchanged', () => {
    expect(applyDrag(R, 'resize-start', -2)).toEqual({ start: '2026-10-03', end: R.end, clamped: false });
    expect(applyDrag(R, 'resize-start', 2)).toEqual({ start: '2026-10-07', end: R.end, clamped: false });
  });
  it('end later / earlier; start unchanged', () => {
    expect(applyDrag(R, 'resize-end', 5)).toEqual({ start: R.start, end: '2026-10-13', clamped: false });
    expect(applyDrag(R, 'resize-end', -1)).toEqual({ start: R.start, end: '2026-10-07', clamped: false });
  });
});

describe('⚠️ a resize never inverts the range — it clamps at one day and says so', () => {
  it('dragging the START past the end → a one-day bar on the end date', () => {
    expect(applyDrag(R, 'resize-start', 10)).toEqual({ start: R.end, end: R.end, clamped: true });
  });
  it('dragging the END before the start → a one-day bar on the start date', () => {
    expect(applyDrag(R, 'resize-end', -10)).toEqual({ start: R.start, end: R.start, clamped: true });
  });
  it('exactly to the other end is allowed, not clamped', () => {
    expect(applyDrag(R, 'resize-end', -3)).toEqual({ start: R.start, end: R.start, clamped: false });
  });
});
