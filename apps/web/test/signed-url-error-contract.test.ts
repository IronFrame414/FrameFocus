import { describe, it, expect, vi, beforeEach } from 'vitest';

// TECH_DEBT #142 — THE ERROR CONTRACT OF /api/files/signed-url.
//
// ---------------------------------------------------------------------------
// WHAT THIS TESTS, AND WHY IT IS THE SERVICE AND NOT JUST THE ROUTE
// ---------------------------------------------------------------------------
// The defect was NOT that the route returned the wrong status. It was that
// `getSignedUrl` did `if (error) return null`, destroying the only object that
// knew why, one layer below the route. A route test alone would have passed
// against the broken build by mocking a cause the real code could never have
// received. So the first describe pins the SERVICE's promise to carry the
// cause, and the second pins what the route does with it.
//
// The `createSignedUrl` stub returns Storage's real shape: `{ data, error }`
// where the error carries `status` / `statusCode` / `message`.

const createSignedUrl = vi.fn();

vi.mock('@/lib/supabase-server', () => ({
  createClient: async () => ({
    storage: { from: () => ({ createSignedUrl }) },
  }),
}));

// Spied ONCE. `vi.spyOn` inside beforeEach re-wraps the previous spy rather
// than resetting it, so calls accumulate across tests and a "was not called"
// assertion sees the previous test's log.
const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

beforeEach(() => {
  createSignedUrl.mockReset();
  errorSpy.mockClear();
});

/** Storage's answer when RLS hides the object. */
const REFUSED = {
  data: null,
  error: { name: 'StorageApiError', message: 'Object not found', status: 400, statusCode: '404' },
};

/** Storage genuinely failing. */
const OUTAGE = {
  data: null,
  error: { name: 'StorageUnknownError', message: 'fetch failed' },
};

const SIGNED = { data: { signedUrl: 'https://example.test/signed?token=abc' }, error: null };

describe('#142 — signedUrlFor keeps the cause', () => {
  it('⚠️ RETURNS THE ERROR RATHER THAN SWALLOWING IT — this is the actual fix', async () => {
    const { signedUrlFor } = await import('../lib/services/files');
    createSignedUrl.mockResolvedValue(REFUSED);

    const result = await signedUrlFor('co/path.pdf');

    expect(result.url).toBeNull();
    // The old code returned a bare `null` here and the status/statusCode were
    // gone for good. Everything else in #142 depends on this line.
    expect(result.error?.status).toBe(400);
    expect(result.error?.statusCode).toBe('404');
    expect(result.error?.message).toBe('Object not found');
  });

  it('returns the url and a null error on success', async () => {
    const { signedUrlFor } = await import('../lib/services/files');
    createSignedUrl.mockResolvedValue(SIGNED);

    const result = await signedUrlFor('co/path.pdf');
    expect(result.url).toContain('https://example.test/signed');
    expect(result.error).toBeNull();
  });

  it('reports a missing url as its own cause, not as a refusal', async () => {
    const { signedUrlFor } = await import('../lib/services/files');
    createSignedUrl.mockResolvedValue({ data: null, error: null });

    const result = await signedUrlFor('co/path.pdf');
    expect(result.url).toBeNull();
    expect(result.error?.name).toBe('EmptySignedUrl');
    // No status — so the route must NOT call this a permission failure.
    expect(result.error?.status).toBeUndefined();
  });

  it('⚠️ getSignedUrl STILL RETURNS null — the derivative probe depends on it', async () => {
    // photos.ts resolveUrls() probes for a `.markup.jpg` that is legitimately
    // absent most of the time and turns null into `derivativeMissing`. If this
    // ever throws or returns a result object, that normal path breaks.
    const { getSignedUrl } = await import('../lib/services/files');
    createSignedUrl.mockResolvedValue(REFUSED);

    await expect(getSignedUrl('co/photo.markup.jpg')).resolves.toBeNull();
  });
});

describe('#142 — the route reports a refusal as 403 and logs the cause', () => {
  async function get(path = 'co/path.pdf') {
    const { GET } = await import('../app/api/files/signed-url/route');
    const response = await GET(
      new Request(`https://x.test/api/files/signed-url?path=${encodeURIComponent(path)}`)
    );
    return { response, body: (await response.json()) as { url?: string; error?: string } };
  }

  it('⚠️ 403, NOT 500, WHEN STORAGE REFUSES — the whole of #142', async () => {
    createSignedUrl.mockResolvedValue(REFUSED);
    const { response, body } = await get();

    expect(response.status).toBe(403);
    expect(body.error).toBeTruthy();
    // CLAUDE.md: an error never names a cause that has not been verified.
    // Storage conflates "denied" with "absent" on purpose, so the copy must not
    // pick one. It must also not be the old generic sign-failure message.
    expect(body.error).not.toBe('Could not sign URL');
  });

  it('still answers 500 for a genuine failure — the two must stay distinguishable', async () => {
    createSignedUrl.mockResolvedValue(OUTAGE);
    const { response } = await get();
    expect(response.status).toBe(500);
  });

  it('logs the real cause server-side with the route and the failing check', async () => {
    createSignedUrl.mockResolvedValue(REFUSED);
    await get();

    // The response may be generic; the log never is.
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [label, detail] = errorSpy.mock.calls[0] as unknown as [
      string,
      Record<string, unknown>,
    ];

    expect(label).toContain('/api/files/signed-url');
    expect(String(detail.check)).toContain('project_files_select_non_client');
    expect(detail.storageStatus).toBe(400);
    expect(detail.storageCode).toBe('404');
    expect(detail.message).toBe('Object not found');
  });

  it('200 with the url on success, and no log', async () => {
    createSignedUrl.mockResolvedValue(SIGNED);
    const { response, body } = await get();

    expect(response.status).toBe(200);
    expect(body.url).toContain('https://example.test/signed');
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('a missing path is still 400, before any storage call', async () => {
    const { GET } = await import('../app/api/files/signed-url/route');
    const response = await GET(new Request('https://x.test/api/files/signed-url'));

    expect(response.status).toBe(400);
    expect(createSignedUrl).not.toHaveBeenCalled();
  });
});
