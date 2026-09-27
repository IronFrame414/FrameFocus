import { describe, expect, it } from 'vitest';
import {
  derivativePathFor,
  hasMarkup,
  isThumbnailPath,
  markupFingerprint,
  thumbPathFor,
} from '@framefocus/shared/utils/markup';
import * as backfill from '../../../scripts/s111-thumbnail-backfill.cjs';
// [S112 R7] the HEIC conversion script is a THIRD copy — it copies side objects
// to the names these functions compute, so it is held to the same parity.
import * as heic from '../../../scripts/s112-heic-convert.cjs';

// [S111 D] The stored-thumbnail path. The backfill script re-implements it (a
// .mjs cannot import TS); if the two ever disagree, the backfill writes
// thumbnails the grid never looks for — every photo silently stays on its
// full-size fallback. This file is what catches that.

const P = 'co/proj/uuid-photo.jpg';
const M1 = { version: 1, imageWidth: 10, imageHeight: 10, shapes: [{ kind: 'line', x1: 0, y1: 0, x2: 5, y2: 5 }] };
const M2 = { ...M1, shapes: [...M1.shapes, { kind: 'line', x1: 1, y1: 1, x2: 2, y2: 2 }] };

describe('S111 thumbnail path', () => {
  it('plain photo → {path}.thumb.webp (no markup, or markup with no shapes)', () => {
    expect(thumbPathFor(P, null)).toBe(`${P}.thumb.webp`);
    expect(thumbPathFor(P, { version: 1, shapes: [] })).toBe(`${P}.thumb.webp`);
  });

  it('annotated photo → {path}.m{8 hex}.thumb.webp', () => {
    expect(thumbPathFor(P, M1)).toMatch(/^co\/proj\/uuid-photo\.jpg\.m[0-9a-f]{8}\.thumb\.webp$/);
  });

  it('a new markup is a new name — a stale thumbnail can never be selected', () => {
    expect(thumbPathFor(P, M1)).not.toBe(thumbPathFor(P, M2));
    expect(markupFingerprint(M1)).toBe(markupFingerprint(JSON.parse(JSON.stringify(M1))));
  });

  it('every generated name is recognised as a thumbnail; the original and derivative are not', () => {
    expect(isThumbnailPath(thumbPathFor(P, null))).toBe(true);
    expect(isThumbnailPath(thumbPathFor(P, M1))).toBe(true);
    expect(isThumbnailPath(P)).toBe(false);
    expect(isThumbnailPath(`${P}.markup.jpg`)).toBe(false);
  });

  it.each([
    [null],
    [{ version: 1, shapes: [] }],
    [M1],
    [M2],
    [{ shapes: [{ text: 'ünïcødé ✓', kind: 'text' }] }],
  ])('the backfill script computes the SAME path for %j', (m) => {
    expect(backfill.thumbPathFor(P, m)).toBe(thumbPathFor(P, m));
  });

  it.each([
    [null],
    [{ version: 1, shapes: [] }],
    [M1],
    [M2],
    [{ shapes: [{ text: 'ünïcødé ✓', kind: 'text' }] }],
  ])('[S112] the HEIC conversion script computes the SAME thumbnail, fingerprint and markup flag for %j', (m) => {
    expect(heic.thumbPathFor(P, m)).toBe(thumbPathFor(P, m));
    expect(heic.hasMarkup(m)).toBe(hasMarkup(m));
    if (m) expect(heic.markupFingerprint(m)).toBe(markupFingerprint(m));
  });

  it('[S112] the HEIC conversion script computes the SAME derivative path', () => {
    expect(heic.derivativePathFor(P)).toBe(derivativePathFor(P));
    // CONTROL: the parity check can fail — a different path gives a different name
    expect(heic.derivativePathFor(`${P}.jpg`)).not.toBe(derivativePathFor(P));
  });
});
