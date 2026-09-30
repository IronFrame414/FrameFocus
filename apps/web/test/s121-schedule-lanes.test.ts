import { describe, expect, it } from 'vitest';
import { layoutWeek } from '@/lib/schedule/lanes';

// S121 5-H — consecutive days render as ONE connected bar; across a week
// boundary the pieces say they continue.

const WEEK = '2026-10-04'; // Sunday
const ev = (key: string, start: string, end: string) => ({ key, start_date: start, end_date: end });

describe('one segment per event per week row', () => {
  it('a 3-day event inside the week is ONE segment spanning 3 columns (not 3 chips)', () => {
    const s = layoutWeek([ev('a', '2026-10-05', '2026-10-07')], WEEK);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ col: 1, span: 3, lane: 0, continuesLeft: false, continuesRight: false });
  });

  it('two overlapping events stack into two lanes; a later non-overlapping one reuses lane 0', () => {
    const s = layoutWeek(
      [ev('a', '2026-10-05', '2026-10-07'), ev('b', '2026-10-06', '2026-10-06'), ev('c', '2026-10-09', '2026-10-10')],
      WEEK
    );
    const by = Object.fromEntries(s.map((x) => [x.event.key, x]));
    expect(by.a.lane).toBe(0);
    expect(by.b.lane).toBe(1);
    expect(by.c.lane).toBe(0);
  });

  it('events outside the week are not in the row', () => {
    expect(layoutWeek([ev('x', '2026-09-01', '2026-09-02')], WEEK)).toHaveLength(0);
  });
});

describe('⚠️ the row break — one bar, two rows, marked as continuing', () => {
  const e = ev('span', '2026-10-08', '2026-10-13'); // Thu → next Tue
  it('the first row: from Thu to Sat, continuesRight', () => {
    expect(layoutWeek([e], WEEK)[0]).toMatchObject({ col: 4, span: 3, continuesLeft: false, continuesRight: true });
  });
  it('the next row: Sun to Tue, continuesLeft', () => {
    expect(layoutWeek([e], '2026-10-11')[0]).toMatchObject({ col: 0, span: 3, continuesLeft: true, continuesRight: false });
  });
  it('a bar longer than a week is a full-width middle row, continuing both ways', () => {
    expect(layoutWeek([ev('long', '2026-10-01', '2026-10-20')], WEEK)[0]).toMatchObject({
      col: 0,
      span: 7,
      continuesLeft: true,
      continuesRight: true,
    });
  });
});
