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

const BASE = process.env.SWEEP_BASE ?? 'http://localhost:3100';
const OUT = process.env.SWEEP_OUT; // docs/design/screenshots/<label>
const LABEL = process.env.SWEEP_LABEL ?? 'before';
const ONLY = process.env.SWEEP_ONLY ? process.env.SWEEP_ONLY.split(',') : null;
if (!OUT) throw new Error('SWEEP_OUT required');

const P = 'eaf0e25b-d60e-49c0-89b2-5612118d94b4';
const IDS = {
  projectId: P,
  fileId: '0f1773b5-7662-429e-9001-64e84a3594b1',
  itemId: '8a44e1c5-291a-43ad-860f-40675bc1f295',
  coId: '194cea12-2cae-4878-b3e2-edb4633fc090',
  logId: '88536d73-254a-4db3-afd2-e24da46411a1',
  contactId: '8c7c9a6d-287d-4b0e-9a0b-2769adfed704',
  subId: '00c2bccc-a77e-498e-9ac6-9ee503df89d9',
  memberId: '18a105e7-2ff9-4546-a17b-87524a45e978',
  id: null, // site visit, seeded below
};

const ROUTES = readFileSync(process.env.SWEEP_ROUTES, 'utf8').trim().split('\n');
const ROLES = [
  { role: 'crew', email: 'josh+crew@worthprop.com' },
  { role: 'owner', email: 'josh+test50@worthprop.com' },
];
// SWEEP_WIDTHS=320x640,360x800 overrides (added for the 320 check on the
// site-visit measurement row).
const WIDTHS = process.env.SWEEP_WIDTHS
  ? process.env.SWEEP_WIDTHS.split(',').map((p) => { const [w, h] = p.split('x').map(Number); return { w, h }; })
  : [
      { w: 390, h: 844 },
      { w: 360, h: 800 },
    ];

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

