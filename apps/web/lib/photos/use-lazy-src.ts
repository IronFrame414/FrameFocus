'use client';

import { useCallback, useEffect, useState } from 'react';
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
 * `ref` goes on the tile; `src` is `undefined` until the tile is within the
 * buffer, then the real URL for good.
 *
 * `ref` is a CALLBACK ref, and the element is held in state, so a REMOUNTED
 * element is observed again. /m's tile swaps its shell (link ↔ button) when
 * selection mode toggles, which remounts the <img>; with a ref object and an
 * effect keyed only on the url, a tile not yet loaded would silently never load.
 * A caller that already has a callback ref on the element calls this from it.
 */
export function useLazySrc<T extends Element>(
  url: string | null,
  surface: GridSurface
): { ref: (node: T | null) => void; src: string | undefined } {
  const [el, setEl] = useState<T | null>(null);
  const [near, setNear] = useState(false);
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

  return { ref, src: near && url ? url : undefined };
}
