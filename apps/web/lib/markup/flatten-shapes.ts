import type { MarkupData, MarkupShape } from '@framefocus/shared/types/markup';
import { PIN_IMAGE_DIAMETER } from '@framefocus/shared/utils/markup';

// M6M §4.10 — DRAWING THE MARKS ONTO A 2D CANVAS, for the flattened derivative.
//
// ---------------------------------------------------------------------------
// ⚠️ ONE RASTERISER, BOTH SURFACES — TECH_DEBT #129 [S122]
// ---------------------------------------------------------------------------
// This lived under `app/m/p/[projectId]/photos/[fileId]/markup/` while mobile
// was the only editor that produced a derivative. It is in `lib/` now because
// the DESKTOP editor writes the same derivative through the same function
// (#129, D-31 upheld). Its location used to imply mobile owned the flattened
// format; it does not, and a second copy under /dashboard would have been the
// drift this file's own note warns about.
//
// ---------------------------------------------------------------------------
// WHY THIS EXISTS SEPARATELY FROM MarkupViewer, AND WHAT KEEPS THEM HONEST.
// ---------------------------------------------------------------------------
// The authoring canvas draws SVG; the derivative is produced by a 2D canvas
// export. Those are two different rasterisers and there is no way to have one
// implementation serve both. That is a real drift risk, so it is bounded rather
// than ignored:
//
//   · Both draw in the SAME COORDINATE SPACE — the image's natural pixels
//     (§4.7a.1) — so a shape's geometry is identical by construction. The
//     canvas is sized to imageWidth × imageHeight and nothing is transformed.
//   · NO STROKE FLOOR IS APPLIED HERE. The floor is a rendering accommodation
//     for a shape drawn small on screen (§4.7a.3, A-23o); the derivative is
//     rasterised at FULL image size, where the authored width is already
//     correct. Applying it would fatten every stroke in the saved artifact.
//   · The pin uses the same PIN_IMAGE_DIAMETER constant the SVG renderer does,
//     imported rather than retyped.
//
// Unknown shape types are skipped, exactly as every other reader does
// (§4.10a.4, A-29b) — a payload from a future schema flattens the shapes this
// build understands rather than throwing away the save.

export function drawShapes(ctx: CanvasRenderingContext2D, markup: MarkupData): void {
  for (const shape of markup.shapes) {
    drawShape(ctx, shape);
  }
}

function drawShape(ctx: CanvasRenderingContext2D, shape: MarkupShape): void {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  switch (shape.type) {
    case 'arrow': {
      ctx.strokeStyle = shape.color;
      ctx.fillStyle = shape.color;
      ctx.lineWidth = shape.strokeWidth;
      ctx.beginPath();
      ctx.moveTo(shape.x1, shape.y1);
      ctx.lineTo(shape.x2, shape.y2);
      ctx.stroke();

      // Head geometry copied from MarkupViewer's ArrowMark so the flattened
      // arrow matches the one the author saw.
      const headLength = Math.max(shape.strokeWidth * 4, 10);
      const angle = Math.atan2(shape.y2 - shape.y1, shape.x2 - shape.x1);
      const headAngle = Math.PI / 7;
      ctx.beginPath();
      ctx.moveTo(shape.x2, shape.y2);
      ctx.lineTo(
        shape.x2 - headLength * Math.cos(angle - headAngle),
        shape.y2 - headLength * Math.sin(angle - headAngle)
      );
      ctx.lineTo(
        shape.x2 - headLength * Math.cos(angle + headAngle),
        shape.y2 - headLength * Math.sin(angle + headAngle)
      );
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'circle': {
      ctx.strokeStyle = shape.color;
      ctx.lineWidth = shape.strokeWidth;
      ctx.beginPath();
      ctx.ellipse(shape.cx, shape.cy, shape.rx, shape.ry, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'rectangle': {
      ctx.strokeStyle = shape.color;
      ctx.lineWidth = shape.strokeWidth;
      ctx.strokeRect(shape.x, shape.y, shape.width, shape.height);
      break;
    }
    case 'pen': {
      if (shape.points.length === 0) break;
      ctx.strokeStyle = shape.color;
      ctx.lineWidth = shape.strokeWidth;
      ctx.beginPath();
      ctx.moveTo(shape.points[0].x, shape.points[0].y);
      for (const p of shape.points.slice(1)) ctx.lineTo(p.x, p.y);
      ctx.stroke();
      break;
    }
    case 'text': {
      ctx.fillStyle = shape.color;
      ctx.font = `${shape.fontSize}px sans-serif`;
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(shape.content, shape.x, shape.y);
      break;
    }
    case 'pin': {
      const r = PIN_IMAGE_DIAMETER / 2;
      ctx.fillStyle = shape.color;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(shape.x, shape.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = `700 ${PIN_IMAGE_DIAMETER * 0.55}px ui-monospace, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(shape.number), shape.x, shape.y);
      break;
    }
    default:
      // Skipped, never thrown on — §4.10a.4.
      break;
  }

  ctx.restore();
}
