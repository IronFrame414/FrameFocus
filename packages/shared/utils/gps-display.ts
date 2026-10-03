/**
 * S127 item 4c (B-1) — what a clock event's location record SAYS, in plain words.
 *
 * `time_clock_sessions.gps_in` / `gps_out` carry THREE states, built that way on
 * purpose at D-34 / S106 (`captureGps()`, `lib/gps.ts`):
 *
 *   coordinates          a fix was obtained          → show it, with a map link
 *   { reason, … }        capture was ATTEMPTED and FAILED → show the REASON
 *   NULL                 capture was NEVER ATTEMPTED  → show NOTHING
 *
 * ⚠️ THE THREE MUST STAY DISTINCT. "Location permission denied" is a policy
 * question; "No location signal" is a site condition — D-34 exists precisely so
 * they stop looking alike, and collapsing them into "no location" throws the
 * distinction away. And NULL is not a failure: it means nobody tried
 * (`gps_clock_mode = 'off'`, or a row older than D-34).
 *
 * ⚠️ A FIX IS NOT "ON SITE". No project carries a coordinate, so nothing here can
 * say the person was at the job — only where the device was.
 *
 * Dependency-free, so a server page, a client component and `/m` can all use
 * the one formatter (PARITY; the S106 two-formatters lesson).
 */

export type GpsFailureReason =
  | 'permission_denied'
  | 'position_unavailable'
  | 'timeout'
  | 'unsupported';

export type GpsDisplay =
  | { kind: 'fix'; text: string; mapUrl: string }
  | { kind: 'failure'; reason: GpsFailureReason | 'unknown'; text: string };

export const GPS_FAILURE_TEXT: Record<GpsFailureReason | 'unknown', string> = {
  permission_denied: 'Location permission denied',
  position_unavailable: 'No location signal',
  timeout: 'Location timed out',
  unsupported: 'Location not supported on this device',
  unknown: 'Location not captured',
};

const REASONS = new Set<string>([
  'permission_denied',
  'position_unavailable',
  'timeout',
  'unsupported',
]);

/** NULL in → NULL out: never attempted renders nothing. */
export function describeGps(gps: unknown): GpsDisplay | null {
  if (gps === null || gps === undefined || typeof gps !== 'object') return null;
  const g = gps as { lat?: unknown; lng?: unknown; accuracy?: unknown; reason?: unknown };
  if (
    typeof g.lat === 'number' &&
    typeof g.lng === 'number' &&
    Number.isFinite(g.lat) &&
    Number.isFinite(g.lng)
  ) {
    const lat = g.lat.toFixed(5);
    const lng = g.lng.toFixed(5);
    const acc =
      typeof g.accuracy === 'number' && Number.isFinite(g.accuracy)
        ? ` (±${Math.round(g.accuracy)} m)`
        : '';
    return {
      kind: 'fix',
      text: `${lat}, ${lng}${acc}`,
      mapUrl: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
    };
  }
  const reason =
    typeof g.reason === 'string' && REASONS.has(g.reason)
      ? (g.reason as GpsFailureReason)
      : 'unknown';
  return { kind: 'failure', reason, text: GPS_FAILURE_TEXT[reason] };
}
