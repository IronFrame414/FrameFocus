// S112 /m UI audit — measurements. rebuild-test ONLY (the ref is checked).
// READ-ONLY against the app; the only DB writes are (a) the role's
// profiles.language, flipped to 'es' for the Spanish pass and RESTORED in
// `finally`, and (b) one site visit seeded by setup.mjs and removed by it.
//
//   AUDIT_ROLE=crew|owner AUDIT_OUT=<dir> AUDIT_SV=<estimateId> node audit.mjs
//
// Instrument: Playwright Chromium, isMobile + hasTouch, DPR 1, against a
// production build (`next build && next start -p 3100`), never `next dev`.
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

const BASE = process.env.AUDIT_BASE ?? 'http://localhost:3100';
const OUT = process.env.AUDIT_OUT;
const ROLE = process.env.AUDIT_ROLE;
const SHOTS = process.env.AUDIT_SHOTS ?? join(OUT, 'shots');
if (!OUT || !ROLE) throw new Error('AUDIT_OUT and AUDIT_ROLE required');
const ACCOUNTS = {
  crew: { email: 'josh+crew@worthprop.com', userId: '3b74855a-329b-4dda-956b-6e3447caaa58' },
  owner: { email: 'josh+test50@worthprop.com', userId: '71123aeb-e286-4b24-aaae-65c34e81a57e' },
};
const acct = ACCOUNTS[ROLE];

const P = 'eaf0e25b-d60e-49c0-89b2-5612118d94b4'; // Lakeview Kitchen Remodel (crew assigned)
const EMPTY_P = 'e64f40b9-6b69-44cc-b5bb-3b130889a6da'; // S97COREMAIN — zero rows in every project table
const IDS = {
  projectId: P,
  fileId: '0f1773b5-7662-429e-9001-64e84a3594b1',
  itemId: '8a44e1c5-291a-43ad-860f-40675bc1f295',
  coId: '194cea12-2cae-4878-b3e2-edb4633fc090',
  logId: '88536d73-254a-4db3-afd2-e24da46411a1',
  contactId: '8c7c9a6d-287d-4b0e-9a0b-2769adfed704',
  subId: '00c2bccc-a77e-498e-9ac6-9ee503df89d9',
  memberId: '18a105e7-2ff9-4546-a17b-87524a45e978',
  id: process.env.AUDIT_SV ?? null,
  missing: 's112-no-such-route',
};
const ROUTES = readFileSync(new URL('./routes.txt', import.meta.url), 'utf8').trim().split('\n');
const WIDTHS = (process.env.AUDIT_WIDTHS ?? '360x800,390x844,430x932').split(',').map((p) => {
  const [w, h] = p.split('x').map(Number);
  return { w, h };
});
const LANGS = (process.env.AUDIT_LANGS ?? 'en,es').split(',');
const ONLY = process.env.AUDIT_ONLY ? process.env.AUDIT_ONLY.split(',') : null;

