import { describe, it, expect } from 'vitest';
import {
  decideRetentionWarning,
  stampsFor,
  daysUntilDeletion,
} from './retention-warnings';

/**
 * The retention-warning decision, driven through every boundary [Q9: counting
 * BACK from delete_after]. Pure function, exact clock — the live suite proves
 * the loop against the DB; these prove the arithmetic can't be off by a day.
 */

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-09-01T14:30:00Z');

function row(
  reason: 'trial' | 'cancellation',
  daysLeft: number,
  stamps: { w1?: boolean; w2?: boolean } = {}
) {
  return {
    reason,
    delete_after: new Date(NOW.getTime() + daysLeft * DAY).toISOString(),
    retention_warned_1_at: stamps.w1 ? NOW.toISOString() : null,
    retention_warned_2_at: stamps.w2 ? NOW.toISOString() : null,
  };
}

describe('daysUntilDeletion rounds UP', () => {
  it('6.2 days left reads as 7', () => {
    const deleteAfter = new Date(NOW.getTime() + 6.2 * DAY).toISOString();
    expect(daysUntilDeletion(deleteAfter, NOW)).toBe(7);
  });
});

describe('cancellation (90-day window): 60 then 30', () => {
  it('61 days left — too early, nothing fires', () => {
    // 60 days + 1 minute rounds up to 61.
    const r = row('cancellation', 60);
    r.delete_after = new Date(NOW.getTime() + 60 * DAY + 60_000).toISOString();
    expect(decideRetentionWarning(r, NOW)).toBeNull();
  });

  it('exactly 60 days left fires warning 1', () => {
    expect(decideRetentionWarning(row('cancellation', 60), NOW)).toBe('cancellation_60');
  });

  it('⚠️ a MISSED cron day still fires — 58 days left, no stamp, warning 1 goes late', () => {
    expect(decideRetentionWarning(row('cancellation', 58), NOW)).toBe('cancellation_60');
  });

  it('stamped warning 1 blocks a resend until the 30-day boundary', () => {
    expect(decideRetentionWarning(row('cancellation', 58, { w1: true }), NOW)).toBeNull();
    expect(decideRetentionWarning(row('cancellation', 31, { w1: true }), NOW)).toBeNull();
  });

  it('30 days left fires warning 2', () => {
    expect(decideRetentionWarning(row('cancellation', 30, { w1: true }), NOW)).toBe(
      'cancellation_30'
    );
  });

  it('both stamps block everything', () => {
    expect(
      decideRetentionWarning(row('cancellation', 12, { w1: true, w2: true }), NOW)
    ).toBeNull();
  });

  it('⚠️ a row first seen INSIDE 30 days gets the urgent warning, and only that one', () => {
    // Never warned, 25 days left: the urgent warning fires…
    expect(decideRetentionWarning(row('cancellation', 25), NOW)).toBe('cancellation_30');
    // …and its stamp update subsumes warning 1, so tomorrow sends nothing
    // (the stale-warning trap runTrialWarnings had).
    const stamps = stampsFor('cancellation_30', { retention_warned_1_at: null }, NOW);
    expect(stamps.retention_warned_1_at).toBeTruthy();
    expect(stamps.retention_warned_2_at).toBeTruthy();
    expect(
      decideRetentionWarning(row('cancellation', 24, { w1: true, w2: true }), NOW)
    ).toBeNull();
  });

  it('stampsFor leaves an EXISTING warning-1 stamp alone when warning 2 fires', () => {
    const earlier = new Date(NOW.getTime() - 30 * DAY).toISOString();
    const stamps = stampsFor('cancellation_30', { retention_warned_1_at: earlier }, NOW);
    expect(stamps.retention_warned_1_at).toBeUndefined();
    expect(stamps.retention_warned_2_at).toBe(NOW.toISOString());
  });
});

describe('trial (14-day window): one warning at 4 days', () => {
  it('5 days left — nothing', () => {
    expect(decideRetentionWarning(row('trial', 5), NOW)).toBeNull();
  });

  it('4 days left fires', () => {
    expect(decideRetentionWarning(row('trial', 4), NOW)).toBe('trial_4');
  });

  it('stamped, it never fires again; the trial path never uses warning 2', () => {
    expect(decideRetentionWarning(row('trial', 2, { w1: true }), NOW)).toBeNull();
    expect(decideRetentionWarning(row('trial', 1, { w1: true, w2: false }), NOW)).toBeNull();
  });
});

describe('⚠️ never past due — the sweep owns those rows', () => {
  it('0 or negative days left warns nobody, on either path', () => {
    expect(decideRetentionWarning(row('cancellation', 0), NOW)).toBeNull();
    expect(decideRetentionWarning(row('trial', -3), NOW)).toBeNull();
  });
});
