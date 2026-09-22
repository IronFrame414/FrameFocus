import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  SLOTS_PER_HOUR,
  SLOT_HOURS_UTC,
  SLOT_WEEKDAYS,
  WARMING_RECIPIENTS,
  WEEKLY_QUOTA_PER_COMPANY,
  DEFAULT_WEEKLY_QUOTA,
  QUOTA_BOUNDS,
  quotaFor,
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

  it('⚠️ the SCHEMA-DRIFT cron is scheduled, at its ruled path AND its ruled time', () => {
    // S108 C2 — the fifteenth entry. Pinned the same way the warming entry is,
    // because it is exactly as invisible when it stops: nothing in the product
    // shows a drift check that never fires.
    const entry = vercel.crons.find((c) => c.path === '/api/cron/schema-drift');
    expect(
      entry,
      'the schema-drift cron is not in vercel.json — the detector is dead code'
    ).toBeDefined();
    // RULED [Josh, S108 ASK-C2 -> A]: daily, 11:00 UTC (07:00 EDT) — before the
    // working day and deliberately off the 13:00/14:00 cluster the other crons
    // occupy, so it is not queued behind them.
    expect(entry!.schedule, 'the schema-drift schedule moved off its ruled daily slot').toBe(
      '0 11 * * *'
    );
  });

  it('the other fourteen crons are still scheduled — the guard cuts both ways', () => {
    // Adding an entry is the one edit most likely to damage this file, and S103
    // records a malformed vercel.json failing a deploy with eleven migrations
    // already on production.
    //
    // ⚠️ THE LENGTH ASSERTION IS THE POINT, not pedantry. It is what turns
    // "somebody deleted a cron while adding one" from an invisible production
    // change into a red test. Bumped 14 -> 15 by S108 C2.
    expect(vercel.crons).toHaveLength(15);
    for (const c of vercel.crons) {
      expect(typeof c.path, `${JSON.stringify(c)} has no path`).toBe('string');
      expect(c.schedule.split(' '), `${c.path} has a malformed schedule`).toHaveLength(5);
    }
    // And no duplicates — two entries for one path is a valid JSON file that
    // double-fires a job, which no other assertion here would notice.
    const paths = vercel.crons.map((c) => c.path);
    expect(new Set(paths).size, 'vercel.json has a duplicate cron path').toBe(paths.length);
  });
});

