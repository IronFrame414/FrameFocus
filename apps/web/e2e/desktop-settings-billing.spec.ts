import { test, expect, type Page } from '@playwright/test';

// "Move Billing into Settings" — acceptance proof.
//
// Billing became the owner-only EIGHTH Settings tab. This file proves the two
// halves that matter:
//   · an OWNER sees the tab and its content, and the old /dashboard/billing URL
//     still lands somewhere that works (permanent redirect);
//   · an ADMIN sees NO tab AND cannot reach the content by URL — the server
//     never ships it, so this is a real gate, not a hidden panel.
//
// ⚠️ THE ADMIN ASSERTIONS CHECK ABSENCE FROM THE PAYLOAD, not just visibility.
// settings-tabs.tsx keeps every mounted panel in the DOM (display:none), so a
// visibility check would pass even if the content were shipped. These assert the
// panel testid and the heading text are ABSENT entirely.

const PASSWORD = process.env.E2E_PASSWORD ?? 'FrameFocusTest!2026';

const ROLES = {
  owner: 'josh+test50@worthprop.com',
  admin: 'josh+qa-admin@worthprop.com',
} as const;

async function signIn(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto('/sign-in');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
}

test.describe('Owner — sees and uses the Billing tab', () => {
  test('the Billing tab is present in Settings and opens the billing content', async ({ page }) => {
    await signIn(page, ROLES.owner);
    await page.goto('/dashboard/settings');
    const tab = page.getByTestId('settings-tab-billing');
    await expect(tab).toBeVisible();
    await tab.click();
    // The moved overview — heading + the Status row it always renders.
    await expect(page.getByRole('heading', { name: 'Billing & Subscription' })).toBeVisible();
    await expect(page.getByText('Status', { exact: true })).toBeVisible();
  });

  test('the old /dashboard/billing URL permanently redirects into the tab', async ({ page }) => {
    await signIn(page, ROLES.owner);
    await page.goto('/dashboard/billing');
    await expect(page).toHaveURL(/\/dashboard\/settings\?tab=billing/);
    await expect(page.getByRole('heading', { name: 'Billing & Subscription' })).toBeVisible();
  });

  test('?tab=billing deep-links straight to the billing panel', async ({ page }) => {
    await signIn(page, ROLES.owner);
    await page.goto('/dashboard/settings?tab=billing');
    await expect(page.getByTestId('settings-panel-billing')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Billing & Subscription' })).toBeVisible();
  });
});

test.describe('Admin — no tab, and no reach by URL', () => {
  test('Settings shows an admin NO Billing tab', async ({ page }) => {
    await signIn(page, ROLES.admin);
    await page.goto('/dashboard/settings');
    await expect(page.getByTestId('settings-tab-billing')).toHaveCount(0);
    // Absent from the payload, not merely hidden.
    await expect(page.getByTestId('settings-panel-billing')).toHaveCount(0);
    await expect(page.getByText('Billing & Subscription')).toHaveCount(0);
  });

  test('an admin guessing ?tab=billing gets the first tab, not billing', async ({ page }) => {
    await signIn(page, ROLES.admin);
    await page.goto('/dashboard/settings?tab=billing');
    // settings-tabs falls back to the first tab when the key is absent.
    await expect(page.getByTestId('settings-panel-billing')).toHaveCount(0);
    await expect(page.getByText('Billing & Subscription')).toHaveCount(0);
    // The Company tab (first) is what they land on.
    await expect(page.getByTestId('settings-tab-company')).toBeVisible();
  });

  test('an admin hitting the old /dashboard/billing URL cannot see billing either', async ({
    page,
  }) => {
    await signIn(page, ROLES.admin);
    await page.goto('/dashboard/billing');
    // Redirects into Settings, where the admin still has no billing tab/content.
    await expect(page).toHaveURL(/\/dashboard\/settings/);
    await expect(page.getByTestId('settings-panel-billing')).toHaveCount(0);
    await expect(page.getByText('Billing & Subscription')).toHaveCount(0);
  });
});
