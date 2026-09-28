import { describe, expect, it, vi } from 'vitest';
import { uploadRemaining, type UploadOutcome } from '@/lib/uploads/upload-batch';

// S114 C-5 — record-attached multi-photo uploads: bounded, failures NAMED, and a
// second call retries ONLY what did not land (never a duplicate upload).

const file = (name: string) => new File([new Uint8Array([1])], name, { type: 'image/jpeg' });

describe('S114 C-5 — uploadRemaining', () => {
  it('names the file that failed, and a second call retries only that one', async () => {
    const a = file('a.jpg');
    const b = file('b.jpg');
    const c = file('c.jpg');
    const done = new Map<File, string | undefined>();
    let bFails = true;
    const worker = vi.fn(async (f: File): Promise<UploadOutcome> => {
      if (f === b && bFails) return { success: false, error: 'network' };
      return { success: true, id: `id-${f.name}` };
    });

    const first = await uploadRemaining([a, b, c], done, worker);
    expect(first.unfinished).toBe(1);
    expect(first.message).toContain('b.jpg');
    expect(first.message).not.toContain('a.jpg');
    expect(worker).toHaveBeenCalledTimes(3);
    expect([...done.keys()].map((f) => f.name).sort()).toEqual(['a.jpg', 'c.jpg']);

    bFails = false;
    const second = await uploadRemaining([a, b, c], done, worker);
    expect(second.unfinished).toBe(0);
    expect(second.message).toBeNull();
    // ONLY b was attempted again — a and c are never uploaded twice.
    expect(worker).toHaveBeenCalledTimes(4);
    expect(worker.mock.calls[3][0]).toBe(b);
    expect(done.get(b)).toBe('id-b.jpg');
  });

  it('is bounded: never more than 3 in flight for 10 files', async () => {
    let inFlight = 0;
    let peak = 0;
    const worker = async (): Promise<UploadOutcome> => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return { success: true, id: 'x' };
    };
    const files = Array.from({ length: 10 }, (_, i) => file(`p${i}.jpg`));
    const out = await uploadRemaining(files, new Map(), worker);
    expect(out.unfinished).toBe(0);
    expect(peak).toBe(3);
  });

  it('a storage-limit refusal stops the queue; the rest are named as not attempted', async () => {
    const files = ['1', '2', '3', '4', '5'].map((n) => file(`${n}.jpg`));
    const out = await uploadRemaining(
      files,
      new Map(),
      async () => ({ success: false, storageLimited: true, error: 'Storage limit reached.' }),
      { concurrency: 1 }
    );
    expect(out.unfinished).toBe(5);
    expect(out.message).toMatch(/not attempted/);
  });
});
