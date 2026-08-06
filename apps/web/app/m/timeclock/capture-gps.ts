// M6M §4.12.1a — D-34's capture for the mobile shell.
//
// MOVED [S106] to `@/lib/gps` and re-exported here, keeping mobile's 10s field
// ceiling by taking the default. The mapping had to become reachable from BOTH
// trees: the desktop clock modal carried its own copy that resolved
// `undefined` on failure, collapsing "attempted and failed" into the NULL that
// means "never attempted". That is the same duplication which produced the
// A-7k5 reader bug — and /dashboard cannot import from the mobile tree, so a
// neutral home under lib/ is what lets one mapping serve both surfaces.
//
// The three rules (no opt-out, never blocking, the reason is recorded) and the
// three-state model are documented at the implementation.
export { captureGps } from '@/lib/gps';

/**
 * A-7k5 — "on site" is about COORDINATES, never about gps_in being non-null.
 *
 * MOVED [S106] to `@framefocus/shared/utils/time-tracking` and re-exported
 * here so mobile callers and the existing unit suite keep one import path.
 * It had to move to be shared at all: the desktop timesheet surfaces that
 * were re-deriving it (wrongly) cannot import from the mobile tree.
 */
export { hasCoordinates } from '@framefocus/shared/utils/time-tracking';

/** Straight-line metres between a fix and a project's coordinates. */
export function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
