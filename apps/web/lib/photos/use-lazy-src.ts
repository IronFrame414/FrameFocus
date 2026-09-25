'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { bufferScreens, rootMarginFor, type ConnectionHint, type GridSurface } from './thumbnail';

// S111 — load a grid tile's image only once it is within the surface's buffer
// of the visible area (lib/photos/thumbnail.ts). Shared by both grids.
//
// ⚠️ THE ROOT IS THE NEAREST SCROLL CONTAINER, NOT THE WINDOW. /m scrolls inside
// `main[data-testid=m-content]` (overflow-y: auto). With the implicit window
// root, a tile below that container's fold is CLIPPED by it, so rootMargin
// would expand a viewport the tile can never intersect — nothing past the
// first screen would ever load early. Observing against the actual scroller
// makes rootMargin's percentages mean "screens of that scroller".
//
// ONE observer per (root, margin), shared by every tile under it — a grid of
// thousands must not create thousands of observers.
//
// Once a tile is inside the buffer it stays loaded: the buffer only has to stay
// AHEAD of the user; nothing is ever unloaded.
//
// ---------------------------------------------------------------------------
// ⚠️ THE BUFFER IS FILLED THROUGH A QUEUE, NOT IN ONE BURST — MEASURED.
// ---------------------------------------------------------------------------
// /m's 12-screen buffer put all 80 fixture tiles in range at once, and firing
// 80 image requests together got 22–33 of them refused by Storage ("SlowDown",
// "Too many connections issued to the database" — a JSON body Chrome then
// discards as net::ERR_BLOCKED_BY_ORB). So at most MAX_IN_FLIGHT images load
// at a time, in the order tiles came into range (nearest first, since the
// observer reports in document order), and a failed load is retried with
// backoff before the tile is shown as broken. The buffer is unchanged — every
// tile in it still loads; it just does not all start in the same instant.

const MAX_IN_FLIGHT = 6;
const RETRIES = 3;

let inFlight = 0;
const waiting: Array<() => void> = [];

function pump() {
  while (inFlight < MAX_IN_FLIGHT && waiting.length) waiting.shift()!();
}

/** Queue `start` for a load slot; returns a cancel for a tile that unmounts first. */
function acquire(start: () => void): () => void {
  let cancelled = false;
  const go = () => {
    if (cancelled) return;
    inFlight++;
    start();
  };
  if (inFlight < MAX_IN_FLIGHT) go();
  else waiting.push(go);
  return () => {
    cancelled = true;
    const i = waiting.indexOf(go);
    if (i >= 0) waiting.splice(i, 1);
  };
}

function release() {
  inFlight = Math.max(0, inFlight - 1);
  pump();
}

type Entry = { observer: IntersectionObserver; callbacks: Map<Element, () => void> };
const registry = new Map<Element | null, Map<string, Entry>>();

function scrollParent(el: Element): Element | null {
  let node = el.parentElement;
  while (node && node !== document.body && node !== document.documentElement) {
    const oy = getComputedStyle(node).overflowY;
    // No "is it overflowing yet" test: at mount the container may simply not
    // be full, and it is still the thing that will scroll.
    if (oy === 'auto' || oy === 'scroll') return node;
    node = node.parentElement;
  }
  return null; // the viewport
}

function observe(el: Element, root: Element | null, margin: string, cb: () => void): () => void {
  let byMargin = registry.get(root);
  if (!byMargin) registry.set(root, (byMargin = new Map()));
  let entry = byMargin.get(margin);
  if (!entry) {
    const callbacks = new Map<Element, () => void>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const fn = callbacks.get(e.target);
          if (fn) fn();
        }
      },
      { root, rootMargin: margin }
    );
    entry = { observer, callbacks };
    byMargin.set(margin, entry);
  }
  entry.callbacks.set(el, cb);
  entry.observer.observe(el);
  const e = entry;
  return () => {
    e.observer.unobserve(el);
    e.callbacks.delete(el);
  };
}

function connectionHint(): ConnectionHint | undefined {
  if (typeof navigator === 'undefined') return undefined;
  return (navigator as Navigator & { connection?: ConnectionHint }).connection;
}

/**
 * `ref` goes on the <img>; `src` is `undefined` until the tile is within the
 * buffer AND holds a load slot, then the URL (with a `_r=n` suffix on a retry,
 * which Storage ignores — measured 200). Wire `onLoad`/`onError` to the
 * element's events: they free the slot, and `onError` returns TRUE when it has
 * scheduled a retry, so the caller should not show the tile as broken yet.
 *
 * `ref` is a CALLBACK ref, and the element is held in state, so a REMOUNTED
 * element is observed again. /m's tile swaps its shell (link ↔ button) when
 * selection mode toggles, which remounts the <img>; with a ref object and an
 * effect keyed only on the url, a tile not yet loaded would silently never load.
 */
export function useLazySrc<T extends Element>(
  url: string | null,
  surface: GridSurface
): {
  ref: (node: T | null) => void;
  src: string | undefined;
  /** Within the buffer — loading, queued for a slot, or backing off. */
  inRange: boolean;
  onLoad: () => void;
  onError: () => boolean;
} {
  const [el, setEl] = useState<T | null>(null);
  const [near, setNear] = useState(false);
  // 'idle' → waiting for range or a slot; 'loading' → holds a slot, src set;
  // 'retry' → backing off after an error; 'done' → loaded or given up.
  const [phase, setPhase] = useState<'idle' | 'loading' | 'retry' | 'done'>('idle');
  const [attempt, setAttempt] = useState(0);
  const holding = useRef(false);
  const ref = useCallback((node: T | null) => setEl(node), []);

  useEffect(() => {
    if (near || !url || !el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setNear(true); // no observer: load, rather than never load
      return;
    }
    const margin = rootMarginFor(bufferScreens(surface, connectionHint()));
    return observe(el, scrollParent(el), margin, () => setNear(true));
  }, [near, url, surface, el]);

  useEffect(() => {
    if (!near || !url || phase !== 'idle') return;
    return acquire(() => {
      holding.current = true;
      setPhase('loading');
    });
  }, [near, url, phase]);

  const free = useCallback(() => {
    if (!holding.current) return;
    holding.current = false;
    release();
  }, []);

  // Free the slot if the tile unmounts mid-load.
  useEffect(() => free, [free]);

  const onLoad = useCallback(() => {
    free();
    setPhase('done');
  }, [free]);

  const onError = useCallback((): boolean => {
    free();
    // ⚠️ RETRY THUMBNAILS ONLY — MEASURED. A stored thumbnail is always a
    // decodable WebP, so its error is transient (Storage "SlowDown"). A tile on
    // the FULL-FILE fallback can fail for good — a HEIC original Chrome cannot
    // decode — and retrying it re-downloaded a multi-MB original 4 times: 236
    // requests / 409.6 MB for 80 photos, against 133.5 MB of originals.
    if (!url || !/\.thumb\.webp\?/.test(url) || attempt >= RETRIES) {
      setPhase('done');
      return false;
    }
    setPhase('retry');
    setTimeout(() => {
      setAttempt(attempt + 1);
      setPhase('idle');
    }, 500 * 2 ** attempt);
    return true;
  }, [attempt, free, url]);

  const loadingOrDone = phase === 'loading' || phase === 'done';
  const src =
    loadingOrDone && url ? (attempt === 0 ? url : `${url}${url.includes('?') ? '&' : '?'}_r=${attempt}`) : undefined;
  return { ref, src, inRange: near, onLoad, onError };
}
