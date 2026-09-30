import { expect, test, type APIResponse } from '@playwright/test';
import { createClient, type Session } from '@supabase/supabase-js';
import { requireTestEnv } from './env';

// S120 3-A — THE MIDDLEWARE'S LOCAL JWT CHECK (getClaims, H-1b), PROVEN FOUR WAYS.
//
// H-1b (S115/S116, merged 160a57d5) replaced the middleware's getUser() with
// getClaims() everywhere except /sign-in and /sign-up. It shipped with signed-OUT
// negatives only. The four behaviours below were never asserted on their own:
//
//   1. a VALID session still navigates;
//   2. a STALE session (access token past its expiry as the client sees it) is
//      REFRESHED and the refreshed cookie is WRITTEN on the response — the
//      middleware is the only place a refreshed token is persisted
//      (lib/supabase-server.ts swallows cookie writes), so if this breaks every
//      user is logged out an hour after sign-in;
//   3. a TAMPERED token (payload edited, signature kept) is rejected;
//   4. an EXPIRED session whose refresh cannot succeed is rejected.
//
// Each request carries a hand-built @supabase/ssr session cookie and is read
// with maxRedirects: 0, so what is asserted is the MIDDLEWARE's own answer,
// not wherever a redirect chain happened to end.
//
// Run with no storageState (the `chromium` project).

const OWNER = 'josh+test50@worthprop.com';
const PASSWORD = 'FrameFocusTest!2026';
const URL_ = requireTestEnv('NEXT_PUBLIC_SUPABASE_URL');
const ANON = requireTestEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
const REF = new URL(URL_).hostname.split('.')[0];
const KEY = `sb-${REF}-auth-token`;
const CHUNK = 3180; // @supabase/ssr MAX_CHUNK_SIZE (base64url needs no escaping)

async function freshSession(): Promise<Session> {
  const sb = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.auth.signInWithPassword({ email: OWNER, password: PASSWORD });
  if (error || !data.session) throw new Error(`sign-in: ${error?.message}`);
  return data.session;
}

/** The Cookie header @supabase/ssr would read for this session. */
function cookieHeader(session: Record<string, unknown>): string {
  const value = `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`;
  if (value.length <= CHUNK) return `${KEY}=${value}`;
  const parts: string[] = [];
  for (let i = 0; i * CHUNK < value.length; i++) {
    parts.push(`${KEY}.${i}=${value.slice(i * CHUNK, (i + 1) * CHUNK)}`);
  }
  return parts.join('; ');
}

/** The session the RESPONSE wrote back, or null if it wrote none. */
function writtenSession(res: APIResponse): { access_token: string; expires_at: number } | null {
  const pieces = res
    .headersArray()
    .filter((h) => h.name.toLowerCase() === 'set-cookie')
    .map((h) => h.value.split(';')[0])
    .map((kv) => [kv.slice(0, kv.indexOf('=')), kv.slice(kv.indexOf('=') + 1)] as const)
    .filter(([name, value]) => (name === KEY || name.startsWith(`${KEY}.`)) && value.length > 0)
    .sort(([a], [b]) => (a === KEY ? -1 : Number(a.split('.').pop()) - Number(b.split('.').pop())));
  if (pieces.length === 0) return null;
  const joined = decodeURIComponent(pieces.map(([, v]) => v).join(''));
  const json = joined.startsWith('base64-')
    ? Buffer.from(joined.slice('base64-'.length), 'base64url').toString('utf8')
    : joined;
  return JSON.parse(json) as { access_token: string; expires_at: number };
}

function isSignIn(res: APIResponse): boolean {
  return (
    [302, 303, 307, 308].includes(res.status()) && /\/sign-in/.test(res.headers()['location'] ?? '')
  );
}

test.describe('S120 3-A · middleware getClaims — four behaviours', () => {
  test('1. a VALID session navigates: /dashboard answers 200, not /sign-in', async ({
    request,
  }) => {
    const s = await freshSession();
    const res = await request.get('/dashboard', {
      headers: { cookie: cookieHeader(s as unknown as Record<string, unknown>) },
      maxRedirects: 0,
    });
    console.log(`[S120J] valid → ${res.status()} ${res.headers()['location'] ?? ''}`);
    expect(isSignIn(res), 'a valid session was sent to /sign-in').toBe(false);
    expect(res.status()).toBe(200);
  });

  test('2. a STALE session is REFRESHED and the NEW cookie is WRITTEN on the response', async ({
    request,
  }) => {
    const s = await freshSession();
    // expires_at in the past is what the client reads to decide the token is
    // stale; the refresh token is genuine, so the refresh must succeed.
    const stale = { ...s, expires_at: Math.floor(Date.now() / 1000) - 120 };
    const res = await request.get('/dashboard', {
      headers: { cookie: cookieHeader(stale as unknown as Record<string, unknown>) },
      maxRedirects: 0,
    });
    const written = writtenSession(res);
    console.log(
      `[S120J] stale → ${res.status()}; cookie written=${written !== null}; ` +
        `new token=${written ? written.access_token !== s.access_token : 'n/a'}; ` +
        `expires_at in future=${written ? written.expires_at > Date.now() / 1000 : 'n/a'}`
    );
    expect(isSignIn(res), 'a refreshable session was sent to /sign-in').toBe(false);
    expect(
      written,
      'the refreshed session was NOT written back — every user would be logged out'
    ).not.toBeNull();
    expect(written!.access_token).not.toBe(s.access_token);
    expect(written!.expires_at).toBeGreaterThan(Date.now() / 1000);
  });

  test('3. a TAMPERED token (payload edited, signature kept) is rejected', async ({ request }) => {
    const s = await freshSession();
    const [h, p, sig] = s.access_token.split('.');
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >;
    payload.sub = '00000000-0000-4000-8000-00000000a1a1';
    const forged = `${h}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.${sig}`;
    const cookie = cookieHeader({ ...s, access_token: forged } as unknown as Record<
      string,
      unknown
    >);
    const page = await request.get('/dashboard', { headers: { cookie }, maxRedirects: 0 });
    const api = await request.get('/api/chat/threads', { headers: { cookie }, maxRedirects: 0 });
    console.log(
      `[S120J] tampered → /dashboard ${page.status()} ${page.headers()['location'] ?? ''}; /api ${api.status()}`
    );
    expect(isSignIn(page), 'a forged token reached /dashboard').toBe(true);
    expect(api.status()).toBe(401);
  });

  test('4. an EXPIRED session whose refresh cannot succeed is rejected', async ({ request }) => {
    const s = await freshSession();
    const dead = {
      ...s,
      expires_at: Math.floor(Date.now() / 1000) - 120,
      refresh_token: 's120-not-a-refresh-token',
    };
    const res = await request.get('/dashboard', {
      headers: { cookie: cookieHeader(dead as unknown as Record<string, unknown>) },
      maxRedirects: 0,
    });
    console.log(
      `[S120J] expired+dead refresh → ${res.status()} ${res.headers()['location'] ?? ''}`
    );
    expect(isSignIn(res), 'an expired, unrefreshable session reached /dashboard').toBe(true);
  });
});
