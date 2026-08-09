import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isBoundaryHour, zonedWeekday } from '@framefocus/shared/utils/notify-hours';
import { weekWindow } from '@framefocus/shared/utils/time-tracking';
import { resolveLink } from '@/lib/notify/links';

// ============================================================================
// SLICE 8 — §3h / ND-9, timesheets ready. No migration.
// Spec: docs/specs/notifications-architecture.md §3h, ND-9, R4.
// ============================================================================
//
// The cron cannot be driven end to end (it needs CRON_SECRET, a live company
// set and a clock at the right hour), so the TIMING DECISION was extracted into
// pure functions and those are what get tested. §3f is where this lesson came
// from: an inline `===` inside a route is a decision nobody can exercise.

describe('isBoundaryHour — the per-company cron trigger', () => {
  // 2026-08-10 is a Monday. 11:00 UTC = 07:00 America/New_York.
  const monday11utc = new Date('2026-08-10T11:00:00Z');

  it('fires during the hour that contains the boundary', () => {
    expect(isBoundaryHour(monday11utc, 'America/New_York', '07:00')).toBe(true);
  });

  it('does NOT fire in the hour before or after', () => {
    expect(isBoundaryHour(new Date('2026-08-10T10:00:00Z'), 'America/New_York', '07:00')).toBe(
      false
    );
    expect(isBoundaryHour(new Date('2026-08-10T12:00:00Z'), 'America/New_York', '07:00')).toBe(
      false
    );
  });

  it('IGNORES the minutes, on purpose', () => {
    // An hourly cron cannot hit 16:30. Comparing minutes would mean the check
    // NEVER fires for every company whose boundary is off the hour — silence,
    // which is worse than firing early inside the right hour.
    expect(isBoundaryHour(new Date('2026-08-10T20:00:00Z'), 'America/New_York', '16:30')).toBe(
      true
    );
  });

  it('is evaluated in the COMPANY timezone, so one instant is not one hour', () => {
    // The whole reason this is not a daily UTC cron. Same instant, two
    // companies, only one of them is at its 07:00.
    const instant = new Date('2026-08-10T11:00:00Z');
    expect(isBoundaryHour(instant, 'America/New_York', '07:00')).toBe(true); // 07:00 EDT
    expect(isBoundaryHour(instant, 'America/Los_Angeles', '07:00')).toBe(false); // 04:00 PDT
    expect(isBoundaryHour(instant, 'America/Los_Angeles', '04:00')).toBe(true);
  });

  it('fails CLOSED on an unusable boundary', () => {
    // The opposite direction from isInsideNotifyWindow, which fails OPEN.
    // Failing open here would fire this cron every hour of every day for that
    // company — noisy in the window is tolerable, hourly notifications are not.
    expect(isBoundaryHour(monday11utc, 'America/New_York', null)).toBe(false);
    expect(isBoundaryHour(monday11utc, 'America/New_York', 'garbage')).toBe(false);
    expect(isBoundaryHour(monday11utc, 'America/New_York', '99:99')).toBe(false);
  });
});

describe('zonedWeekday — 0 = Sunday, matching companies.week_starts_on', () => {
  it('agrees with the convention week_starts_on uses', () => {
    // If these disagreed, §3h would fire on the wrong day and look like a
    // timezone bug rather than an off-by-one in a lookup table.
    expect(zonedWeekday(new Date('2026-08-09T16:00:00Z'), 'America/New_York')).toBe(0); // Sun
    expect(zonedWeekday(new Date('2026-08-10T16:00:00Z'), 'America/New_York')).toBe(1); // Mon
    expect(zonedWeekday(new Date('2026-08-15T16:00:00Z'), 'America/New_York')).toBe(6); // Sat
  });

  it('reads the LOCAL day, not the UTC one', () => {
    // 2026-08-10T02:00Z is still Sunday evening in New York. A UTC read says
    // Monday and the week-start check fires a day early for every company west
    // of Greenwich.
    const instant = new Date('2026-08-10T02:00:00Z');
    expect(zonedWeekday(instant, 'UTC')).toBe(1);
    expect(zonedWeekday(instant, 'America/New_York')).toBe(0);
  });
});

