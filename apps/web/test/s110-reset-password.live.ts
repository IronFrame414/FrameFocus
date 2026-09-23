import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';
import { admin, ANON, assertRebuildTest, deleteCompanies, purgeCompaniesNamed, URL_ } from './live-session';

// S110 E1 [RULED Josh, Q8 → A] — /reset-password tells a recovery link from a
// live session, on the SERVER. Drives the REAL `/auth/confirm` route handler
// and the REAL `resetPasswordFromPage` server action, with a real session
// standing in for the cookie client and an in-memory cookie jar (the s109
// pattern), on a THROWAWAY signup.
//
//   A  the ADMIN reset's link: generateLink token_hash → GET /auth/confirm →
//      a session, a redirect to /reset-password, and the ff_recovery marker
//   R  that session + that marker sets a password WITHOUT the current one
//   N  a plain PASSWORD session with no marker → refused; unchanged
//   X  the recovery marker COPIED onto a password session → refused; unchanged
//   F  a forged marker (right user and session id, wrong signature) → refused
//   C  a password session WITH the correct current password → changed
//   S  the marker is spent: a second change on the recovery session needs the
//      current password

const state = vi.hoisted(() => ({
  client: null as unknown as SupabaseClient,
  jar: new Map<string, string>(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => state.client }));
vi.mock('next/headers', () => ({
  cookies: () => ({
    get: (n: string) => (state.jar.has(n) ? { name: n, value: state.jar.get(n)! } : undefined),
    delete: (n: string) => state.jar.delete(n),
    set: (n: string, v: string) => state.jar.set(n, v),
  }),
}));

import { resetPasswordFromPage } from '@/lib/auth/reset-password';
import { GET as confirmGET } from '@/app/auth/confirm/route';
import { RECOVERY_MARKER_COOKIE, makeRecoveryMarker, sessionIdOf } from '@/lib/auth/recovery-marker';

const MARK = 'S110 ResetPw';
const EMAIL = `s110-reset-pw+${Date.now()}@example.com`;
const P1 = 'S110-first-Passw0rd!';
const P2 = 'S110-second-Passw0rd!';
const P3 = 'S110-third-Passw0rd!';
let userId = '';
let companyId = '';
let recoveryClient: SupabaseClient;
let recoveryMarker = '';

const fresh = () => createSupabaseClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });

async function canSignIn(password: string): Promise<boolean> {
  const c = fresh();
  const { error } = await c.auth.signInWithPassword({ email: EMAIL, password });
  if (!error) await c.auth.signOut({ scope: 'local' });
  return !error;
}
async function passwordSession(password: string): Promise<SupabaseClient> {
  const c = fresh();
  const { error } = await c.auth.signInWithPassword({ email: EMAIL, password });
  if (error) throw new Error(`sign-in: ${error.message}`);
  return c;
}

beforeAll(async () => {
  assertRebuildTest();
  await purgeCompaniesNamed(admin, [MARK]);
  const { data, error } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: P1,
    email_confirm: true,
    user_metadata: { company_name: `${MARK} Co`, first_name: 'Reset', last_name: 'Probe' },
  });
  if (error) throw new Error(`createUser: ${error.message}`);
  userId = data.user.id;
  const { data: prof, error: pErr } = await admin.from('profiles').select('company_id').eq('user_id', userId).single();
  if (pErr) throw new Error(`profile: ${pErr.message}`);
  companyId = prof.company_id as string;
});

afterAll(async () => {
  if (companyId) await deleteCompanies(admin, [companyId]);
  if (userId) {
    await admin.from('profiles').delete().eq('user_id', userId);
    await admin.from('trial_emails').delete().eq('email', EMAIL);
    await admin.auth.admin.deleteUser(userId);
  }
});

