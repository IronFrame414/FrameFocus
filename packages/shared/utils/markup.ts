// M6M — pure markup logic, shared by the mobile authoring canvas (M-10, client)
// and the read surfaces (M-8/M-9, server). No React, no DOM, no Supabase, so
// both sides import the same rules rather than reimplementing them.

import type { MarkupData, MarkupShape, PinShape } from '../types/markup';

// ---------------------------------------------------------------------------
// §4.10a.2 — THE NEXT PIN NUMBER. `max + 1`, NEVER `count + 1`.
//
// This is the detail §4.10a.2 calls "most likely to be got wrong", so the
// failure is worth spelling out: delete pin 2 from {1,2,3} leaving {1,3}, and
// `count + 1` yields 3 — a DUPLICATE of a pin already on the photo. Duplicates
// are invisible until someone references one, at which point the reference is
// ambiguous forever. `max + 1` yields 4.
//
// On a photo with no pins, `max` over an empty set is 0, so the first pin is 1
// (A-29h — without this an off-by-one starts every photo at 0 or 2).
// ---------------------------------------------------------------------------
export function nextPinNumber(shapes: readonly MarkupShape[]): number {
  let max = 0;
  for (const s of shapes) {
    // BY SHAPE TYPE, never by the payload's `version` (§4.10a.4, A-29c).
    if (s.type === 'pin' && s.number > max) max = s.number;
  }
  return max + 1;
}

/** Every pin on the photo, in stored order. */
export function pinsOf(shapes: readonly MarkupShape[]): PinShape[] {
  return shapes.filter((s): s is PinShape => s.type === 'pin');
}

// ---------------------------------------------------------------------------
// §4.10 — "A file carrying marks is flagged from `markup_data` being non-empty".
//
// That is what the gallery's corner indicator (§4.7a.3), M-9's viewer indicator
// and the derivative-vs-original display choice all read. An EMPTY shapes array
// is NOT markup: a photo opened in the editor and saved with nothing drawn must
// not start claiming to be annotated (A-23h).
// ---------------------------------------------------------------------------
export function hasMarkup(markup: unknown): boolean {
  if (!markup || typeof markup !== 'object') return false;
  const shapes = (markup as Partial<MarkupData>).shapes;
  return Array.isArray(shapes) && shapes.length > 0;
}

// ---------------------------------------------------------------------------
// §4.10 — THE DERIVATIVE'S PATH, deterministically derived from the original.
//
// "same {company_id}/{project_id}/ folder, a reserved suffix on the file name."
// Appending keeps the whole original path — and therefore the company_id first
// segment every storage policy keys on (`(storage.foldername(name))[1]`), and
// the project_id second segment the assignment arm keys on. Deriving a path
// that moved the object to another folder would silently fall outside both.
//
// DETERMINISTIC IS THE POINT: save OVERWRITES IN PLACE (upsert), so after N
// saves there is exactly one derivative object and no accumulated recompression
// (A-23c). A timestamped or uuid'd name would leave N objects behind and no way
// to find the current one.
//
// `.markup.jpg` — always JPEG, because the flatten is a canvas export and the
// suffix must be predictable from the row alone, without reading the object.
// ---------------------------------------------------------------------------
export const DERIVATIVE_SUFFIX = '.markup.jpg';

export function derivativePathFor(originalPath: string): string {
  return `${originalPath}${DERIVATIVE_SUFFIX}`;
}

/** True for a storage path this module generated — used to keep derivatives out of listings. */
export function isDerivativePath(path: string): boolean {
  return path.endsWith(DERIVATIVE_SUFFIX);
}

// ---------------------------------------------------------------------------
// A-23t / §4.7a.5 — SHARING A MARKED-UP PHOTO WHOSE DERIVATIVE IS MISSING.
//
// "Degrades to the original WITH A WARNING — it never silently shares an
// unmarked photo as if it were marked."
//
// The silent case is the dangerous one: a sub receives what looks like a plain
// photo of a wall and has no way to know the circle showing WHICH stud was
// meant never made it. So the degraded path is not merely allowed to warn, it
// must — `warning` is non-null exactly when the marks are absent from the bytes
// being shared.
//
// Pure, and separated from the share button, so the rule is assertable without
// a browser or a network.
// ---------------------------------------------------------------------------
export interface ShareTarget {
  url: string | null;
  /** True when the shared bytes do NOT carry the photo's marks. */
  degraded: boolean;
  warning: string | null;
}

export function shareTargetFor(photo: {
  hasMarkup: boolean;
  derivativeMissing: boolean;
  displayUrl: string | null;
  originalUrl: string | null;
}): ShareTarget {
  if (!photo.hasMarkup) {
    // Nothing to lose — the original IS the whole photo.
    return { url: photo.originalUrl, degraded: false, warning: null };
  }
  if (photo.derivativeMissing) {
    return {
      url: photo.originalUrl,
      degraded: true,
      warning: 'Markup image unavailable — sharing the unmarked original.',
    };
  }
  return { url: photo.displayUrl, degraded: false, warning: null };
}

// ---------------------------------------------------------------------------
// §4.7a.3 — THE STROKE FLOOR. **AUTHORING RULE ONLY** after D-31.
//
// Re-scoped by A-23o: M-8 and M-9 render a pre-flattened derivative, so nothing
// there scales a stroke at runtime. The M-10 canvas still draws shapes live over
// the image being annotated, and there the rule bites — a 20-unit stroke on a
// 4000px photo shown at 374px renders at ~1.9px, and on a smaller canvas below
// 1px.
//
// Raised to the floor, NEVER lowered — a deliberately heavy mark stays heavy —
// and it touches WEIGHT ONLY: never position, never size, never geometry.
//
// `scale` is rendered-px per image-px (displayWidth / imageWidth).
// ---------------------------------------------------------------------------
export const STROKE_FLOOR_DEVICE_PX = 1.5;

export function strokeFloorWidth(
  strokeWidth: number,
  scale: number,
  floorDevicePx: number = STROKE_FLOOR_DEVICE_PX
): number {
  if (!Number.isFinite(scale) || scale <= 0) return strokeWidth;
  const rendered = strokeWidth * scale;
  if (rendered >= floorDevicePx) return strokeWidth; // never lowered
  return floorDevicePx / scale;
}

// ---------------------------------------------------------------------------
// §4.10a.1 — THE PIN IS EXEMPT FROM THE STROKE FLOOR and has its own minimum.
//
// A pin carries no `strokeWidth` — §4.10 fixes its appearance ("34px red
// circle, white 2px ring, mono numeral"), so its size is a render constant
// rather than authored data. That means the stroke floor cannot rescue it, and
// without a rule of its own the pin is the one mark type that silently
// collapses to a dot in a thumbnail (A-29j).
//
// PIN_IMAGE_DIAMETER is the authoring-space size; MIN_PIN_DEVICE_PX is the
// rendered floor. Returns the diameter to draw IN IMAGE UNITS.
// ---------------------------------------------------------------------------
export const PIN_IMAGE_DIAMETER = 34;
export const MIN_PIN_DEVICE_PX = 18;

export function pinDiameter(
  scale: number,
  imageDiameter: number = PIN_IMAGE_DIAMETER,
  minDevicePx: number = MIN_PIN_DEVICE_PX
): number {
  if (!Number.isFinite(scale) || scale <= 0) return imageDiameter;
  const rendered = imageDiameter * scale;
  if (rendered >= minDevicePx) return imageDiameter; // never shrunk below authored size
  return minDevicePx / scale;
}
