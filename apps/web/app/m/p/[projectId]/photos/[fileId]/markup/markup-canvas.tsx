'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MarkupShapes } from '@framefocus/shared/components/MarkupViewer';
import type { MarkupShape } from '@framefocus/shared/types/markup';
import { nextPinNumber } from '@framefocus/shared/utils/markup';
import { saveMarkup, type MarkupSaveResult } from '@/lib/services/photos-client';
import { drawShapes } from './flatten-shapes';

// M6M §4.10 — M-10 · Photo markup. Dark chrome #0d1220, inset 14px.
//
// ---------------------------------------------------------------------------
// THIS IS THE ONE SURFACE THAT STILL DRAWS SHAPES LIVE.
// ---------------------------------------------------------------------------
// D-31 took the overlay off the DISPLAY path — M-8 and M-9 render a flat file.
// The authoring canvas is different by necessity: you cannot place a mark on an
// image you are not drawing marks on. So §4.7a.1–.4, which the spec keeps "as
// authoring rules, not display rules", apply here in full:
//
//   A-23m  the image and the shape layer are ONE SVG sharing ONE viewBox, so a
//          mark stays registered to an image feature at EVERY canvas size. An
//          <img object-fit:cover> plus a separately positioned SVG drifts at
//          every size that is not the authoring size, because the two are then
//          cropped by different rules.
//   A-23n  `meet`, NEVER `slice` — authoring must show the whole image or a
//          mark cannot be placed in the region that got cropped away.
//
// Shapes render through the SHARED MarkupShapes component, not a local copy, so
// the skip-unknown-types rule (A-29b) and the pin's rendering are the same code
// the rest of the platform uses.

type Tool = 'pen' | 'arrow' | 'rectangle' | 'text' | 'pin';

/** §4.10's five swatches; red is selected by default. */
const COLORS = ['#f2453d', '#ffd400', '#3ecf6a', '#4f8ff7', '#ffffff'];

const TOOLS: { id: Tool; label: string }[] = [
  { id: 'pen', label: 'Draw' },
  { id: 'arrow', label: 'Arrow' },
  { id: 'rectangle', label: 'Box' },
  { id: 'text', label: 'Text' },
  { id: 'pin', label: 'Pin' },
];

const MIN_STROKE = 6;
const MAX_STROKE = 60;