describe('S110 E1 — the admin reset link, through /auth/confirm', () => {
  it('A — generateLink → GET /auth/confirm: session, redirect to /reset-password, marker set', async () => {
    const { data, error } = await admin.auth.admin.generateLink({ type: 'recovery', email: EMAIL });
    expect(error).toBeNull();
    recoveryClient = fresh();
    state.client = recoveryClient;
    state.jar.clear();
    const res = await confirmGET(
      new Request(`http://localhost:3000/auth/confirm?token_hash=${data!.properties.hashed_token}&type=recovery`)
    );
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost:3000/reset-password');
    const { data: s } = await recoveryClient.auth.getSession();
    expect(s.session?.user.id, 'the confirm route did not create a session').toBe(userId);
    const setCookie = res.cookies.get(RECOVERY_MARKER_COOKIE);
    expect(setCookie?.value, 'no recovery marker on the redirect').toBeTruthy();
    expect(setCookie?.httpOnly).toBe(true);
    recoveryMarker = setCookie!.value;
  });

  it('A2 — /auth/confirm refuses a non-recovery type and a missing token', async () => {
    const r1 = await confirmGET(new Request('http://localhost:3000/auth/confirm?token_hash=x&type=magiclink'));
    const r2 = await confirmGET(new Request('http://localhost:3000/auth/confirm?type=recovery'));
    expect(r1.headers.get('location')).toContain('/sign-in?error=auth');
    expect(r2.headers.get('location')).toContain('/sign-in?error=auth');
  });
});

describe('S110 E1 — resetPasswordFromPage: recovery link OR current password', () => {
  it('N — a password session with NO marker and no current password → refused; unchanged', async () => {
    state.client = await passwordSession(P1);
    state.jar.clear();
    const r = await resetPasswordFromPage({ newPassword: P2, confirmPassword: P2 });
    expect(r).toEqual({ ok: false, error: 'Enter your current password.' });
    expect(await canSignIn(P1)).toBe(true);
  });

  it('X — the REAL recovery marker copied onto a password session → refused; unchanged', async () => {
    state.client = await passwordSession(P1);
    state.jar.clear();
    state.jar.set(RECOVERY_MARKER_COOKIE, recoveryMarker);
    const r = await resetPasswordFromPage({ newPassword: P2, confirmPassword: P2 });
    expect(r).toEqual({ ok: false, error: 'Enter your current password.' });
    expect(await canSignIn(P1)).toBe(true);
  });

  it('F — a forged marker for THIS session with a wrong signature → refused; unchanged', async () => {
    const c = await passwordSession(P1);
    state.client = c;
    const { data } = await c.auth.getSession();
    const good = makeRecoveryMarker(userId, sessionIdOf(data.session!.access_token)!);
    state.jar.clear();
    state.jar.set(RECOVERY_MARKER_COOKIE, `${good.split('.')[0]}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`);
    const r = await resetPasswordFromPage({ newPassword: P2, confirmPassword: P2 });
    expect(r.ok).toBe(false);
    expect(await canSignIn(P1)).toBe(true);
  });

  it('R — the recovery session + its own marker sets a password WITHOUT the current one', async () => {
    state.client = recoveryClient;
    state.jar.clear();
    state.jar.set(RECOVERY_MARKER_COOKIE, recoveryMarker);
    const r = await resetPasswordFromPage({ newPassword: P2, confirmPassword: P2 });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(await canSignIn(P2)).toBe(true);
    expect(await canSignIn(P1)).toBe(false);
  });

  it('S — the marker was spent: the same recovery session now needs the current password', async () => {
    expect(state.jar.has(RECOVERY_MARKER_COOKIE), 'the marker survived its use').toBe(false);
    const r = await resetPasswordFromPage({ newPassword: P3, confirmPassword: P3 });
    expect(r).toEqual({ ok: false, error: 'Enter your current password.' });
    expect(await canSignIn(P2)).toBe(true);
  });

  it('C — a password session WITH the correct current password → changed', async () => {
    state.client = await passwordSession(P2);
    state.jar.clear();
    const wrong = await resetPasswordFromPage({ newPassword: P3, confirmPassword: P3, currentPassword: 'nope-nope-nope' });
    expect(wrong).toEqual({ ok: false, error: 'Your current password is incorrect.' });
    const r = await resetPasswordFromPage({ newPassword: P3, confirmPassword: P3, currentPassword: P2 });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(await canSignIn(P3)).toBe(true);
  });
});
