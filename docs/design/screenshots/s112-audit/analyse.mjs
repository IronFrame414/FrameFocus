// S112 — aggregate results-{crew,owner}.json into a readable summary.
//   node analyse.mjs <dir-with-results> > summary.md
// Every count here is over RECORDS (route × width × lang × role). Nothing is
// deduplicated silently: each group reports how many records it came from.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
const all = ['crew', 'owner'].flatMap((r) => JSON.parse(readFileSync(join(dir, `results-${r}.json`), 'utf8')));
const routes = all.filter((r) => r.kind === 'route');
const states = all.filter((r) => r.kind === 'state');
const empties = all.filter((r) => r.kind === 'empty');
const loads = all.filter((r) => r.kind === 'loading');
const measured = [...routes, ...states, ...empties].filter((r) => !r.error);
const key = (r) => `${r.role}/${r.lang}/${r.width}`;
const where = (r) => r.route ?? `#${r.state}`;
const sig = (el) => el.replace(/ ".*$/, ''); // descriptor minus its text

const p = (s = '') => console.log(s);
p(`# S112 audit — machine summary`);
p();
p(`records: ${all.length} total · route ${routes.length} · state ${states.length} · empty ${empties.length} · loading ${loads.length}`);
p(`errors: ${all.filter((r) => r.error).length} · pageerrors: ${all.filter((r) => r.kind === 'pageerror').length}`);
for (const r of all.filter((r) => r.kind === 'restore')) p(`restore ${r.role}: original=${r.originalLang} restoredTo=${r.restoredTo} err=${r.error}`);
for (const r of all.filter((r) => r.error)) p(`  ERROR ${r.role} ${r.lang} ${r.width} ${where(r)}: ${r.error}`);
for (const r of all.filter((r) => r.kind === 'pageerror')) p(`  PAGEERROR ${r.url}: ${r.msg}`);
const combos = [...new Set(routes.map(key))].sort();
p(`combos (${combos.length}): ${combos.join(', ')}`);
p(`distinct routes measured: ${new Set(routes.map((r) => r.route)).size}`);

p(`\n## Redirects / status (per role, en, 390)`);
for (const r of routes.filter((r) => r.lang === 'en' && r.width === 390 && (r.redirected || r.status !== 200))) p(`- ${r.role} ${r.route} → ${r.status} ${r.finalPath}`);
p(`\n## Outside the shell (no m-shell)`);
for (const r of routes.filter((r) => !r.inShell && r.lang === 'en' && r.width === 390)) p(`- ${r.role} ${r.route} ${r.finalPath}`);

const group = (rows, getItems, label) => {
  const g = new Map();
  for (const r of rows) for (const it of getItems(r) ?? []) {
    const k = label(it);
    if (!g.has(k)) g.set(k, { n: 0, recs: new Set(), routes: new Set(), combos: new Set(), sample: it });
    const e = g.get(k);
    e.n++; e.recs.add(`${key(r)}${where(r)}`); e.routes.add(where(r)); e.combos.add(key(r));
  }
  return [...g.entries()].sort((a, b) => b[1].recs.size - a[1].recs.size);
};
const show = (entries, fmt) => { for (const [k, e] of entries) p(`- **${e.recs.size} rec / ${e.routes.size} routes** [${[...e.combos].sort().join(' ')}] ${fmt(k, e)}\n    routes: ${[...e.routes].slice(0, 12).join(', ')}${e.routes.size > 12 ? ' …' : ''}`); };

p(`\n## 1. Horizontal overflow (page-level docOver>0)`);
for (const r of measured.filter((r) => r.docOver > 0 || r.bodyOver > 0 || r.mainOver > 0)) p(`- ${key(r)} ${where(r)} doc=${r.docOver} body=${r.bodyOver} main=${r.mainOver}`);
p(`\n### elements past the viewport edge, NOT inside a scroller and NOT clipped`);
show(group(measured, (r) => r.overflowers.filter((o) => !o.clipped), (o) => `${o.scope} ${sig(o.el)}`), (k, e) => `${k} — up to ${e.sample.px}px (${e.sample.el})`);
p(`\n### intentional horizontal scrollers seen`);
show(group(measured, (r) => (r.scrollers ?? []).map((s) => ({ s })), (o) => sig(o.s)), (k) => k);

p(`\n## 2. Text clipped`);
p(`### NOT deliberate (no truncate/ellipsis)`);
show(group(measured, (r) => r.clips.filter((c) => !c.deliberate), (c) => `${c.scope} ${sig(c.el)} axis=${c.axis}`), (k, e) => `${k} — "${e.sample.text}" hides ${e.sample.hiddenPx}px`);
p(`### deliberate truncation that fired`);
show(group(measured, (r) => r.clips.filter((c) => c.deliberate), (c) => `${c.scope} ${sig(c.el)}`), (k, e) => `${k} — e.g. "${e.sample.text}" hides ${e.sample.hiddenPx}px`);

p(`\n## 3. Tap targets under 44px (min side)`);
p(`### non-inline, enabled`);
show(group(measured, (r) => r.smallTargets.filter((t) => !t.inline && !t.disabled), (t) => `${t.scope} ${sig(t.el)}`), (k, e) => `${k} — ${e.sample.w}x${e.sample.h} (${e.sample.el})`);
p(`### inline text links`);
show(group(measured, (r) => r.smallTargets.filter((t) => t.inline), (t) => `${t.scope} ${sig(t.el)}`), (k, e) => `${k} — ${e.sample.w}x${e.sample.h}`);
p(`### disabled`);
show(group(measured, (r) => r.smallTargets.filter((t) => t.disabled && !t.inline), (t) => `${t.scope} ${sig(t.el)}`), (k, e) => `${k} — ${e.sample.w}x${e.sample.h}`);

p(`\n## 4. Inputs under 16px (iOS zooms on focus)`);
show(group(measured, (r) => r.zoomInputs, (z) => sig(z.el)), (k, e) => `${k} — ${e.sample.fs}px (${e.sample.el})`);

p(`\n## 5. Contrast below WCAG AA (text)`);
p(`### by element signature, excluding disabled and over-image`);
show(group(measured, (r) => r.lowContrast.filter((c) => !c.disabled && !c.overImage), (c) => `${c.scope} ${c.ratio}:1 need ${c.need} ${c.size}px ${sig(c.el)}`), (k, e) => `${k} — "${e.sample.text}"`);
p(`### over an image (badges on photos) — ratio is badge fill vs text only`);
show(group(measured, (r) => r.lowContrast.filter((c) => c.overImage), (c) => `${c.ratio}:1 ${sig(c.el)}`), (k, e) => `${k} — "${e.sample.text}"`);
const mins = measured.map((r) => r.minContrast).filter((x) => x != null);
p(`min contrast over all records: ${Math.min(...mins)}; records with every text ≥4.5: ${measured.filter((r) => r.lowContrastCount === 0).length}/${measured.length}`);

p(`\n## 6. Sub-12px text (counts of text elements by px)`);
const sub = {};
for (const r of measured) for (const [s, n] of Object.entries(r.sub12Text ?? {})) sub[s] = (sub[s] || 0) + n;
p(JSON.stringify(sub));

p(`\n## 7. Obscured at end of scroll`);
show(group(measured, (r) => r.obscured, (o) => `${o.by} ${sig(o.el)}`), (k, e) => `${k} — ${e.sample.px}px`);
p(`clearance (FAB top − last content), min per route:`);
const cl = new Map();
for (const r of routes) if (r.clearance != null && r.scrolls) cl.set(r.route, Math.min(cl.get(r.route) ?? Infinity, r.clearance));
p([...cl.entries()].sort((a, b) => a[1] - b[1]).slice(0, 10).map(([k, v]) => `${k}=${v}`).join(', '));

p(`\n## 8. Bare/raw controls`);
show(group(measured, (r) => r.bare.map((b) => ({ b })), (o) => sig(o.b)), (k, e) => `${k} — ${e.sample.b}`);
p(`default-blue links: ${measured.filter((r) => r.defaultBlueLinks?.length).map((r) => where(r)).join(', ') || 'none'}`);

p(`\n## 9. Tab bar`);
for (const r of routes.filter((r) => r.route === '/m/projects')) {
  const fit = (r.tabLabels ?? []).filter((l) => l.w > l.parentW);
  const right = Math.max(...(r.tabbar ?? []).map((t) => t.r));
  p(`- ${key(r)}: rightmost child ${right}/${r.vw}; labels ${JSON.stringify((r.tabLabels ?? []).map((l) => `${l.t}:${l.w}/${l.parentW}`))}${fit.length ? ' OVERFLOW' : ''}`);
}

p(`\n## 10. Empty project (owner, 360)`);
for (const r of empties) p(`- ${r.lang} ${r.route} → ${r.status} empty-marker=${r.emptyMarker} text="${(r.mainText ?? '').slice(0, 140)}"`);

p(`\n## 11. Loading feedback (RSC held 3s; state 800ms after tap)`);
for (const r of loads) p(`- ${r.role} ${r.lang} ${r.label}: ${r.error ? 'ERR ' + r.error : `path=${r.at800.path} changed=${r.at800.contentChanged} indicator=${r.at800.indicator} settled=${r.settledMs}ms`}`);

p(`\n## 12. Per-route clean check (records with zero findings in every category)`);
const clean = (r) => r.docOver <= 0 && !r.overflowers.some((o) => !o.clipped) && !r.clips.some((c) => !c.deliberate) && !r.smallTargets.some((t) => !t.inline && !t.disabled) && r.zoomInputs.length === 0 && r.obscured.length === 0;
const byRoute = new Map();
for (const r of routes.filter((r) => !r.error)) { const e = byRoute.get(r.route) ?? { n: 0, clean: 0 }; e.n++; if (clean(r)) e.clean++; byRoute.set(r.route, e); }
for (const [k, v] of [...byRoute.entries()].sort()) p(`- ${k}: ${v.clean}/${v.n} records clean (excl. contrast)`);

p(`\n## 13. Main text per route (crew, es, 390) — for reading`);
for (const r of routes.filter((r) => r.role === 'crew' && r.lang === 'es' && r.width === 390)) p(`- ${r.route} → ${r.finalPath} | ${r.h1} | ${(r.mainText ?? '').slice(0, 160)}`);