export function MarkupCanvas({
  fileId,
  filePath,
  fileName,
  originalUrl,
  initialShapes,
  imageDims,
  returnHref,
}: {
  fileId: string;
  filePath: string;
  fileName: string;
  /** ALWAYS the original — never the derivative (A-23c). */
  originalUrl: string;
  initialShapes: MarkupShape[];
  imageDims: { w: number; h: number };
  /** A-24d — where Cancel/Done return to, carrying the originating record. */
  returnHref: string;
}) {
  const router = useRouter();
  const svgRef = useRef<SVGSVGElement | null>(null);

  // -------------------------------------------------------------------------
  // SHAPES AND THE REDO STACK ARE ONE PIECE OF STATE, AND THAT IS NOT TIDINESS.
  //
  // The obvious shape — two useStates, with undo calling setRedo INSIDE a
  // setShapes updater — is a side effect inside a reducer. React may invoke an
  // updater more than once (it does in dev StrictMode), so the nested setState
  // runs twice and ONE redo tap restores TWO marks. The bug is invisible in
  // production builds and corrupts the user's drawing in development, which is
  // the worst of both.
  //
  // One updater, pure, idempotent under double invocation.
  // -------------------------------------------------------------------------
  const [history, setHistory] = useState<{ shapes: MarkupShape[]; redo: MarkupShape[] }>({
    shapes: initialShapes,
    redo: [],
  });
  const shapes = history.shapes;
  const redo = history.redo;
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState(COLORS[0]);
  const [strokeWidth, setStrokeWidth] = useState(20);
  const [draft, setDraft] = useState<MarkupShape | null>(null);
  // ---------------------------------------------------------------------
  // TAP-VS-DRAG IS MEASURED IN SCREEN PIXELS, NOT IMAGE UNITS.
  //
  // The obvious guard — "discard a box narrower than 2 image units" — is wrong,
  // and wrong in a way that only shows up on small images: the viewBox maps the
  // whole image across the canvas, so on an 8px-wide photo one image unit is
  // ~47 screen px and a deliberate 60px drag measures 1.3 units. Every box and
  // arrow would be silently discarded. The user's INTENT is a property of how
  // far their finger moved, which is device space.
  // ---------------------------------------------------------------------
  const pressStart = useRef<{ x: number; y: number } | null>(null);
  const DRAG_THRESHOLD_PX = 6;

  // ---------------------------------------------------------------------
  // THE DRAFT IS MIRRORED IN A REF, AND THE REF IS WHAT ENDS A DRAG.
  //
  // `onPointerLeave` and `onPointerUp` are the same handler, because a drag
  // that exits the canvas still has to finish. But both read `draft` from the
  // render closure, so a drag ending just outside the edge fires BOTH in one
  // batch, both see the same non-null draft, and the mark is committed TWICE —
  // two identical shapes, and two Undo taps to remove what the user drew once.
  // The ref is cleared synchronously by whichever fires first, so the second is
  // a no-op.
  // ---------------------------------------------------------------------
  const draftRef = useRef<MarkupShape | null>(null);
  const setDraftBoth = useCallback((s: MarkupShape | null) => {
    draftRef.current = s;
    setDraft(s);
  }, []);
  const [textAt, setTextAt] = useState<{ x: number; y: number } | null>(null);
  const [textValue, setTextValue] = useState('');
  const [dirty, setDirty] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveNote, setSaveNote] = useState<string | null>(null);

  // Pointer events -> IMAGE COORDINATES, through the SVG's own viewBox
  // transform. Works regardless of the CSS-applied display size, which is what
  // lets the same stored coordinates render at any canvas size.
  const toImage = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const local = pt.matrixTransform(ctm.inverse());
    return { x: local.x, y: local.y };
  }, []);

  /** Every commit goes through here — ONE mark, ONE history entry (A-24b, A-29k). */
  const commit = useCallback((shape: MarkupShape) => {
    // A new mark invalidates the redo stack, in the same atomic update.
    setHistory((h) => ({ shapes: [...h.shapes, shape], redo: [] }));
    setDirty(true);
  }, []);

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    const p = toImage(e.clientX, e.clientY);
    if (!p) return;
    pressStart.current = { x: e.clientX, y: e.clientY };
    const id = crypto.randomUUID();

    if (tool === 'pin') {
      // ------------------------------------------------------------------
      // §4.10a.2 — `max + 1`, NEVER `count + 1`.
      //
      // ONE pin is ONE shape, so it is ONE undo step (A-29k). Composing it
      // from a circle plus a text mark would make removing one pin take two
      // undos — the reason D-22 made it a shape type.
      // ------------------------------------------------------------------
      commit({ id, type: 'pin', x: p.x, y: p.y, color, number: nextPinNumber(shapes) });
      return;
    }

    if (tool === 'text') {
      setTextAt(p);
      setTextValue('');
      return;
    }

    if (tool === 'pen') {
      setDraftBoth({ id, type: 'pen', points: [p], color, strokeWidth });
      return;
    }
    if (tool === 'arrow') {
      setDraftBoth({ id, type: 'arrow', x1: p.x, y1: p.y, x2: p.x, y2: p.y, color, strokeWidth });
      return;
    }
    if (tool === 'rectangle') {
      setDraftBoth({ id, type: 'rectangle', x: p.x, y: p.y, width: 0, height: 0, color, strokeWidth });
    }
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const cur = draftRef.current;
    if (!cur) return;
    const p = toImage(e.clientX, e.clientY);
    if (!p) return;

    let updated = cur;
    if (cur.type === 'pen') updated = { ...cur, points: [...cur.points, p] };
    else if (cur.type === 'arrow') updated = { ...cur, x2: p.x, y2: p.y };
    else if (cur.type === 'rectangle') {
      updated = { ...cur, width: p.x - cur.x, height: p.y - cur.y };
    }
    setDraftBoth(updated);
  }

  function onPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    const start = pressStart.current;
    pressStart.current = null;

    // Read AND clear synchronously — whichever of pointerup/pointerleave gets
    // here first owns the commit; the other finds null and returns.
    const pending = draftRef.current;
    draftRef.current = null;
    if (!pending) return;

    // A tap with a drag tool commits nothing — measured in SCREEN px, so the
    // rule holds identically on an 8px thumbnail and a 4000px photo.
    if (start) {
      const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y);
      if (moved < DRAG_THRESHOLD_PX) {
        setDraftBoth(null);
        return;
      }
    }

    // Normalise a rectangle dragged up/left so width/height are never negative.
    let shape = pending;
    if (shape.type === 'rectangle') {
      shape = {
        ...shape,
        x: shape.width < 0 ? shape.x + shape.width : shape.x,
        y: shape.height < 0 ? shape.y + shape.height : shape.y,
        width: Math.abs(shape.width),
        height: Math.abs(shape.height),
      };
    }
    if (shape.type === 'pen' && shape.points.length < 2) {
      setDraftBoth(null);
      return;
    }
    setDraftBoth(null);
    commit(shape);
  }

  function undo() {
    setHistory((h) =>
      h.shapes.length === 0
        ? h
        : {
            shapes: h.shapes.slice(0, -1),
            redo: [...h.redo, h.shapes[h.shapes.length - 1]],
          }
    );
    setDirty(true);
  }

  function redoLast() {
    setHistory((h) =>
      h.redo.length === 0
        ? h
        : {
            shapes: [...h.shapes, h.redo[h.redo.length - 1]],
            redo: h.redo.slice(0, -1),
          }
    );
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    setSaveNote(null);

    const result: MarkupSaveResult = await saveMarkup(
      fileId,
      filePath,
      originalUrl,
      shapes,
      imageDims,
      drawShapes
    );

    setSaving(false);

    if (result.status === 'saved') {
      setDirty(false);
      // A-23i / A-23k — all three surfaces flip to the (re)generated derivative
      // WITHOUT A RELOAD. router.refresh() re-runs the server components, which
      // re-sign the derivative URL; push then lands on a viewer already showing
      // the new bytes.
      router.refresh();
      router.push(returnHref);
      return;
    }

    // A-23j — A DERIVATIVE FAILURE IS NOT PLAIN SUCCESS. The marks are safe in
    // markup_data, but every surface would show this photo UNMARKED, so the
    // user is told and is NOT navigated away as though it worked.
    setSaveNote(
      result.status === 'derivative_failed'
        ? `Marks saved, but the marked-up image could not be generated — the photo will show unmarked until you save again. (${result.error})`
        : `Save failed — nothing was written. (${result.error})`
    );
  }

  function cancel() {
    // A-24c — confirm ONLY when there are unsaved marks; with none, exit
    // directly. A confirmation on an untouched screen trains people to dismiss
    // the dialog without reading it, which is how real work gets discarded.
    if (dirty) {
      setConfirmCancel(true);
      return;
    }
    router.push(returnHref);
  }

  const visible = draft ? [...shapes, draft] : shapes;

  return (
    <div className="flex min-h-full flex-col bg-m6m-canvas px-[14px] pb-[14px] text-white">
      {/* ---------------------------------------------------------------- */}
      {/* §4.10 HEADER — Cancel · "Markup" + filename · Save                */}
      {/* ---------------------------------------------------------------- */}
      <header className="flex items-center gap-[10px] pt-[10px]">
        <button
          type="button"
          data-testid="m-markup-cancel"
          onClick={cancel}
          className="flex min-h-[44px] min-w-[44px] items-center text-[15px] font-semibold"
          style={{ color: '#8fa0c4' }}
        >
          Cancel
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p className="text-[15px] font-bold leading-tight">Markup</p>
          <p className="truncate font-mono text-[11px] text-m6m-muted-navy">{fileName}</p>
        </div>
        <button
          type="button"
          data-testid="m-markup-save"
          onClick={save}
          disabled={saving}
          // min-w-44 as well as min-h-44: "Save" is a narrow word and A-5's
          // floor is on the SMALLEST dimension, not just the height.
          className="flex min-h-[44px] min-w-[44px] items-center justify-end text-[15px] font-bold disabled:opacity-60"
          style={{ color: '#f59e0b' }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </header>

      {/* ---------------------------------------------------------------- */}
      {/* THE CANVAS — one SVG, one viewBox, `meet` (A-23m, A-23n)          */}
      {/* ---------------------------------------------------------------- */}
      <div
        data-testid="m-markup-canvas"
        className="mt-[10px] flex-1 overflow-hidden rounded-[14px] bg-black"
      >
        <svg
          ref={svgRef}
          data-testid="m-markup-svg"
          viewBox={`0 0 ${imageDims.w} ${imageDims.h}`}
          preserveAspectRatio="xMidYMid meet"
          xmlns="http://www.w3.org/2000/svg"
          className="h-full w-full touch-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        >
          {/* The image is INSIDE the same SVG and in the same coordinate space
              as the shapes. This is the mechanism, not a detail. */}
          <image href={originalUrl} x={0} y={0} width={imageDims.w} height={imageDims.h} />
          <MarkupShapes shapes={visible} />
        </svg>
      </div>

      {textAt ? (
        <div className="mt-[10px] flex items-center gap-[8px]">
          <input
            autoFocus
            data-testid="m-text-input"
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
            placeholder="Callout text"
            className="h-11 flex-1 rounded-[10px] border border-white/20 bg-[#161d2f] px-[12px] text-[15px] text-white placeholder:text-m6m-muted-navy"
          />
          <button
            type="button"
            data-testid="m-text-commit"
            onClick={() => {
              if (textValue.trim()) {
                commit({
                  id: crypto.randomUUID(),
                  type: 'text',
                  x: textAt.x,
                  y: textAt.y,
                  content: textValue.trim(),
                  color,
                  // Callout size scales with the stroke slider so one control
                  // governs "how big is the mark" across every tool.
                  fontSize: strokeWidth * 3,
                });
              }
              setTextAt(null);
            }}
            className="flex h-11 items-center rounded-[10px] border border-white/20 px-[14px] text-[14px] font-semibold"
          >
            Add
          </button>
        </div>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      {/* §4.10 5-TOOL ROW — 62px tiles                                     */}
      {/* ---------------------------------------------------------------- */}
      <div data-testid="m-tool-row" className="mt-[12px] grid grid-cols-5 gap-[7px]">
        {TOOLS.map((t) => {
          const on = tool === t.id;
          return (
            <button
              key={t.id}
              type="button"
              data-testid={`m-tool-${t.id}`}
              data-active={on ? 'true' : 'false'}
              aria-pressed={on}
              onClick={() => setTool(t.id)}
              // A-24 — ACTIVE STATE CARRIES A BORDER AND A LABEL COLOUR CHANGE,
              // never tint alone. The border is the colour-independent signal;
              // a build that only swaps the fill fails, because tint alone is
              // exactly what the handoff's accessibility rule forbids.
              className={`flex h-[62px] flex-col items-center justify-center gap-[4px] rounded-[12px] text-[11px] font-semibold ${
                on ? 'border-[1.5px]' : 'border border-white/10'
              }`}
              style={
                on
                  ? {
                      backgroundColor: 'rgba(242,69,61,.18)',
                      borderColor: '#f2453d',
                      color: '#f2453d',
                    }
                  : { backgroundColor: 'rgba(255,255,255,.06)', color: '#8fa0c4' }
              }
            >
              <ToolGlyph tool={t.id} />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* §4.10 CONTROLS ROW — 34px swatches + stroke slider                */}
      {/* ---------------------------------------------------------------- */}
      <div className="mt-[12px] flex items-center gap-[12px]">
        <div data-testid="m-swatches" className="flex items-center gap-[8px]">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              data-testid={`m-swatch-${c.replace('#', '')}`}
              data-active={color === c ? 'true' : 'false'}
              aria-label={`Colour ${c}`}
              onClick={() => setColor(c)}
              // 34px, 8px apart — §2's ONLY permitted sub-44px target, and A-5
              // exempts exactly this control and nothing else.
              className="h-[34px] w-[34px] shrink-0 rounded-full"
              style={{
                backgroundColor: c,
                boxShadow: color === c ? '0 0 0 2.5px #ffffff' : 'none',
              }}
            />
          ))}
        </div>
        <input
          type="range"
          data-testid="m-stroke-slider"
          aria-label="Stroke width"
          min={MIN_STROKE}
          max={MAX_STROKE}
          value={strokeWidth}
          onChange={(e) => setStrokeWidth(Number(e.target.value))}
          className="h-11 min-w-[56px] flex-1"
        />
      </div>

      {saveNote ? (
        <p
          data-testid="m-save-note"
          role="alert"
          className="mt-[10px] rounded-[10px] px-[10px] py-[8px] text-[13px] text-[#f0908a]"
          style={{ backgroundColor: 'rgba(192,54,44,.16)' }}
        >
          {saveNote}
        </p>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      {/* §3.2 — ON M-10 THE TAB BAR IS REPLACED BY THIS ROW (A-1b).        */}
      {/* Undo · Redo · Done, Done amber at flex:1.2 so it reads as primary. */}
      {/* ---------------------------------------------------------------- */}
      <div
        data-testid="m-markup-actions"
        className="mt-[12px] flex gap-[8px]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <button
          type="button"
          data-testid="m-undo"
          onClick={undo}
          disabled={shapes.length === 0}
          className="flex h-[56px] flex-1 items-center justify-center rounded-[12px] border border-white/15 text-[15px] font-semibold text-white disabled:opacity-40"
        >
          Undo
        </button>
        <button
          type="button"
          data-testid="m-redo"
          onClick={redoLast}
          disabled={redo.length === 0}
          // A-24b — Redo renders DIMMED when the redo stack is empty.
          className="flex h-[56px] flex-1 items-center justify-center rounded-[12px] border border-white/15 text-[15px] font-semibold text-white disabled:opacity-40"
        >
          Redo
        </button>
        <button
          type="button"
          data-testid="m-done"
          onClick={save}
          disabled={saving}
          className="flex h-[56px] items-center justify-center rounded-[12px] text-[15px] font-bold text-m6m-navy disabled:opacity-60"
          style={{ flex: 1.2, backgroundColor: '#f59e0b' }}
        >
          Done
        </button>
      </div>

      {confirmCancel ? (
        <div
          data-testid="m-cancel-confirm"
          role="dialog"
          aria-label="Discard marks"
          className="fixed inset-x-[14px] bottom-[14px] z-50 rounded-[14px] border border-white/15 bg-[#161d2f] p-[14px]"
        >
          <p className="text-[15px] font-semibold text-white">Discard unsaved marks?</p>
          <div className="mt-[10px] flex gap-[8px]">
            <button
              type="button"
              data-testid="m-cancel-discard"
              onClick={() => router.push(returnHref)}
              className="flex min-h-[44px] flex-1 items-center justify-center rounded-[12px] bg-m6m-danger text-[15px] font-bold text-white"
            >
              Discard
            </button>
            <button
              type="button"
              data-testid="m-cancel-keep"
              onClick={() => setConfirmCancel(false)}
              className="flex min-h-[44px] flex-1 items-center justify-center rounded-[12px] border border-white/25 text-[15px] font-semibold text-white"
            >
              Keep editing
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ToolGlyph({ tool }: { tool: Tool }) {
  const common = {
    width: 20,
    height: 20,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  switch (tool) {
    case 'pen':
      return (
        <svg {...common}>
          <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
      );
    case 'arrow':
      return (
        <svg {...common}>
          <path d="M5 19 19 5M19 5h-7M19 5v7" />
        </svg>
      );
    case 'rectangle':
      return (
        <svg {...common}>
          <rect x="4" y="6" width="16" height="12" rx="1" />
        </svg>
      );
    case 'text':
      return (
        <svg {...common}>
          <path d="M5 6h14M12 6v13M9 19h6" />
        </svg>
      );
    case 'pin':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="7" />
          <path d="M12 9v6" />
        </svg>
      );
  }
}
