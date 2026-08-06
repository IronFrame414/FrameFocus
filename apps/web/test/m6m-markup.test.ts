import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { createElement } from 'react';
import {
  MARKUP_SCHEMA_VERSION,
  createEmptyMarkup,
  type MarkupData,
  type MarkupShape,
} from '@framefocus/shared/types/markup';
import {
  nextPinNumber,
  pinsOf,
  hasMarkup,
  derivativePathFor,
  isDerivativePath,
  shareTargetFor,
  strokeFloorWidth,
  pinDiameter,
  STROKE_FLOOR_DEVICE_PX,
} from '@framefocus/shared/utils/markup';
import { MarkupViewer, MarkupShapes } from '@framefocus/shared/components/MarkupViewer';

// M6M §4.10a / §4.7a — the markup rules that need no browser.
//
// These are the [unit] halves of A-23j, A-23o, A-23t and the whole of
// A-29, A-29b, A-29c, A-29e, A-29f, A-29g and A-29h. The browser halves live in
// e2e/m-photos.spec.ts.
//
// The pin-numbering block is the one to read twice: §4.10a.2 calls `max + 1`
// "the detail most likely to be got wrong", and `count + 1` produces a DUPLICATE
// that is invisible until someone quotes a pin number out loud.

const v1Payload: MarkupData = {
  version: 1,
  imageWidth: 400,
  imageHeight: 300,
  shapes: [
    { id: 'a', type: 'arrow', x1: 10, y1: 10, x2: 90, y2: 90, color: '#ff0000', strokeWidth: 4 },
    { id: 'c', type: 'circle', cx: 50, cy: 50, rx: 20, ry: 10, color: '#00ff00', strokeWidth: 3 },
    { id: 'r', type: 'rectangle', x: 5, y: 5, width: 40, height: 20, color: '#0000ff', strokeWidth: 2 },
    { id: 'p', type: 'pen', points: [{ x: 1, y: 1 }, { x: 2, y: 2 }], color: '#ffffff', strokeWidth: 5 },
    { id: 't', type: 'text', x: 20, y: 30, content: 'crack', color: '#000000', fontSize: 24 },
  ],
};

describe('§4.10a — schema v2', () => {
  it('MARKUP_SCHEMA_VERSION is 2 and createEmptyMarkup stamps it', () => {
    expect(MARKUP_SCHEMA_VERSION).toBe(2);
    expect(createEmptyMarkup(100, 50)).toEqual({
      version: 2,
      imageWidth: 100,
      imageHeight: 50,
      shapes: [],
    });
  });

  it('A-29 · a v1 payload is not rewritten on read', () => {
    // "not rewritten on read" — a reader that helpfully upgraded stored rows
    // would silently churn every payload in the table.
    const snapshot = JSON.parse(JSON.stringify(v1Payload));
    hasMarkup(v1Payload);
    pinsOf(v1Payload.shapes);
    nextPinNumber(v1Payload.shapes);
    renderToString(createElement(MarkupShapes, { shapes: v1Payload.shapes }));
    expect(v1Payload).toEqual(snapshot);
    expect(v1Payload.version).toBe(1); // still 1 on disk
  });

  it('A-29 · a v1 payload renders the same marks before and after the change', () => {
    const svg = renderToString(createElement(MarkupShapes, { shapes: v1Payload.shapes }));
    // All five v1 members still render, with their v1 field shapes.
    expect(svg).toContain('<line');
    expect(svg).toContain('<ellipse');
    expect(svg).toContain('<rect');
    expect(svg).toContain('<polyline');
    expect(svg).toContain('crack');
  });

  it('A-29b · an unknown shape type is SKIPPED, and everything else still renders', () => {
    const withAlien = [
      ...v1Payload.shapes,
      // A shape from some future schema this build has never heard of.
      { id: 'x', type: 'hologram', color: '#fff' } as unknown as MarkupShape,
    ];
    // The assertion is as much that this does not THROW as what it renders —
    // had any renderer used an exhaustive `never` check, a forward payload
    // would take the whole screen down.
    const svg = renderToString(createElement(MarkupShapes, { shapes: withAlien }));
    expect(svg).toContain('crack');
    expect(svg).not.toContain('hologram');
  });

  it('A-29c · pins render on a payload whose version reads 1', () => {
    // §4.10a.4's flagged trap: a v1 desktop save stamps `version: 1` over
    // content that contains v2 pins, so the field LIES. A reader that gated on
    // it — `if (version < 2) skipPins()` — passes every other criterion here
    // and drops pins after one desktop round-trip.
    const lying: MarkupData = {
      version: 1,
      imageWidth: 400,
      imageHeight: 300,
      shapes: [{ id: 'pin1', type: 'pin', x: 10, y: 10, color: '#f2453d', number: 7 }],
    };
    const svg = renderToString(
      createElement(MarkupViewer, { imageUrl: 'http://x/y.png', markup: lying })
    );
    expect(svg).toContain('<circle');
    expect(svg).toContain('7');
  });
});

