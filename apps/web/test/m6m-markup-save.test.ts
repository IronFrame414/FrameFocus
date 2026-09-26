import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MarkupShape } from '@framefocus/shared/types/markup';

// M6M A-23 / A-23j — the markup save contract.
//
// ---------------------------------------------------------------------------
// A-23j HAS HELD THREE POSITIONS AND IS STRICT AGAIN.
// ---------------------------------------------------------------------------
// It was strict while the derivative displayed, RELAXED by Option A when it did
// not, and strict again under D-31 now that it does. The current rule: a save
// whose DERIVATIVE write fails must NOT report plain success — the marks are
// safe in `markup_data`, but every surface would show the photo UNMARKED.
//
// The test targets the RESULT CONTRACT rather than a rendered string, because
// that is where the criterion actually bites: a `{ success: boolean }` return
// would let a caller treat the failure as success by reading one field. The
// union makes that impossible to express.

const updateSpy = vi.fn();
const uploadSpy = vi.fn();

vi.mock('@/lib/supabase-browser', () => ({
  createClient: () => ({
    from: () => ({
      // [S112 3c] the save's UPDATE now ends in .select('markup_data') — the
      // stored row, returned in the same request, keys the local copy.
      // Superseded mock link, quoted: `eq: async () => updateSpy(payload),`
      update: (payload: unknown) => ({
        eq: () => ({ select: async () => updateSpy(payload) }),
      }),
    }),
    storage: {
      from: () => ({
        upload: async (path: string, blob: unknown, opts: unknown) =>
          uploadSpy(path, blob, opts),
      }),
    },
  }),
}));

const { saveMarkup } = await import('@/lib/services/photos-client');
const { localDerivativeFor } = await import('@/lib/photos/local-derivative');
const { markupFingerprint } = await import('@framefocus/shared/utils/markup');

const SHAPES: MarkupShape[] = [
  { id: 'p1', type: 'pin', x: 4, y: 4, color: '#f2453d', number: 1 },
];

/**
 * Minimal browser stubs. `canvasWorks: false` makes getContext return null,
 * which is exactly how a real flatten fails on a device that refuses a canvas
 * context — the case A-23j is about.
 */
function stubBrowser({ canvasWorks }: { canvasWorks: boolean }) {
  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    crossOrigin = '';
    naturalWidth = 8;
    naturalHeight = 8;
    set src(_v: string) {
      queueMicrotask(() => this.onload?.());
    }
  }
  (globalThis as Record<string, unknown>).Image = FakeImage;

  (globalThis as Record<string, unknown>).document = {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => (canvasWorks ? { save() {}, restore() {}, drawImage() {} } : null),
      toBlob: (cb: (b: unknown) => void) => cb({ size: 10, type: 'image/jpeg' }),
    }),
  };
}

beforeEach(() => {
  updateSpy.mockReset();
  uploadSpy.mockReset();
  updateSpy.mockResolvedValue({ error: null });
  uploadSpy.mockResolvedValue({ error: null });
});

afterEach(() => {
  delete (globalThis as Record<string, unknown>).Image;
  delete (globalThis as Record<string, unknown>).document;
});

const call = () =>
  saveMarkup(
    'file-1',
    'comp/proj/photo.jpg',
    'http://x/original.jpg',
    SHAPES,
    { w: 8, h: 8 },
    () => {}
  );

