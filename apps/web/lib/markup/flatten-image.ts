import type { MarkupData } from '@framefocus/shared/types/markup';
import { drawShapes } from '@/lib/markup/flatten-shapes';

// [S112, RULED Josh R1] THE ONE FLATTEN — original + marks → JPEG, at a size.
//
// ---------------------------------------------------------------------------
// TWO SIZES, ONE MECHANISM
// ---------------------------------------------------------------------------
//   · the STORED derivative (`{file_path}.markup.jpg`) is DISPLAY-SIZE —
//     DISPLAY_MAX_EDGE px on the long edge. It is what every surface shows
//     (D-31) and nothing that shows it needs 12 MP.
//   · an EXPORT (Download, Save, Share) regenerates at FULL resolution, on
//     demand, from the original + `markup_data` — lib/markup/export-marked.ts.
//
// Both call THIS function, which calls `drawShapes()` — the same rasteriser,
// so a display-size derivative and a full-size export cannot disagree about
// what a mark looks like (CLAUDE.md → PARITY; TECH_DEBT #129). There is no
// server renderer, by ruling.
//
// ---------------------------------------------------------------------------
// HOW THE SCALE IS APPLIED — AND WHY THE SHAPES ARE NOT TOUCHED
// ---------------------------------------------------------------------------
// The canvas is sized to the scaled dimensions and the CONTEXT is scaled
// (`ctx.scale(s, s)`). The image is then drawn at its natural size and the
// shapes in natural-pixel coordinates (§4.7a.1), exactly as before. So every
// shape's geometry, stroke width, pin diameter and font size scales with the
// photo by construction — no per-shape arithmetic that could drift from
// MarkupViewer. At s = 1 (a full-res export, or a photo already smaller than
// the cap) this is byte-for-byte the pre-R1 flatten.
//
// A-23c — the ONLY image input is the ORIGINAL, never a previous derivative:
// feeding a derivative back in would compound JPEG loss (and now shrink it).

/** R1 — the stored derivative's long edge, in px. */
export const DISPLAY_MAX_EDGE = 2048;

const JPEG_QUALITY = 0.92;

/**
 * The canvas size for a `w × h` image capped at `maxEdge` on the long edge.
 * Never upscales. `maxEdge` undefined → full size. Pure, so the cap is
 * assertable without a canvas.
 */
export function scaledSize(
  w: number,
  h: number,
  maxEdge?: number
): { width: number; height: number; scale: number } {
  const longEdge = Math.max(w, h);
  const scale = maxEdge && longEdge > maxEdge ? maxEdge / longEdge : 1;
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
    scale,
  };
}

/**
 * Flatten the ORIGINAL bytes plus the marks into a JPEG blob, capped at
 * `maxEdge` on the long edge (undefined = full resolution).
 *
 * Resolves null rather than throwing on any failure — image load, no 2D
 * context (a device refusing a canvas that large: iOS caps canvas area), or a
 * null `toBlob` — so callers decide what a failure means: the save reports
 * `derivative_failed` (A-23j); an export falls back (R1 a).
 */
export async function flattenMarked({
  originalUrl,
  markup,
  maxEdge,
}: {
  originalUrl: string;
  markup: MarkupData;
  maxEdge?: number;
}): Promise<Blob | null> {
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const loaded = new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('image load failed'));
    });
    img.src = originalUrl;
    await loaded;

    // The markup's own dimensions are the coordinate space the shapes were
    // authored in; the image is drawn to fill exactly that space.
    const w = markup.imageWidth || img.naturalWidth;
    const h = markup.imageHeight || img.naturalHeight;
    const size = scaledSize(w, h, maxEdge);

    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    if (size.scale !== 1) ctx.scale(size.scale, size.scale);
    ctx.drawImage(img, 0, 0, w, h);
    drawShapes(ctx, markup);

    return await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', JPEG_QUALITY)
    );
  } catch {
    return null;
  }
}
