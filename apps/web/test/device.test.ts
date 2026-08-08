import { describe, it, expect } from 'vitest';
import { isPhoneUserAgent, defaultSignedInPath } from '@/lib/device';
import { safeNextPath } from '@/lib/safe-next';

// D-12's sign-in landing. The UA strings are real ones, not invented shapes —
// a hand-written "Mobile Android" would pass a test the field would fail.

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const ANDROID_PHONE =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const ANDROID_TABLET =
  'Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const IPAD_DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const IPAD_LEGACY_UA =
  'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const MAC_CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

describe('isPhoneUserAgent', () => {
  it('recognises phones', () => {
    expect(isPhoneUserAgent(IPHONE)).toBe(true);
    expect(isPhoneUserAgent(ANDROID_PHONE)).toBe(true);
  });

  it('does NOT treat an Android TABLET as a phone — the `Mobile` token is the test', () => {
    // Android tablets omit `Mobile`. A naive /android/ match would send a
    // 12-inch tablet to the field app.
    expect(isPhoneUserAgent(ANDROID_TABLET)).toBe(false);
  });

  it('does not treat an iPad as a phone, in EITHER of its two user agents', () => {
    // The accepted wrong answer, pinned so it is visible if anyone changes it:
    // iPadOS reports a Macintosh UA by default, and there is no server-side way
    // to tell it from a laptop.
    expect(isPhoneUserAgent(IPAD_DESKTOP_UA)).toBe(false);
    expect(isPhoneUserAgent(IPAD_LEGACY_UA)).toBe(false);
  });

  it('does not treat desktops as phones', () => {
    expect(isPhoneUserAgent(MAC_CHROME)).toBe(false);
    expect(isPhoneUserAgent(WINDOWS)).toBe(false);
  });

  it('is safe on a missing or empty header — biased towards the desktop', () => {
    expect(isPhoneUserAgent(null)).toBe(false);
    expect(isPhoneUserAgent(undefined)).toBe(false);
    expect(isPhoneUserAgent('')).toBe(false);
  });
});

describe('defaultSignedInPath', () => {
  it('a phone lands on /m and everything else on /dashboard', () => {
    expect(defaultSignedInPath(IPHONE)).toBe('/m');
    expect(defaultSignedInPath(ANDROID_PHONE)).toBe('/m');
    expect(defaultSignedInPath(MAC_CHROME)).toBe('/dashboard');
    expect(defaultSignedInPath(ANDROID_TABLET)).toBe('/dashboard');
    expect(defaultSignedInPath(null)).toBe('/dashboard');
  });
});

describe('?next= overrides the device default — ONE mechanism, not two', () => {
  it('an explicit destination wins on both device classes', () => {
    expect(safeNextPath('/m/timeclock', defaultSignedInPath(MAC_CHROME))).toBe('/m/timeclock');
    expect(safeNextPath('/dashboard/projects', defaultSignedInPath(IPHONE))).toBe(
      '/dashboard/projects'
    );
  });

  it('and an UNSAFE next falls back to the DEVICE default, not to /dashboard', () => {
    // The composition that matters: the open-redirect guard must not quietly
    // undo D-12 by falling back to the hard-coded constant.
    expect(safeNextPath('//evil.example', defaultSignedInPath(IPHONE))).toBe('/m');
    expect(safeNextPath(null, defaultSignedInPath(IPHONE))).toBe('/m');
  });
});
