import { test as setup, expect } from '@playwright/test';
import path from 'node:path';

// M6M §10a — the signed-in state the /m criteria run against.
//
// WHY A SETUP PROJECT AND NOT A beforeEach. Every /m route is behind
// app/m/layout.tsx's auth gate, so each spec would otherwise pay a full
// sign-in round trip. This signs in ONCE and hands the cookies to every
// authenticated spec via storageState.
//
// WHY THE EXISTING harness.spec.ts MUST NOT INHERIT IT. That file targets
// /sign-in, and middleware.ts redirects an AUTHENTICATED request from /sign-in
// to /dashboard. Giving it this session would break five passing tests. Hence
// two browser projects in playwright.config.ts: 'chromium' stays anonymous and
// ignores m-*.spec.ts, 'chromium-auth' carries this state and runs only those.
//
// THE IDENTITY is the crew member — the role the field app is actually for, and
// the one with the least privilege, so nothing here passes on the strength of
// an Owner's visibility.
//
// THE CREDENTIALS are not a secret. These identities exist ONLY on rebuild-test
// (scripts/seed-test-identities.mjs refuses to run anywhere else), the password
// is already committed in that script and documented in STATE.md -> Test Data,
// and the database holds no real data. Both are overridable by env so a
// different environment does not require a code change.

const AUTH_FILE = path.join(__dirname, '.auth/user.json');

const EMAIL = process.env.E2E_EMAIL ?? 'josh+crew@worthprop.com';
const PASSWORD = process.env.E2E_PASSWORD ?? 'FrameFocusTest!2026';

setup('authenticate as the crew test identity', async ({ page }) => {
  await page.goto('/sign-in');

  await page.locator('#email').fill(EMAIL);
  await page.locator('#password').fill(PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();

  // The sign-in page pushes to /dashboard on success. Waiting for the URL to
  // leave /sign-in is what proves the credentials worked — a failed sign-in
  // stays put and renders an error, so this fails loudly rather than saving an
  // anonymous storageState that would make every downstream spec fail with a
  // redirect to /sign-in and no clue why.
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });

  await page.context().storageState({ path: AUTH_FILE });
});
