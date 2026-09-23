import { describe, it, expect, vi, beforeEach } from 'vitest';

// S109 #161 / ruling 161.B — `GET /api/estimates/[id]/files/[fileId]/url`, the
// sign-on-click route. It signs with the SERVICE ROLE (estimate files are
// project_id NULL, which the session policies refuse), so — exactly as
// `s107-estimate-files-route-order.test.ts` proves for the list route — THE
// CALL ORDER IS THE ACCESS CONTROL. Every denial asserts the status AND that
// `getSupabaseAdmin` was never reached; the MIRROR proves it is reachable.

const adminSpy = vi.fn();
let sessionUser: { id: string } | null = { id: 'user-1' };
let profileRow: { company_id: string; role: string } | null = { company_id: 'co-1', role: 'project_manager' };
let estimateRow: Record<string, unknown> | null = null;
let fileRow: Record<string, unknown> | null = null;
const fileFilters: [string, unknown][] = [];

function table(row: unknown, record?: [string, unknown][]) {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'order', 'is', 'in']) chain[m] = () => chain;
  chain.eq = (col: string, val: unknown) => {
    record?.push([col, val]);
    return chain;
  };
  chain.single = async () => ({ data: row, error: null });
  chain.maybeSingle = async () => ({ data: row, error: null });
  return chain;
}

vi.mock('@/lib/supabase-server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: sessionUser } }) },
    from: (t: string) => table(t === 'profiles' ? profileRow : t === 'site_visits' ? null : estimateRow),
    rpc: async () => ({ data: null, error: null }),
  }),
}));

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: (...args: unknown[]) => {
    adminSpy(...args);
    return {
      from: () => table(fileRow, fileFilters),
      storage: {
        from: () => ({
          createSignedUrl: async (path: string, ttl: number) => ({
            data: { signedUrl: `https://signed/${path}?ttl=${ttl}` },
            error: null,
          }),
        }),
      },
    };
  },
}));

const { GET } = await import('@/app/api/estimates/[id]/files/[fileId]/url/route');
const ctx = { params: { id: '11111111-1111-1111-1111-111111111111', fileId: '22222222-2222-2222-2222-222222222222' } };

beforeEach(() => {
  adminSpy.mockClear();
  fileFilters.length = 0;
  sessionUser = { id: 'user-1' };
  profileRow = { company_id: 'co-1', role: 'project_manager' };
  estimateRow = null;
  fileRow = null;
});

describe('sign-on-click — the session floor runs BEFORE the service role', () => {
  it('unauthenticated → 401, admin never reached', async () => {
    sessionUser = null;
    const res = await GET(new Request('http://t/'), ctx);
    expect(res.status).toBe(401);
    expect(adminSpy).not.toHaveBeenCalled();
  });

  it('estimate not visible to the caller → 404, admin never reached', async () => {
    estimateRow = null;
    const res = await GET(new Request('http://t/'), ctx);
    expect(res.status).toBe(404);
    expect(adminSpy, 'the service role ran on a DENIED estimate').not.toHaveBeenCalled();
  });

  it('MIRROR: a visible estimate reaches the admin client, and the file is scoped to IT', async () => {
    estimateRow = { id: ctx.params.id, company_id: 'co-1' };
    fileRow = { file_path: 'co-1/estimates/e/plans.pdf', file_name: 'plans.pdf', mime_type: 'application/pdf' };
    const res = await GET(new Request('http://t/'), ctx);
    expect(res.status).toBe(200);
    expect(adminSpy).toHaveBeenCalled();
    const body = (await res.json()) as { url: string; file_name: string; mime_type: string };
    expect(body.url).toContain('co-1/estimates/e/plans.pdf');
    expect(body.url, 'signed for the short 300 s again').toContain('ttl=7200');
    expect(body).toMatchObject({ file_name: 'plans.pdf', mime_type: 'application/pdf' });
    // The lookup names the file, THIS estimate, and the caller's company.
    expect(fileFilters).toEqual(
      expect.arrayContaining([
        ['id', ctx.params.fileId],
        ['estimate_id', ctx.params.id],
        ['company_id', 'co-1'],
        ['is_deleted', false],
      ])
    );
  });

  it('a file that is not on this estimate → 404 (after auth passed), nothing signed', async () => {
    estimateRow = { id: ctx.params.id, company_id: 'co-1' };
    fileRow = null;
    const res = await GET(new Request('http://t/'), ctx);
    expect(res.status).toBe(404);
  });
});