describe('A-23 — a save writes BOTH the mark list and a derivative', () => {
  it('writes markup_data AND uploads the flattened image', async () => {
    stubBrowser({ canvasWorks: true });
    const result = await call();

    expect(result).toEqual({ status: 'saved' });
    // Asserting only one of these is not a pass — that is the whole point of
    // A-23's rewrite, since the old criterion named markup_data alone and so
    // passed under storage models that never produce a shareable image.
    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(uploadSpy).toHaveBeenCalledTimes(1);
  });

  it('A-23b · the update payload touches markup_data ONLY', async () => {
    stubBrowser({ canvasWorks: true });
    await call();
    const payload = updateSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(payload)).toEqual(['markup_data']);
    // The original's bytes, path, size and mime are not in the payload and so
    // cannot be modified by any number of saves.
    for (const forbidden of ['file_path', 'file_size', 'mime_type', 'file_name']) {
      expect(payload).not.toHaveProperty(forbidden);
    }
  });

  it('A-23c · the derivative goes to the deterministic path, overwriting in place', async () => {
    stubBrowser({ canvasWorks: true });
    await call();
    await call();

    const [pathA, , optsA] = uploadSpy.mock.calls[0];
    const [pathB] = uploadSpy.mock.calls[1];
    // Same object every time — after N saves there is exactly ONE derivative,
    // not N-1 orphans nobody can identify.
    expect(pathA).toBe(pathB);
    expect(pathA).toBe('comp/proj/photo.jpg.markup.jpg');
    expect((optsA as { upsert?: boolean }).upsert).toBe(true);
  });

  it('A-23c · the flatten input is always the ORIGINAL url, never the derivative', async () => {
    stubBrowser({ canvasWorks: true });
    let seen: string | null = null;
    class Watcher {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      crossOrigin = '';
      naturalWidth = 8;
      naturalHeight = 8;
      set src(v: string) {
        seen = v;
        queueMicrotask(() => this.onload?.());
      }
    }
    (globalThis as Record<string, unknown>).Image = Watcher;

    await call();
    // Feeding the previous derivative back in would compound JPEG loss AND
    // bake old marks into the background, so deleting a mark would leave it
    // on screen.
    expect(seen).toBe('http://x/original.jpg');
    expect(seen).not.toContain('.markup.jpg');
  });
});

describe('A-23j — a derivative failure is NOT plain success', () => {
  it('reports derivative_failed when the flatten cannot run', async () => {
    stubBrowser({ canvasWorks: false });
    const result = await call();

    expect(result.status).toBe('derivative_failed');
    // The marks ARE stored — that half succeeded and must not be rolled back.
    expect(updateSpy).toHaveBeenCalledTimes(1);
    // But nothing was uploaded, so every surface would show this photo
    // unmarked. `status` is not 'saved', and there is no boolean a caller
    // could read as success.
    expect(uploadSpy).not.toHaveBeenCalled();
    expect(result).not.toHaveProperty('success');
  });

  it('reports derivative_failed when the upload is rejected', async () => {
    stubBrowser({ canvasWorks: true });
    uploadSpy.mockResolvedValue({ error: { message: 'storage refused' } });

    const result = await call();
    expect(result.status).toBe('derivative_failed');
    if (result.status === 'derivative_failed') {
      expect(result.error).toContain('storage refused');
    }
  });

  it('markup_data is written FIRST — a row failure never leaves an orphan image', async () => {
    stubBrowser({ canvasWorks: true });
    updateSpy.mockResolvedValue({ error: { message: 'rls refused' } });

    const result = await call();
    expect(result.status).toBe('failed');
    // Nothing uploaded: an annotated image on disk that no editor can reopen
    // would be worse than a clean failure, because markup_data is the only
    // thing that cannot be regenerated.
    expect(uploadSpy).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// [S112 ruling 3c] the save keeps the image it built — for the STORED markup only
// ===========================================================================
describe('3c · the just-built image is remembered under the stored fingerprint', () => {
  it('a saved save is found by the stored fingerprint, and by nothing else', async () => {
    stubBrowser({ canvasWorks: true });
    const stored = { version: 1, shapes: SHAPES, imageWidth: 8, imageHeight: 8 }; // jsonb order
    updateSpy.mockResolvedValue({ data: [{ markup_data: stored }], error: null });
    uploadSpy.mockResolvedValue({ error: null });
    const created: string[] = [];
    const g = globalThis as unknown as { URL: { createObjectURL?: unknown; revokeObjectURL?: unknown } };
    const had = { c: g.URL.createObjectURL, r: g.URL.revokeObjectURL };
    g.URL.createObjectURL = () => { const u = `blob:test/${created.length}`; created.push(u); return u; };
    g.URL.revokeObjectURL = () => undefined;
    try {
      const result = await call();
      expect(result.status).toBe('saved');
      expect(created).toHaveLength(1);
      expect(localDerivativeFor('file-1', markupFingerprint(stored))).toBe(created[0]);
      // A different markup (another device's later save, or the client's own
      // key order) must NOT get these bytes.
      expect(localDerivativeFor('file-1', markupFingerprint({ ...stored, shapes: [] }))).toBeNull();
      expect(localDerivativeFor('file-1', null)).toBeNull();
      expect(localDerivativeFor('another-file', markupFingerprint(stored))).toBeNull();
    } finally {
      g.URL.createObjectURL = had.c;
      g.URL.revokeObjectURL = had.r;
    }
  });
});
