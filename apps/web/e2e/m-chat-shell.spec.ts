import { test, expect } from '@playwright/test';

// CHUNK 6 — mobile chat's SHELL criteria. ND-36, ND-37, ND-40.
// A-C30, A-C33, A-C34, A-C35, A-C42.
//
// `m-*.spec.ts`, so this runs in the `chromium-auth` project: 402x874 with the
// crew session from auth.setup.ts. That is the right identity — crew is who the
// field app is for and the least privileged, so nothing here passes on the
// strength of an Owner's visibility.

const PROJECT = 'eaf0e25b-d60e-49c0-89b2-5612118d94b4';

test.describe('A-C30 — the bar is five slots, and Logs is not one of them', () => {
  test('Projects · Timeclock · [camera] · Chat · Field', async ({ page }) => {
    await page.goto('/m/projects');
    const bar = page.getByTestId('m-tabbar');
    await expect(bar).toBeVisible();

    await expect(bar.getByText('Projects', { exact: true })).toHaveCount(1);
    await expect(bar.getByText('Timeclock', { exact: true })).toHaveCount(1);
    await expect(page.getByTestId('m-camera')).toBeVisible();
    await expect(page.getByTestId('m-tab-chat')).toBeVisible();
    await expect(bar.getByText('Field', { exact: true })).toHaveCount(1);

    // ⚠️ ASSERTING THE ABSENCE MATTERS AS MUCH AS THE PRESENCE. A build that
    // adds Chat without removing Logs is SIX slots and reopens ND-14's
    // arithmetic — every side item's envelope shrinks and the camera loses its
    // true centre.
    await expect(bar.getByText('Logs', { exact: true })).toHaveCount(0);
  });
});

test.describe('A-C33 — /m/logs lights nothing', () => {
  test('the bar renders and no slot carries the active state', async ({ page }) => {
    await page.goto('/m/logs');
    await expect(page.getByTestId('m-tabbar')).toBeVisible();

    // The Logs slot no longer exists to light, so this holds by the same
    // mechanism /m/offline already used rather than by a special case.
    await expect(page.locator('[data-testid="m-tabbar"] [data-active="true"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="m-tabbar"] [aria-current="page"]')).toHaveCount(0);
  });

  test('and it keeps the HAMBURGER, not a back chevron (D-39)', async ({ page }) => {
    // A-42b extended to a seventh route. A chevron here makes the sheet
    // unopenable on exactly the screen A-3c/A-41 are about — stranding A-3c for
    // the third time.
    await page.goto('/m/logs');
    await expect(page.getByTestId('m-hamburger')).toBeVisible();
    await expect(page.getByTestId('m-back')).toHaveCount(0);
  });
});

test.describe('A-C34 / A-C35 — the Chat slot opens an OVERLAY', () => {
  test('tapping Chat does not change the route', async ({ page }) => {
    await page.goto('/m/projects');
    const before = page.url();

    await page.getByTestId('m-tab-chat').click();
    await expect(page.getByTestId('m-chat-overlay')).toBeVisible({ timeout: 20_000 });
    expect(page.url()).toBe(before);
  });

  test('the slot is lit ONLY while the overlay is open', async ({ page }) => {
    await page.goto('/m/projects');
    const slot = page.getByTestId('m-tab-chat');

    // ND-37: a slot that opens an overlay has no screen to reflect, so its
    // active state means the overlay is open — and never the route underneath.
    await expect(slot).toHaveAttribute('data-active', 'false');
    await slot.click();
    await expect(slot).toHaveAttribute('data-active', 'true');
    await page.getByTestId('m-chat-close').click();
    await expect(page.getByTestId('m-chat-overlay')).toHaveCount(0);
    await expect(slot).toHaveAttribute('data-active', 'false');
  });

  test('⚠️ on a PROJECT screen the slot is still unlit until tapped', async ({ page }) => {
    // The failure ND-37 names: lighting Chat because the user happens to be on
    // a project misstates where they are. /m/p/{id} leaves PROJECTS active.
    await page.goto(`/m/p/${PROJECT}`);
    await expect(page.getByTestId('m-tab-chat')).toHaveAttribute('data-active', 'false');
  });

  test('A-C35 — the tab bar stays in the DOM and the slot stays tappable', async ({ page }) => {
    await page.goto('/m/projects');
    await page.getByTestId('m-tab-chat').click();
    await expect(page.getByTestId('m-chat-overlay')).toBeVisible({ timeout: 20_000 });

    // M6M A-1 constrains the overlay's geometry: a panel that covered the bar
    // would fail A-1 AND trap the user, because the slot is how it closes.
    await expect(page.getByTestId('m-tabbar')).toBeVisible();
    const bar = (await page.getByTestId('m-tabbar').boundingBox())!;
    const overlay = (await page.getByTestId('m-chat-overlay').boundingBox())!;
    expect(overlay.y + overlay.height).toBeLessThanOrEqual(bar.y + 1);

    // And it genuinely closes from the slot, not only from the ✕.
    await page.getByTestId('m-tab-chat').click();
    await expect(page.getByTestId('m-chat-overlay')).toHaveCount(0);
  });
});

test.describe('A-C42 — the mobile mention destination', () => {
  test('?chat=1 opens the overlay on the project screen, with no route change', async ({
    page,
  }) => {
    await page.goto(`/m/p/${PROJECT}?chat=1`);

    // The whole of ND-40: the recipient of "@Josh needs you on Alvarez" lands
    // IN the conversation, not on a list they must search.
    await expect(page.getByTestId('m-chat-overlay')).toBeVisible({ timeout: 20_000 });
    await expect(page).toHaveURL(new RegExp(`/m/p/${PROJECT}\\?chat=1$`));
    await expect(page.getByTestId('m-tab-chat')).toHaveAttribute('data-active', 'true');
  });

  test('⚠️ and /m/p/{id}/chat does NOT exist', async ({ page }) => {
    // The negative half is required: it is what keeps ND-37 literally true
    // rather than half-true. A thin route "just for the link" would put a chat
    // page back in the tree.
    const res = await page.goto(`/m/p/${PROJECT}/chat`);
    expect(res?.status()).toBe(404);
  });
});