describe('§3h — the week being talked about is the one that CLOSED', () => {
  const tz = 'America/New_York';
  const mondayMorning = new Date('2026-08-10T11:00:00Z');

  it('resolves to the previous week, not the one just started', () => {
    const current = weekWindow(mondayMorning, tz, 1);
    const closed = weekWindow(new Date(current.weekStart.getTime() - 1), tz, 1);

    // The closed week ends exactly where the current one begins — no gap, no
    // overlap, so no session can fall between two notifications or into both.
    expect(closed.weekEnd.getTime()).toBe(current.weekStart.getTime());
    expect(closed.weekStart.getTime()).toBeLessThan(current.weekStart.getTime());
  });

  it('the week key is the LOCAL date, not a sliced ISO string', () => {
    // `weekStart` is a UTC instant representing LOCAL midnight, so slicing the
    // ISO string reads back the wrong DAY for any zone ahead of UTC. This is a
    // real defect for exactly some customers, which is the kind that ships.
    const sydney = weekWindow(new Date('2026-08-10T02:00:00Z'), 'Australia/Sydney', 1);
    const sliced = sydney.weekStart.toISOString().slice(0, 10);
    const formatted = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Australia/Sydney',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(sydney.weekStart);

    expect(formatted).not.toBe(sliced);
    expect(zonedWeekday(sydney.weekStart, 'Australia/Sydney')).toBe(1); // a Monday
  });
});

describe('§3h — the destination', () => {
  it('carries the week so the link opens the week being discussed', () => {
    expect(resolveLink('timesheet_week', { week: '2026-08-03' }, 'desktop')).toBe(
      '/dashboard/timeclock/timesheets?week=2026-08-03'
    );
  });

  it('has no mobile destination — ND-9 addresses desktop roles', () => {
    expect(resolveLink('timesheet_week', { week: '2026-08-03' }, 'mobile')).toBeNull();
  });
});

describe('the cron wiring', () => {
  const source = readFileSync(
    fileURLToPath(new URL('../app/api/cron/timesheets-ready/route.ts', import.meta.url)),
    'utf8'
  );
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('is secured by CRON_SECRET before it reads anything', () => {
    expect(code).toContain('CRON_SECRET');
    expect(code.indexOf('CRON_SECRET')).toBeLessThan(code.indexOf("from('companies')"));
    expect(code).toContain('status: 401');
  });

  it('gates on BOTH the weekday and the hour', () => {
    // Either alone is wrong: the hour alone fires every day, the weekday alone
    // fires at whatever hour the cron happens to run.
    expect(code).toContain('zonedWeekday(now, tz) !== weekStartsOn');
    expect(code).toContain('isBoundaryHour(now, tz, company.notify_hours_start)');
  });

  it('sends nothing when there is nothing to approve', () => {
    // A weekly "0 timesheets ready" is the always-present-badge problem in
    // notification form — it is what teaches somebody to stop reading these.
    expect(code).toContain('if (!count)');
  });

  it('addresses Owner/Admin only — ND-9, never the worker', () => {
    expect(code).toContain('getManagerNotifyRecipients');
    // The cut row from S89. A per-worker recipient here would be a plausible
    // "improvement" that reverses a deliberate ruling.
    expect(code).not.toContain('crew');
    expect(code).not.toContain('member_id');
  });

  it('one company failing does not abandon the loop', () => {
    const loop = code.slice(code.indexOf('for (const company'));
    expect(loop).toContain('catch');
    expect(loop).toContain('errors.push');
  });

  it('is registered to run HOURLY, not daily', () => {
    // The route is correct and unreachable if vercel.json disagrees.
    const vercel = JSON.parse(
      readFileSync(fileURLToPath(new URL('../vercel.json', import.meta.url)), 'utf8')
    ) as { crons: Array<{ path: string; schedule: string }> };
    const entry = vercel.crons.find((c) => c.path === '/api/cron/timesheets-ready');
    expect(entry, 'the cron must be registered').toBeDefined();
    expect(entry!.schedule).toBe('0 * * * *');
  });
});
