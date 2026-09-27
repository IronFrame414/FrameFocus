import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// S112 queue 2a — Projects → Documents → Files must not list photos.
// RULED [Josh]: filter by CATEGORY, never by MIME. This records the query the
// service actually builds (the live proof, s112-document-files.live.ts, runs it
// against real rows).

type Call = [string, ...unknown[]];
const calls: Call[] = [];
function builder(): Record<string, unknown> {
  const b: Record<string, unknown> = {};
  for (const m of [
    'from',
    'select',
    'order',
    'range',
    'eq',
    'neq',
    'not',
    'in',
    'like',
    'ilike',
    'or',
  ]) {
    b[m] = (...args: unknown[]) => {
      calls.push([m, ...args]);
      return b;
    };
  }
  b.then = (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
    resolve({ data: [], error: null });
  return b;
}
// The CLIENT must not be thenable (awaiting createClient() would resolve the
// chain); only the query chain it starts is.
vi.mock('@/lib/supabase-server', () => ({
  createClient: async () => ({
    from: (t: string) => (builder().from as (t: string) => unknown)(t),
  }),
}));

import { getDocumentFiles, getFiles } from '@/lib/services/files';

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), 'utf8');

beforeEach(() => {
  calls.length = 0;
});

describe('S112 2a — getDocumentFiles(): documents are every category but photos', () => {
  it('excludes the photos CATEGORY in the query, scoped to the project and live rows', async () => {
    await getDocumentFiles('p-1');
    expect(calls).toContainEqual(['neq', 'category', 'photos']);
    expect(calls).toContainEqual(['eq', 'project_id', 'p-1']);
    expect(calls).toContainEqual(['eq', 'is_deleted', false]);
  });

  it('⚠️ never filters on mime_type (a photographed permit is a document)', async () => {
    await getDocumentFiles('p-1');
    expect(
      calls.some((c) => c.slice(1).some((a) => typeof a === 'string' && a.includes('mime')))
    ).toBe(false);
  });

  it('CONTROL — plain getFiles() does NOT exclude anything, so the neq above is real', async () => {
    await getFiles({ project_id: 'p-1' });
    expect(calls.some((c) => c[0] === 'neq')).toBe(false);
  });
});

describe('S112 2a — both surfaces read the same function (PARITY)', () => {
  it('desktop Files and /m Files both call getDocumentFiles()', () => {
    expect(read('app/dashboard/projects/[id]/files/page.tsx')).toContain(
      'getDocumentFiles(projectId)'
    );
    expect(read('app/m/p/[projectId]/files/page.tsx')).toContain(
      'getDocumentFiles(params.projectId)'
    );
  });

  it('/m no longer filters in memory after the row limit (code lines, not the comment quoting it)', () => {
    const code = read('app/m/p/[projectId]/files/page.tsx')
      .split('\n')
      .filter((l) => !l.trim().startsWith('//'))
      .join('\n');
    expect(code).not.toMatch(/files\.filter\(\(f\) => f\.category !== 'photos'\)/);
  });
});
