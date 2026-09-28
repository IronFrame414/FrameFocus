import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { HELD_TTL_MS, soonestDeletion, type HeldShot } from '@/lib/offline/held-shots';
import { en } from '@/lib/i18n/areas/field';

// S114 C-4 [RULED Josh 2026-09-28] — photos with no project are DELETED from
// the phone 7 days after they are taken, and that is the HEADLINE on every
// /m screen (HeldPhotosStrip), not a per-shot footnote on the capture tray.

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 8, 28, 12);
const shot = (ageDays: number, id = `s${ageDays}`): HeldShot => ({
  id,
  blob: new Blob([]),
  fileName: `${id}.jpg`,
  takenAt: new Date(NOW - ageDays * DAY).toISOString(),
  status: 'held',
});

describe('S114 C-4 — soonestDeletion', () => {
  it('nothing held → no warning', () => {
    expect(soonestDeletion([], NOW)).toBeNull();
  });

  it('counts every unfiled shot and counts down to the SOONEST deletion', () => {
    // the 5-day-old shot goes first: 7 − 5 = 2 whole days left.
    expect(soonestDeletion([shot(1), shot(5), shot(2)], NOW)).toEqual({ count: 3, days: 2 });
  });

  it('a shot on its last day says 0 (today), never a negative number', () => {
    expect(soonestDeletion([shot(6.5)], NOW)).toEqual({ count: 1, days: 0 });
    expect(soonestDeletion([shot(7 + 1 / 24)], NOW)!.days).toBe(0);
  });

  it('the TTL it counts against is 7 days', () => {
    expect(HELD_TTL_MS).toBe(7 * DAY);
  });
});

describe('S114 C-4 — the words lead with the deletion (EN; ES mirrors)', () => {
  it.each([
    'field.capture.heldNotice',
    'field.capture.deleteTodayOne',
    'field.capture.deleteTodayMany',
    'field.capture.deleteSoonOne',
    'field.capture.deleteSoonMany',
  ] as const)('%s says DELETED', (key) => {
    expect((en as Record<string, string>)[key]).toMatch(/DELETED/);
  });

  it('the old reassurance ("They stay here if you close the app") is gone', () => {
    expect((en as Record<string, string>)['field.capture.heldNotice']).not.toMatch(/stay here/);
  });
});

describe('S114 C-4 — the strip is mounted in the /m shell and uses the shared rule', () => {
  const src = readFileSync(
    fileURLToPath(new URL('../app/m/mobile-shell.tsx', import.meta.url)),
    'utf8'
  );
  it('rendered under the offline strip, from soonestDeletion()', () => {
    expect(src).toContain('<HeldPhotosStrip pathname={pathname} />');
    expect(src).toContain('soonestDeletion(capture.batch.shots)');
    expect(src).toContain('data-testid="m-held-photos-strip"');
  });
});
