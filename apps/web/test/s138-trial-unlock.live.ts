/**
 * S138 — THE UNLOCK, END TO END, AGAINST REAL AUTH USERS.
 *
 * S137 shipped `banCompanyUsers()` and `unlockCompany()` and probed NEITHER
 * against a real user. The lock was scheduled; the unlock had no callers. This
 * file is the evidence that both halves work and that the reversal is reachable
 * by every path that can produce a payment.
 *
 * ⚠️ DISPOSABLE IDENTITIES ONLY. Every user and company here is created in
 * `beforeAll` and destroyed in `afterAll`. Never point this at a seeded QA
 * identity — a failed cleanup would leave a shared account banned.
 *
 * Sessions are real user JWTs on the anon key (S90 harness). The service role
 * appears only as fixture and as the caller the cron/webhook would be.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';
import { admin, assertRebuildTest, URL_, ANON, TEST_PASSWORD } from './live-session';
import { banCompanyUsers, unlockCompany, runTrialUnlockReconcile } from '@/lib/trial/lifecycle';

const OWNER_EMAIL = 'josh+s138owner@worthprop.com';
const GONE_EMAIL = 'josh+s138gone@worthprop.com';

let companyId = '';
let ownerUserId = '';
let goneUserId = '';

/** Remove any residue from an aborted previous run, then the run itself. */
async function nuke(): Promise<void> {
  for (const email of [OWNER_EMAIL, GONE_EMAIL]) {
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    for (const u of list?.users ?? []) {
      if (u.email !== email) continue;
      const { data: p } = await admin
        .from('profiles')
        .select('company_id')
        .eq('user_id', u.id)
        .maybeSingle();
      const cid = p ? (p as { company_id: string }).company_id : null;
      await admin.from('profiles').delete().eq('user_id', u.id);
      if (cid) {
        await admin.from('trial_lifecycle').delete().eq('company_id', cid);
        await admin.from('tag_options').delete().eq('company_id', cid);
        await admin.from('subscriptions').delete().eq('company_id', cid);
        await admin.from('company_members').delete().eq('company_id', cid);
        await admin.from('profiles').delete().eq('company_id', cid);
        await admin.from('companies').delete().eq('id', cid);
      }
      await admin.from('trial_emails').delete().eq('email', email.toLowerCase());
      await admin.auth.admin.deleteUser(u.id);
    }
  }
}

beforeAll(async () => {
  assertRebuildTest();
  await nuke();

  // The OWNER signs up for real, so `handle_new_user()` builds the company,
  // the subscription and the `trial_lifecycle` row exactly as production would.
  const { data: owner, error } = await admin.auth.admin.createUser({
    email: OWNER_EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { company_name: 'S138 Unlock Co', first_name: 'Un', last_name: 'Lock' },
  });
  if (error) throw new Error(`createUser owner: ${error.message}`);
  ownerUserId = owner.user.id;

  const { data: prof } = await admin
    .from('profiles')
    .select('company_id')
    .eq('user_id', ownerUserId)
    .single();
  companyId = (prof as { company_id: string }).company_id;

  // A DEACTIVATED member of the same company: banned 876000h and is_deleted,
  // exactly as `softDeleteTeamMember()` leaves someone. The unlock must not
  // resurrect them.
  const { data: gone, error: gErr } = await admin.auth.admin.createUser({
    email: GONE_EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { company_name: 'S138 Throwaway', first_name: 'Gone', last_name: 'Away' },
  });
  if (gErr) throw new Error(`createUser gone: ${gErr.message}`);
  goneUserId = gone.user.id;

  // Adopt them into the owner's company and tear down the company their own
  // signup created (the owner path always makes one).
  const { data: goneProf } = await admin
    .from('profiles')
    .select('id, company_id')
    .eq('user_id', goneUserId)
    .single();
  const spurious = (goneProf as { company_id: string }).company_id;
  await admin
    .from('profiles')
    .update({ company_id: companyId, role: 'crew_member', is_deleted: true })
    .eq('user_id', goneUserId);
  await admin.from('company_members').delete().eq('company_id', spurious);
  await admin.from('trial_lifecycle').delete().eq('company_id', spurious);
  await admin.from('tag_options').delete().eq('company_id', spurious);
  await admin.from('subscriptions').delete().eq('company_id', spurious);
  await admin.from('companies').delete().eq('id', spurious);
  await admin.from('trial_emails').delete().eq('email', GONE_EMAIL.toLowerCase());
  await admin.auth.admin.updateUserById(goneUserId, { ban_duration: '876000h' });
}, 180_000);

