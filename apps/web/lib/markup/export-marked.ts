import type { MarkupData } from '@framefocus/shared/types/markup';
import { DERIVATIVE_SUFFIX, hasMarkup } from '@framefocus/shared/utils/markup';
import { flattenMarked } from '@/lib/markup/flatten-image';

// [S112, RULED Josh R1] EXPORTING A PHOTO — full resolution, rebuilt on demand.
//
// The stored `.markup.jpg` is DISPLAY-SIZE (lib/markup/flatten-image.ts). What
// LEAVES the app — Download, Save, Share — is rebuilt here, client-side, from
// the ORIGINAL + `markup_data`, through the same `flattenMarked()` and the
// same `drawShapes()` the save uses. One rasteriser, no server renderer.
//
// Every export surface calls THIS (CLAUDE.md → PARITY): the /m viewer's Save
// and Share, the /m grid's bulk Share, the shared file sheet's Download
// (desktop Files, chat). None of them decides the fallback on its own.
//
// ---------------------------------------------------------------------------
// R1 (a) — THE FALLBACK. AN EXPORT DEGRADES; IT DOES NOT FAIL.
// ---------------------------------------------------------------------------
//   marked, rebuild ok        → the full-res rebuild        'regenerated'
//   marked, rebuild failed    → the STORED derivative       'fallback-derivative'
//   no markup, derivative     → the stored derivative       'fallback-derivative'
//     known (caller knows the photo is annotated but holds no mark list)
//   no markup                 → the original                'original'
//   marked, nothing marked    → the ORIGINAL, WITH A WARNING 'original' + warning
//     could be fetched
//
// The last row is A-23t's rule carried over from `shareTargetFor`: it never
// silently exports an unmarked photo as if it were marked — `warning` is
// non-null whenever the marks are absent from bytes the user thinks carry them.
//
// A rebuild fails for real on a phone: iOS refuses a canvas over ~16.7 MP, so
// a 48 MP original cannot be flattened at full size at all. That is exactly
// the case the stored derivative covers.
//
// R1 (b) — derivatives written before R1 are full-resolution and are not
// backfilled. When one of those is the fallback, the export is simply full-res
// from the stored file; nothing here depends on the derivative's size.

export type ExportSource = 'regenerated' | 'fallback-derivative' | 'original';

export interface ExportedPhoto {
  blob: Blob;
  source: ExportSource;
  /** Non-null when the user should be told what they got instead. */
  warning: string | null;
}

export const EXPORT_WARNING_DISPLAY_SIZE =
  'Full-resolution version could not be built — this is the display-size marked-up image.';
export const EXPORT_WARNING_UNMARKED =
  'Markup image unavailable — this is the unmarked original.';

/**
 * Which warning an export carries, as a kind a surface can translate (the /m
 * screens render system text in the reader's language; the constants above
 * are the English wording).
 */
export function exportWarningKind(r: ExportedPhoto): 'display-size' | 'unmarked' | null {
  if (r.warning === EXPORT_WARNING_DISPLAY_SIZE) return 'display-size';
  if (r.warning === EXPORT_WARNING_UNMARKED) return 'unmarked';
  return null;
}

async function fetchBlob(url: string | null | undefined): Promise<Blob | null> {
  if (!url) return null;
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    return await resp.blob();
  } catch {
    return null;
  }
}

/**
 * The bytes to export for one photo. Resolves null only when NOTHING could be
 * fetched — the caller then says so (or, in the file sheet, falls back to the
 * plain signed-URL download it always had).
 *
 * @param originalUrl  the original's signed URL — the rebuild's only input
 * @param markup       `files.markup_data` as read (null / empty ⇒ no rebuild)
 * @param fallbackUrl  the STORED derivative's URL, or null when there is none
 *                     (derivativeMissing). Never the original.
 */
export async function exportPhotoBlob({
  originalUrl,
  markup,
  fallbackUrl,
}: {
  originalUrl: string | null;
  markup: MarkupData | null | undefined;
  fallbackUrl: string | null;
}): Promise<ExportedPhoto | null> {
  if (hasMarkup(markup) && originalUrl) {
    let rebuilt: Blob | null = null;
    try {
      rebuilt = await flattenMarked({ originalUrl, markup: markup as MarkupData });
    } catch {
      rebuilt = null;
    }
    if (rebuilt) return { blob: rebuilt, source: 'regenerated', warning: null };

    const stored = await fetchBlob(fallbackUrl);
    if (stored) {
      return { blob: stored, source: 'fallback-derivative', warning: EXPORT_WARNING_DISPLAY_SIZE };
    }
    const original = await fetchBlob(originalUrl);
    return original
      ? { blob: original, source: 'original', warning: EXPORT_WARNING_UNMARKED }
      : null;
  }

  // No mark list to rebuild from. If the caller nonetheless holds a stored
  // derivative, it is the marked image — prefer it; otherwise the original IS
  // the whole photo.
  const stored = await fetchBlob(fallbackUrl);
  if (stored) return { blob: stored, source: 'fallback-derivative', warning: null };
  const original = await fetchBlob(originalUrl);
  return original ? { blob: original, source: 'original', warning: null } : null;
}

