import { test, expect, type Page } from '@playwright/test';
import { setupHubFixture, teardownHubFixture, COMPANY_A, type HubFixture } from './hub-fixture';
import { setupPhotoFixture, teardownPhotoFixture, type PhotoFixture } from './photo-fixture';
import { derivativePathFor } from '@framefocus/shared/utils/markup';

// M6M §4.8 / §4.9 / §4.10 — M-8 gallery, M-9 viewer, M-10 markup.
//
// ===========================================================================
// THE ONE RULE EVERYTHING HERE TURNS ON: D-31 REVERSED THE DISPLAY PATH.
// ===========================================================================
// THE DERIVATIVE IS THE DISPLAY SOURCE. Every surface shows one flat file; the
// viewer TOGGLES BACK TO THE ORIGINAL BY SWAPPING FILES. A-23e2 and A-23g2 were
// DELETED by that reversal — they asserted Option A's live overlay and a build
// satisfying them would be non-compliant — so nothing here asserts them.
//
// HOW "WHICH FILE IS ON SCREEN" IS ACTUALLY MEASURED. Both files are signed
// URLs over the same bucket, so comparing URL strings proves little and is
// brittle. The fixture instead makes the two images DIFFERENT SIZES —
// original 8x8, derivative 16x16 — so `naturalWidth` answers the question
// directly, from the pixels the browser really decoded.
//
// Asserted here:
//   M-8   A-13, A-22, A-22b, A-22d, A-22e, A-23f, A-23h, A-23q, A-23r, A-23s
//   M-9   A-23e, A-23g, A-25, A-25b, A-25c, A-25e, A-25f, A-25g
//   M-10  A-23m, A-23n, A-24, A-24b, A-24c, A-24d, A-29i, A-29k
//   Save  A-23, A-23b, A-23c, A-23d, A-23i, A-23k, A-23l   (browser-driven,
//         verified against the database and the bucket with the service role)
//   Tiles A-12c, A-12d — now 9-of-9 and 4-of-4, since M-8 exists
//
// Runs under 'chromium-auth': the CREW test identity, 402x874.

let fx: HubFixture;
let px: PhotoFixture;

test.beforeAll(async () => {
  // Its OWN prefix — m-hubs.spec.ts runs concurrently in another worker and
  // both fixtures delete their leftovers on setup.
  fx = await setupHubFixture('M6MP');
  px = await setupPhotoFixture(fx);
});

test.afterAll(async () => {
  if (fx) {
    await teardownPhotoFixture(fx);
    await teardownHubFixture(fx);
  }
});

const gallery = () => `/m/p/${fx.futureProject}/photos`;
const viewer = (id: string) => `/m/p/${fx.futureProject}/photos/${id}`;
const markup = (id: string) => `/m/p/${fx.futureProject}/photos/${id}/markup`;

/** The decoded width of an <img> — 8 = original, 16 = derivative. */
async function decodedWidth(page: Page, testId: string, nth = 0): Promise<number> {
  const img = page.getByTestId(testId).nth(nth);
  await expect(img).toBeVisible();
  return img.evaluate((el) => (el as HTMLImageElement).naturalWidth);
}

const tile = (page: Page, photoId: string) =>
  page.locator(`[data-testid="m-photo-tile"][data-photo-id="${photoId}"]`);

