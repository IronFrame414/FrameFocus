import { describe, it, expect } from 'vitest';
import { attentionFor, progressFor, progressLabel } from '@/lib/project-list-derive';

// Desktop redesign §8.1 — the two ruled derivations on the 14a Projects list.
// Every case asserts on NON-EMPTY inputs; the empty/clean cases are asserted
// against their ruled renderings ("no dates set", the em-dash path returns []),
// not against silence.

describe('Progress — percent + days left, nothing else (RULED)', () => {
  it('mid-project: elapsed over span, days to target', () => {
    const p = progressFor('2026-08-01', '2026-08-21', '2026-08-11');
    expect(p).toEqual({ percent: 50, daysLeft: 10 });
    expect(progressLabel(p)).toBe('50% · 10d left');
  });

  it('past the target: clamps at 100 and says over, not negative-left', () => {
    const p = progressFor('2026-07-01', '2026-08-01', '2026-08-04');
    expect(p!.percent).toBe(100);
    expect(progressLabel(p)).toBe('100% · 3d over');
  });

  it('before the start: clamps at 0', () => {
    expect(progressFor('2026-09-01', '2026-09-30', '2026-08-28')!.percent).toBe(0);
  });

  it('either date missing → null → "no dates set", not an empty bar', () => {
    expect(progressFor(null, '2026-09-01', '2026-08-28')).toBeNull();
    expect(progressFor('2026-08-01', null, '2026-08-28')).toBeNull();
    expect(progressLabel(null)).toBe('no dates set');
  });

  it('degenerate span (end ≤ start) does not divide by zero', () => {
    expect(progressFor('2026-08-01', '2026-08-01', '2026-08-02')!.percent).toBe(100);
  });
});

describe('Needs attention — four conditions, CLOSED SET (RULED)', () => {
  it('all four fire, in the ruled order', () => {
    expect(
      attentionFor({
        hasDates: false,
        draftCoCount: 2,
        openPunchCount: 4,
        hasAcceptedUnconverted: true,
      })
    ).toEqual(['No dates set', '2 draft COs', '4 punch open', 'Accepted — convert']);
  });

  it('singular draft CO reads "1 draft CO"', () => {
    expect(
      attentionFor({ hasDates: true, draftCoCount: 1, openPunchCount: 0, hasAcceptedUnconverted: false })
    ).toEqual(['1 draft CO']);
  });

  it('clean row returns an empty set (the caller renders the em-dash)', () => {
    expect(
      attentionFor({ hasDates: true, draftCoCount: 0, openPunchCount: 0, hasAcceptedUnconverted: false })
    ).toEqual([]);
  });
});
