import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';

// S124 Part 0 — schedule-change emails are PACED to ≤ 2 per second.
// [Josh RULED Q-D3 B] Resend's default limit is 2 requests/second. Unpaced, a
// job with many email-only assignees takes a 429 and logs 'failed': evidence
// written, message never delivered.
//
// The pacer's clock is injected: `sleep` advances a fake clock, and the fake
// sendEmail records the clock at each START. ⚠️ THIS FAILS IF THE SENDS GO OUT
// UNPACED: without the wait, every start lands on the same instant.

let clock = 0;
const starts: number[] = [];
const logged: { to: string; status: string }[] = [];

vi.mock('@vercel/functions', () => ({ getDeadline: () => undefined, waitUntil: () => undefined }));
vi.mock('@/lib/notify/notify', () => ({ notify: vi.fn(async () => ({ written: 0 })) }));
vi.mock('@/lib/notify/assignment-notify', () => ({ resolveMemberReachability: vi.fn() }));
vi.mock('@/lib/services/email-service', () => ({
  sendEmail: async () => {
    starts.push(clock);
    clock += 120; // the send itself takes time; the pacer must account for it
    return { messageId: `msg_${starts.length}`, error: null };
  },
  logEmail: async (_admin: unknown, row: { recipient_email: string; status: string }) => {
    logged.push({ to: row.recipient_email, status: row.status });
    return 'log-1';
  },
  buildSenderAddress: () => 'Co <co@ezcontractorbinder.com>',
}));

const { deliverScheduleNotify, SEND_INTERVAL_MS } = await import('@/lib/critical-path/notify');

const pacer = {
  now: () => clock,
  sleep: async (ms: number) => {
    clock += ms;
  },
};

function plan(emails: number, client: boolean) {
  return {
    companyId: 'co-1',
    projectId: 'p-1',
    projectName: 'Job',
    savedByMemberId: null,
    sender: 'Co <co@ezcontractorbinder.com>',
    brand: '#000000',
    origin: 'https://example.test',
    inApp: [],
    email: Array.from({ length: emails }, (_, i) => ({
      memberId: `m-${i}`,
      email: `sub${i}@example.test`,
      lines: ['Task moved'],
    })),
    client: client
      ? { email: 'client@example.test', previousFinish: '2026-11-02', newFinish: '2026-11-09' }
      : null,
    unreachable: [],
    clientUnreachable: false,
  };
}

const admin = {} as SupabaseClient<Database>;

beforeEach(() => {
  clock = 1_000_000;
  starts.length = 0;
  logged.length = 0;
});

describe('S124 Part 0 — schedule-change email pacing', () => {
  it('the interval is 600 ms (500 would allow three starts in one closed second)', () => {
    expect(SEND_INTERVAL_MS).toBe(600);
  });

  it('15 subs + the client: every start ≥ 600 ms after the last, and no one-second window holds more than 2', async () => {
    const out = await deliverScheduleNotify(admin, plan(15, true), { pacer });

    expect(starts.length).toBe(16);
    expect(logged.length).toBe(16);
    expect(logged.every((l) => l.status === 'sent')).toBe(true);
    expect(out).toEqual({ inApp: 0, emailed: 15, notSent: 0, clientEmailed: true });

    const gaps = starts.slice(1).map((t, i) => t - starts[i]);
    expect(gaps).toEqual(Array.from({ length: 15 }, () => 600));

    for (const t of starts) {
      const inWindow = starts.filter((s) => s >= t && s <= t + 1000).length;
      expect(inWindow).toBeLessThanOrEqual(2);
    }
    // Fifteen subs plus the client: 15 gaps × 600 ms = 9 s nobody waits on.
    expect(starts[15] - starts[0]).toBe(9000);
  });

  it('the first email is not delayed', async () => {
    const before = clock;
    await deliverScheduleNotify(admin, plan(1, false), { pacer });
    expect(starts).toEqual([before]);
  });
});
