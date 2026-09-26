// Tile load states over time on M-8 (crew, 390). Reads data-state / data-lazy
// from photo-grid.tsx's own attributes, and every image response's status.
import { chromium } from '/workspaces/FrameFocus/node_modules/playwright/index.mjs';
const BASE = 'http://localhost:3100';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const imgs = [];
page.on('response', (r) => { if (r.request().resourceType() === 'image') imgs.push({ s: r.status(), u: r.url().replace(/\?.*/, '').slice(-70) }); });
await page.goto(`${BASE}/sign-in`);
await page.locator('#email').fill(process.env.EMAIL ?? 'josh+crew@worthprop.com');
await page.locator('#password').fill('FrameFocusTest!2026');
await page.getByRole('button', { name: /sign in/i }).click();
await page.waitForURL((u) => !u.pathname.startsWith('/sign-in'));
await page.goto(`${BASE}/m/p/eaf0e25b-d60e-49c0-89b2-5612118d94b4/photos`, { waitUntil: 'networkidle' });
for (const t of [0, 1000, 3000, 8000]) {
  if (t) await page.waitForTimeout(t);
  const s = await page.$$eval('[data-testid="m-tile-image"]', (els) => els.map((e) => `${e.dataset.state}/${e.dataset.lazy}/${e.naturalWidth}`));
  console.log(`+${t}ms`, s.join(' '));
}
console.log('image responses', imgs.length, JSON.stringify(imgs.slice(0, 12)));
await page.screenshot({ path: process.env.OUT ?? 'tile-probe.jpg', type: 'jpeg', quality: 60 });
await b.close();