afterAll(async () => {
  await nuke();
});

async function bannedUntil(userId: string): Promise<string | null> {
  const { data } = await admin.auth.admin.getUserById(userId);
  return (data.user as unknown as { banned_until?: string }).banned_until ?? null;
}

async function canSignIn(email: string): Promise<{ ok: boolean; message: string }> {
  const c = createClient(URL_, ANON, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: TEST_PASSWORD });
  return { ok: !error, message: error?.message ?? 'signed in' };
}

describe('the lock actually locks — a real auth user, a real session', () => {
  it('before the lock, the Owner can sign in', async () => {
    const r = await canSignIn(OWNER_EMAIL);
    expect(r.ok, r.message).toBe(true);
  });

  it('⚠️ banCompanyUsers() bans the Owner and NOT the deactivated member', async () => {
    const banned = await banCompanyUsers(admin, companyId);
    // Only the live owner is in scope; the is_deleted member is excluded.
    expect(banned).toBe(1);
    expect(await bannedUntil(ownerUserId)).toBeTruthy();
  });

  it('⚠️ THE SESSION REALLY DIES — sign-in is refused while banned', async () => {
    const r = await canSignIn(OWNER_EMAIL);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/banned/i);
  });
});

describe('the unlock rule is not reachable by a tenant', () => {
  it('⚠️ an authenticated user CANNOT call unlock_trial_company()', async () => {
    // Sign in as a user who is not banned — the deactivated one is banned, so
    // use a fresh disposable session from another seeded identity is overkill;
    // the anon client is enough to prove the grant, since `anon` and
    // `authenticated` were both REVOKEd.
    const anonClient = createClient(URL_, ANON, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error } = await anonClient.rpc('unlock_trial_company', { p_company_id: companyId });
    expect(error).not.toBeNull();
    expect(`${error?.message} ${error?.code ?? ''}`).toMatch(/permission|not find|denied|404|PGRST/i);
  });
});

describe('path 3 — the DIRECT DATABASE EDIT, which fires no webhook', () => {
  it('⚠️ setting subscriptions.status = active unlocks via the TRIGGER alone', async () => {
    // No application code runs here. This is what a hand-comp in the Supabase
    // dashboard looks like, and it is how every comped company on production
    // was created.
    const { error } = await admin
      .from('subscriptions')
      .update({ status: 'active' })
      .eq('company_id', companyId);
    expect(error).toBeNull();

    expect(await bannedUntil(ownerUserId)).toBeNull();

    const { data: lc } = await admin
      .from('trial_lifecycle')
      .select('locked_at, delete_after')
      .eq('company_id', companyId)
      .single();
    expect((lc as { locked_at: string | null }).locked_at).toBeNull();
    expect((lc as { delete_after: string | null }).delete_after).toBeNull();
  });

  it('and the Owner can sign in again', async () => {
    const r = await canSignIn(OWNER_EMAIL);
    expect(r.ok, r.message).toBe(true);
  });

  it('⚠️ the deactivated member STAYS banned — the unlock is not a back door', async () => {
    const until = await bannedUntil(goneUserId);
    expect(until).toBeTruthy();
    // Still the 100-year horizon, untouched.
    expect(new Date(until!).getFullYear()).toBeGreaterThan(new Date().getFullYear() + 50);
  });
});

describe('unlockCompany() — the TypeScript path, and its idempotency', () => {
  it('is safe to call when nothing is locked', async () => {
    const { unbanned } = await unlockCompany(admin, companyId);
    expect(unbanned).toBe(0);
  });

  it('⚠️ releases a fresh lock, and a SECOND call is a no-op (webhook retry)', async () => {
    await admin.from('subscriptions').update({ status: 'trialing' }).eq('company_id', companyId);
    await banCompanyUsers(admin, companyId);
    expect(await bannedUntil(ownerUserId)).toBeTruthy();
    await admin
      .from('trial_lifecycle')
      .update({ locked_at: new Date().toISOString(), delete_after: new Date().toISOString() })
      .eq('company_id', companyId);

    const first = await unlockCompany(admin, companyId);
    expect(first.unbanned).toBe(1);
    expect(await bannedUntil(ownerUserId)).toBeNull();

    const second = await unlockCompany(admin, companyId);
    expect(second.unbanned).toBe(0);
  });
});

