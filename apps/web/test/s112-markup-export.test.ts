import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MarkupData } from '@framefocus/shared/types/markup';
import {
  EXPORT_WARNING_DISPLAY_SIZE,
  EXPORT_WARNING_UNMARKED,
  exportFileName,
  exportPhotoBlob,
  signExportUrls,
} from '@/lib/markup/export-marked';
import { scaledSize, DISPLAY_MAX_EDGE } from '@/lib/markup/flatten-image';
import { shareImages, shareFailureNote } from '@/lib/share-image';

// [S112 RULING R1] EXPORTS REBUILD FULL RESOLUTION; THE STORED DERIVATIVE IS
// THE FALLBACK. The save side (2,048 px derivative) is asserted in
// m6m-markup-save.test.ts; this file is the export side and its fallback (a).
//
// Every case names the bytes' SOURCE and counts fetches — an export that
// "succeeded" by quietly fetching the display-size derivative is the defect
// R1 exists to remove, and it looks identical from the outside.

const MARKUP: MarkupData = {
  version: 1,
  imageWidth: 4032,
  imageHeight: 3024,
  shapes: [{ id: 'p1', type: 'pin', x: 40, y: 40, color: '#f2453d', number: 1 }],
};

type FakeCanvas = { width: number; height: number; calls: string[] };
let canvases: FakeCanvas[] = [];
const fetchSpy = vi.fn();

