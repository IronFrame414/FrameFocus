import { describe, it, expect } from 'vitest';
import { describeGps, GPS_FAILURE_TEXT } from '@framefocus/shared/utils/gps-display';

// ============================================================================
// S127 item 4c (B-1) — the clock location's THREE states stay distinct.
// A fix shows coordinates and a map link; a failure shows its REASON in plain
// words (a policy question and a site condition must not look alike, D-34);
// NULL — never attempted — renders nothing, because it is not a failure.
// ============================================================================

describe('S127 4c — describeGps', () => {
  it('a FIX: coordinates to 5 places, accuracy rounded, a map link — never "on site"', () => {
    expect(
      describeGps({ lat: 27.947521234, lng: -82.458431, accuracy: 14.6, captured_at: 'x' })
    ).toEqual({
      kind: 'fix',
      text: '27.94752, -82.45843 (±15 m)',
      mapUrl: 'https://www.google.com/maps/search/?api=1&query=27.94752,-82.45843',
    });
    expect(describeGps({ lat: 1, lng: 2 })).toEqual({
      kind: 'fix',
      text: '1.00000, 2.00000',
      mapUrl: 'https://www.google.com/maps/search/?api=1&query=1.00000,2.00000',
    });
  });

  it('a FAILURE: each reason in its own words, and no two alike', () => {
    const texts = (
      ['permission_denied', 'position_unavailable', 'timeout', 'unsupported'] as const
    ).map((reason) => describeGps({ reason, error_code: 1, captured_at: 'x' }));
    expect(texts).toEqual([
      { kind: 'failure', reason: 'permission_denied', text: 'Location permission denied' },
      { kind: 'failure', reason: 'position_unavailable', text: 'No location signal' },
      { kind: 'failure', reason: 'timeout', text: 'Location timed out' },
      { kind: 'failure', reason: 'unsupported', text: 'Location not supported on this device' },
    ]);
    expect(new Set(Object.values(GPS_FAILURE_TEXT)).size).toBe(
      Object.keys(GPS_FAILURE_TEXT).length
    );
  });

  it('NEVER ATTEMPTED (null/undefined): nothing — not a failure', () => {
    expect(describeGps(null)).toBeNull();
    expect(describeGps(undefined)).toBeNull();
  });

  it('a record it cannot read is a failure of unknown reason, never a fix', () => {
    expect(describeGps({ reason: 'gremlins' })).toEqual({
      kind: 'failure',
      reason: 'unknown',
      text: 'Location not captured',
    });
    expect(describeGps({ lat: 'x', lng: 2 })?.kind).toBe('failure');
  });
});
