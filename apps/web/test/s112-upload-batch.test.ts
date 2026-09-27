import { describe, expect, it } from 'vitest';
import {
  DEFAULT_UPLOAD_CONCURRENCY,
  requeueUnfinished,
  runUploadBatch,
  summarizeBatch,
  toUploadItems,
  type UploadOutcome,
} from '@/lib/uploads/upload-batch';

// S112 queue 2b — the shared multi-file upload runner.

const files = (n: number) =>
  Array.from(
    { length: n },
    (_, i) => new File([`x${i}`], `f${i}.pdf`, { type: 'application/pdf' })
  );
const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A worker that records how many calls are in flight at once. */
function tracked(result: (f: File) => UploadOutcome | Promise<UploadOutcome>, ms = 5) {
  let inFlight = 0;
  const seen = { max: 0, calls: [] as string[] };
  const worker = async (f: File) => {
    inFlight += 1;
    seen.max = Math.max(seen.max, inFlight);
    seen.calls.push(f.name);
    await tick(ms);
    inFlight -= 1;
    return result(f);
  };
  return { worker, seen };
}

describe('S112 2b — concurrency is bounded', () => {
  it('10 files never have more than the default (3) in flight, and all complete', async () => {
    const { worker, seen } = tracked((f) => ({ success: true, id: `id-${f.name}` }));
    const out = await runUploadBatch(toUploadItems(files(10)), worker);
    expect(DEFAULT_UPLOAD_CONCURRENCY).toBe(3);
    expect(seen.max).toBe(3);
    expect(seen.calls).toHaveLength(10);
    expect(out.every((i) => i.status === 'done' && i.fileId === `id-${i.file.name}`)).toBe(true);
  });

  it('CONTROL — with the bound raised to 10, 10 run at once (so the 3 above is the limiter, not the timing)', async () => {
    const { worker, seen } = tracked(() => ({ success: true }));
    await runUploadBatch(toUploadItems(files(10)), worker, { concurrency: 10 });
    expect(seen.max).toBe(10);
  });

  it('concurrency 1 is strictly sequential', async () => {
    const { worker, seen } = tracked(() => ({ success: true }));
    await runUploadBatch(toUploadItems(files(4)), worker, { concurrency: 1 });
    expect(seen.max).toBe(1);
  });
});

describe('S112 2b — partial failure names the files and retries only those', () => {
  const failOdd = (f: File): UploadOutcome =>
    Number(f.name.slice(1, -4)) % 2
      ? { success: false, error: 'network' }
      : { success: true, id: f.name };

  it('the summary NAMES each failed file, not just a count', async () => {
    const out = await runUploadBatch(toUploadItems(files(5)), async (f) => failOdd(f));
    const s = summarizeBatch(out);
    expect(s.done).toBe(3);
    expect(s.failed.map((i) => i.file.name)).toEqual(['f1.pdf', 'f3.pdf']);
    expect(s.message).toBe('2 of 5 could not be uploaded: f1.pdf, f3.pdf.');
  });

  it('a retry re-runs ONLY the failed ones; done files are not uploaded twice', async () => {
    const first = await runUploadBatch(toUploadItems(files(5)), async (f) => failOdd(f));
    const { worker, seen } = tracked((f) => ({ success: true, id: `retry-${f.name}` }));
    const second = await runUploadBatch(requeueUnfinished(first), worker);
    expect(seen.calls.sort()).toEqual(['f1.pdf', 'f3.pdf']);
    expect(second.every((i) => i.status === 'done')).toBe(true);
    expect(second.find((i) => i.file.name === 'f0.pdf')!.fileId).toBe('f0.pdf'); // untouched
    expect(second.map((i) => i.key)).toEqual(first.map((i) => i.key)); // rows keep their keys
  });

  it('a worker that THROWS is a failed item with its message, not a crashed batch', async () => {
    const out = await runUploadBatch(toUploadItems(files(3)), async (f) => {
      if (f.name === 'f1.pdf') throw new Error('boom');
      return { success: true };
    });
    expect(out.map((i) => i.status)).toEqual(['done', 'failed', 'done']);
    expect(out[1].error).toBe('boom');
  });
});

describe('S112 2b — a storage-limit refusal stops the queue', () => {
  it('files after the refusal are SKIPPED (never attempted), and say why', async () => {
    const { worker, seen } = tracked((f) =>
      f.name === 'f1.pdf'
        ? { success: false, storageLimited: true, error: 'Storage limit reached.' }
        : { success: true }
    );
    const out = await runUploadBatch(toUploadItems(files(6)), worker, { concurrency: 1 });
    expect(seen.calls).toEqual(['f0.pdf', 'f1.pdf']);
    expect(out.map((i) => i.status)).toEqual([
      'done',
      'skipped',
      'skipped',
      'skipped',
      'skipped',
      'skipped',
    ]);
    expect(summarizeBatch(out).message).toContain('5 not attempted (Storage limit reached.)');
  });
});

describe('S112 2b — per-file progress', () => {
  it('onChange reports every file passing queued → uploading → done', async () => {
    const snapshots: string[][] = [];
    await runUploadBatch(toUploadItems(files(2)), async () => ({ success: true }), {
      concurrency: 1,
      onChange: (items) => snapshots.push(items.map((i) => i.status)),
    });
    expect(snapshots).toEqual([
      ['uploading', 'queued'],
      ['done', 'queued'],
      ['done', 'uploading'],
      ['done', 'done'],
    ]);
  });
});
