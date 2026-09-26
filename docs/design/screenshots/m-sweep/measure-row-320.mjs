// /m visual sweep, decision 5 — the site-visit measurement entry row at 320.
// Seeds one visit (as sweep.mjs does), measures the four controls against
// the viewport, screenshots the row, removes the visit. rebuild-test only.
// /m visual sweep — screenshots + measurements. rebuild-test only (the app's
// .env.local points there; the seed step re-checks the ref).
import { chromium } from '/workspaces/FrameFocus/node_modules/playwright/index.mjs';
import { createClient } from '/workspaces/FrameFocus/node_modules/@supabase/supabase-js/dist/index.mjs';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

for (const line of readFileSync('/workspaces/FrameFocus/apps/web/.env.local', 'utf8').split('\n')) {
  const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim().replace(/^(['"])(.*)\1$/, '$2');
}
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!URL_.includes('nmyphyhmfttxkdoposvf')) throw new Error(`REFUSING: ${URL_}`);
const admin = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const P = 'eaf0e25b-d60e-49c0-89b2-5612118d94b4';
const IDS = {};
// ---- seed one site visit (none exist on rebuild-test) --------------------
const { data: co } = await admin.from('companies').select('id').eq('slug', 'bishop-contracting').single();
const { data: est } = await admin
  .from('estimates').select('id').eq('company_id', co.id).eq('project_id', P)
  .order('created_at', { ascending: true }).limit(1).maybeSingle();
let estimateId = est?.id;
if (!estimateId) {
  const { data: anyEst } = await admin
    .from('estimates').select('id').eq('company_id', co.id).order('created_at').limit(1).single();
  estimateId = anyEst.id;
}
await admin.from('site_visits').delete().like('title', 'SWEEP %');
const { data: sv, error: svErr } = await admin
  .from('site_visits')
  .insert({ company_id: co.id, estimate_id: estimateId, title: 'SWEEP site visit' })
  .select('id').single();
if (svErr) console.error('site visit seed failed:', svErr.message);
// /m/site-visits/[id] is keyed by the ESTIMATE id (getSiteVisit(estimateId)).
IDS.id = sv ? estimateId : null;
const seededVisitId = sv?.id ?? null;

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
await page.goto('http://localhost:3100/sign-in');
await page.locator('#email').fill('josh+test50@worthprop.com');
await page.locator('#password').fill('FrameFocusTest!2026');
await page.getByRole('button', { name: /sign in/i }).click();
await page.waitForURL((u) => !u.pathname.startsWith('/sign-in'), { timeout: 60000 });
// the estimate the sweep keys the site visit on — any estimate with a visit; use the sweep's route via its results
const url = `/m/site-visits/${estimateId}`;
await page.goto(`http://localhost:3100${url}`, { waitUntil: 'networkidle' });
const r = await page.evaluate(() => {
  const vw = innerWidth;
  const f = (id) => { const el = document.querySelector(`[data-testid="${id}"]`); if (!el) return null; const b = el.getBoundingClientRect(); return { left: Math.round(b.left), right: Math.round(b.right), w: Math.round(b.width), overflowsBy: Math.max(0, Math.round(b.right - vw)) }; };
  const tabs = [...document.querySelectorAll('[data-testid="m-tabbar"] > *')].map((el) => Math.round(el.getBoundingClientRect().right));
  return { vw, area: f('sv-m-area'), length: f('sv-m-length'), width: f('sv-m-width'), add: f('sv-m-add'), tabbarScrollW: document.querySelector('[data-testid="m-tabbar"]').scrollWidth, tabRights: tabs };
});
console.log(JSON.stringify(r));
await page.locator('[data-testid="sv-m-area"]').scrollIntoViewIfNeeded();
await page.screenshot({ path: process.argv[3], type: 'jpeg', quality: 70 });
await b.close();
await admin.from('site_visits').delete().eq('id', seededVisitId);
