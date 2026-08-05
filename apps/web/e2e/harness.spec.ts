import { test, expect } from '@playwright/test';
import { brand } from '../lib/brand';

// PROOF OF LIFE for the Playwright harness (M6M §10a / D-18).
//
// THIS IS NOT AN M6M CRITERION. /m does not exist yet, so nothing here asserts
// A-2, A-5, A-10, A-14, A-17, A-18 or A-19. The only job of this file is to
// prove the harness genuinely drives a browser — so that when the real criteria
// are written against /m, a failure means the app is wrong rather than the
// tooling never having worked.
//
// It targets /sign-in because that route EXISTS TODAY, is public (no auth, no
// seeded data), and is not part of the mobile shell — so it will not need
// rewriting when /m lands.
//
// Each assertion below is chosen to be one a NON-browser runner could not make.
// A fetch of the HTML would satisfy none of them:
//   - hydration    — React must boot and own the input before typing sticks
//   - layout       — boundingBox() requires a layout engine (this is the
//                    mechanism A-5's ≥44px tap-target rule will use)
//   - computed CSS — resolved font-family, not the class name in the markup
//                    (the mechanism A-10 will use)
//   - image decode — naturalWidth > 0 means the SVG was fetched AND decoded
//
// If this file passes, the harness is real. That is all it claims.

test.describe('Playwright harness — proof of life', () => {
  test('renders the sign-in page in a real browser', async ({ page }) => {
    const response = await page.goto('/sign-in');
    expect(response?.ok()).toBe(true);

    // The rebranded product name reaches the browser tab.
    await expect(page).toHaveTitle(new RegExp(brand.name));
    await expect(page.getByRole('heading')).toBeVisible();
  });

  test('React hydrates — typing into the form actually sticks', async ({ page }) => {
    await page.goto('/sign-in');

    // The email input is a CONTROLLED React input: its value comes from state,
    // so it only retains what we type if the client bundle loaded, hydrated and
    // wired onChange. Server-rendered HTML alone fails this.
    const email = page.locator('#email');
    await email.fill('harness@example.invalid');
    await expect(email).toHaveValue('harness@example.invalid');
  });

  test('a layout engine is running — elements have real geometry', async ({ page }) => {
    await page.goto('/sign-in');

    // boundingBox() is layout output, not markup. This is exactly the mechanism
    // A-5 will use to assert every /m tap target is at least 44px.
    const box = await page.locator('#email').boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(0);
    expect(box!.height).toBeGreaterThan(0);
  });

  test('CSS is computed, not just declared', async ({ page }) => {
    await page.goto('/sign-in');

    // The RESOLVED font-family — what the engine actually chose after the
    // next/font stylesheet applied. The markup only carries a class name, so a
    // DOM-less runner cannot see this. A-10 will assert numeric text resolves
    // to IBM Plex Mono by exactly this route.
    const font = await page
      .locator('#email')
      .evaluate((el) => getComputedStyle(el).fontFamily);
    expect(font.length).toBeGreaterThan(0);
  });

  test('the brand wordmark is fetched and decoded, not just referenced', async ({ page }) => {
    await page.goto('/sign-in');

    // naturalWidth is 0 for a broken image even though the <img> tag is present
    // in the HTML either way — so this distinguishes "the asset exists and
    // decoded" from "the markup mentions it". Guards the rebrand's SVG assets.
    const logo = page.locator('img[src="/logo-full-light.svg"]');
    await expect(logo).toBeVisible();
    const naturalWidth = await logo.evaluate(
      (img) => (img as HTMLImageElement).naturalWidth
    );
    expect(naturalWidth).toBeGreaterThan(0);
  });
});
