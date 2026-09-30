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

// ⚠️ INVERTED IN PLACE [S121, RULED Josh ASK-26 — reverses S114 C-4]. There is
// no silent deletion any more, so the words must NOT threaten one.
// _Superseded:_ describe('S114 C-4 — the words lead with the deletion (EN; ES
// mirrors)') — it.each(heldNotice, deleteTodayOne, deleteTodayMany,
// deleteSoonOne, deleteSoonMany)('%s says DELETED'), and "the old reassurance
// ("They stay here if you close the app") is gone". The four delete* keys are
// removed; heldNotice now says nothing is deleted without asking.
describe('S121 ASK-26 — the words no longer threaten a deletion (EN; ES mirrors)', () => {
  it('heldNotice says nothing is deleted without asking — and does not say DELETED', () => {
    const notice = (en as Record<string, string>)['field.capture.heldNotice'];
    expect(notice).toMatch(/Nothing is deleted without asking you/);
    expect(notice).not.toMatch(/DELETED/);
  });

  it.each([
    'field.capture.deleteTodayOne',
    'field.capture.deleteTodayMany',
    'field.capture.deleteSoonOne',
    'field.capture.deleteSoonMany',
  ] as const)('%s — the countdown-to-deletion string — is gone', (key) => {
    expect((en as Record<string, string>)[key]).toBeUndefined();
  });

  it('the strip says the photos are WAITING, and the tray ASKS before deleting old ones', () => {
    expect((en as Record<string, string>)['field.capture.waitingStripMany']).toMatch(/waiting/);
    expect((en as Record<string, string>)['field.capture.oldAsk']).toMatch(/Delete them\?/);
  });
});

// ⚠️ INVERTED IN PLACE [S121]. _Superseded:_ "rendered under the offline strip,
// from soonestDeletion()" → expect(src).toContain('soonestDeletion(capture.batch.shots)').
describe('S114 C-4 / S121 — the strip is mounted in the /m shell and counts UNFILED shots', () => {
  const src = readFileSync(
    fileURLToPath(new URL('../app/m/mobile-shell.tsx', import.meta.url)),
    'utf8'
  );
  it('rendered under the offline strip, from unfiledShots() — not a deletion countdown', () => {
    expect(src).toContain('<HeldPhotosStrip pathname={pathname} />');
    expect(src).toContain('unfiledShots(capture.batch).length');
    expect(src).not.toContain('const warning = soonestDeletion(');
    expect(src).not.toMatch(/^import .*soonestDeletion/m);
    expect(src).toContain('data-testid="m-held-photos-strip"');
  });
});
