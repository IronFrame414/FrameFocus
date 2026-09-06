import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { isOverrideType, zonedMinutesOfDay } from '@framefocus/shared/utils/notify-hours';
import { resolveLink } from '@/lib/notify/links';

// ============================================================================
// SLICE 10 — §3j / ND-17, still clocked in. No migration.
// Spec: docs/specs/notifications-architecture.md §3j, ND-17, TECH_DEBT #91.
// ============================================================================

const source = readFileSync(
  fileURLToPath(new URL('../lib/notify/crons/still-clocked-in.ts', import.meta.url)),
  'utf8'
);
const routeSource = readFileSync(
  fileURLToPath(new URL('../app/api/cron/still-clocked-in/route.ts', import.meta.url)),
  'utf8'
);
const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));

describe('§3j — the spec premise that turned out to be false', () => {
  it('6A has NO still-clocked-in emitter, so this route is the whole thing', () => {
    // §3j says "Existing emitter: 6A, per TECH_DEBT #91", and #91 says 6A emits
    // the events with only DELIVERY deferred here. It does not. #91 recorded a
    // DECISION from a UI interview as though it were shipped code.
    //
    // This test is the guard on the correction: if a 6A emitter is ever built,
    // this fails and somebody has to reconcile the two — which is exactly the
    // moment to notice there would then be TWO schedulers for one event.
    const hits = execFileSync(
      'grep',
      [
        '-rl',
        '--include=*.ts',
        '--include=*.tsx',
        '--include=*.sql',
        '-e',
        'still.clocked.in',
        '-e',
        'still_clocked_in',
        'apps/web/app',
        'apps/web/lib',
        'packages',
        'supabase',
      ],
      { cwd: repoRoot, encoding: 'utf8' }
    )
      .split('\n')
      .filter(Boolean)
      // This module's own files are the expected hits.
      .filter((f) => !f.includes('notify') && !f.includes('still-clocked-in'));

    // ⚠️ THESE TWO ARE REGISTRY DECLARATIONS, NOT PRODUCERS [S137].
    //
    // The premise this test defends — 6A has no still-clocked-in emitter — is
    // unchanged and still true. What the grep cannot distinguish is a file that
    // EMITS the notification from one that DECLARES the type enum, and
    // `notifications_type_check` necessarily lists every type, so any migration
    // that re-creates that constraint lands here.
    //
    // 20260918000000 (S137, trial lifecycle) re-creates it to add
    // `trial_warning`. It is the same category as notifications_core.sql, which
    // this list already allowed for exactly the same reason.
    //
    // 20261027000000 (S171, selections) re-creates it again to add
    // `selection_approved` / `selection_denied`. Same category, same reason;
    // its only emitter is selection-lifecycle-service.ts, which emits THOSE
    // two types and never still_clocked_in.
    //
    // 20261045000000 (PO module) re-creates it again to add
    // `po_item_missing`. Same category, same reason; its only emitter is
    // po-missing-notify.ts via the flag route, which emits THAT type and
    // never still_clocked_in.
    //
    // 20261410000000 (7G M-H, S182) re-creates it again to add
    // `qb_sync_blocked`. Same category, same reason; its only emitter is
    // lib/quickbooks/park-notify.ts, which emits THAT type and never
    // still_clocked_in. ⚠️ THE FIFTH ENTRY ON A LIST WHOSE FOUR PREDECESSORS
    // ALL ARRIVED THE SAME WAY is a sign the assertion is measuring the wrong
    // thing — every migration that restates this ALLOWLIST lands here, and the
    // CHECK necessarily names every type. Left as an exact list anyway: it is
    // cheap, and it has forced five separate authors to state in writing that
    // their migration does not emit this notification.
    expect(hits.sort(), `unexpected still-clocked-in producers: ${hits.join(', ')}`).toEqual([
      'supabase/migrations/20260905000000_notifications_core.sql',
      'supabase/migrations/20260918000000_trial_lifecycle.sql',
      'supabase/migrations/20261027000000_selection_notifications.sql',
      'supabase/migrations/20261045000000_po_item_missing_notification.sql',
      'supabase/migrations/20261410000000_qb_sync_blocked_notification.sql',
    ]);
  });
});

describe('§3j — cancellation is free in a cron, which is why it is one', () => {
  it('asks which sessions are STILL OPEN at firing time', () => {
    // "Clocking out cancels a pending event" — a cron has no pending event to
    // cancel. Somebody who clocked out at 15:50 is simply not in the result.
    expect(code).toContain("is('clock_out', null)");
    expect(code).not.toContain('cancel');
  });
});

