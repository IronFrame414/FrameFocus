import { test, expect, type Page } from '@playwright/test';
import { signInAs } from './sign-in-as';

// ============================================================================
// S110 C — /m/account IS REACHABLE FROM INSIDE /m, BY CLICKING. [RULED Q7]
//
// The S109 link from /m/settings existed and no test had ever CLICKED it — a
// source-text check (s109-password-wiring) passed while Josh, on the installed
// app, could not find the page. This test takes the road a person takes: open
// the ☰ sheet, tap "Your account", land on the password form. For the default
// (crew) identity AND a subcontractor, because the ruling names both.
// ============================================================================

const SUB = 'josh+qa-sub@worthprop.com';

async function openSheet(page: Page) {
  // Hydration retry — same reason as m-shell.spec.ts openSheet().
  await expect(async () => {
    await page.getByTestId('m-hamburger').click();
    await expect(page.getByTestId('m-nav-sheet')).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
}

async function tapThrough(page: Page, start: string) {
  await page.goto(start);
  await openSheet(page);
  await page.getByTestId('m-sheet-account').click();
  await expect(page).toHaveURL(/\/m\/account$/, { timeout: 15_000 });
  await expect(page.getByTestId('password-form')).toBeVisible();
  // The sheet closed on the route change; the row now marks the current page.
  await expect(page.getByTestId('m-nav-sheet')).toHaveCount(0);
  await openSheet(page);
  await expect(page.getByTestId('m-sheet-account')).toHaveAttribute('aria-current', 'page');
}

test('crew member: ☰ → Your account → the password form', async ({ page }) => {
  await tapThrough(page, '/m/timeclock');
});

test('subcontractor: ☰ → Your account → the password form', async ({ page }) => {
  await signInAs(page, SUB);
  await tapThrough(page, '/m/projects');
});
