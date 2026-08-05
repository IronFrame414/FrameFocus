import { describe, it, expect } from 'vitest';
import type { CalendarEvent } from '@/lib/services/schedule';
import { selectUpNext, upNextDateLine } from '@/app/m/p/[projectId]/up-next';
import { daysLeft, daysLeftLabel, formatMoney } from '@/app/m/mobile-ui';

// M6M — the pure rules behind M-2's card footer and M-3's "Up next" card.
//
// These are the halves of A-10e / A-11d / A-11f / A-11g / A-11i that do not
// need a browser. The browser halves live in e2e/m-hubs.spec.ts and assert the
// same rules against real data; this file pins the ARITHMETIC and the ORDERING,
// where a browser test can only observe one day's worth of each.
//
// A-11g in particular is worth having twice. The tie-break's failure mode is
// non-determinism, and a browser test can only sample it a few times; here the
// full ordering is stated outright.

function evt(over: Partial<CalendarEvent> & { start_date: string }): CalendarEvent {
  return {
    id: over.id ?? `${over.source ?? 'general'}-${over.title ?? over.start_date}`,
    source: over.source ?? 'general',
    title: over.title ?? 'Untitled',
    end_date: over.end_date ?? over.start_date,
    member_id: null,
    member_name: null,
    member_type: null,
    color: null,
    project_id: 'p1',
    project_label: null,
    detail: over.detail ?? {},
    ...over,
  };
}

describe('M-3 · "Up next" selection (D-24)', () => {
  const today = '2026-08-05';

  it('takes the first event dated today or later', () => {
    const picked = selectUpNext(
      [
        evt({ start_date: '2026-08-01', title: 'past' }),
        evt({ start_date: '2026-08-09', title: 'later' }),
        evt({ start_date: '2026-08-07', title: 'next' }),
      ],
      today
    );
    expect(picked?.title).toBe('next');
  });

  it('includes an event dated TODAY — the boundary is >=, not >', () => {
    const picked = selectUpNext(
      [evt({ start_date: today, title: 'this morning' }), evt({ start_date: '2026-08-06' })],
      today
    );
    expect(picked?.title).toBe('this morning');
  });

  it('returns null when nothing is dated today or later', () => {
    expect(selectUpNext([evt({ start_date: '2026-07-01' })], today)).toBeNull();
    expect(selectUpNext([], today)).toBeNull();
  });

  it('tie-breaks same-date events inspection -> task -> general', () => {
    const sameDay = [
      evt({ start_date: '2026-08-07', source: 'general', title: 'AAA general' }),
      evt({ start_date: '2026-08-07', source: 'task', title: 'ZZZ task' }),
      evt({ start_date: '2026-08-07', source: 'inspection', title: 'ZZZ inspection' }),
    ];
    // The inspection wins despite sorting LAST alphabetically — the source rank
    // is applied before the title, which is the whole point of the rule.
    expect(selectUpNext(sameDay, today)?.source).toBe('inspection');
    expect(selectUpNext([...sameDay].reverse(), today)?.source).toBe('inspection');
  });

  it('falls through to title ascending when date and source match', () => {
    const picked = selectUpNext(
      [
        evt({ start_date: '2026-08-07', source: 'task', title: 'Beta' }),
        evt({ start_date: '2026-08-07', source: 'task', title: 'Alpha' }),
      ],
      today
    );
    expect(picked?.title).toBe('Alpha');
  });

  it('is deterministic — input order never changes the answer', () => {
    const events = [
      evt({ start_date: '2026-08-07', source: 'general', title: 'g' }),
      evt({ start_date: '2026-08-07', source: 'task', title: 'b' }),
      evt({ start_date: '2026-08-07', source: 'task', title: 'a' }),
      evt({ start_date: '2026-08-08', source: 'inspection', title: 'i' }),
    ];
    const answers = new Set(
      [events, [...events].reverse(), [events[2], events[0], events[3], events[1]]].map(
        (order) => selectUpNext(order, today)?.id
      )
    );
    expect(answers.size).toBe(1);
  });

  it('does not mutate the array it is given', () => {
    const events = [evt({ start_date: '2026-08-09' }), evt({ start_date: '2026-08-07' })];
    const before = events.map((e) => e.start_date);
    selectUpNext(events, today);
    expect(events.map((e) => e.start_date)).toEqual(before);
  });
});

describe('M-3 · the "Up next" date line (A-11i)', () => {
  const today = '2026-08-05';

  it('always carries the date, whatever the relative phrasing', () => {
    for (const d of ['2026-08-05', '2026-08-06', '2026-08-12']) {
      expect(upNextDateLine(d, today)).toContain(d);
    }
  });

  it('renders the relative phrase ahead of it', () => {
    expect(upNextDateLine('2026-08-05', today)).toMatch(/^Today · /);
    expect(upNextDateLine('2026-08-06', today)).toMatch(/^Tomorrow · /);
    expect(upNextDateLine('2026-08-08', today)).toMatch(/^In 3 days · /);
  });
});

describe('M-2 / M-3 · days left (A-10e, A-11d)', () => {
  it('is null when target_end_date is unset — the em-dash state, never zero', () => {
    expect(daysLeft(null)).toBeNull();
    expect(daysLeftLabel(null)).toBe('—');
  });

  it('goes NEGATIVE past target rather than clamping at zero', () => {
    const past = new Date();
    past.setDate(past.getDate() - 4);
    const n = daysLeft(past.toISOString().slice(0, 10));
    expect(n).toBe(-4);
    expect(daysLeftLabel(past.toISOString().slice(0, 10))).toBe('-4 days left');
  });

  it('counts forward from today', () => {
    const soon = new Date();
    soon.setDate(soon.getDate() + 9);
    expect(daysLeft(soon.toISOString().slice(0, 10))).toBe(9);
  });

  it('is zero — not null — on the target date itself', () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(daysLeft(today)).toBe(0);
    expect(daysLeftLabel(today)).toBe('0 days left');
  });
});

describe('§2 money token (D-46) — unchanged by this slice', () => {
  // Guard: M-2/M-3/M-7 render no currency, and the token they inherit must not
  // drift while other screens are edited around it.
  it('keeps all four cases', () => {
    expect(formatMoney(1234.56)).toBe('$1,234.56');
    expect(formatMoney(-1234.56)).toBe('-$1,234.56');
    expect(formatMoney(0)).toBe('$0.00');
    expect(formatMoney(null)).toBe('—');
  });
});