describe('§3j — two events, and only one of them reaches management', () => {
  it('fires at 16:00 and 17:00 company-local', () => {
    expect(code).toContain('const FIRST_HOUR = 16');
    expect(code).toContain('const OVERTIME_HOUR = 17');
    expect(code).toContain('hour !== FIRST_HOUR && hour !== OVERTIME_HOUR');
  });

  it('the hour is read in the COMPANY timezone', () => {
    // 21:00 UTC is 17:00 in New York and 14:00 in Los Angeles. A UTC hour check
    // would nudge one company at the wrong time and never nudge the other.
    const instant = new Date('2026-08-10T21:00:00Z');
    expect(Math.floor(zonedMinutesOfDay(instant, 'America/New_York') / 60)).toBe(17);
    expect(Math.floor(zonedMinutesOfDay(instant, 'America/Los_Angeles') / 60)).toBe(14);
    expect(code).toContain('zonedMinutesOfDay(now, tz)');
  });

  it('managers are notified ONLY at the overtime event', () => {
    // At 16:00 it is the worker's own business; at 17:00 it is costing money.
    expect(code).toContain('isOvertime ? await getManagerNotifyRecipients(admin, company.id) : []');
    expect(code).toContain('if (isOvertime && managers.length > 0)');
  });

  it('the worker IS a recipient here — the one trace where that is true', () => {
    // ND-9 keeps timesheets away from workers. This is their own open session,
    // not an approval, so the rule does not carry over.
    expect(code).toContain("You're still clocked in");
    expect(code).toContain('recipients: [reach.recipient]');
  });

  it('the two nudges do not collapse into one on the OS side', () => {
    // Same session, same type, two events an hour apart. A tag that omitted the
    // hour would have the 17:00 nudge silently replace the 16:00 one.
    expect(code).toContain('`still-clocked-in-${session.id}-${hour}`');
  });
});

describe('§3j — it is not an override, and lands tab-only after hours', () => {
  it('still_clocked_in never overrides notify-hours', () => {
    // A company whose window closed at 16:00 gets the 17:00 nudge tab-only.
    // Correct for a nudge — ND-5's override is for incidents and nothing else.
    expect(isOverrideType('still_clocked_in')).toBe(false);
  });
});

describe('§3j — the destination and the project', () => {
  it('opens the timeclock on both surfaces', () => {
    // The action is "clock out", and both surfaces have that screen.
    expect(resolveLink('timeclock', {}, 'mobile')).toBe('/m/timeclock');
    expect(resolveLink('timeclock', {}, 'desktop')).toBe('/dashboard/timeclock');
  });

  it('the project comes from the newest segment, not the session', () => {
    // time_clock_sessions has no project_id — the same fact §3i turns on.
    expect(code).toContain("from('time_segments')");
    expect(code).toContain("order('segment_start', { ascending: false })");
    expect(code).toContain('!projectBySession.has(seg.session_id)');
  });

  it('a shop/yard session still gets nudged, with no project named', () => {
    // Real case: time with no project segment. Skipping it would silently
    // exclude exactly the people most likely to forget to clock out.
    expect(code).toContain("const where = project ? ` on ${project.name}` : ''");
  });
});

describe('the cron wiring', () => {
  it('the ROUTE is secured, and the loop only runs after the gate', () => {
    // The gate lives in route.ts and the loop in lib/ — so this asserts across
    // the split. Reading only one file would let the other lose its half.
    expect(routeSource).toContain('CRON_SECRET');
    expect(routeSource).toContain('status: 401');
    expect(routeSource.indexOf('CRON_SECRET')).toBeLessThan(routeSource.indexOf('runStillClockedIn('));
    // And the loop must NOT carry its own gate — a second, divergent check.
    expect(code).not.toContain('CRON_SECRET');
  });

  it('one company failing does not abandon the rest', () => {
    const loop = code.slice(code.indexOf('for (const company'));
    expect(loop).toContain('errors.push');
  });

  it('is registered hourly', () => {
    const vercel = JSON.parse(
      readFileSync(fileURLToPath(new URL('../vercel.json', import.meta.url)), 'utf8')
    ) as { crons: Array<{ path: string; schedule: string }> };
    const entry = vercel.crons.find((c) => c.path === '/api/cron/still-clocked-in');
    expect(entry).toBeDefined();
    expect(entry!.schedule).toBe('0 * * * *');
  });
});
