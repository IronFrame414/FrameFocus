import { describe, it, expect } from 'vitest';
import {
  addShot,
  batchProgress,
  emptyBatch,
  needsProject,
  removeShot,
  resolveBatchProject,
  retryableShots,
  setShotStatus,
  shotLanded,
  type CaptureBatch,
} from '@/lib/offline/capture-batch';
import { HELD_CAPACITY, type HeldShot } from '@/lib/offline/held-shots';

// S107 Part A — the batch rules. Part A ships to production UNVERIFIED by
// ruling, so these pure assertions are the only machine check that exists for
// it. They cover the RULES; they cannot cover the camera.

const shot = (id: string, status: HeldShot['status'] = 'held'): HeldShot => ({
  id,
  blob: new Blob([new Uint8Array(1)]),
  fileName: `${id}.jpg`,
  takenAt: '2026-09-09T12:00:00.000Z',
  status,
});

const withShots = (n: number): CaptureBatch => {
  let b = emptyBatch('proj-1');
  for (let i = 0; i < n; i++) {
    const r = addShot(b, shot(`s${i}`));
    if (r.ok) b = r.batch;
  }
  return b;
};

describe('⚠️ ONE PROJECT PER BATCH — the ruling, where it cannot be forgotten', () => {
  it('resolves once and PINS: a later resolution cannot move it', () => {
    const b = resolveBatchProject(emptyBatch(), 'job-A');
    expect(b.projectId).toBe('job-A');
    // The user clocks into a different job mid-run. The batch does not follow.
    expect(resolveBatchProject(b, 'job-B').projectId).toBe('job-A');
  });

  it('a null candidate does not clear a project already pinned', () => {
    const b = resolveBatchProject(emptyBatch(), 'job-A');
    expect(resolveBatchProject(b, null).projectId).toBe('job-A');
  });

  it('an unresolved batch with shots needs the picker; an empty one does not', () => {
    expect(needsProject(emptyBatch())).toBe(false);
    const r = addShot(emptyBatch(), shot('a'));
    expect(r.ok && needsProject(r.batch)).toBe(true);
  });
});

describe('⚠️ capacity refuses and leaves the batch UNTOUCHED', () => {
  it(`admits up to ${HELD_CAPACITY}`, () => {
    expect(withShots(HELD_CAPACITY).shots).toHaveLength(HELD_CAPACITY);
  });

  it('refuses the next one, and the refused batch is byte-identical to the old one', () => {
    const full = withShots(HELD_CAPACITY);
    const r = addShot(full, shot('overflow'));
    expect(r.ok).toBe(false);
    expect(r.batch.shots).toHaveLength(HELD_CAPACITY);
    // ⚠️ Nothing was dropped to make room.
    expect(r.batch.shots.map((s) => s.id)).toEqual(full.shots.map((s) => s.id));
    if (!r.ok) expect(r.reason).toMatch(/tray full/i);
  });
});

describe('⚠️ PER-PHOTO STATUS — photo 4 fails, 1-3 and 5-7 carry on', () => {
  it('one failure does not touch the others', () => {
    let b = withShots(7);
    b = setShotStatus(b, 's3', 'failed', 'Upload failed');
    expect(b.shots.filter((s) => s.status === 'failed').map((s) => s.id)).toEqual(['s3']);
    expect(b.shots.filter((s) => s.status === 'held')).toHaveLength(6);
  });

  it('only the failed shot is retryable — never a whole-batch retry', () => {
    let b = withShots(7);
    b = setShotStatus(b, 's3', 'failed', 'boom');
    b = setShotStatus(b, 's5', 'queued');
    expect(retryableShots(b).map((s) => s.id)).toEqual(['s3']);
  });

  it('the summary reports the MIX, not one verdict over the batch', () => {
    let b = withShots(7);
    for (const id of ['s0', 's1', 's2', 's4', 's5', 's6']) b = shotLanded(b, id);
    b = setShotStatus(b, 's3', 'failed', 'boom');
    const p = batchProgress(b);
    expect(p.added).toBe(6);
    expect(p.failed).toBe(1);
    expect(p.total).toBe(7);
    expect(p.summary).toBe('6 added · 1 failed');
  });

  it('a mixed online/offline batch says BOTH, so "queued" never covers a landed shot', () => {
    let b = withShots(4);
    b = shotLanded(b, 's0');
    b = setShotStatus(b, 's1', 'queued');
    b = setShotStatus(b, 's2', 'queued');
    const p = batchProgress(b);
    expect(p.summary).toBe('1 added · 2 waiting to upload · 1 to go');
  });
});

describe('landing and removal', () => {
  it('a landed shot leaves the tray and is counted', () => {
    const b = shotLanded(withShots(3), 's1');
    expect(b.shots.map((s) => s.id)).toEqual(['s0', 's2']);
    expect(b.addedCount).toBe(1);
  });

  it('landing the same shot twice does not double-count', () => {
    const b = shotLanded(shotLanded(withShots(3), 's1'), 's1');
    expect(b.addedCount).toBe(1);
  });

  it('an explicit discard removes without counting it as added', () => {
    const b = removeShot(withShots(3), 's1');
    expect(b.shots).toHaveLength(2);
    expect(b.addedCount).toBe(0);
  });

  it('total counts departed shots too, so it does not shrink as photos land', () => {
    let b = withShots(3);
    expect(batchProgress(b).total).toBe(3);
    b = shotLanded(b, 's0');
    expect(batchProgress(b).total).toBe(3);
  });
});
