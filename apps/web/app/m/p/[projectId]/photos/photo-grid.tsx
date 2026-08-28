'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useRef, useState } from 'react';
import { softDeleteFile } from '@/lib/services/files-client';
import { shareFailureNote, shareImages } from '@/lib/share-image';

// M6M §4.8 — M-8's body: day sections over a 3-column grid.
//
// ---------------------------------------------------------------------------
// EVERY TILE IS ONE FLAT <img>. NO OVERLAY IS DRAWN HERE — D-31.
// ---------------------------------------------------------------------------
// `displayUrl` is already the right file: the annotated derivative when the
// photo carries markup, the original when it does not. That decision was made
// on the server (photos.ts) precisely so this component never holds "an
// original plus some marks" and never has an opportunity to paint the wrong
// one first (A-23f, A-23s).

export type GridPhoto = {
  id: string;
  file_name: string;
  displayUrl: string | null;
  hasMarkup: boolean;
  source: 'log' | 'delivery' | 'safety' | 'punch' | null;
  /** ISO day, `YYYY-MM-DD`, precomputed on the server. */
  day: string;
  dayLabel: string;
};

/** §4.8's badge fills. The words are the signal; the fill is secondary. */
const BADGE: Record<NonNullable<GridPhoto['source']>, { label: string; fill: string }> = {
  log: { label: 'Log', fill: 'rgba(20,33,61,.72)' },
  delivery: { label: 'Delivery', fill: 'rgba(20,33,61,.72)' },
  punch: { label: 'Punch', fill: 'rgba(180,83,9,.85)' },
  safety: { label: 'Safety', fill: 'rgba(192,54,44,.85)' },
};

/** §4.8 — "Infinite scroll by day." One day-section at a time. */
const DAYS_PER_PAGE = 4;

