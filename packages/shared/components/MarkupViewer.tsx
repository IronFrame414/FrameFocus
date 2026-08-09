// Read-only SVG renderer for markup data.
// Pure presentational component — no state, no events, no DOM-specific APIs.
// Uses plain SVG elements so it can be ported to React Native via
// react-native-svg (same element names and props) with minimal changes.
//
// ---------------------------------------------------------------------------
// M6M — WHAT THIS IS FOR AFTER D-31, AND WHAT IT IS NOT.
// ---------------------------------------------------------------------------
// D-31 [S99] reversed the display rule: THE ANNOTATED DERIVATIVE IS THE DISPLAY
// SOURCE. M-8's gallery tile, M-9's image stage and M-9's filmstrip therefore
// render a flat image file and draw NO overlay — this component is not on the
// display path.
//
// It is the AUTHORING renderer. §4.10's M-10 canvas still draws shapes live
// over the image being annotated, and there every rule in §4.7a.1–.4 still
// applies in full: one SVG, one viewBox (A-23m), `meet` so nothing is cropped
// away from the author (A-23n), the stroke floor (A-23o) and the pin's own
// minimum diameter (A-29j).
//
// Extended here, additively, per §4.10a.5: a `pin` case, an optional `fit`
// prop, and an optional `scale` for the floors. Nothing under
// apps/web/app/dashboard/** is touched (A-28); the desktop editor imports the
// TYPES from ../types/markup and has never imported this file.

import * as React from 'react';
import type { MarkupData, MarkupShape } from '../types/markup';
import { pinDiameter, strokeFloorWidth } from '../utils/markup';

/** §4.7a.2 — per-surface fit. `meet` never crops; `slice` fills and centre-crops. */
export type MarkupFit = 'xMidYMid meet' | 'xMidYMid slice';

interface MarkupViewerProps {
  imageUrl: string;
  markup: MarkupData | null;
  // Optional display width. If omitted, renders at natural image size.
  displayWidth?: number;
  /**
   * §4.7a.2. Defaults to the value this component already used, so adopting the
   * prop cannot change existing behaviour by surprise.
   */
  fit?: MarkupFit;
  /**
   * Rendered px per image px. Supplied only where the surface knows its own
   * size; without it the floors are inert and shapes render at authored weight.
   */
  scale?: number;
}

export function MarkupViewer({
  imageUrl,
  markup,
  displayWidth,
  fit = 'xMidYMid meet',
  scale,
}: MarkupViewerProps) {
  // If we have markup, use its stored image dimensions for the viewBox so
  // shapes render in their original image coordinates regardless of display size.
  const width = markup?.imageWidth ?? 0;
  const height = markup?.imageHeight ?? 0;
  const hasDimensions = width > 0 && height > 0;

  const style: React.CSSProperties = displayWidth
    ? { width: displayWidth, height: 'auto', display: 'block' }
    : { display: 'block', maxWidth: '100%', height: 'auto' };

  // No markup data yet — just show the image.
  if (!markup || !hasDimensions) {
    return <img src={imageUrl} alt="" style={style} />;
  }

  const effectiveScale = scale ?? (displayWidth ? displayWidth / width : undefined);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      xmlns="http://www.w3.org/2000/svg"
      style={style}
      preserveAspectRatio={fit}
    >
      {/* §4.7a.2 — THE IMAGE AND THE SHAPES SHARE ONE viewBox, in one SVG. Any
          scaling or cropping is applied to BOTH TOGETHER. An <img> with CSS
          object-fit plus a separate positioned SVG drifts at every size that is
          not the authoring size, because the two are then cropped by different
          rules. This structure is the mechanism, not a detail. */}
      <image href={imageUrl} x={0} y={0} width={width} height={height} />
      <MarkupShapes shapes={markup.shapes} scale={effectiveScale} />
    </svg>
  );
}

/**
 * The shape layer on its own, so a surface that owns its own <svg> — M-10's
 * authoring canvas, which needs pointer handlers and a draft shape — renders
 * marks through EXACTLY this code rather than a second copy that can drift.
 */
export function MarkupShapes({
  shapes,
  scale,
}: {
  shapes: readonly MarkupShape[];
  scale?: number;
}) {
  return (
    <>
      {shapes.map((shape) => (
        <ShapeRenderer key={shape.id} shape={shape} scale={scale} />
      ))}
    </>
  );
}

