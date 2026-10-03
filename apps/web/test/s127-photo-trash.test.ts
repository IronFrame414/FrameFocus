import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// S127 item 4a — the photo trash reader's SHAPE: only soft-deleted rows, the
// Photos view's own row set, bounded, and ordered by the column it is bounded
// on (most recently deleted first, `id` the tiebreak). RLS does not filter
// `is_deleted`, so this filter IS the trash. The e2e
// (`e2e/desktop-photo-trash-s127.spec.ts`) proves list → restore on both surfaces.
// ============================================================================

vi.mock('server-only', () => ({}));

type Call = [string, ...unknown[]];
let calls: Call[] = [];
let rows: unknown[] = [];

vi.mock('@/lib/supabase-server', () => ({
  createClient: async () => {
    const b: Record<string, unknown> = {};
    for (const m of ['from', 'select', 'eq', 'or', 'order']) {
      b[m] = (...args: unknown[]) => {
        calls.push([m, ...args]);
        return b;
      };
    }
    b.limit = (...args: unknown[]) => {
      calls.push(['limit', ...args]);
      return Promise.resolve({ data: rows, error: null });
    };
    return b;
  },
}));
vi.mock('@/lib/services/files', async (orig) => ({
  ...(await orig<typeof import('@/lib/services/files')>()),
  getSignedUrls: async (paths: string[]) => new Map(paths.map((p) => [p, `signed:${p}`])),
}));

beforeEach(() => {
  calls = [];
  rows = [];
});

describe('S127 4a — getPhotoTrash', () => {
  it('asks for soft-deleted Photos-view rows of THIS project, newest deletion first, bounded', async () => {
    const { getPhotoTrash, PHOTO_TRASH_LIMIT } = await import('@/lib/services/photos');
    const { PHOTO_VIEW_FILTER } = await import('@/lib/services/files');
    await getPhotoTrash('proj-1');
    expect(calls).toContainEqual(['from', 'files']);
    expect(calls).toContainEqual(['eq', 'project_id', 'proj-1']);
    expect(calls).toContainEqual(['eq', 'is_deleted', true]);
    expect(calls).toContainEqual(['or', PHOTO_VIEW_FILTER]);
    expect(calls.filter((c) => c[0] === 'order')).toEqual([
      ['order', 'deleted_at', { ascending: false, nullsFirst: false }],
      ['order', 'id', { ascending: false }],
    ]);
    expect(calls.filter((c) => c[0] === 'limit')).toEqual([['limit', PHOTO_TRASH_LIMIT]]);
  });

  it('shows the stored thumbnail, falling back to the original (kept until purge)', async () => {
    const { getPhotoTrash } = await import('@/lib/services/photos');
    rows = [
      {
        id: 'f1',
        file_name: 'a.jpg',
        file_path: 'c/p/a.jpg',
        markup_data: null,
        created_at: 'x',
        deleted_at: 'y',
      },
    ];
    const [p] = await getPhotoTrash('proj-1');
    expect(p.id).toBe('f1');
    expect(p.thumbUrl).toMatch(/^signed:c\/p\/a\.jpg/);
  });
});
