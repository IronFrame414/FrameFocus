import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  admin,
  ANON,
  assertRebuildTest,
  deleteCompanies,
  purgeCompaniesNamed,
  URL_,
} from './live-session';

// S109 #162 — change your own password from the Account page, no email.
//
// Drives the REAL server action `changeMyPassword` with a real user session
// standing in for the cookie client (the `s175-team-clients-off` pattern), on a
// THROWAWAY signup — never a persistent test identity, whose password the other
// harnesses depend on.
//
//   W  wrong current password → refused, and the password is UNCHANGED
//   L  too short → refused on the SERVER (not only in the form)
//   M  confirmation mismatch → refused on the server
//   C  correct current → changed: the new password signs in, the old one does not
//   K  the caller's own session SURVIVES the re-verify — `verifyCurrentPassword`
//      revokes its throwaway session with scope 'local'; supabase-js's default
//      is 'global', which would sign the user out everywhere
//
// Every row is its own and is removed in afterAll.

const state = vi.hoisted(() => ({ client: null as unknown as SupabaseClient }));
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => state.client }));

import { changeMyPassword } from '@/lib/auth/change-my-password';

const MARK = 'S109 PwChange';
const EMAIL = `s109-pw-change+${Date.now()}@example.com`;
const P1 = 'S109-first-Passw0rd!';
const P2 = 'S109-second-Passw0rd!';

let userId = '';
let companyId = '';

function fresh(): SupabaseClient {
  return createSupabaseClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function canSignIn(password: string): Promise<boolean> {
  const c = fresh();
  const { error } = await c.auth.signInWithPassword({ email: EMAIL, password });
  if (!error) await c.auth.signOut({ scope: 'local' });
  return !error;
}

beforeAll(async () => {
  assertRebuildTest();
  await purgeCompaniesNamed(admin, [MARK]);
  const { data, error } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: P1,
    email_confirm: true,
    user_metadata: { company_name: `${MARK} Co`, first_name: 'Pw', last_name: 'Change' },
  });
  if (error) throw new Error(`createUser: ${error.message}`);
  userId = data.user.id;
  const { data: prof, error: pErr } = await admin
    .from('profiles')
    .select('company_id')
    .eq('user_id', userId)
    .single();
  if (pErr) throw new Error(`profile: ${pErr.message}`);
  companyId = prof.company_id as string;

  state.client = fresh();
  const { error: sErr } = await state.client.auth.signInWithPassword({ email: EMAIL, password: P1 });
  if (sErr) throw new Error(`caller sign-in: ${sErr.message}`);
});

afterAll(async () => {
  if (companyId) await deleteCompanies(admin, [companyId]);
  if (userId) {
    await admin.from('profiles').delete().eq('user_id', userId);
    await admin.from('trial_emails').delete().eq('email', EMAIL);
    await admin.auth.admin.deleteUser(userId);
  }
});

describe('S109 #162 — changeMyPassword', () => {
  it('fixture: the caller is signed in as the throwaway user', async () => {
    const { data } = await state.client.auth.getUser();
    expect(data.user?.email).toBe(EMAIL);
  });

  it('W — a wrong current password is refused and nothing changes', async () => {
    const r = await changeMyPassword({ currentPassword: 'not-it-at-all', newPassword: P2, confirmPassword: P2 });
    expect(r).toEqual({ ok: false, error: 'Your current password is incorrect.' });
    expect(await canSignIn(P1), 'the old password stopped working after a REFUSED change').toBe(true);
  });

  it('L — too short is refused by the server action', async () => {
    const r = await changeMyPassword({ currentPassword: P1, newPassword: 'short', confirmPassword: 'short' });
    expect(r.ok).toBe(false);
    expect(await canSignIn(P1)).toBe(true);
  });

  it('M — a confirmation mismatch is refused by the server action', async () => {
    const r = await changeMyPassword({ currentPassword: P1, newPassword: P2, confirmPassword: `${P2}x` });
    expect(r).toEqual({ ok: false, error: 'The new passwords do not match.' });
    expect(await canSignIn(P1)).toBe(true);
  });

  it('K — the caller\'s own session survives the re-verify (scope local, not global)', async () => {
    // W, L and M each ran verifyCurrentPassword or stopped before it; W ran it
    // and failed. Run one that SUCCEEDS the check but is refused after it.
    const r = await changeMyPassword({ currentPassword: P1, newPassword: P1, confirmPassword: P1 });
    expect(r.ok).toBe(false); // "different from your current one" — refused BEFORE the verify
    // Force a real, successful verify through the exported helper's only caller path:
    const ok = await changeMyPassword({ currentPassword: P1, newPassword: P2, confirmPassword: P2 });
    expect(ok).toEqual({ ok: true });
    // A global sign-out would have revoked this refresh token.
    const { error } = await state.client.auth.refreshSession();
    expect(error, 'the caller was signed out by the password re-verify').toBeNull();
  });

  it('C — after the change the new password signs in and the old one does not', async () => {
    expect(await canSignIn(P2)).toBe(true);
    expect(await canSignIn(P1)).toBe(false);
  });
});
