// S121 1.7 — re-measure staleTimes.dynamic. Reconstructs S112's nav-cost harness
// (not in the repo): a /m tab REVISIT of a page visited <30s ago, timed from the
// tap until the destination's header <h1> shows, median of 3, per network profile.
// Also counts navigation (non-prefetch) RSC fetches during the revisit.
import { createRequire } from 'node:module';
const require = createRequire('/workspaces/FrameFocus/apps/web/package.json');
const { chromium } = require('@playwright/test');

const BASE = 'http://localhost:3000';
const LABEL = process.argv[2] ?? 'unlabelled';
const PROFILES = {
  unthrottled: null,
  fast3g: { latency: 562.5, downloadThroughput: (1.6 * 1024 * 1024 / 8) * 0.9, uploadThroughput: (750 * 1024 / 8) * 0.9 },
  slow3g: { latency: 2000, downloadThroughput: (500 * 1024 / 8) * 0.8, uploadThroughput: (500 * 1024 / 8) * 0.8 },
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 402, height: 874 } });
const page = await ctx.newPage();
await page.goto(BASE + '/sign-in');
await page.locator('#email').fill('josh+crew@worthprop.com');
await page.locator('#password').fill('FrameFocusTest!2026');
await page.getByRole('button', { name: /sign in/i }).click();
await page.waitForURL(/\/dashboard|\/m\//, { timeout: 60000 });

const cdp = await ctx.newCDPSession(page);
await cdp.send('Network.enable');

let navFetches = 0;
page.on('request', (r) => {
  const h = r.headers();
  if (h['rsc'] === '1' && !h['next-router-prefetch']) navFetches++;
});

const h1 = page.locator('header h1');
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const out = {};
for (const [name, cond] of Object.entries(PROFILES)) {
  await cdp.send('Network.emulateNetworkConditions', cond
    ? { offline: false, ...cond }
    : { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  // Warm: land on Projects, visit Field, so Projects is in the router cache.
  await page.goto(BASE + '/m/projects');
  await h1.filter({ hasText: 'Projects' }).waitFor({ timeout: 120000 });
  const times = [];
  let fetches = 0;
  for (let i = 0; i < 3; i++) {
    await page.getByTestId('m-tab-field').click();
    await h1.filter({ hasText: 'Field' }).waitFor({ timeout: 120000 });
    await page.waitForTimeout(1500);
    navFetches = 0;
    const t0 = Date.now();
    await page.getByTestId('m-tab-projects').click();
    await h1.filter({ hasText: 'Projects' }).waitFor({ timeout: 120000 });
    times.push(Date.now() - t0);
    await page.waitForTimeout(300);
    fetches += navFetches;
  }
  out[name] = { times, median: median(times), navRscFetches: fetches };
}
console.log(JSON.stringify({ label: LABEL, results: out }));
await browser.close();
