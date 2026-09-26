// Chat overlay (in a project): does any composer element sit under the camera
// FAB? The overlay is a sibling of <main>, so audit.mjs's obscured check (main
// only) cannot see it. Language comes from the profile; run once per language.
import { chromium } from '/workspaces/FrameFocus/node_modules/playwright/index.mjs';
const BASE = 'http://localhost:3100';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
await page.goto(`${BASE}/sign-in`);
await page.locator('#email').fill(process.env.EMAIL);
await page.locator('#password').fill('FrameFocusTest!2026');
await page.getByRole('button', { name: /sign in/i }).click();
await page.waitForURL((u) => !u.pathname.startsWith('/sign-in'));
for (const [w, h] of [[360, 800], [390, 844], [430, 932]]) {
  await page.setViewportSize({ width: w, height: h });
  await page.goto(`${BASE}/m/p/eaf0e25b-d60e-49c0-89b2-5612118d94b4`, { waitUntil: 'networkidle' });
  await page.locator('[data-testid="m-tab-chat"]').click();
  await page.waitForTimeout(1800);
  const r = await page.evaluate(() => {
    const fab = document.querySelector('[data-testid="m-camera"]').getBoundingClientRect();
    const out = [];
    for (const el of document.querySelectorAll('[data-testid^="chat-"]')) {
      const b = el.getBoundingClientRect();
      if (!b.width || !b.height) continue;
      if (b.bottom > fab.top && b.right > fab.left && b.left < fab.right) out.push(`${el.dataset.testid} bottom=${Math.round(b.bottom)} fabTop=${Math.round(fab.top)} overlap=${Math.round(b.bottom - fab.top)}px x=${Math.round(b.left)}-${Math.round(b.right)} fabX=${Math.round(fab.left)}-${Math.round(fab.right)}`);
    }
    const hint = document.querySelector('[data-testid="chat-mention-hint"]')?.getBoundingClientRect();
    return { out, hintBottom: hint && Math.round(hint.bottom), fabTop: Math.round(fab.top) };
  });
  console.log(w, JSON.stringify(r));
}
await b.close();