export function ShapeRenderer({ shape, scale }: { shape: MarkupShape; scale?: number }) {
  // The floor is applied here, once, so every caller inherits it. `scale`
  // undefined leaves the authored width untouched.
  const stroke = (w: number) => (scale === undefined ? w : strokeFloorWidth(w, scale));

  switch (shape.type) {
    case 'arrow':
      return <ArrowMark shape={shape} strokeWidth={stroke(shape.strokeWidth)} />;
    case 'circle':
      return (
        <ellipse
          cx={shape.cx}
          cy={shape.cy}
          rx={shape.rx}
          ry={shape.ry}
          fill="none"
          stroke={shape.color}
          strokeWidth={stroke(shape.strokeWidth)}
        />
      );
    case 'rectangle':
      return (
        <rect
          x={shape.x}
          y={shape.y}
          width={shape.width}
          height={shape.height}
          fill="none"
          stroke={shape.color}
          strokeWidth={stroke(shape.strokeWidth)}
        />
      );
    case 'pen':
      return (
        <polyline
          points={shape.points.map((p) => `${p.x},${p.y}`).join(' ')}
          fill="none"
          stroke={shape.color}
          strokeWidth={stroke(shape.strokeWidth)}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );
    case 'text':
      return (
        <text
          x={shape.x}
          y={shape.y}
          fill={shape.color}
          fontSize={shape.fontSize}
          fontFamily="sans-serif"
        >
          {shape.content}
        </text>
      );
    case 'pin':
      return <PinMark shape={shape} scale={scale} />;
    default:
      // Unknown shape types are SKIPPED, never thrown on (§4.10a.4, A-29b).
      // That is what lets a reader which predates a schema addition render
      // everything else and carry the unknown shape through untouched.
      //
      // ⚠️ CORRECTED [M6M §4.10a.5]: this previously claimed "TS will error here
      // if a new shape type is added to the union". IT WILL NOT — there is no
      // `never` binding behind this default, so the claim was inaccurate before
      // `pin` was added and would have misled anyone relying on it. Do NOT
      // "restore" it as an exhaustiveness check: A-29b requires the skip.
      return null;
  }
}

// M6M §4.10 / §4.10a.1 — "34px red circle, white 2px ring, mono numeral".
//
// The pin's appearance is a RENDER CONSTANT, not authored data — it carries no
// strokeWidth — so the stroke floor cannot apply to it and it gets its own
// minimum rendered diameter instead (A-29j). Without that it is the one mark
// type that silently collapses to an unreadable dot when scaled down.
function PinMark({
  shape,
  scale,
}: {
  shape: Extract<MarkupShape, { type: 'pin' }>;
  scale?: number;
}) {
  const diameter = scale === undefined ? 34 : pinDiameter(scale);
  const r = diameter / 2;
  const ring = diameter * (2 / 34); // the 2px ring, held in proportion
  return (
    <g>
      <circle
        cx={shape.x}
        cy={shape.y}
        r={r}
        fill={shape.color}
        stroke="#ffffff"
        strokeWidth={ring}
      />
      <text
        x={shape.x}
        y={shape.y}
        fill="#ffffff"
        fontSize={diameter * 0.55}
        fontFamily="ui-monospace, monospace"
        fontWeight={700}
        textAnchor="middle"
        dominantBaseline="central"
      >
        {shape.number}
      </text>
    </g>
  );
}

// Arrow is a line plus a small triangular head at (x2, y2).
function ArrowMark({
  shape,
  strokeWidth,
}: {
  shape: Extract<MarkupShape, { type: 'arrow' }>;
  strokeWidth: number;
}) {
  const { x1, y1, x2, y2, color } = shape;
  // Ornaments derived from strokeWidth scale WITH the floored width, so a
  // floored arrow keeps a visible head (§4.7a.3).
  const headLength = Math.max(strokeWidth * 4, 10);
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const headAngle = Math.PI / 7; // ~25deg
  const hx1 = x2 - headLength * Math.cos(angle - headAngle);
  const hy1 = y2 - headLength * Math.sin(angle - headAngle);
  const hx2 = x2 - headLength * Math.cos(angle + headAngle);
  const hy2 = y2 - headLength * Math.sin(angle + headAngle);

  return (
    <g
      stroke={color}
      strokeWidth={strokeWidth}
      fill={color}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1={x1} y1={y1} x2={x2} y2={y2} />
      <polygon points={`${x2},${y2} ${hx1},${hy1} ${hx2},${hy2}`} />
    </g>
  );
}
