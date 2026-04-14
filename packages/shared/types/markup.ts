// Markup JSON schema for photo annotations.
// Stored in files.markup_data (JSONB). Non-destructive — rendered as SVG overlay.
// Shape types are a discriminated union keyed by `type` for safe future extension.

export const MARKUP_SCHEMA_VERSION = 1;

export type MarkupColor = string; // hex, e.g. "#ef4444"

export interface MarkupShapeBase {
  id: string; // uuid, assigned at creation
  color: MarkupColor;
  strokeWidth: number;
}

export interface ArrowShape extends MarkupShapeBase {
  type: 'arrow';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface CircleShape extends MarkupShapeBase {
  type: 'circle';
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

export interface RectangleShape extends MarkupShapeBase {
  type: 'rectangle';
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PenShape extends MarkupShapeBase {
  type: 'pen';
  points: Array<{ x: number; y: number }>;
}

export interface TextShape extends MarkupShapeBase {
  type: 'text';
  x: number;
  y: number;
  content: string;
  fontSize: number;
}

export type MarkupShape = ArrowShape | CircleShape | RectangleShape | PenShape | TextShape;

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