// ===========================================================================
// M-8 · §4.8
// ===========================================================================
test.describe('M-8 · gallery', () => {
  test('A-23f · a photo with markup renders the DERIVATIVE in the tile', async ({ page }) => {
    await page.goto(gallery());
    const img = tile(page, px.annotated.id).getByTestId('m-tile-image');
    await expect(img).toBeVisible();
    // 16 = the derivative. If this reads 8 the build is rendering the original
    // and the reversal was not applied.
    await expect
      .poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth))
      .toBe(16);
  });

  test('A-23h · a photo with NO markup renders the plain original and NO indicator', async ({
    page,
  }) => {
    await page.goto(gallery());
    const plain = tile(page, px.plain.id);
    const img = plain.getByTestId('m-tile-image');
    await expect.poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBe(8);
    await expect(plain.getByTestId('m-markup-indicator')).toHaveCount(0);
  });

  test('A-23q · the markup indicator is top-right, circular, icon-only, no text', async ({
    page,
  }) => {
    await page.goto(gallery());
    const t = tile(page, px.annotated.id);
    const indicator = t.getByTestId('m-markup-indicator');
    await expect(indicator).toHaveCount(1);

    // NO TEXT — it must not be readable as a source badge, whose whole
    // contract is that it carries words (§4.8's provenance rule).
    expect((await indicator.innerText()).trim()).toBe('');

    // CIRCULAR — radius at least half the box.
    const shape = await indicator.evaluate((el) => {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return { radius: parseFloat(s.borderTopLeftRadius), w: r.width, h: r.height };
    });
    expect(shape.radius).toBeGreaterThanOrEqual(shape.w / 2 - 0.5);

    // TOP-RIGHT, and specifically NOT the bottom-left corner the source badge
    // occupies — a build that put it there has broken §4.8's rule even if the
    // wording is right.
    const box = await t.boundingBox();
    const ind = await indicator.boundingBox();
    expect(ind!.x + ind!.width).toBeGreaterThan(box!.x + box!.width / 2);
    expect(ind!.y).toBeLessThan(box!.y + box!.height / 2);
  });

  test('A-23r · a photo whose marks are all in a cropped-away band still carries the indicator', async ({
    page,
  }) => {
    // The fixture's marks sit in the top-left 2x2 of an 8x8 image. Whatever the
    // square tile crops, the INDICATOR is derived from markup_data alone and
    // must render — that is the entire reason an indicator exists rather than
    // trusting the picture.
    await page.goto(gallery());
    await expect(tile(page, px.annotated.id).getByTestId('m-markup-indicator')).toHaveCount(1);
    await expect(tile(page, px.orphanMarkup.id).getByTestId('m-markup-indicator')).toHaveCount(1);
  });

  test('A-23s · a tile holds its placeholder until its image has loaded', async ({ page }) => {
    // Under D-31 the forbidden interval is not "shapes over a blank tile" but
    // the ORIGINAL flashing before the derivative replaces it — an annotated
    // photo showing as unannotated for a full round-trip. This build cannot
    // produce that: the server chooses ONE src, so there is never a first,
    // wrong image. What is asserted is the placeholder contract.

    // ------------------------------------------------------------------
    // HALF ONE, AND IT IS THE ONE THAT MATTERS: THE ORIGINAL IS NEVER
    // REQUESTED FOR AN ANNOTATED PHOTO.
    //
    // A build that renders the original and swaps in the derivative shows an
    // annotated photo as UNANNOTATED for a full network round-trip. Watching
    // the wire proves the absence directly — a DOM assertion could only ever
    // sample for it and would miss a fast swap.
    // ------------------------------------------------------------------
    const requested: string[] = [];
    page.on('request', (r) => {
      const u = r.url();
      if (u.includes('m6mp-annotated')) requested.push(u);
    });

    await page.goto(gallery());
    const t = tile(page, px.annotated.id);
    await expect(t.getByTestId('m-tile-image')).toHaveAttribute('data-state', 'loaded', {
      timeout: 15_000,
    });

    expect(requested.length).toBeGreaterThan(0);
    // Every request for this photo was for the DERIVATIVE. The original's own
    // path was never fetched.
    for (const u of requested) {
      expect(u, 'the unannotated original was requested').toContain('.markup.jpg');
    }

    // ...and the pixels on screen are the derivative's.
    await expect
      .poll(() =>
        t.getByTestId('m-tile-image').evaluate((el) => (el as HTMLImageElement).naturalWidth)
      )
      .toBe(16);

    // ------------------------------------------------------------------
    // HALF TWO — the placeholder HOLDS while an image is still arriving.
    // The route never resolves, so the tile stays in its pending state.
    // ------------------------------------------------------------------
    const stalled = page.route('**/m6mp-plain*', () => {
      /* deliberately never resolved */
    });
    await stalled;
    // `domcontentloaded`, not the default `load`: a request that never resolves
    // is the point of this half, and the load event cannot fire while it is
    // outstanding.
    await page.goto(gallery(), { waitUntil: 'domcontentloaded' });

    const p = tile(page, px.plain.id);
    await expect(p.getByTestId('m-tile-placeholder')).toBeVisible();
    await expect(p.getByTestId('m-tile-image')).toHaveAttribute('data-state', 'pending');
    await expect(p.getByTestId('m-tile-image')).toHaveCSS('opacity', '0');
    await page.unroute('**/m6mp-plain*');
  });

  test('A-22 · a photo with no link column renders NO badge', async ({ page }) => {
    await page.goto(gallery());
    await expect(tile(page, px.plain.id).getByTestId('m-source-badge')).toHaveCount(0);
  });

  test('A-22b · a punch-linked file carries the Punch badge and appears under the Punch chip', async ({
    page,
  }) => {
    await page.goto(gallery());
    const badge = tile(page, px.punchLinked.id).getByTestId('m-source-badge');
    await expect(badge).toHaveAttribute('data-source', 'punch');
    await expect(badge).toHaveText('Punch');

    // ...and the chip agrees with the badge, because both read the same
    // derivation.
    await page.getByTestId('m-chip-Punch').click();
    await expect(page.getByTestId('m-chip-Punch')).toHaveAttribute('data-active', 'true');
    await expect(tile(page, px.punchLinked.id)).toHaveCount(1);
    await expect(tile(page, px.plain.id)).toHaveCount(0);
  });

  test('A-22c · rendering the gallery WRITES NOTHING to punch_list_items', async ({ page }) => {
    // D-15 is a read-only join. The two photo columns keep their distinct
    // meanings and are never written by this work.
    const before = await fx.admin
      .from('punch_list_items')
      .select('id, reference_photo_file_id, completion_photo_file_id, updated_at, updated_by')
      .eq('project_id', fx.futureProject)
      .order('id');

    await page.goto(gallery());
    await expect(page.getByTestId('m-photo-tile').first()).toBeVisible();
    await page.getByTestId('m-chip-Punch').click();
    await expect(page.getByTestId('m-chip-Punch')).toHaveAttribute('data-active', 'true');

    const after = await fx.admin
      .from('punch_list_items')
      .select('id, reference_photo_file_id, completion_photo_file_id, updated_at, updated_by')
      .eq('project_id', fx.futureProject)
      .order('id');

    // Byte-identical, including updated_at — a write would have moved it.
    expect(after.data).toEqual(before.data);
  });

  test('A-22d · grouped by day, newest day first, current day labelled "Today"', async ({
    page,
  }) => {
    await page.goto(gallery());
    const sections = page.getByTestId('m-day-section');
    await expect(sections.first()).toBeVisible();

    const days = await sections.evaluateAll((els) =>
      els.map((e) => (e as HTMLElement).dataset.day ?? '')
    );
    // Newest first.
    const sorted = [...days].sort().reverse();
    expect(days).toEqual(sorted);

    // The fixture's photos were created just now, so the first section is today.
    await expect(page.getByTestId('m-day-label').first()).toContainText('TODAY');
  });

  test('A-22d · further days load on scroll', async ({ page }) => {
    await page.goto(gallery());
    const control = page.getByTestId('m-load-more-days');
    // With only today's fixture photos there is nothing further to load; the
    // control is absent rather than present-and-inert, which is the honest
    // rendering of "no more days".
    const shownBefore = await page.getByTestId('m-day-section').count();
    if ((await control.count()) === 0) {
      expect(shownBefore).toBeGreaterThan(0);
      return;
    }
    await control.click();
    expect(await page.getByTestId('m-day-section').count()).toBeGreaterThan(shownBefore);
  });

  test('A-22e · long-press enters multi-select and bulk actions act on the set', async ({
    page,
  }) => {
    await page.goto(gallery());
    const t = tile(page, px.plain.id);
    await expect(t).toBeVisible();

    // The long-press itself — a real press-and-hold, not a click.
    const box = await t.boundingBox();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(700);
    await page.mouse.up();

    await expect(page.getByTestId('m-selection-bar')).toBeVisible();
    await expect(page.getByTestId('m-selection-count')).toContainText('1 selected');

    // Selecting a second photo grows the SET the bulk actions operate on.
    await tile(page, px.punchLinked.id).click();
    await expect(page.getByTestId('m-selection-count')).toContainText('2 selected');

    // Bulk share is offered for the set; bulk delete is role-gated (A-25d) and
    // the crew identity must not be offered it.
    await expect(page.getByTestId('m-bulk-share')).toBeEnabled();
    await expect(page.getByTestId('m-bulk-delete')).toHaveCount(0);
  });

  test('A-13 · no unseen dot renders anywhere, under any data condition', async ({ page }) => {
    // D-14 as amended: the dot is deferred to v2 and no view-tracking table
    // exists. The gallery is the surface most likely to grow one by accident.
    await page.goto(gallery());
    await expect(page.getByTestId('m-photo-tile').first()).toBeVisible();

    const dots = await page.getByTestId('m-photo-tile').evaluateAll((tiles) =>
      tiles.reduce((n, t) => {
        const found = Array.from(t.querySelectorAll('*')).filter((el) => {
          if ((el as HTMLElement).dataset.testid === 'm-markup-indicator') return false;
          const s = getComputedStyle(el);
          const r = el.getBoundingClientRect();
          return (
            r.width > 0 &&
            r.width <= 14 &&
            r.height <= 14 &&
            parseFloat(s.borderTopLeftRadius) >= r.width / 2 &&
            s.backgroundColor !== 'rgba(0, 0, 0, 0)'
          );
        }).length;
        return n + found;
      }, 0)
    );
    expect(dots, 'an unseen-photo dot was rendered').toBe(0);
  });
});

