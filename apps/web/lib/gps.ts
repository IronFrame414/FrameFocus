import type { GpsRecord } from '@/lib/services/time-tracking-client';

// D-34's GPS capture — ONE implementation, for both the mobile shell and the
// desktop clock modal.
//
// WHY THIS MOVED HERE [S106]
//   The mapping lived in app/m/timeclock/capture-gps.ts and desktop could not
//   reach it — /dashboard must not import from the mobile tree — so
//   clock-modal.tsx carried its own version that resolved `undefined` on
//   failure. That collapsed two distinct states into NULL and is exactly the
//   duplication that produced the A-7k5 reader bug (Ruling 3). The mapping is
//   the part that must never diverge: it is the vocabulary every reader
//   depends on.
//
// ---------------------------------------------------------------------------
// THE COLUMN IS THREE-STATE. NULL IS RESERVED FOR "NOT ATTEMPTED".
// ---------------------------------------------------------------------------
//   coordinates   a fix was obtained
//   a reason      capture was ATTEMPTED AND FAILED — {reason, error_code}
//   NULL          capture was NEVER ATTEMPTED: companies.gps_clock_mode = 'off',
//                 or a legacy row written before D-34
//
//   This function NEVER resolves undefined. A caller that is skipping capture
//   on purpose (gps_clock_mode 'off') must not call it at all — that is what
//   keeps NULL meaning "not attempted" rather than "we lost the signal".
//
//   The three rules it implements (§4.12.1a):
//     1. No opt-out at the surface — every clock event calls it (A-7k4).
//     2. Never blocking — it ALWAYS RESOLVES; the promise never rejects, so no
//        caller can make a clock action wait on a spinner or fail a shift.
//     3. The reason is recorded, in the browser's OWN error vocabulary
//        (GeolocationPositionError 1/2/3), so "denied" and "no signal" stop
//        looking alike in the data (A-7k2, A-7k3).
//
// The timeout is a ceiling on how long a fix may take to ARRIVE, not a gate on
// the clock event, and it is a PARAMETER because the two surfaces legitimately
// differ: the field app waits longer than an office desktop does.

/** Mobile's ceiling — a jobsite fix can be slow. */
export const FIELD_FIX_TIMEOUT_MS = 10_000;
/** Desktop's ceiling — preserves the clock modal's original 5s behaviour. */
export const DESKTOP_FIX_TIMEOUT_MS = 5_000;

const REASON_BY_CODE: Record<number, 'permission_denied' | 'position_unavailable' | 'timeout'> = {
  1: 'permission_denied',
  2: 'position_unavailable',
  3: 'timeout',
};

export function captureGps(timeoutMs: number = FIELD_FIX_TIMEOUT_MS): Promise<GpsRecord> {
  const captured_at = new Date().toISOString();

  // The fourth state §4.12.1a flags: the API absent entirely. No browser code
  // exists for it; `unsupported` with a null error_code is the extension the
  // spec records. Note this is still an ATTEMPT — it is not NULL.
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
      { timeout: timeoutMs, maximumAge: 60_000 }
    );
  });
}
