import { test, expect } from '@playwright/test';
import { signInAs } from './sign-in-as';

// S111 Part Two, RULED Q16 — /m's Photos screen (M-8) gains "Add photos". It is
// a <label htmlFor> on the tab bar's own photo-LIBRARY input, so the gallery and
// the tab bar share one pipeline. What must be true, and is asserted here:
//   · tapping it opens a file chooser for THAT input — the library one, with no
//     `capture` (so the phone offers the photo library, not only the camera),
//     and `multiple` (a native burst still arrives in one go);
//   · it is not a second, private upload input on the page.
// What the chosen photos then do is the tab bar's existing, tested pipeline
// (m-capture-camera.spec.ts, m-capture.spec.ts), deliberately not re-tested here.

const CREW = 'josh+crew@worthprop.com';
const PROJECT = 'eaf0e25b-d60e-49c0-89b2-5612118d94b4';

test('[S111 Q16] M-8 → Add photos opens the photo library through the tab bar input', async ({ page }) => {
  test.setTimeout(90_000);
  await signInAs(page, CREW);
  await page.goto(`/m/p/${PROJECT}/photos`);

  const add = page.getByTestId('m-photos-add');
  await expect(add).toBeVisible();

  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), add.click()]);
  expect(chooser.isMultiple()).toBe(true);
  const el = chooser.element();
  expect(await el.getAttribute('data-testid')).toBe('m-camera-library-input');
  expect(await el.getAttribute('capture')).toBeNull();
  expect(await el.getAttribute('accept')).toBe('image/*');

  // No private input on the page: the only library input is the tab bar's.
  await expect(page.locator('[data-testid="m-content"] input[type=file]')).toHaveCount(0);
});
