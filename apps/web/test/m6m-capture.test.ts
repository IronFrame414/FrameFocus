import { describe, it, expect, afterEach } from 'vitest';
import { captureGps, hasCoordinates, distanceMeters } from '@/app/m/timeclock/capture-gps';

// M6M §4.12.1a — the D-34 capture mapping, unit half.
//
// The three failure paths must each RESOLVE (never reject, never hang) with
// the browser's own error vocabulary — that is what makes A-7k2/A-7k3's
// stored rows distinguishable, and what guarantees no clock event can be made
// to wait on a fix. The [live] halves (what actually lands in gps_in) are in
// e2e/m-capture.spec.ts.

type GeoSuccess = (pos: {
  coords: { latitude: number; longitude: number; accuracy: number };
}) => void;
type GeoError = (err: { code: number; message: string }) => void;

function stubGeolocation(impl: (ok: GeoSuccess, fail: GeoError) => void) {
  (globalThis as Record<string, unknown>).navigator = {
    geolocation: { getCurrentPosition: impl },
  };
}

afterEach(() => {
  delete (globalThis as Record<string, unknown>).navigator;
});

describe('captureGps — D-34: always resolves, reason recorded', () => {
  it('a fix resolves to coordinates', async () => {
    stubGeolocation((ok) => ok({ coords: { latitude: 33.7, longitude: -84.4, accuracy: 12 } }));
    const rec = await captureGps();
    expect(rec).toMatchObject({ lat: 33.7, lng: -84.4, accuracy: 12 });
    expect((rec as { captured_at?: string }).captured_at).toBeTruthy();
  });

  it('PERMISSION_DENIED (1) resolves to permission_denied — the shift still starts', async () => {
    stubGeolocation((_ok, fail) => fail({ code: 1, message: 'denied' }));
    const rec = await captureGps();
    expect(rec).toMatchObject({ reason: 'permission_denied', error_code: 1 });
  });

  it('POSITION_UNAVAILABLE (2) resolves to position_unavailable — the steel-building case', async () => {
    stubGeolocation((_ok, fail) => fail({ code: 2, message: 'no signal' }));
    const rec = await captureGps();
    expect(rec).toMatchObject({ reason: 'position_unavailable', error_code: 2 });
  });

  it('TIMEOUT (3) resolves to timeout', async () => {
    stubGeolocation((_ok, fail) => fail({ code: 3, message: 'slow' }));
    const rec = await captureGps();
    expect(rec).toMatchObject({ reason: 'timeout', error_code: 3 });
  });

  it('the API absent entirely resolves to unsupported with a NULL code', async () => {
    (globalThis as Record<string, unknown>).navigator = {};
    const rec = await captureGps();
    // §4.12.1a — no browser code exists for this state, so error_code is null,
    // not an invented number.
    expect(rec).toMatchObject({ reason: 'unsupported', error_code: null });
  });
});

describe('hasCoordinates — A-7k5: "on site" is about coordinates', () => {
  it('true only for a real fix', () => {
    expect(hasCoordinates({ lat: 1, lng: 2 })).toBe(true);
    expect(hasCoordinates({ lat: 1, lng: 2, accuracy: 5 })).toBe(true);
  });

  it('false for D-34 failure objects — non-null is NOT on site', () => {
    // The live-board defect D-34 names: `gps_in != null` renders a
    // denied-permission crew member as "on site". The failure object is
    // non-null and must read as NOT on site.
    expect(hasCoordinates({ reason: 'permission_denied', error_code: 1 })).toBe(false);
    expect(hasCoordinates({ reason: 'position_unavailable', error_code: 2 })).toBe(false);
  });

  it('false for null and garbage', () => {
    expect(hasCoordinates(null)).toBe(false);
    expect(hasCoordinates(undefined)).toBe(false);
    expect(hasCoordinates({ lat: 'x', lng: 2 })).toBe(false);
  });
});

describe('distanceMeters', () => {
  it('zero for the same point, sane for a known pair', () => {
    const a = { lat: 33.749, lng: -84.388 };
    expect(distanceMeters(a, a)).toBe(0);
    // Atlanta -> Decatur is ~9-10km.
    const d = distanceMeters(a, { lat: 33.7748, lng: -84.2963 });
    expect(d).toBeGreaterThan(8000);
    expect(d).toBeLessThan(12000);
  });
});