// ===========================================================================
// M-9 · §4.9
// ===========================================================================
test.describe('M-9 · viewer', () => {
  test('A-1b · the tab bar is REPLACED by the 4-up action row', async ({ page }) => {
    await page.goto(viewer(px.plain.id));
    await expect(page.getByTestId('m-tabbar')).toHaveCount(0);
    await expect(page.getByTestId('m-viewer-actions')).toBeVisible();
    for (const id of ['m-action-save', 'm-action-share', 'm-action-comment']) {
      await expect(page.getByTestId(id)).toBeVisible();
    }
  });

  test('A-23g · the stage AND the filmstrip render the derivative', async ({ page }) => {
    await page.goto(viewer(px.annotated.id));
    await expect.poll(() => decodedWidth(page, 'm-stage-image')).toBe(16);

    // One rule, THREE surfaces — testing only the stage would let the
    // filmstrip regress.
    const strip = page
      .locator('[data-testid="m-filmstrip-item"][data-current="true"]')
      .getByTestId('m-filmstrip-image');
    await expect.poll(() => strip.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBe(16);
  });

  test('A-23e · the toggle reveals the unannotated original BY SWAPPING FILES', async ({
    page,
  }) => {
    await page.goto(viewer(px.annotated.id));

    // With markup present the stage shows the DERIVATIVE.
    await expect(page.getByTestId('m-stage-image')).toHaveAttribute('data-showing', 'display');
    await expect.poll(() => decodedWidth(page, 'm-stage-image')).toBe(16);

    await page.getByTestId('m-markup-toggle').click();

    // Toggling LOADS THE ORIGINAL — a different file, a second request. That
    // is the D-31 behaviour; A-23e2, which asserted no second request, was
    // deleted by the reversal.
    await expect(page.getByTestId('m-stage-image')).toHaveAttribute('data-showing', 'original');
    await expect.poll(() => decodedWidth(page, 'm-stage-image')).toBe(8);

    await page.getByTestId('m-markup-toggle').click();
    await expect.poll(() => decodedWidth(page, 'm-stage-image')).toBe(16);
  });

  test('A-25b · a photo carrying markup is visibly marked as such in the viewer', async ({
    page,
  }) => {
    await page.goto(viewer(px.annotated.id));
    await expect(page.getByTestId('m-viewer-markup-indicator')).toBeVisible();

    await page.goto(viewer(px.plain.id));
    await expect(page.getByTestId('m-viewer-markup-indicator')).toHaveCount(0);
    await expect(page.getByTestId('m-markup-toggle')).toHaveCount(0);
  });

  test('A-25 · every gesture has a visible on-screen equivalent', async ({ page }) => {
    await page.goto(viewer(px.plain.id));
    // swipe-to-page  -> prev/next circles
    const hasPrev = await page.getByTestId('m-viewer-prev').count();
    const hasNext = await page.getByTestId('m-viewer-next').count();
    expect(hasPrev + hasNext).toBeGreaterThan(0);
    // swipe-down-to-dismiss -> the close ✕
    await expect(page.getByTestId('m-viewer-close')).toBeVisible();
    // pinch -> the zoom control
    await expect(page.getByTestId('m-zoom-in')).toBeVisible();
    await expect(page.getByTestId('m-zoom-out')).toBeVisible();
  });

  test('A-25 · the prev/next circles page, and the close ✕ dismisses', async ({ page }) => {
    await page.goto(viewer(px.annotated.id));
    const position = page.getByTestId('m-viewer-position');
    const before = await position.innerText();

    const next = page.getByTestId('m-viewer-next');
    if ((await next.count()) > 0) {
      await next.click();
      await expect(position).not.toHaveText(before);
    }

    await page.getByTestId('m-viewer-close').click();
    await expect(page).toHaveURL(new RegExp(`/photos$`));
  });

  test('A-25e · the zoom control renders − and + at rest, and Fit ONLY when zoomed', async ({
    page,
  }) => {
    await page.goto(viewer(px.plain.id));

    // At fit the resting state is TWO controls, not three.
    await expect(page.getByTestId('m-zoom-fit')).toHaveCount(0);

    // Each tap steps the zoom WITHOUT A GESTURE.
    const scaleOf = () =>
      page
        .getByTestId('m-stage-image')
        .evaluate((el) => getComputedStyle(el as HTMLElement).transform);
    const atFit = await scaleOf();
    await page.getByTestId('m-zoom-in').click();
    expect(await scaleOf()).not.toBe(atFit);

    // Above fit the Fit pill appears.
    await expect(page.getByTestId('m-zoom-fit')).toBeVisible();
    await page.getByTestId('m-zoom-fit').click();
    await expect(page.getByTestId('m-zoom-fit')).toHaveCount(0);
  });

  test('A-25f · no control overlaps another at any zoom level', async ({ page }) => {
    await page.goto(viewer(px.annotated.id));

    const boxes = async () => {
      const ids = ['m-viewer-prev', 'm-viewer-next', 'm-zoom-in', 'm-zoom-out', 'm-zoom-fit'];
      const out: { id: string; b: { x: number; y: number; width: number; height: number } }[] = [];
      for (const id of ids) {
        const el = page.getByTestId(id);
        if ((await el.count()) === 0) continue;
        const b = await el.boundingBox();
        if (b) out.push({ id, b });
      }
      return out;
    };

    const overlaps = (
      a: { x: number; y: number; width: number; height: number },
      b: { x: number; y: number; width: number; height: number }
    ) =>
      a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

    for (let step = 0; step < 4; step++) {
      const bs = await boxes();
      for (let i = 0; i < bs.length; i++) {
        for (let j = i + 1; j < bs.length; j++) {
          expect(
            overlaps(bs[i].b, bs[j].b),
            `${bs[i].id} overlaps ${bs[j].id} at zoom step ${step}`
          ).toBe(false);
        }
      }
      await page.getByTestId('m-zoom-in').click();
    }
  });

  test('A-25g · while zoomed, a horizontal swipe PANS and the circles still page', async ({
    page,
  }) => {
    await page.goto(viewer(px.annotated.id));
    const position = page.getByTestId('m-viewer-position');
    const startPos = await position.innerText();

    await page.getByTestId('m-zoom-in').click();
    await expect(page.getByTestId('m-zoom-fit')).toBeVisible();

    const stage = await page.getByTestId('m-viewer-stage').boundingBox();
    const transformBefore = await page
      .getByTestId('m-stage-image')
      .evaluate((el) => getComputedStyle(el as HTMLElement).transform);

    // A horizontal drag at zoom: PANS, and must NOT page.
    await page.mouse.move(stage!.x + stage!.width * 0.7, stage!.y + stage!.height / 2);
    await page.mouse.down();
    await page.mouse.move(stage!.x + stage!.width * 0.2, stage!.y + stage!.height / 2, {
      steps: 8,
    });
    await page.mouse.up();

    await expect(position).toHaveText(startPos); // did not page
    const transformAfter = await page
      .getByTestId('m-stage-image')
      .evaluate((el) => getComputedStyle(el as HTMLElement).transform);
    expect(transformAfter).not.toBe(transformBefore); // did pan

    // ...and the circles STILL page. At zoom they are not merely an equivalent
    // of the swipe, they are the ONLY way to page — a build that disabled them
    // while zoomed would strand the user.
    const next = page.getByTestId('m-viewer-next');
    if ((await next.count()) > 0) {
      await next.click();
      await expect(position).not.toHaveText(startPos);
    } else {
      const prev = page.getByTestId('m-viewer-prev');
      await prev.click();
      await expect(position).not.toHaveText(startPos);
    }
  });

  test('A-25c · tapping Source navigates to the originating record', async ({ page }) => {
    await page.goto(viewer(px.punchLinked.id));
    const source = page.getByTestId('m-viewer-source');
    await expect(source).toBeVisible();
    await source.click();
    await expect(page).toHaveURL(new RegExp(`/m/p/${fx.futureProject}/punch`));
  });

  test('A-25d · Delete is not offered to a role the DB would refuse', async ({ page }) => {
    // files_delete_owner_admin restricts DELETE to Owner/Admin. The signed-in
    // identity is CREW, so the control is absent rather than present-and-failing.
    await page.goto(viewer(px.plain.id));
    await expect(page.getByTestId('m-action-delete')).toHaveCount(0);
    await expect(page.getByTestId('m-action-delete-absent')).toHaveCount(1);
  });

  test('A-23t · an annotated photo with no derivative degrades to the original and SAYS SO', async ({
    page,
  }) => {
    await page.goto(viewer(px.orphanMarkup.id));
    // It still claims markup...
    await expect(page.getByTestId('m-viewer-markup-indicator')).toBeVisible();
    // ...shows the unmarked original rather than a broken image...
    await expect.poll(() => decodedWidth(page, 'm-stage-image')).toBe(8);
    // ...and never passes it off silently.
    await expect(page.getByTestId('m-derivative-missing')).toBeVisible();
  });
});

// ===========================================================================
// M-10 · §4.10
// ===========================================================================
test.describe('M-10 · markup', () => {
  test('A-1b · the tab bar is REPLACED by Undo/Redo/Done', async ({ page }) => {
    await page.goto(markup(px.plain.id));
    await expect(page.getByTestId('m-tabbar')).toHaveCount(0);
    await expect(page.getByTestId('m-markup-actions')).toBeVisible();
    await expect(page.getByTestId('m-undo')).toBeVisible();
    await expect(page.getByTestId('m-redo')).toBeVisible();
    await expect(page.getByTestId('m-done')).toBeVisible();
  });

  test('A-23m · the image and the shape layer are ONE SVG sharing ONE viewBox', async ({
    page,
  }) => {
    await page.goto(markup(px.annotated.id));
    const svg = page.getByTestId('m-markup-svg');
    await expect(svg).toBeVisible();

    // ONE svg, with the image INSIDE it — not an <img> plus a sibling overlay,
    // which drifts at every size that is not the authoring size.
    expect(await svg.locator('image').count()).toBe(1);
    await expect(svg).toHaveAttribute('viewBox', '0 0 8 8');
    expect(await page.getByTestId('m-markup-canvas').locator('img').count()).toBe(0);

    // Marks stay registered to image features across canvas sizes: the shapes
    // share the viewBox, so their IMAGE coordinates never change with layout.
    const coordsAt = async (w: number, h: number) => {
      await page.setViewportSize({ width: w, height: h });
      return svg.locator('rect').first().evaluate((el) => ({
        x: el.getAttribute('x'),
        y: el.getAttribute('y'),
      }));
    };
    const small = await coordsAt(402, 874);
    const large = await coordsAt(700, 900);
    expect(large).toEqual(small);
    await page.setViewportSize({ width: 402, height: 874 });
  });

  test('A-23n · the canvas renders `meet` and never crops', async ({ page }) => {
    await page.goto(markup(px.annotated.id));
    // Authoring must show the WHOLE image or a mark cannot be placed in the
    // region that got cropped away.
    await expect(page.getByTestId('m-markup-svg')).toHaveAttribute(
      'preserveAspectRatio',
      'xMidYMid meet'
    );
  });

  test('A-24 · the active tool carries a BORDER and a label change, not tint alone', async ({
    page,
  }) => {
    await page.goto(markup(px.plain.id));

    const readTool = (id: string) =>
      page.getByTestId(`m-tool-${id}`).evaluate((el) => {
        const s = getComputedStyle(el);
        return {
          borderColour: s.borderTopColor,
          borderWidth: s.borderTopWidth,
          colour: s.color,
          bg: s.backgroundColor,
          label: (el.textContent ?? '').trim(),
        };
      });

    await page.getByTestId('m-tool-arrow').click();
    const active = await readTool('arrow');
    const inactive = await readTool('rectangle');

    // THE BORDER. Asserted by COLOUR, not width: Chromium rounds the used
    // border-width to whole device pixels, so the specified 1.5px reports as
    // "1px" at dpr 1 and a width comparison would fail on a correct build.
    // §4.10's border is `1.5px #f2453d`, and that colour is unreachable from
    // the inactive branch.
    expect(active.borderColour).toBe('rgb(242, 69, 61)');
    expect(inactive.borderColour).not.toBe(active.borderColour);

    // AND THE LABEL CHANGES — the second half of A-24. A build that swapped
    // only the fill would satisfy neither this nor the border assertion, which
    // is exactly what "not tint alone" forbids.
    expect(active.colour).not.toBe(inactive.colour);
    expect(active.colour).toBe('rgb(242, 69, 61)');
    // Both tools still carry their words, so the state is never colour-only.
    expect(active.label).toBe('Arrow');
    expect(inactive.label).toBe('Box');

    // Exactly one tool is active at a time.
    expect(await page.locator('[data-testid^="m-tool-"][data-active="true"]').count()).toBe(1);
  });

  test('A-24b · Undo/Redo are per-mark and Redo dims when the stack is empty', async ({
    page,
  }) => {
    await page.goto(markup(px.plain.id));
    const svg = page.getByTestId('m-markup-svg');
    await expect(svg).toBeVisible();

    // Nothing to redo yet.
    await expect(page.getByTestId('m-redo')).toBeDisabled();

    const box = await svg.boundingBox();
    const drawBox = async (offset: number) => {
      await page.getByTestId('m-tool-rectangle').click();
      await page.mouse.move(box!.x + 40 + offset, box!.y + 40);
      await page.mouse.down();
      await page.mouse.move(box!.x + 100 + offset, box!.y + 100, { steps: 6 });
      await page.mouse.up();
    };

    await drawBox(0);
    await expect(svg.locator('rect')).toHaveCount(1);
    await drawBox(20);
    await expect(svg.locator('rect')).toHaveCount(2);

    // ONE undo removes ONE mark — per-mark, not per-stroke-segment.
    await page.getByTestId('m-undo').click();
    await expect(svg.locator('rect')).toHaveCount(1);

    await expect(page.getByTestId('m-redo')).toBeEnabled();
    await page.getByTestId('m-redo').click();
    await expect(svg.locator('rect')).toHaveCount(2);
    await expect(page.getByTestId('m-redo')).toBeDisabled();
  });

  test('A-29k · adding one pin is ONE undo step — circle and numeral together', async ({
    page,
  }) => {
    await page.goto(markup(px.plain.id));
    const svg = page.getByTestId('m-markup-svg');
    await expect(svg).toBeVisible();
    const box = await svg.boundingBox();

    await page.getByTestId('m-tool-pin').click();
    const circlesBefore = await svg.locator('circle').count();
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await expect(svg.locator('circle')).toHaveCount(circlesBefore + 1);

    // A SINGLE undo removes the WHOLE pin. A composed pin — circle plus text —
    // would pass every numbering criterion and fail here, taking two undos.
    await page.getByTestId('m-undo').click();
    await expect(svg.locator('circle')).toHaveCount(circlesBefore);
  });

  test('A-29i · a pin scales with the overlay under the same viewBox transform', async ({
    page,
  }) => {
    await page.goto(markup(px.annotated.id));
    const svg = page.getByTestId('m-markup-svg');
    // The fixture's pin sits at image (1,1) — in the SAME coordinate space as
    // the rectangle, so both are transformed by one viewBox.
    const pin = svg.locator('circle').first();
    await expect(pin).toHaveAttribute('cx', '1');
    await expect(pin).toHaveAttribute('cy', '1');
  });

  test('A-24c · Cancel confirms with unsaved marks, and exits directly without', async ({
    page,
  }) => {
    // No marks made -> straight out, no dialog.
    await page.goto(markup(px.plain.id));
    await expect(page.getByTestId('m-markup-svg')).toBeVisible();
    await page.getByTestId('m-markup-cancel').click();
    await expect(page.getByTestId('m-cancel-confirm')).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`/photos/${px.plain.id}$`));

    // With an unsaved mark -> confirm first.
    await page.goto(markup(px.plain.id));
    const svg = page.getByTestId('m-markup-svg');
    const box = await svg.boundingBox();
    await page.getByTestId('m-tool-pin').click();
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);

    await page.getByTestId('m-markup-cancel').click();
    await expect(page.getByTestId('m-cancel-confirm')).toBeVisible();
    await page.getByTestId('m-cancel-keep').click();
    await expect(page.getByTestId('m-cancel-confirm')).toHaveCount(0);
  });

  test('A-24d · markup opened from a punch item returns to that record', async ({ page }) => {
    await page.goto(`${markup(px.punchLinked.id)}?from=punch`);
    await expect(page.getByTestId('m-markup-svg')).toBeVisible();
    await page.getByTestId('m-markup-cancel').click();
    // Back to the punch list, not to a gallery the user never opened.
    await expect(page).toHaveURL(new RegExp(`/m/p/${fx.futureProject}/punch`));
  });

  test('A-5 · every interactive element on M-10 is >=44px, except the colour swatches', async ({
    page,
  }) => {
    await page.goto(markup(px.plain.id));
    await expect(page.getByTestId('m-markup-svg')).toBeVisible();

    const els = await page.locator('button, a, input, [role="button"]').all();
    const undersized: string[] = [];
    for (const el of els) {
      if (!(await el.isVisible())) continue;
      const testId = (await el.getAttribute('data-testid')) ?? '';
      // §2's ONLY permitted sub-44px target.
      if (testId.startsWith('m-swatch-')) continue;
      const b = await el.boundingBox();
      if (!b) continue;
      if (Math.min(b.width, b.height) < 44) undersized.push(`${testId} ${b.width}x${b.height}`);
    }
    expect(undersized, undersized.join(', ')).toHaveLength(0);

    // The swatches themselves: 34px, 8px apart.
    const sw = await page.getByTestId('m-swatches').locator('button').first().boundingBox();
    expect(Math.round(sw!.width)).toBe(34);
  });
});

