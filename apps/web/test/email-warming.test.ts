import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  SLOTS_PER_HOUR,
  SLOT_HOURS_UTC,
  SLOT_WEEKDAYS,
  WARMING_RECIPIENTS,
  WEEKLY_QUOTA_PER_COMPANY,
  composeWarmingMessage,
  isoWeek,
  recipientFor,
  shouldSendNow,
  slotsRemainingInWeek,
  weekStart,
} from '@/lib/services/warming-email';

// The warming sender [Josh, 2026-09-10]. Everything asserted here is PURE —
// pacing, rotation, copy and the schedule agreement. No database, no clock, no
// transport, so it runs in CI rather than only when someone runs a live suite
// by hand.

const MONDAY_13_00 = new Date('2026-09-14T13:00:00Z'); // ISO week 38, first slot
const FRIDAY_22_45 = new Date('2026-09-18T22:45:00Z'); // the LAST slot of that week

describe('the firing schedule agrees with vercel.json', () => {
  // ⚠️ THE SCHEDULE IS STATED TWICE — in vercel.json, which deploys it, and in
  // warming-email.ts, which computes the denominator from it. A second copy is
  // the divergence the PARITY rule warns about, and vercel.json cannot be
  // imported as a module. So it is asserted instead: if either moves, this
  // fails and names which.
  const vercel = JSON.parse(
    readFileSync(fileURLToPath(new URL('../vercel.json', import.meta.url)), 'utf8')
  ) as { crons: Array<{ path: string; schedule: string }> };

  it('the cron is scheduled at all', () => {
    const entry = vercel.crons.find((c) => c.path === '/api/cron/email-warming');
    expect(entry, 'the warming cron is not in vercel.json — the sender is dead code').toBeDefined();
  });

  it('⚠️ the constants in warming-email.ts DESCRIBE that schedule', () => {
    const entry = vercel.crons.find((c) => c.path === '/api/cron/email-warming')!;
    const [minute, hour, dom, month, dow] = entry.schedule.split(' ');

    expect(minute, 'minute field no longer implies SLOTS_PER_HOUR').toBe(
      `*/${60 / SLOTS_PER_HOUR}`
    );
    expect(hour, 'hour field no longer matches SLOT_HOURS_UTC').toBe(
      `${SLOT_HOURS_UTC.first}-${SLOT_HOURS_UTC.last}`
    );
    expect(dom).toBe('*');
    expect(month).toBe('*');
    expect(dow, 'day-of-week no longer matches SLOT_WEEKDAYS').toBe(
      `${SLOT_WEEKDAYS[0]}-${SLOT_WEEKDAYS[SLOT_WEEKDAYS.length - 1]}`
    );
  });

  it('the other thirteen crons are still scheduled — the guard cuts both ways', () => {
    // Adding a fourteenth entry is the one edit most likely to damage this file,
    // and S103 records a malformed vercel.json failing a deploy with eleven
    // migrations already on production.
    expect(vercel.crons).toHaveLength(14);
    for (const c of vercel.crons) {
      expect(typeof c.path, `${JSON.stringify(c)} has no path`).toBe('string');
      expect(c.schedule.split(' '), `${c.path} has a malformed schedule`).toHaveLength(5);
    }
  });
});

describe('slot counting', () => {
  it('a full week is every weekday slot', () => {
    // 5 days × 10 hours × 4 = 200.
    expect(slotsRemainingInWeek(MONDAY_13_00)).toBe(
      SLOT_WEEKDAYS.length *
        (SLOT_HOURS_UTC.last - SLOT_HOURS_UTC.first + 1) *
        SLOTS_PER_HOUR
    );
  });

  it('the last slot of the week counts itself and nothing else', () => {
    expect(slotsRemainingInWeek(FRIDAY_22_45)).toBe(1);
  });

  it('counts down as the week runs', () => {
    const wed = new Date('2026-09-16T17:30:00Z');
    expect(slotsRemainingInWeek(wed)).toBeLessThan(slotsRemainingInWeek(MONDAY_13_00));
    expect(slotsRemainingInWeek(wed)).toBeGreaterThan(slotsRemainingInWeek(FRIDAY_22_45));
  });

  it('a weekend instant has no slots left', () => {
    expect(slotsRemainingInWeek(new Date('2026-09-19T14:00:00Z'))).toBe(0); // Saturday
  });
});

