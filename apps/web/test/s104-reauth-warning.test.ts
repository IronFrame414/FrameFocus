import { describe, it, expect } from 'vitest';
import { reauthThreshold } from '@/lib/quickbooks/reauth-notify';

/**
 * ⚠️ F8 — `qb_reauth_required_after` was written, displayed, and acted on by
 * NOTHING. The audit put it plainly: *"In 2031 a connection dies on a date the
 * UI has been quietly showing for five years."*
 *
 * ⚠️ WHY THE DEADLINE NEEDS ITS OWN WARNING, given F7's keep-alive already runs.
 * They are different failures. The keep-alive answers Intuit's 100-day
 * INACTIVITY expiry; this answers the five-year CAP, which is anchored to the
 * connect date and is **not reset by rotation**. So it arrives on a fixed
 * calendar day for a connection that has been refreshing perfectly the whole
 * time — nothing else in the system will look unwell first.
 */
const AT = (iso: string) => new Date(iso);
const NOW = AT('2026-09-07T12:00:00.000Z');
const inDays = (n: number) => new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000).toISOString();

describe('S104-H — reauthThreshold()', () => {
  it('says nothing when there is no deadline recorded', () => {
    // ⚠️ NO DEADLINE IS NOT AN IMMINENT DEADLINE. A connection made before the
    // ceiling was written has null here; treating null as urgent would warn
    // every company on every drain.
    expect(reauthThreshold(null, NOW)).toBeNull();
  });

  it('says nothing five years out — the normal state of a healthy connection', () => {
    // The live sandbox reads 2031-09-05. This must be silent for years.
    expect(reauthThreshold('2031-09-05T23:46:47.971Z', NOW)).toBeNull();
  });

  it('says nothing at 31 days and warns at 30', () => {
    // The boundary is where an off-by-one lives, so both sides are pinned.
    expect(reauthThreshold(inDays(31), NOW)).toBeNull();
    expect(reauthThreshold(inDays(30), NOW)?.threshold).toBe(30);
  });

  it('escalates through 30 -> 7 -> 1 rather than re-firing the widest', () => {
    // ⚠️ WARN_AT_DAYS IS DESCENDING AND THE ORDER IS LOAD-BEARING: `find` takes
    // the FIRST threshold the deadline is inside, so a connection 3 days out
    // must report 7, never 30.
    expect(reauthThreshold(inDays(20), NOW)?.threshold).toBe(30);
    expect(reauthThreshold(inDays(7), NOW)?.threshold).toBe(7);
    expect(reauthThreshold(inDays(3), NOW)?.threshold).toBe(7);
    expect(reauthThreshold(inDays(1), NOW)?.threshold).toBe(1);
  });

  it('a few hours out still reads as one day, not zero', () => {
    // `Math.ceil` — a deadline this evening is "tomorrow", not "in 0 days".
    const soon = new Date(NOW.getTime() + 5 * 60 * 60 * 1000).toISOString();
    expect(reauthThreshold(soon, NOW)).toEqual({ daysLeft: 1, threshold: 1 });
  });

  it('is SILENT once the deadline has passed', () => {
    // ⚠️ DELIBERATE. The token is already dead and Intuit answers
    // `invalid_grant`; the existing needs_reauth path says what actually
    // happened. "Your deadline was 4 days ago" is noise on top of a real failure.
    expect(reauthThreshold(inDays(-1), NOW)).toBeNull();
    expect(reauthThreshold(inDays(-400), NOW)).toBeNull();
    expect(reauthThreshold(NOW.toISOString(), NOW)).toBeNull();
  });

  it('an unparseable date is silent, not a crash', () => {
    // A drain must not die on one bad row — it has other tenants.
    expect(reauthThreshold('not-a-date', NOW)).toBeNull();
  });
});
