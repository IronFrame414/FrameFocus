import { describe, expect, it } from 'vitest';
import { visitEraPhotos } from '@/lib/site-visits/photos';

// [Josh, 2026-09-23, ruling 4] The site-visit record shows VISIT-ERA photos
// only; the cutoff is promotion, inclusive.

const PROMOTED = '2026-09-23T15:00:00.000Z';
const img = (id: string, created_at: string | null) => ({ id, mime_type: 'image/jpeg', created_at });

describe('visitEraPhotos — the cutoff is promotion', () => {
  const files = [
    img('on-site', '2026-09-23T13:00:00.000Z'),
    img('after-finish-before-promotion', '2026-09-23T14:59:59.000Z'),
    img('at-promotion', PROMOTED),
    img('added-later-in-files', '2026-09-23T15:00:01.000Z'),
    { id: 'voice', mime_type: 'audio/webm', created_at: '2026-09-23T13:00:00.000Z' },
  ];

  it('keeps photos up to and including the promotion instant; drops later ones and non-images', () => {
    expect(visitEraPhotos(files, PROMOTED).map((f) => f.id)).toEqual([
      'on-site',
      'after-finish-before-promotion',
      'at-promotion',
    ]);
  });

  it('a photo added between FINISH and promotion is visit-era', () => {
    expect(visitEraPhotos(files, PROMOTED).map((f) => f.id)).toContain('after-finish-before-promotion');
  });

  it('not yet promoted → every image is visit-era (non-vacuous: the later one is back)', () => {
    expect(visitEraPhotos(files, null).map((f) => f.id)).toContain('added-later-in-files');
    expect(visitEraPhotos(files, null)).toHaveLength(4);
  });

  it('after promotion an undated image is excluded rather than guessed', () => {
    expect(visitEraPhotos([img('undated', null)], PROMOTED)).toHaveLength(0);
  });
});
