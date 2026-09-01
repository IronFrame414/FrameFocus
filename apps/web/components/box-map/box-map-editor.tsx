'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getFileSignedUrlClient } from '@/lib/services/files-client';
import { PdfPageRaster } from '@/components/box-map/pdf-page-raster';
import {
  cardStyle,
  color,
  font,
  microLabelStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
} from '@/lib/theme';
import { useConfirm } from '@/components/confirm/confirm-provider';

// THE box-placement editor. ONE component, shared by 7F (lien releases) and
// 7I (contracts) — #1-7i, extracted at S150 [R7].
//
// ⚠️ THIS FILE IS NOT UNDER `components/contracts/`, AND THAT IS THE POINT.
// CLAUDE.md's PARITY ruling: a helper under one surface's directory is a claim
// that the surface owns it. Two modules mount this, so neither does.
//
// ⚠️ EVERYTHING MODULE-SPECIFIC ARRIVES AS A PROP. The catalog, which kinds
// exist, whether boxes carry a party, the size floor, the save function. 7I has
// four kinds and a party; 7F has three and none. There is exactly one
// implementation of what a box IS and how it is edited, which is what §2.1's
// BUILD REQUIREMENT asks for and what #1-7i was open against.
//
// ⚠️ IT LOADS THE EXISTING MAP — `initialBoxes` is required, not optional.
// That is #2-7i stated as a requirement instead of a defect: 7F's old editor
// opened on an empty array and presented it as the current map, so re-opening
// it and saving replaced a placed map with NOTHING, silently, on a legal form.
// Do not "simplify" this to `useState([])`.
//
// ⚠️ FRACTIONS, NEVER POINTS. Stored as fractions of page width/height with a
// top-left origin, multiplied by the PDF's point dimensions at render — which
// is what lets a form re-scanned at a different DPI keep its map. The raster's
// pixel size and the panel's percentages are both presentation; neither ever
// reaches a stored coordinate.
//
// ⚠️ TWO SURFACES, ONE STATE [R6]. Drag on the page and type in the panel edit
// the same `boxes` array, so they cannot disagree. The panel is NOT a debug
// view — it is the FALLBACK when a PDF will not rasterise. An encrypted or
// corrupt form must not make a template unmappable.

/**
 * The shape every box map shares.
 *
 * 7F's `BoxInput` and 7I's `ContractBoxInput` are both structurally this;
 * `party` is simply absent on 7F's. `kind` and `party` are plain strings here
 * because their legal values are a per-module fact carried by the `kinds` and
 * `parties` props — the caller narrows them back at its own boundary, which is
 * the one place that knows the union.
 */
export interface EditorBox {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  kind: string;
  value_key?: string | null;
  custom_label?: string | null;
  party?: string | null;
}

export interface EditorCatalogEntry {
  key: string;
  label: string;
}

export interface EditorOption {
  value: string;
  label: string;
}

// The size floor is a PROP (`minWidthFor`), not a table in here. The keys are
// per-module — a release has a claimant and a waiver date, a contract has
// neither — so each module owns what its own values look like. See
// `minWidthForContractKey` and `minWidthForReleaseKey`.

/**
 * The boxes too small for what they will hold.
 *
 * Only `value` boxes — they are the ones whose content length is predictable. A
 * signature or initial box holds an image and a custom box holds whatever the
 * company writes on its own form; neither has an expected character count to
 * reason from.
 */
