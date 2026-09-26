import { describe, expect, it } from 'vitest';
import {
  BUFFER_SCREENS,
  THUMB_PX,
  THUMB_TRANSFORM,
  bufferScreens,
  isConstrained,
  rootMarginFor,
} from '@/lib/photos/thumbnail';

// S111 D ruling — one thumbnail size, and the load-ahead buffer per surface.

describe('S111 thumbnails — one size for every grid', () => {
  it('is 400x400 cover', () => {
    expect(THUMB_PX).toBe(400);
    expect(THUMB_TRANSFORM).toEqual({ width: 400, height: 400, resize: 'cover' });
  });

  // The measured need (D6): desktop 1440 → 183.7 css px, 1920 → 172.4; /m 402 →
  // 117.3, 360 → 103.3. 400 must cover each at its pixel ratio.
  it.each([
    ['desktop 1440 @2x', 183.7, 2],
    ['desktop 1920 @2x', 172.4, 2],
    ['/m 402 @3x', 117.3, 3],
    ['/m 360 @3x', 103.3, 3],
  ])('%s fits inside %s px', (_label, css, dpr) => {
    expect(Math.ceil(css * dpr)).toBeLessThanOrEqual(THUMB_PX);
  });
});

describe('S111 thumbnails — load-ahead buffer', () => {
  it('desktop is 2 screens whatever the connection', () => {
    expect(bufferScreens('desktop', undefined)).toBe(2);
    expect(bufferScreens('desktop', { saveData: true, effectiveType: '2g' })).toBe(2);
  });

  it('mobile is 12 screens when nothing is reported, or the connection is fast', () => {
    expect(bufferScreens('mobile', undefined)).toBe(12);
    expect(bufferScreens('mobile', {})).toBe(12);
    expect(bufferScreens('mobile', { effectiveType: '4g', saveData: false })).toBe(12);
  });

  it.each([
    [{ saveData: true, effectiveType: '4g' }],
    [{ effectiveType: '3g' }],
    [{ effectiveType: '2g' }],
    [{ effectiveType: 'slow-2g' }],
  ])('mobile drops to the constrained buffer for %j', (hint) => {
    expect(isConstrained(hint)).toBe(true);
    expect(bufferScreens('mobile', hint)).toBe(BUFFER_SCREENS.mobileConstrained);
    expect(BUFFER_SCREENS.mobileConstrained).toBeLessThan(BUFFER_SCREENS.mobile);
  });

  it('rootMargin is N root-heights above and below', () => {
    expect(rootMarginFor(2)).toBe('200% 0px 200% 0px');
    expect(rootMarginFor(12)).toBe('1200% 0px 1200% 0px');
  });
});