const fill = (r, ids = IDS) => r.replace(/\[(?:\.\.\.)?(\w+)\]/g, (_, k) => ids[k] ?? `MISSING-${k}`);
const slug = (r) => (r === '/m' ? 'm-home' : r.slice(1).replace(/\[(?:\.\.\.)?(\w+)\]/g, '$1').replace(/\//g, '__'));

// ---------------------------------------------------------------------------
// In-page measurement. Everything here is a MEASUREMENT (a number read from the
// rendered DOM); nothing is a judgement. Thresholds are applied in analyse.mjs.
// ---------------------------------------------------------------------------
async function measure(page) {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const main = document.querySelector('[data-testid="m-content"]');
    const fab = document.querySelector('[data-testid="m-camera"]');
    const bar = document.querySelector('[data-testid="m-tabbar"]');
    const R = (el) => el && el.getBoundingClientRect();
    const describe = (el) => {
      const tid = el.getAttribute('data-testid');
      const cls = (el.getAttribute('class') || '').split(/\s+/).filter(Boolean).slice(0, 4).join('.');
      const txt = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || '').trim().replace(/\s+/g, ' ').slice(0, 50);
      return `${el.tagName.toLowerCase()}${tid ? `[${tid}]` : ''}${cls ? `.${cls}` : ''}${txt ? ` "${txt}"` : ''}`;
    };
    const visible = (el) => {
      const b = el.getBoundingClientRect();
      if (b.width === 0 || b.height === 0) return false;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') return false;
      // sr-only: 1px box, clipped
      if (b.width <= 1 && b.height <= 1) return false;
      return true;
    };
    const scope = (el) => (el.closest('[data-testid="m-tabbar"]') ? 'tabbar' : el.closest('header') && !el.closest('main') ? 'appbar' : el.closest('[data-testid="m-content"]') ? 'page' : 'other');
    const inScroller = (el) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const ox = getComputedStyle(p).overflowX;
        if ((ox === 'auto' || ox === 'scroll') && p.scrollWidth > p.clientWidth + 1) return p;
      }
      return null;
    };

    const out = { vw };
    // 1. Horizontal overflow ------------------------------------------------
    out.docOver = document.documentElement.scrollWidth - vw;
    out.bodyOver = document.body.scrollWidth - vw;
    out.mainOver = main ? main.scrollWidth - main.clientWidth : null;
    const overflowers = [];
    const scrollers = new Map();
    for (const el of document.querySelectorAll('body *')) {
      if (!visible(el)) continue;
      const b = el.getBoundingClientRect();
      const over = Math.round(b.right - vw);
      const under = Math.round(-b.left);
      if (over > 0 || under > 0) {
        const s = inScroller(el);
        if (s) { scrollers.set(s, describe(s)); continue; }
        // clipped by an overflow:hidden ancestor that is itself on-screen?
        let clipped = false;
        for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
          const cs = getComputedStyle(p);
          if ((cs.overflowX === 'hidden' || cs.overflowX === 'clip') && p.getBoundingClientRect().right <= vw + 0.5) { clipped = true; break; }
        }
        overflowers.push({ px: Math.max(over, under), side: over > 0 ? 'right' : 'left', clipped, el: describe(el), scope: scope(el) });
      }
    }
    overflowers.sort((a, b) => b.px - a.px);
    out.overflowers = overflowers.slice(0, 8);
    out.overflowerCount = overflowers.length;
    out.scrollers = [...scrollers.values()].slice(0, 5);

    // 2. Text clipping / truncation ----------------------------------------
    const clips = [];
    for (const el of document.querySelectorAll('body *')) {
      if (!visible(el)) continue;
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (!own) continue;
      const cs = getComputedStyle(el);
      const hx = (cs.overflowX === 'hidden' || cs.overflowX === 'clip') && el.scrollWidth > el.clientWidth + 1;
      const hy = (cs.overflowY === 'hidden' || cs.overflowY === 'clip') && el.scrollHeight > el.clientHeight + 1;
      if (hx || hy) {
        const cls = el.getAttribute('class') || '';
        clips.push({
          axis: hx ? 'x' : 'y',
          hiddenPx: hx ? el.scrollWidth - el.clientWidth : el.scrollHeight - el.clientHeight,
          deliberate: /\btruncate\b|line-clamp|text-ellipsis/.test(cls) || cs.textOverflow === 'ellipsis',
          text: el.textContent.trim().replace(/\s+/g, ' ').slice(0, 80),
          el: describe(el),
          scope: scope(el),
        });
      }
    }
    out.clips = clips.slice(0, 20);
    out.clipCount = clips.length;

    // 3. Tap targets ------------------------------------------------------
    const targets = [];
    const seen = new Set();
    const INTERACTIVE = 'a[href],button,select,textarea,input:not([type=hidden]),label,[role=button],[role=tab],[role=link],summary,[tabindex]:not([tabindex="-1"])';
    for (let el of document.querySelectorAll(INTERACTIVE)) {
      // A hidden file/checkbox input is operated through its label.
      if (el.tagName === 'INPUT' && !visible(el)) {
        const lab = el.closest('label') || (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`));
        if (!lab) continue;
        el = lab;
      }
      if (el.tagName === 'LABEL' && !el.querySelector('input,select,textarea') && !el.htmlFor) continue; // plain text label
      if (el.tagName === 'LABEL' && el.htmlFor) {
        const tgt = document.getElementById(el.htmlFor);
        if (tgt && visible(tgt) && tgt.tagName !== 'INPUT') continue; // the control itself is measured
        if (tgt && visible(tgt) && tgt.type !== 'checkbox' && tgt.type !== 'radio' && tgt.type !== 'file') continue;
      }
      if (seen.has(el) || !visible(el)) continue;
      // nested interactive: measure the outermost
      if (el.parentElement && el.parentElement.closest(INTERACTIVE) && el.parentElement.closest(INTERACTIVE) !== el) {
        const outer = el.parentElement.closest(INTERACTIVE);
        if (outer.tagName !== 'LABEL' || el.tagName === 'INPUT') continue;
      }
      seen.add(el);
      const b = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const inline = cs.display === 'inline' && el.tagName === 'A' && !!el.closest('p,li,dd,span') && (el.closest('p,li,dd,span').textContent.trim().length > el.textContent.trim().length + 3);
      const disabled = el.disabled === true || el.getAttribute('aria-disabled') === 'true';
      if (Math.min(b.width, b.height) < 44) {
        targets.push({ w: Math.round(b.width), h: Math.round(b.height), inline, disabled, el: describe(el), scope: scope(el) });
      }
    }
    out.smallTargets = targets;

    // 4. iOS focus-zoom: text inputs under 16px ----------------------------
    out.zoomInputs = [...document.querySelectorAll('input,textarea,select')]
      .filter((el) => visible(el) && !['checkbox', 'radio', 'file', 'range', 'button', 'submit', 'hidden', 'color'].includes(el.type))
      .map((el) => ({ fs: parseFloat(getComputedStyle(el).fontSize), el: describe(el) }))
      .filter((x) => x.fs < 16);

    // 5. Contrast (text only) ----------------------------------------------
    const parse = (c) => {
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    };
    const over = (top, bot) => ({ r: top.r * top.a + bot.r * (1 - top.a), g: top.g * top.a + bot.g * (1 - top.a), b: top.b * top.a + bot.b * (1 - top.a), a: 1 });
    const lum = ({ r, g, b }) => {
      const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
    const bgOf = (el) => {
      const layers = [];
      let overImage = false;
      for (let p = el; p; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (cs.backgroundImage && cs.backgroundImage !== 'none') overImage = true;
        const c = parse(cs.backgroundColor);
        if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; }
        // absolutely-positioned text over an <img> sibling (photo badges)
        if (p !== el && p.querySelector(':scope > img') && getComputedStyle(el).position === 'absolute') overImage = true;
      }
      let bg = { r: 255, g: 255, b: 255, a: 1 };
      for (let i = layers.length - 1; i >= 0; i--) bg = over(layers[i], bg);
      return { bg, overImage };
    };
    const lows = [];
    let minRatio = Infinity;
    for (const el of document.querySelectorAll('body *')) {
      if (!visible(el)) continue;
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (!own) continue;
      const cs = getComputedStyle(el);
      let fg = parse(cs.color);
      if (!fg) continue;
      let op = 1;
      for (let p = el; p; p = p.parentElement) op *= parseFloat(getComputedStyle(p).opacity);
      const { bg, overImage } = bgOf(el);
      fg = over({ ...fg, a: fg.a * op }, bg);
      const r = ratio(fg, bg);
      const size = parseFloat(cs.fontSize);
      const bold = parseInt(cs.fontWeight, 10) >= 700;
      const large = size >= 24 || (bold && size >= 18.66);
      const need = large ? 3 : 4.5;
      const disabled = !!el.closest('button:disabled,[aria-disabled="true"]') || op < 0.7;
      if (!disabled && !overImage) minRatio = Math.min(minRatio, r);
      if (r < need) lows.push({ ratio: Math.round(r * 100) / 100, need, size, disabled, overImage, text: el.textContent.trim().replace(/\s+/g, ' ').slice(0, 40), el: describe(el), scope: scope(el) });
    }
    out.minContrast = minRatio === Infinity ? null : Math.round(minRatio * 100) / 100;
    out.lowContrast = lows.slice(0, 25);
    out.lowContrastCount = lows.length;

    // 6. Small text (measured sizes) --------------------------------------
    const sizes = {};
    for (const el of document.querySelectorAll('body *')) {
      if (!visible(el)) continue;
      if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
      const s = Math.round(parseFloat(getComputedStyle(el).fontSize));
      if (s < 12) sizes[s] = (sizes[s] || 0) + 1;
    }
    out.sub12Text = sizes;

    // 7. Raw / unstyled controls -----------------------------------------
    out.bare = [...document.querySelectorAll('button,a[href]')].filter((b) => {
      if (!visible(b) || !b.closest('[data-testid="m-content"]')) return false;
      const s = getComputedStyle(b);
      const txt = (b.textContent || '').trim();
      return txt.length > 1 && s.backgroundColor === 'rgba(0, 0, 0, 0)' && parseFloat(s.borderTopWidth) === 0 && parseFloat(s.paddingLeft) === 0 && parseFloat(s.paddingTop) === 0 && !b.querySelector('svg,img') && b.getBoundingClientRect().height < 44;
    }).map((b) => describe(b)).slice(0, 10);
    out.defaultBlueLinks = [...document.querySelectorAll('a[href]')].filter((a) => visible(a) && getComputedStyle(a).color === 'rgb(0, 0, 238)').map(describe).slice(0, 5);

    // 8. Content summary -------------------------------------------------
    out.mainText = main ? main.innerText.trim().replace(/\s+/g, ' ').slice(0, 300) : null;
    out.mainTextLen = main ? main.innerText.trim().length : null;
    out.h1 = document.querySelector('header h1')?.textContent?.trim() ?? null;
    out.inShell = !!document.querySelector('[data-testid="m-shell"]');
    out.hasTabbar = !!bar;
    out.emptyMarker = !!document.querySelector('[data-testid="m-empty"],[data-testid$="-empty"]');
    out.errorMarker = /application error|unhandled|something went wrong/i.test(document.body.innerText);

    // 9. Obscured by FAB/bar at end of scroll ---------------------------
    out.scrolls = main ? main.scrollHeight > main.clientHeight + 1 : false;
    out.obscured = [];
    if (main) {
      main.scrollTop = main.scrollHeight;
      const fr = R(fab), br = R(bar), mr = R(main);
      let lastBottom = -Infinity;
      for (const el of main.querySelectorAll('input,textarea,select,button,a,img,label,[role="button"],p,span,h1,h2,h3,li,svg')) {
        if (!visible(el)) continue;
        const b = el.getBoundingClientRect();
        if (b.bottom > mr.bottom + 1 || b.top < mr.top) continue;
        lastBottom = Math.max(lastBottom, b.bottom);
        const underFab = fr && b.bottom > fr.top + 1 && b.right > fr.left && b.left < fr.right;
        if (underFab) out.obscured.push({ by: 'fab', px: Math.round(b.bottom - fr.top), el: describe(el) });
      }
      // fixed overlays inside main over the bar
      for (const el of main.querySelectorAll('*')) {
        const pos = getComputedStyle(el).position;
        if (pos !== 'fixed') continue;
        const b = el.getBoundingClientRect();
        if (b.height && br && b.bottom > br.top) out.obscured.push({ by: 'fixed-over-bar', px: Math.round(b.bottom - br.top), el: describe(el) });
        if (b.height && fr && b.bottom > fr.top && b.right > fr.left && b.left < fr.right) out.obscured.push({ by: 'fixed-under-fab', px: Math.round(b.bottom - fr.top), el: describe(el) });
      }
      out.clearance = fr && lastBottom > -Infinity ? Math.round(fr.top - lastBottom) : null;
      main.scrollTop = 0;
    }

    // 10. Tab bar geometry ------------------------------------------------
    if (bar) {
      out.tabbar = [...bar.children].map((c) => { const b = c.getBoundingClientRect(); return { l: Math.round(b.left), r: Math.round(b.right), w: Math.round(b.width) }; });
      out.tabLabels = [...bar.querySelectorAll('span')].map((s) => { const b = s.getBoundingClientRect(); return { t: s.textContent.trim(), w: Math.round(b.width), parentW: Math.round(s.parentElement.getBoundingClientRect().width) }; });
    }
    return out;
  });
}

async function shoot(page, dir, name, scrolls) {
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: join(dir, `${name}.jpg`), type: 'jpeg', quality: 60 });
  if (scrolls) {
    await page.evaluate(() => { const m = document.querySelector('[data-testid="m-content"]'); if (m) m.scrollTop = m.scrollHeight; });
    await page.waitForTimeout(150);
    await page.screenshot({ path: join(dir, `${name}--bottom.jpg`), type: 'jpeg', quality: 60 });
    await page.evaluate(() => { const m = document.querySelector('[data-testid="m-content"]'); if (m) m.scrollTop = 0; });
  }
}

async function visit(page, url) {
  const resp = await page.goto(`${BASE}${url}`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForTimeout(500);
  const u = new URL(page.url());
  return { status: resp?.status(), finalPath: u.pathname + u.search };
}

// Interaction states: the parts of /m that are not routes.
async function states(page, lang, w, dir) {
  const recs = [];
  const run = async (name, fn) => {
    const rec = { kind: 'state', state: name, lang, width: w };
    try {
      const note = await fn();
      if (note) rec.note = note;
      Object.assign(rec, await measure(page));
      await shoot(page, dir, `state-${name}`, false);
    } catch (e) {
      rec.error = String(e.message || e).slice(0, 200);
    }
    recs.push(rec);
  };
  const pid = IDS.projectId;
  await run('sheet-open', async () => { await visit(page, '/m/projects'); await page.locator('[data-testid="m-hamburger"]').click(); await page.waitForTimeout(400); });
  await run('chat-overlay', async () => { await visit(page, '/m/projects'); await page.locator('[data-testid="m-tab-chat"]').click(); await page.waitForTimeout(1500); const ta = page.locator('textarea').first(); if (await ta.count()) { await ta.click(); await page.waitForTimeout(300); } });
  await run('chat-in-project', async () => { await visit(page, `/m/p/${pid}`); await page.locator('[data-testid="m-tab-chat"]').click(); await page.waitForTimeout(1800); });
  await run('photos-select', async () => { await visit(page, `/m/p/${pid}/photos`); await page.locator('[data-testid="m-select-mode"]').click(); await page.waitForTimeout(200); const tiles = page.locator('[data-testid="m-photo-tile"]'); const n = await tiles.count(); for (let i = 0; i < Math.min(n, 2); i++) await tiles.nth(i).click(); return `tiles=${n}`; });
  await run('photos-select-delete-confirm', async () => {
    await visit(page, `/m/p/${pid}/photos`); await page.locator('[data-testid="m-select-mode"]').click();
    await page.locator('[data-testid="m-photo-tile"]').first().click();
    const del = page.locator('[data-testid="m-bulk-delete"]');
    if (!(await del.count())) return 'no delete control (role)';
    await del.click(); await page.waitForTimeout(200); return 'confirm open';
  });
  await run('viewer-overflow', async () => { await visit(page, `/m/p/${pid}/photos/${IDS.fileId}`); await page.locator('[data-testid="m-viewer-overflow"]').click(); await page.waitForTimeout(200); });
  await run('viewer-bottom', async () => { await visit(page, `/m/p/${pid}/photos/${IDS.fileId}`); await page.evaluate(() => { const m = document.querySelector('[data-testid="m-content"]') || document.scrollingElement; m.scrollTop = m.scrollHeight; }); await page.waitForTimeout(200); });
  return recs;
}

// Loading feedback: with the RSC payload held for 3s, does anything on screen
// acknowledge the tap within 800ms? (The /m tree has no loading.tsx.)
async function loadingProbe(page, lang) {
  const recs = [];
  const hold = async (route) => {
    const h = route.request().headers();
    if (h['rsc'] === '1' || h['next-router-state-tree']) await new Promise((r) => setTimeout(r, 3000));
    await route.continue();
  };
  const cases = [
    { from: '/m/projects', click: '[data-testid="m-tab-field"]', label: 'tab: Field' },
    { from: '/m/field', click: '[data-testid="m-tab-projects"]', label: 'tab: Projects' },
    { from: '/m/projects', click: `a[href="/m/p/${IDS.projectId}"]`, label: 'project row' },
    { from: `/m/p/${IDS.projectId}/photos`, click: '[data-testid="m-photo-tile"]', label: 'photo tile' },
    { from: `/m/p/${IDS.projectId}/punch`, click: `a[href*="/punch/${IDS.itemId}"]`, label: 'punch row' },
  ];
  for (const c of cases) {
    const rec = { kind: 'loading', lang, label: c.label };
    try {
      await visit(page, c.from);
      const before = await page.evaluate(() => document.querySelector('[data-testid="m-content"]')?.innerText.slice(0, 200));
      await page.route('**/*', hold);
      const t0 = Date.now();
      await page.locator(c.click).first().click({ timeout: 5000 });
      await page.waitForTimeout(800);
      rec.at800 = await page.evaluate((b) => ({
        path: location.pathname,
        contentChanged: document.querySelector('[data-testid="m-content"]')?.innerText.slice(0, 200) !== b,
        indicator: !!document.querySelector('[aria-busy="true"],[role="progressbar"],.animate-spin,.animate-pulse,[data-testid*="loading"],[data-testid*="skeleton"]'),
      }), before);
      await page.screenshot({ path: join(SHOTS, ROLE, lang, 'loading', `${c.label.replace(/\W+/g, '-')}.jpg`), type: 'jpeg', quality: 60 }).catch(async () => { mkdirSync(join(SHOTS, ROLE, lang, 'loading'), { recursive: true }); await page.screenshot({ path: join(SHOTS, ROLE, lang, 'loading', `${c.label.replace(/\W+/g, '-')}.jpg`), type: 'jpeg', quality: 60 }); });
      await page.waitForFunction((b) => document.querySelector('[data-testid="m-content"]')?.innerText.slice(0, 200) !== b, before, { timeout: 15000 });
      rec.settledMs = Date.now() - t0;
    } catch (e) {
      rec.error = String(e.message || e).slice(0, 200);
    }
    await page.unroute('**/*', hold);
    recs.push(rec);
  }
  return recs;
}

const results = [];
const { data: before } = await admin.from('profiles').select('language').eq('user_id', acct.userId).single();
const originalLang = before.language;
const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => results.push({ kind: 'pageerror', url: page.url(), msg: String(e.message).slice(0, 200) }));
  await page.goto(`${BASE}/sign-in`);
  await page.locator('#email').fill(acct.email);
  await page.locator('#password').fill('FrameFocusTest!2026');
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/sign-in'), { timeout: 60_000 });

  for (const lang of LANGS) {
    const { error } = await admin.from('profiles').update({ language: lang }).eq('user_id', acct.userId);
    if (error) throw new Error(`language flip failed: ${error.message}`);
    for (const { w, h } of WIDTHS) {
      await page.setViewportSize({ width: w, height: h });
      const dir = join(SHOTS, ROLE, lang, String(w));
      for (const route of ROUTES) {
        if (ONLY && !ONLY.includes(route)) continue;
        const url = fill(route);
        const rec = { kind: 'route', role: ROLE, lang, width: w, route, url };
        try {
          Object.assign(rec, await visit(page, url));
          rec.redirected = rec.finalPath.split('?')[0] !== url;
          Object.assign(rec, await measure(page));
          await shoot(page, dir, slug(route), rec.scrolls);
        } catch (e) {
          rec.error = String(e.message || e).slice(0, 200);
        }
        results.push(rec);
        process.stdout.write(`${ROLE} ${lang} ${w} ${route} ${rec.error ? 'ERR ' + rec.error.slice(0, 60) : 'ok'}\n`);
      }
      if (!ONLY) for (const r of await states(page, lang, w, dir)) results.push({ ...r, role: ROLE });
      // Empty project — owner only (crew is assigned to no empty project).
      if (!ONLY && ROLE === 'owner' && w === 360) {
        for (const route of ROUTES.filter((r) => r.startsWith('/m/p/[projectId]') && !/\[(fileId|itemId|coId)\]/.test(r))) {
          const url = fill(route, { ...IDS, projectId: EMPTY_P });
          const rec = { kind: 'empty', role: ROLE, lang, width: w, route, url };
          try {
            Object.assign(rec, await visit(page, url));
            Object.assign(rec, await measure(page));
            await shoot(page, join(SHOTS, ROLE, lang, 'empty'), slug(route), false);
          } catch (e) {
            rec.error = String(e.message || e).slice(0, 200);
          }
          results.push(rec);
        }
      }
    }
    if (!ONLY) {
      await page.setViewportSize({ width: 390, height: 844 });
      for (const r of await loadingProbe(page, lang)) results.push({ ...r, role: ROLE });
    }
  }
  await ctx.close();
} finally {
  await browser.close();
  const { error } = await admin.from('profiles').update({ language: originalLang }).eq('user_id', acct.userId);
  const { data: after } = await admin.from('profiles').select('language').eq('user_id', acct.userId).single();
  results.push({ kind: 'restore', role: ROLE, originalLang, restoredTo: after?.language, error: error?.message ?? null });
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, `results-${ROLE}.json`), JSON.stringify(results, null, 1));
  console.log(`RESTORE ${ROLE}: original=${originalLang} now=${after?.language}`);
}
