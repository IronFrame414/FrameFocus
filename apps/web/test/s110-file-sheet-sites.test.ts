import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// ============================================================================
// S110 E3 [RULED Josh, Q10 → A] — #161's remaining sites open in the SHEET.
// The eight staff sites, plus the client portal's "Shared documents", which
// reuses the URL the page already signed — and portal PHOTOS stay view-only.
// Companion to s109-file-sheet.test.ts (the S109 sites), which is unchanged.
// ============================================================================

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const code = (rel: string) => read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

// Each site, and the exact old mechanism that must not come back (quoted from
// TECH_DEBT.md #161's S109 status line).
const SITES: Array<[string, RegExp, RegExp]> = [
  ['../app/dashboard/projects/[id]/files/file-row-actions.tsx', /openFile\(/, /window\.open\(/],
  ['../app/dashboard/projects/[id]/lien-releases/releases-panel.tsx', /openFile\(/, /window\.open\(/],
  ['../app/dashboard/settings/lien-release-settings-form.tsx', /openFile\(/, /window\.open\(/],
  ['../app/dashboard/settings/contract-settings-form.tsx', /openFile\(/, /window\.open\(/],
  ['../app/dashboard/field-ops/[projectId]/deliveries/d/[deliveryId]/page.tsx', /<SheetLink/, /<a key=\{photo\.id\} href=\{url\}/],
  ['../app/dashboard/expenses/review-popup.tsx', /<SheetLink/, /<a key=\{r\.id\} href=\{r\.url\}/],
  ['../app/dashboard/estimates/[id]/signing-activity.tsx', /openFile\(/, /window\.location\.href\s*=/],
  ['../app/dashboard/field-ops/[projectId]/deliveries/[poId]/po-lines-panel.tsx', /<SheetLink/, /<a\s+href=\{`\/api\/pos\/\$\{poId\}\/pdf`\}/],
];

describe('S110 E3 — the eight staff sites open in the sheet', () => {
  it.each(SITES)('%s', (file, uses, oldWay) => {
    const src = code(file);
    expect(src, 'does not open the sheet').toMatch(uses);
    expect(src, 'the old new-tab / navigate-away mechanism is back').not.toMatch(oldWay);
  });

  it('SheetLink keeps a real href (a modified click still opens a tab) and only intercepts a PLAIN click', () => {
    const src = code('../components/files/sheet-link.tsx');
    expect(src).toMatch(/if \(e\.button !== 0 \|\| e\.metaKey \|\| e\.ctrlKey \|\| e\.shiftKey \|\| e\.altKey\) return;/);
    expect(src).toMatch(/href=\{href\}/);
  });
});

describe('S110 E3 — the CLIENT PORTAL: already-signed URL only, photos view-only', () => {
  const page = code('../app/portal/[projectId]/files/page.tsx');

  it('the portal layout mounts the sheet', () => {
    expect(code('../app/portal/layout.tsx')).toMatch(/<FileSheetProvider>/);
  });

  it('exactly ONE SheetLink, and it carries NO fileId and NO resolver — the sheet can never re-sign for a client', () => {
    const links = page.match(/<SheetLink[\s\S]*?>/g) ?? [];
    expect(links).toHaveLength(1);
    expect(links[0]).not.toMatch(/fileId=/);
    expect(links[0]).not.toMatch(/resolveUrl=/);
    expect(links[0]).toMatch(/href=\{url\}/);
  });

  it('portal PHOTOS are not wrapped in a sheet link (view-only; never the unmarked original)', () => {
    const at = page.indexOf('{photos.map((p) => {');
    expect(at, 'the photo grid moved — re-anchor this test').toBeGreaterThan(0);
    const photos = page.slice(at, at + 1200);
    expect(photos).toMatch(/<img/);
    expect(photos).not.toMatch(/SheetLink|openFile|useFileSheet/);
    // The image source is the MARKED-UP display_path, as before.
    expect(page).toMatch(/photos\.map\(\(p\) => p\.display_path\)/);
  });

  it('no portal file imports the file-view re-signing helper directly', () => {
    for (const f of ['../app/portal/[projectId]/files/page.tsx', '../app/portal/layout.tsx']) {
      expect(code(f)).not.toMatch(/getFileViewClient|getFileSignedUrlClient/);
    }
  });
});

describe('S110 E3 — the PO PDF route serves inline ONLY for the sheet', () => {
  const route = code('../app/api/pos/[id]/pdf/route.ts');
  it('inline iff ?view=1 and not a download; attachment otherwise', () => {
    expect(route).toMatch(/const inline = q\.get\('view'\) === '1' && !q\.has\('download'\);/);
    expect(route).toMatch(/\$\{inline \? 'inline' : 'attachment'\}/);
  });
});