export function PhotoGrid({
  photos,
  projectId,
  canDelete,
}: {
  photos: GridPhoto[];
  projectId: string;
  /**
   * A-25d — "the UI must not offer an action the DB will reject."
   * `files_delete_owner_admin` restricts deletion to Owner/Admin, so every
   * other role gets no Delete control at all rather than one that errors.
   */
  canDelete: boolean;
}) {
  const [visibleDays, setVisibleDays] = useState(DAYS_PER_PAGE);
  const [selection, setSelection] = useState<Set<string> | null>(null);

  // Grouped by day, newest day first. The server already sorted by created_at
  // descending, so first-seen order IS newest-first and no re-sort is needed.
  const days = useMemo(() => {
    const map = new Map<string, { label: string; items: GridPhoto[] }>();
    for (const p of photos) {
      const entry = map.get(p.day);
      if (entry) entry.items.push(p);
      else map.set(p.day, { label: p.dayLabel, items: [p] });
    }
    return [...map.entries()].map(([day, v]) => ({ day, ...v }));
  }, [photos]);

  const shown = days.slice(0, visibleDays);
  const more = days.length > visibleDays;

  // -------------------------------------------------------------------------
  // §4.8 — "Long-press enters multi-select for bulk share/delete" (A-22e).
  //
  // Long-press is a GESTURE, and the handoff's accessibility rule is "no
  // gesture without a visible equivalent". So the header also carries a Select
  // button; this is the gesture half.
  // -------------------------------------------------------------------------
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startPress = useCallback(
    (id: string) => {
      timer.current = setTimeout(() => {
        setSelection((cur) => (cur ? cur : new Set([id])));
        timer.current = null;
      }, 450);
    },
    []
  );

  const endPress = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const toggle = useCallback((id: string) => {
    setSelection((cur) => {
      if (!cur) return cur;
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selecting = selection !== null;

  return (
    <>
      {selecting ? (
        <SelectionBar
          count={selection.size}
          onCancel={() => setSelection(null)}
          photos={photos}
          selection={selection}
          canDelete={canDelete}
        />
      ) : (
        <div className="flex justify-end px-[18px] pt-[10px]">
          {/* The visible equivalent of the long-press. */}
          <button
            type="button"
            data-testid="m-select-mode"
            onClick={() => setSelection(new Set())}
            className="flex min-h-[44px] items-center rounded-full border border-m6m-border bg-m6m-card px-[14px] text-[14px] font-semibold text-m6m-navy"
          >
            Select
          </button>
        </div>
      )}

      <div className="px-[18px] pb-[18px]">
        {shown.length === 0 ? (
          <p
            data-testid="m-empty"
            className="mt-[18px] rounded-[15px] border border-dashed border-m6m-border bg-m6m-card px-[16px] py-[22px] text-center text-[15px] text-m6m-muted"
          >
            No photos on this project yet.
          </p>
        ) : (
          shown.map((section) => (
            <section key={section.day} data-testid="m-day-section" data-day={section.day}>
              {/* Mono uppercase section label — `TODAY · JUL 8 · 8`. */}
              <h2
                data-testid="m-day-label"
                className="mb-[8px] mt-[18px] font-mono text-[11px] font-medium uppercase text-m6m-muted"
                style={{ letterSpacing: '.05em' }}
              >
                {section.label} · {section.items.length}
              </h2>

              <div data-testid="m-photo-row" className="grid grid-cols-3 gap-[7px]">
                {section.items.map((p) => (
                  <Tile
                    key={p.id}
                    photo={p}
                    projectId={projectId}
                    selecting={selecting}
                    selected={selection?.has(p.id) ?? false}
                    onToggle={toggle}
                    onPressStart={startPress}
                    onPressEnd={endPress}
                  />
                ))}
              </div>
            </section>
          ))
        )}

        {more ? (
          <button
            type="button"
            data-testid="m-load-more-days"
            onClick={() => setVisibleDays((n) => n + DAYS_PER_PAGE)}
            className="mt-[18px] flex min-h-[44px] w-full items-center justify-center rounded-[14px] border border-m6m-border bg-m6m-card text-[15px] font-semibold text-m6m-navy"
          >
            Earlier days
          </button>
        ) : null}
      </div>
    </>
  );
}

function Tile({
  photo,
  projectId,
  selecting,
  selected,
  onToggle,
  onPressStart,
  onPressEnd,
}: {
  photo: GridPhoto;
  projectId: string;
  selecting: boolean;
  selected: boolean;
  onToggle: (id: string) => void;
  onPressStart: (id: string) => void;
  onPressEnd: () => void;
}) {
  // §4.7a.4 as it survives D-31 — the tile holds its PLACEHOLDER until the
  // image has loaded, then reveals. Under D-31 the forbidden intermediate is
  // no longer "shapes over a blank tile" but the ORIGINAL flashing before the
  // derivative replaces it (A-23s). This build cannot produce that: there is
  // only ever ONE src, chosen on the server. The placeholder covers the plain
  // loading interval.
  // THREE states, not a boolean. A broken image must not hold the placeholder
  // forever — but "stalled" and "loaded" must still be distinguishable, both
  // for the user (a grey square that will never resolve) and for A-23s.
  const [loadState, setLoadState] = useState<'pending' | 'loaded' | 'error'>('pending');
  const loaded = loadState !== 'pending';

  const badge = photo.source ? BADGE[photo.source] : null;

  const body = (
    <>
      <div
        aria-hidden={loaded}
        data-testid="m-tile-placeholder"
        className={`absolute inset-0 bg-[#e4e8ef] transition-opacity duration-150 ${
          loaded ? 'pointer-events-none opacity-0' : 'opacity-100'
        }`}
      />
      {photo.displayUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photo.displayUrl}
          alt={photo.file_name}
          data-testid="m-tile-image"
          // The reveal state, readable directly. Opacity alone is ambiguous
          // mid-transition; this is the fact the placeholder rule is about.
          data-loaded={loaded ? 'true' : 'false'}
          data-state={loadState}
          // THE `complete` CHECK IS NOT BELT-AND-BRACES — it is the fix for a
          // real stuck state. This markup is server-rendered, so a cached or
          // fast image can finish loading BEFORE hydration attaches `onLoad`;
          // that event has already fired and never fires again, leaving the
          // tile showing its placeholder forever. The ref runs at attach time
          // and asks the element directly.
          ref={(el) => {
            if (el?.complete && el.naturalWidth > 0) setLoadState('loaded');
          }}
          onLoad={() => setLoadState('loaded')}
          // A broken image must not hold the placeholder either — reveal the
          // element so the browser's own broken-image state is visible rather
          // than a grey square that looks like it is still loading.
          onError={() => setLoadState('error')}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-150 ${
            loaded ? 'opacity-100' : 'opacity-0'
          }`}
        />
      ) : null}

      {/* -------------------------------------------------------------------
          §4.7a.3 — THE MARKUP INDICATOR. TOP-RIGHT, CIRCULAR, ICON-ONLY (A-23q).
          Deliberately none of the things a source badge is: different corner,
          different shape, no text, neutral chrome fill. It states a property of
          the FILE ("this photo is annotated"), and must never be readable as a
          statement about where the photo came from.

          It renders from `hasMarkup` alone, so a photo whose every mark sits in
          the cropped-away band still carries it (A-23r) — which is the entire
          reason an indicator exists rather than trusting the picture.
          ------------------------------------------------------------------- */}
      {photo.hasMarkup ? (
        <span
          data-testid="m-markup-indicator"
          aria-label="Has markup"
          className="absolute right-[6px] top-[6px] flex h-[20px] w-[20px] items-center justify-center rounded-full"
          style={{ backgroundColor: 'rgba(20,33,61,.72)' }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"
              stroke="#ffffff"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      ) : null}

      {/* §4.8's source badge: bottom-left, rounded rect, filled, CARRYING TEXT.
          Untagged photos carry no badge at all (A-22). */}
      {badge ? (
        <span
          data-testid="m-source-badge"
          data-source={photo.source}
          className="absolute bottom-[6px] left-[6px] rounded-[4px] px-[5px] py-[2px] text-[9px] font-semibold leading-tight text-white"
          style={{ backgroundColor: badge.fill }}
        >
          {badge.label}
        </span>
      ) : null}

      {selecting ? (
        <span
          data-testid="m-tile-check"
          data-selected={selected ? 'true' : 'false'}
          className={`absolute left-[6px] top-[6px] h-[20px] w-[20px] rounded-full border-2 ${
            selected ? 'border-white bg-m6m-blue' : 'border-white/80 bg-black/25'
          }`}
        />
      ) : null}
    </>
  );

  const shell =
    'relative block aspect-square overflow-hidden rounded-[11px] bg-[#e4e8ef]';

  // In selection mode the tile is a control, not a link — tapping selects
  // rather than navigating away from the set being built.
  if (selecting) {
    return (
      <button
        type="button"
        data-testid="m-photo-tile"
        data-photo-id={photo.id}
        onClick={() => onToggle(photo.id)}
        className={`${shell} ${selected ? 'ring-2 ring-m6m-blue' : ''}`}
      >
        {body}
      </button>
    );
  }

  return (
    <Link
      href={`/m/p/${projectId}/photos/${photo.id}`}
      data-testid="m-photo-tile"
      data-photo-id={photo.id}
      data-has-markup={photo.hasMarkup ? 'true' : 'false'}
      onPointerDown={() => onPressStart(photo.id)}
      onPointerUp={onPressEnd}
      onPointerLeave={onPressEnd}
      onContextMenu={(e) => e.preventDefault()}
      className={shell}
    >
      {body}
    </Link>
  );
}

/** §4.8's multi-select bar — bulk share and bulk delete act on the SET (A-22e). */
function SelectionBar({
  count,
  onCancel,
  photos,
  selection,
  canDelete,
}: {
  count: number;
  onCancel: () => void;
  photos: GridPhoto[];
  selection: Set<string>;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const chosen = photos.filter((p) => selection.has(p.id));

  async function remove() {
    setBusy(true);
    // Soft delete — the trash-bin pattern, never a hard delete (CLAUDE.md).
    // Acts on THE SELECTED SET, which is what A-22e asserts.
    const results = await Promise.all(chosen.map((p) => softDeleteFile(p.id)));
    const failed = results.filter((r) => !r.success).length;
    setBusy(false);
    setConfirming(false);
    if (failed > 0) {
      setNote(`${failed} of ${chosen.length} could not be deleted.`);
      return;
    }
    onCancel();
    router.refresh();
  }

  async function share() {
    setBusy(true);
    // The Web Share API is the only share surface a PWA has. Where it is
    // absent the action says so rather than failing silently.
    // ⚠️ THE BYTES, NOT A LIST OF NAMES [S121]. This sent
    // `text: names.join(', ')` — the sheet opened, the send succeeded, and what
    // arrived was a comma-separated list of filenames. See lib/share-image.ts.
    //
    // `displayUrl` is already the right file per this file's own header: the
    // annotated derivative where one exists, the original otherwise. The
    // viewer's `shareTargetFor` degrade WARNING has no equivalent here because
    // the grid has no per-photo place to put it; a multi-select share of a
    // photo whose derivative is missing sends the original silently, which is
    // the one thing A-23t forbids on the VIEWER. Flagged rather than
    // half-solved — the honest fix is a per-photo notice this bar cannot host.
    const outcome = await shareImages(
      chosen.map((p) => ({ url: p.displayUrl, fileName: p.file_name }))
    );
    if (!outcome.ok) {
      const note = shareFailureNote(outcome.reason);
      if (note) setNote(note);
    }
    setBusy(false);
  }

  return (
    <div
      data-testid="m-selection-bar"
      className="relative flex items-center gap-[8px] border-b border-m6m-border bg-m6m-card px-[18px] py-[10px]"
    >
      <span data-testid="m-selection-count" className="flex-1 font-mono text-[13px] text-m6m-navy">
        {count} selected
      </span>
      <button
        type="button"
        data-testid="m-bulk-share"
        disabled={busy || count === 0}
        onClick={share}
        className="flex min-h-[44px] items-center rounded-full border border-m6m-border px-[14px] text-[14px] font-semibold text-m6m-navy disabled:opacity-40"
      >
        Share
      </button>
      {/* Absent entirely for a role the DB would refuse (A-25d). */}
      {canDelete ? (
        <button
          type="button"
          data-testid="m-bulk-delete"
          disabled={busy || count === 0}
          onClick={() => setConfirming(true)}
          className="flex min-h-[44px] items-center rounded-full border border-m6m-danger-border px-[14px] text-[14px] font-semibold text-m6m-danger disabled:opacity-40"
        >
          Delete
        </button>
      ) : null}
      <button
        type="button"
        data-testid="m-selection-cancel"
        onClick={onCancel}
        className="flex min-h-[44px] items-center px-[8px] text-[14px] font-semibold text-m6m-muted"
      >
        Cancel
      </button>

      {/* Delete CONFIRMS FIRST — never a one-tap destructive action. */}
      {confirming ? (
        <div
          data-testid="m-bulk-delete-confirm"
          role="dialog"
          aria-label="Confirm delete"
          className="absolute inset-x-[18px] top-[56px] z-50 rounded-[14px] border border-m6m-border bg-m6m-card p-[14px] shadow-lg"
        >
          <p className="text-[15px] font-semibold text-m6m-navy">
            Delete {count} {count === 1 ? 'photo' : 'photos'}?
          </p>
          <div className="mt-[10px] flex gap-[8px]">
            <button
              type="button"
              data-testid="m-bulk-delete-confirm-yes"
              onClick={remove}
              disabled={busy}
              className="flex min-h-[44px] flex-1 items-center justify-center rounded-[12px] bg-m6m-danger text-[15px] font-bold text-white disabled:opacity-60"
            >
              {busy ? 'Deleting…' : 'Delete'}
            </button>
            <button
              type="button"
              data-testid="m-bulk-delete-confirm-no"
              onClick={() => setConfirming(false)}
              className="flex min-h-[44px] flex-1 items-center justify-center rounded-[12px] border border-m6m-border text-[15px] font-semibold text-m6m-navy"
            >
              Keep
            </button>
          </div>
        </div>
      ) : null}

      {note ? (
        <p data-testid="m-selection-note" role="status" className="sr-only">
          {note}
        </p>
      ) : null}
    </div>
  );
}
