import type { GpsRecord } from '@/lib/services/time-tracking-client';

// M6M §4.12.1a — D-34's capture, in one place so clock-in and clock-out cannot
// diverge on the mapping.
//
// THE THREE RULES, RESTATED WHERE THEY ARE IMPLEMENTED:
//   1. No opt-out — this function is called at EVERY clock event, and nothing
//      anywhere offers a control that skips it (A-7k4).
//   2. Never blocking — it ALWAYS RESOLVES. A denied permission, a dead signal
//      and a timeout each resolve to a failure record; the promise never
//      rejects, so no caller can accidentally make the clock action wait on a
//      spinner or fail the shift (A-7k2, A-7k3).
//   3. The reason is recorded — the failure object carries the browser's OWN
//      error vocabulary (GeolocationPositionError codes 1/2/3), so "denied"
//      and "no signal" stop looking alike in the data.
//
// The 10s timeout is a ceiling on how long a fix may take to ARRIVE, not a gate
// on the clock event — clockIn() is called with whatever this resolved to, and
// the shift starts either way.

const FIX_TIMEOUT_MS = 10_000;

const REASON_BY_CODE: Record<number, 'permission_denied' | 'position_unavailable' | 'timeout'> = {
  1: 'permission_denied',
  2: 'position_unavailable',
  3: 'timeout',
};

export function captureGps(): Promise<GpsRecord> {
  const captured_at = new Date().toISOString();

  // The fourth state §4.12.1a flags: the API absent entirely. No browser code
  // exists for it; `unsupported` with a null error_code is the extension the
  // spec records.
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.resolve({ reason: 'unsupported', error_code: null, captured_at });
  }

  return new Promise<GpsRecord>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          captured_at,
        }),
      (err) =>
        resolve({
          reason: REASON_BY_CODE[err.code] ?? 'position_unavailable',
          error_code: (err.code === 1 || err.code === 2 || err.code === 3 ? err.code : 2) as
            | 1
            | 2
            | 3,
          captured_at,
        }),
      { timeout: FIX_TIMEOUT_MS, maximumAge: 60_000 }
    );
  });
}

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
