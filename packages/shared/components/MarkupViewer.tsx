// Read-only SVG renderer for markup data.
// Pure presentational component — no state, no events, no DOM-specific APIs.
// Uses plain SVG elements so it can be ported to React Native via
// react-native-svg (same element names and props) with minimal changes.

import * as React from 'react';
import type { MarkupData, MarkupShape } from '../types/markup';

interface MarkupViewerProps {
  imageUrl: string;
  markup: MarkupData | null;
  // Optional display width. If omitted, renders at natural image size.
  displayWidth?: number;
}

export function MarkupViewer({ imageUrl, markup, displayWidth }: MarkupViewerProps) {
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

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      xmlns="http://www.w3.org/2000/svg"
      style={style}
      preserveAspectRatio="xMidYMid meet"
    >
      <image href={imageUrl} x={0} y={0} width={width} height={height} />
      {markup.shapes.map((shape) => (
        <ShapeRenderer key={shape.id} shape={shape} />
      ))}
    </svg>
  );
}

function ShapeRenderer({ shape }: { shape: MarkupShape }) {
  switch (shape.type) {
    case 'arrow':
      return <ArrowMark shape={shape} />;
    case 'circle':
      return (
        <ellipse
          cx={shape.cx}
          cy={shape.cy}
          rx={shape.rx}
          ry={shape.ry}
          fill="none"
          stroke={shape.color}
          strokeWidth={shape.strokeWidth}
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
          strokeWidth={shape.strokeWidth}
        />
      );
    case 'pen':
      return (
        <polyline
          points={shape.points.map((p) => `${p.x},${p.y}`).join(' ')}
          fill="none"
          stroke={shape.color}
          strokeWidth={shape.strokeWidth}
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
    default:
      // Exhaustiveness check — TS will error here if a new shape type
      // is added to the union without a case above.
      return null;
  }
}

// Arrow is a line plus a small triangular head at (x2, y2).
function ArrowMark({ shape }: { shape: Extract<MarkupShape, { type: 'arrow' }> }) {
  const { x1, y1, x2, y2, color, strokeWidth } = shape;
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
