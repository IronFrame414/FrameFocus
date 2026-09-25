// S111 — photo grid thumbnails and load-ahead. SHARED by both grids (desktop
// /dashboard/projects/[id]/photos and /m/p/[projectId]/photos), so it lives in
// lib/ rather than under either surface (CLAUDE.md, PARITY: location is a claim
// about ownership).
//
// ---------------------------------------------------------------------------
// WHY THIS EXISTS [RULED Josh, S111 D]
// ---------------------------------------------------------------------------
// Measured on production: a project Photos page moved 45.9 MB over 108
// requests, the largest tile 4.2 MB. Every tile was the full-resolution
// original (up to 4032x3024) squeezed into a ~184 px square.
//
//   1. The grid serves ONE thumbnail size, 400x400 cover, from Supabase Storage
//      image transformation (/render/image/). One size for every surface is
//      the ruling: the largest measured need is 184 CSS px at 2x = 368 device
//      px (desktop 1440), and /m at 3x needs 352 (402 wide) / 310 (360 wide).
//   2. The grid NEVER loads an original. The original is fetched only when a
//      photo is opened (markup / viewer), which keeps using `displayUrl`.
//   3. Images load AHEAD of the viewport, not all at once, and keep loading as
//      the user scrolls: ~2 screens on desktop, ~12 on mobile (touch scrolling
//      outruns a mouse wheel), reduced on a slow connection or data-saver.
//   4. Uploads keep full resolution. Nothing here resizes at upload.
// ---------------------------------------------------------------------------

/** The one thumbnail edge, in device pixels. See (1) above. */
export const THUMB_PX = 400;

/** The storage transform every grid thumbnail is signed with. */
export const THUMB_TRANSFORM = { width: THUMB_PX, height: THUMB_PX, resize: 'cover' } as const;

export type GridSurface = 'desktop' | 'mobile';

/** Load-ahead depth, in SCREENS (viewport heights) beyond the visible one. */
export const BUFFER_SCREENS = {
  desktop: 2,
  mobile: 12,
  /** Mobile when the browser reports a slow connection or data-saver. */
  mobileConstrained: 3,
} as const;

/**
 * What the browser tells us about the connection — the Network Information
 * API (`navigator.connection`). ⚠️ Chromium-only: Safari (every iPhone) and
 * Firefox do not expose it, so on those browsers nothing is reported and the
 * full buffer applies. That is a known blind spot, not a detection.
 */
export interface ConnectionHint {
  saveData?: boolean;
  effectiveType?: string;
}

/** Slow means the browser's own estimate is 3g or worse, or data-saver is on. */
export function isConstrained(hint: ConnectionHint | undefined | null): boolean {
  if (!hint) return false;
  if (hint.saveData === true) return true;
  return hint.effectiveType === 'slow-2g' || hint.effectiveType === '2g' || hint.effectiveType === '3g';
}

export function bufferScreens(surface: GridSurface, hint: ConnectionHint | undefined | null): number {
  if (surface === 'desktop') return BUFFER_SCREENS.desktop;
  return isConstrained(hint) ? BUFFER_SCREENS.mobileConstrained : BUFFER_SCREENS.mobile;
}

/**
 * The IntersectionObserver rootMargin for a buffer of N screens. Percentages
 * in rootMargin are of the ROOT's size, so `200%` top/bottom is two root
 * heights — "screens" when the root is the scroll container the grid sits in.
 * Applied above as well as below so scrolling back up is covered too.
 */
export function rootMarginFor(screens: number): string {
  return `${screens * 100}% 0px ${screens * 100}% 0px`;
}
