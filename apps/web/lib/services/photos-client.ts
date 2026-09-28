import { createClient } from '@/lib/supabase-browser';
import {
  MARKUP_SCHEMA_VERSION,
  type MarkupData,
  type MarkupShape,
} from '@framefocus/shared/types/markup';
import { derivativePathFor, markupFingerprint } from '@framefocus/shared/utils/markup';
import { requestThumbnail } from '@/lib/photos/request-thumbnail';
import { rememberLocalDerivative } from '@/lib/photos/local-derivative';
import { DISPLAY_MAX_EDGE, flattenMarked } from '@/lib/markup/flatten-image';

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

// The flatten itself lives in lib/markup/flatten-image.ts [S112 R1] — the
// save and every export (Download / Save / Share) call the same function and
// the same rasteriser, at different sizes. A-23c (always from the ORIGINAL,
// never from the previous derivative) is enforced there.

/**
 * [S114 C-8] WHERE A SAVE GOES. A project photo is written by the caller's own
 * session (RLS, as since M6M). A SITE-VISIT capture is an estimate file
 * (`project_id IS NULL`) that the session policies admit for Owner/Admin only,
 * so it is posted to `/api/estimates/[id]/files/[fileId]/markup`, which runs
 * the shared `authorizeSiteVisitMarkup()` check and writes the same two things
 * in the same order with the service role. Same flatten, same result type,
 * both surfaces.
 */
export type MarkupSaveTarget = { kind: 'project' } | { kind: 'site_visit'; estimateId: string };

export async function saveMarkup(
  fileId: string,
  filePath: string,
  originalUrl: string,
  shapes: MarkupShape[],
  imageDims: { w: number; h: number },
  target: MarkupSaveTarget = { kind: 'project' }
): Promise<MarkupSaveResult> {
  const markup: MarkupData = {
    version: MARKUP_SCHEMA_VERSION,
    imageWidth: imageDims.w,
    imageHeight: imageDims.h,
    shapes,
  };

  if (target.kind === 'site_visit') {
    return saveSiteVisitMarkup(target.estimateId, fileId, originalUrl, markup);
  }

  const supabase = createClient();

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
  // [S112] `.select('markup_data')` returns the row AS STORED in the same
  // request — no extra round trip — so the local copy below is fingerprinted
  // over jsonb's canonical key order, exactly as the server fingerprints it.
  const { data: storedRows, error: rowError } = await supabase
    .from('files')
    .update({ markup_data: markup as unknown as Record<string, unknown> })
    .eq('id', fileId)
    .select('markup_data');

  if (rowError) return { status: 'failed', error: rowError.message };
  // [S114 C-8] ZERO ROWS IS NOT A SAVE. An UPDATE that RLS filters out affects
  // no row and returns no error; this used to fall through to the derivative
  // write, fail there, and tell the user "Marks saved, but the flattened image
  // could not be written" — when the marks were NOT saved. Both surfaces use
  // this function, so both were wrong the same way.
  if ((storedRows ?? []).length !== 1) {
    return { status: 'failed', error: 'You do not have permission to mark up this photo.' };
  }

  // [S112 R1] The STORED derivative is DISPLAY-SIZE (2,048 px long edge). It
  // is what every surface shows; exports rebuild full resolution on demand
  // from the original + markup_data (lib/markup/export-marked.ts). A photo
  // already under the cap is flattened at its own size — never upscaled.
  // _Superseded, quoted: `canvas.width = markup.imageWidth || img.naturalWidth`_
  // — the derivative used to be written at full resolution (2 MB on 12 MP).
  const blob = await flattenMarked({ originalUrl, markup, maxEdge: DISPLAY_MAX_EDGE });
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

  // [S111 D] The grid shows the marked-up version, so it needs a thumbnail of
  // THIS markup. Its name carries the markup's fingerprint, so until it exists
  // the grid falls back to the full derivative — never to a stale thumbnail.
  requestThumbnail(fileId);
  // [S112 3c] The viewer shows THESE bytes instead of downloading them back.
  const stored = storedRows?.[0]?.markup_data;
  if (stored) rememberLocalDerivative(fileId, markupFingerprint(stored), blob);
  return { status: 'saved' };
}

/** [S114 C-8] The site-visit branch of `saveMarkup` — see MarkupSaveTarget. */
async function saveSiteVisitMarkup(
  estimateId: string,
  fileId: string,
  originalUrl: string,
  markup: MarkupData
): Promise<MarkupSaveResult> {
  const blob = await flattenMarked({ originalUrl, markup, maxEdge: DISPLAY_MAX_EDGE });
  if (!blob) {
    // Nothing was written: the route writes markup_data and the derivative
    // together, so without the image there is nothing to send.
    return { status: 'failed', error: 'The marked-up image could not be generated.' };
  }
  const form = new FormData();
  form.set('markup', JSON.stringify(markup));
  form.set('derivative', blob, 'markup.jpg');
  let res: Response;
  try {
    res = await fetch(`/api/estimates/${estimateId}/files/${fileId}/markup`, {
      method: 'POST',
      body: form,
    });
  } catch {
    return { status: 'failed', error: 'No connection — the marks were not saved.' };
  }
  const body = (await res.json().catch(() => ({}))) as {
    status?: string;
    error?: string;
    markup_data?: unknown;
  };
  if (!res.ok) return { status: 'failed', error: body.error ?? 'The marks could not be saved.' };
  if (body.status === 'derivative_failed') {
    return {
      status: 'derivative_failed',
      error: body.error ?? 'The marked-up image could not be written.',
    };
  }
  if (body.markup_data) rememberLocalDerivative(fileId, markupFingerprint(body.markup_data), blob);
  return { status: 'saved' };
}
