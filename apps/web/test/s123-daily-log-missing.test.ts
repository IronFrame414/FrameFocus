import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  isBoundaryHour,
  isInsideNotifyWindow,
  isOverrideType,
  shouldPushNow,
} from '@framefocus/shared/utils/notify-hours';

// ============================================================================
// SLICE 9 — §3i, daily log missing. No migration.
// Spec: docs/specs/notifications-architecture.md §3i, §9 OQ1, R4.
// ============================================================================

const source = readFileSync(
  fileURLToPath(new URL('../app/api/cron/daily-log-missing/route.ts', import.meta.url)),
  'utf8'
);
const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('§9 OQ1 — the trigger is the window END, and it lands tab-only', () => {
  const window = { start: '06:00', end: '16:00', timeZone: 'America/New_York' };

  it('the boundary hour is OUTSIDE the window, so nothing pushes', () => {
    // 20:00 UTC = 16:00 EDT — the exact hour this cron fires for this company.
    const atEnd = new Date('2026-08-10T20:00:00Z');
    expect(isBoundaryHour(atEnd, window.timeZone, window.end)).toBe(true);

    // End is EXCLUSIVE, so the firing instant is already out of hours. The row
    // is written and waits for the morning — S89 anticipated this: "Fires after
    // hours by nature -> tab-only, waiting next morning."
    expect(isInsideNotifyWindow(atEnd, window)).toBe(false);
    expect(shouldPushNow(atEnd, window, isOverrideType('daily_log_missing'))).toBe(false);
  });

  it('daily_log_missing is NOT an override, and must never become one', () => {
    // The plausible "fix" for the silent delivery above is to add this type to
    // the override list. That would put a paperwork reminder in the same class
    // as an injury — ND-5's override exists for incidents and nothing else.
    expect(isOverrideType('daily_log_missing')).toBe(false);
    expect(isOverrideType('incident')).toBe(true);
  });

  it('a company with a later day gets a later check', () => {
    // The whole point of tying it to the window rather than a clock time.
    const instant = new Date('2026-08-10T22:00:00Z'); // 18:00 EDT
    expect(isBoundaryHour(instant, 'America/New_York', '16:00')).toBe(false);
    expect(isBoundaryHour(instant, 'America/New_York', '18:00')).toBe(true);
  });
});

describe('§3i — the project link comes from time_segments, not sessions', () => {
  it('reads time_segments for the project attribution', () => {
    // `time_clock_sessions` HAS NO project_id — time is tracked per member and
    // the project lives on the segment. A query against sessions hoping for a
    // project silently finds nothing and the cron reports a clean day forever.
    expect(code).toContain("from('time_segments')");
    expect(code).toContain("not('project_id', 'is', null)");
  });

  it('counts DISTINCT members, not segments', () => {
    // The text says "(3 crew clocked in)". One person on three segments is one
    // crew member, and the head count is the only number in the notification.
    expect(code).toContain('Set<string>');
    expect(code).toContain('members.size');
  });

  it('skips a project that already has a log for that day', () => {
    expect(code).toContain("eq('log_date', logDate)");
    expect(code).toContain('filed.has(projectId)');
  });

  it('uses the COMPANY-LOCAL date, not a UTC one', () => {
    // The log date is a calendar day in the company's zone. Deriving it from
    // toISOString() would ask for the wrong day's logs either side of midnight.
    expect(code).toContain("new Intl.DateTimeFormat('en-CA'");
    expect(code).toContain('timeZone,');
  });
});

describe('§3i — the four audiences', () => {
  it('managers, project PMs, and the foreman ON SITE', () => {
    expect(code).toContain('getManagerNotifyRecipients');
    expect(code).toContain('getProjectPmNotifyRecipients');
    // The fourth audience is the only one that is not a role lookup: it is
    // derived from the DAY'S PRESENCE, so it means the foreman who was actually
    // there rather than every foreman the company employs.
    expect(code).toContain('resolveMemberReachability');
    expect(code).toContain("reach.recipient.role === 'foreman'");
  });

  it('the on-site foreman comes from the presence set, not a company query', () => {
    const block = code.slice(code.indexOf('const onSite'));
    expect(block.slice(0, block.indexOf('const crewCount'))).toContain('of members');
  });

  it('does not notify about a project that no longer exists', () => {
    // A project soft-deleted since the clock-in has no name and no screen to
    // open — a notification about it is a dead link.
    expect(code).toContain('if (!projectName) continue');
  });
});

describe('the cron wiring', () => {
  it('is secured before it reads anything', () => {
    expect(code).toContain('CRON_SECRET');
    expect(code.indexOf('CRON_SECRET')).toBeLessThan(code.indexOf("from('companies')"));
  });

  it('one company failing does not abandon the rest', () => {
    const loop = code.slice(code.indexOf('for (const company'));
    expect(loop).toContain('catch');
    expect(loop).toContain('errors.push');
  });

  it('is registered hourly alongside §3h', () => {
    const vercel = JSON.parse(
      readFileSync(fileURLToPath(new URL('../vercel.json', import.meta.url)), 'utf8')
    ) as { crons: Array<{ path: string; schedule: string }> };
    const entry = vercel.crons.find((c) => c.path === '/api/cron/daily-log-missing');
    expect(entry, 'the cron must be registered').toBeDefined();
    expect(entry!.schedule).toBe('0 * * * *');
  });
});