describe('§4.10a.2 — pin numbers are STORED, and the sequence has gaps', () => {
  const pin = (id: string, number: number): MarkupShape => ({
    id,
    type: 'pin',
    x: 0,
    y: 0,
    color: '#f2453d',
    number,
  });

  it('A-29h · the first pin on a photo with no pins is 1', () => {
    expect(nextPinNumber([])).toBe(1);
    // `max` over an empty set is 0 — an off-by-one here starts every photo at
    // 0 or 2.
    expect(nextPinNumber(v1Payload.shapes)).toBe(1); // no pins among v1 shapes
  });

  it('A-29g · after deleting a middle pin the next number is max + 1, NEVER count + 1', () => {
    const survivors = [pin('a', 1), pin('c', 3)]; // pin 2 was deleted
    expect(survivors.length + 1).toBe(3); // what `count + 1` would have produced
    expect(nextPinNumber(survivors)).toBe(4); // ...and it would DUPLICATE pin 3
  });

  it('A-29f · deleting a middle pin leaves the survivors renumbered NOT AT ALL', () => {
    const all = [pin('a', 1), pin('b', 2), pin('c', 3)];
    const survivors = all.filter((s) => s.id !== 'b');
    expect(pinsOf(survivors).map((p) => p.number)).toEqual([1, 3]);

    const svg = renderToString(createElement(MarkupShapes, { shapes: survivors }));
    expect(svg).toContain('>1<');
    expect(svg).toContain('>3<');
    expect(svg).not.toContain('>2<'); // a build that "tidied up" would show 1,2
  });

  it('A-29e · the number is stored, so reordering the array changes nothing', () => {
    const ordered = [pin('a', 1), pin('b', 5), pin('c', 9)];
    const shuffled = [ordered[2], ordered[0], ordered[1]];
    const numbersOf = (s: MarkupShape[]) => pinsOf(s).map((p) => p.number).sort((x, y) => x - y);
    expect(numbersOf(shuffled)).toEqual(numbersOf(ordered));
    expect(nextPinNumber(shuffled)).toBe(nextPinNumber(ordered));
    expect(nextPinNumber(shuffled)).toBe(10);
  });

  it('the freed number is never reclaimed across repeated add/delete cycles', () => {
    let shapes: MarkupShape[] = [];
    shapes = [...shapes, pin('1', nextPinNumber(shapes))]; // 1
    shapes = [...shapes, pin('2', nextPinNumber(shapes))]; // 2
    shapes = [...shapes, pin('3', nextPinNumber(shapes))]; // 3
    shapes = shapes.filter((s) => s.id !== '2'); // delete the middle
    shapes = [...shapes, pin('4', nextPinNumber(shapes))]; // 4, not 3
    expect(pinsOf(shapes).map((p) => p.number)).toEqual([1, 3, 4]);
  });
});

describe('§4.10 — markup presence and the derivative path', () => {
  it('an EMPTY shapes array is not markup', () => {
    // A photo opened in the editor and saved with nothing drawn must not start
    // claiming to be annotated (A-23h).
    expect(hasMarkup(createEmptyMarkup(10, 10))).toBe(false);
    expect(hasMarkup(null)).toBe(false);
    expect(hasMarkup(undefined)).toBe(false);
    expect(hasMarkup({})).toBe(false);
    expect(hasMarkup(v1Payload)).toBe(true);
  });

  it('the derivative path keeps the company/project prefix and is deterministic', () => {
    const original = 'comp-uuid/proj-uuid/abc-photo.jpg';
    const d = derivativePathFor(original);
    // Same folder — every storage policy keys on (storage.foldername(name))[1]
    // and [2], so a path that moved the object would fall outside both.
    expect(d.startsWith('comp-uuid/proj-uuid/')).toBe(true);
    // Deterministic: the same input always yields the same object, which is
    // what makes "overwrite in place" possible (A-23c).
    expect(derivativePathFor(original)).toBe(d);
    expect(isDerivativePath(d)).toBe(true);
    expect(isDerivativePath(original)).toBe(false);
  });
});

