'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X, MoreVertical } from 'lucide-react';
import { softDeleteFile } from '@/lib/services/files-client';
import { shareTargetFor } from '@framefocus/shared/utils/markup';

// M6M §4.9 — M-9 · Photo viewer. Dark canvas #0d1220.
//
// ---------------------------------------------------------------------------
// THE TOGGLE IS A FILE SWAP. D-31 [S99] REVERSED THIS AND IT IS THE THING MOST
// LIKELY TO BE BUILT FROM STALE SPEC TEXT.
// ---------------------------------------------------------------------------
// §4.9 still carries an Option A paragraph — "the image on screen is always the
// original; the toggle hides and shows the annotation layer... No second fetch"
// — which D-31 overturned. Under D-31:
//
//   with markup, toggle OFF  ->  the DERIVATIVE (the annotated bytes)
//   with markup, toggle ON   ->  the ORIGINAL (unannotated), a second request
//
// A-23e asserts exactly that swap. A-23e2, which asserted "no second image
// request", was DELETED by the reversal — it now describes the opposite of the
// rule, and a build satisfying it would be non-compliant.
//
// ---------------------------------------------------------------------------
// A-23s IS THE DANGEROUS ONE, AND IT GOT WORSE UNDER D-31.
// ---------------------------------------------------------------------------
// A build that renders the original and then swaps in the derivative shows an
// annotated photo AS UNANNOTATED for a full network round-trip. That is not a
// flicker, it is the wrong picture. Two structural defences, not one:
//   1. `src` starts at `displayUrl` — already the derivative, resolved on the
//      server. The original is never the initial src for an annotated photo.
//   2. The stage holds its placeholder until THAT image has loaded, keyed on
//      the src, so a toggle re-arms it rather than revealing a stale frame.

export type ViewerPhoto = {
  id: string;
  file_name: string;
  displayUrl: string | null;
  originalUrl: string | null;
  hasMarkup: boolean;
  derivativeMissing: boolean;
  source: 'log' | 'delivery' | 'safety' | 'punch' | null;
  sourceId: string | null;
  sourceLabel: string | null;
  sourceHref: string | null;
  takenAt: string | null;
  by: string | null;
  tags: string[];
};

const ZOOM_STEP = 1.5;
const MIN_ZOOM = 1;
const MAX_ZOOM = 6;

