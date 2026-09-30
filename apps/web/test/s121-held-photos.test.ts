import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  emptyBatch,
  needsProject,
  oldShots,
  settleInterrupted,
  splitLanded,
  unfiledShots,
  type CaptureBatch,
} from '@/lib/offline/capture-batch';
import type { HeldShot } from '@/lib/offline/held-shots';

// S121 Part 2 — Josh's "30 photos that won't land". The diagnosis (S121 report
// §1.3): a queued photo kept its tray row after the queue uploaded it, was
// counted as "no project" for ever, and "Save" skipped it. These pin the fix.

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 8, 30, 12);
const shot = (id: string, over: Partial<HeldShot> = {}): HeldShot => ({
  id,
  blob: new Blob([]),
  fileName: `${id}.jpg`,
  takenAt: new Date(NOW - DAY).toISOString(),
  status: 'held',
  ...over,
});
const batch = (shots: HeldShot[], projectId: string | null = null): CaptureBatch => ({
  ...emptyBatch(projectId),
  shots,
});

describe('a QUEUED shot is not "a photo with no project"', () => {
  it('a tray of only queued shots does not ask for a project (the ghost case)', () => {
    const b = batch([shot('a', { status: 'queued' }), shot('b', { status: 'queued' })]);
    expect(unfiledShots(b)).toHaveLength(0);
    expect(needsProject(b)).toBe(false);
  });

  it('a held shot with no project still asks — the picker is not lost', () => {
    const b = batch([shot('a', { status: 'queued' }), shot('b')]);
    expect(unfiledShots(b).map((s) => s.id)).toEqual(['b']);
    expect(needsProject(b)).toBe(true);
  });

  it('a failed shot that remembers its project is not unfiled (it has a Retry)', () => {
    const b = batch([shot('a', { status: 'failed', projectId: 'p1' })]);
    expect(unfiledShots(b)).toHaveLength(0);
  });
});

describe('splitLanded — the server check clears ghosts and ONLY ghosts', () => {
  it('shots whose id is a files row leave; the rest stay; nothing is both', () => {
    const shots = [shot('a', { status: 'queued' }), shot('b', { status: 'failed' }), shot('c')];
    const { landed, kept } = splitLanded(shots, new Set(['a', 'c']));
    expect(landed.map((s) => s.id)).toEqual(['a', 'c']);
    expect(kept.map((s) => s.id)).toEqual(['b']);
  });

  it('an empty answer clears nothing', () => {
    const shots = [shot('a', { status: 'queued' })];
    expect(splitLanded(shots, new Set()).kept).toHaveLength(1);
  });
});

describe('settleInterrupted — no spinner that never ends', () => {
  it('uploading → failed with the message; every other status untouched', () => {
    const out = settleInterrupted(
      [shot('a', { status: 'uploading' }), shot('b', { status: 'queued' }), shot('c')],
      'interrupted'
    );
    expect(out.map((s) => [s.status, s.error ?? null])).toEqual([
      ['failed', 'interrupted'],
      ['queued', null],
      ['held', null],
    ]);
  });
});

describe('S121 ASK-26 — old shots are OFFERED, never taken', () => {
  it('oldShots finds shots 7+ days old; younger ones are not offered', () => {
    const shots = [
      shot('young', { takenAt: new Date(NOW - 6 * DAY).toISOString() }),
      shot('seven', { takenAt: new Date(NOW - 7 * DAY).toISOString() }),
      shot('ten', { takenAt: new Date(NOW - 10 * DAY).toISOString() }),
    ];
    expect(oldShots(shots, NOW).map((s) => s.id)).toEqual(['seven', 'ten']);
  });

  it('HeldShotStore.all() no longer deletes anything — no remove() inside it', () => {
    const src = readFileSync(
      fileURLToPath(new URL('../lib/offline/held-shots.ts', import.meta.url)),
      'utf8'
    );
    const body = src.slice(src.indexOf('async all()'), src.indexOf('async put('));
    expect(body.length).toBeGreaterThan(0);
    expect(body).not.toMatch(/remove\(|expiredShots|delete\(/);
  });

  it('the only discardMany caller is the old-photos Delete button (a user yes)', () => {
    const screen = readFileSync(
      fileURLToPath(new URL('../app/m/capture/capture-screen.tsx', import.meta.url)),
      'utf8'
    );
    const store = readFileSync(
      fileURLToPath(new URL('../app/m/capture-store.tsx', import.meta.url)),
      'utf8'
    );
    const calls = (screen.match(/discardMany\(/g) ?? []).length;
    expect(calls).toBe(1);
    expect(screen).toMatch(/data-testid="m-capture-old-delete"\s*\n\s*onClick=\{\(\) => void capture\.discardMany/);
    // The store never calls it on its own.
    expect((store.match(/discardMany\(/g) ?? []).length).toBe(0);
  });
});

describe('the server check fails SAFE', () => {
  const store = readFileSync(
    fileURLToPath(new URL('../app/m/capture-store.tsx', import.meta.url)),
    'utf8'
  );
  it('a failed lookup (null) clears nothing', () => {
    expect(store).toContain('if (!found || found.size === 0) return new Set();');
  });
});
