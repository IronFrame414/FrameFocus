// /m visual sweep — decision 6: does ANY /m route still fall through to the
// bare root 404? Every parameterised route, with (a) every id missing and
// (b) a real project but the leaf id missing, as crew and as owner. A route
// passes if it renders inside the /m shell (m-shell present) — as a
// not-found, a denied notice, or a real screen. rebuild-test only.
import { chromium } from '/workspaces/FrameFocus/node_modules/playwright/index.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
const BASE = 'http://localhost:3100';
const P = 'eaf0e25b-d60e-49c0-89b2-5612118d94b4';
const CO = '194cea12-2cae-4878-b3e2-edb4633fc090';
const MISSING = '00000000-0000-4000-8000-000000000000';
const ROUTES = readFileSync(new URL('./routes.txt', import.meta.url), 'utf8').trim().split('\n').filter((r) => r.includes('['));
const urls = [];
for (const r of ROUTES) {
  urls.push({ route: r, kind: 'all-missing', url: r.replace(/\[\w+\]/g, MISSING) });
  if (r.includes('[projectId]') && /\[projectId\].*\[\w+\]/.test(r))
    urls.push({ route: r, kind: 'leaf-missing', url: r.replace('[projectId]', P).replace(/\[\w+\]/g, MISSING) });
}
urls.push({ route: '/m/no-such-route', kind: 'unmatched', url: '/m/no-such-route' });
urls.push({ route: `/m/p/[projectId]/nope`, kind: 'unmatched', url: `/m/p/${P}/nope` });
urls.push({ route: '/m/p/[projectId]/changes/[coId]', kind: 'real-co', url: `/m/p/${P}/changes/${CO}` });

const out = [];
const b = await chromium.launch();
for (const [role, email] of [['crew', 'josh+crew@worthprop.com'], ['owner', 'josh+test50@worthprop.com']]) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/sign-in`);
  await page.locator('#email').fill(email);
  await page.locator('#password').fill('FrameFocusTest!2026');
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/sign-in'), { timeout: 60_000 });
  for (const u of urls) {
    const resp = await page.goto(`${BASE}${u.url}`, { waitUntil: 'networkidle', timeout: 60_000 });
    const rec = await page.evaluate(() => ({
      shell: !!document.querySelector('[data-testid="m-shell"]'),
      notFound: !!document.querySelector('[data-testid="m-not-found"]'),
      denied: document.querySelector('[data-testid="m-denied"]')?.textContent ?? null,
      rootText: document.body.innerText.includes('This page could not be found'),
    }));
    const r = { role, ...u, status: resp?.status(), final: new URL(page.url()).pathname + new URL(page.url()).search, ...rec, bare: !rec.shell };
    out.push(r);
    console.log(`${r.bare ? 'BARE ' : 'ok   '}${role} ${u.kind} ${u.route} -> ${r.status} ${r.final.replace(MISSING, '<missing>')}${r.notFound ? ' [not-found]' : ''}${r.denied ? ` [denied: ${r.denied.slice(0, 50)}]` : ''}`);
  }
  await ctx.close();
}
await b.close();
writeFileSync(process.env.PROBE_OUT, JSON.stringify(out, null, 2));
console.log(`BARE_COUNT=${out.filter((r) => r.bare).length} of ${out.length}`);
