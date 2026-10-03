import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TIME_EXPORT_COPY, timeExportAutoOffNotice } from '@/lib/quickbooks/time-export-copy';
import { chipFor } from '@/lib/notify/categories';

// ============================================================================
// S127 item 1 — the time-export switch SAYS when it turned itself off.
//
// Pinned from the migration text (the live harness proves the behaviour):
//   1. the three new columns are nullable with no default, so nothing existing
//      is claimed to have turned itself off;
//   2. the notifications allowlist is a SUPERSET of the one it replaces —
//      read from the previous migration that defined it, not from memory;
//   3. the notify arm is Owner-only and fires only when the switch WAS on;
//   4. the screen's sentence names the cause and the date.
// ============================================================================

const dir = '../../../supabase/migrations/';
const read = (f: string) => readFileSync(fileURLToPath(new URL(dir + f, import.meta.url)), 'utf8');
const SQL = read('20262134100000_s127_qb_time_export_auto_off.sql');
const PREVIOUS = read('20262129000000_s122_cp_notify_types.sql');

function allowlist(sql: string): string[] {
  // Either shape — `type IN (…)` here, `type = ANY (ARRAY[…])` in 20262129 —
  // up to the statement's end. Comments are stripped so a quoted word in one
  // cannot pass for a value.
  const all = [...sql.matchAll(/ADD CONSTRAINT notifications_type_check\s+CHECK([\s\S]*?);/g)];
  const body = (all[all.length - 1]?.[1] ?? '').replace(/--[^\n]*/g, '');
  return [...body.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
}

describe('S127 item 1 — the migration', () => {
  it('adds the three auto-off columns nullable, with no default, exactly once each', () => {
    expect(SQL.match(/ADD COLUMN qb_time_export_auto_off_\w+ [^,;]+/g)).toEqual([
      'ADD COLUMN qb_time_export_auto_off_at timestamptz',
      'ADD COLUMN qb_time_export_auto_off_reason text',
      'ADD COLUMN qb_time_export_auto_off_from_state text',
    ]);
    expect(SQL).not.toMatch(/auto_off_\w+ [^,;]*DEFAULT/i);
  });

  it('never turns the switch on and updates no existing row', () => {
    expect(SQL.match(/qb_time_export_enabled\s*:?=\s*true/gi)).toBeNull();
    expect(SQL.match(/^\s*UPDATE\s/gim)).toBeNull();
  });

  it('the notifications allowlist is the previous one, in order, plus exactly qb_time_export_auto_off', () => {
    const before = allowlist(PREVIOUS);
    const after = allowlist(SQL);
    expect(before.length).toBeGreaterThan(15);
    expect(after.slice(0, before.length)).toEqual(before);
    expect(after.slice(before.length)).toEqual(['qb_time_export_auto_off']);
  });

  it('notifies only when the switch WAS on, and only the Owner', () => {
    const fn = SQL.slice(SQL.indexOf('CREATE OR REPLACE FUNCTION public.enforce_companies_qb_time_export'));
    const arm = fn.slice(fn.indexOf('IF OLD.qb_time_export_enabled THEN'), fn.indexOf('NEW.qb_time_export_enabled := false;'));
    expect(arm).toContain('INSERT INTO public.notifications');
    expect(arm).toContain("AND p.role = 'owner'");
    expect(arm).toContain('AND p.is_deleted = false');
    expect(arm.match(/p\.role/g)).toHaveLength(1);
  });
});

describe('S127 item 1 — what the screen says', () => {
  it('names the cause and the date for each recorded reason', () => {
    expect(timeExportAutoOffNotice('connection_disconnected', 'Oct 3, 2026, 9:15 AM')).toBe(
      'Turned off automatically when QuickBooks was disconnected on Oct 3, 2026, 9:15 AM. ' +
        'No hours are being sent. After reconnecting, turn it on again yourself.'
    );
    expect(timeExportAutoOffNotice('connection_revoked', 'Oct 3, 2026, 9:15 AM')).toBe(
      'Turned off automatically when FrameFocus was disconnected from inside QuickBooks on Oct 3, 2026, ' +
        '9:15 AM. No hours are being sent. After reconnecting, turn it on again yourself.'
    );
  });

  it('the S124 copy is untouched', () => {
    expect(TIME_EXPORT_COPY.disconnect).toBe(
      'Disconnecting QuickBooks turns this off. After reconnecting, turn it on again yourself.'
    );
  });

  it('files under Account, beside the other QuickBooks notice', () => {
    expect(chipFor('qb_time_export_auto_off')).toBe('account');
    expect(chipFor('qb_sync_blocked')).toBe('account');
  });
});
