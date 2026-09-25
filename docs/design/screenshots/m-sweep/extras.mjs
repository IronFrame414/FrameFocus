// /m visual sweep — states the route sweep does not reach. rebuild-test only.
//   co-denied      crew opens a real change-order link (decision 6)
//   not-found      an /m URL with no route (decision 6)
//   desktop-notif  the DESKTOP notifications page — same shared list (decision 1)
import { chromium } from '/workspaces/FrameFocus/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';
const BASE = 'http://localhost:3100';
const OUT = process.env.SWEEP_OUT;
const P = 'eaf0e25b-d60e-49c0-89b2-5612118d94b4';
const CO = '194cea12-2cae-4878-b3e2-edb4633fc090';
const b = await chromium.launch();
async function signIn(ctx, email) {
  const page = await ctx.newPage();
  await page.goto(`${BASE}/sign-in`);
  await page.locator('#email').fill(email);
  await page.locator('#password').fill('FrameFocusTest!2026');
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/sign-in'), { timeout: 60_000 });
  return page;
}
const shot = async (page, role, w, name) => {
  mkdirSync(`${OUT}/${role}/${w}`, { recursive: true });
  await page.screenshot({ path: `${OUT}/${role}/${w}/${name}.jpg`, type: 'jpeg', quality: 70 });
  console.log(`${role} ${w} ${name} -> ${new URL(page.url()).pathname}${new URL(page.url()).search}`);
};
for (const [role, email] of [['crew', 'josh+crew@worthprop.com'], ['owner', 'josh+test50@worthprop.com']]) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await signIn(ctx, email);
  for (const [w, h] of [[390, 844], [360, 800]]) {
    await page.setViewportSize({ width: w, height: h });
    if (role === 'crew') {
      await page.goto(`${BASE}/m/p/${P}/changes/${CO}`, { waitUntil: 'networkidle' });
      await shot(page, role, w, 'extra--co-denied');
    }
    await page.goto(`${BASE}/m/no-such-route`, { waitUntil: 'networkidle' });
    await shot(page, role, w, 'extra--not-found');
  }
  await ctx.close();
}
const dctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
const dpage = await signIn(dctx, 'josh+test50@worthprop.com');
await dpage.goto(`${BASE}/dashboard/notifications`, { waitUntil: 'networkidle' });
await shot(dpage, 'owner', 1280, 'extra--desktop-notifications');
await dctx.close();
await b.close();