export function PhotoViewer({
  photos,
  index,
  projectId,
  canDelete,
}: {
  photos: ViewerPhoto[];
  index: number;
  projectId: string;
  canDelete: boolean;
}) {
  const router = useRouter();
  const photo = photos[index];

  const [showOriginal, setShowOriginal] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [loaded, setLoaded] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // WHICH FILE IS ON SCREEN. `displayUrl` is the derivative for an annotated
  // photo; the toggle swaps to `originalUrl`. One expression, so the two can
  // never disagree.
  const src = showOriginal ? photo.originalUrl : photo.displayUrl;

  const goto = useCallback(
    (i: number) => {
      const next = photos[i];
      if (!next) return;
      // Reset per-photo view state — arriving zoomed into someone else's photo
      // at an arbitrary pan is disorienting.
      setZoom(1);
      setPan({ x: 0, y: 0 });
      setShowOriginal(false);
      setLoaded(false);
      router.push(`/m/p/${projectId}/photos/${next.id}`);
    },
    [photos, projectId, router]
  );

  const prev = index > 0 ? index - 1 : null;
  const next = index < photos.length - 1 ? index + 1 : null;

  // -------------------------------------------------------------------------
  // GESTURES — every one has a visible equivalent (A-25).
  //   swipe left/right   -> the prev/next circles
  //   pinch              -> the −/+ zoom control
  //   swipe down         -> the close ✕
  //
  // A-25g: WHILE ZOOMED, a horizontal drag PANS instead of paging, and the
  // circles keep paging. At zoom the arrows stop being an equivalent of the
  // swipe and become the ONLY way to page, which is the second reason the
  // visible controls matter.
  // -------------------------------------------------------------------------
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  function onPointerDown(e: React.PointerEvent) {
    drag.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    if (zoom > MIN_ZOOM) {
      setPan({
        x: drag.current.panX + (e.clientX - drag.current.x),
        y: drag.current.panY + (e.clientY - drag.current.y),
      });
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    const start = drag.current;
    drag.current = null;
    if (!start) return;

    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;

    // Zoomed: the drag was a pan, already applied. Never page.
    if (zoom > MIN_ZOOM) return;

    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0 && next !== null) goto(next);
      if (dx > 0 && prev !== null) goto(prev);
      return;
    }
    if (dy > 80 && Math.abs(dy) > Math.abs(dx)) close();
  }

  const close = useCallback(() => {
    router.push(`/m/p/${projectId}/photos`);
  }, [projectId, router]);

  async function share() {
    // A-23t — a marked-up photo whose derivative is missing degrades to the
    // ORIGINAL and SAYS SO. It never silently shares an unmarked photo as if it
    // were marked: the sub receiving it would have no way to know the circle
    // showing which stud was meant never made it.
    const target = shareTargetFor(photo);
    if (target.warning) setNote(target.warning);

    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (!nav.share) {
      setNote('Sharing is not available in this browser.');
      return;
    }
    try {
      await nav.share({ title: photo.file_name, text: photo.file_name });
    } catch {
      /* dismissed share sheet is a cancel */
    }
  }

  async function remove() {
    setBusy(true);
    const result = await softDeleteFile(photo.id);
    setBusy(false);
    setConfirming(false);
    if (!result.success) {
      setNote(result.error ?? 'Delete failed.');
      return;
    }
    router.push(`/m/p/${projectId}/photos`);
    router.refresh();
  }

  const takenLabel = useMemo(() => {
    if (!photo.takenAt) return '—';
    return new Date(photo.takenAt).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }, [photo.takenAt]);

  return (
    <div className="flex min-h-full flex-col bg-m6m-canvas text-white">
      {/* ---------------------------------------------------------------- */}
      {/* §4.9 HEADER — close ✕ · filename + `n of m` · ⋮ overflow          */}
      {/* ---------------------------------------------------------------- */}
      <header className="flex items-center gap-[10px] px-[14px] pt-[10px]">
        <button
          type="button"
          data-testid="m-viewer-close"
          aria-label="Close"
          onClick={close}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white"
          style={{ backgroundColor: 'rgba(255,255,255,.13)' }}
        >
          <X size={22} strokeWidth={2.2} aria-hidden />
        </button>

        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-[15px] font-bold leading-tight">{photo.file_name}</p>
          <p data-testid="m-viewer-position" className="font-mono text-[11px] text-m6m-muted-navy">
            {index + 1} of {photos.length}
          </p>
        </div>

        <div className="relative shrink-0">
          <button
            type="button"
            data-testid="m-viewer-overflow"
            aria-label="More"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
            className="flex h-11 w-11 items-center justify-center rounded-full text-white"
            style={{ backgroundColor: 'rgba(255,255,255,.13)' }}
          >
            <MoreVertical size={20} strokeWidth={2.2} aria-hidden />
          </button>
          {menuOpen ? (
            <div
              data-testid="m-viewer-menu"
              role="menu"
              className="absolute right-0 top-[48px] z-50 w-[190px] overflow-hidden rounded-[12px] border border-white/15 bg-[#161d2f]"
            >
              <Link
                href={`/m/p/${projectId}/photos/${photo.id}/markup`}
                data-testid="m-viewer-markup"
                role="menuitem"
                className="flex min-h-[44px] items-center px-[14px] text-[15px] font-semibold text-white"
              >
                Markup
              </Link>
              <button
                type="button"
                role="menuitem"
                disabled
                className="flex min-h-[44px] w-full items-center px-[14px] text-left text-[15px] text-m6m-muted-navy opacity-50"
              >
                Set as cover
              </button>
              <button
                type="button"
                role="menuitem"
                disabled
                className="flex min-h-[44px] w-full items-center px-[14px] text-left text-[15px] text-m6m-muted-navy opacity-50"
              >
                Move
              </button>
              <button
                type="button"
                role="menuitem"
                disabled
                className="flex min-h-[44px] w-full items-center px-[14px] text-left text-[15px] text-m6m-muted-navy opacity-50"
              >
                Report
              </button>
            </div>
          ) : null}
        </div>
      </header>

      {/* ---------------------------------------------------------------- */}
      {/* §4.9 IMAGE STAGE — fixed 330px, full-bleed, no radius             */}
      {/* ---------------------------------------------------------------- */}
      <div
        data-testid="m-viewer-stage"
        className="relative mt-[10px] h-[330px] w-full overflow-hidden bg-black"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (drag.current = null)}
      >
        {/* A-23s — the placeholder holds until THIS src has loaded. Keyed on
            src so a toggle re-arms it and never reveals the previous file. */}
        {!loaded ? (
          <div data-testid="m-stage-placeholder" className="absolute inset-0 bg-[#161d2f]" />
        ) : null}

        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={src}
            src={src}
            alt={photo.file_name}
            data-testid="m-stage-image"
            data-showing={showOriginal ? 'original' : 'display'}
            // Same hydration race as the gallery tile: a cached image can
            // complete before `onLoad` is attached, which would strand the
            // stage on its placeholder.
            ref={(el) => {
              if (el?.complete && el.naturalWidth > 0) setLoaded(true);
            }}
            onLoad={() => setLoaded(true)}
            onError={() => setLoaded(true)}
            draggable={false}
            className={`h-full w-full object-cover transition-opacity duration-150 ${
              loaded ? 'opacity-100' : 'opacity-0'
            }`}
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: 'center center',
            }}
          />
        ) : null}

        {/* Prev/next — 40px translucent circles inset 14px, vertically centred.
            THEY PAGE AT EVERY ZOOM LEVEL (A-25g). */}
        {prev !== null ? (
          <button
            type="button"
            data-testid="m-viewer-prev"
            aria-label="Previous photo"
            onClick={() => goto(prev)}
            className="absolute left-[14px] top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-white"
            style={{ backgroundColor: 'rgba(255,255,255,.13)' }}
          >
            <ChevronLeft size={22} strokeWidth={2.4} aria-hidden />
          </button>
        ) : null}
        {next !== null ? (
          <button
            type="button"
            data-testid="m-viewer-next"
            aria-label="Next photo"
            onClick={() => goto(next)}
            className="absolute right-[14px] top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-white"
            style={{ backgroundColor: 'rgba(255,255,255,.13)' }}
          >
            <ChevronRight size={22} strokeWidth={2.4} aria-hidden />
          </button>
        ) : null}

        {/* ---------------------------------------------------------------
            §4.9's ZOOM CONTROL [S98] — pinch's visible equivalent (A-25e).
            Two 44px circles stacked bottom-right, inset 14px, 8px apart. The
            `Fit` pill appears ONLY above fit, so the resting state is two
            controls and not three.

            A-25f: the stack rises from the 14px bottom inset; prev/next sit
            vertically centred. On the 330px stage that leaves clearance at
            every zoom level — nothing overlaps.
            --------------------------------------------------------------- */}
        <div className="absolute bottom-[14px] right-[14px] flex flex-col items-center gap-[8px]">
          {zoom > MIN_ZOOM ? (
            <button
              type="button"
              data-testid="m-zoom-fit"
              onClick={() => {
                setZoom(1);
                setPan({ x: 0, y: 0 });
              }}
              className="flex h-11 min-w-[44px] items-center justify-center rounded-full px-[10px] font-mono text-[12px] font-semibold text-white"
              style={{ backgroundColor: 'rgba(255,255,255,.13)' }}
            >
              Fit
            </button>
          ) : null}
          <button
            type="button"
            data-testid="m-zoom-out"
            aria-label="Zoom out"
            onClick={() => {
              const z = Math.max(MIN_ZOOM, zoom / ZOOM_STEP);
              setZoom(z);
              if (z === MIN_ZOOM) setPan({ x: 0, y: 0 });
            }}
            className="flex h-11 w-11 items-center justify-center rounded-full text-[20px] font-bold text-white"
            style={{ backgroundColor: 'rgba(255,255,255,.13)' }}
          >
            −
          </button>
          <button
            type="button"
            data-testid="m-zoom-in"
            aria-label="Zoom in"
            onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z * ZOOM_STEP))}
            className="flex h-11 w-11 items-center justify-center rounded-full text-[20px] font-bold text-white"
            style={{ backgroundColor: 'rgba(255,255,255,.13)' }}
          >
            +
          </button>
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* MARKUP INDICATOR + TOGGLE (A-25b, A-23e)                          */}
      {/* ---------------------------------------------------------------- */}
      {photo.hasMarkup ? (
        <div className="flex items-center gap-[8px] px-[18px] pt-[10px]">
          <span
            data-testid="m-viewer-markup-indicator"
            className="rounded-full px-[8px] py-[3px] font-mono text-[11px] font-semibold text-white"
            style={{ backgroundColor: 'rgba(20,33,61,.72)' }}
          >
            Marked up
          </span>
          <button
            type="button"
            data-testid="m-markup-toggle"
            data-showing={showOriginal ? 'original' : 'derivative'}
            onClick={() => {
              setShowOriginal((v) => !v);
              setLoaded(false); // re-arm the placeholder for the swapped file
            }}
            className="ml-auto flex min-h-[44px] items-center rounded-full border border-white/20 px-[14px] text-[14px] font-semibold text-white"
          >
            {showOriginal ? 'Show markup' : 'Show original'}
          </button>
        </div>
      ) : null}

      {photo.derivativeMissing ? (
        <p
          data-testid="m-derivative-missing"
          role="status"
          className="mx-[18px] mt-[10px] rounded-[10px] px-[10px] py-[6px] text-[13px] text-[#f0908a]"
          style={{ backgroundColor: 'rgba(192,54,44,.16)' }}
        >
          Markup image unavailable — showing the unmarked original.
        </p>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      {/* §4.9 FILMSTRIP — 52px squares, current ringed amber               */}
      {/* ---------------------------------------------------------------- */}
      <div
        data-testid="m-filmstrip"
        className="mt-[12px] flex gap-[7px] overflow-x-auto px-[18px]"
      >
        {photos.map((p, i) => (
          <Link
            key={p.id}
            href={`/m/p/${projectId}/photos/${p.id}`}
            data-testid="m-filmstrip-item"
            data-current={i === index ? 'true' : 'false'}
            aria-current={i === index ? 'true' : undefined}
            className="relative block h-[52px] w-[52px] shrink-0 overflow-hidden rounded-[8px] bg-[#161d2f]"
            style={
              i === index
                ? { boxShadow: '0 0 0 2px #f59e0b' }
                : { opacity: 0.45 }
            }
          >
            {/* The filmstrip is the THIRD surface D-31 governs — it shows the
                same flat file the stage and the gallery do (A-23g). */}
            {p.displayUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={p.displayUrl}
                alt=""
                data-testid="m-filmstrip-image"
                className="h-full w-full object-cover"
              />
            ) : null}
          </Link>
        ))}
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* §4.9 DETAIL BLOCK                                                 */}
      {/* ---------------------------------------------------------------- */}
      <div className="px-[18px] pt-[14px]">
        {/* CAPTION IS CUT, and it is a schema gap rather than an oversight:
            `files` carries no caption column (file_name, tags, ai_tags and
            markup_data are the text it has). §4.11's rule is "bound to a named
            service function, or CUT" — nothing to bind to, so nothing is
            rendered and no placeholder text is invented. */}

        <div className="flex flex-wrap gap-[6px]">
          {photo.tags.map((t) => (
            <span
              key={t}
              data-testid="m-tag-pill"
              className="rounded-full px-[10px] py-[4px] text-[13px]"
              style={{ backgroundColor: 'rgba(47,73,209,.22)', color: '#9fb0f5' }}
            >
              {t}
            </span>
          ))}
          <button
            type="button"
            data-testid="m-add-tag"
            disabled
            className="flex min-h-[44px] items-center rounded-full border border-dashed border-white/25 px-[12px] text-[13px] text-m6m-muted-navy opacity-60"
          >
            + Tag
          </button>
        </div>

        <dl className="mt-[14px] border-t pt-[12px]" style={{ borderColor: 'rgba(255,255,255,.08)' }}>
          <Row label="Taken" value={takenLabel} mono />
          <Row label="By" value={photo.by ?? '—'} />
          {photo.sourceHref ? (
            <div className="flex items-center gap-[10px] py-[8px]">
              <dt className="w-[70px] shrink-0 text-[13px] text-m6m-muted-navy">Source</dt>
              {/* A-25c — tapping Source navigates to the record it came from. */}
              <dd className="min-w-0 flex-1">
                <Link
                  href={photo.sourceHref}
                  data-testid="m-viewer-source"
                  className="flex min-h-[44px] items-center text-[15px] font-semibold text-[#9fb0f5]"
                >
                  {photo.sourceLabel}
                </Link>
              </dd>
            </div>
          ) : (
            <Row label="Source" value={photo.sourceLabel ?? '—'} />
          )}
        </dl>
      </div>

      {note ? (
        <p data-testid="m-viewer-note" role="status" className="px-[18px] pt-[8px] text-[13px] text-[#f0908a]">
          {note}
        </p>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      {/* §3.2 — ON M-9 THE TAB BAR IS REPLACED BY THIS 4-UP ACTION ROW.     */}
      {/* A-1b asserts the replacement, not merely the absence.             */}
      {/* ---------------------------------------------------------------- */}
      <div
        data-testid="m-viewer-actions"
        className="mt-auto grid grid-cols-4 gap-[8px] px-[18px] pb-[18px] pt-[18px]"
        style={{ paddingBottom: 'calc(18px + env(safe-area-inset-bottom))' }}
      >
        <ActionTile
          testId="m-action-save"
          label="Save"
          href={photo.displayUrl ?? undefined}
          download={photo.file_name}
        />
        <ActionTile testId="m-action-share" label="Share" onClick={share} />
        <ActionTile testId="m-action-comment" label="Comment" disabled />
        {/* A-25d — absent entirely for a role files_delete_owner_admin refuses. */}
        {canDelete ? (
          <ActionTile
            testId="m-action-delete"
            label="Delete"
            danger
            onClick={() => setConfirming(true)}
          />
        ) : (
          <span data-testid="m-action-delete-absent" className="hidden" />
        )}
      </div>

      {confirming ? (
        <div
          data-testid="m-delete-confirm"
          role="dialog"
          aria-label="Confirm delete"
          className="fixed inset-x-[18px] bottom-[18px] z-50 rounded-[14px] border border-white/15 bg-[#161d2f] p-[14px]"
        >
          <p className="text-[15px] font-semibold text-white">Delete this photo?</p>
          <div className="mt-[10px] flex gap-[8px]">
            <button
              type="button"
              data-testid="m-delete-confirm-yes"
              onClick={remove}
              disabled={busy}
              className="flex min-h-[44px] flex-1 items-center justify-center rounded-[12px] bg-m6m-danger text-[15px] font-bold text-white disabled:opacity-60"
            >
              {busy ? 'Deleting…' : 'Delete'}
            </button>
            <button
              type="button"
              data-testid="m-delete-confirm-no"
              onClick={() => setConfirming(false)}
              className="flex min-h-[44px] flex-1 items-center justify-center rounded-[12px] border border-white/25 text-[15px] font-semibold text-white"
            >
              Keep
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center gap-[10px] py-[8px]">
      <dt className="w-[70px] shrink-0 text-[13px] text-m6m-muted-navy">{label}</dt>
      <dd className={`min-w-0 flex-1 text-[14px] text-[#cdd6e8] ${mono ? 'font-mono' : ''}`}>
        {value}
      </dd>
    </div>
  );
}

/** §4.9's 56px action tiles. */
function ActionTile({
  testId,
  label,
  onClick,
  href,
  download,
  danger,
  disabled,
}: {
  testId: string;
  label: string;
  onClick?: () => void;
  href?: string;
  download?: string;
  danger?: boolean;
  disabled?: boolean;
}) {
  const cls = `flex h-[56px] flex-col items-center justify-center rounded-[12px] text-[12px] font-semibold ${
    danger ? 'text-[#f0908a]' : 'text-white'
  } ${disabled ? 'opacity-40' : ''}`;
  const style = danger
    ? { backgroundColor: 'rgba(192,54,44,.16)' }
    : { backgroundColor: 'rgba(255,255,255,.08)' };

  if (href && !disabled) {
    return (
      <a href={href} download={download} data-testid={testId} className={cls} style={style}>
        {label}
      </a>
    );
  }
  return (
    <button type="button" data-testid={testId} onClick={onClick} disabled={disabled} className={cls} style={style}>
      {label}
    </button>
  );
}