describe('shouldSendNow — the pacing decision', () => {
  it('refuses once the quota is met, whatever the roll', () => {
    expect(shouldSendNow(WEEKLY_QUOTA_PER_COMPANY, 100, 0)).toBe(false);
    expect(shouldSendNow(WEEKLY_QUOTA_PER_COMPANY + 3, 100, 0)).toBe(false);
  });

  it('⚠️ FIRES UNCONDITIONALLY when slots left equals sends left', () => {
    // Without this the quota is missed roughly half the time and the "steady
    // rate" Postmaster asks for drifts down week over week.
    expect(shouldSendNow(0, WEEKLY_QUOTA_PER_COMPANY, 0.999999)).toBe(true);
    expect(shouldSendNow(11, 1, 0.999999)).toBe(true);
  });

  it('is probabilistic in the middle of the week', () => {
    // 12 remaining across 200 slots → 6%.
    expect(shouldSendNow(0, 200, 0.05)).toBe(true);
    expect(shouldSendNow(0, 200, 0.07)).toBe(false);
  });

  it('⚠️ over a whole week it lands ON the quota, not near it', () => {
    // The property that matters: walk every slot of a week with a seeded PRNG
    // and count. Anything other than exactly 12 means the pacing drifts.
    let seed = 12345;
    const rng = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    let sent = 0;
    const total = 200;
    for (let slot = 0; slot < total; slot++) {
      if (shouldSendNow(sent, total - slot, rng())) sent += 1;
    }
    expect(sent).toBe(WEEKLY_QUOTA_PER_COMPANY);
  });

  it('⚠️ AND THE SPACING IS IRREGULAR — not one send every N slots', () => {
    let seed = 999;
    const rng = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const at: number[] = [];
    let sent = 0;
    for (let slot = 0; slot < 200; slot++) {
      if (shouldSendNow(sent, 200 - slot, rng())) {
        sent += 1;
        at.push(slot);
      }
    }
    const gaps = at.slice(1).map((s, i) => s - at[i]);
    expect(new Set(gaps).size, 'every gap is identical — this is clockwork').toBeGreaterThan(3);
  });
});

describe('recipient rotation', () => {
  it('covers all four inboxes across a company-week', () => {
    const seen = new Set<string>();
    for (let i = 0; i < WEEKLY_QUOTA_PER_COMPANY; i++) seen.add(recipientFor(i, 38, 0));
    expect(seen.size).toBe(WARMING_RECIPIENTS.length);
  });

  it('⚠️ the two companies do not hit the same inbox in lockstep', () => {
    const collisions = Array.from({ length: WEEKLY_QUOTA_PER_COMPANY }, (_, i) =>
      recipientFor(i, 38, 0) === recipientFor(i, 38, 1)
    ).filter(Boolean);
    expect(collisions).toHaveLength(0);
  });

  it('the starting inbox moves week to week', () => {
    expect(recipientFor(0, 38, 0)).not.toBe(recipientFor(0, 39, 0));
  });
});

describe('the copy', () => {
  const COMPANY = 'Worth Properties';

  it('⚠️ NEVER contains a link — the constraint the whole design turns on', () => {
    for (let i = 0; i < 12; i++) {
      const { body, subject } = composeWarmingMessage(COMPANY, i, MONDAY_13_00);
      expect(body, `variant ${i} carries a URL`).not.toMatch(/https?:\/\//);
      expect(subject).not.toMatch(/https?:\/\//);
    }
  });

  it('⚠️ says what it is, in every variant', () => {
    for (let i = 0; i < 6; i++) {
      const { body } = composeWarmingMessage(COMPANY, i, MONDAY_13_00);
      expect(body.toLowerCase(), `variant ${i} does not say it is a test`).toMatch(
        /delivery test|mail test/
      );
    }
  });

  it('names the sending company and never the platform', () => {
    for (let i = 0; i < 6; i++) {
      const { body } = composeWarmingMessage(COMPANY, i, MONDAY_13_00);
      expect(body).toContain(COMPANY);
      expect(body).not.toContain('FrameFocus');
      expect(body).not.toContain('EZ Contractor Binder');
    }
  });

  it('⚠️ subjects vary in STRUCTURE, never by a number or an id', () => {
    // email-deliverability-diagnosis.md §1c named near-duplicate subjects
    // distinguishable only by a machine string as THE content problem on this
    // domain. `Delivery check #4` would reproduce it exactly.
    const subjects = Array.from({ length: 6 }, (_, i) =>
      composeWarmingMessage(COMPANY, i, MONDAY_13_00).subject
    );
    expect(new Set(subjects).size, 'six variants are not six subjects').toBe(6);
    for (const s of subjects) expect(s, `"${s}" carries a number`).not.toMatch(/\d/);
  });

  it('the greeting matches the hour', () => {
    // Variant index 2 is body C, the one with the time-of-day greeting.
    expect(composeWarmingMessage(COMPANY, 2, new Date('2026-09-14T13:30:00Z')).body).toMatch(
      /^Morning Josh,/
    );
    expect(composeWarmingMessage(COMPANY, 2, new Date('2026-09-14T20:30:00Z')).body).toMatch(
      /^Afternoon Josh,/
    );
  });

  it('the index wraps rather than throwing', () => {
    expect(composeWarmingMessage(COMPANY, 13, MONDAY_13_00).subject).toBe(
      composeWarmingMessage(COMPANY, 1, MONDAY_13_00).subject
    );
  });
});

describe('ISO week helpers', () => {
  it('weekStart is the Monday 00:00 UTC that opens the week', () => {
    expect(weekStart(new Date('2026-09-17T19:45:00Z')).toISOString()).toBe(
      '2026-09-14T00:00:00.000Z'
    );
  });

  it('a Sunday belongs to the week that STARTED, not the one beginning', () => {
    // The classic off-by-one: JS getUTCDay() calls Sunday 0.
    expect(weekStart(new Date('2026-09-20T10:00:00Z')).toISOString()).toBe(
      '2026-09-14T00:00:00.000Z'
    );
  });

  it('isoWeek is stable across a week and advances between them', () => {
    const a = isoWeek(new Date('2026-09-14T13:00:00Z'));
    const b = isoWeek(new Date('2026-09-18T22:00:00Z'));
    const c = isoWeek(new Date('2026-09-21T13:00:00Z'));
    expect(a).toEqual(b);
    expect(c.week).toBe(a.week + 1);
  });
});
