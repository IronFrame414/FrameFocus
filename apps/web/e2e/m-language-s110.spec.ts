import { test, expect, type Page } from '@playwright/test';
import { adminClient } from './hub-fixture';

// ============================================================================
// S110 H [RULED Josh, rulings 1–2] — THE LANGUAGE SETTING, in a real browser.
//
//   L1  the crew member switches to Español on /m/account → the /m chrome is
//       Spanish (tab bar, ☰ sheet), with every data-testid unchanged
//   L2  …and /dashboard chrome STAYS English for the same user (ruling 2)
//   L3  switching back to English restores the English chrome
//
// ⚠️ The default e2e identity (the crew QA user) is SHARED by every /m spec.
// afterAll forces its language back to 'en' through the service role, so a
// failed run cannot leave the next suite reading Spanish.
// ============================================================================

const CREW = 'josh+crew@worthprop.com';
const admin = adminClient();

async function setLanguageByAdmin(lang: 'en' | 'es') {
  const { error } = await admin.from('profiles').update({ language: lang }).eq('email', CREW);
  if (error) throw new Error(`reset language: ${error.message}`);
}

async function openSheet(page: Page) {
  await expect(async () => {
    await page.getByTestId('m-hamburger').click();
    await expect(page.getByTestId('m-nav-sheet')).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
}

test.beforeAll(async () => setLanguageByAdmin('en'));
test.afterAll(async () => setLanguageByAdmin('en'));

test('L1–L3 — Español on /m, English on /dashboard, and back', async ({ page }) => {
  // Start English.
  await page.goto('/m/account');
  await expect(page.getByTestId('language-form')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('m-tab-projects')).toHaveText(/Projects/);

  // L1 — switch to Español through the real form (RLS + the self-edit guard).
  await page.getByTestId('language-es').click();
  await expect(page.getByTestId('language-es')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('m-tab-projects')).toHaveText(/Proyectos/, { timeout: 20_000 });
  const { data: row } = await admin.from('profiles').select('language').eq('email', CREW).single();
  expect(row!.language, 'the setting did not reach the database').toBe('es');
  await page.goto('/m/timeclock');
  await openSheet(page);
  await expect(page.getByTestId('m-sign-out')).toHaveText('Cerrar sesión');
  await expect(page.getByTestId('m-sheet-account')).toHaveText('Tu cuenta');

  // L2 — the DASHBOARD chrome stays English for the same Spanish user.
  await page.goto('/dashboard/account');
  await expect(page.getByRole('heading', { name: 'Your account' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Your name, password and language.')).toBeVisible();

  // L3 — back to English, through the form on /m.
  await page.goto('/m/account');
  await page.getByTestId('language-en').click();
  await expect(page.getByTestId('m-tab-projects')).toHaveText(/Projects/, { timeout: 20_000 });
});
