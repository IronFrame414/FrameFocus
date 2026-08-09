import { describe, it, expect } from 'vitest';
import type { CalendarEvent } from '@/lib/services/schedule';
import { selectUpNext, upNextDateLine } from '@/app/m/p/[projectId]/up-next';
import { daysLeft, daysLeftLabel, formatMoney } from '@/app/m/mobile-ui';
import { calendarDayInZone, companyToday } from '@framefocus/shared/utils/dates';

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
  // `today` is an INPUT as of [S106] — the company-tz calendar day, resolved by
  // the server caller. These were clock-dependent (they derived the expected
  // value the same UTC way the code did, so they agreed with the bug); pinning
  // the day makes them deterministic AND lets the boundary be asserted below.
  const TODAY = '2026-08-06';

  it('is null when target_end_date is unset — the em-dash state, never zero', () => {
    expect(daysLeft(null, TODAY)).toBeNull();
    expect(daysLeftLabel(null, TODAY)).toBe('—');
  });

  it('goes NEGATIVE past target rather than clamping at zero', () => {
    expect(daysLeft('2026-08-02', TODAY)).toBe(-4);
    expect(daysLeftLabel('2026-08-02', TODAY)).toBe('-4 days left');
  });

  it('counts forward from today', () => {
    expect(daysLeft('2026-08-15', TODAY)).toBe(9);
  });

  it('is zero — not null — on the target date itself', () => {
    expect(daysLeft(TODAY, TODAY)).toBe(0);
    expect(daysLeftLabel(TODAY, TODAY)).toBe('0 days left');
  });

  it('[S106] counts from the COMPANY day, not the UTC day — an evening in New York', () => {
    // 21:00 EDT on the 6th is 01:00 UTC on the 7th. The old implementation
    // derived `today` from toISOString(), so every card west of UTC lost a day
    // after ~20:00 local.
    const evening = new Date('2026-08-07T01:00:00.000Z');
    expect(companyToday('America/New_York', evening)).toBe('2026-08-06');
    expect(companyToday('UTC', evening)).toBe('2026-08-07');

    expect(daysLeft('2026-08-16', companyToday('America/New_York', evening))).toBe(10);
    expect(daysLeft('2026-08-16', companyToday('UTC', evening))).toBe(9); // what shipped
  });
});

// ==========================================================================
// [S112] M-8's day grouping — the OTHER side of the same comparison.
// ==========================================================================
// S106 fixed `todayIso` and left `day` as `created_at.slice(0, 10)`, so the
// two sides of M-8's `iso === todayIso` sat in DIFFERENT zones. A photo taken
// at 21:40 in New York has created_at 01:40Z the next day: it was grouped
// under "AUG 7" — a day that had not happened where the crew was standing —
// and never said TODAY.
//
// WHY THIS IS A UNIT TEST AND NOT LEFT TO A-22d. A-22d asserts the first day
// label reads TODAY against whatever the wall clock says, so it PASSED at
// 22:00 UTC and FAILED at 01:40 UTC on the very next run. A criterion that is
// right for twenty hours a day and wrong for four is not a regression guard.
// The clock is injected here, exactly as the S106 boundary test above does.
describe('[S112] a photo taken at 21:40 in New York is labelled TODAY', () => {
  const CREATED_AT = '2026-08-07T01:40:00.000Z'; // 21:40 EDT on the 6th
  const NOW = new Date(CREATED_AT); // the crew is looking at it as they take it
  const TZ = 'America/New_York';

  it('derives the company day from the instant, not the UTC slice', () => {
    expect(calendarDayInZone(CREATED_AT, TZ)).toBe('2026-08-06');
    expect(CREATED_AT.slice(0, 10)).toBe('2026-08-07'); // what shipped
  });

  it('puts both sides of the comparison in the same zone, so it reads TODAY', () => {
    const day = calendarDayInZone(CREATED_AT, TZ);
    const todayIso = companyToday(TZ, NOW);
    expect(day).toBe(todayIso);
  });

  it('is what the half-fix got wrong — company `today` vs a UTC `day` never match', () => {
    // Reconstructing the shipped state, so the regression cannot come back
    // quietly: S106's todayIso was already correct and the mismatch was
    // entirely on the other side.
    const shippedDay = CREATED_AT.slice(0, 10);
    const s106TodayIso = companyToday(TZ, NOW);
    expect(shippedDay).not.toBe(s106TodayIso);
  });

  it('still labels a genuinely older photo by date, not TODAY', () => {
    // The fix must not turn everything into TODAY — the grouping still has to
    // separate days.
    const yesterday = calendarDayInZone('2026-08-06T01:40:00.000Z', TZ);
    expect(yesterday).toBe('2026-08-05');
    expect(yesterday).not.toBe(companyToday(TZ, NOW));
  });

  it('is a real difference in zone, not an artifact of the runner being UTC', () => {
    expect(calendarDayInZone(CREATED_AT, 'UTC')).toBe('2026-08-07');
    expect(calendarDayInZone(CREATED_AT, TZ)).toBe('2026-08-06');
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
