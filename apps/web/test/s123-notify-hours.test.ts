import { describe, it, expect } from 'vitest';
import {
  isInsideNotifyWindow,
  isOverrideType,
  minutesFromClockTime,
  shouldPushNow,
  zonedMinutesOfDay,
} from '@framefocus/shared/utils/notify-hours';

// ============================================================================
// R4 (notify-hours) and ND-5 (the incident override).
// Spec: docs/specs/notifications-architecture.md §2. A-N6..A-N9.
// ============================================================================

describe('minutesFromClockTime', () => {
  it('parses both shapes Postgres `time` comes back as', () => {
    expect(minutesFromClockTime('07:00')).toBe(420);
    expect(minutesFromClockTime('07:00:00')).toBe(420);
    expect(minutesFromClockTime('18:30')).toBe(1110);
    expect(minutesFromClockTime('00:00')).toBe(0);
  });

  it('returns null rather than a wrong number for junk', () => {
    expect(minutesFromClockTime('')).toBeNull();
    expect(minutesFromClockTime(null)).toBeNull();
    expect(minutesFromClockTime('25:00')).toBeNull();
    expect(minutesFromClockTime('07:99')).toBeNull();
    expect(minutesFromClockTime('breakfast')).toBeNull();
  });
});

describe('A-N9 — the window is evaluated in the company timezone, not server time', () => {
  it('one instant reads as different times of day in different zones', () => {
    // 2026-08-09T18:30:00Z. In New York (UTC-4 in August) that is 14:30; in
    // Los Angeles 11:30; in UTC 18:30.
    const instant = new Date('2026-08-09T18:30:00Z');

    expect(zonedMinutesOfDay(instant, 'America/New_York')).toBe(14 * 60 + 30);
    expect(zonedMinutesOfDay(instant, 'America/Los_Angeles')).toBe(11 * 60 + 30);
    expect(zonedMinutesOfDay(instant, 'UTC')).toBe(18 * 60 + 30);
  });

  it('the SAME instant is inside the window for one company and outside for another', () => {
    // THE TEST THAT ACTUALLY PROVES A-N9. A build using server time passes every
    // other assertion in this file and fails this one.
    const instant = new Date('2026-08-10T01:30:00Z'); // 21:30 in NY, 18:30 in LA
    const window = { start: '07:00', end: '20:00' };

    expect(isInsideNotifyWindow(instant, { ...window, timeZone: 'America/New_York' })).toBe(
      false
    );
    expect(
      isInsideNotifyWindow(instant, { ...window, timeZone: 'America/Los_Angeles' })
    ).toBe(true);
  });

  it('handles midnight without emitting hour 24', () => {
    // Node has been seen to emit "24" for midnight under some locale/zone pairs,
    // which would make 00:05 read as 1445 minutes and land outside every window.
    const midnight = new Date('2026-08-09T04:00:00Z'); // 00:00 in New York
    expect(zonedMinutesOfDay(midnight, 'America/New_York')).toBe(0);
  });
});

describe('window boundaries', () => {
  const tz = 'UTC';

  it('start is INCLUSIVE — §3h fires timesheets AT notify_hours_start', () => {
    // If the start were exclusive, ND-9's "fires at the start of the notify
    // window" would never fire at all.
    const atStart = new Date('2026-08-09T07:00:00Z');
    expect(isInsideNotifyWindow(atStart, { start: '07:00', end: '18:00', timeZone: tz })).toBe(
      true
    );
  });

  it('end is EXCLUSIVE — the same [start, end) convention weekWindow() uses', () => {
    const atEnd = new Date('2026-08-09T18:00:00Z');
    expect(isInsideNotifyWindow(atEnd, { start: '07:00', end: '18:00', timeZone: tz })).toBe(
      false
    );
    const justBefore = new Date('2026-08-09T17:59:00Z');
    expect(
      isInsideNotifyWindow(justBefore, { start: '07:00', end: '18:00', timeZone: tz })
    ).toBe(true);
  });

  it('a window whose end precedes its start WRAPS MIDNIGHT — a night shift, not a typo', () => {
    const w = { start: '22:00', end: '06:00', timeZone: tz };
    expect(isInsideNotifyWindow(new Date('2026-08-09T23:00:00Z'), w)).toBe(true);
    expect(isInsideNotifyWindow(new Date('2026-08-09T02:00:00Z'), w)).toBe(true);
    expect(isInsideNotifyWindow(new Date('2026-08-09T12:00:00Z'), w)).toBe(false);
  });

  it('fails OPEN on an unusable window — noisy beats silent', () => {
    // The columns are NOT NULL with defaults so this is unreachable in practice.
    // The direction matters anyway: a misconfigured company that gets extra
    // notifications complains; one that silently gets none does not, and nobody
    // finds out until an incident goes unseen.
    expect(
      isInsideNotifyWindow(new Date('2026-08-09T03:00:00Z'), {
        start: 'nonsense',
        end: '18:00',
        timeZone: tz,
      })
    ).toBe(true);
    expect(
      isInsideNotifyWindow(new Date('2026-08-09T03:00:00Z'), {
        start: '09:00',
        end: '09:00',
        timeZone: tz,
      })
    ).toBe(true);
  });
});

describe('ND-5 — every incident type overrides notify-hours', () => {
  const nightWindow = { start: '07:00', end: '18:00', timeZone: 'UTC' };
  const twoAm = new Date('2026-08-09T02:00:00Z');

  it('A-N8 an incident pushes at 02:00, outside the window', () => {
    expect(shouldPushNow(twoAm, nightWindow, isOverrideType('incident'))).toBe(true);
  });

  it('A-N6 a non-incident does NOT push outside the window', () => {
    expect(shouldPushNow(twoAm, nightWindow, isOverrideType('assignment'))).toBe(false);
    expect(shouldPushNow(twoAm, nightWindow, isOverrideType('timesheet_ready'))).toBe(false);
    expect(shouldPushNow(twoAm, nightWindow, isOverrideType('mention'))).toBe(false);
  });

  it('the override is a TYPE test, never a severity test', () => {
    // ND-5 replaced R5's serious/not-serious distinction rather than deferring
    // it: safety_incidents has no severity column and none is added. A build
    // that reintroduced severity would need a second argument here, and this
    // asserts the signature stays a single boolean derived from the type.
    expect(isOverrideType('incident')).toBe(true);
    // near_miss and property_damage are incident TYPES, not notification types —
    // they never reach this function, and that is the point: they cannot be
    // filtered out on their way in.
    expect(isOverrideType('near_miss')).toBe(false);
    expect(isOverrideType('discrepancy')).toBe(false);
  });

  it('inside the window, everything pushes', () => {
    const midday = new Date('2026-08-09T12:00:00Z');
    expect(shouldPushNow(midday, nightWindow, false)).toBe(true);
    expect(shouldPushNow(midday, nightWindow, true)).toBe(true);
  });
});
