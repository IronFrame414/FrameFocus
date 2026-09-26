// S112 — English left in Spanish mode. For every /m route, collect each visible
// text node, placeholder and aria-label in `en` and in `es`; a string that is
// IDENTICAL in both is a candidate for untranslated system text. Data (project
// names, fixture titles) is also identical in both, so the output is a
// CANDIDATE list, reviewed by hand. rebuild-test only; language restored.
//
//   TD_ROLE=crew|owner TD_OUT=<file> TD_SV=<estimateId> node textdiff.mjs
import { chromium } from '/workspaces/FrameFocus/node_modules/playwright/index.mjs';
import { createClient } from '/workspaces/FrameFocus/node_modules/@supabase/supabase-js/dist/index.mjs';
import { readFileSync, writeFileSync } from 'node:fs';

for (const line of readFileSync('/workspaces/FrameFocus/apps/web/.env.local', 'utf8').split('\n')) {
  const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim().replace(/^(['"])(.*)\1$/, '$2');
}
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!URL_.includes('nmyphyhmfttxkdoposvf')) throw new Error(`REFUSING: ${URL_}`);
const admin = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const ACCOUNTS = {
  crew: { email: 'josh+crew@worthprop.com', userId: '3b74855a-329b-4dda-956b-6e3447caaa58' },
  owner: { email: 'josh+test50@worthprop.com', userId: '71123aeb-e286-4b24-aaae-65c34e81a57e' },
};
const ROLE = process.env.TD_ROLE;
const acct = ACCOUNTS[ROLE];
const IDS = {
  projectId: 'eaf0e25b-d60e-49c0-89b2-5612118d94b4',
  fileId: '0f1773b5-7662-429e-9001-64e84a3594b1',
  itemId: '8a44e1c5-291a-43ad-860f-40675bc1f295',
  coId: '194cea12-2cae-4878-b3e2-edb4633fc090',
  logId: '88536d73-254a-4db3-afd2-e24da46411a1',
  contactId: '8c7c9a6d-287d-4b0e-9a0b-2769adfed704',
  subId: '00c2bccc-a77e-498e-9ac6-9ee503df89d9',
  memberId: '18a105e7-2ff9-4546-a17b-87524a45e978',
  id: process.env.TD_SV,
  missing: 's112-no-such-route',
};
const ROUTES = readFileSync(new URL('./routes.txt', import.meta.url), 'utf8').trim().split('\n');
const fill = (r) => r.replace(/\[(?:\.\.\.)?(\w+)\]/g, (_, k) => IDS[k]);

const collect = (page) =>
  page.evaluate(() => {
    const out = new Set();
    const vis = (el) => { const b = el.getBoundingClientRect(); const cs = getComputedStyle(el); return b.width > 1 && b.height > 1 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const s = n.textContent.trim().replace(/\s+/g, ' ');
      if (s && n.parentElement && vis(n.parentElement) && !n.parentElement.closest('script,style')) out.add(`text:${s}`);
    }
    for (const el of document.querySelectorAll('[placeholder]')) if (vis(el)) out.add(`placeholder:${el.getAttribute('placeholder')}`);
    for (const el of document.querySelectorAll('[aria-label]')) out.add(`aria:${el.getAttribute('aria-label')}`);
    for (const el of document.querySelectorAll('option')) out.add(`option:${el.textContent.trim()}`);
    return [...out];
  });

const byLang = { en: {}, es: {} };
const { data: before } = await admin.from('profiles').select('language').eq('user_id', acct.userId).single();
const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto('http://localhost:3100/sign-in');
  await page.locator('#email').fill(acct.email);
  await page.locator('#password').fill('FrameFocusTest!2026');
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/sign-in'), { timeout: 60_000 });
  for (const lang of ['en', 'es']) {
    await admin.from('profiles').update({ language: lang }).eq('user_id', acct.userId);
    for (const route of ROUTES) {
      try {
        await page.goto(`http://localhost:3100${fill(route)}`, { waitUntil: 'networkidle', timeout: 60_000 });
        await page.waitForTimeout(400);
        byLang[lang][route] = await collect(page);
        // Open the ☰ sheet once per language — its text is not on any route.
        if (route === '/m') {
          await page.locator('[data-testid="m-hamburger"]').click();
          await page.waitForTimeout(300);
          byLang[lang]['#sheet'] = await collect(page);
        }
      } catch (e) {
        byLang[lang][route] = [`ERROR:${String(e.message).slice(0, 100)}`];
      }
    }
  }
  await ctx.close();
} finally {
  await browser.close();
  await admin.from('profiles').update({ language: before.language }).eq('user_id', acct.userId);
  const { data: after } = await admin.from('profiles').select('language').eq('user_id', acct.userId).single();
  console.log(`RESTORE ${ROLE}: original=${before.language} now=${after.language}`);
}
const same = {};
for (const route of Object.keys(byLang.es)) {
  const en = new Set(byLang.en[route] ?? []);
  // Letters only, at least one 3+ letter word — skips numbers, ids, dates like "8/25".
  same[route] = (byLang.es[route] ?? []).filter((s) => en.has(s) && /[A-Za-z]{3,}/.test(s.replace(/^\w+:/, '')));
}
writeFileSync(process.env.TD_OUT, JSON.stringify({ role: ROLE, same, byLang }, null, 1));