const fill = (r) => r.replace(/\[(\w+)\]/g, (_, k) => IDS[k] ?? `MISSING-${k}`);
const slug = (r) => (r === '/m' ? 'm-home' : r.slice(1).replace(/\[(\w+)\]/g, '$1').replace(/\//g, '__'));

async function measure(page) {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const main = document.querySelector('[data-testid="m-content"]');
    const fab = document.querySelector('[data-testid="m-camera"]');
    const bar = document.querySelector('[data-testid="m-tabbar"]');
    const r = (el) => el && el.getBoundingClientRect();
    const describe = (el) => {
      const tid = el.getAttribute('data-testid');
      const cls = (el.getAttribute('class') || '').split(/\s+/).slice(0, 3).join('.');
      const txt = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
      return `${el.tagName.toLowerCase()}${tid ? `[${tid}]` : ''}${cls ? `.${cls}` : ''}${txt ? ` "${txt}"` : ''}`;
    };

    // Horizontal overflow — page and scroll container, and the widest offender.
    const docOver = document.documentElement.scrollWidth - vw;
    const mainOver = main ? main.scrollWidth - main.clientWidth : 0;
    let worst = null;
    for (const el of document.querySelectorAll('body *')) {
      const b = el.getBoundingClientRect();
      if (b.width === 0 || b.height === 0) continue;
      const over = Math.round(b.right - vw);
      if (over > 0 && (!worst || over > worst.px)) worst = { px: over, el: describe(el) };
    }

    // Scroll to the end, then find content under the FAB or the bar.
    const out = { docOver, mainOver, worst, fab: null, obscured: [], clearance: null, scrolls: false };
    if (main) {
      out.scrolls = main.scrollHeight > main.clientHeight + 1;
      main.scrollTop = main.scrollHeight;
    }
    const fr = r(fab), br = r(bar), mr = r(main);
    if (fr && mr) out.fab = { top: Math.round(fr.top), left: Math.round(fr.left), right: Math.round(fr.right), overhang: Math.round(mr.bottom - fr.top) };
    if (main) {
      const content = [...main.querySelectorAll('input,textarea,select,button,a,img,video,canvas,label,[role="button"],p,span,h1,h2,h3,li,td,svg')]
        .filter((el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0 && getComputedStyle(el).visibility !== 'hidden'; });
      let lastBottom = -Infinity;
      for (const el of content) {
        const b = el.getBoundingClientRect();
        if (b.bottom > mr.bottom + 1) continue; // still scrollable away
        lastBottom = Math.max(lastBottom, b.bottom);
        const underFab = fr && b.bottom > fr.top + 1 && b.right > fr.left && b.left < fr.right;
        const underBar = br && b.bottom > br.top + 1;
        if (underFab || underBar) out.obscured.push({ by: underBar ? 'bar' : 'fab', px: Math.round(b.bottom - (underBar ? br.top : fr.top)), el: describe(el) });
      }
      if (fr && lastBottom > -Infinity) out.clearance = Math.round(fr.top - lastBottom);
      // fixed/sticky descendants of main that sit over the bar/FAB
      for (const el of main.querySelectorAll('*')) {
        const pos = getComputedStyle(el).position;
        if (pos !== 'fixed' && pos !== 'sticky') continue;
        const b = el.getBoundingClientRect();
        if (b.height && br && b.bottom > br.top) out.obscured.push({ by: `${pos}-over-bar`, px: Math.round(b.bottom - br.top), el: describe(el) });
      }
      out.obscured = out.obscured.slice(0, 8);
    }

    // Rows: shared 58px row vs own markup; bare (unstyled) buttons.
    const lis = main ? [...main.querySelectorAll('li')] : [];
    const shared = lis.filter((li) => (li.getAttribute('class') || '').includes('min-h-[58px]')).length;
    const bare = main ? [...main.querySelectorAll('button')].filter((b) => {
      const s = getComputedStyle(b); const rect = b.getBoundingClientRect();
      return rect.width > 0 && s.backgroundColor === 'rgba(0, 0, 0, 0)' && parseFloat(s.borderTopWidth) === 0 && parseFloat(s.paddingLeft) === 0 && parseFloat(s.paddingTop) === 0 && (b.textContent || '').trim().length > 1;
    }).map((b) => (b.textContent || '').trim().slice(0, 30)) : [];
    out.rows = { li: lis.length, shared58: shared, own: lis.length - shared };
    // STRUCTURAL: space the page leaves below its last content, in scroll
    // coordinates — valid whether or not the screen scrolls today.
    if (main) {
      const top = main.getBoundingClientRect().top - main.scrollTop;
      // contentBottom: every in-flow box, containers INCLUDED (so a page's
      // own bottom padding counts). leafBottom: the last thing a user sees.
      let contentBottom = 0, leafBottom = 0;
      const LEAF = 'input,textarea,select,button,a,img,video,canvas,label,[role="button"],p,span,h1,h2,h3,h4,svg';
      for (const el of main.querySelectorAll('*')) {
        const b = el.getBoundingClientRect();
        if (!b.width || !b.height) continue;
        const cs = getComputedStyle(el);
        if (cs.position === 'absolute' || cs.position === 'fixed') continue;
        const bottom = b.bottom - top + parseFloat(cs.marginBottom || '0');
        contentBottom = Math.max(contentBottom, bottom);
        if (el.matches(LEAF)) leafBottom = Math.max(leafBottom, b.bottom - top);
      }
      out.trailing = Math.round(contentBottom - leafBottom);
      out.structuralClearance = out.fab ? out.trailing - out.fab.overhang : null;
    }
    out.bareButtons = bare.slice(0, 6);
    out.bareButtonCount = bare.length;
    if (main) main.scrollTop = 0;
    return out;
  });
}

