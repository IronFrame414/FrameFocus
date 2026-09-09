import { describe, it, expect } from 'vitest';
import {
  HELD_CAPACITY,
  HELD_TTL_MS,
  canAdmit,
  daysUntilExpiry,
  expiredShots,
  liveShots,
  type HeldShot,
} from '@/lib/offline/held-shots';

// S107 Part A — THE CLEANUP RULE, as ruled. Josh made stating it a condition of
// approving persistence ("an orphan store with no eviction becomes its own
// problem"), so it is tested as a rule rather than left to the adapter.

const NOW = Date.parse('2026-09-09T12:00:00.000Z');
const shotAt = (iso: string): HeldShot => ({
  id: iso,
  blob: new Blob([new Uint8Array(1)]),
  fileName: 'a.jpg',
  takenAt: iso,
  status: 'held',
});
const ageDays = (d: number) => shotAt(new Date(NOW - d * 24 * 60 * 60 * 1000).toISOString());

describe('TTL — 7 days, and the boundary is not guessed', () => {
  it('a 6-day-old shot lives; an 8-day-old shot is expired', () => {
    const shots = [ageDays(6), ageDays(8)];
    expect(liveShots(shots, NOW).map((s) => s.id)).toEqual([shots[0].id]);
    expect(expiredShots(shots, NOW).map((s) => s.id)).toEqual([shots[1].id]);
  });

  it('exactly 7 days is EXPIRED (>= the TTL, not >)', () => {
    const exact = shotAt(new Date(NOW - HELD_TTL_MS).toISOString());
    expect(expiredShots([exact], NOW)).toHaveLength(1);
    expect(liveShots([exact], NOW)).toHaveLength(0);
  });

  it('a shot one millisecond short of 7 days still lives', () => {
    const nearly = shotAt(new Date(NOW - HELD_TTL_MS + 1).toISOString());
    expect(liveShots([nearly], NOW)).toHaveLength(1);
  });

  it('live and expired PARTITION the input — no shot is both or neither', () => {
    const shots = [ageDays(0), ageDays(3), ageDays(7), ageDays(30)];
    expect(liveShots(shots, NOW).length + expiredShots(shots, NOW).length).toBe(shots.length);
  });
});

describe('the age warning must be able to precede the sweep', () => {
  it('counts whole days remaining, so a warning can show before anything is taken', () => {
    expect(daysUntilExpiry(ageDays(0), NOW)).toBe(7);
    expect(daysUntilExpiry(ageDays(6), NOW)).toBe(1);
    // ⚠️ Still non-negative on the last day — the user gets a final chance on
    // screen before the sweep is entitled to remove it.
    expect(daysUntilExpiry(ageDays(6.5), NOW)).toBeGreaterThanOrEqual(0);
    expect(daysUntilExpiry(ageDays(8), NOW)).toBeLessThan(0);
  });
});

describe('⚠️ capacity REFUSES; it never evicts', () => {
  it('admits below capacity', () => {
    expect(canAdmit(0).admitted).toBe(true);
    expect(canAdmit(HELD_CAPACITY - 1).admitted).toBe(true);
  });

  it('refuses AT capacity, with a message that tells the user what to do', () => {
    const r = canAdmit(HELD_CAPACITY);
    expect(r.admitted).toBe(false);
    if (!r.admitted) {
      expect(r.reason).toContain(String(HELD_CAPACITY));
      expect(r.reason).toMatch(/file or discard/i);
    }
  });

  it('refuses above capacity too — no wrap-around, no silent make-room', () => {
    expect(canAdmit(HELD_CAPACITY + 5).admitted).toBe(false);
  });

  // The regression this file exists to prevent: someone "fixing" a full tray by
  // dropping the oldest shot. That is a silent photo loss, which is the exact
  // failure the whole part exists to prevent.
  it('the capacity decision returns a REFUSAL, never a shot to remove', () => {
    const r = canAdmit(HELD_CAPACITY) as Record<string, unknown>;
    expect(Object.keys(r).sort()).toEqual(['admitted', 'reason']);
    expect(r).not.toHaveProperty('evict');
  });

  it('capacity is 25 and the TTL is 7 days — the ruled numbers, pinned', () => {
    expect(HELD_CAPACITY).toBe(25);
    expect(HELD_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
