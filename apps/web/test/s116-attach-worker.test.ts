import { describe, expect, it } from 'vitest';
import {
  makeAttachWorker,
  requeueUnfinished,
  runUploadBatch,
  toUploadItems,
} from '@/lib/uploads/upload-batch';
import { mergeLanded } from '@/lib/uploads/use-upload-batches';

// [S116 F-12, #2-s180u] THE DUPLICATE-ON-RETRY DEFECT. uploadDailyLogPhoto /
// uploadIncidentPhoto / uploadExpenseReceipt returned FAILURE when the upload
// had succeeded and only the link had failed, so a retry uploaded the file a
// second time and left the first as an unlinked `files` row. makeAttachWorker
// remembers the uploaded id and a retry re-runs ONLY the link.

const file = (name: string) => new File(['x'], name, { type: 'image/png' });

function harness(linkFailsFor: Set<string>) {
  const uploads: string[] = [];
  const links: string[] = [];
  const worker = makeAttachWorker(
    async (f) => {
      uploads.push(f.name);
      return { success: true, id: `id-${f.name}-${uploads.length}` };
    },
    async (id) => {
      links.push(id);
      const name = id.split('-')[1];
      return linkFailsFor.has(name) ? { success: false, error: 'RLS said no' } : { success: true };
    }
  );
  return { worker, uploads, links };
}

describe('makeAttachWorker — upload once, link until it sticks', () => {
  it('a link failure is a FAILED row, named, and says the file uploaded', async () => {
    const fails = new Set(['b.png']);
    const h = harness(fails);
    const out = await runUploadBatch(toUploadItems([file('a.png'), file('b.png')]), h.worker);
    expect(out.map((r) => r.status)).toEqual(['done', 'failed']);
    expect(out[1].error).toMatch(/^Uploaded but not attached: RLS said no$/);
  });

  it('RETRY re-links the SAME uploaded file — never a second upload', async () => {
    const fails = new Set(['b.png']);
    const h = harness(fails);
    const first = await runUploadBatch(toUploadItems([file('a.png'), file('b.png')]), h.worker);
    expect(h.uploads).toEqual(['a.png', 'b.png']);

    fails.clear(); // the link now succeeds
    const second = await runUploadBatch(requeueUnfinished(first), h.worker);
    expect(second.map((r) => r.status)).toEqual(['done', 'done']);
    // THE ASSERTION THE DEFECT FAILS: b.png was uploaded exactly once.
    expect(h.uploads).toEqual(['a.png', 'b.png']);
    expect(h.uploads.filter((n) => n === 'b.png')).toHaveLength(1);
    // …and the id it linked on retry is the id the first upload returned.
    const bLinks = h.links.filter((id) => id.includes('b.png'));
    expect(bLinks).toHaveLength(2);
    expect(new Set(bLinks).size).toBe(1);
    expect(second[1].fileId).toBe(bLinks[0]);
  });

  it('an UPLOAD failure is retried as an upload (nothing was stored)', async () => {
    let attempts = 0;
    const worker = makeAttachWorker(
      async () => {
        attempts += 1;
        return attempts === 1 ? { success: false, error: 'network' } : { success: true, id: 'x1' };
      },
      async () => ({ success: true })
    );
    const first = await runUploadBatch(toUploadItems([file('c.png')]), worker);
    expect(first[0]).toMatchObject({ status: 'failed', error: 'network' });
    const second = await runUploadBatch(requeueUnfinished(first), worker);
    expect(second[0]).toMatchObject({ status: 'done', fileId: 'x1' });
    expect(attempts).toBe(2);
  });
});

describe('mergeLanded — a retry does not add a landed photo twice', () => {
  it('adds only done rows not already present', () => {
    const rows = [
      { key: 'k0', file: file('a.png'), status: 'done' as const, fileId: 'A' },
      { key: 'k1', file: file('b.png'), status: 'failed' as const },
    ];
    const once = mergeLanded([], rows);
    expect(once).toEqual([{ id: 'A', name: 'a.png' }]);
    const again = mergeLanded(once, [
      ...rows.slice(0, 1),
      { ...rows[1], status: 'done', fileId: 'B' },
    ]);
    expect(again).toEqual([
      { id: 'A', name: 'a.png' },
      { id: 'B', name: 'b.png' },
    ]);
  });
});
