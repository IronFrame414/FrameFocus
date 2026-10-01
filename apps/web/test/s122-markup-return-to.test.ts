import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { markupHref, markupReturnTo, parseMarkupFrom } from '@/lib/markup/return-to';

// S122 0-B-5 — "Go back to where you came from." [Josh, 2026-09-30]
// `from` is a TOKEN from a fixed set, never a path (Q6-A). The page builds the
// destination from its own project id, so a hostile value can only ever fall
// back to Files — it can never name a destination.

const P = '11111111-1111-4111-8111-111111111111';
const F = '22222222-2222-4222-8222-222222222222';

describe('parseMarkupFrom — only the two known tokens survive', () => {
  it('photos → photos; files → files', () => {
    expect(parseMarkupFrom('photos')).toBe('photos');
    expect(parseMarkupFrom('files')).toBe('files');
  });

  it.each([
    ['missing', undefined],
    ['null', null],
    ['empty', ''],
    ['wrong case', 'Photos'],
    ['an absolute URL', 'https://evil.example'],
    ['protocol-relative', '//evil.example/x'],
    ['backslash variant', '/\\evil.example'],
    ['a same-origin path', '/dashboard/projects/other/photos'],
    ['a path ending in photos', '/photos'],
  ])('%s → files (the fallback), never a destination', (_label, raw) => {
    expect(parseMarkupFrom(raw)).toBe('files');
  });

  it('a repeated parameter reads the first value only', () => {
    expect(parseMarkupFrom(['photos', 'files'])).toBe('photos');
    expect(parseMarkupFrom(['https://evil.example', 'photos'])).toBe('files');
  });
});

describe('markupReturnTo — the destination is built, not supplied', () => {
  it("from=photos returns to THIS project's Photos tab", () => {
    expect(markupReturnTo(P, 'photos')).toEqual({
      from: 'photos',
      href: `/dashboard/projects/${P}/photos`,
      label: '← Back to photos',
    });
  });

  it("from=files returns to THIS project's Files tab", () => {
    expect(markupReturnTo(P, 'files')).toEqual({
      from: 'files',
      href: `/dashboard/projects/${P}/files`,
      label: '← Back to files',
    });
  });

  it("every hostile value lands on this project's Files tab — no other origin, no other project", () => {
    for (const raw of [
      'https://evil.example',
      '//evil.example',
      '/dashboard/projects/x/photos',
      'javascript:alert(1)',
    ]) {
      const r = markupReturnTo(P, raw);
      expect(r.href).toBe(`/dashboard/projects/${P}/files`);
      expect(r.href.startsWith(`/dashboard/projects/${P}/`)).toBe(true);
    }
  });
});

describe('the entry links carry the token their own tab means', () => {
  it('markupHref', () => {
    expect(markupHref(P, F, 'files')).toBe(`/dashboard/projects/${P}/files/${F}/markup?from=files`);
    expect(markupHref(P, F, 'photos')).toBe(
      `/dashboard/projects/${P}/files/${F}/markup?from=photos`
    );
  });

  // Source guards: the two entry points and the page use the ONE resolver. A
  // hard-coded "/files" back link, or an entry link without its token, is the
  // defect this part fixed.
  const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

  it('Files tab links with from=files; Photos tab links with from=photos', () => {
    expect(read('../app/dashboard/projects/[id]/files/file-row-actions.tsx')).toContain(
      "markupHref(projectId, fileId, 'files')"
    );
    expect(read('../app/dashboard/projects/[id]/photos/page.tsx')).toContain(
      "markupHref(params.id, p.id, 'photos')"
    );
  });

  it('the markup page has no hard-coded back link left, and delete follows the same resolver', () => {
    const page = read('../app/dashboard/projects/[id]/files/[fileId]/markup/page.tsx');
    expect(page).not.toMatch(/href=\{`\/dashboard\/projects\/\$\{projectId\}\/files`\}/);
    expect(page.match(/href=\{back\.href\}/g)?.length).toBe(3);
    expect(page).toContain('returnHref={back.href}');
    const del = read(
      '../app/dashboard/projects/[id]/files/[fileId]/markup/delete-photo-button.tsx'
    );
    expect(del).toContain('router.push(returnHref)');
    expect(del).not.toMatch(/router\.push\(`\/dashboard/);
  });
});
