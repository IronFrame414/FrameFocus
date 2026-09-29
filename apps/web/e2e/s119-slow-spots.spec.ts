import { test, expect } from '@playwright/test';
import { signInAs } from './sign-in-as';

// ============================================================================
// S119 ITEM E — two request-count regressions, pinned.
//
// E-2: `/m` is answered by next.config.js BEFORE middleware and the /m layout.
//      Observable without a session: middleware would send a signed-out caller
//      to /sign-in; the config redirect sends every caller to /m/timeclock first.
// E-3: one `/api/chat/threads` call per dashboard load (the chat badge), not two.
// (E-1 — the rollups — is proven by the money suites and a byte-identical
//  before/after dump; see the S119 report.)
// ============================================================================

const OWNER = 'josh+test50@worthprop.com';
const PROJECT = '4a4f8567-67f8-4394-baae-181229974bd9'; // QA A — isolation fixture

test('E-2 — /m is redirected to /m/timeclock before middleware runs', async ({ request }) => {
  const res = await request.get('/m', { maxRedirects: 0 });
  expect(res.status()).toBe(307);
  expect(new URL(res.headers()['location'], 'http://x').pathname).toBe('/m/timeclock');
});

test('E-3 — a dashboard page load fetches /api/chat/threads exactly once', async ({ page }) => {
  await signInAs(page, OWNER);
  let calls = 0;
  page.on('request', (r) => {
    if (new URL(r.url()).pathname === '/api/chat/threads') calls += 1;
  });
  await page.goto(`/dashboard/projects/${PROJECT}`);
  await expect(page.getByTestId('chat-launcher')).toBeVisible();
  await page.waitForTimeout(5000);
  expect(calls).toBe(1);
});
