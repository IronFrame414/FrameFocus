import { chromium } from '/workspaces/FrameFocus/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';
const BASE = 'http://localhost:3100';
const OUT = process.env.SWEEP_OUT;
const b = await chromium.launch();
const measure = (page) => page.evaluate(() => {
  const fab = document.querySelector('[data-testid="m-camera"]').getBoundingClientRect();
  const out = [];
  for (const el of document.querySelectorAll('textarea, button, input')) {
    if (el.closest('[data-testid="m-tabbar"]')) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    if (r.bottom > fab.top + 1 && r.right > fab.left && r.left < fab.right)
      out.push(`${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.textContent || '').trim().slice(0, 25)}" ${Math.round(r.bottom - fab.top)}px`);
  }
  // the overlay's own scroller, scrolled to its end
  return { fabTop: Math.round(fab.top), underFab: out };
});
for (const [role, email] of [['crew', 'josh+crew@worthprop.com'], ['owner', 'josh+test50@worthprop.com']]) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/sign-in`);
  await page.locator('#email').fill(email);
  await page.locator('#password').fill('FrameFocusTest!2026');
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/sign-in'), { timeout: 60000 });
  for (const [w, h] of [[390, 844], [360, 800]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(`${BASE}/m/projects`, { waitUntil: 'networkidle' });
    await page.locator('[data-testid="m-tab-chat"]').click();
    await page.waitForTimeout(1200);
    // list, scrolled to its end
    await page.evaluate(() => { for (const el of document.querySelectorAll('*')) { const s = getComputedStyle(el); if ((s.overflowY === 'auto' || s.overflowY === 'scroll') && el.scrollHeight > el.clientHeight && el.getAttribute('data-testid') !== 'm-content') el.scrollTop = el.scrollHeight; } });
    await page.waitForTimeout(300);
    const listEnd = await measure(page);
    mkdirSync(`${OUT}/${role}/${w}`, { recursive: true });
    await page.screenshot({ path: `${OUT}/${role}/${w}/chat-list--bottom.jpg`, type: 'jpeg', quality: 70 });
    await page.locator('[data-testid="chat-switcher"]').getByText('Lakeview Kitchen Remodel').first().click();
    await page.waitForTimeout(2000);
    const thread = await measure(page);
    await page.screenshot({ path: `${OUT}/${role}/${w}/chat-thread.jpg`, type: 'jpeg', quality: 70 });
    console.log(JSON.stringify({ role, w, listEnd, thread }));
  }
  await ctx.close();
}
await b.close();