const results = [];
const browser = await chromium.launch();
try {
  for (const { role, email } of ROLES) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/sign-in`);
    await page.locator('#email').fill(email);
    await page.locator('#password').fill('FrameFocusTest!2026');
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL((u) => !u.pathname.startsWith('/sign-in'), { timeout: 60_000 });

    for (const { w, h } of WIDTHS) {
      await page.setViewportSize({ width: w, height: h });
      for (const route of ROUTES) {
        if (ONLY && !ONLY.includes(route)) continue;
        const url = fill(route);
        const rec = { role, width: w, route, url };
        try {
          const resp = await page.goto(`${BASE}${url}`, { waitUntil: 'networkidle', timeout: 60_000 });
          await page.waitForTimeout(400);
          rec.status = resp?.status();
          rec.finalPath = new URL(page.url()).pathname + new URL(page.url()).search;
          rec.redirected = rec.finalPath.split('?')[0] !== url;
          const dir = join(OUT, role, String(w));
          mkdirSync(dir, { recursive: true });
          await page.screenshot({ path: join(dir, `${slug(route)}.jpg`), type: 'jpeg', quality: 70 });
          Object.assign(rec, await measure(page));
          if (rec.scrolls) {
            await page.evaluate(() => { const m = document.querySelector('[data-testid="m-content"]'); if (m) m.scrollTop = m.scrollHeight; });
            await page.waitForTimeout(150);
            await page.screenshot({ path: join(dir, `${slug(route)}--bottom.jpg`), type: 'jpeg', quality: 70 });
          }
        } catch (e) {
          rec.error = String(e.message || e).slice(0, 200);
        }
        results.push(rec);
        process.stdout.write(`${role} ${w} ${route} ${rec.error ? 'ERR' : 'ok'}\n`);
      }

      // Chat overlay — the composer's text box sits where the FAB overhangs.
      if (!ONLY || ONLY.includes('#chat')) {
        const rec = { role, width: w, route: '#chat (overlay from /m/projects)' };
        try {
          await page.goto(`${BASE}/m/projects`, { waitUntil: 'networkidle', timeout: 60_000 });
          await page.locator('[data-testid="m-tab-chat"]').click();
          await page.waitForTimeout(1500);
          const ta = page.locator('textarea').first();
          if (await ta.count()) {
            await ta.click();
            await page.waitForTimeout(300);
          }
          const dir = join(OUT, role, String(w));
          mkdirSync(dir, { recursive: true });
          await page.screenshot({ path: join(dir, 'chat-overlay.jpg'), type: 'jpeg', quality: 70 });
          Object.assign(rec, await page.evaluate(() => {
            const fab = document.querySelector('[data-testid="m-camera"]')?.getBoundingClientRect();
            const bar = document.querySelector('[data-testid="m-tabbar"]')?.getBoundingClientRect();
            const hits = [];
            for (const el of document.querySelectorAll('textarea, input, button')) {
              if (el.closest('[data-testid="m-tabbar"]')) continue;
              const b = el.getBoundingClientRect();
              if (!b.width || !b.height) continue;
              const underFab = fab && b.bottom > fab.top + 1 && b.right > fab.left && b.left < fab.right;
              if (underFab || (bar && b.bottom > bar.top + 1)) hits.push({ el: `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.textContent || '').trim().slice(0, 30)}"`, px: Math.round(b.bottom - fab.top) });
            }
            return { fab: fab && { top: Math.round(fab.top) }, obscured: hits };
          }));
        } catch (e) {
          rec.error = String(e.message || e).slice(0, 200);
        }
        results.push(rec);
        process.stdout.write(`${role} ${w} #chat ${rec.error ? 'ERR' : 'ok'}\n`);
      }
    }
    await ctx.close();
  }
} finally {
  await browser.close();
  if (seededVisitId) await admin.from('site_visits').delete().eq('id', seededVisitId);
  writeFileSync(join(OUT, `results-${LABEL}.json`), JSON.stringify(results, null, 2));
}