function ctxRecording(calls: string[]): CanvasRenderingContext2D {
  return new Proxy({} as Record<string, unknown>, {
    get: (t, k) => (k in t ? t[k as string] : () => void calls.push(String(k))),
    set: (t, k, v) => {
      t[k as string] = v;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

function stubBrowser({
  mode = 'ok',
  natural = { w: 4032, h: 3024 },
}: {
  mode?: 'ok' | 'no-context' | 'image-error' | 'createElement-throws';
  natural?: { w: number; h: number };
} = {}) {
  canvases = [];
  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    crossOrigin = '';
    naturalWidth = natural.w;
    naturalHeight = natural.h;
    set src(_v: string) {
      queueMicrotask(() => (mode === 'image-error' ? this.onerror?.() : this.onload?.()));
    }
  }
  (globalThis as Record<string, unknown>).Image = FakeImage;
  (globalThis as Record<string, unknown>).document = {
    createElement: () => {
      if (mode === 'createElement-throws') throw new Error('canvas refused');
      const c: FakeCanvas & Record<string, unknown> = {
        width: 0,
        height: 0,
        calls: [],
        getContext: () => (mode === 'no-context' ? null : ctxRecording(c.calls)),
        toBlob: (cb: (b: Blob) => void) =>
          cb(new Blob([`rebuilt ${c.width}x${c.height}`], { type: 'image/jpeg' })),
      };
      canvases.push(c);
      return c;
    },
  };
}

beforeEach(() => {
  fetchSpy.mockReset();
  fetchSpy.mockImplementation(async (url: string) => ({
    ok: true,
    blob: async () => new Blob([`bytes of ${url}`], { type: 'image/jpeg' }),
  }));
  vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete (globalThis as Record<string, unknown>).Image;
  delete (globalThis as Record<string, unknown>).document;
});

const ORIGINAL = 'https://s.test/object/sign/project-files/c/p/IMG_1.jpg?token=o';
const DERIVATIVE = 'https://s.test/object/sign/project-files/c/p/IMG_1.jpg.markup.jpg?token=d';

describe('R1 · scaledSize — the cap is pure arithmetic', () => {
  it('caps the long edge, never upscales, full size when uncapped', () => {
    expect(scaledSize(4032, 3024, DISPLAY_MAX_EDGE)).toEqual({
      width: 2048,
      height: 1536,
      scale: 2048 / 4032,
    });
    expect(scaledSize(1600, 1200, DISPLAY_MAX_EDGE)).toEqual({
      width: 1600,
      height: 1200,
      scale: 1,
    });
    expect(scaledSize(4032, 3024)).toEqual({ width: 4032, height: 3024, scale: 1 });
  });
});

describe('R1 · an export of a marked photo is REBUILT at natural size', () => {
  it('4032×3024 → a 4032×3024 canvas, no scale, source regenerated, nothing fetched', async () => {
    stubBrowser();
    const out = await exportPhotoBlob({
      originalUrl: ORIGINAL,
      markup: MARKUP,
      fallbackUrl: DERIVATIVE,
    });

    expect(out?.source).toBe('regenerated');
    expect(out?.warning).toBeNull();
    expect(canvases).toHaveLength(1);
    expect([canvases[0].width, canvases[0].height]).toEqual([4032, 3024]);
    expect(canvases[0].calls).not.toContain('scale');
    // The real rasteriser drew the marks (the pin's disc).
    expect(canvases[0].calls).toContain('arc');
    expect(await out!.blob.text()).toBe('rebuilt 4032x3024');
    // CONTROL: the display-size derivative was NOT what went out.
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('R1 (a) · FALLBACK — an export degrades, it does not fail', () => {
  it('markup_data ABSENT → no rebuild; the stored derivative when one is known', async () => {
    stubBrowser();
    const out = await exportPhotoBlob({
      originalUrl: ORIGINAL,
      markup: null,
      fallbackUrl: DERIVATIVE,
    });
    expect(canvases).toHaveLength(0);
    expect(fetchSpy.mock.calls.map((c) => c[0])).toEqual([DERIVATIVE]);
    expect(out?.source).toBe('fallback-derivative');
  });

  it('markup_data ABSENT and no derivative → the original, no warning (a plain photo)', async () => {
    stubBrowser();
    const out = await exportPhotoBlob({ originalUrl: ORIGINAL, markup: null, fallbackUrl: null });
    expect(canvases).toHaveLength(0);
    expect(fetchSpy.mock.calls.map((c) => c[0])).toEqual([ORIGINAL]);
    expect(out?.source).toBe('original');
    expect(out?.warning).toBeNull();
  });

  // [S112 R1 (a), measured] The surfaces that hold only URLs (the /m viewer,
  // grid, chat) were never OFFERED the stored derivative when the row had lost
  // its mark list — the harness exported the unmarked original. The resolver
  // looks for one at export time.
  it('markup_data LOST, derivative still stored → the resolver finds it; exported marked, warned', async () => {
    stubBrowser();
    const out = await exportPhotoBlob({
      originalUrl: ORIGINAL,
      markup: null,
      fallbackUrl: null,
      resolveStoredDerivative: async () => DERIVATIVE,
    });
    expect(canvases).toHaveLength(0);
    expect(fetchSpy.mock.calls.map((c) => c[0])).toEqual([DERIVATIVE]);
    expect(out?.source).toBe('fallback-derivative');
    expect(out?.warning).toBe(EXPORT_WARNING_DISPLAY_SIZE);
  });

  it('CONTROL — the same row WITHOUT the resolver exports the unmarked original (the measured defect)', async () => {
    stubBrowser();
    const out = await exportPhotoBlob({ originalUrl: ORIGINAL, markup: null, fallbackUrl: null });
    expect(out?.source).toBe('original');
  });

  it('a plain photo: the resolver finds nothing (or throws) → the original, no warning', async () => {
    stubBrowser();
    for (const resolveStoredDerivative of [
      async () => null,
      async () => Promise.reject(new Error('403')),
    ]) {
      fetchSpy.mockClear();
      const out = await exportPhotoBlob({
        originalUrl: ORIGINAL,
        markup: null,
        fallbackUrl: null,
        resolveStoredDerivative,
      });
      expect(fetchSpy.mock.calls.map((c) => c[0])).toEqual([ORIGINAL]);
      expect(out?.source).toBe('original');
      expect(out?.warning).toBeNull();
    }
  });

  it('a MARKED photo never calls the resolver (it rebuilds)', async () => {
    stubBrowser();
    const resolver = vi.fn(async () => DERIVATIVE);
    await exportPhotoBlob({
      originalUrl: ORIGINAL,
      markup: {
        version: 2,
        imageWidth: 4032,
        imageHeight: 3024,
        shapes: [{ type: 'pin', x: 1, y: 1, color: '#f00' }],
      } as never,
      fallbackUrl: DERIVATIVE,
      resolveStoredDerivative: resolver,
    });
    expect(resolver).not.toHaveBeenCalled();
  });

  it('markup_data with EMPTY shapes is not markup (A-23h) → same as absent', async () => {
    stubBrowser();
    const out = await exportPhotoBlob({
      originalUrl: ORIGINAL,
      markup: { ...MARKUP, shapes: [] },
      fallbackUrl: null,
    });
    expect(canvases).toHaveLength(0);
    expect(fetchSpy.mock.calls.map((c) => c[0])).toEqual([ORIGINAL]);
    expect(out?.source).toBe('original');
  });

  for (const mode of ['no-context', 'image-error', 'createElement-throws'] as const) {
    it(`the rebuild fails (${mode}) → the STORED derivative, source fallback-derivative`, async () => {
      stubBrowser({ mode });
      const out = await exportPhotoBlob({
        originalUrl: ORIGINAL,
        markup: MARKUP,
        fallbackUrl: DERIVATIVE,
      });
      expect(out?.source).toBe('fallback-derivative');
      expect(out?.warning).toBe(EXPORT_WARNING_DISPLAY_SIZE);
      expect(fetchSpy.mock.calls.map((c) => c[0])).toEqual([DERIVATIVE]);
      expect(await out!.blob.text()).toBe(`bytes of ${DERIVATIVE}`);
    });
  }

  it('rebuild fails AND no derivative → the original WITH the A-23t warning, never silently', async () => {
    stubBrowser({ mode: 'no-context' });
    const out = await exportPhotoBlob({ originalUrl: ORIGINAL, markup: MARKUP, fallbackUrl: null });
    expect(out?.source).toBe('original');
    expect(out?.warning).toBe(EXPORT_WARNING_UNMARKED);
  });

  it('rebuild fails and the derivative fetch fails → the original, warned', async () => {
    stubBrowser({ mode: 'no-context' });
    fetchSpy.mockImplementation(async (url: string) =>
      url === DERIVATIVE
        ? { ok: false, blob: async () => new Blob([]) }
        : { ok: true, blob: async () => new Blob(['o'], { type: 'image/jpeg' }) }
    );
    const out = await exportPhotoBlob({
      originalUrl: ORIGINAL,
      markup: MARKUP,
      fallbackUrl: DERIVATIVE,
    });
    expect(fetchSpy.mock.calls.map((c) => c[0])).toEqual([DERIVATIVE, ORIGINAL]);
    expect(out?.source).toBe('original');
    expect(out?.warning).toBe(EXPORT_WARNING_UNMARKED);
  });

  it('nothing fetchable at all → null (the caller says so)', async () => {
    stubBrowser({ mode: 'no-context' });
    fetchSpy.mockResolvedValue({ ok: false, blob: async () => new Blob([]) });
    expect(
      await exportPhotoBlob({ originalUrl: ORIGINAL, markup: MARKUP, fallbackUrl: DERIVATIVE })
    ).toBeNull();
  });
});

describe('exportFileName — a flattened export is a JPEG and is named like one', () => {
  it('renames marked exports to .jpg; the original keeps its name', () => {
    expect(exportFileName('IMG_1.HEIC', 'regenerated')).toBe('IMG_1.jpg');
    expect(exportFileName('plan.v2.png', 'fallback-derivative')).toBe('plan.v2.jpg');
    expect(exportFileName('noext', 'regenerated')).toBe('noext.jpg');
    expect(exportFileName('IMG_1.HEIC', 'original')).toBe('IMG_1.HEIC');
  });
});

describe('signExportUrls — a markup=1 answer that is really the original is dropped', () => {
  it('keeps a .markup.jpg URL, drops the #100 silent degrade to the original', async () => {
    const answer = (derivativeExists: boolean) => async (url: string) => ({
      ok: true,
      json: async () => ({
        url: url.includes('markup=1') && derivativeExists ? DERIVATIVE : ORIGINAL,
      }),
    });
    fetchSpy.mockImplementation(answer(true));
    expect(await signExportUrls('c/p/IMG_1.jpg')).toEqual({
      originalUrl: ORIGINAL,
      derivativeUrl: DERIVATIVE,
    });
    // CONTROL: the same call when the route degraded.
    fetchSpy.mockImplementation(answer(false));
    expect(await signExportUrls('c/p/IMG_1.jpg')).toEqual({
      originalUrl: ORIGINAL,
      derivativeUrl: null,
    });
  });
});

describe('share-image · bytes already built are shared as a File', () => {
  function stubShare(impl: (d: ShareData) => Promise<void>) {
    const shared: ShareData[] = [];
    vi.stubGlobal('navigator', {
      canShare: () => true,
      share: async (d: ShareData) => {
        shared.push(d);
        return impl(d);
      },
    });
    return shared;
  }

  it('a blob item is sent as a named File; no URL is fetched', async () => {
    const shared = stubShare(async () => undefined);
    const out = await shareImages([
      { blob: new Blob(['x'], { type: 'image/jpeg' }), fileName: 'IMG_1.jpg' },
    ]);
    expect(out).toEqual({ ok: true });
    const files = shared[0].files as File[];
    expect(files.map((f) => f.name)).toEqual(['IMG_1.jpg']);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('a null blob is fetch-failed, not no-url', async () => {
    stubShare(async () => undefined);
    expect(await shareImages([{ blob: null, fileName: 'a.jpg' }])).toEqual({
      ok: false,
      reason: 'fetch-failed',
    });
  });

  it('NotAllowedError (activation expired during the rebuild) is NOT a silent cancel', async () => {
    stubShare(async () => {
      throw Object.assign(new Error('no activation'), { name: 'NotAllowedError' });
    });
    const out = await shareImages([{ blob: new Blob(['x']), fileName: 'a.jpg' }]);
    expect(out).toEqual({ ok: false, reason: 'not-allowed' });
    expect(shareFailureNote('not-allowed')).not.toBeNull();
    // CONTROL: a dismissed sheet stays a silent cancel.
    stubShare(async () => {
      throw Object.assign(new Error('dismissed'), { name: 'AbortError' });
    });
    expect(await shareImages([{ blob: new Blob(['x']), fileName: 'a.jpg' }])).toEqual({
      ok: false,
      reason: 'cancelled',
    });
  });
});