/**
 * The name to save an export under. A flattened image is always a JPEG
 * (canvas export, `.markup.jpg`), so a marked export of `IMG_1.HEIC` or
 * `plan.png` is saved as `IMG_1.jpg` / `plan.jpg` — a receiving app trusts the
 * extension. The original keeps its own name.
 */
export function exportFileName(fileName: string, source: ExportSource): string {
  if (source === 'original') return fileName;
  const base = fileName.replace(/\.[^./\\]+$/, '');
  return `${base || 'photo'}.jpg`;
}

/**
 * Save a blob to the device under `fileName`, via an object-URL anchor. Works
 * after an `await` (a download is not gated on user activation the way
 * `navigator.share` is).
 */
export function saveBlobAs(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoked later, not now: some browsers read the URL after click() returns.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

async function signViaRoute(path: string, markup: boolean): Promise<string | null> {
  try {
    const res = await fetch(
      `/api/files/signed-url?path=${encodeURIComponent(path)}${markup ? '&markup=1' : ''}`
    );
    if (!res.ok) return null;
    const { url } = (await res.json()) as { url?: string };
    return url ?? null;
  } catch {
    return null;
  }
}

/**
 * Sign an annotated file's ORIGINAL and STORED DERIVATIVE at click time, for a
 * surface that holds only `file_path` (desktop Files). Lazy on purpose: a list
 * that signed every original at load is the per-view signing S111 found
 * exhausting Storage connections — this costs two calls, only on Download.
 *
 * `/api/files/signed-url?markup=1` silently degrades to the ORIGINAL when the
 * derivative is missing (#100). Handed to exportPhotoBlob as the "derivative",
 * that would be exported as marked when it is not — so a URL that is not for a
 * `.markup.jpg` object is dropped here, and the helper's A-23t warning applies.
 */
export async function signExportUrls(
  filePath: string
): Promise<{ originalUrl: string | null; derivativeUrl: string | null }> {
  const [originalUrl, maybeDerivative] = await Promise.all([
    signViaRoute(filePath, false),
    signViaRoute(filePath, true),
  ]);
  let derivativeUrl: string | null = null;
  if (maybeDerivative) {
    try {
      if (new URL(maybeDerivative).pathname.endsWith(DERIVATIVE_SUFFIX)) {
        derivativeUrl = maybeDerivative;
      }
    } catch {
      derivativeUrl = null;
    }
  }
  return { originalUrl, derivativeUrl };
}

type SheetExport = () => Promise<{ blob: Blob; fileName: string } | null>;

/**
 * The file sheet's `exportBlob` for a surface holding URLs it has already
 * signed (chat — the gallery resolution it renders from).
 */
export function sheetExportFromUrls({
  originalUrl,
  markup,
  fallbackUrl,
  fileName,
}: {
  originalUrl: string | null;
  markup: MarkupData | null | undefined;
  fallbackUrl: string | null;
  fileName: string;
}): SheetExport {
  return async () => {
    const r = await exportPhotoBlob({ originalUrl, markup, fallbackUrl });
    return r ? { blob: r.blob, fileName: exportFileName(fileName, r.source) } : null;
  };
}

/**
 * The file sheet's `exportBlob` for a surface holding only `file_path` and the
 * row's `markup_data` (desktop Files) — signs both files at CLICK time.
 */
export function sheetExportFromPath({
  filePath,
  markup,
  fileName,
}: {
  filePath: string;
  /** `files.markup_data` as read — validated by hasMarkup() before use. */
  markup: unknown;
  fileName: string;
}): SheetExport {
  return async () => {
    const { originalUrl, derivativeUrl } = await signExportUrls(filePath);
    const r = await exportPhotoBlob({
      originalUrl,
      markup: hasMarkup(markup) ? (markup as MarkupData) : null,
      fallbackUrl: derivativeUrl,
    });
    return r ? { blob: r.blob, fileName: exportFileName(fileName, r.source) } : null;
  };
}
