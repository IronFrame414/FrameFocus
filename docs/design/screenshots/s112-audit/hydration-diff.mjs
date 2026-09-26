// /m/site-visits/[id] throws React #418/#423 on every load. Diff the SSR DOM
// (JavaScript disabled) against the hydrated DOM to locate the mismatch.
import { chromium } from '/workspaces/FrameFocus/node_modules/playwright/index.mjs';
const BASE = 'http://localhost:3100';
const URL_ = `${BASE}/m/site-visits/${process.env.SV}`;
const b = await chromium.launch();
const login = await b.newContext();
{ const page = await login.newPage();
  await page.goto(`${BASE}/sign-in`);
  await page.locator('#email').fill('josh+crew@worthprop.com');
  await page.locator('#password').fill('FrameFocusTest!2026');
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/sign-in')); }
const state = await login.storageState();
async function grab(js) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, javaScriptEnabled: js, storageState: state });
  const page = await ctx.newPage();
  await page.goto(URL_, { waitUntil: js ? 'networkidle' : 'load' }); await page.waitForTimeout(800);
  const lines = await page.evaluate(() => { const m = document.querySelector('main') || document.body; const out = []; const w = document.createTreeWalker(m, NodeFilter.SHOW_ELEMENT); for (let n = w.currentNode; n; n = w.nextNode()) { const t = [...n.childNodes].filter((c) => c.nodeType === 3).map((c) => c.textContent.trim()).join(' ').trim(); out.push(`${n.tagName.toLowerCase()}${n.getAttribute('data-testid') ? '[' + n.getAttribute('data-testid') + ']' : ''}${t ? ' | ' + t.slice(0, 80) : ''}${n.tagName === 'INPUT' || n.tagName === 'TEXTAREA' ? ' ph=' + n.getAttribute('placeholder') : ''}`); } return out; });
  await ctx.close();
  return lines;
}
const ssr = await grab(false);
const csr = await grab(true);
console.log('ssr nodes', ssr.length, 'csr nodes', csr.length);
const A = new Set(ssr), B = new Set(csr);
console.log('--- only in SSR'); for (const l of ssr) if (!B.has(l)) console.log(l);
console.log('--- only after hydration'); for (const l of csr) if (!A.has(l)) console.log(l);
await b.close();
