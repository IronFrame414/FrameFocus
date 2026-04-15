'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  createEmptyMarkup,
  type MarkupData,
  type MarkupShape,
} from '@framefocus/shared/types/markup';
import { updateFile } from '@/lib/services/files-client';

type Tool = 'arrow' | 'circle' | 'rectangle' | 'pen' | 'text' | 'select';

const COLORS = [
  '#ffffff', // white
  '#000000', // black
  '#01cefd', // cyan
  '#08da45', // green
  '#e9f300', // yellow
  '#fcb800', // orange
  '#ff1489', // pink
  '#ff2517', // red
  '#cf22d6', // purple
];
const STROKE_WIDTHS = [10, 20, 30, 50];

interface MarkupEditorProps {
  fileId: string;
  imageUrl: string;
  initialMarkup: MarkupData | null;
}

export default function MarkupEditor({ fileId, imageUrl, initialMarkup }: MarkupEditorProps) {
  const router = useRouter();
  const svgRef = React.useRef<SVGSVGElement | null>(null);

  // Image natural dimensions — needed before we can render the SVG canvas.
  // Loaded from initialMarkup if present, else measured from the <img> onLoad.
  const [imageDims, setImageDims] = React.useState<{ w: number; h: number } | null>(
    initialMarkup ? { w: initialMarkup.imageWidth, h: initialMarkup.imageHeight } : null
  );

  const [shapes, setShapes] = React.useState<MarkupShape[]>(initialMarkup?.shapes ?? []);
  const [tool, setTool] = React.useState<Tool>('arrow');
  const [color, setColor] = React.useState<string>(COLORS[0]);
  const [strokeWidth, setStrokeWidth] = React.useState<number>(20);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  // In-progress shape during a drag. Committed to `shapes` on pointer up.
  const [drafting, setDrafting] = React.useState<MarkupShape | null>(null);

  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [dirty, setDirty] = React.useState(false);

  // Convert a pointer event in screen coords to image coords using the SVG's
  // own viewBox transform. Works regardless of CSS-applied display size.
  const toImageCoords = React.useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const local = pt.matrixTransform(ctm.inverse());
    return { x: local.x, y: local.y };
  }, []);

  function handlePointerDown(e: React.PointerEvent<SVGSVGElement>) {
    if (!imageDims) return;
    const pos = toImageCoords(e);
    if (!pos) return;

    if (tool === 'select') {
      // Click on empty space deselects. Click on a shape is handled by the
      // shape's own onPointerDown (stops propagation).
      setSelectedId(null);
      return;
    }

    // Capture pointer so we keep getting move/up events even outside the SVG.
    e.currentTarget.setPointerCapture(e.pointerId);

    const id = crypto.randomUUID();

    if (tool === 'text') {
      const content = window.prompt('Text:');
      if (!content) return;
      const newShape: MarkupShape = {
        id,
        type: 'text',
        color,
        x: pos.x,
        y: pos.y,
        content,
        // Scale font with image — 6% of the image's smaller dimension for visibility.
        fontSize: Math.max(24, Math.round(Math.min(imageDims.w, imageDims.h) * 0.06)),
      };
      setShapes((prev) => [...prev, newShape]);
      setDirty(true);
      return;
    }

    let draft: MarkupShape;
    switch (tool) {
      case 'arrow':
        draft = {
          id,
          type: 'arrow',
          color,
          strokeWidth,
          x1: pos.x,
          y1: pos.y,
          x2: pos.x,
          y2: pos.y,
        };
        break;
      case 'circle':
        draft = { id, type: 'circle', color, strokeWidth, cx: pos.x, cy: pos.y, rx: 0, ry: 0 };
        break;
      case 'rectangle':
        draft = {
          id,
          type: 'rectangle',
          color,
          strokeWidth,
          x: pos.x,
          y: pos.y,
          width: 0,
          height: 0,
        };
        break;
      case 'pen':
        draft = { id, type: 'pen', color, strokeWidth, points: [{ x: pos.x, y: pos.y }] };
        break;
      default:
        return;
    }
    setDrafting(draft);
  }

  function handlePointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!drafting) return;
    const pos = toImageCoords(e);
    if (!pos) return;

    setDrafting((prev) => {
      if (!prev) return prev;
      switch (prev.type) {
        case 'arrow':
          return { ...prev, x2: pos.x, y2: pos.y };
        case 'circle': {
          // cx/cy stay at the click origin; rx/ry grow with drag distance.
          const rx = Math.abs(pos.x - prev.cx);
          const ry = Math.abs(pos.y - prev.cy);
          return { ...prev, rx, ry };
        }
        case 'rectangle': {
          // Allow dragging in any direction — normalize so width/height stay positive.
          const x = Math.min(prev.x, pos.x);
          const y = Math.min(prev.y, pos.y);
          const width = Math.abs(pos.x - prev.x);
          const height = Math.abs(pos.y - prev.y);
          return { ...prev, x, y, width, height };
        }
        case 'pen':
          return { ...prev, points: [...prev.points, pos] };
        default:
          return prev;
      }
    });
  }

  function handlePointerUp(e: React.PointerEvent<SVGSVGElement>) {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (!drafting) return;

    // Discard zero-size shapes (a click without drag).
    let keep = true;
    if (drafting.type === 'arrow') {
      keep = drafting.x1 !== drafting.x2 || drafting.y1 !== drafting.y2;
    } else if (drafting.type === 'circle') {
      keep = drafting.rx > 1 && drafting.ry > 1;
    } else if (drafting.type === 'rectangle') {
      keep = drafting.width > 1 && drafting.height > 1;
    } else if (drafting.type === 'pen') {
      keep = drafting.points.length > 1;
    }

    if (keep) {
      setShapes((prev) => [...prev, drafting]);
      setDirty(true);
    }
    setDrafting(null);
  }

  function handleUndo() {
    setShapes((prev) => {
      if (prev.length === 0) return prev;
      setDirty(true);
      return prev.slice(0, -1);
    });
    setSelectedId(null);
  }

  function handleDeleteSelected() {
    if (!selectedId) return;
    setShapes((prev) => prev.filter((s) => s.id !== selectedId));
    setSelectedId(null);
    setDirty(true);
  }

  // Keyboard shortcut: Delete/Backspace removes selected shape.
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedId) {
          // Don't hijack typing in inputs.
          const tag = (e.target as HTMLElement | null)?.tagName;
          if (tag === 'INPUT' || tag === 'TEXTAREA') return;
          e.preventDefault();
          handleDeleteSelected();
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  async function handleSave() {
    if (!imageDims) return;
    setSaving(true);
    setSaveError(null);

    const data: MarkupData = {
      ...createEmptyMarkup(imageDims.w, imageDims.h),
      shapes,
    };

    const result = await updateFile(fileId, {
      // updateFile types markup_data as Record<string, unknown> | null —
      // MarkupData is a structurally compatible plain object.
      markup_data: data as unknown as Record<string, unknown>,
    });

    setSaving(false);
    if (!result.success) {
      setSaveError(result.error ?? 'Save failed');
      return;
    }
    setDirty(false);
    router.refresh();
  }

  // Image not yet measured — render the <img> off-screen to get natural dimensions,
  // then re-render with the SVG canvas.
  if (!imageDims) {
    return (
      <div>
        <p style={{ color: '#666', marginBottom: '1rem' }}>Loading image...</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt=""
          style={{ display: 'none' }}
          ref={(img) => {
            // If the image is already loaded by the time React attaches this ref
            // (cached or fast loads), onLoad won't fire — read dimensions directly.
            if (img && img.complete && img.naturalWidth > 0) {
              setImageDims({ w: img.naturalWidth, h: img.naturalHeight });
            }
          }}
          onLoad={(e) => {
            const img = e.currentTarget;
            setImageDims({ w: img.naturalWidth, h: img.naturalHeight });
          }}
        />
      </div>
    );
  }

  const shapesToRender: MarkupShape[] = drafting ? [...shapes, drafting] : shapes;

  return (
    <div>
      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.75rem',
          alignItems: 'center',
          padding: '0.75rem',
          marginBottom: '0.75rem',
          background: '#f5f5f5',
          borderRadius: '6px',
        }}
      >
        <ToolGroup label="Tool">
          {(['select', 'arrow', 'circle', 'rectangle', 'pen', 'text'] as Tool[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setTool(t);
                if (t !== 'select') setSelectedId(null);
              }}
              style={toolButtonStyle(tool === t)}
            >
              {t}
            </button>
          ))}
        </ToolGroup>

        <ToolGroup label="Color">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-label={`Color ${c}`}
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: c,
                border: color === c ? '3px solid #000' : '1px solid #999',
                cursor: 'pointer',
              }}
            />
          ))}
        </ToolGroup>

        <ToolGroup label="Stroke">
          {STROKE_WIDTHS.map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setStrokeWidth(w)}
              style={toolButtonStyle(strokeWidth === w)}
            >
              {w}
            </button>
          ))}
        </ToolGroup>

        <div style={{ display: 'flex', gap: '0.5rem', marginLeft: 'auto' }}>
          <button
            type="button"
            onClick={handleUndo}
            disabled={shapes.length === 0}
            style={actionBtn}
          >
            Undo
          </button>
          <button
            type="button"
            onClick={handleDeleteSelected}
            disabled={!selectedId}
            style={actionBtn}
          >
            Delete selected
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !dirty}
            style={{ ...actionBtn, background: '#000', color: '#fff', borderColor: '#000' }}
          >
            {saving ? 'Saving...' : dirty ? 'Save' : 'Saved'}
          </button>
        </div>
      </div>

      {saveError && <p style={{ color: '#a00', marginBottom: '0.5rem' }}>Error: {saveError}</p>}

      <div style={{ display: 'block', maxWidth: '100%', border: '1px solid #ddd' }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${imageDims.w} ${imageDims.h}`}
          xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="xMidYMid meet"
          style={{
            display: 'block',
            maxWidth: '100%',
            height: 'auto',
            cursor: tool === 'select' ? 'default' : 'crosshair',
            touchAction: 'none',
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <image href={imageUrl} x={0} y={0} width={imageDims.w} height={imageDims.h} />
          {shapesToRender.map((shape) => (
            <EditableShape
              key={shape.id}
              shape={shape}
              isSelected={shape.id === selectedId}
              selectable={tool === 'select'}
              onSelect={(id) => setSelectedId(id)}
            />
          ))}
        </svg>
      </div>
    </div>
  );
}

// --- Subcomponents ---

function ToolGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
      <span style={{ fontSize: '0.75rem', color: '#666', marginRight: '0.25rem' }}>{label}:</span>
      {children}
    </div>
  );
}

function toolButtonStyle(active: boolean): React.CSSProperties {
  return {
    padding: '0.25rem 0.6rem',
    fontSize: '0.8rem',
    background: active ? '#000' : '#fff',
    color: active ? '#fff' : '#000',
    border: '1px solid #999',
    borderRadius: '4px',
    cursor: 'pointer',
  };
}

const actionBtn: React.CSSProperties = {
  padding: '0.4rem 0.8rem',
  fontSize: '0.8rem',
  background: '#fff',
  border: '1px solid #999',
  borderRadius: '4px',
  cursor: 'pointer',
};

function EditableShape({
  shape,
  isSelected,
  selectable,
  onSelect,
}: {
  shape: MarkupShape;
  isSelected: boolean;
  selectable: boolean;
  onSelect: (id: string) => void;
}) {
  const handlePointerDown = (e: React.PointerEvent) => {
    if (!selectable) return;
    e.stopPropagation();
    onSelect(shape.id);
  };

  const highlight = isSelected ? <HighlightFor shape={shape} /> : null;
  const cursor = selectable ? 'pointer' : 'inherit';

  switch (shape.type) {
    case 'arrow': {
      const { x1, y1, x2, y2, color, strokeWidth } = shape;
      const headLength = Math.max(strokeWidth * 4, 10);
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const headAngle = Math.PI / 7;
      const hx1 = x2 - headLength * Math.cos(angle - headAngle);
      const hy1 = y2 - headLength * Math.sin(angle - headAngle);
      const hx2 = x2 - headLength * Math.cos(angle + headAngle);
      const hy2 = y2 - headLength * Math.sin(angle + headAngle);
      return (
        <g onPointerDown={handlePointerDown} style={{ cursor }}>
          {highlight}
          <line
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
          <polygon
            points={`${x2},${y2} ${hx1},${hy1} ${hx2},${hy2}`}
            fill={color}
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinejoin="round"
          />
        </g>
      );
    }
    case 'circle':
      return (
        <g onPointerDown={handlePointerDown} style={{ cursor }}>
          {highlight}
          <ellipse
            cx={shape.cx}
            cy={shape.cy}
            rx={shape.rx}
            ry={shape.ry}
            fill="none"
            stroke={shape.color}
            strokeWidth={shape.strokeWidth}
          />
        </g>
      );
    case 'rectangle':
      return (
        <g onPointerDown={handlePointerDown} style={{ cursor }}>
          {highlight}
          <rect
            x={shape.x}
            y={shape.y}
            width={shape.width}
            height={shape.height}
            fill="none"
            stroke={shape.color}
            strokeWidth={shape.strokeWidth}
          />
        </g>
      );
    case 'pen':
      return (
        <g onPointerDown={handlePointerDown} style={{ cursor }}>
          {highlight}
          <polyline
            points={shape.points.map((p) => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke={shape.color}
            strokeWidth={shape.strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      );
    case 'text':
      return (
        <g onPointerDown={handlePointerDown} style={{ cursor }}>
          {highlight}
          <text
            x={shape.x}
            y={shape.y}
            fill={shape.color}
            fontSize={shape.fontSize}
            fontFamily="sans-serif"
          >
            {shape.content}
          </text>
        </g>
      );
    default:
      return null;
  }
}

function HighlightFor({ shape }: { shape: MarkupShape }) {
  const halo = '#fde047';
  const haloOpacity = 0.5;
  switch (shape.type) {
    case 'arrow': {
      const pad = Math.max(shape.strokeWidth * 2, 8);
      const minX = Math.min(shape.x1, shape.x2) - pad;
      const minY = Math.min(shape.y1, shape.y2) - pad;
      const w = Math.abs(shape.x2 - shape.x1) + pad * 2;
      const h = Math.abs(shape.y2 - shape.y1) + pad * 2;
      return <rect x={minX} y={minY} width={w} height={h} fill={halo} opacity={haloOpacity} />;
    }
    case 'circle': {
      const pad = Math.max(shape.strokeWidth * 2, 6);
      return (
        <ellipse
          cx={shape.cx}
          cy={shape.cy}
          rx={shape.rx + pad}
          ry={shape.ry + pad}
          fill={halo}
          opacity={haloOpacity}
        />
      );
    }
    case 'rectangle': {
      const pad = Math.max(shape.strokeWidth * 2, 6);
      return (
        <rect
          x={shape.x - pad}
          y={shape.y - pad}
          width={shape.width + pad * 2}
          height={shape.height + pad * 2}
          fill={halo}
          opacity={haloOpacity}
        />
      );
    }
    case 'pen': {
      if (shape.points.length === 0) return null;
      const xs = shape.points.map((p) => p.x);
      const ys = shape.points.map((p) => p.y);
      const pad = Math.max(shape.strokeWidth * 2, 8);
      const minX = Math.min(...xs) - pad;
      const minY = Math.min(...ys) - pad;
      const w = Math.max(...xs) - Math.min(...xs) + pad * 2;
      const h = Math.max(...ys) - Math.min(...ys) + pad * 2;
      return <rect x={minX} y={minY} width={w} height={h} fill={halo} opacity={haloOpacity} />;
    }
    case 'text': {
      const approxW = shape.content.length * shape.fontSize * 0.6;
      const approxH = shape.fontSize * 1.2;
      const pad = 4;
      return (
        <rect
          x={shape.x - pad}
          y={shape.y - approxH + pad}
          width={approxW + pad * 2}
          height={approxH + pad * 2}
          fill={halo}
          opacity={haloOpacity}
        />
      );
    }
    default:
      return null;
  }
}