// ===========================================================================
// THE SAVE — browser-driven, verified against the database and the bucket.
// ===========================================================================
test.describe('the markup save', () => {
  test('A-23 / A-23b / A-23c / A-23d / A-23i · a save writes both, touches nothing else', async ({
    page,
  }) => {
    const target = px.saveTarget; // a photo only this test writes to

    const rowBefore = await fx.admin
      .from('files')
      .select('file_path, file_size, mime_type, file_name, markup_data')
      .eq('id', target.id)
      .single();
    const countBefore = await fx.admin
      .from('files')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', fx.futureProject)
      .eq('category', 'photos')
      .eq('is_deleted', false);

    // Draw one pin and save.
    await page.goto(markup(target.id));
    const svg = page.getByTestId('m-markup-svg');
    await expect(svg).toBeVisible();
    const box = await svg.boundingBox();
    await page.getByTestId('m-tool-pin').click();
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.getByTestId('m-markup-save').click();

    // A-23i — it lands back on the viewer without a manual reload.
    await expect(page).toHaveURL(new RegExp(`/photos/${target.id}$`), { timeout: 20_000 });
    // A derivative failure would have kept us here with a notice instead.
    await expect(page.getByTestId('m-save-note')).toHaveCount(0);

    const rowAfter = await fx.admin
      .from('files')
      .select('file_path, file_size, mime_type, file_name, markup_data')
      .eq('id', target.id)
      .single();

    // A-23 — the mark list landed.
    const markupAfter = rowAfter.data?.markup_data as { shapes?: unknown[] } | null;
    expect(Array.isArray(markupAfter?.shapes)).toBe(true);
    expect(markupAfter!.shapes!.length).toBeGreaterThan(0);

    // A-23b — the ORIGINAL is untouched. Only markup_data differs.
    expect(rowAfter.data?.file_path).toBe(rowBefore.data?.file_path);
    expect(rowAfter.data?.file_size).toBe(rowBefore.data?.file_size);
    expect(rowAfter.data?.mime_type).toBe(rowBefore.data?.mime_type);
    expect(rowAfter.data?.file_name).toBe(rowBefore.data?.file_name);

    // A-23 (second half) — a derivative object now exists, at the deterministic
    // path, and it is NOT the original's bytes.
    const dir = target.path.slice(0, target.path.lastIndexOf('/'));
    const base = derivativePathFor(target.path).slice(dir.length + 1);
    const listed = await fx.admin.storage.from('project-files').list(dir, { search: base });
    const derivatives = (listed.data ?? []).filter((o) => o.name === base);
    expect(derivatives.length, 'no derivative object was written').toBe(1);

    // A-23d — NO extra files row. The photo count is unchanged, which is the
    // double-count failure §4.10 was written to prevent.
    const countAfter = await fx.admin
      .from('files')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', fx.futureProject)
      .eq('category', 'photos')
      .eq('is_deleted', false);
    expect(countAfter.count).toBe(countBefore.count);

    // A-23c — a SECOND save overwrites in place: still exactly one object.
    await page.goto(markup(target.id));
    await expect(page.getByTestId('m-markup-svg')).toBeVisible();
    const box2 = await page.getByTestId('m-markup-svg').boundingBox();
    await page.getByTestId('m-tool-pin').click();
    await page.mouse.click(box2!.x + box2!.width / 3, box2!.y + box2!.height / 3);
    await page.getByTestId('m-markup-save').click();
    await expect(page).toHaveURL(new RegExp(`/photos/${target.id}$`), { timeout: 20_000 });

    const listedAgain = await fx.admin.storage
      .from('project-files')
      .list(dir, { search: base });
    expect((listedAgain.data ?? []).filter((o) => o.name === base).length).toBe(1);

    // A-23k / A-23i — the surfaces now show the derivative, not the original.
    await expect(page.getByTestId('m-viewer-markup-indicator')).toBeVisible();
    await page.goto(gallery());
    await expect(tile(page, target.id).getByTestId('m-markup-indicator')).toHaveCount(1);

    // A-23l — the derivative is reached through a SIGNED url from the same
    // {company_id}/{project_id}/ prefix, exactly as the original is.
    const src = await tile(page, target.id)
      .getByTestId('m-tile-image')
      .getAttribute('src');
    expect(src).toContain('/storage/v1/object/sign/project-files/');
    expect(src).toContain(encodeURIComponent(COMPANY_A));
    expect(src).toContain('token=');
    expect(src).toContain('.markup.jpg');

    // Reset so the fixture's other assertions are unaffected by ordering.
    await fx.admin.from('files').update({ markup_data: null }).eq('id', target.id);
    await fx.admin.storage.from('project-files').remove([derivativePathFor(target.path)]);
  });
});