describe('A-23t — sharing degrades to the original WITH A WARNING', () => {
  it('warns when an annotated photo has no derivative', () => {
    const target = shareTargetFor({
      hasMarkup: true,
      derivativeMissing: true,
      displayUrl: 'http://x/original.png',
      originalUrl: 'http://x/original.png',
    });
    expect(target.url).toBe('http://x/original.png');
    expect(target.degraded).toBe(true);
    // The silent case is the dangerous one — a sub receives what looks like a
    // plain photo and cannot know the circle never made it.
    expect(target.warning).toBeTruthy();
  });

  it('shares the derivative, with no warning, when it exists', () => {
    const target = shareTargetFor({
      hasMarkup: true,
      derivativeMissing: false,
      displayUrl: 'http://x/original.png.markup.jpg',
      originalUrl: 'http://x/original.png',
    });
    expect(target.url).toContain('.markup.jpg');
    expect(target.degraded).toBe(false);
    expect(target.warning).toBeNull();
  });

  it('an unannotated photo shares the original and never warns', () => {
    const target = shareTargetFor({
      hasMarkup: false,
      derivativeMissing: false,
      displayUrl: 'http://x/original.png',
      originalUrl: 'http://x/original.png',
    });
    expect(target.degraded).toBe(false);
    expect(target.warning).toBeNull();
  });
});

describe('A-23o — the stroke floor (M-10 authoring only)', () => {
  it('raises a sub-floor stroke to exactly the floor', () => {
    // 20 image units at scale 0.03 renders at 0.6px — sub-pixel, invisible.
    const raised = strokeFloorWidth(20, 0.03);
    expect(raised * 0.03).toBeCloseTo(STROKE_FLOOR_DEVICE_PX, 5);
    expect(raised).toBeGreaterThan(20);
  });

  it('NEVER lowers a stroke that already clears the floor', () => {
    // A deliberately heavy mark stays heavy.
    expect(strokeFloorWidth(20, 1)).toBe(20);
    expect(strokeFloorWidth(200, 0.5)).toBe(200);
  });

  it('touches weight only — never position, size or geometry', () => {
    const shape: MarkupShape = {
      id: 'r',
      type: 'rectangle',
      x: 5,
      y: 7,
      width: 40,
      height: 20,
      color: '#f2453d',
      strokeWidth: 20,
    };
    const svg = renderToString(createElement(MarkupShapes, { shapes: [shape], scale: 0.03 }));
    expect(svg).toContain('x="5"');
    expect(svg).toContain('y="7"');
    expect(svg).toContain('width="40"');
    expect(svg).toContain('height="20"');
  });

  it('is inert for a degenerate scale rather than producing Infinity', () => {
    expect(strokeFloorWidth(20, 0)).toBe(20);
    expect(strokeFloorWidth(20, Number.NaN)).toBe(20);
  });
});

describe('A-29j — the pin has its own minimum diameter, not the stroke floor', () => {
  it('holds a legible diameter when scaled down', () => {
    // A pin carries NO strokeWidth, so strokeFloorWidth cannot rescue it —
    // without its own rule it is the one mark type that silently vanishes.
    const d = pinDiameter(0.05);
    expect(d * 0.05).toBeCloseTo(18, 5);
    expect(d).toBeGreaterThan(34);
  });

  it('never shrinks a pin below its authored size at generous scales', () => {
    expect(pinDiameter(1)).toBe(34);
    expect(pinDiameter(4)).toBe(34);
  });

  it('renders a numbered marker, not a bare dot', () => {
    const svg = renderToString(
      createElement(MarkupShapes, {
        shapes: [{ id: 'p', type: 'pin', x: 4, y: 4, color: '#f2453d', number: 12 }],
        scale: 0.05,
      })
    );
    expect(svg).toContain('<circle');
    expect(svg).toContain('12');
  });
});

describe('§4.7a.2 — one SVG, one viewBox, per-surface fit', () => {
  it('defaults to `meet` and accepts `slice`', () => {
    const meet = renderToString(
      createElement(MarkupViewer, { imageUrl: 'http://x/y.png', markup: v1Payload })
    );
    expect(meet).toContain('preserveAspectRatio="xMidYMid meet"');

    const slice = renderToString(
      createElement(MarkupViewer, {
        imageUrl: 'http://x/y.png',
        markup: v1Payload,
        fit: 'xMidYMid slice' as const,
      })
    );
    expect(slice).toContain('preserveAspectRatio="xMidYMid slice"');
  });

  it('puts the image and the shapes in ONE svg sharing ONE viewBox', () => {
    const svg = renderToString(
      createElement(MarkupViewer, { imageUrl: 'http://x/y.png', markup: v1Payload })
    );
    expect(svg).toContain('viewBox="0 0 400 300"');
    // One <svg>, and the <image> inside it — not an <img> with a sibling SVG,
    // which would drift at every size that is not the authoring size.
    expect(svg.match(/<svg/g)?.length).toBe(1);
    expect(svg).toContain('<image');
  });
});
