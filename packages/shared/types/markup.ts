// Markup JSON schema for photo annotations.
// Stored in files.markup_data (JSONB). Non-destructive — rendered as SVG overlay.
// Shape types are a discriminated union keyed by `type` for safe future extension.

// M6M D-22 [S98] — SCHEMA v2 ADDS THE `pin` SHAPE. Purely additive: every v1
// member keeps its exact field shape, so a v1 payload renders unchanged under a
// v2 reader and is never rewritten on read (§4.10a.3, A-29).
//
// ⚠️ `version` IS PROVENANCE, NOT A CAPABILITY GATE (§4.10a.4, A-29c).
// The desktop editor saves via `{...createEmptyMarkup(w, h), shapes}`, which
// stamps ITS OWN MARKUP_SCHEMA_VERSION over whatever content it is carrying. A
// v1 desktop that opens and re-saves a pinned photo therefore writes
// `version: 1` alongside v2 pins — the pins survive, the number lies. So no
// consumer may write `if (version < 2) skipPins()`. Readers are tolerant BY
// SHAPE TYPE, always.
export const MARKUP_SCHEMA_VERSION = 2;

export type MarkupColor = string; // hex, e.g. "#ef4444"

export interface MarkupShapeBase {
  id: string;
  color: MarkupColor;
}

export interface ArrowShape extends MarkupShapeBase {
  type: 'arrow';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  strokeWidth: number;
}

export interface CircleShape extends MarkupShapeBase {
  type: 'circle';
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  strokeWidth: number;
}

export interface RectangleShape extends MarkupShapeBase {
  type: 'rectangle';
  x: number;
  y: number;
  width: number;
  height: number;
  strokeWidth: number;
}

export interface PenShape extends MarkupShapeBase {
  type: 'pen';
  points: Array<{ x: number; y: number }>;
  strokeWidth: number;
}

export interface TextShape extends MarkupShapeBase {
  type: 'text';
  x: number;
  y: number;
  content: string;
  fontSize: number;
}

// M6M §4.10a.1 [D-22] — the pin, added in v2.
//
// WHY IT IS A SHAPE TYPE AND NOT `circle` + `text`. §4.10 requires Undo/Redo to
// be PER-MARK. A composed pin would be two shapes and therefore two undo steps,
// so removing one pin would take two taps — bad on a phone in gloves. One pin,
// one shape, one undo (A-29k).
export interface PinShape extends MarkupShapeBase {
  type: 'pin';
  /** Image coordinates — the same space as every other shape (§4.7a.1). */
  x: number;
  /** The pin's POINT: the centre of the circle. */
  y: number;
  // ---------------------------------------------------------------------
  // STORED, NEVER DERIVED FROM ARRAY POSITION (§4.10a.2, A-29e).
  //
  // Deriving from order would silently RENUMBER survivors after a delete, and
  // pin numbers are quoted outside this app — a daily log reading "cracked
  // sill at pin 3" would start pointing at a different mark. Stored numbers
  // are stable for the life of the photo.
  //
  // The accepted price: the sequence has GAPS after a delete and they are
  // never reclaimed. A photo may show 1, 3, 7. That is correct, not a defect,
  // and no "tidy up" renumber is offered. Next number is `max + 1` — see
  // nextPinNumber() in ../utils/markup.
  // ---------------------------------------------------------------------
  number: number;
}

// NOTE: `circle` remains in the union and no M-10 tool exposes it. That is
// spare capacity, not an omission — §4.10 says outright: do not add a Circle
// tool to "use it up".
export type MarkupShape =
  | ArrowShape
  | CircleShape
  | RectangleShape
  | PenShape
  | TextShape
  | PinShape;

export interface MarkupData {
  version: number;
  // Natural dimensions of the underlying image. Shapes are stored in image
  // coordinates so markup renders correctly regardless of display size.
  imageWidth: number;
  imageHeight: number;
  shapes: MarkupShape[];
}

export function createEmptyMarkup(imageWidth: number, imageHeight: number): MarkupData {
  return {
    version: MARKUP_SCHEMA_VERSION,
    imageWidth,
    imageHeight,
    shapes: [],
  };
}
