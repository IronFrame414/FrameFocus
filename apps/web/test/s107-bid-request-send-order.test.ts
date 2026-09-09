import { describe, it, expect, vi, beforeEach } from 'vitest';
import { publicOrigin, bidReplyUrlFor } from '@/lib/services/sub-bid-request-send';

// S107 Part B — the bid-request SEND route.
//
// Two independent things are guarded here, and the second one is the reason
// Josh made "establish the origin before writing the sender" a precondition:
//
//  1. THE FLOOR ORDER — the session read precedes the service-role client, same
//     as the files route. Asserted the same way: on every denial the admin spy
//     must NEVER have been called. A 403 that arrives after a privileged read
//     has already happened is not a floor.
//  2. THE LINK MUST NOT BE DEAD. `bidReplyUrl()` reads `window.location.origin`
//     and is browser-only; on a server it yields '' and the link becomes
//     `/bid/<token>`. In a page that resolves. ⚠️ In an email it is a dead link,
//     and an email cannot be unsent.

const adminSpy = vi.fn();
const sendSpy = vi.fn();
let sessionUser: { id: string } | null = { id: 'user-1' };
let profileRow: { company_id: string; role: string } | null = { company_id: 'co-1', role: 'project_manager' };
let estimateRow: Record<string, unknown> | null = null;

function table(row: unknown) {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'order', 'is', 'in', 'update']) chain[m] = () => chain;
  chain.single = async () => ({ data: row, error: null });
  chain.maybeSingle = async () => ({ data: row, error: null });
  chain.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(res);
  return chain;
}

vi.mock('@/lib/supabase-server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: sessionUser } }) },
    from: (t: string) => table(t === 'profiles' ? profileRow : estimateRow),
  }),
}));
vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: (...a: unknown[]) => {
    adminSpy(...a);
    return { from: () => table(null), storage: { from: () => ({}) } };
  },
}));
vi.mock('@/lib/services/email-service', () => ({
  sendEmail: (...a: unknown[]) => {
    sendSpy(...a);
    return Promise.resolve({ messageId: 'msg_1', error: null });
  },
  logEmail: async () => 'log-1',
  buildSenderAddress: () => 'Co <co@ezcontractorbinder.com>',
}));

const { POST } = await import('@/app/api/estimates/[id]/bid-requests/[requestId]/send/route');
const ctx = { params: { id: 'est-1', requestId: 'req-1' } };
const req = () => new Request('http://t/', { method: 'POST' });

beforeEach(() => {
  adminSpy.mockClear();
  sendSpy.mockClear();
  sessionUser = { id: 'user-1' };
  profileRow = { company_id: 'co-1', role: 'project_manager' };
  estimateRow = null;
  process.env.NEXT_PUBLIC_APP_URL = 'https://frame-focus-eight.vercel.app';
});

describe('the floor runs before the service-role client, and nothing is sent', () => {
  it('unauthenticated → 401, admin never reached, no mail', async () => {
    sessionUser = null;
    const res = await POST(req(), ctx);
    expect(res.status).toBe(401);
    expect(adminSpy).not.toHaveBeenCalled();
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('RLS denial on the estimate → 404, admin never reached, no mail', async () => {
    estimateRow = null;
    const res = await POST(req(), ctx);
    expect(res.status).toBe(404);
    expect(adminSpy, 'the service-role client was reached on a DENIED estimate').not.toHaveBeenCalled();
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('a PM who did not author the draft → 403, admin never reached, no mail', async () => {
    estimateRow = { id: 'est-1', company_id: 'co-1', status: 'draft', created_by: 'other', name: 'E' };
    const res = await POST(req(), ctx);
    expect(res.status).toBe(403);
    expect(adminSpy).not.toHaveBeenCalled();
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('a non-draft estimate → 403, admin never reached, no mail', async () => {
    estimateRow = { id: 'est-1', company_id: 'co-1', status: 'sent', created_by: 'user-1', name: 'E' };
    const res = await POST(req(), ctx);
    expect(res.status).toBe(403);
    expect(adminSpy).not.toHaveBeenCalled();
    expect(sendSpy).not.toHaveBeenCalled();
  });
});

describe('⚠️ the origin guard — a dead link is refused BEFORE anything is sent', () => {
  it('no NEXT_PUBLIC_APP_URL → 500, and CRUCIALLY nothing was emailed', async () => {
    estimateRow = { id: 'est-1', company_id: 'co-1', status: 'draft', created_by: 'user-1', name: 'E' };
    delete process.env.NEXT_PUBLIC_APP_URL;
    const res = await POST(req(), ctx);
    expect(res.status).toBe(500);
    expect(
      sendSpy,
      'an email was sent with a relative /bid/<token> link — it cannot be unsent'
    ).not.toHaveBeenCalled();
    // The guard is above the admin client too, so nothing privileged ran either.
    expect(adminSpy).not.toHaveBeenCalled();
  });
});

describe('publicOrigin — configured value or nothing, never a guess', () => {
  it('returns the configured origin, trailing slashes stripped', () => {
    expect(publicOrigin({ NEXT_PUBLIC_APP_URL: 'https://a.example//' } as NodeJS.ProcessEnv)).toBe('https://a.example');
  });
  it('returns null when unset or blank — the caller must refuse, not fall back', () => {
    expect(publicOrigin({} as NodeJS.ProcessEnv)).toBeNull();
    expect(publicOrigin({ NEXT_PUBLIC_APP_URL: '   ' } as NodeJS.ProcessEnv)).toBeNull();
  });
  it('⚠️ rejects a non-absolute value — the exact shape that produces a dead link', () => {
    // This is what `window.location.origin` collapses to on a server: ''. And a
    // bare host without a scheme is not a usable href in an email client either.
    expect(publicOrigin({ NEXT_PUBLIC_APP_URL: '' } as NodeJS.ProcessEnv)).toBeNull();
    expect(publicOrigin({ NEXT_PUBLIC_APP_URL: 'frame-focus-eight.vercel.app' } as NodeJS.ProcessEnv)).toBeNull();
  });
  it('builds an absolute reply URL', () => {
    expect(bidReplyUrlFor('https://a.example/', 'tok123')).toBe('https://a.example/bid/tok123');
  });
});
