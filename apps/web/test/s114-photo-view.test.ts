import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// S114 C-2 — every reader of "the Photos view" uses ONE filter
// (PHOTO_VIEW_FILTER), so the gallery, the viewer/markup resolver and the /m
// badges cannot disagree. The live proof of what the filter selects is
// s114-photo-view.live.ts.

type Call = [string, ...unknown[]];
const calls: Call[] = [];
function builder(): Record<string, unknown> {
  const b: Record<string, unknown> = {};
  for (const m of ['from', 'select', 'order', 'range', 'eq', 'neq', 'or']) {
    b[m] = (...args: unknown[]) => {
      calls.push([m, ...args]);
      return b;
    };
  }
  b.then = (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
    resolve({ data: [], error: null });
  return b;
}
vi.mock('@/lib/supabase-server', () => ({
  createClient: async () => ({
    from: (t: string) => (builder().from as (t: string) => unknown)(t),
  }),
}));

import { getFiles, PHOTO_VIEW_FILTER } from '@/lib/services/files';

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), 'utf8');
const code = (rel: string) =>
  read(rel)
    .split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
    .join('\n');

beforeEach(() => {
  calls.length = 0;
});

describe('S114 C-2 — getFiles({ photo_view })', () => {
  it('applies PHOTO_VIEW_FILTER in the query', async () => {
    await getFiles({ project_id: 'p-1', photo_view: true });
    expect(calls).toContainEqual(['or', PHOTO_VIEW_FILTER]);
  });

  it('CONTROL — without photo_view there is no .or()', async () => {
    await getFiles({ project_id: 'p-1' });
    expect(calls.some((c) => c[0] === 'or')).toBe(false);
  });

  it('the filter names photos whole, and ONLY images of daily_logs / safety', () => {
    expect(PHOTO_VIEW_FILTER).toBe(
      'category.eq.photos,and(category.in.(daily_logs,safety),mime_type.like.image/*)'
    );
  });
});

describe('S114 C-2 — every Photos-view reader uses the one filter (PARITY)', () => {
  it('gallery (getProjectPhotos) and viewer/markup resolver (getPhoto)', () => {
    const src = code('lib/services/photos.ts');
    expect(src).toContain('getFiles({ project_id: projectId, photo_view: true })');
    expect(src).toContain('.or(PHOTO_VIEW_FILTER)');
    expect(src).not.toContain("category: 'photos'");
    expect(src).not.toContain(".eq('category', 'photos')");
  });

  it('/m project overview and /m field badges', () => {
    expect(code('app/m/p/[projectId]/page.tsx')).toContain(
      'getFiles({ project_id: params.projectId, photo_view: true })'
    );
    expect(code('app/m/field/page.tsx')).toContain(
      'getFiles({ project_id: current.id, photo_view: true })'
    );
  });

  it('Files is unchanged: getDocumentFiles still excludes only the photos category', () => {
    expect(code('lib/services/files.ts')).toContain(
      "getFiles({ project_id: projectId, exclude_category: 'photos' })"
    );
  });
});