function undersized(
  boxes: EditorBox[],
  minWidthFor: (key: string | null | undefined) => number
): { index: number; box: EditorBox }[] {
  return boxes
    .map((box, index) => ({ index, box }))
    .filter(({ box }) => box.kind === 'value' && box.width < minWidthFor(box.value_key));
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Smallest box the drag surface will create, as a fraction. Below this a
 *  stray click becomes an invisible box the user cannot grab again. */
const MIN_DRAWN = 0.01;

type DragMode = 'move' | 'resize' | 'create';
interface Drag {
  mode: DragMode;
  index: number;
  startX: number;
  startY: number;
  origin: EditorBox;
}

export function BoxMapEditor({
  templateName,
  subtitle,
  catalog,
  kinds,
  parties,
  partyKinds = [],
  minWidthFor,
  pdfFileId,
  initialBoxes,
  onSave,
  onRenameTitle,
  onClose,
  onSaved,
  footnote,
}: {
  templateName: string;
  /** Small label above the title, e.g. "client agreement". */
  subtitle: string;
  /** The value keys this template may place. */
  catalog: EditorCatalogEntry[];
  /** The box kinds this module offers. 7I has four; 7F has three. */
  kinds: EditorOption[];
  /** Party choices, already labelled for this document. Omit for a module
   *  whose boxes have no party (7F). */
  parties?: EditorOption[];
  /** Which kinds REQUIRE a party. Empty when `parties` is omitted. */
  partyKinds?: string[];
  /** Placement-time size floor for a value key, as a fraction of page width. */
  minWidthFor: (valueKey: string | null | undefined) => number;
  /** The uploaded form. Null means there is nothing to rasterise. */
  pdfFileId: string | null;
  /** The CURRENT map. Required — see the #2-7i note above. */
  initialBoxes: EditorBox[];
  onSave: (boxes: EditorBox[]) => Promise<{ success: boolean; error?: string }>;
  /** Omit on a surface that renames elsewhere (7F renames on its list). */
  onRenameTitle?: (name: string) => Promise<{ success: boolean; error?: string }>;
  onClose: () => void;
  onSaved: () => void;
  footnote?: string;
}) {
  const confirm = useConfirm();
  const [boxes, setBoxes] = useState<EditorBox[]>(initialBoxes);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);

  // Title lives here rather than on the settings list [RULED S150] — an explicit
  // act on the screen where you are already working on the form.
  const [title, setTitle] = useState(templateName);
  const [editingTitle, setEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState(templateName);

  // ── Raster ────────────────────────────────────────────────────────────────
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [raster, setRaster] = useState<'loading' | 'ready' | 'failed'>(
    pdfFileId ? 'loading' : 'failed'
  );
  const [rasterMessage, setRasterMessage] = useState<string | null>(
    pdfFileId ? null : 'No form is attached to this template yet.'
  );

  useEffect(() => {
    if (!pdfFileId) return;
    let cancelled = false;
    (async () => {
      const url = await getFileSignedUrlClient(pdfFileId, 900);
      if (cancelled) return;
      if (!url) {
        setRaster('failed');
        setRasterMessage('The uploaded form could not be opened.');
        return;
      }
      setFileUrl(url);
    })();
    return () => {
      cancelled = true;
    };
  }, [pdfFileId]);

  // Stable callbacks — the raster re-downloads the PDF if these change identity.
  const handlePageCount = useCallback((count: number) => setPageCount(count), []);
  const handleRasterState = useCallback(
    (state: 'loading' | 'ready' | 'failed', message?: string) => {
      setRaster(state);
      setRasterMessage(message ?? null);
    },
    []
  );

  const firstKey = catalog[0]?.key ?? null;
  const firstParty = parties?.[0]?.value ?? null;
  const needsParty = (kind: string) => partyKinds.includes(kind);
  const tooSmall = undersized(boxes, minWidthFor);

  const set = (i: number, patch: Partial<EditorBox>) =>
    setBoxes((b) => b.map((box, j) => (j === i ? { ...box, ...patch } : box)));

  function newBox(patch: Partial<EditorBox> = {}): EditorBox {
    return {
      page: pageIndex,
      x: 0.1,
      y: 0.1,
      width: 0.3,
      height: 0.03,
      kind: kinds[0]?.value ?? 'value',
      value_key: firstKey,
      ...patch,
    };
  }

  function addBox() {
    setBoxes((b) => [...b, newBox()]);
    setSelected(boxes.length);
  }

  /**
   * Switching kind clears the payload columns.
   *
   * `contract_template_boxes_payload_check` refuses a value box with no key, a
   * custom box with no label, and a signature/initial box carrying either or no
   * party — so a leftover field is a write the database rejects, not a stray
   * value. Cleared here so the shape is always legal before it is sent.
   */
  function setKind(i: number, kind: string) {
    set(i, {
      kind,
      value_key: kind === 'value' ? firstKey : null,
      custom_label: null,
      // R4/R5 — a box that requires a party gets one chosen rather than left
      // blank for the user to discover at save. The caller orders `parties` so
      // the sensible default is first: on a contract that is the counterparty,
      // whose signature is what the document is sent to collect.
      party: needsParty(kind) ? firstParty : null,
    });
  }

  // ── Dragging ──────────────────────────────────────────────────────────────
  //
  // Pointer events rather than mouse events so a stylus or touch works. Movement
  // is tracked on `window`: a fast drag leaves the box (and sometimes the
  // overlay) behind, and listeners bound to the element would drop the gesture
  // mid-way and strand the box under the cursor.
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<Drag | null>(null);

  const fractionAt = (clientX: number, clientY: number) => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return null;
    return { fx: (clientX - rect.left) / rect.width, fy: (clientY - rect.top) / rect.height };
  };

  useEffect(() => {
    function onMove(e: PointerEvent) {
      const drag = dragRef.current;
      const at = fractionAt(e.clientX, e.clientY);
      if (!drag || !at) return;
      const dx = at.fx - drag.startX;
      const dy = at.fy - drag.startY;
      const o = drag.origin;

      if (drag.mode === 'move') {
        setBoxes((all) =>
          all.map((b, j) =>
            j === drag.index
              ? // Clamped so a box cannot be dragged off the page — the bounds
                // CHECK would refuse the write, and a box at x=1 is invisible.
                { ...b, x: clamp01(Math.min(o.x + dx, 1 - o.width)), y: clamp01(Math.min(o.y + dy, 1 - o.height)) }
              : b
          )
        );
        return;
      }

      // resize and create share the same maths: the anchor corner stays put and
      // the opposite corner follows the pointer.
      const width = Math.max(MIN_DRAWN, Math.min(o.width + dx, 1 - o.x));
      const height = Math.max(MIN_DRAWN, Math.min(o.height + dy, 1 - o.y));
      setBoxes((all) => all.map((b, j) => (j === drag.index ? { ...b, width, height } : b)));
    }

    function onUp() {
      dragRef.current = null;
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, []);

  function beginMove(e: React.PointerEvent, index: number) {
    e.preventDefault();
    e.stopPropagation();
    const at = fractionAt(e.clientX, e.clientY);
    if (!at) return;
    setSelected(index);
    dragRef.current = { mode: 'move', index, startX: at.fx, startY: at.fy, origin: boxes[index] };
  }

  function beginResize(e: React.PointerEvent, index: number) {
    e.preventDefault();
    e.stopPropagation();
    const at = fractionAt(e.clientX, e.clientY);
    if (!at) return;
    setSelected(index);
    dragRef.current = { mode: 'resize', index, startX: at.fx, startY: at.fy, origin: boxes[index] };
  }

  /** Drag on blank page area draws a new box where the user drew it. */
  function beginCreate(e: React.PointerEvent) {
    const at = fractionAt(e.clientX, e.clientY);
    if (!at) return;
    e.preventDefault();
    const created = newBox({
      page: pageIndex,
      x: clamp01(at.fx),
      y: clamp01(at.fy),
      width: MIN_DRAWN,
      height: MIN_DRAWN,
    });
    const index = boxes.length;
    setBoxes((all) => [...all, created]);
    setSelected(index);
    dragRef.current = { mode: 'create', index, startX: at.fx, startY: at.fy, origin: created };
  }

  async function saveTitle() {
    const next = draftTitle.trim();
    if (!next) return setError('A form needs a name.');
    if (next === title) {
      setEditingTitle(false);
      return;
    }
    setBusy(true);
    if (!onRenameTitle) return setEditingTitle(false);
    const result = await onRenameTitle(next);
    setBusy(false);
    if (!result.success) return setError(result.error ?? 'Could not rename.');
    setError(null);
    setTitle(next);
    setEditingTitle(false);
  }

  async function save() {
    // ⚠️ NO KEY-vs-KIND OR PARTY VALIDATION HERE, DELIBERATELY.
    // `saveContractBoxMap` already refuses a client-only key on a subcontract
    // template and a signature box with no party, both BEFORE anything is
    // written, with messages naming what is wrong. A second copy of those rules
    // in the UI is the divergence CLAUDE.md's PARITY ruling warns about, written
    // in a form that looks like agreement.
    //
    // The size warning below is NOT a duplicate — it exists only at placement
    // time and the service has no opinion on it.
    if (tooSmall.length > 0) {
      const names = tooSmall
        .map(({ box }) => catalog.find((v) => v.key === box.value_key)?.label ?? box.value_key)
        .join(', ');
      const proceed = await confirm(
        `These boxes look too small for what they will hold: ${names}.\n\n` +
          `Nothing will be shrunk or cut short to fit. This check errs on the ` +
          `cautious side, so a box flagged here may still be fine — but a value ` +
          `that genuinely does not fit will stop the send.\n\nSave anyway?`
      );
      if (!proceed) return;
    }

    setBusy(true);
    const result = await onSave(boxes);
    setBusy(false);
    if (!result.success) return setError(result.error ?? 'Could not save the box map.');
    onSaved();
  }

  const onThisPage = boxes
    .map((box, index) => ({ box, index }))
    .filter(({ box }) => box.page === pageIndex);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(20,33,61,0.45)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        zIndex: 50,
        padding: '20px',
        overflowY: 'auto',
      }}
    >
      <div style={{ ...cardStyle, padding: '20px', maxWidth: '1040px', width: '100%' }}>
        {/* ── Title ──────────────────────────────────────────────────────── */}
        <p style={{ ...microLabelStyle, marginBottom: '6px' }}>
          Boxes — {subtitle}
        </p>

        {editingTitle ? (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '10px' }}>
            <input
              value={draftTitle}
              autoFocus
              onChange={(e) => setDraftTitle(e.target.value)}
              style={{ ...inputStyle, width: '300px', marginTop: 0 }}
            />
            <button type="button" style={primaryButtonStyle} disabled={busy} onClick={saveTitle}>
              Save title
            </button>
            <button
              type="button"
              style={secondaryButtonStyle}
              disabled={busy}
              onClick={() => {
                setDraftTitle(title);
                setEditingTitle(false);
                setError(null);
              }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontSize: '16px', fontWeight: 700, color: color.navy }}>{title}</span>
            {/* Only where this surface OWNS renaming. 7F renames on its list,
                and two rename affordances for one field is how they disagree. */}
            {onRenameTitle && (
              <button
                type="button"
                style={{ ...secondaryButtonStyle, padding: '3px 9px', fontSize: '12px' }}
                disabled={busy}
                onClick={() => {
                  setDraftTitle(title);
                  setEditingTitle(true);
                }}
              >
                Edit title
              </button>
            )}
          </div>
        )}

        {error && <p style={{ color: color.danger, fontSize: '13px', margin: '0 0 10px' }}>{error}</p>}

        {/* ── The page ───────────────────────────────────────────────────── */}
        {raster === 'failed' ? (
          <div
            style={{
              border: `1px solid ${color.cardBorder}`,
              borderRadius: '10px',
              background: color.tableHeadBg,
              padding: '14px',
              marginBottom: '14px',
            }}
          >
            <p style={{ fontSize: '12.5px', color: color.warning, margin: 0 }}>
              The form cannot be shown here{rasterMessage ? ` — ${rasterMessage}` : '.'}
            </p>
            <p style={{ fontSize: '11.5px', color: color.muted, margin: '6px 0 0' }}>
              Boxes can still be placed using the positions below, and they work exactly the same.
              Open the form in another tab to read off where its blanks fall.
            </p>
          </div>
        ) : (
          <>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '8px',
                fontSize: '12px',
                color: color.muted,
              }}
            >
              <button
                type="button"
                style={{ ...secondaryButtonStyle, padding: '3px 9px', fontSize: '12px' }}
                disabled={pageIndex === 0}
                onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
              >
                ‹ Previous
              </button>
              <span>
                Page {pageIndex + 1} of {pageCount}
              </span>
              <button
                type="button"
                style={{ ...secondaryButtonStyle, padding: '3px 9px', fontSize: '12px' }}
                disabled={pageIndex >= pageCount - 1}
                onClick={() => setPageIndex((p) => Math.min(pageCount - 1, p + 1))}
              >
                Next ›
              </button>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: '11.5px', color: color.faint }}>
                Drag on the page to draw a box · drag a box to move it · drag its corner to resize
              </span>
            </div>

            <div
              ref={surfaceRef}
              onPointerDown={beginCreate}
              style={{
                position: 'relative',
                border: `1px solid ${color.cardBorder}`,
                borderRadius: '6px',
                overflow: 'hidden',
                marginBottom: '14px',
                cursor: 'crosshair',
                touchAction: 'none',
                background: '#fff',
                minHeight: raster === 'loading' ? '260px' : undefined,
              }}
            >
              <PdfPageRaster
                fileUrl={fileUrl}
                pageIndex={pageIndex}
                onPageCount={handlePageCount}
                onStateChange={handleRasterState}
              />

              {raster === 'loading' && (
                <p
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '12.5px',
                    color: color.muted,
                    margin: 0,
                  }}
                >
                  Loading the form…
                </p>
              )}

              {/* Boxes for THIS page only. A box on page 3 is not on page 1. */}
              {onThisPage.map(({ box, index }) => {
                const small =
                  box.kind === 'value' && box.width < minWidthFor(box.value_key);
                const isSelected = selected === index;
                return (
                  <div
                    key={index}
                    onPointerDown={(e) => beginMove(e, index)}
                    style={{
                      position: 'absolute',
                      left: `${box.x * 100}%`,
                      top: `${box.y * 100}%`,
                      width: `${box.width * 100}%`,
                      height: `${box.height * 100}%`,
                      border: `1.5px solid ${
                        small ? color.warning : isSelected ? color.primary : color.primaryHover
                      }`,
                      background: small
                        ? 'rgba(217,119,6,0.16)'
                        : isSelected
                          ? 'rgba(47,73,209,0.22)'
                          : 'rgba(47,73,209,0.12)',
                      cursor: 'move',
                      boxSizing: 'border-box',
                      touchAction: 'none',
                    }}
                    title={boxTitle(box, catalog)}
                  >
                    <span
                      style={{
                        position: 'absolute',
                        top: '-16px',
                        left: 0,
                        fontSize: '9.5px',
                        fontFamily: font.mono,
                        color: small ? color.warning : color.primaryHover,
                        whiteSpace: 'nowrap',
                        pointerEvents: 'none',
                      }}
                    >
                      {boxTitle(box, catalog)}
                    </span>
                    {/* Bottom-right resize handle. */}
                    <span
                      onPointerDown={(e) => beginResize(e, index)}
                      style={{
                        position: 'absolute',
                        right: '-5px',
                        bottom: '-5px',
                        width: '10px',
                        height: '10px',
                        borderRadius: '2px',
                        background: color.primary,
                        cursor: 'nwse-resize',
                        touchAction: 'none',
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ── The coordinate panel ───────────────────────────────────────── */}
        <p style={{ ...microLabelStyle, marginBottom: '6px' }}>Positions</p>
        <p style={{ fontSize: '11.5px', color: color.muted, margin: '0 0 8px' }}>
          Percentages of the page from the top-left, so they survive the form being re-scanned at a
          different size. Editing here moves the box on the page, and moving it there updates these.
        </p>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: color.tableHeadBg }}>
                {['Page', 'Kind', 'Field / label / who signs', 'X%', 'Y%', 'W%', 'H%', ''].map((h) => (
                  <th key={h} style={{ padding: '6px 8px', textAlign: 'left', color: color.muted }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {boxes.map((b, i) => {
                const small = b.kind === 'value' && b.width < minWidthFor(b.value_key);
                return (
                  <tr
                    key={i}
                    onFocus={() => setSelected(i)}
                    style={{
                      borderTop: `1px solid ${color.rowDivider}`,
                      background: selected === i ? color.blueTint : undefined,
                    }}
                  >
                    <td style={cell}>
                      <input
                        type="number"
                        min={0}
                        value={b.page}
                        onChange={(e) => set(i, { page: Math.max(0, Number(e.target.value)) })}
                        style={{ ...inputStyle, width: '54px', marginTop: 0 }}
                      />
                    </td>
                    <td style={cell}>
                      <select
                        value={b.kind}
                        onChange={(e) => setKind(i, e.target.value)}
                        style={{ ...inputStyle, width: 'auto', marginTop: 0 }}
                      >
                        {kinds.map((k) => (
                          <option key={k.value} value={k.value}>
                            {k.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td style={cell}>
                      {b.kind === 'value' && (
                        <select
                          value={b.value_key ?? ''}
                          onChange={(e) => set(i, { value_key: e.target.value })}
                          style={{ ...inputStyle, width: '210px', marginTop: 0 }}
                        >
                          {catalog.map((v) => (
                            <option key={v.key} value={v.key}>
                              {v.label}
                            </option>
                          ))}
                        </select>
                      )}
                      {b.kind === 'custom' && (
                        <input
                          value={b.custom_label ?? ''}
                          placeholder="e.g. Lender file no."
                          onChange={(e) => set(i, { custom_label: e.target.value })}
                          style={{ ...inputStyle, width: '210px', marginTop: 0 }}
                        />
                      )}
                      {/* R4/R5 — WHO signs. Options are labelled from
                          `document_kind` ("The client" / "The subcontractor")
                          while the stored value stays kind-neutral. */}
                      {needsParty(b.kind) && parties && (
                        <select
                          value={b.party ?? firstParty ?? ''}
                          onChange={(e) => set(i, { party: e.target.value })}
                          style={{ ...inputStyle, width: '210px', marginTop: 0 }}
                        >
                          {parties.map((p) => (
                            <option key={p.value} value={p.value}>
                              {p.label}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    {(['x', 'y', 'width', 'height'] as const).map((k) => (
                      <td key={k} style={cell}>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={0.1}
                          value={Math.round(b[k] * 1000) / 10}
                          onChange={(e) =>
                            set(i, { [k]: Number(e.target.value) / 100 } as Partial<EditorBox>)
                          }
                          style={{
                            ...inputStyle,
                            width: '68px',
                            marginTop: 0,
                            borderColor:
                              small && k === 'width' ? color.warning : color.inputBorder,
                          }}
                        />
                      </td>
                    ))}
                    <td style={cell}>
                      <button
                        type="button"
                        onClick={() => {
                          setBoxes((all) => all.filter((_, j) => j !== i));
                          setSelected(null);
                        }}
                        style={{
                          ...secondaryButtonStyle,
                          padding: '3px 8px',
                          fontSize: '11px',
                          color: color.danger,
                        }}
                        aria-label="Remove this box"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {boxes.length === 0 && (
          <p style={{ fontSize: '12.5px', color: color.faint, margin: '12px 0 0' }}>
            No boxes placed yet.
          </p>
        )}

        {/* §2.2 — named, not counted. "Three boxes are small" tells the user
            nothing about which blank to go and fix. */}
        {tooSmall.length > 0 && (
          <p style={{ fontSize: '12px', color: color.warning, margin: '12px 0 0' }}>
            Likely too small for what they will hold:{' '}
            {tooSmall
              .map(({ box }) => catalog.find((v) => v.key === box.value_key)?.label ?? box.value_key)
              .join(', ')}
            . This errs on the cautious side — nothing is shrunk or cut short to fit, so a value that
            genuinely does not fit will stop the send rather than print badly.
          </p>
        )}

        <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
          <button type="button" style={secondaryButtonStyle} disabled={busy} onClick={addBox}>
            Add a box
          </button>
          <span style={{ flex: 1 }} />
          <button type="button" style={secondaryButtonStyle} disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button type="button" style={primaryButtonStyle} disabled={busy} onClick={save}>
            {busy ? 'Saving…' : 'Save boxes'}
          </button>
        </div>

        <p style={{ fontSize: '11px', color: color.faint, margin: '12px 0 0', fontFamily: font.sans }}>
          Saving replaces the whole map for this form — a box you removed here is gone, not merged
          back in.{footnote ? ` ${footnote}` : ''}
        </p>
      </div>
    </div>
  );
}

/** The one-line name shown on a box and in its tooltip. */
function boxTitle(box: EditorBox, catalog: EditorCatalogEntry[]): string {
  if (box.kind === 'value') {
    return catalog.find((v) => v.key === box.value_key)?.label ?? box.value_key ?? 'Value';
  }
  if (box.kind === 'custom') return box.custom_label?.trim() || 'Custom';
  // 7F's boxes carry no party, so the prefix is dropped rather than guessed.
  const who = box.party ? (box.party === 'contractor' ? 'Our ' : 'Their ') : '';
  return box.kind === 'initial' ? `${who}initials` : `${who}signature`;
}

const inputStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  marginTop: '3px',
  padding: '5px 8px',
  fontSize: '13px',
  border: `1px solid ${color.inputBorder}`,
  borderRadius: '6px',
  fontFamily: font.sans,
};

const cell: React.CSSProperties = { padding: '6px 8px' };
