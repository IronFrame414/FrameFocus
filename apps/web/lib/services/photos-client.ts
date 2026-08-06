import { createClient } from '@/lib/supabase-browser';
import {
  MARKUP_SCHEMA_VERSION,
  type MarkupData,
  type MarkupShape,
} from '@framefocus/shared/types/markup';
import { derivativePathFor } from '@framefocus/shared/utils/markup';

const BUCKET = 'project-files';

// M6M §4.10 — THE MARKUP SAVE. It writes TWO things (A-23).
//
//   1. files.markup_data   the editable mark list — the source of truth for
//                          RE-EDITING. §4.10 loads from here when markup reopens.
//   2. a flattened image   the derivative, which under D-31 is what EVERY
//                          SURFACE DISPLAYS and what leaves the app.
//
// Asserting only one is not a pass, and the reason is now sharper than when
// A-23 was written: before D-31 a missing derivative meant a poor share, now it
// means the photo shows UNMARKED everywhere.

/**
 * A-23j — **a save whose derivative write fails must NOT report plain success.**
 *
 * This criterion has been in three positions: strict while the derivative
 * displayed, relaxed under Option A when it did not, strict again under D-31.
 * The result type is a discriminated union rather than `{ success: boolean }`
 * specifically so a caller CANNOT treat the middle case as success by reading
 * one field — the marks are safely in `markup_data`, but every surface would
 * show the photo unmarked, and the user has to be told.
 */
export type MarkupSaveResult =
  | { status: 'saved' }
  | { status: 'derivative_failed'; error: string }
  | { status: 'failed'; error: string };

/**
 * Flatten the ORIGINAL bytes plus the shapes into a JPEG blob.
 *
 * A-23c — **always from the original, never from the previous derivative.**
 * Feeding the last derivative back in would compound JPEG loss on every save
 * until the photo visibly degrades. `originalUrl` is the only image input, on
 * every save, including the tenth.
 *
 * Kept separate from the upload so the compositing rule can be reasoned about
 * on its own.
 */
async function flatten(
  originalUrl: string,
  markup: MarkupData,
  renderShapes: (ctx: CanvasRenderingContext2D, markup: MarkupData) => void
): Promise<Blob | null> {
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const loaded = new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('image load failed'));
    });
    img.src = originalUrl;
    await loaded;

    const canvas = document.createElement('canvas');
    canvas.width = markup.imageWidth || img.naturalWidth;
    canvas.height = markup.imageHeight || img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    renderShapes(ctx, markup);

    return await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.92)
    );
  } catch {
    return null;
  }
}

export async function saveMarkup(
  fileId: string,
  filePath: string,
  originalUrl: string,
  shapes: MarkupShape[],
  imageDims: { w: number; h: number },
  renderShapes: (ctx: CanvasRenderingContext2D, markup: MarkupData) => void
): Promise<MarkupSaveResult> {
  const supabase = createClient();

  const markup: MarkupData = {
    version: MARKUP_SCHEMA_VERSION,
    imageWidth: imageDims.w,
    imageHeight: imageDims.h,
    shapes,
  };

  // ---------------------------------------------------------------------
  // ORDER: markup_data FIRST.
  //
  // It is the source of truth and the thing that cannot be regenerated — the
  // derivative can always be rebuilt from it, but nothing can rebuild the mark
  // list. Writing the image first and failing on the row would leave an
  // annotated image on disk that no editor can ever reopen.
  //
  // A-23b — this UPDATE touches `markup_data` only. The original's bytes,
  // file_path, file_size and mime_type are not in the payload and are never
  // modified by any number of saves.
  // ---------------------------------------------------------------------
  const { error: rowError } = await supabase
    .from('files')
    .update({ markup_data: markup as unknown as Record<string, unknown> })
    .eq('id', fileId);

  if (rowError) return { status: 'failed', error: rowError.message };

  const blob = await flatten(originalUrl, markup, renderShapes);
  if (!blob) {
    return {
      status: 'derivative_failed',
      error: 'The marked-up image could not be generated.',
    };
  }

  // A-23c — OVERWRITE IN PLACE at the deterministic path. `upsert: true` is
  // what keeps exactly one derivative object after N saves; a fresh name each
  // time would leave N-1 orphans and no way to tell which is current.
  //
  // A-23d — NO `files` ROW IS INSERTED for it. A second row with
  // category = 'photos' would be counted by M-3's Photos badge and rendered as
  // its own tile in M-8's grid, so every annotated photo would appear twice.
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(derivativePathFor(filePath), blob, {
      contentType: 'image/jpeg',
      upsert: true,
    });

  if (uploadError) {
    return { status: 'derivative_failed', error: uploadError.message };
  }

  return { status: 'saved' };
}