describe('slot counting', () => {
  it('a full week is every weekday slot', () => {
    // 5 days × 10 hours × 4 = 200.
    expect(slotsRemainingInWeek(MONDAY_13_00)).toBe(
      SLOT_WEEKDAYS.length * (SLOT_HOURS_UTC.last - SLOT_HOURS_UTC.first + 1) * SLOTS_PER_HOUR
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
    const collisions = Array.from(
      { length: WEEKLY_QUOTA_PER_COMPANY },
      (_, i) => recipientFor(i, 38, 0) === recipientFor(i, 38, 1)
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
    const subjects = Array.from(
      { length: 6 },
      (_, i) => composeWarmingMessage(COMPANY, i, MONDAY_13_00).subject
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

// ===========================================================================
// PER-COMPANY QUOTA [RULED Josh, 2026-09-22]
// ===========================================================================
// The quota moved out of this module and into
// `companies.email_warming_weekly_quota` (migration 20261670000000). These
// assert the two halves still agree, and that the pacing honours the column.
// ===========================================================================

describe('the quota agrees with the migration', () => {
  // ⚠️ SAME SHAPE AS THE vercel.json BLOCK ABOVE, for the same reason: the
  // default and the bounds are stated twice — in SQL, which enforces them, and
  // here, where the fallback lives. SQL cannot be imported, so the file is read
  // and the values pinned. If either moves, this fails instead of drifting.
  const MIGRATION = readFileSync(
    fileURLToPath(
      new URL(
        '../../../supabase/migrations/20261670000000_email_warming_quota.sql',
        import.meta.url
      )
    ),
    'utf8'
  );

  it('DEFAULT_WEEKLY_QUOTA mirrors the column DEFAULT', () => {
    const m = MIGRATION.match(/email_warming_weekly_quota INTEGER NOT NULL DEFAULT (\d+)/);
    expect(m, 'the column definition moved — this mirror is now unanchored').not.toBeNull();
    expect(Number(m![1])).toBe(DEFAULT_WEEKLY_QUOTA);
  });

  it('QUOTA_BOUNDS mirrors the CHECK constraint', () => {
    const m = MIGRATION.match(
      /CHECK \(email_warming_weekly_quota >= (\d+) AND email_warming_weekly_quota <= (\d+)\)/
    );
    expect(m, 'the CHECK moved — the clamp in quotaFor() is now unanchored').not.toBeNull();
    expect({ min: Number(m![1]), max: Number(m![2]) }).toEqual({ ...QUOTA_BOUNDS });
  });

  it('⚠️ the ceiling stays well under a full week of slots', () => {
    // 200 slots a week. A quota at or near that makes shouldSendNow's
    // end-of-week guarantee fire every slot — clockwork, the one shape this
    // design exists to avoid.
    const slots =
      SLOT_WEEKDAYS.length * (SLOT_HOURS_UTC.last - SLOT_HOURS_UTC.first + 1) * SLOTS_PER_HOUR;
    expect(slots).toBe(200);
    expect(QUOTA_BOUNDS.max).toBeLessThan(slots / 2);
  });

  it('⚠️ no company slug is hardcoded in the sender', () => {
    // #119's collision rule can rename a tenant; a slug-keyed quota map would
    // fall back to the default silently at that moment. The column travels
    // with the row, so the source must name no tenant.
    const source = readFileSync(
      fileURLToPath(new URL('../lib/services/warming-email.ts', import.meta.url)),
      'utf8'
    );
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/worth-properties|h-h-signature/i);
  });
});

describe('quotaFor — the column, defended at the read', () => {
  it('takes the column value', () => {
    expect(quotaFor({ email_warming_weekly_quota: 20 })).toBe(20);
    expect(quotaFor({ email_warming_weekly_quota: 10 })).toBe(10);
  });

  it('clamps to the CHECK bounds rather than honouring a hand-set value', () => {
    expect(quotaFor({ email_warming_weekly_quota: 5000 })).toBe(QUOTA_BOUNDS.max);
    expect(quotaFor({ email_warming_weekly_quota: -3 })).toBe(QUOTA_BOUNDS.min);
  });

  it('⚠️ falls back to the default on a missing or non-numeric column', () => {
    // NaN is the dangerous one: every comparison against it is false, so
    // shouldSendNow would return false forever and the sender would stop with
    // no error anywhere.
    const bad = { email_warming_weekly_quota: undefined } as unknown as {
      email_warming_weekly_quota: number;
    };
    expect(quotaFor(bad)).toBe(DEFAULT_WEEKLY_QUOTA);
    expect(quotaFor({ email_warming_weekly_quota: Number.NaN })).toBe(DEFAULT_WEEKLY_QUOTA);
  });

  it('zero is honoured — a pause that is not the off switch', () => {
    expect(quotaFor({ email_warming_weekly_quota: 0 })).toBe(0);
    expect(shouldSendNow(0, 200, 0, 0)).toBe(false);
  });
});

describe('pacing honours a per-company quota', () => {
  const walkWeek = (quota: number, seed0: number) => {
    let seed = seed0;
    const rng = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const at: number[] = [];
    let sent = 0;
    for (let slot = 0; slot < 200; slot++) {
      if (shouldSendNow(sent, 200 - slot, rng(), quota)) {
        sent += 1;
        at.push(slot);
      }
    }
    return at;
  };

  it('⚠️ lands ON 20 and ON 10, not near them', () => {
    expect(walkWeek(20, 12345)).toHaveLength(20);
    expect(walkWeek(10, 12345)).toHaveLength(10);
  });

  it('the two tenants get different quotas from the same week of slots', () => {
    expect(walkWeek(20, 777).length).not.toBe(walkWeek(10, 777).length);
  });

  it('⚠️ spacing stays irregular at 20 — the point of the design', () => {
    const at = walkWeek(20, 999);
    const gaps = at.slice(1).map((s, i) => s - at[i]);
    expect(new Set(gaps).size, 'every gap is identical — this is clockwork').toBeGreaterThan(3);
  });

  it('refuses once the per-company quota is met', () => {
    expect(shouldSendNow(20, 100, 0, 20)).toBe(false);
    expect(shouldSendNow(10, 100, 0, 10)).toBe(false);
    // ...and 10 does NOT stop a company whose quota is 20.
    expect(shouldSendNow(10, 10, 0.99, 20)).toBe(true);
  });
});