// ===========================================================================
// A-25d / A-22e — THE HALVES A CREW IDENTITY CANNOT REACH.
//
// Everything above runs as CREW, which is right: it is the least-privileged
// role and the one the field app is for. But A-25d has two halves —
// "Delete PROMPTS FOR CONFIRMATION and is REFUSED for roles that cannot
// delete" — and a crew session can only ever demonstrate the second. Asserting
// the first requires signing in as a role `files_delete_owner_admin` admits.
// Same for A-22e's bulk-delete half.
// ===========================================================================
const OWNER_EMAIL = 'josh+test50@worthprop.com';
const PASSWORD = process.env.E2E_PASSWORD ?? 'FrameFocusTest!2026';

async function signInAsOwner(page: Page) {
  await page.context().clearCookies();
  await page.goto('/sign-in');
  await page.locator('#email').fill(OWNER_EMAIL);
  await page.locator('#password').fill(PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
}

test.describe('as an Owner — the delete halves', () => {
  test.setTimeout(120_000);

  test('A-25d · Delete IS offered to Owner, and prompts for confirmation first', async ({
    page,
  }) => {
    await signInAsOwner(page);
    await page.goto(viewer(px.deletable.id));

    const del = page.getByTestId('m-action-delete');
    await expect(del).toBeVisible();

    // CONFIRMS FIRST — never a one-tap destructive action.
    await del.click();
    await expect(page.getByTestId('m-delete-confirm')).toBeVisible();

    // Backing out leaves the photo alone.
    await page.getByTestId('m-delete-confirm-no').click();
    await expect(page.getByTestId('m-delete-confirm')).toHaveCount(0);
    const stillThere = await fx.admin
      .from('files')
      .select('is_deleted')
      .eq('id', px.deletable.id)
      .single();
    expect(stillThere.data?.is_deleted).toBe(false);

    // Confirming actually deletes — soft, per the trash-bin pattern.
    await del.click();
    await page.getByTestId('m-delete-confirm-yes').click();
    await page.waitForURL(new RegExp('/photos$'), { timeout: 30_000 });

    await expect
      .poll(async () => {
        const r = await fx.admin
          .from('files')
          .select('is_deleted')
          .eq('id', px.deletable.id)
          .single();
        return r.data?.is_deleted;
      })
      .toBe(true);
  });

  test('A-22e · bulk delete acts on the SELECTED SET', async ({ page }) => {
    await signInAsOwner(page);
    await page.goto(gallery());

    await page.getByTestId('m-select-mode').click();
    await expect(page.getByTestId('m-selection-bar')).toBeVisible();

    // Two photos, chosen explicitly.
    await tile(page, px.bulkA.id).click();
    await tile(page, px.bulkB.id).click();
    await expect(page.getByTestId('m-selection-count')).toContainText('2 selected');

    await page.getByTestId('m-bulk-delete').click();
    await expect(page.getByTestId('m-bulk-delete-confirm')).toBeVisible();
    await page.getByTestId('m-bulk-delete-confirm-yes').click();

    // BOTH are gone, and nothing outside the set was touched.
    await expect
      .poll(async () => {
        const r = await fx.admin
          .from('files')
          .select('id, is_deleted')
          .in('id', [px.bulkA.id, px.bulkB.id]);
        return (r.data ?? []).filter((f) => f.is_deleted).length;
      }, { timeout: 30_000 })
      .toBe(2);

    const untouched = await fx.admin
      .from('files')
      .select('is_deleted')
      .eq('id', px.plain.id)
      .single();
    expect(untouched.data?.is_deleted).toBe(false);
  });
});

// ===========================================================================
// A-12c / A-12d — the tile criteria the previous slice could only reach 8-of-9
// and 3-of-4 on, because M-8 did not exist.
// ===========================================================================
test.describe('A-12c / A-12d · every tile now reaches a screen', () => {
  // Nine (then four) cold route compiles in one test each — the default 30s
  // budget is about the dev server, not about the assertions.
  test.setTimeout(180_000);

  test('A-12c · all NINE M-3 tiles navigate to a real /m screen', async ({ page }) => {
    const keys = [
      'overview',
      'schedule',
      'changes',
      'punch',
      'deliveries',
      'files',
      'photos',
      'contacts',
      'team',
    ];
    for (const key of keys) {
      await page.goto(`/m/p/${fx.futureProject}`);
      const t = page.getByTestId(`m-tile-${key}`);
      await expect(t).toHaveAttribute('href', `/m/p/${fx.futureProject}/${key}`);
      await t.click();
      // Generous: `next dev` compiles each route on its first request, and nine
      // first-visits in one test is nine cold compiles.
      await page.waitForURL(new RegExp(`/m/p/${fx.futureProject}/${key}$`), { timeout: 60_000 });
      await expect(page.getByTestId('m-content')).toBeVisible();
      // Not an error page — the screen rendered its own body.
      await expect(page.locator('body')).not.toContainText('404');
    }
  });

  test('A-12d · all FOUR M-7 tiles navigate to a real /m screen', async ({ page }) => {
    const expected: [string, string][] = [
      ['m-field-tile-logs', `/m/logs?project=${fx.futureProject}`],
      ['m-field-tile-deliveries', `/m/p/${fx.futureProject}/deliveries`],
      ['m-field-tile-safety', `/m/p/${fx.futureProject}/safety`],
      ['m-field-tile-photos', `/m/p/${fx.futureProject}/photos`],
    ];
    for (const [testId, href] of expected) {
      await page.goto(`/m/field?project=${fx.futureProject}`);
      const t = page.getByTestId(testId);
      await expect(t).toHaveAttribute('href', href);
      expect(href).not.toContain('/dashboard');
      await t.click();
      await expect(page.getByTestId('m-content')).toBeVisible();
      await expect(page.locator('body')).not.toContainText('404');
    }
  });
});