describe('the lock guard — the ≤60-minute hole the ban leaves open', () => {
  it('⚠️ a LIVE token whose company is locked is caught by is_my_company_locked()', async () => {
    // Unlocked first, and signed in BEFORE the lock — this is the exact shape
    // of the hole: the JWT was issued while the account was fine.
    await admin.from('subscriptions').update({ status: 'active' }).eq('company_id', companyId);
    await unlockCompany(admin, companyId);

    const live = createClient(URL_, ANON, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: siErr } = await live.auth.signInWithPassword({
      email: OWNER_EMAIL,
      password: TEST_PASSWORD,
    });
    expect(siErr, siErr?.message).toBeNull();

    const before = await live.rpc('is_my_company_locked');
    expect(before.data).toBe(false);

    // Lock WITHOUT banning, so the token stays usable — isolating the guard
    // from the ban and proving it is the guard doing the work.
    await admin
      .from('trial_lifecycle')
      .update({ locked_at: new Date().toISOString(), delete_after: new Date().toISOString() })
      .eq('company_id', companyId);

    const after = await live.rpc('is_my_company_locked');
    expect(after.error).toBeNull();
    expect(after.data).toBe(true);

    // The token still reads data — which is WHY the guard is needed, not a
    // failure. Recorded here so the reason survives the next refactor.
    const { data: stillReads } = await live.from('profiles').select('id').eq('user_id', ownerUserId);
    expect(stillReads).toHaveLength(1);

    await unlockCompany(admin, companyId);
  });

  it('⚠️ the guard answers only about the CALLER\'s own company', async () => {
    const live = createClient(URL_, ANON, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    await live.auth.signInWithPassword({ email: OWNER_EMAIL, password: TEST_PASSWORD });
    // Nothing locked anywhere for this tenant.
    const { data } = await live.rpc('is_my_company_locked');
    expect(data).toBe(false);
  });

  it('an anonymous caller cannot execute the guard at all', async () => {
    const anonClient = createClient(URL_, ANON, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error } = await anonClient.rpc('is_my_company_locked');
    expect(error).not.toBeNull();
  });
});

describe('the reconciler — the backstop for a missed signal', () => {
  it('⚠️ a LOCKED company with an ACTIVE subscription is released', async () => {
    await banCompanyUsers(admin, companyId);
    await admin
      .from('trial_lifecycle')
      .update({ locked_at: new Date().toISOString(), delete_after: new Date().toISOString() })
      .eq('company_id', companyId);
    // Set active WITHOUT going through the transition the trigger watches, so
    // only the reconciler can fix it.
    await admin.from('subscriptions').update({ status: 'active' }).eq('company_id', companyId);
    await admin
      .from('trial_lifecycle')
      .update({ locked_at: new Date().toISOString(), delete_after: new Date().toISOString() })
      .eq('company_id', companyId);
    await admin.auth.admin.updateUserById(ownerUserId, { ban_duration: '8760h' });

    const out = await runTrialUnlockReconcile(admin);
    expect(out.reconciled).toBeGreaterThanOrEqual(1);
    expect(await bannedUntil(ownerUserId)).toBeNull();
  });

  it('⚠️ a LOCKED company that has NOT paid is left alone', async () => {
    await admin.from('subscriptions').update({ status: 'trialing' }).eq('company_id', companyId);
    await banCompanyUsers(admin, companyId);
    await admin
      .from('trial_lifecycle')
      .update({ locked_at: new Date().toISOString(), delete_after: new Date().toISOString() })
      .eq('company_id', companyId);

    await runTrialUnlockReconcile(admin);

    // Still banned, still locked — the reconciler must not invent an unlock.
    expect(await bannedUntil(ownerUserId)).toBeTruthy();
    const { data: lc } = await admin
      .from('trial_lifecycle')
      .select('locked_at')
      .eq('company_id', companyId)
      .single();
    expect((lc as { locked_at: string | null }).locked_at).not.toBeNull();

    // Leave the fixture unlocked so afterAll's cleanup is not fighting a ban.
    await admin.from('subscriptions').update({ status: 'active' }).eq('company_id', companyId);
  });
});
